/* Route store: current hash route, per-route memory (filters/page/month/
   selection/scroll), drafts, the unsaved-edit guard, and the pending
   notification/deep-link destination. Plain ES module, no framework. Nothing
   here touches Firebase or app.js; app.js and the shell read and write this
   through the functions below so a layout switch or appearance change never
   loses the member's place. */

/* '#manage/exceptions' is deliberately not a known route (2026-09-17):
   the screen it named is hidden pending a defined exception data model, see
   docs/runs/compact-phone-refactor/lanes/S6.md. An unknown route resolves
   to #unavailable, below, so this alone removes every way to reach it. */
const ROUTES = [
  '#duties', '#schedule', '#service/', '#edit/', '#availability', '#reminders',
  '#manage/schedule', '#manage/attention', '#manage/members', '#manage/add-member',
  '#manage/add-member/', '#manage/profile/', '#manage/invite',
  '#manage/settings',
  '#songs/my-service', '#songs/library', '#songs/song-detail', '#songs/history',
  '#songs/history-detail', '#appearance', '#unavailable',
  /* '#invite/<token>': the department invitation link a leader shares. It is
     open to any signed-in member, not just leaders, and it is the one route
     that regularly arrives before sign-in, so it must be a known route for
     setPendingDestination to keep it across the sign-in screen. */
  '#invite/'
];

const memories = Object.create(null);
const drafts = Object.create(null);
const listeners = new Set();
let dirtyCount = 0;
let pendingDestination = null;
// '' means "no explicit route yet" (a fresh load with no hash at all); the
// shell resolves that to the account's role start route, never to a
// hardcoded screen. It is never treated as a known route on its own.
let currentRoute = normalize(location.hash);
let suppressHashHandler = false;

function normalize(hash) {
  const value = (hash || '').replace(/^#?/, '#');
  return value.length > 1 ? value : '';
}

/* Is `route` one of the named routes from the ruling (section 4), including
   the parameterized ones (#service/{id}, #edit/{id}, #manage/profile/{id},
   #manage/add-member/{id})? A prefix entry requires a non-empty segment
   after it, so `#service/` alone is not a valid route. Anything else,
   including a route this file has never heard of, is not known: the shell
   sends it to #unavailable instead of guessing which legacy screen it might
   have meant. */
export function isKnownRoute(route) {
  const r = normalize(route);
  if (!r) return false;
  return ROUTES.some(p => p.endsWith('/') ? (r.indexOf(p) === 0 && r.length > p.length) : r === p);
}

function routeKey(route) {
  const r = normalize(route) || '#schedule';
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

/* Conservative shape check for a route coming from outside this module (a
   push-notification payload, a deep link): a leading '#' is optional, then
   one lowercase-and-hyphen segment, then up to two path segments of URL-safe
   characters. Matches the pattern sw.js uses to validate notificationclick's
   data.route before it ever reaches a URL. */
const SAFE_ROUTE_SHAPE = /^#?[a-z-]+(\/[A-Za-z0-9%._~-]+){0,2}$/;

/* A route captured from a notification tap or a deep link before sign-in,
   consumed exactly once after the host reaches phase `ready`. Anything that
   does not match the safe shape, or that is not one of the routes this file
   knows about, is dropped rather than stored. */
export function setPendingDestination(next) {
  if (typeof next === 'string' && SAFE_ROUTE_SHAPE.test(next) && isKnownRoute(next)) {
    pendingDestination = normalize(next);
  } else {
    pendingDestination = null;
  }
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
