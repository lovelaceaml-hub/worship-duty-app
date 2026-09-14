'use strict';

/*
 * Pure planning and protection for the first department roster seed.
 *
 * Historical schedule rows are display-name shaped, while department
 * profiles are authorized by member UID.  This module resolves those rows to
 * one canonical UID, groups evidence by department plus UID, and returns
 * deterministic plans.  It never opens Firestore, reads a production
 * service, or writes a document.
 */

const crypto = require('node:crypto');
const {
  DEFAULT_DUTY_DEPARTMENTS,
  mapDutyDepartment
} = require('../department-profile-migration.js');
const authz = require('./department-auth.js');

const HISTORY_SEED_SOURCE = 'historical-assignments';
const PROFILE_FIELDS = Object.freeze([
  'status',
  'eligibleDuties',
  'schedulable',
  'availability'
]);
const AUTHORITATIVE_AUTHORITIES = new Set(['member', 'leader', 'admin']);
const AUTHORITATIVE_SOURCES = new Set(['manual']);
const IDENTITY_UID_FIELDS = ['uid', 'memberUid', 'authUid', 'memberId'];
const IDENTITY_NAME_FIELDS = ['memberName', 'name', 'member', 'displayName'];
const IDENTITY_ALIAS_FIELDS = ['aliases', 'nameAliases', 'memberAliases', 'alias'];
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

class IdentityResolutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IdentityResolutionError';
    this.code = 'identity-conflict';
    Object.assign(this, details);
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const output = {};
  Object.keys(value).forEach(key => { output[key] = clone(value[key]); });
  return output;
}

