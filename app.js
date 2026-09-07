'use strict';

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
  'Worship': ['B. Anthony', 'B. Brent', 'B. Davidson', 'B. Giomar', 'B. James', 'B. Jason', 'B. Jordan', 'D. Aaron', 'D. Caleb', 'D. Chloe', 'D. Chris', 'D. Danielle', 'D. Kenya', 'D. Roza', 'E. Simon', 'M. Chad', 'S. Adrienne', 'S. Martha', 'S. Paola', 'S. Skye'],
  'Usher Sisters': ['D. Chloe', 'D. Danielle', 'D. Kenya', 'D. Roza', 'S. Adrienne', 'S. Estefany', 'S. Hana', 'S. Lisa', 'S. Melissa', 'S. Paola', 'S. Skye', 'S. Taylor'],
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
function unifiedNameMap() { return Object.assign({}, NAME_UNIFY_MAP, sharedNameMap || {}); }

/* Feature toggles — managed live in Manage → Features, synced to every device */
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
  let roster = (state.departments || {})[cat.name] || [];
  if (!roster.length) roster = state.members;
  const busy = {};
  Object.keys(svc.assignments || {}).forEach(d => { if (svc.assignments[d]) busy[svc.assignments[d]] = true; });
  return roster
    .filter(m => m !== excludeName && !busy[m])
    .map(m => ({ m, s: stats[m] || { past4: 0, upcoming: 0, last: '' } }))
    .sort((a, b) =>
      (a.s.upcoming + a.s.past4) - (b.s.upcoming + b.s.past4) ||
      (a.s.last === b.s.last ? 0 : (a.s.last < b.s.last ? -1 : 1)))
    .slice(0, 3)
    .map(x => x.m);
}

/* ================= google sheet sync — pure parsers ================= */

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
   Returns { services, members, warnings }. Pure — no window/document/state. */
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
      svc = { date: iso, service: serviceLabel, worship: iWorship >= 0 ? cell(iWorship) : '', time: parseSheetTime(cell(iTime)), assignments: {}, choirSong: '' };
      byKey[key] = svc;
      result.services.push(svc);
    }
    if (isChoirSong) {
      if (member) svc.choirSong = member; // never clear the song on a blank cell
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
let fb = null; // { db, setDoc, doc, deleteDoc, writeBatch, collection }

/* Anonymous sign-in no longer blocks startup. Reads are open in
   firestore.rules, so making the whole app wait for a sign-in round trip
   before the first schedule row was requested bought nothing. Writes DO need
   it (the rules require request.auth != null), so every write goes through
   fbWrite() and waits on this promise instead. */
let authReady = Promise.resolve();
function fbWrite(fn) { return authReady.then(fn); }
let settingsLoaded = false; // true once shared settings arrived (or local mode)
let departmentsLoaded = false; // true once the departments doc arrived (or local mode)
let membersLoaded = false; // true once the members doc arrived (or local mode)

const ui = {
  tab: 'schedule',
  sub: 'services',
  me: localStorage.getItem('wds-me') || '',
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
  songSvc: null, // svcId deep-link target for the song picker (ui.tab === 'songs')
  songNav: false // one-shot: this render is an explicit navigation into the song picker (tab or button), not a background re-mount
};

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

/* persistence that works in both modes */
function persistService(svc) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'schedule', svcId(svc)), svc));
  else saveLocal();
}
function persistDeleteService(id) {
  if (fb) fbWrite(() => fb.deleteDoc(fb.doc(fb.db, 'schedule', id)));
  else saveLocal();
}
function persistMembers() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'members'), { list: state.members }));
  else saveLocal();
}
function persistSettings() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'settings'), state.settings));
  else saveLocal();
}
function persistDepartments() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'departments'), { map: state.departments }));
  else saveLocal();
}
function persistNameMap(map) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'nameMap'), { map: map }));
}
function persistRequest(req) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'requests', req.id), req));
  else saveLocal();
}
function resolveRequest(id, status) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  req.status = status;
  req.resolvedAt = Date.now();
  req.resolvedBy = ui.me || 'editor';
  persistRequest(req);
}
function persistAll() {
  if (!fb) { saveLocal(); return; }
  // Collect every write as a thunk, then commit in chunks — a full seed or a
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
    });
  }
}

/* ================= sorting / filtering ================= */

