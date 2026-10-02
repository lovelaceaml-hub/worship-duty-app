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

/* The clock at 2026-10-01 10:00 in Pacific time, for the duration of `run`. */
async function onOctober1(run) {
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-10-01T17:00:00Z');
  try { return await run(); } finally { Date.now = realNow; }
}

test('a write the grid does not show (a flag, a double-duty mark) costs no Sheets call', async () => {
  const sheets = sheet();
  const { functions } = loadIndex(Object.assign({}, writing), { sheets });
  const before = morning({ 'Usher Door': 'S. Leah' });
  await functions.onScheduleWrite.run(write(before, Object.assign({}, before, { needsReplacement: { 'Usher Door': { memberName: 'S. Leah' } } })));
  assert.deepEqual(sheets.log, []);
});

test('a failed Sheet write waits, keeps Manage showing the problem, and the next import writes it instead of undoing it', async () => {
  await onOctober1(async () => {
    const broken = sheet();
    broken.write = async () => { throw new Error('Quota exceeded.'); };
    const docs = Object.assign({ 'schedule/2026-10-03_morning': morning({ Presider: 'B. Adam', 'Usher Door': 'S. Grace' }) }, writing);
    let loaded = loadIndex(docs, { sheets: broken });
    await loaded.functions.onScheduleWrite.run(write(morning({ Presider: 'B. Adam', 'Usher Door': 'S. Leah' }), morning({ Presider: 'B. Adam', 'Usher Door': 'S. Grace' })));
    assert.ok(docs['sheetQueue/2026-10-03_morning']);
    assert.equal(docs['app/settings'].sheetStatus.ok, false);

    const working = sheet();
    loaded = loadIndex(docs, { sheets: working });
    const other = { date: '2026-10-03', service: 'Evening', worship: 'Sabbath Day', time: '19:30' };
    await loaded.functions.onScheduleWrite.run({
      data: { before: { exists: true, data: () => Object.assign({ assignments: {} }, other) }, after: { exists: true, data: () => Object.assign({ assignments: { Presider: 'E. Joseph' } }, other) } },
      params: { id: '2026-10-03_evening' }
    });
    assert.equal(docs['app/settings'].sheetStatus.ok, false, 'still failing while a write waits');

    await loaded.functions.scheduledSheetSync.run({});
    assert.equal(working.tab('2026 Entry')[3][HEADER.indexOf('Usher Door')], 'S. Grace', 'the waiting write went in');
    assert.equal(docs['schedule/2026-10-03_morning'].assignments['Usher Door'], 'S. Grace', 'and was not undone');
    assert.equal(docs['sheetQueue/2026-10-03_morning'], undefined);
    assert.equal(docs['app/settings'].sheetStatus.ok, true);
  });
});

test('the grid import keeps a time set in the app; an old service never adds a tab', async () => {
  await onOctober1(async () => {
    const sheets = sheet();
    const docs = Object.assign({ 'schedule/2026-10-03_morning': Object.assign(morning({ Presider: 'B. Adam', 'Usher Door': 'S. Leah' }), { time: '09:00' }) }, writing);
    const { functions } = loadIndex(docs, { sheets });
    await functions.scheduledSheetSync.run({});
    assert.equal(docs['schedule/2026-10-03_morning'].time, '09:00');

    const december = { date: '2025-12-06', service: 'Morning', worship: 'Sabbath Day', time: '09:00' };
    await functions.onScheduleWrite.run({
      data: { before: { exists: true, data: () => Object.assign({ assignments: {} }, december) }, after: { exists: true, data: () => Object.assign({ assignments: { Presider: 'B. Adam' } }, december) } },
      params: { id: '2025-12-06_morning' }
    });
    assert.deepEqual(sheets.sheets.map(tab => tab.title), ['2026 Entry'], 'no 2025 Entry tab');
  });
});

const RAW = ['Month', 'Date', 'Service', 'Worship', 'Time', 'Category', 'Duty', 'Member'];
const rawRow = (date, duty, member, label = 'Morning') => ['', date, label, 'Sabbath Day', '10:00 AM', '', duty, member].join(',');
const csv = rows => [RAW.join(',')].concat(rows).join('\n');
const upcoming = (date, assignments = {}) => ({ date, service: 'Morning', worship: 'Sabbath Day', time: '10:00', assignments });

