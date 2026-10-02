'use strict';

/* The Sheet's editing grid, as the church types it: one tab per year named
   "<year> Entry", the header on row 2 (Date, Service, Worship, then one column
   per duty, matched by name), one row per service from row 3, and month
   banner rows without a date in between. The Sheet's own script flattens these
   tabs into "Raw Data" (LV Zion Duty Sheet.gs); the app reads and writes the
   grid itself, because edits made through the Sheets API do not run that
   script. Everything here is pure: it works on the 2-D arrays the Sheets API
   returns (dates as serial numbers). */

const permissions = require('./permissions.js');
const { cleanName } = require('./names.js');

const HEADER_ROW = 2;          // rows are 1-based, as in the Sheet
const FIRST_ROW = 3;
const TAB_NAME = /^(\d{4}) Entry$/;
const CHOIR_SONG = 'Choir Song';
const GRID_DUTIES = Object.values(permissions.DEPARTMENT_DUTIES).flat().concat(CHOIR_SONG);
const SERVICE_ORDER = ['Early Morning', 'Morning', 'Afternoon', 'Evening', 'Commemoration'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The times the Sheet's script gives each service; they changed on 2026-09-12.
const TIME_CHANGE_ISO = '2026-09-12';
const TIMES_BEFORE = { 'Early Morning': '05:00', Morning: '09:00', Afternoon: '15:00', Evening: '20:00', Commemoration: '' };
const TIMES_FROM = { 'Early Morning': '05:00', Morning: '10:00', Afternoon: '14:30', Evening: '19:30', Commemoration: '' };

function timeFor(service, iso) {
  const table = iso >= TIME_CHANGE_ISO ? TIMES_FROM : TIMES_BEFORE;
  return table[service] || '';
}

/* Sheets counts days from 1899-12-30. */
const EPOCH = Date.UTC(1899, 11, 30);
const DAY = 24 * 3600 * 1000;

function serialToISO(serial) {
  return new Date(EPOCH + Math.floor(serial) * DAY).toISOString().slice(0, 10);
}

function isoToSerial(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return (Date.UTC(year, month - 1, day) - EPOCH) / DAY;
}

function yearTab(iso) { return iso.slice(0, 4) + ' Entry'; }

function isEntryTab(title) { return TAB_NAME.test(String(title || '')); }

const text = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

/* The month a banner row names (0-11), or -1. */
function bannerMonth(label) {
  const lower = String(label || '').toLowerCase();
  return MONTHS.findIndex(name => lower.includes(name.toLowerCase()));
}

/* A banner for a month, written like an existing one ("OCTOBER 2026" makes
   "JANUARY 2027"; "October" makes "January"). */
function bannerText(sample, month, year) {
  const name = MONTHS[month];
  const found = bannerMonth(sample);
  if (found < 0) return name.toUpperCase() + ' ' + year;
  const start = sample.toLowerCase().indexOf(MONTHS[found].toLowerCase());
  const original = sample.slice(start, start + MONTHS[found].length);
  const styled = original === original.toUpperCase() ? name.toUpperCase() : original === original.toLowerCase() ? name.toLowerCase() : name;
  return (sample.slice(0, start) + styled + sample.slice(start + original.length)).replace(/\b(19|20)\d{2}\b/, String(year));
}

/* One tab's values -> its columns, service rows and month banner rows. */
function parseTab(title, values) {
  const header = (values[HEADER_ROW - 1] || []).map(cell => text(cell).toLowerCase());
  const at = label => header.indexOf(label.toLowerCase());
  const columns = { date: at('date'), service: at('service'), worship: at('worship'), duties: {} };
  if (columns.date < 0 || columns.service < 0) {
    throw new Error('The tab "' + title + '" has no Date or Service column in row ' + HEADER_ROW + '.');
  }
  GRID_DUTIES.forEach(duty => { const index = at(duty); if (index >= 0) columns.duties[duty] = index; });
  const rows = [], banners = [];
  for (let index = FIRST_ROW - 1; index < values.length; index++) {
    const cells = values[index] || [];
    const serial = cells[columns.date];
    const service = text(cells[columns.service]);
    if (typeof serial !== 'number' || !service) {
      const label = cells.map(text).find(Boolean);
      if (label) banners.push({ row: index + 1, text: label, month: bannerMonth(label) });
      continue;
    }
    const duties = {};
    Object.entries(columns.duties).forEach(([duty, column]) => { duties[duty] = cells[column]; });
    rows.push({ row: index + 1, iso: serialToISO(serial), service, worship: columns.worship >= 0 ? text(cells[columns.worship]) : '', duties });
  }
  return { title, columns, width: header.length, lastRow: values.length, rows, banners };
}

/* Every Entry tab -> services in the shape planMerge takes (see sheet-lib).
   A blank cell never clears a duty, so clearing one is done in the app, which
   writes the blank back. Blank duty cells are listed in `_blank`, so the
   import still knows the Sheet now says nothing there. */
function servicesFromTabs(tabs, nameMap = {}) {
  const byKey = new Map();
  const warnings = [];
  const members = new Set();
  tabs.forEach(tab => tab.rows.forEach(row => {
    const key = row.iso + '|' + row.service;
    if (byKey.has(key)) warnings.push('Two rows for ' + row.iso + ' ' + row.service + ' (tab ' + tab.title + ', row ' + row.row + '); the later row wins.');
    const service = {
      date: row.iso, service: row.service, worship: row.worship, time: timeFor(row.service, row.iso),
      assignments: {}, choirSong: '', _sheetChoirSongSeen: false, _blank: []
    };
    Object.entries(row.duties).forEach(([duty, raw]) => {
      if (duty === CHOIR_SONG) {
        const song = text(raw);
        if (song) Object.assign(service, { choirSong: song, _sheetChoirSongSeen: true });
        return;
      }
      const name = cleanName(raw, nameMap);
      if (!name) { service._blank.push(duty); return; }
      service.assignments[duty] = name;
      members.add(name);
    });
    byKey.set(key, service);
  }));
  return { services: Array.from(byKey.values()), members: Array.from(members), warnings };
}

function findRow(tab, iso, service) {
  return tab.rows.find(row => row.iso === iso && row.service === service) || null;
}

/* Where a new service's row goes: before the first later service and before
   a later month's banner, so the grid stays in date order under the right
   month. Returns a 1-based row number. */
function insertRowFor(tab, iso, service) {
  const order = label => { const index = SERVICE_ORDER.indexOf(label); return index < 0 ? SERVICE_ORDER.length : index; };
  const month = Number(iso.slice(5, 7)) - 1;
  const candidates = tab.rows.filter(row => row.iso > iso || (row.iso === iso && order(row.service) > order(service))).map(row => row.row)
    .concat((tab.banners || []).filter(banner => banner.month > month).map(banner => banner.row));
  return candidates.length ? Math.min(...candidates) : Math.max(tab.lastRow, HEADER_ROW) + 1;
}

/* The cells of a service's row: its date (as a serial number), service,
   worship, choir song and duties. Columns the tab does not have are left out. */
function rowValues(tab, service) {
  const cells = new Array(tab.width).fill('');
  cells[tab.columns.date] = isoToSerial(service.date);
  cells[tab.columns.service] = service.service;
  if (tab.columns.worship >= 0) cells[tab.columns.worship] = service.worship || '';
  Object.entries(tab.columns.duties).forEach(([duty, column]) => {
    cells[column] = duty === CHOIR_SONG ? (service.choirSong || '') : ((service.assignments || {})[duty] || '');
  });
  return cells;
}

/* The single cells that change between two versions of a service already in
   the grid: [{ column, value }]. */
function changedCells(tab, before, after) {
  const out = [];
  const compare = (column, from, to) => { if (column >= 0 && text(from) !== text(to)) out.push({ column, value: to || '' }); };
  compare(tab.columns.worship, before.worship, after.worship);
  if (tab.columns.duties[CHOIR_SONG] != null) compare(tab.columns.duties[CHOIR_SONG], before.choirSong, after.choirSong);
  const was = before.assignments || {}, now = after.assignments || {};
  Object.entries(tab.columns.duties).forEach(([duty, column]) => {
    if (duty !== CHOIR_SONG) compare(column, was[duty], now[duty]);
  });
  return out;
}

/* "A1" notation for a 1-based row and 0-based column. */
function a1(title, row, column) {
  let letters = '', n = column + 1;
  while (n > 0) { const rest = (n - 1) % 26; letters = String.fromCharCode(65 + rest) + letters; n = Math.floor((n - 1) / 26); }
  return "'" + title.replace(/'/g, "''") + "'!" + letters + row;
}

module.exports = {
  HEADER_ROW, FIRST_ROW, CHOIR_SONG, GRID_DUTIES, SERVICE_ORDER, MONTHS, TIME_CHANGE_ISO,
  timeFor, bannerMonth, bannerText, serialToISO, isoToSerial, yearTab, isEntryTab, parseTab, servicesFromTabs,
  findRow, insertRowFor, rowValues, changedCells, a1
};