function text(value, options = {}) {
  const { required = false, max = 160, label = 'value' } = options;
  if (value == null) {
    if (required) throw new TypeError(`${label} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (required && !normalized) throw new TypeError(`${label} must not be empty`);
  if (!normalized) return '';
  if (normalized.length > max) throw new TypeError(`${label} is too long`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new TypeError(`${label} contains a control character`);
  }
  return normalized;
}

function uid(value, label = 'memberUid') {
  const normalized = text(value, { required: true, max: 128, label });
  if (normalized.includes('/')) throw new TypeError(`${label} cannot contain '/'`);
  if (DANGEROUS_KEYS.has(normalized)) throw new TypeError(`${label} is unsafe`);
  return normalized;
}

function department(value, label = 'departmentId') {
  const normalized = text(value, { required: true, max: 100, label });
  if (normalized.includes('/')) throw new TypeError(`${label} cannot contain '/'`);
  if (DANGEROUS_KEYS.has(normalized)) throw new TypeError(`${label} is unsafe`);
  return normalized;
}

function identityKey(value) {
  return text(value, { max: 160 }).toLocaleLowerCase();
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
}

function uniqueSorted(values) {
  const output = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach(value => {
    const normalized = text(value, { max: 100 });
    if (!normalized) return;
    const key = identityKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output.sort(compareText);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort(compareText).reduce((output, key) => {
    output[key] = stableValue(value[key]);
    return output;
  }, {});
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function fingerprint(value) {
  return crypto.createHash('sha256')
    .update(stableStringify(value === undefined ? null : value))
    .digest('hex');
}

function normalizeAliases(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(item => text(item, { max: 160, label: 'identity alias' })).filter(Boolean);
}

function firstField(value, fields) {
  if (!isPlainObject(value)) return '';
  for (const field of fields) {
    if (value[field] != null && value[field] !== '') return value[field];
  }
  return '';
}

function addIdentityRecord(state, rawUid, rawName, rawAliases, source = 'identity') {
  const normalizedUid = uid(rawUid, 'identity.uid');
  const name = text(rawName, { max: 160, label: 'identity.name' });
  const aliases = normalizeAliases(rawAliases);
  const names = [name, ...aliases].filter(Boolean);
  const existing = state.byUid.get(normalizedUid) || {
    uid: normalizedUid,
    names: new Set(),
    canonicalNames: new Set()
  };
  if (name) existing.canonicalNames.add(name);
  names.forEach(item => existing.names.add(item));
  state.byUid.set(normalizedUid, existing);
  names.forEach(item => {
    const key = identityKey(item);
    const prior = state.byAlias.get(key);
    if (prior && prior !== normalizedUid) {
      throw new IdentityResolutionError(
        `Identity alias "${item}" maps to both ${prior} and ${normalizedUid}.`,
        { alias: item, existingUid: prior, conflictingUid: normalizedUid, source }
      );
    }
    state.byAlias.set(key, normalizedUid);
  });
}

function addAliasMapping(state, rawAlias, rawTarget, source = 'alias') {
  const alias = text(rawAlias, { required: true, max: 160, label: 'identity alias' });
  const targetText = text(rawTarget, { required: true, max: 160, label: 'identity alias target' });
  const targetUid = state.byUid.has(targetText)
    ? targetText
    : state.byAlias.get(identityKey(targetText));
  if (!targetUid) {
    // An alias map commonly arrives as alias -> UID before the directory is
    // loaded. Treat an unambiguous target as a UID, while still rejecting
    // duplicate aliases.
    addIdentityRecord(state, targetText, '', [] , source);
  }
  const resolvedUid = state.byUid.has(targetText)
    ? targetText
    : state.byAlias.get(identityKey(targetText));
  const key = identityKey(alias);
  const prior = state.byAlias.get(key);
  if (prior && prior !== resolvedUid) {
    throw new IdentityResolutionError(
      `Identity alias "${alias}" maps to both ${prior} and ${resolvedUid}.`,
      { alias, existingUid: prior, conflictingUid: resolvedUid, source }
    );
  }
  state.byAlias.set(key, resolvedUid);
  const record = state.byUid.get(resolvedUid);
  if (record) record.names.add(alias);
}

function consumeIdentityDirectory(state, value, source = 'identities') {
  if (value == null) return;
  state.hasDirectory = true;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === 'string') return;
      if (!isPlainObject(item)) throw new TypeError(`${source}[${index}] must be an object`);
      const rawUid = firstField(item, IDENTITY_UID_FIELDS);
      if (!rawUid) throw new TypeError(`${source}[${index}] is missing uid`);
      const name = firstField(item, IDENTITY_NAME_FIELDS);
      const aliases = firstField(item, IDENTITY_ALIAS_FIELDS);
      addIdentityRecord(state, rawUid, name, aliases, `${source}[${index}]`);
    });
    return;
  }
  if (!isPlainObject(value)) throw new TypeError(`${source} must be an array or object`);
  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'string') {
      addAliasMapping(state, key, item, source);
      return;
    }
    if (Array.isArray(item)) {
      addIdentityRecord(state, key, '', item, source);
      return;
    }
    if (!isPlainObject(item)) throw new TypeError(`${source}.${key} must be an object`);
    const rawUid = firstField(item, IDENTITY_UID_FIELDS) || key;
    const name = firstField(item, IDENTITY_NAME_FIELDS);
    const aliases = firstField(item, IDENTITY_ALIAS_FIELDS);
    addIdentityRecord(state, rawUid, name, aliases, `${source}.${key}`);
  });
}

function createIdentityResolver(options = {}) {
  const source = Array.isArray(options) ? { identities: options } : (options || {});
  const state = {
    byUid: new Map(),
    byAlias: new Map(),
    hasDirectory: false
  };
  const directory = source.identities ?? source.members ?? source.accounts ?? source.memberDirectory;
  consumeIdentityDirectory(state, directory, 'identities');
  const aliases = source.aliases ?? source.identityAliases ?? source.nameAliases;
  if (aliases != null) {
    state.hasDirectory = true;
    if (!isPlainObject(aliases)) throw new TypeError('identity aliases must be an object');
    Object.entries(aliases).forEach(([alias, target]) => {
      addAliasMapping(state, alias, target, 'aliases');
    });
  }
  const records = new Map();
  state.byUid.forEach((record, recordUid) => {
    const canonicalCandidates = Array.from(record.canonicalNames);
    const allCandidates = Array.from(record.names);
    const candidates = canonicalCandidates.length ? canonicalCandidates : allCandidates;
    const canonical = candidates.sort((left, right) => {
      if (left.length !== right.length) return left.length - right.length;
      return compareText(left, right);
    })[0] || recordUid;
    records.set(recordUid, Object.freeze({
      uid: recordUid,
      memberName: canonical,
      aliases: Object.freeze(allCandidates.sort(compareText))
    }));
  });
  const frozenByAlias = new Map(state.byAlias);
  const resolver = {
    hasDirectory: state.hasDirectory,
    size: records.size,
    identities: Object.freeze(Array.from(records.values()).sort((left, right) => compareText(left.uid, right.uid))),
    resolve(input = {}) {
      const rawUid = firstField(input, IDENTITY_UID_FIELDS);
      const rawName = firstField(input, IDENTITY_NAME_FIELDS);
      const explicitUid = rawUid ? uid(rawUid, 'memberUid') : '';
      const suppliedName = rawName ? text(rawName, { max: 160, label: 'member name' }) : '';
      if (!explicitUid && !suppliedName) {
        throw new IdentityResolutionError('A member UID or display name is required.', {
          reason: 'missing-identity'
        });
      }
      const mappedByName = suppliedName ? frozenByAlias.get(identityKey(suppliedName)) : undefined;
      if (explicitUid && mappedByName && mappedByName !== explicitUid) {
        throw new IdentityResolutionError(
          `Member name "${suppliedName}" resolves to ${mappedByName}, not ${explicitUid}.`,
          { reason: 'uid-alias-mismatch', suppliedName, suppliedUid: explicitUid, mappedUid: mappedByName }
        );
      }
      const resolvedUid = explicitUid || mappedByName;
      if (!resolvedUid) {
        throw new IdentityResolutionError(
          `Member name "${suppliedName}" is not mapped to a UID.`,
          { reason: 'unresolved-alias', suppliedName }
        );
      }
      const record = records.get(resolvedUid);
      if (state.hasDirectory && !record) {
        throw new IdentityResolutionError(`Member UID "${resolvedUid}" is not in the identity directory.`, {
          reason: 'unknown-uid', suppliedUid: resolvedUid
        });
      }
      const memberName = record
        ? record.memberName
        : suppliedName || resolvedUid;
      return Object.freeze({
        memberUid: resolvedUid,
        uid: resolvedUid,
        memberName,
        member: memberName,
        suppliedName: suppliedName || memberName
      });
    }
  };
  return Object.freeze(resolver);
}

function resolveMemberIdentity(row, resolver) {
  const source = resolver && typeof resolver.resolve === 'function'
    ? resolver
    : createIdentityResolver(resolver || {});
  return source.resolve(row || {});
}

function sourceRows(input) {
  if (Array.isArray(input)) return input;
  if (!isPlainObject(input)) return [];
  if (Array.isArray(input.services)) return input.services;
  if (Array.isArray(input.assignments)) return input.assignments;
  if (Array.isArray(input.evidence)) return input.evidence;
  if (isPlainObject(input.assignments)) return [input];
  return [input];
}

function assignmentRows(row) {
  if (!isPlainObject(row)) return [];
  if (!isPlainObject(row.assignments)) return [row];
  return Object.entries(row.assignments).map(([duty, assignment]) => {
    if (typeof assignment === 'string') {
      return {
        ...row,
        member: assignment,
        duty
      };
    }
    if (!isPlainObject(assignment)) return { ...row, duty, member: '' };
    return {
      ...row,
      ...assignment,
      department: assignment.department ?? assignment.departmentId ?? row.department ?? row.departmentId,
      duty: assignment.duty ?? duty,
      date: assignment.date ?? assignment.serviceDate ?? row.date ?? row.serviceDate,
      service: assignment.service ?? row.service,
      serviceTime: assignment.serviceTime ?? assignment.time ?? row.serviceTime ?? row.time,
      sourceId: assignment.sourceId ?? row.sourceId
    };
  });
}

function calendarDate(value) {
  const normalized = text(value, { max: 10, label: 'assignment date' });
  if (!normalized) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? normalized
    : '';
}

function normalizeEvidenceRow(row, index, resolver, options) {
  const duty = text(row && (row.duty ?? row.role), { max: 100, label: 'assignment duty' });
  if (!duty) return { skipped: { index, reason: 'missing-duty' } };
  const explicitDepartment = text(row && (row.department ?? row.departmentId), {
    max: 100,
    label: 'assignment department'
  });
  const mappedDepartment = mapDutyDepartment(duty, options.dutyDepartments || DEFAULT_DUTY_DEPARTMENTS);
  if (!explicitDepartment && !mappedDepartment) {
    return { skipped: { index, reason: 'unknown-duty', duty } };
  }
  if (explicitDepartment && mappedDepartment && identityKey(explicitDepartment) !== identityKey(mappedDepartment)) {
    return { skipped: { index, reason: 'duty-department-mismatch', duty, department: explicitDepartment } };
  }
  const departmentValue = explicitDepartment || mappedDepartment;
  let identity;
  try {
    identity = resolveMemberIdentity(row, resolver);
  } catch (error) {
    if (error instanceof IdentityResolutionError) {
      return {
        skipped: {
          index,
          reason: error.reason || 'identity-conflict',
          member: text(row && (row.memberName ?? row.member ?? row.name), { max: 160 }),
          memberUid: text(row && (row.memberUid ?? row.uid ?? row.memberId), { max: 128 })
        }
      };
    }
    throw error;
  }
  const rawDate = row && (row.date ?? row.serviceDate);
  const normalizedDate = rawDate == null ? '' : calendarDate(rawDate);
  if (rawDate != null && !normalizedDate) {
    return { skipped: { index, reason: 'invalid-date', date: rawDate } };
  }
  const service = text(row && row.service, { max: 100, label: 'assignment service' });
  const serviceTime = text(row && (row.serviceTime ?? row.time), {
    max: 80,
    label: 'assignment service time'
  });
  const sourceId = text(row && row.sourceId, { max: 180, label: 'assignment source id' });
  const evidence = {
    department: department(departmentValue),
    member: identity.memberName,
    duty
  };
  if (normalizedDate) evidence.date = normalizedDate;
  if (service) evidence.service = service;
  if (serviceTime) evidence.serviceTime = serviceTime;
  if (sourceId) evidence.sourceId = sourceId;
  return {
    evidence,
    memberUid: identity.memberUid,
    memberName: identity.memberName,
    department: department(departmentValue),
    duty
  };
}

function evidenceKey(item, memberUid) {
  return stableStringify([
    item.department,
    memberUid,
    item.member,
    item.duty,
    item.date || '',
    item.service || '',
    item.serviceTime || '',
    item.sourceId || ''
  ].map(identityKey));
}

function normalizedTimestamp(value, label = 'seededAt') {
  const timestamp = value == null ? 0 : value;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer timestamp`);
  }
  return timestamp;
}

