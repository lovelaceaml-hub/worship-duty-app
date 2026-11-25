'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePin,
  hashPin,
  verifyPin,
  parsePinHash,
  isPrivileged,
  isSongEditor,
  createMemberAuthService,
  createMemberAuthCallables
} = require('../member-auth');

const PERSONAL_PIN = '741983';
const TEMP_PIN = '7419830625';

function memberRecord(overrides = {}) {
  return Object.assign({
    id: 'member-1',
    name: 'B. Member One',
    role: 'member',
    pinHash: null
  }, overrides);
}

function harness(record, permissionResult = true, now = Date.now) {
  const updates = [];
  const permissionCalls = [];
  const logs = [];
  const claimsCalls = [];
  const tokenCalls = [];
  const store = {
    async getById(id) {
      return record.id === id ? record : null;
    },
    async findByName(name) {
      return record.name === name ? record : null;
    },
    async update(id, patch) {
      updates.push({ id, patch });
      Object.assign(record, patch);
    }
  };
  const auth = {
    async createCustomToken(uid, claims) {
      tokenCalls.push({ uid, claims });
      return JSON.stringify({ uid, claims });
    },
    async setCustomUserClaims(uid, claims) {
      claimsCalls.push({ uid, claims });
    }
  };
  const permission = {
    async assertActorCanAct(input) {
      permissionCalls.push(input);
      return permissionResult;
    }
  };
  const logger = {
    info(event, details) {
      logs.push({ event, details });
    }
  };
  return {
    service: createMemberAuthService({ memberStore: store, auth, permission, logger, now }),
    callables: createMemberAuthCallables({ memberStore: store, auth, permission, logger, now }),
    record,
    updates,
    permissionCalls,
    logs,
    claimsCalls,
    tokenCalls
  };
}

test('accepts only 4 to 6 ASCII digits as a PIN', () => {
  assert.equal(validatePin('1234'), true);
  assert.equal(validatePin('123456'), true);
  assert.equal(validatePin(PERSONAL_PIN), true);
  assert.equal(validatePin('123'), false);
  assert.equal(validatePin('1234567'), false);
  assert.equal(validatePin('12a4'), false);
  assert.equal(validatePin('１２３４'), false);
  assert.equal(validatePin(1234), false);
});

test('hashes with a random salt and verifies scrypt and pbkdf2 records', async () => {
  const scryptHash = await hashPin('1234');
  const secondHash = await hashPin('1234');
  const pbkdf2Hash = await hashPin('1234', { algorithm: 'pbkdf2', iterations: 100000 });
  const parsed = parsePinHash(scryptHash);
  assert.match(scryptHash, /^pin\$1\$scrypt\$/);
  assert.notEqual(scryptHash, secondHash);
  assert.equal(parsed.salt.length >= 16, true);
  assert.equal(await verifyPin('1234', scryptHash), true);
  assert.equal(await verifyPin('9999', scryptHash), false);
  assert.equal(await verifyPin('1234', pbkdf2Hash), true);
  assert.equal(await verifyPin('1234', 'not-a-pin-hash'), false);
  assert.equal(await verifyPin('1234', 'pin$1$scrypt$999999999$8$1$32$ZmFrZXNhbHQ$ZmFrZWRlcml2ZWQ'), false);
  await assert.rejects(
    hashPin('1234', { algorithm: 'pbkdf2', iterations: 99999 }),
    error => error.code === 'invalid-argument'
  );
});

test('distinguishes operational privilege from song-only editing privilege', () => {
  assert.equal(isPrivileged({ role: 'leader' }), true);
  assert.equal(isPrivileged({ admin: true }), true);
  assert.equal(isPrivileged({ role: 'song-editor' }), false);
  assert.equal(isSongEditor({ role: 'choir-song-editor' }), true);
  assert.equal(isSongEditor({ role: 'editor' }), true);
  assert.equal(isSongEditor({ role: 'presider' }), true);
  assert.equal(isPrivileged({ role: 'editor' }), false);
});

test('verifies the selected ordinary member and returns normal claims', async () => {
  const record = memberRecord({ pinHash: await hashPin(PERSONAL_PIN) });
  const h = harness(record);
  const result = await h.callables.verifyMemberPin({
    data: { selectedMemberId: record.id, selectedMemberName: record.name, pin: PERSONAL_PIN }
  });
  const token = JSON.parse(result.token);
  assert.equal(result.memberId, record.id);
  assert.equal(result.memberName, record.name);
  assert.equal(result.mustChangePin, false);
  assert.equal(token.claims.memberId, record.id);
  assert.equal(token.claims.privileged, false);
  assert.equal(token.claims.mustChangePin, false);
  assert.equal(JSON.stringify(result).includes(record.pinHash), false);

  const direct = await h.service.verifyMemberPin({
    auth: { uid: 'not-used-for-login' },
    memberId: record.id,
    pin: PERSONAL_PIN
  });
  assert.equal(direct.memberId, record.id);
});

