/* When a service counts as upcoming, and which service the Schedule opens
   on. The rule: at a service's Pacific start minute, it stops being upcoming
   and the Schedule moves on to the next one. No "current" window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { nextService, upcoming, past, isUpcoming, isInProgress, dutiesOf, serviceId, startTime } from '../../app/lib/services.js';

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
  assert.equal(nextService(list, pacific('2026-09-14', '19:29')).service, 'Evening');
});

test('upcoming and past split at the start minute', () => {
  assert.equal(upcoming(earlyAndEvening, pacific('2026-09-14', '04:59')).length, 3);
  assert.deepEqual(upcoming(earlyAndEvening, pacific('2026-09-14', '05:00')).map(s => s.service), ['Evening', 'Morning']);
  assert.deepEqual(upcoming(earlyAndEvening, pacific('2026-09-14', '19:31')).map(s => s.service), ['Morning']);
  assert.deepEqual(past(earlyAndEvening, pacific('2026-09-14', '21:00')).map(s => s.service), ['Evening', 'Early Morning']);
  assert.equal(isUpcoming(earlyAndEvening[2], pacific('2026-09-14', '21:00')), true);
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
