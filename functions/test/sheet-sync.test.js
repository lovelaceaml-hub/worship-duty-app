'use strict';

/* Writing app changes into the Sheet's Entry grid (functions/sheet-sync.js),
   against a fake Sheet. */
const assert = require('node:assert/strict');
const test = require('node:test');
const grid = require('../entry-grid.js');
const sync = require('../sheet-sync.js');
const { fakeSheets } = require('./fake-sheets.js');

const serial = iso => grid.isoToSerial(iso);
const HEADER = ['Date', 'Service', 'Worship', 'Presider', 'Sermon', 'Choir Song', 'Usher Door', 'Usher Front', 'Usher Back'];
function sheet() {
  return fakeSheets({
    'Raw Data': [['Month', 'Date']],
    '2026 Entry': [
      ['LV Zion Worship Duty Schedule'],
      HEADER,
      ['OCTOBER 2026'],
      [serial('2026-10-03'), 'Morning', 'Sabbath Day', 'B. Adam', '', '', 'S. Leah'],
      [serial('2026-10-03'), 'Evening', 'Sabbath Day', 'E. Joseph'],
      ['NOVEMBER 2026'],
      [serial('2026-11-03'), 'Evening', 'Third Day', 'B. Caleb']
    ]
  });
}
const service = (date, label, assignments = {}, worship = 'Sabbath Day') => ({ date, service: label, worship, choirSong: '', assignments });

test('a changed duty is written into its one cell', async () => {
  const sheets = sheet();
  const before = service('2026-10-03', 'Evening', { Presider: 'E. Joseph' });
  const result = await sync.writeService(sheets, before, service('2026-10-03', 'Evening', { Presider: 'E. Joseph', 'Usher Front': 'S. Grace' }));
  assert.equal(result, '1 cells written');
  assert.deepEqual(sheets.log, [{ write: ["'2026 Entry'!H5"] }]);
  assert.equal(sheets.tab('2026 Entry')[4][7], 'S. Grace');
});

test('a service the grid lacks gets a row in date order, under its month', async () => {
  const sheets = sheet();
  await sync.writeService(sheets, null, service('2026-10-31', 'Morning', { Sermon: 'B. Adam' }));
  const rows = sheets.tab('2026 Entry');
  assert.deepEqual(rows[5].slice(0, 5), [serial('2026-10-31'), 'Morning', 'Sabbath Day', '', 'B. Adam']);
  assert.equal(rows[6][0], 'NOVEMBER 2026');
  assert.ok(sheets.log.some(entry => entry.look && entry.look[3] === 'PASTE_FORMAT' && entry.look[1] === 4), 'formatted like a service row');
});

test('a service deleted in the app loses its row', async () => {
  const sheets = sheet();
  assert.equal(await sync.writeService(sheets, service('2026-10-03', 'Evening'), null), 'row deleted');
  assert.deepEqual(sheets.tab('2026 Entry').map(row => row[1]), [undefined, 'Service', undefined, 'Morning', undefined, 'Evening']);
  assert.equal(await sync.writeService(sheets, service('2026-12-01', 'Evening'), null), 'not in the Sheet');
});

test('a month without rows gets a banner written like the others', async () => {
  const sheets = sheet();
  await sync.addServices(sheets, [service('2026-12-01', 'Evening', {}, 'Third Day'), service('2026-12-05', 'Morning')]);
  const rows = sheets.tab('2026 Entry');
  assert.deepEqual(rows.slice(7).map(row => row[0]), ['DECEMBER 2026', serial('2026-12-01'), serial('2026-12-05')]);
});

test('a new year gets its own tab copied from the latest one', async () => {
  const sheets = sheet();
  const added = await sync.addServices(sheets, [service('2027-01-05', 'Evening', {}, 'Third Day'), service('2027-01-02', 'Morning'), service('2027-02-06', 'Morning')]);
  assert.equal(added, 3);
  const rows = sheets.tab('2027 Entry');
  assert.deepEqual(rows.slice(0, 2), [['LV Zion Worship Duty Schedule'], HEADER]);
  assert.deepEqual(rows.slice(2).map(row => [row[0], row[1] || '']), [
    ['JANUARY 2027', ''], [serial('2027-01-02'), 'Morning'], [serial('2027-01-05'), 'Evening'],
    ['FEBRUARY 2027', ''], [serial('2027-02-06'), 'Morning']
  ]);
  assert.equal(sheets.sheets.find(tab => tab.title === '2027 Entry').index, 2);
  // Nothing from 2026 was copied over, and 2026 is untouched.
  assert.equal(sheets.tab('2026 Entry').length, 7);
});

test('services already in the grid are left alone', async () => {
  const sheets = sheet();
  assert.equal(await sync.addServices(sheets, [service('2026-10-03', 'Morning')]), 0);
  assert.equal(sheets.tab('2026 Entry')[3][3], 'B. Adam');
});

test('the import reads every Entry tab and nothing else', async () => {
  const sheets = sheet();
  await sync.addServices(sheets, [service('2027-01-02', 'Morning', { Presider: 'B Silas' })]);
  const result = await sync.readServices(sheets, {});
  assert.deepEqual(result.tabs, ['2026 Entry', '2027 Entry']);
  assert.deepEqual(result.services.map(item => item.date + ' ' + item.service), ['2026-10-03 Morning', '2026-10-03 Evening', '2026-11-03 Evening', '2027-01-02 Morning']);
  assert.equal(result.services[3].assignments.Presider, 'B. Silas');
});
