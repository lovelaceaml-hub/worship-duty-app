'use strict';

/*
 * Pure authorization decisions for department profiles and assignments.
 *
 * This module is deliberately independent of Firebase. Callable handlers and
 * tests use the same decisions, while Firestore rules mirror the same field
 * and identity boundary. A member UID is the authorization identity. Names
 * are display values only.
 */

const permissions = require('./permissions.js');

const PROFILE_MUTABLE_FIELDS = Object.freeze([
  'status',
  'eligibleDuties',
  'schedulable',
  'availability'
]);

const PROFILE_METADATA_FIELDS = Object.freeze([
  'updatedAt',
  'updatedByUid',
  'updatedBy'
]);

const PROFILE_IDENTITY_FIELDS = Object.freeze([
  'uid',
  'memberUid',
  'department',
  'departmentId',
  'role',
  'member',
  'memberName',
  'id',
  'profileId'
]);

const PROFILE_ALLOWED_FIELDS = Object.freeze([
  ...PROFILE_IDENTITY_FIELDS,
  ...PROFILE_MUTABLE_FIELDS,
  ...PROFILE_METADATA_FIELDS,
  'active',
  'duties',
  'isSchedulable',
  'attribution',
  'createdAt',
  'createdBy',
  'historySeed',
  'provenance',
  'fieldAttribution',
  'fieldDecisions',
  'decisions'
]);

const ASSIGNMENT_FIELDS = Object.freeze([
  'id',
  'department',
  'departmentId',
  'memberUid',
  'uid',
  'memberName',
  'duty',
  'serviceId',
  'serviceDate',
  'date',
  'serviceTime',
  'time',
  'override',
  'authorization',
  'overrideReason',
  'assignedAt',
  'assignedByUid',
  'assignedBy',
  'profileId'
]);

const ASSIGNMENT_INPUT_FIELDS = Object.freeze([
  'assignmentId',
  'department',
  'departmentId',
  'memberUid',
  'uid',
  'memberName',
  'duty',
  'serviceId',
  'serviceDate',
  'date',
  'serviceTime',
  'time',
  'override',
  'overrideReason',
  'profileId'
]);

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PRIVILEGED_LEADER_ROLES = new Set([
  'departmentleader',
  'leader',
  'departmentmanager'
]);
const MEMBER_ROLES = new Set(['member', 'departmentleader', 'leader', 'departmentmanager']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value, options = {}) {
  const { required = true, max = 160, path = 'value' } = options;
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (required && !normalized) throw new TypeError(`${path} must not be empty`);
  if (!normalized && !required) return '';
  if (normalized.length > max) throw new TypeError(`${path} is too long`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new TypeError(`${path} contains a control character`);
  }
  return normalized;
}

function uid(value, options = {}) {
  const normalized = text(value, { ...options, max: 128, path: options.path || 'memberUid' });
  if (normalized.includes('/')) throw new TypeError(`${options.path || 'memberUid'} cannot contain '/'`);
  return normalized;
}

function departmentId(value, options = {}) {
  const normalized = text(value, { ...options, max: 100, path: options.path || 'departmentId' });
  if (normalized.includes('/')) throw new TypeError(`${options.path || 'departmentId'} cannot contain '/'`);
  return normalized;
}

function safeKeys(value, allowed) {
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every(key => !DANGEROUS_KEYS.has(key) && allowed.includes(key));
}

function actorToken(actor) {
  if (!actor || typeof actor !== 'object') return {};
  if (actor.token && typeof actor.token === 'object') return actor.token;
  if (actor.claims && typeof actor.claims === 'object') return actor.claims;
  return actor;
}

function actorUid(actor) {
  if (typeof actor === 'string') return uid(actor, { path: 'actor.uid' });
  if (!actor || typeof actor !== 'object') return '';
  const value = actor.uid || (actor.auth && actor.auth.uid) || actor.sub;
  try {
    return value ? uid(String(value), { path: 'actor.uid' }) : '';
  } catch (_error) {
    return '';
  }
}

