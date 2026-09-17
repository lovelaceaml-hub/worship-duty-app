'use strict';

import { startShell } from './shared/shell.js';
import { createSave } from './shared/save-state.js';

/* ================= constants ================= */

const CATEGORIES = [
  { name: 'Worship',        color: '#4338ca', duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
  { name: 'Usher Sisters',  color: '#be185d', duties: ['Usher Door', 'Usher Front', 'Usher Back'] },
  { name: 'Usher Brothers', color: '#0369a1', duties: ['Usher #1', 'Usher #2', 'Lobby Security'] },
  { name: 'Lobby',          color: '#b45309', duties: ['Lobby Desk #1', 'Lobby Desk #2'] },
  { name: 'Translation',    color: '#047857', duties: ['Translation #1', 'Translation #2'] },
  { name: 'Media',          color: '#6d28d9', duties: ['Media Booth #1', 'Media Booth #2'] },
  { name: 'Parking Lot',    color: '#3f6212', duties: ['Parking #1', 'Parking #2', 'Parking #3', 'Parking #4', 'Parking #5'] },
  { name: 'Offering',       color: '#a21caf', duties: ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'] }
];
const SERVICE_LABELS = ['Morning', 'Afternoon', 'Evening', 'Early Morning', 'Commemoration'];
const WORSHIP_TYPES = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Ascension Day', 'Pentecost', 'Heavenly Parent\'s Day'];

/* Seed data for state.departments (categoryName -> member names), used only
   the first time app/departments is missing/empty in Firestore (or local mode). */
const DEPARTMENTS_SEED = {
  'Worship': ['B. Anthony', 'B. Brent', 'B. Davidson', 'B. Giomar', 'B. James', 'B. Jason', 'B. Jordan', 'D. Aaron', 'D. Caleb', 'M. Chloe', 'D. Chris', 'D. Danielle', 'D. Kenya', 'D. Roza', 'E. Simon', 'M. Chad', 'S. Adrienne', 'S. Martha', 'S. Paola', 'S. Skye'],
  'Usher Sisters': ['M. Chloe', 'D. Danielle', 'D. Kenya', 'D. Roza', 'S. Adrienne', 'S. Estefany', 'S. Hana', 'S. Lisa', 'S. Melissa', 'S. Paola', 'S. Skye', 'S. Taylor'],
  'Usher Brothers': ['B. Alex', 'B. Anthony', 'B. Clyde', 'B. Davidson', 'B. Delvin', 'B. Drew', 'B. Dustin', 'B. Giomar', 'B. Irvin', 'B. James S', 'B. Jordan', 'D. Chris'],
  'Lobby': ['S. Adrienne', 'S. Anessa', 'S. Bridgette', 'S. Ivonne', 'S. Leslie', 'S. Lupita', 'S. Mercie', 'S. Nichol', 'S. Paola'],
  'Translation': ['B. Irvin', 'B. Jason', 'D. Roza', 'S. Elena', 'S. Elisa', 'S. Leslie', 'S. Martha', 'S. Monica C', 'S. Monica S', 'S. Paola'],
  'Media': [],
  'Parking Lot': [],
  'Offering': []
};
const DATA_KEY = 'wds-data-v2';
/* Release stamp appended to every lazily-loaded local file. scripts/deploy.sh
   rewrites the 'DEV' token here, in index.html and in sw.js at release time, so
   long-lived browser caching can never serve a member a stale mix of files. */
const ASSET_V = '?v=DEV';
// Fallback site-passcode hash, used only on a brand-new device before app/
// settings.sitePinHash is set. The live code is managed in Manage → Features
// and its plaintext is intentionally not recorded here (see docs).
const DEFAULT_SITE_HASH = '1dffd68e5364ca2371d1627e59141f261264a7539f81c1746000b7320b5ad65b';
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSi0PRu7yJ9wbRn612zWq7rpInps6vWBcU7O9uHCp9W18sOCCF2U2ALS5EOo8hWrTSYXAfGmqiKYkaF/pub?gid=453135143&single=true&output=csv';

/* Name cleanup after the sheet's Raw Data tab was tidied up, maps old
   variant spellings to their canonical form. See 'unify-names'. This constant
   is the seed/fallback for the shared Firestore doc app/nameMap, which both
   this app and the song app read so canonicalization stays consistent. */
const NAME_UNIFY_MAP = {
  'B. Anthony L': 'B. Anthony', 'D. Chris K': 'D. Chris', 'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James', 'B. Jason S': 'B. Jason', 'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S', 'M.Chad': 'M. Chad', 'B. Gio': 'B. Giomar',
  'D. Chloe': 'M. Chloe', 'B,James': 'B. James', 'BJason': 'B. Jason',
  'S. Melisaa': 'S. Melissa', 'S. Monica C.': 'S. Monica C',
  'S. Monica S.': 'S. Monica S'
};

/* Live copy of app/nameMap; null until the snapshot arrives (or in local mode). */
let sharedNameMap = null;
function unifiedNameMap() { return Object.assign({}, NAME_UNIFY_MAP, sharedNameMap || {}); }

/* Presentation-only cleanup. Stored member IDs and auth claims stay unchanged. */
function memberLabel(value) {
  const raw = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const fixed = {
    'B,James': 'B. James', 'BJason': 'B. Jason', 'D,Armani': 'D. Armani',
    'H.Elena': 'H. Elena', 'S. Melisaa': 'S. Melissa'
  }[raw];
  const source = fixed || raw;
  const match = source.match(/^([A-Za-z])(?:\.|,)?\s*(.*)$/);
  if (!match) return source;
  const title = match[1].toUpperCase() + '.';
  const words = match[2].trim().split(/\s+/).filter(Boolean);
  if (!words.length) return title;
  const first = words[0].replace(/[.,]+$/g, '');
  const key = title.toLowerCase() + ' ' + first.toLowerCase();
  const peers = (state && state.members || []).filter(name => {
    const parsed = String(name || '').trim().match(/^([A-Za-z])(?:\.|,)?\s*(.*)$/);
    if (!parsed) return false;
    const peerFirst = parsed[2].trim().split(/\s+/)[0]?.replace(/[.,]+$/g, '') || '';
    return parsed[1].toLowerCase() + '. ' + peerFirst.toLowerCase() === key;
  });
  if (peers.length < 2 || words.length < 2) return title + ' ' + first;
  const lastInitial = words[words.length - 1].replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  return title + ' ' + first + (lastInitial ? ' ' + lastInitial + '.' : '');
}

/* Feature toggles, managed live in Manage → Features, synced to every device */
const FEATURES = [
  { id: 'siteLock',       label: 'Site passcode',             desc: 'Everyone must enter the 4-digit passcode before the app opens on a new device.', def: true },
  { id: 'editorLock',     label: 'Editor passcode',           desc: 'Require the passcode before anyone can open Manage and edit the schedule.', def: true },
  { id: 'notifications',  label: 'New-duty alerts',           desc: 'Members are alerted when a duty is added for them.', def: true },
  { id: 'reminders',      label: 'Day-before reminders',      desc: 'Members are reminded within 24 hours of each duty.', def: true },
  { id: 'calendarExport', label: 'Add-to-calendar button',    desc: 'Members can download their duties to their phone calendar with built-in reminders.', def: true },
  { id: 'whoElse',        label: '"Who else is serving?"',    desc: 'My Duties can expand the full lineup for each service.', def: true },
  { id: 'choirSong',      label: 'Choir song on services',    desc: 'Show the choir song line on each service card.', def: true },
  { id: 'songPicker',     label: 'Presider song picker',      desc: 'Presiders get a Presider tab and buttons in My Duties to plan the songs for their service.', def: true },
  { id: 'pastServices',   label: 'Past services',             desc: 'Allow browsing services that already happened.', def: true },
  { id: 'emptyDuties',    label: 'Show unassigned duties',    desc: 'The schedule shows every duty slot, even ones without a name yet.', def: false },
  { id: 'conflictWarnings', label: 'Double-duty warnings',    desc: 'Show a notice when one person has two duties in the same service.', def: true },
  { id: 'sheetSync',      label: 'Google Sheet sync',        desc: 'Pull schedule updates from the published Google Sheet automatically.', def: true },
  { id: 'changeRequests', label: 'Change requests',          desc: 'Members can request schedule changes from My Duties; the scheduler is notified.', def: true }
];

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
function siteUnlocked() { return previewMode || localStorage.getItem('wds-site-unlock') === siteHash(); }

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
function svcId(svc) {
  return svc.date + '_' + svc.service.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
function slugify(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function requestId(svcIdVal, duty, createdAt) {
  return svcIdVal + '_' + slugify(duty) + '_' + createdAt;
}
function svcDateTime(svc) {
  return new Date(svc.date + 'T' + (svc.time || '12:00') + ':00');
}
function dutyCategory(duty) {
  return CATEGORIES.find(c => c.duties.indexOf(duty) !== -1) || CATEGORIES[0];
}

/* ================= double-duty conflicts ================= */

const ALL_DUTIES_ORDER = CATEGORIES.reduce((out, cat) => out.concat(cat.duties), []);

function sortDuties(duties) {
  return duties.slice().sort((a, b) => ALL_DUTIES_ORDER.indexOf(a) - ALL_DUTIES_ORDER.indexOf(b));
}
function sameDuties(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((d, i) => d === b[i]);
}
function isPrayerDuty(duty) {
  return dutyCategory(duty).name === 'Worship' && /prayer/i.test(duty);
}
function isUsherDuty(duty) {
  const category = dutyCategory(duty).name;
  return category === 'Usher Sisters' || category === 'Usher Brothers';
}
/* Prayer + usher is an intentional pairing. Other duplicate pairs remain
   warnings: two usher duties, two prayer duties, or either with another role. */
function hasNonExemptPair(duties) {
  for (let i = 0; i < duties.length; i++) {
    for (let j = i + 1; j < duties.length; j++) {
      const prayerUsherPair =
        (isPrayerDuty(duties[i]) && isUsherDuty(duties[j])) ||
        (isUsherDuty(duties[i]) && isPrayerDuty(duties[j]));
      if (!prayerUsherPair) return true;
    }
  }
  return false;
}
/* Every member appearing in 2+ duties of this service, with their duty list (stable order).
   A single prayer + usher pairing is intentionally omitted from the conflicts. */
function conflictsFor(svc) {
  const byMember = {};
  const assignments = svc.assignments || {};
  Object.keys(assignments).forEach(duty => {
    const name = assignments[duty];
    if (!name) return;
    (byMember[name] || (byMember[name] = [])).push(duty);
  });
  return Object.keys(byMember)
    .filter(name => byMember[name].length >= 2 && hasNonExemptPair(byMember[name]))
    .map(name => ({ name, duties: sortDuties(byMember[name]) }));
}
/* conflictsFor minus ones already acknowledged (conflictOk) with a matching duty list */
function activeConflicts(svc) {
  const ok = svc.conflictOk || {};
  return conflictsFor(svc).filter(c => !sameDuties(ok[c.name], c.duties));
}

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

function weeksAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return toISO(d);
}

/* Per-member duty counts across the whole schedule: rolling 4/8-week windows,
   upcoming load, year total, last served and next duty dates. */
function workloadStats() {
  const t = todayISO(), w4 = weeksAgoISO(4), w8 = weeksAgoISO(8);
  const stats = {};
  const ensure = m => stats[m] || (stats[m] = { past4: 0, past8: 0, upcoming: 0, total: 0, last: '', next: '' });
  (state.members || []).forEach(ensure);
  (state.services || []).forEach(svc => {
    Object.keys(svc.assignments || {}).forEach(duty => {
      const m = svc.assignments[duty];
      if (!m) return;
      const s = ensure(m);
      s.total++;
      if (svc.date < t) {
        if (svc.date >= w8) s.past8++;
        if (svc.date >= w4) s.past4++;
        if (svc.date > s.last) s.last = svc.date;
      } else {
        s.upcoming++;
        if (!s.next || svc.date < s.next) s.next = svc.date;
      }
    });
  });
  return stats;
}

/* Best substitutes for a duty in a service: same department, not already
   serving that service, lightest recent+upcoming load first, then longest
   since last served. */
function suggestSubs(svc, duty, excludeName, stats) {
  const cat = dutyCategory(duty);
  const roster = departmentProfiles(cat.name).filter(profile => departmentProfileAssignable(profile, svc, duty));
  const busy = {};
  Object.keys(svc.assignments || {}).forEach(d => { if (svc.assignments[d]) busy[svc.assignments[d]] = true; });
  return roster
    .filter(profile => profile.memberName !== excludeName && !busy[profile.memberName])
    .map(profile => ({ profile, s: stats[profile.memberName] || { past4: 0, upcoming: 0, last: '' } }))
    .sort((a, b) =>
      (a.s.upcoming + a.s.past4) - (b.s.upcoming + b.s.past4) ||
      (a.s.last === b.s.last ? 0 : (a.s.last < b.s.last ? -1 : 1)))
    .slice(0, 3)
    .map(x => x.profile);
}

/* ================= google sheet sync, pure parsers ================= */

/* Minimal RFC-4180-ish CSV parser. Handles quoted fields, embedded commas,
   escaped quotes (""), and CRLF/LF line endings. Returns array of row arrays. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // flush trailing field/row if the file did not end with a newline
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Set of every duty name the app knows, built from CATEGORIES. */
function validDutySet() {
  const set = {};
  CATEGORIES.forEach(cat => cat.duties.forEach(duty => { set[duty] = true; }));
  return set;
}

const SHEET_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

/* Parse a sheet date like "Sat, May 02" (no year). Returns { month, day } or null. */
function parseSheetDate(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/^[a-z]+,?\s*/i, '').trim(); // drop weekday prefix
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const mon = SHEET_MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  const day = parseInt(m[2], 10);
  if (!(day >= 1 && day <= 31)) return null;
  return { month: mon, day: day };
}

/* Infer the year for a month/day so the resulting date is closest to `today`.
   Tries today's year -1, +0, +1 and picks the smallest absolute distance. */
function inferYearISO(month, day, today) {
  const base = today || new Date();
  const y0 = base.getFullYear();
  const nowT = base.getTime();
  let best = null, bestDiff = Infinity;
  [y0 - 1, y0, y0 + 1].forEach(y => {
    const d = new Date(y, month, day, 12, 0, 0);
    const diff = Math.abs(d.getTime() - nowT);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  });
  return best.getFullYear() + '-' + pad(best.getMonth() + 1) + '-' + pad(best.getDate());
}

/* Parse a 12-hour time like "9:00 AM" into 24-hour "HH:MM". Returns '' if unparseable. */
function parseSheetTime(raw) {
  if (!raw) return '';
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?$/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const pm = m[3].toLowerCase() === 'p';
  if (h === 12) h = 0;
  if (pm) h += 12;
  return pad(h) + ':' + min;
}

/* Turn parsed CSV rows into service objects.
   Returns { services, members, warnings }. Pure, no window/document/state. */
function sheetRowsToServices(rows, today) {
  const result = { services: [], members: [], warnings: [] };
  if (!rows || !rows.length) return result;
  const header = rows[0].map(h => String(h == null ? '' : h).trim().toLowerCase());
  const col = name => header.indexOf(name);
  const iDate = col('date'), iService = col('service'), iWorship = col('worship');
  const iTime = col('time'), iDuty = col('duty'), iMember = col('member');
  if (iDate < 0 || iService < 0 || iDuty < 0 || iMember < 0) {
    result.warnings.push('Sheet is missing required columns (Date, Service, Duty, Member).');
    return result;
  }
  const valid = validDutySet();
  const byKey = {}; // date + '|' + serviceLabel -> service object
  const membersSeen = {};
  const unknownDuties = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = i => (i >= 0 && i < row.length ? String(row[i] == null ? '' : row[i]).trim() : '');
    const rawDate = cell(iDate), serviceLabel = cell(iService);
    const duty = cell(iDuty), member = cell(iMember);
    // A blank Member cell in an otherwise-valid duty row is an explicit
    // "clear this duty" (mergeSheetServices writes '' over the old name).
    // Date/Service/Duty are still required; a *deleted* row leaves the slot.
    if (!rawDate || !serviceLabel || !duty) continue;
    const md = parseSheetDate(rawDate);
    if (!md) continue;
    const iso = inferYearISO(md.month, md.day, today);
    const isChoirSong = duty === 'Choir Song';
    if (!isChoirSong && !valid[duty]) {
      if (!unknownDuties[duty]) { unknownDuties[duty] = true; result.warnings.push('Unknown duty in sheet: "' + duty + '"'); }
      continue;
    }
    const key = iso + '|' + serviceLabel;
    let svc = byKey[key];
    if (!svc) {
      svc = { date: iso, service: serviceLabel, worship: iWorship >= 0 ? cell(iWorship) : '', time: parseSheetTime(cell(iTime)), assignments: {}, choirSong: '', _sheetChoirSongSeen: false };
      byKey[key] = svc;
      result.services.push(svc);
    }
    if (isChoirSong) {
      svc._sheetChoirSongSeen = true;
      svc.choirSong = member; // an explicit blank row clears a stale song
      continue;
    }
    svc.assignments[duty] = member; // '' explicitly clears the slot
    if (member) membersSeen[member] = true;
  }
  result.members = Object.keys(membersSeen).sort();
  return result;
}

/* ================= state ================= */

let state = { members: [], services: [], settings: { features: {}, pinHash: '' }, departments: {}, requests: [] };
let fb = null; // { db, auth, functions, setDoc, doc, deleteDoc, writeBatch, collection }

/* Firestore reads remain useful before sign-in, but every write requires a
   verified member session. Firebase Auth restores a custom-token session on
   reload, so this gate is the only browser-side mutation boundary. */
let authReady = Promise.resolve(null);
let authUser = null;
let verifiedSession = null;
let authStatus = 'loading';
let requestUnsub = null;

function isVerifiedSession() {
  return !!(verifiedSession && verifiedSession.memberName && verifiedSession.memberId);
}
function isForcedSession() {
  return isVerifiedSession() && verifiedSession.mustChangePin === true;
}
function authActor() {
  if (!isVerifiedSession()) return null;
  return Object.assign({}, verifiedSession, {
    name: verifiedSession.memberName,
    member: verifiedSession.memberName,
    claims: verifiedSession,
    token: verifiedSession
  });
}
function permissionApi() {
  return window.WorshipDutyPermissions || window.WDS_PERMISSIONS || {};
}
function permissionConfig() {
  const api = permissionApi();
  return state.permissionConfig || (state.settings && state.settings.permissionConfig) ||
    api.DEFAULT_PERMISSION_CONFIG || {};
}
function canPermission(method, ...args) {
  const api = permissionApi();
  if (typeof api[method] !== 'function') return false;
  try { return !!api[method](...args, permissionConfig()); }
  catch (_error) { return false; }
}
function authorizedDepartments() {
  const actor = authActor();
  if (!actor) return [];
  const api = permissionApi();
  if (canPermission('isAdmin', actor)) {
    const all = typeof api.allDepartments === 'function'
      ? api.allDepartments(permissionConfig())
      : CATEGORIES.map(category => category.name);
    return ['All'].concat(all.filter(department => department !== 'All'));
  }
  if (typeof api.departmentsForLeader !== 'function') return [];
  try { return api.departmentsForLeader(actor, permissionConfig()); }
  catch (_error) { return []; }
}
function canManageAnyDepartment() {
  return authorizedDepartments().length > 0;
}
function selectedManageDepartment() {
  const allowed = authorizedDepartments();
  if (allowed.indexOf(ui.manageDept) !== -1) return ui.manageDept;
  ui.manageDept = allowed[0] || '';
  return ui.manageDept;
}
function canManageSelectedDepartment(department) {
  if (!department || department === 'All') return canPermission('isAdmin', authActor());
  return canPermission('canManageDepartment', authActor(), department);
}
function fbWrite(fn) {
  if (fb && (!isVerifiedSession() || isForcedSession())) {
    return Promise.reject(new Error('A verified member session is required for this action.'));
  }
  return authReady.then(fn);
}
let settingsLoaded = false; // true once shared settings arrived (or local mode)
let departmentsLoaded = false; // true once the departments doc arrived (or local mode)
let membersLoaded = false; // true once the members doc arrived (or local mode)
let scheduleDataReady = false; // true once the first schedule snapshot (or local mode) has been processed

/* Local verification only. Honored ONLY on 127.0.0.1/localhost, with a
   fictional signed-in account and the bundled seed-data.js services, and it
   disables Firebase entirely (no init, no reads, no writes). Never active on
   the deployed site: window.location.hostname there is never localhost. */
const previewMode = (function () {
  try {
    const localHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    return localHost && new URLSearchParams(location.search).get('wdPreview') === '1';
  } catch (e) { return false; }
})();

const ui = {
  tab: 'schedule',
  sub: 'services',
  me: '',
  loginMember: '',
  manageDept: 'All',
  departmentView: 'list',
  departmentMember: '',
  deptFilter: (function () {
    const v = localStorage.getItem('wds-dept') || 'All';
    return v === 'All' || CATEGORIES.some(c => c.name === v) ? v : 'All';
  })(),
  expanded: {},
  showPast: false,
  banners: [],
  pinError: '',
  sitePinError: '',
  authError: '',
  authBusy: false,
  rebaseline: false,
  syncing: false,
  reqForm: null, // { key, note } - in-progress "request a change" draft, survives re-render
  songSvc: null, // svcId deep-link target for the song picker (ui.tab === 'songs')
  songNav: false // one-shot: this render is an explicit navigation into the song picker (tab or button), not a background re-mount
};

/* Department runtime data is deliberately kept out of the local schedule
   cache. The secure callable roster is the only source for profile identity,
   status, eligibility, schedulability, availability, and attribution. */
const departmentRuntime = {
  rosters: Object.create(null),
  ownProfiles: Object.create(null),
  ownLoading: false,
  ownLoaded: false,
  ownError: '',
  loading: Object.create(null),
  errors: Object.create(null),
  drafts: Object.create(null),
  assignmentBusy: Object.create(null)
};

function clearDepartmentRuntime() {
  departmentRuntime.rosters = Object.create(null);
  departmentRuntime.ownProfiles = Object.create(null);
  departmentRuntime.ownLoading = false;
  departmentRuntime.ownLoaded = false;
  departmentRuntime.ownError = '';
  departmentRuntime.loading = Object.create(null);
  departmentRuntime.errors = Object.create(null);
  departmentRuntime.drafts = Object.create(null);
  departmentRuntime.assignmentBusy = Object.create(null);
  ui.departmentView = 'list';
  ui.departmentMember = '';
}

function departmentRuntimeKey(department, memberUid) {
  return String(department || '') + '::' + String(memberUid || '');
}

