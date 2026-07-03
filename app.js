'use strict';

/* ================= constants ================= */

const CATEGORIES = [
  { name: 'Worship',        color: '#4338ca', duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
  { name: 'Usher Sisters',  color: '#be185d', duties: ['Usher Door', 'Usher Front', 'Usher Back'] },
  { name: 'Usher Brothers', color: '#0369a1', duties: ['Usher #1', 'Usher #2', 'Lobby Security'] },
  { name: 'Lobby',          color: '#b45309', duties: ['Lobby Desk #1', 'Lobby Desk #2'] },
  { name: 'Translation',    color: '#047857', duties: ['Translation #1', 'Translation #2'] },
  { name: 'Media',          color: '#6d28d9', duties: ['Media Booth #1', 'Media Booth #2'] }
];
const SERVICE_LABELS = ['Morning', 'Afternoon', 'Evening', 'Early Morning', 'Commemoration'];
const WORSHIP_TYPES = ['Sabbath Day', 'Third Day', 'Prayer Week', 'Ascension Day', 'Pentecost', 'Heavenly Parent\'s Day'];
const DATA_KEY = 'wds-data-v2';
const DEFAULT_SITE_HASH = '1dffd68e5364ca2371d1627e59141f261264a7539f81c1746000b7320b5ad65b'; // SHA-256 of '2217'
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSi0PRu7yJ9wbRn612zWq7rpInps6vWBcU7O9uHCp9W18sOCCF2U2ALS5EOo8hWrTSYXAfGmqiKYkaF/pub?gid=453135143&single=true&output=csv';

/* Feature toggles — managed live in Manage → Features, synced to every device */
const FEATURES = [
  { id: 'siteLock',       label: 'Site passcode',             desc: 'Everyone must enter the 4-digit passcode before the app opens on a new device.', def: true },
  { id: 'editorLock',     label: 'Editor passcode',           desc: 'Require the passcode before anyone can open Manage and edit the schedule.', def: true },
  { id: 'notifications',  label: 'New-duty alerts',           desc: 'Members are alerted when a duty is added for them.', def: true },
  { id: 'reminders',      label: 'Day-before reminders',      desc: 'Members are reminded within 24 hours of each duty.', def: true },
  { id: 'calendarExport', label: 'Add-to-calendar button',    desc: 'Members can download their duties to their phone calendar with built-in reminders.', def: true },
  { id: 'whoElse',        label: '"Who else is serving?"',    desc: 'My Duties can expand the full lineup for each service.', def: true },
  { id: 'choirSong',      label: 'Choir song on services',    desc: 'Show the choir song line on each service card.', def: true },
  { id: 'pastServices',   label: 'Past services',             desc: 'Allow browsing services that already happened.', def: true },
  { id: 'emptyDuties',    label: 'Show unassigned duties',    desc: 'The schedule shows every duty slot, even ones without a name yet.', def: false },
  { id: 'conflictWarnings', label: 'Double-duty warnings',    desc: 'Show a notice when one person has two duties in the same service.', def: true },
  { id: 'sheetSync',      label: 'Google Sheet sync',        desc: 'Pull schedule updates from the published Google Sheet automatically.', def: true }
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
/* Every member appearing in 2+ duties of this service, with their duty list (stable order) */
function conflictsFor(svc) {
  const byMember = {};
  const assignments = svc.assignments || {};
  Object.keys(assignments).forEach(duty => {
    const name = assignments[duty];
    if (!name) return;
    (byMember[name] || (byMember[name] = [])).push(duty);
  });
  return Object.keys(byMember)
    .filter(name => byMember[name].length >= 2)
    .map(name => ({ name, duties: sortDuties(byMember[name]) }));
}
/* conflictsFor minus ones already acknowledged (conflictOk) with a matching duty list */
function activeConflicts(svc) {
  const ok = svc.conflictOk || {};
  return conflictsFor(svc).filter(c => !sameDuties(ok[c.name], c.duties));
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
    if (!rawDate || !serviceLabel || !duty || !member) continue;
    const md = parseSheetDate(rawDate);
    if (!md) continue;
    const iso = inferYearISO(md.month, md.day, today);
    if (!valid[duty]) {
      if (!unknownDuties[duty]) { unknownDuties[duty] = true; result.warnings.push('Unknown duty in sheet: "' + duty + '"'); }
      continue;
    }
    const key = iso + '|' + serviceLabel;
    let svc = byKey[key];
    if (!svc) {
      svc = { date: iso, service: serviceLabel, worship: iWorship >= 0 ? cell(iWorship) : '', time: parseSheetTime(cell(iTime)), assignments: {} };
      byKey[key] = svc;
      result.services.push(svc);
    }
    svc.assignments[duty] = member;
    membersSeen[member] = true;
  }
  result.members = Object.keys(membersSeen).sort();
  return result;
}

/* ================= state ================= */

let state = { members: [], services: [], settings: { features: {}, pinHash: '' } };
let fb = null; // { db, setDoc, doc, deleteDoc, writeBatch, collection }
let settingsLoaded = false; // true once shared settings arrived (or local mode)

const ui = {
  tab: 'schedule',
  sub: 'services',
  me: localStorage.getItem('wds-me') || '',
  expanded: {},
  showPast: false,
  banners: [],
  pinError: '',
  sitePinError: '',
  rebaseline: false,
  syncing: false
};

function seedState() {
  return JSON.parse(JSON.stringify({
    members: window.SEED_DATA.members,
    services: window.SEED_DATA.services,
    settings: { features: {}, pinHash: '' }
  }));
}
function saveLocal() { localStorage.setItem(DATA_KEY, JSON.stringify(state)); }
function loadLocal() {
  try {
    const obj = JSON.parse(localStorage.getItem(DATA_KEY));
    if (obj && Array.isArray(obj.members) && Array.isArray(obj.services)) {
      if (!obj.settings) obj.settings = { features: {}, pinHash: '' };
      return obj;
    }
  } catch (e) { /* ignore */ }
  return null;
}

/* persistence that works in both modes */
function persistService(svc) {
  if (fb) fb.setDoc(fb.doc(fb.db, 'schedule', svcId(svc)), svc);
  else saveLocal();
}
function persistDeleteService(id) {
  if (fb) fb.deleteDoc(fb.doc(fb.db, 'schedule', id));
  else saveLocal();
}
function persistMembers() {
  if (fb) fb.setDoc(fb.doc(fb.db, 'app', 'members'), { list: state.members });
  else saveLocal();
}
function persistSettings() {
  if (fb) fb.setDoc(fb.doc(fb.db, 'app', 'settings'), state.settings);
  else saveLocal();
}
function persistAll() {
  if (!fb) { saveLocal(); return; }
  const batch = fb.writeBatch(fb.db);
  const keep = {};
  state.services.forEach(svc => {
    const id = svcId(svc);
    keep[id] = true;
    batch.set(fb.doc(fb.db, 'schedule', id), svc);
  });
  (fb.knownIds || []).forEach(id => { if (!keep[id]) batch.delete(fb.doc(fb.db, 'schedule', id)); });
  batch.set(fb.doc(fb.db, 'app', 'members'), { list: state.members });
  batch.set(fb.doc(fb.db, 'app', 'settings'), state.settings);
  batch.commit();
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

async function sysNotify(title, body) {
  if (!notifyOn()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) { reg.showNotification(title, { body, icon: 'icon.svg' }); return; }
  } catch (e) { /* fall through */ }
  try { new Notification(title, { body }); } catch (e) { /* unsupported */ }
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
      sysNotify('New duty assigned to you', dutyLabel(d));
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
      sysNotify('Duty reminder', dutyLabel(d));
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

function afterDataChange() {
  render();
  checkNewDuties();
  checkReminders();
}

/* ================= google sheet sync — engine ================= */

const SHEET_SYNC_MIN_MS = 5 * 60 * 1000; // auto-sync throttle window

/* Merge a parsed sheet result into state, field-by-field so unchanged
   services trigger zero Firestore writes. Returns { added, updated }. */
function mergeSheetServices(services) {
  let added = 0, updated = 0;
  services.forEach(sheetSvc => {
    const existing = findService(svcId(sheetSvc));
    if (!existing) {
      const fresh = {
        date: sheetSvc.date,
        time: sheetSvc.time || '',
        service: sheetSvc.service,
        worship: sheetSvc.worship || '',
        choirSong: '',
        assignments: Object.assign({}, sheetSvc.assignments)
      };
      state.services.push(fresh);
      persistService(fresh);
      added++;
      return;
    }
    let changed = false;
    if (sheetSvc.time && existing.time !== sheetSvc.time) { existing.time = sheetSvc.time; changed = true; }
    if (sheetSvc.worship && existing.worship !== sheetSvc.worship) { existing.worship = sheetSvc.worship; changed = true; }
    if (!existing.assignments) existing.assignments = {};
    // Only touch duties the sheet mentions — Media Booth etc. are preserved.
    Object.keys(sheetSvc.assignments).forEach(duty => {
      if (existing.assignments[duty] !== sheetSvc.assignments[duty]) {
        existing.assignments[duty] = sheetSvc.assignments[duty];
        changed = true;
      }
    });
    if (changed) { persistService(existing); updated++; }
  });
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
function autoSyncOnce() {
  if (sheetSyncTried) return;
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

function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,'); }

function downloadICS() {
  const duties = dutiesFor(ui.me);
  if (!duties.length) { alert('No upcoming duties to add.'); return; }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LV Zion//Worship Duties//EN'];
  duties.forEach(d => {
    const dt = d.svc.date.replace(/-/g, '') + 'T' + (d.svc.time || '12:00').replace(':', '') + '00';
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + svcId(d.svc) + '-' + d.duty.replace(/[^a-zA-Z0-9]/g, '') + '@lvzion',
      'DTSTART:' + dt,
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

  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === ui.tab);
  });
  const unread = Number(localStorage.getItem('wds-unread-' + ui.me) || 0);
  const tabMy = document.getElementById('tab-my');
  tabMy.innerHTML = 'My Duties' + (unread > 0 && ui.tab !== 'my' ? '<span class="dot"></span>' : '');

  const view = document.getElementById('view');
  if (ui.tab === 'schedule') view.innerHTML = renderSchedule();
  else if (ui.tab === 'my') view.innerHTML = renderMy();
  else view.innerHTML = renderManage();
  renderBanners();
}

function renderBanners() {
  if (feat('siteLock') && !siteUnlocked()) { document.getElementById('banners').innerHTML = ''; return; }
  document.getElementById('banners').innerHTML = ui.banners.map((b, i) =>
    '<div class="banner' + (b.alert ? ' alert' : '') + '"><span>' + esc(b.txt) + '</span>' +
    '<button class="x" data-act="dismiss-banner" data-i="' + i + '">✕</button></div>'
  ).join('');
}

function pillFor(member) {
  const mine = ui.me && member === ui.me;
  return '<span class="pill' + (mine ? ' me' : '') + '">' + esc(member) + (mine ? ' (You)' : '') + '</span>';
}

function renderCatRows(svc, showEmpty) {
  let html = '';
  CATEGORIES.forEach(cat => {
    const rows = cat.duties
      .filter(duty => showEmpty || feat('emptyDuties') || (svc.assignments || {})[duty])
      .map(duty => {
        const m = (svc.assignments || {})[duty];
        return '<div class="duty-row"><div class="dname">' + esc(duty) + '</div>' +
          (m ? pillFor(m) : '<span style="color:var(--muted);font-style:italic;font-size:13px">—</span>') + '</div>';
      });
    if (rows.length) {
      html += '<div class="cat-label"><span class="dot-c" style="background:' + cat.color + '"></span>' +
        esc(cat.name) + '</div>' + rows.join('');
    }
  });
  return html;
}

/* Read-only conflict notes shown on public/my-duties cards */
function renderConflictNotes(svc) {
  if (!feat('conflictWarnings')) return '';
  return activeConflicts(svc).map(c =>
    '<div class="conflict-note"><span class="dot-c" style="background:var(--warn)"></span>' +
    esc(c.name) + ' has ' + c.duties.length + ' duties this service</div>'
  ).join('');
}

function renderServiceCard(svc) {
  return '<div class="card">' +
    '<div class="card-head"><span class="svc-title">' + esc(svc.worship) + ' <small>· ' + esc(svc.service) + '</small></span>' +
    '<span class="time">' + fmtTime(svc.time) + '</span></div>' +
    (feat('choirSong') && svc.choirSong ? '<div class="choir-song">Choir · ' + esc(svc.choirSong) + '</div>' : '') +
    renderCatRows(svc, false) +
    renderConflictNotes(svc) +
    '</div>';
}

function renderServiceList(list) {
  let html = '', lastDate = '';
  list.forEach(svc => {
    if (svc.date !== lastDate) {
      lastDate = svc.date;
      const badge = dateBadge(svc.date);
      html += '<div class="date-head"><span class="day">' + esc(fmtDate(svc.date)) + '</span>' +
        (badge ? '<span class="badge">' + badge + '</span>' : '') + '</div>';
    }
    html += renderServiceCard(svc);
  });
  return html;
}

function renderSchedule() {
  let html = '';
  const up = upcomingServices();
  if (!up.length) html += '<div class="empty">No upcoming services yet.<br>Add them in the <b>Manage</b> tab.</div>';
  else html += renderServiceList(up);
  const past = feat('pastServices') ? pastServices() : [];
  if (past.length) {
    html += '<div style="text-align:center"><button class="linkish" data-act="toggle-past">' +
      (ui.showPast ? 'Hide past services' : 'Show ' + past.length + ' past services') + '</button></div>';
    if (ui.showPast) html += renderServiceList(past.slice().reverse());
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
    controls += '<button class="ghost" data-act="download-ics">Add my duties to my calendar</button>';
  }
  if (controls) {
    html += '<div class="notify-box">' + controls + '</div>' +
      '<p class="hint">You\'ll be alerted when a new duty is added for you, and reminded the day before each duty. ' +
      'The calendar file adds reminders straight to your phone\'s calendar.</p>';
  }

  // recent alerts
  const alerts = getJSON('wds-alerts-' + ui.me, []);
  if (alerts.length) {
    html += '<div class="card"><b style="font-size:13.5px">Recent updates</b>' +
      alerts.slice(0, 6).map(a =>
        '<div class="alert-item"><span class="t">' + new Date(a.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</span>' +
        '<span>' + esc(a.txt) + '</span></div>').join('') +
      '</div>';
  }

  const duties = dutiesFor(ui.me);
  if (!duties.length) return html + '<div class="empty">You have no duties coming up.</div>';

  html += '<p class="hint">You have <b>' + duties.length + '</b> upcoming dut' + (duties.length > 1 ? 'ies' : 'y') + '.</p>';
  duties.forEach(d => {
    const key = svcId(d.svc) + ':' + d.duty;
    const badge = dateBadge(d.svc.date);
    html += '<div class="card duty-card" style="--edge:' + d.cat.color + '">' +
      '<div class="when">' + esc(fmtDate(d.svc.date)) + ' · ' + fmtTime(d.svc.time) +
      (badge ? ' · <b style="color:var(--accent)">' + badge + '</b>' : '') + '</div>' +
      '<div class="what">' + esc(d.svc.worship) + ' · ' + esc(d.svc.service) + '</div>' +
      '<div class="role"><span class="dot-c" style="background:' + d.cat.color + '"></span>' + esc(d.duty) + '</div>' +
      (feat('whoElse')
        ? '<button class="linkish" data-act="expand" data-id="' + key + '">' +
          (ui.expanded[key] ? 'Hide the others serving' : 'Who else is serving?') + '</button>' +
          (ui.expanded[key] ? '<div class="duty-expand">' + renderCatRows(d.svc, false) + renderConflictNotes(d.svc) + '</div>' : '')
        : '') +
      '</div>';
  });
  return html;
}

function renderManage() {
  if (feat('editorLock')) {
    const pin = state.settings.pinHash || '';
    if (!pin) return renderCreatePin();
    if (localStorage.getItem('wds-unlock') !== pin) return renderUnlock();
  }
  const subs = [['services', 'Services'], ['people', 'People'], ['features', 'Features'], ['data', 'Data & Sync']];
  let html = '<div class="subnav">' + subs.map(s =>
    '<button data-act="sub" data-sub="' + s[0] + '"' + (ui.sub === s[0] ? ' class="active"' : '') + '>' + s[1] + '</button>').join('') +
    (feat('editorLock') ? '<button class="lock-btn" data-act="lock-now">Lock</button>' : '') +
    '</div>';
  if (ui.sub === 'services') html += renderManageServices();
  else if (ui.sub === 'people') html += renderManagePeople();
  else if (ui.sub === 'features') html += renderFeatures();
  else html += renderManageData();
  return html;
}

function renderSiteLock() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">This schedule is private</div>' +
    '<p class="hint">Enter the 4-digit passcode shared with the congregation.</p>' +
    '<form class="add-row" data-act="site-unlock">' +
    '<input type="password" id="site-pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required>' +
    '<button class="primary" type="submit">Enter</button></form>' +
    (ui.sitePinError ? '<p class="pin-error">' + esc(ui.sitePinError) + '</p>' : '') +
    '</div>';
}

function renderUnlock() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">Editing is locked</div>' +
    '<p class="hint">Enter the editor passcode to manage the schedule. Viewing never needs a passcode.</p>' +
    '<form class="add-row" data-act="unlock">' +
    '<input type="password" id="pin-input" placeholder="Passcode" autocomplete="off" required>' +
    '<button class="primary" type="submit">Unlock</button></form>' +
    (ui.pinError ? '<p class="pin-error">' + esc(ui.pinError) + '</p>' : '') +
    '</div>';
}

function renderCreatePin() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">Create the editor passcode</div>' +
    '<p class="hint">No passcode exists yet. Whoever sets it first becomes the editor — afterwards it is required to open Manage on any device.</p>' +
    '<form class="add-row" data-act="set-pin">' +
    '<input type="password" id="pin-new" placeholder="New passcode" autocomplete="off" required>' +
    '<input type="password" id="pin-confirm" placeholder="Repeat it" autocomplete="off" required>' +
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
      (feat(f.id) ? ' checked' : '') + '><span class="track"></span></label>' +
      '</div>';
  });
  html += '<div class="card"><div class="f-label">Change the editor passcode</div>' +
    '<form class="add-row" style="margin-top:12px" data-act="change-pin">' +
    '<input type="password" id="pin-change" placeholder="New passcode" autocomplete="off" required>' +
    '<button class="ghost" type="submit">Change</button></form></div>';
  html += '<div class="card"><div class="f-label">Change the site passcode</div>' +
    '<div class="f-desc">The 4-digit code everyone enters to open the app.</div>' +
    '<form class="add-row" style="margin-top:12px" data-act="change-site-pin">' +
    '<input type="password" id="site-pin-change" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="New passcode" autocomplete="off" required>' +
    '<button class="ghost" type="submit">Change</button></form></div>';
  return html;
}

