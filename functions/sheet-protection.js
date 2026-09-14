'use strict';

/*
 * Sheet sync planning boundary.
 *
 * The schedule merge remains the existing sheet-lib per-service, per-duty
 * merge.  Department profile writes are planned separately so a sync can add
 * history evidence without changing a human's status, duty list,
 * schedulability, or availability decision.
 */

const sheetLib = require('./sheet-lib.js');
const seed = require('./department-seed.js');

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const output = {};
  Object.keys(value).forEach(key => { output[key] = clone(value[key]); });
  return output;
}

function mergedScheduleDocument(before, patch) {
  const next = { ...(before || {}), ...(patch || {}) };
  if (patch && patch.assignments) {
    next.assignments = {
      ...((before && before.assignments) || {}),
      ...patch.assignments
    };
  }
  return next;
}

function scheduleWritePlan(sheetPlan, existingById) {
  const existing = existingById || {};
  const writes = [];
  (sheetPlan.creates || []).forEach(create => {
    const path = `schedule/${create.id}`;
    writes.push({
      path,
      operation: 'create',
      before: null,
      after: clone(create.svc),
      precondition: { exists: false, fingerprint: seed.fingerprint(null) },
      rollback: {
        operation: 'delete',
        path,
        precondition: { exists: true, fingerprint: seed.fingerprint(create.svc) }
      }
    });
  });
  (sheetPlan.updates || []).forEach(update => {
    const before = clone(existing[update.id] || {});
    const path = `schedule/${update.id}`;
    writes.push({
      path,
      operation: 'update',
      before,
      after: mergedScheduleDocument(before, update.patch),
      precondition: { exists: true, fingerprint: seed.fingerprint(before) },
      rollback: {
        operation: 'set',
        path,
        data: before,
        precondition: {
          exists: true,
          fingerprint: seed.fingerprint(mergedScheduleDocument(before, update.patch))
        }
      }
    });
  });
  return writes;
}

function mergeImportedProfile(existing, suggestion, options = {}) {
  return seed.mergeSeedProfile(existing, suggestion, {
    ...options,
    source: 'import',
    seededBy: options.seededBy || options.importedBy || 'sheet-sync'
  });
}

function planSheetSync(input = {}, options = {}) {
  const parsed = input.parsed && typeof input.parsed === 'object' ? input.parsed : input;
  const services = Array.isArray(parsed.services) ? parsed.services : [];
  const existingSchedules = input.existingSchedules || input.existingById || {};
  const schedule = sheetLib.planMerge(services, existingSchedules);
  const identities = options.identities ?? input.identities;
  const seedPlan = seed.planHistorySeed(services, {
    ...options,
    identities,
    seededAt: options.seededAt ?? input.syncedAt ?? 0,
    seededBy: options.seededBy ?? input.syncedBy ?? 'sheet-sync'
  });
  const profiles = seed.planProfileWrites(
    input.existingProfiles || [],
    seedPlan,
    {
      ...options,
      source: 'import',
      seededBy: options.seededBy ?? input.syncedBy ?? 'sheet-sync',
      actor: options.actor || { by: options.importedBy || input.syncedBy || 'sheet-sync' },
      at: options.at ?? input.syncedAt ?? seedPlan.seededAt
    }
  );
  const scheduleWrites = scheduleWritePlan(schedule, existingSchedules);
  const rollbackPlan = [
    ...profiles.rollbackPlan,
    ...scheduleWrites.slice().reverse().map(write => clone(write.rollback))
  ];
  return {
    version: 1,
    mode: 'dry-run',
    readOnly: true,
    productionAccess: false,
    schedule: {
      ...schedule,
      writePlan: scheduleWrites,
      counts: {
        creates: schedule.creates.length,
        updates: schedule.updates.length,
        unchanged: services.length - schedule.creates.length - schedule.updates.length
      }
    },
    seedPlan,
    profiles,
    rollbackPlan
  };
}

async function applySheetSyncPlan(plan, adapters, options = {}) {
  if (!plan || !plan.schedule || !plan.profiles) throw new TypeError('sheet sync plan is invalid');
  if (options.execute !== true) {
    return {
      applied: false,
      mode: 'dry-run',
      writesAttempted: 0,
      rollbackPlan: clone(plan.rollbackPlan || [])
    };
  }
  // Executable adapters must expose Firestore-like transaction semantics or
  // an atomic compare-and-set/delete boundary. Read-then-write adapters are
  // intentionally rejected so a human edit after planning cannot be lost.
  const scheduleAdapter = adapters && adapters.schedule;
  const profileAdapter = adapters && adapters.profiles;
  const scheduleNeedsConditionalDelete = (plan.schedule.writePlan || []).some(write =>
    write && write.rollback && write.rollback.operation === 'delete'
  );
  if (!scheduleAdapter || (typeof scheduleAdapter.runTransaction !== 'function' &&
      (typeof scheduleAdapter.setIfUnchanged !== 'function' ||
       (scheduleNeedsConditionalDelete && typeof scheduleAdapter.deleteIfUnchanged !== 'function')))) {
    throw new TypeError(
      'an executable schedule adapter must provide runTransaction or conditional write methods'
    );
  }
  const applied = [];
  try {
    for (const write of plan.schedule.writePlan) {
      await seed.applyConditionalOperation(scheduleAdapter, {
        operation: 'set',
        path: write.path,
        data: write.after,
        precondition: write.precondition
      });
      applied.push({ adapter: scheduleAdapter, write });
    }
    if (plan.profiles.writes.length) {
      if (!profileAdapter) throw new TypeError('an executable profile adapter is required');
      await seed.applyProfileWritePlan(plan.profiles, profileAdapter, { execute: true });
      plan.profiles.writes.forEach(write => applied.push({ adapter: profileAdapter, write }));
    }
    return { applied: true, mode: 'execute', writesAttempted: applied.length, rolledBack: false };
  } catch (error) {
    const scheduleRollback = await seed.rollbackAppliedWrites(applied, { phase: 'rollback' });
    error.rollback = seed.mergeRollbackReports(error.rollback, scheduleRollback);
    throw error;
  }
}

module.exports = {
  mergeImportedProfile,
  protectSheetProfile: mergeImportedProfile,
  planSheetSync,
  createSheetSyncPlan: planSheetSync,
  applySheetSyncPlan,
  scheduleWritePlan
};
