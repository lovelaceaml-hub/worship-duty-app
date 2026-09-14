'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const seed = require('../department-seed.js');
const sheetProtection = require('../sheet-protection.js');

const identity = [{ uid: 'uid-avery', memberName: 'Avery Example' }];

test('sheet sync keeps existing per-duty merge behavior while planning protected profile evidence', () => {
  const service = {
    date: '2026-09-06',
    service: 'Morning',
    time: '09:00',
    worship: 'Sabbath',
    assignments: { Presider: 'Avery Example' }
  };
  const existingSchedule = {
    '2026-09-06_morning': {
      date: '2026-09-06',
      service: 'Morning',
      time: '09:00',
      worship: 'Sabbath',
      assignments: { Presider: 'Former', 'Usher Door': 'Keep' }
    }
  };
  const plan = sheetProtection.planSheetSync({
    services: [service],
    identities: identity,
    existingSchedules: existingSchedule,
    existingProfiles: []
  }, { seededAt: 100, seededBy: 'sheet-sync' });

  assert.deepEqual(plan.schedule.updates[0].patch, {
    assignments: { Presider: 'Avery Example', 'Usher Door': 'Keep' }
  });
  assert.equal(plan.seedPlan.suggestions[0].memberUid, 'uid-avery');
  assert.equal(plan.profiles.writes[0].path, 'departments/Worship/members/uid-avery');
  assert.equal(plan.readOnly, true);
  assert.equal(plan.productionAccess, false);
  assert.ok(plan.rollbackPlan.length >= 2);
});

test('sheet sync plan application is disabled unless explicitly enabled', async () => {
  const plan = sheetProtection.planSheetSync({
    services: [{
      date: '2026-09-06', service: 'Morning', time: '09:00', assignments: { Presider: 'Avery Example' }
    }],
    identities: identity,
    existingSchedules: {},
    existingProfiles: []
  }, { seededAt: 100, seededBy: 'sheet-sync' });
  let writes = 0;
  const adapter = {
    async read() { writes += 1; return null; },
    async set() { writes += 1; },
    async delete() { writes += 1; }
  };
  const result = await sheetProtection.applySheetSyncPlan(plan, {
    schedule: adapter,
    profiles: adapter
  });
  assert.equal(result.applied, false);
  assert.equal(result.writesAttempted, 0);
  assert.equal(writes, 0);
});

test('imported profiles preserve manual decisions while adding evidence', () => {
  const first = seed.planHistorySeed([
    { date: '2026-09-06', assignments: { Presider: 'Avery Example' } }
  ], { identities: identity, seededAt: 100, seededBy: 'history-seed' });
  const [created] = seed.applyHistorySeedPlan([], first);
  const manual = {
    ...created,
    status: 'inactive',
    active: false,
    eligibleDuties: ['Presider'],
    duties: ['Presider'],
    schedulable: false,
    isSchedulable: false,
    fieldAttribution: Object.fromEntries([
      ['status', 'leader'],
      ['eligibleDuties', 'leader'],
      ['schedulable', 'leader'],
      ['availability', 'member']
    ].map(([field, authority]) => [field, {
      source: 'manual', authority, by: `${authority}-uid`, at: 200
    }]))
  };
  const later = seed.planHistorySeed([
    { date: '2026-09-13', assignments: { 'Prayer of Thanks': 'Avery Example' } }
  ], { identities: identity, seededAt: 300, seededBy: 'sheet-sync' });
  const merged = sheetProtection.mergeImportedProfile(manual, later.suggestions[0], { at: 300 });
  assert.equal(merged.status, 'inactive');
  assert.equal(merged.schedulable, false);
  assert.deepEqual(merged.eligibleDuties, ['Presider']);
  assert.equal(merged.historySeed.evidence.length, 2);
});
