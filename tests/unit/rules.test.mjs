/* The app's scheduling rules: double duties, availability, suggestions for
   a replacement, which duties a service usually has filled, and when a
   change request is still open. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { doubleDuties, openDoubleDuties } from '../../app/lib/conflicts.js';
import { availabilityOn, canTake, normalizeProfile, timeKey, timeLabel } from '../../app/lib/availability.js';
import { workload, suggestReplacements, usualDuties } from '../../app/lib/workload.js';
import { isOpen, shownStatus, requestId } from '../../app/lib/requests.js';

test('two duties in one service are flagged, except one prayer duty with one usher duty', () => {
  const service = { assignments: { 'Prayer of Thanks': 'B. Adam', 'Usher #1': 'B. Adam', Presider: 'E. Joseph', 'Media Booth #1': 'E. Joseph' } };
  assert.deepEqual(doubleDuties(service), [{ name: 'E. Joseph', duties: ['Presider', 'Media Booth #1'] }]);
  const three = { assignments: { 'Prayer of Thanks': 'B. Adam', 'Usher #1': 'B. Adam', Sermon: 'B. Adam' } };
  assert.equal(doubleDuties(three).length, 1);
});

test('a double duty marked OK stays OK only while the duties stay the same', () => {
  const service = { assignments: { Presider: 'E. Joseph', 'Media Booth #1': 'E. Joseph' }, conflictOk: { 'E. Joseph': ['Presider', 'Media Booth #1'] } };
  assert.equal(openDoubleDuties(service).length, 0);
  service.assignments.Sermon = 'E. Joseph';
  assert.equal(openDoubleDuties(service).length, 1);
});

const profile = normalizeProfile({
  memberUid: 'member:S. Leah', departmentId: 'Usher Sisters', memberName: 'S. Leah', status: 'active', schedulable: true,
  eligibleDuties: ['Usher Door'], availability: { recurring: { morning: 'available', evening: 'unavailable' }, exceptions: { '2026-09-19': { '*': 'unavailable' }, '2026-09-26': { evening: 'available' } } }
}, 'Usher Sisters');

test('a day off overrides the weekly pattern; "*" covers the whole day', () => {
  assert.equal(availabilityOn(profile, '2026-09-12', 'morning'), 'available');
  assert.equal(availabilityOn(profile, '2026-09-19', 'morning'), 'unavailable');
  assert.equal(availabilityOn(profile, '2026-09-26', 'evening'), 'available');
  assert.equal(availabilityOn(profile, '2026-09-12', 'afternoon'), 'unknown');
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
  assert.equal(isOpen(request, services), true);
  services[0].assignments['Usher Door'] = 'S. Grace';
  assert.equal(isOpen(request, services), false);
  assert.equal(shownStatus(request, services), 'completed');
  assert.equal(shownStatus(Object.assign({}, request, { status: 'declined' }), services), 'declined');
  assert.equal(requestId('2026-09-12_morning', 'Usher #1', 5), '2026-09-12_morning_usher-1_5');
});

test('Fill gives each empty duty to the least-served member who can take it, never twice in one service', async () => {
  const { fill } = await import('../../app/lib/fill.js');
  const person = (name, extra = {}) => normalizeProfile(Object.assign({
    memberUid: 'member:' + name, departmentId: 'Usher Sisters', memberName: name, status: 'active', schedulable: true,
    eligibleDuties: ['Usher Door', 'Usher Front'], availability: { recurring: { morning: 'available' }, exceptions: {} }
  }, extra), 'Usher Sisters');
  const roster = [
    person('S. Leah', { availability: { recurring: { morning: 'available' }, exceptions: { '2026-09-19': { '*': 'unavailable' } } } }),
    person('S. Naomi'), person('S. Esther'), person('S. Grace', { eligibleDuties: ['Usher Front'] })
  ];
  const services = [
    { date: '2026-09-26', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Esther' } },
    { date: '2026-09-12', service: 'Morning', time: '10:00', assignments: {} },
    { date: '2026-09-19', service: 'Morning', time: '10:00', assignments: {} }
  ];
  const stats = {
    'S. Leah': { past8: 1, upcoming: 0, last: '2026-08-29' },
    'S. Naomi': { past8: 1, upcoming: 0, last: '2026-08-01' },
    'S. Esther': { past8: 2, upcoming: 1, last: '2026-08-22' }
  };
  const { proposals, unfilled } = fill(services, ['Usher Door', 'Usher Front'], () => roster, stats);
  assert.deepEqual(proposals.map(item => [item.serviceId, item.duty, item.memberName]), [
    ['2026-09-12_morning', 'Usher Door', 'S. Naomi'],   // Leah and Naomi tie; Naomi served longer ago. Grace cannot take the door.
    ['2026-09-12_morning', 'Usher Front', 'S. Grace'],  // Grace has served least of all
    ['2026-09-19_morning', 'Usher Door', 'S. Naomi'],   // Leah is away; Naomi (2) still under Esther (3)
    ['2026-09-19_morning', 'Usher Front', 'S. Grace'],  // Naomi is serving there already
    ['2026-09-26_morning', 'Usher Front', 'S. Leah']    // the door was already filled; Esther serves there
  ]);
  assert.equal(proposals[0].memberUid, 'member:S. Naomi');
  assert.deepEqual(unfilled, []);
  const none = fill([{ date: '2026-09-19', service: 'Morning', assignments: {} }], ['Usher Door'], () => roster.slice(0, 1), {});
  assert.deepEqual([none.proposals.length, none.unfilled], [0, [{ serviceId: '2026-09-19_morning', duty: 'Usher Door' }]]);
});
