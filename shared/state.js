/* Route store: current hash route, per-route memory (filters/page/month/
   selection/scroll), drafts, the unsaved-edit guard, and the pending
   notification/deep-link destination. Plain ES module, no framework. Nothing
   here touches Firebase or app.js; app.js and the shell read and write this
   through the functions below so a layout switch or appearance change never
   loses the member's place. */

const ROUTES = [
  '#duties', '#schedule', '#service/', '#edit/', '#availability', '#reminders',
  '#manage/schedule', '#manage/attention', '#manage/members', '#manage/add-member',
  '#manage/profile/', '#manage/invite', '#manage/exceptions', '#manage/settings',
  '#songs/my-service', '#songs/library', '#songs/song-detail', '#songs/history',
  '#songs/history-detail', '#appearance', '#unavailable'
];

const memories = Object.create(null);
const drafts = Object.create(null);
const listeners = new Set();
let dirtyCount = 0;
let pendingDestination = null;
let currentRoute = normalize(location.hash);
let suppressHashHandler = false;

function normalize(hash) {
  const value = (hash || '').replace(/^#?/, '#');
  return value.length > 1 ? value : '#schedule';
}

function routeKey(route) {
  const r = normalize(route);
  const known = ROUTES.find(p => p.endsWith('/') ? r.indexOf(p) === 0 : r === p);
  return known || r;
}

function notify() {
  listeners.forEach(cb => { try { cb(currentRoute); } catch (e) { /* one bad subscriber must not break the rest */ } });
}

export function route() {
  return currentRoute;
}

export function onRouteChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function go(next, options) {
  const opts = options || {};
  const target = normalize(next);
  if (opts.replace) {
    suppressHashHandler = true;
    history.replaceState(null, '', target);
    suppressHashHandler = false;
    currentRoute = target;
    notify();
  } else {
    location.hash = target;
    // hashchange listener below picks it up and calls notify().
  }
}

export function back() {
  history.back();
}

window.addEventListener('hashchange', () => {
  if (suppressHashHandler) return;
  currentRoute = normalize(location.hash);
  notify();
});

/* Mutable memory bag per route family: { query, filters, page, month,
   selected, scrollY }. Schedule uses `month`, not `page` (approved Weekbook
   exception to ten-result pagination). */
export function memory(key) {
  const k = routeKey(key);
  if (!memories[k]) memories[k] = { query: '', filters: {}, page: 1, month: '', selected: null, scrollY: 0 };
  return memories[k];
}

export function setMemory(key, patch) {
  Object.assign(memory(key), patch);
}

export function draft(key) {
  return Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : null;
}

export function setDraft(key, value) {
  const had = Object.prototype.hasOwnProperty.call(drafts, key);
  drafts[key] = value;
  if (!had) dirtyCount += 1;
}

export function clearDraft(key) {
  if (Object.prototype.hasOwnProperty.call(drafts, key)) {
    delete drafts[key];
    dirtyCount = Math.max(0, dirtyCount - 1);
  }
}

export function isDirty() {
  return dirtyCount > 0;
}

window.addEventListener('beforeunload', event => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});

/* A route captured from a notification tap or a deep link before sign-in,
   consumed exactly once after the host reaches phase `ready`. */
export function setPendingDestination(next) {
  pendingDestination = next ? normalize(next) : null;
}

export function consumePendingDestination() {
  const value = pendingDestination;
  pendingDestination = null;
  return value;
}

export function startRouteFor(account) {
  if (!account) return '#schedule';
  if (account.isAdmin) return '#manage/attention';
  if (account.canManage) return '#manage/schedule';
  if (account.isPresider) return '#songs/my-service';
  return '#duties';
}
