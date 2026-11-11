'use strict';

/* Changing a department member's profile: which fields a request may name
   (patchFromRequest), the profile as it will be saved with who changed what
   (profileWithPatch, fieldAttributionFor), and the copy the change is
   authorized as (authorizationCandidate). department-auth.js decides whether
   the change is allowed; department-handlers.js reads, checks and writes. */
const authz = require('./department-auth.js');
const { refusal, DEFAULT_REASONS } = require('./refusals.js');
const { isPlainObject: plainObject } = require('./util.js');

const PROFILE_PATCH_FIELDS = new Set(authz.PROFILE_MUTABLE_FIELDS);
const PROFILE_DECISION_FIELDS = Object.freeze([
  'status',
  'eligibleDuties',
  'schedulable',
  'availability'
]);
// 'schedule' is the nightly job's (serving-members.js); its entries are kept
// like any other until a leader or member changes that field.
const PROFILE_DECISION_SOURCES = new Set(['initial', 'history-seed', 'manual', 'import', 'schedule']);
const PROFILE_DECISION_AUTHORITIES = new Set(['system', 'history-seed', 'member', 'leader', 'admin', 'import']);

/* A request the app got wrong: details.reason is the one for the code. */
function invalid(message) {
  return refusal('invalid-argument', DEFAULT_REASONS['invalid-argument'] || 'server-error', message);
}

function patchFromRequest(data, options = {}) {
  const allowedCommandFields = new Set([
    ...PROFILE_PATCH_FIELDS,
    'patch',
    'departmentId',
    'department',
    'memberUid',
    'uid',
    'expectedRevision',
    'expectedUpdatedAt'
  ]);
  const unknownCommandField = Object.keys(data).find(key => !allowedCommandFields.has(key));
  if (unknownCommandField) {
    throw invalid(`Profile field is not allowed: ${unknownCommandField}.`);
  }
  const source = data.patch == null
    ? Object.fromEntries(Array.from(PROFILE_PATCH_FIELDS)
      .filter(field => Object.prototype.hasOwnProperty.call(data, field))
      .map(field => [field, data[field]]))
    : data.patch;
  let patch;
  try {
    patch = authz.normalizeProfilePatch(source);
  } catch (error) {
    throw invalid(error.message);
  }
  if (options.availabilityOnly && Object.keys(patch).some(key => key !== 'availability')) {
    throw invalid('Only availability may be changed by this callable.');
  }
  return patch;
}

function validFieldDecision(value) {
  return plainObject(value)
    && PROFILE_DECISION_SOURCES.has(value.source)
    && PROFILE_DECISION_AUTHORITIES.has(value.authority)
    && typeof value.by === 'string'
    && value.by.trim() !== ''
    && Number.isSafeInteger(value.at)
    && value.at >= 0;
}

function profileDecisionAuthority(actor, profile) {
  if (authz.isAdministrator(actor)) return 'admin';
  const identity = authz.profileIdentity(profile);
  return identity && identity.memberUid === authz.actorUid(actor) ? 'member' : 'leader';
}

function fieldAttributionFor(before, changedFields, actor, profile, at) {
  const existing = plainObject(before.fieldAttribution) ? before.fieldAttribution : {};
  const output = {};
  PROFILE_DECISION_FIELDS.forEach(field => {
    output[field] = validFieldDecision(existing[field])
      ? { ...existing[field] }
      : { source: 'initial', authority: 'system', by: 'system', at: 0 };
  });
  const authority = profileDecisionAuthority(actor, profile || before);
  changedFields.forEach(field => {
    if (!PROFILE_DECISION_FIELDS.includes(field)) return;
    output[field] = {
      source: 'manual',
      authority,
      by: authz.actorUid(actor),
      at
    };
  });
  return output;
}

function profileWithPatch(before, patch, actor, at) {
  const next = { ...before };
  Object.keys(patch).forEach(field => { next[field] = patch[field]; });
  if (Object.prototype.hasOwnProperty.call(patch, 'status') &&
      Object.prototype.hasOwnProperty.call(before, 'active')) {
    next.active = patch.status === 'active';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'eligibleDuties') &&
      Object.prototype.hasOwnProperty.call(before, 'duties')) {
    next.duties = patch.eligibleDuties;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'schedulable') &&
      Object.prototype.hasOwnProperty.call(before, 'isSchedulable')) {
    next.isSchedulable = patch.schedulable;
  }
  next.updatedAt = at;
  next.updatedByUid = actor.uid;
  next.updatedBy = actor.token.memberName || actor.token.member || actor.uid;
  next.fieldAttribution = fieldAttributionFor(before, Object.keys(patch), actor, next, at);
  const priorAttribution = plainObject(before.attribution) ? before.attribution : {};
  next.attribution = {
    createdBy: typeof priorAttribution.createdBy === 'string' && priorAttribution.createdBy.trim()
      ? priorAttribution.createdBy
      : (next.createdBy || actor.uid),
    createdAt: Number.isSafeInteger(priorAttribution.createdAt)
      ? priorAttribution.createdAt
      : (Number.isSafeInteger(next.createdAt) ? next.createdAt : at),
    updatedBy: next.updatedBy,
    updatedAt: at
  };
  return next;
}

/* What a profile update is authorized as: the new profile with the stored
   attribution, which the server alone writes. */
function authorizationCandidate(before, next) {
  const candidate = { ...next };
  ['attribution', 'fieldAttribution'].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(before, field)) candidate[field] = before[field];
    else delete candidate[field];
  });
  return candidate;
}

module.exports = {
  PROFILE_PATCH_FIELDS,
  PROFILE_DECISION_FIELDS,
  PROFILE_DECISION_SOURCES,
  PROFILE_DECISION_AUTHORITIES,
  patchFromRequest,
  fieldAttributionFor,
  profileWithPatch,
  authorizationCandidate
};
