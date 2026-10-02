'use strict';

/* Refusals from the callables. Each carries a plain English message and
   details.reason, a short stable code the app turns into its own words.
   Messages avoid the words the app's older error wording keys on ("PIN" for
   a forced PIN change, "changed" for a stale save) unless they mean that. */

const MESSAGES = Object.freeze({
  // Sign-in and sessions.
  'sign-in-required': 'Sign in again, then try again.',
  'session-ended': 'Your sign-in has ended. Sign in again.',
  'account-inactive': 'This account is no longer in use. Sign in with your current name.',
  'pin-change-required': 'Choose your own PIN first.',
  locked: 'Too many attempts. Try again later.',
  'pin-too-common': 'That PIN is too easy to guess. Choose a different one.',
  'privileged-target': 'Only an administrator can reset the PIN of an administrator, a leader or a song editor.',
  // Who may do what.
  'not-allowed': 'Your account is not allowed to do that.',
  'administrator-required': 'Only an administrator can do that.',
  'cross-department': 'You do not lead that department.',
  'profile-write-not-authorized': 'Your account is not allowed to change this profile.',
  'metadata-not-owned': 'That save did not come from your account.',
  'immutable-identity': 'A member\'s name, department and role cannot be changed here.',
  'field-not-allowed': 'That field cannot be changed here.',
  'role-not-allowed': 'That role cannot be given here.',
  'invalid-profile-identity': 'That member profile is not valid.',
  'no-change': 'Nothing was different, so nothing was saved.',
  // What was sent.
  'invalid-input': 'Something in the request is missing or not valid.',
  'invalid-assignment': 'That assignment is not valid.',
  'duty-department-mismatch': 'That duty belongs to another department.',
  'explicit-override-required': 'An override needs a reason.',
  // Services and duties.
  'service-missing': 'That service was moved or deleted.',
  'service-started': 'That service has already started. Its duties stay as they are.',
  'invalid-service': 'That service is missing its date or service time.',
  changed: 'This record changed since you loaded it. Reload to see the newer version.',
  'already-serving': 'That member already serves in this service.',
  'not-holder': 'That member is no longer on that duty.',
  // Members and profiles.
  'profile-missing': 'That member is not in this department.',
  'profile-exists': 'That member is already in this department.',
  'account-missing': 'That member is not on the member list.',
  'name-mismatch': 'That name does not match the member\'s account.',
  'target-profile-mismatch': 'That member is not in this department.',
  'invalid-target-profile': 'That member\'s department profile needs fixing before they can be scheduled.',
  'target-inactive': 'That member is inactive in this department.',
  'target-ineligible': 'That member does not take that duty.',
  'target-not-schedulable': 'That member cannot be scheduled yet.',
  'target-unavailable': 'That member is not available then.',
  // Change requests.
  'request-missing': 'That request was not found.',
  'request-closed': 'That request was already answered or withdrawn.',
  'request-mismatch': 'That request is for a different service or duty.',
  // Invitations.
  'invite-invalid': 'That invite link has expired or was cancelled.',
  'invite-used': 'That invite link was already used.',
  // Administrator tools.
  'sheet-not-set': 'Paste the Sheet\'s link first.',
  'sheet-problem': 'The Google Sheet could not be used.',
  'sheet-empty': 'The sheet had no services in it, so nothing was changed.',
  'not-on-list': 'That name is not on the member list.',
  'rename-incomplete': 'The name was only partly fixed. Fix the same name again to finish.',
  'no-default': 'That duty has no default.',
  'not-eligible': 'That member does not take that duty in its department.',
  'server-error': 'The server could not finish that. Try again.'
});

/* The reason a refusal without one gets, by its code. */
const DEFAULT_REASONS = Object.freeze({
  'invalid-argument': 'invalid-input',
  unauthenticated: 'sign-in-required',
  'permission-denied': 'not-allowed',
  'not-found': 'not-found',
  'already-exists': 'exists',
  'failed-precondition': 'not-possible',
  aborted: 'changed',
  'resource-exhausted': 'locked',
  'out-of-range': 'invalid-input',
  'deadline-exceeded': 'server-error',
  unavailable: 'server-error',
  internal: 'server-error',
  cancelled: 'server-error',
  'data-loss': 'server-error'
});

/* What department-auth.js decisions mean as a callable error code. */
const PERMISSION_REASONS = new Set([
  'unauthenticated', 'cross-department', 'profile-write-not-authorized', 'administrator-required',
  'explicit-override-required', 'target-profile-mismatch', 'metadata-not-owned', 'immutable-identity'
]);

/* An error a callable throws: `code` is the Firebase error code, `reason` the
   stable code, `message` plain English (the reason's own by default), and
   `extra` more details for the app (for example the duties already held). */
function refusal(code, reason, message, extra) {
  const error = new Error(message || MESSAGES[reason] || 'That could not be done.');
  error.code = code;
  error.details = Object.assign({ reason }, extra || {});
  return error;
}

/* A department-auth.js decision that did not allow the change. */
function decisionRefusal(result, extra) {
  if (result.reason === 'unauthenticated') return refusal('unauthenticated', 'sign-in-required', MESSAGES['sign-in-required'], extra);
  const code = PERMISSION_REASONS.has(result.reason) ? 'permission-denied' : 'failed-precondition';
  return refusal(code, result.reason, MESSAGES[result.reason] || 'That change is not allowed.', extra);
}

/* details for an error on its way to the app: its own, with a reason. */
function detailsFor(error, code) {
  const details = error && error.details && typeof error.details === 'object' && !Array.isArray(error.details)
    ? Object.assign({}, error.details)
    : {};
  if (typeof details.reason !== 'string' || !details.reason) details.reason = DEFAULT_REASONS[code] || 'server-error';
  return details;
}

module.exports = { MESSAGES, DEFAULT_REASONS, refusal, decisionRefusal, detailsFor };