function departmentErrorMessage(error, fallback) {
  const code = String(error && error.code || '').replace(/^functions\//, '');
  if (code === 'permission-denied') return 'This account is not authorized for that department action.';
  if (code === 'unauthenticated') return 'Sign in again before changing department data.';
  if (code === 'unavailable' || code === 'internal') return 'The department service is unavailable. Try again.';
  return String(error && error.message || fallback || 'The department action could not be completed.');
}

function departmentServiceTimeKey(serviceOrLabel) {
  const value = typeof serviceOrLabel === 'object'
    ? (serviceOrLabel && (serviceOrLabel.serviceTime || serviceOrLabel.service || serviceOrLabel.time))
    : serviceOrLabel;
  return slugify(value || '');
}

function departmentServiceTimeLabel(key) {
  const normalized = String(key || '').trim().toLocaleLowerCase();
  const known = SERVICE_LABELS.find(label => departmentServiceTimeKey(label) === normalized);
  if (known) return known;
  if (normalized === '*') return 'Any service time';
  return String(key || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalizeDepartmentAvailability(value) {
  const source = value && typeof value === 'object' ? value : {};
  const recurring = source.recurring && typeof source.recurring === 'object' ? source.recurring : {};
  const rawExceptions = source.exceptions || source.dateExceptions;
  const exceptions = rawExceptions && typeof rawExceptions === 'object' ? rawExceptions : {};
  const cleanMap = map => Object.keys(map).reduce((out, key) => {
    const status = String(map[key] || '').trim().toLocaleLowerCase();
    if (status === 'available' || status === 'unavailable') out[String(key).trim().toLocaleLowerCase()] = status;
    return out;
  }, {});
  const cleanExceptions = Object.keys(exceptions).reduce((out, date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !exceptions[date] || typeof exceptions[date] !== 'object') return out;
    out[date] = cleanMap(exceptions[date]);
    return out;
  }, {});
  return { recurring: cleanMap(recurring), exceptions: cleanExceptions };
}

function normalizeDepartmentProfile(value, department) {
  if (!value || typeof value !== 'object') return null;
  const memberUid = String(value.memberUid || value.uid || '').trim();
  const departmentId = String(value.departmentId || value.department || '').trim();
  if (!memberUid || !departmentId || departmentId !== String(department || '').trim()) return null;
  if (value.memberUid != null && value.uid != null && String(value.memberUid) !== String(value.uid)) return null;
  if (value.departmentId != null && value.department != null && String(value.departmentId) !== String(value.department)) return null;
  const eligibleDuties = Array.isArray(value.eligibleDuties)
    ? value.eligibleDuties
    : (Array.isArray(value.duties) ? value.duties : []);
  const schedulable = value.schedulable == null ? value.isSchedulable : value.schedulable;
  if (typeof schedulable !== 'boolean') return null;
  const status = String(value.status || (value.active === false ? 'inactive' : 'active')).trim().toLocaleLowerCase();
  if (status !== 'active' && status !== 'inactive') return null;
  return Object.assign({}, value, {
    departmentId,
    memberUid,
    memberName: String(value.memberName || value.member || memberUid).trim() || memberUid,
    role: String(value.role || 'member').trim(),
    status,
    eligibleDuties: eligibleDuties.map(duty => String(duty).trim()).filter(Boolean),
    schedulable,
    availability: normalizeDepartmentAvailability(value.availability)
  });
}

function departmentProfiles(department) {
  return Array.isArray(departmentRuntime.rosters[department]) ? departmentRuntime.rosters[department] : [];
}

function currentMemberUid() {
  return String((authUser && authUser.uid) || (verifiedSession && verifiedSession.uid) || '').trim();
}

function ownDepartmentProfiles() {
  return Object.keys(departmentRuntime.ownProfiles).reduce((profiles, department) => {
    const own = departmentRuntime.ownProfiles[department];
    if (Array.isArray(own)) profiles.push.apply(profiles, own);
    return profiles;
  }, []);
}

function departmentProfile(department, memberUid) {
  const wanted = String(memberUid || '');
  return departmentProfiles(department).find(profile => profile.memberUid === wanted) ||
    (departmentRuntime.ownProfiles[department] || []).find(profile => profile.memberUid === wanted) ||
    null;
}

function departmentProfileByName(department, name) {
  const wanted = String(name || '').trim();
  return departmentProfiles(department).find(profile => profile.memberName === wanted || memberLabel(profile.memberName) === memberLabel(wanted)) || null;
}

function departmentProfileIsLeader(profile) {
  return /leader|manager/i.test(String(profile && profile.role || ''));
}

function departmentAvailability(profile, serviceDate, serviceTime) {
  if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate || ''))) return 'unknown';
  const key = departmentServiceTimeKey(serviceTime);
  if (!key) return 'unknown';
  const exceptions = profile.availability && profile.availability.exceptions || {};
  const recurring = profile.availability && profile.availability.recurring || {};
  const exception = exceptions[serviceDate];
  if (exception && Object.prototype.hasOwnProperty.call(exception, key)) return exception[key];
  if (exception && Object.prototype.hasOwnProperty.call(exception, '*')) return exception['*'];
  return recurring[key] || 'unknown';
}

function departmentProfileAssignable(profile, svc, duty) {
  if (!profile || profile.status !== 'active' || profile.schedulable !== true) return false;
  if (!Array.isArray(profile.eligibleDuties) || !profile.eligibleDuties.some(item =>
    String(item).trim().toLocaleLowerCase() === String(duty || '').trim().toLocaleLowerCase())) return false;
  return departmentAvailability(profile, svc && svc.date, svc && departmentServiceTimeKey(svc)) === 'available';
}

function departmentDraftProfile(department, memberUid) {
  const profile = departmentProfile(department, memberUid);
  if (!profile) return null;
  const key = departmentRuntimeKey(department, memberUid);
  const draft = departmentRuntime.drafts[key];
  if (!draft) return profile;
  return Object.assign({}, profile, draft, {
    availability: normalizeDepartmentAvailability(draft.availability || profile.availability)
  });
}

function replaceDepartmentProfile(profile) {
  if (!profile || !profile.departmentId || !profile.memberUid) return false;
  const normalized = normalizeDepartmentProfile(profile, profile.departmentId);
  if (!normalized) return false;
  const current = departmentProfiles(normalized.departmentId);
  const index = current.findIndex(item => item.memberUid === normalized.memberUid);
  if (index === -1) current.push(normalized);
  else current[index] = normalized;
  current.sort((left, right) => String(left.memberName).localeCompare(String(right.memberName)));
  if (Array.isArray(departmentRuntime.rosters[normalized.departmentId])) {
    departmentRuntime.rosters[normalized.departmentId] = current;
  }
  const own = Array.isArray(departmentRuntime.ownProfiles[normalized.departmentId])
    ? departmentRuntime.ownProfiles[normalized.departmentId]
    : [];
  const ownIndex = own.findIndex(item => item.memberUid === normalized.memberUid);
  if (ownIndex !== -1) own[ownIndex] = normalized;
  else if (isOwnDepartmentProfile(normalized.departmentId, normalized.memberUid)) own.push(normalized);
  if (own.length) departmentRuntime.ownProfiles[normalized.departmentId] = own;
  delete departmentRuntime.drafts[departmentRuntimeKey(normalized.departmentId, normalized.memberUid)];
  return true;
}

function isOwnDepartmentProfile(department, memberUid) {
  const wanted = String(memberUid || '').trim();
  if (!wanted) return false;
  const uid = currentMemberUid();
  if (uid) return uid === wanted;
  return !fb && !!ui.me && departmentProfile(department, wanted)?.memberName === ui.me;
}

function departmentRosterError(department, message) {
  departmentRuntime.errors[department] = message || 'The department roster could not be loaded.';
  departmentRuntime.loading[department] = false;
}

function localDepartmentRoster(department) {
  const names = state.departments && Array.isArray(state.departments[department])
    ? state.departments[department]
    : [];
  const category = CATEGORIES.find(item => item.name === department);
  return names.map(name => normalizeDepartmentProfile({
    memberUid: 'local:' + slugify(department) + ':' + slugify(name),
    departmentId: department,
    memberName: name,
    role: 'member',
    status: 'active',
    eligibleDuties: category ? category.duties : [],
    schedulable: true,
    availability: { recurring: SERVICE_LABELS.reduce((out, label) => {
      out[departmentServiceTimeKey(label)] = 'available';
      return out;
    }, {}), exceptions: {} }
  }, department)).filter(Boolean);
}

function loadDepartmentRoster(department, options = {}) {
  const selected = String(department || '').trim();
  if (!selected || selected === 'All' || !isVerifiedSession()) return Promise.resolve([]);
  if (!options.force && Array.isArray(departmentRuntime.rosters[selected])) return Promise.resolve(departmentRuntime.rosters[selected]);
  if (!options.force && departmentRuntime.errors[selected]) return Promise.resolve([]);
  if (departmentRuntime.loading[selected]) return departmentRuntime.loading[selected];
  departmentRuntime.errors[selected] = '';
  departmentRuntime.loading[selected] = true;
  renderSoon();
  if (!fb) {
    departmentRuntime.rosters[selected] = localDepartmentRoster(selected);
    departmentRuntime.loading[selected] = false;
    renderSoon();
    return Promise.resolve(departmentRuntime.rosters[selected]);
  }
  const request = authCall('listDepartmentRoster', { departmentId: selected }).then(result => {
    if (!result || result.departmentId !== selected || !Array.isArray(result.members)) {
      throw new Error('The department roster response was not valid.');
    }
    const profiles = result.members.map(profile => normalizeDepartmentProfile(profile, selected)).filter(Boolean);
    departmentRuntime.rosters[selected] = profiles;
    departmentRuntime.loading[selected] = false;
    departmentRuntime.errors[selected] = '';
    renderSoon();
    return profiles;
  }).catch(error => {
    departmentRosterError(selected, departmentErrorMessage(error, 'The department roster could not be loaded.'));
    renderSoon();
    throw error;
  });
  departmentRuntime.loading[selected] = request;
  return request;
}

function loadOwnDepartmentProfiles() {
  if (!isVerifiedSession()) return Promise.resolve([]);
  if (departmentRuntime.ownLoaded) return Promise.resolve(ownDepartmentProfiles());
  if (departmentRuntime.ownLoading) return departmentRuntime.ownLoading;
  const uid = currentMemberUid();
  departmentRuntime.ownError = '';
  departmentRuntime.ownProfiles = Object.create(null);
  departmentRuntime.ownLoading = true;
  renderSoon();
  if (!fb || !uid || typeof fb.getDoc !== 'function') {
    const localProfiles = CATEGORIES.reduce((profiles, category) => {
      const match = localDepartmentRoster(category.name).find(profile => profile.memberName === ui.me);
      if (match) profiles.push(match);
      return profiles;
    }, []);
    localProfiles.forEach(profile => { departmentRuntime.ownProfiles[profile.departmentId] = [profile]; });
    departmentRuntime.ownLoaded = true;
    departmentRuntime.ownLoading = false;
    renderSoon();
    return Promise.resolve(localProfiles);
  }
  const request = Promise.all(CATEGORIES.map(async category => {
    try {
      const reference = fb.doc(fb.db, 'departments', category.name, 'members', uid);
      const snapshot = await fb.getDoc(reference);
      if (!snapshot || !snapshot.exists()) return null;
      return normalizeDepartmentProfile(snapshot.data(), category.name);
    } catch (_error) {
      return null;
    }
  })).then(profiles => {
    profiles.filter(Boolean).forEach(profile => {
      departmentRuntime.ownProfiles[profile.departmentId] = [profile];
    });
    departmentRuntime.ownLoaded = true;
    departmentRuntime.ownLoading = false;
    renderSoon();
    return ownDepartmentProfiles();
  }).catch(error => {
    departmentRuntime.ownLoaded = false;
    departmentRuntime.ownLoading = false;
    departmentRuntime.ownError = departmentErrorMessage(error, 'Your shared availability could not be loaded.');
    renderSoon();
    throw error;
  });
  departmentRuntime.ownLoading = request;
  return request;
}

function departmentPatch(department, memberUid, patch) {
  const profile = departmentProfile(department, memberUid);
  if (!profile || !patch || typeof patch !== 'object') return Promise.reject(new Error('The department member is not loaded.'));
  const key = departmentRuntimeKey(department, memberUid);
  const isNewDraft = !departmentRuntime.drafts[key];
  departmentRuntime.drafts[key] = Object.assign({}, departmentRuntime.drafts[key] || {}, patch);
  if (patch.availability) departmentRuntime.drafts[key].availability = normalizeDepartmentAvailability(patch.availability);
  if (isNewDraft) {
    // Section 3 stale-save witness, captured once when the draft opens (the
    // first edit), not re-read fresh at save time -- the profile as the
    // editor loaded it, per docs/runs/compact-phone-refactor/decisions/
    // S3-SERVER-INTERFACE.md section 3.
    departmentRuntime.drafts[key].expectedRevision = Number.isSafeInteger(profile.revision) ? profile.revision : 0;
    if (profile.updatedAt !== undefined && profile.updatedAt !== null) {
      departmentRuntime.drafts[key].expectedUpdatedAt = profile.updatedAt;
    }
  }
  renderSoon();
  return Promise.resolve(departmentRuntime.drafts[key]);
}

function saveDepartmentProfile(department, memberUid) {
  const profile = departmentProfile(department, memberUid);
  const draft = departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  if (!profile || !draft) return Promise.resolve(profile);
  const patch = {};
  ['status', 'eligibleDuties', 'schedulable', 'availability'].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(draft, field)) patch[field] = draft[field];
  });
  if (!Object.keys(patch).length) return Promise.resolve(profile);
  if (!fb) {
    const next = normalizeDepartmentProfile(Object.assign({}, profile, patch), department);
    replaceDepartmentProfile(next);
    renderSoon();
    return Promise.resolve(next);
  }
  const availabilityOnly = Object.keys(patch).length === 1 && Object.prototype.hasOwnProperty.call(patch, 'availability') &&
    isOwnDepartmentProfile(department, memberUid);
  const callable = availabilityOnly ? 'updateMemberAvailability' : 'updateDepartmentProfile';
  // Section 3 stale-save witness, captured when the draft opened (see
  // departmentPatch above), not re-read fresh here at save time.
  patch.expectedRevision = Number.isSafeInteger(draft.expectedRevision) ? draft.expectedRevision : 0;
  if (draft.expectedUpdatedAt !== undefined) patch.expectedUpdatedAt = draft.expectedUpdatedAt;
  return authCall(callable, {
    departmentId: department,
    memberUid,
    patch
  }).then(result => {
    if (!result || result.departmentId !== department || result.memberUid !== memberUid || !result.profile) {
      throw new Error('The department profile response was not valid.');
    }
    if (!replaceDepartmentProfile(result.profile)) throw new Error('The department profile identity was not valid.');
    addBanner('Department member profile saved.');
    renderSoon();
    return result.profile;
  }).catch(error => {
    addBanner('The department member profile was not saved: ' + departmentErrorMessage(error), true);
    renderSoon();
    throw error;
  });
}

function saveOwnDepartmentAvailability(department, memberUid) {
  const draft = departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  if (!isOwnDepartmentProfile(department, memberUid)) {
    return Promise.reject(new Error('Only the signed-in member may save this availability.'));
  }
  if (!draft || Object.keys(draft).some(field => field !== 'availability')) {
    return Promise.reject(new Error('Only availability changes may be saved from My Duties.'));
  }
  return saveDepartmentProfile(department, memberUid);
}

/* Section 3's stale-save witness for the assignment slot: the revision the
   client last saw on schedule.assignmentRevisions[duty] (missing reads as 0)
   and the member name it last saw in assignments[duty] ('' when empty), both
   read from the svc object the caller already has in hand -- the same data
   the leader/administrator screens render, so this is "as displayed", not a
   fresh re-fetch at save time. */
function departmentAssignmentWitness(svc, duty) {
  const assignmentRevisions = svc && svc.assignmentRevisions && typeof svc.assignmentRevisions === 'object'
    ? svc.assignmentRevisions : {};
  const raw = assignmentRevisions[duty];
  return {
    expectedRevision: Number.isSafeInteger(raw) ? raw : 0,
    expectedMemberName: (svc && svc.assignments && svc.assignments[duty]) || ''
  };
}

function applyAssignmentRevision(svc, duty, result) {
  if (!svc || !result || !Number.isSafeInteger(result.revision)) return;
  if (!svc.assignmentRevisions || typeof svc.assignmentRevisions !== 'object') svc.assignmentRevisions = {};
  svc.assignmentRevisions[duty] = result.revision;
}

function departmentAssignmentPayload(svc, duty, profile, extra = {}) {
  const category = dutyCategory(duty);
  return Object.assign({
    departmentId: category.name,
    memberUid: profile.memberUid,
    memberName: profile.memberName,
    duty,
    serviceId: svcId(svc),
    serviceDate: svc.date,
    serviceTime: departmentServiceTimeKey(svc)
  }, departmentAssignmentWitness(svc, duty), extra);
}

function applyScheduleAssignment(svc, duty, profile) {
  const name = profile.memberName;
  if (Object.keys(svc.assignments || {}).some(item => item !== duty && svc.assignments[item] === name)) {
    throw new Error(name + ' is already serving in this service, pick a different person.');
  }
  if (!svc.assignments) svc.assignments = {};
  svc.assignments[duty] = name;
  // The authorized callable is the assignment write boundary. This only
  // updates the in-memory schedule projection after the callable succeeds;
  // writing schedule/{id} here would bypass the UID/profile checks.
  afterDataChange();
}

function assignDepartmentDutyForService(svc, duty, profile, options = {}) {
  if (!svc || !profile) return Promise.reject(new Error('Choose a department member before assigning this duty.'));
  if (options.override !== true && Object.keys(svc.assignments || {}).some(item => item !== duty && svc.assignments[item] === profile.memberName)) {
    return Promise.reject(new Error(profile.memberName + ' is already serving in this service, pick a different person.'));
  }
  const busyKey = svcId(svc) + '::' + duty;
  if (departmentRuntime.assignmentBusy[busyKey]) return Promise.reject(new Error('That assignment is already being saved.'));
  departmentRuntime.assignmentBusy[busyKey] = true;
  const isOverride = options.override === true;
  if (!isOverride && !departmentProfileAssignable(profile, svc, duty)) {
    delete departmentRuntime.assignmentBusy[busyKey];
    return Promise.reject(new Error('Normal assignment requires an active, eligible, schedulable, available member.'));
  }
  const callable = isOverride ? 'overrideDepartmentAssignment' : 'assignDepartmentDuty';
  const payload = departmentAssignmentPayload(svc, duty, profile, isOverride
    ? { override: true, overrideReason: String(options.reason || '').trim() }
    : {});
  if (isOverride && !payload.overrideReason) {
    delete departmentRuntime.assignmentBusy[busyKey];
    return Promise.reject(new Error('An administrator override reason is required.'));
  }
  const save = fb ? authCall(callable, payload) : Promise.resolve({ ok: true, override: isOverride, profileMutated: false });
  return save.then(result => {
    if (isOverride && result && result.profileMutated !== false) throw new Error('The override response did not preserve the member profile.');
    applyScheduleAssignment(svc, duty, profile);
    applyAssignmentRevision(svc, duty, result);
    if (isOverride) addBanner('Administrator override recorded for ' + memberLabel(profile.memberName) + '.');
    return result;
  }).catch(error => {
    addBanner(error.message || safeAuthMessage(error), true);
    renderSoon();
    throw error;
  }).finally(() => { delete departmentRuntime.assignmentBusy[busyKey]; });
}

function unassignDepartmentDutyForService(svc, duty) {
  if (!svc) return Promise.reject(new Error('Choose a service before clearing this duty.'));
  const category = dutyCategory(duty);
  const payload = Object.assign({
    departmentId: category.name,
    duty,
    serviceId: svcId(svc),
    serviceDate: svc.date,
    serviceTime: departmentServiceTimeKey(svc)
  }, departmentAssignmentWitness(svc, duty));
  const save = fb ? authCall('unassignDepartmentDuty', payload) : Promise.resolve({ ok: true });
  return save.then(result => {
    if (!svc.assignments) svc.assignments = {};
    delete svc.assignments[duty];
    applyAssignmentRevision(svc, duty, result);
    afterDataChange();
    return result;
  }).catch(error => {
    addBanner(error.message || safeAuthMessage(error), true);
    renderSoon();
    throw error;
  });
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
function saveLocal() { localStorage.setItem(DATA_KEY, JSON.stringify(state)); }
function loadLocal() {
  try {
    const obj = JSON.parse(localStorage.getItem(DATA_KEY));
    if (obj && Array.isArray(obj.members) && Array.isArray(obj.services)) {
      if (!obj.settings) obj.settings = { features: {}, pinHash: '' };
      if (!obj.departments) obj.departments = {};
      if (!Array.isArray(obj.requests)) obj.requests = [];
      return obj;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function canonicalMemberName(name) {
  const value = String(name == null ? '' : name).trim();
  return value ? (unifiedNameMap()[value] || value) : '';
}

/* Apply the canonical identity map to browser state without restoring an
   identity from localStorage. D. Chloe is always represented as M. Chloe. */
function canonicalizeStateNames() {
  const canon = canonicalMemberName;
  const members = [];
  (state.members || []).forEach(member => {
    const name = canon(member);
    if (name && members.indexOf(name) === -1) members.push(name);
  });
  state.members = members.sort();
  (state.services || []).forEach(service => {
    const assignments = service.assignments || {};
    Object.keys(assignments).forEach(duty => { assignments[duty] = canon(assignments[duty]); });
    const conflictOk = service.conflictOk || {};
    const merged = {};
    Object.keys(conflictOk).forEach(name => {
      const key = canon(name);
      merged[key] = (merged[key] || []).concat(conflictOk[name] || []);
    });
    if (Object.keys(merged).length) service.conflictOk = merged;
  });
  Object.keys(state.departments || {}).forEach(department => {
    const seen = {};
    state.departments[department] = (state.departments[department] || [])
      .map(canon).filter(name => name && !seen[name] && (seen[name] = true)).sort();
  });
  (state.requests || []).forEach(request => {
    request.name = canon(request.name);
    request.resolvedBy = canon(request.resolvedBy);
  });
  if (state.settings && state.settings.schedulerName) {
    state.settings.schedulerName = canon(state.settings.schedulerName);
  }
}

/* persistence that works in both modes */
function persistService(svc) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'schedule', svcId(svc)), svc)).catch(error => {
    addBanner('The service change was not saved: ' + safeAuthMessage(error), true);
    renderSoon();
  });
  else saveLocal();
}
function persistDeleteService(id) {
  if (fb) fbWrite(() => fb.deleteDoc(fb.doc(fb.db, 'schedule', id))).catch(error => {
    addBanner('The service was not deleted: ' + safeAuthMessage(error), true);
    renderSoon();
  });
  else saveLocal();
}
function persistMembers() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'members'), { list: state.members })).catch(() => {});
  else saveLocal();
}
function persistSettings() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'settings'), state.settings)).catch(() => {});
  else saveLocal();
}
function persistDepartments() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'departments'), { map: state.departments })).catch(() => {});
  else saveLocal();
}
function persistDepartmentMembership(department, memberName, status) {
  if (!fb) { saveLocal(); return Promise.resolve({ ok: true }); }
  return authCall('updateDepartmentMembership', { department, memberName, status });
}
function persistNameMap(map) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'nameMap'), { map: map })).catch(() => {});
}
function persistRequest(req) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'requests', req.id), req)).catch(error => {
    addBanner('The request change was not saved: ' + safeAuthMessage(error), true);
    renderSoon();
  });
  else saveLocal();
}
function resolveRequest(id, status) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  req.status = status;
  req.resolvedAt = Date.now();
  req.resolvedByUid = (authUser && authUser.uid) || '';
  req.resolvedByName = ui.me || '';
  req.resolvedBy = req.resolvedByUid;
  persistRequest(req);
}
function persistAll() {
  if (!fb) { saveLocal(); return; }
  // Collect every write as a thunk, then commit in chunks, a full seed or a
  // large import can exceed Firestore's 500-op single-batch cap.
  const ops = [];
  const keep = {};
  state.services.forEach(svc => {
    const id = svcId(svc);
    keep[id] = true;
    ops.push(b => b.set(fb.doc(fb.db, 'schedule', id), svc));
  });
  (fb.knownIds || []).forEach(id => { if (!keep[id]) ops.push(b => b.delete(fb.doc(fb.db, 'schedule', id))); });
  ops.push(b => b.set(fb.doc(fb.db, 'app', 'members'), { list: state.members }));
  ops.push(b => b.set(fb.doc(fb.db, 'app', 'settings'), state.settings));
  ops.push(b => b.set(fb.doc(fb.db, 'app', 'departments'), { map: state.departments }));
  for (let i = 0; i < ops.length; i += 450) {
    const chunk = ops.slice(i, i + 450);
    fbWrite(() => {
      const batch = fb.writeBatch(fb.db);
      chunk.forEach(fn => fn(batch));
      return batch.commit();
    }).catch(() => {});
  }
}