function actorLabel(options, fallback) {
  const actor = options && options.actor;
  if (typeof actor === 'string') return text(actor, { required: true, max: 160, label: 'actor' });
  if (isPlainObject(actor)) {
    const value = firstField(actor, ['by', 'uid', 'memberUid', 'name', 'id']);
    if (value) return text(value, { required: true, max: 160, label: 'actor' });
  }
  const configured = options && (options.seededBy ?? options.importedBy ?? options.by);
  return configured
    ? text(configured, { required: true, max: 160, label: 'seededBy' })
    : fallback;
}

function decisionFor(profile, field) {
  if (!isPlainObject(profile)) return null;
  const source = profile.fieldAttribution ?? profile.fieldDecisions ?? profile.decisions;
  return isPlainObject(source) && isPlainObject(source[field]) ? source[field] : null;
}

function hasAuthoritativeDecision(profile, field, options = {}) {
  const decision = decisionFor(profile, field);
  if (decision && (
    AUTHORITATIVE_SOURCES.has(String(decision.source || '').toLocaleLowerCase()) ||
    AUTHORITATIVE_AUTHORITIES.has(String(decision.authority || '').toLocaleLowerCase())
  )) return true;
  // A legacy profile without field attribution is unsafe to overwrite. New
  // profiles always carry explicit initial/import/history decisions, so this
  // fail-closed branch only protects old human data.
  return options.protectUnattributed !== false && !decision;
}

