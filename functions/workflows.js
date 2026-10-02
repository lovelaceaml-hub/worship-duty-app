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
const permissions = require('./permissions.js');
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
  profileWithPatch,
  authorizationCandidate
} = require('./department-handlers.js');
const { serviceStart, hasStarted } = require('./time.js');
const { canonicalName } = require('./names.js');
const { loadNameMap } = require('./app-docs.js');
const replacements = require('./replacements.js');

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

/* Duties in the app's order (app/config/duties.js ALL_DUTIES). */
const DUTY_ORDER = Object.values(permissions.DEPARTMENT_DUTIES).flat();
function dutyOrder(duties) {
  return Array.from(new Set(duties)).sort((a, b) => DUTY_ORDER.indexOf(a) - DUTY_ORDER.indexOf(b));
}

/* A service's assignments with every name in its current spelling. */
function canonicalAssignments(assignments, canonical) {
  const out = {};
  Object.keys(assignments || {}).forEach(duty => { out[duty] = canonical(assignments[duty]); });
  return out;
}

/* The availability with an 'available' day for one service (date and
   time key), or null when it already says so or cannot be read. */
function keptAvailable(value, date, key) {
  let availability;
  try {
    availability = authz.normalizeProfilePatch({ availability: value || {} }).availability;
  } catch (_error) {
    return null;
  }
  if ((availability.exceptions[date] || {})[key] === 'available') return null;
  availability.exceptions[date] = Object.assign({}, availability.exceptions[date], { [key]: 'available' });
  return availability;
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
    const nameMap = await loadNameMap(db);
    const canonical = name => canonicalName(name, nameMap);
    const services = await replacements.upcomingServices(db, at);
    let highestRevision = 0;
    const departmentsOut = [];
    let flagged = { marked: [], cleared: [] };

    await db.runTransaction(async transaction => {
      /* ---- reads: profiles, then the upcoming services where the member
         holds a duty of one of these departments ---- */
      const profileRefs = entries.map(entry => profileRef(db, entry.departmentId, memberUid));
      const profileSnapshots = await Promise.all(profileRefs.map(reference => transaction.get(reference)));
      profileSnapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) {
          throw errorWithCode('not-found', `The department member profile was not found: ${entries[index].departmentId}.`, { reason: 'profile-missing' });
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
        /* A department that already has these times is not written, since a
           write that changes nothing is refused; the caller must still be
           allowed to set them, as for a change. */
        const unchanged = JSON.stringify(before.availability) === JSON.stringify(entry.patch.availability);
        const asChange = unchanged ? Object.assign({}, before, { availability: null }) : before;
        rejectDecision(authz.authorizeProfileUpdate(actor, asChange, authorizationCandidate(before, next)));
        if (unchanged) return { departmentId: entry.departmentId, reference: profileRefs[index], before, next: before, unchanged: true };
        return { departmentId: entry.departmentId, reference: profileRefs[index], before, next };
      });

      const serviceIds = new Set();
      candidates.forEach(candidate => replacements.servicesHolding(services, candidate.departmentId,
        canonical(candidate.next.memberName || candidate.next.member), canonical).forEach(id => serviceIds.add(id)));
      const ids = Array.from(serviceIds);
      const scheduleSnapshots = ids.length ? await transaction.getAll(...ids.map(id => db.collection('schedule').doc(id))) : [];
      const byId = {};
      ids.forEach((id, index) => { byId[id] = scheduleSnapshots[index].exists ? scheduleSnapshots[index].data() || {} : null; });

      /* ---- writes: profiles, then one write per service for its flags ---- */
      candidates.forEach(candidate => {
        if (!candidate.unchanged) transaction.set(candidate.reference, candidate.next, { merge: false });
        const revision = currentRevision(candidate.next);
        if (revision > highestRevision) highestRevision = revision;
        departmentsOut.push({ departmentId: candidate.departmentId, revision, profile: candidate.next });
      });
      flagged = replacements.writeFlags(transaction, db, candidates.flatMap(candidate => replacements.flagChanges({
        profile: candidate.next, departmentId: candidate.departmentId, memberUid, byId, canonical, at, markedByUid: actor.uid
      })));
    });

    return {
      ok: true,
      revision: highestRevision,
      departments: departmentsOut,
      replacements: flagged
    };
  }

  /* ================= 2. atomic request / assignment resolution ================= */

  /* A leader answers a change request or a flagged duty, in one step:
     - a request (requestId): approve and hand the duty to someone, approve
       and leave it open, or decline. Approving needs the service and needs
       the member who asked to still hold the duty (not-holder otherwise);
       declining works even when the service was moved, deleted or has
       started, so a stale request can always be closed;
     - a flagged duty (no requestId): hand it to someone, leave it open, or
       keep the member on it (decision 'keep'), which removes the flag.
     A service that has started is not changed (service-started). Names are
     compared in their current spelling. */
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
    const duty = authz.exactDuty(data.duty);
    if (!permissions.DEPARTMENTS.includes(departmentId)) throw errorWithCode('invalid-argument', 'departmentId is required.');
    if (!serviceId) throw errorWithCode('invalid-argument', 'serviceId is required.');
    if (!duty) throw errorWithCode('invalid-argument', 'duty must be one of the duties.');
    if (authz.departmentForDuty(duty) !== departmentId) {
      throw errorWithCode('failed-precondition', 'That duty belongs to another department.', { reason: 'duty-department-mismatch' });
    }
    const requestId = data.requestId == null ? '' : text(data.requestId);
    const decision = data.decision == null ? null : text(data.decision);
    if (requestId && decision !== 'approved' && decision !== 'declined') {
      throw errorWithCode('invalid-argument', "decision must be 'approved' or 'declined' for a request.");
    }
    if (!requestId && decision != null && decision !== 'keep') {
      throw errorWithCode('invalid-argument', "Without a request, decision may only be 'keep'.");
    }
    const hasReplacement = data.replacementMemberUid != null;
    const replacementMemberUid = hasReplacement ? text(data.replacementMemberUid) : '';
    if (hasReplacement && (!replacementMemberUid || decision === 'declined' || decision === 'keep')) {
      throw errorWithCode('invalid-argument', 'replacementMemberUid is only allowed when the duty goes to someone.');
    }
    // Only an administrator may knowingly make a double duty; for a leader
    // the double-duty rule holds here as on every other path.
    const acknowledgeConflict = data.acknowledgeConflict === true && authz.isAdministrator(actor);
    const expectedRevision = data.expectedRevision;
    const expectedMemberName = data.expectedMemberName;

    if (!authz.isAdministrator(actor) && !authz.managesDepartment(actor, departmentId)) {
      throw errorWithCode('permission-denied', 'You do not lead that department.', { reason: 'cross-department' });
    }

    const nameMap = await loadNameMap(db);
    const canonical = name => canonicalName(name, nameMap);
    const scheduleReference = db.collection('schedule').doc(serviceId);
    const requestReference = requestId ? db.collection('requests').doc(requestId) : null;
    const resolution = status => Object.assign({
      status, resolvedAt: now(), resolvedByUid: actor.uid, resolvedByName: displayName(actor), resolvedBy: actor.uid
    });

    let revisionValue;
    let record = null;
    let memberName = '';
    let requestStatus = null;
    let kept = false;
    let markedAvailable = false;

    await db.runTransaction(async transaction => {
      const scheduleSnapshot = await transaction.get(scheduleReference);
      const requestSnapshot = requestReference ? await transaction.get(requestReference) : null;
      let requestData = null;
      if (requestReference) {
        if (!requestSnapshot.exists) throw errorWithCode('not-found', 'The request was not found.', { reason: 'request-missing' });
        requestData = requestSnapshot.data() || {};
        if (requestData.status !== 'pending') {
          throw errorWithCode('failed-precondition', 'The request was already answered or withdrawn.', { reason: 'request-closed', status: String(requestData.status || '') });
        }
        const requestDepartment = requestData.department || requestData.departmentId || '';
        if (requestData.svcId !== serviceId || authz.exactDuty(requestData.duty) !== duty ||
            (requestDepartment && requestDepartment !== departmentId)) {
          throw errorWithCode('failed-precondition', 'The request does not match this service and duty.', { reason: 'request-mismatch' });
        }
      }

      if (decision === 'declined') {
        // Declining closes the request and leaves the duty as it is, so it
        // works for a service that was moved, deleted or has started.
        const scheduleData = scheduleSnapshot.exists ? scheduleSnapshot.data() || {} : {};
        memberName = String((scheduleData.assignments || {})[duty] || '');
        revisionValue = currentRevision({ revision: (scheduleData.assignmentRevisions || {})[duty] });
        transaction.set(requestReference, resolution('declined'), { merge: true });
        requestStatus = 'declined';
        return;
      }

      if (!scheduleSnapshot.exists) {
        throw errorWithCode('not-found', requestReference
          ? 'That service was moved or deleted. Decline the request to close it.'
          : 'That service was moved or deleted.', { reason: 'service-missing' });
      }
      const scheduleData = scheduleSnapshot.data() || {};
      if (hasStarted(scheduleData, now())) {
        throw errorWithCode('failed-precondition', 'That service has already started. Its duties stay as they are.', { reason: 'service-started' });
      }

      /* Same derivation as assignmentForSchedule in department-handlers.js:
         the slot's serviceTime is a slug of the schedule's service label,
         not a clock time. */
      const slotServiceDate = String(scheduleData.date || '').trim();
      const slotServiceTime = authz.serviceTimeKey(scheduleData);
      if (!slotServiceDate || !slotServiceTime) {
        throw errorWithCode('failed-precondition', 'The schedule service identity is incomplete.', { reason: 'invalid-service' });
      }

      const assignmentRevisions = scheduleData.assignmentRevisions || {};
      const assignments = scheduleData.assignments || {};
      const currentMemberName = String(assignments[duty] || '');
      const holder = canonical(currentMemberName);
      memberName = currentMemberName;
      const flag = (scheduleData.needsReplacement || {})[duty];

      if (decision === 'keep') {
        const expected = flag ? flag.memberName : expectedMemberName;
        if (expected != null && canonical(expected) !== holder) {
          throw errorWithCode('failed-precondition', 'That member is no longer on that duty.', { reason: 'not-holder', memberName: currentMemberName });
        }
        /* The member comes after all: their record now says available for
           this one service, so a later save of their availability does not
           flag the duty again. It is one record for all their departments
           (their own save writes them all), so every profile gets the same
           day; their other services that day stay as they set them. A flag
           in another department stays for its leader to answer. */
        const memberUid = flag && typeof flag.memberUid === 'string' ? flag.memberUid.trim() : '';
        const profileRefs = memberUid ? permissions.DEPARTMENTS.map(department => profileRef(db, department, memberUid)) : [];
        const profileSnapshots = profileRefs.length ? await transaction.getAll(...profileRefs) : [];
        const at = now();
        profileSnapshots.forEach((snapshot, index) => {
          if (!snapshot.exists) return;
          const before = snapshot.data() || {};
          if (canonical(before.memberName || before.member) !== holder) return;
          const availability = keptAvailable(before.availability, slotServiceDate, slotServiceTime);
          if (!availability) return;
          const next = profileWithPatch(before, { availability }, actor, at);
          next.revision = nextRevision(before);
          transaction.set(profileRefs[index], next, { merge: false });
          markedAvailable = true;
        });
        if (flag) transaction.set(scheduleReference, { needsReplacement: { [duty]: deleteField() } }, { merge: true });
        revisionValue = currentRevision({ revision: assignmentRevisions[duty] });
        kept = true;
        return;
      }

      assertFresh({
        expectedRevision,
        expectedWitness: expectedMemberName == null ? undefined : canonical(expectedMemberName),
        currentRevision: currentRevision({ revision: assignmentRevisions[duty] }),
        currentWitness: holder,
        details: { memberName: currentMemberName }
      });

      // An approval acts for the member who asked: once someone else holds
      // the duty, the request can only be closed (declined).
      if (requestData && (!holder || holder !== canonical(requestData.name))) {
        throw errorWithCode('failed-precondition', 'The member who asked is no longer on that duty. Decline the request to close it.', {
          reason: 'not-holder', memberName: currentMemberName
        });
      }

      const slotAssignment = {
        departmentId, memberUid: '', memberName: '', duty,
        serviceId, serviceDate: slotServiceDate, serviceTime: slotServiceTime
      };
      const slotReference = db.collection('departmentAssignments').doc(assignmentIdFor(slotAssignment));
      const slotSnapshot = await transaction.get(slotReference);

      if (hasReplacement) {
        const replacementReference = profileRef(db, departmentId, replacementMemberUid);
        const replacementSnapshot = await transaction.get(replacementReference);
        if (!replacementSnapshot.exists) throw errorWithCode('not-found', 'The department member profile was not found.', { reason: 'profile-missing' });
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
        const conflictDuties = permissions.blockingDuties(canonicalAssignments(assignments, canonical), canonical(targetName), duty);
        if (conflictDuties.length && !acknowledgeConflict) {
          throw errorWithCode('failed-precondition', 'The member already serves in this service.', {
            reason: 'already-serving', duties: conflictDuties
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
           needsReplacement clear, and any conflictOk mark all land in a
           single merge:true set. */
        const scheduleUpdate = {
          assignments: { [duty]: record.memberName },
          assignmentRevisions: { [duty]: revisionValue }
        };
        if (flag) scheduleUpdate.needsReplacement = { [duty]: deleteField() };
        if (conflictDuties.length) {
          // The mark lists exactly the duties the person holds now, in the
          // app's duty order, which is what isMarkedOk (app/lib/conflicts.js)
          // compares; an older mark for other duties no longer counts.
          scheduleUpdate.conflictOk = { [targetName]: dutyOrder([...conflictDuties, duty]) };
        }
        transaction.set(scheduleReference, scheduleUpdate, { merge: true });

        if (requestReference) {
          transaction.set(requestReference, Object.assign(resolution('approved'), {
            assignmentId: record.id, replacementName: record.memberName
          }), { merge: true });
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
      if (flag) scheduleUpdate.needsReplacement = { [duty]: deleteField() };
      transaction.set(scheduleReference, scheduleUpdate, { merge: true });
      if (requestReference) {
        transaction.set(requestReference, Object.assign(resolution('approved'), { assignmentId: null }), { merge: true });
        requestStatus = 'approved';
      }
    });

    return Object.assign({
      ok: true,
      revision: revisionValue,
      serviceId,
      duty,
      memberName: record ? record.memberName : (decision === 'declined' || kept ? memberName : ''),
      assignment: record,
      requestId: requestId || null,
      requestStatus
    }, kept ? { kept: true, markedAvailable } : {});
  }

  /* ============================ 4.3 automatic recorder ============================ */

  /* A list counts once it has been confirmed, even if it changed after
     (a song swapped during the service): its songs then are what was sung. */
  const confirmedOnce = data => Number(data.confirmedAt || 0) > 0;

  async function recordSongHistory() {
    const nowMs = now();
    const snapshot = await db.collection('setlists').where('status', '==', 'planned').get();
    const candidates = snapshot.docs
      .map(document => ({ id: document.id, data: document.data() || {} }))
      // The floor is applied in memory, not as a Firestore inequality, so no
      // composite index is needed. A missing or malformed date fails closed.
      .filter(({ data }) => Array.isArray(data.songs) && data.songs.length &&
        text(data.date) >= SONG_HISTORY_FLOOR_DATE && confirmedOnce(data));

    let recorded = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const scheduleSnapshot = await db.collection('schedule').doc(candidate.id).get();
      let scheduleData;
      if (scheduleSnapshot.exists) {
        scheduleData = scheduleSnapshot.data() || {};
        if (scheduleData.status === 'canceled' || scheduleData.status === 'cancelled') { skipped += 1; continue; }
      } else if (candidate.data.noService === true) {
        // Planned for a date with no scheduled service ("Plan another date"):
        // it counts at its own date and label.
        scheduleData = { date: candidate.data.date, service: candidate.data.serviceLabel || '' };
      } else {
        // Its service was deleted or moved, so it was not sung there.
        skipped += 1;
        continue;
      }
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
          if (!confirmedOnce(setlist)) return;

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
