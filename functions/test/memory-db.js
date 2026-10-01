'use strict';

/* TEST ONLY. Just enough Firestore for the handler tests: documents by path,
   queries (where, orderBy, limit, select), transactions, batches and bulk
   writers, create() that fails on an existing document, and merge writes
   that merge nested maps and honour FieldValue.delete(), as Firestore does.
   `store` holds the documents: a Map, or with { live: true } the plain
   object passed in, changed in place. */
const { FieldValue } = require('firebase-admin/firestore');

const DELETE = FieldValue.delete();
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isDelete = value => !!value && typeof value.isEqual === 'function' && value.isEqual(DELETE);
const isMap = value => !!value && typeof value === 'object' && !Array.isArray(value) && !isDelete(value);

/* Firestore's merge: maps merge key by key, a delete sentinel removes its key,
   anything else replaces. */
function merge(target, patch) {
  const out = Object.assign({}, target);
  Object.entries(patch).forEach(([key, value]) => {
    if (isDelete(value)) delete out[key];
    else if (isMap(value)) out[key] = merge(isMap(out[key]) ? out[key] : {}, value);
    else out[key] = clone(value);
  });
  return out;
}

/* Values written without merge, with any delete sentinel dropped. */
function plain(value) {
  if (!isMap(value)) return clone(value);
  const out = {};
  Object.entries(value).forEach(([key, field]) => { if (!isDelete(field)) out[key] = plain(field); });
  return out;
}

/* update(): top-level keys replace (a delete sentinel removes), as Firestore
   does without field paths. */
function updated(target, patch) {
  const out = Object.assign({}, target);
  Object.entries(patch).forEach(([key, value]) => {
    if (isDelete(value)) delete out[key];
    else out[key] = plain(value);
  });
  return out;
}

function objectStore(docs) {
  return {
    get: path => docs[path],
    set: (path, value) => { docs[path] = value; },
    has: path => Object.prototype.hasOwnProperty.call(docs, path),
    delete: path => { delete docs[path]; },
    keys: () => Object.keys(docs)
  };
}

const failure = (code, message) => Object.assign(new Error(code + ' ' + message), { code });

const COMPARE = {
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '>=': (a, b) => a !== undefined && a >= b,
  '>': (a, b) => a !== undefined && a > b,
  '<=': (a, b) => a !== undefined && a <= b,
  '<': (a, b) => a !== undefined && a < b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  'array-contains': (a, b) => Array.isArray(a) && a.includes(b)
};

function memoryDb(docs = {}, { live = false } = {}) {
  const store = live ? objectStore(docs) : new Map(Object.entries(clone(docs)));
  let autoId = 0;
  const snapshot = path => {
    const data = store.get(path);
    return {
      id: path.split('/').pop(),
      exists: store.has(path),
      ref: ref(path),
      data: () => clone(data),
      get: field => (clone(data) || {})[field]
    };
  };
  const apply = ([path, value, options]) => {
    if (value === undefined) store.delete(path);
    else if (options && options.merge) store.set(path, merge(store.get(path) || {}, value));
    else if (options && options.update) store.set(path, updated(store.get(path) || {}, value));
    else store.set(path, plain(value));
  };
  const check = ([path, , options]) => {
    if (options && options.create && store.has(path)) throw failure(6, 'ALREADY_EXISTS: Document already exists: ' + path);
    if (options && options.update && !store.has(path)) throw failure(5, 'NOT_FOUND: No document to update: ' + path);
  };
  const write = item => { check(item); apply(item); };
  function ref(path) {
    return {
      path,
      id: path.split('/').pop(),
      collection: name => collection(path + '/' + name),
      get: async () => snapshot(path),
      set: async (value, options) => write([path, value, options]),
      update: async value => write([path, value, { update: true }]),
      create: async value => write([path, value, { create: true }]),
      delete: async () => write([path, undefined])
    };
  }
  function query(prefix, filters = [], order = null, max = Infinity) {
    const self = {
      where: (field, op, value) => {
        if (!COMPARE[op]) throw new Error('memoryDb does not support ' + op);
        return query(prefix, filters.concat(data => COMPARE[op]((data || {})[field], value)), order, max);
      },
      orderBy: (field, direction = 'asc') => query(prefix, filters, { field, direction }, max),
      limit: count => query(prefix, filters, order, count),
      select: () => self,
      get: async () => {
        let paths = [...store.keys()].filter(path => path.startsWith(prefix + '/') && !path.slice(prefix.length + 1).includes('/'))
          .filter(path => filters.every(test => test(store.get(path))));
        if (order) {
          const sign = order.direction === 'desc' ? -1 : 1;
          paths = paths.slice().sort((a, b) => {
            const left = (store.get(a) || {})[order.field], right = (store.get(b) || {})[order.field];
            return left === right ? 0 : (left > right ? sign : -sign);
          });
        }
        const found = paths.slice(0, max).map(snapshot);
        return { docs: found, empty: !found.length, size: found.length, forEach: fn => found.forEach(fn) };
      }
    };
    return self;
  }
  function collection(prefix) {
    return Object.assign(query(prefix), {
      doc: id => ref(prefix + '/' + (id == null ? 'auto-' + (++autoId) : id)),
      add: async value => {
        const reference = ref(prefix + '/auto-' + (++autoId));
        write([reference.path, value]);
        return reference;
      }
    });
  }
  /* Writes collected and applied together, as a batch or transaction does. */
  function writeSet() {
    const writes = [];
    return {
      writes,
      set: (item, value, options) => { writes.push([item.path, value, options]); },
      update: (item, value) => { writes.push([item.path, value, { update: true }]); },
      create: (item, value) => { writes.push([item.path, value, { create: true }]); },
      delete: item => { writes.push([item.path, undefined]); },
      commit: () => { writes.forEach(check); writes.forEach(apply); }
    };
  }
  // Transactions run one after another, as Firestore's locking makes them
  // appear to: two that read the same document never both commit stale.
  let queue = Promise.resolve();
  return {
    store,
    collection,
    doc: path => ref(path),
    runTransaction(work) {
      const run = queue.then(async () => {
        const pending = writeSet();
        const result = await work({
          getAll: (...refs) => Promise.all(refs.map(item => item.get())),
          get: item => item.get(),
          set: (item, value, options) => { pending.set(item, value, options); },
          update: (item, value) => { pending.update(item, value); },
          create: (item, value) => { pending.create(item, value); },
          delete: item => { pending.delete(item); }
        });
        pending.commit();
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
    batch() {
      const pending = writeSet();
      return Object.assign({}, pending, { commit: async () => pending.commit() });
    },
    bulkWriter() {
      const writes = [];
      const queue = (item, value, options) => new Promise((resolve, reject) => writes.push({ item: [item.path, value, options], resolve, reject }));
      return {
        set: (item, value, options) => queue(item, value, options),
        update: (item, value) => queue(item, value, { update: true }),
        create: (item, value) => queue(item, value, { create: true }),
        delete: item => queue(item, undefined),
        onWriteError: () => false,
        close: async () => {
          for (const entry of writes) {
            try { write(entry.item); entry.resolve(); } catch (error) { entry.reject(error); }
          }
        }
      };
    }
  };
}

module.exports = { memoryDb, DELETE };