/* ================= sorting / filtering ================= */

function sortedServices() {
  return state.services.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
function upcomingServices() { const t = todayISO(); return sortedServices().filter(s => s.date >= t); }
function pastServices() { const t = todayISO(); return sortedServices().filter(s => s.date < t); }

/* One Pacific-time default for every Schedule appearance. A service remains
   current for three hours; otherwise the next future service is preferred.
   Explicitly chosen dates and services are handled by each presentation. */
function preferredScheduleService(services, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = values.year + '-' + values.month + '-' + values.day;
  const wallNow = Date.parse(today + 'T' + values.hour + ':' + values.minute + ':00Z');
  const start = service => {
    if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(service.date || '')) return NaN;
    const fallback = { 'Early Morning': '05:00', Morning: '09:00', Afternoon: '15:00', Evening: '20:00' };
    const time = /^\d{2}:\d{2}$/.test(service.time || '') ? service.time : (fallback[service.service] || '12:00');
    return Date.parse(service.date + 'T' + time + ':00Z');
  };
  const ordered = (services || []).filter(service => Number.isFinite(start(service)))
    .sort((left, right) => start(left) - start(right));
  const active = ordered.filter(service => start(service) <= wallNow && start(service) + 3 * 60 * 60 * 1000 > wallNow);
  if (active.length) return active[active.length - 1];
  return ordered.find(service => start(service) > wallNow) ||
    ordered.filter(service => service.date === today).at(-1) || null;
}

function dutiesFor(member, list) {
  const out = [];
  (list || upcomingServices()).forEach(svc => {
    CATEGORIES.forEach(cat => cat.duties.forEach(duty => {
      if ((svc.assignments || {})[duty] === member) out.push({ svc, duty, cat });
    }));
  });
  return out;
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
   fails silently, unsupported browsers (iOS Safari not installed to home
   screen, missing VAPID key, notifications off, no name) simply no-op. */
async function registerPush() {
  try {
    if (!fb || !fb.messaging || !fb.getToken) return;
    await authReady;                                 // token docs are a write
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
      // token rotated, drop the stale doc
      try { await fb.deleteDoc(fb.doc(fb.db, 'tokens', prevToken)); } catch (e) { /* ignore */ }
    }
    if (prevToken !== token || prevName !== ui.me) {
      await fb.setDoc(fb.doc(fb.db, 'tokens', token), { name: ui.me, updatedAt: Date.now() });
      localStorage.setItem('wds-fcm-token', token);
      localStorage.setItem('wds-fcm-name', ui.me);
    }
  } catch (e) { console.warn('registerPush failed:', e); }
}

async function unregisterPush() {
  try {
    await authReady;                                 // deleting a token doc is a write
    const token = localStorage.getItem('wds-fcm-token');
    if (fb && fb.deleteToken && fb.messaging) {
      try { await fb.deleteToken(fb.messaging); } catch (e) { /* ignore */ }
    }
    if (fb && token) {
      try { await fb.deleteDoc(fb.doc(fb.db, 'tokens', token)); } catch (e) { /* ignore */ }
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
  return d.duty + ' | ' + d.svc.worship + ' ' + d.svc.service + ', ' + fmtDate(d.svc.date) + ' at ' + fmtTime(d.svc.time);
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
      addBanner('You have ' + fresh.length + ' new dut' + (fresh.length > 1 ? 'ies' : 'y') + ' | see My Duties.', true);
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

/* ================= google sheet sync, engine ================= */

const SHEET_SYNC_MIN_MS = 5 * 60 * 1000; // auto-sync throttle window

/* Merge a parsed sheet result into state, field-by-field so unchanged
   services trigger zero Firestore writes. Returns { added, updated }.
   Also grows department rosters: any (duty, member) pair seen adds member
   to that duty's category roster if not already present (covers brand-new
   names and existing names appearing in a category for the first time). */
function mergeSheetServices(services) {
  let added = 0, updated = 0;
  let deptsChanged = false;
  const addToDept = (duty, member) => {
    if (!member || !departmentsLoaded) return;
    const cat = dutyCategory(duty).name;
    if (!state.departments) state.departments = {};
    const roster = state.departments[cat] || (state.departments[cat] = []);
    if (roster.indexOf(member) === -1) { roster.push(member); roster.sort(); deptsChanged = true; }
  };
  services.forEach(sheetSvc => {
    const existing = findService(svcId(sheetSvc));
    if (!existing) {
      const fresh = {
        date: sheetSvc.date,
        time: sheetSvc.time || '',
        service: sheetSvc.service,
        worship: sheetSvc.worship || '',
        choirSong: sheetSvc.choirSong || '',
        assignments: Object.assign({}, sheetSvc.assignments)
      };
      state.services.push(fresh);
      persistService(fresh);
      Object.keys(fresh.assignments).forEach(duty => addToDept(duty, fresh.assignments[duty]));
      added++;
      return;
    }
    let changed = false;
    if (sheetSvc.time && existing.time !== sheetSvc.time) { existing.time = sheetSvc.time; changed = true; }
    if (sheetSvc.worship && existing.worship !== sheetSvc.worship) { existing.worship = sheetSvc.worship; changed = true; }
    const choirSongSeen = sheetSvc._sheetChoirSongSeen === true ||
      (!Object.prototype.hasOwnProperty.call(sheetSvc, '_sheetChoirSongSeen') && Boolean(sheetSvc.choirSong));
    if (choirSongSeen && existing.choirSong !== sheetSvc.choirSong) { existing.choirSong = sheetSvc.choirSong; changed = true; }
    if (!existing.assignments) existing.assignments = {};
    // Only touch duties the sheet mentions, Media Booth, Parking Lot and
    // Offering assignments are preserved.
    Object.keys(sheetSvc.assignments).forEach(duty => {
      addToDept(duty, sheetSvc.assignments[duty]);
      if (existing.assignments[duty] !== sheetSvc.assignments[duty]) {
        existing.assignments[duty] = sheetSvc.assignments[duty];
        changed = true;
      }
    });
    if (changed) { persistService(existing); updated++; }
  });
  if (deptsChanged) persistDepartments();
  return { added: added, updated: updated };
}

async function syncFromSheet(manual) {
  if (!feat('sheetSync')) { if (manual) alert('Google Sheet sync is turned off in Manage → Features.'); return; }
  if (fb && (!isVerifiedSession() || !canPermission('isAdmin', authActor()))) {
    if (manual) addBanner('Only an authorized administrator can sync the schedule from the sheet.', true);
    return;
  }
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
  if (fb && !(membersLoaded && departmentsLoaded) && autoSyncWaits < 20) {
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

/* VTIMEZONE for America/Los_Angeles, anchors event times to Pacific wall-clock
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

function safeAuthMessage(error) {
  const code = String(error && error.code || '').replace(/^functions\//, '');
  if (code === 'failed-precondition') return 'Change your member PIN before using the app.';
  if (code === 'permission-denied') return 'This member account cannot perform that action.';
  if (code === 'unavailable' || code === 'internal') return 'The member sign-in service is unavailable. Try again.';
  if (code === 'invalid-argument') return 'Enter a member and a 4 to 6 digit PIN.';
  return 'That member name and PIN did not match.';
}

function sessionFromClaims(claims, user) {
  const source = claims && typeof claims === 'object' ? claims : {};
  const memberName = canonicalMemberName(source.memberName || source.name);
  const memberId = String(source.memberId || memberName || '').trim();
  if (!memberName || !memberId) return null;
  return Object.assign({}, source, {
    uid: user && user.uid,
    memberId,
    memberName,
    name: memberName,
    roles: Array.isArray(source.roles) ? source.roles.slice() : [],
    departments: Array.isArray(source.departments) ? source.departments.slice() : [],
    mustChangePin: source.mustChangePin === true
  });
}

function setVerifiedSession(session, user) {
  const previousUid = verifiedSession && verifiedSession.uid;
  const previousMemberId = verifiedSession && verifiedSession.memberId;
  if (session && ((previousUid && previousUid !== session.uid) ||
      (previousMemberId && previousMemberId !== session.memberId))) clearDepartmentRuntime();
  verifiedSession = session;
  authUser = user || authUser;
  if (!session) {
    authStatus = fb ? 'signedOut' : 'local';
    ui.me = '';
    ui.loginMember = '';
    clearDepartmentRuntime();
    authReady = Promise.resolve(null);
    return;
  }
  authStatus = session.mustChangePin ? 'forced' : 'verified';
  ui.me = session.mustChangePin ? '' : session.memberName;
  ui.loginMember = session.memberName;
  if (session.mustChangePin) {
    localStorage.removeItem('wds-me');
  } else {
    localStorage.setItem('wds-me', session.memberName);
  }
  authReady = Promise.resolve(user || null);
  canonicalizeStateNames();
  selectedManageDepartment();
  if (!canPermission('isAdmin', authActor()) && canManageAnyDepartment() &&
      ['services', 'planning', 'requests', 'people'].indexOf(ui.sub) !== -1) {
    ui.sub = 'departments';
    ui.departmentView = 'list';
    ui.departmentMember = '';
  }
}

function startRequestListener() {
  if (requestUnsub) {
    requestUnsub();
    requestUnsub = null;
  }
  if (!fb || !isVerifiedSession()) return;
  const actor = authActor();
  let source;
  if (canPermission('isAdmin', actor)) {
    source = fb.collection(fb.db, 'requests');
  } else {
    const departments = authorizedDepartments().filter(department => department !== 'All');
    if (canManageAnyDepartment() && departments.length) {
      source = fb.query(fb.collection(fb.db, 'requests'), fb.where('department', 'in', departments.slice(0, 10)));
    } else if (authUser && authUser.uid) {
      source = fb.query(fb.collection(fb.db, 'requests'), fb.where('requesterUid', '==', authUser.uid));
    } else {
      source = fb.query(fb.collection(fb.db, 'requests'), fb.where('name', '==', ui.me));
    }
  }
  requestUnsub = fb.onSnapshot(source, snap => {
    state.requests = snap.docs.map(d => d.data());
    canonicalizeStateNames();
    renderSoon();
  }, () => { /* request access is scoped by the signed-in member claims */ });
}

async function syncAuthUser(user, forceRefresh) {
  authUser = user || null;
  if (!user) {
    setVerifiedSession(null, null);
    startRequestListener();
    renderSoon();
    return null;
  }
  try {
    const tokenResult = await user.getIdTokenResult(!!forceRefresh);
    const session = sessionFromClaims(tokenResult.claims, user);
    setVerifiedSession(session, user);
    startRequestListener();
    if (session && !session.mustChangePin) pulse('opens');
    renderSoon();
    return session;
  } catch (_error) {
    setVerifiedSession(null, user);
    startRequestListener();
    renderSoon();
    return null;
  }
}

function authCall(name, payload) {
  if (!fb || typeof fb.callable !== 'function') {
    return Promise.reject(new Error('The member sign-in service is unavailable.'));
  }
  return fb.callable(name)(payload).then(result => result && result.data);
}

async function memberLogin() {
  if (ui.authBusy) return;
  const memberInput = document.getElementById('member-login');
  const pinInput = document.getElementById('member-pin');
  const name = canonicalMemberName((memberInput && memberInput.value) || ui.loginMember);
  const pin = pinInput ? pinInput.value : '';
  if (!name || !/^\d{4,6}$/.test(pin)) {
    ui.authError = 'Choose your name and enter a 4 to 6 digit PIN.';
    render();
    return;
  }
  ui.loginMember = name;
  ui.authBusy = true;
  ui.authError = '';
  render();
  try {
    if (fb && fb.auth && fb.callable && fb.signInWithCustomToken) {
      const result = await authCall('verifyMemberPin', {
        selectedMemberId: name,
        selectedMemberName: name,
        pin
      });
      if (!result || !result.token) throw new Error('The member sign-in service is unavailable.');
      await fb.signInWithCustomToken(fb.auth, result.token);
      // The member identity is carried by the custom token. Do not force an
      // immediate refresh here, because accounts without a pre-existing Auth
      // user would lose those one-time claims before the session is opened.
      if (fb.auth.currentUser) await syncAuthUser(fb.auth.currentUser, false);
    } else {
      // Local mode still requires a selected member and a PIN. It grants no
      // privileged claims and is only a development fallback when Firebase
      // has not been configured for this copy of the app.
      if (pin !== '2217') throw new Error('Member PIN did not match.');
      setVerifiedSession({
        memberId: name,
        memberName: name,
        role: 'member',
        roles: ['member'],
        departments: [],
        mustChangePin: false
      }, null);
    }
    if (!isVerifiedSession()) throw new Error('The member sign-in service is unavailable.');
    ui.authError = '';
    ui.authBusy = false;
    ui.rebaseline = true;
    render();
    checkNewDuties();
    checkReminders();
    if (notifyOn()) registerPush();
  } catch (error) {
    ui.authBusy = false;
    ui.authError = safeAuthMessage(error);
    setVerifiedSession(null, null);
    render();
  }
}

async function memberChangePin() {
  if (!isForcedSession() || ui.authBusy) return;
  const first = document.getElementById('member-new-pin');
  const second = document.getElementById('member-new-pin-confirm');
  const newPin = first ? first.value : '';
  const confirmation = second ? second.value : '';
  if (!/^\d{4,6}$/.test(newPin)) {
    ui.authError = 'Use 4 to 6 digits for your new PIN.';
    render();
    return;
  }
  if (newPin !== confirmation) {
    ui.authError = 'The two new PIN entries do not match.';
    render();
    return;
  }
  const name = verifiedSession.memberName;
  ui.authBusy = true;
  ui.authError = '';
  render();
  try {
    if (fb && fb.callable) {
      await authCall('changeMemberPin', { memberId: verifiedSession.memberId, newPin });
      const result = await authCall('verifyMemberPin', {
        selectedMemberId: verifiedSession.memberId,
        selectedMemberName: name,
        pin: newPin
      });
      if (!result || !result.token) throw new Error('The member sign-in service is unavailable.');
      await fb.signInWithCustomToken(fb.auth, result.token);
      if (fb.auth.currentUser) await syncAuthUser(fb.auth.currentUser, false);
    } else {
      setVerifiedSession(Object.assign({}, verifiedSession, { mustChangePin: false }), null);
    }
    if (isForcedSession()) throw new Error('The member PIN still needs to be changed.');
    ui.authBusy = false;
    ui.authError = '';
    ui.rebaseline = true;
    render();
    checkNewDuties();
    checkReminders();
  } catch (error) {
    ui.authBusy = false;
    ui.authError = safeAuthMessage(error);
    render();
  }
}

async function memberLogout() {
  try {
    if (fb && fb.signOut && fb.auth) await fb.signOut(fb.auth);
  } catch (_error) { /* local state still clears below */ }
  setVerifiedSession(null, null);
  ui.tab = 'schedule';
  ui.sub = 'services';
  ui.departmentView = 'list';
  ui.departmentMember = '';
  ui.songSvc = null;
  ui.songNav = false;
  ui.authError = '';
  render();
}

function renderMemberLogin() {
  const members = Array.from(new Set((state.members || []).map(canonicalMemberName).filter(Boolean))).sort();
  const options = '<option value="">Choose your name</option>' + members.map(member =>
    '<option value="' + esc(member) + '"' + (member === ui.loginMember ? ' selected' : '') + '>' + esc(memberLabel(member)) + '</option>'
  ).join('');
  const status = authStatus === 'loading'
    ? '<p class="hint">Checking for a verified session...</p>'
    : '<p class="hint">Select your member account and enter its 4 to 6 digit PIN.</p>';
  return '<div class="card lock-box auth-box"><div class="lock-title">Member sign in</div>' + status +
    '<form class="add-row" data-act="member-login">' +
    '<select id="member-login" data-chg="login-member" aria-label="Member name" required>' + options + '</select>' +
    '<input type="password" id="member-pin" aria-label="Member PIN" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="current-password" placeholder="Member PIN" required>' +
    '<button class="primary" type="submit"' + (ui.authBusy ? ' disabled' : '') + '>' + (ui.authBusy ? 'Signing in...' : 'Sign in') + '</button></form>' +
    (ui.authError ? '<p class="pin-error">' + esc(ui.authError) + '</p>' : '') +
    '</div>';
}

function renderForcedPinChange() {
  return '<div class="card lock-box auth-box"><div class="lock-title">Change your member PIN</div>' +
    '<p class="hint">This account must set a new 4 to 6 digit PIN before the schedule opens.</p>' +
    '<form class="add-row" data-act="member-change-pin">' +
    '<input type="password" id="member-new-pin" aria-label="New member PIN" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" placeholder="New PIN" required>' +
    '<input type="password" id="member-new-pin-confirm" aria-label="Repeat new member PIN" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" placeholder="Repeat new PIN" required>' +
    '<button class="primary" type="submit"' + (ui.authBusy ? ' disabled' : '') + '>' + (ui.authBusy ? 'Saving...' : 'Save PIN') + '</button></form>' +
    '<button class="ghost" data-act="member-logout">Sign out</button>' +
    (ui.authError ? '<p class="pin-error">' + esc(ui.authError) + '</p>' : '') +
    '</div>';
}

/* ================= rendering ================= */

/* render() no longer writes DOM directly. It keeps the domain corrections
   that used to live alongside the old chrome updates (losing Presider/Manage
   access moves the viewer off a screen they can no longer see), then hands
   off to the shared shell (shared/shell.js) through the host's onChange
   subscription set up in startShell(). The shell owns every DOM write,
   including the site lock, sign-in, forced-PIN, and legacy My Duties/Manage/
   Presider screens rendered through the host below. */
function render() {
  const songEditor = canPermission('canEditSongs', authActor(), {});
  const isPresider = feat('songPicker') && !!ui.me &&
    (dutiesFor(ui.me).some(d => d.duty === 'Presider') || songEditor);
  if (ui.tab === 'songs' && !isPresider) { ui.tab = 'my'; ui.songSvc = null; ui.songNav = false; }
  if (ui.tab === 'manage' && !canManageAnyDepartment()) ui.tab = 'my';
  notifyHostChange();
}

function viewHasFocusedInput(view) {
  const a = document.activeElement;
  if (!a || !view || !view.contains(a)) return false;
  if (a.tagName === 'TEXTAREA') return true;
  if (a.tagName !== 'INPUT') return false;
  const t = (a.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'search', 'url', 'password', 'number', 'email', 'tel', 'date', 'time'].indexOf(t) !== -1;
}

/* ================= shared runtime shell host =================
   One host object, same pattern as the existing songCtx() below. Shared
   modules (shared/state.js, shared/shell.js, layouts/*) never import this
   file and never touch Firebase; they only call these functions. */

const hostChangeListeners = [];
function notifyHostChange() {
  hostChangeListeners.forEach(cb => {
    try { cb(); } catch (e) { /* one bad subscriber must not break the rest */ }
  });
}

function hostPhase() {
  if (document.documentElement.dataset.maintenance === 'active') return 'maintenance';
  if (feat('siteLock') && !siteUnlocked()) return 'locked';
  if (!isVerifiedSession()) return 'signin';
  if (isForcedSession()) return 'forcedPin';
  return 'ready';
}

function hostAccount() {
  if (!isVerifiedSession() || isForcedSession()) return null;
  const actor = authActor();
  return {
    name: ui.me,
    uid: verifiedSession.memberId,
    canManage: canManageAnyDepartment(),
    isAdmin: canPermission('isAdmin', actor),
    departments: authorizedDepartments(),
    isPresider: feat('songPicker') && !!ui.me && dutiesFor(ui.me).some(d => d.duty === 'Presider'),
    canEditSongs: canPermission('canEditSongs', actor, {})
  };
}

function hostStartRoute() {
  const account = hostAccount();
  if (!account) return '#schedule';
  if (account.isAdmin) return '#manage/attention';
  if (account.canManage) return '#manage/schedule';
  if (account.isPresider) return '#songs/my-service';
  return '#duties';
}

function hostBanners() {
  const items = [];
  if (previewMode) {
    items.push('<div class="wd-banner alert"><span><b>Local preview.</b> Fictional account and bundled seed data. Firebase is disabled; nothing here is saved or sent.</span></div>');
  }
  if (canManageAnyDepartment()) {
    const counts = actionableCountsForViewer();
    if (counts.total) {
      items.push('<div class="wd-banner alert"><span>' + esc(counts.message) + '</span>' +
        '<button data-act="open-manage-queue">Review</button></div>');
    }
  }
  items.push('<div class="wd-banner"><span>Signed in as <b>' + esc(memberLabel(ui.me)) + '</b></span>' +
    '<button data-act="member-logout">Sign out</button></div>');
  ui.banners.forEach((b, i) => {
    items.push('<div class="wd-banner' + (b.alert ? ' alert' : '') + '"><span>' + esc(b.txt) + '</span>' +
      '<button data-act="dismiss-banner" data-i="' + i + '" aria-label="Dismiss">✕</button></div>');
  });
  return items;
}

/* Same schedule this device saw last, formatted for the maintenance phase.
   Replaces the old DOM-writing renderMaintenanceSchedule(). */
function maintenanceScheduleHtml() {
  const focus = preferredScheduleService(state.services);
  const services = (state.services || []).filter(service => service && focus &&
    (service.date + (service.time || '') >= focus.date + (focus.time || '')))
    .sort((left, right) => left.date.localeCompare(right.date) || String(left.time || '').localeCompare(String(right.time || '')))
    .slice(0, 8);
  if (!services.length) return '<p class="hint">No upcoming services are available yet.</p>';
  return services.map(service => {
    const duties = Object.entries(service.assignments || {}).filter(([, member]) => member);
    return '<section class="maintenance-service"><div class="maintenance-service-title">' +
      esc(fmtDate(service.date)) + ', ' + esc(service.service || 'Service') + '</div>' +
      '<div class="maintenance-service-time">' + esc(service.worship || '') +
      (service.time ? ' at ' + esc(fmtTime(service.time)) : '') + '</div>' +
      (duties.length ? duties.map(([duty, member]) => '<div class="maintenance-duty"><span>' + esc(duty) +
        '</span><strong>' + esc(memberLabel(member)) + '</strong></div>').join('') : '<p class="hint">Duties have not been posted.</p>') +
      '</section>';
  }).join('');
}

function hostLegacyMy() { ui.tab = 'my'; return renderMy(); }
function hostLegacyManage() { ui.tab = 'manage'; return renderManage(); }
function hostLegacySongs(container) { ui.tab = 'songs'; renderSongs(container); }

/* ================= Section 4: Member screens (My duties, Availability,
   Reminders) — host data/actions consumed by shared/screens.js builders and
   rendered by every layout via layouts/_common.js. Replaces the legacy "My
   duties" bridge; #duties/#availability/#reminders no longer resolve to the
   legacy screen (see shared/screens.js screenForRoute). ================= */

function hostMyDuties() {
  if (!ui.me) return [];
  return dutiesFor(ui.me).map(d => ({
    serviceId: svcId(d.svc), date: d.svc.date, time: d.svc.time,
    worship: d.svc.worship, service: d.svc.service, duty: d.duty,
    pendingRequest: !!findPendingRequest(svcId(d.svc), d.duty, ui.me)
  }));
}

function hostMyRequests() {
  if (!ui.me) return [];
  return state.requests.filter(r => r.name === ui.me).slice()
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 12)
    .map(r => ({ id: r.id, duty: r.duty, worship: r.worship, service: r.service, date: r.date, note: r.note, status: effectiveRequestStatus(r) }));
}

function hostSubmitChangeRequest(serviceId, duty, note) {
  const svc = findService(serviceId);
  if (!svc || !ui.me || !verifiedSession) return Promise.reject(new Error('That duty is not available.'));
  const createdAt = Date.now();
  const req = {
    id: requestId(serviceId, duty, createdAt),
    name: ui.me,
    memberId: verifiedSession.memberId,
    requesterUid: (authUser && authUser.uid) || '',
    svcId: serviceId, date: svc.date, service: svc.service, worship: svc.worship,
    duty, department: actionableDepartmentForDuty(duty),
    note: note || '', status: 'pending', createdAt
  };
  state.requests.push(req);
  persistRequest(req);
  afterDataChange();
  return Promise.resolve(req);
}

/* Availability: reuses the existing shared department-profile draft/save
   machinery (departmentRuntime, saveOwnDepartmentAvailability, the wired
   `updateMemberAvailability` callable) that already powers the leader-facing
   Manage screens; this just exposes it through the host/save-state contract
   for the new dedicated Availability screen. */
function hostMyAvailability() {
  return ownDepartmentProfiles().map(profile => {
    const draft = departmentDraftProfile(profile.departmentId, profile.memberUid) || profile;
    const dirty = !!departmentRuntime.drafts[departmentRuntimeKey(profile.departmentId, profile.memberUid)];
    const recurring = (draft.availability && draft.availability.recurring) || {};
    const exceptions = (draft.availability && draft.availability.exceptions) || {};
    const exceptionRows = [];
    Object.keys(exceptions).sort().forEach(date => {
      Object.keys(exceptions[date] || {}).sort().forEach(key => {
        exceptionRows.push({ date, key, label: departmentServiceTimeLabel(key), status: exceptions[date][key] });
      });
    });
    return {
      departmentId: profile.departmentId,
      memberUid: profile.memberUid,
      dirty,
      recurring: SERVICE_LABELS.map(label => {
        const key = departmentServiceTimeKey(label);
        return { key, label, status: recurring[key] || 'unavailable' };
      }),
      exceptions: exceptionRows
    };
  });
}

function hostAvailabilityReady() {
  if (departmentRuntime.ownLoaded || departmentRuntime.ownError) return true;
  if (!departmentRuntime.ownLoading) loadOwnDepartmentProfiles().catch(() => {});
  return false;
}

function hostAvailabilityError() { return departmentRuntime.ownError || ''; }

function hostAvailabilityRetryLoad() {
  departmentRuntime.ownLoaded = false;
  departmentRuntime.ownError = '';
  loadOwnDepartmentProfiles().catch(() => {});
  renderSoon();
}

function hostAvailabilityToggleRecurring(departmentId, memberUid, key) {
  const profile = departmentDraftProfile(departmentId, memberUid) || departmentProfile(departmentId, memberUid);
  if (!profile || !isOwnDepartmentProfile(departmentId, memberUid)) return;
  const availability = normalizeDepartmentAvailability(profile.availability);
  availability.recurring[key] = (availability.recurring[key] || 'unavailable') === 'available' ? 'unavailable' : 'available';
  departmentPatch(departmentId, memberUid, { availability });
}

function hostAvailabilityAddException(departmentId, memberUid, date, key, status) {
  if (!isOwnDepartmentProfile(departmentId, memberUid)) return;
  const profile = departmentDraftProfile(departmentId, memberUid) || departmentProfile(departmentId, memberUid);
  if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !key || ['available', 'unavailable'].indexOf(status) === -1) return;
  const availability = normalizeDepartmentAvailability(profile.availability);
  if (!availability.exceptions[date]) availability.exceptions[date] = {};
  availability.exceptions[date][key] = status;
  departmentPatch(departmentId, memberUid, { availability });
}