function values(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizedRole(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function actorRoles(actor) {
  const token = actorToken(actor);
  const output = new Set();
  values(token.roles || actor && actor.roles).forEach(value => {
    if (typeof value === 'string') output.add(normalizedRole(value));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.keys(value).forEach(key => { if (value[key] === true) output.add(normalizedRole(key)); });
    }
  });
  [token.role, actor && actor.role].forEach(value => {
    if (value) output.add(normalizedRole(value));
  });
  return output;
}

function actorPermissions(actor) {
  const token = actorToken(actor);
  return new Set(values(token.permissions || actor && actor.permissions)
    .filter(value => typeof value === 'string')
    .map(value => value.trim().toLocaleLowerCase()));
}

function actorDepartments(actor) {
  const token = actorToken(actor);
  const output = [];
  const add = value => values(value).forEach(item => {
    if (typeof item !== 'string') return;
    const normalized = item.trim();
    if (normalized && !output.includes(normalized)) output.push(normalized);
  });
  [token.departments, token.departmentIds, token.managedDepartments,
    token.department, actor && actor.departments, actor && actor.department].forEach(add);
  const leaderMap = token.departmentLeaders || actor && actor.departmentLeaders;
  if (leaderMap && typeof leaderMap === 'object' && !Array.isArray(leaderMap)) {
    Object.keys(leaderMap).forEach(key => { if (leaderMap[key] === true) add(key); });
  }
  return output;
}

function isAuthenticated(actor) {
  const token = actorToken(actor);
  return !!actorUid(actor) && token.mustChangePin !== true;
}

function isCurrentRoleVersion(actor, account) {
  if (!account || typeof account !== 'object') return false;
  const token = actorToken(actor);
  return Number.isSafeInteger(token.roleVersion)
    && Number.isSafeInteger(account.roleVersion)
    && token.roleVersion === account.roleVersion;
}

function isAdministrator(actor) {
  if (!isAuthenticated(actor)) return false;
  const token = actorToken(actor);
  const roles = actorRoles(actor);
  return token.admin === true || actor && actor.admin === true ||
    roles.has('admin') || roles.has('administrator') || normalizedRole(token.role) === 'admin';
}

function isMemberActor(actor) {
  if (!isAuthenticated(actor)) return false;
  if (isAdministrator(actor)) return true;
  const token = actorToken(actor);
  const roles = actorRoles(actor);
  const uidValue = actorUid(actor);
  return Array.from(roles).some(role => MEMBER_ROLES.has(role)) ||
    token.memberUid === uidValue || token.uid === uidValue || token.memberId === uidValue;
}

function managesDepartment(actor, department) {
  if (!isAuthenticated(actor)) return false;
  const target = departmentId(department);
  if (isAdministrator(actor)) return true;
  const roles = actorRoles(actor);
  const permissionsSet = actorPermissions(actor);
  const leaderRole = Array.from(roles).some(role => PRIVILEGED_LEADER_ROLES.has(role)) ||
    permissionsSet.has('department.manage') || permissionsSet.has('schedule.assign') ||
    actorToken(actor).departmentLeader === true;
  return leaderRole && actorDepartments(actor).includes(target);
}

function profileIdentity(value) {
  if (!isPlainObject(value)) return null;
  const memberUid = value.memberUid ?? value.uid;
  const department = value.departmentId ?? value.department;
  if (memberUid == null || department == null) return null;
  try {
    const normalizedUid = uid(String(memberUid), { path: 'profile.memberUid' });
    const normalizedDepartment = departmentId(String(department), { path: 'profile.departmentId' });
    if (value.memberUid != null && value.uid != null && String(value.memberUid) !== String(value.uid)) return null;
    if (value.departmentId != null && value.department != null && String(value.departmentId) !== String(value.department)) return null;
    return { memberUid: normalizedUid, departmentId: normalizedDepartment };
  } catch (_error) {
    return null;
  }
}

function profileRole(value) {
  return normalizedRole(value && value.role) || 'member';
}

function profileIdentityMatches(value, department, memberUid) {
  const identity = profileIdentity(value);
  if (!identity) return false;
  try {
    return identity.departmentId === departmentId(department) && identity.memberUid === uid(memberUid);
  } catch (_error) {
    return false;
  }
}

function profileIdentityImmutable(before, after) {
  const left = profileIdentity(before);
  const right = profileIdentity(after);
  return !!left && !!right && left.memberUid === right.memberUid &&
    left.departmentId === right.departmentId && profileRole(before) === profileRole(after);
}

function changedFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return Array.from(keys).filter(key => JSON.stringify(before && before[key]) !== JSON.stringify(after && after[key]));
}

