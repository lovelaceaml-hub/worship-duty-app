'use strict';

/* Signing in, PINs and roles, through index.js on the in-memory Firestore:
   a removed leader or song editor stays removed and never leads the
   departments they only belong to; the lockout counts every attempt; a reset
   lifts the lockout, ends the member's sessions and is recorded; only an
   administrator resets a privileged member's PIN; the shared starting PINs
   cannot be chosen. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { hashPin, isRetiredPin } = require('../member-auth.js');
const { loadIndex } = require('./load-index.js');

const PINS = {};
const pinHash = async pin => (PINS[pin] = PINS[pin] || await hashPin(pin));

/* M. Chloe leads Usher Sisters in the built-in config and also serves in
   Lobby. B. Anthony is the administrator, E. Simon a leader manager. */
async function church(extra = {}) {
  return Object.assign({
    'app/members': { list: ['B. Anthony', 'E. Simon', 'M. Chloe', 'S. Leah', 'D. Danielle', 'D. Chris'] },
    'app/departments': { map: { Lobby: ['M. Chloe', 'S. Leah'], 'Usher Sisters': ['M. Chloe', 'S. Leah'] } },
    'accounts/B. Anthony': {
      id: 'B. Anthony', memberId: 'B. Anthony', name: 'B. Anthony', memberName: 'B. Anthony', active: true, roleVersion: 1,
      roles: ['admin', 'globalLeaderManager', 'songEditor'], role: 'admin', departments: [], mustChangePin: false, pinHash: await pinHash('4321')
    },
    'accounts/E. Simon': {
      id: 'E. Simon', memberId: 'E. Simon', name: 'E. Simon', memberName: 'E. Simon', active: true, roleVersion: 1,
      roles: ['globalLeaderManager', 'departmentLeader'], role: 'globalLeaderManager', departments: ['Worship'], mustChangePin: false, pinHash: await pinHash('4321')
    }
  }, extra);
}

const as = (name, roleVersion = 1, extra = {}) => ({ uid: 'member:' + name, token: Object.assign({ memberId: name, memberName: name, roleVersion }, extra) });
const signIn = (functions, name, pin) => functions.verifyMemberPin.run({ data: { selectedMemberId: name, selectedMemberName: name, pin } });
const claimsOf = result => JSON.parse(result.token).claims;
const rejectsWith = (promise, code, reason) => assert.rejects(promise, error => {
  assert.equal(error.code, code, error.message);
  if (reason) assert.equal(error.details && error.details.reason, reason);
  return true;
});

test('a removed leader stays removed after signing in and changing their PIN, and leads nothing they only belong to', async () => {
  const docs = await church({ 'accounts/M. Chloe': { memberName: 'M. Chloe', active: true, roleVersion: 1, pinHash: await pinHash('741983') } });
  const { functions } = loadIndex(docs);
  await functions.updateRoleConfiguration.run({ auth: as('B. Anthony'), data: { roleType: 'departmentLeader', department: 'Usher Sisters', memberName: 'M. Chloe', enabled: false } });
  assert.deepEqual([docs['accounts/M. Chloe'].roles, docs['accounts/M. Chloe'].departments], [[], []]);

  const claims = claimsOf(await signIn(functions, 'M. Chloe', '741983'));
  assert.equal(claims.leader, false);
  assert.equal(claims.privileged, false);
  assert.ok(!(claims.roles || []).includes('departmentLeader'));
  assert.deepEqual(claims.departments || [], [], 'belonging to Lobby is not leading it');

  const version = docs['accounts/M. Chloe'].roleVersion;
  await functions.changeMemberPin.run({ auth: { uid: 'member:M. Chloe', token: claims }, data: { newPin: '5678' } });
  const account = docs['accounts/M. Chloe'];
  assert.deepEqual([account.roles, account.departments], [[], []], 'a PIN change writes only the PIN');
  const again = claimsOf(await signIn(functions, 'M. Chloe', '5678'));
  assert.ok(!(again.roles || []).includes('departmentLeader'));

  for (const department of ['Lobby', 'Usher Sisters']) {
    await rejectsWith(functions.listDepartmentRoster.run({ auth: as('M. Chloe', version), data: { departmentId: department } }), 'permission-denied');
  }
});