test('forces a protected member with initial PIN into the change flow', async () => {
  const record = memberRecord({ role: 'leader', authUid: 'auth-leader', pinHash: await hashPin(TEMP_PIN),
    mustChangePin: true, temporaryPinExpiresAt: Date.now() + 60000 });
  const h = harness(record);
  const verified = await h.service.verifyMemberPin({ data: { memberId: record.id, pin: TEMP_PIN } });
  const token = JSON.parse(verified.token);
  assert.equal(verified.mustChangePin, true);
  assert.equal(token.claims.mustChangePin, true);
  assert.equal(token.claims.privileged, true);

  await assert.rejects(
    h.service.assertPrivilegedSession({ auth: { uid: token.uid, token: token.claims } }),
    error => error.code === 'failed-precondition'
  );

  const changed = await h.service.changeMemberPin({
    auth: { uid: token.uid, token: token.claims },
    data: { newPin: '5678' }
  });
  const { token: changeToken, ...changedRest } = changed;
  assert.deepEqual(changedRest, { ok: true, memberId: record.id, mustChangePin: false });
  // The change ends the member's other sessions: a new role version, and a
  // fresh token for the device that made the change.
  assert.equal(record.roleVersion, Number(token.claims.roleVersion || 1) + 1);
  assert.equal(JSON.parse(changeToken).claims.roleVersion, record.roleVersion);
  assert.equal(JSON.parse(changeToken).claims.mustChangePin, false);
  assert.equal(record.mustChangePin, false);
  assert.equal(await verifyPin('5678', record.pinHash), true);
  assert.equal(h.claimsCalls.at(-1).uid, 'auth-leader');
  assert.equal(h.claimsCalls.at(-1).claims.mustChangePin, false);

  const fresh = await h.service.verifyMemberPin({ data: { memberId: record.id, pin: '5678' } });
  assert.equal(fresh.mustChangePin, false);
  await h.service.assertPrivilegedSession({ auth: { uid: 'leader-session', token: JSON.parse(fresh.token).claims } });
});

test('rejects invalid new PINs before writing a member record', async () => {
  const record = memberRecord({ role: 'leader', pinHash: await hashPin(PERSONAL_PIN) });
  const h = harness(record);
  await assert.rejects(
    h.service.changeMemberPin({
      auth: { uid: 'member:member-1', token: { memberId: record.id, mustChangePin: true } },
      data: { newPin: '123' }
    }),
    error => error.code === 'invalid-argument'
  );
  assert.equal(h.updates.length, 0);
});

test('issues a hashed, expiring PIN and requires a change', async () => {
  const record = memberRecord({ pinHash: await hashPin('1234') });
  const h = harness(record);
  const result = await h.service.resetMemberPin({
    auth: { uid: 'admin-1', token: { memberId: 'admin-1', privileged: true } },
    data: { memberId: record.id }
  });
  const { temporaryPin, temporaryPinExpiresAt, ...status } = result;
  assert.deepEqual(status, { ok: true, memberId: record.id, mustChangePin: true });
  assert.match(temporaryPin, /^\d{10}$/);
  assert.equal(temporaryPinExpiresAt, record.temporaryPinExpiresAt);
  assert.ok(temporaryPinExpiresAt > Date.now());
  assert.equal(record.mustChangePin, true);
  assert.equal(await verifyPin(temporaryPin, record.pinHash), true);
  assert.equal(await verifyPin('1234', record.pinHash), false);
  assert.equal(h.updates.length, 1);
  assert.equal(h.permissionCalls.length, 1);
  assert.equal(h.permissionCalls[0].action, 'member.pin.reset');
  assert.equal(Object.prototype.hasOwnProperty.call(h.permissionCalls[0].target, 'pinHash'), false);
});

test('denies a reset when the injected actor permission check rejects it', async () => {
  const record = memberRecord({ pinHash: await hashPin('1234') });
  const h = harness(record, false);
  await assert.rejects(
    h.service.resetMemberPin({
      auth: { uid: 'leader-1', token: { memberId: 'leader-1', role: 'leader' } },
      data: { memberId: record.id }
    }),
    error => error.code === 'permission-denied'
  );
  assert.equal(h.updates.length, 0);
  assert.equal(h.permissionCalls.length, 1);
});

