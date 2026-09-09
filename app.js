'use strict';

/* ================= foundation contracts ================= */

const APP_FOUNDATION = window.WorshipApp || {};
const SCREEN_REGISTRY = APP_FOUNDATION.screens || (APP_FOUNDATION.screens = {});
const SCREEN_UI = APP_FOUNDATION.ui || (APP_FOUNDATION.ui = {});
const CORE = APP_FOUNDATION.core;
const DOMAIN = APP_FOUNDATION.domain && APP_FOUNDATION.domain.schedule;
const MEMBER_DOMAIN = APP_FOUNDATION.domain && APP_FOUNDATION.domain.member;
const COORDINATOR_DOMAIN = APP_FOUNDATION.domain && APP_FOUNDATION.domain.coordinator;
const SHEET_DOMAIN = APP_FOUNDATION.domain && APP_FOUNDATION.domain.sheet;
const STORAGE_SERVICE = APP_FOUNDATION.services && APP_FOUNDATION.services.storage;
const FIREBASE_SERVICE = APP_FOUNDATION.services && APP_FOUNDATION.services.firebase;
const STATE_SERVICE = (APP_FOUNDATION.services && APP_FOUNDATION.services.state) || APP_FOUNDATION.state;
const SUBSCRIPTIONS_SERVICE = APP_FOUNDATION.services && APP_FOUNDATION.services.subscriptions;
if (!CORE || !DOMAIN || !MEMBER_DOMAIN || !COORDINATOR_DOMAIN || !SHEET_DOMAIN ||
    !STORAGE_SERVICE || !FIREBASE_SERVICE || !SUBSCRIPTIONS_SERVICE ||
    typeof SUBSCRIPTIONS_SERVICE.createManager !== 'function' ||
    typeof MEMBER_DOMAIN.groupDuties !== 'function' ||
    typeof MEMBER_DOMAIN.findPendingRequest !== 'function' ||
    typeof MEMBER_DOMAIN.requestsForMember !== 'function' ||
    typeof MEMBER_DOMAIN.pendingRequestCount !== 'function' ||
    typeof MEMBER_DOMAIN.setlistSummary !== 'function' ||
    typeof COORDINATOR_DOMAIN.upcomingServices !== 'function' ||
    typeof COORDINATOR_DOMAIN.eligibleDutyRoster !== 'function' ||
    typeof COORDINATOR_DOMAIN.conflictsWithSuggestions !== 'function' ||
    typeof COORDINATOR_DOMAIN.gapRows !== 'function' ||
    typeof COORDINATOR_DOMAIN.workloadRows !== 'function' ||
    typeof COORDINATOR_DOMAIN.splitRequests !== 'function') {
  throw new Error('WorshipApp foundation modules did not load');
}

const {
  CATEGORIES, SERVICE_LABELS, WORSHIP_TYPES, DATA_KEY, FEATURES
} = CORE;
const ALL_DUTIES_ORDER = DOMAIN.allDutiesOrder(CATEGORIES);

/* Seed data for state.departments (categoryName -> member names), used only
   the first time app/departments is missing/empty in Firestore (or local mode). */
const DEPARTMENTS_SEED = {
  'Worship': ['B. Anthony', 'B. Brent', 'B. Davidson', 'B. Giomar', 'B. James', 'B. Jason', 'B. Jordan', 'D. Aaron', 'D. Caleb', 'D. Chloe', 'D. Chris', 'D. Danielle', 'D. Kenya', 'D. Roza', 'E. Simon', 'M. Chad', 'S. Adrienne', 'S. Martha', 'S. Paola', 'S. Skye'],
  'Usher Sisters': ['D. Chloe', 'D. Danielle', 'D. Kenya', 'D. Roza', 'S. Adrienne', 'S. Estefany', 'S. Hana', 'S. Lisa', 'S. Melissa', 'S. Paola', 'S. Skye', 'S. Taylor'],
  'Usher Brothers': ['B. Alex', 'B. Anthony', 'B. Clyde', 'B. Davidson', 'B. Delvin', 'B. Drew', 'B. Dustin', 'B. Giomar', 'B. Irvin', 'B. James S', 'B. Jordan', 'D. Chris'],
  'Lobby': ['S. Adrienne', 'S. Anessa', 'S. Bridgette', 'S. Ivonne', 'S. Leslie', 'S. Lupita', 'S. Mercie', 'S. Nichol', 'S. Paola'],
  'Translation': ['B. Irvin', 'B. Jason', 'D. Roza', 'S. Elena', 'S. Elisa', 'S. Leslie', 'S. Martha', 'S. Monica C', 'S. Monica S', 'S. Paola'],
  'Media': [],
  'Parking Lot': [],
  'Offering': []
};
/* Release stamp appended to every lazily-loaded local file. scripts/deploy.sh
   rewrites the 'DEV' token here, in index.html and in sw.js at release time, so
   long-lived browser caching can never serve a member a stale mix of files. */
const ASSET_V = '?v=DEV';

/* The shell owns navigation and lifecycle.  Screen modules are optional
   buildless IIFEs, so a staged or unavailable module simply leaves its legacy
   renderer in place until integration supplies it. */
const SCREEN_BY_TAB = Object.freeze({ schedule: 'member', my: 'member', songs: 'presider', manage: 'coordinator' });
const screenInstances = Object.create(null);
let activeScreenName = '';
const screenModuleFailures = Object.create(null);
// Fallback site-passcode hash, used only on a brand-new device before app/
// settings.sitePinHash is set. The live code is managed in Manage → Features
// and its plaintext is intentionally not recorded here (see docs).
const DEFAULT_SITE_HASH = '1dffd68e5364ca2371d1627e59141f261264a7539f81c1746000b7320b5ad65b';
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSi0PRu7yJ9wbRn612zWq7rpInps6vWBcU7O9uHCp9W18sOCCF2U2ALS5EOo8hWrTSYXAfGmqiKYkaF/pub?gid=453135143&single=true&output=csv';

/* Name cleanup after the sheet's Raw Data tab was tidied up — maps old
   variant spellings to their canonical form. See 'unify-names'. This constant
   is the seed/fallback for the shared Firestore doc app/nameMap, which both
   this app and the song app read so canonicalization stays consistent. */
const NAME_UNIFY_MAP = {
  'B. Anthony L': 'B. Anthony', 'D. Chris K': 'D. Chris', 'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James', 'B. Jason S': 'B. Jason', 'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S', 'M.Chad': 'M. Chad', 'B. Gio': 'B. Giomar'
};

/* Live copy of app/nameMap; null until the snapshot arrives (or in local mode). */
let sharedNameMap = null;
function flattenMappedName(name, map) {
  const original = String(name || '');
  let current = original;
  const seen = new Set();
  while (current && map && typeof map[current] === 'string' && map[current]) {
    if (seen.has(current)) return original;
    seen.add(current);
    if (map[current] === current) return current;
    current = map[current];
  }
  return current || original;
}
function unifiedNameMap() {
  const merged = Object.assign({}, NAME_UNIFY_MAP, sharedNameMap || {});
  Object.keys(merged).forEach(name => { merged[name] = flattenMappedName(name, merged); });
  return merged;
}

function feat(id) {
  const f = (state.settings && state.settings.features) || {};
  if (id in f) return !!f[id];
  const d = FEATURES.find(x => x.id === id);
  return d ? d.def : true;
}

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}

function siteHash() { return (state.settings && state.settings.sitePinHash) || DEFAULT_SITE_HASH; }
function siteUnlocked() { return localStorage.getItem('wds-site-unlock') === siteHash(); }

function sheetUrl() { return (state.settings && state.settings.sheetUrl) || DEFAULT_SHEET_URL; }

/* ================= helpers ================= */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayISO() { return toISO(new Date()); }
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); }
function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  const [hs, m] = t.split(':');
  let h = parseInt(hs, 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}
function dateBadge(iso) {
  const t = new Date();
  if (iso === toISO(t)) return 'Today';
  t.setDate(t.getDate() + 1);
  if (iso === toISO(t)) return 'Tomorrow';
  return '';
}
function svcId(svc) { return DOMAIN.serviceId(svc); }
function slugify(s) { return DOMAIN.slugify(s); }
function requestId(svcIdVal, duty, createdAt) { return DOMAIN.requestId(svcIdVal, duty, createdAt); }
function svcDateTime(svc) {
  return new Date(svc.date + 'T' + (svc.time || '12:00') + ':00');
}
function dutyCategory(duty) { return DOMAIN.dutyCategory(duty, CATEGORIES); }

/* ================= double-duty conflicts ================= */

function sortDuties(duties) { return DOMAIN.sortDuties(duties, CATEGORIES); }
function sameDuties(a, b) { return DOMAIN.sameDuties(a, b); }
/* Every member appearing in 2+ duties of this service, with their duty list (stable order).
   A single prayer + usher pairing is intentionally omitted from the conflicts. */
function conflictsFor(svc) { return DOMAIN.conflictsFor(svc, CATEGORIES); }
/* conflictsFor minus ones already acknowledged (conflictOk) with a matching duty list */
function activeConflicts(svc) { return DOMAIN.activeConflicts(svc, CATEGORIES); }

/* Small inline badge shown next to a name that holds 2+ duties in this service.
   Red = needs review; amber = an editor marked it OK. */
function conflictBadge(svc, member) {
  if (!feat('conflictWarnings') || !member) return '';
  if (activeConflicts(svc).some(c => c.name === member)) {
    return '<span class="warn-badge" title="Has 2+ duties this service">!</span>';
  }
  const ok = svc.conflictOk || {};
  if (conflictsFor(svc).some(c => c.name === member && sameDuties(ok[c.name], c.duties))) {
    return '<span class="warn-badge ok" title="Double duty marked OK by an editor">!</span>';
  }
  return '';
}

/* ================= coordinator planning (workload + subs) ================= */

/* Per-member duty counts across the whole schedule: rolling 4/8-week windows,
   upcoming load, year total, last served and next duty dates. */
function workloadStats() {
  return DOMAIN.workloadStats(state.services, state.members, todayISO(), CATEGORIES);
}

/* Best substitutes for a duty in a service: same department, not already
   serving that service, lightest recent+upcoming load first, then longest
   since last served. */
function suggestSubs(svc, duty, excludeName, stats) {
  return DOMAIN.suggestSubs(
    svc, duty, excludeName, stats, state.departments, state.members, CATEGORIES
  );
}

/* ================= google sheet sync — pure parsers ================= */

/* Minimal RFC-4180-ish CSV parser. Handles quoted fields, embedded commas,
   escaped quotes (""), and CRLF/LF line endings. Returns array of row arrays. */
function parseCSV(text) { return SHEET_DOMAIN.parseCSV(text); }

/* Set of every duty name the app knows, built from CATEGORIES. */
function validDutySet() { return SHEET_DOMAIN.validDutySet(CATEGORIES); }

/* Parse a sheet date like "Sat, May 02" (no year). Returns { month, day } or null. */
function parseSheetDate(raw) { return SHEET_DOMAIN.parseSheetDate(raw); }

/* Infer the year for a month/day so the resulting date is closest to `today`.
   Tries today's year -1, +0, +1 and picks the smallest absolute distance. */
function inferYearISO(month, day, today) { return SHEET_DOMAIN.inferYearISO(month, day, today); }

/* Parse a 12-hour time like "9:00 AM" into 24-hour "HH:MM". Returns '' if unparseable. */
function parseSheetTime(raw) { return SHEET_DOMAIN.parseSheetTime(raw); }

/* Turn parsed CSV rows into service objects.
   Returns { services, members, warnings }. Pure — no window/document/state. */
