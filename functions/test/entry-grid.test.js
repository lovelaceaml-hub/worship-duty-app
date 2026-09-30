'use strict';

/* Reading and writing the Sheet's "<year> Entry" grid (functions/entry-grid.js). */
const assert = require('node:assert/strict');
const test = require('node:test');
const grid = require('../entry-grid.js');

const serial = iso => grid.isoToSerial(iso);
const HEADER = ['Date', 'Service', 'Worship', 'Presider', 'Sermon', 'Choir Song', 'Usher Door', 'Usher Front', 'Usher Back'];
const values = [
  ['LV Zion Worship Duty Schedule'],
  HEADER,
  ['OCTOBER'],
  [serial('2026-10-03'), 'Morning', 'Sabbath Day', 'B Anthony L', 'S.  Hannah', '#311 I Repent of My Sin', 'S. Leah', '', 'S. Naomi'],
  [serial('2026-10-03'), 'Evening', 'Sabbath Day', 'E. Joseph', '', '', 'S. Grace'],
  [serial('2026-10-06'), 'Evening', 'Third Day', '', 'B. Caleb']
];

test('dates round-trip through Sheets serial numbers', () => {
  assert.equal(grid.serialToISO(serial('2026-10-03')), '2026-10-03');
  assert.equal(grid.serialToISO(46298.75), '2026-10-03'); // a time of day does not move the date
  assert.equal(grid.isoToSerial('1899-12-31'), 1);
});

test('a tab is read by its header names; banner rows are skipped', () => {
  const tab = grid.parseTab('2026 Entry', values);
  assert.deepEqual([tab.columns.date, tab.columns.service, tab.columns.worship, tab.columns.duties['Usher Back']], [0, 1, 2, 8]);
  assert.deepEqual(tab.rows.map(row => [row.row, row.iso, row.service]), [[4, '2026-10-03', 'Morning'], [5, '2026-10-03', 'Evening'], [6, '2026-10-06', 'Evening']]);
  assert.throws(() => grid.parseTab('Broken', [[], ['When', 'What']]), /no Date or Service column/);
  assert.equal(grid.isEntryTab('2027 Entry'), true);
  assert.equal(grid.isEntryTab('Raw Data'), false);
});

test('services come out as the Raw Data import made them', () => {
  const tab = grid.parseTab('2026 Entry', values);
  const { services, members } = grid.servicesFromTabs([tab], { 'S. Naomi': 'S. Naomi R' });
  const morning = services[0];
  assert.deepEqual(morning.assignments, { Presider: 'B. Anthony', Sermon: 'S. Hannah', 'Usher Door': 'S. Leah', 'Usher Back': 'S. Naomi R' });
  assert.deepEqual([morning.time, morning.choirSong, morning._sheetChoirSongSeen], ['10:00', '#311 I Repent of My Sin', true]);
  assert.equal(services[1]._sheetChoirSongSeen, false);
  assert.ok(members.includes('B. Anthony'));
  assert.equal(grid.timeFor('Morning', '2026-09-05'), '09:00');
  assert.equal(grid.timeFor('Evening', '2026-09-12'), '19:30');
});

test('a second row for the same service wins and is reported', () => {
  const tab = grid.parseTab('2026 Entry', values.concat([[serial('2026-10-06'), 'Evening', 'Third Day', 'B. Adam']]));
  const { services, warnings } = grid.servicesFromTabs([tab]);
  assert.equal(services.find(service => service.date === '2026-10-06').assignments.Presider, 'B. Adam');
  assert.equal(warnings.length, 1);
});

test('a new service row goes in date order', () => {
  const tab = grid.parseTab('2026 Entry', values);
  assert.equal(grid.insertRowFor(tab, '2026-10-03', 'Afternoon'), 5);
  assert.equal(grid.insertRowFor(tab, '2026-10-01', 'Evening'), 4);
  assert.equal(grid.insertRowFor(tab, '2026-10-10', 'Morning'), 7);
});

test('row values and changed cells line up with the header', () => {
  const tab = grid.parseTab('2026 Entry', values);
  const service = { date: '2026-10-10', service: 'Morning', worship: 'Sabbath Day', choirSong: '', assignments: { Presider: 'B. Adam', 'Usher Front': 'S. Leah' } };
  assert.deepEqual(grid.rowValues(tab, service), [serial('2026-10-10'), 'Morning', 'Sabbath Day', 'B. Adam', '', '', '', 'S. Leah', '']);
  const before = { worship: 'Sabbath Day', assignments: { Presider: 'E. Joseph', 'Usher Door': 'S. Grace' } };
  const after = { worship: 'Sabbath Day', choirSong: '#12', assignments: { Presider: 'E. Joseph', 'Usher Front': 'S. Grace' } };
  assert.deepEqual(grid.changedCells(tab, before, after), [{ column: 5, value: '#12' }, { column: 6, value: '' }, { column: 7, value: 'S. Grace' }]);
});

test('A1 addresses quote the tab name and count columns past Z', () => {
  assert.equal(grid.a1('2026 Entry', 4, 0), "'2026 Entry'!A4");
  assert.equal(grid.a1("Anthony's Entry", 9, 27), "'Anthony''s Entry'!AB9");
});

test('a planning year runs from December 1 through the next December', () => {
  const { serviceYear, serviceId } = require('../service-year.js');
  const services = serviceYear(2026);
  assert.deepEqual(services.slice(0, 4).map(item => item.id), ['2026-12-01_evening', '2026-12-05_morning', '2026-12-05_afternoon', '2026-12-05_evening']);
  assert.equal(services[services.length - 1].id, '2027-12-28_evening');
  assert.equal(services.filter(item => item.service !== 'Evening' || item.worship !== 'Third Day').length / 3, 56); // 56 Saturdays
  assert.equal(services.filter(item => item.worship === 'Third Day').length, 57); // 57 Tuesdays
  assert.deepEqual([services[1].time, services[1].worship, services[0].worship], ['10:00', 'Sabbath Day', 'Third Day']);
  assert.equal(serviceId('2027-01-02', 'Early Morning'), '2027-01-02_early-morning');
});
