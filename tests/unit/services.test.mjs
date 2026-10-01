/* When a service counts as upcoming, and which service the Schedule opens
   on. The rule: at a service's Pacific start minute, it stops being upcoming
   and the Schedule moves on to the next one. No "current" window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { hasChoir, hasThanks, isFeast, hasDuty } from '../../app/lib/worship.js';
import { nextService, upcoming, past, isUpcoming, isInProgress, dutiesOf, serviceId, startTime, serviceClock, byStart, nextChange } from '../../app/lib/services.js';
import { pacificNow } from '../../app/lib/dates.js';

// 2026-09-14 is in Pacific daylight time (UTC minus 7).
const pacific = (date, time) => new Date(date + 'T' + time + ':00-07:00');
const earlyAndEvening = [
  { date: '2026-09-14', time: '05:00', service: 'Early Morning' },
  { date: '2026-09-14', time: '19:30', service: 'Evening' },
  { date: '2026-09-15', time: '09:00', service: 'Morning' }
];
const afternoonAndEvening = [
  { date: '2026-09-14', time: '14:30', service: 'Afternoon' },
  { date: '2026-09-14', time: '19:30', service: 'Evening' },
  { date: '2026-09-15', time: '09:00', service: 'Morning' }
];

test('7:29 PM shows the 7:30 PM service, not the finished 5:00 AM one', () => {
  const chosen = nextService(earlyAndEvening, pacific('2026-09-14', '19:29'));
  assert.deepEqual([chosen.date, chosen.service], ['2026-09-14', 'Evening']);
});

test('at 7:30 PM, the start minute itself, the Schedule already moves on', () => {
  assert.equal(nextService(earlyAndEvening, pacific('2026-09-14', '19:30')).date, '2026-09-15');
});

test('7:31 PM shows the next service, tomorrow morning', () => {
  const chosen = nextService(earlyAndEvening, pacific('2026-09-14', '19:31'));
  assert.deepEqual([chosen.date, chosen.service], ['2026-09-15', 'Morning']);
});

test('2:29 PM shows the 2:30 PM service; 2:31 PM moves to the evening one', () => {
  assert.equal(nextService(afternoonAndEvening, pacific('2026-09-14', '14:29')).service, 'Afternoon');
  const chosen = nextService(afternoonAndEvening, pacific('2026-09-14', '14:31'));
  assert.deepEqual([chosen.date, chosen.service], ['2026-09-14', 'Evening']);
});

test('no service stays current after it starts', () => {
  assert.equal(nextService(earlyAndEvening, pacific('2026-09-14', '21:06')).date, '2026-09-15');
});

test('with nothing ahead, the most recent service is shown', () => {
  assert.equal(nextService(earlyAndEvening.slice(0, 2), pacific('2026-09-14', '23:31')).service, 'Evening');
  assert.equal(nextService([], pacific('2026-09-14', '12:00')), null);
});

test('the Pacific clock decides, not the device or UTC clock', () => {
  // 02:29 UTC on the 15th is 7:29 PM Pacific on the 14th.
  assert.equal(nextService(earlyAndEvening, new Date('2026-09-15T02:29:00Z')).service, 'Evening');
  assert.equal(nextService(earlyAndEvening, new Date('2026-09-15T02:31:00Z')).date, '2026-09-15');
});

test('a service without a time uses its label\'s usual time; bad rows are ignored', () => {
  const list = [{ date: 'not-a-date', time: '05:00', service: 'Early Morning' }, { date: '2026-09-14', service: 'Evening' }];
  assert.equal(startTime(list[1]), '19:30');
  assert.equal(serviceClock(list[1]), '7:30 PM', 'shown with its usual time too');
  assert.equal(serviceClock({ date: '2026-09-14', service: 'Morning', time: '09:00' }), '9:00 AM');
  assert.equal(nextService(list, pacific('2026-09-14', '19:29')).service, 'Evening');
});

test('upcoming and past split at the start minute', () => {
  assert.equal(upcoming(earlyAndEvening, pacific('2026-09-14', '04:59')).length, 3);
  assert.deepEqual(upcoming(earlyAndEvening, pacific('2026-09-14', '05:00')).map(s => s.service), ['Evening', 'Morning']);
  assert.deepEqual(upcoming(earlyAndEvening, pacific('2026-09-14', '19:31')).map(s => s.service), ['Morning']);
  assert.deepEqual(past(earlyAndEvening, pacific('2026-09-14', '21:00')).map(s => s.service), ['Evening', 'Early Morning']);
  assert.equal(isUpcoming(earlyAndEvening[2], pacific('2026-09-14', '21:00')), true);
});

test('on the Sunday the clocks fall back, a 10:00 service starts at 18:00 UTC', () => {
  const service = { date: '2026-11-01', service: 'Morning', time: '10:00' };
  assert.equal(isUpcoming(service, new Date('2026-11-01T17:59:00Z')), true);
  assert.equal(isUpcoming(service, new Date('2026-11-01T18:00:00Z')), false);
  const spring = { date: '2027-03-14', service: 'Morning', time: '10:00' };
  assert.equal(isUpcoming(spring, new Date('2027-03-14T16:59:00Z')), true);
  assert.equal(isUpcoming(spring, new Date('2027-03-14T17:00:00Z')), false);
});

test('a list is checked against one clock reading, given as a Date or a wall time', () => {
  const wall = pacificNow(pacific('2026-09-14', '19:30')).wall;
  assert.deepEqual(upcoming(earlyAndEvening, wall).map(s => s.service), ['Morning']);
  assert.equal(nextService(earlyAndEvening, wall).date, '2026-09-15');
  assert.equal(isInProgress(earlyAndEvening[1], wall), true);
});

test('rows without a valid date sort last and never upset the order of the others', () => {
  const valid = [
    { date: '2026-09-15', service: 'Morning', time: '09:00' },
    { date: '2026-09-14', service: 'Evening', time: '19:30' },
    { date: '2026-09-14', service: 'Early Morning', time: '05:00' }
  ];
  const broken = [{ date: '', service: 'Morning' }, { service: 'Evening' }, { date: 'soon', service: 'Mystery' }];
  for (let round = 0; round < 50; round++) {
    const mixed = valid.concat(broken).map(item => [Math.random(), item]).sort((a, b) => a[0] - b[0]).map(pair => pair[1]);
    const sorted = mixed.sort(byStart);
    assert.deepEqual(sorted.slice(0, 3).map(s => s.date + ' ' + s.service), ['2026-09-14 Early Morning', '2026-09-14 Evening', '2026-09-15 Morning']);
  }
  // At the same start, an unknown label comes after the known ones.
  const same = [{ date: '2026-09-14', time: '10:00', service: 'Bible Seminar' }, { date: '2026-09-14', time: '10:00', service: 'Morning' }];
  assert.deepEqual(same.sort(byStart).map(s => s.service), ['Morning', 'Bible Seminar']);
  const withDuty = valid.concat(broken).map(service => Object.assign({ assignments: { Presider: 'B. Adam' } }, service));
  assert.deepEqual(dutiesOf('B. Adam', withDuty).slice(0, 3).map(item => item.service.date), ['2026-09-14', '2026-09-14', '2026-09-15']);
});

test('the next moment the screens change: a start, the end of three hours in progress, or midnight', () => {
  const wall = (date, time) => Date.parse(date + 'T' + time + ':00Z');
  assert.equal(nextChange(earlyAndEvening, pacific('2026-09-14', '04:00')), wall('2026-09-14', '05:00'));
  assert.equal(nextChange(earlyAndEvening, pacific('2026-09-14', '05:00')), wall('2026-09-14', '08:00'), 'the early service stops being in progress');
  assert.equal(nextChange(earlyAndEvening, pacific('2026-09-14', '08:00')), wall('2026-09-14', '19:30'));
  assert.equal(nextChange(earlyAndEvening, pacific('2026-09-14', '22:30')), wall('2026-09-15', '00:00'), 'midnight');
  assert.equal(nextChange([], pacific('2026-09-14', '12:00')), wall('2026-09-15', '00:00'));
});

test('the Presider planner keeps a service in progress for three hours after it starts', () => {
  const evening = earlyAndEvening[1];
  assert.equal(isInProgress(evening, pacific('2026-09-14', '19:29')), false);
  assert.equal(isInProgress(evening, pacific('2026-09-14', '19:30')), true);
  assert.equal(isInProgress(evening, pacific('2026-09-14', '22:29')), true);
  assert.equal(isInProgress(evening, pacific('2026-09-14', '22:30')), false);
});

test('a member\'s duties come in date, time and department order', () => {
  const services = [
    { date: '2026-09-15', time: '09:00', service: 'Morning', assignments: { 'Usher #1': 'B. Adam', Presider: 'B. Adam' } },
    { date: '2026-09-14', time: '19:30', service: 'Evening', assignments: { Sermon: 'B. Adam', Presider: 'E. Joseph' } }
  ];
  assert.deepEqual(dutiesOf('B. Adam', services).map(item => item.service.date + ' ' + item.duty),
    ['2026-09-14 Sermon', '2026-09-15 Presider', '2026-09-15 Usher #1']);
  assert.deepEqual(dutiesOf('', services), []);
});

test('service ids match the setlist ids the Signal ingest uses', () => {
  assert.equal(serviceId({ date: '2026-09-14', service: 'Early Morning' }), '2026-09-14_early-morning');
  const songLib = createRequire(import.meta.url)('../../song-lib.js');
  assert.equal(songLib.serviceIdFor('2026-09-14', 'Early Morning'), '2026-09-14_early-morning');
});

test('choir song and closing prayer only at Sabbath Day and Third Day; Thanks at Sabbath and feast mornings', () => {
  assert.ok(hasChoir('Sabbath Day') && hasChoir('Third Day'));
  for (const worship of ['Prayer Week', 'Preaching Week', 'Pentecost']) assert.ok(!hasChoir(worship), worship);
  assert.ok(hasThanks('Sabbath Day', 'Morning'));
  assert.ok(!hasThanks('Sabbath Day', 'Afternoon'));
  assert.ok(hasThanks('Pentecost', 'Morning') && isFeast('Feast of Trumpets'));
  for (const worship of ['Third Day', 'Prayer Week', 'Preaching Week']) assert.ok(!hasThanks(worship, 'Morning'), worship);
});

test('worship names and labels are read without extra spaces and whatever their capitals', () => {
  assert.ok(hasChoir('Sabbath day') && hasChoir(' Third  Day '));
  assert.ok(!isFeast('sabbath day ') && !isFeast('PRAYER WEEK') && !isFeast('  '));
  assert.ok(hasThanks('Sabbath day', 'morning') && hasThanks(' Pentecost', 'Morning '));
  assert.ok(hasDuty({ worship: 'Sabbath day ', service: 'Morning' }, 'Closing Prayer'));
  assert.ok(hasDuty({ worship: 'sabbath day', service: 'morning' }, 'Prayer of Thanks'));
  assert.ok(!hasDuty({ worship: 'third day', service: 'Morning' }, 'Prayer of Thanks'));
  assert.ok(hasDuty({ worship: '  ', service: 'Evening' }, 'Closing Prayer'), 'a blank name is Sabbath Day');
});

test('Thanks Prayer and Closing Prayer are duties only at services that have them', () => {
  assert.ok(hasDuty({ worship: 'Sabbath Day', service: 'Morning' }, 'Prayer of Thanks'));
  assert.ok(!hasDuty({ worship: 'Sabbath Day', service: 'Evening' }, 'Prayer of Thanks'));
  assert.ok(hasDuty({ worship: 'Third Day', service: 'Evening' }, 'Closing Prayer'));
  assert.ok(!hasDuty({ worship: 'Prayer Week', service: 'Evening' }, 'Closing Prayer'));
  assert.ok(hasDuty({ service: 'Afternoon' }, 'Closing Prayer'), 'no worship name means Sabbath Day');
  assert.ok(hasDuty({ worship: 'Prayer Week', service: 'Evening' }, 'Usher Door'));
});
