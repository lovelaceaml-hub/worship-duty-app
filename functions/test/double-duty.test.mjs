/* One duty per person per service, except a prayer with an usher duty, on
   every path a duty is saved through: the month planner's batch save, a
   single assignment, and a leader answering a change request or a flagged
   duty (resolveDutyAttention). Lobby Security is not an usher duty here. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createDepartmentHandlers } = require('../department-handlers.js');
const { createWorkflowHandlers } = require('../workflows.js');
const { memoryDb } = require('./memory-db.js');

const BROTHERS = ['Usher #1', 'Usher #2', 'Lobby Security'];
const brother = (name, extra = {}) => ({
  uid: 'uid-' + name, memberUid: 'uid-' + name, departmentId: 'Usher Brothers', department: 'Usher Brothers',
  role: 'member', memberName: name, status: 'active', schedulable: true, eligibleDuties: BROTHERS,
  availability: { recurring: {}, exceptions: {} }, ...extra
});
const leader = { uid: 'uid-leader', token: { uid: 'uid-leader', roles: ['departmentLeader'], departments: ['Usher Brothers'], memberUid: 'uid-leader', memberName: 'D. Chris' } };
const SERVICE = 'schedule/2026-10-03_morning';

/* B. Adam prays, B. Eli ushers, E. Joseph presides; all three are Usher Brothers. */
function setup(assignments = { Sermon: 'B. Adam', 'Usher #1': 'B. Eli', Presider: 'E. Joseph' }, extra = {}) {
  const db = memoryDb({
    [SERVICE]: { date: '2026-10-03', service: 'Morning', time: '10:00', worship: 'Sabbath Day', assignments, ...extra },
    'departments/Usher Brothers/members/uid-B. Adam': brother('B. Adam'),
    'departments/Usher Brothers/members/uid-B. Eli': brother('B. Eli'),
    'departments/Usher Brothers/members/uid-E. Joseph': brother('E. Joseph')
  });
  return {
    db,
    handlers: createDepartmentHandlers({ db, now: () => 1000 }),
    workflows: createWorkflowHandlers({ db, now: () => 2000, logger: { info() {}, warn() {}, error() {} } }),
    assignments: () => db.store.get(SERVICE).assignments
  };
}

test('the planner saves an usher duty for someone praying there, and nothing else beside a duty', async () => {
  const { handlers, assignments } = setup();
  const result = await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Brothers', changes: [
    { serviceId: '2026-10-03_morning', duty: 'Lobby Security', memberUid: 'uid-B. Adam' }, // a prayer with Lobby Security: no
    { serviceId: '2026-10-03_morning', duty: 'Usher #2', memberUid: 'uid-B. Adam' },       // Opening Prayer with an usher duty: yes
    { serviceId: '2026-10-03_morning', duty: 'Lobby Security', memberUid: 'uid-E. Joseph' } // the Presider: no
  ] } });
  assert.deepEqual(result.saved.map(item => [item.duty, item.memberName]), [['Usher #2', 'B. Adam']]);
  assert.deepEqual(result.skipped.map(item => [item.duty, item.reason]), [['Lobby Security', 'already-serving'], ['Lobby Security', 'already-serving']]);
  assert.deepEqual(assignments(), { Sermon: 'B. Adam', 'Usher #1': 'B. Eli', Presider: 'E. Joseph', 'Usher #2': 'B. Adam' });

  // In one batch, a second usher duty beside the pair is refused, as is a second for an usher.
  const more = await handlers.saveDepartmentAssignments({ auth: leader, data: { departmentId: 'Usher Brothers', changes: [
    { serviceId: '2026-10-03_morning', duty: 'Lobby Security', memberUid: 'uid-B. Eli' }
  ] } });
  assert.deepEqual(more.skipped.map(item => item.reason), ['already-serving']);
});

test('a single assignment follows the same rule', async () => {
  const { handlers, assignments } = setup();
  const assign = (memberUid, duty) => handlers.assignDepartmentDuty({ auth: leader, data: {
    departmentId: 'Usher Brothers', memberUid, duty, serviceId: '2026-10-03_morning', serviceDate: '2026-10-03', serviceTime: 'morning'
  } });
  await assign('uid-B. Adam', 'Usher #2');
  assert.equal(assignments()['Usher #2'], 'B. Adam');
  await assert.rejects(assign('uid-B. Eli', 'Lobby Security'), error => error.code === 'failed-precondition' && /already serving/.test(error.message));
  await assert.rejects(assign('uid-E. Joseph', 'Lobby Security'), error => error.code === 'failed-precondition');
});

