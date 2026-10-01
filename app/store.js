/* Everything the app knows, in one place. Modules read and change these
   objects directly; a change on screen is followed by render() or
   renderSoon() from render.js.

   data     shared records loaded from Firestore
   session  who is signed in
   ui       what this device is showing
   loaded   which shared records have arrived */
import { featureOn } from './config/features.js';
import { canonicalName, displayName } from './lib/names.js';
import { addDays, todayISO } from './lib/dates.js';

export const data = {
  members: [],          // app/members.list, every member name
  services: [],         // schedule/*
  settings: {},         // app/settings (features, sitePinHash, schedulerName, sheetUrl)
  rosters: {},          // app/departments.map, department name -> member names
  leaderConfig: null,   // app/leaderConfig, who leads what (see permissions.js)
  nameMap: {},          // app/nameMap.map, old spelling -> current spelling
  requests: [],         // requests/* this member may see
  setlists: {}          // setlists/* from today on, for the song status on My Duties
};

export const session = {
  status: 'loading',    // 'loading', 'offline' (Firebase out of reach), 'signedOut', 'forced' (must change PIN), 'verified'
  user: null,           // Firebase user
  member: null          // verified claims: memberId, memberName, roles, departments
};

export const loaded = { schedule: false, members: false, settings: false, rosters: false };

export const ui = {
  tab: 'schedule',      // schedule, my, songs, manage
  account: '',          // '', 'availability', 'settings' (views inside My Duties)
  manage: 'departments',// Manage section
  manageDepartment: '', // department picked in Manage ('All' for administrators)
  departmentView: null, // { department, uid } while a member's profile is open
  me: '',               // signed-in member name
  banners: [],          // [{ text, alert }]
  expanded: {},         // open cards and lists, by key
  showPast: false,
  departmentFilter: 'All',
  schedule: { month: '', date: '', service: '', mode: 'day', query: '', chosen: false },
  // Manage, Services: the month shown, the service whose details are open,
  // Fill's proposals ('serviceId|duty' -> { memberUid, memberName }) and the
  // duties it could not fill ('serviceId|duty' -> reason, see lib/fill.js).
  plan: { month: '', open: '', proposals: {}, unfilled: {}, busy: false, scroll: false, adding: false, fillMode: '' },
  requestDraft: null,   // { key, note } while a member writes a change request
  availabilityDraft: null, // the member's availability while they edit it
  availabilityChanged: false,
  songService: null,    // service id the Presider planner should open
  songNav: false,       // one render after an explicit move into the planner
  signIn: { member: '', busy: false, error: '' },
  sitePinError: ''
};

/* What one member left on the screen: drafts, open cards, Manage's place
   and proposals, banners, the song planner's place. It is cleared when the
   member signs out or a different member signs in, so nothing carries over
   on a shared device. Modules with their own member state register a reset
   with onMemberChange(). The department filter is the device's choice and
   stays. */
const DEVICE_KEYS = ['departmentFilter'];
const fresh = structuredClone(ui);
const resets = [];

export function onMemberChange(reset) { resets.push(reset); }

export function forgetMemberState() {
  Object.keys(fresh).forEach(key => { if (!DEVICE_KEYS.includes(key)) ui[key] = structuredClone(fresh[key]); });
  resets.forEach(reset => {
    try { reset(); } catch (error) { console.warn('A reset failed:', error); }
  });
}

export const feature = id => featureOn(data.settings, id);
export const canonical = name => canonicalName(name, data.nameMap);
export const nameOf = name => displayName(name, data.members);

/* ---- device storage ---- */

export function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}
export function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_error) { /* storage full or blocked */ }
}
export function readText(key, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch (_error) { return fallback; }
}
export function writeText(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch (_error) { /* storage blocked */ }
}

/* The last schedule this device saw, painted at start-up before Firestore
   answers, and shown when the device is offline. It keeps the services
   from two months back on (the Schedule and My Duties need no older ones),
   and is written at most every few seconds, since every live update calls
   saveCache(), and at once with { now: true } (the page is closing). */
const CACHE_KEY = 'wds-cache-v1';
const CACHE_DAYS = 62;
let saving = null;
export function saveCache({ now = false } = {}) {
  if (now) {
    if (!saving) return;
    clearTimeout(saving);
  } else if (saving) return;
  else {
    saving = setTimeout(() => saveCache({ now: true }), 2000);
    return;
  }
  saving = null;
  const from = addDays(todayISO(), -CACHE_DAYS);
  writeJSON(CACHE_KEY, { services: data.services.filter(service => !(service.date < from)), members: data.members, nameMap: data.nameMap, settings: {
    features: data.settings.features || {}, sitePinHash: data.settings.sitePinHash || ''
  } });
}
export function loadCache() {
  const cached = readJSON(CACHE_KEY, null);
  if (!cached || !Array.isArray(cached.services)) return false;
  data.services = cached.services;
  data.members = Array.isArray(cached.members) ? cached.members : [];
  data.nameMap = cached.nameMap || {};
  data.settings = cached.settings || {};
  return true;
}

/* One service's names in the current spelling. Returns the service. */
export function canonicalizeService(service) {
  const assignments = service.assignments || {};
  Object.keys(assignments).forEach(duty => { assignments[duty] = canonical(assignments[duty]); });
  if (service.conflictOk) {
    const merged = {};
    Object.entries(service.conflictOk).forEach(([name, duties]) => {
      const key = canonical(name);
      merged[key] = (merged[key] || []).concat(duties || []);
    });
    service.conflictOk = merged;
  }
  return service;
}

export function canonicalizeRosters() {
  Object.keys(data.rosters).forEach(department => {
    data.rosters[department] = Array.from(new Set((data.rosters[department] || []).map(canonical).filter(Boolean))).sort();
  });
}

/* Apply the current name map to every stored name so duties, rosters and
   requests all use one spelling. */
export function canonicalizeNames() {
  data.members = Array.from(new Set(data.members.map(canonical).filter(Boolean)));
  data.services.forEach(canonicalizeService);
  canonicalizeRosters();
  data.requests.forEach(request => { request.name = canonical(request.name); });
  if (data.settings.schedulerName) data.settings.schedulerName = canonical(data.settings.schedulerName);
}
