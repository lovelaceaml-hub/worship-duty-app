'use strict';

/*
 * Three server workflows:
 * - saveMemberAvailability: a member's availability for every department they
 *   belong to, in one step. Duties they can no longer make are flagged on the
 *   service (schedule.needsReplacement) for their leader.
 * - resolveDutyAttention: a leader answers a change request or a flagged duty
 *   in one step: approve and hand the duty to someone, approve and leave it
 *   open, or decline.
 * - recordSongHistory: every 30 minutes, confirmed song lists whose service
 *   ended (three hours after its start) are recorded as sung.
 *
 * Follows the same conventions as department-handlers.js: requestActor()
 * verifies the caller, inputData() validates a plain object, an explicit
 * allowed-fields Set rejects the first unknown field, every transaction
 * reads all documents before its first write, and errorWithCode carries an
 * optional `details` payload the callable wrapper forwards to the client.
 */

const { FieldValue } = require('firebase-admin/firestore');
const authz = require('./department-auth.js');
const songHistory = require('./song-history.js');
const { currentRevision, nextRevision, assertFresh } = require('./revision.js');

function deleteField() {
  return FieldValue.delete();
}
const {
  requestActor,
  inputData,
  profileRef,
  assignmentRecord,
  errorWithCode,
  rejectDecision,
  assignmentIdFor,
  profileWithPatch
} = require('./department-handlers.js');
const { pacificDate, serviceStart } = require('./time.js');

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
// Release day. The automatic recorder only ever considers services on or after
// this Pacific service date, so the pre-release back catalogue is never touched.
const SONG_HISTORY_FLOOR_DATE = '2026-09-17';

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function displayName(actor) {
  return actor.token.memberName || actor.token.member || actor.uid;
}

function text(value, max) {
  const out = String(value == null ? '' : value).trim();
  return max ? out.slice(0, max) : out;
}

