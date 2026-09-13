'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PIN,
  validatePin,
  hashPin,
  verifyPin,
  createMemberAuthService
} = require('../member-auth');

const MEMBER_PIN = '1'.repeat(4);
const WRONG_PIN = '9'.repeat(4);
const NEW_PIN = '5'.repeat(4);

function memberRecord(overrides = {}) {
  return Object.assign({
    id: 'member-1',
    name: 'B. Member One',
    role: 'member',
    pinHash: null
  }, overrides);
}

function harness(record, permissionResult = true) {
  const updates = [];
  const logs = [];
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
      return JSON.stringify({ uid, claims });
    },
    async setCustomUserClaims(uid, claims) {
      record.lastClaims = { uid, claims };
    }
  };
  const permission = {
    async assertActorCanAct(input) {
      logs.push({ action: input.action, result: permissionResult });
      return permissionResult;
    }
  };
  const logger = { info(event, details) { logs.push({ event, details }); } };
  return {
    service: createMemberAuthService({ memberStore: store, auth, permission, logger }),
    record,
    updates,
    logs
  };
}

test('accepts only 4 to 6 ASCII digits as a PIN', () => {
  assert.equal(validatePin('1234'), true);
  assert.equal(validatePin('123456'), true);
  assert.equal(validatePin('123'), false);
  assert.equal(validatePin('1234567'), false);
  assert.equal(validatePin('12a4'), false);
  assert.equal(validatePin(1234), false);
});

test('hashes with a salt and verifies scrypt and pbkdf2 records', async () => {
  const scryptHash = await hashPin(MEMBER_PIN);
  const secondHash = await hashPin(MEMBER_PIN);
  const pbkdf2Hash = await hashPin(MEMBER_PIN, { algorithm: 'pbkdf2', iterations: 100000 });
  assert.match(scryptHash, /^pin\$1\$scrypt\$/);
  assert.notEqual(scryptHash, secondHash);
  assert.equal(await verifyPin(MEMBER_PIN, scryptHash), true);
  assert.equal(await verifyPin(WRONG_PIN, scryptHash), false);
  assert.equal(await verifyPin(MEMBER_PIN, pbkdf2Hash), true);
  assert.equal(await verifyPin('1234', 'not-a-pin-hash'), false);
});

test('forces a privileged member to change the PIN and clears the flag after change', async () => {
  const record = memberRecord({ role: 'leader', pinHash: await hashPin(MEMBER_PIN) });
  const h = harness(record);
  const verified = await h.service.verifyMemberPin({ data: { memberId: record.id, pin: MEMBER_PIN } });
  const token = JSON.parse(verified.token);
  assert.equal(verified.mustChangePin, true);
  assert.equal(token.claims.mustChangePin, true);
  assert.equal(token.claims.privileged, true);

  const changed = await h.service.changeMemberPin({
    auth: { uid: 'member:member-1', token: token.claims },
    data: { newPin: NEW_PIN }
  });
  assert.deepEqual(changed, { ok: true, memberId: record.id, mustChangePin: false });
  assert.equal(record.mustChangePin, false);
  assert.equal(await verifyPin(NEW_PIN, record.pinHash), true);
});

test('resets a member to the hashed default PIN and requires a change', async () => {
  const record = memberRecord({ pinHash: await hashPin(MEMBER_PIN) });
  const h = harness(record);
  const result = await h.service.resetMemberPin({
    auth: { uid: 'admin-1', token: { memberId: 'admin-1', privileged: true } },
    data: { memberId: record.id }
  });
  assert.deepEqual(result, { ok: true, memberId: record.id, mustChangePin: true });
  assert.equal(record.mustChangePin, true);
  assert.equal(await verifyPin(DEFAULT_PIN, record.pinHash), true);
  assert.equal(await verifyPin(MEMBER_PIN, record.pinHash), false);
  assert.equal(h.updates.length, 1);
});

test('denies a reset when the injected actor permission check rejects it', async () => {
  const record = memberRecord({ pinHash: await hashPin(MEMBER_PIN) });
  const h = harness(record, false);
  await assert.rejects(
    h.service.resetMemberPin({
      auth: { uid: 'member-2', token: { memberId: 'member-2' } },
      data: { memberId: record.id }
    }),
    error => error.code === 'permission-denied'
  );
  assert.equal(h.updates.length, 0);
});

test('does not log or return PIN values on reset or failed verification', async () => {
  const record = memberRecord({ pinHash: await hashPin(MEMBER_PIN) });
  const h = harness(record);
  await assert.rejects(
    h.service.verifyMemberPin({ data: { memberId: record.id, pin: WRONG_PIN } }),
    error => error.code === 'unauthenticated' && !error.message.includes(WRONG_PIN)
  );
  await h.service.resetMemberPin({
    auth: { uid: 'admin-1', token: { memberId: 'admin-1', privileged: true } },
    data: { memberId: record.id }
  });
  const serialized = JSON.stringify(h.logs);
  assert.equal(serialized.includes(DEFAULT_PIN), false);
  assert.equal(serialized.includes(MEMBER_PIN), false);
  assert.equal(serialized.includes(WRONG_PIN), false);
});

test('blocks privileged actions while a session still requires a PIN change', async () => {
  const h = harness(memberRecord());
  await assert.rejects(
    h.service.assertPrivilegedSession({
      auth: { uid: 'leader-1', token: { privileged: true, mustChangePin: true } }
    }),
    error => error.code === 'failed-precondition'
  );
});