function profileIdentity(profile) {
  if (!isPlainObject(profile)) return null;
  const rawDepartment = profile.departmentId ?? profile.department;
  const rawUid = profile.memberUid ?? profile.uid;
  if (rawDepartment == null || rawUid == null) return null;
  try {
    const departmentId = department(rawDepartment);
    const memberUid = uid(rawUid);
    if (profile.departmentId != null && profile.department != null &&
        String(profile.departmentId) !== String(profile.department)) return null;
    if (profile.memberUid != null && profile.uid != null &&
        String(profile.memberUid) !== String(profile.uid)) return null;
    return { departmentId, memberUid };
  } catch (_error) {
    return null;
  }
}

function profileKey(departmentId, memberUid) {
  return `${department(departmentId)}\u0000${uid(memberUid)}`;
}

function profilePathFor(departmentId, memberUid) {
  const identity = profileIdentity({ departmentId, memberUid });
  if (!identity) throw new TypeError('A department and member UID are required for a profile path');
  return `departments/${identity.departmentId}/members/${identity.memberUid}`;
}

function fieldAttributionFor(source, by, at) {
  const authority = source === 'history-seed' ? 'history-seed' : source === 'import' ? 'import' : 'system';
  return PROFILE_FIELDS.reduce((output, field) => {
    output[field] = { source, authority, by, at };
    return output;
  }, {});
}

function normalizeAvailability(value) {
  if (value == null) return { recurring: {}, exceptions: {} };
  const normalized = authz.normalizeAvailability(value);
  if (!normalized) throw new TypeError('profile availability is invalid');
  return clone(normalized);
}

function normalizeSuggestion(suggestion) {
  if (!isPlainObject(suggestion)) throw new TypeError('seed suggestion must be an object');
  const identity = profileIdentity(suggestion);
  if (!identity) throw new TypeError('seed suggestion must contain matching department and member UID');
  const memberName = text(
    suggestion.memberName ?? suggestion.member,
    { required: true, max: 160, label: 'suggestion.memberName' }
  );
  const evidenceSeed = suggestion.historySeed ?? suggestion.provenance;
  if (!isPlainObject(evidenceSeed) || !Array.isArray(evidenceSeed.evidence)) {
    throw new TypeError('seed suggestion must include history evidence');
  }
  const seededAt = normalizedTimestamp(evidenceSeed.seededAt, 'historySeed.seededAt');
  const seededBy = text(evidenceSeed.seededBy ?? 'history-seed', {
    required: true,
    max: 160,
    label: 'historySeed.seededBy'
  });
  const role = suggestion.role == null ? 'member' : String(suggestion.role).trim().toLocaleLowerCase();
  if (!['member', 'leader'].includes(role)) throw new TypeError('suggestion.role must be member or leader');
  const status = suggestion.status == null ? 'active' : String(suggestion.status).trim().toLocaleLowerCase();
  if (!['active', 'inactive'].includes(status)) throw new TypeError('suggestion.status must be active or inactive');
  if (suggestion.schedulable != null && typeof suggestion.schedulable !== 'boolean') {
    throw new TypeError('suggestion.schedulable must be a boolean');
  }
  const evidence = evidenceSeed.evidence.map(item => clone(item));
  return {
    ...clone(suggestion),
    id: suggestion.id || suggestion.profileId || `${identity.departmentId}::${identity.memberUid}`,
    profileId: suggestion.profileId || suggestion.id || `${identity.departmentId}::${identity.memberUid}`,
    departmentId: identity.departmentId,
    department: identity.departmentId,
    memberUid: identity.memberUid,
    uid: identity.memberUid,
    memberName,
    member: memberName,
    role,
    status,
    eligibleDuties: uniqueSorted(suggestion.eligibleDuties ?? suggestion.duties ?? []),
    schedulable: suggestion.schedulable == null ? true : suggestion.schedulable,
    historySeed: {
      source: HISTORY_SEED_SOURCE,
      seededBy,
      seededAt,
      evidence
    }
  };
}

