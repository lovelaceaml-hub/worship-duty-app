/* Everything the app knows, in one place. Modules read and change these
   objects directly; a change on screen is followed by render() or
   renderSoon() from render.js.

   data     shared records loaded from Firestore
   session  who is signed in
   ui       what this device is showing
   loaded   which shared records have arrived */
import { featureOn } from './config/features.js';
import { canonicalName, displayName } from './lib/names.js';

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
  status: 'loading',    // 'loading', 'signedOut', 'forced' (must change PIN), 'verified'
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
  // Schedule: the chosen month, day and service, the view, the search, and
  // how many services the list shows before "Show more services".
  schedule: { month: '', date: '', service: '', mode: 'day', query: '', chosen: false, size: 12 },
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
   answers, and shown when the device is offline. */
const CACHE_KEY = 'wds-cache-v1';
export function saveCache() {
  writeJSON(CACHE_KEY, { services: data.services, members: data.members, nameMap: data.nameMap, settings: {
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

/* Apply the current name map to every stored name so duties, rosters and
   requests all use one spelling. */
export function canonicalizeNames() {
  data.members = Array.from(new Set(data.members.map(canonical).filter(Boolean)));
  data.services.forEach(service => {
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
  });
  Object.keys(data.rosters).forEach(department => {
    data.rosters[department] = Array.from(new Set((data.rosters[department] || []).map(canonical).filter(Boolean))).sort();
  });
  data.requests.forEach(request => { request.name = canonical(request.name); });
  if (data.settings.schedulerName) data.settings.schedulerName = canonical(data.settings.schedulerName);
}