function sortedServices() {
  return state.services.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
function upcomingServices() { const t = todayISO(); return sortedServices().filter(s => s.date >= t); }
function pastServices() { const t = todayISO(); return sortedServices().filter(s => s.date < t); }

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
   fails silently — unsupported browsers (iOS Safari not installed to home
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
      // token rotated — drop the stale doc
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
    if (sheetSvc.choirSong && existing.choirSong !== sheetSvc.choirSong) { existing.choirSong = sheetSvc.choirSong; changed = true; }
    if (!existing.assignments) existing.assignments = {};
    // Only touch duties the sheet mentions — Media Booth, Parking Lot and
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

function render() {
  const nav = document.querySelector('nav.tabs');
  if (feat('siteLock') && !siteUnlocked()) {
    nav.classList.toggle('hidden', true);
    document.getElementById('banners').innerHTML = '';
    document.getElementById('view').innerHTML = renderSiteLock();
    const input = document.getElementById('site-pin-input');
    if (input) input.focus();
    return;
  }
  nav.classList.toggle('hidden', false);

  // The Presider tab only exists for people with an upcoming Presider duty —
  // same rule as the "Plan songs" button in My Duties. If the viewer stops
  // qualifying while on the songs screen (name switch, schedule edit, feature
  // toggle), kick them back to My Duties.
  const isPresider = feat('songPicker') && !!ui.me && dutiesFor(ui.me).some(d => d.duty === 'Presider');
  document.getElementById('tab-presider').classList.toggle('hidden', !isPresider);
  if (ui.tab === 'songs' && !isPresider) { ui.tab = 'my'; ui.songSvc = null; ui.songNav = false; }

  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === ui.tab);
  });
  const unread = Number(localStorage.getItem('wds-unread-' + ui.me) || 0);
  const tabMy = document.getElementById('tab-my');
  tabMy.innerHTML = 'My Duties' + (unread > 0 && ui.tab !== 'my' ? '<span class="dot"></span>' : '');
  const tabManage = document.getElementById('tab-manage');
  tabManage.innerHTML = 'Manage' + (pendingRequestsCount() > 0 && ui.tab !== 'manage' ? '<span class="dot"></span>' : '');

  const view = document.getElementById('view');
  // A background Firestore snapshot calls render(); replacing innerHTML would
  // wipe whatever the editor is typing (service field, member name, sheet URL,
  // change-request note) and drop focus. Skip the view refresh while a text
  // input inside #view is focused — the next render() after they blur catches up.
  if (!viewHasFocusedInput(view)) {
    if (ui.tab === 'schedule') view.innerHTML = renderSchedule();
    else if (ui.tab === 'my') view.innerHTML = renderMy();
    else if (ui.tab === 'songs') renderSongs(view);
    else view.innerHTML = renderManage();
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
    me: nameMap[ui.me] || ui.me,
    nameMap,
    nav,
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
  return state.requests.find(r => r.svcId === svcIdVal && r.duty === duty && r.name === name && r.status === 'pending');
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
  const mine = state.requests.filter(r => r.name === ui.me).slice().sort((a, b) => b.createdAt - a.createdAt);
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
  return state.requests.filter(r => r.status === 'pending').length;
}

