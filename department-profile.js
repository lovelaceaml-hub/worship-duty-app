'use strict';

/*
 * Pure department-profile domain model.
 *
 * This file deliberately has no Firebase, DOM, auth, or persistence
 * dependency.  A caller can validate/normalize a document before handing it
 * to its own storage boundary.  The history-seed helpers only merge
 * suggestions; a member or department-leader decision is recorded as an
 * authoritative field decision and is never silently replaced by a later
 * seed.
 */

const PROFILE_STATUS_ACTIVE = 'active';
const PROFILE_STATUS_INACTIVE = 'inactive';
const PROFILE_STATUSES = Object.freeze([
  PROFILE_STATUS_ACTIVE,
  PROFILE_STATUS_INACTIVE
]);

const PROFILE_ROLE_MEMBER = 'member';
const PROFILE_ROLE_LEADER = 'leader';
const PROFILE_ROLES = Object.freeze([
  PROFILE_ROLE_MEMBER,
  PROFILE_ROLE_LEADER
]);

const AVAILABILITY_AVAILABLE = 'available';
const AVAILABILITY_UNAVAILABLE = 'unavailable';
const AVAILABILITY_UNKNOWN = 'unknown';
const AVAILABILITY_STATUSES = Object.freeze([
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE
]);

const FIELD_NAMES = Object.freeze([
  'status',
  'eligibleDuties',
  'schedulable',
  'availability'
]);

const HISTORY_SEED_SOURCE = 'historical-assignments';
const FIELD_SOURCES = Object.freeze([
  'initial',
  'history-seed',
  'manual',
  'import'
]);
const FIELD_AUTHORITIES = Object.freeze([
  'system',
  'history-seed',
  'member',
  'leader',
  'admin',
  'import'
]);
const AUTHORITATIVE_DECISION_ROLES = new Set(['member', 'leader', 'admin']);

const DEFAULT_ATTRIBUTION = Object.freeze({
  createdBy: 'system',
  createdAt: 0,
  updatedBy: 'system',
  updatedAt: 0
});

const PROFILE_KEYS = new Set([
  'id',
  'profileId',
  'department',
  'departmentId',
  'member',
  'memberName',
  'role',
  'status',
  'active',
  'eligibleDuties',
  'duties',
  'schedulable',
  'isSchedulable',
  'availability',
  'attribution',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
  'fieldAttribution',
  'fieldDecisions',
  'decisions',
  'historySeed',
  'provenance'
]);

const AVAILABILITY_KEYS = new Set([
  'recurring',
  'exceptions',
  'dateExceptions'
]);

const ATTRIBUTION_KEYS = new Set([
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt'
]);

const FIELD_DECISION_KEYS = new Set([
  'source',
  'authority',
  'by',
  'at'
]);

const HISTORY_SEED_KEYS = new Set([
  'source',
  'seededBy',
  'seededAt',
  'evidence'
]);

const EVIDENCE_KEYS = new Set([
  'department',
  'member',
  'duty',
  'date',
  'service',
  'serviceTime',
  'time',
  'sourceId'
]);

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function fail(message, path) {
  const error = new TypeError(path ? `${path}: ${message}` : message);
  if (path) error.path = path;
  throw error;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, path) {
  if (!isPlainObject(value)) fail('expected a plain object', path);
  return value;
}

function assertAllowedKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) fail('unsafe key is not allowed', `${path}.${key}`);
    if (!allowed.has(key)) fail(`unknown field "${key}"`, `${path}.${key}`);
  }
}

function normalizeText(value, path, options = {}) {
  const { required = true, max = 160 } = options;
  if (value == null && !required) return '';
  if (typeof value !== 'string') fail('expected a string', path);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (required && !normalized) fail('must not be empty', path);
  if (!normalized && !required) return '';
  if (normalized.length > max) fail(`must be at most ${max} characters`, path);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    fail('contains a control character', path);
  }
  return normalized;
}

function normalizeKey(value, path, options = {}) {
  const normalized = normalizeText(value, path, options);
  if (!normalized) return normalized;
  if (DANGEROUS_KEYS.has(normalized)) fail('unsafe key is not allowed', path);
  return normalized;
}