function sheetRowsToServices(rows, today) {
  return SHEET_DOMAIN.sheetRowsToServices(rows, today, CATEGORIES);
}
/* ================= state ================= */

function createCompatStateStore(initial) {
  let current = initial;
  const readiness = { members: false, departments: false };
  const hasOwn = Object.prototype.hasOwnProperty;
  return Object.freeze({
    get: () => current,
    replace: next => { current = next; return current; },
    setReady: (key, value) => {
      if (!hasOwn.call(readiness, key)) return false;
      readiness[key] = !!value;
      return readiness[key];
    },
    areReady: keys => {
      const requested = keys == null ? ['members', 'departments'] : (Array.isArray(keys) ? keys : [keys]);
      return requested.every(key => hasOwn.call(readiness, key) && readiness[key]);
    }
  });
}

const stateStore = STATE_SERVICE && typeof STATE_SERVICE.createStore === 'function'
  ? STATE_SERVICE.createStore({ members: [], services: [], settings: { features: {}, pinHash: '' }, departments: {}, requests: [] })
  : createCompatStateStore({ members: [], services: [], settings: { features: {}, pinHash: '' }, departments: {}, requests: [] });
let state = stateStore.get();
function replaceState(next) { state = stateStore.replace(next); return state; }
function setStateReady(key, value) { return stateStore.setReady(key, value); }
function stateIsReady(keys) { return stateStore.areReady(keys); }
let fb = null; // { db, setDoc, doc, deleteDoc, writeBatch, collection }
let firebaseGateway = null;
let subscriptionManager = null;

/* Anonymous sign-in no longer blocks startup. Reads are open in
   firestore.rules, so making the whole app wait for a sign-in round trip
   before the first schedule row was requested bought nothing. Writes DO need
   it (the rules require request.auth != null), so every write goes through
   fbWrite() and waits on this promise instead. */
let authReady = Promise.resolve();
function fbWrite(fn) {
  return firebaseGateway ? firebaseGateway.write(fn) : authReady.then(fn);
}
const ui = {
  tab: 'schedule',
  sub: 'services',
  me: localStorage.getItem('wds-me') || '',
  theme: (function () {
    const value = localStorage.getItem('wds-theme') || 'blue';
    return ['blue', 'sage', 'sand'].indexOf(value) !== -1 ? value : 'blue';
  })(),
  deptFilter: (function () {
    const v = localStorage.getItem('wds-dept') || 'All';
    return v === 'All' || CATEGORIES.some(c => c.name === v) ? v : 'All';
  })(),
  expanded: {},
  showPast: false,
  banners: [],
  pinError: '',
  sitePinError: '',
  rebaseline: false,
  syncing: false,
  reqForm: null, // { key, note } — in-progress "request a change" draft, survives re-render
  memberRequestDraft: null,
  songSvc: null, // svcId deep-link target for the song picker (ui.tab === 'songs')
  songNav: false // one-shot: this render is an explicit navigation into the song picker (tab or button), not a background re-mount
};

function currentTheme() { return ui.theme || 'blue'; }

function applyTheme() {
  if (document && document.documentElement) document.documentElement.dataset.theme = currentTheme();
}

function screenNameForTab(tab) { return SCREEN_BY_TAB[tab] || ''; }

function screenModuleFor(name) {
  const registered = SCREEN_UI.screens && typeof SCREEN_UI.screens.get === 'function'
    ? SCREEN_UI.screens.get(name)
    : SCREEN_REGISTRY[name];
  return registered && typeof registered.create === 'function' ? registered : null;
}

function screenStorage() {
  return {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : value;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, String(value)); return true; } catch (e) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); return true; } catch (e) { return false; }
    },
    json: getJSON
  };
}

function screenDeps() {
  const nameMap = unifiedNameMap;
  return {
    getState: () => state,
    getUi: () => ui,
    getFirebase: () => fb,
    getSetlists: () => setlistIndex,
    core: CORE,
    scheduleDomain: DOMAIN,
    memberDomain: MEMBER_DOMAIN,
    coordinatorDomain: COORDINATOR_DOMAIN,
    fmt: {
      esc,
      date: fmtDate,
      time: fmtTime,
      badge: dateBadge,
      serviceId: svcId,
      today: todayISO
    },
    feature: feat,
    currenthelpers: {
      today: todayISO,
      date: fmtDate,
      time: fmtTime,
      serviceId: svcId,
      toISO,
      sheetUrl,
      upcomingServices,
      dutiesFor,
      renderCatRows,
      conflictsFor,
      activeConflicts,
      sameDuties,
      workloadStats
    },
    requestRender: render,
    addBanner,
    confirm: (...args) => window.confirm(...args),
    storage: screenStorage(),
    commands: {
      persistService,
      deleteService: persistDeleteService,
      persistMembers,
      persistSettings,
      persistDepartments,
      persistNameMap,
      persistRequest,
      resolveRequest,
      persistAll,
      saveService: (service, metadata) => assignmentGateway.saveService(service, metadata),
      syncFromSheet,
      registerPush,
      unregisterPush,
      subscribeCalendar: subscribeICS,
      copyCalendarLink: copyICSLink,
      exportBackup: () => handleAct('export', document.createElement('button')),
      importBackup: el => handleChg('import-file', el),
      applyNameMap,
      setMember: value => handleChg('me', { value }),
      clearAlerts: () => handleAct('clear-alerts', document.createElement('button')),
      clearMemberRequestDraft: () => { ui.memberRequestDraft = null; },
      enableNotifications: () => handleAct('notify-on', document.createElement('button')),
      disableNotifications: () => handleAct('notify-off', document.createElement('button')),
      submitRequest: async request => {
        const payload = request || {};
        const svcIdValue = payload.svcId || payload.serviceId || '';
        const duty = payload.duty || '';
        const svc = findService(svcIdValue);
        const note = String(payload.note || '');
        ui.reqForm = { key: svcIdValue + ':' + duty, note };
        if (!svc || !duty || !ui.me) throw new Error('Could not save the change request.');
        const createdAt = Date.now();
        const req = {
          id: requestId(svcIdValue, duty, createdAt),
          name: ui.me,
          svcId: svcIdValue,
          date: svc.date,
          service: svc.service,
          worship: svc.worship,
          duty,
          note,
          status: 'pending',
          createdAt
        };
        try {
          await persistRequest(req);
        } catch (error) {
          throw new Error('Could not save the change request.');
        }
        if (!state.requests.some(item => item.id === req.id)) state.requests.push(req);
        if (!fb) saveLocal();
        ui.reqForm = null;
        ui.memberRequestDraft = null;
        afterDataChange();
        return req;
      },
      openPresider: id => {
        ui.songSvc = id || null;
        ui.songNav = true;
        ui.tab = 'songs';
        render();
      }
    },
    legacy: {
      renderSecondaryPanel: panel => {
        if (panel === 'planning') return renderManagePlanning();
        if (panel === 'requests') return renderManageRequests();
        if (panel === 'services') return renderManageServices();
        if (panel === 'people') return renderManagePeople();
        if (panel === 'features') return renderFeatures();
        if (panel === 'data') return renderManageData();
        return '';
      }
    },
    nameMap
  };
}

function screenInstanceFor(name) {
  if (!name) return null;
  if (screenInstances[name]) return screenInstances[name];
  const module = screenModuleFor(name);
  if (!module) return null;
  try {
    const instance = module.create(screenDeps());
    if (!instance || typeof instance.render !== 'function' || typeof instance.handle !== 'function' ||
        typeof instance.afterRender !== 'function' || typeof instance.destroy !== 'function') {
      throw new Error('screen module must expose render, handle, afterRender and destroy');
    }
    screenInstances[name] = instance;
    return instance;
  } catch (e) {
    if (!screenModuleFailures[name]) {
      screenModuleFailures[name] = true;
      console.warn('WorshipApp ' + name + ' screen failed to initialize:', e);
    }
    return null;
  }
}

function destroyInactiveScreen(nextName) {
  if (activeScreenName === 'presider' && nextName !== 'presider' && songApp && typeof songApp.unmount === 'function') {
    try { songApp.unmount(); } catch (e) {
      console.warn('WorshipApp presider screen cleanup failed:', e);
    }
  }
  if (activeScreenName && activeScreenName !== nextName && screenInstances[activeScreenName]) {
    try { screenInstances[activeScreenName].destroy(); } catch (e) {
      console.warn('WorshipApp ' + activeScreenName + ' screen cleanup failed:', e);
    }
  }
  activeScreenName = nextName || '';
}

function seedState() {
  return JSON.parse(JSON.stringify({
    members: window.SEED_DATA.members,
    services: window.SEED_DATA.services,
    settings: { features: {}, pinHash: '' },
    departments: DEPARTMENTS_SEED,
    requests: []
  }));
}
const storageGateway = STORAGE_SERVICE.createAdapter({
  storage: localStorage,
  dataKey: DATA_KEY,
  getState: () => state,
  getFirebase: () => fb,
  getAuthReady: () => authReady,
  serviceId: svcId
});
const assignmentGateway = window.WorshipApp.services.assignments.create({
  getFirebase: () => fb,
  getAuthReady: () => authReady,
  persistService,
  serviceId: svcId,
  afterDataChange,
  getMe: () => ui.me,
  persistLocalSetlist: change => {
    if (songApp && songApp.updateLocalPresider) return songApp.updateLocalPresider(change);
    const data = getJSON('nss-data-v1', null);
    const plan = data && data.setlists && data.setlists[change.serviceId];
    if (!plan) return;
    plan.presider = change.presider || '';
    plan.updatedAt = Math.max(Date.now(), Number(plan.updatedAt || 0) + 1, Number(plan.confirmedAt || 0) + 1);
    plan.updatedBy = ui.me || '';
    localStorage.setItem('nss-data-v1', JSON.stringify(data));
  }
});

function saveLocal(value) { return storageGateway.saveLocal(value == null ? state : value); }
function loadLocal() { return storageGateway.loadLocal(); }
function persistService(svc) { return storageGateway.persistService(svc); }
function persistDeleteService(id) { return storageGateway.persistDeleteService(id); }
function persistMembers() { return storageGateway.persistMembers(); }
function persistSettings() { return storageGateway.persistSettings(); }
function persistDepartments() { return storageGateway.persistDepartments(); }
function persistNameMap(map) { return storageGateway.persistNameMap(map); }
function persistRequest(req) { return storageGateway.persistRequest(req); }
function resolveRequest(id, status) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  req.status = status;
  req.resolvedAt = Date.now();
  req.resolvedBy = ui.me || 'editor';
  persistRequest(req);
}
function persistAll() {
  return storageGateway.persistAll();
}

/* ================= sorting / filtering ================= */

function sortedServices() {
  return DOMAIN.sortedServices(state.services);
}
function upcomingServices() { return DOMAIN.upcomingServices(state.services, todayISO()); }
function pastServices() { return DOMAIN.pastServices(state.services, todayISO()); }

function dutiesFor(member, list) {
  return DOMAIN.dutiesFor(member, list || upcomingServices(), CATEGORIES).map(item => ({
    svc: item.service,
    duty: item.duty,
    cat: item.cat
  }));
}

/* ================= notifications ================= */

function notifyGranted() { return 'Notification' in window && Notification.permission === 'granted'; }
function notifyOn() { return notifyGranted() && localStorage.getItem('wds-notify') === '1'; }

/* True when this device has a live FCM token registered, so the Cloud Functions
   already deliver new-duty/reminder pushes to it. When true we suppress the
   client-side sysNotify for those events to avoid a duplicate (double-buzz);
   local-only mode and browsers without FCM fall back to the client notification. */
