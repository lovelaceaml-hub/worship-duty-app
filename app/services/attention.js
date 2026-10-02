/* What needs a leader's look in Manage: open change requests, double duties
   nobody has marked OK, and duties flagged as needing a replacement. Counts
   only what this member may act on. */
import { data } from '../store.js';
import { isOpen } from '../lib/requests.js';
import { openDoubleDuties } from '../lib/conflicts.js';
import { upcoming, serviceId } from '../lib/services.js';
import { departmentOf } from '../config/duties.js';
import { canonical } from '../store.js';
import { isAdmin, managedDepartments, canResolveRequest, canAcknowledgeConflict } from './access.js';

function mine(departments) {
  if (isAdmin()) return true;
  const allowed = managedDepartments();
  return departments.some(department => allowed.includes(department));
}

function openRequests() {
  return data.requests.filter(request => isOpen(request, data.services, canonical) && canResolveRequest(request));
}

export function openConflicts() {
  const out = [];
  upcoming(data.services).forEach(service => {
    openDoubleDuties(service).forEach(conflict => {
      const item = Object.assign({}, conflict, { serviceId: serviceId(service), date: service.date, service: service.service });
      const departments = conflict.duties.map(duty => (departmentOf(duty) || {}).name).filter(Boolean);
      if (mine(departments) && canAcknowledgeConflict(item)) out.push({ service, conflict });
    });
  });
  return out;
}

/* Duties someone can no longer make, in services still to come, that this
   member answers for: [{ service, duty, marker }]. */
export function replacementsNeeded() {
  const out = [];
  upcoming(data.services).forEach(service => {
    Object.entries(service.needsReplacement || {}).forEach(([duty, marker]) => {
      const department = departmentOf(duty);
      if (!department || !mine([department.name])) return;
      // The flag carries the name as stored, which may be an older spelling.
      if (!marker || !marker.memberName || (service.assignments || {})[duty] !== canonical(marker.memberName)) return; // already changed
      out.push({ service, duty, marker });
    });
  });
  return out;
}

export function attentionCounts() {
  const requests = openRequests().length;
  const conflicts = openConflicts().length;
  const replacements = replacementsNeeded().length;
  return { requests, conflicts, replacements, total: requests + conflicts + replacements };
}
