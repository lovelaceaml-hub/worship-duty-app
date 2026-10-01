/* Why something was not done, in plain words. The server names a short
   reason with every refusal (error.details.reason on a failed call, and
   `reason` on each change the planner's save skipped), and the planner uses
   the same codes for who cannot take a duty (availability.js whyNot). This
   is the one table that turns them into words: a short note for a planner
   cell or a list, and a sentence for a banner. */

const REASONS = {
  // Someone else got there first.
  changed: ['someone else changed it first', 'Someone else changed that duty first. Look again, then retry.'],
  // The member.
  'target-unavailable': ['not available then', 'That member is not available then.'],
  unavailable: ['not available then', 'That member is not available then.'],
  'target-ineligible': ['does not take this duty', 'That member does not take that duty.'],
  'target-not-schedulable': ['not set to be scheduled', 'That member is not set to be scheduled.'],
  'target-inactive': ['inactive in this department', 'That member is inactive in this department.'],
  'already-serving': ['has a duty there that does not go with this one', 'That member already has a duty in that service that does not go with this one.'],
  conflict: ['has a duty there that does not go with this one', 'That member already has a duty in that service that does not go with this one.'],
  'no-profile': ['not on this department\'s list', 'That member is not on the department\'s list.'],
  'invalid-target-profile': ['not on this department\'s list', 'That member is not on the department\'s list.'],
  'target-profile-mismatch': ['not on this department\'s list', 'That member\'s department record does not match. Reload the app, then try again.'],
  // The service.
  'no-service': ['the service was moved or deleted', 'That service was moved or deleted.'],
  'service-missing': ['the service was moved or deleted', 'That service was moved or deleted.'],
  'service-started': ['the service has started', 'That service has already started, so its duties stay as they are.'],
  'invalid-service': ['the service has no date or time', 'That service is missing its date or time. Ask an administrator to fix it.'],
  'invalid-assignment': ['the duty was not recognized', 'That duty or service was not recognized. Reload the app, then try again.'],
  // The request.
  'request-closed': ['already answered', 'That request was already answered or withdrawn.'],
  'not-holder': ['no longer has the duty', 'That member no longer has that duty. Close the request instead.'],
  // Who may do it.
  'cross-department': ['another department\'s duty', 'That duty belongs to a department you do not lead.'],
  'duty-department-mismatch': ['another department\'s duty', 'That duty belongs to another department.'],
  'administrator-required': ['administrators only', 'Only an administrator can do that.'],
  'explicit-override-required': ['needs an override', 'Use "Assign someone else" and give a reason.'],
  'profile-write-not-authorized': ['not allowed', 'Your account is not allowed to do that.'],
  'role-not-allowed': ['not allowed', 'Your account is not allowed to do that.'],
  'metadata-not-owned': ['not allowed', 'Your account is not allowed to do that.'],
  'role-changed': ['your access changed', 'Your access changed. Sign out, then sign in again.'],
  unauthenticated: ['sign in again', 'Sign in again, then try again.'],
  // The change itself.
  'field-not-allowed': ['not allowed', 'That change is not allowed here.'],
  'immutable-identity': ['not allowed', 'A member\'s name and department cannot be changed here.'],
  'invalid-profile-identity': ['not recognized', 'That member\'s record was not recognized. Reload the app, then try again.'],
  'no-change': ['nothing changed', 'Nothing changed, so there was nothing to save.'],
  'pin-too-common': ['too easy to guess', 'That PIN is too easy to guess. Choose a different one.'],
  // The call did not reach the server (the planner's own code).
  error: ['not saved, try again', 'The server could not be reached. Try again.']
};

const has = code => Object.prototype.hasOwnProperty.call(REASONS, code);

/* A sentence for a banner, or '' for a code this table does not know. */
export function reasonText(code) { return has(code) ? REASONS[code][1] : ''; }

/* A few words for a planner cell or a list. */
export function reasonNote(code) { return has(code) ? REASONS[code][0] : 'not saved'; }

/* Why the person on a duty could not be given it now (availability.js
   whyNot), as a planner cell says it: `department` and `duty` name the
   duty's own, `also` the other duties they hold in that service. */
export function holderNote(code, { department = '', duty = '', also = [] } = {}) {
  if (code === 'no-profile' || code === 'invalid-target-profile') return 'Not on the ' + department + ' list';
  if (code === 'target-inactive') return 'Inactive in ' + department;
  if (code === 'target-ineligible') return 'Does not take ' + duty;
  if (code === 'already-serving' || code === 'conflict') return also.length ? 'Also ' + also.join(' and ') + ' here' : 'Has another duty here';
  const note = reasonNote(code);
  return note.charAt(0).toUpperCase() + note.slice(1);
}