function memberSelect(svc, duty) {
  const cur = (svc.assignments || {})[duty] || '';
  const conflicted = feat('conflictWarnings') && cur && activeConflicts(svc).some(c => c.name === cur);
  return '<select data-chg="assign" data-svc="' + svcId(svc) + '" data-duty="' + esc(duty) + '"' +
    (conflicted ? ' class="conflict"' : '') + '>' +
    '<option value="">—</option>' +
    state.members.map(m => '<option value="' + esc(m) + '"' + (m === cur ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
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
      '<div class="card-head" style="cursor:pointer" data-act="expand" data-id="m:' + id + '">' +
      '<span class="svc-title">' + esc(svc.worship) + ' <small>· ' + esc(svc.service) + '</small></span>' +
      '<span class="time">' + fmtTime(svc.time) + ' ' + (open ? '▲' : '▼') + '</span></div>';
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
      html += renderManageConflicts(svc, false);
    }
    html += '</div>';
  });
  return html;
}

function renderManagePeople() {
  let html = '<form class="add-row" data-act="add-member">' +
    '<input type="text" id="member-name" required placeholder="New person\'s name (e.g. B. David)">' +
    '<button class="primary" type="submit">Add</button></form>' +
    '<p class="hint">Type on a name to fix it — the change applies to every duty automatically.</p>';
  state.members.forEach(m => {
    const n = dutiesFor(m).length;
    html += '<div class="list-row">' +
      '<input type="text" value="' + esc(m) + '" data-chg="member-name" data-old="' + esc(m) + '" style="flex:1">' +
      '<span class="count">' + n + ' upcoming</span>' +
      '<button class="danger-link" data-act="del-member" data-name="' + esc(m) + '">Remove</button>' +
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
    '<div class="hint" style="margin:8px 2px 0">The sheet is the source of truth for the duties it lists. Media Booth, choir songs, and extra services added here are kept.</div>';

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
    '</div>';
}

/* ================= actions ================= */

function findService(id) { return state.services.find(s => svcId(s) === id); }

function handleAct(act, el) {
  if (act === 'tab') {
    ui.tab = el.dataset.tab;
    if (ui.tab === 'my') localStorage.setItem('wds-unread-' + ui.me, '0');
    render();
  }
  else if (act === 'sub') { ui.sub = el.dataset.sub; render(); }
  else if (act === 'dismiss-banner') { ui.banners.splice(Number(el.dataset.i), 1); renderBanners(); }
  else if (act === 'toggle-past') { ui.showPast = !ui.showPast; render(); }
  else if (act === 'expand') { ui.expanded[el.dataset.id] = !ui.expanded[el.dataset.id]; render(); }
  else if (act === 'notify-on') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        localStorage.setItem('wds-notify', '1');
        sysNotify('Notifications are on', 'You\'ll hear about new duties and get reminders here.');
      } else {
        alert('Notifications were blocked. You can allow them in your browser settings.');
      }
      render();
    });
  }
  else if (act === 'notify-off') { localStorage.setItem('wds-notify', '0'); render(); }
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
  else if (act === 'download-ics') { downloadICS(); }
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
      persistMembers();
      touched.forEach(persistService);
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
}