function metadataOwned(actor, after) {
  const caller = actorUid(actor);
  if (!caller) return false;
  if (after.updatedByUid != null && after.updatedByUid !== caller) return false;
  if (after.updatedAt != null && (!Number.isSafeInteger(after.updatedAt) || after.updatedAt < 0)) return false;
  return true;
}

function decision(allowed, reason, extra = {}) {
  return Object.freeze({ allowed: !!allowed, reason: allowed ? '' : reason, ...extra });
}

function authorizeProfileRead(actor, profile) {
  if (!isAuthenticated(actor)) return decision(false, 'unauthenticated');
  const identity = profileIdentity(profile);
  if (!identity) return decision(false, 'invalid-profile-identity');
  if (isAdministrator(actor) || actorUid(actor) === identity.memberUid ||
      managesDepartment(actor, identity.departmentId)) {
    return decision(true, '', { departmentId: identity.departmentId, memberUid: identity.memberUid });
  }
  return decision(false, 'cross-department');
}

function authorizeProfileCreate(actor, profile, context = {}) {
  if (!isAuthenticated(actor)) return decision(false, 'unauthenticated');
  const identity = profileIdentity(profile);
  if (!identity || !context.departmentId || !context.memberUid ||
      !profileIdentityMatches(profile, context.departmentId, context.memberUid)) {
    return decision(false, 'invalid-profile-identity');
  }
  if (!safeKeys(profile, PROFILE_ALLOWED_FIELDS)) return decision(false, 'field-not-allowed');
  if (!['member', 'leader'].includes(profileRole(profile))) return decision(false, 'role-not-allowed');
  if (profileRole(profile) === 'leader' && !isAdministrator(actor)) {
    return decision(false, 'role-not-allowed');
  }
  if (!isAdministrator(actor) && !managesDepartment(actor, identity.departmentId)) {
    return decision(false, 'cross-department');
  }
  return decision(true, '', { departmentId: identity.departmentId, memberUid: identity.memberUid });
}

function authorizeProfileUpdate(actor, before, after) {
  if (!isAuthenticated(actor)) return decision(false, 'unauthenticated');
  if (!profileIdentityImmutable(before, after)) return decision(false, 'immutable-identity');
  if (!safeKeys(after, PROFILE_ALLOWED_FIELDS)) return decision(false, 'field-not-allowed');
  const identity = profileIdentity(after);
  const fields = changedFields(before, after);
  if (!fields.length) return decision(false, 'no-change');
  const allowedFields = new Set([...PROFILE_MUTABLE_FIELDS, ...PROFILE_METADATA_FIELDS]);
  const derivedAliases = new Set();
  if (fields.includes('status') && fields.includes('active') &&
      after.active === (after.status === 'active')) derivedAliases.add('active');
  if (fields.includes('eligibleDuties') && fields.includes('duties') &&
      JSON.stringify(after.duties) === JSON.stringify(after.eligibleDuties)) derivedAliases.add('duties');
  if (fields.includes('schedulable') && fields.includes('isSchedulable') &&
      after.isSchedulable === after.schedulable) derivedAliases.add('isSchedulable');
  if (fields.some(field => !allowedFields.has(field) && !derivedAliases.has(field))) {
    return decision(false, 'field-not-allowed');
  }
  if (!metadataOwned(actor, after)) return decision(false, 'metadata-not-owned');

  const mutable = fields.filter(field => PROFILE_MUTABLE_FIELDS.includes(field));
  if (isAdministrator(actor) || managesDepartment(actor, identity.departmentId)) {
    return decision(true, '', { fields });
  }
  if (isMemberActor(actor) && actorUid(actor) === identity.memberUid &&
      mutable.length > 0 && mutable.every(field => field === 'availability')) {
    return decision(true, '', { fields });
  }
  return decision(false, 'profile-write-not-authorized');
}