function renderManage() {
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
    '<option value="">— None —</option>' +
    state.members.map(m => '<option value="' + esc(m) + '"' + (m === (state.settings.schedulerName || '') ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
    '</select></div>';
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
    .sort((a, b) => a.date.localeCompare(b.date) || SERVICE_LABELS.indexOf(a.service) - SERVICE_LABELS.indexOf(b.service));

  /* --- conflicts, with suggested subs --- */
  let confHtml = '';
  upcoming.forEach(svc => {
    activeConflicts(svc).forEach(c => {
      confHtml += '<div class="plan-conflict"><div class="plan-when"><b>' + esc(c.name) + '</b> — ' +
        esc(fmtDate(svc.date)) + ' · ' + esc(svc.service) +
        ' <span class="plan-duties">(' + c.duties.map(esc).join(' + ') + ')</span></div>';
      c.duties.forEach(duty => {
        const subs = suggestSubs(svc, duty, c.name, stats);
        confHtml += '<div class="plan-suggest"><span class="lab">' + esc(duty) + ' →</span> ' +
          (subs.length
            ? subs.map(m => '<button class="ghost mini" data-act="plan-assign" data-svc="' + svcId(svc) +
                '" data-duty="' + esc(duty) + '" data-name="' + esc(m) + '">' + esc(m) + '</button>').join(' ')
            : '<span class="plan-duties">no free member in this department</span>') +
          '</div>';
      });
      confHtml += '</div>';
    });
  });
  let html = '<div class="card"><div class="f-label">Double-duty conflicts — upcoming</div>' +
    '<div class="f-desc">Tap a name to hand that duty to them. Already-acknowledged doubles (marked OK) are not listed.</div>' +
    (confHtml || '<p class="hint" style="margin-top:12px">No unresolved double-bookings. 🎉</p>') + '</div>';

  /* --- unfilled slots, next 28 days --- */
  /* A service only "expects" the duties that comparable services actually
     staff. Expected = duties filled in >=50% of PLANNED services of the same
     worship|service type. This avoids flagging roles a service never uses
     (e.g. Media/Translation on a weekday), which previously marked every
     service "unfilled". Fully-empty (not-yet-planned) services are skipped —
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
    if (!Object.keys(a).some(d => a[d])) return; // not yet planned — different signal
    const missing = expectedDuties(svc).filter(d => !a[d]);
    if (missing.length) {
      gapHtml += '<div class="plan-suggest"><span class="lab">' + esc(fmtDate(svc.date)) + ' · ' + esc(svc.service) + '</span> ' +
        '<span class="plan-duties">' + missing.length + ' unfilled: ' + missing.map(esc).join(', ') + '</span></div>';
    }
  });
  html += '<div class="card"><div class="f-label">Unfilled duties — next 4 weeks</div>' +
    (gapHtml || '<p class="hint" style="margin-top:12px">Every planned service has its usual duties filled.</p>') + '</div>';

  /* --- workload table --- */
  const rows = Object.keys(stats)
    .map(m => ({ m, s: stats[m] }))
    .filter(r => r.s.total > 0 || state.members.indexOf(r.m) !== -1)
    .sort((a, b) => (b.s.past8 + b.s.upcoming) - (a.s.past8 + a.s.upcoming) || a.m.localeCompare(b.m));
  html += '<div class="card"><div class="f-label">Workload — who is carrying what</div>' +
    '<div class="f-desc">Duty counts. Sorted heaviest first (last 8 weeks + upcoming).</div>' +
    '<div class="plan-scroll"><table class="plan-table"><tr>' +
    '<th>Member</th><th>4 wk</th><th>8 wk</th><th>Upcoming</th><th>Year</th><th>Last served</th><th>Next</th></tr>' +
    rows.map(r => {
      const s = r.s;
      const flag = s.upcoming === 0 ? ' <span class="warn-badge" title="Nothing upcoming">·</span>' : '';
      return '<tr' + (s.past8 + s.upcoming === 0 ? ' class="plan-idle"' : '') + '><td>' + esc(r.m) + flag + '</td>' +
        '<td>' + s.past4 + '</td><td>' + s.past8 + '</td><td>' + s.upcoming + '</td><td>' + s.total + '</td>' +
        '<td>' + (s.last ? esc(fmtDate(s.last)) : '—') + '</td>' +
        '<td>' + (s.next ? esc(fmtDate(s.next)) : '—') + '</td></tr>';
    }).join('') +
    '</table></div></div>';
  return html;
}

function memberSelect(svc, duty) {
  const cur = (svc.assignments || {})[duty] || '';
  const conflicted = feat('conflictWarnings') && cur && activeConflicts(svc).some(c => c.name === cur);
  const cat = dutyCategory(duty);
  const roster = (state.departments || {})[cat.name] || [];
  let options = roster.length ? roster : state.members;
  if (cur && options.indexOf(cur) === -1) options = [cur].concat(options);
  return '<select data-chg="assign" data-svc="' + svcId(svc) + '" data-duty="' + esc(duty) + '"' +
    (conflicted ? ' class="conflict"' : '') + '>' +
    '<option value="">—</option>' +
    options.map(m => '<option value="' + esc(m) + '"' + (m === cur ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
    '</select>';
}

/* Conflict notes for Manage cards. `expanded` controls whether OK/undo actions & muted "marked OK" lines show. */
function renderManageConflicts(svc, expanded) {
  if (!feat('conflictWarnings')) return '';
  const id = svcId(svc);
  const ok = svc.conflictOk || {};
  let html = '';
  activeConflicts(svc).forEach(c => {
    html += '<div class="conflict-note"><span class="dot-c" style="background:var(--warn)"></span>' +
      esc(c.name) + ' has ' + c.duties.length + ' duties this service' +
      (expanded ? ' <button class="linkish" data-act="conflict-ok" data-svc="' + id + '" data-name="' + esc(c.name) + '">Mark as OK</button>' : '') +
      '</div>';
  });
  if (expanded) {
    conflictsFor(svc).filter(c => sameDuties(ok[c.name], c.duties)).forEach(c => {
      html += '<div class="conflict-note ok">' + esc(c.name) + ' has ' + c.duties.length + ' duties (marked OK) ' +
        '<button class="linkish" data-act="conflict-unok" data-svc="' + id + '" data-name="' + esc(c.name) + '">show warning again</button></div>';
    });
  }
  return html;
}

function reqSubmittedAt(r) {
  return new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderManageRequests() {
  const all = state.requests.slice().sort((a, b) => b.createdAt - a.createdAt);
  const pending = all.filter(r => r.status === 'pending');
  const resolved = all.filter(r => r.status !== 'pending');

  let html = '<p class="hint">Members can request a schedule change from My Duties. Approving here does not edit the schedule — ' +
    'open the service in <b>Services</b> to make the actual change.</p>';

  if (!pending.length) {
    html += '<div class="empty">No pending requests.</div>';
  } else {
    pending.forEach(r => {
      html += '<div class="card">' +
        '<div class="req-head"><span class="req-when">' + esc(r.name) + ' — ' + esc(r.duty) + '</span>' + statusChip(r.status) + '</div>' +
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
          '<div class="req-head"><span class="req-when">' + esc(r.name) + ' — ' + esc(r.duty) + '</span>' + statusChip(r.status) + '</div>' +
          '<div class="req-meta">' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) +
          (when ? ' · resolved ' + esc(when) + (r.resolvedBy ? ' by ' + esc(r.resolvedBy) : '') : '') + '</div>' +
          '</div>';
      });
    }
  }
  return html;
}

function renderManageServices() {
  let html = '<form class="add-row" data-act="add-service">' +
    '<input type="date" id="svc-date" required value="' + todayISO() + '">' +
    '<input type="time" id="svc-time" required value="09:00">' +
    '<select id="svc-label">' + SERVICE_LABELS.map(l => '<option>' + l + '</option>').join('') + '</select>' +
    '<input type="text" id="svc-worship" list="worship-types" placeholder="Worship (e.g. Sabbath Day)" value="Sabbath Day">' +
    '<datalist id="worship-types">' + WORSHIP_TYPES.map(w => '<option>' + esc(w) + '</option>').join('') + '</datalist>' +
    '<button class="primary" type="submit">Add</button></form>' +
    '<p class="hint">Tap a service to assign people to each duty.</p>';

  const up = upcomingServices();
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
        '<span class="lab">Date</span><input type="date" value="' + esc(svc.date) + '" data-chg="svc-field" data-svc="' + id + '" data-field="date">' +
        '<span class="lab">Time</span><input type="time" value="' + esc(svc.time) + '" data-chg="svc-field" data-svc="' + id + '" data-field="time">' +
        '<span class="lab">Worship</span><input type="text" value="' + esc(svc.worship) + '" data-chg="svc-field" data-svc="' + id + '" data-field="worship">' +
        '<span class="lab">Choir song</span><input type="text" value="' + esc(svc.choirSong || '') + '" placeholder="e.g. #311 I Repent of My Sin" data-chg="svc-field" data-svc="' + id + '" data-field="choirSong">' +
        '</div>';
      CATEGORIES.forEach(cat => {
        html += '<div class="cat-edit-label"><span class="dot-c" style="background:' + cat.color + '"></span>' + esc(cat.name) + '</div>' +
          '<div class="edit-grid">' +
          cat.duties.map(duty => '<span class="lab">' + esc(duty) + '</span>' + memberSelect(svc, duty)).join('') +
          '</div>';
      });
      html += renderManageConflicts(svc, true);
      html += '<div style="text-align:right;margin-top:12px"><button class="danger-link" data-act="del-service" data-svc="' + id + '">Delete this service</button></div>';
    } else {
      html += renderCatRows(svc, false);
    }
    html += '</div>';
  });
  return html;
}