test('requires administrators to reset rather than directly choosing another member PIN', async () => {
  const record = memberRecord({ pinHash: await hashPin('1234') });
  const h = harness(record);
  await assert.rejects(h.service.changeMemberPin({
    auth: { uid: 'admin-1', token: { memberId: 'admin-1', role: 'admin' } },
    data: { memberId: record.id, newPin: '567890' }
  }), error => error.code === 'permission-denied');
  assert.equal(h.permissionCalls.length, 0);
  assert.equal(await verifyPin('1234', record.pinHash), true);
});

test('a protected actor cannot bypass a forced change to reset another account', async () => {
  const record = memberRecord({ pinHash: await hashPin('1234') });
  const h = harness(record);
  await assert.rejects(
    h.service.resetMemberPin({
      auth: { uid: 'leader-1', token: { memberId: 'leader-1', role: 'leader', mustChangePin: true } },
      data: { memberId: record.id }
    }),
    error => error.code === 'failed-precondition'
  );
  assert.equal(h.updates.length, 0);
  assert.equal(h.permissionCalls.length, 0);
});

test('only discloses the temporary PIN to the authorized reset caller', async () => {
  const record = memberRecord({ pinHash: await hashPin('1234') });
  const h = harness(record);
  await assert.rejects(
    h.service.verifyMemberPin({ data: { memberId: record.id, pin: '9999' } }),
    error => error.code === 'unauthenticated' &&
      !error.message.includes('9999') && !error.message.includes('1234')
  );
  const result = await h.service.resetMemberPin({
    auth: { uid: 'admin-1', token: { memberId: 'admin-1', privileged: true } },
    data: { memberId: record.id }
  });
  const resetLog = h.logs.find(entry => entry.event === 'member_auth_action' && entry.details.action === 'reset');
  assert.equal(resetLog.details.result, 'success');
  assert.match(resetLog.details.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(resetLog.details.actor.uid, 'admin-1');
  assert.equal(resetLog.details.actor.memberId, 'admin-1');
  assert.deepEqual(resetLog.details.target, { memberId: record.id });
  const serialized = JSON.stringify({ logs: h.logs, updates: h.updates });
  assert.equal(serialized.includes(result.temporaryPin), false);
  assert.equal(serialized.includes('1234'), false);
  assert.equal(serialized.includes('9999'), false);
  assert.equal(JSON.stringify(h.logs).includes(record.pinHash), false);
});

test('rejects account-changing requests without an authenticated actor', async () => {
  const record = memberRecord({ pinHash: await hashPin('1234') });
  const h = harness(record);
  await assert.rejects(
    h.service.changeMemberPin({ data: { memberId: record.id, newPin: '5678' } }),
    error => error.code === 'unauthenticated'
  );
  await assert.rejects(
    h.service.resetMemberPin({ data: { memberId: record.id } }),
    error => error.code === 'unauthenticated'
  );
  assert.equal(h.updates.length, 0);
});

test('reissuing invalidates the previous temporary PIN and expiry blocks both sign-in and PIN changes', async () => {
  let now = Date.now();
  const record = memberRecord();
  const h = harness(record, true, () => now);
  const reset = () => h.service.resetMemberPin({
    auth: { uid: 'admin-1', token: { memberId: 'admin-1', privileged: true } },
    data: { memberId: record.id }
  });
  const login = pin => h.service.verifyMemberPin({ data: { memberId: record.id, pin } });
  const first = await reset();
  const second = await reset();
  assert.notEqual(second.temporaryPin, first.temporaryPin);
  await assert.rejects(login(first.temporaryPin), { code: 'unauthenticated' });
  const verified = JSON.parse((await login(second.temporaryPin)).token);
  const change = token => h.service.changeMemberPin({
    auth: { uid: verified.uid, token },
    data: { newPin: PERSONAL_PIN }
  });
  await assert.rejects(change({ ...verified.claims, pinChangeVerified: false }), { code: 'permission-denied' });
  now = second.temporaryPinExpiresAt;
  await assert.rejects(login(second.temporaryPin), { code: 'unauthenticated' });
  await assert.rejects(change(verified.claims), { code: 'permission-denied' });
});

test('an inactive member cannot sign in even with the correct personal PIN', async () => {
  const record = memberRecord({ active: false, pinHash: await hashPin(PERSONAL_PIN) });
  const h = harness(record);
  await assert.rejects(h.service.verifyMemberPin({ data: { memberId: record.id, pin: PERSONAL_PIN } }),
    { code: 'unauthenticated' });
});