function normalizeTimestamp(value, path, fallback) {
  const timestamp = value == null ? fallback : value;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    fail('must be a non-negative safe integer timestamp', path);
  }
  return timestamp;
}

function normalizeDate(value, path) {
  const date = normalizeText(value, path, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('must use YYYY-MM-DD format', path);
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day) {
    fail('must be a real calendar date', path);
  }
  return date;
}

function normalizedSort(left, right) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function keyFor(value) {
  return value.toLocaleLowerCase();
}

function uniqueSortedStrings(values, path, options = {}) {
  if (values == null) return [];
  if (!Array.isArray(values)) fail('expected an array', path);
  const seen = new Set();
  const output = [];
  values.forEach((value, index) => {
    const normalized = normalizeText(value, `${path}[${index}]`, options);
    const identity = keyFor(normalized);
    if (seen.has(identity)) return;
    seen.add(identity);
    output.push(normalized);
  });
  return output.sort(normalizedSort);
}

function normalizeStatus(value, path, fallback = PROFILE_STATUS_ACTIVE) {
  const status = value == null ? fallback : normalizeText(value, path, { max: 16 }).toLocaleLowerCase();
  if (!PROFILE_STATUSES.includes(status)) {
    fail(`must be one of: ${PROFILE_STATUSES.join(', ')}`, path);
  }
  return status;
}

function normalizeRole(value, path, fallback = PROFILE_ROLE_MEMBER) {
  const role = value == null ? fallback : normalizeText(value, path, { max: 16 }).toLocaleLowerCase();
  if (!PROFILE_ROLES.includes(role)) {
    fail(`must be one of: ${PROFILE_ROLES.join(', ')}`, path);
  }
  return role;
}

function normalizeAvailabilityStatus(value, path) {
  if (typeof value !== 'string') fail('expected a string status', path);
  const status = value.trim().toLocaleLowerCase();
  if (!AVAILABILITY_STATUSES.includes(status)) {
    fail(`must be one of: ${AVAILABILITY_STATUSES.join(', ')}`, path);
  }
  return status;
}

function normalizeStatusMap(value, path) {
  if (value == null) return {};
  assertPlainObject(value, path);
  const output = {};
  const seen = new Set();
  for (const rawKey of Object.keys(value).sort(normalizedSort)) {
    const normalizedKey = normalizeKey(rawKey, `${path}.${rawKey}`, { max: 80 }).toLocaleLowerCase();
    const identity = keyFor(normalizedKey);
    if (seen.has(identity)) fail('duplicate key after normalization', `${path}.${rawKey}`);
    seen.add(identity);
    output[normalizedKey] = normalizeAvailabilityStatus(value[rawKey], `${path}.${rawKey}`);
  }
  return output;
}

function normalizeAvailability(value, path = 'availability') {
  if (value == null) return { recurring: {}, exceptions: {} };
  assertPlainObject(value, path);
  assertAllowedKeys(value, AVAILABILITY_KEYS, path);
  const recurring = normalizeStatusMap(value.recurring, `${path}.recurring`);
  const rawExceptions = value.exceptions == null ? value.dateExceptions : value.exceptions;
  if (value.exceptions != null && value.dateExceptions != null) {
    fail('use either exceptions or dateExceptions, not both', path);
  }
  if (rawExceptions == null) return { recurring, exceptions: {} };
  assertPlainObject(rawExceptions, `${path}.exceptions`);
  const exceptions = {};
  for (const rawDate of Object.keys(rawExceptions).sort()) {
    const date = normalizeDate(rawDate, `${path}.exceptions.${rawDate}`);
    if (Object.prototype.hasOwnProperty.call(exceptions, date)) {
      fail('duplicate date after normalization', `${path}.exceptions.${rawDate}`);
    }
    exceptions[date] = normalizeStatusMap(
      rawExceptions[rawDate],
      `${path}.exceptions.${rawDate}`
    );
  }
  return { recurring, exceptions };
}