test('the Raw Data import: one alert per member for new duties to come, deleted services stay deleted, no "/" names on the list', async () => {
  await onOctober1(async () => {
    const docs = {
      'app/settings': {}, 'app/members': { list: ['S. Leah'] }, 'tokens/member-phone': { name: 'S. Leah' },
      'schedule/2026-09-26_morning': upcoming('2026-09-26'),
      'schedule/2026-10-10_morning': upcoming('2026-10-10'),
      'schedule/2026-10-17_morning': upcoming('2026-10-17'),
      'deletedServices/2026-10-24_morning': { date: '2026-10-24', service: 'Morning' }
    };
    const loaded = loadIndex(docs, { fetch: async () => ({ ok: true, text: async () => csv([
      rawRow('"Sat, Sep 26"', 'Usher Door', 'S. Leah'),
      rawRow('"Sat, Oct 10"', 'Usher Door', 'S. Leah'),
      rawRow('"Sat, Oct 17"', 'Usher Front', 'S. Leah'),
      rawRow('"Sat, Oct 24"', 'Usher Door', 'S. Ruth'),
      rawRow('"Sat, Oct 17"', 'Usher Back', 'S. Leah/S. Ruth')
    ]) }) });
    try {
      const result = await loaded.functions.syncSheetNow.run({ auth: null, data: {} }).catch(error => error);
      assert.equal(result.code, 'unauthenticated', 'Import now needs a signed-in administrator');
      await loaded.functions.scheduledSheetSync.run({});
    } finally {
      loaded.restore();
    }
    assert.equal(loaded.sent.length, 1);
    assert.equal(loaded.sent[0].data.title, 'New duties for you');
    assert.match(loaded.sent[0].data.body, /^Usher Door · Saturday, October 10 Morning; Usher Front · Saturday, October 17 Morning$/);
    assert.match(docs['schedule/2026-10-10_morning'].planBatch, /^import-/, 'no alert per service');
    assert.equal(docs['schedule/2026-09-26_morning'].assignments['Usher Door'], 'S. Leah', 'the past service is still updated');
    assert.equal(docs['schedule/2026-10-24_morning'], undefined, 'a service deleted in the app is not made again');
    assert.deepEqual(docs['app/members'].list, ['S. Leah', 'S. Ruth']);
  });
});

test('the Raw Data import keeps a duty changed in the app until the Sheet changes it', async () => {
  await onOctober1(async () => {
    const docs = { 'app/settings': {}, 'app/members': { list: ['S. Leah', 'S. Naomi', 'S. Ruth'] }, 'schedule/2026-10-10_morning': upcoming('2026-10-10', { 'Usher Door': 'S. Leah' }) };
    let sheetName = 'S. Leah';
    const loaded = loadIndex(docs, { fetch: async () => ({ ok: true, text: async () => csv([rawRow('"Sat, Oct 10"', 'Usher Door', sheetName)]) }) });
    const service = () => docs['schedule/2026-10-10_morning'];
    try {
      await loaded.functions.scheduledSheetSync.run({});
      assert.deepEqual(service().sheetSeen, { 'Usher Door': 'S. Leah' }, 'the first import remembers what the Sheet said');

      service().assignments['Usher Door'] = 'S. Naomi'; // a leader changes it in the app
      await loaded.functions.scheduledSheetSync.run({});
      assert.equal(service().assignments['Usher Door'], 'S. Naomi', 'the Sheet did not change, so the app\'s change stays');

      sheetName = 'S. Ruth'; // someone changes the Sheet
      await loaded.functions.scheduledSheetSync.run({});
      assert.equal(service().assignments['Usher Door'], 'S. Ruth', 'a change in the Sheet wins');
      assert.deepEqual(service().sheetSeen, { 'Usher Door': 'S. Ruth' });
    } finally {
      loaded.restore();
    }
  });
});

test('a service deleted in the app is remembered until it is made again in the app', async () => {
  const docs = { 'app/settings': {} };
  const { functions } = loadIndex(docs);
  const service = morning({});
  await functions.onScheduleWrite.run(write(service, null));
  assert.deepEqual(docs['deletedServices/2026-10-03_morning'].date, '2026-10-03');
  await functions.onScheduleWrite.run(write(null, service));
  assert.equal(docs['deletedServices/2026-10-03_morning'], undefined);
});

test('a planning year saves its services even when the Sheet fails, and does not bring back a deleted one', async () => {
  const broken = sheet();
  broken.update = async () => { throw new Error('The Sheet is not shared with the app\'s server account.'); };
  const docs = Object.assign({ 'deletedServices/2027-01-02_morning': { date: '2027-01-02', service: 'Morning' } }, writing);
  const { functions } = loadIndex(docs, { sheets: broken });
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-01T14:00:00Z');
  try { await functions.yearlyServices.run({}); } finally { Date.now = realNow; }
  assert.ok(docs['schedule/2027-01-02_evening']);
  assert.equal(docs['schedule/2027-01-02_morning'], undefined);
  assert.equal(docs['app/settings'].feastNotice.year, 2027);
  assert.equal(docs['app/settings'].sheetStatus.ok, false);
});