function renderManagePeople() {
  let html = '<form class="add-row" data-act="add-member">' +
    '<input type="text" id="member-name" required placeholder="New person\'s name (e.g. B. David)">' +
    '<button class="primary" type="submit">Add</button></form>' +
    '<p class="hint">Type on a name to fix it — the change applies to every duty automatically. ' +
    'Check the departments below to control which duty pickers each person shows up in.</p>';
  state.members.forEach(m => {
    const n = dutiesFor(m).length;
    html += '<div class="list-row" style="flex-wrap:wrap">' +
      '<input type="text" value="' + esc(m) + '" data-chg="member-name" data-old="' + esc(m) + '" style="flex:1">' +
      '<span class="count">' + n + ' upcoming</span>' +
      '<button class="danger-link" data-act="del-member" data-name="' + esc(m) + '">Remove</button>' +
      '<div style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px;margin-top:2px">' +
      CATEGORIES.map(cat => {
        const checked = ((state.departments || {})[cat.name] || []).indexOf(m) !== -1;
        return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted)">' +
          '<input type="checkbox" data-chg="member-cat" data-name="' + esc(m) + '" data-cat="' + esc(cat.name) + '"' +
          (checked ? ' checked' : '') + '>' +
          '<span class="dot-c" style="background:' + cat.color + '"></span>' + esc(cat.name) + '</label>';
      }).join('') +
      '</div>' +
      '</div>';
  });
  return html;
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
    status = 'Last checked ' + when + ' — ' + esc(detail);
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
    '<div class="card"><p>Reload the original schedule from the spreadsheet (May – July 2026). This overwrites all current data' + (fb ? ' for everyone' : '') + '.</p>' +
    '<button class="danger-link" data-act="reset">Reset to spreadsheet data</button></div>' +
    '<div class="card"><p>One-time cleanup after the sheet\'s Raw Data tab was tidied up — merges leftover name variants (e.g. "B. Anthony L") into their current spelling everywhere.</p>' +
    '<button class="ghost" data-act="unify-names">Unify member names</button></div>' +
    '</div>';
}

