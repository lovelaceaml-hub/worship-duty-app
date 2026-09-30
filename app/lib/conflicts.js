/* Double duty: one person holding two or more duties in the same service.
   One prayer duty paired with one usher duty is allowed on purpose and never
   flagged. A leader can mark a double duty as OK; that holds only while the
   person's duties stay the same (service.conflictOk). */
import { ALL_DUTIES, departmentOf } from '../config/duties.js';

function isPrayer(duty) {
  const department = departmentOf(duty);
  return !!department && department.name === 'Worship' && /prayer/i.test(duty);
}
function isUsher(duty) {
  const department = departmentOf(duty);
  return !!department && (department.name === 'Usher Sisters' || department.name === 'Usher Brothers');
}
function isAllowedPair(a, b) {
  return (isPrayer(a) && isUsher(b)) || (isUsher(a) && isPrayer(b));
}

function sortDuties(duties) {
  return duties.slice().sort((a, b) => ALL_DUTIES.indexOf(a) - ALL_DUTIES.indexOf(b));
}

function sameDuties(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((duty, i) => duty === b[i]);
}

/* [{ name, duties }] for everyone with a flagged double duty in `service`. */
export function doubleDuties(service) {
  const byPerson = {};
  Object.entries(service.assignments || {}).forEach(([duty, name]) => {
    if (name) (byPerson[name] = byPerson[name] || []).push(duty);
  });
  return Object.entries(byPerson)
    .filter(([, duties]) => duties.length > 1 &&
      duties.some((a, i) => duties.slice(i + 1).some(b => !isAllowedPair(a, b))))
    .map(([name, duties]) => ({ name, duties: sortDuties(duties) }));
}

export function isMarkedOk(service, conflict) {
  return sameDuties((service.conflictOk || {})[conflict.name], conflict.duties);
}

/* Double duties no leader has marked OK. */
export function openDoubleDuties(service) {
  return doubleDuties(service).filter(conflict => !isMarkedOk(service, conflict));
}
