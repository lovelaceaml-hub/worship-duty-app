'use strict';

/* The departmentAssignments records (one per department duty in a service,
   naming the member's profile) follow the schedule: a trigger runs this
   after every schedule write. Firestore delivers triggers at least once and
   in any order, so this works from the service as it is now, read in a
   transaction, not from the event's copy: an event that arrives late cannot
   put an older name back or lift a newer flag. It also lifts a "needs a
   replacement" flag once its duty has changed hands, for the writes that do
   not know about flags (the Sheet, an administrator's direct edit). */
const { FieldValue } = require('firebase-admin/firestore');
const permissions = require('./permissions.js');
const authz = require('./department-auth.js');
const { canonicalName } = require('./names.js');
const { loadNameMap } = require('./app-docs.js');
const { assignmentIdFor } = require('./department-handlers.js');
const { nextRevision } = require('./revision.js');

async function reconcileScheduleAssignmentProjection({ db, logger, now = () => Date.now() }, serviceId, before, after) {
  const beforeAssignments = (before && before.assignments) || {};
  const afterAssignments = (after && after.assignments) || {};
  const changedDuties = Array.from(new Set([...Object.keys(beforeAssignments), ...Object.keys(afterAssignments)]))
    .filter(duty => beforeAssignments[duty] !== afterAssignments[duty]);
  if (!changedDuties.length) return;
  const nameMap = await loadNameMap(db);
  const canonical = name => canonicalName(name, nameMap);
  const scheduleReference = db.collection('schedule').doc(serviceId);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(scheduleReference);
    const current = snapshot.exists ? snapshot.data() || {} : null;
    const assignments = current ? current.assignments || {} : {};
    // The service's date and time come from it as it is now, or from the
    // event's copy once it is deleted.
    const identity = current || before || after || {};

    /* ---- reads: each changed duty's record, and the profile it names ---- */
    const plans = [];
    for (const duty of changedDuties) {
      const departmentId = permissions.departmentForDuty(duty);
      if (!departmentId) continue;
      const assignment = { departmentId, serviceId, serviceDate: identity.date, serviceTime: authz.serviceTimeKey(identity), duty };
      const reference = db.collection('departmentAssignments').doc(assignmentIdFor(assignment));
      const name = canonical(assignments[duty]);
      const existing = await transaction.get(reference);
      const upToDate = existing.exists && canonical((existing.data() || {}).memberName) === name;
      const profiles = name && !upToDate
        ? await transaction.get(db.collection('departments').doc(departmentId).collection('members').where('memberName', '==', name).limit(2))
        : null;
      plans.push({ duty, departmentId, assignment, reference, name, existing, profiles });
    }

    /* ---- writes: flags whose duty changed hands, then the records ---- */
    const flags = current ? current.needsReplacement || {} : {};
    const clears = {};
    changedDuties.forEach(duty => {
      const flag = flags[duty];
      if (flag && canonical(assignments[duty]) !== canonical(flag.memberName)) clears[duty] = FieldValue.delete();
    });
    if (Object.keys(clears).length) transaction.set(scheduleReference, { needsReplacement: clears }, { merge: true });
    plans.forEach(plan => {
      if (!plan.name) {
        if (plan.existing.exists) transaction.delete(plan.reference);
        return;
      }
      if (!plan.profiles) return; // the record already names this member
      if (plan.profiles.size !== 1) {
        if (plan.existing.exists) transaction.delete(plan.reference);
        logger.warn('schedule projection profile was not unique', { serviceId, duty: plan.duty, departmentId: plan.departmentId });
        return;
      }
      const profileDocument = plan.profiles.docs[0];
      const profile = profileDocument.data() || {};
      transaction.set(plan.reference, {
        id: plan.reference.id,
        departmentId: plan.departmentId,
        memberUid: profileDocument.id,
        memberName: profile.memberName || plan.name,
        duty: plan.duty,
        serviceId,
        serviceDate: plan.assignment.serviceDate,
        serviceTime: plan.assignment.serviceTime,
        profileId: profile.profileId || profile.id || '',
        assignedAt: now(),
        assignedByUid: 'schedule-projection',
        assignedBy: 'schedule-projection',
        override: true,
        authorization: 'administrator-schedule-reconciliation',
        revision: nextRevision(plan.existing.exists ? (plan.existing.data() || {}) : {})
      }, { merge: false });
    });
  });
}

module.exports = { reconcileScheduleAssignmentProjection };
