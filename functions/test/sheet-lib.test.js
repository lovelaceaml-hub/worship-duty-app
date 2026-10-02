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
  assert.deepEqual(parseSheetDate('Sat, May 02'), { month: 4, day: 2, weekday: 6 });
  assert.deepEqual(parseSheetDate('Sat May 02'), { month: 4, day: 2, weekday: 6 });
  assert.deepEqual(parseSheetDate('May 02'), { month: 4, day: 2, weekday: null });
  assert.equal(parseSheetDate('Xyz, May 02'), null);
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
      assignments: { Presider: '', 'Prayer of Thanks': 'Alice' },
      sheetSeen: { Presider: '', 'Prayer of Thanks': 'Alice' }
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
    patch: { assignments: { Presider: 'Alice' }, sheetSeen: { Presider: 'Alice' } }
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
        assignments: { Presider: 'Alice' },
        sheetSeen: { Presider: 'Alice' }
      }
    }],
    updates: []
  });
});

/* The app's change stays until the Sheet's cell changes. The Sheet's name
   at the last import (sheetSeen) tells the two apart. */
test('a duty changed in the app stays; a duty changed in the Sheet wins', () => {
  const parsed = sheetRowsToServices([
    HEADER,
    row('May 02', 'Morning', 'Presider', 'Alice'),
    row('May 02', 'Morning', 'Usher Door', 'Bob'),
    row('May 02', 'Morning', 'Usher Front', ''),
    row('May 02', 'Morning', 'Prayer of Thanks', 'Dana')
  ], TODAY);
  const service = parsed.services[0];
  const id = svcId(service);
  const stored = assignments => ({ date: service.date, service: service.service, time: service.time, worship: service.worship,
    assignments, sheetSeen: { Presider: 'Alice', 'Usher Door': 'Ann', 'Usher Front': '', 'Prayer of Thanks': 'Dana' } });
  const plan = planMerge(parsed.services, {
    // Presider and Usher Front were changed in the app; Usher Door in the Sheet.
    [id]: stored({ Presider: 'Carol', 'Usher Door': 'Eve', 'Usher Front': 'Fay', 'Prayer of Thanks': 'Dana' })
  });
  assert.deepEqual(plan.updates, [{ id, patch: { assignments: { 'Usher Door': 'Bob' }, sheetSeen: { 'Usher Door': 'Bob' } } }]);

  // Only the Sheet changed: the Sheet's name goes in.
  const sheetOnly = planMerge(parsed.services, { [id]: stored({ Presider: 'Alice', 'Usher Door': 'Ann', 'Prayer of Thanks': 'Dana' }) });
  assert.deepEqual(sheetOnly.updates, [{ id, patch: { assignments: { 'Usher Door': 'Bob' }, sheetSeen: { 'Usher Door': 'Bob' } } }]);
  // Nothing changed anywhere: nothing to write.
  const same = planMerge(parsed.services, { [id]: Object.assign(stored({ Presider: 'Alice', 'Usher Door': 'Bob', 'Usher Front': '', 'Prayer of Thanks': 'Dana' }), {
    sheetSeen: { Presider: 'Alice', 'Usher Door': 'Bob', 'Usher Front': '', 'Prayer of Thanks': 'Dana' } }) });
  assert.deepEqual(same.updates, []);
});

test('a name fixed since the last import is not a change in the Sheet', () => {
  const parsed = sheetRowsToServices([HEADER, row('May 02', 'Morning', 'Presider', 'Alice Smith')], TODAY);
  const service = parsed.services[0];
  const id = svcId(service);
  const canonical = name => (name === 'Alice' ? 'Alice Smith' : name);
  const plan = planMerge(parsed.services, {
    [id]: { date: service.date, service: service.service, time: service.time, worship: service.worship,
      assignments: { Presider: 'Carol' }, sheetSeen: { Presider: 'Alice' } }
  }, { canonical });
  assert.deepEqual(plan.updates, [], 'the app\'s change stays, and nothing needs writing');
});

test('a service the import has not compared yet takes the Sheet once, and remembers it', () => {
  const parsed = sheetRowsToServices([HEADER, row('May 02', 'Morning', 'Presider', 'Alice')], TODAY);
  const service = parsed.services[0];
  const id = svcId(service);
  const plan = planMerge(parsed.services, {
    [id]: { date: service.date, service: service.service, time: service.time, worship: service.worship, assignments: { Presider: 'Carol' } }
  });
  assert.deepEqual(plan.updates, [{ id, patch: { assignments: { Presider: 'Alice' }, sheetSeen: { Presider: 'Alice' } } }]);
});

/* Raw Data has no year column. The year was the closest one to today, so
   from midyear January's rows landed on next January, on the wrong weekday,
   and next year's rows could land on this year's dates. */
test('the year of a Raw Data row follows its weekday, or its worship\'s', () => {
  const october = new Date(2026, 9, 1, 12, 0, 0);
  const july = new Date(2026, 6, 15, 12, 0, 0);
  const date = (raw, worship, today = october) => {
    const parsed = sheetRowsToServices([HEADER, row(raw, 'Morning', 'Presider', 'Alice', worship)], today);
    return { date: parsed.services.map(service => service.date)[0] || null, warnings: parsed.warnings };
  };
  assert.equal(date('Sat, Jan 03', 'Sabbath Day').date, '2026-01-03', 'not 2027-01-03, a Sunday');
  assert.equal(date('Sat, Mar 28', 'Sabbath Day').date, '2026-03-28');
  assert.equal(date('Sat, Jan 03', 'Sabbath Day', july).date, '2026-01-03');
  assert.equal(date('Sat, Jan 02', 'Sabbath Day').date, '2027-01-02', 'next year\'s tab stays next year');
  assert.equal(date('Tue, Jan 05', 'Third Day').date, '2027-01-05');
  assert.equal(date('Jan 03', 'Sabbath Day').date, '2026-01-03', 'the worship gives the weekday');
  assert.equal(date('Sat, Jan 03', 'Pentecost').date, '2026-01-03');
  const typo = date('Sun, Jan 03', 'Sabbath Day');
  assert.equal(typo.date, null);
  assert.deepEqual(typo.warnings, ['Rows for "Sun, Jan 03" were skipped: Sabbath Day is on a Saturday.']);
  const never = date('Wed, Jan 03', '');
  assert.equal(never.date, null);
  assert.match(never.warnings[0], /not a Wednesday last year, this year or next year/);
});
