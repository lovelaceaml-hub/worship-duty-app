'use strict';

/*
 * Named callable handlers for the department boundary.
 *
 * The handlers use the Admin SDK only after the pure decisions in
 * department-auth.js have accepted the verified caller. Profile writes keep
 * the member UID, department, and role stable. Assignment overrides write a
 * labeled assignment and an audit record, never a profile mutation.
 */

const authz = require('./department-auth.js');

const PROFILE_PATCH_FIELDS = new Set(authz.PROFILE_MUTABLE_FIELDS);
const PROFILE_DECISION_FIELDS = Object.freeze([
  'status',
  'eligibleDuties',
  'schedulable',
  'availability'
]);
const PROFILE_DECISION_SOURCES = new Set(['initial', 'history-seed', 'manual', 'import']);
const PROFILE_DECISION_AUTHORITIES = new Set(['system', 'history-seed', 'member', 'leader', 'admin', 'import']);
const ASSIGNMENT_COMMAND_FIELDS = new Set([
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

function errorWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requestActor(request) {
  if (!request || !request.auth || !request.auth.uid) {
    throw errorWithCode('unauthenticated', 'A verified member session is required.');
  }
  if (request.auth.currentAccount && !authz.isCurrentRoleVersion(request.auth, request.auth.currentAccount)) {
    throw errorWithCode('permission-denied', 'The member role has changed. Sign in again.');
  }
  if (request.auth.currentAccount && request.auth.currentAccount.active === false) {
    throw errorWithCode('permission-denied', 'The member account is inactive.');
  }
  return {
    uid: request.auth.uid,
    token: request.auth.token || {}
  };
}

function inputData(request) {
  if (!request || request.data == null) return {};
  if (!plainObject(request.data)) throw errorWithCode('invalid-argument', 'Request data must be an object.');
  return request.data;
}

function profileRef(db, department, memberUid) {
  return db.collection('departments').doc(department).collection('members').doc(memberUid);
}

async function readProfile(db, department, memberUid) {
  const reference = profileRef(db, department, memberUid);
  const snapshot = await reference.get();
  if (!snapshot.exists) {
    throw errorWithCode('not-found', 'The department member profile was not found.');
  }
  return { reference, data: snapshot.data() || {} };
}

function pathInputs(data) {
  if (data.memberUid != null && data.uid != null && String(data.memberUid) !== String(data.uid)) {
    throw errorWithCode('invalid-argument', 'memberUid and uid must match.');
  }
  if (data.departmentId != null && data.department != null && String(data.departmentId) !== String(data.department)) {
    throw errorWithCode('invalid-argument', 'departmentId and department must match.');
  }
  let department;
  let memberUid;
  try {
    department = authz.profileIdentity({
      departmentId: data.departmentId ?? data.department,
      memberUid: data.memberUid ?? data.uid
    })?.departmentId;
    memberUid = authz.profileIdentity({
      departmentId: data.departmentId ?? data.department,
      memberUid: data.memberUid ?? data.uid
    })?.memberUid;
  } catch (_error) {
    department = '';
    memberUid = '';
  }
  if (!department || !memberUid) {
    throw errorWithCode('invalid-argument', 'departmentId and memberUid are required.');
  }
  return { department, memberUid };
}

function patchFromRequest(data, options = {}) {
  const allowedCommandFields = new Set([
    ...PROFILE_PATCH_FIELDS,
    'patch',
    'departmentId',
    'department',
    'memberUid',
    'uid'
  ]);
  const unknownCommandField = Object.keys(data).find(key => !allowedCommandFields.has(key));
  if (unknownCommandField) {
    throw errorWithCode('invalid-argument', `Profile field is not allowed: ${unknownCommandField}.`);
  }
  const protectedFields = ['role', 'member', 'memberName', 'id', 'profileId'];
  if (protectedFields.some(field => Object.prototype.hasOwnProperty.call(data, field))) {
    throw errorWithCode('invalid-argument', 'Profile identity and role fields are immutable.');
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
    throw errorWithCode('invalid-argument', error.message);
  }
  if (options.availabilityOnly && Object.keys(patch).some(key => key !== 'availability')) {
    throw errorWithCode('invalid-argument', 'Only availability may be changed by this callable.');
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

function rejectDecision(result) {
  if (result.allowed) return;
  const permissionReasons = new Set([
    'unauthenticated',
    'cross-department',
    'profile-write-not-authorized',
    'administrator-required',
    'explicit-override-required',
    'target-profile-mismatch'
  ]);
  const code = result.reason === 'unauthenticated'
    ? 'unauthenticated'
    : permissionReasons.has(result.reason)
      ? 'permission-denied'
      : 'failed-precondition';
  throw errorWithCode(code, `Department authorization denied: ${result.reason}.`);
}

function assertAssignmentKeys(data) {
  const unknown = Object.keys(data).filter(key => !ASSIGNMENT_COMMAND_FIELDS.has(key));
  if (unknown.length) {
    throw errorWithCode('invalid-argument', `Assignment field is not allowed: ${unknown[0]}.`);
  }
}

function assignmentIdFor(assignment) {
  const pieces = [
    assignment.departmentId,
    assignment.serviceId || assignment.serviceDate,
    assignment.serviceTime,
    assignment.duty,
    assignment.memberUid
  ];
  return pieces.map(value => encodeURIComponent(value)).join('__');
}

function assignmentRecord(assignment, profile, actor, at, extra = {}) {
  return {
    id: extra.id || assignmentIdFor(assignment),
    departmentId: assignment.departmentId,
    memberUid: assignment.memberUid,
    memberName: assignment.memberName || profile.memberName || profile.member || '',
    duty: assignment.duty,
    serviceId: assignment.serviceId,
    serviceDate: assignment.serviceDate,
    serviceTime: assignment.serviceTime,
    profileId: assignment.profileId || profile.profileId || profile.id || '',
    assignedAt: at,
    assignedByUid: actor.uid,
    assignedBy: actor.token.memberName || actor.token.member || actor.uid,
    ...extra
  };
}

function departmentInput(data) {
  const allowed = new Set(['department', 'departmentId']);
  const unknown = Object.keys(data).find(key => !allowed.has(key));
  if (unknown) throw errorWithCode('invalid-argument', `Roster field is not allowed: ${unknown}.`);
  if (data.department != null && data.departmentId != null &&
      String(data.department) !== String(data.departmentId)) {
    throw errorWithCode('invalid-argument', 'department and departmentId must match.');
  }
  const identity = authz.profileIdentity({
    departmentId: data.departmentId ?? data.department,
    memberUid: 'roster-request'
  });
  if (!identity) throw errorWithCode('invalid-argument', 'departmentId is required.');
  return identity.departmentId;
}

function safeRosterProfile(value, documentId, department) {
  const profile = plainObject(value) ? { ...value } : {};
  const identity = authz.profileIdentity(profile);
  if (!identity || identity.departmentId !== department || identity.memberUid !== documentId) return null;
  const output = {};
  authz.PROFILE_ALLOWED_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(profile, field)) output[field] = profile[field];
  });
  return output;
}

async function writeAudit(db, entry) {
  if (!db || !db.collection) throw errorWithCode('internal', 'Audit storage is unavailable.');
  const audit = db.collection('audit');
  if (typeof audit.add === 'function') {
    const reference = await audit.add(entry);
    return reference && reference.id ? reference.id : '';
  }
  if (typeof audit.doc === 'function') {
    const reference = audit.doc();
    await reference.set(entry);
    return reference.id || '';
  }
  throw errorWithCode('internal', 'Audit storage is unavailable.');
}

function createDepartmentHandlers(options = {}) {
  const db = options.db;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('createDepartmentHandlers requires a Firestore database.');
  }

  async function listDepartmentRoster(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    const department = departmentInput(data);
    if (!authz.managesDepartment(actor, department)) {
      throw errorWithCode('permission-denied', 'You cannot list this department roster.');
    }
    const snapshot = await db.collection('departments').doc(department).collection('members').get();
    const members = snapshot.docs
      .map(document => safeRosterProfile(document.data(), document.id, department))
      .filter(Boolean);
    return { ok: true, departmentId: department, members };
  }

  async function updateProfile(request, updateOptions = {}) {
    const actor = requestActor(request);
    const data = inputData(request);
    let path;
    try {
      path = pathInputs(data);
    } catch (error) {
      throw error.code ? error : errorWithCode('invalid-argument', error.message);
    }
    const current = await readProfile(db, path.department, path.memberUid);
    const patch = patchFromRequest(data, updateOptions);
    const at = now();
    const next = profileWithPatch(current.data, patch, actor, at);
    const authorizationCandidate = { ...next };
    if (Object.prototype.hasOwnProperty.call(current.data, 'attribution')) {
      authorizationCandidate.attribution = current.data.attribution;
    } else {
      delete authorizationCandidate.attribution;
    }
    if (Object.prototype.hasOwnProperty.call(current.data, 'fieldAttribution')) {
      authorizationCandidate.fieldAttribution = current.data.fieldAttribution;
    } else {
      delete authorizationCandidate.fieldAttribution;
    }
    const result = authz.authorizeProfileUpdate(actor, current.data, authorizationCandidate);
    rejectDecision(result);
    await current.reference.set(next, { merge: false });
    return {
      ok: true,
      departmentId: path.department,
      memberUid: path.memberUid,
      profile: next
    };
  }

  async function updateDepartmentProfile(request) {
    return updateProfile(request);
  }

  async function updateMemberAvailability(request) {
    return updateProfile(request, { availabilityOnly: true });
  }

  async function createDepartmentProfile(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    const allowedFields = new Set([
      'departmentId',
      'department',
      'memberUid',
      'uid',
      'role',
      'member',
      'memberName',
      'status',
      'active',
      'eligibleDuties',
      'duties',
      'schedulable',
      'isSchedulable',
      'availability',
      'assignmentId'
    ]);
    const unknownField = Object.keys(data).find(key => !allowedFields.has(key));
    if (unknownField) throw errorWithCode('invalid-argument', `Profile field is not allowed: ${unknownField}.`);
    let path;
    try {
      path = pathInputs(data);
    } catch (error) {
      throw error.code ? error : errorWithCode('invalid-argument', error.message);
    }
    const reference = profileRef(db, path.department, path.memberUid);
    const existing = await reference.get();
    if (existing.exists) throw errorWithCode('already-exists', 'The department member profile already exists.');
    const at = now();
    const requestedRole = data.role == null ? 'member' : data.role;
    const requestedStatus = data.status == null
      ? (data.active === false ? 'inactive' : 'active')
      : data.status;
    const availability = authz.normalizeAvailability(data.availability || {});
    if (!availability) throw errorWithCode('invalid-argument', 'The department member availability is invalid.');
    const candidate = {
      memberUid: path.memberUid,
      uid: path.memberUid,
      departmentId: path.department,
      department: path.department,
      role: typeof requestedRole === 'string' ? requestedRole.trim().toLocaleLowerCase() : requestedRole,
      memberName: data.memberName || data.member || path.memberUid,
      status: typeof requestedStatus === 'string' ? requestedStatus.trim().toLocaleLowerCase() : requestedStatus,
      eligibleDuties: data.eligibleDuties || data.duties || [],
      schedulable: data.schedulable ?? data.isSchedulable ?? false,
      availability,
      createdAt: at,
      createdBy: actor.uid,
      updatedAt: at,
      updatedByUid: actor.uid,
      updatedBy: actor.token.memberName || actor.token.member || actor.uid,
      attribution: {
        createdBy: actor.uid,
        createdAt: at,
        updatedBy: actor.token.memberName || actor.token.member || actor.uid,
        updatedAt: at
      }
    };
    candidate.fieldAttribution = fieldAttributionFor(
      {},
      PROFILE_DECISION_FIELDS,
      actor,
      candidate,
      at
    );
    const result = authz.authorizeProfileCreate(actor, candidate, {
      departmentId: path.department,
      memberUid: path.memberUid
    });
    rejectDecision(result);
    if (!authz.profileForScheduling(candidate)) {
      throw errorWithCode('invalid-argument', 'The department member profile is invalid.');
    }
    await reference.set(candidate, { merge: false });
    return { ok: true, departmentId: path.department, memberUid: path.memberUid, profile: candidate };
  }

  async function assignDepartmentDuty(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    assertAssignmentKeys(data);
    if (data.override === true) {
      throw errorWithCode('failed-precondition', 'Use the explicit administrator override callable.');
    }
    let assignment;
    try {
      assignment = authz.normalizeAssignment(data);
    } catch (error) {
      throw errorWithCode('invalid-argument', error.message);
    }
    const current = await readProfile(db, assignment.departmentId, assignment.memberUid);
    const result = authz.authorizeAssignment(actor, assignment, current.data);
    rejectDecision(result);
    const record = assignmentRecord(result.assignment, current.data, actor, now(), {
      override: false,
      authorization: 'normal-eligible-assignment'
    });
    const id = data.assignmentId || assignmentIdFor(result.assignment);
    await db.collection('departmentAssignments').doc(id).set(record, { merge: false });
    return { ok: true, assignment: record, override: false };
  }

  async function overrideDepartmentAssignment(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    assertAssignmentKeys(data);
    if (data.override !== true) {
      throw errorWithCode('failed-precondition', 'An explicit administrator override is required.');
    }
    let assignment;
    try {
      assignment = authz.normalizeAssignment({ ...data, override: true });
    } catch (error) {
      throw errorWithCode('invalid-argument', error.message);
    }
    const current = await readProfile(db, assignment.departmentId, assignment.memberUid);
    const result = authz.authorizeAssignmentOverride(actor, assignment, current.data);
    rejectDecision(result);
    const at = now();
    const id = data.assignmentId || assignmentIdFor(result.assignment);
    const record = assignmentRecord(result.assignment, current.data, actor, at, {
      override: true,
      authorization: 'administrator-override',
      overrideReason: result.assignment.overrideReason,
      overriddenAt: at,
      overriddenByUid: actor.uid
    });
    await db.collection('departmentAssignments').doc(id).set(record, { merge: false });
    const auditId = await writeAudit(db, {
      action: 'administrator-assignment-override',
      authorization: 'administrator-override',
      override: true,
      reason: result.assignment.overrideReason,
      actorUid: actor.uid,
      targetMemberUid: result.assignment.memberUid,
      departmentId: result.assignment.departmentId,
      duty: result.assignment.duty,
      serviceDate: result.assignment.serviceDate,
      serviceTime: result.assignment.serviceTime,
      assignmentId: id,
      profilePath: authz.profilePath(result.assignment.departmentId, result.assignment.memberUid),
      profileMutated: false,
      timestamp: at
    });
    return {
      ok: true,
      assignment: { ...record, auditId },
      override: true,
      auditId,
      profileMutated: false
    };
  }

  return Object.freeze({
    listDepartmentRoster,
    updateDepartmentProfile,
    updateMemberAvailability,
    updateDepartmentAvailability: updateMemberAvailability,
    createDepartmentProfile,
    assignDepartmentDuty,
    overrideDepartmentAssignment,
    adminOverrideAssignment: overrideDepartmentAssignment,
    recoverDepartmentProfile: updateDepartmentProfile
  });
}

module.exports = {
  PROFILE_PATCH_FIELDS,
  createDepartmentHandlers,
  assignmentIdFor,
  profileWithPatch,
  requestActor
};