/* ================= actions ================= */

/* Applies NAME_UNIFY_MAP (or a compatible map) to state.members, every
   service's assignments/conflictOk, and every department roster (rosters are
   keyed by member name too, and are what duty dropdowns actually read from —
   see memberSelect — so they must stay in sync or old spellings keep showing
   up there even after members/services are unified).
   Pure w.r.t. persistence — caller persists whatever comes back touched.
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
  if (chg === 'me') {
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
   snapshot re-render mid-typing (see afterDataChange) can't lose the draft —
   'change' alone only fires on blur. */
document.addEventListener('input', e => {
  const el = e.target.closest('[data-chg="req-note"]');
  if (el) handleChg('req-note', el);
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
  } catch (e) { /* private mode, quota, clock — all non-fatal */ }
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
      setSyncPill(true); // data is now flowing — safe to claim "Live sync on"
      afterDataChange();
      scheduleSyncSoon();
      return;
    }
    firstSnapshot = false;
    state.services = snap.docs.map(d => d.data());
    fb.knownIds = snap.docs.map(d => d.id);
    setSyncPill(true); // data has landed — flip the pill to live now, not before
    afterDataChange();
    scheduleSyncSoon(); // auto-pull from the sheet once, shortly after real data lands
  }, err => {
    addBanner('Could not connect to the shared database (' + err.code + '). Showing this device\'s copy.', true);
    if (!state.services.length) { state = loadLocal() || seedState(); render(); }
    setSyncPill(false);
  });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'members'), snap => {
    if (snap.exists()) state.members = snap.data().list || [];
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
      state.departments = DEPARTMENTS_SEED;
      persistDepartments();
    } else {
      state.departments = map;
    }
    departmentsLoaded = true;
    renderSoon();
  }, () => { /* connection errors are surfaced by the schedule listener */ });
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
  fsMod.onSnapshot(fsMod.collection(db, 'requests'), snap => {
    state.requests = snap.docs.map(d => d.data());
    renderSoon();
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
  if (notifyOn()) registerPush();
}

function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (window.FIREBASE_CONFIG) {
    // Paint the schedule this device saw last, right now, instead of a
    // "Loading…" placeholder. The live snapshot overwrites it moments later.
    // membersLoaded / departmentsLoaded stay false on purpose: they gate the
    // sheet sync, which must not run against a cached roster.
    const cached = loadLocal();
    if (cached && cached.services && cached.services.length) {
      state = cached;
      render();
    } else {
      renderLoading();
    }
    initFirebase(window.FIREBASE_CONFIG).catch(() => {
      addBanner('Firebase config is invalid — running on this device only.', true);
      state = loadLocal() || seedState();
      departmentsLoaded = true;
      membersLoaded = true;
      setSyncPill(false);
      afterDataChange();
    });
  } else {
    state = loadLocal() || seedState();
    departmentsLoaded = true;
    membersLoaded = true;
    saveLocal();
    setSyncPill(false);
    afterDataChange();
    autoSyncOnce();
  }
  setInterval(checkReminders, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
}

init();