test('a removed song editor stays removed', async () => {
  const docs = await church({ 'accounts/D. Danielle': { memberName: 'D. Danielle', active: true, roleVersion: 1, pinHash: await pinHash('741983') } });
  const { functions } = loadIndex(docs);
  await functions.updateRoleConfiguration.run({ auth: as('B. Anthony'), data: { roleType: 'songEditor', memberName: 'D. Danielle', enabled: false } });
  const claims = claimsOf(await signIn(functions, 'D. Danielle', '741983'));
  assert.equal(claims.songEditor, false);
  assert.ok(!(claims.roles || []).includes('songEditor'));
});

test('a first sign-in takes roles from the leader settings, not the built-in list', async () => {
  // D. Chris leads Usher Brothers in the built-in list; the saved leader
  // settings name someone else.
  const docs = await church({ 'app/leaderConfig': { departmentLeaders: { 'Usher Brothers': ['B. Eli'] }, songEditors: [] } });
  const { functions } = loadIndex(docs);
  await rejectsWith(signIn(functions, 'D. Chris', '741983'), 'unauthenticated');
  assert.equal(docs['accounts/D. Chris'].pinHash, undefined);
  await rejectsWith(functions.resetMemberPin.run({ auth: as('B. Anthony'), data: { memberId: 'D. Chris' } }), 'failed-precondition');
  const setup = await functions.resetMemberPin.run({
    auth: as('B. Anthony'), data: { memberId: 'D. Chris', temporaryPinFlow: true }
  });
  const claims = claimsOf(await signIn(functions, 'D. Chris', setup.temporaryPin));
  assert.equal(claims.leader, false);
  assert.deepEqual(docs['accounts/D. Chris'].roles, []);
});

test('guesses made at the same moment are counted: five are checked, the rest refused', async () => {
  const docs = await church({ 'accounts/S. Leah': { memberName: 'S. Leah', active: true, roleVersion: 1, roles: [], departments: [], mustChangePin: false, pinHash: await pinHash('2468') } });
  const { functions } = loadIndex(docs);
  const outcomes = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    signIn(functions, 'S. Leah', String(1000 + index)).then(() => 'signed in', error => error.code)));
  assert.equal(outcomes.filter(code => code === 'unauthenticated').length, 5);
  assert.equal(outcomes.filter(code => code === 'resource-exhausted').length, 7);
  await rejectsWith(signIn(functions, 'S. Leah', '2468'), 'resource-exhausted', 'locked');
});

test('a device the member signed in on before is not held by a lock made from elsewhere, and is counted by itself', async () => {
  const docs = await church({ 'accounts/S. Leah': { memberName: 'S. Leah', active: true, roleVersion: 1, roles: [], departments: [], mustChangePin: false, pinHash: await pinHash('2468') } });
  const { functions } = loadIndex(docs);
  const withKey = (pin, deviceKey) => functions.verifyMemberPin.run({ data: { selectedMemberId: 'S. Leah', selectedMemberName: 'S. Leah', pin, deviceKey } });
  const first = await signIn(functions, 'S. Leah', '2468');
  assert.match(first.deviceKey, /^[0-9a-f]{64}$/, 'a new device is given a key after a correct PIN');
  assert.equal(JSON.stringify(docs['accounts/S. Leah']).includes(first.deviceKey), false, 'only the hash of the key is stored');
  // Someone else guesses five times: the name is locked for new devices.
  for (let guess = 0; guess < 5; guess += 1) await rejectsWith(signIn(functions, 'S. Leah', String(1000 + guess)), 'unauthenticated');
  await rejectsWith(signIn(functions, 'S. Leah', '2468'), 'resource-exhausted', 'locked');
  await rejectsWith(withKey('2468', 'f'.repeat(64)), 'resource-exhausted', 'locked');
  // The member's own device still signs in, and gets no second key.
  const own = await withKey('2468', first.deviceKey);
  assert.equal(own.deviceKey, null);
  // A known device is limited too: five wrong PINs lock that device.
  for (let guess = 0; guess < 5; guess += 1) await rejectsWith(withKey(String(2000 + guess), first.deviceKey), 'unauthenticated');
  await rejectsWith(withKey('2468', first.deviceKey), 'resource-exhausted', 'locked');
});

