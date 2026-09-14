import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const profile = require('../department-profile.js');
const migration = require('../department-profile-migration.js');

const {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  AVAILABILITY_UNKNOWN,
  HISTORY_SEED_SOURCE,
  PROFILE_STATUS_ACTIVE,
  PROFILE_STATUS_INACTIVE,
  createDepartmentProfile,
  effectiveAvailability,
  isActive,
  isAvailable,
  isCurrentlySchedulable,
  isDutyEligible,
  isSchedulable,
  mergeHistorySeed,
  normalizeDepartmentProfile,
  updateDepartmentProfile
} = profile;

test('constructs and normalizes a safe department profile', () => {
  const member = createDepartmentProfile({
    department: ' Translation ',
    member: ' M. Avery ',
    role: 'member',
    status: 'ACTIVE',
    eligibleDuties: ['Translation #1', 'Translation #2', ' translation #1 '],
    schedulable: true,
    availability: {
      recurring: {
        Morning: AVAILABILITY_AVAILABLE,
        Evening: AVAILABILITY_UNAVAILABLE
      },
      dateExceptions: {
        '2026-09-20': { morning: AVAILABILITY_UNAVAILABLE }
      }
    }
  }, {
    actor: { by: 'leader-alpha', role: 'leader' },
    at: 100
  });

  assert.equal(member.id, 'translation::m-avery');
  assert.equal(member.department, 'Translation');
  assert.equal(member.member, 'M. Avery');
  assert.deepEqual(member.eligibleDuties, ['Translation #1', 'Translation #2']);
  assert.equal(member.status, PROFILE_STATUS_ACTIVE);
  assert.equal(member.schedulable, true);
  assert.deepEqual(member.availability.recurring, {
    evening: AVAILABILITY_UNAVAILABLE,
    morning: AVAILABILITY_AVAILABLE
  });
  assert.equal(member.attribution.createdBy, 'leader-alpha');
  assert.equal(member.attribution.createdAt, 100);
  assert.equal(member.updatedBy, 'leader-alpha');
  assert.equal(member.updatedAt, 100);
  assert.equal(member.fieldAttribution.status.authority, 'leader');
  assert(Object.isFrozen(member));
  assert(Object.isFrozen(member.availability.exceptions));
});

test('rejects malformed or unsafe profile writes', () => {
  assert.throws(
    () => normalizeDepartmentProfile({ department: 'Translation', member: '' }),
    /profile\.member: must not be empty/
  );
  assert.throws(
    () => normalizeDepartmentProfile({ department: 'Translation', member: 'M. Avery', unknown: true }),
    /profile\.unknown: unknown field/
  );
  assert.throws(
    () => normalizeDepartmentProfile({
      department: 'Translation',
      member: 'M. Avery',
      availability: { recurring: { morning: 'maybe' } }
    }),
    /availability\.recurring\.morning: must be one of/
  );
  assert.throws(
    () => normalizeDepartmentProfile({
      department: 'Translation',
      member: 'M. Avery',
      availability: { exceptions: { '2026-02-30': { morning: AVAILABILITY_AVAILABLE } } }
    }),
    /must be a real calendar date/
  );
  assert.throws(
    () => normalizeDepartmentProfile({
      department: 'Translation',
      member: 'M. Avery',
      availability: { recurring: JSON.parse('{"__proto__":"available"}') }
    }),
    /unsafe key is not allowed/
  );
  assert.throws(
    () => updateDepartmentProfile(
      createDepartmentProfile({ department: 'Translation', member: 'M. Avery' }, { at: 1 }),
      { role: 'leader' },
      { by: 'leader-alpha', role: 'leader', at: 2 }
    ),
    /patch\.role: unknown field/
  );
});

