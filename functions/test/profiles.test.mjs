/* Department profiles: a member whose name was fixed can be added under
   their new name; a new profile's duties go in their stored spelling; the
   nightly job's attribution survives a leader's change to another field. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createDepartmentHandlers } = require('../department-handlers.js');
const { memoryDb } = require('./memory-db.js');

const grace = { uid: 'uid-grace', token: { uid: 'uid-grace', roles: ['departmentLeader'], departments: ['Usher Sisters'], memberUid: 'uid-grace', memberName: 'S. Grace' } };
const refused = (code, reason) => error => {
  assert.equal(error.code, code, error.message);
  assert.equal(error.details.reason, reason);
  return true;
};

test('after a name fix the member is added under the new name, not the old account', async () => {
  const db = memoryDb({
    'app/members': { list: ['S. Bridgette', 'S. Leah'] },
    'app/nameMap': { map: { Bridgette: 'S. Bridgette' } },
    'accounts/Bridgette': { memberName: 'Bridgette', active: false, renamedTo: 'S. Bridgette' },
    'accounts/S. Bridgette': { memberName: 'S. Bridgette', authUid: 'member:Bridgette', active: true, renamedFrom: 'Bridgette' }
  });
  const handlers = createDepartmentHandlers({ db, now: () => 5 });
  const result = await handlers.createDepartmentProfile({ auth: grace, data: {
    departmentId: 'Usher Sisters', memberUid: 'member:Bridgette', memberName: 'S. Bridgette', eligibleDuties: ['Usher Door']
  } });
  assert.equal(result.profile.memberName, 'S. Bridgette');
  assert.equal(db.store.get('departments/Usher Sisters/members/member:Bridgette').memberName, 'S. Bridgette');
  await assert.rejects(handlers.createDepartmentProfile({ auth: grace, data: {
    departmentId: 'Usher Sisters', memberUid: 'member:Bridgette', memberName: 'S. Bridgette'
  } }), refused('already-exists', 'profile-exists'));
});

test('a new profile\'s duties go in their stored spelling, once each', async () => {
  const db = memoryDb({ 'app/members': { list: ['S. Leah'] } });
  const handlers = createDepartmentHandlers({ db, now: () => 5 });
  const add = eligibleDuties => handlers.createDepartmentProfile({ auth: grace, data: { departmentId: 'Usher Sisters', memberUid: 'member:S. Leah', eligibleDuties } });
  await assert.rejects(add(['Usher Door', 'Usher Gate']), refused('invalid-argument', 'invalid-input'));
  const result = await add(['usher door', ' Usher Door', 'Usher Front ']);
  assert.deepEqual(result.profile.eligibleDuties, ['Usher Door', 'Usher Front']);
  assert.equal(result.profile.revision, 1);
});

test('the nightly job\'s attribution stays when a leader changes another field', async () => {
  const fromSchedule = { source: 'schedule', authority: 'system', by: 'system:serving-members', at: 3 };
  const db = memoryDb({
    'departments/Usher Sisters/members/member:S. Leah': {
      uid: 'member:S. Leah', memberUid: 'member:S. Leah', departmentId: 'Usher Sisters', department: 'Usher Sisters', role: 'member',
      memberName: 'S. Leah', status: 'active', schedulable: true, eligibleDuties: ['Usher Door'], availability: { recurring: {}, exceptions: {} },
      provenance: { source: 'schedule' },
      fieldAttribution: { status: fromSchedule, eligibleDuties: fromSchedule, schedulable: fromSchedule, availability: fromSchedule }
    }
  });
  const handlers = createDepartmentHandlers({ db, now: () => 9 });
  await handlers.updateDepartmentProfile({ auth: grace, data: { departmentId: 'Usher Sisters', memberUid: 'member:S. Leah', patch: { status: 'inactive' } } });
  const stored = db.store.get('departments/Usher Sisters/members/member:S. Leah');
  assert.deepEqual(stored.fieldAttribution.eligibleDuties, fromSchedule);
  assert.deepEqual([stored.fieldAttribution.status.source, stored.fieldAttribution.status.authority], ['manual', 'leader']);
});
