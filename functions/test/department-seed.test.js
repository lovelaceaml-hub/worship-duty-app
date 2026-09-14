'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const seed = require('../department-seed.js');

const identities = [
  {
    uid: 'uid-avery',
    memberName: 'Avery Example',
    aliases: ['A. Example']
  },
  {
    uid: 'uid-morgan',
    memberName: 'Morgan Example'
  }
];

function service(date, assignments, service = 'Morning') {
  return { date, service, time: '09:00', assignments };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function conditionalStore(initial = {}, hooks = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, clone(value)]));
  let setCalls = 0;
  return {
    values,
    async setIfUnchanged(pathname, precondition, value) {
      setCalls += 1;
      hooks.beforeSet?.({ pathname, setCalls, values });
      const current = values.has(pathname) ? values.get(pathname) : null;
      const exists = current !== null && current !== undefined;
      if (exists !== precondition.exists ||
          seed.fingerprint(exists ? current : null) !== precondition.fingerprint) return false;
      values.set(pathname, clone(value));
      return true;
    },
    async deleteIfUnchanged(pathname, precondition) {
      const current = values.has(pathname) ? values.get(pathname) : null;
      const exists = current !== null && current !== undefined;
      if (exists !== precondition.exists ||
          seed.fingerprint(exists ? current : null) !== precondition.fingerprint) return false;
      values.delete(pathname);
      return true;
    }
  };
}

test('history seed is deterministic, UID keyed, and idempotent', () => {
  const plan = seed.planHistorySeed([
    service('2026-09-06', { 'Translation #1': 'A. Example' }),
    service('2026-09-13', { 'Translation #1': 'Avery Example' })
  ], { identities, seededAt: 100, seededBy: 'history-test' });

  assert.equal(plan.suggestions.length, 1);
  assert.equal(plan.suggestions[0].memberUid, 'uid-avery');
  assert.equal(plan.suggestions[0].id, 'Translation::uid-avery');
  assert.deepEqual(plan.suggestions[0].eligibleDuties, ['Translation #1']);
  assert.equal(plan.suggestions[0].historySeed.evidence.length, 2);

  const [created] = seed.applyHistorySeedPlan([], plan);
  const [repeated] = seed.applyHistorySeedPlan([created], plan);
  assert.deepEqual(repeated, created);
  assert.equal(repeated.memberUid, 'uid-avery');
  assert.equal(repeated.departmentId, 'Translation');
});

test('later assignments accumulate duty suggestions and provenance without duplicate evidence', () => {
  const firstPlan = seed.planHistorySeed([
    service('2026-09-06', { 'Translation #1': 'A. Example' })
  ], { identities, seededAt: 100, seededBy: 'history-test' });
  const [first] = seed.applyHistorySeedPlan([], firstPlan);

  const laterPlan = seed.planHistorySeed([
    service('2026-09-13', {
      'Translation #1': 'A. Example',
      'Translation #2': 'A. Example'
    })
  ], { identities, seededAt: 200, seededBy: 'history-test' });
  const [updated] = seed.applyHistorySeedPlan([first], laterPlan);

  assert.deepEqual(updated.eligibleDuties, ['Translation #1', 'Translation #2']);
  assert.equal(updated.historySeed.evidence.length, 3);
  const [again] = seed.applyHistorySeedPlan([updated], laterPlan);
  assert.deepEqual(again, updated);
});

test('manual status, duties, schedulability, and availability outrank later seed evidence', () => {
  const initialPlan = seed.planHistorySeed([
    service('2026-09-06', { 'Translation #1': 'A. Example' })
  ], { identities, seededAt: 100, seededBy: 'history-test' });
  const [created] = seed.applyHistorySeedPlan([], initialPlan);
  const manual = {
    ...created,
    status: 'inactive',
    active: false,
    eligibleDuties: ['Translation #1'],
    duties: ['Translation #1'],
    schedulable: false,
    isSchedulable: false,
    availability: {
      recurring: { morning: 'unavailable' },
      exceptions: { '2026-11-01': { morning: 'available' } }
    },
    fieldAttribution: Object.fromEntries([
      ['status', 'leader'],
      ['eligibleDuties', 'leader'],
      ['schedulable', 'member'],
      ['availability', 'member']
    ].map(([field, authority]) => [field, {
      source: 'manual', authority, by: `${authority}-uid`, at: 250
    }]))
  };

  const laterPlan = seed.planHistorySeed([
    service('2026-09-13', {
      'Translation #1': 'A. Example',
      'Translation #2': 'A. Example'
    })
  ], { identities, seededAt: 300, seededBy: 'sheet-sync' });
  const [protectedProfile] = seed.applyHistorySeedPlan([manual], laterPlan);

  assert.equal(protectedProfile.status, 'inactive');
  assert.equal(protectedProfile.schedulable, false);
  assert.deepEqual(protectedProfile.eligibleDuties, ['Translation #1']);
  assert.deepEqual(protectedProfile.availability, manual.availability);
  assert.equal(protectedProfile.historySeed.evidence.length, 3);
});