function hostAvailabilityRemoveException(departmentId, memberUid, date, key) {
  if (!isOwnDepartmentProfile(departmentId, memberUid)) return;
  const profile = departmentDraftProfile(departmentId, memberUid) || departmentProfile(departmentId, memberUid);
  if (!profile) return;
  const availability = normalizeDepartmentAvailability(profile.availability);
  if (availability.exceptions[date]) {
    delete availability.exceptions[date][key];
    if (!Object.keys(availability.exceptions[date]).length) delete availability.exceptions[date];
  }
  departmentPatch(departmentId, memberUid, { availability });
}

function hostAvailabilityReset(departmentId, memberUid) {
  delete departmentRuntime.drafts[departmentRuntimeKey(departmentId, memberUid)];
  renderSoon();
}

const availabilitySaveControllers = Object.create(null);
function availabilitySaveController(departmentId, memberUid) {
  const key = departmentRuntimeKey(departmentId, memberUid);
  if (!availabilitySaveControllers[key]) {
    availabilitySaveControllers[key] = createSave({
      key,
      run: () => saveOwnDepartmentAvailability(departmentId, memberUid),
      onChange: () => renderSoon()
    });
  }
  return availabilitySaveControllers[key];
}

function hostAvailabilitySaveState(departmentId, memberUid) {
  return availabilitySaveController(departmentId, memberUid).state();
}

function hostAvailabilitySaveTrigger(departmentId, memberUid) {
  return availabilitySaveController(departmentId, memberUid).trigger();
}

/* Reminders: existing notification/calendar-export behavior, exposed read-only
   plus the same actions the legacy "My duties" notify box already used. */
function hostReminders() {
  const alerts = ui.me ? getJSON('wds-alerts-' + ui.me, []) : [];
  return {
    notifySupported: ('Notification' in window) && (feat('notifications') || feat('reminders')),
    notifyOn: notifyOn(),
    calendarEnabled: feat('calendarExport'),
    alerts: alerts.slice(0, 6).map(a => ({ t: a.t, txt: a.txt }))
  };
}

function hostNotifyOn() {
  return Notification.requestPermission().then(p => {
    if (p === 'granted') {
      localStorage.setItem('wds-notify', '1');
      sysNotify('Notifications are on', 'You\'ll hear about new duties and get reminders here.');
      registerPush();
    } else {
      addBanner('Notifications were blocked. You can allow them in your browser settings.', true);
    }
  });
}

function hostNotifyOff() { localStorage.setItem('wds-notify', '0'); unregisterPush(); }

function hostClearAlerts() {
  if (!ui.me) return;
  localStorage.removeItem('wds-alerts-' + ui.me);
  localStorage.setItem('wds-unread-' + ui.me, '0');
}

/* ================= Section 4 increment 2/3: Department leader and
   Administrator screens (Upcoming services, Needs attention, Members).
   Calls the four new Section 3 callables (saveMemberAvailability is not
   used here; resolveDutyAttention is) by name/contract per
   docs/runs/compact-phone-refactor/decisions/S3-SERVER-INTERFACE.md --
   that server code lives on branch claude/compact-server, not in this
   worktree, so these calls fail gracefully (Failed/local-preview) until
   the controller merges it; see docs/runs/compact-phone-refactor/lanes/S4.md.
   ================= */

function hostAuthorizedDepartments() { return authorizedDepartments(); }

function hostManageServices() {
  const t = todayISO();
  const allowed = authorizedDepartments();
  const admin = allowed.indexOf('All') !== -1;
  return (state.services || [])
    .filter(s => s.date >= t)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))
    .map(svc => ({
      serviceId: svcId(svc), date: svc.date, time: svc.time, worship: svc.worship, service: svc.service,
      duties: CATEGORIES.filter(cat => admin || allowed.indexOf(cat.name) !== -1)
        .flatMap(cat => cat.duties.map(duty => ({ duty, department: cat.name, memberName: (svc.assignments || {})[duty] || '' })))
    }));
}

/* Needs attention: one item list mirroring the predicate table in
   S3-SERVER-INTERFACE.md section 2.1 (requests, replacements, unfilled,
   conflicts), scoped to the viewer's authorized departments (unrestricted
   for an administrator, since authorizedDepartments() already returns
   'All' for them -- the same screen serves increments 2 and 3). */
function hostAttentionItems() {
  const allowed = authorizedDepartments();
  const admin = allowed.indexOf('All') !== -1;
  const inScope = department => admin || allowed.indexOf(department) !== -1;
  const t = todayISO();
  const items = [];

  const seenReq = {};
  (state.requests || []).forEach(r => {
    if (!requestIsActionable(r) || !manageRequestVisible(r)) return;
    const department = requestDepartment(r);
    if (!inScope(department)) return;
    const id = r.id || [r.name, r.date, r.service, r.duty].join('|');
    if (seenReq[id]) return;
    seenReq[id] = true;
    items.push({
      kind: 'request', id: 'req:' + id, department, serviceId: r.svcId, duty: r.duty,
      date: r.date, worship: r.worship, service: r.service, memberName: r.name,
      note: r.note, requestId: r.id
    });
  });

  (state.services || []).forEach(svc => {
    if (!svc || svc.date < t) return;
    const serviceId = svcId(svc);
    const assignments = svc.assignments || {};
    const markers = svc.needsReplacement || {};
    Object.keys(markers).forEach(duty => {
      const department = actionableDepartmentForDuty(duty);
      if (!inScope(department)) return;
      const marker = markers[duty];
      if (!marker || assignments[duty] !== marker.memberName) return; // self-healed, no longer live
      items.push({
        kind: 'replacement', id: 'rep:' + serviceId + ':' + duty, department, serviceId, duty,
        date: svc.date, worship: svc.worship, service: svc.service, memberName: marker.memberName
      });
    });
    CATEGORIES.forEach(cat => {
      if (!inScope(cat.name)) return;
      cat.duties.forEach(duty => {
        if (assignments[duty]) return;
        items.push({
          kind: 'unfilled', id: 'open:' + serviceId + ':' + duty, department: cat.name, serviceId, duty,
          date: svc.date, worship: svc.worship, service: svc.service, memberName: ''
        });
      });
    });
    activeConflicts(svc).forEach(c => {
      if (!canPermission('canAcknowledgeConflict', authActor(), Object.assign({}, c, { serviceId, date: svc.date, service: svc.service }))) return;
      const departments = Array.from(new Set(c.duties.map(actionableDepartmentForDuty)));
      if (!departments.some(inScope)) return;
      items.push({
        kind: 'conflict', id: 'conf:' + serviceId + ':' + c.name, department: departments.join(', '),
        serviceId, duty: c.duties.join(', '), date: svc.date, worship: svc.worship, service: svc.service,
        memberName: c.name
      });
    });
  });

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

function attentionItemById(id) { return hostAttentionItems().find(item => item.id === id) || null; }

function hostAttentionCandidates(serviceId, duty) {
  const svc = findService(serviceId);
  if (!svc) return [];
  const department = actionableDepartmentForDuty(duty);
  if (!Array.isArray(departmentRuntime.rosters[department]) && !departmentRuntime.loading[department]) {
    loadDepartmentRoster(department).catch(() => {});
  }
  const assignments = svc.assignments || {};
  return departmentProfiles(department)
    .filter(p => departmentProfileAssignable(p, svc, duty))
    .map(p => ({
      memberUid: p.memberUid, memberName: p.memberName,
      hasAnotherDuty: Object.keys(assignments).some(d => d !== duty && assignments[d] === p.memberName)
    }))
    .sort((a, b) => (a.hasAnotherDuty === b.hasAnotherDuty ? 0 : a.hasAnotherDuty ? 1 : -1) || a.memberName.localeCompare(b.memberName));
}

const attentionRuntime = { busy: Object.create(null), error: Object.create(null), conflict: Object.create(null) };
function hostAttentionBusy(id) { return !!attentionRuntime.busy[id]; }
function hostAttentionError(id) { return attentionRuntime.error[id] || ''; }
function hostAttentionConflictAdvisory(id) { return attentionRuntime.conflict[id] || null; }

function hostResolveAttention(id, payload) {
  const item = attentionItemById(id);
  if (!item) return Promise.reject(new Error('That item is no longer in Needs attention.'));
  attentionRuntime.busy[id] = true;
  attentionRuntime.error[id] = '';
  renderSoon();
  // Section 3 stale-save witness for the slot: the revision and member name
  // as displayed in this same Needs-attention computation (hostAttentionItems),
  // not a separate fresh read taken right before sending.
  const svc = findService(item.serviceId);
  const body = Object.assign(
    { departmentId: item.department, serviceId: item.serviceId, duty: item.duty },
    item.kind === 'request' ? { requestId: item.requestId } : {},
    departmentAssignmentWitness(svc, item.duty),
    payload
  );
  return authCall('resolveDutyAttention', body).then(result => {
    attentionRuntime.busy[id] = false;
    attentionRuntime.conflict[id] = null;
    applyAssignmentRevision(svc, item.duty, result);
    addBanner('Needs attention item resolved.');
    afterDataChange();
    return result;
  }).catch(error => {
    attentionRuntime.busy[id] = false;
    const details = error && error.details;
    if (details && details.reason === 'conflict') {
      // The advisory conflict (failed-precondition, details.reason ===
      // 'conflict') is not a stale save -- it means another duty in this
      // service is already held by the same member. Show the advisory and
      // let the caller retry with acknowledgeConflict: true.
      attentionRuntime.conflict[id] = details;
    } else {
      // aborted (or failed-precondition without a conflict reason) is the
      // stale-save case: someone else changed this slot since it was
      // displayed. Use the server's own message (and who changed it, when
      // known) rather than the unrelated PIN-login message.
      const who = details && (details.memberName || details.assignedBy);
      const base = departmentErrorMessage(error, 'That item could not be resolved.');
      attentionRuntime.error[id] = who && /changed since/i.test(base) ? base + ' (' + who + ')' : base;
    }
    renderSoon();
    throw error;
  });
}

function hostAcknowledgeConflict(id) {
  const item = attentionItemById(id);
  if (!item || item.kind !== 'conflict') return;
  const svc = findService(item.serviceId);
  if (!svc) return;
  const c = conflictsFor(svc).find(x => x.name === item.memberName);
  if (!c) return;
  if (!svc.conflictOk) svc.conflictOk = {};
  const current = conflictsFor(svc);
  Object.keys(svc.conflictOk).forEach(name => {
    const match = current.find(x => x.name === name);
    if (!match || !sameDuties(svc.conflictOk[name], match.duties)) delete svc.conflictOk[name];
  });
  svc.conflictOk[item.memberName] = c.duties;
  persistService(svc);
  afterDataChange();
}

/* Members: roster (existing listDepartmentRoster/loadDepartmentRoster) plus
   search-by-name add (searchDepartmentCandidates + the already-wired
   createDepartmentProfile direct-add, per S3-MEMBERSHIP-INTERFACE.md) and
   invite-link creation (createDepartmentInvitation). */
function hostDepartmentRoster(department) {
  if (!department) return [];
  if (!Array.isArray(departmentRuntime.rosters[department]) && !departmentRuntime.loading[department]) {
    loadDepartmentRoster(department).catch(() => {});
  }
  return departmentProfiles(department);
}
function hostDepartmentRosterReady(department) {
  return !department || Array.isArray(departmentRuntime.rosters[department]) || !!departmentRuntime.errors[department];
}

const memberSearchRuntime = Object.create(null);
function hostMemberSearchResults(department, query) {
  const key = department + '::' + query.toLocaleLowerCase();
  if (!memberSearchRuntime[key]) {
    memberSearchRuntime[key] = { members: null, error: '' };
    authCall('searchDepartmentCandidates', { departmentId: department, query }).then(result => {
      memberSearchRuntime[key].members = (result && result.members) || [];
      renderSoon();
    }).catch(error => {
      memberSearchRuntime[key].members = [];
      memberSearchRuntime[key].error = safeAuthMessage(error);
      renderSoon();
    });
  }
  const entry = memberSearchRuntime[key];
  return entry.members === null ? null : { members: entry.members, error: entry.error };
}

function hostAddMember(department, memberUid, memberName) {
  return authCall('createDepartmentProfile', {
    departmentId: department, department, memberUid, uid: memberUid, memberName,
    role: 'member', status: 'active', eligibleDuties: [], schedulable: false,
    availability: { recurring: {}, exceptions: {} }
  }).then(result => {
    if (result && result.profile) replaceDepartmentProfile(result.profile);
    addBanner(memberLabel(memberName) + ' added to ' + department + '.');
    renderSoon();
    return result;
  }).catch(error => {
    addBanner('Could not add that member: ' + safeAuthMessage(error), true);
    renderSoon();
    throw error;
  });
}

const inviteRuntime = Object.create(null);
function hostCreateInvite(department) {
  return authCall('createDepartmentInvitation', { departmentId: department }).then(result => {
    inviteRuntime[department] = { token: (result && result.token) || '', error: '' };
    renderSoon();
    return result;
  }).catch(error => {
    inviteRuntime[department] = { token: '', error: safeAuthMessage(error) };
    renderSoon();
    throw error;
  });
}
function hostPendingInvite(department) { return inviteRuntime[department] || null; }

/* ================= Section 4 increment 4: Presider (My service, Songs
   confirm, History). Song picking itself (the "Songs"/#songs/library
   screen) stays on the legacy song-app.js bridge for now -- see
   docs/runs/compact-phone-refactor/lanes/S4.md limitations. ================= */

/* Section 3 stale-save witness for saveSongService: setlist.revision
   (missing reads as 0) and updatedAt "from the setlist as loaded", captured
   the first time the My-service list shows this service, not re-read fresh
   at confirm time. A service with no setlist doc yet gets no witness (a
   brand-new setlist that does not exist yet, per the ruling). Updated after
   a successful confirm so a second confirm in the same session uses the
   revision the server just returned. */
const presiderSongWitness = Object.create(null);
function ensurePresiderSongWitness(serviceId) {
  if (!(serviceId in presiderSongWitness)) {
    const sl = setlistIndex[serviceId];
    presiderSongWitness[serviceId] = sl
      ? { expectedRevision: Number.isSafeInteger(sl.revision) ? sl.revision : 0, expectedUpdatedAt: sl.updatedAt }
      : null;
  }
  return presiderSongWitness[serviceId];
}

function hostPresiderServices() {
  const t = todayISO();
  return (state.services || [])
    .filter(svc => svc.date >= t && canEditSongService(svc))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))
    .map(svc => {
      const serviceId = svcId(svc);
      ensurePresiderSongWitness(serviceId);
      return {
        serviceId, date: svc.date, time: svc.time, worship: svc.worship, service: svc.service,
        songState: songStateFor(serviceId)
      };
    });
}

function hostConfirmSongsRun(serviceId) {
  const list = setlistIndex[serviceId] || {};
  const songs = (list.songs || []).map(s => (s && typeof s === 'object') ? (s.id || s.songId || '') : s).filter(Boolean);
  if (!songs.length) return Promise.reject(new Error('Pick at least one song before confirming.'));
  const witness = ensurePresiderSongWitness(serviceId);
  return authCall('saveSongService', Object.assign({
    serviceId, songs, glorySong: list.glorySong || null, thanksSong: list.thanksSong || null,
    notes: list.notes || '', confirm: true
  }, witness || {})).then(result => {
    presiderSongWitness[serviceId] = {
      expectedRevision: result && Number.isSafeInteger(result.revision) ? result.revision : 0,
      expectedUpdatedAt: result && result.setlist && result.setlist.updatedAt
    };
    return result;
  });
}

/* One save controller per service (like the availability per-department
   controllers), so confirming one service's songs never shows a stale
   Saved/Failed/Stale bar while looking at a different upcoming service. */
const songSaveControllers = Object.create(null);
function songSaveController(serviceId) {
  if (!songSaveControllers[serviceId]) {
    songSaveControllers[serviceId] = createSave({
      key: 'song-confirm:' + serviceId,
      run: () => hostConfirmSongsRun(serviceId),
      onChange: () => renderSoon()
    });
  }
  return songSaveControllers[serviceId];
}
function hostSongSaveState(serviceId) { return serviceId ? songSaveController(serviceId).state() : null; }
function hostConfirmSongs(serviceId) {
  return songSaveController(serviceId).trigger().then(result => {
    addBanner('Songs confirmed.');
    return result;
  });
}

let songHistoryRuntime = { loaded: false, loading: false, error: '', entries: [] };

function loadSongHistory() {
  if (songHistoryRuntime.loading) return;
  songHistoryRuntime.loading = true;
  if (!fb) {
    songHistoryRuntime.entries = [];
    songHistoryRuntime.loaded = true;
    songHistoryRuntime.loading = false;
    renderSoon();
    return;
  }
  authReady.then(() => fb.getDocs(fb.query(fb.collection(fb.db, 'setlists'), fb.orderBy('date', 'desc'), fb.limit(150))))
    .then(snap => {
      songHistoryRuntime.entries = snap.docs.map(d => d.data()).filter(sl => sl.status === 'sung').map(sl => ({
        serviceId: sl.id, date: sl.date, worship: sl.worshipType || sl.worship || '', service: sl.serviceLabel || sl.service || '',
        historySource: sl.historySource || 'manual',
        songs: (sl.songs || []).map(s => (s && typeof s === 'object') ? s : { id: s, title: s }),
        // Section 3 stale-save witness, captured here when the history list
        // loads (the editor opening this record), not re-read at save time.
        expectedRevision: Number.isSafeInteger(sl.revision) ? sl.revision : 0,
        expectedUpdatedAt: sl.updatedAt
      }));
      songHistoryRuntime.loaded = true;
      songHistoryRuntime.loading = false;
      renderSoon();
    }).catch(error => {
      songHistoryRuntime.error = safeAuthMessage(error);
      songHistoryRuntime.loaded = true;
      songHistoryRuntime.loading = false;
      renderSoon();
    });
}

function hostSongHistoryReady() {
  if (songHistoryRuntime.loaded) return true;
  if (!songHistoryRuntime.loading) loadSongHistory();
  return false;
}
function hostSongHistoryError() { return songHistoryRuntime.error; }
function hostSongHistory() { return songHistoryRuntime.entries; }
function hostRetrySongHistory() {
  songHistoryRuntime = { loaded: false, loading: false, error: '', entries: [] };
  loadSongHistory();
}

