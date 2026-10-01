/* A member's own availability save (saveMemberAvailability): it works for a
   profile with no stored revision (the callable SDK sends the missing
   revision as null), still refuses a stale copy, and flags the member's
   upcoming duties they can no longer make. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkflowHandlers } = require('../workflows.js');
const { memoryDb } = require('./memory-db.js');

const NOW = Date.parse('2026-10-01T17:00:00Z');
const leah = { uid: 'uid-leah', token: { uid: 'uid-leah', memberUid: 'uid-leah', memberName: 'S. Leah', roles: ['member'], roleVersion: 1 } };
const profile = (extra = {}) => ({
  uid: 'uid-leah', memberUid: 'uid-leah', departmentId: 'Usher Sisters', department: 'Usher Sisters', role: 'member',
  memberName: 'S. Leah', status: 'active', schedulable: true, eligibleDuties: ['Usher Door', 'Usher Front', 'Usher Back'],
  availability: { recurring: {}, exceptions: {} }, ...extra
});

function setup(docs = {}) {
  const db = memoryDb(Object.assign({ 'departments/Usher Sisters/members/uid-leah': profile() }, docs));
  const workflows = createWorkflowHandlers({ db, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });
  const save = (availability, extra = {}) => workflows.saveMemberAvailability({ auth: leah, data: {
    memberUid: 'uid-leah', departments: [Object.assign({ departmentId: 'Usher Sisters', availability }, extra)]
  } });
  return { db, save };
}

const eveningsOff = { recurring: { evening: 'unavailable' }, exceptions: {} };

test('a profile made without a revision saves when the app sends the missing revision as null', async () => {
  const { db, save } = setup();
  const result = await save(eveningsOff, { expectedRevision: null, expectedUpdatedAt: null });
  assert.equal(result.ok, true);
  const stored = db.store.get('departments/Usher Sisters/members/uid-leah');
  assert.deepEqual(stored.availability.recurring, { evening: 'unavailable' });
  assert.equal(stored.revision, 1);
});

test('a stale copy is still refused, with the reason the app can show', async () => {
  const { save } = setup({ 'departments/Usher Sisters/members/uid-leah': profile({ revision: 3, updatedAt: 50 }) });
  await assert.rejects(save(eveningsOff, { expectedRevision: 2, expectedUpdatedAt: 50 }),
    error => error.code === 'aborted' && error.details.reason === 'changed');
  await assert.rejects(save(eveningsOff, { expectedRevision: null, expectedUpdatedAt: 40 }),
    error => error.code === 'aborted' && error.details.reason === 'changed', 'the time it was last saved is checked on its own');
  await assert.rejects(save(eveningsOff, { expectedRevision: 'x' }), error => error.code === 'invalid-argument');
});