test('a reset forgets the member\'s known devices', async () => {
  const docs = await church({ 'accounts/S. Leah': { memberName: 'S. Leah', active: true, roleVersion: 1, roles: [], departments: [], mustChangePin: false, pinHash: await pinHash('2468') } });
  const { functions } = loadIndex(docs);
  const first = await signIn(functions, 'S. Leah', '2468');
  await functions.resetMemberPin.run({ auth: as('B. Anthony'), data: { memberId: 'S. Leah', temporaryPinFlow: true } });
  assert.equal(docs['accounts/S. Leah'].trustedDevices, null);
  for (let guess = 0; guess < 5; guess += 1) await rejectsWith(signIn(functions, 'S. Leah', String(1000 + guess)), 'unauthenticated');
  await rejectsWith(functions.verifyMemberPin.run({ data: { selectedMemberId: 'S. Leah', selectedMemberName: 'S. Leah', pin: '741983', deviceKey: first.deviceKey } }), 'resource-exhausted', 'locked');
});

test('a reset lifts the lockout, ends the member\'s sessions, stops alerts to their phones and is recorded', async () => {
  const docs = await church({
    'accounts/S. Leah': {
      memberName: 'S. Leah', active: true, roleVersion: 3, roles: [], departments: [], mustChangePin: false,
      pinHash: await pinHash('2468'), failedLoginAttempts: 7, loginLockedUntil: Date.now() + 600000
    },
    'app/nameMap': { map: { 'S.  Leah': 'S. Leah' } },
    'tokens/leah-phone': { name: 'S. Leah', updatedAt: 1, lastSeenAt: 1 },
    'tokens/leah-old-phone': { name: 'S.  Leah', updatedAt: 1, lastSeenAt: 1 },
    'tokens/chloe-phone': { name: 'M. Chloe', updatedAt: 1, lastSeenAt: 1 }
  });
  const { functions, auth } = loadIndex(docs);
  const reset = await functions.resetMemberPin.run({ auth: as('B. Anthony'), data: { memberId: 'S. Leah', temporaryPinFlow: true } });
  const account = docs['accounts/S. Leah'];
  assert.deepEqual([account.failedLoginAttempts, account.loginLockedUntil, account.mustChangePin, account.roleVersion], [0, 0, true, 4]);
  assert.deepEqual(auth.revoked, ['member:S. Leah']);
  assert.deepEqual(Object.keys(docs).filter(path => path.startsWith('tokens/')), ['tokens/chloe-phone'], 'her phones, under any spelling, get no alerts');
  const audit = Object.entries(docs).filter(([path]) => path.startsWith('audit/')).map(([, entry]) => entry);
  assert.deepEqual(audit.map(entry => [entry.action, entry.actor, entry.target]), [['member-pin-reset', 'B. Anthony', 'S. Leah']]);
  assert.ok(audit[0].timestamp > 0);
  const result = await signIn(functions, 'S. Leah', reset.temporaryPin);
  assert.equal(result.mustChangePin, true);
  assert.equal(claimsOf(result).roleVersion, 4);
});

test('only an administrator resets the PIN of an administrator, leader or song editor', async () => {
  const docs = await church({
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['M. Chloe'] }, songEditors: ['D. Danielle'] },
    'accounts/M. Chloe': { memberName: 'M. Chloe', active: true, roleVersion: 1, roles: ['departmentLeader'], departments: ['Usher Sisters'], mustChangePin: false, pinHash: await pinHash('4321') }
  });
  const { functions } = loadIndex(docs);
  const reset = (by, name) => functions.resetMemberPin.run({ auth: as(by), data: { memberId: name, temporaryPinFlow: true } });
  for (const target of ['B. Anthony', 'M. Chloe', 'D. Danielle']) {
    await rejectsWith(reset('E. Simon', target), 'permission-denied', 'privileged-target');
  }
  await rejectsWith(reset('M. Chloe', 'D. Danielle'), 'permission-denied', 'privileged-target');
  await reset('E. Simon', 'S. Leah');
  await reset('M. Chloe', 'S. Leah');
  await rejectsWith(reset('M. Chloe', 'D. Chris'), 'permission-denied', 'cross-department');
  await reset('B. Anthony', 'M. Chloe');
  const audit = Object.entries(docs).filter(([path]) => path.startsWith('audit/')).map(([, entry]) => [entry.actor, entry.target]);
  assert.deepEqual(audit, [['E. Simon', 'S. Leah'], ['M. Chloe', 'S. Leah'], ['B. Anthony', 'M. Chloe']]);
});