function normalizeExistingProfile(profile) {
  if (!isPlainObject(profile)) throw new TypeError('existing profiles must contain objects');
  const identity = profileIdentity(profile);
  if (!identity) throw new TypeError('existing profile must contain matching department and member UID');
  const memberName = text(profile.memberName ?? profile.member ?? identity.memberUid, {
    required: true,
    max: 160,
    label: 'profile.memberName'
  });
  const status = profile.status != null
    ? String(profile.status).trim().toLocaleLowerCase()
    : (profile.active === false ? 'inactive' : 'active');
  if (!['active', 'inactive'].includes(status)) throw new TypeError('existing profile status is invalid');
  const duties = Array.isArray(profile.eligibleDuties)
    ? profile.eligibleDuties
    : Array.isArray(profile.duties) ? profile.duties : [];
  const schedulable = typeof profile.schedulable === 'boolean'
    ? profile.schedulable
    : profile.isSchedulable === true;
  const attribution = isPlainObject(profile.attribution)
    ? clone(profile.attribution)
    : {
        createdBy: text(profile.createdBy, { max: 160, label: 'profile.createdBy' }) || 'system',
        createdAt: Number.isSafeInteger(profile.createdAt) ? profile.createdAt : 0,
        updatedBy: text(profile.updatedBy, { max: 160, label: 'profile.updatedBy' }) || 'system',
        updatedAt: Number.isSafeInteger(profile.updatedAt) ? profile.updatedAt : 0
      };
  const fieldSource = profile.fieldAttribution ?? profile.fieldDecisions ?? profile.decisions;
  const fieldAttribution = isPlainObject(fieldSource)
    ? clone(fieldSource)
    : fieldAttributionFor('initial', attribution.updatedBy || 'system', attribution.updatedAt || 0);
  PROFILE_FIELDS.forEach(field => {
    if (!isPlainObject(fieldAttribution[field])) {
      fieldAttribution[field] = {
        source: 'initial',
        authority: 'system',
        by: attribution.updatedBy || 'system',
        at: attribution.updatedAt || 0
      };
    }
  });
  const next = clone(profile);
  next.id = profile.id || profile.profileId || `${identity.departmentId}::${identity.memberUid}`;
  next.profileId = profile.profileId || next.id;
  next.departmentId = identity.departmentId;
  next.department = identity.departmentId;
  next.memberUid = identity.memberUid;
  next.uid = identity.memberUid;
  next.memberName = memberName;
  next.member = profile.member || memberName;
  next.role = profile.role === 'leader' ? 'leader' : 'member';
  next.status = status;
  next.active = status === 'active';
  next.eligibleDuties = Array.isArray(profile.eligibleDuties)
    ? clone(profile.eligibleDuties)
    : uniqueSorted(duties);
  next.duties = Array.isArray(profile.duties) ? clone(profile.duties) : clone(next.eligibleDuties);
  next.schedulable = schedulable;
  next.isSchedulable = typeof profile.isSchedulable === 'boolean' ? profile.isSchedulable : schedulable;
  next.availability = normalizeAvailability(profile.availability);
  next.attribution = attribution;
  next.fieldAttribution = fieldAttribution;
  next.updatedBy = profile.updatedBy || attribution.updatedBy;
  next.updatedAt = Number.isSafeInteger(profile.updatedAt) ? profile.updatedAt : attribution.updatedAt;
  return next;
}

function mergeEvidence(existing, incoming) {
  const byKey = new Map();
  [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]
    .forEach(item => {
      if (!isPlainObject(item)) return;
      const key = stableStringify(item);
      if (!byKey.has(key)) byKey.set(key, clone(item));
    });
  return Array.from(byKey.values()).sort((left, right) => compareText(stableStringify(left), stableStringify(right)));
}