test('active status, eligibility, schedulability, and availability combine deterministically', () => {
  const member = createDepartmentProfile({
    department: 'Translation',
    member: 'M. Avery',
    eligibleDuties: ['Translation #1'],
    schedulable: true,
    availability: { recurring: { morning: AVAILABILITY_AVAILABLE } }
  }, { at: 10 });

  assert.equal(isActive(member), true);
  assert.equal(isDutyEligible(member, 'translation #1'), true);
  assert.equal(isSchedulable(member), true);
  assert.equal(isCurrentlySchedulable(member, {
    duty: 'Translation #1',
    date: '2026-09-20',
    serviceTime: 'morning'
  }), true);
  assert.equal(isCurrentlySchedulable(member, {
    duty: 'Lobby Desk #1',
    date: '2026-09-20',
    serviceTime: 'morning'
  }), false);
  assert.equal(isCurrentlySchedulable(member, {
    duty: 'Translation #1',
    date: '2026-09-20',
    serviceTime: 'evening'
  }), false);

  const inactive = updateDepartmentProfile(member, { status: PROFILE_STATUS_INACTIVE }, {
    by: 'leader-alpha',
    role: 'leader',
    at: 11
  });
  assert.equal(isActive(inactive), false);
  assert.equal(isSchedulable(inactive), false);
  assert.equal(isCurrentlySchedulable(inactive, {
    duty: 'Translation #1',
    date: '2026-09-20',
    serviceTime: 'morning'
  }), false);
});

test('recurring availability is overridden by date-specific exceptions', () => {
  const member = createDepartmentProfile({
    department: 'Worship',
    member: 'T. Mina',
    availability: {
      recurring: {
        morning: AVAILABILITY_AVAILABLE,
        evening: AVAILABILITY_UNAVAILABLE
      },
      exceptions: {
        '2026-09-20': {
          morning: AVAILABILITY_UNAVAILABLE,
          evening: AVAILABILITY_AVAILABLE
        },
        '2026-09-21': { '*': AVAILABILITY_UNAVAILABLE }
      }
    }
  }, { at: 20 });

  assert.equal(effectiveAvailability(member, '2026-09-19', 'morning'), AVAILABILITY_AVAILABLE);
  assert.equal(effectiveAvailability(member, { date: '2026-09-20', serviceTime: 'morning' }), AVAILABILITY_UNAVAILABLE);
  assert.equal(effectiveAvailability(member, '2026-09-20', 'evening'), AVAILABILITY_AVAILABLE);
  assert.equal(effectiveAvailability(member, '2026-09-21', 'morning'), AVAILABILITY_UNAVAILABLE);
  assert.equal(effectiveAvailability(member, '2026-09-19', 'overnight'), AVAILABILITY_UNKNOWN);
  assert.equal(isAvailable(member, '2026-09-20', 'evening'), true);
});

test('manual edits preserve editor and timestamp attribution', () => {
  const member = createDepartmentProfile({
    department: 'Translation',
    member: 'M. Avery',
    eligibleDuties: ['Translation #1'],
    schedulable: true
  }, {
    actor: { by: 'history-seed', role: 'history-seed' },
    at: 100
  });

  const edited = updateDepartmentProfile(member, {
    status: PROFILE_STATUS_INACTIVE,
    eligibleDuties: ['Translation #2'],
    schedulable: false,
    availability: { recurring: { morning: AVAILABILITY_AVAILABLE } }
  }, {
    by: 'member-avery',
    role: 'member',
    at: 200
  });

  assert.equal(edited.updatedBy, 'member-avery');
  assert.equal(edited.updatedAt, 200);
  assert.equal(edited.attribution.updatedBy, 'member-avery');
  assert.equal(edited.attribution.updatedAt, 200);
  for (const field of ['status', 'eligibleDuties', 'schedulable', 'availability']) {
    assert.equal(edited.fieldAttribution[field].source, 'manual');
    assert.equal(edited.fieldAttribution[field].authority, 'member');
    assert.equal(edited.fieldAttribution[field].by, 'member-avery');
    assert.equal(edited.fieldAttribution[field].at, 200);
  }
});