function normalizeActor(value, options = {}) {
  const {
    fallbackRole = 'system',
    fallbackAt = 0,
    path = 'actor'
  } = options;
  let input = value;
  if (input == null) input = {};
  if (typeof input === 'string') input = { by: input };
  assertPlainObject(input, path);
  const allowed = new Set([
    'by',
    'editor',
    'id',
    'uid',
    'name',
    'role',
    'kind',
    'actorType',
    'at',
    'timestamp',
    'updatedAt'
  ]);
  assertAllowedKeys(input, allowed, path);
  const by = normalizeText(
    input.by ?? input.editor ?? input.id ?? input.uid ?? input.name,
    `${path}.by`
  );
  const roleValue = input.role ?? input.kind ?? input.actorType ?? fallbackRole;
  const role = normalizeText(roleValue, `${path}.role`, { max: 24 }).toLocaleLowerCase();
  if (!FIELD_AUTHORITIES.includes(role) && role !== 'history-seed') {
    fail('role is not supported', `${path}.role`);
  }
  const at = normalizeTimestamp(
    input.at ?? input.timestamp ?? input.updatedAt,
    `${path}.at`,
    fallbackAt
  );
  return { by, role, at };
}

function normalizeAttribution(input, fallback = DEFAULT_ATTRIBUTION, path = 'attribution') {
  if (input == null) return { ...fallback };
  assertPlainObject(input, path);
  assertAllowedKeys(input, ATTRIBUTION_KEYS, path);
  const createdBy = normalizeText(
    input.createdBy ?? fallback.createdBy,
    `${path}.createdBy`
  );
  const createdAt = normalizeTimestamp(
    input.createdAt,
    `${path}.createdAt`,
    fallback.createdAt
  );
  const updatedBy = normalizeText(
    input.updatedBy ?? fallback.updatedBy,
    `${path}.updatedBy`
  );
  const updatedAt = normalizeTimestamp(
    input.updatedAt,
    `${path}.updatedAt`,
    fallback.updatedAt
  );
  return { createdBy, createdAt, updatedBy, updatedAt };
}

function normalizeFieldDecision(value, fallback, path) {
  if (value == null) return { ...fallback };
  assertPlainObject(value, path);
  assertAllowedKeys(value, FIELD_DECISION_KEYS, path);
  const source = normalizeText(value.source ?? fallback.source, `${path}.source`, { max: 24 }).toLocaleLowerCase();
  if (!FIELD_SOURCES.includes(source)) fail('source is not supported', `${path}.source`);
  const authority = normalizeText(value.authority ?? fallback.authority, `${path}.authority`, { max: 24 }).toLocaleLowerCase();
  if (!FIELD_AUTHORITIES.includes(authority)) fail('authority is not supported', `${path}.authority`);
  const by = normalizeText(value.by ?? fallback.by, `${path}.by`);
  const at = normalizeTimestamp(value.at, `${path}.at`, fallback.at);
  return { source, authority, by, at };
}

function defaultFieldAttribution(attribution) {
  return FIELD_NAMES.reduce((output, field) => {
    output[field] = {
      source: 'initial',
      authority: 'system',
      by: attribution.updatedBy,
      at: attribution.updatedAt
    };
    return output;
  }, {});
}

function normalizeFieldAttribution(input, attribution, path = 'fieldAttribution') {
  const source = input == null ? {} : input;
  assertPlainObject(source, path);
  const output = defaultFieldAttribution(attribution);
  for (const field of Object.keys(source)) {
    if (!FIELD_NAMES.includes(field)) fail(`unknown field "${field}"`, `${path}.${field}`);
  }
  for (const field of FIELD_NAMES) {
    output[field] = normalizeFieldDecision(source[field], output[field], `${path}.${field}`);
  }
  return output;
}

