'use strict';

/* Keeping the Sheet's Entry grid in step with the app (see entry-grid.js for
   its layout). A change made in the app is written into the one row it
   belongs to. A new service gets a row in date order, formatted like the
   tab's other service rows, with a month banner if its month has none yet.
   A new year gets its own tab, copied from the latest one so it keeps the
   columns, formatting and dropdowns. `sheets` is from sheets.js. */

const grid = require('./entry-grid.js');

async function entryTabs(sheets) {
  return (await sheets.tabs()).filter(tab => grid.isEntryTab(tab.title)).sort((a, b) => a.title.localeCompare(b.title));
}

async function readTab(sheets, meta) {
  return Object.assign(grid.parseTab(meta.title, await sheets.values(meta.title)), { sheetId: meta.sheetId, index: meta.index });
}

/* Every service in every Entry tab, for the import. */
async function readServices(sheets, nameMap) {
  const metas = await entryTabs(sheets);
  if (!metas.length) throw new Error('The Sheet has no "<year> Entry" tab.');
  const tabs = await Promise.all(metas.map(meta => readTab(sheets, meta)));
  return Object.assign(grid.servicesFromTabs(tabs, nameMap), { tabs: metas.map(meta => meta.title) });
}

const wholeRows = (sheetId, row, count = 1) => ({ sheetId, startRowIndex: row - 1, endRowIndex: row - 1 + count });

/* Give rows the look (and dropdowns) of another row. */
function copyLook(sheetId, from, to, count = 1) {
  return ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION'].map(pasteType => ({
    copyPaste: { source: wholeRows(sheetId, from), destination: wholeRows(sheetId, to, count), pasteType }
  }));
}

/* Insert rows into a tab's model and the request list, keeping every row
   number the model holds correct. */
function insertRows(tab, requests, at, count) {
  requests.push({ insertDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: at - 1, endIndex: at - 1 + count }, inheritFromBefore: at - 1 >= grid.FIRST_ROW } });
  const shift = item => { if (item.row >= at) item.row += count; };
  tab.rows.forEach(shift);
  tab.banners.forEach(shift);
  Object.values(tab.templates || {}).forEach(shift);
  tab.lastRow += count;
}

/* A row's values as part of the same request as its insert, written as
   they are (as the values API's RAW does), '' as an empty cell. */
function cellsRequest(sheetId, row, values) {
  return { updateCells: {
    start: { sheetId, rowIndex: row - 1, columnIndex: 0 },
    rows: [{ values: values.map(value => (value === '' || value == null ? {}
      : { userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: String(value) } })) }],
    fields: 'userEnteredValue'
  } };
}

/* Add services to one tab: rows in date order, month banners where needed,
   each row with its values. They go in one request, so a failure leaves no
   empty row behind (a row without a date is never found again, and a retry
   would add another). */
function planInserts(tab, services, requests) {
  const serviceLook = () => (tab.templates && tab.templates.service) || tab.rows[0];
  const bannerLook = () => (tab.templates && tab.templates.banner) || tab.banners[0];
  const sample = (tab.banners[0] && tab.banners[0].text) || (tab.templates && tab.templates.bannerText) || '';
  const useBanners = !!(tab.banners.length || (tab.templates && tab.templates.banner));
  services.slice().sort((a, b) => a.date.localeCompare(b.date) || grid.SERVICE_ORDER.indexOf(a.service) - grid.SERVICE_ORDER.indexOf(b.service))
    .forEach(service => {
      if (grid.findRow(tab, service.date, service.service)) return;
      const month = Number(service.date.slice(5, 7)) - 1;
      let at = grid.insertRowFor(tab, service.date, service.service);
      const monthHasRows = tab.rows.some(row => Number(row.iso.slice(5, 7)) - 1 === month) || tab.banners.some(banner => banner.month === month);
      if (useBanners && !monthHasRows) {
        const look = bannerLook();
        insertRows(tab, requests, at, 1);
        if (look) requests.push(...copyLook(tab.sheetId, look.row, at));
        const label = grid.bannerText(sample, month, Number(service.date.slice(0, 4)));
        tab.banners.push({ row: at, text: label, month });
        requests.push(cellsRequest(tab.sheetId, at, [label]));
        at += 1;
      }
      const look = serviceLook();
      insertRows(tab, requests, at, 1);
      if (look) requests.push(...copyLook(tab.sheetId, look.row, at));
      tab.rows.push({ row: at, iso: service.date, service: service.service, worship: service.worship || '', duties: {} });
      requests.push(cellsRequest(tab.sheetId, at, grid.rowValues(tab, service)));
    });
}

/* A new year's tab: a copy of the latest Entry tab with its services removed.
   One banner row and one service row stay behind as the look to copy, and
   are removed once the year's rows are in. */