function serverPushActive() {
  return !!(fb && fb.messaging && localStorage.getItem('wds-fcm-token'));
}

async function sysNotify(title, body) {
  if (!notifyOn()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) { reg.showNotification(title, { body, icon: 'icon.svg' }); return; }
  } catch (e) { /* fall through */ }
  try { new Notification(title, { body }); } catch (e) { /* unsupported */ }
}

/* ---- server push (FCM) token registration ----
   Registers the current device's FCM token in Firestore under `tokens/{token}`
   tagged with the member name, so Cloud Functions can push to it. Every guard
   fails silently — unsupported browsers (iOS Safari not installed to home
   screen, missing VAPID key, notifications off, no name) simply no-op. */
async function registerPush() {
  try {
    if (!fb || !fb.messaging || !fb.getToken) return;
    if (!window.FCM_VAPID_KEY) return;              // owner has not pasted the key yet
    if (!notifyOn() || !ui.me) return;
    const reg = (await navigator.serviceWorker.ready) ||
      (await navigator.serviceWorker.getRegistration());
    if (!reg) return;
    const token = await fb.getToken(fb.messaging, {
      vapidKey: window.FCM_VAPID_KEY,
      serviceWorkerRegistration: reg
    });
    if (!token) return;
    const prevToken = localStorage.getItem('wds-fcm-token');
    const prevName = localStorage.getItem('wds-fcm-name');
    if (prevToken && prevToken !== token) {
      // token rotated — drop the stale doc
      try { await firebaseGateway.deleteDocument('tokens', prevToken); } catch (e) { /* ignore */ }
    }
    if (prevToken !== token || prevName !== ui.me) {
      await firebaseGateway.writeDocument('tokens', token, { name: ui.me, updatedAt: Date.now() });
      localStorage.setItem('wds-fcm-token', token);
      localStorage.setItem('wds-fcm-name', ui.me);
    }
  } catch (e) { console.warn('registerPush failed:', e); }
}

async function unregisterPush() {
  try {
    const token = localStorage.getItem('wds-fcm-token');
    if (fb && fb.deleteToken && fb.messaging) {
      try { await fb.deleteToken(fb.messaging); } catch (e) { /* ignore */ }
    }
    if (fb && token) {
      try { await firebaseGateway.deleteDocument('tokens', token); } catch (e) { /* ignore */ }
    }
    localStorage.removeItem('wds-fcm-token');
    localStorage.removeItem('wds-fcm-name');
  } catch (e) { console.warn('unregisterPush failed:', e); }
}

function getJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}

function dutyLabel(d) {
  return d.duty + ' — ' + d.svc.worship + ' ' + d.svc.service + ', ' + fmtDate(d.svc.date) + ' at ' + fmtTime(d.svc.time);
}

/* Detect duties newly added for the selected member */
function checkNewDuties() {
  if (!ui.me) return;
  const seenKey = 'wds-seen-' + ui.me;
  const duties = dutiesFor(ui.me);
  const current = {};
  duties.forEach(d => { current[svcId(d.svc) + '|' + d.duty] = d; });
  const prev = getJSON(seenKey, null);
  if (prev === null || ui.rebaseline || !feat('notifications')) {
    // baseline without alerting: first visit, a name switch, or alerts turned off
    ui.rebaseline = false;
    localStorage.setItem(seenKey, JSON.stringify(Object.keys(current)));
    return;
  }
  const prevSet = {};
  prev.forEach(k => { prevSet[k] = true; });
  const fresh = Object.keys(current).filter(k => !prevSet[k]);
  if (fresh.length) {
    const alerts = getJSON('wds-alerts-' + ui.me, []);
    fresh.forEach(k => {
      const d = current[k];
      alerts.unshift({ t: Date.now(), txt: 'New duty: ' + dutyLabel(d) });
      if (!serverPushActive()) sysNotify('New duty assigned to you', dutyLabel(d));
    });
    localStorage.setItem('wds-alerts-' + ui.me, JSON.stringify(alerts.slice(0, 30)));
    if (ui.tab !== 'my') {
      localStorage.setItem('wds-unread-' + ui.me, String(fresh.length + Number(localStorage.getItem('wds-unread-' + ui.me) || 0)));
      addBanner('You have ' + fresh.length + ' new dut' + (fresh.length > 1 ? 'ies' : 'y') + ' — see My Duties.', true);
    }
    render();
  }
  localStorage.setItem(seenKey, JSON.stringify(Object.keys(current)));
}

/* Remind about duties happening within the next 24 hours */
function checkReminders() {
  if (!ui.me || !feat('reminders')) return;
  const now = Date.now();
  const reminded = getJSON('wds-reminded', {});
  let changed = false;
  dutiesFor(ui.me).forEach(d => {
    const when = svcDateTime(d.svc).getTime();
    const key = ui.me + '|' + svcId(d.svc) + '|' + d.duty;
    if (when > now && when - now < 24 * 3600 * 1000 && !reminded[key]) {
      reminded[key] = now;
      changed = true;
      if (!serverPushActive()) sysNotify('Duty reminder', dutyLabel(d));
      addBanner('Reminder: ' + dutyLabel(d), false);
    }
  });
  if (changed) {
    Object.keys(reminded).forEach(k => { if (now - reminded[k] > 7 * 24 * 3600 * 1000) delete reminded[k]; });
    localStorage.setItem('wds-reminded', JSON.stringify(reminded));
  }
}

function addBanner(txt, alert) {
  if (ui.banners.some(b => b.txt === txt)) return;
  ui.banners.push({ txt, alert });
  renderBanners();
}

/* Six Firestore listeners land within milliseconds of each other at startup,
   and each one used to trigger its own full innerHTML rebuild. Coalescing them
   into one render per frame removes five wasted rebuilds from every load. */
