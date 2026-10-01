/* TEST ONLY. An in-memory stand-in for the Firestore SDK, used by the dev
   server's --fake mode and the browser tests. Data starts from
   window.__fixture.docs; window.__fake exposes it to tests.
   Paths in window.__fixture.denied answer listeners with permission-denied,
   the way the live rules refuse them. */
const fixture = window.__fixture || { docs: {} };
const store = new Map(Object.entries(fixture.docs || {}).map(([path, value]) => [path, structuredClone(value)]));
const listeners = new Set();
const clone = value => value === undefined ? undefined : structuredClone(value);
const DELETE = { __op: 'delete' };

function isIncrement(value) { return value && value.__op === 'increment'; }

function applyField(target, key, value) {
  if (value === DELETE || (value && value.__op === 'delete')) delete target[key];
  else if (isIncrement(value)) target[key] = (Number(target[key]) || 0) + value.by;
  else if (value && value.__op === 'union') target[key] = Array.from(new Set((target[key] || []).concat(value.items)));
  else if (value && value.__op === 'remove') target[key] = (target[key] || []).filter(item => !value.items.includes(item));
  else target[key] = clone(value);
}

function merge(target, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && !value.__op && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      merge(target[key], value);
    } else applyField(target, key, value);
  });
  return target;
}

function matchesFilters(data, filters) {
  return (filters || []).every(filter => {
    if (filter.type !== 'where') return true;
    const value = data[filter.field];
    if (filter.op === '==') return value === filter.value;
    if (filter.op === '>=') return value >= filter.value;
    if (filter.op === '<') return value < filter.value;
    if (filter.op === 'in') return filter.value.includes(value);
    return true;
  });
}

function snapshotOf(ref) {
  if (ref.type === 'collection') {
    const depth = ref.path.split('/').length + 1;
    let docs = [...store].filter(([path, data]) => path.startsWith(ref.path + '/') && path.split('/').length === depth && matchesFilters(data, ref.filters))
      .map(([path, data]) => ({ id: path.split('/').pop(), ref: { type: 'doc', path }, data: () => clone(data), exists: () => true }));
    const order = (ref.filters || []).find(filter => filter.type === 'orderBy');
    if (order) docs.sort((a, b) => (a.data()[order.field] > b.data()[order.field] ? 1 : -1) * (order.direction === 'desc' ? -1 : 1));
    const limit = (ref.filters || []).find(filter => filter.type === 'limit');
    if (limit) docs = docs.slice(0, limit.count);
    return { empty: !docs.length, size: docs.length, docs, forEach: fn => docs.forEach(fn), docChanges: () => docs.map(doc => ({ type: 'added', doc })) };
  }
  const value = store.get(ref.path);
  return { id: ref.path.split('/').pop(), exists: () => value !== undefined, data: () => clone(value) };
}

function notify(path) {
  listeners.forEach(listener => {
    const ref = listener.ref;
    if (ref.path === path || (ref.type === 'collection' && path.startsWith(ref.path + '/') && path.split('/').length === ref.path.split('/').length + 1)) {
      listener.callback(snapshotOf(ref));
    }
  });
}

function write(path, value, record = 'set') {
  window.__fake.writes.push({ path, op: record, value: clone(value) });
  if (value === undefined) store.delete(path); else store.set(path, value);
  notify(path);
}

window.__fake = {
  writes: [],
  get: path => clone(store.get(path)),
  set: (path, value) => write(path, clone(value), 'test'),
  remove: path => write(path, undefined, 'test'),
  paths: prefix => [...store.keys()].filter(path => path.startsWith(prefix))
};

export const getFirestore = () => ({ fake: true });
export const doc = (_db, ...parts) => ({ type: 'doc', path: parts.join('/') });
export const collection = (_db, ...parts) => ({ type: 'collection', path: parts.join('/'), filters: [] });
export const query = (ref, ...filters) => Object.assign({}, ref, { filters: (ref.filters || []).concat(filters) });
export const where = (field, op, value) => ({ type: 'where', field, op, value });
export const orderBy = (field, direction = 'asc') => ({ type: 'orderBy', field, direction });
export const limit = count => ({ type: 'limit', count });
export const increment = by => ({ __op: 'increment', by });
export const arrayUnion = (...items) => ({ __op: 'union', items });
export const arrayRemove = (...items) => ({ __op: 'remove', items });
export const deleteField = () => DELETE;

/* A listener hears what changed since its last snapshot, as the real SDK
   tells it through docChanges(). */
function changesFor(listener, snapshot) {
  if (!snapshot.docs) return snapshot;
  const before = listener.seen || new Map();
  const now = new Map(snapshot.docs.map(doc => [doc.ref.path, JSON.stringify(doc.data())]));
  const changes = [];
  snapshot.docs.forEach(doc => {
    if (!before.has(doc.ref.path)) changes.push({ type: 'added', doc });
    else if (before.get(doc.ref.path) !== now.get(doc.ref.path)) changes.push({ type: 'modified', doc });
  });
  before.forEach((_value, path) => {
    if (!now.has(path)) changes.push({ type: 'removed', doc: { id: path.split('/').pop(), ref: { type: 'doc', path }, data: () => undefined, exists: () => false } });
  });
  listener.seen = now;
  return Object.assign({}, snapshot, { docChanges: () => changes });
}

export function onSnapshot(ref, callback, error) {
  const listener = { ref, callback: snapshot => callback(changesFor(listener, snapshot)) };
  if ((fixture.denied || []).includes(ref.path)) {
    setTimeout(() => error && error(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })), 20);
    return () => {};
  }
  listeners.add(listener);
  setTimeout(() => { if (listeners.has(listener)) listener.callback(snapshotOf(ref)); }, (fixture.delays || {})[ref.path] ?? 10);
  return () => listeners.delete(listener);
}

export const getDoc = async ref => snapshotOf(ref);
export const getDocs = async ref => snapshotOf(ref);
export async function setDoc(ref, value, options) {
  const next = options && options.merge ? merge(clone(store.get(ref.path) || {}), value) : merge({}, value);
  write(ref.path, next, 'set');
}
export async function updateDoc(ref, value) {
  if (!store.has(ref.path)) throw Object.assign(new Error('No document to update.'), { code: 'not-found' });
  const next = clone(store.get(ref.path));
  Object.entries(value).forEach(([key, field]) => applyField(next, key, field));
  write(ref.path, next, 'update');
}
export async function deleteDoc(ref) { write(ref.path, undefined, 'delete'); }
export function writeBatch() {
  const jobs = [];
  return {
    set: (...args) => jobs.push(() => setDoc(...args)),
    update: (...args) => jobs.push(() => updateDoc(...args)),
    delete: (...args) => jobs.push(() => deleteDoc(...args)),
    commit: async () => { for (const job of jobs) await job(); }
  };
}
export async function runTransaction(_db, run) {
  const jobs = [];
  const result = await run({
    get: async ref => snapshotOf(ref),
    set: (ref, value, options) => jobs.push(() => setDoc(ref, value, options)),
    update: (ref, value) => jobs.push(() => updateDoc(ref, value)),
    delete: ref => jobs.push(() => deleteDoc(ref))
  });
  for (const job of jobs) await job();
  return result;
}