async function createYearTab(sheets, metas, year) {
  const title = year + ' Entry';
  const source = metas.filter(meta => meta.title < title).pop() || metas[metas.length - 1];
  if (!source) throw new Error('The Sheet has no "<year> Entry" tab to copy.');
  const old = await readTab(sheets, source);
  // The copy, the removal of last year's rows and the blanking of the two
  // rows kept as the look all go in one request, which the Sheet applies
  // whole or not at all: a failure never leaves a tab full of last year's
  // services for the next write to reuse. The copy's id is chosen here so
  // the later steps of the same request can name it.
  const taken = new Set(metas.map(meta => meta.sheetId));
  let sheetId = 100000000 + year;
  while (taken.has(sheetId)) sheetId += 1;
  const keep = [old.banners[0] && old.banners[0].row, old.rows[0] && old.rows[0].row].filter(Boolean);
  const requests = [{ duplicateSheet: { sourceSheetId: source.sheetId, insertSheetIndex: source.index + 1, newSheetId: sheetId, newSheetName: title } }];
  for (let row = old.lastRow; row >= grid.FIRST_ROW; row--) {
    if (keep.includes(row)) continue;
    requests.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } });
  }
  const kept = keep.slice().sort((a, b) => a - b);
  const templates = { bannerText: old.banners[0] ? old.banners[0].text : '' };
  kept.forEach((row, offset) => {
    templates[old.banners[0] && row === old.banners[0].row ? 'banner' : 'service'] = { row: grid.FIRST_ROW + offset };
    requests.push(cellsRequest(sheetId, grid.FIRST_ROW + offset, new Array(old.width).fill('')));
  });
  await sheets.update(requests);
  return { title, sheetId, index: source.index + 1, columns: old.columns, width: old.width, lastRow: grid.HEADER_ROW + kept.length, rows: [], banners: [], templates };
}

async function dropTemplates(sheets, tab) {
  const rows = Object.entries(tab.templates || {}).filter(([key]) => key !== 'bannerText').map(([, item]) => item.row).sort((a, b) => b - a);
  await sheets.update(rows.map(row => ({ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } })));
  delete tab.templates;
}

/* A new year's tab is made only for this year or later, and never for a
   year before the earliest tab: a change to an old service (a name fix
   touching last December) must not add a tab to the master Sheet. */
function mayAddTab(metas, year, today) {
  const thisYear = Number(String(today || new Date().toISOString()).slice(0, 4));
  const years = metas.map(meta => Number(meta.title.slice(0, 4)));
  return year >= thisYear && (!years.length || year >= Math.min(...years));
}

/* The tab for a year, made when it may be (see mayAddTab), else null. */
async function tabForYear(sheets, metas, year, today) {
  const meta = metas.find(item => item.title === year + ' Entry');
  if (meta) return readTab(sheets, meta);
  if (!mayAddTab(metas, year, today)) return null;
  const created = await createYearTab(sheets, metas, year);
  metas.push({ title: created.title, sheetId: created.sheetId, index: created.index });
  return created;
}

/* Add many services (a year of them, or one), each into its year's tab.
   Services already in the grid, and those of a year that has no tab and may
   not get one, are left alone. Returns how many rows went in. `today` is
   the Pacific date (YYYY-MM-DD). */
async function addServices(sheets, services, { today } = {}) {
  const metas = await entryTabs(sheets);
  const byYear = new Map();
  services.forEach(service => {
    const year = Number(service.date.slice(0, 4));
    byYear.set(year, (byYear.get(year) || []).concat(service));
  });
  let added = 0;
  for (const year of Array.from(byYear.keys()).sort()) {
    const tab = await tabForYear(sheets, metas, year, today);
    if (!tab) continue;
    const requests = [];
    const before = tab.rows.length;
    planInserts(tab, byYear.get(year), requests);
    await sheets.update(requests);
    if (tab.templates) await dropTemplates(sheets, tab);
    added += tab.rows.length - before;
  }
  return added;
}

/* One service changed in the app (before or after is null for an add or a
   delete). Returns what was done, for the log. */
async function writeService(sheets, before, after, options = {}) {
  const metas = await entryTabs(sheets);
  if (!after) {
    const meta = metas.find(item => item.title === grid.yearTab(before.date));
    const tab = meta && await readTab(sheets, meta);
    const row = tab && grid.findRow(tab, before.date, before.service);
    if (!row) return 'not in the Sheet';
    await sheets.update([{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: row.row - 1, endIndex: row.row } } }]);
    return 'row deleted';
  }
  const meta = metas.find(item => item.title === grid.yearTab(after.date));
  const tab = meta && await readTab(sheets, meta);
  const row = tab && grid.findRow(tab, after.date, after.service);
  if (!row) return (await addServices(sheets, [after], options)) ? 'row added' : 'not in the Sheet';
  const cells = grid.changedCells(tab, before || {}, after);
  await sheets.write(cells.map(cell => ({ range: grid.a1(tab.title, row.row, cell.column), values: [[cell.value]] })));
  return cells.length + ' cells written';
}

/* A service as the app has it now, into its row: every cell that differs
   from the app is written, or with `only` (fields: 'worship', 'choirSong',
   duties) just those cells. After a failed write this puts back what the
   Sheet missed, and only that, so a cell changed in the Sheet meanwhile is
   not written over. */
async function writeState(sheets, service, options = {}) {
  const metas = await entryTabs(sheets);
  const meta = metas.find(item => item.title === grid.yearTab(service.date));
  const tab = meta && await readTab(sheets, meta);
  const row = tab && grid.findRow(tab, service.date, service.service);
  if (!row) return (await addServices(sheets, [service], options)) ? 'row added' : 'not in the Sheet';
  const inSheet = { worship: row.worship, choirSong: row.duties[grid.CHOIR_SONG], assignments: row.duties };
  const columnOf = field => (field === 'worship' ? tab.columns.worship : tab.columns.duties[field === 'choirSong' ? grid.CHOIR_SONG : field]);
  const only = options.only ? new Set(options.only.map(columnOf)) : null;
  const cells = grid.changedCells(tab, inSheet, service).filter(cell => !only || only.has(cell.column));
  await sheets.write(cells.map(cell => ({ range: grid.a1(tab.title, row.row, cell.column), values: [[cell.value]] })));
  return cells.length + ' cells written';
}

module.exports = { entryTabs, readServices, addServices, writeService, writeState };
