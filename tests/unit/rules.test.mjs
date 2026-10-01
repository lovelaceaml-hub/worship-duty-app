/* The app's scheduling rules: double duties, availability, suggestions for
   a replacement, which duties a service usually has filled, and when a
   change request is still open. Fill has its own file, fill.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { doubleDuties, openDoubleDuties, canAlsoServe, otherDuties, prayerOf } from '../../app/lib/conflicts.js';
import { availabilityOn, canTake, normalizeProfile, timeKey, timeLabel } from '../../app/lib/availability.js';
import { workload, suggestReplacements, usualDuties } from '../../app/lib/workload.js';
import { isOpen, shownStatus, requestId } from '../../app/lib/requests.js';
import { ALL_DUTIES, PRAYER_DUTIES, USHER_DUTIES, DUTY_DEFAULTS, dutyDefault } from '../../app/config/duties.js';

const require = createRequire(import.meta.url);

test('one duty each in a service; Thanks or Closing Prayer with one usher duty is the only pair allowed', () => {
  const flagged = assignments => doubleDuties({ assignments }).map(item => item.duties);
  // Thanks Prayer and Closing Prayer with every usher duty, sisters' or brothers'.
  ['Prayer of Thanks', 'Closing Prayer'].forEach(prayer => {
    ['Usher Door', 'Usher Front', 'Usher Back', 'Usher #1', 'Usher #2'].forEach(usher => {
      assert.deepEqual(flagged({ [prayer]: 'B. Adam', [usher]: 'B. Adam' }), [], prayer + ' with ' + usher);
      assert.deepEqual(flagged({ Sermon: 'E. Simon', [usher]: 'E. Simon' }), [['Sermon', usher]], 'Opening Prayer is never paired: ' + usher);
    });
  });
  assert.deepEqual(flagged({ 'Closing Prayer': 'B. Adam', 'Lobby Security': 'B. Adam' }), [['Closing Prayer', 'Lobby Security']], 'Lobby Security is not an usher duty here');
  assert.deepEqual(flagged({ Presider: 'E. Joseph', 'Usher #1': 'E. Joseph' }), [['Presider', 'Usher #1']]);
  assert.deepEqual(flagged({ 'Closing Prayer': 'B. Adam', Sermon: 'B. Adam' }), [['Sermon', 'Closing Prayer']]);
  assert.deepEqual(flagged({ 'Usher #2': 'B. Adam', 'Usher #1': 'B. Adam' }), [['Usher #1', 'Usher #2']]);
  assert.deepEqual(flagged({ 'Closing Prayer': 'B. Adam', 'Usher #1': 'B. Adam', 'Usher #2': 'B. Adam' }), [['Closing Prayer', 'Usher #1', 'Usher #2']]);
  const service = { assignments: { 'Prayer of Thanks': 'B. Adam', 'Usher #1': 'B. Adam', Presider: 'E. Joseph', 'Media Booth #1': 'E. Joseph' } };
  assert.deepEqual(doubleDuties(service), [{ name: 'E. Joseph', duties: ['Presider', 'Media Booth #1'] }]);
});

test('who may take one more duty in a service', () => {
  const assignments = { 'Closing Prayer': 'B. Adam', 'Usher #1': 'B. Eli', Presider: 'E. Joseph', Sermon: 'E. Simon' };
  assert.equal(canAlsoServe(assignments, 'B. Adam', 'Usher #2'), true, 'praying, so may usher');
  assert.equal(canAlsoServe(assignments, 'E. Simon', 'Usher #2'), false, 'whoever gives the Opening Prayer does nothing else');
  assert.equal(canAlsoServe(assignments, 'B. Adam', 'Lobby Security'), false);
  assert.equal(canAlsoServe(assignments, 'B. Eli', 'Closing Prayer'), true, 'ushering, so may pray');
  assert.equal(canAlsoServe(assignments, 'E. Joseph', 'Usher #2'), false, 'the Presider does not usher too');
  assert.equal(canAlsoServe(assignments, 'B. Adam', 'Closing Prayer'), true, 'the duty they already hold');
  assert.equal(canAlsoServe(Object.assign({ 'Usher #2': 'B. Adam' }, assignments), 'B. Adam', 'Usher Door'), false, 'one usher duty with a prayer');
  assert.equal(canAlsoServe(assignments, 'S. Leah', 'Usher Door'), true, 'no duty there yet');
  assert.equal(canAlsoServe(assignments, '', 'Usher Door'), true);
  assert.equal(prayerOf(assignments, 'B. Adam'), 'Closing Prayer');
  assert.equal(prayerOf(assignments, 'B. Eli'), '');
  assert.equal(prayerOf(assignments, 'E. Simon'), '', 'the Opening Prayer is not one of the prayers that pair');
  assert.deepEqual(otherDuties(assignments, 'B. Adam', 'Usher #2'), ['Closing Prayer']);
});

test('the browser and the server allow the same duties together, for every pair and three of duties', () => {
  const permissions = require('../../permissions.js');
  assert.deepEqual(permissions.PRAYER_DUTIES, PRAYER_DUTIES);
  assert.deepEqual(permissions.USHER_DUTIES, USHER_DUTIES);
  const duties = ALL_DUTIES.concat('Not a duty');
  const same = held => {
    const last = held[held.length - 1];
    const assignments = Object.fromEntries(held.slice(0, -1).map(duty => [duty, 'B. Adam']));
    const browser = canAlsoServe(assignments, 'B. Adam', last);
    assert.equal(permissions.blockingDuties(assignments, 'B. Adam', last).length === 0, browser, held.join(' + '));
    assert.equal(permissions.dutiesAllowedTogether(held), browser, held.join(' + '));
    assert.equal(doubleDuties({ assignments: Object.assign({ [last]: 'B. Adam' }, assignments) }).length === 0, browser, held.join(' + '));
  };
  duties.forEach((a, i) => duties.slice(i + 1).forEach((b, j) => {
    same([a, b]);
    same([b, a]);
    duties.slice(i + j + 2).forEach(c => same([a, b, c]));
  }));
  assert.deepEqual(permissions.blockingDuties({ Presider: 'E. Joseph', Sermon: 'B. Adam' }, 'E. Joseph', 'Usher #1'), ['Presider']);
  assert.deepEqual(permissions.blockingDuties({ 'Closing Prayer': 'B. Adam' }, 'B. Adam', 'Usher #1'), []);
  assert.deepEqual(permissions.blockingDuties({ Sermon: 'B. Adam' }, 'B. Adam', 'Usher #1'), ['Sermon']);
  assert.deepEqual(permissions.blockingDuties({ Sermon: 'B. Adam' }, '', 'Usher #1'), []);
  assert.deepEqual(permissions.DUTY_DEFAULTS, DUTY_DEFAULTS);
  [{}, { dutyDefaults: {} }, { dutyDefaults: { Sermon: '' } }, { dutyDefaults: { Sermon: ' P. Paul ' } }].forEach(settings => {
    assert.equal(permissions.dutyDefault(settings, 'Sermon'), dutyDefault(settings, 'Sermon'));
  });
  assert.equal(dutyDefault({}, 'Sermon'), 'E. Simon', 'the overseer until a leader changes it');
});

test('a double duty marked OK stays OK only while the duties stay the same', () => {
  const service = { assignments: { Presider: 'E. Joseph', 'Media Booth #1': 'E. Joseph' }, conflictOk: { 'E. Joseph': ['Presider', 'Media Booth #1'] } };
  assert.equal(openDoubleDuties(service).length, 0);
  service.conflictOk['E. Joseph'] = ['Media Booth #1', 'Presider', 'Presider'];
  assert.equal(openDoubleDuties(service).length, 0, 'in any order, once each');
  service.assignments.Sermon = 'E. Joseph';
  assert.equal(openDoubleDuties(service).length, 1);
  service.conflictOk['E. Joseph'] = ['Presider', 'Media Booth #1', 'Sermon', 'Usher #1'];
  assert.equal(openDoubleDuties(service).length, 1, 'a mark for other duties does not count');
});

const profile = normalizeProfile({
  memberUid: 'member:S. Leah', departmentId: 'Usher Sisters', memberName: 'S. Leah', status: 'active', schedulable: true,
  eligibleDuties: ['Usher Door'], availability: { recurring: { morning: 'available', evening: 'unavailable' }, exceptions: { '2026-09-19': { '*': 'unavailable' }, '2026-09-26': { evening: 'available' } } }
}, 'Usher Sisters');

test('a day off overrides the weekly pattern; "*" covers the whole day', () => {
  assert.equal(availabilityOn(profile, '2026-09-12', 'morning'), 'available');
  assert.equal(availabilityOn(profile, '2026-09-19', 'morning'), 'unavailable');
  assert.equal(availabilityOn(profile, '2026-09-26', 'evening'), 'available');
  assert.equal(availabilityOn(profile, '2026-09-12', 'afternoon'), 'available', 'a time not set counts as available');
  assert.equal(timeKey('Early Morning'), 'early-morning');
  assert.equal(timeLabel('*'), 'All services that day');
});

test('a normal assignment needs an active, schedulable, eligible and available member', () => {
  const service = { date: '2026-09-12', service: 'Morning' };
  assert.equal(canTake(profile, service, 'Usher Door'), true);
  assert.equal(canTake(profile, service, 'Usher Front'), false);
  assert.equal(canTake(profile, { date: '2026-09-19', service: 'Morning' }, 'Usher Door'), false);
  assert.equal(canTake(Object.assign({}, profile, { schedulable: false }), service, 'Usher Door'), false);
  assert.equal(canTake(Object.assign({}, profile, { status: 'inactive' }), service, 'Usher Door'), false);
});

test('a profile with a mismatched department or id is rejected', () => {
  assert.equal(normalizeProfile({ memberUid: 'a', departmentId: 'Media', schedulable: true }, 'Lobby'), null);
  assert.equal(normalizeProfile({ memberUid: 'a', uid: 'b', departmentId: 'Media', schedulable: true }, 'Media'), null);
  assert.equal(normalizeProfile({ memberUid: 'a', departmentId: 'Media' }, 'Media'), null);
});

test('replacements: free members who can take the duty, lightest load first', () => {
  const service = { date: '2026-09-12', service: 'Morning', assignments: { 'Usher Door': 'S. Naomi', 'Usher Front': 'S. Esther' } };
  const person = (name, extra = {}) => Object.assign({}, profile, { memberUid: 'member:' + name, memberName: name }, extra);
  const roster = [person('S. Naomi'), person('S. Esther'), person('S. Grace'), person('S. Leah'), person('S. Hannah', { schedulable: false })];
  const stats = workload([
    { date: '2026-09-05', assignments: { 'Usher Door': 'S. Grace' } },
    { date: '2026-09-20', assignments: { 'Usher Door': 'S. Grace' } }
  ], [], '2026-09-10');
  assert.deepEqual(suggestReplacements(service, 'Usher Door', roster, stats, { exclude: 'S. Naomi' }).map(item => item.memberName), ['S. Leah', 'S. Grace']);
  assert.deepEqual([stats['S. Grace'].past4, stats['S. Grace'].upcoming, stats['S. Grace'].last], [1, 1, '2026-09-05']);
  // Grace prays at this service: she comes first for an usher duty, though she has served more.
  const praying = Object.assign({}, service, { assignments: Object.assign({ 'Prayer of Thanks': 'S. Grace' }, service.assignments) });
  assert.deepEqual(suggestReplacements(praying, 'Usher Door', roster, stats, { exclude: 'S. Naomi' }).map(item => item.memberName), ['S. Grace', 'S. Leah']);
  // Esther ushers at the front already, so she is not offered for the door.
  assert.ok(!suggestReplacements(praying, 'Usher Door', roster, stats, { limit: 9 }).some(item => item.memberName === 'S. Esther'));
});

test('a service "usually" has a duty filled when half of its kind do', () => {
  const kind = { worship: 'Sabbath Day', service: 'Morning' };
  const usual = usualDuties([
    Object.assign({ assignments: { Presider: 'a', 'Usher #1': 'b' } }, kind),
    Object.assign({ assignments: { Presider: 'c' } }, kind),
    Object.assign({ assignments: {} }, kind)
  ]);
  assert.deepEqual(usual(kind), ['Presider', 'Usher #1']);
  assert.deepEqual(usual({ worship: 'Third Day', service: 'Evening' }), []);
});

test('a change request is open while pending and the member still holds the duty', () => {
  const services = [{ date: '2026-09-12', service: 'Morning', assignments: { 'Usher Door': 'S. Leah' } }];
  const request = { svcId: '2026-09-12_morning', duty: 'Usher Door', name: 'S. Leah', status: 'pending' };
  assert.equal(isOpen(request, services, undefined, new Date('2026-09-10T12:00:00-07:00')), true, 'before the service starts');
  services[0].assignments['Usher Door'] = 'S. Grace';
  assert.equal(isOpen(request, services), false);
  assert.equal(shownStatus(request, services), 'completed');
  assert.equal(shownStatus(Object.assign({}, request, { status: 'declined' }), services), 'declined');
  assert.equal(requestId('2026-09-12_morning', 'Usher #1', 5), '2026-09-12_morning_usher-1_5');
});