test('identity aliases cannot collide or pair a UID with another member name', () => {
  assert.throws(() => seed.createIdentityResolver({
    identities: [
      { uid: 'uid-one', name: 'One', aliases: ['Shared'] },
      { uid: 'uid-two', name: 'Two', aliases: ['Shared'] }
    ]
  }), error => error.code === 'identity-conflict' && error.alias === 'Shared');

  const resolver = seed.createIdentityResolver({ identities });
  assert.throws(() => seed.resolveMemberIdentity({
    memberUid: 'uid-morgan',
    memberName: 'A. Example'
  }, resolver), error => error.reason === 'uid-alias-mismatch');

  const plan = seed.planHistorySeed([
    service('2026-09-06', { 'Translation #1': {
      memberUid: 'uid-morgan',
      memberName: 'A. Example'
    } })
  ], { identityResolver: resolver, seededAt: 100 });
  assert.equal(plan.suggestions.length, 0);
  assert.equal(plan.skipped[0].reason, 'uid-alias-mismatch');
});

test('conflicting UID aliases are rejected instead of selecting the first field', () => {
  assert.throws(() => seed.resolveMemberIdentity({
    uid: 'uid-avery',
    memberUid: 'uid-morgan'
  }), error => error.code === 'identity-conflict' && error.reason === 'uid-alias-conflict');

  assert.throws(() => seed.createIdentityResolver({
    identities: [{ uid: 'uid-avery', authUid: 'uid-morgan', memberName: 'Avery Example' }]
  }), error => error.code === 'identity-conflict' && error.reason === 'uid-alias-conflict');

  assert.equal(seed.profileIdentity({
    departmentId: 'Translation',
    uid: 'uid-avery',
    memberUid: 'uid-morgan'
  }), null);
});

test('dry-run is read-only and emits concrete rollback instructions', async () => {
  const result = seed.dryRunHistorySeed({
    identities,
    assignments: [service('2026-09-06', { 'Translation #1': 'A. Example' })],
    profiles: []
  }, { seededAt: 100, seededBy: 'history-test' });

  assert.equal(result.readOnly, true);
  assert.equal(result.productionAccess, false);
  assert.equal(result.applied, false);
  assert.equal(result.writePlan.writes.length, 1);
  assert.equal(result.writePlan.writes[0].rollback.operation, 'delete');
  assert.equal(result.writePlan.writes[0].rollback.path, 'departments/Translation/members/uid-avery');
  assert.deepEqual(result.writePlan.writes[0].rollback.precondition, {
    exists: true,
    fingerprint: seed.fingerprint(result.writePlan.writes[0].after)
  });
  assert.deepEqual(result.rollbackPlan, result.writePlan.rollbackPlan);

  let writes = 0;
  const dryResult = await seed.applyProfileWritePlan(result.writePlan, {
    async read() { throw new Error('read must not run during dry-run'); },
    async set() { writes += 1; },
    async delete() { writes += 1; }
  });
  assert.equal(dryResult.applied, false);
  assert.equal(dryResult.writesAttempted, 0);
  assert.equal(writes, 0);
});

test('execution requires an atomic or conditional adapter and cannot use read-then-set', async () => {
  const result = seed.dryRunHistorySeed({
    identities,
    assignments: [service('2026-09-06', { 'Translation #1': 'A. Example' })],
    profiles: []
  }, { seededAt: 100, seededBy: 'history-test' });

  await assert.rejects(
    () => seed.applyProfileWritePlan(result.writePlan, {
      async read() { return null; },
      async set() {},
      async delete() {}
    }, { execute: true }),
    error => error instanceof TypeError && /conditional write methods/.test(error.message)
  );
});

test('conditional application rejects a concurrent human edit without overwriting it', async () => {
  const firstPlan = seed.planHistorySeed([
    service('2026-09-06', { 'Translation #1': 'A. Example' })
  ], { identities, seededAt: 100, seededBy: 'history-test' });
  const [created] = seed.applyHistorySeedPlan([], firstPlan);
  const laterPlan = seed.planHistorySeed([
    service('2026-09-13', { 'Translation #1': 'A. Example', 'Translation #2': 'A. Example' })
  ], { identities, seededAt: 200, seededBy: 'sheet-sync' });
  const writePlan = seed.planProfileWrites([created], laterPlan);
  const pathName = writePlan.writes[0].path;
  const humanEdit = { ...created, status: 'inactive', active: false };
  const adapter = conditionalStore({ [pathName]: humanEdit });

  await assert.rejects(
    () => seed.applyProfileWritePlan(writePlan, adapter, { execute: true }),
    error => error.code === 'write-conflict' && error.rollback.attempted === 0
  );
  assert.deepEqual(adapter.values.get(pathName), humanEdit);
});

