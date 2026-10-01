/* Saving the month planner's changes. Each department's changes go to the
   server in one call (saveDepartmentAssignments), which checks each change
   like a single assignment, saves the ones that pass, and says why it
   skipped the others. Members hear once about all their new duties. */
import { call, problem } from '../firebase.js';
import { notice } from '../ui/banners.js';
import { departmentOf } from '../config/duties.js';

const REASONS = {
  changed: 'someone changed that duty first',
  'already-serving': 'that member already serves in that service',
  'target-unavailable': 'that member is not available then',
  'target-ineligible': 'that member does not take that duty',
  'target-not-schedulable': 'that member cannot be scheduled',
  'target-inactive': 'that member is inactive in this department',
  'no-service': 'the service is gone',
  'no-profile': 'that member is not in the department'
};

export function reasonText(reason) { return REASONS[reason] || 'it did not pass the checks'; }

/* changes: [{ serviceId, duty, memberUid ('' to empty it), expectedMemberName }].
   Returns { saved, skipped: [{ serviceId, duty, reason }] }. */
export async function saveChanges(changes) {
  const byDepartment = {};
  changes.forEach(change => {
    const department = departmentOf(change.duty).name;
    (byDepartment[department] = byDepartment[department] || []).push(change);
  });
  let saved = 0;
  const skipped = [];
  for (const [departmentId, list] of Object.entries(byDepartment)) {
    for (let start = 0; start < list.length; start += 200) {
      try {
        const result = await call('saveDepartmentAssignments', { departmentId, changes: list.slice(start, start + 200) });
        saved += result.saved.length;
        skipped.push(...result.skipped);
      } catch (error) {
        notice(departmentId + ' was not saved: ' + problem(error), true);
        skipped.push(...list.slice(start, start + 200).map(change => ({ serviceId: change.serviceId, duty: change.duty, reason: 'error' })));
      }
    }
  }
  return { saved, skipped };
}
