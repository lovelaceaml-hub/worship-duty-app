'use strict';

/* The server keeping the Sheet's Entry grid in step: app changes go in,
   changes that came from the Sheet do not go back, failures show in Manage,
   and a planning year adds rows and the feast reminder. */
const assert = require('node:assert/strict');
const test = require('node:test');
const grid = require('../entry-grid.js');
const { fakeSheets } = require('./fake-sheets.js');
const { loadIndex } = require('./load-index.js');

const serial = iso => grid.isoToSerial(iso);
const HEADER = ['Date', 'Service', 'Worship', 'Presider', 'Sermon', 'Choir Song', 'Usher Door', 'Usher Front'];
const writing = { 'app/settings': { sheetId: 'sheet-1', features: { sheetWrite: true } } };
const sheet = () => fakeSheets({
  '2026 Entry': [['Duty schedule'], HEADER, ['OCTOBER 2026'], [serial('2026-10-03'), 'Morning', 'Sabbath Day', 'B. Adam', '', '', 'S. Leah']]
});
const morning = assignments => ({ date: '2026-10-03', service: 'Morning', worship: 'Sabbath Day', time: '10:00', assignments });
const write = (before, after) => ({
  data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } },
  params: { id: '2026-10-03_morning' }
});

test('a duty changed in the app is written into the Sheet', async () => {
  const sheets = sheet();
  const { functions } = loadIndex(Object.assign({}, writing), { sheets });
  await functions.onScheduleWrite.run(write(morning({ Presider: 'B. Adam', 'Usher Door': 'S. Leah' }), morning({ Presider: 'B. Adam', 'Usher Door': 'S. Leah', 'Usher Front': 'S. Grace' })));
  assert.equal(sheets.tab('2026 Entry')[3][7], 'S. Grace');
});

test('nothing is written when the change came from the Sheet, or writing is off', async () => {
  const fromSheet = sheet();
  let loaded = loadIndex(Object.assign({}, writing), { sheets: fromSheet });
  await loaded.functions.onScheduleWrite.run(write(Object.assign(morning({}), { sheetSyncedAt: 1 }), Object.assign(morning({ Sermon: 'E. Joseph' }), { sheetSyncedAt: 2 })));
  assert.deepEqual(fromSheet.log, []);

  const off = sheet();
  loaded = loadIndex({ 'app/settings': { sheetId: 'sheet-1', features: {} } }, { sheets: off });
  await loaded.functions.onScheduleWrite.run(write(morning({}), morning({ Sermon: 'E. Joseph' })));
  assert.deepEqual(off.log, []);
});

test('a failed Sheet write shows in Manage, and clears once writing works again', async () => {
  const broken = sheet();
  broken.write = async () => { throw new Error('The Sheet is not shared with the app\'s server account.'); };
  const { functions, docs } = loadIndex(Object.assign({}, writing), { sheets: broken });
  await functions.onScheduleWrite.run(write(morning({}), morning({ Sermon: 'E. Joseph' })));
  assert.deepEqual([docs['app/settings'].sheetStatus.ok, docs['app/settings'].sheetStatus.message], [false, 'The Sheet is not shared with the app\'s server account.']);
  const again = loadIndex(docs, { sheets: sheet() });
  await again.functions.onScheduleWrite.run(write(morning({}), morning({ Sermon: 'S. Hannah' })));
  assert.equal(docs['app/settings'].sheetStatus.ok, true);
});

test('a planner save sends no per-service alert; the planner sends one per member', async () => {
  const { functions, sent } = loadIndex({ 'app/settings': {}, 'tokens/phone': { name: 'S. Grace' } });
  await functions.onScheduleWrite.run(write(morning({}), Object.assign(morning({ 'Usher Front': 'S. Grace' }), { planBatch: 'plan-1' })));
  assert.equal(sent.length, 0);
});

test('a planning year adds the missing services, their Sheet rows, and the feast reminder', async () => {
  const sheets = sheet();
  const docs = Object.assign({ 'schedule/2026-12-05_morning': { date: '2026-12-05', service: 'Morning', assignments: { Presider: 'B. Adam' } } }, writing);
  const { functions } = loadIndex(docs, { sheets });
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-01T14:00:00Z');
  try { await functions.yearlyServices.run({}); } finally { Date.now = realNow; }
  const services = Object.keys(docs).filter(key => key.startsWith('schedule/'));
  assert.equal(services.length, 56 * 3 + 57);
  assert.deepEqual(docs['schedule/2026-12-05_morning'].assignments, { Presider: 'B. Adam' }, 'an existing service is kept');
  assert.equal(docs['schedule/2027-01-02_evening'].worship, 'Sabbath Day');
  assert.deepEqual(docs['schedule/2027-01-02_evening'].assignments, { Sermon: 'E. Simon' }, 'new services start with the default for Opening Prayer');
  assert.deepEqual(docs['schedule/2027-01-05_evening'].assignments, { Sermon: 'E. Simon' });
  assert.ok(docs['schedule/2027-01-02_evening'].sheetSyncedAt);
  assert.equal(docs['app/settings'].feastNotice.year, 2027);
  assert.deepEqual(sheets.tab('2026 Entry').slice(4, 6).map(row => row[0]), ['DECEMBER 2026', serial('2026-12-01')]);
  const next = sheets.tab('2027 Entry');
  assert.equal(next.filter(row => typeof row[0] === 'number').length, 52 * 3 + 52);
  assert.ok(next.filter(row => typeof row[0] === 'number').every(row => row[HEADER.indexOf('Sermon')] === 'E. Simon'), 'and so do their Sheet rows');
  assert.equal(next.filter(row => typeof row[0] === 'string' && /2027$/.test(row[0])).length, 12);
});

test('a planning year starts its services with the chosen default, or none', async () => {
  for (const [dutyDefaults, expected] of [[{ Sermon: 'P. Paul' }, { Sermon: 'P. Paul' }], [{ Sermon: '' }, {}]]) {
    const docs = { 'app/settings': { dutyDefaults } };
    const { functions } = loadIndex(docs, {});
    const realNow = Date.now;
    Date.now = () => Date.parse('2026-11-01T14:00:00Z');
    try { await functions.yearlyServices.run({}); } finally { Date.now = realNow; }
    assert.deepEqual(docs['schedule/2027-01-02_morning'].assignments, expected);
  }
});