test('rollback conditionally restores only unchanged migration writes', async () => {
  const plan = seed.planHistorySeed([
    service('2026-09-06', {
      'Translation #1': 'A. Example',
      Presider: 'Morgan Example'
    })
  ], { identities, seededAt: 100, seededBy: 'history-test' });
  const writePlan = seed.planProfileWrites([], plan);
  const firstPath = writePlan.writes[0].path;
  const secondPath = writePlan.writes[1].path;
  const adapter = conditionalStore({}, {
    beforeSet({ setCalls, values }) {
      if (setCalls === 2) {
        values.set(firstPath, { memberUid: 'human-edit', status: 'inactive' });
        values.set(secondPath, { memberUid: 'human-edit-2', status: 'inactive' });
      }
    }
  });

  await assert.rejects(
    () => seed.applyProfileWritePlan(writePlan, adapter, { execute: true }),
    error => error.code === 'write-conflict' &&
      error.rollback.attempted === 1 &&
      error.rollback.completed === 0 &&
      error.rollback.errors[0].code === 'rollback-conflict'
  );
  assert.deepEqual(adapter.values.get(firstPath), { memberUid: 'human-edit', status: 'inactive' });
});

test('rollback restores an unchanged migration write after a later conflict', async () => {
  const plan = seed.planHistorySeed([
    service('2026-09-06', {
      'Translation #1': 'A. Example',
      Presider: 'Morgan Example'
    })
  ], { identities, seededAt: 100, seededBy: 'history-test' });
  const writePlan = seed.planProfileWrites([], plan);
  const firstPath = writePlan.writes[0].path;
  const secondPath = writePlan.writes[1].path;
  const adapter = conditionalStore({}, {
    beforeSet({ setCalls, values }) {
      if (setCalls === 2) values.set(secondPath, { memberUid: 'human-edit-2', status: 'inactive' });
    }
  });

  await assert.rejects(
    () => seed.applyProfileWritePlan(writePlan, adapter, { execute: true }),
    error => error.code === 'write-conflict' &&
      error.rollback.attempted === 1 &&
      error.rollback.completed === 1 &&
      error.rollback.errors.length === 0
  );
  assert.equal(adapter.values.has(firstPath), false);
  assert.deepEqual(adapter.values.get(secondPath), { memberUid: 'human-edit-2', status: 'inactive' });
});

test('nested rollback failures remain observable on the original write error', async () => {
  const plan = seed.planHistorySeed([
    service('2026-09-06', { 'Translation #1': 'A. Example' }),
    service('2026-09-13', { Presider: 'Morgan Example' })
  ], { identities, seededAt: 100, seededBy: 'history-test' });
  const writePlan = seed.planProfileWrites([], plan);
  const firstPath = writePlan.writes[0].path;
  const secondPath = writePlan.writes[1].path;
  const adapter = conditionalStore({}, {
    beforeSet({ setCalls, values }) {
      if (setCalls === 2) {
        values.set(firstPath, { memberUid: 'human-edit', status: 'inactive' });
        values.set(secondPath, { memberUid: 'human-edit-2', status: 'inactive' });
      }
    }
  });
  const originalDelete = adapter.deleteIfUnchanged;
  adapter.deleteIfUnchanged = async (...args) => {
    await originalDelete(...args);
    const nested = new Error('nested rollback failure');
    nested.rollback = {
      attempted: 1,
      completed: 0,
      ok: false,
      errors: [{ path: firstPath, code: 'nested-conflict', error: 'nested conflict' }]
    };
    throw nested;
  };

  await assert.rejects(
    () => seed.applyProfileWritePlan(writePlan, adapter, { execute: true }),
    error => error.code === 'write-conflict' &&
      error.rollback.errors[0].nestedRollback.errors[0].code === 'nested-conflict'
  );
});

test('the department seed module resolves from a Functions-only package copy', () => {
  const functionsRoot = path.join(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'department-seed-functions-'));
  try {
    fs.cpSync(functionsRoot, tempRoot, { recursive: true });
    const packagedSeed = require(path.join(tempRoot, 'department-seed.js'));
    assert.equal(packagedSeed.mapDutyDepartment('Translation #1'), 'Translation');
    assert.equal(packagedSeed.DEFAULT_DUTY_DEPARTMENTS.Presider, 'Worship');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
