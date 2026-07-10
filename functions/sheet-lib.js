'use strict';

/**
 * Pure sheet-parsing logic for the scheduled server-side Sheet -> Firestore
 * sync. Ported line-for-line from app.js ("google sheet sync — pure parsers")
 * so the Cloud Function and the in-app sync agree on every edge case. If you
 * change the parsing rules in app.js, mirror the change here.
 */

const CATEGORIES = [
  { name: 'Worship',        duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
  { name: 'Usher Sisters',  duties: ['Usher Door', 'Usher Front', 'Usher Back'] },
  { name: 'Usher Brothers', duties: ['Usher #1', 'Usher #2', 'Lobby Security'] },
  { name: 'Lobby',          duties: ['Lobby Desk #1', 'Lobby Desk #2'] },
  { name: 'Translation',    duties: ['Translation #1', 'Translation #2'] },
  { name: 'Media',          duties: ['Media Booth #1', 'Media Booth #2'] }
];

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSi0PRu7yJ9wbRn612zWq7rpInps6vWBcU7O9uHCp9W18sOCCF2U2ALS5EOo8hWrTSYXAfGmqiKYkaF/pub?gid=453135143&single=true&output=csv';

function pad(n) { return (n < 10 ? '0' : '') + n; }

/* Same id scheme as the app's svcId() (app.js): date + '_' + service label
   with every non-alphanumeric run collapsed to '-'. MUST match app.js exactly
   or the browser and this function compute different doc ids for one service. */
function svcId(svc) {
  return svc.date + '_' + String(svc.service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function dutyCategory(duty) {
  return CATEGORIES.find(c => c.duties.indexOf(duty) !== -1) || CATEGORIES[0];
}

/* Minimal RFC-4180-ish CSV parser (ported from app.js parseCSV). */
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
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function validDutySet() {
  const set = {};
  CATEGORIES.forEach(cat => cat.duties.forEach(duty => { set[duty] = true; }));
  return set;
}

const SHEET_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function parseSheetDate(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/^[a-z]+,?\s*/i, '').trim();
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const mon = SHEET_MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  const day = parseInt(m[2], 10);
  if (!(day >= 1 && day <= 31)) return null;
  return { month: mon, day: day };
}

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

/* Turn parsed CSV rows into service objects (ported from app.js). */
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
  const byKey = {};
  const membersSeen = {};
  const unknownDuties = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = i => (i >= 0 && i < row.length ? String(row[i] == null ? '' : row[i]).trim() : '');
    const rawDate = cell(iDate), serviceLabel = cell(iService);
    const duty = cell(iDuty);
    // Sanitize the member name from the multi-editor sheet: strip control
    // chars (incl. CR/LF that could inject into the .ics feed) and cap length.
    const member = cell(iMember).replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    // A blank Member cell in an otherwise-valid duty row is an explicit
    // "clear this duty" (planMerge writes '' over the old name). Date/Service/
    // Duty are still required. A *deleted* row leaves the slot untouched.
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

/* Merge policy, mirroring the app's mergeSheetServices: new services are
   created whole; existing ones change field-by-field, and only duties the
   sheet mentions are touched (in-app-only duties are preserved). Instead of
   writing, returns { creates: [{id, svc}], updates: [{id, patch}] } so the
   caller controls Firestore I/O and can count zero-write runs. */
function planMerge(sheetServices, existingById) {
  const creates = [], updates = [];
  sheetServices.forEach(sheetSvc => {
    const id = svcId(sheetSvc);
    const existing = existingById[id];
    if (!existing) {
      creates.push({
        id: id,
        svc: {
          date: sheetSvc.date,
          time: sheetSvc.time || '',
          service: sheetSvc.service,
          worship: sheetSvc.worship || '',
          choirSong: sheetSvc.choirSong || '',
          assignments: Object.assign({}, sheetSvc.assignments)
        }
      });
      return;
    }
    const patch = {};
    if (sheetSvc.time && existing.time !== sheetSvc.time) patch.time = sheetSvc.time;
    if (sheetSvc.worship && existing.worship !== sheetSvc.worship) patch.worship = sheetSvc.worship;
    if (sheetSvc.choirSong && existing.choirSong !== sheetSvc.choirSong) patch.choirSong = sheetSvc.choirSong;
    const existingAssignments = existing.assignments || {};
    const changedAssignments = {};
    let assignmentsChanged = false;
    Object.keys(sheetSvc.assignments).forEach(duty => {
      if (existingAssignments[duty] !== sheetSvc.assignments[duty]) {
        changedAssignments[duty] = sheetSvc.assignments[duty];
        assignmentsChanged = true;
      }
    });
    if (assignmentsChanged) {
      patch.assignments = Object.assign({}, existingAssignments, changedAssignments);
    }
    if (Object.keys(patch).length) updates.push({ id: id, patch: patch });
  });
  return { creates: creates, updates: updates };
}

module.exports = {
  CATEGORIES, DEFAULT_SHEET_URL,
  parseCSV, sheetRowsToServices, planMerge, svcId, dutyCategory
};
