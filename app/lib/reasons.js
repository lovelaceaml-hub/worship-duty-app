/* Why something was not done, in plain words. The server names a short
   reason with every refusal (error.details.reason on a failed call, and
   `reason` on each change the planner's save skipped), and the planner uses
   the same codes for who cannot take a duty (availability.js whyNot). This
   is the one table that turns them into words: a short note for a planner
   cell or a list, and a sentence for a banner. */

/* A short note and a sentence for each code; a sentence of null means the
   server's own message says it best (it names what went wrong). */
const SERVER_SAYS = null;
const REASONS = {
  // Someone else got there first.
  changed: ['someone else changed it first', 'Someone else changed this first. Look again, then retry.'],
  // The member.
  'target-unavailable': ['not available then', 'That member is not available then.'],
  unavailable: ['not available then', 'That member is not available then.'],
  'target-ineligible': ['does not take this duty', 'That member does not take that duty.'],
  'target-not-schedulable': ['not set to be scheduled', 'That member is not set to be scheduled.'],
  'target-inactive': ['inactive in this department', 'That member is inactive in this department.'],
  'already-serving': ['has a duty there that does not go with this one', 'That member already has a duty in that service that does not go with this one.'],
  conflict: ['has a duty there that does not go with this one', 'That member already has a duty in that service that does not go with this one.'],
  'no-profile': ['not on this department\'s list', 'That member is not on the department\'s list.'],
  'profile-missing': ['not on this department\'s list', 'That member is not on the department\'s list.'],
  'invalid-target-profile': ['their profile needs fixing', 'That member\'s department profile needs fixing before they can be scheduled.'],
  'target-profile-mismatch': ['not on this department\'s list', 'That member is not in this department. Reload the app, then try again.'],
  'profile-exists': ['already on the list', 'That member is already in this department.'],
  'account-missing': ['not on the member list', 'That member is not on the member list.'],
  'name-mismatch': ['name does not match', 'That name does not match the member\'s account. Reload the app, then try again.'],
  // The service.
  'no-service': ['the service was moved or deleted', 'That service was moved or deleted.'],
  'service-missing': ['the service was moved or deleted', 'That service was moved or deleted.'],
  'service-started': ['the service has started', 'That service has already started, so its duties stay as they are.'],
  'invalid-service': ['the service has no date or time', 'That service is missing its date or time. Ask an administrator to fix it.'],
  'invalid-assignment': ['the duty was not recognized', 'That duty or service was not recognized. Reload the app, then try again.'],
  // The request.
  'request-closed': ['already answered', 'That request was already answered or withdrawn.'],
  'request-missing': ['the request is gone', 'That request was not found. It may have been withdrawn.'],
  'request-mismatch': ['a different duty', 'That request is for a different service or duty. Reload the app, then try again.'],
  'not-holder': ['no longer has the duty', 'That member is no longer on that duty. Decline the request to close it; the duty stays as it is.'],
  // Who may do it, and signing in.
  'cross-department': ['another department\'s duty', 'That duty belongs to a department you do not lead.'],
  'duty-department-mismatch': ['another department\'s duty', 'That duty belongs to another department.'],
  'administrator-required': ['administrators only', 'Only an administrator can do that.'],
  'privileged-target': ['administrators only', 'Only an administrator can reset the PIN of an administrator, a leader or a song editor.'],
  'not-allowed': ['not allowed', 'Your account is not allowed to do that.'],
  'explicit-override-required': ['needs an override', 'Use "Assign someone else" and give a reason.'],
  'profile-write-not-authorized': ['not allowed', 'Your account is not allowed to do that.'],
  'role-not-allowed': ['not allowed', 'Your account is not allowed to do that.'],
  'metadata-not-owned': ['not allowed', 'Your account is not allowed to do that.'],
  'role-changed': ['your access changed', 'Your access changed. Sign out, then sign in again.'],
  'session-ended': ['sign in again', 'Your sign-in has ended. Sign out, then sign in again.'],
  'account-inactive': ['account not in use', 'This account is no longer in use. Sign out, then sign in with your current name.'],
  unauthenticated: ['sign in again', 'Sign in again, then try again.'],
  'sign-in-required': ['sign in again', 'Sign in again, then try again.'],
  'pin-change-required': ['choose a PIN first', 'Choose your own PIN first.'],
  'pin-too-common': ['too easy to guess', 'That PIN is too easy to guess. Choose a different one.'],
  locked: ['too many tries', 'Too many tries. Wait 15 minutes, then try again.'],
  // The change itself.
  'field-not-allowed': ['not allowed', 'That change is not allowed here.'],
  'immutable-identity': ['not allowed', 'A member\'s name and department cannot be changed here.'],
  'invalid-profile-identity': ['not recognized', 'That member\'s record was not recognized. Reload the app, then try again.'],
  'no-change': ['nothing changed', 'Nothing was different, so nothing was saved.'],
  // Invite links.
  'invite-invalid': ['link expired', 'That invite link has expired or was cancelled. Ask your leader for a new one.'],
  'invite-used': ['link used', 'That invite link was already used.'],
  // Administrator tools.
  'sheet-not-set': ['no Sheet link', 'Paste the Sheet\'s link first.'],
  'sheet-problem': ['the Sheet could not be used', SERVER_SAYS],
  'sheet-empty': ['the Sheet was empty', 'The Sheet had no services in it, so nothing was changed.'],
  'not-on-list': ['not on the member list', 'That name is not on the member list.'],
  'rename-incomplete': ['only partly fixed', 'The name was only partly fixed. Fix the same name again to finish.'],
  'no-default': ['no default', 'That duty has no default.'],
  'not-eligible': ['does not take this duty', 'That member does not take that duty, so they cannot be its default.'],
  // A reason the server gives by the error's code alone.
  'invalid-input': ['not valid', SERVER_SAYS],
  'not-found': ['not found', SERVER_SAYS],
  exists: ['already there', SERVER_SAYS],
  'not-possible': ['not possible', SERVER_SAYS],
  'server-error': ['the server could not finish', 'The server could not finish that. Try again.'],
  // The call did not reach the server (the planner's own code).
  error: ['not saved, try again', 'The server could not be reached. Try again.']
};

const has = code => Object.prototype.hasOwnProperty.call(REASONS, code);

/* A sentence for a banner, or '' for a code this table does not know or
   leaves to the server's message. */
export function reasonText(code) { return has(code) ? REASONS[code][1] || '' : ''; }

/* Whether this table knows the code (tests check the server's list). */
export const isKnownReason = code => has(code);

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
