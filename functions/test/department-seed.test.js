'use strict';

const assert = require('node:assert/strict');
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
  assert.deepEqual(result.writePlan.writes[0].rollback, {
    operation: 'delete',
    path: 'departments/Translation/members/uid-avery'
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
