'use strict';

/*
 * Pure revision/witness helpers shared by every version-aware write in
 * Section 3 (department profiles, assignment slots, song services) and by
 * the existing assignment primitives. No database, no Firebase imports.
 *
 * A revision alone cannot see writes that bypass the callables (legacy
 * direct schedule writes, Sheet sync, Signal setlist writes), so a stale
 * check pairs the counter with a witness value the client already displays
 * (an updatedAt timestamp or an assignment slot's current member name).
 */

function currentRevision(doc) {
  const value = doc && doc.revision;
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function nextRevision(doc) {
  return currentRevision(doc) + 1;
}

function isSafeExpectedRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/*
 * assertFresh({ expectedRevision, expectedWitness, currentRevision,
 * currentWitness, code, message, details }) checks what the caller sent.
 * A missing value is not checked: undefined, and null too, because the
 * callable SDK sends an undefined field as null (a document with no stored
 * revision gives the client undefined). A revision, when present, must be a
 * non-negative safe integer. A mismatch on the revision or on the witness
 * throws `code` ('aborted' by default) with `details` merged onto
 * { reason: 'changed', revision: currentRevision }.
 */
function assertFresh(options = {}) {
  const {
    expectedRevision,
    expectedWitness,
    currentRevision: current,
    currentWitness,
    code = 'aborted',
    message = 'This record changed since you loaded it. Reload to see the newer version.',
    details = {}
  } = options;

  const hasRevision = expectedRevision != null;
  if (hasRevision && !isSafeExpectedRevision(expectedRevision)) {
    const error = new Error('expectedRevision must be a non-negative integer.');
    error.code = 'invalid-argument';
    error.details = { reason: 'invalid-input' };
    throw error;
  }

  const revisionStale = hasRevision && expectedRevision !== current;
  const witnessStale = expectedWitness != null && expectedWitness !== currentWitness;
  if (!revisionStale && !witnessStale) return;

  const error = new Error(message);
  error.code = code;
  error.details = Object.assign({ reason: 'changed', revision: current }, details);
  throw error;
}

module.exports = {
  currentRevision,
  nextRevision,
  assertFresh
};