let renderQueued = false;
function renderSoon() {
  if (renderQueued) return;
  renderQueued = true;
  const run = () => { renderQueued = false; render(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function afterDataChange() {
  render();
  checkNewDuties();
  checkReminders();
}

/* ================= google sheet sync — engine ================= */

const SHEET_SYNC_MIN_MS = 5 * 60 * 1000; // auto-sync throttle window

/* Merge a parsed sheet result into state, field-by-field so unchanged
   services trigger zero Firestore writes. Returns { added, updated }.
   Also grows department rosters: any (duty, member) pair seen adds member
   to that duty's category roster if not already present (covers brand-new
   names and existing names appearing in a category for the first time). */
function mergeSheetServices(services) {
  const merge = DOMAIN.mergeSheetServices({
    currentServices: state.services,
    departments: state.departments,
    sheetServices: services,
    departmentsLoaded: stateIsReady('departments'),
    categories: CATEGORIES
  });
  state.services = merge.services;
  state.departments = merge.departments;
  merge.addedServices.forEach(persistService);
  merge.updatedServices.forEach(persistService);
  if (merge.departmentsChanged) persistDepartments();
  return merge;
}

async function syncFromSheet(manual) {
  if (!feat('sheetSync')) { if (manual) alert('Google Sheet sync is turned off in Manage → Features.'); return; }
  const url = sheetUrl();
  if (!url) { if (manual) alert('No sheet link is set. Add one in Manage → Data & Sync.'); return; }
  if (!manual) {
    const last = Number(localStorage.getItem('wds-sheet-sync-at') || 0);
    if (Date.now() - last < SHEET_SYNC_MIN_MS) return; // throttled
  }
  localStorage.setItem('wds-sheet-sync-at', String(Date.now()));

  if (manual) { ui.syncing = true; render(); }
  let text;
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    text = await resp.text();
  } catch (e) {
    ui.syncing = false;
    if (manual) { render(); alert('Could not reach the Google Sheet. Check the link and your connection, then try again.'); }
    else console.warn('Sheet sync failed:', e);
    return;
  }

  const parsed = sheetRowsToServices(parseCSV(text), new Date());
  // Canonicalize sheet names before merging so the sheet can't re-introduce
  // variant spellings the app has already unified (keeps push + .ics targeting
  // aligned with the canonical name). Blank '' clears pass through unchanged.
  const nameMap = unifiedNameMap();
  const canon = n => (n && nameMap[n]) || n;
  parsed.services.forEach(svc => {
    const a = svc.assignments || {};
    Object.keys(a).forEach(duty => { a[duty] = canon(a[duty]); });
  });
  parsed.members = Array.from(new Set(parsed.members.map(canon))).sort();
  const merge = mergeSheetServices(parsed.services);

  // add any new members the sheet introduced
  let addedMembers = 0;
  parsed.members.forEach(name => {
    if (state.members.indexOf(name) === -1) { state.members.push(name); addedMembers++; }
  });
  if (addedMembers) { state.members.sort(); persistMembers(); }

  localStorage.setItem('wds-sheet-sync-result', JSON.stringify({
    t: Date.now(), added: merge.added, updated: merge.updated, members: addedMembers,
    warnings: parsed.warnings.length, warningMsgs: parsed.warnings.slice(0, 6)
  }));

  ui.syncing = false;
  afterDataChange();

  if (manual) {
    const total = merge.added + merge.updated + addedMembers;
    let msg;
    if (!total) {
      msg = 'Everything already matches the sheet.';
    } else {
      const parts = [];
      if (merge.added) parts.push(merge.added + ' service' + (merge.added > 1 ? 's' : '') + ' added');
      if (merge.updated) parts.push(merge.updated + ' service' + (merge.updated > 1 ? 's' : '') + ' updated');
      if (addedMembers) parts.push(addedMembers + ' new ' + (addedMembers > 1 ? 'people' : 'person'));
      msg = 'Synced from the sheet: ' + parts.join(', ') + '.';
    }
    if (parsed.warnings.length) msg += '\n\n' + parsed.warnings.length + ' row type(s) were skipped (unknown duties).';
    alert(msg);
  }
}

/* Run an automatic sync at most once per page load. */
let sheetSyncTried = false;
let autoSyncWaits = 0;
function autoSyncOnce() {
  if (sheetSyncTried) return;
  // Roster auto-add (mergeSheetServices → addToDept) needs the members and
  // departments docs; if the sync fired before they land, new names silently
  // miss their department. Wait for both (bounded ~10s so we never stall).
  if (fb && !stateIsReady(['members', 'departments']) && autoSyncWaits < 20) {
    autoSyncWaits++;
    setTimeout(autoSyncOnce, 500);
    return;
  }
  sheetSyncTried = true;
  syncFromSheet(false);
}
/* Firebase mode: run shortly after the first schedule snapshot arrives so we
   diff against real data, not empty state. Guarded to fire once. */
let sheetSyncScheduled = false;
function scheduleSyncSoon() {
  if (sheetSyncScheduled) return;
  sheetSyncScheduled = true;
  setTimeout(autoSyncOnce, 1500);
}

/* ================= calendar export ================= */

function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }

/* A UTC timestamp as YYYYMMDDTHHMMSSZ, for DTSTAMP. */
function icsStamp(d) {
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}

/* VTIMEZONE for America/Los_Angeles — anchors event times to Pacific wall-clock
   (matching push reminders) instead of floating to the subscriber's timezone. */
const LA_VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:America/Los_Angeles',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT',
  'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST',
  'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

function downloadICS() {
  const duties = dutiesFor(ui.me);
  if (!duties.length) { alert('No upcoming duties to add.'); return; }
  const stamp = icsStamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LV Zion//Worship Duties//EN',
    'X-WR-TIMEZONE:America/Los_Angeles'].concat(LA_VTIMEZONE);
  duties.forEach(d => {
    const dt = d.svc.date.replace(/-/g, '') + 'T' + (d.svc.time || '12:00').replace(':', '') + '00';
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + svcId(d.svc) + '-' + d.duty.replace(/[^a-zA-Z0-9]/g, '') + '@lvzion',
      'DTSTAMP:' + stamp,
      'DTSTART;TZID=America/Los_Angeles:' + dt,
      'DURATION:PT1H30M',
      'SUMMARY:' + icsEscape(d.duty + ' (' + d.svc.worship + ' ' + d.svc.service + ')'),
      'DESCRIPTION:' + icsEscape('Worship duty: ' + d.duty),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty tomorrow', 'TRIGGER:-PT24H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty soon', 'TRIGGER:-PT2H', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-worship-duties.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* The live per-member calendar feed served by the `ics` Cloud Function (see
   firebase.json's /ics/** rewrite). Subscribing to it beats the downloaded file
   below because the phone re-reads it: a service that moves updates by itself,
   instead of leaving a stale time in someone's calendar forever. downloadICS()
   is left in place for the one-off snapshot case but is no longer wired to a
   button; the Subscribe path replaced it. */
function icsFeedUrl(scheme) {
  const nameMap = unifiedNameMap();
  const who = nameMap[ui.me] || ui.me;
  return scheme + '//' + location.host + '/ics/' + encodeURIComponent(who);
}

function subscribeICS() {
  if (!ui.me) return;
  // webcal: is what tells iOS and macOS to subscribe rather than download.
  location.href = icsFeedUrl('webcal:');
}

function copyICSLink() {
  if (!ui.me) return;
  const url = icsFeedUrl('https:');
  const done = () => addBanner('Calendar link copied. In Google Calendar, add it under Other calendars \u2192 From URL.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => addBanner('Your calendar link is: ' + url));
  } else {
    addBanner('Your calendar link is: ' + url);
  }
}

/* ================= rendering ================= */

function captureViewSnapshot(view) {
  if (!view) return null;
  const controls = [];
  view.querySelectorAll('input, select, textarea').forEach((control, index) => {
    const key = control.dataset.preserveKey || control.id || control.name || ('control-' + index);
    controls.push({
      key,
      value: control.value,
      checked: control.checked,
      selectionStart: typeof control.selectionStart === 'number' ? control.selectionStart : null,
      selectionEnd: typeof control.selectionEnd === 'number' ? control.selectionEnd : null
    });
  });
  const active = document.activeElement && view.contains(document.activeElement)
    ? (document.activeElement.dataset.preserveKey || document.activeElement.id || document.activeElement.name || '')
    : '';
  return { scrollY: window.scrollY || 0, controls, active };
}

function restoreViewSnapshot(view, snapshot) {
  if (!view || !snapshot) return;
  const controls = Array.from(view.querySelectorAll('input, select, textarea'));
  snapshot.controls.forEach(saved => {
    const control = controls.find((candidate, index) =>
      (candidate.dataset.preserveKey || candidate.id || candidate.name || ('control-' + index)) === saved.key);
    if (!control) return;
    if (control.type === 'checkbox' || control.type === 'radio') control.checked = saved.checked;
    else if (document.activeElement !== control || control.value !== saved.value) control.value = saved.value;
    if (document.activeElement === control && saved.selectionStart != null && typeof control.setSelectionRange === 'function') {
      try { control.setSelectionRange(saved.selectionStart, saved.selectionEnd); } catch (e) { /* ignored */ }
    }
  });
  if (snapshot.active) {
    const target = controls.find((candidate, index) =>
      (candidate.dataset.preserveKey || candidate.id || candidate.name || ('control-' + index)) === snapshot.active);
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }
  if (typeof window.scrollTo === 'function') window.scrollTo({ top: snapshot.scrollY, behavior: 'auto' });
}

function renderPrimaryScreen(view, screenName) {
  if (screenName === 'coordinator' && (!managerAccessAllowed() || !editorAccessAllowed())) return false;
  const instance = screenInstanceFor(screenName);
  if (!instance) return false;
  const output = instance.render();
  if (typeof output === 'string') view.innerHTML = output;
  const root = view.querySelector('[data-screen="' + screenName + '"], [data-screen="manage"]') || view.firstElementChild || view;
  instance.afterRender(root);
  return true;
}

function renderLegacyScreen(view, screenName, html) {
  const className = screenName === 'member' ? 'member-page' :
    (screenName === 'coordinator' ? 'manage-page' : 'presider-page');
  view.innerHTML = '<section class="' + className + '" data-screen="' + screenName + '">' + html + '</section>';
}

function renderHeaderControls() {
  const holder = document.getElementById('header-member-control');
  if (!holder) return;
  if (document.activeElement && holder.contains(document.activeElement)) return;
  const options = state.members.map(member =>
    '<option value="' + esc(member) + '"' + (member === ui.me ? ' selected' : '') + '>' + esc(member) + '</option>'
  ).join('');
  holder.innerHTML = '<label class="ws-member-control" for="header-me-select">' +
    '<span class="sr-only">Selected member</span>' +
    '<select id="header-me-select" data-chg="me" aria-label="Selected member">' +
    '<option value="">Choose your name</option>' + options + '</select></label>' +
    '<label class="ws-theme-control" for="theme-select"><span class="sr-only">Theme</span>' +
    '<select id="theme-select" data-chg="theme" aria-label="Theme">' +
    ['blue', 'sage', 'sand'].map(theme => '<option value="' + theme + '"' + (theme === currentTheme() ? ' selected' : '') + '>' +
      theme[0].toUpperCase() + theme.slice(1) + '</option>').join('') +
    '</select></label>';
}

function configuredManagerNames() {
  const configured = state.settings && state.settings.departmentManagers;
  if (!configured || typeof configured !== 'object') return null;
  const names = [];
  Object.keys(configured).forEach(key => {
    const value = configured[key];
    if (Array.isArray(value)) value.forEach(name => { if (typeof name === 'string') names.push(name); });
  });
  return Array.from(new Set(names));
}

function managerAccessAllowed() {
  const names = configuredManagerNames();
  return !names || !names.length || (!!ui.me && names.indexOf(ui.me) !== -1);
}

function editorAccessAllowed() {
  if (!feat('editorLock')) return true;
  const pin = state.settings && state.settings.pinHash;
  return !!pin && localStorage.getItem('wds-unlock') === pin;
}

function renderManagerSelectionRequired() {
  return '<div class="card lock-box" data-screen="coordinator"><div class="lock-title">Choose a manager name</div>' +
    '<p class="hint">Select your name in the header before opening Manage. Access still uses the existing editor passcode.</p></div>';
}

function render() {
  const nav = document.querySelector('nav.tabs');
  if (feat('siteLock') && !siteUnlocked()) {
    destroyInactiveScreen('');
    nav.classList.toggle('hidden', true);
    document.getElementById('banners').innerHTML = '';
    document.getElementById('view').innerHTML = renderSiteLock();
    const input = document.getElementById('site-pin-input');
    if (input) input.focus();
    return;
  }
  nav.classList.toggle('hidden', false);
  applyTheme();
  renderHeaderControls();

  // Any selected member can browse the song workspace when song planning is
  // enabled. If the feature is turned off or the viewer clears their name
  // while on the songs screen, return them to My Duties.
  const isPresider = feat('songPicker') && !!ui.me;
  document.getElementById('tab-presider').classList.toggle('hidden', !isPresider);
  if (ui.tab === 'songs' && !isPresider) { ui.tab = 'my'; ui.songSvc = null; ui.songNav = false; }

  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === ui.tab);
  });
  const unread = Number(localStorage.getItem('wds-unread-' + ui.me) || 0);
  const tabMy = document.getElementById('tab-my');
  tabMy.innerHTML = 'My Duties' + (unread > 0 && ui.tab !== 'my' ? '<span class="dot"></span>' : '');
  const tabManage = document.getElementById('tab-manage');
  tabManage.classList.toggle('hidden', !managerAccessAllowed());
  tabManage.innerHTML = 'Manage' + (pendingRequestsCount() > 0 && ui.tab !== 'manage' ? '<span class="dot"></span>' : '');

  const view = document.getElementById('view');
  const screenName = screenNameForTab(ui.tab);
  destroyInactiveScreen(screenName);
  // A background Firestore snapshot calls render(); replacing innerHTML would
  // wipe whatever the editor is typing (service field, member name, sheet URL,
  // change-request note) and drop focus. Skip the view refresh while a text
  // input inside #view is focused — the next render() after they blur catches up.
  if (!viewHasFocusedInput(view)) {
    const snapshot = captureViewSnapshot(view);
    const renderedByScreen = ui.tab === 'songs' ? false : renderPrimaryScreen(view, screenName);
    if (!renderedByScreen) {
      if (ui.tab === 'schedule') renderLegacyScreen(view, screenName, renderSchedule());
      else if (ui.tab === 'my') renderLegacyScreen(view, screenName, renderMy());
      else if (ui.tab === 'songs') {
        if (!view.querySelector('#song-root')) {
          renderLegacyScreen(view, screenName, '<div class="song-head"><button class="ghost" data-act="close-songs">← My Duties</button></div><div id="song-root"><div class="empty">Loading the song planner…</div></div>');
        }
        renderSongs(view);
      }
      else renderLegacyScreen(view, screenName, renderManage());
    }
    restoreViewSnapshot(view, snapshot);
    pulse('tab_' + ui.tab); // counts once per device per day — see pulse()
  }
  renderBanners();
}

/* Placeholder shown between page load and the first Firestore snapshot, so the
   screen isn't blank (or a misleading "no services" empty state) while data loads. */
function renderLoading() {
  const view = document.getElementById('view');
  if (view) view.innerHTML = '<div class="empty">Loading schedule…</div>';
}

function viewHasFocusedInput(view) {
  const a = document.activeElement;
  if (!a || !view || !view.contains(a)) return false;
  if (a.tagName === 'TEXTAREA') return true;
  if (a.tagName !== 'INPUT') return false;
  const t = (a.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'search', 'url', 'password', 'number', 'email', 'tel', 'date', 'time'].indexOf(t) !== -1;
}

function renderBanners() {
  if (feat('siteLock') && !siteUnlocked()) { document.getElementById('banners').innerHTML = ''; return; }
  document.getElementById('banners').innerHTML = ui.banners.map((b, i) =>
    '<div class="banner' + (b.alert ? ' alert' : '') + '"><span>' + esc(b.txt) + '</span>' +
    '<button class="x" data-act="dismiss-banner" data-i="' + i + '" aria-label="Dismiss">✕</button></div>'
  ).join('');
}

function pillFor(member) {
  const mine = ui.me && member === ui.me;
  return '<span class="pill' + (mine ? ' me' : '') + '">' + esc(member) + (mine ? ' (You)' : '') + '</span>';
}

function renderCatRows(svc, showEmpty, only) {
  let html = '';
  CATEGORIES.forEach(cat => {
    if (only && cat.name !== only) return;
    const rows = cat.duties
      .filter(duty => showEmpty || feat('emptyDuties') || (svc.assignments || {})[duty])
      .map(duty => {
        const m = (svc.assignments || {})[duty];
        return '<div class="duty-row"><div class="dname">' + esc(duty) + '</div>' +
          (m ? pillFor(m) + conflictBadge(svc, m) : '<span style="color:var(--muted);font-style:italic;font-size:13px">—</span>') + '</div>';
      });
    if (rows.length) {
      html += '<div class="cat-label"><span class="dot-c" style="background:' + cat.color + '"></span>' +
        esc(cat.name) + '</div>' + rows.join('');
    }
  });
  return html;
}