function createWorkflowHandlers(options = {}) {
  const db = options.db;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const logger = options.logger || console;
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('createWorkflowHandlers requires a Firestore database.');
  }
  if (typeof db.runTransaction !== 'function') {
    throw new TypeError('createWorkflowHandlers requires transaction support.');
  }

  /* ============================= 1. availability ============================= */

  async function saveMemberAvailability(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    const allowed = new Set(['memberUid', 'departments']);
    const unknown = Object.keys(data).find(key => !allowed.has(key));
    if (unknown) throw errorWithCode('invalid-argument', `Field is not allowed: ${unknown}.`);
    const memberUid = text(data.memberUid);
    if (!memberUid) throw errorWithCode('invalid-argument', 'memberUid is required.');
    if (!Array.isArray(data.departments) || data.departments.length < 1 || data.departments.length > 20) {
      throw errorWithCode('invalid-argument', 'departments must be an array of 1 to 20 entries.');
    }
    const seenDepartments = new Set();
    const entries = data.departments.map(item => {
      if (!plainObject(item)) throw errorWithCode('invalid-argument', 'Each departments entry must be an object.');
      const itemAllowed = new Set(['departmentId', 'availability', 'expectedRevision', 'expectedUpdatedAt']);
      const itemUnknown = Object.keys(item).find(key => !itemAllowed.has(key));
      if (itemUnknown) throw errorWithCode('invalid-argument', `Field is not allowed: ${itemUnknown}.`);
      const departmentId = text(item.departmentId);
      if (!departmentId) throw errorWithCode('invalid-argument', 'departmentId is required.');
      if (seenDepartments.has(departmentId)) {
        throw errorWithCode('invalid-argument', `Duplicate departmentId: ${departmentId}.`);
      }
      seenDepartments.add(departmentId);
      let patch;
      try {
        patch = authz.normalizeProfilePatch({ availability: item.availability });
      } catch (error) {
        throw errorWithCode('invalid-argument', error.message);
      }
      return {
        departmentId,
        patch,
        expectedRevision: item.expectedRevision,
        expectedUpdatedAt: item.expectedUpdatedAt
      };
    });

    const at = now();
    const today = pacificDate(new Date(at));
    let highestRevision = 0;
    const departmentsOut = [];
    const marked = [];
    const cleared = [];

    await db.runTransaction(async transaction => {
      /* ---- reads: profiles, then per-department assignment queries and
         the schedule docs they touch ---- */
      const profileRefs = entries.map(entry => profileRef(db, entry.departmentId, memberUid));
      const profileSnapshots = await Promise.all(profileRefs.map(reference => transaction.get(reference)));
      profileSnapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) {
          throw errorWithCode('not-found', `The department member profile was not found: ${entries[index].departmentId}.`);
        }
      });

      const candidates = entries.map((entry, index) => {
        const before = profileSnapshots[index].data() || {};
        assertFresh({
          expectedRevision: entry.expectedRevision,
          expectedWitness: entry.expectedUpdatedAt,
          currentRevision: currentRevision(before),
          currentWitness: before.updatedAt,
          details: { revision: currentRevision(before), updatedAt: before.updatedAt, updatedBy: before.updatedBy }
        });
        const next = profileWithPatch(before, entry.patch, actor, at);
        next.revision = nextRevision(before);
        const authorizationCandidate = { ...next };
        if (Object.prototype.hasOwnProperty.call(before, 'attribution')) {
          authorizationCandidate.attribution = before.attribution;
        } else {
          delete authorizationCandidate.attribution;
        }
        if (Object.prototype.hasOwnProperty.call(before, 'fieldAttribution')) {
          authorizationCandidate.fieldAttribution = before.fieldAttribution;
        } else {
          delete authorizationCandidate.fieldAttribution;
        }
        const result = authz.authorizeProfileUpdate(actor, before, authorizationCandidate);
        rejectDecision(result);
        return { departmentId: entry.departmentId, reference: profileRefs[index], before, next };
      });

      const assignmentQuerySnapshots = await Promise.all(candidates.map(candidate =>
        transaction.get(db.collection('departmentAssignments')
          .where('departmentId', '==', candidate.departmentId)
          .where('memberUid', '==', memberUid))
      ));

      const relevantByDepartment = candidates.map((candidate, index) => {
        const records = assignmentQuerySnapshots[index].docs
          .map(document => document.data() || {})
          .filter(record => record.serviceId && record.serviceDate >= today);
        return { candidate, records };
      });

      const scheduleIds = new Set();
      relevantByDepartment.forEach(({ records }) => records.forEach(record => scheduleIds.add(record.serviceId)));
      const scheduleRefs = Array.from(scheduleIds).map(id => db.collection('schedule').doc(id));
      const scheduleSnapshots = await Promise.all(scheduleRefs.map(reference => transaction.get(reference)));
      const scheduleById = {};
      scheduleRefs.forEach((reference, index) => {
        scheduleById[reference.id] = { reference, snapshot: scheduleSnapshots[index] };
      });

      /* ---- writes: profiles, then needs-replacement markers ---- */
      relevantByDepartment.forEach(({ candidate }) => {
        transaction.set(candidate.reference, candidate.next, { merge: false });
        if (candidate.next.revision > highestRevision) highestRevision = candidate.next.revision;
        departmentsOut.push({ departmentId: candidate.departmentId, revision: candidate.next.revision, profile: candidate.next });
      });

      /* Firestore forbids a second write to the same document reference
         within one transaction, and two different duties (even across
         departments) can land on the same schedule document, so every
         needsReplacement change for a given service is accumulated here
         and written with exactly one transaction.set per document. */
      const needsReplacementPatchByServiceId = new Map();
      const patchFor = serviceId => {
        if (!needsReplacementPatchByServiceId.has(serviceId)) needsReplacementPatchByServiceId.set(serviceId, {});
        return needsReplacementPatchByServiceId.get(serviceId);
      };

      relevantByDepartment.forEach(({ candidate, records }) => {
        records.forEach(record => {
          const entry = scheduleById[record.serviceId];
          if (!entry || !entry.snapshot.exists) return;
          const scheduleData = entry.snapshot.data() || {};
          const assignments = scheduleData.assignments || {};
          if (String(assignments[record.duty] || '') !== String(record.memberName || '')) return;
          const scheduled = authz.profileForScheduling(candidate.next);
          if (!scheduled) return;
          const effective = authz.effectiveAvailability(scheduled, record.serviceDate, record.serviceTime);
          const needsReplacement = scheduleData.needsReplacement || {};
          const existingMarker = needsReplacement[record.duty];
          if (effective === 'unavailable' && !existingMarker) {
            patchFor(record.serviceId)[record.duty] = {
              memberName: record.memberName || '',
              memberUid,
              departmentId: candidate.departmentId,
              reason: 'unavailable',
              since: at,
              markedByUid: actor.uid
            };
            marked.push({ serviceId: record.serviceId, duty: record.duty });
          } else if (effective === 'available' && existingMarker &&
              existingMarker.reason === 'unavailable' && existingMarker.memberUid === memberUid) {
            patchFor(record.serviceId)[record.duty] = deleteField();
            cleared.push({ serviceId: record.serviceId, duty: record.duty });
          }
        });
      });

      needsReplacementPatchByServiceId.forEach((patch, serviceId) => {
        const entry = scheduleById[serviceId];
        transaction.set(entry.reference, { needsReplacement: patch }, { merge: true });
      });
    });

    return {
      ok: true,
      revision: highestRevision,
      departments: departmentsOut,
      replacements: { marked, cleared }
    };
  }

  /* ================= 2. atomic request / assignment resolution ================= */

  async function resolveDutyAttention(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    const allowed = new Set([
      'departmentId', 'serviceId', 'duty', 'requestId', 'decision',
      'replacementMemberUid', 'acknowledgeConflict', 'expectedRevision', 'expectedMemberName'
    ]);
    const unknown = Object.keys(data).find(key => !allowed.has(key));
    if (unknown) throw errorWithCode('invalid-argument', `Field is not allowed: ${unknown}.`);

    const departmentId = text(data.departmentId);
    const serviceId = text(data.serviceId);
    const duty = text(data.duty);
    if (!departmentId) throw errorWithCode('invalid-argument', 'departmentId is required.');
    if (!serviceId) throw errorWithCode('invalid-argument', 'serviceId is required.');
    if (!duty) throw errorWithCode('invalid-argument', 'duty is required.');
    if (authz.departmentForDuty(duty) !== departmentId) {
      throw errorWithCode('failed-precondition', 'Department authorization denied: duty-department-mismatch.');
    }
    const requestId = data.requestId == null ? '' : text(data.requestId);
    if (requestId && data.decision == null) {
      throw errorWithCode('invalid-argument', 'decision is required when requestId is present.');
    }
    if (!requestId && data.decision != null) {
      throw errorWithCode('invalid-argument', 'decision is not allowed without requestId.');
    }
    const decision = data.decision == null ? null : text(data.decision);
    if (decision != null && decision !== 'approved' && decision !== 'declined') {
      throw errorWithCode('invalid-argument', "decision must be 'approved' or 'declined'.");
    }
    const hasReplacement = Object.prototype.hasOwnProperty.call(data, 'replacementMemberUid') &&
      data.replacementMemberUid != null;
    if (hasReplacement && decision === 'declined') {
      throw errorWithCode('invalid-argument', 'replacementMemberUid is not allowed with decision: declined.');
    }
    const replacementMemberUid = hasReplacement ? text(data.replacementMemberUid) : '';
    const acknowledgeConflict = data.acknowledgeConflict === true;
    const expectedRevision = data.expectedRevision;
    const expectedMemberName = data.expectedMemberName;

    if (!authz.isAdministrator(actor) && !authz.managesDepartment(actor, departmentId)) {
      throw errorWithCode('permission-denied', 'Department authorization denied: profile-write-not-authorized.');
    }

    const scheduleReference = db.collection('schedule').doc(serviceId);
    const requestReference = requestId ? db.collection('requests').doc(requestId) : null;

    let revisionValue;
    let record = null;
    let memberName = '';
    let requestStatus = null;

    await db.runTransaction(async transaction => {
      const scheduleSnapshot = await transaction.get(scheduleReference);
      if (!scheduleSnapshot.exists) throw errorWithCode('not-found', 'The schedule service was not found.');
      const scheduleData = scheduleSnapshot.data() || {};

      const requestSnapshot = requestReference ? await transaction.get(requestReference) : null;
      if (requestReference) {
        if (!requestSnapshot.exists) throw errorWithCode('not-found', 'The request was not found.');
        const requestData = requestSnapshot.data() || {};
        if (requestData.status !== 'pending') {
          throw errorWithCode('failed-precondition', 'The request is no longer pending.');
        }
        if (requestData.svcId !== serviceId || requestData.duty !== duty) {
          throw errorWithCode('failed-precondition', 'The request does not match this service and duty.');
        }
        const requestDepartment = requestData.department || requestData.departmentId || '';
        if (requestDepartment && requestDepartment !== departmentId) {
          throw errorWithCode('failed-precondition', 'The request does not match this department.');
        }
      }

      /* Same derivation as assignmentForSchedule in department-handlers.js:
         the slot's serviceTime is a slug of the schedule's service label,
         not a clock time. */
      const slotServiceDate = String(scheduleData.date || '').trim();
      const slugSource = scheduleData.serviceTime || scheduleData.service || scheduleData.time || '';
      const slotServiceTime = String(slugSource).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!slotServiceDate || !slotServiceTime) {
        throw errorWithCode('failed-precondition', 'The schedule service identity is incomplete.');
      }

      const assignmentRevisions = scheduleData.assignmentRevisions || {};
      const assignments = scheduleData.assignments || {};
      const currentMemberName = String(assignments[duty] || '');
      memberName = currentMemberName;

      assertFresh({
        expectedRevision,
        expectedWitness: expectedMemberName,
        currentRevision: currentRevision({ revision: assignmentRevisions[duty] }),
        currentWitness: currentMemberName,
        details: { memberName: currentMemberName }
      });

      const slotAssignment = {
        departmentId, memberUid: '', memberName: '', duty,
        serviceId, serviceDate: slotServiceDate, serviceTime: slotServiceTime
      };
      const slotReference = db.collection('departmentAssignments').doc(assignmentIdFor(slotAssignment));
      const slotSnapshot = await transaction.get(slotReference);

      if (decision === 'declined') {
        revisionValue = currentRevision({ revision: assignmentRevisions[duty] });
        if (requestReference) {
          transaction.set(requestReference, {
            status: 'declined',
            resolvedAt: now(),
            resolvedByUid: actor.uid,
            resolvedByName: displayName(actor),
            resolvedBy: actor.uid
          }, { merge: true });
          requestStatus = 'declined';
        }
        return;
      }

      if (hasReplacement) {
        const replacementReference = profileRef(db, departmentId, replacementMemberUid);
        const replacementSnapshot = await transaction.get(replacementReference);
        if (!replacementSnapshot.exists) throw errorWithCode('not-found', 'The department member profile was not found.');
        const profile = replacementSnapshot.data() || {};

        let normalized;
        try {
          normalized = authz.normalizeAssignment({
            departmentId, memberUid: replacementMemberUid, duty,
            serviceId, serviceDate: slotServiceDate, serviceTime: slotServiceTime
          });
        } catch (error) {
          throw errorWithCode('invalid-argument', error.message);
        }
        const result = authz.authorizeAssignment(actor, normalized, profile);
        rejectDecision(result);

        const targetName = String(profile.memberName || profile.member || '');
        const conflictDuties = Object.keys(assignments)
          .filter(otherDuty => otherDuty !== duty && String(assignments[otherDuty] || '') === targetName);
        if (conflictDuties.length && !acknowledgeConflict) {
          throw errorWithCode('failed-precondition', 'The member already serves in this service.', {
            reason: 'conflict', duties: conflictDuties
          });
        }

        revisionValue = nextRevision({ revision: assignmentRevisions[duty] });
        record = assignmentRecord(result.assignment, profile, actor, now(), {
          override: false,
          authorization: 'needs-attention-resolution',
          revision: revisionValue
        });
        transaction.set(slotReference, record, { merge: false });

        /* One combined write to the schedule document: Firestore forbids a
           second set/update on the same document reference within a
           transaction, so assignments, assignmentRevisions, the
           needsReplacement clear, and any conflictOk merge all land in a
           single merge:true set. */
        const scheduleUpdate = {
          assignments: { [duty]: record.memberName },
          assignmentRevisions: { [duty]: revisionValue }
        };
        if (scheduleData.needsReplacement && scheduleData.needsReplacement[duty]) {
          scheduleUpdate.needsReplacement = { [duty]: deleteField() };
        }
        if (conflictDuties.length && acknowledgeConflict) {
          const existing = (scheduleData.conflictOk && scheduleData.conflictOk[targetName]) || [];
          const merged = Array.from(new Set([...existing, ...conflictDuties, duty]));
          scheduleUpdate.conflictOk = { [targetName]: merged };
        }
        transaction.set(scheduleReference, scheduleUpdate, { merge: true });

        if (requestReference) {
          transaction.set(requestReference, {
            status: 'approved',
            resolvedAt: now(),
            resolvedByUid: actor.uid,
            resolvedByName: displayName(actor),
            resolvedBy: actor.uid,
            assignmentId: record.id
          }, { merge: true });
          requestStatus = 'approved';
        }
        return;
      }

      /* No replacement: open the duty. One combined write, see above. */
      revisionValue = nextRevision({ revision: assignmentRevisions[duty] });
      if (slotSnapshot.exists) transaction.delete(slotReference);
      const scheduleUpdate = {
        assignments: { [duty]: '' },
        assignmentRevisions: { [duty]: revisionValue }
      };
      if (scheduleData.needsReplacement && scheduleData.needsReplacement[duty]) {
        scheduleUpdate.needsReplacement = { [duty]: deleteField() };
      }
      transaction.set(scheduleReference, scheduleUpdate, { merge: true });
      if (requestReference) {
        transaction.set(requestReference, {
          status: 'approved',
          resolvedAt: now(),
          resolvedByUid: actor.uid,
          resolvedByName: displayName(actor),
          resolvedBy: actor.uid,
          assignmentId: null
        }, { merge: true });
        requestStatus = 'approved';
      }
    });

    return {
      ok: true,
      revision: revisionValue,
      serviceId,
      duty,
      memberName: record ? record.memberName : (decision === 'declined' ? memberName : ''),
      assignment: record,
      requestId: requestId || null,
      requestStatus
    };
  }

  /* ============================ 4.3 automatic recorder ============================ */

  async function recordSongHistory() {
    const nowMs = now();
    const snapshot = await db.collection('setlists').where('status', '==', 'planned').get();
    const candidates = snapshot.docs
      .map(document => ({ id: document.id, data: document.data() || {} }))
      // The floor is applied in memory, not as a Firestore inequality, so no
      // composite index is needed. A missing or malformed date fails closed.
      .filter(({ data }) => Array.isArray(data.songs) && data.songs.length &&
        text(data.date) >= SONG_HISTORY_FLOOR_DATE &&
        Number(data.confirmedAt || 0) >= Number(data.updatedAt || 0) && Number(data.confirmedAt || 0) > 0);

    let recorded = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const scheduleSnapshot = await db.collection('schedule').doc(candidate.id).get();
      if (!scheduleSnapshot.exists) { skipped += 1; continue; }
      const scheduleData = scheduleSnapshot.data() || {};
      if (scheduleData.status === 'canceled' || scheduleData.status === 'cancelled') { skipped += 1; continue; }
      const start = serviceStart(scheduleData);
      if (!Number.isFinite(start) || start + THREE_HOURS_MS > nowMs) { skipped += 1; continue; }

      const setlistReference = db.collection('setlists').doc(candidate.id);
      try {
        await db.runTransaction(async transaction => {
          const freshSnapshot = await transaction.get(setlistReference);
          if (!freshSnapshot.exists) return;
          const setlist = freshSnapshot.data() || {};
          if (setlist.status === 'sung') return;
          if (text(setlist.date) < SONG_HISTORY_FLOOR_DATE) return;
          if (!Array.isArray(setlist.songs) || !setlist.songs.length) return;
          if (!(Number(setlist.confirmedAt || 0) >= Number(setlist.updatedAt || 0) && Number(setlist.confirmedAt || 0) > 0)) return;

          const songIds = Array.from(new Set(setlist.songs));
          const statsRefs = songIds.map(id => db.collection('songStats').doc(id));
          const statsSnapshots = await Promise.all(statsRefs.map(reference => transaction.get(reference)));
          const statsMap = {};
          statsRefs.forEach((reference, index) => {
            if (statsSnapshots[index].exists) statsMap[reference.id] = statsSnapshots[index].data() || {};
          });

          const result = songHistory.applySung(statsMap, { id: setlist.id || candidate.id, date: setlist.date, songs: songIds }, {
            by: 'automatic-history', markedAt: nowMs, source: 'automatic'
          });
          Object.keys(result.changed).forEach(songId => {
            transaction.set(db.collection('songStats').doc(songId), result.changed[songId], { merge: false });
          });
          transaction.set(setlistReference, {
            status: 'sung',
            sungAt: nowMs,
            updatedAt: nowMs,
            updatedBy: 'automatic-history',
            historySource: 'automatic',
            recordedAt: nowMs,
            recordedBy: 'automatic-history',
            revision: nextRevision(setlist)
          }, { merge: true });
        });
        recorded += 1;
      } catch (error) {
        logger.error('recordSongHistory: transaction failed', { serviceId: candidate.id, error: String(error) });
      }
    }
    logger.info('recordSongHistory: done', { candidates: candidates.length, recorded, skipped });
    return { recorded, skipped };
  }

  return Object.freeze({
    saveMemberAvailability,
    resolveDutyAttention,
    recordSongHistory
  });
}

module.exports = {
  createWorkflowHandlers
};
