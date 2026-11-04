'use strict';

/* Small value checks shared by the Cloud Functions modules. */

/* A plain object: not null, not an array, and made by {} or Object.create(null). */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/* Whether an error from Firestore or the Admin SDK says the document already exists. */
function alreadyExists(error) {
  return !!error && (error.code === 6 || error.code === 'already-exists' || /ALREADY_EXISTS/.test(String(error.message)));
}

module.exports = { isPlainObject, alreadyExists };