function normalizeEvidence(value, path = 'historySeed.evidence') {
  if (value == null) return [];
  if (!Array.isArray(value)) fail('expected an array', path);
  const output = [];
  const seen = new Set();
  value.forEach((item, index) => {
    assertPlainObject(item, `${path}[${index}]`);
    assertAllowedKeys(item, EVIDENCE_KEYS, `${path}[${index}]`);
    const department = normalizeText(item.department, `${path}[${index}].department`);
    const member = normalizeText(item.member, `${path}[${index}].member`);
    const duty = normalizeText(item.duty, `${path}[${index}].duty`);
    const date = item.date == null ? '' : normalizeDate(item.date, `${path}[${index}].date`);
    const service = item.service == null ? '' : normalizeText(item.service, `${path}[${index}].service`, { required: false });
    const serviceTime = item.serviceTime == null && item.time == null
      ? ''
      : normalizeText(item.serviceTime ?? item.time, `${path}[${index}].serviceTime`, { required: false });
    const sourceId = item.sourceId == null ? '' : normalizeText(item.sourceId, `${path}[${index}].sourceId`, { required: false, max: 180 });
    const normalized = { department, member, duty };
    if (date) normalized.date = date;
    if (service) normalized.service = service;
    if (serviceTime) normalized.serviceTime = serviceTime;
    if (sourceId) normalized.sourceId = sourceId;
    const identity = JSON.stringify([
      department,
      member,
      duty,
      date,
      service,
      serviceTime,
      sourceId
    ].map(keyFor));
    if (seen.has(identity)) return;
    seen.add(identity);
    output.push(normalized);
  });
  output.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return output;
}

function normalizeHistorySeed(value, path = 'historySeed') {
  if (value == null) return null;
  assertPlainObject(value, path);
  assertAllowedKeys(value, HISTORY_SEED_KEYS, path);
  const source = normalizeText(value.source ?? HISTORY_SEED_SOURCE, `${path}.source`, { max: 64 });
  if (source !== HISTORY_SEED_SOURCE) fail(`must be ${HISTORY_SEED_SOURCE}`, `${path}.source`);
  const seededBy = normalizeText(value.seededBy ?? 'history-seed', `${path}.seededBy`);
  const seededAt = normalizeTimestamp(value.seededAt, `${path}.seededAt`, 0);
  const evidence = normalizeEvidence(value.evidence, `${path}.evidence`);
  if (!evidence.length) fail('must include at least one evidence item', `${path}.evidence`);
  return { source, seededBy, seededAt, evidence };
}

function identitySegment(value) {
  const normalized = keyFor(value);
  const readable = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (readable) return readable;
  return Array.from(normalized)
    .map(character => character.codePointAt(0).toString(16))
    .join('') || 'item';
}

function profileIdFor(department, member) {
  const normalizedDepartment = normalizeText(department, 'department');
  const normalizedMember = normalizeText(member, 'member');
  return `${identitySegment(normalizedDepartment)}::${identitySegment(normalizedMember)}`;
}

