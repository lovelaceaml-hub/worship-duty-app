/* Members a department's leader set to Manual only (app/settings
   manualOnly: { department: [names] }, saved by the server's setManualOnly).
   Fill never proposes them and no suggestion offers them first; a leader
   still gives them a duty by hand. The store hands over a way to read the
   live settings. */
import { departmentOf } from '../config/duties.js';

let saved = () => ({});
export function useManualOnly(source) { saved = source; }

/* The names set to Manual only in `department`. */
export function manualOnlyIn(department) {
  const list = (saved() || {})[department];
  return Array.isArray(list) ? list : [];
}

/* Whether `name` is Manual only for `duty` (in the duty's department). */
export function isManualOnly(duty, name) {
  const department = departmentOf(duty);
  return !!department && !!name && manualOnlyIn(department.name).includes(name);
}
