/* Assignments by a leader (assignDepartmentDuty, unassignDepartmentDuty and
   the month planner's saveDepartmentAssignments): a service that has
   started keeps its duties (an administrator's recorded override still
   works); duty names go in their stored spelling; names are compared in
   their current spelling; handing a duty over removes a flag raised for the
   person before. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createDepartmentHandlers } = require('../department-handlers.js');
const { memoryDb } = require('./memory-db.js');

const NOW = Date.parse('2026-10-01T17:00:00Z');
const SISTERS = ['Usher Door', 'Usher Front', 'Usher Back'];
const sister = name => ({
  uid: 'uid-' + name, memberUid: 'uid-' + name, departmentId: 'Usher Sisters', department: 'Usher Sisters', role: 'member',
  memberName: name, status: 'active', schedulable: true, eligibleDuties: SISTERS, availability: { recurring: {}, exceptions: {} }
});
const leader = { uid: 'uid-grace', token: { uid: 'uid-grace', roles: ['departmentLeader'], departments: ['Usher Sisters'], memberUid: 'uid-grace', memberName: 'S. Grace' } };
const admin = { uid: 'uid-admin', token: { uid: 'uid-admin', roles: ['admin'], memberUid: 'uid-admin', memberName: 'B. Anthony' } };
const LATER = 'schedule/2026-10-10_morning';
const PAST = 'schedule/2026-09-26_morning';

function setup(extra = {}) {
  const db = memoryDb(Object.assign({
    [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: {} },
    [PAST]: { date: '2026-09-26', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah' } },
    'departments/Usher Sisters/members/uid-S. Leah': sister('S. Leah'),
    'departments/Usher Sisters/members/uid-S. Naomi': sister('S. Naomi'),
    'departments/Usher Sisters/members/uid-S. Melissa': sister('S. Melissa')
  }, extra));
  const handlers = createDepartmentHandlers({ db, now: () => NOW });
  const slot = (id, date, extraData = {}) => Object.assign({ departmentId: 'Usher Sisters', serviceId: id, serviceDate: date, serviceTime: 'morning' }, extraData);
  return { db, handlers, slot };
}

const refused = (code, reason) => error => {
  assert.equal(error.code, code, error.message);
  assert.equal(error.details.reason, reason);
  return true;
};

test('a service that has started keeps its duties; an administrator\'s override is still recorded', async () => {
  const { db, handlers, slot } = setup();
  const past = slot('2026-09-26_morning', '2026-09-26');
  await assert.rejects(handlers.assignDepartmentDuty({ auth: leader, data: Object.assign({ memberUid: 'uid-S. Naomi', duty: 'Usher Front' }, past) }),
    refused('failed-precondition', 'service-started'));
  await assert.rejects(handlers.unassignDepartmentDuty({ auth: leader, data: Object.assign({ duty: 'Usher Door' }, past) }),
    refused('failed-precondition', 'service-started'));
  const batch = await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [
    { serviceId: '2026-09-26_morning', duty: 'Usher Front', memberUid: 'uid-S. Naomi' },
    { serviceId: '2026-10-10_morning', duty: 'Usher Front', memberUid: 'uid-S. Naomi' }
  ] } });
  assert.deepEqual(batch.skipped.map(item => item.reason), ['service-started']);
  assert.deepEqual(batch.saved.map(item => item.serviceId), ['2026-10-10_morning']);
  assert.deepEqual(db.store.get(PAST).assignments, { 'Usher Door': 'S. Leah' });

  const override = await handlers.overrideDepartmentAssignment({ auth: admin, data: Object.assign({
    memberUid: 'uid-S. Naomi', duty: 'Usher Back', override: true, overrideReason: 'She served in S. Ruth\'s place.'
  }, past) });
  assert.equal(override.override, true);
  assert.equal(db.store.get(PAST).assignments['Usher Back'], 'S. Naomi');
});

test('duty names go in their stored spelling, and other names are refused', async () => {
  const { db, handlers, slot } = setup();
  const later = slot('2026-10-10_morning', '2026-10-10');
  await handlers.assignDepartmentDuty({ auth: leader, data: Object.assign({ memberUid: 'uid-S. Leah', duty: 'usher door' }, later) });
  await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [{ serviceId: '2026-10-10_morning', duty: 'USHER FRONT', memberUid: 'uid-S. Naomi' }] } });
  assert.deepEqual(db.store.get(LATER).assignments, { 'Usher Door': 'S. Leah', 'Usher Front': 'S. Naomi' });
  await assert.rejects(handlers.assignDepartmentDuty({ auth: leader, data: Object.assign({ memberUid: 'uid-S. Leah', duty: 'Usher Gate' }, later) }),
    refused('invalid-argument', 'invalid-input'));
  await assert.rejects(handlers.listDepartmentRoster({ auth: admin, data: { departmentId: 'Choir' } }), refused('invalid-argument', 'invalid-input'));
});

test('names are compared in their current spelling', async () => {
  const { db, handlers } = setup({
    [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Melisaa' } }
  });
  // The app shows and sends the current spelling.
  const blocked = await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [
    { serviceId: '2026-10-10_morning', duty: 'Usher Front', memberUid: 'uid-S. Melissa' }
  ] } });
  assert.deepEqual(blocked.skipped.map(item => [item.reason, item.duties]), [['already-serving', ['Usher Door']]]);
  const cleared = await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [
    { serviceId: '2026-10-10_morning', duty: 'Usher Door', memberUid: '', expectedMemberName: 'S. Melissa' }
  ] } });
  assert.deepEqual([cleared.saved.length, cleared.skipped.length], [1, 0]);
  assert.equal(db.store.get(LATER).assignments['Usher Door'], '');
});

test('handing a duty over removes the flag raised for the person before', async () => {
  const flagged = { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah', 'Usher Front': 'S. Leah' },
    needsReplacement: { 'Usher Door': { memberName: 'S. Leah', reason: 'unavailable' }, 'Usher Front': { memberName: 'S. Leah', reason: 'unavailable' } } };
  const { db, handlers, slot } = setup({ [LATER]: flagged });
  await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [
    { serviceId: '2026-10-10_morning', duty: 'Usher Door', memberUid: 'uid-S. Naomi', expectedMemberName: 'S. Leah' }
  ] } });
  assert.deepEqual(Object.keys(db.store.get(LATER).needsReplacement), ['Usher Front'], 'only the duty that changed hands');
  await handlers.unassignDepartmentDuty({ auth: leader, data: Object.assign({ duty: 'Usher Front' }, slot('2026-10-10_morning', '2026-10-10')) });
  assert.deepEqual(db.store.get(LATER).needsReplacement, {});
});
