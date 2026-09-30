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
 * currentWitness, code, message, details }) is a no-op when
 * expectedRevision is undefined (an older caller, or a first save against a
 * document with no stored revision, which reads as 0). When present it must
 * be a non-negative safe integer. A mismatch on the revision, or on the
 * witness when one was supplied, throws `code` ('aborted' by default) with
 * `details` merged onto { revision: currentRevision, ...witness fields }.
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

  if (expectedRevision === undefined) return;

  if (!isSafeExpectedRevision(expectedRevision)) {
    const error = new Error('expectedRevision must be a non-negative integer.');
    error.code = 'invalid-argument';
    throw error;
  }

  const revisionStale = expectedRevision !== current;
  const witnessStale = expectedWitness !== undefined && expectedWitness !== currentWitness;
  if (!revisionStale && !witnessStale) return;

  const error = new Error(message);
  error.code = code;
  error.details = Object.assign({ revision: current }, details);
  throw error;
}

module.exports = {
  currentRevision,
  nextRevision,
  assertFresh
};