function normalizedProfileInput(input, options = {}) {
  assertPlainObject(input, 'profile');
  assertAllowedKeys(input, PROFILE_KEYS, 'profile');

  const department = normalizeText(input.department ?? input.departmentId, 'profile.department');
  const member = normalizeText(input.member ?? input.memberName, 'profile.member');
  const expectedId = profileIdFor(department, member);
  const suppliedId = input.id ?? input.profileId;
  const id = suppliedId == null
    ? expectedId
    : normalizeText(suppliedId, 'profile.id', { max: 240 });
  const role = normalizeRole(input.role, 'profile.role');

  let status = normalizeStatus(input.status, 'profile.status');
  if (input.active != null) {
    if (typeof input.active !== 'boolean') fail('expected a boolean', 'profile.active');
    const activeStatus = input.active ? PROFILE_STATUS_ACTIVE : PROFILE_STATUS_INACTIVE;
    if (input.status != null && status !== activeStatus) {
      fail('status and active disagree', 'profile.active');
    }
    status = activeStatus;
  }

  const eligibleDuties = uniqueSortedStrings(
    input.eligibleDuties ?? input.duties ?? [],
    'profile.eligibleDuties',
    { max: 100 }
  );
  const schedulableInput = input.schedulable ?? input.isSchedulable;
  if (schedulableInput != null && typeof schedulableInput !== 'boolean') {
    fail('expected a boolean', 'profile.schedulable');
  }
  const schedulable = schedulableInput == null ? false : schedulableInput;
  const availability = normalizeAvailability(input.availability, 'profile.availability');

  const attributionInput = input.attribution || {
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt
  };
  const fallbackAttribution = options.attribution || DEFAULT_ATTRIBUTION;
  const attribution = normalizeAttribution(attributionInput, fallbackAttribution);
  if (input.updatedBy != null && input.updatedBy !== attribution.updatedBy) {
    fail('does not match attribution.updatedBy', 'profile.updatedBy');
  }
  if (input.updatedAt != null && input.updatedAt !== attribution.updatedAt) {
    fail('does not match attribution.updatedAt', 'profile.updatedAt');
  }

  const decisionsInput = input.fieldAttribution ?? input.fieldDecisions ?? input.decisions;
  const fieldAttribution = normalizeFieldAttribution(
    decisionsInput,
    attribution,
    'profile.fieldAttribution'
  );
  const historySeed = normalizeHistorySeed(
    input.historySeed ?? input.provenance,
    'profile.historySeed'
  );

  return {
    id,
    department,
    member,
    role,
    status,
    eligibleDuties,
    schedulable,
    availability,
    attribution,
    updatedBy: attribution.updatedBy,
    updatedAt: attribution.updatedAt,
    fieldAttribution,
    historySeed
  };
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function normalizeDepartmentProfile(input, options = {}) {
  return freezeDeep(normalizedProfileInput(input, options));
}

function createDepartmentProfile(input, options = {}) {
  const at = normalizeTimestamp(
    options.at ?? options.now,
    'options.at',
    Date.now()
  );
  const actor = normalizeActor(
    options.actor ?? options.editor ?? options.by ?? {
      by: 'system',
      role: 'system',
      at
    },
    { fallbackRole: 'system', fallbackAt: at, path: 'options.actor' }
  );
  const attribution = {
    createdBy: actor.by,
    createdAt: at,
    updatedBy: actor.by,
    updatedAt: at
  };
  const source = actor.role === 'history-seed' ? 'history-seed' :
    AUTHORITATIVE_DECISION_ROLES.has(actor.role) ? 'manual' :
      actor.role === 'import' ? 'import' : 'initial';
  const authority = FIELD_AUTHORITIES.includes(actor.role) ? actor.role : 'system';
  const fieldAttribution = FIELD_NAMES.reduce((output, field) => {
    output[field] = { source, authority, by: actor.by, at };
    return output;
  }, {});
  const candidate = {
    ...input,
    attribution: input && input.attribution ? input.attribution : attribution,
    fieldAttribution: input && (input.fieldAttribution || input.fieldDecisions || input.decisions)
      ? (input.fieldAttribution || input.fieldDecisions || input.decisions)
      : fieldAttribution
  };
  return normalizeDepartmentProfile(candidate, { attribution });
}

function assertProfile(profile) {
  return normalizeDepartmentProfile(profile);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizePatch(patch) {
  assertPlainObject(patch, 'patch');
  const allowed = new Set(['status', 'eligibleDuties', 'duties', 'schedulable', 'isSchedulable', 'availability']);
  assertAllowedKeys(patch, allowed, 'patch');
  const normalized = {};
  if (patch.status != null) normalized.status = normalizeStatus(patch.status, 'patch.status');
  if (patch.eligibleDuties != null || patch.duties != null) {
    normalized.eligibleDuties = uniqueSortedStrings(
      patch.eligibleDuties ?? patch.duties,
      'patch.eligibleDuties',
      { max: 100 }
    );
  }
  if (patch.schedulable != null || patch.isSchedulable != null) {
    const value = patch.schedulable ?? patch.isSchedulable;
    if (typeof value !== 'boolean') fail('expected a boolean', 'patch.schedulable');
    normalized.schedulable = value;
  }
  if (patch.availability != null) normalized.availability = normalizeAvailability(patch.availability, 'patch.availability');
  if (!Object.keys(normalized).length) fail('must change at least one profile field', 'patch');
  return normalized;
}

function changeSourceForActor(actor) {
  if (AUTHORITATIVE_DECISION_ROLES.has(actor.role)) return 'manual';
  if (actor.role === 'history-seed') return 'history-seed';
  if (actor.role === 'import') return 'import';
  return 'initial';
}

function updateDepartmentProfile(profile, patch, change = {}) {
  const current = assertProfile(profile);
  const normalizedPatch = normalizePatch(patch);
  const actor = normalizeActor(change, {
    fallbackRole: 'system',
    fallbackAt: current.updatedAt,
    path: 'change'
  });
  const next = { ...current };
  let changed = false;
  const changedFields = [];
  for (const field of FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(normalizedPatch, field)) continue;
    if (valuesEqual(current[field], normalizedPatch[field])) continue;
    next[field] = normalizedPatch[field];
    changed = true;
    changedFields.push(field);
  }
  if (!changed) return current;

  const source = changeSourceForActor(actor);
  const authority = FIELD_AUTHORITIES.includes(actor.role) ? actor.role : 'system';
  next.fieldAttribution = { ...current.fieldAttribution };
  for (const field of changedFields) {
    next.fieldAttribution[field] = {
      source,
      authority,
      by: actor.by,
      at: actor.at
    };
  }
  next.attribution = {
    ...current.attribution,
    updatedBy: actor.by,
    updatedAt: actor.at
  };
  next.updatedBy = actor.by;
  next.updatedAt = actor.at;
  return normalizeDepartmentProfile(next);
}

function isAuthoritativeDecision(decision) {
  return !!decision && (
    AUTHORITATIVE_DECISION_ROLES.has(decision.authority) ||
    decision.source === 'manual'
  );
}

function mergeEvidence(left, right) {
  return normalizeEvidence([...(left || []), ...(right || [])]);
}

function mergeHistorySeed(profile, suggestion, options = {}) {
  assertPlainObject(suggestion, 'suggestion');
  const suggestionKeys = new Set([
    'id',
    'profileId',
    'department',
    'member',
    'role',
    'status',
    'eligibleDuties',
    'duties',
    'schedulable',
    'historySeed',
    'provenance'
  ]);
  assertAllowedKeys(suggestion, suggestionKeys, 'suggestion');
  const department = normalizeText(suggestion.department, 'suggestion.department');
  const member = normalizeText(suggestion.member, 'suggestion.member');
  const id = suggestion.id ?? suggestion.profileId ?? profileIdFor(department, member);
  const evidenceSeed = normalizeHistorySeed(
    suggestion.historySeed ?? suggestion.provenance,
    'suggestion.historySeed'
  );
  if (!evidenceSeed) fail('must include historySeed provenance', 'suggestion.historySeed');
  const at = normalizeTimestamp(
    options.at ?? options.now ?? evidenceSeed.seededAt,
    'options.at',
    evidenceSeed.seededAt
  );
  const actor = normalizeActor(
    options.actor ?? {
      by: evidenceSeed.seededBy,
      role: 'history-seed',
      at
    },
    { fallbackRole: 'history-seed', fallbackAt: at, path: 'options.actor' }
  );
  const seedFields = {
    id,
    department,
    member,
    role: suggestion.role ?? PROFILE_ROLE_MEMBER,
    status: suggestion.status ?? PROFILE_STATUS_ACTIVE,
    eligibleDuties: suggestion.eligibleDuties ?? suggestion.duties ?? [],
    schedulable: suggestion.schedulable == null ? true : suggestion.schedulable,
    historySeed: {
      source: HISTORY_SEED_SOURCE,
      seededBy: evidenceSeed.seededBy,
      seededAt: evidenceSeed.seededAt,
      evidence: evidenceSeed.evidence
    }
  };

  if (!profile) return createDepartmentProfile(seedFields, { actor, at });

  const current = assertProfile(profile);
  if (current.id !== id || current.department !== department || current.member !== member) {
    fail('profile identity does not match suggestion', 'suggestion');
  }
  const next = { ...current };
  let changed = false;
  const seedableFields = ['status', 'eligibleDuties', 'schedulable'];
  const candidate = normalizedProfileInput({
    ...current,
    ...seedFields,
    attribution: current.attribution,
    fieldAttribution: current.fieldAttribution
  });
  for (const field of seedableFields) {
    if (isAuthoritativeDecision(current.fieldAttribution[field])) continue;
    if (valuesEqual(current[field], candidate[field])) continue;
    next[field] = candidate[field];
    next.fieldAttribution = next.fieldAttribution || { ...current.fieldAttribution };
    next.fieldAttribution[field] = {
      source: 'history-seed',
      authority: 'history-seed',
      by: actor.by,
      at
    };
    changed = true;
  }

  const currentSeed = current.historySeed;
  const mergedSeed = {
    source: HISTORY_SEED_SOURCE,
    seededBy: currentSeed ? currentSeed.seededBy : evidenceSeed.seededBy,
    seededAt: currentSeed ? currentSeed.seededAt : evidenceSeed.seededAt,
    evidence: mergeEvidence(currentSeed && currentSeed.evidence, evidenceSeed.evidence)
  };
  if (!valuesEqual(currentSeed, mergedSeed)) {
    next.historySeed = mergedSeed;
    changed = true;
  }
  if (!changed) return current;
  next.attribution = {
    ...current.attribution,
    updatedBy: actor.by,
    updatedAt: at
  };
  next.updatedBy = actor.by;
  next.updatedAt = at;
  return normalizeDepartmentProfile(next);
}

function isActive(profile) {
  return assertProfile(profile).status === PROFILE_STATUS_ACTIVE;
}

function isDutyEligible(profile, duty) {
  const current = assertProfile(profile);
  if (typeof duty !== 'string' || !duty.trim()) return false;
  const identity = keyFor(duty.trim().replace(/\s+/g, ' '));
  return current.eligibleDuties.some(candidate => keyFor(candidate) === identity);
}

function isSchedulable(profile) {
  const current = assertProfile(profile);
  return current.status === PROFILE_STATUS_ACTIVE && current.schedulable === true;
}

function effectiveAvailability(profile, dateOrOptions, serviceTimeInput) {
  const current = assertProfile(profile);
  let date = dateOrOptions;
  let serviceTime = serviceTimeInput;
  if (isPlainObject(dateOrOptions)) {
    date = dateOrOptions.date;
    serviceTime = dateOrOptions.serviceTime ?? dateOrOptions.time;
  }
  const normalizedDate = normalizeDate(date, 'availability.date');
  const normalizedServiceTime = normalizeKey(serviceTime, 'availability.serviceTime', { max: 80 });
  const day = current.availability.exceptions[normalizedDate];
  if (day && Object.prototype.hasOwnProperty.call(day, normalizedServiceTime)) {
    return day[normalizedServiceTime];
  }
  if (day && Object.prototype.hasOwnProperty.call(day, '*')) return day['*'];
  return current.availability.recurring[normalizedServiceTime] || AVAILABILITY_UNKNOWN;
}

function isAvailable(profile, dateOrOptions, serviceTimeInput) {
  return effectiveAvailability(profile, dateOrOptions, serviceTimeInput) === AVAILABILITY_AVAILABLE;
}

function isCurrentlySchedulable(profile, options = {}) {
  const current = assertProfile(profile);
  if (!isSchedulable(current)) return false;
  if (!isDutyEligible(current, options.duty)) return false;
  if (!options.date || !(options.serviceTime ?? options.time)) return false;
  return isAvailable(current, options.date, options.serviceTime ?? options.time);
}

const API = {
  PROFILE_STATUS_ACTIVE,
  PROFILE_STATUS_INACTIVE,
  PROFILE_STATUSES,
  PROFILE_ROLE_MEMBER,
  PROFILE_ROLE_LEADER,
  PROFILE_ROLES,
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  AVAILABILITY_UNKNOWN,
  AVAILABILITY_STATUSES,
  FIELD_NAMES,
  FIELD_SOURCES,
  FIELD_AUTHORITIES,
  HISTORY_SEED_SOURCE,
  profileIdFor,
  normalizeAvailability,
  normalizeDepartmentProfile,
  validateDepartmentProfile: normalizeDepartmentProfile,
  createDepartmentProfile,
  updateDepartmentProfile,
  mergeHistorySeed,
  isAuthoritativeDecision,
  isActive,
  isDutyEligible,
  isSchedulable,
  effectiveAvailability,
  isAvailable,
  isCurrentlySchedulable
};

module.exports = API;
