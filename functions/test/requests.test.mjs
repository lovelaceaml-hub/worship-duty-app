/* A leader answering a change request or a flagged duty
   (resolveDutyAttention): an approval acts only while the member who asked
   still holds the duty; a request for a service that was moved, deleted or
   has started can still be declined; a withdrawn request is closed; a flagged
   member can be kept on their duty; names are compared in their current
   spelling and duty names in their stored one. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkflowHandlers } = require('../workflows.js');
const { memoryDb } = require('./memory-db.js');

const NOW = Date.parse('2026-10-01T17:00:00Z');
const SISTERS = ['Usher Door', 'Usher Front', 'Usher Back'];
const sister = name => ({
  uid: 'uid-' + name, memberUid: 'uid-' + name, departmentId: 'Usher Sisters', department: 'Usher Sisters', role: 'member',
  memberName: name, status: 'active', schedulable: true, eligibleDuties: SISTERS, availability: { recurring: {}, exceptions: {} }
});
const leader = { uid: 'uid-grace', token: { uid: 'uid-grace', roles: ['departmentLeader'], departments: ['Usher Sisters'], memberUid: 'uid-grace', memberName: 'S. Grace' } };
const outsider = { uid: 'uid-paola', token: { uid: 'uid-paola', roles: ['departmentLeader'], departments: ['Translation'], memberUid: 'uid-paola', memberName: 'S. Paola' } };
const LATER = 'schedule/2026-10-10_morning';
const PAST = 'schedule/2026-09-26_morning';

function setup(extra = {}) {
  const db = memoryDb(Object.assign({
    [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah', 'Usher Front': 'S. Ruth' } },
    [PAST]: { date: '2026-09-26', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah' } },
    'departments/Usher Sisters/members/uid-S. Leah': sister('S. Leah'),
    'departments/Usher Sisters/members/uid-S. Naomi': sister('S. Naomi'),
    'requests/r1': { svcId: '2026-10-10_morning', duty: 'Usher Door', name: 'S. Leah', department: 'Usher Sisters', status: 'pending', requesterUid: 'uid-S. Leah' }
  }, extra));
  const workflows = createWorkflowHandlers({ db, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });
  const resolve = (data, auth = leader) => workflows.resolveDutyAttention({ auth, data: Object.assign({ departmentId: 'Usher Sisters' }, data) });
  return { db, resolve };
}

const refused = (code, reason) => error => {
  assert.equal(error.code, code, error.message);
  assert.equal(error.details.reason, reason);
  return true;
};

test('approving a request whose member no longer holds the duty is refused; declining closes it', async () => {
  const { db, resolve } = setup();
  // A leader gives Usher Door to S. Naomi another way while the request waits.
  db.store.set(LATER, Object.assign(db.store.get(LATER), { assignments: { 'Usher Door': 'S. Naomi', 'Usher Front': 'S. Ruth' } }));
  const answer = extra => resolve(Object.assign({ serviceId: '2026-10-10_morning', duty: 'Usher Door', requestId: 'r1' }, extra));
  await assert.rejects(answer({ decision: 'approved' }), refused('failed-precondition', 'not-holder'));
  await assert.rejects(answer({ decision: 'approved', replacementMemberUid: 'uid-S. Leah' }), refused('failed-precondition', 'not-holder'));
  assert.equal(db.store.get(LATER).assignments['Usher Door'], 'S. Naomi', 'S. Naomi keeps the duty');
  const declined = await answer({ decision: 'declined' });
  assert.equal(declined.requestStatus, 'declined');
  assert.equal(db.store.get('requests/r1').status, 'declined');
  assert.equal(db.store.get(LATER).assignments['Usher Door'], 'S. Naomi');
});

test('a request whose service was moved or deleted can be declined, not approved', async () => {
  const { db, resolve } = setup({ 'requests/r2': { svcId: '2026-10-11_morning', duty: 'Usher Door', name: 'S. Leah', department: 'Usher Sisters', status: 'pending' } });
  const answer = decision => resolve({ serviceId: '2026-10-11_morning', duty: 'Usher Door', requestId: 'r2', decision });
  await assert.rejects(answer('approved'), refused('not-found', 'service-missing'));
  assert.equal((await answer('declined')).requestStatus, 'declined');
  assert.equal(db.store.get('requests/r2').status, 'declined');
});

test('a withdrawn or answered request is closed', async () => {
  const { resolve } = setup({ 'requests/r1': { svcId: '2026-10-10_morning', duty: 'Usher Door', name: 'S. Leah', department: 'Usher Sisters', status: 'withdrawn' } });
  for (const decision of ['approved', 'declined']) {
    await assert.rejects(resolve({ serviceId: '2026-10-10_morning', duty: 'Usher Door', requestId: 'r1', decision }), refused('failed-precondition', 'request-closed'));
  }
});

test('a service that has started keeps its duties; its request can still be declined', async () => {
  const { db, resolve } = setup({
    'requests/r3': { svcId: '2026-09-26_morning', duty: 'Usher Door', name: 'S. Leah', department: 'Usher Sisters', status: 'pending' },
    [PAST]: { date: '2026-09-26', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah' }, needsReplacement: { 'Usher Door': { memberName: 'S. Leah' } } }
  });
  const past = { serviceId: '2026-09-26_morning', duty: 'Usher Door' };
  await assert.rejects(resolve(Object.assign({ requestId: 'r3', decision: 'approved' }, past)), refused('failed-precondition', 'service-started'));
  await assert.rejects(resolve(Object.assign({ replacementMemberUid: 'uid-S. Naomi' }, past)), refused('failed-precondition', 'service-started'));
  await assert.rejects(resolve(Object.assign({ decision: 'keep' }, past)), refused('failed-precondition', 'service-started'));
  assert.equal((await resolve(Object.assign({ requestId: 'r3', decision: 'declined' }, past))).requestStatus, 'declined');
  assert.equal(db.store.get(PAST).assignments['Usher Door'], 'S. Leah');
});

test('a flagged member can be kept on their duty, only while they still hold it', async () => {
  const flagged = { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah' },
    needsReplacement: { 'Usher Door': { memberName: 'S. Leah', memberUid: 'uid-S. Leah', reason: 'unavailable' } } };
  const { db, resolve } = setup({ [LATER]: flagged });
  const keep = auth => resolve({ serviceId: '2026-10-10_morning', duty: 'Usher Door', decision: 'keep' }, auth);
  await assert.rejects(keep(outsider), refused('permission-denied', 'cross-department'));
  const kept = await keep();
  assert.deepEqual([kept.ok, kept.kept, kept.memberName], [true, true, 'S. Leah']);
  assert.deepEqual(db.store.get(LATER).needsReplacement, {});
  assert.equal(db.store.get(LATER).assignments['Usher Door'], 'S. Leah');

  db.store.set(LATER, Object.assign({}, flagged, { assignments: { 'Usher Door': 'S. Naomi' } }));
  await assert.rejects(keep(), refused('failed-precondition', 'not-holder'));
  await assert.rejects(resolve({ serviceId: '2026-10-10_morning', duty: 'Usher Door', requestId: 'r1', decision: 'keep' }),
    refused('invalid-argument', 'invalid-input'), 'keep is for a flagged duty, not a request');
});

test('names are compared in their current spelling and a duty in its stored one', async () => {
  const { db, resolve } = setup({
    [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Melisaa' } },
    'requests/r1': { svcId: '2026-10-10_morning', duty: 'Usher Door', name: 'S. Melissa', department: 'Usher Sisters', status: 'pending' }
  });
  const result = await resolve({ serviceId: '2026-10-10_morning', duty: 'usher door', requestId: 'r1', decision: 'approved', replacementMemberUid: 'uid-S. Naomi' });
  assert.equal(result.duty, 'Usher Door');
  assert.deepEqual(db.store.get(LATER).assignments, { 'Usher Door': 'S. Naomi' }, 'no second key in another spelling');
  await assert.rejects(resolve({ serviceId: '2026-10-10_morning', duty: 'Usher Gate' }), refused('invalid-argument', 'invalid-input'));
});