function authorizeProfileDelete(actor, profile) {
  if (!isAdministrator(actor)) return decision(false, 'administrator-required');
  if (!profileIdentity(profile)) return decision(false, 'invalid-profile-identity');
  return decision(true, '');
}

function normalizeProfilePatch(patch) {
  if (!isPlainObject(patch)) throw new TypeError('patch must be a plain object');
  const aliases = { duties: 'eligibleDuties', isSchedulable: 'schedulable' };
  const allowed = new Set(PROFILE_MUTABLE_FIELDS.concat(['duties', 'isSchedulable']));
  if (!safeKeys(patch, Array.from(allowed))) throw new TypeError('patch contains a protected or unknown field');
  const output = {};
  Object.keys(patch).forEach(key => {
    const canonical = aliases[key] || key;
    if (Object.prototype.hasOwnProperty.call(output, canonical) &&
        JSON.stringify(output[canonical]) !== JSON.stringify(patch[key])) {
      throw new TypeError(`patch contains duplicate ${canonical} values`);
    }
    output[canonical] = patch[key];
  });
  if (!Object.keys(output).length) throw new TypeError('patch must change at least one field');
  if (Object.prototype.hasOwnProperty.call(output, 'status')) {
    if (typeof output.status !== 'string' ||
        !['active', 'inactive'].includes(output.status.trim().toLocaleLowerCase())) {
      throw new TypeError('patch.status must be active or inactive');
    }
    output.status = output.status.trim().toLocaleLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(output, 'eligibleDuties')) {
    if (!Array.isArray(output.eligibleDuties) ||
        output.eligibleDuties.some(value => typeof value !== 'string' || !text(value, { path: 'patch.eligibleDuties' }))) {
      throw new TypeError('patch.eligibleDuties must be an array of duty names');
    }
    output.eligibleDuties = Array.from(new Set(output.eligibleDuties.map(value => text(value, {
      max: 100,
      path: 'patch.eligibleDuties'
    }))));
  }
  if (Object.prototype.hasOwnProperty.call(output, 'schedulable') &&
      typeof output.schedulable !== 'boolean') {
    throw new TypeError('patch.schedulable must be a boolean');
  }
  if (Object.prototype.hasOwnProperty.call(output, 'availability')) {
    const availability = normalizedAvailability(output.availability);
    if (!availability) throw new TypeError('patch.availability is invalid');
    output.availability = availability;
  }
  return output;
}