function mergeSeedProfile(profile, suggestion, options = {}) {
  const normalizedSuggestion = normalizeSuggestion(suggestion);
  const source = options.source === 'import' ? 'import' : 'history-seed';
  const at = normalizedTimestamp(options.at ?? normalizedSuggestion.historySeed.seededAt, 'options.at');
  const by = actorLabel(options, normalizedSuggestion.historySeed.seededBy || source);
  const actorUid = options.actorUid || (isPlainObject(options.actor) ? options.actor.uid : '');
  if (!profile) {
    const status = normalizedSuggestion.status;
    const eligibleDuties = clone(normalizedSuggestion.eligibleDuties);
    const schedulable = normalizedSuggestion.schedulable;
    const historySeed = clone(normalizedSuggestion.historySeed);
    const attribution = {
      createdBy: by,
      createdAt: at,
      updatedBy: by,
      updatedAt: at
    };
    const created = {
      id: normalizedSuggestion.id,
      profileId: normalizedSuggestion.profileId,
      departmentId: normalizedSuggestion.departmentId,
      department: normalizedSuggestion.departmentId,
      memberUid: normalizedSuggestion.memberUid,
      uid: normalizedSuggestion.memberUid,
      memberName: normalizedSuggestion.memberName,
      member: normalizedSuggestion.memberName,
      role: normalizedSuggestion.role,
      status,
      active: status === 'active',
      eligibleDuties,
      duties: clone(eligibleDuties),
      schedulable,
      isSchedulable: schedulable,
      availability: { recurring: {}, exceptions: {} },
      createdAt: at,
      createdBy: by,
      updatedAt: at,
      updatedBy: by,
      ...(actorUid ? { updatedByUid: actorUid } : {}),
      attribution,
      fieldAttribution: fieldAttributionFor(source, by, at),
      historySeed
    };
    return created;
  }

  const existingDecisionSource = profile.fieldAttribution ?? profile.fieldDecisions ?? profile.decisions;
  const current = normalizeExistingProfile(profile);
  const currentIdentity = profileIdentity(current);
  const suggestionIdentity = profileIdentity(normalizedSuggestion);
  if (!currentIdentity || currentIdentity.departmentId !== suggestionIdentity.departmentId ||
      currentIdentity.memberUid !== suggestionIdentity.memberUid) {
    throw new IdentityResolutionError('Existing profile identity does not match seed suggestion.', {
      reason: 'profile-identity-mismatch',
      profile: currentIdentity,
      suggestion: suggestionIdentity
    });
  }
  const next = clone(current);
  let changed = false;
  const changedFields = [];
  const setField = (field, value) => {
    if (stableStringify(next[field]) === stableStringify(value)) return;
    next[field] = clone(value);
    changed = true;
    changedFields.push(field);
  };

  const protectsMissingDecision = field => options.protectUnattributed !== false &&
    (!isPlainObject(existingDecisionSource) || !isPlainObject(existingDecisionSource[field]));
  if (!protectsMissingDecision('status') && !hasAuthoritativeDecision(current, 'status', options)) {
    setField('status', normalizedSuggestion.status);
  }
  if (!protectsMissingDecision('eligibleDuties') && !hasAuthoritativeDecision(current, 'eligibleDuties', options)) {
    setField('eligibleDuties', uniqueSorted([
      ...(Array.isArray(current.eligibleDuties) ? current.eligibleDuties : []),
      ...normalizedSuggestion.eligibleDuties
    ]));
  }
  if (!protectsMissingDecision('schedulable') && !hasAuthoritativeDecision(current, 'schedulable', options)) {
    setField('schedulable', normalizedSuggestion.schedulable);
  }
  // Availability has no historical-sheet candidate. It remains unchanged,
  // and therefore a manual availability decision is always preserved.

  if (changedFields.includes('status')) {
    next.active = next.status === 'active';
    next.fieldAttribution.status = { source, authority: source, by, at };
  }
  if (changedFields.includes('eligibleDuties')) {
    next.duties = clone(next.eligibleDuties);
    next.fieldAttribution.eligibleDuties = { source, authority: source, by, at };
  }
  if (changedFields.includes('schedulable')) {
    next.isSchedulable = next.schedulable;
    next.fieldAttribution.schedulable = { source, authority: source, by, at };
  }

  const currentSeed = isPlainObject(current.historySeed) ? current.historySeed : null;
  const mergedEvidence = mergeEvidence(
    currentSeed && currentSeed.evidence,
    normalizedSuggestion.historySeed.evidence
  );
  const mergedSeed = {
    source: HISTORY_SEED_SOURCE,
    seededBy: currentSeed && currentSeed.seededBy || normalizedSuggestion.historySeed.seededBy,
    seededAt: currentSeed && Number.isSafeInteger(currentSeed.seededAt)
      ? currentSeed.seededAt
      : normalizedSuggestion.historySeed.seededAt,
    evidence: mergedEvidence
  };
  if (stableStringify(currentSeed) !== stableStringify(mergedSeed)) {
    next.historySeed = mergedSeed;
    changed = true;
  }
  if (!changed) return clone(profile);
  next.updatedBy = by;
  next.updatedAt = at;
  if (actorUid) next.updatedByUid = actorUid;
  next.attribution = {
    ...clone(current.attribution),
    updatedBy: by,
    updatedAt: at
  };
  next.fieldAttribution = {
    ...clone(current.fieldAttribution),
    ...next.fieldAttribution
  };
  return next;
}

function normalizePlanSuggestionIdentity(suggestion) {
  const normalized = normalizeSuggestion(suggestion);
  return normalized;
}