/* Does svc have at least one filled assignment in the given category? */
function categoryHasAssignments(svc, catName) {
  const cat = CATEGORIES.find(c => c.name === catName);
  if (!cat) return false;
  const assignments = svc.assignments || {};
  return cat.duties.some(duty => !!assignments[duty]);
}

function renderServiceCard(svc, deptFilter) {
  return '<div class="card">' +
    '<div class="card-head"><span class="svc-title">' + esc(svc.worship) + ' <small>· ' + esc(svc.service) + '</small></span>' +
    '<span class="time">' + fmtTime(svc.time) + '</span></div>' +
    (feat('choirSong') && svc.choirSong && (!deptFilter || deptFilter === 'All' || deptFilter === 'Worship') ? '<div class="choir-song">Choir · ' + esc(svc.choirSong) + '</div>' : '') +
    renderCatRows(svc, false, deptFilter && deptFilter !== 'All' ? deptFilter : undefined) +
    '</div>';
}

function renderServiceList(list, deptFilter) {
  let html = '', lastDate = '';
  let pendingHead = '';
  list.forEach(svc => {
    if (svc.date !== lastDate) {
      lastDate = svc.date;
      const badge = dateBadge(svc.date);
      pendingHead = '<div class="date-head"><span class="day">' + esc(fmtDate(svc.date)) + '</span>' +
        (badge ? '<span class="badge">' + badge + '</span>' : '') + '</div>';
    }
    if (deptFilter && deptFilter !== 'All' && !categoryHasAssignments(svc, deptFilter)) return;
    if (pendingHead) { html += pendingHead; pendingHead = ''; }
    html += renderServiceCard(svc, deptFilter);
  });
  return html;
}

function renderDeptChips() {
  const items = [{ name: 'All', color: null }].concat(CATEGORIES);
  return '<div class="subnav chips">' + items.map(c =>
    '<button data-act="dept-filter" data-val="' + esc(c.name) + '"' +
    (ui.deptFilter === c.name ? ' class="active"' : '') + '>' +
    (c.color ? '<span class="dot-c" style="background:' + c.color + '"></span>' : '') +
    esc(c.name) + '</button>').join('') + '</div>';
}

function renderSchedule() {
  let html = renderDeptChips();
  const filter = ui.deptFilter;
  const up = upcomingServices();
  if (!up.length) html += '<div class="empty">No upcoming services yet.<br>Add them in the <b>Manage</b> tab.</div>';
  else html += renderServiceList(up, filter);
  const past = feat('pastServices') ? pastServices() : [];
  if (past.length) {
    html += '<div style="text-align:center"><button class="linkish" data-act="toggle-past">' +
      (ui.showPast ? 'Hide past services' : 'Show ' + past.length + ' past services') + '</button></div>';
    if (ui.showPast) html += renderServiceList(past.slice().reverse(), filter);
  }
  return html;
}

function renderMy() {
  const opts = '<option value="">— Choose your name —</option>' +
    state.members.map(m => '<option value="' + esc(m) + '"' + (m === ui.me ? ' selected' : '') + '>' + esc(m) + '</option>').join('');

  let html = '<div class="me-picker"><label for="me-select">Who are you?</label>' +
    '<select id="me-select" data-chg="me">' + opts + '</select></div>';

  if (!ui.me) return html + '<div class="empty">Choose your name above to see your duties.</div>';

  // notifications + calendar controls (feature-gated)
  let controls = '';
  if (('Notification' in window) && (feat('notifications') || feat('reminders'))) {
    controls += notifyOn()
      ? '<button class="ghost on" data-act="notify-off">Notifications on ✓</button>'
      : '<button class="primary" data-act="notify-on">Turn on notifications</button>';
  }
  if (feat('calendarExport')) {
    controls += '<button class="ghost" data-act="subscribe-ics">Add my duties to my calendar</button>' +
      '<button class="ghost" data-act="copy-ics">Copy calendar link</button>';
  }
  if (controls) {
    html += '<div class="notify-box">' + controls + '</div>' +
      '<p class="hint">You\'ll be alerted when a new duty is added for you, and reminded the day before each duty. ' +
      'Adding your duties to your calendar subscribes it to the live schedule, so the times stay correct by themselves if a service ever moves. On Android, tap Copy calendar link and add it in Google Calendar under Other calendars \u2192 From URL.</p>';
  }

  // recent alerts
  const alerts = getJSON('wds-alerts-' + ui.me, []);
  if (alerts.length) {
    html += '<div class="card"><div class="alerts-head"><b style="font-size:13.5px">Recent updates</b>' +
      '<button class="linkish alerts-clear" data-act="clear-alerts">Clear</button></div>' +
      alerts.slice(0, 6).map(a =>
        '<div class="alert-item"><span class="t">' + new Date(a.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</span>' +
        '<span>' + esc(a.txt) + '</span></div>').join('') +
      '</div>';
  }

  const duties = dutiesFor(ui.me);
  if (!duties.length) {
    html += '<div class="empty">You have no upcoming duties right now. ' +
      'You\'ll see them here — and be notified — as soon as one is assigned to you.</div>';
    return html + renderYourRequests();
  }

  html += '<p class="hint">You have <b>' + duties.length + '</b> upcoming dut' + (duties.length > 1 ? 'ies' : 'y') + '.</p>';

  // Grouping is pure and preserves first-seen date, service, and duty order.
  const days = MEMBER_DOMAIN.groupDuties(duties, svcId);

  // Presider song picker — a role-conditional door into the song-selection
  // screen (ported from the old song app). Only presiders ever see it.
  if (feat('songPicker') && duties.some(d => d.duty === 'Presider')) {
    const first = duties.find(d => d.duty === 'Presider');
    const firstId = svcId(first.svc);
    const st = songStateFor(firstId);
    const label = st && st.confirmed ? 'Review your confirmed songs'
      : st && st.changed ? 'Confirm your songs again'
      : st && st.count ? 'Finish picking your songs'
      : 'Plan songs for your service';
    const songCount = st ? st.count + ' song' + (st.count === 1 ? '' : 's') : '';
    const note = st && st.confirmed
      ? 'Your songs for the next service are confirmed. Open them any time to change the list.'
      : st && st.changed
        ? 'You changed the songs for your next service after confirming them. Confirm the list again so it shows as done.'
        : st && st.count
          ? 'You have ' + songCount + ' picked for your next service but have not confirmed the list yet.'
          : 'You\'re presiding soon. Pick the songs for your service here.';
    html += '<div class="notify-box"><button class="primary" data-act="open-songs" data-svc="' + esc(firstId) + '">' + label + '</button></div>' +
      '<p class="hint">' + esc(note) + ' Each Presider duty below also has its own button.</p>';
  }

  days.forEach(day => {
    const badge = dateBadge(day.date);
    html += '<div class="card duty-card" style="--edge:' + day.edge + '">' +
      '<div class="when">' + esc(fmtDate(day.date)) +
      (badge ? ' · <b style="color:var(--accent)">' + badge + '</b>' : '') + '</div>';
    day.services.forEach((se, si) => {
      const svc = se.svc;
      if (si > 0) html += '<div class="svc-sep"></div>'; // divider between services on the same day
      html += '<div class="what">' + fmtTime(svc.time) + ' · ' + esc(svc.worship) + ' · ' + esc(svc.service) + '</div>';
      se.duties.forEach(d => {
        const key = se.id + ':' + d.duty;
        html += '<div class="role"><span class="dot-c" style="background:' + d.cat.color + '"></span>' +
          '<span class="rname">' + esc(d.duty) + '</span>' +
          (feat('songPicker') && d.duty === 'Presider'
            ? songStateTag(se.id) +
              '<button class="linkish" data-act="open-songs" data-svc="' + esc(se.id) + '">' +
              (songStateFor(se.id) && songStateFor(se.id).count ? 'Open songs' : 'Pick songs') + '</button>'
            : '') +
          requestChangeTrigger(d, key) + '</div>' +
          requestChangeForm(d, key);
      });
      if (feat('whoElse')) {
        const wkey = se.id + ':who';
        html += '<div class="who-else"><button class="linkish" data-act="expand" data-id="' + wkey + '">' +
          (ui.expanded[wkey] ? 'Hide the others serving' : 'Who else is serving?') + '</button></div>' +
          (ui.expanded[wkey] ? '<div class="duty-expand">' + renderCatRows(svc, false) + '</div>' : '');
      }
    });
    html += '</div>';
  });
  html += renderYourRequests();
  return html;
}

/* ================= songs view (presider song picker) ================= */

/* The song-selection screen is the old stand-alone song app, ported to an ES
   module (song-app.js) that renders into #song-root. It's loaded lazily on
   first open — most members never preside, so they never pay for it. */
let songApp = null;      // the imported module, once loaded
let songAppLoading = null; // in-flight import promise
let songAssetsLoading = null; // in-flight <link>/<script> loads

/* Inject a <link> or <script> and resolve when the browser has run it. */
function loadTag(el) {
  return new Promise((resolve, reject) => {
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('could not load ' + (el.src || el.href)));
    document.head.appendChild(el);
  });
}

/* song-app.css, song-seed.js and song-lib.js are ~91 KB that only a presider
   ever uses, and song-app.js reads window.SongLib / window.SONG_SEED at module
   top level, so all three must land before the module is imported. Loading
   them here instead of in index.html keeps them off every member's page load. */
function loadSongAssets() {
  if (songAssetsLoading) return songAssetsLoading;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'song-app.css' + ASSET_V;
  const seed = document.createElement('script');
  seed.src = 'song-seed.js' + ASSET_V;
  const lib = document.createElement('script');
  lib.src = 'song-lib.js' + ASSET_V;
  songAssetsLoading = Promise.all([loadTag(css), loadTag(seed), loadTag(lib)])
    .catch(e => { songAssetsLoading = null; throw e; });
  return songAssetsLoading;
}

function loadSongApp() {
  if (songApp) return Promise.resolve(songApp);
  if (!songAppLoading) {
    songAppLoading = loadSongAssets()
      .then(() => import('./song-app.js' + ASSET_V))
      .then(m => { songApp = m; return m; })
      .catch(e => { songAppLoading = null; throw e; });
  }
  return songAppLoading;
}

function songCtx() {
  const nameMap = unifiedNameMap();
  const svc = ui.songSvc ? state.services.find(s => svcId(s) === ui.songSvc) : null;
  // Consume the one-shot navigation flag: only the render triggered by the
  // Presider tab / "Pick songs" tap navigates the planner; background
  // re-mounts (live sync) must not yank the presider off whatever view
  // they're using.
  const nav = ui.songNav;
  ui.songNav = false;
  return {
    fb,
    firebaseGateway,
    authReady,
    me: nameMap[ui.me] || ui.me,
    schedule: state.services,
    nameMap,
    nav,
    ui: {
      requestChange: row => {
        const svcIdValue = row && (row.id || row.serviceId || row.svcId);
        if (!svcIdValue) return;
        ui.memberRequestDraft = { svcId: svcIdValue, duty: (row && row.duty) || 'Presider' };
        ui.tab = 'my';
        ui.songSvc = null;
        ui.songNav = false;
        render();
      }
    },
    // Deep-link hint: the service whose Presider button was tapped (if any).
    service: svc ? { date: svc.date, worship: svc.worship, service: svc.service, time: svc.time } : null,
    onBack: () => { ui.tab = 'my'; ui.songSvc = null; render(); }
  };
}