test('a session ended by a reset cannot reset or change a PIN', async () => {
  const docs = await church();
  const { functions } = loadIndex(docs);
  await rejectsWith(functions.resetMemberPin.run({ auth: as('E. Simon', 0), data: { memberId: 'S. Leah', temporaryPinFlow: true } }), 'permission-denied');
  await rejectsWith(functions.changeMemberPin.run({ auth: as('E. Simon', 0), data: { newPin: '9753' } }), 'permission-denied');
});

test('the shared starting PINs cannot be chosen as a new PIN', async () => {
  const docs = await church();
  const { functions } = loadIndex(docs);
  const retired = Array.from({ length: 10000 }, (_, value) => String(value).padStart(4, '0')).filter(isRetiredPin);
  assert.equal(retired.length, 2);
  for (const pin of retired) {
    await rejectsWith(signIn(functions, 'E. Simon', pin), 'unauthenticated');
    await rejectsWith(functions.changeMemberPin.run({ auth: as('E. Simon'), data: { newPin: pin } }), 'invalid-argument', 'pin-too-common');
  }
  await functions.changeMemberPin.run({ auth: as('E. Simon'), data: { newPin: '9753' } });
});

/* Firebase Auth has a user record only for a uid that has signed in with a
   custom token; setting claims on any other uid fails, as the Admin SDK's
   setCustomUserClaims does. */
function authWithUsers(auth, uids) {
  const users = new Set(uids);
  auth.setCustomUserClaims = async (uid, claims) => {
    if (!users.has(uid)) throw Object.assign(new Error('There is no user record corresponding to the provided identifier.'), { code: 'auth/user-not-found' });
    auth.claims.push({ uid, claims });
  };
  return users;
}

test('a member whose name was fixed before they ever signed in can have their PIN reset, sign in and choose a PIN', async () => {
  const docs = await church({ 'app/members': { list: ['B. Anthony', 'E. Simon', 'M. Chloe', 'S. Leah', 'Bridgette'] } });
  const { functions, auth } = loadIndex(docs);
  const users = authWithUsers(auth, ['member:B. Anthony']);
  await functions.renameMember.run({ auth: as('B. Anthony'), data: { from: 'Bridgette', to: 'S. Bridgette' } });
  assert.equal(docs['accounts/S. Bridgette'].authUid, 'member:Bridgette', 'she keeps the uid her profiles are filed under');

  const reset = await functions.resetMemberPin.run({ auth: as('B. Anthony'), data: { memberId: 'S. Bridgette', temporaryPinFlow: true } });
  const audit = Object.entries(docs).filter(([path]) => path.startsWith('audit/')).map(([, entry]) => [entry.action, entry.target]);
  assert.deepEqual(audit.filter(([action]) => action === 'member-pin-reset'), [['member-pin-reset', 'S. Bridgette']]);

  const result = await signIn(functions, 'S. Bridgette', reset.temporaryPin);
  assert.equal(JSON.parse(result.token).uid, 'member:Bridgette');
  assert.equal(result.mustChangePin, true);
  users.add('member:Bridgette'); // the app signs in with the token, which makes the user
  const claims = claimsOf(result);
  await functions.changeMemberPin.run({ auth: { uid: 'member:Bridgette', token: claims }, data: { newPin: '8642' } });
  const again = await signIn(functions, 'S. Bridgette', '8642');
  assert.equal(again.mustChangePin, false);
  assert.equal(claimsOf(again).memberId, 'S. Bridgette');
});