test('a leader hands a duty to someone praying there without a double-duty question', async () => {
  const { db, workflows, assignments } = setup({ Sermon: 'B. Adam', 'Usher #1': 'B. Eli' }, {
    needsReplacement: { 'Usher #1': { memberName: 'B. Eli' } }
  });
  const result = await workflows.resolveDutyAttention({ auth: leader, data: {
    departmentId: 'Usher Brothers', serviceId: '2026-10-03_morning', duty: 'Usher #1', replacementMemberUid: 'uid-B. Adam'
  } });
  assert.equal(result.memberName, 'B. Adam');
  assert.deepEqual(assignments(), { Sermon: 'B. Adam', 'Usher #1': 'B. Adam' });
  const service = db.store.get(SERVICE);
  assert.deepEqual(service.needsReplacement, {}, 'the flag is cleared');
  assert.equal(service.conflictOk, undefined, 'nothing to mark OK');
});

test('a real double duty needs the leader to say so, and the mark lists exactly the duties held', async () => {
  const { db, workflows, assignments } = setup({ 'Usher #2': 'B. Adam', 'Usher #1': 'B. Eli' }, {
    conflictOk: { 'B. Adam': ['Presider', 'Usher #2'] } // an old mark for duties he no longer holds
  });
  const answer = acknowledgeConflict => workflows.resolveDutyAttention({ auth: leader, data: Object.assign({
    departmentId: 'Usher Brothers', serviceId: '2026-10-03_morning', duty: 'Usher #1', replacementMemberUid: 'uid-B. Adam'
  }, acknowledgeConflict ? { acknowledgeConflict } : {}) });
  await assert.rejects(answer(false), error => error.code === 'failed-precondition' &&
    error.details && error.details.reason === 'conflict' && error.details.duties.join() === 'Usher #2');
  assert.equal(assignments()['Usher #1'], 'B. Eli', 'nothing changed');
  await answer(true);
  assert.equal(assignments()['Usher #1'], 'B. Adam');
  assert.deepEqual(db.store.get(SERVICE).conflictOk, { 'B. Adam': ['Usher #2', 'Usher #1'] });
});

test('a change request is approved with a replacement, approved open, or declined', async () => {
  const request = (id, duty, name) => ({ id, svcId: '2026-10-03_morning', duty, name, department: 'Usher Brothers', status: 'pending' });
  const { db, workflows, assignments } = setup({ Sermon: 'B. Adam', 'Usher #1': 'B. Eli', 'Usher #2': 'E. Joseph', 'Lobby Security': 'B. Eli' });
  db.store.set('requests/r1', request('r1', 'Usher #1', 'B. Eli'));
  db.store.set('requests/r2', request('r2', 'Usher #2', 'E. Joseph'));
  db.store.set('requests/r3', request('r3', 'Lobby Security', 'B. Eli'));
  const answer = (requestId, duty, decision, replacementMemberUid) => workflows.resolveDutyAttention({ auth: leader, data: Object.assign({
    departmentId: 'Usher Brothers', serviceId: '2026-10-03_morning', duty, requestId, decision
  }, replacementMemberUid ? { replacementMemberUid } : {}) });

  const approved = await answer('r1', 'Usher #1', 'approved', 'uid-B. Adam');
  assert.deepEqual([approved.requestStatus, assignments()['Usher #1']], ['approved', 'B. Adam']);
  const open = await answer('r2', 'Usher #2', 'approved');
  assert.deepEqual([open.requestStatus, assignments()['Usher #2']], ['approved', '']);
  const declined = await answer('r3', 'Lobby Security', 'declined');
  assert.deepEqual([declined.requestStatus, assignments()['Lobby Security']], ['declined', 'B. Eli']);
  assert.deepEqual(['r1', 'r2', 'r3'].map(id => db.store.get('requests/' + id).status), ['approved', 'approved', 'declined']);
  await assert.rejects(answer('r1', 'Usher #1', 'approved'), error => error.code === 'failed-precondition' && /no longer pending/.test(error.message));
  db.store.set('requests/r4', request('r4', 'Usher #2', 'E. Joseph'));
  await assert.rejects(answer('r4', 'Usher #1', 'approved'), error => error.code === 'failed-precondition' && /does not match/.test(error.message));
});