function renderSongs(view) {
  if (!document.getElementById('song-root')) {
    view.innerHTML =
      '<div class="song-head"><button class="ghost" data-act="close-songs">← My Duties</button></div>' +
      '<div id="song-root"><div class="empty">Loading the song planner…</div></div>';
  }
  loadSongApp().then(m => {
    const root = document.getElementById('song-root');
    if (root && ui.tab === 'songs') m.mount(root, songCtx());
  }).catch(e => {
    console.warn('song-app failed to load:', e);
    const root = document.getElementById('song-root');
    if (root) root.innerHTML = '<div class="empty">The song planner could not load. Check your connection and try again.</div>';
  });
}

/* Pending request (if any) by `name` for this exact svc + duty */
function findPendingRequest(svcIdVal, duty, name) {
  return MEMBER_DOMAIN.findPendingRequest(state.requests, svcIdVal, duty, name);
}

/* Compact "Request change" affordance that sits at the end of the duty's role
   line: a small "Pending" tag if a request is already open, nothing while the
   note form is showing (the form below carries its own Cancel), else a small
   link to open the form. Pairs with requestChangeForm() rendered under the row. */
function requestChangeTrigger(d, key) {
  if (!feat('changeRequests') || !ui.me) return '';
  if (findPendingRequest(svcId(d.svc), d.duty, ui.me)) return '<span class="req-pending-tag">Pending</span>';
  if (ui.reqForm && ui.reqForm.key === key) return '';
  return '<button class="linkish req-change" data-act="req-open" data-key="' + esc(key) + '">Request change</button>';
}

/* The note form for a change request, rendered full-width below the role line
   (only for the duty whose trigger was opened). */
function requestChangeForm(d, key) {
  if (!feat('changeRequests') || !ui.me) return '';
  if (!(ui.reqForm && ui.reqForm.key === key)) return '';
  const id = svcId(d.svc);
  return '<div class="req-form">' +
    '<textarea data-chg="req-note" data-key="' + esc(key) + '" placeholder="Why do you need a change? (optional)">' +
    esc(ui.reqForm.note || '') + '</textarea>' +
    '<div class="req-actions">' +
    '<button class="primary" data-act="req-submit" data-key="' + esc(key) + '" data-svc="' + esc(id) + '" data-duty="' + esc(d.duty) + '">Submit</button>' +
    '<button class="ghost" data-act="req-cancel">Cancel</button>' +
    '</div></div>';
}

function statusChip(status) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return '<span class="status-chip ' + esc(status) + '">' + esc(label) + '</span>';
}

/* "Your requests" card in My Duties — newest first, last ~6, only if any exist for ui.me. */
function renderYourRequests() {
  if (!ui.me) return '';
  const mine = MEMBER_DOMAIN.requestsForMember(state.requests, ui.me);
  if (!mine.length) return '';
  return '<div class="card req-card"><b style="font-size:13.5px">Your requests</b>' +
    mine.slice(0, 6).map(r =>
      '<div class="req-item">' +
      '<div class="req-head"><span class="req-when">' + esc(r.duty) + ' — ' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) + '</span>' +
      statusChip(r.status) + '</div>' +
      (r.note ? '<div class="req-note">' + esc(r.note) + '</div>' : '') +
      '</div>').join('') +
    '</div>';
}

function pendingRequestsCount() {
  return MEMBER_DOMAIN.pendingRequestCount(state.requests);
}

function renderManage() {
  if (!managerAccessAllowed()) return renderManagerSelectionRequired();
  if (feat('editorLock')) {
    const pin = state.settings.pinHash || '';
    if (!pin) return renderCreatePin();
    if (localStorage.getItem('wds-unlock') !== pin) return renderUnlock();
  }
  const pendingCount = pendingRequestsCount();
  const subs = [['services', 'Services'], ['planning', 'Planning'], ['requests', 'Requests' + (pendingCount > 0 ? ' (' + pendingCount + ')' : '')], ['people', 'People'], ['features', 'Features'], ['data', 'Data & Sync']];
  let html = '<div class="subnav">' + subs.map(s =>
    '<button data-act="sub" data-sub="' + s[0] + '"' + (ui.sub === s[0] ? ' class="active"' : '') + '>' + s[1] + '</button>').join('') +
    (feat('editorLock') ? '<button class="lock-btn" data-act="lock-now">Lock</button>' : '') +
    '</div>';
  if (ui.sub === 'services') html += renderManageServices();
  else if (ui.sub === 'planning') html += renderManagePlanning();
  else if (ui.sub === 'requests') html += renderManageRequests();
  else if (ui.sub === 'people') html += renderManagePeople();
  else if (ui.sub === 'features') html += renderFeatures();
  else html += renderManageData();
  return html;
}

function renderSiteLock() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">This schedule is private</div>' +
    '<p class="hint">Enter the 4-digit passcode.</p>' +
    '<form class="add-row" data-act="site-unlock">' +
    '<input type="password" id="site-pin-input" aria-label="Site passcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required>' +
    '<button class="primary" type="submit">Enter</button></form>' +
    (ui.sitePinError ? '<p class="pin-error">' + esc(ui.sitePinError) + '</p>' : '') +
    '</div>';
}

function renderUnlock() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">Editing is locked</div>' +
    '<p class="hint">Enter the editor passcode to manage the schedule. Viewing never needs a passcode.</p>' +
    '<form class="add-row" data-act="unlock">' +
    '<input type="password" id="pin-input" aria-label="Editor passcode" placeholder="Passcode" autocomplete="off" required>' +
    '<button class="primary" type="submit">Unlock</button></form>' +
    (ui.pinError ? '<p class="pin-error">' + esc(ui.pinError) + '</p>' : '') +
    '</div>';
}

function renderCreatePin() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">Create the editor passcode</div>' +
    '<p class="hint">No passcode exists yet. Whoever sets it first becomes the editor — afterwards it is required to open Manage on any device.</p>' +
    '<form class="add-row" data-act="set-pin">' +
    '<input type="password" id="pin-new" aria-label="New editor passcode" placeholder="New passcode" autocomplete="off" required>' +
    '<input type="password" id="pin-confirm" aria-label="Repeat new editor passcode" placeholder="Repeat it" autocomplete="off" required>' +
    '<button class="primary" type="submit">Set passcode</button></form>' +
    (ui.pinError ? '<p class="pin-error">' + esc(ui.pinError) + '</p>' : '') +
    '</div>';
}

let secondaryPanelRenderers = null;

function coordinatorSecondaryRenderers() {
  if (secondaryPanelRenderers) return secondaryPanelRenderers;
  const module = screenModuleFor('coordinatorSecondary');
  if (!module) return null;
  try {
    secondaryPanelRenderers = module.create(screenDeps());
    return secondaryPanelRenderers;
  } catch (e) {
    console.warn('WorshipApp coordinator secondary panels failed to initialize:', e);
    return null;
  }
}

function secondaryPanelCall(name) {
  const renderers = coordinatorSecondaryRenderers();
  if (!renderers || typeof renderers[name] !== 'function') return '';
  const args = Array.prototype.slice.call(arguments, 1);
  return renderers[name].apply(renderers, args);
}

function renderFeatures() { return secondaryPanelCall('renderFeatures'); }
function renderManagePlanning() { return secondaryPanelCall('renderManagePlanning'); }
function renderManageConflicts(svc, expanded) { return secondaryPanelCall('renderManageConflicts', svc, expanded); }
function renderManageRequests() { return secondaryPanelCall('renderManageRequests'); }
function renderManageServices() { return secondaryPanelCall('renderManageServices'); }
function renderManagePeople() { return secondaryPanelCall('renderManagePeople'); }
function renderSheetCard() { return secondaryPanelCall('renderSheetCard'); }
function renderManageData() { return secondaryPanelCall('renderManageData'); }

/* ================= actions ================= */

/* Applies NAME_UNIFY_MAP (or a compatible map) to state.members, every
   service's assignments/conflictOk, and every department roster (rosters are
   keyed by member name too, and are what duty dropdowns actually read from —
   see memberSelect — so they must stay in sync or old spellings keep showing
   up there even after members/services are unified).
   Pure w.r.t. persistence — caller persists whatever comes back touched.
   Returns { membersChanged, membersMerged, touchedServices, departmentsChanged }. */
function applyNameMap(map) {
  const result = DOMAIN.applyNameMap(state, map);
  replaceState(result.state);
  return result;
}
/* Upcoming setlists, read only so My Duties can tell a presider whether the
   songs for their service are picked and confirmed. The song picker
   (song-app.js) still owns every write to this collection. Kept out of `state`
   because `state` is what gets persisted as this device's offline copy. */
let setlistIndex = {};

/* { count, confirmed, changed } for a service id, or null when nothing is
   known. `confirmedAt` is written equal to `updatedAt`, so a later edit pushes
   updatedAt ahead and the list reads as changed since it was confirmed. */
function songStateFor(id) {
  return MEMBER_DOMAIN.setlistSummary(setlistIndex, id);
}

/* The small "where are the songs up to?" tag beside a Presider duty. */
function songStateTag(id) {
  const st = songStateFor(id);
  if (!st || !st.count) return '';
  if (st.confirmed) return '<span class="song-tag done">Songs confirmed</span>';
  const n = st.count + ' song' + (st.count === 1 ? '' : 's');
  return '<span class="song-tag">' + (st.changed ? n + ', confirm again' : n + ', not confirmed') + '</span>';
}

function findService(id) { return state.services.find(s => svcId(s) === id); }

