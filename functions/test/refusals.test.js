'use strict';

/* Every refusal a callable sends the app carries details.reason, a short
   stable code the app turns into its own words, and a plain message. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadIndex } = require('./load-index.js');
const { MESSAGES, detailsFor } = require('../refusals.js');

const leader = { uid: 'member:S. Grace', token: { memberId: 'S. Grace', memberName: 'S. Grace', roleVersion: 1 } };
const docs = () => ({
  'accounts/S. Grace': { memberName: 'S. Grace', active: true, roleVersion: 1, roles: ['departmentLeader'], departments: ['Usher Sisters'], mustChangePin: false },
  'schedule/2030-10-05_morning': { date: '2030-10-05', service: 'Morning', time: '10:00', assignments: {} }
});

async function reasonOf(run) {
  try {
    await run();
  } catch (error) {
    assert.equal(typeof error.message, 'string');
    assert.doesNotMatch(error.message, /Department authorization denied/);
    return [error.code, error.details && error.details.reason];
  }
  throw new Error('expected a refusal');
}

test('department callables refuse with a reason the app can map', async () => {
  const { functions } = loadIndex(docs());
  const call = (name, data, auth = leader) => reasonOf(() => functions[name].run({ auth, data }));
  assert.deepEqual(await call('listDepartmentRoster', { departmentId: 'Usher Sisters' }, null), ['unauthenticated', 'sign-in-required']);
  assert.deepEqual(await call('listDepartmentRoster', { departmentId: 'Lobby' }), ['permission-denied', 'cross-department']);
  assert.deepEqual(await call('assignDepartmentDuty', { departmentId: 'Usher Sisters', memberUid: 'u', duty: 'Usher Door', serviceDate: '2030-10-05', serviceTime: 'morning' }),
    ['invalid-argument', 'invalid-input']);
  assert.deepEqual(await call('saveDepartmentAssignments', { departmentId: 'Usher Sisters', changes: [{ serviceId: '2030-10-05_morning', duty: 'Presider', memberUid: 'u' }] }),
    ['failed-precondition', 'duty-department-mismatch']);
  assert.deepEqual(await call('listDepartmentRoster', { departmentId: 'Usher Sisters' }, { uid: leader.uid, token: Object.assign({}, leader.token, { roleVersion: 0 }) }),
    ['permission-denied', 'session-ended']);
});

test('an error without a reason gets the one for its code, and every listed reason has words', () => {
  assert.deepEqual(detailsFor(new Error('x'), 'invalid-argument'), { reason: 'invalid-input' });
  assert.deepEqual(detailsFor(Object.assign(new Error('x'), { details: { reason: 'not-holder', memberName: 'S. Leah' } }), 'failed-precondition'),
    { reason: 'not-holder', memberName: 'S. Leah' });
  assert.ok(Object.values(MESSAGES).every(message => /^[A-Z].*\.$/.test(message) && !/[–—]/.test(message)));
});
