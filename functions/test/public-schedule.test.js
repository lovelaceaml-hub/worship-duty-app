'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { publicScheduleService } = require('../public-schedule');

test('keeps only schedule-tab fields in the public Worship projection', () => {
  const service = publicScheduleService({
    date: '2026-08-08',
    time: '09:00',
    worship: 'First Service',
    service: 'Morning',
    assignments: { Presider: 'Brother Anthony Lovelace', Usher: 'Sister Maria Rivera' },
    editorNote: 'Private planning detail',
    members: ['Private roster'],
    tokens: ['Private notification token'],
  });

  assert.deepEqual(service, {
    date: '2026-08-08',
    time: '09:00',
    worship: 'First Service',
    service: 'Morning',
    assignments: { Presider: 'Brother Anthony Lovelace', Usher: 'Sister Maria Rivera' },
  });
});

test('rejects malformed dates; a time that cannot be read is the label\'s usual time, as in the app', () => {
  assert.equal(publicScheduleService({ date: 'not-a-date', time: '09:00' }), null);
  assert.equal(publicScheduleService({ date: '2026-08-08', service: 'Evening', time: '9 AM' }).time, '19:30');
  assert.equal(publicScheduleService({ date: '2026-08-08', service: 'Morning', time: '' }).time, '10:00');
  assert.equal(publicScheduleService({ date: '2026-08-08', service: 'Morning', time: '25:00' }).time, '10:00');
});
