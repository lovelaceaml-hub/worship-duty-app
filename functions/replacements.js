'use strict';

/* "Needs a replacement" flags (schedule.needsReplacement[duty]) after an
   availability change: the member's upcoming duties they can no longer make
   are flagged for their leader, and their own flags on duties they can make
   again are removed. The member's own save (workflows.js) and a leader's
   profile edit (department-handlers.js) both use this. Duties are found in
   the schedule itself, by name in its current spelling, so a duty imported
   from the Sheet or given before the member had a profile is flagged too. */
const { FieldValue } = require('firebase-admin/firestore');
const authz = require('./department-auth.js');
const permissions = require('./permissions.js');
const { pacificDate, hasStarted } = require('./time.js');

/* Services from today on that have not started, read before a transaction:
   [{ id, data }]. */
async function upcomingServices(db, at) {
  const snapshot = await db.collection('schedule').where('date', '>=', pacificDate(new Date(at))).get();
  return snapshot.docs.map(document => ({ id: document.id, data: document.data() || {} }))
    .filter(item => !hasStarted(item.data, at));
}

function heldDuties(service, departmentId, name, canonical) {
  return (permissions.DEPARTMENT_DUTIES[departmentId] || []).filter(duty => {
    const holder = (service.assignments || {})[duty];
    return !!holder && canonical(holder) === name;
  });
}

/* The ids of the services where `name` holds a duty of `departmentId`. */
function servicesHolding(services, departmentId, name, canonical) {
  return services.filter(item => heldDuties(item.data, departmentId, name, canonical).length).map(item => item.id);
}

/* The flag changes for one member in one department, from the services as
   read inside the transaction (byId: id -> data or null):
   [{ serviceId, duty, date, service, marker }], marker null to remove. A
   flag raised for someone else (the duty changed hands since) does not
   count, so it never hides the current holder's. */
function flagChanges({ profile, departmentId, memberUid, byId, canonical, at, markedByUid }) {
  const scheduled = authz.profileForScheduling(profile);
  if (!scheduled) return [];
  const name = canonical(profile.memberName || profile.member);
  const out = [];
  Object.entries(byId).forEach(([serviceId, service]) => {
    if (!service || hasStarted(service, at)) return;
    heldDuties(service, departmentId, name, canonical).forEach(duty => {
      const availability = authz.effectiveAvailability(scheduled, String(service.date || ''), authz.serviceTimeKey(service));
      const marker = (service.needsReplacement || {})[duty];
      const own = !!marker && canonical(marker.memberName) === name;
      const where = { serviceId, duty, date: String(service.date || ''), service: String(service.service || '') };
      if (availability === 'unavailable' && !own) {
        out.push(Object.assign(where, { marker: {
          memberName: String(service.assignments[duty]), memberUid, departmentId, reason: 'unavailable', since: at, markedByUid
        } }));
      } else if (availability === 'available' && own && marker.reason === 'unavailable') {
        out.push(Object.assign(where, { marker: null }));
      }
    });
  });
  return out;
}

/* One schedule write per service for all of the changes (Firestore allows
   one write per document in a transaction). Returns { marked, cleared }. */
function writeFlags(transaction, db, changes) {
  const byService = new Map();
  changes.forEach(change => {
    const patch = byService.get(change.serviceId) || {};
    patch[change.duty] = change.marker || FieldValue.delete();
    byService.set(change.serviceId, patch);
  });
  byService.forEach((patch, serviceId) => {
    transaction.set(db.collection('schedule').doc(serviceId), { needsReplacement: patch }, { merge: true });
  });
  const brief = ({ serviceId, duty, date, service }) => ({ serviceId, duty, date, service });
  return {
    marked: changes.filter(change => change.marker).map(brief),
    cleared: changes.filter(change => !change.marker).map(brief)
  };
}

module.exports = { upcomingServices, servicesHolding, flagChanges, writeFlags };
