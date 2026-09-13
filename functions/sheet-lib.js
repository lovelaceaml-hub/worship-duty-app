'use strict';

/**
 * Pure sheet-parsing logic for the scheduled server-side Sheet -> Firestore
 * sync. Ported line-for-line from app.js ("google sheet sync - pure parsers")
 * so the Cloud Function and the in-app sync agree on every edge case. If you
 * change the parsing rules in app.js, mirror the change here.
 */

const CATEGORIES = [
  { name: 'Worship',        duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'] },
  { name: 'Usher Sisters',  duties: ['Usher Door', 'Usher Front', 'Usher Back'] },
  { name: 'Usher Brothers', duties: ['Usher #1', 'Usher #2', 'Lobby Security'] },
  { name: 'Lobby',          duties: ['Lobby Desk #1', 'Lobby Desk #2'] },
  { name: 'Translation',    duties: ['Translation #1', 'Translation #2'] },
  { name: 'Media',          duties: ['Media Booth #1', 'Media Booth #2'] },
  { name: 'Parking Lot',    duties: ['Parking #1', 'Parking #2', 'Parking #3', 'Parking #4', 'Parking #5'] },
  { name: 'Offering',       duties: ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'] }
];

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSi0PRu7yJ9wbRn612zWq7rpInps6vWBcU7O9uHCp9W18sOCCF2U2ALS5EOo8hWrTSYXAfGmqiKYkaF/pub?gid=453135143&single=true&output=csv';

function pad(n) { return (n < 10 ? '0' : '') + n; }

/* Validate a local calendar date without converting it through UTC. The sheet
   carries month/day values without a year, so the year inference below must
   never let JavaScript normalize February 30 into a different service date. */
function isCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(year, month, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}

function isValidMonthDay(month, day) {
  // Use a leap year here so February 29 remains a valid sheet date. The
  // candidate year is checked separately by inferYearISO().
  return isCalendarDate(2000, month, day);
}

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
  // A weekday prefix is optional. Remove it only when it has a comma, so the
  // valid no-weekday form "May 02" is not mistaken for a weekday prefix.
  let cleaned = String(raw).trim().replace(/^[a-z]+,\s*/i, '');
  const parts = cleaned.split(/\s+/);
  // Also accept a space-only weekday prefix such as "Sat May 02". The
  // second token must be a known month, which keeps "May 02" untouched.
  if (parts.length === 3 && SHEET_MONTHS[parts[1].slice(0, 3).toLowerCase()] != null) {
    cleaned = parts.slice(1).join(' ');
  }
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const mon = SHEET_MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  const day = parseInt(m[2], 10);
  if (!isValidMonthDay(mon, day)) return null;
  return { month: mon, day: day };
}

function inferYearISO(month, day, today) {
  if (!isValidMonthDay(month, day)) return null;
  const base = today && typeof today.getTime === 'function' && !Number.isNaN(today.getTime())
    ? today : new Date();
  const y0 = base.getFullYear();
  const nowT = base.getTime();
  let best = null, bestDiff = Infinity;
  [y0 - 1, y0, y0 + 1].forEach(y => {
    if (!isCalendarDate(y, month, day)) return;
    const d = new Date(y, month, day, 12, 0, 0);
    const diff = Math.abs(d.getTime() - nowT);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  });
  if (!best) return null;
  return best.getFullYear() + '-' + pad(best.getMonth() + 1) + '-' + pad(best.getDate());
}

function parseSheetTime(raw) {
  if (!raw) return '';
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?$/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (h < 1 || h > 12 || parseInt(min, 10) > 59) return '';
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
  // Service identity is the exact inferred date plus the trimmed service
  // label. This keeps two services on one date separate and prevents duties
  // from one date or service carrying into another.
  const byKey = new Map();
  const seenRows = new Set();
  const duplicateWarnings = new Set();
  const unknownDuties = new Set();
  const membersSeen = new Set();

  /* Duplicate policy: source rows are applied in order, preserving the
     existing last-row-wins behavior. A duplicate is warned once per exact
     date/service/duty key, including when the later row is blank. The warning
     makes the ambiguity visible while keeping the result deterministic for a
     given CSV. */
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
    if (!iso) continue;
    const isChoirSong = duty === 'Choir Song';
    if (!isChoirSong && !valid[duty]) {
      if (!unknownDuties.has(duty)) {
        unknownDuties.add(duty);
        result.warnings.push('Unknown duty in sheet: "' + duty + '"');
      }
      continue;
    }
    const serviceKey = JSON.stringify([iso, serviceLabel]);
    const rowKey = JSON.stringify([iso, serviceLabel, duty]);
    if (seenRows.has(rowKey) && !duplicateWarnings.has(rowKey)) {
      duplicateWarnings.add(rowKey);
      result.warnings.push('Duplicate sheet row for ' + iso + ' / ' + serviceLabel + ' / ' + duty + '; later row wins.');
    }
    seenRows.add(rowKey);
    let svc = byKey.get(serviceKey);
    if (!svc) {
      svc = {
        date: iso,
        service: serviceLabel,
        worship: iWorship >= 0 ? cell(iWorship) : '',
        time: parseSheetTime(cell(iTime)),
        assignments: {},
        choirSong: '',
        _sheetChoirSongSeen: false
      };
      byKey.set(serviceKey, svc);
      result.services.push(svc);
    }
    if (isChoirSong) {
      svc._sheetChoirSongSeen = true;
      svc.choirSong = member; // an explicit blank row clears a stale song
      continue;
    }
    svc.assignments[duty] = member; // '' explicitly clears the slot
    if (member) membersSeen.add(member);
  }
  // Keep every non-empty assignment name found in the sheet, including a
  // name later replaced by a duplicate row. The app's member roster is
  // cumulative, while the assignment itself follows the duplicate policy.
  result.members = Array.from(membersSeen).sort();
  return result;
}

/* Merge policy, mirroring the app's mergeSheetServices: new services are
   created whole; existing ones change field-by-field, and only duties the
   sheet mentions are touched (in-app-only duties are preserved). Instead of
   writing, returns { creates: [{id, svc}], updates: [{id, patch}] } so the
   caller controls Firestore I/O and can count zero-write runs. */
function planMerge(sheetServices, existingById) {
  const creates = [], updates = [];
  (Array.isArray(sheetServices) ? sheetServices : []).forEach(sheetSvc => {
    if (!sheetSvc || typeof sheetSvc !== 'object') return;
    const id = svcId(sheetSvc);
    const existing = (existingById || {})[id];
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
    // A Choir Song row is authoritative for this exact date/service. Its
    // presence marker lets a blank row clear a stale synced song, while a
    // service with no Choir Song row preserves a manual-only value.
    const choirSongSeen = sheetSvc._sheetChoirSongSeen === true
      || (!Object.prototype.hasOwnProperty.call(sheetSvc, '_sheetChoirSongSeen') && Boolean(sheetSvc.choirSong));
    if (choirSongSeen && existing.choirSong !== sheetSvc.choirSong) {
      patch.choirSong = sheetSvc.choirSong;
    }
    const existingAssignments = existing.assignments || {};
    const changedAssignments = {};
    let assignmentsChanged = false;
    Object.keys(sheetSvc.assignments || {}).forEach(duty => {
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
  parseCSV, parseSheetDate, inferYearISO, parseSheetTime,
  sheetRowsToServices, planMerge, svcId, dutyCategory
};
