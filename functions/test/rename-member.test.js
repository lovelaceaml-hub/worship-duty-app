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
    update: async value => { store.set(path, Object.assign({}, store.get(path), value)); }
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

const newAccount = async name => ({ id: name, memberName: name, role: 'member', pinHash: 'default-hash', active: true });

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
  assert.equal(db.store.get('accounts/Bridgette').active, false);
  assert.equal(db.store.get('departments/Usher Sisters/members/member:Bridgette').memberName, 'S. Bridgette');
});

test('a name that is not on the list, or one already taken, is refused', async () => {
  const db = fakeDb({ 'app/members': { list: ['Bridgette', 'S. Leah'] } });
  await assert.rejects(renameMember(db, { from: 'Nobody', to: 'S. Nobody', newAccount }), error => error.code === 'not-found');
  await assert.rejects(renameMember(db, { from: 'Bridgette', to: 'S. Leah', newAccount }), error => error.code === 'already-exists');
});