function hostRemoveHistorySong(serviceId, songId) {
  const entry = songHistoryRuntime.entries.find(e => e.serviceId === serviceId);
  if (!entry) return Promise.reject(new Error('That recorded service is not loaded.'));
  const songs = entry.songs.filter(s => s.id !== songId).map(s => s.id);
  return authCall('correctSongHistory', {
    serviceId, songs,
    expectedRevision: entry.expectedRevision,
    expectedUpdatedAt: entry.expectedUpdatedAt
  }).then(result => {
    entry.songs = entry.songs.filter(s => s.id !== songId);
    entry.expectedRevision = result && Number.isSafeInteger(result.revision) ? result.revision : entry.expectedRevision;
    entry.expectedUpdatedAt = (result && result.setlist && result.setlist.updatedAt) || entry.expectedUpdatedAt;
    addBanner('Song removed from the recorded list.');
    renderSoon();
    return result;
  }).catch(error => {
    // Use the server's own message (right for aborted/failed-precondition
    // stale-save rejections) rather than the unrelated PIN-login message.
    addBanner('Could not correct that history record: ' + ((error && error.message) || 'That change could not be saved.'), true);
    renderSoon();
    throw error;
  });
}

function buildHost() {
  return {
    phase: hostPhase,
    account: hostAccount,
    services: () => state.services || [],
    counts: actionableCountsForViewer,
    currentOrNext: () => preferredScheduleService(state.services),
    dataReady: () => scheduleDataReady,
    appearance: () => document.documentElement.getAttribute('data-appearance') || 'classic',
    startRoute: hostStartRoute,
    banners: hostBanners,
    addBanner,
    siteLockHtml: renderSiteLock,
    loginHtml: renderMemberLogin,
    forcedPinHtml: renderForcedPinChange,
    maintenanceHtml: maintenanceScheduleHtml,
    legacy: { my: hostLegacyMy, manage: hostLegacyManage, songs: hostLegacySongs },
    pulse: name => pulse('tab_' + name),
    onChange: cb => { hostChangeListeners.push(cb); },
    myDuties: hostMyDuties,
    myRequests: hostMyRequests,
    myAvailability: hostMyAvailability,
    availabilityReady: hostAvailabilityReady,
    availabilityError: hostAvailabilityError,
    availabilitySaveState: hostAvailabilitySaveState,
    reminders: hostReminders,
    authorizedDepartments: hostAuthorizedDepartments,
    manageServices: hostManageServices,
    attentionItems: hostAttentionItems,
    attentionCandidates: hostAttentionCandidates,
    attentionBusy: hostAttentionBusy,
    attentionError: hostAttentionError,
    attentionConflictAdvisory: hostAttentionConflictAdvisory,
    departmentRoster: hostDepartmentRoster,
    departmentRosterReady: hostDepartmentRosterReady,
    memberSearchResults: hostMemberSearchResults,
    pendingInvite: hostPendingInvite,
    presiderServices: hostPresiderServices,
    songSaveState: hostSongSaveState,
    songHistoryReady: hostSongHistoryReady,
    songHistoryError: hostSongHistoryError,
    songHistory: hostSongHistory,
    actions: {
      requestChange: hostSubmitChangeRequest,
      toggleAvailability: hostAvailabilityToggleRecurring,
      addAvailabilityException: hostAvailabilityAddException,
      removeAvailabilityException: hostAvailabilityRemoveException,
      saveAvailability: hostAvailabilitySaveTrigger,
      resetAvailability: hostAvailabilityReset,
      retrySave: hostAvailabilitySaveTrigger,
      retryAvailabilityLoad: hostAvailabilityRetryLoad,
      notifyOn: hostNotifyOn,
      notifyOff: hostNotifyOff,
      subscribeIcs: subscribeICS,
      copyIcs: copyICSLink,
      clearAlerts: hostClearAlerts,
      resolveAttention: hostResolveAttention,
      acknowledgeConflict: hostAcknowledgeConflict,
      addMember: hostAddMember,
      createInvite: hostCreateInvite,
      confirmSongs: hostConfirmSongs,
      removeHistorySong: hostRemoveHistorySong,
      retrySongHistory: hostRetrySongHistory
    }
  };
}

function pillFor(member) {
  const mine = ui.me && member === ui.me;
  return '<span class="pill' + (mine ? ' me' : '') + '">' + esc(memberLabel(member)) + (mine ? ' (You)' : '') + '</span>';
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
          (m ? pillFor(m) + conflictBadge(svc, m) : '<span style="color:var(--muted);font-style:italic;font-size:13px">-</span>') + '</div>';
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
  const focus = preferredScheduleService(up);
  if (focus && (filter === 'All' || categoryHasAssignments(focus, filter))) {
    html += '<section class="schedule-focus"><div class="date-head"><span class="day">Current or next service</span></div>' +
      renderServiceCard(focus, filter) + '</section><div class="date-head"><span class="day">Full schedule</span></div>';
  }
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
  let html = '';
  if (!ui.me) return '<div class="empty">Sign in to see your duties.</div>';

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

  html += renderOwnAvailability();

  const duties = dutiesFor(ui.me);
  if (!duties.length) {
    html += '<div class="empty">You have no upcoming duties right now. ' +
      'You\'ll see them here, and be notified, as soon as one is assigned to you.</div>';
    return html + renderYourRequests();
  }

  html += '<p class="hint">You have <b>' + duties.length + '</b> upcoming dut' + (duties.length > 1 ? 'ies' : 'y') + '.</p>';

  // Group a member's duties by day (and, within a day, by service) so every
  // duty on the same date shares one card. `dutiesFor` already returns them in
  // date → time → category order, so first-seen order here is the display order.
  const days = [];
  const dayIndex = {};
  duties.forEach(d => {
    let day = dayIndex[d.svc.date];
    if (!day) { day = dayIndex[d.svc.date] = { date: d.svc.date, edge: d.cat.color, services: [], svcIndex: {} }; days.push(day); }
    const sid = svcId(d.svc);
    let se = day.svcIndex[sid];
    if (!se) { se = day.svcIndex[sid] = { svc: d.svc, id: sid, duties: [] }; day.services.push(se); }
    se.duties.push(d);
  });

  // Presider song picker, a role-conditional door into the song-selection
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
   first open, most members never preside, so they never pay for it. */
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
    me: nameMap[ui.me] || ui.me,
    permissions: verifiedSession || {},
    nameMap,
    nav,
    // Deep-link hint: the service whose Presider button was tapped (if any).
    service: svc ? {
      date: svc.date, worship: svc.worship, service: svc.service, time: svc.time,
      choirSong: svc.choirSong || '',
      assignments: Object.assign({}, svc.assignments || {}),
      presider: (svc.assignments || {}).Presider || ''
    } : null,
    canEditSongService: service => isVerifiedSession() && !isForcedSession() && canEditSongService(service),
    canManagePresiders: () => isVerifiedSession() && !isForcedSession() && canManagePresiders(),
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
  return state.requests.find(r => r.svcId === svcIdVal && r.duty === duty && r.name === name && requestIsActionable(r));
}

/* A schedule edit completes the practical work behind a change request. Keep
   the stored request for history, but stop presenting it as pending once the
   requester no longer holds that exact duty. */
function requestTargetService(request) {
  if (!request) return null;
  return (state.services || []).find(service => svcId(service) === request.svcId) || null;
}

function requestIsActionable(request) {
  if (!request || request.status !== 'pending') return false;
  const service = requestTargetService(request);
  if (!service) return true;
  return canonicalMemberName((service.assignments || {})[request.duty]) === canonicalMemberName(request.name);
}

function effectiveRequestStatus(request) {
  return request && request.status === 'pending' && !requestIsActionable(request) ? 'completed' : request.status;
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

/* "Your requests" card in My Duties, newest first, last ~6, only if any exist for ui.me. */
function renderYourRequests() {
  if (!ui.me) return '';
  const mine = state.requests.filter(r => r.name === ui.me).slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!mine.length) return '';
  return '<div class="card req-card"><b style="font-size:13.5px">Your requests</b>' +
    mine.slice(0, 6).map(r =>
      '<div class="req-item">' +
      '<div class="req-head"><span class="req-when">' + esc(r.duty) + ' | ' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) + '</span>' +
      statusChip(effectiveRequestStatus(r)) + '</div>' +
      (r.note ? '<div class="req-note">' + esc(r.note) + '</div>' : '') +
      '</div>').join('') +
    '</div>';
}

function pendingRequestsCount() {
  return state.requests.filter(r => r.status === 'pending').length;
}

function actionableDepartmentForDuty(duty) {
  const api = permissionApi();
  if (typeof api.departmentForDuty === 'function') {
    try { return api.departmentForDuty(duty, permissionConfig()) || ''; }
    catch (_error) { /* use the local category map below */ }
  }
  return dutyCategory(duty).name;
}

function actionableDepartments(item) {
  const out = [];
  const add = value => {
    if (!value) return;
    const department = String(value).trim();
    if (department && out.indexOf(department) === -1) out.push(department);
  };
  (Array.isArray(item && item.departments) ? item.departments : []).forEach(add);
  add(item && (item.department || item.category));
  (Array.isArray(item && item.duties) ? item.duties : []).forEach(duty => add(actionableDepartmentForDuty(duty)));
  if (!out.length && item && item.duty) add(actionableDepartmentForDuty(item.duty));
  return out;
}

/* Browser equivalent of department-workflows.actionableCounts. It keeps the
   source data local, then applies the same authorization scope before a count
   reaches the badge or alert. */
function actionableCountsForViewer() {
  const result = { requests: 0, conflicts: 0, total: 0, byDepartment: {}, message: '' };
  const actor = authActor();
  const allowed = authorizedDepartments().filter(department => department !== 'All');
  if (!actor || !allowed.length) return result;
  const admin = canPermission('isAdmin', actor);
  const canSee = item => {
    const departments = actionableDepartments(item);
    if (admin) return true;
    return departments.some(department => allowed.indexOf(department) !== -1);
  };
  const add = (kind, item) => {
    const departments = actionableDepartments(item);
    if (!canSee(item)) return;
    result[kind] += 1;
    result.total += 1;
    (departments.length ? departments : ['unassigned']).forEach(department => {
      if (!result.byDepartment[department]) result.byDepartment[department] = { requests: 0, conflicts: 0 };
      result.byDepartment[department][kind] += 1;
    });
  };
  const seenRequests = {};
  (state.requests || []).forEach(request => {
    if (!requestIsActionable(request)) return;
    const id = request.id || [request.name, request.date, request.service, request.duty].join('|');
    if (seenRequests[id]) return;
    seenRequests[id] = true;
    add('requests', request);
  });
  const seenConflicts = {};
  (state.services || []).forEach(service => {
    if (!service || service.date < todayISO() || !manageServiceVisible(service)) return;
    activeConflicts(service).forEach(conflict => {
      const id = [svcId(service), conflict.name, conflict.duties.join('|')].join('|');
      if (seenConflicts[id]) return;
      seenConflicts[id] = true;
      add('conflicts', Object.assign({}, conflict, {
        serviceId: svcId(service), date: service.date, service: service.service,
        duties: conflict.duties
      }));
    });
  });
  const parts = [];
  if (result.requests) parts.push(result.requests + ' request' + (result.requests === 1 ? '' : 's'));
  if (result.conflicts) parts.push(result.conflicts + ' conflict' + (result.conflicts === 1 ? '' : 's'));
  if (parts.length) result.message = parts.join(' and ') + ' ' + (result.total === 1 ? 'needs' : 'need') + ' your attention';
  return result;
}

function renderManage() {
  if (!isVerifiedSession() || isForcedSession() || !canManageAnyDepartment()) {
    return '<div class="empty">You do not have access to Manage.</div>';
  }
  const actionableCounts = actionableCountsForViewer();
  const pendingCount = actionableCounts.requests;
  const conflictCount = actionableCounts.conflicts;
  const departments = authorizedDepartments();
  const selectedDepartment = selectedManageDepartment();
  if (selectedDepartment && selectedDepartment !== 'All' && ['departments', 'services', 'planning'].indexOf(ui.sub) !== -1) {
    loadDepartmentRoster(selectedDepartment).catch(() => {});
  } else if (selectedDepartment === 'All' && ['services', 'planning'].indexOf(ui.sub) !== -1 && canPermission('isAdmin', authActor())) {
    CATEGORIES.forEach(category => loadDepartmentRoster(category.name).catch(() => {}));
  }
  const departmentOptions = departments.map(department =>
    '<option value="' + esc(department) + '"' + (selectedDepartment === department ? ' selected' : '') + '>' +
    esc(department === 'All' ? 'All Departments' : department) + '</option>'
  ).join('');
  const isAdministrator = canPermission('isAdmin', authActor());
  const subs = [['departments', 'Departments'], ['services', 'Services'],
    ['planning', 'Planning' + (conflictCount > 0 ? ' (' + conflictCount + ')' : '')],
    ['requests', 'Requests' + (pendingCount > 0 ? ' (' + pendingCount + ')' : '')]];
  if (canPermission('canManageLeaders', authActor())) subs.push(['leaders', 'Leader config']);
  if (isAdministrator) subs.push(['features', 'Features'], ['data', 'Data & Sync']);
  let html = '<div class="me-picker"><label for="manage-dept">Manage department</label>' +
    '<select id="manage-dept" data-chg="manage-dept">' + departmentOptions + '</select></div>' +
    '<div class="subnav">' + subs.map(s =>
    '<button data-act="sub" data-sub="' + s[0] + '"' + (ui.sub === s[0] ? ' class="active"' : '') + '>' + s[1] + '</button>').join('') +
    '<button class="lock-btn" data-act="member-logout">Sign out</button>' +
    '</div>';
  if (ui.sub === 'departments') html += renderDepartmentWorkspace();
  else if (ui.sub === 'services') html += renderManageServices();
  else if (ui.sub === 'planning') html += renderManagePlanning();
  else if (ui.sub === 'requests') html += renderManageRequests();
  else if (ui.sub === 'people') html += renderDepartmentWorkspace();
  else if (ui.sub === 'leaders' && canPermission('canManageLeaders', authActor())) html += renderLeaderConfig();
  else if (ui.sub === 'features' && canPermission('isAdmin', authActor())) html += renderFeatures();
  else if (ui.sub === 'data' && canPermission('isAdmin', authActor())) html += renderManageData();
  else html += renderManageServices();
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
    '<p class="hint">No passcode exists yet. Whoever sets it first becomes the editor. Afterwards it is required to open Manage on any device.</p>' +
    '<form class="add-row" data-act="set-pin">' +
    '<input type="password" id="pin-new" aria-label="New editor passcode" placeholder="New passcode" autocomplete="off" required>' +
    '<input type="password" id="pin-confirm" aria-label="Repeat new editor passcode" placeholder="Repeat it" autocomplete="off" required>' +
    '<button class="primary" type="submit">Set passcode</button></form>' +
    (ui.pinError ? '<p class="pin-error">' + esc(ui.pinError) + '</p>' : '') +
    '</div>';
}

function manageDepartment() {
  const department = selectedManageDepartment();
  return department === 'All' ? '' : department;
}

function manageCategories() {
  const department = manageDepartment();
  return CATEGORIES.filter(category => !department || category.name === department);
}

function manageServiceVisible(service) {
  const department = manageDepartment();
  if (!department) return true;
  const assignments = service && service.assignments || {};
  const roster = (state.departments && state.departments[department]) || [];
  return Object.keys(assignments).some(duty => actionableDepartmentForDuty(duty) === department ||
    (assignments[duty] && roster.indexOf(assignments[duty]) !== -1));
}

function manageRequestVisible(request) {
  return !!request && canPermission('canResolveRequest', authActor(), request);
}

function manageMemberVisible(name) {
  const department = manageDepartment();
  if (!department) return true;
  return ((state.departments || {})[department] || []).indexOf(name) !== -1;
}

function renderFeatures() {
  let html = '<p class="hint">Turn features on or off for the whole congregation. Changes apply to everyone instantly.</p>';
  FEATURES.forEach(f => {
    html += '<div class="card feature-row">' +
      '<div><div class="f-label">' + esc(f.label) + '</div><div class="f-desc">' + esc(f.desc) + '</div></div>' +
      '<label class="switch"><input type="checkbox" data-chg="feature" data-id="' + f.id + '"' +
      ' aria-label="' + esc(f.label) + '"' + (feat(f.id) ? ' checked' : '') + '><span class="track"></span></label>' +
      '</div>';
  });
  html += '<div class="card"><div class="f-label">Change the editor passcode</div>' +
    '<form class="add-row" style="margin-top:12px" data-act="change-pin">' +
    '<input type="password" id="pin-change" aria-label="New editor passcode" placeholder="New passcode" autocomplete="off" required>' +
    '<button class="ghost" type="submit">Change</button></form></div>';
  html += '<div class="card"><div class="f-label">Change the site passcode</div>' +
    '<div class="f-desc">The 4-digit code everyone enters to open the app.</div>' +
    '<form class="add-row" style="margin-top:12px" data-act="change-site-pin">' +
    '<input type="password" id="site-pin-change" aria-label="New site passcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="New passcode" autocomplete="off" required>' +
    '<button class="ghost" type="submit">Change</button></form></div>';
  html += '<div class="card"><div class="f-label">Scheduler</div>' +
    '<div class="f-desc">Who receives a notification when a member submits a change request.</div>' +
    '<select data-chg="scheduler-name" style="margin-top:10px">' +
    '<option value="">None</option>' +
    state.members.map(m => '<option value="' + esc(m) + '"' + (m === (state.settings.schedulerName || '') ? ' selected' : '') + '>' + esc(memberLabel(m)) + '</option>').join('') +
    '</select></div>';
  return html;
}

function renderLeaderConfig() {
  if (!canPermission('canManageLeaders', authActor())) return '<div class="empty">Leader configuration is restricted.</div>';
  const config = permissionConfig();
  const leaders = config.departmentLeaders || {};
  let html = '<div class="card"><div class="f-label">Department leaders</div>' +
    '<p class="hint">Only assigned leaders are listed. Add or remove access without searching through the whole congregation.</p>';
  CATEGORIES.forEach(category => {
    const names = Array.isArray(leaders[category.name]) ? leaders[category.name] : [];
    const available = state.members.filter(member => names.indexOf(member) === -1);
    html += '<section class="list-row" style="display:block"><div style="font-weight:650;margin-bottom:8px">' + esc(category.name) + '</div>' +
      (names.length ? names.map(member => '<div class="role-assignment"><span>' + esc(memberLabel(member)) + '</span>' +
        '<button class="danger-link" data-act="role-config-remove" data-role="departmentLeader" data-dept="' + esc(category.name) + '" data-name="' + esc(member) + '">Remove</button></div>').join('') : '<p class="hint">No leader assigned.</p>') +
      (available.length ? '<form class="add-row role-add" data-act="role-config-add" data-role="departmentLeader" data-dept="' + esc(category.name) + '">' +
        '<select aria-label="Add ' + esc(category.name) + ' leader" required><option value="">Choose a member</option>' +
        available.map(member => '<option value="' + esc(member) + '">' + esc(memberLabel(member)) + '</option>').join('') + '</select>' +
        '<button class="ghost" type="submit">Add leader</button></form>' : '') + '</section>';
  });
  const songEditors = Array.isArray(config.songEditors) ? config.songEditors : [];
  html += '</div><div class="card"><div class="f-label">Choir song editors</div>' +
    '<p class="hint">Song editors can change songs only. They do not receive Worship management access.</p>' +
    (songEditors.length ? songEditors.map(member => '<div class="role-assignment"><span>' + esc(memberLabel(member)) + '</span>' +
      '<button class="danger-link" data-act="role-config-remove" data-role="songEditor" data-name="' + esc(member) + '">Remove</button></div>').join('') : '<p class="hint">No song editor assigned.</p>') +
    '<form class="add-row role-add" data-act="role-config-add" data-role="songEditor">' +
      '<select aria-label="Add choir song editor" required><option value="">Choose a member</option>' +
      state.members.filter(member => songEditors.indexOf(member) === -1).map(member => '<option value="' + esc(member) + '">' + esc(memberLabel(member)) + '</option>').join('') + '</select>' +
      '<button class="ghost" type="submit">Add editor</button></form></div>';
  return html;
}

/* Coordinator Planning View: every upcoming double-duty conflict with
   one-tap substitutes, unfilled slots for the next 4 weeks, and the
   whole-roster workload table. */
function renderManagePlanning() {
  const t = todayISO();
  const stats = workloadStats();
  const upcoming = state.services
    .filter(s => s.date >= t)
    .filter(manageServiceVisible)
    .sort((a, b) => a.date.localeCompare(b.date) || SERVICE_LABELS.indexOf(a.service) - SERVICE_LABELS.indexOf(b.service));

  /* --- conflicts, with suggested subs --- */
  let confHtml = '';
  upcoming.forEach(svc => {
    activeConflicts(svc).filter(c => canPermission('canAcknowledgeConflict', authActor(), Object.assign({}, c, {
      serviceId: svcId(svc), date: svc.date, service: svc.service
    }))).forEach(c => {
      confHtml += '<div class="card plan-conflict"><div class="req-head"><span class="req-when"><b>' + esc(memberLabel(c.name)) + '</b> | ' +
        c.duties.map(esc).join(' + ') + '</span><span class="status-chip pending">Unresolved</span></div>' +
        '<div class="req-note" style="margin-top:2px">' + esc(svc.worship) + ' ' + esc(svc.service) + ', ' + esc(fmtDate(svc.date)) + '</div>';
      c.duties.forEach(duty => {
        const subs = suggestSubs(svc, duty, c.name, stats);
        confHtml += '<div class="plan-suggest"><span class="lab">' + esc(duty) + ' →</span> ' +
          (subs.length
            ? subs.map(profile => '<button class="ghost mini" data-act="plan-assign" data-svc="' + svcId(svc) +
                '" data-duty="' + esc(duty) + '" data-uid="' + esc(profile.memberUid) + '">' + esc(memberLabel(profile.memberName)) + '</button>').join(' ')
            : '<span class="plan-duties">no free member in this department</span>') +
          '</div>';
      });
      confHtml += '<div class="req-actions-row"><button class="ghost" data-act="req-open-service" data-svc="' + esc(svcId(svc)) + '">Open service</button>' +
        '<button class="linkish" data-act="conflict-ok" data-svc="' + esc(svcId(svc)) + '" data-name="' + esc(c.name) + '">Mark as OK</button></div></div>';
    });
  });
  let html = '<div class="f-label">Double-duty conflicts, upcoming</div>' +
    '<div class="f-desc">Review each double, open its service, or tap a suggested substitute. Already-acknowledged doubles are not listed.</div>' +
    (confHtml || '<div class="empty">No unresolved double-bookings. 🎉</div>');

  /* --- unfilled slots, next 28 days --- */
  /* A service only "expects" the duties that comparable services actually
     staff. Expected = duties filled in >=50% of PLANNED services of the same
     worship|service type. This avoids flagging roles a service never uses
     (e.g. Media/Translation on a weekday), which previously marked every
     service "unfilled". Fully-empty (not-yet-planned) services are skipped,
     that's a different signal than a partially-planned service with a gap. */
  const expFilled = {}, expCount = {};
  (state.services || []).forEach(s => {
    const assigned = Object.keys(s.assignments || {}).filter(d => s.assignments[d]);
    if (!assigned.length) return;
    const key = (s.worship || '') + '|' + (s.service || '');
    expCount[key] = (expCount[key] || 0) + 1;
    const f = expFilled[key] || (expFilled[key] = {});
    assigned.forEach(d => { f[d] = (f[d] || 0) + 1; });
  });
  const expectedDuties = svc => {
    const key = (svc.worship || '') + '|' + (svc.service || '');
    const f = expFilled[key] || {}, n = expCount[key] || 0;
    return n ? ALL_DUTIES_ORDER.filter(d => (f[d] || 0) * 2 >= n) : [];
  };
  const horizon = (() => { const d = new Date(); d.setDate(d.getDate() + 28); return toISO(d); })();
  let gapHtml = '';
  upcoming.filter(s => s.date <= horizon).forEach(svc => {
    const a = svc.assignments || {};
    if (!Object.keys(a).some(d => a[d])) return; // not yet planned, different signal
    const missing = expectedDuties(svc).filter(d => !a[d]);
    if (missing.length) {
      gapHtml += '<div class="plan-suggest"><span class="lab">' + esc(fmtDate(svc.date)) + ' · ' + esc(svc.service) + '</span> ' +
        '<span class="plan-duties">' + missing.length + ' unfilled: ' + missing.map(esc).join(', ') + '</span></div>';
    }
  });
  html += '<div class="card"><div class="f-label">Unfilled duties, next 4 weeks</div>' +
    (gapHtml || '<p class="hint" style="margin-top:12px">Every planned service has its usual duties filled.</p>') + '</div>';

  /* --- workload table --- */
  const rows = Object.keys(stats)
    .map(m => ({ m, s: stats[m] }))
    .filter(r => manageMemberVisible(r.m) && (r.s.total > 0 || state.members.indexOf(r.m) !== -1))
    .sort((a, b) => (b.s.past8 + b.s.upcoming) - (a.s.past8 + a.s.upcoming) || a.m.localeCompare(b.m));
  html += '<div class="card"><div class="f-label">Workload, who is carrying what</div>' +
    '<div class="f-desc">Duty counts. Sorted heaviest first (last 8 weeks + upcoming).</div>' +
    '<div class="plan-scroll"><table class="plan-table"><tr>' +
    '<th>Member</th><th>4 wk</th><th>8 wk</th><th>Upcoming</th><th>Year</th><th>Last served</th><th>Next</th></tr>' +
    rows.map(r => {
      const s = r.s;
      const flag = s.upcoming === 0 ? ' <span class="warn-badge" title="Nothing upcoming">·</span>' : '';
      return '<tr' + (s.past8 + s.upcoming === 0 ? ' class="plan-idle"' : '') + '><td>' + esc(r.m) + flag + '</td>' +
        '<td>' + s.past4 + '</td><td>' + s.past8 + '</td><td>' + s.upcoming + '</td><td>' + s.total + '</td>' +
        '<td>' + (s.last ? esc(fmtDate(s.last)) : '-') + '</td>' +
        '<td>' + (s.next ? esc(fmtDate(s.next)) : '-') + '</td></tr>';
    }).join('') +
    '</table></div></div>';
  return html;
}

