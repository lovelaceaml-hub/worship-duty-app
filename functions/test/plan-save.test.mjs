/* The month planner's batch save (saveDepartmentAssignments): each change is
   checked like a single assignment, bad ones are skipped, the rest saved. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createDepartmentHandlers } = require('../department-handlers.js');
const { memoryDb } = require('./memory-db.js');

const person = (name, extra = {}) => ({
  uid: 'uid-' + name, memberUid: 'uid-' + name, departmentId: 'Usher Sisters', department: 'Usher Sisters',
  role: 'member', memberName: name, status: 'active', schedulable: true,
  eligibleDuties: ['Usher Door', 'Usher Front', 'Usher Back'],
  availability: { recurring: { morning: 'available', evening: 'available' }, exceptions: {} },
  ...extra
});
const leader = { uid: 'uid-leader', token: { uid: 'uid-leader', roles: ['departmentLeader'], departments: ['Usher Sisters'], memberUid: 'uid-leader', memberName: 'S. Grace' } };
const outsider = { uid: 'uid-other', token: { uid: 'uid-other', roles: ['departmentLeader'], departments: ['Media'], memberUid: 'uid-other' } };

function setup() {
  const db = memoryDb({
    'schedule/2026-10-03_morning': { date: '2026-10-03', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Naomi' } },
    'schedule/2026-10-10_morning': { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: {} },
    'departments/Usher Sisters/members/uid-S. Leah': person('S. Leah'),
    'departments/Usher Sisters/members/uid-S. Naomi': person('S. Naomi'),
    'departments/Usher Sisters/members/uid-S. Esther': person('S. Esther', { availability: { recurring: { morning: 'available' }, exceptions: { '2026-10-10': { '*': 'unavailable' } } } })
  });
  return { db, handlers: createDepartmentHandlers({ db, now: () => 1000 }) };
}

test('a leader saves several duties at once; each is checked like a single assignment', async () => {
  const { db, handlers } = setup();
  const result = await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [
    { serviceId: '2026-10-03_morning', duty: 'Usher Front', memberUid: 'uid-S. Leah', expectedMemberName: '' },
    { serviceId: '2026-10-03_morning', duty: 'Usher Back', memberUid: 'uid-S. Naomi' },      // already on Usher Door there
    { serviceId: '2026-10-10_morning', duty: 'Usher Door', memberUid: 'uid-S. Esther' },     // away that day
    { serviceId: '2026-10-10_morning', duty: 'Usher Front', memberUid: 'uid-S. Naomi' },
    { serviceId: '2026-10-03_morning', duty: 'Usher Door', memberUid: '', expectedMemberName: 'S. Leah' } // changed meanwhile
  ] } });
  assert.deepEqual(result.saved.map(item => [item.serviceId, item.duty, item.memberName]),
    [['2026-10-03_morning', 'Usher Front', 'S. Leah'], ['2026-10-10_morning', 'Usher Front', 'S. Naomi']]);
  assert.deepEqual(result.skipped.map(item => item.reason), ['already-serving', 'target-unavailable', 'changed']);
  const first = db.store.get('schedule/2026-10-03_morning');
  assert.deepEqual(first.assignments, { 'Usher Door': 'S. Naomi', 'Usher Front': 'S. Leah' });
  assert.equal(first.planBatch, result.planBatch);
  assert.equal(first.assignmentRevisions['Usher Front'], 1);
  assert.equal(db.store.get('schedule/2026-10-10_morning').assignments['Usher Front'], 'S. Naomi');
});

test('clearing a duty empties it and removes its assignment record', async () => {
  const { db, handlers } = setup();
  await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [{ serviceId: '2026-10-10_morning', duty: 'Usher Back', memberUid: 'uid-S. Leah' }] } });
  const records = () => [...db.store.keys()].filter(path => path.startsWith('departmentAssignments/'));
  assert.equal(records().length, 1);
  const result = await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Sisters', changes: [{ serviceId: '2026-10-10_morning', duty: 'Usher Back', memberUid: '', expectedMemberName: 'S. Leah' }] } });
  assert.deepEqual(result.saved.map(item => [item.memberName, item.previous]), [['', 'S. Leah']]);
  assert.equal(db.store.get('schedule/2026-10-10_morning').assignments['Usher Back'], '');
  assert.equal(records().length, 0);
});

test('another department\'s leader, other departments\' duties, and bad input are refused', async () => {
  const { handlers } = setup();
  const save = (auth, data) => handlers.saveDepartmentAssignments({ auth, data });
  await assert.rejects(save(outsider, { departmentId: 'Usher Sisters', changes: [{ serviceId: '2026-10-03_morning', duty: 'Usher Front', memberUid: 'uid-S. Leah' }] }), { code: 'permission-denied' });
  await assert.rejects(save(leader, { departmentId: 'Usher Sisters', changes: [{ serviceId: '2026-10-03_morning', duty: 'Presider', memberUid: 'uid-S. Leah' }] }), { code: 'failed-precondition' });
  await assert.rejects(save(leader, { departmentId: 'Usher Sisters', changes: [] }), { code: 'invalid-argument' });
  await assert.rejects(save(leader, { departmentId: 'Usher Sisters', changes: [{ serviceId: 'x', duty: 'Usher Door', memberUid: 'a', note: 'x' }] }), { code: 'invalid-argument' });
});
