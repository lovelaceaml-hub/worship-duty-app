'use strict';

/* Fixing a member's name changes it everywhere, keeps their sign-in uid and
   PIN, and marks the services so no "New duty" alerts go out. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { renameMember } = require('../rename-member.js');

function fakeDb(docs) {
  const store = new Map(Object.entries(docs));
  const docRef = path => ({
    id: path.split('/').pop(),
    ref: null,
    collection: name => collectionRef(path + '/' + name),
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (value, options) => { store.set(path, options && options.merge ? Object.assign({}, store.get(path), value) : value); },
    update: async value => { store.set(path, Object.assign({}, store.get(path), value)); },
    delete: async () => { store.delete(path); }
  });
  const collectionRef = path => ({
    doc: id => docRef(path + '/' + id),
    get: async () => ({
      docs: Array.from(store.keys()).filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'))
        .map(key => { const ref = docRef(key); return { id: ref.id, ref, data: () => store.get(key) }; })
    })
  });
  return { store, collection: name => collectionRef(name) };
}

const newAccount = async name => ({ id: name, memberName: name, role: 'member', pinSetupRequired: true, mustChangePin: true, active: true });

test('a name is fixed everywhere and the member keeps their sign-in', async () => {
  const db = fakeDb({
    'app/members': { list: ['Bridgette', 'S. Leah'] },
    'app/nameMap': { map: { 'Bridgete': 'Bridgette' } },
    'app/departments': { map: { 'Usher Sisters': ['Bridgette', 'S. Leah'] } },
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['Bridgette'] }, admin: ['B. Adam'] },
    'accounts/Bridgette': { memberName: 'Bridgette', pinHash: 'her-own-pin', active: true },
    'departments/Usher Sisters/members/member:Bridgette': { memberUid: 'member:Bridgette', memberName: 'Bridgette', status: 'active' },
    'schedule/2026-10-03_morning': { date: '2026-10-03', assignments: { 'Usher Door': 'Bridgette', 'Usher Front': 'S. Leah' }, conflictOk: { Bridgette: ['Usher Door'] } },
    'schedule/2026-10-03_evening': { date: '2026-10-03', assignments: { 'Usher Door': 'S. Leah' } },
    'setlists/2026-10-03_morning': { presider: 'Bridgette' },
    'requests/r1': { name: 'Bridgette', duty: 'Usher Door' }
  });
  const result = await renameMember(db, { from: 'Bridgette', to: 'S. Bridgette', newAccount, now: 5 });
  assert.deepEqual([result.services, result.songLists, result.requests, result.profiles], [1, 1, 1, 1]);
  assert.deepEqual(db.store.get('app/members').list, ['S. Bridgette', 'S. Leah']);
  assert.deepEqual(db.store.get('app/nameMap').map, { 'Bridgete': 'S. Bridgette', Bridgette: 'S. Bridgette' });
  assert.deepEqual(db.store.get('app/departments').map['Usher Sisters'], ['S. Bridgette', 'S. Leah']);
  assert.deepEqual(db.store.get('app/leaderConfig').departmentLeaders['Usher Sisters'], ['S. Bridgette']);
  const service = db.store.get('schedule/2026-10-03_morning');
  assert.equal(service.assignments['Usher Door'], 'S. Bridgette');
  assert.deepEqual(service.conflictOk, { 'S. Bridgette': ['Usher Door'] });
  assert.equal(service.planBatch, 'rename-5');
  assert.equal(db.store.get('schedule/2026-10-03_evening').planBatch, undefined);
  assert.equal(db.store.get('setlists/2026-10-03_morning').presider, 'S. Bridgette');
  assert.equal(db.store.get('requests/r1').name, 'S. Bridgette');
  const account = db.store.get('accounts/S. Bridgette');
  assert.equal(account.authUid, 'member:Bridgette');
  assert.equal(account.pinHash, 'her-own-pin');
  assert.equal(account.pinSetupRequired, false);
  assert.equal(account.mustChangePin, false);
  assert.equal(db.store.get('accounts/Bridgette').active, false);
  assert.equal(db.store.get('departments/Usher Sisters/members/member:Bridgette').memberName, 'S. Bridgette');
});

test('a name that is not on the list is refused', async () => {
  const db = fakeDb({ 'app/members': { list: ['Bridgette', 'S. Leah'] } });
  await assert.rejects(renameMember(db, { from: 'Nobody', to: 'S. Nobody', newAccount }), error => error.code === 'not-found');
});

test('when the right name is already a member, the two become one', async () => {
  const db = fakeDb({
    'app/members': { list: ['Bridgette', 'S. Bridgette', 'S. Leah'] },
    'accounts/S. Bridgette': { memberName: 'S. Bridgette', authUid: 'sb-uid', pinHash: 'her-pin' },
    'accounts/Bridgette': { memberName: 'Bridgette', pinHash: 'other-pin' },
    'departments/Usher Sisters/members/sb-uid': { memberUid: 'sb-uid', memberName: 'S. Bridgette', status: 'inactive', schedulable: true, eligibleDuties: ['Usher Door'] },
    'departments/Usher Sisters/members/member:Bridgette': { memberUid: 'member:Bridgette', memberName: 'Bridgette', status: 'active', schedulable: true, eligibleDuties: ['Usher Back'] },
    'departments/Lobby/members/member:Bridgette': { memberUid: 'member:Bridgette', memberName: 'Bridgette', status: 'active', schedulable: true, eligibleDuties: ['Lobby Desk #1'] },
    'schedule/2026-10-03_morning': { date: '2026-10-03', assignments: { 'Usher Back': 'Bridgette' } }
  });
  const result = await renameMember(db, { from: 'Bridgette', to: 'S. Bridgette', newAccount, now: 7 });
  assert.equal(result.merged, true);
  assert.deepEqual(db.store.get('app/members').list, ['S. Bridgette', 'S. Leah']);
  assert.equal(db.store.get('accounts/S. Bridgette').pinHash, 'her-pin', 'her own account stays');
  assert.equal(db.store.get('accounts/Bridgette').active, false);
  const usher = db.store.get('departments/Usher Sisters/members/sb-uid');
  assert.deepEqual([usher.status, usher.eligibleDuties], ['active', ['Usher Door', 'Usher Back']]);
  assert.equal(db.store.has('departments/Usher Sisters/members/member:Bridgette'), false);
  assert.equal(db.store.get('departments/Lobby/members/sb-uid').memberName, 'S. Bridgette');
  assert.equal(db.store.has('departments/Lobby/members/member:Bridgette'), false);
  assert.equal(db.store.get('schedule/2026-10-03_morning').assignments['Usher Back'], 'S. Bridgette');
});

test('a fix that stopped part way finishes when run again, and the member list changes last', async () => {
  const db = fakeDb({
    'app/members': { list: ['Bridgette', 'S. Leah'] },
    'accounts/Bridgette': { memberName: 'Bridgette', pinHash: 'her-own-pin', active: true, roleVersion: 2 },
    'schedule/2026-10-03_morning': { date: '2026-10-03', assignments: { 'Usher Door': 'Bridgette' } }
  });
  const schedule = db.collection('schedule');
  let failOnce = true;
  const real = db.collection;
  db.collection = name => (name === 'schedule' && failOnce
    ? Object.assign({}, schedule, { get: async () => { failOnce = false; throw new Error('deadline exceeded'); } })
    : real(name));
  await assert.rejects(renameMember(db, { from: 'Bridgette', to: 'S. Bridgette', newAccount, now: 5 }), /deadline/);
  assert.deepEqual(db.store.get('app/members').list, ['Bridgette', 'S. Leah'], 'the list is untouched until the end');
  const partiallyRenamed = db.store.get('accounts/S. Bridgette');
  assert.equal(partiallyRenamed.active, true);
  Object.assign(partiallyRenamed, {
    trustedDevices: null, mustChangePin: true, pinSetupRequired: true, pinHash: 'recovery-hash'
  });
  await renameMember(db, { from: 'Bridgette', to: 'S. Bridgette', newAccount, now: 6 });
  assert.deepEqual(db.store.get('app/members').list, ['S. Bridgette', 'S. Leah']);
  assert.equal(db.store.get('schedule/2026-10-03_morning').assignments['Usher Door'], 'S. Bridgette');
  const account = db.store.get('accounts/S. Bridgette');
  assert.deepEqual([account.active, account.renamedTo, account.pinHash, account.authUid], [true, undefined, 'recovery-hash', 'member:Bridgette']);
  assert.equal(account.trustedDevices, null);
  assert.equal(account.pinSetupRequired, true);
  assert.equal(db.store.get('accounts/Bridgette').roleVersion, 3, 'the old name\'s sessions end once');
});

test('a fix an older version left with the list already changed can be finished', async () => {
  const db = fakeDb({
    'app/members': { list: ['S. Bridgette', 'S. Leah'] },
    'app/nameMap': { map: { Bridgette: 'S. Bridgette' } },
    'schedule/2026-10-03_morning': { date: '2026-10-03', assignments: { 'Usher Door': 'Bridgette' } }
  });
  await renameMember(db, { from: 'Bridgette', to: 'S. Bridgette', newAccount, now: 7 });
  assert.equal(db.store.get('schedule/2026-10-03_morning').assignments['Usher Door'], 'S. Bridgette');
  await assert.rejects(renameMember(db, { from: 'Nobody', to: 'S. Bridgette', newAccount }), error => error.code === 'not-found');
});

test('a merge gives the kept account its roles and the old uid\'s requests and flags; sessions end; devices follow', async () => {
  const revoked = [];
  const auth = { async revokeRefreshTokens(uid) { revoked.push(uid); } };
  const leaderAccount = async name => ({ id: name, memberName: name, role: 'departmentLeader', roles: ['departmentLeader'], departments: ['Usher Sisters'], globalLeaderManager: false, pinHash: 'default-hash', active: true });
  const db = fakeDb({
    'app/members': { list: ['Bridgette', 'S. Bridgette'] },
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['Bridgette'] } },
    'accounts/S. Bridgette': { memberName: 'S. Bridgette', authUid: 'sb-uid', pinHash: 'her-pin', roles: [], departments: [], role: 'member', roleVersion: 4 },
    'accounts/Bridgette': { memberName: 'Bridgette', pinHash: 'other-pin', roleVersion: 1 },
    'schedule/2026-10-03_morning': { date: '2026-10-03', assignments: { 'Usher Back': 'Bridgette' },
      needsReplacement: { 'Usher Back': { memberName: 'Bridgette', memberUid: 'member:Bridgette', reason: 'unavailable' } } },
    'requests/r1': { name: 'Bridgette', requesterUid: 'member:Bridgette', duty: 'Usher Back' },
    'tokens/phone': { name: 'Bridgette' }
  });
  const result = await renameMember(db, { from: 'Bridgette', to: 'S. Bridgette', newAccount: leaderAccount, auth, now: 9 });
  assert.equal(result.devices, 1);
  const kept = db.store.get('accounts/S. Bridgette');
  assert.deepEqual([kept.roles, kept.departments, kept.roleVersion, kept.pinHash], [['departmentLeader'], ['Usher Sisters'], 5, 'her-pin']);
  assert.deepEqual(revoked.sort(), ['member:Bridgette', 'sb-uid']);
  assert.equal(db.store.get('requests/r1').requesterUid, 'sb-uid');
  assert.deepEqual(db.store.get('schedule/2026-10-03_morning').needsReplacement['Usher Back'],
    { memberName: 'S. Bridgette', memberUid: 'sb-uid', reason: 'unavailable' });
  assert.equal(db.store.get('tokens/phone').name, 'S. Bridgette');
});