function handleAct(act, el) {
  if (act === 'home') {
    ui.tab = 'schedule';
    ui.songSvc = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  else if (act === 'tab') {
    ui.tab = el.dataset.tab;
    if (ui.tab === 'my') localStorage.setItem('wds-unread-' + ui.me, '0');
    // The Presider tab always opens the song planner on its Home view,
    // never a setlist left over from an earlier "Pick songs" deep link.
    if (ui.tab === 'songs') { ui.songSvc = null; ui.songNav = true; }
    render();
  }
  else if (act === 'sub') { ui.sub = el.dataset.sub; render(); }
  else if (act === 'open-songs') { ui.songSvc = el.dataset.svc || null; ui.songNav = true; ui.tab = 'songs'; render(); }
  else if (act === 'close-songs') { ui.tab = 'my'; ui.songSvc = null; render(); }
  else if (act === 'dept-filter') { ui.deptFilter = el.dataset.val; localStorage.setItem('wds-dept', ui.deptFilter); render(); }
  else if (act === 'dismiss-banner') { ui.banners.splice(Number(el.dataset.i), 1); renderBanners(); }
  else if (act === 'toggle-past') { ui.showPast = !ui.showPast; render(); }
  else if (act === 'clear-alerts') {
    // Clears only this member's "Recent updates" list on this device. Duties,
    // the schedule and change requests are untouched.
    localStorage.removeItem('wds-alerts-' + ui.me);
    localStorage.setItem('wds-unread-' + ui.me, '0');
    render();
  }
  else if (act === 'expand') { ui.expanded[el.dataset.id] = !ui.expanded[el.dataset.id]; render(); }
  else if (act === 'notify-on') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        localStorage.setItem('wds-notify', '1');
        sysNotify('Notifications are on', 'You\'ll hear about new duties and get reminders here.');
        registerPush();
      } else {
        alert('Notifications were blocked. You can allow them in your browser settings.');
      }
      render();
    });
  }
  else if (act === 'notify-off') { localStorage.setItem('wds-notify', '0'); unregisterPush(); render(); }
  else if (act === 'site-unlock') {
    sha256(document.getElementById('site-pin-input').value).then(h => {
      if (h === siteHash()) {
        localStorage.setItem('wds-site-unlock', h);
        ui.sitePinError = '';
      } else {
        ui.sitePinError = 'That passcode is not right.';
      }
      render();
    });
  }
  else if (act === 'change-site-pin') {
    const v = document.getElementById('site-pin-change').value;
    if (!/^\d{4}$/.test(v)) { alert('Use exactly 4 digits.'); return; }
    sha256(v).then(h => {
      state.settings.sitePinHash = h;
      localStorage.setItem('wds-site-unlock', h);
      persistSettings();
      render();
      alert('Site passcode changed. Everyone else will need the new one the next time they open the app.');
    });
  }
  else if (act === 'unlock') {
    sha256(document.getElementById('pin-input').value).then(h => {
      if (h === state.settings.pinHash) {
        localStorage.setItem('wds-unlock', h);
        ui.pinError = '';
      } else {
        ui.pinError = 'That passcode is not right.';
      }
      render();
    });
  }
  else if (act === 'set-pin') {
    const a = document.getElementById('pin-new').value;
    const b = document.getElementById('pin-confirm').value;
    if (a.length < 4) { ui.pinError = 'Use at least 4 characters.'; render(); return; }
    if (a !== b) { ui.pinError = 'The two entries don\'t match.'; render(); return; }
    sha256(a).then(h => {
      state.settings.pinHash = h;
      localStorage.setItem('wds-unlock', h);
      ui.pinError = '';
      persistSettings();
      render();
    });
  }
  else if (act === 'change-pin') {
    const v = document.getElementById('pin-change').value;
    if (v.length < 4) { alert('Use at least 4 characters.'); return; }
    sha256(v).then(h => {
      state.settings.pinHash = h;
      localStorage.setItem('wds-unlock', h);
      persistSettings();
      render();
      alert('Passcode changed. Other editors will need the new one.');
    });
  }
  else if (act === 'lock-now') {
    localStorage.removeItem('wds-unlock');
    render();
  }
  else if (act === 'subscribe-ics') { subscribeICS(); }
  else if (act === 'copy-ics') { copyICSLink(); }
  else if (act === 'add-service') {
    const svc = {
      date: document.getElementById('svc-date').value,
      time: document.getElementById('svc-time').value,
      service: document.getElementById('svc-label').value,
      worship: document.getElementById('svc-worship').value.trim() || 'Sabbath Day',
      choirSong: '',
      assignments: {}
    };
    if (!svc.date || !svc.time) return;
    if (findService(svcId(svc))) { alert('That service already exists on that date.'); return; }
    state.services.push(svc);
    ui.expanded['m:' + svcId(svc)] = true;
    persistService(svc);
    afterDataChange();
  }
  else if (act === 'del-service') {
    const svc = findService(el.dataset.svc);
    if (svc && confirm('Delete "' + svc.worship + ' ' + svc.service + '" on ' + fmtDate(svc.date) + '?')) {
      state.services = state.services.filter(s => s !== svc);
      persistDeleteService(el.dataset.svc);
      afterDataChange();
    }
  }
  else if (act === 'add-member') {
    const name = document.getElementById('member-name').value.trim();
    if (!name) return;
    if (state.members.indexOf(name) !== -1) { alert(name + ' is already on the list.'); return; }
    state.members.push(name);
    state.members.sort();
    persistMembers();
    render();
  }
  else if (act === 'del-member') {
    const name = el.dataset.name;
    const n = dutiesFor(name).length;
    if (confirm('Remove ' + name + '?' + (n ? ' They will be taken off ' + n + ' upcoming duties.' : ''))) {
      state.members = state.members.filter(m => m !== name);
      const touched = [];
      state.services.forEach(svc => {
        Object.keys(svc.assignments || {}).forEach(duty => {
          if (svc.assignments[duty] === name) { delete svc.assignments[duty]; touched.push(svc); }
        });
      });
      let deptsChanged = false;
      Object.keys(state.departments || {}).forEach(cat => {
        const roster = state.departments[cat];
        const idx = roster.indexOf(name);
        if (idx !== -1) { roster.splice(idx, 1); deptsChanged = true; }
      });
      persistMembers();
      touched.forEach(persistService);
      if (deptsChanged) persistDepartments();
      if (ui.me === name) { ui.me = ''; localStorage.removeItem('wds-me'); }
      afterDataChange();
    }
  }
  else if (act === 'conflict-ok') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    const c = conflictsFor(svc).find(x => x.name === el.dataset.name);
    if (!c) return;
    if (!svc.conflictOk) svc.conflictOk = {};
    // prune stale entries that no longer match a current conflict, keep documents tidy
    const current = conflictsFor(svc);
    Object.keys(svc.conflictOk).forEach(name => {
      const match = current.find(x => x.name === name);
      if (!match || !sameDuties(svc.conflictOk[name], match.duties)) delete svc.conflictOk[name];
    });
    svc.conflictOk[el.dataset.name] = c.duties;
    persistService(svc);
    afterDataChange();
  }
  else if (act === 'conflict-unok') {
    const svc = findService(el.dataset.svc);
    if (!svc || !svc.conflictOk) return;
    delete svc.conflictOk[el.dataset.name];
    persistService(svc);
    afterDataChange();
  }
  else if (act === 'plan-assign') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    if (!svc.assignments) svc.assignments = {};
    const name = el.dataset.name, duty = el.dataset.duty;
    // Guard against a fast double-tap creating a fresh double-booking: refuse
    // if this person already holds another duty in the same service.
    if (Object.keys(svc.assignments).some(d => d !== duty && svc.assignments[d] === name)) {
      alert(name + ' is already serving in this service — pick a different person.');
      return;
    }
    svc.assignments[duty] = name;
    persistService(svc);
    afterDataChange();
  }
  else if (act === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'worship-schedule-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  else if (act === 'sheet-sync') { syncFromSheet(true); }
  else if (act === 'reset') {
    if (confirm('Replace ALL current data with the original spreadsheet schedule?')) {
      replaceState(seedState());
      persistAll();
      afterDataChange();
    }
  }
  else if (act === 'unify-names') {
    if (!confirm('Merge leftover name variants across members and all services?')) return;
    const { membersChanged, membersMerged, touchedServices, departmentsChanged } = applyNameMap(unifiedNameMap());
    if (membersChanged) persistMembers();
    touchedServices.forEach(persistService);
    if (departmentsChanged) persistDepartments();
    const canon = unifiedNameMap()[ui.me];
    if (canon) {
      ['wds-alerts-', 'wds-seen-', 'wds-unread-'].forEach(prefix => {
        const oldKey = prefix + ui.me, newKey = prefix + canon;
        if (prefix === 'wds-unread-') {
          const merged = Math.max(Number(localStorage.getItem(oldKey) || 0), Number(localStorage.getItem(newKey) || 0));
          localStorage.setItem(newKey, String(merged));
        } else {
          const oldVal = getJSON(oldKey, []), newVal = getJSON(newKey, []);
          localStorage.setItem(newKey, JSON.stringify(newVal.concat(oldVal)));
        }
        localStorage.removeItem(oldKey);
      });
      ui.me = canon;
      localStorage.setItem('wds-me', canon);
      registerPush();
    }
    alert('Unified names: ' + membersMerged + ' member' + (membersMerged === 1 ? '' : 's') + ' merged, ' +
      touchedServices.length + ' service' + (touchedServices.length === 1 ? '' : 's') + ' updated.');
    afterDataChange();
  }
  else if (act === 'req-open') {
    ui.reqForm = { key: el.dataset.key, note: '' };
    render();
  }
  else if (act === 'req-cancel') {
    ui.reqForm = null;
    render();
  }
  else if (act === 'req-submit') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    const createdAt = Date.now();
    const req = {
      id: requestId(el.dataset.svc, el.dataset.duty, createdAt),
      name: ui.me,
      svcId: el.dataset.svc,
      date: svc.date,
      service: svc.service,
      worship: svc.worship,
      duty: el.dataset.duty,
      note: (ui.reqForm && ui.reqForm.note) || '',
      status: 'pending',
      createdAt
    };
    state.requests.push(req);
    ui.reqForm = null;
    persistRequest(req);
    afterDataChange();
  }
  else if (act === 'req-approve') {
    resolveRequest(el.dataset.id, 'approved');
    afterDataChange();
  }
  else if (act === 'req-decline') {
    resolveRequest(el.dataset.id, 'declined');
    afterDataChange();
  }
  else if (act === 'req-open-service') {
    ui.sub = 'services';
    ui.expanded['m:' + el.dataset.svc] = true;
    render();
  }
}

function handleChg(chg, el) {
  if (chg === 'theme') {
    const theme = ['blue', 'sage', 'sand'].indexOf(el.value) !== -1 ? el.value : 'blue';
    ui.theme = theme;
    localStorage.setItem('wds-theme', theme);
    applyTheme();
    render();
  }
  else if (chg === 'me') {
    ui.me = el.value;
    localStorage.setItem('wds-me', ui.me);
    ui.rebaseline = true;
    render();
    checkNewDuties();
    checkReminders();
    if (notifyOn()) registerPush();
  }
  else if (chg === 'assign') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    if (!svc.assignments) svc.assignments = {};
    if (el.value) svc.assignments[el.dataset.duty] = el.value;
    else delete svc.assignments[el.dataset.duty];
    persistService(svc);
    afterDataChange();
  }
  else if (chg === 'svc-field') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    const oldId = svcId(svc);
    if (el.dataset.field === 'choirSong') svc.choirSong = el.value;
    else if (el.value) svc[el.dataset.field] = el.value;
    const newId = svcId(svc);
    if (newId !== oldId) { persistDeleteService(oldId); ui.expanded['m:' + newId] = true; }
    persistService(svc);
    afterDataChange();
  }
  else if (chg === 'member-name') {
    const oldName = el.dataset.old, newName = el.value.trim();
    if (!newName || newName === oldName) return;
    if (state.members.indexOf(newName) !== -1) { alert(newName + ' already exists.'); return; }
    state.members = state.members.map(m => (m === oldName ? newName : m)).sort();
    const touched = [];
    state.services.forEach(svc => {
      Object.keys(svc.assignments || {}).forEach(duty => {
        if (svc.assignments[duty] === oldName) { svc.assignments[duty] = newName; touched.push(svc); }
      });
    });
    let deptsChanged = false;
    Object.keys(state.departments || {}).forEach(cat => {
      const roster = state.departments[cat];
      const idx = roster.indexOf(oldName);
      if (idx === -1) return;
      roster.splice(idx, 1);
      if (roster.indexOf(newName) === -1) roster.push(newName);
      roster.sort();
      deptsChanged = true;
    });
    if (ui.me === oldName) { ui.me = newName; localStorage.setItem('wds-me', newName); }
    persistMembers();
    touched.forEach(persistService);
    if (deptsChanged) persistDepartments();
    afterDataChange();
  }
  else if (chg === 'member-cat') {
    const name = el.dataset.name, cat = el.dataset.cat;
    if (!state.departments) state.departments = {};
    const roster = state.departments[cat] || (state.departments[cat] = []);
    const idx = roster.indexOf(name);
    if (el.checked) { if (idx === -1) roster.push(name); }
    else if (idx !== -1) roster.splice(idx, 1);
    roster.sort();
    persistDepartments();
    render();
  }
  else if (chg === 'feature') {
    if (!state.settings.features) state.settings.features = {};
    state.settings.features[el.dataset.id] = el.checked;
    persistSettings();
    render();
  }
  else if (chg === 'req-note') {
    if (ui.reqForm && ui.reqForm.key === el.dataset.key) ui.reqForm.note = el.value;
    // no render(): keeps focus in the textarea while typing; snapshot re-renders
    // elsewhere already restore this value from ui.reqForm.
  }
  else if (chg === 'scheduler-name') {
    state.settings.schedulerName = el.value;
    persistSettings();
    render();
  }
  else if (chg === 'sheet-url') {
    state.settings.sheetUrl = el.value.trim();
    persistSettings();
    render();
  }
  else if (chg === 'import-file') {
    const file = el.files && el.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj && Array.isArray(obj.members) && Array.isArray(obj.services)) {
          // Backfill sections an older/partial backup may omit, so persistAll()
          // never writes { map: undefined } etc. into Firestore (mirrors loadLocal).
          if (!obj.settings) obj.settings = { features: {}, pinHash: '' };
          if (!obj.departments) obj.departments = {};
          if (!Array.isArray(obj.requests)) obj.requests = [];
          replaceState(obj);
          persistAll();
          afterDataChange();
          alert('Schedule imported.');
        } else alert('That file does not look like a schedule backup.');
      } catch (e) { alert('Could not read that file.'); }
    };
    reader.readAsText(file);
  }
}