function memberSelect(svc, duty) {
  const cur = (svc.assignments || {})[duty] || '';
  const conflicted = feat('conflictWarnings') && cur && activeConflicts(svc).some(c => c.name === cur);
  const cat = dutyCategory(duty);
  const roster = departmentProfiles(cat.name);
  const candidates = roster.filter(profile => departmentProfileAssignable(profile, svc, duty));
  const currentProfile = departmentProfileByName(cat.name, cur);
  const currentIsCandidate = !!(currentProfile && candidates.some(profile => profile.memberUid === currentProfile.memberUid));
  let options = candidates.map(profile => '<option value="' + esc(profile.memberUid) + '"' +
    (currentIsCandidate && currentProfile.memberUid === profile.memberUid ? ' selected' : '') + '>' + esc(memberLabel(profile.memberName)) + '</option>');
  if (cur && !currentIsCandidate) {
    options.unshift('<option value="" selected disabled>Current assignment: ' + esc(memberLabel(cur)) + ' (review required)</option>');
  }
  if (!roster.length) options = ['<option value="" selected disabled>' + (departmentRuntime.loading[cat.name] ? 'Loading secure roster...' : 'Open this department to load the secure roster') + '</option>'];
  const select = '<select data-chg="assign" data-svc="' + svcId(svc) + '" data-duty="' + esc(duty) + '"' +
    (conflicted ? ' class="conflict"' : '') + '>' +
    '<option value="">-</option>' +
    options.join('') + '</select>';
  const canOverride = canPermission('isAdmin', authActor()) && roster.length && roster.some(profile => !candidates.some(candidate => candidate.memberUid === profile.memberUid));
  if (!canOverride) return select;
  const targetId = 'department-override-target-' + slugify(svcId(svc) + '-' + duty);
  const reasonId = 'department-override-reason-' + slugify(svcId(svc) + '-' + duty);
  const overrideOptions = roster.map(profile => '<option value="' + esc(profile.memberUid) + '">' + esc(memberLabel(profile.memberName)) +
    (departmentProfileAssignable(profile, svc, duty) ? ' (normal choice)' : ' (override required)') + '</option>').join('');
  return select + '<details class="department-override"><summary>Administrator override</summary>' +
    '<p class="department-override-warning">Use only when the normal eligibility, schedulability, or availability rules must be overridden. This records an audit event and never changes the member profile.</p>' +
    '<label for="' + targetId + '">Member</label><select id="' + targetId + '">' + overrideOptions + '</select>' +
    '<label for="' + reasonId + '">Reason</label><input id="' + reasonId + '" type="text" maxlength="240" placeholder="Required audit reason">' +
    '<button class="ghost mini" data-act="department-override-submit" data-svc="' + esc(svcId(svc)) + '" data-duty="' + esc(duty) + '" data-target="' + targetId + '" data-reason="' + reasonId + '">Record override and assign</button></details>';
}

/* Conflict notes for Manage cards. `expanded` controls whether OK/undo actions & muted "marked OK" lines show. */
function renderManageConflicts(svc, expanded) {
  if (!feat('conflictWarnings')) return '';
  const id = svcId(svc);
  const ok = svc.conflictOk || {};
  let html = '';
  activeConflicts(svc).filter(c => canPermission('canAcknowledgeConflict', authActor(), Object.assign({}, c, {
    serviceId: id, date: svc.date, service: svc.service
  }))).forEach(c => {
    html += '<div class="conflict-note"><span class="dot-c" style="background:var(--warn)"></span>' +
      esc(memberLabel(c.name)) + ' has ' + c.duties.length + ' duties this service' +
      (expanded ? ' <button class="linkish" data-act="conflict-ok" data-svc="' + id + '" data-name="' + esc(c.name) + '">Mark as OK</button>' : '') +
      '</div>';
  });
  if (expanded) {
    conflictsFor(svc).filter(c => sameDuties(ok[c.name], c.duties) && canPermission('canAcknowledgeConflict', authActor(), Object.assign({}, c, {
      serviceId: id, date: svc.date, service: svc.service
    }))).forEach(c => {
      html += '<div class="conflict-note ok">' + esc(memberLabel(c.name)) + ' has ' + c.duties.length + ' duties (marked OK) ' +
        '<button class="linkish" data-act="conflict-unok" data-svc="' + id + '" data-name="' + esc(c.name) + '">show warning again</button></div>';
    });
  }
  return html;
}

function reqSubmittedAt(r) {
  return new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderManageRequests() {
  const all = state.requests.filter(manageRequestVisible).slice().sort((a, b) => b.createdAt - a.createdAt);
  const pending = all.filter(requestIsActionable);
  const resolved = all.filter(r => !requestIsActionable(r));

  let html = '<p class="hint">Members can request a schedule change from My Duties. Approving here does not edit the schedule, ' +
    'open the service in <b>Services</b> to make the actual change.</p>';

  if (!pending.length) {
    html += '<div class="empty">No pending requests.</div>';
  } else {
    pending.forEach(r => {
      html += '<div class="card">' +
        '<div class="req-head"><span class="req-when">' + esc(memberLabel(r.name)) + ' | ' + esc(r.duty) + '</span>' + statusChip(r.status) + '</div>' +
        '<div class="req-note" style="margin-top:2px">' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) + '</div>' +
        (r.note ? '<div class="req-note">' + esc(r.note) + '</div>' : '') +
        '<div class="req-meta">Submitted ' + esc(reqSubmittedAt(r)) + '</div>' +
        '<div class="req-actions-row">' +
        '<button class="primary" data-act="req-approve" data-id="' + esc(r.id) + '">Approve</button>' +
        '<button class="danger-link" data-act="req-decline" data-id="' + esc(r.id) + '">Decline</button>' +
        '<button class="ghost" data-act="req-open-service" data-svc="' + esc(r.svcId) + '">Open service</button>' +
        '</div></div>';
    });
  }

  if (resolved.length) {
    const open = ui.expanded['req-resolved'];
    html += '<button class="linkish" data-act="expand" data-id="req-resolved">' +
      (open ? 'Hide resolved requests' : 'Show ' + Math.min(resolved.length, 10) + ' resolved request' + (resolved.length > 1 ? 's' : '')) +
      '</button>';
    if (open) {
      resolved.slice(0, 10).forEach(r => {
        const when = r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        html += '<div class="req-item">' +
          '<div class="req-head"><span class="req-when">' + esc(memberLabel(r.name)) + ' | ' + esc(r.duty) + '</span>' + statusChip(effectiveRequestStatus(r)) + '</div>' +
          '<div class="req-meta">' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) +
          (when ? ' · resolved ' + esc(when) + ((r.resolvedByName || r.resolvedBy) ? ' by ' + esc(r.resolvedByName || r.resolvedBy) : '') : '') + '</div>' +
          '</div>';
      });
    }
  }
  return html;
}

function renderManageServices() {
  const canCreate = canPermission('canCreateService', authActor());
  let html = canCreate ? '<form class="add-row" data-act="add-service">' +
    '<input type="date" id="svc-date" required value="' + todayISO() + '">' +
    '<input type="time" id="svc-time" required value="09:00">' +
    '<select id="svc-label">' + SERVICE_LABELS.map(l => '<option>' + l + '</option>').join('') + '</select>' +
    '<input type="text" id="svc-worship" list="worship-types" placeholder="Worship (e.g. Sabbath Day)" value="Sabbath Day">' +
    '<datalist id="worship-types">' + WORSHIP_TYPES.map(w => '<option>' + esc(w) + '</option>').join('') + '</datalist>' +
    '<button class="primary" type="submit">Add</button></form>' :
    '<p class="hint">Select a service to edit duties in your authorized department.</p>';

  const up = upcomingServices().filter(manageServiceVisible);
  if (!up.length) html += '<div class="empty">No upcoming services. Add one above.</div>';
  let lastDate = '';
  up.forEach(svc => {
    if (svc.date !== lastDate) {
      lastDate = svc.date;
      html += '<div class="date-head"><span class="day">' + esc(fmtDate(svc.date)) + '</span></div>';
    }
    const id = svcId(svc);
    const open = ui.expanded['m:' + id];
    html += '<div class="card">' +
      '<button type="button" class="card-head" data-act="expand" data-id="m:' + id + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="svc-title">' + esc(svc.worship) + ' <small>· ' + esc(svc.service) + '</small></span>' +
      '<span class="time">' + fmtTime(svc.time) + ' ' + (open ? '▲' : '▼') + '</span></button>';
    if (open) {
        html += '<div class="edit-grid">' +
        '<span class="lab">Date</span><input type="date" value="' + esc(svc.date) + '" data-chg="svc-field" data-svc="' + id + '" data-field="date"' + (canPermission('isAdmin', authActor()) ? '' : ' disabled') + '>' +
        '<span class="lab">Time</span><input type="time" value="' + esc(svc.time) + '" data-chg="svc-field" data-svc="' + id + '" data-field="time"' + (canPermission('isAdmin', authActor()) ? '' : ' disabled') + '>' +
        '<span class="lab">Worship</span><input type="text" value="' + esc(svc.worship) + '" data-chg="svc-field" data-svc="' + id + '" data-field="worship"' + (canPermission('isAdmin', authActor()) ? '' : ' disabled') + '>' +
        (canEditSongService(svc) ? '<span class="lab">Choir song</span><input type="text" value="' + esc(svc.choirSong || '') + '" placeholder="e.g. #311 I Repent of My Sin" data-chg="svc-field" data-svc="' + id + '" data-field="choirSong">' : '') +
        '</div>';
      manageCategories().forEach(cat => {
        html += '<div class="cat-edit-label"><span class="dot-c" style="background:' + cat.color + '"></span>' + esc(cat.name) + '</div>' +
          '<div class="edit-grid">' +
          cat.duties.map(duty => '<span class="lab">' + esc(duty) + '</span>' + memberSelect(svc, duty)).join('') +
          '</div>';
      });
      html += renderManageConflicts(svc, true);
      html += '<div style="text-align:right;margin-top:12px"><button class="danger-link" data-act="del-service" data-svc="' + id + '">Delete this service</button></div>';
    } else {
      html += renderCatRows(svc, false, manageDepartment() || undefined);
    }
    html += '</div>';
  });
  return html;
}

function renderManagePeople() {
  return renderDepartmentWorkspace();
}

function departmentAttribution(profile) {
  const attribution = profile && profile.attribution || {};
  const by = profile && (profile.updatedBy || attribution.updatedBy || profile.updatedByUid);
  const at = profile && (profile.updatedAt || attribution.updatedAt);
  if (!by && !at) return 'No change attribution returned yet.';
  const when = Number.isFinite(Number(at)) ? new Date(Number(at)).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }) : 'time unavailable';
  return 'Last changed by ' + (by ? esc(by) : 'account unavailable') + ' on ' + esc(when) + '.';
}

function departmentStatusBadge(profile) {
  const active = profile && profile.status === 'active';
  return '<span class="department-status ' + (active ? 'active' : 'inactive') + '">' + (active ? 'Active' : 'Inactive') + '</span>';
}

function departmentProfileSummary(profile) {
  const duties = Array.isArray(profile && profile.eligibleDuties) ? profile.eligibleDuties : [];
  const availability = profile && profile.availability || { recurring: {}, exceptions: {} };
  const recurring = Object.keys(availability.recurring || {}).filter(key => availability.recurring[key] === 'available');
  const exceptionCount = Object.keys(availability.exceptions || {}).length;
  return (profile && profile.schedulable ? 'Schedulable' : 'Not schedulable') +
    ' · ' + duties.length + ' eligible dut' + (duties.length === 1 ? 'y' : 'ies') +
    ' · ' + recurring.length + ' recurring time' + (recurring.length === 1 ? '' : 's') +
    (exceptionCount ? ' · ' + exceptionCount + ' date exception' + (exceptionCount === 1 ? '' : 's') : '');
}

function renderDepartmentProfileRow(profile, options = {}) {
  const memberUid = profile.memberUid;
  const isLeader = departmentProfileIsLeader(profile);
  const canEdit = options.canEdit === true;
  return '<div class="department-member-row ' + (profile.status === 'inactive' ? 'is-inactive' : '') + '">' +
    '<button class="department-member-open" data-act="department-member-open" data-uid="' + esc(memberUid) + '" aria-label="Open ' + esc(memberLabel(profile.memberName)) + ' profile">' +
    '<span class="department-member-name">' + esc(memberLabel(profile.memberName)) + '</span>' +
    (isLeader ? '<span class="department-role">Leader</span>' : '') +
    '</button>' +
    '<span class="department-member-meta">' + departmentStatusBadge(profile) + '<span>' + esc(departmentProfileSummary(profile)) + '</span></span>' +
    (canEdit ? '<button class="ghost mini" data-act="department-status" data-uid="' + esc(memberUid) + '" data-status="' + (profile.status === 'active' ? 'inactive' : 'active') + '">' + (profile.status === 'active' ? 'Archive' : 'Restore') + '</button>' : '') +
    '</div>';
}

function renderManageDepartments() {
  const departments = authorizedDepartments().filter(department => department !== 'All');
  if (!departments.length) return '<div class="empty">No department leadership scope is attached to this account.</div>';
  let html = '<div class="department-scope card"><div class="department-eyebrow">Leader-scoped workspace</div>' +
    '<h2>Departments</h2><p class="hint">Only departments returned by your verified account are shown. Each card opens a department-scoped roster.</p>' +
    '<p class="department-security-note">Roster profiles are loaded by department and UID. No congregation-wide member list is used here.</p></div>';
  html += '<div class="department-card-grid">' + departments.map(department => {
    const profiles = departmentProfiles(department);
    const leaders = profiles.filter(departmentProfileIsLeader);
    const loaded = Array.isArray(departmentRuntime.rosters[department]);
    const count = loaded ? profiles.length + ' profile' + (profiles.length === 1 ? '' : 's') : 'Roster not loaded';
    const leaderText = loaded
      ? (leaders.length ? leaders.map(profile => memberLabel(profile.memberName)).join(', ') : 'No leader record returned')
      : 'Secure roster loads when opened';
    return '<article class="department-card card" data-department="' + esc(department) + '">' +
      '<div class="department-card-top"><span class="department-dot" aria-hidden="true"></span><span class="department-eyebrow">Department</span></div>' +
      '<h3>' + esc(department) + '</h3><p class="department-card-copy">' + esc(count) + '</p>' +
      '<p class="department-card-leader"><strong>Leaders</strong> ' + esc(leaderText) + '</p>' +
      '<button class="primary" data-act="department-open" data-department="' + esc(department) + '">Open department</button>' +
      '</article>';
  }).join('') + '</div>';
  return html;
}

function renderDepartmentLoading(department) {
  if (departmentRuntime.loading[department]) {
    return '<div class="card department-loading" role="status"><div class="department-eyebrow">' + esc(department) + '</div><h2>Loading department roster</h2><p class="hint">The secure roster is being requested for this department only.</p><span class="department-spinner" aria-hidden="true"></span></div>';
  }
  const error = departmentRuntime.errors[department];
  if (error) {
    return '<div class="card department-error" role="alert"><h2>Roster unavailable</h2><p class="hint">' + esc(error) + '</p><button class="primary" data-act="department-retry" data-department="' + esc(department) + '">Try again</button></div>';
  }
  return '';
}

function renderDepartmentRosterGroup(label, profiles, canEdit) {
  if (!profiles.length) return '<section class="department-group"><h3>' + esc(label) + '</h3><p class="department-empty-note">No profiles in this group.</p></section>';
  return '<section class="department-group"><div class="department-group-heading"><h3>' + esc(label) + '</h3><span>' + profiles.length + '</span></div>' +
    profiles.map(profile => renderDepartmentProfileRow(profile, { canEdit })).join('') + '</section>';
}

function renderManageDepartment() {
  const department = selectedManageDepartment();
  if (!department || department === 'All') return renderManageDepartments();
  const loading = renderDepartmentLoading(department);
  if (loading) return '<button class="linkish department-back" data-act="department-back">Back to departments</button>' + loading;
  const profiles = departmentProfiles(department).slice().sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
    return String(left.memberName).localeCompare(String(right.memberName));
  });
  const leaders = profiles.filter(departmentProfileIsLeader);
  const canEdit = canManageSelectedDepartment(department);
  let html = '<button class="linkish department-back" data-act="department-back">Back to departments</button>' +
    '<section class="department-hero card"><div class="department-eyebrow">Department roster</div><h2>' + esc(department) + '</h2>' +
    '<p class="hint">This page shows the leaders and active or inactive profiles returned for ' + esc(department) + '.</p>' +
    '<div class="department-leader-strip"><strong>Leaders</strong><span>' + (leaders.length ? leaders.map(profile => esc(memberLabel(profile.memberName))).join(', ') : 'No leader record returned by the secure roster') + '</span></div>' +
    '<p class="department-attribution">Roster read is scoped to <code>' + esc(department) + '</code>. Profile changes carry UID and timestamp attribution.</p></section>';
  if (canEdit) {
    html += '<form class="card department-add-form" data-act="department-member-add"><div class="department-eyebrow">Add a department member</div><h3>Add by verified member UID</h3>' +
      '<p class="hint">A UID is the member identity used by the secure callable. Adding a profile does not grant a leadership role.</p>' +
      '<div class="department-form-grid"><label>Member UID<input id="department-member-uid" type="text" required maxlength="128" autocomplete="off" placeholder="Firebase member UID"></label>' +
      '<label>Display name<input id="department-member-name" type="text" required maxlength="160" autocomplete="off" placeholder="Name shown to leaders"></label></div>' +
      '<button class="primary" type="submit">Add member profile</button></form>';
  }
  html += '<div class="department-roster-groups">' +
    renderDepartmentRosterGroup('Active profiles', profiles.filter(profile => profile.status === 'active'), canEdit) +
    renderDepartmentRosterGroup('Inactive profiles', profiles.filter(profile => profile.status !== 'active'), canEdit) +
    '</div>';
  return html;
}

function departmentTimeOptions(profile, includeAny) {
  const keys = new Set(SERVICE_LABELS.map(departmentServiceTimeKey));
  Object.keys(profile && profile.availability && profile.availability.recurring || {}).forEach(key => keys.add(key));
  Object.keys(profile && profile.availability && profile.availability.exceptions || {}).forEach(date =>
    Object.keys(profile.availability.exceptions[date] || {}).forEach(key => keys.add(key)));
  const ordered = Array.from(keys).filter(Boolean).sort((left, right) => left.localeCompare(right));
  if (includeAny) ordered.unshift('*');
  return ordered.map(key => '<option value="' + esc(key) + '">' + esc(departmentServiceTimeLabel(key)) + '</option>').join('');
}

function departmentHistoryEntries(profile) {
  const seed = profile && (profile.historySeed || profile.provenance);
  if (seed && Array.isArray(seed.evidence)) return seed.evidence;
  return profile && Array.isArray(profile.history) ? profile.history : [];
}

