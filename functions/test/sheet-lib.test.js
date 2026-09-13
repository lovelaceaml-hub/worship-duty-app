'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  inferYearISO,
  parseSheetDate,
  parseSheetTime,
  planMerge,
  sheetRowsToServices,
  svcId
} = require('../sheet-lib');

const HEADER = ['Month', 'Date', 'Service', 'Worship', 'Time', 'Category', 'Duty', 'Member'];
const TODAY = new Date(2026, 4, 1, 12, 0, 0);

function row(date, service, duty, member, worship = 'Sabbath', time = '9:00 AM') {
  return ['May', date, service, worship, time, '', duty, member];
}

test('keeps exact date and service identity without carrying assignments', () => {
  const parsed = sheetRowsToServices([
    HEADER,
    row('Sat, May 02', 'Morning', 'Presider', 'Alice'),
    row('Sat, May 02', 'Morning', 'Prayer of Thanks', 'Bob'),
    row('Sat, May 02', 'Evening', 'Presider', 'Carol', 'Evening', '6:00 PM'),
    row('May 09', 'Morning', 'Presider', 'Dana')
  ], TODAY);

  assert.deepEqual(parsed.services.map(service => ({
    date: service.date,
    service: service.service,
    assignments: service.assignments
  })), [
    { date: '2026-05-02', service: 'Morning', assignments: { Presider: 'Alice', 'Prayer of Thanks': 'Bob' } },
    { date: '2026-05-02', service: 'Evening', assignments: { Presider: 'Carol' } },
    { date: '2026-05-09', service: 'Morning', assignments: { Presider: 'Dana' } }
  ]);
  assert.deepEqual(parsed.members, ['Alice', 'Bob', 'Carol', 'Dana']);
  assert.deepEqual(parsed.warnings, []);
  assert.ok(parsed.services.every(service => /^\d{4}-\d{2}-\d{2}$/.test(service.date)));
});

test('accepts optional weekday prefixes, rejects impossible calendar dates, and avoids UTC date shifts', () => {
  assert.deepEqual(parseSheetDate('Sat, May 02'), { month: 4, day: 2 });
  assert.deepEqual(parseSheetDate('Sat May 02'), { month: 4, day: 2 });
  assert.deepEqual(parseSheetDate('May 02'), { month: 4, day: 2 });
  assert.equal(parseSheetDate('Feb 30'), null);
  assert.equal(parseSheetDate('Apr 31'), null);
  assert.equal(inferYearISO(4, 2, TODAY), '2026-05-02');
  assert.equal(inferYearISO(0, 2, new Date(2026, 0, 1, 23, 30, 0)), '2026-01-02');
  assert.equal(parseSheetTime('12:00 AM'), '00:00');
  assert.equal(parseSheetTime('12:00 PM'), '12:00');
  assert.equal(parseSheetTime('13:00 PM'), '');
  assert.equal(parseSheetTime('9:60 AM'), '');
});

test('treats a blank assignment as an explicit clear and preserves unmentioned duties', () => {
  const parsed = sheetRowsToServices([
    HEADER,
    row('May 02', 'Morning', 'Presider', ''),
    row('May 02', 'Morning', 'Prayer of Thanks', 'Alice'),
    row('May 02', 'Morning', 'Choir Song', '')
  ], TODAY);
  const service = parsed.services[0];
  const id = svcId(service);
  const plan = planMerge(parsed.services, {
    [id]: {
      date: service.date,
      service: service.service,
      time: service.time,
      worship: service.worship,
      choirSong: 'Old song',
      assignments: { Presider: 'Former presider', 'Prayer of Thanks': 'Former prayer', 'Usher Door': 'Keep me' }
    }
  });

  assert.equal(service.assignments.Presider, '');
  assert.equal(service.choirSong, '');
  assert.equal(service._sheetChoirSongSeen, true);
  assert.deepEqual(parsed.members, ['Alice']);
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.updates, [{
    id,
    patch: {
      choirSong: '',
      assignments: { Presider: '', 'Prayer of Thanks': 'Alice', 'Usher Door': 'Keep me' }
    }
  }]);
});

test('does not clear a manual choir song when the sheet has no Choir Song row', () => {
  const parsed = sheetRowsToServices([
    HEADER,
    row('May 02', 'Morning', 'Presider', 'Alice')
  ], TODAY);
  const service = parsed.services[0];
  const id = svcId(service);
  const plan = planMerge(parsed.services, {
    [id]: {
      date: service.date,
      service: service.service,
      time: service.time,
      worship: service.worship,
      choirSong: 'Manual song',
      assignments: { Presider: 'Former presider' }
    }
  });

  assert.equal(service._sheetChoirSongSeen, false);
  assert.deepEqual(plan.updates, [{
    id,
    patch: { assignments: { Presider: 'Alice' } }
  }]);
});

test('warns once per duplicate date, service, and duty while applying the later row', () => {
  const rows = [
    HEADER,
    row('May 02', 'Morning', 'Presider', 'Alice'),
    row('May 02', 'Morning', 'Presider', 'Bob'),
    row('May 02', 'Morning', 'Presider', ''),
    row('May 02', 'Morning', 'Prayer of Thanks', 'Carol'),
    row('May 02', 'Morning', 'Prayer of Thanks', 'Carol')
  ];
  const parsed = sheetRowsToServices(rows, TODAY);
  const again = sheetRowsToServices(rows, TODAY);

  assert.equal(parsed.services[0].assignments.Presider, '');
  assert.equal(parsed.services[0].assignments['Prayer of Thanks'], 'Carol');
  assert.deepEqual(parsed.members, ['Alice', 'Bob', 'Carol']);
  assert.deepEqual(parsed.warnings, [
    'Duplicate sheet row for 2026-05-02 / Morning / Presider; later row wins.',
    'Duplicate sheet row for 2026-05-02 / Morning / Prayer of Thanks; later row wins.'
  ]);
  assert.deepEqual(again.warnings, parsed.warnings);
});

test('creates a new service from only its own sheet assignments', () => {
  const parsed = sheetRowsToServices([
    HEADER,
    row('May 02', 'Morning', 'Presider', 'Alice')
  ], TODAY);
  const service = parsed.services[0];
  const id = svcId(service);
  const plan = planMerge(parsed.services, {});

  assert.deepEqual(plan, {
    creates: [{
      id,
      svc: {
        date: '2026-05-02',
        time: '09:00',
        service: 'Morning',
        worship: 'Sabbath',
        choirSong: '',
        assignments: { Presider: 'Alice' }
      }
    }],
    updates: []
  });
});