test('history seed suggestions are idempotent and do not overwrite protected decisions', () => {
  const firstPlan = migration.planHistorySeed([
    { date: '2026-09-06', service: 'Morning', time: '09:00', assignments: {
      'Translation #1': 'M. Avery'
    } }
  ], { seededAt: 100, seededBy: 'history-import' });
  const seeded = migration.applyHistorySeedPlan([], firstPlan);
  assert.equal(seeded.length, 1);
  assert.deepEqual(seeded[0].eligibleDuties, ['Translation #1']);
  assert.equal(seeded[0].historySeed.source, HISTORY_SEED_SOURCE);

  const protectedProfile = updateDepartmentProfile(seeded[0], {
    status: PROFILE_STATUS_INACTIVE,
    eligibleDuties: ['Translation #2'],
    schedulable: false
  }, {
    by: 'leader-alpha',
    role: 'leader',
    at: 200
  });
  const laterPlan = migration.planHistorySeed([
    { date: '2026-09-13', service: 'Morning', time: '09:00', assignments: {
      'Translation #1': 'M. Avery',
      'Translation #2': 'M. Avery'
    } }
  ], { seededAt: 300, seededBy: 'history-import' });
  const imported = migration.applyHistorySeedPlan([protectedProfile], laterPlan);

  assert.equal(imported[0].status, PROFILE_STATUS_INACTIVE);
  assert.deepEqual(imported[0].eligibleDuties, ['Translation #2']);
  assert.equal(imported[0].schedulable, false);
  assert.equal(imported[0].updatedBy, 'history-import');
  assert.equal(imported[0].fieldAttribution.status.by, 'leader-alpha');
  assert.equal(imported[0].historySeed.evidence.length, 3);
  assert.deepEqual(
    migration.applyHistorySeedPlan(imported, laterPlan),
    imported
  );
});

test('history planner groups evidence, deduplicates it, and reports unsafe rows', () => {
  const plan = migration.planHistorySeed([
    { date: '2026-09-06', service: 'Morning', time: '09:00', assignments: {
      'Translation #1': 'M. Avery',
      'Translation #2': 'M. Avery',
      'Unknown Duty': 'M. Avery'
    } },
    { date: '2026-09-06', service: 'Morning', time: '09:00', assignments: {
      'Translation #1': 'M. Avery'
    } },
    { date: 'not-a-date', member: 'M. Rowan', duty: 'Presider' },
    { member: 'M. Rowan' }
  ], {
    seededAt: 400,
    seededBy: 'history-import',
    leaders: { Translation: ['M. Avery'] }
  });

  assert.equal(plan.suggestions.length, 1);
  assert.equal(plan.suggestions[0].role, 'leader');
  assert.deepEqual(plan.suggestions[0].eligibleDuties, ['Translation #1', 'Translation #2']);
  assert.equal(plan.suggestions[0].historySeed.evidence.length, 2);
  assert.deepEqual(plan.skipped.map(item => item.reason), [
    'unknown-duty',
    'invalid-date',
    'missing-member-or-duty'
  ]);
});

test('history seed can create a profile without touching runtime dependencies', () => {
  const suggestion = {
    id: 'worship::t-mina',
    department: 'Worship',
    member: 'T. Mina',
    role: 'member',
    status: PROFILE_STATUS_ACTIVE,
    eligibleDuties: ['Presider'],
    schedulable: true,
    historySeed: {
      source: HISTORY_SEED_SOURCE,
      seededBy: 'history-import',
      seededAt: 500,
      evidence: [{
        department: 'Worship',
        member: 'T. Mina',
        duty: 'Presider',
        date: '2026-09-06'
      }]
    }
  };
  const created = mergeHistorySeed(null, suggestion, { at: 500 });
  assert.equal(created.id, 'worship::t-mina');
  assert.equal(created.fieldAttribution.status.source, 'history-seed');
  assert.equal(created.historySeed.evidence[0].duty, 'Presider');
  assert.equal(typeof createDepartmentProfile, 'function');
});