function normalizeAssignment(input = {}) {
  if (!isPlainObject(input)) throw new TypeError('assignment must be a plain object');
  if (!safeKeys(input, ASSIGNMENT_INPUT_FIELDS)) {
    throw new TypeError('assignment contains a protected or unknown field');
  }
  if (input.departmentId != null && input.department != null &&
      departmentId(input.departmentId, { path: 'assignment.departmentId' }) !==
        departmentId(input.department, { path: 'assignment.department' })) {
    throw new TypeError('assignment department aliases must match');
  }
  if (input.memberUid != null && input.uid != null &&
      uid(input.memberUid, { path: 'assignment.memberUid' }) !==
        uid(input.uid, { path: 'assignment.uid' })) {
    throw new TypeError('assignment UID aliases must match');
  }
  if (input.serviceDate != null && input.date != null &&
      text(input.serviceDate, { path: 'assignment.serviceDate' }) !==
        text(input.date, { path: 'assignment.date' })) {
    throw new TypeError('assignment date aliases must match');
  }
  if (input.serviceTime != null && input.time != null &&
      text(input.serviceTime, { path: 'assignment.serviceTime' }).toLocaleLowerCase() !==
        text(input.time, { path: 'assignment.time' }).toLocaleLowerCase()) {
    throw new TypeError('assignment time aliases must match');
  }
  if (input.override != null && typeof input.override !== 'boolean') {
    throw new TypeError('assignment.override must be a boolean');
  }
  const department = departmentId(input.departmentId ?? input.department, { path: 'assignment.departmentId' });
  const memberUid = uid(input.memberUid ?? input.uid, { path: 'assignment.memberUid' });
  const duty = text(input.duty, { max: 100, path: 'assignment.duty' });
  const serviceDate = text(input.serviceDate ?? input.date, { max: 10, path: 'assignment.serviceDate' });
  const serviceTime = text(input.serviceTime ?? input.time, { max: 80, path: 'assignment.serviceTime' }).toLocaleLowerCase();
  if (!isCalendarDate(serviceDate)) throw new TypeError('assignment.serviceDate must use YYYY-MM-DD');
  return {
    departmentId: department,
    memberUid,
    memberName: input.memberName == null ? '' : text(input.memberName, { required: false, path: 'assignment.memberName' }),
    duty,
    serviceId: input.serviceId == null ? '' : text(input.serviceId, { required: false, max: 180, path: 'assignment.serviceId' }),
    serviceDate,
    serviceTime,
    override: input.override === true,
    overrideReason: input.overrideReason == null ? '' : text(input.overrideReason, { required: false, max: 500, path: 'assignment.overrideReason' }),
    profileId: input.profileId == null ? '' : text(input.profileId, { required: false, max: 240, path: 'assignment.profileId' })
  };
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function normalizedAvailability(value) {
  if (!isPlainObject(value)) return null;
  if (!safeKeys(value, ['recurring', 'exceptions', 'dateExceptions'])) return null;
  const recurring = value.recurring == null ? {} : value.recurring;
  if (value.exceptions != null && value.dateExceptions != null) return null;
  const exceptions = value.exceptions == null
    ? (value.dateExceptions == null ? {} : value.dateExceptions)
    : value.exceptions;
  if (!isPlainObject(recurring) || !isPlainObject(exceptions)) return null;
  const normalizeStatusMap = map => {
    const output = {};
    const normalizedKeys = new Set();
    for (const key of Object.keys(map)) {
      if (!key || DANGEROUS_KEYS.has(key) || typeof map[key] !== 'string') return null;
      const status = map[key].trim().toLocaleLowerCase();
      if (!['available', 'unavailable'].includes(status)) return null;
      const normalizedKey = key.trim().toLocaleLowerCase();
      if (!normalizedKey || normalizedKey.length > 80 || normalizedKeys.has(normalizedKey)) return null;
      normalizedKeys.add(normalizedKey);
      output[normalizedKey] = status;
    }
    return output;
  };
  const recurringMap = normalizeStatusMap(recurring);
  if (!recurringMap) return null;
  const exceptionMap = {};
  for (const date of Object.keys(exceptions)) {
    if (!isCalendarDate(date) || !isPlainObject(exceptions[date])) return null;
    const day = normalizeStatusMap(exceptions[date]);
    if (!day) return null;
    exceptionMap[date] = day;
  }
  return { recurring: recurringMap, exceptions: exceptionMap };
}

function profileForScheduling(profile) {
  const identity = profileIdentity(profile);
  if (!identity) return null;
  const eligibleDuties = profile.eligibleDuties || profile.duties || [];
  if (!Array.isArray(eligibleDuties) || eligibleDuties.some(value => typeof value !== 'string')) return null;
  const availability = normalizedAvailability(profile.availability || {});
  if (!availability) return null;
  const status = String(profile.status || (profile.active === false ? 'inactive' : 'active')).toLocaleLowerCase();
  const schedulable = profile.schedulable ?? profile.isSchedulable;
  if (!['active', 'inactive'].includes(status) || typeof schedulable !== 'boolean') return null;
  return {
    ...profile,
    departmentId: identity.departmentId,
    memberUid: identity.memberUid,
    status,
    eligibleDuties,
    schedulable,
    availability
  };
}

function isActive(profile) {
  return profile && profile.status === 'active';
}

function isDutyEligible(profile, duty) {
  const wanted = String(duty || '').trim().toLocaleLowerCase();
  return !!wanted && Array.isArray(profile && profile.eligibleDuties) &&
    profile.eligibleDuties.some(value => String(value).trim().toLocaleLowerCase() === wanted);
}

function isSchedulable(profile) {
  return !!(profile && profile.schedulable === true);
}

function effectiveAvailability(profile, serviceDate, serviceTime) {
  if (!profile || !isCalendarDate(serviceDate)) return 'unknown';
  const key = String(serviceTime || '').trim().toLocaleLowerCase();
  if (!key) return 'unknown';
  const exception = profile.availability.exceptions[serviceDate];
  if (exception && Object.prototype.hasOwnProperty.call(exception, key)) return exception[key];
  if (exception && Object.prototype.hasOwnProperty.call(exception, '*')) return exception['*'];
  return profile.availability.recurring[key] || 'unknown';
}

function isAvailable(profile, serviceDate, serviceTime) {
  return effectiveAvailability(profile, serviceDate, serviceTime) === 'available';
}

function authorizeAssignment(actor, assignmentInput, profile) {
  if (!isAuthenticated(actor)) return decision(false, 'unauthenticated');
  let assignment;
  try {
    assignment = normalizeAssignment(assignmentInput);
  } catch (_error) {
    return decision(false, 'invalid-assignment');
  }
  if (!managesDepartment(actor, assignment.departmentId)) return decision(false, 'cross-department');
  if (permissions.departmentForDuty(assignment.duty) !== assignment.departmentId) {
    return decision(false, 'duty-department-mismatch', { assignment });
  }
  const identity = profileIdentity(profile);
  if (!identity || identity.departmentId !== assignment.departmentId || identity.memberUid !== assignment.memberUid) {
    return decision(false, 'target-profile-mismatch', { assignment });
  }
  const target = profileForScheduling(profile);
  if (!target) return decision(false, 'invalid-target-profile', { assignment });
  if (!isActive(target)) return decision(false, 'target-inactive', { assignment });
  if (!isDutyEligible(target, assignment.duty)) return decision(false, 'target-ineligible', { assignment });
  if (!isSchedulable(target)) return decision(false, 'target-not-schedulable', { assignment });
  if (!isAvailable(target, assignment.serviceDate, assignment.serviceTime)) {
    return decision(false, 'target-unavailable', { assignment });
  }
  return decision(true, '', { assignment });
}

function authorizeAssignmentOverride(actor, assignmentInput, profile) {
  if (!isAdministrator(actor)) return decision(false, 'administrator-required');
  let assignment;
  try {
    assignment = normalizeAssignment(assignmentInput);
  } catch (_error) {
    return decision(false, 'invalid-assignment');
  }
  if (!assignment.override || !assignment.overrideReason) return decision(false, 'explicit-override-required');
  if (permissions.departmentForDuty(assignment.duty) !== assignment.departmentId) {
    return decision(false, 'duty-department-mismatch', { assignment });
  }
  if (!profileIdentity(profile) || !profileIdentityMatches(profile, assignment.departmentId, assignment.memberUid)) {
    return decision(false, 'target-profile-mismatch', { assignment });
  }
  return decision(true, '', { assignment, authorization: 'administrator-override' });
}

function profilePath(department, memberUid) {
  return `departments/${departmentId(department)}/members/${uid(memberUid)}`;
}

function assignmentPath(assignmentId) {
  return `departmentAssignments/${text(assignmentId, { max: 240, path: 'assignmentId' })}`;
}

module.exports = {
  PROFILE_MUTABLE_FIELDS,
  PROFILE_METADATA_FIELDS,
  PROFILE_IDENTITY_FIELDS,
  PROFILE_ALLOWED_FIELDS,
  ASSIGNMENT_FIELDS,
  ASSIGNMENT_INPUT_FIELDS,
  profileIdentity,
  profileIdentityMatches,
  profileIdentityImmutable,
  actorUid,
  isAuthenticated,
  isCurrentRoleVersion,
  isAdministrator,
  isAdmin: isAdministrator,
  isMemberActor,
  managesDepartment,
  canManageDepartment: managesDepartment,
  authorizeProfileRead,
  authorizeProfileCreate,
  authorizeProfileUpdate,
  authorizeProfileDelete,
  canReadProfile: authorizeProfileRead,
  canCreateProfile: authorizeProfileCreate,
  canUpdateProfile: authorizeProfileUpdate,
  canDeleteProfile: authorizeProfileDelete,
  normalizeProfilePatch,
  normalizeAvailability: normalizedAvailability,
  normalizeAssignment,
  profileForScheduling,
  authorizeAssignment,
  authorizeAssignmentOverride,
  canAssignDepartmentDuty: authorizeAssignment,
  canOverrideAssignment: authorizeAssignmentOverride,
  departmentForDuty: permissions.departmentForDuty,
  profilePath,
  assignmentPath
};
