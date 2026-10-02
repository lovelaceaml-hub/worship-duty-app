/* Adding members by search and invite link (membership.js): the search
   offers members in use, including never-signed-in names from the member
   list, and reads the accounts once for a run of searches; an invite link is
   used once, never by someone already in the department; departments must
   be real ones. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createMembershipHandlers } = require('../membership.js');
const { memoryDb } = require('./memory-db.js');

const account = (name, extra = {}) => Object.assign({ memberName: name, active: true, roleVersion: 1, mustChangePin: false }, extra);
function signedIn(name, extra = {}) {
  const data = account(name, extra);
  return { uid: 'member:' + name, token: Object.assign({ memberId: name, memberName: name, roleVersion: 1 }, extra.token || {}),
    currentAccount: Object.assign({ id: name }, data) };
}
const grace = signedIn('S. Grace', { token: { roles: ['departmentLeader'], departments: ['Usher Sisters'] } });
const refused = (code, reason) => error => {
  assert.equal(error.code, code, error.message);
  assert.equal(error.details.reason, reason);
  return true;
};

function setup(extra = {}) {
  const db = memoryDb(Object.assign({
    'app/members': { list: ['S. Grace', 'S. Leah', 'S. Leanne', 'Bridgette'] },
    'accounts/S. Grace': account('S. Grace'),
    'accounts/S. Leah': account('S. Leah'),
    'accounts/S. Lea': account('S. Lea', { active: false, renamedTo: 'S. Leah' }),
    'accounts/S. Naomi': account('S. Naomi')
  }, extra));
  let reads = 0;
  const counted = Object.assign({}, db, {
    collection: name => {
      const collection = db.collection(name);
      if (name !== 'accounts') return collection;
      const wrapped = Object.assign({}, collection, { get: () => { reads += 1; return collection.get(); } });
      wrapped.select = () => wrapped;
      return wrapped;
    }
  });
  let clock = 1000;
  const handlers = createMembershipHandlers({ db: counted, now: () => clock, randomBytes: size => Buffer.alloc(size, 7) });
  return { db, handlers, reads: () => reads, tick: ms => { clock += ms; } };
}

test('the search offers members in use and never-signed-in names, and reads the accounts once for a run of searches', async () => {
  const { handlers, reads, tick } = setup();
  const search = query => handlers.searchDepartmentCandidates({ auth: grace, data: { departmentId: 'Usher Sisters', query } });
  const found = await search('Lea');
  assert.deepEqual(found.members.map(row => [row.memberName, row.memberUid]),
    [['S. Leah', 'member:S. Leah'], ['S. Leanne', 'member:S. Leanne']], 'not the renamed S. Lea');
  await search('Bridg');
  assert.equal(reads(), 1);
  tick(61 * 1000);
  await search('Naomi');
  assert.equal(reads(), 2, 'read again after a minute');
  await assert.rejects(handlers.searchDepartmentCandidates({ auth: grace, data: { departmentId: 'Choir', query: 'Lea' } }), refused('invalid-argument', 'invalid-input'));
});

test('someone already in the department does not use up an invite link', async () => {
  const { db, handlers } = setup({
    'departments/Usher Sisters/members/member:S. Leah': { memberUid: 'member:S. Leah', departmentId: 'Usher Sisters', memberName: 'S. Leah', status: 'inactive' }
  });
  const { token } = await handlers.createDepartmentInvitation({ auth: grace, data: { departmentId: 'Usher Sisters' } });
  const leah = signedIn('S. Leah');
  const already = await handlers.acceptDepartmentInvitation({ auth: leah, data: { token } });
  assert.deepEqual([already.alreadyMember, already.inactive], [true, true]);
  const naomi = signedIn('S. Naomi');
  const joined = await handlers.acceptDepartmentInvitation({ auth: naomi, data: { token } });
  assert.equal(joined.alreadyMember, false);
  assert.equal(db.store.get('departments/Usher Sisters/members/member:S. Naomi').revision, 1);
  const leanne = signedIn('S. Leanne');
  db.store.set('accounts/S. Leanne', account('S. Leanne'));
  await assert.rejects(handlers.acceptDepartmentInvitation({ auth: leanne, data: { token } }), refused('already-exists', 'invite-used'));
  await assert.rejects(handlers.createDepartmentInvitation({ auth: grace, data: { departmentId: 'Lobby' } }), refused('permission-denied', 'cross-department'));
});
