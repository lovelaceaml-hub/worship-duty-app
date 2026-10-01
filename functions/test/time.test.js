'use strict';

/* Pacific times as instants, on ordinary days and on the two Sundays a year
   the clocks change (an early-morning feast service on such a Sunday was an
   hour off). */
const assert = require('node:assert/strict');
const test = require('node:test');
const { pacificTime, serviceStart, hasStarted } = require('../time.js');

test('a Pacific time is the right instant, also on the Sundays the clocks change', () => {
  const at = (date, time) => new Date(pacificTime(date, time)).toISOString();
  assert.equal(at('2026-11-01', '05:00'), '2026-11-01T13:00:00.000Z', 'standard time from 2 AM');
  assert.equal(at('2027-03-14', '05:00'), '2027-03-14T12:00:00.000Z', 'daylight time from 2 AM');
  assert.equal(at('2026-10-06', '19:30'), '2026-10-07T02:30:00.000Z');
  assert.equal(at('2026-01-03', '10:00'), '2026-01-03T18:00:00.000Z');
  assert.equal(serviceStart({ date: '2026-11-01', service: 'Early Morning' }), Date.parse('2026-11-01T13:00:00Z'));
});

test('a service has started from its start minute on', () => {
  const service = { date: '2026-10-03', time: '10:00', service: 'Morning' };
  const start = Date.parse('2026-10-03T17:00:00Z');
  assert.equal(hasStarted(service, start - 60000), false);
  assert.equal(hasStarted(service, start), true);
  assert.equal(hasStarted({ service: 'Morning' }, start), false, 'no date, not started');
});