function planHistorySeed(input, options = {}) {
  const resolver = options.identityResolver && typeof options.identityResolver.resolve === 'function'
    ? options.identityResolver
    : createIdentityResolver(options);
  const seededAt = normalizedTimestamp(options.seededAt ?? options.at, 'seededAt');
  const seededBy = text(options.seededBy ?? options.by ?? 'history-seed', {
    required: true,
    max: 160,
    label: 'seededBy'
  });
  const groups = new Map();
  const skipped = [];
  let rowIndex = 0;
  for (const sourceRow of sourceRows(input)) {
    for (const row of assignmentRows(sourceRow)) {
      const normalized = normalizeEvidenceRow(row, rowIndex, resolver, options);
      rowIndex += 1;
      if (normalized.skipped) {
        skipped.push(normalized.skipped);
        continue;
      }
      const key = profileKey(normalized.department, normalized.memberUid);
      let group = groups.get(key);
      if (!group) {
        group = {
          departmentId: normalized.department,
          memberUid: normalized.memberUid,
          memberNames: new Set(),
          duties: new Map(),
          evidence: new Map()
        };
        groups.set(key, group);
      }
      group.memberNames.add(normalized.memberName);
      group.duties.set(identityKey(normalized.duty), normalized.duty);
      group.evidence.set(evidenceKey(normalized.evidence, normalized.memberUid), normalized.evidence);
    }
  }
  const rawLeaderUids = options.leaderUids || options.leadersByUid || [];
  const leaderValues = rawLeaderUids instanceof Set
    ? Array.from(rawLeaderUids)
    : Array.isArray(rawLeaderUids)
      ? rawLeaderUids
      : Object.keys(rawLeaderUids || {}).filter(key => rawLeaderUids[key] === true);
  const leaderUids = new Set(leaderValues
    .map(value => {
      try { return uid(value); } catch (_error) { return ''; }
    }).filter(Boolean));
  const suggestions = Array.from(groups.values())
    .sort((left, right) => compareText(profileKey(left.departmentId, left.memberUid), profileKey(right.departmentId, right.memberUid)))
    .map(group => {
      const names = Array.from(group.memberNames).sort(compareText);
      const memberName = names[0] || group.memberUid;
      const evidence = Array.from(group.evidence.values()).sort((left, right) =>
        compareText(stableStringify(left), stableStringify(right))
      );
      const suggestion = {
        id: `${group.departmentId}::${group.memberUid}`,
        profileId: `${group.departmentId}::${group.memberUid}`,
        departmentId: group.departmentId,
        department: group.departmentId,
        memberUid: group.memberUid,
        uid: group.memberUid,
        memberName,
        member: memberName,
        role: leaderUids.has(group.memberUid) ? 'leader' : 'member',
        status: 'active',
        eligibleDuties: Array.from(group.duties.values()).sort(compareText),
        schedulable: true,
        historySeed: {
          source: HISTORY_SEED_SOURCE,
          seededBy,
          seededAt,
          evidence
        }
      };
      return suggestion;
    });
  return {
    version: 1,
    source: HISTORY_SEED_SOURCE,
    seededBy,
    seededAt,
    identityCount: resolver.size,
    suggestions,
    skipped
  };
}

function profilesArray(profiles) {
  if (profiles == null) return [];
  if (Array.isArray(profiles)) return profiles;
  if (!isPlainObject(profiles)) throw new TypeError('profiles must be an array or object');
  return Object.values(profiles);
}

function planProfileWrites(existingProfiles, seedPlan, options = {}) {
  if (!seedPlan || !Array.isArray(seedPlan.suggestions)) {
    throw new TypeError('seedPlan suggestions must be an array');
  }
  const byKey = new Map();
  profilesArray(existingProfiles).forEach(profile => {
    const identity = profileIdentity(profile);
    if (!identity) throw new TypeError('existing profile is missing UID identity');
    const key = profileKey(identity.departmentId, identity.memberUid);
    if (byKey.has(key)) throw new IdentityResolutionError('Duplicate UID-keyed profile target.', {
      reason: 'duplicate-profile-target', key
    });
    byKey.set(key, profile);
  });
  const writes = [];
  const unchanged = [];
  const orderedSuggestions = seedPlan.suggestions.slice().sort((left, right) => {
    const leftIdentity = profileIdentity(left);
    const rightIdentity = profileIdentity(right);
    return compareText(profileKey(leftIdentity.departmentId, leftIdentity.memberUid),
      profileKey(rightIdentity.departmentId, rightIdentity.memberUid));
  });
  orderedSuggestions.forEach(suggestion => {
    const normalized = normalizePlanSuggestionIdentity(suggestion);
    const key = profileKey(normalized.departmentId, normalized.memberUid);
    const current = byKey.get(key);
    const next = mergeSeedProfile(current, normalized, {
      ...options,
      source: options.source ?? 'history-seed',
      at: options.at ?? seedPlan.seededAt,
      seededBy: options.seededBy ?? seedPlan.seededBy,
      actor: options.actor ?? { by: options.by || seedPlan.seededBy }
    });
    if (stableStringify(current || null) === stableStringify(next)) {
      unchanged.push(profilePathFor(normalized.departmentId, normalized.memberUid));
      return;
    }
    const path = profilePathFor(normalized.departmentId, normalized.memberUid);
    const before = current ? clone(current) : null;
    writes.push({
      path,
      operation: current ? 'update' : 'create',
      before,
      after: clone(next),
      precondition: {
        exists: !!current,
        fingerprint: fingerprint(before)
      },
      rollback: current
        ? { operation: 'set', path, data: before }
        : { operation: 'delete', path }
    });
  });
  const rollbackPlan = writes.slice().reverse().map(write => clone(write.rollback));
  return {
    version: 1,
    readOnly: true,
    productionAccess: false,
    writes,
    unchanged,
    rollbackPlan,
    counts: {
      creates: writes.filter(write => write.operation === 'create').length,
      updates: writes.filter(write => write.operation === 'update').length,
      unchanged: unchanged.length
    }
  };
}