function departmentHistoryDate(value) {
  const raw = String(value == null ? '' : value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? fmtDate(raw) : raw;
}

function renderDepartmentHistory(profile) {
  const evidence = departmentHistoryEntries(profile);
  if (!evidence.length) return '';
  const rows = evidence.map(entry => {
    const duty = String(entry && (entry.duty || entry.role) || 'Historical duty').trim();
    const details = [
      entry && entry.service,
      entry && (entry.serviceTime || entry.time) && departmentServiceTimeLabel(entry.serviceTime || entry.time),
      entry && entry.date && departmentHistoryDate(entry.date),
      entry && entry.result
    ].map(value => String(value == null ? '' : value).trim()).filter(Boolean);
    return '<li><strong>' + esc(duty) + '</strong><span>' + esc(details.join(' · ') || 'Historical assignment') + '</span></li>';
  }).join('');
  return '<section class="card department-history"><div class="department-eyebrow">History and provenance</div><h3>Historical duty suggestions</h3><p class="hint">Past assignments suggest duties for review. They never override a member or leader decision.</p><ul class="department-history-list">' + rows + '</ul></section>';
}

function renderOwnAvailabilityProfile(profile) {
  const department = profile.departmentId;
  const memberUid = profile.memberUid;
  const draft = departmentDraftProfile(department, memberUid) || profile;
  const recurring = draft.availability && draft.availability.recurring || {};
  const exceptions = draft.availability && draft.availability.exceptions || {};
  const draftExists = !!departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  const fieldAttribution = draft.fieldAttribution && draft.fieldAttribution.availability;
  const recurringControls = SERVICE_LABELS.map(label => {
    const key = departmentServiceTimeKey(label);
    const status = recurring[key] || 'unavailable';
    return '<label class="department-availability-row"><span>' + esc(label) + '</span><select data-chg="member-availability-recurring" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-key="' + esc(key) + '"><option value="available"' + (status === 'available' ? ' selected' : '') + '>Available</option><option value="unavailable"' + (status !== 'available' ? ' selected' : '') + '>Unavailable</option></select></label>';
  }).join('');
  const exceptionRows = Object.keys(exceptions).sort().map(date => Object.keys(exceptions[date] || {}).sort().map(key =>
    '<div class="department-exception-row"><span><strong>' + esc(departmentHistoryDate(date)) + '</strong><small>' + esc(departmentServiceTimeLabel(key)) + '</small></span><span class="department-exception-status ' + (exceptions[date][key] === 'available' ? 'available' : 'unavailable') + '">' + esc(exceptions[date][key]) + '</span><button class="danger-link" data-act="member-availability-exception-remove" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-date="' + esc(date) + '" data-key="' + esc(key) + '">Remove</button></div>'
  ).join('')).join('');
  const attributionProfile = fieldAttribution && !profile.updatedAt
    ? Object.assign({}, profile, { updatedBy: fieldAttribution.by, updatedAt: fieldAttribution.at })
    : profile;
  const attribution = departmentAttribution(attributionProfile);
  return '<section class="card department-editor own-availability-card" data-department="' + esc(department) + '" data-member-uid="' + esc(memberUid) + '"><div class="department-section-heading"><div><div class="department-eyebrow">Shared availability</div><h2>Your availability</h2></div><span class="department-editor-state">' + (draftExists ? 'Unsaved changes' : 'Saved profile') + '</span></div><p class="hint">You can update this shared record. Your department leader can update the same record from Manage. Status, duties, and schedulability stay leader-controlled.</p><p class="department-attribution">' + attribution + '</p><h3>Recurring service times</h3><div class="department-availability-grid">' + recurringControls + '</div><h3 style="margin-top:18px">Date exceptions</h3><p class="hint">A date exception overrides the recurring choice for that service date.</p><div class="department-exceptions">' + (exceptionRows || '<p class="department-empty-note">No date exceptions.</p>') + '</div><form class="department-exception-form" data-act="member-availability-exception-add" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"><input type="date" required aria-label="Exception date"><select aria-label="Exception service time">' + departmentTimeOptions(draft, true) + '</select><select aria-label="Exception availability"><option value="unavailable">Unavailable</option><option value="available">Available</option></select><button class="ghost" type="submit">Add exception</button></form><div class="department-save-bar"><button class="primary" data-act="member-availability-save" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"' + (draftExists ? '' : ' disabled') + '>Save availability</button>' + (draftExists ? '<button class="ghost" data-act="member-availability-reset" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '">Discard changes</button>' : '') + '</div></section>';
}

function renderOwnAvailability() {
  if (!departmentRuntime.ownLoaded && !departmentRuntime.ownLoading) loadOwnDepartmentProfiles().catch(() => {});
  const profiles = ownDepartmentProfiles();
  if (!profiles.length && departmentRuntime.ownLoading) {
    return '<section class="card department-loading" role="status"><div class="department-eyebrow">Shared availability</div><h2>Loading your availability</h2><p class="hint">Your profile is being requested through the signed-in account.</p></section>';
  }
  if (!profiles.length && departmentRuntime.ownError) {
    return '<section class="card department-error" role="alert"><h2>Availability unavailable</h2><p class="hint">' + esc(departmentRuntime.ownError) + '</p><button class="primary" data-act="member-availability-retry">Try again</button></section>';
  }
  if (!profiles.length) return '';
  return profiles.map(renderOwnAvailabilityProfile).join('');
}

function renderDepartmentMember() {
  const department = selectedManageDepartment();
  const memberUid = ui.departmentMember;
  const profile = departmentDraftProfile(department, memberUid);
  if (!department || department === 'All' || !profile) return renderManageDepartment();
  const canEdit = canManageSelectedDepartment(department);
  const category = CATEGORIES.find(item => item.name === department);
  const duties = category ? category.duties : [];
  const recurring = profile.availability && profile.availability.recurring || {};
  const exceptions = profile.availability && profile.availability.exceptions || {};
  const fieldAttribution = profile.fieldAttribution && typeof profile.fieldAttribution === 'object' ? profile.fieldAttribution : {};
  const draftExists = !!departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  let html = '<button class="linkish department-back" data-act="department-back-member">Back to ' + esc(department) + '</button>' +
    '<section class="department-profile-hero card"><div class="department-eyebrow">Member profile</div><div class="department-profile-title"><div><h2>' + esc(memberLabel(profile.memberName)) + '</h2><p class="department-uid">UID: ' + esc(profile.memberUid) + '</p></div>' + departmentStatusBadge(profile) + '</div>' +
    '<p class="department-attribution">' + departmentAttribution(profile) + '</p>' +
    '<p class="department-profile-note">Identity and role are immutable here. This editor changes only status, eligible duties, schedulability, and availability.</p>' +
    (canEdit ? '<div class="department-profile-actions"><button class="ghost" data-act="department-status" data-uid="' + esc(memberUid) + '" data-status="' + (profile.status === 'active' ? 'inactive' : 'active') + '">' + (profile.status === 'active' ? 'Move to inactive' : 'Restore to active') + '</button></div>' : '') +
    '</section>';
  html += '<section class="card department-editor"><div class="department-section-heading"><div><div class="department-eyebrow">Scheduling profile</div><h3>Eligible duties</h3></div><span class="department-editor-state">' + (draftExists ? 'Unsaved changes' : 'Saved profile') + '</span></div>' +
    '<p class="hint">Normal assignment requires an active profile, one of these duties, schedulable enabled, and available service time.</p>' +
    '<div class="department-duty-grid">' + duties.map(duty => '<label class="department-check"><input type="checkbox" data-chg="department-eligible" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-duty="' + esc(duty) + '"' + (profile.eligibleDuties.some(item => item.toLocaleLowerCase() === duty.toLocaleLowerCase()) ? ' checked' : '') + (canEdit ? '' : ' disabled') + '><span>' + esc(duty) + '</span></label>').join('') + '</div>' +
    '<label class="department-schedulable"><span><strong>Schedulable</strong><small>Allow this profile to appear in normal assignment choices.</small></span><span class="switch"><input type="checkbox" data-chg="department-schedulable" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"' + (profile.schedulable ? ' checked' : '') + (canEdit ? '' : ' disabled') + '><span class="track"></span></span></label>' +
    '</section>';
  html += '<section class="card department-editor"><div class="department-section-heading"><div><div class="department-eyebrow">Recurring availability</div><h3>Service-time pattern</h3></div></div>' +
    '<p class="hint">Availability is evaluated in the configured service timezone. A date exception wins over the recurring pattern.</p>' +
    '<div class="department-availability-grid">' + SERVICE_LABELS.map(label => {
      const key = departmentServiceTimeKey(label);
      const status = recurring[key] || 'unavailable';
      return '<label class="department-availability-row"><span>' + esc(label) + '</span><select data-chg="department-recurring" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-key="' + esc(key) + '"' + (canEdit ? '' : ' disabled') + '><option value="available"' + (status === 'available' ? ' selected' : '') + '>Available</option><option value="unavailable"' + (status !== 'available' ? ' selected' : '') + '>Unavailable</option></select></label>';
    }).join('') + '</div></section>';
  html += '<section class="card department-editor"><div class="department-section-heading"><div><div class="department-eyebrow">Date exceptions</div><h3>One-day changes</h3></div></div>' +
    '<p class="hint">Use a service time or Any service time. These entries override the recurring pattern only for the chosen date.</p>' +
    '<div class="department-exceptions">' + Object.keys(exceptions).sort().map(date => Object.keys(exceptions[date] || {}).sort().map(key =>
      '<div class="department-exception-row"><span><strong>' + esc(date) + '</strong><small>' + esc(departmentServiceTimeLabel(key)) + '</small></span><span class="department-exception-status ' + (exceptions[date][key] === 'available' ? 'available' : 'unavailable') + '">' + esc(exceptions[date][key]) + '</span>' +
      (canEdit ? '<button class="danger-link" data-act="department-exception-remove" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-date="' + esc(date) + '" data-key="' + esc(key) + '">Remove</button>' : '') + '</div>'
    ).join('')).join('') + (!Object.keys(exceptions).length ? '<p class="department-empty-note">No date exceptions.</p>' : '') + '</div>' +
    (canEdit ? '<form class="department-exception-form" data-act="department-exception-add"><input id="department-exception-date" type="date" required aria-label="Exception date"><select id="department-exception-time" aria-label="Exception service time">' + departmentTimeOptions(profile, true) + '</select><select id="department-exception-status" aria-label="Exception availability"><option value="unavailable">Unavailable</option><option value="available">Available</option></select><button class="ghost" type="submit">Add exception</button></form>' : '') +
    '</section>';
  html += renderDepartmentHistory(profile);
  const fieldRows = ['status', 'eligibleDuties', 'schedulable', 'availability'].filter(field => fieldAttribution[field]).map(field => {
    const decision = fieldAttribution[field];
    return '<li><strong>' + esc(field) + '</strong>: ' + esc(decision.authority || decision.source || 'recorded') + ' by ' + esc(decision.by || 'account') + '</li>';
  }).join('');
  html += '<section class="card department-attribution-card"><div class="department-eyebrow">Change attribution</div><h3>Who changed the profile</h3><p class="department-attribution">' + departmentAttribution(profile) + '</p>' + (fieldRows ? '<ul>' + fieldRows + '</ul>' : '<p class="department-empty-note">Field-level attribution was not included in this roster response.</p>') + '</section>';
  if (canEdit) {
    html += '<div class="department-save-bar"><button class="primary" data-act="department-profile-save" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"' + (draftExists ? '' : ' disabled') + '>Save profile changes</button>' + (draftExists ? '<button class="ghost" data-act="department-profile-reset" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '">Discard changes</button>' : '') + '</div>';
  }
  return html;
}

function renderDepartmentWorkspace() {
  if (ui.departmentView === 'member') return renderDepartmentMember();
  if (ui.departmentView === 'department') return renderManageDepartment();
  return renderManageDepartments();
}

function renderSheetCard() {
  if (!fb) return ''; // only meaningful when live sync is on
  const res = getJSON('wds-sheet-sync-result', null);
  let status = 'Not synced yet on this device.';
  if (res && res.t) {
    const when = new Date(res.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    let detail;
    if (res.added || res.updated) {
      const parts = [];
      if (res.added) parts.push(res.added + ' added');
      if (res.updated) parts.push(res.updated + ' updated');
      detail = parts.join(', ') + ' service' + ((res.added + res.updated) > 1 ? 's' : '');
    } else {
      detail = 'everything matched';
    }
    status = 'Last checked ' + when + ' | ' + esc(detail);
  }

  let html = '<div class="card">' +
    '<div class="f-label">Google Sheet</div>' +
    '<div class="sync-status">' + esc(status) + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    '<button class="ghost" data-act="sheet-sync"' + (ui.syncing ? ' disabled' : '') + '>' +
    (ui.syncing ? 'Syncing…' : 'Sync now') + '</button></div>' +
    '<input type="text" data-chg="sheet-url" value="' + esc(sheetUrl()) + '" style="width:100%;margin-top:10px" ' +
    'placeholder="Published-CSV link of the schedule sheet">' +
    '<div class="hint" style="margin:6px 2px 0">Published-CSV link of the schedule sheet (File → Share → Publish to web → CSV).</div>' +
    '<div class="hint" style="margin:8px 2px 0">The sheet is the source of truth for the duties it lists. Media Booth, Parking Lot, Offering, choir songs, and extra services added here are kept.</div>';

  const msgs = (res && res.warningMsgs) || [];
  if (msgs.length) {
    html += '<div class="sync-status" style="margin-top:8px">Skipped from the sheet:</div>' +
      '<ul class="sync-warnings">' +
      msgs.slice(0, 3).map(w => '<li>' + esc(w) + '</li>').join('') +
      (msgs.length > 3 ? '<li>+' + (res.warnings - 3) + ' more</li>' : '') +
      '</ul>';
  }
  html += '</div>';
  return html;
}

function renderManageData() {
  let syncCard;
  if (fb) {
    syncCard = '<div class="card"><p><b style="color:var(--ok)">Live sync is on.</b> Every member sees schedule changes instantly, on any device.</p></div>';
  } else {
    syncCard = '<div class="card"><p><b>Right now the schedule lives on this device only.</b> To let the whole congregation see it live, connect a free Firebase database (about 10 minutes, one time):</p>' +
      '<p>1. Go to <b>console.firebase.google.com</b> → Add project.<br>' +
      '2. Add a Web app, then create a <b>Firestore database</b> (Start in test mode).<br>' +
      '3. Copy the config it shows you into the file <b>firebase-config.js</b>:</p>' +
      '<code class="cfg">window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", ... };</code>' +
      '<p style="margin-top:10px">4. Put the app folder on any free host (e.g. Netlify Drop) and share the link. This device\'s schedule uploads itself automatically the first time.</p></div>';
  }
  return '<div class="data-actions">' + syncCard + renderSheetCard() +
    '<div class="card"><p>Back up the schedule, or move it between devices by hand.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="ghost" data-act="export">Export backup file</button>' +
    '<label class="ghost" style="display:inline-flex;align-items:center;cursor:pointer">Import backup file' +
    '<input type="file" accept=".json,application/json" data-chg="import-file" style="display:none"></label>' +
    '</div></div>' +
    '<div class="card"><p>Reload the original schedule from the spreadsheet (May to July 2026). This overwrites all current data' + (fb ? ' for everyone' : '') + '.</p>' +
    '<button class="danger-link" data-act="reset">Reset to spreadsheet data</button></div>' +
    '<div class="card"><p>One-time cleanup after the sheet\'s Raw Data tab was tidied up, merges leftover name variants (e.g. "B. Anthony L") into their current spelling everywhere.</p>' +
    '<button class="ghost" data-act="unify-names">Unify member names</button></div>' +
    '</div>';
}

/* ================= actions ================= */

/* Applies NAME_UNIFY_MAP (or a compatible map) to state.members, every
   service's assignments/conflictOk, and every department roster (rosters are
   keyed by member name too, and are what duty dropdowns actually read from,
   see memberSelect, so they must stay in sync or old spellings keep showing
   up there even after members/services are unified).
   Pure w.r.t. persistence, caller persists whatever comes back touched.
   Returns { membersChanged, membersMerged, touchedServices, departmentsChanged }. */
function applyNameMap(map) {
  const canon = n => (map[n] || n);
  const membersMerged = state.members.filter(m => map[m]).length;
  const membersChanged = membersMerged > 0;
  if (membersChanged) {
    const seen = {};
    state.members = state.members.map(canon).filter(m => (seen[m] ? false : (seen[m] = true)));
    state.members.sort();
  }
  const touchedServices = [];
  state.services.forEach(svc => {
    let touched = false;
    const assignments = svc.assignments || {};
    Object.keys(assignments).forEach(duty => {
      const old = assignments[duty], now = canon(old);
      if (now !== old) { assignments[duty] = now; touched = true; }
    });
    const ok = svc.conflictOk || {};
    const merged = {};
    Object.keys(ok).forEach(name => {
      const now = canon(name);
      if (now !== name) touched = true;
      const dutyList = merged[now] ? merged[now].concat(ok[name]) : ok[name];
      const seenDuty = {};
      merged[now] = dutyList.filter(d => (seenDuty[d] ? false : (seenDuty[d] = true)));
    });
    if (touched) { svc.conflictOk = merged; touchedServices.push(svc); }
  });
  let departmentsChanged = false;
  Object.keys(state.departments || {}).forEach(cat => {
    const roster = state.departments[cat] || [];
    const seen = {};
    const merged = roster.map(canon).filter(m => (seen[m] ? false : (seen[m] = true)));
    merged.sort();
    if (merged.length !== roster.length || merged.some((m, i) => m !== roster[i])) {
      state.departments[cat] = merged;
      departmentsChanged = true;
    }
  });
  return { membersChanged, membersMerged, touchedServices, departmentsChanged };
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
  const sl = setlistIndex[id];
  if (!sl) return null;
  const count = (sl.songs || []).length;
  const confirmedAt = sl.confirmedAt || 0;
  return {
    count: count,
    confirmed: !!(count && confirmedAt && confirmedAt >= (sl.updatedAt || 0)),
    changed: !!(count && confirmedAt && confirmedAt < (sl.updatedAt || 0))
  };
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

function findRequest(id) { return (state.requests || []).find(request => request.id === id); }

function requestDepartment(request) {
  if (!request) return '';
  if (request.department) return request.department;
  return actionableDepartmentForDuty(request.duty);
}

function songServiceForPermission(service) {
  if (!service) return null;
  return Object.assign({}, service, {
    presider: service.presider || (service.assignments && service.assignments.Presider) || ''
  });
}

function canEditSongService(service) {
  return !!authActor() && canPermission('canEditSongs', authActor(), songServiceForPermission(service));
}

function canManagePresiders() {
  return !!authActor() && canPermission('canManageLeaders', authActor());
}

function canRunAction(act, el) {
  const actor = authActor();
  if (act === 'site-unlock' || act === 'login-member') return true;
  if (act === 'member-login') return !isVerifiedSession() && !isForcedSession();
  if (act === 'member-change-pin') return isForcedSession();
  if (act === 'member-logout') return isVerifiedSession();
  if (act === 'home') return true;
  if (!isVerifiedSession() || isForcedSession()) return false;
  if (act === 'tab') {
    if (el.dataset.tab === 'manage') return canManageAnyDepartment();
    if (el.dataset.tab === 'songs') return canEditSongService(findService(ui.songSvc)) ||
      canPermission('canEditSongs', actor, {}) ||
      dutiesFor(ui.me).some(duty => duty.duty === 'Presider');
    return el.dataset.tab === 'schedule' || el.dataset.tab === 'my';
  }
  if (act === 'open-manage-queue') return canManageAnyDepartment();
  if (act === 'sub') {
    if (el.dataset.sub === 'leaders') return canPermission('canManageLeaders', actor);
    if (el.dataset.sub === 'features' || el.dataset.sub === 'data') return canPermission('isAdmin', actor);
    return canManageAnyDepartment();
  }
  if (['department-open', 'department-back', 'department-back-member', 'department-retry', 'department-member-open'].indexOf(act) !== -1) {
    return canManageAnyDepartment();
  }
  if (act === 'department-override-submit') {
    const department = dutyCategory(el.dataset.duty).name;
    return canPermission('isAdmin', actor) && canPermission('canManageDepartment', actor, department);
  }
  if (['department-member-add', 'department-status', 'department-profile-save', 'department-profile-reset',
    'department-exception-add', 'department-exception-remove'].indexOf(act) !== -1) {
    const department = el.dataset.dept || selectedManageDepartment();
    return canManageSelectedDepartment(department);
  }
  if (['member-availability-save', 'member-availability-reset',
    'member-availability-exception-add', 'member-availability-exception-remove'].indexOf(act) !== -1) {
    return isOwnDepartmentProfile(el.dataset.dept, el.dataset.uid);
  }
  if (act === 'member-availability-retry') return isVerifiedSession();
  if (act === 'member-availability-recurring') {
    return isOwnDepartmentProfile(el.dataset.dept, el.dataset.uid);
  }
  if (['department-eligible', 'department-schedulable', 'department-recurring'].indexOf(act) !== -1) {
    return canManageSelectedDepartment(el.dataset.dept || selectedManageDepartment());
  }
  if (act === 'lock-now') return canManageAnyDepartment();
  if (act === 'open-songs') return canEditSongService(findService(el.dataset.svc)) || canPermission('canEditSongs', actor, {});
  if (['close-songs', 'dept-filter', 'dismiss-banner', 'toggle-past', 'clear-alerts',
    'notify-on', 'notify-off', 'subscribe-ics', 'copy-ics', 'expand', 'req-open',
    'req-cancel'].indexOf(act) !== -1) return true;
  if (act === 'req-submit') {
    const service = findService(el.dataset.svc);
    return !!service && service.assignments && service.assignments[el.dataset.duty] === ui.me;
  }
  if (act === 'req-approve' || act === 'req-decline') {
    const request = findRequest(el.dataset.id);
    return !!request && canPermission('canResolveRequest', actor, request);
  }
  if (act === 'req-open-service') return canManageAnyDepartment();
  if (act === 'assign' || act === 'plan-assign') {
    return canPermission('canEditDuty', actor, el.dataset.duty);
  }
  if (act === 'svc-field') {
    const service = findService(el.dataset.svc);
    return el.dataset.field === 'choirSong'
      ? canEditSongService(service)
      : canPermission('isAdmin', actor);
  }
  if (act === 'member-name') return canPermission('isAdmin', actor);
  if (act === 'member-cat') return canPermission('canManageDepartmentMember', actor, el.dataset.cat, { name: el.dataset.name });
  if (['role-config', 'role-config-add', 'role-config-remove'].indexOf(act) !== -1) {
    return canPermission('canManageLeaders', actor);
  }
  if (act === 'manage-dept') return authorizedDepartments().indexOf(el.value) !== -1;
  if (['change-site-pin', 'set-pin', 'unlock', 'change-pin', 'feature', 'scheduler-name',
    'sheet-url', 'import-file', 'export', 'reset', 'unify-names'].indexOf(act) !== -1) {
    return canPermission('isAdmin', actor);
  }
  if (act === 'add-service') return canPermission('canCreateService', actor);
  if (act === 'del-service') return canPermission('isAdmin', actor);
  if (act === 'add-member') {
    const department = selectedManageDepartment();
    return department === 'All'
      ? canPermission('isAdmin', actor)
      : canPermission('canManageDepartmentMember', actor, department, { name: ui.loginMember || '' });
  }
  if (act === 'del-member' || act === 'reset-member-pin') {
    const target = { name: canonicalMemberName(el.dataset.name), departments: [el.dataset.dept || selectedManageDepartment()] };
    if (act === 'reset-member-pin') return canPermission('canResetPin', actor, target);
    const department = el.dataset.dept || selectedManageDepartment();
    return department === 'All'
      ? canPermission('isAdmin', actor)
      : canPermission('canManageDepartmentMember', actor, department, target);
  }
  if (act === 'conflict-ok' || act === 'conflict-unok') {
    const service = findService(el.dataset.svc);
    const conflict = service && conflictsFor(service).find(item => item.name === el.dataset.name);
    return !!conflict && canPermission('canAcknowledgeConflict', actor, Object.assign({}, conflict, {
      serviceId: el.dataset.svc, date: service.date, service: service.service
    }));
  }
  return canManageAnyDepartment();
}

function saveRoleConfiguration(roleType, department, memberName, enabled) {
  const target = canonicalMemberName(memberName);
  if (!target) return Promise.reject(new Error('Choose a member first.'));
  return authCall('updateRoleConfiguration', {
    roleType,
    department: department || '',
    memberName: target,
    enabled: enabled === true
  }).then(result => {
    if (result && result.config) state.permissionConfig = result.config;
    addBanner(enabled ? 'Role access added.' : 'Role access removed.');
    render();
    return result;
  }).catch(error => {
    addBanner(safeAuthMessage(error), true);
    render();
    throw error;
  });
}

function handleAct(act, el) {
  if (!canRunAction(act, el)) {
    addBanner('You are not allowed to perform that action.', true);
    return;
  }
  if (act === 'member-login') {
    memberLogin();
  }
  else if (act === 'member-change-pin') {
    memberChangePin();
  }
  else if (act === 'member-logout') {
    memberLogout();
  }
  else if (act === 'open-manage-queue') {
    ui.tab = 'manage';
    ui.sub = 'requests';
    render();
  }
  else if (act === 'home') {
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
  else if (act === 'sub') {
    ui.sub = el.dataset.sub;
    if (ui.sub === 'departments' && !ui.departmentView) ui.departmentView = 'list';
    render();
  }
  else if (act === 'role-config-add') {
    const select = el.querySelector('select');
    saveRoleConfiguration(el.dataset.role, el.dataset.dept || '', select && select.value, true).catch(() => {});
  }
  else if (act === 'role-config-remove') {
    saveRoleConfiguration(el.dataset.role, el.dataset.dept || '', el.dataset.name, false).catch(() => {});
  }
  else if (act === 'department-open') {
    const department = el.dataset.department;
    if (!department || authorizedDepartments().indexOf(department) === -1) return;
    ui.manageDept = department;
    ui.sub = 'departments';
    ui.departmentView = 'department';
    ui.departmentMember = '';
    loadDepartmentRoster(department).catch(() => {});
    render();
  }
  else if (act === 'department-member-open') {
    const department = selectedManageDepartment();
    if (!department || department === 'All' || !departmentProfile(department, el.dataset.uid)) return;
    ui.departmentView = 'member';
    ui.departmentMember = el.dataset.uid;
    render();
  }
  else if (act === 'department-back') {
    ui.departmentView = 'list';
    ui.departmentMember = '';
    render();
  }
  else if (act === 'department-back-member') {
    ui.departmentView = 'department';
    ui.departmentMember = '';
    render();
  }
  else if (act === 'department-retry') {
    const department = el.dataset.department || selectedManageDepartment();
    if (department) loadDepartmentRoster(department, { force: true }).catch(() => {});
    render();
  }
  else if (act === 'member-availability-retry') {
    departmentRuntime.ownLoaded = false;
    departmentRuntime.ownError = '';
    loadOwnDepartmentProfiles().catch(() => {});
    render();
  }
  else if (act === 'member-availability-save') {
    saveOwnDepartmentAvailability(el.dataset.dept, el.dataset.uid).catch(error => {
      addBanner('Your availability was not saved: ' + departmentErrorMessage(error), true);
      renderSoon();
    });
  }
  else if (act === 'member-availability-reset') {
    delete departmentRuntime.drafts[departmentRuntimeKey(el.dataset.dept, el.dataset.uid)];
    render();
  }
  else if (act === 'member-availability-exception-add') {
    const department = el.dataset.dept;
    const memberUid = el.dataset.uid;
    if (!isOwnDepartmentProfile(department, memberUid)) return;
    const fields = el.querySelectorAll('input, select');
    const date = String(fields[0] && fields[0].value || '').trim();
    const key = String(fields[1] && fields[1].value || '').trim().toLocaleLowerCase();
    const status = String(fields[2] && fields[2].value || '').trim().toLocaleLowerCase();
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !key || !['available', 'unavailable'].includes(status)) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (!availability.exceptions[date]) availability.exceptions[date] = {};
    availability.exceptions[date][key] = status;
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'member-availability-exception-remove') {
    const department = el.dataset.dept;
    const memberUid = el.dataset.uid;
    if (!isOwnDepartmentProfile(department, memberUid)) return;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (availability.exceptions[el.dataset.date]) {
      delete availability.exceptions[el.dataset.date][el.dataset.key];
      if (!Object.keys(availability.exceptions[el.dataset.date]).length) delete availability.exceptions[el.dataset.date];
    }
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'department-member-add') {
    const department = selectedManageDepartment();
    const uidInput = document.getElementById('department-member-uid');
    const nameInput = document.getElementById('department-member-name');
    const memberUid = String(uidInput && uidInput.value || '').trim();
    const memberName = String(nameInput && nameInput.value || '').trim();
    if (!department || department === 'All' || !memberUid || !memberName) return;
    const data = {
      departmentId: department,
      memberUid,
      memberName,
      status: 'active',
      eligibleDuties: [],
      schedulable: false,
      availability: { recurring: {}, exceptions: {} }
    };
    const save = fb ? authCall('createDepartmentProfile', data) : Promise.resolve({ ok: true, profile: Object.assign({}, data, {
      uid: memberUid, role: 'member', updatedAt: Date.now(), updatedByUid: authActor() && authActor().uid
    }) });
    save.then(result => {
      if (!result || !result.profile || !replaceDepartmentProfile(result.profile)) throw new Error('The new department profile response was not valid.');
      addBanner(memberLabel(memberName) + ' was added to ' + department + '.');
      render();
    }).catch(error => {
      addBanner('The department member was not added: ' + departmentErrorMessage(error), true);
      render();
    });
  }
  else if (act === 'department-status') {
    const department = selectedManageDepartment();
    const memberUid = el.dataset.uid;
    const status = el.dataset.status === 'inactive' ? 'inactive' : 'active';
    if (!department || department === 'All' || !departmentProfile(department, memberUid)) return;
    departmentPatch(department, memberUid, { status }).then(() => saveDepartmentProfile(department, memberUid)).catch(() => {});
  }
  else if (act === 'department-profile-save') {
    saveDepartmentProfile(el.dataset.dept || selectedManageDepartment(), el.dataset.uid).catch(() => {});
  }
  else if (act === 'department-profile-reset') {
    delete departmentRuntime.drafts[departmentRuntimeKey(el.dataset.dept || selectedManageDepartment(), el.dataset.uid)];
    render();
  }
  else if (act === 'department-exception-add') {
    const department = selectedManageDepartment();
    const memberUid = ui.departmentMember;
    const date = String(document.getElementById('department-exception-date')?.value || '').trim();
    const key = String(document.getElementById('department-exception-time')?.value || '').trim().toLocaleLowerCase();
    const status = String(document.getElementById('department-exception-status')?.value || '').trim().toLocaleLowerCase();
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !key || !['available', 'unavailable'].includes(status)) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (!availability.exceptions[date]) availability.exceptions[date] = {};
    availability.exceptions[date][key] = status;
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'department-exception-remove') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid || ui.departmentMember;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (availability.exceptions[el.dataset.date]) {
      delete availability.exceptions[el.dataset.date][el.dataset.key];
      if (!Object.keys(availability.exceptions[el.dataset.date]).length) delete availability.exceptions[el.dataset.date];
    }
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'department-override-submit') {
    const svc = findService(el.dataset.svc);
    const duty = el.dataset.duty;
    const target = document.getElementById(el.dataset.target);
    const reason = document.getElementById(el.dataset.reason);
    const profile = svc && departmentProfile(dutyCategory(duty).name, target && target.value);
    const textReason = String(reason && reason.value || '').trim();
    if (!svc || !profile || !textReason) {
      addBanner('Choose a member and enter the required administrator override reason.', true);
      render();
      return;
    }
    assignDepartmentDutyForService(svc, duty, profile, { override: true, reason: textReason }).catch(() => {});
  }
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
    const input = document.getElementById('member-name');
    const name = canonicalMemberName(input && input.value);
    if (!name) return;
    const department = el.dataset.dept && el.dataset.dept !== 'All' ? el.dataset.dept : '';
    if (department) {
      if (!state.departments) state.departments = {};
      const roster = state.departments[department] || (state.departments[department] = []);
      if (roster.indexOf(name) !== -1) { alert(name + ' is already in this department.'); return; }
      roster.push(name);
      roster.sort();
      persistDepartmentMembership(department, name, 'active').catch(error => {
        state.departments[department] = roster.filter(member => member !== name);
        addBanner(safeAuthMessage(error), true);
        render();
      });
    } else {
      if (state.members.indexOf(name) !== -1) { alert(name + ' is already on the list.'); return; }
      state.members.push(name);
      state.members.sort();
      persistMembers();
    }
    render();
  }
  else if (act === 'del-member') {
    const name = canonicalMemberName(el.dataset.name);
    const department = el.dataset.dept && el.dataset.dept !== 'All' ? el.dataset.dept : '';
    const n = dutiesFor(name).length;
    const question = department
      ? 'Archive ' + name + ' from ' + department + '? Existing assignments stay in history.'
      : 'Remove ' + name + '?' + (n ? ' They will be taken off ' + n + ' upcoming duties.' : '');
    if (confirm(question)) {
      if (department) {
        const roster = (state.departments && state.departments[department]) || [];
        state.departments[department] = roster.filter(member => member !== name);
        persistDepartmentMembership(department, name, 'archived').catch(error => {
          state.departments[department] = roster;
          addBanner(safeAuthMessage(error), true);
          render();
        });
        afterDataChange();
        return;
      }
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
  else if (act === 'reset-member-pin') {
    const name = canonicalMemberName(el.dataset.name);
    if (!name || !confirm('Reset the member PIN for ' + name + '?')) return;
    authCall('resetMemberPin', { memberId: name }).then(() => {
      addBanner('The PIN for ' + name + ' was reset. They must choose a new PIN at sign-in.');
      render();
    }).catch(error => {
      addBanner(safeAuthMessage(error), true);
      render();
    });
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
    const duty = el.dataset.duty;
    const profile = departmentProfile(dutyCategory(duty).name, el.dataset.uid);
    if (!profile) {
      addBanner('The secure department roster is not loaded for this suggestion.', true);
      render();
      return;
    }
    assignDepartmentDutyForService(svc, duty, profile).catch(() => {});
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
      state = seedState();
      persistAll();
      afterDataChange();
    }
  }
  else if (act === 'unify-names') {
    if (!confirm('Merge leftover name variants (e.g. "B. Anthony L" → "B. Anthony") across members and all services?')) return;
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
      memberId: verifiedSession.memberId,
      requesterUid: (authUser && authUser.uid) || '',
      svcId: el.dataset.svc,
      date: svc.date,
      service: svc.service,
      worship: svc.worship,
      duty: el.dataset.duty,
      department: actionableDepartmentForDuty(el.dataset.duty),
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
  if (chg === 'login-member') {
    ui.loginMember = canonicalMemberName(el.value);
    ui.authError = '';
    return;
  }
  if (!canRunAction(chg, el)) {
    addBanner('You are not allowed to perform that action.', true);
    return;
  }
  if (chg === 'me') return;
  if (chg === 'member-availability-recurring') {
    const department = el.dataset.dept;
    const memberUid = el.dataset.uid;
    const profile = departmentDraftProfile(department, memberUid);
    if (!isOwnDepartmentProfile(department, memberUid) || !profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    availability.recurring[el.dataset.key] = el.value === 'available' ? 'available' : 'unavailable';
    departmentPatch(department, memberUid, { availability });
    return;
  }
  if (chg === 'manage-dept') {
    ui.manageDept = el.value;
    if (ui.manageDept !== 'All' && authorizedDepartments().indexOf(ui.manageDept) === -1) {
      ui.manageDept = authorizedDepartments()[0] || '';
    }
    ui.departmentView = 'list';
    ui.departmentMember = '';
    render();
  }
  else if (chg === 'assign') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    if (!el.value) {
      unassignDepartmentDutyForService(svc, el.dataset.duty).catch(() => {});
      return;
    }
    const profile = departmentProfile(dutyCategory(el.dataset.duty).name, el.value);
    if (!profile) {
      addBanner('That department member is not in the secure roster. Reload the department and try again.', true);
      render();
      return;
    }
    assignDepartmentDutyForService(svc, el.dataset.duty, profile).catch(() => {});
  }
  else if (chg === 'department-eligible') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const eligible = profile.eligibleDuties.slice();
    const index = eligible.findIndex(duty => duty.toLocaleLowerCase() === String(el.dataset.duty || '').toLocaleLowerCase());
    if (el.checked && index === -1) eligible.push(el.dataset.duty);
    if (!el.checked && index !== -1) eligible.splice(index, 1);
    departmentPatch(department, memberUid, { eligibleDuties: eligible });
  }
  else if (chg === 'department-schedulable') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid;
    if (departmentProfile(department, memberUid)) departmentPatch(department, memberUid, { schedulable: el.checked });
  }
  else if (chg === 'department-recurring') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    availability.recurring[el.dataset.key] = el.value === 'available' ? 'available' : 'unavailable';
    departmentPatch(department, memberUid, { availability });
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
    persistDepartmentMembership(cat, name, el.checked ? 'active' : 'archived').catch(error => {
      if (el.checked) state.departments[cat] = roster.filter(member => member !== name);
      else state.departments[cat] = roster.concat(name).sort();
      addBanner(safeAuthMessage(error), true);
      render();
    });
    render();
  }
  else if (chg === 'role-config') {
    const roleType = el.dataset.role;
    const department = el.dataset.dept || '';
    const memberName = canonicalMemberName(el.dataset.name);
    authCall('updateRoleConfiguration', {
      roleType, department, memberName, enabled: el.checked
    }).then(result => {
      if (result && result.config) state.permissionConfig = result.config;
      addBanner('Role access updated.');
      render();
    }).catch(error => {
      el.checked = !el.checked;
      addBanner(safeAuthMessage(error), true);
      render();
    });
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
          state = obj;
          persistAll();
          afterDataChange();
          alert('Schedule imported.');
        } else alert('That file does not look like a schedule backup.');
      } catch (e) { alert('Could not read that file.'); }
    };
    reader.readAsText(file);
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM') return;
  if (e.target.closest('[data-chg]')) return;
  handleAct(el.dataset.act, el);
});
document.addEventListener('submit', e => {
  if (!e.target.dataset.act) return;
  e.preventDefault();
  handleAct(e.target.dataset.act, e.target);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (el) handleChg(el.dataset.chg, el);
});
/* Live-capture the change-request note as the member types, so a Firestore
   snapshot re-render mid-typing (see afterDataChange) can't lose the draft,
   'change' alone only fires on blur. */