function dispatchToActiveScreen(kind, token, el, event) {
  const screenName = screenNameForTab(ui.tab);
  const instance = screenInstanceFor(screenName);
  if (!instance) return false;
  try {
    const handled = instance.handle(kind, token, el, event);
    if (handled && typeof handled.then === 'function') {
      // Screen contracts may return a promise for a write. The event has to be
      // claimed synchronously so the legacy handler cannot race the write.
      event.preventDefault();
      event.stopPropagation();
      handled.catch(error => console.warn('WorshipApp ' + screenName + ' screen action failed:', error));
      return true;
    }
    if (handled === true) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  } catch (error) {
    console.warn('WorshipApp ' + screenName + ' screen action failed:', error);
  }
  return false;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM') return;
  if (e.target.closest('[data-chg]')) return;
  if (dispatchToActiveScreen('act', el.dataset.act, el, e)) return;
  handleAct(el.dataset.act, el);
});
document.addEventListener('submit', e => {
  if (!e.target.dataset.act) return;
  e.preventDefault();
  if (dispatchToActiveScreen('submit', e.target.dataset.act, e.target, e)) return;
  handleAct(e.target.dataset.act, e.target);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (!el) return;
  if (dispatchToActiveScreen('chg', el.dataset.chg, el, e)) return;
  handleChg(el.dataset.chg, el);
});
/* Live-capture the change-request note as the member types, so a Firestore
   snapshot re-render mid-typing (see afterDataChange) can't lose the draft —
   'change' alone only fires on blur. */
document.addEventListener('input', e => {
  const el = e.target.closest('[data-chg]');
  if (!el) return;
  if (dispatchToActiveScreen('input', el.dataset.chg, el, e)) return;
  if (el.dataset.chg === 'req-note') handleChg('req-note', el);
});

/* ================= startup ================= */

function setSyncPill(live) {
  const pill = document.getElementById('sync-pill');
  pill.textContent = live ? 'Live sync on' : 'This device only';
  pill.classList.toggle('live', !!live);
}

/* ---- Pulse: the smallest honest answer to "does anyone open this?" ----
   Writes ONE document per day, `pulse/{YYYY-MM-DD}`, holding plain counters.

   It stores no device id, no name, no free text — nothing that identifies a
   person. Each device counts itself at most once per event per day, using a
   localStorage note that never leaves the phone, so the number means
   "devices that did this today", not "taps".

   Why this exists: as of July 2026 not one of the church apps had any
   measurement at all, so "is the worship schedule read by fifty people or by
   nobody?" was unanswerable — a busy app and a dead one looked identical. */
const pulseInFlight = new Set(); // stops a double-count before the write resolves

function pulse(event) {
  if (!firebaseGateway || !fb || !fb.increment) return;
  try {
    const day = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
    const key = 'wd-pulse-' + day;
    const seen = (localStorage.getItem(key) || '').split(',').filter(Boolean);
    if (seen.includes(event) || pulseInFlight.has(event)) return; // counted already
    pulseInFlight.add(event);

    firebaseGateway.writeDocument(
      'pulse',
      day,
      { date: day, [event]: fb.increment(1) },
      { merge: true }
    ).then(() => {
      // Only remember it once the write actually landed. Marking it earlier
      // meant a rejected write (offline, rules not yet deployed, quota) made
      // this device stop counting for the rest of the day, silently.
      const now = (localStorage.getItem(key) || '').split(',').filter(Boolean);
      if (!now.includes(event)) {
        now.push(event);
        localStorage.setItem(key, now.join(','));
      }
      for (let i = localStorage.length - 1; i >= 0; i--) { // keep only today's note
        const k = localStorage.key(i);
        if (k && k.startsWith('wd-pulse-') && k !== key) localStorage.removeItem(k);
      }
    }).catch(() => {
      pulseInFlight.delete(event);                  // let a later attempt retry
    });
  } catch (e) { /* private mode, quota, clock — all non-fatal */ }
}

function handleSubscriptionEvent(event) {
  if (!event) return;
  if (event.type === 'schedule-preview') {
    state.services = event.services;
    setSyncPill(true);
    renderSoon();
    return;
  }
  if (event.type === 'schedule-initial-empty') {
    replaceState(loadLocal() || seedState());
    persistAll();
    setSyncPill(true);
    afterDataChange();
    scheduleSyncSoon();
    return;
  }
  if (event.type === 'schedule-authoritative') {
    state.services = event.services;
    fb.knownIds = event.knownIds;
    setSyncPill(true);
    afterDataChange();
    scheduleSyncSoon();
    return;
  }
  if (event.type === 'schedule-error') {
    const error = event.error || {};
    addBanner('Could not connect to the shared database (' + error.code + '). Showing this device\'s copy.', true);
    if (!state.services.length) { replaceState(loadLocal() || seedState()); render(); }
    setSyncPill(false);
    return;
  }
  if (event.type === 'members') {
    if (event.exists) state.members = event.list || [];
    setStateReady('members', true);
    renderSoon();
    return;
  }
  if (event.type === 'settings') {
    if (event.exists) {
      state.settings = Object.assign({ features: {}, pinHash: '' }, event.value || {});
      renderSoon();
    }
    return;
  }
  if (event.type === 'departments') {
    const map = event.exists ? (event.map || {}) : null;
    if (!map || !Object.keys(map).length) {
      state.departments = JSON.parse(JSON.stringify(DEPARTMENTS_SEED));
      persistDepartments();
    } else {
      state.departments = map;
    }
    setStateReady('departments', true);
    renderSoon();
    return;
  }
  if (event.type === 'name-map') {
    const map = event.exists ? (event.map || {}) : null;
    if (!map || !Object.keys(map).length) {
      sharedNameMap = NAME_UNIFY_MAP;
      persistNameMap(NAME_UNIFY_MAP);
    } else {
      sharedNameMap = map;
    }
    const mapped = flattenMappedName(ui.me, unifiedNameMap());
    if (mapped !== ui.me) {
      ui.me = mapped;
      localStorage.setItem('wds-me', mapped);
    }
    renderSoon();
    return;
  }
  if (event.type === 'requests') {
    state.requests = event.items;
    renderSoon();
    return;
  }
  if (event.type === 'setlists') {
    setlistIndex = event.byId;
    renderSoon();
  }
}

async function initFirebase(config) {
  // Fetched together, not one after the other: these are two separate
  // downloads from Google's CDN and the second does not depend on the first.
  const [appMod, fsMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
  ]);
  const app = appMod.initializeApp(config);

  // App Check — attests requests come from the real app. Activates only once a
  // reCAPTCHA v3 site key is configured (window.RECAPTCHA_SITE_KEY); until then
  // it's a no-op so the app keeps working during rollout. Must run right after
  // initializeApp, before any other Firebase service makes a request. NOTE: do
  // NOT turn on Firestore App Check *enforcement* in the console until the song
  // app (shared project) also ships this — enforcement is project-wide.
  if (window.RECAPTCHA_SITE_KEY) {
    try {
      const acMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js');
      acMod.initializeAppCheck(app, {
        provider: new acMod.ReCaptchaV3Provider(window.RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) { console.warn('App Check init failed:', e); }
  }

  // Anonymous auth — an invisible sign-in so the Firestore write rules can
  // require an authenticated context without adding any login UI for members.
  // Reads stay open, so this deliberately runs alongside the rest of startup
  // instead of in front of it: nothing a member sees depends on it. Writes wait
  // for it via fbWrite(). If it fails (e.g. Anonymous auth switched off in the
  // console) the app still shows data; only writes would be rejected.
  authReady = (async () => {
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await authMod.signInAnonymously(authMod.getAuth(app));
  })().catch(e => { console.warn('Anonymous sign-in failed:', e); });

  const db = fsMod.getFirestore(app);
  if (typeof fsMod.enableMultiTabIndexedDbPersistence === 'function') {
    try { await fsMod.enableMultiTabIndexedDbPersistence(db); } catch (e) { /* unsupported or already enabled */ }
  }
  fb = {
    db,
    doc: fsMod.doc,
    setDoc: fsMod.setDoc,
    deleteDoc: fsMod.deleteDoc,
    writeBatch: fsMod.writeBatch,
    // Extras for the song module (song-app.js) — it shares this app's single
    // Firebase instance and anonymous auth instead of initializing its own.
    collection: fsMod.collection,
    onSnapshot: fsMod.onSnapshot,
    getDoc: fsMod.getDoc,
    getDocs: fsMod.getDocs,
    updateDoc: fsMod.updateDoc,
    runTransaction: fsMod.runTransaction,
    arrayUnion: fsMod.arrayUnion,
    arrayRemove: fsMod.arrayRemove,
    increment: fsMod.increment,
    knownIds: []
  };
  firebaseGateway = FIREBASE_SERVICE.createAdapter({
    firebase: fb,
    getAuthReady: () => authReady
  });
  pulse('opens');
  // Cloud Messaging — best-effort; unsupported browsers just leave messaging null.
  try {
    const msgMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
    if (await msgMod.isSupported()) {
      fb.messaging = msgMod.getMessaging(app);
      fb.getToken = msgMod.getToken;
      fb.deleteToken = msgMod.deleteToken;
    }
  } catch (e) { console.warn('FCM unavailable:', e); }
  subscriptionManager = SUBSCRIPTIONS_SERVICE.createManager({
    firebase: fsMod,
    db,
    recentSince: isoDaysAgo(30),
    setlistsSince: todayISO(),
    emit: handleSubscriptionEvent
  });
  subscriptionManager.start();
  if (notifyOn()) registerPush();
}

function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (window.FIREBASE_CONFIG) {
    // Paint the schedule this device saw last, right now, instead of a
    // "Loading…" placeholder. The live snapshot overwrites it moments later.
    // member and department readiness flags stay false on purpose: they gate the
    // sheet sync, which must not run against a cached roster.
    const cached = loadLocal();
    if (cached && cached.services && cached.services.length) {
      replaceState(cached);
      render();
    } else {
      renderLoading();
    }
    initFirebase(window.FIREBASE_CONFIG).catch(() => {
      addBanner('Firebase config is invalid — running on this device only.', true);
      replaceState(loadLocal() || seedState());
      setStateReady('departments', true);
      setStateReady('members', true);
      setSyncPill(false);
      afterDataChange();
    });
  } else {
    replaceState(loadLocal() || seedState());
    setStateReady('departments', true);
    setStateReady('members', true);
    saveLocal();
    setSyncPill(false);
    afterDataChange();
    autoSyncOnce();
  }
  setInterval(checkReminders, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
}

init();
