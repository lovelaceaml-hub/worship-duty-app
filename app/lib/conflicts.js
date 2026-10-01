/* Who may hold which duties together in one service. One duty each is the
   rule. The one exception is a prayer (Opening, Thanks or Closing Prayer)
   with an usher duty, allowed on purpose and never flagged; Lobby Security
   does not count as an usher duty here. Anything else is a double duty: Fill
   never makes one, the planner does not offer one and the server refuses one.
   One that arrives another way (the Sheet, an administrator's override) is
   flagged. A leader can mark a double duty as OK; that holds only while the
   person's duties stay the same (service.conflictOk). permissions.js has the
   same rule for the server; a test keeps the two in step. */
import { ALL_DUTIES, PRAYER_DUTIES, USHER_DUTIES } from '../config/duties.js';

const isPrayer = duty => PRAYER_DUTIES.includes(duty);
export const isUsher = duty => USHER_DUTIES.includes(duty);

/* Whether one person may hold all of `duties` in one service. */
function allowedTogether(duties) {
  if (duties.length < 2) return true;
  if (duties.length > 2) return false;
  const [a, b] = duties;
  return (isPrayer(a) && isUsher(b)) || (isUsher(a) && isPrayer(b));
}

/* The duties `name` holds in a service's `assignments`, apart from `duty`. */
export function otherDuties(assignments, name, duty) {
  if (!name) return [];
  return Object.keys(assignments || {}).filter(other => other !== duty && assignments[other] === name);
}

/* Whether `name` may take `duty` in a service with these assignments and keep
   every other duty they hold there. */
export function canAlsoServe(assignments, name, duty) {
  return allowedTogether(otherDuties(assignments, name, duty).concat(duty));
}

/* The prayer `name` holds in a service's `assignments`, or ''. */
export function prayerOf(assignments, name) {
  return otherDuties(assignments, name, '').find(isPrayer) || '';
}

function sortDuties(duties) {
  return Array.from(new Set(duties)).sort((a, b) => ALL_DUTIES.indexOf(a) - ALL_DUTIES.indexOf(b));
}

/* [{ name, duties }] for everyone with a double duty in `service`. */
export function doubleDuties(service) {
  const byPerson = {};
  Object.entries(service.assignments || {}).forEach(([duty, name]) => {
    if (name) (byPerson[name] = byPerson[name] || []).push(duty);
  });
  return Object.entries(byPerson)
    .filter(([, duties]) => !allowedTogether(duties))
    .map(([name, duties]) => ({ name, duties: sortDuties(duties) }));
}

/* A mark counts while it lists exactly the person's duties now, in any order. */
export function isMarkedOk(service, conflict) {
  const marked = (service.conflictOk || {})[conflict.name];
  if (!Array.isArray(marked)) return false;
  const duties = sortDuties(marked);
  return duties.length === conflict.duties.length && duties.every((duty, i) => duty === conflict.duties[i]);
}

/* Double duties no leader has marked OK. */
export function openDoubleDuties(service) {
  return doubleDuties(service).filter(conflict => !isMarkedOk(service, conflict));
}