document.addEventListener('input', e => {
  const el = e.target.closest('[data-chg="req-note"]');
  if (el) handleChg('req-note', el);
});

/* ================= startup ================= */

let syncLive = false;
function setSyncPill(live) {
  // The old header carried a dedicated "Live sync on / This device only"
  // pill element; the new shell header does not reserve that space. The
  // signal is kept (syncLive) in case a later section wants to surface it
  // again, but no longer requires a specific DOM node to exist.
  syncLive = !!live;
}

/* ---- Pulse: the smallest honest answer to "does anyone open this?" ----
   Writes ONE document per day, `pulse/{YYYY-MM-DD}`, holding plain counters.

   It stores no device id, no name, no free text, nothing that identifies a
   person. Each device counts itself at most once per event per day, using a
   localStorage note that never leaves the phone, so the number means
   "devices that did this today", not "taps".

   Why this exists: as of July 2026 not one of the church apps had any
   measurement at all, so "is the worship schedule read by fifty people or by
   nobody?" was unanswerable, a busy app and a dead one looked identical. */
const pulseInFlight = new Set(); // stops a double-count before the write resolves

function pulse(event) {
  if (!fb || !fb.increment) return;
  try {
    const day = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
    const key = 'wd-pulse-' + day;
    const seen = (localStorage.getItem(key) || '').split(',').filter(Boolean);
    if (seen.includes(event) || pulseInFlight.has(event)) return; // counted already
    pulseInFlight.add(event);

    fbWrite(() => fb.setDoc(
      fb.doc(fb.db, 'pulse', day),
      { date: day, [event]: fb.increment(1) },
      { merge: true }
    )).then(() => {
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
  } catch (e) { /* private mode, quota, clock, all non-fatal */ }
}

async function initFirebase(config) {
  // Fetched together, not one after the other: these are two separate
  // downloads from Google's CDN and the second does not depend on the first.
  const [appMod, fsMod, authMod, functionsMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js')
  ]);
  const app = appMod.initializeApp(config);

  // App Check, attests requests come from the real app. Activates only once a
  // reCAPTCHA v3 site key is configured (window.RECAPTCHA_SITE_KEY); until then
  // it's a no-op so the app keeps working during rollout. Must run right after
  // initializeApp, before any other Firebase service makes a request. NOTE: do
  // NOT turn on Firestore App Check *enforcement* in the console until the song
  // app (shared project) also ships this, enforcement is project-wide.
  if (window.RECAPTCHA_SITE_KEY) {
    try {
      const acMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js');
      acMod.initializeAppCheck(app, {
        provider: new acMod.ReCaptchaV3Provider(window.RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) { console.warn('App Check init failed:', e); }
  }

  const db = fsMod.getFirestore(app);
  const auth = authMod.getAuth(app);
  const functions = functionsMod.getFunctions(app, 'us-central1');
  fb = {
    db,
    auth,
    functions,
    callable: name => functionsMod.httpsCallable(functions, name),
    signInWithCustomToken: authMod.signInWithCustomToken,
    signOut: authMod.signOut,
    doc: fsMod.doc,
    setDoc: fsMod.setDoc,
    deleteDoc: fsMod.deleteDoc,
    writeBatch: fsMod.writeBatch,
    // Extras for the song module (song-app.js), it shares this app's single
    // Firebase instance and anonymous auth instead of initializing its own.
    collection: fsMod.collection,
    query: fsMod.query,
    where: fsMod.where,
    orderBy: fsMod.orderBy,
    limit: fsMod.limit,
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
  authStatus = 'loading';
  authReady = Promise.resolve(null);
  authMod.onAuthStateChanged(auth, user => { syncAuthUser(user, false); });
  // Cloud Messaging, best-effort; unsupported browsers just leave messaging null.
  try {
    const msgMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
    if (await msgMod.isSupported()) {
      fb.messaging = msgMod.getMessaging(app);
      fb.getToken = msgMod.getToken;
      fb.deleteToken = msgMod.deleteToken;
    }
  } catch (e) { console.warn('FCM unavailable:', e); }
  // Fast first paint. The last 30 days plus everything ahead is a small slice of
  // the collection and is all any member ever looks at, so it is fetched as its
  // own query in parallel with the full one below and painted the moment it
  // lands. The full listener still owns the data: Manage edits past services and
  // the sheet sync compares against every service, so history must be complete
  // before either runs. This one only ever paints, never seeds, syncs or alerts.
  let historyLoaded = false;
  let unsubRecent = fsMod.onSnapshot(
    fsMod.query(fsMod.collection(db, 'schedule'), fsMod.where('date', '>=', isoDaysAgo(30))),
    snap => {
      if (historyLoaded || snap.empty) return;
      state.services = snap.docs.map(d => d.data());
      canonicalizeStateNames();
      setSyncPill(true);
      renderSoon();
    },
    () => { /* the full listener below is what reports connection errors */ }
  );
  const takeOverFromRecent = () => {
    historyLoaded = true;
    if (unsubRecent) { unsubRecent(); unsubRecent = null; }
  };

  let firstSnapshot = true;
  fsMod.onSnapshot(fsMod.collection(db, 'schedule'), snap => {
    takeOverFromRecent();
    if (firstSnapshot && snap.empty) {
      firstSnapshot = false;
      // brand-new database: upload the spreadsheet schedule once
      state = loadLocal() || seedState();
      persistAll();
      setSyncPill(true); // data is now flowing, safe to claim "Live sync on"
      scheduleDataReady = true;
      afterDataChange();
      scheduleSyncSoon();
      return;
    }
    firstSnapshot = false;
      state.services = snap.docs.map(d => d.data());
      canonicalizeStateNames();
    fb.knownIds = snap.docs.map(d => d.id);
    setSyncPill(true); // data has landed, flip the pill to live now, not before
    scheduleDataReady = true;
    afterDataChange();
    scheduleSyncSoon(); // auto-pull from the sheet once, shortly after real data lands
  }, err => {
    addBanner('Could not connect to the shared database (' + err.code + '). Showing this device\'s copy.', true);
    if (!state.services.length) { state = loadLocal() || seedState(); render(); }
    scheduleDataReady = true;
    setSyncPill(false);
  });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'members'), snap => {
    if (snap.exists()) state.members = (snap.data().list || []).map(canonicalMemberName);
    canonicalizeStateNames();
    membersLoaded = true;
    renderSoon();
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'settings'), snap => {
    if (snap.exists()) {
      state.settings = Object.assign({ features: {}, pinHash: '' }, snap.data());
      renderSoon();
    }
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'departments'), snap => {
    const map = snap.exists() ? (snap.data().map || {}) : null;
    if (!map || !Object.keys(map).length) {
      state.departments = JSON.parse(JSON.stringify(DEPARTMENTS_SEED));
      if (isVerifiedSession() && canPermission('isAdmin', authActor())) persistDepartments();
    } else {
      state.departments = map;
    }
    canonicalizeStateNames();
    departmentsLoaded = true;
    renderSoon();
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'leaderConfig'), snap => {
    if (snap.exists()) state.permissionConfig = snap.data();
    renderSoon();
  }, () => { /* built-in role configuration remains the safe fallback */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'nameMap'), snap => {
    const map = snap.exists() ? (snap.data().map || {}) : null;
    if (!map || !Object.keys(map).length) {
      // brand-new doc: seed it once from the built-in map
      sharedNameMap = NAME_UNIFY_MAP;
      persistNameMap(NAME_UNIFY_MAP);
    } else {
      sharedNameMap = map;
    }
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  // Upcoming setlists only: enough for the My Duties song indicator without
  // pulling down every setlist the church has ever planned.
  fsMod.onSnapshot(
    fsMod.query(fsMod.collection(db, 'setlists'), fsMod.where('date', '>=', todayISO())),
    snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setlistIndex = map;
      renderSoon();
    },
    () => { /* the indicator just stays quiet; errors surface on the schedule listener */ });
}

function init() {
  startShell(buildHost());
  if (previewMode) {
    // Local verification path: no service worker, no Firebase, a fictional
    // signed-in account over the bundled seed-data.js services. Nothing here
    // is persisted (no saveLocal()/persistAll()) so it never contaminates a
    // real device's cached schedule.
    document.title = document.title + ' (local preview)';
    state = seedState();
    departmentsLoaded = true;
    membersLoaded = true;
    scheduleDataReady = true;
    authStatus = 'local';
    verifiedSession = { memberName: 'B. Anthony', memberId: 'preview-uid', mustChangePin: false };
    ui.me = 'B. Anthony';
    afterDataChange();
    return;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (window.FIREBASE_CONFIG) {
    // Paint the schedule this device saw last, right now, instead of an
    // empty state. The live snapshot overwrites it moments later.
    // membersLoaded / departmentsLoaded stay false on purpose: they gate the
    // sheet sync, which must not run against a cached roster.
    const cached = loadLocal();
    if (cached && cached.services && cached.services.length) {
      state = cached;
      scheduleDataReady = true;
      render();
    }
    initFirebase(window.FIREBASE_CONFIG).catch(() => {
      addBanner('Firebase config is invalid - running on this device only.', true);
      state = loadLocal() || seedState();
      departmentsLoaded = true;
      membersLoaded = true;
      scheduleDataReady = true;
      authStatus = 'local';
      setSyncPill(false);
      afterDataChange();
    });
  } else {
    state = loadLocal() || seedState();
    departmentsLoaded = true;
    membersLoaded = true;
    scheduleDataReady = true;
    authStatus = 'local';
    saveLocal();
    setSyncPill(false);
    afterDataChange();
    autoSyncOnce();
  }
  setInterval(checkReminders, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
}

init();