function dryRunHistorySeed(input, options = {}) {
  const source = isPlainObject(input) && (
    input.assignments || input.services || input.evidence || input.profiles || input.identities
  ) ? input : { assignments: input };
  const seedPlan = planHistorySeed(
    source.assignments ?? source.services ?? source.evidence ?? source,
    {
      ...options,
      identities: options.identities ?? source.identities,
      seededAt: options.seededAt ?? source.seededAt ?? 0,
      seededBy: options.seededBy ?? source.seededBy ?? 'history-seed'
    }
  );
  const writePlan = planProfileWrites(
    source.profiles ?? options.profiles ?? [],
    seedPlan,
    {
      ...options,
      source: options.source || 'import',
      at: options.at ?? seedPlan.seededAt,
      seededBy: seedPlan.seededBy
    }
  );
  return {
    version: 1,
    mode: 'dry-run',
    readOnly: true,
    productionAccess: false,
    applied: false,
    seedPlan,
    writePlan,
    rollbackPlan: writePlan.rollbackPlan
  };
}

function applyHistorySeedPlan(profiles, plan, options = {}) {
  if (!plan || !Array.isArray(plan.suggestions)) {
    throw new TypeError('seedPlan suggestions must be an array');
  }
  const existing = profilesArray(profiles).map(profile => clone(profile));
  const byKey = new Map();
  existing.forEach((profile, index) => {
    const identity = profileIdentity(profile);
    if (!identity) throw new TypeError('existing profile is missing UID identity');
    const key = profileKey(identity.departmentId, identity.memberUid);
    if (byKey.has(key)) throw new IdentityResolutionError('Duplicate UID-keyed profile target.', {
      reason: 'duplicate-profile-target', key
    });
    byKey.set(key, { index, profile });
  });
  const writes = planProfileWrites(existing, plan, {
    ...options,
    source: options.source ?? 'history-seed'
  });
  writes.writes.forEach(write => {
    const identity = profileIdentity(write.after);
    const key = profileKey(identity.departmentId, identity.memberUid);
    const prior = byKey.get(key);
    if (prior) {
      existing[prior.index] = write.after;
    } else {
      byKey.set(key, { index: existing.length, profile: write.after });
      existing.push(write.after);
    }
  });
  return existing;
}

async function applyProfileWritePlan(plan, adapter, options = {}) {
  if (!plan || !Array.isArray(plan.writes)) throw new TypeError('write plan is invalid');
  if (options.execute !== true) {
    return {
      applied: false,
      mode: 'dry-run',
      writesAttempted: 0,
      rollbackPlan: clone(plan.rollbackPlan || [])
    };
  }
  if (!adapter || typeof adapter.read !== 'function' || typeof adapter.set !== 'function' ||
      typeof adapter.delete !== 'function') {
    throw new TypeError('an executable adapter must provide read, set, and delete methods');
  }
  const applied = [];
  try {
    for (const write of plan.writes) {
      const current = await adapter.read(write.path);
      const currentExists = current !== undefined && current !== null;
      if (currentExists !== write.precondition.exists ||
          fingerprint(currentExists ? current : null) !== write.precondition.fingerprint) {
        const error = new Error(`Write precondition failed for ${write.path}`);
        error.code = 'write-conflict';
        throw error;
      }
      await adapter.set(write.path, clone(write.after));
      applied.push(write);
    }
    return { applied: true, mode: 'execute', writesAttempted: applied.length, rolledBack: false };
  } catch (error) {
    const rollbackErrors = [];
    for (const write of applied.slice().reverse()) {
      try {
        if (write.rollback.operation === 'delete') await adapter.delete(write.path);
        else await adapter.set(write.path, clone(write.rollback.data));
      } catch (rollbackError) {
        rollbackErrors.push({ path: write.path, error: String(rollbackError.message || rollbackError) });
      }
    }
    error.rollback = {
      attempted: applied.length,
      completed: applied.length - rollbackErrors.length,
      errors: rollbackErrors
    };
    throw error;
  }
}

module.exports = {
  HISTORY_SEED_SOURCE,
  PROFILE_FIELDS,
  DEFAULT_DUTY_DEPARTMENTS,
  IdentityResolutionError,
  stableStringify,
  fingerprint,
  createIdentityResolver,
  normalizeIdentityResolver: createIdentityResolver,
  resolveMemberIdentity,
  profileIdentity,
  profileKey,
  profilePathFor,
  planHistorySeed,
  createHistorySeedPlan: planHistorySeed,
  mergeSeedProfile,
  mergeHistorySeed: mergeSeedProfile,
  applyHistorySeedPlan,
  planProfileWrites,
  createProfileWritePlan: planProfileWrites,
  dryRunHistorySeed,
  createHistorySeedDryRun: dryRunHistorySeed,
  applyProfileWritePlan,
  applyWritePlan: applyProfileWritePlan,
  hasAuthoritativeDecision
};