function handleChg(chg, el) {
  if (chg === 'me') {
    ui.me = el.value;
    localStorage.setItem('wds-me', ui.me);
    ui.rebaseline = true;
    render();
    checkNewDuties();
    checkReminders();
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
    if (ui.me === oldName) { ui.me = newName; localStorage.setItem('wds-me', newName); }
    persistMembers();
    touched.forEach(persistService);
    afterDataChange();
  }
  else if (chg === 'feature') {
    if (!state.settings.features) state.settings.features = {};
    state.settings.features[el.dataset.id] = el.checked;
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

/* ================= startup ================= */

function setSyncPill(live) {
  const pill = document.getElementById('sync-pill');
  pill.textContent = live ? 'Live sync on' : 'This device only';
  pill.classList.toggle('live', !!live);
}

async function initFirebase(config) {
  const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const fsMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const app = appMod.initializeApp(config);
  const db = fsMod.getFirestore(app);
  fb = {
    db,
    doc: fsMod.doc,
    setDoc: fsMod.setDoc,
    deleteDoc: fsMod.deleteDoc,
    writeBatch: fsMod.writeBatch,
    knownIds: []
  };
  let firstSnapshot = true;
  fsMod.onSnapshot(fsMod.collection(db, 'schedule'), snap => {
    if (firstSnapshot && snap.empty) {
      firstSnapshot = false;
      // brand-new database: upload the spreadsheet schedule once
      state = loadLocal() || seedState();
      persistAll();
      afterDataChange();
      scheduleSyncSoon();
      return;
    }
    firstSnapshot = false;
    state.services = snap.docs.map(d => d.data());
    fb.knownIds = snap.docs.map(d => d.id);
    afterDataChange();
    scheduleSyncSoon(); // auto-pull from the sheet once, shortly after real data lands
  }, err => {
    addBanner('Could not connect to the shared database (' + err.code + '). Showing this device\'s copy.', true);
    if (!state.services.length) { state = loadLocal() || seedState(); render(); }
    setSyncPill(false);
  });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'members'), snap => {
    if (snap.exists()) { state.members = snap.data().list || []; render(); }
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'settings'), snap => {
    if (snap.exists()) {
      state.settings = Object.assign({ features: {}, pinHash: '' }, snap.data());
      render();
    }
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  setSyncPill(true);
}

function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (window.FIREBASE_CONFIG) {
    initFirebase(window.FIREBASE_CONFIG).catch(() => {
      addBanner('Firebase config is invalid — running on this device only.', true);
      state = loadLocal() || seedState();
      setSyncPill(false);
      afterDataChange();
    });
  } else {
    state = loadLocal() || seedState();
    saveLocal();
    setSyncPill(false);
    afterDataChange();
    autoSyncOnce();
  }
  setInterval(checkReminders, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
}

init();
