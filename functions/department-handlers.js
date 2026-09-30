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
const { currentRevision, nextRevision, assertFresh } = require('./revision.js');

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
  'profileId',
  'expectedRevision',
  'expectedMemberName'
]);
/* Section 3 witness fields, stripped before the command reaches
   authz.normalizeAssignment (which rejects unknown top-level fields). */
const ASSIGNMENT_REVISION_FIELDS = ['expectedRevision', 'expectedMemberName'];

function assignmentCommandWithoutRevisionFields(data) {
  const clean = { ...data };
  ASSIGNMENT_REVISION_FIELDS.forEach(field => { delete clean[field]; });
  return clean;
}

function errorWithCode(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === 'object') error.details = details;
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
    'uid',
    'expectedRevision',
    'expectedUpdatedAt'
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
    assignment.duty
  ];
  return pieces.map(value => encodeURIComponent(value)).join('__');
}

function assignmentRecord(assignment, profile, actor, at, extra = {}) {
  return {
    id: extra.id || assignmentIdFor(assignment),
    departmentId: assignment.departmentId,
    memberUid: assignment.memberUid,
    memberName: profile.memberName || profile.member || '',
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

function slugify(value) {
  return String(value == null ? '' : value).toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assignmentForSchedule(assignment, schedule) {
  if (!schedule || typeof schedule !== 'object') {
    throw errorWithCode('not-found', 'The schedule service was not found.');
  }
  const serviceDate = String(schedule.date || '').trim();
  const serviceTime = slugify(schedule.serviceTime || schedule.service || schedule.time || '');
  if (!serviceDate || !serviceTime) {
    throw errorWithCode('failed-precondition', 'The schedule service identity is incomplete.');
  }
  if (assignment.serviceDate !== serviceDate || assignment.serviceTime !== serviceTime) {
    throw errorWithCode('failed-precondition', 'The assignment service identity does not match the schedule.');
  }
  return { ...assignment, serviceDate, serviceTime };
}

async function readAccountForMemberUid(db, memberUid) {
  const accounts = db.collection('accounts');
  const ids = [memberUid];
  if (memberUid.startsWith('member:')) ids.push(memberUid.slice('member:'.length));
  for (const id of ids) {
    if (!id) continue;
    const snapshot = await accounts.doc(id).get();
    if (!snapshot.exists) continue;
    const data = snapshot.data() || {};
    const expectedUid = String(data.authUid || `member:${snapshot.id}`);
    if (expectedUid === memberUid) return { id: snapshot.id, data };
  }
  if (typeof accounts.where === 'function') {
    const snapshot = await accounts.where('authUid', '==', memberUid).limit(2).get();
    if (snapshot.size === 1) return { id: snapshot.docs[0].id, data: snapshot.docs[0].data() || {} };
  }
  throw errorWithCode('not-found', 'The member account was not found.');
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
    const patch = patchFromRequest(data, updateOptions);
    const expectedRevision = data.expectedRevision;
    const expectedUpdatedAt = data.expectedUpdatedAt;
    const at = now();
    if (typeof db.runTransaction !== 'function') {
      throw errorWithCode('failed-precondition', 'Atomic profile storage is unavailable.');
    }
    const reference = profileRef(db, path.department, path.memberUid);
    let next;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw errorWithCode('not-found', 'The department member profile was not found.');
      }
      const before = snapshot.data() || {};
      assertFresh({
        expectedRevision,
        expectedWitness: expectedUpdatedAt,
        currentRevision: currentRevision(before),
        currentWitness: before.updatedAt,
        details: { updatedAt: before.updatedAt, updatedBy: before.updatedBy }
      });
      const candidate = profileWithPatch(before, patch, actor, at);
      candidate.revision = nextRevision(before);
      const authorizationCandidate = { ...candidate };
      if (Object.prototype.hasOwnProperty.call(before, 'attribution')) {
        authorizationCandidate.attribution = before.attribution;
      } else {
        delete authorizationCandidate.attribution;
      }
      if (Object.prototype.hasOwnProperty.call(before, 'fieldAttribution')) {
        authorizationCandidate.fieldAttribution = before.fieldAttribution;
      } else {
        delete authorizationCandidate.fieldAttribution;
      }
      const result = authz.authorizeProfileUpdate(actor, before, authorizationCandidate);
      rejectDecision(result);
      next = candidate;
      transaction.set(reference, next, { merge: false });
    });
    return {
      ok: true,
      departmentId: path.department,
      memberUid: path.memberUid,
      revision: next.revision,
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
    const account = await readAccountForMemberUid(db, path.memberUid);
    const accountName = String(account.data.memberName || account.data.name || account.data.member || account.id).trim();
    if (!accountName) throw errorWithCode('failed-precondition', 'The member account name is missing.');
    const suppliedName = String(data.memberName || data.member || '').trim();
    if (suppliedName && suppliedName !== accountName) {
      throw errorWithCode('invalid-argument', 'The member name does not match the verified account.');
    }
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
      memberName: accountName,
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
    const expectedRevision = data.expectedRevision;
    const expectedMemberName = data.expectedMemberName;
    let assignment;
    try {
      assignment = authz.normalizeAssignment(assignmentCommandWithoutRevisionFields(data));
    } catch (error) {
      throw errorWithCode('invalid-argument', error.message);
    }
    if (!assignment.serviceId || typeof db.runTransaction !== 'function') {
      throw errorWithCode('failed-precondition', 'Atomic schedule assignment storage is unavailable.');
    }
    const profileReference = profileRef(db, assignment.departmentId, assignment.memberUid);
    const scheduleReference = db.collection('schedule').doc(assignment.serviceId);
    let record;
    let revisionValue;
    await db.runTransaction(async transaction => {
      const scheduleSnapshot = await transaction.get(scheduleReference);
      if (!scheduleSnapshot.exists) throw errorWithCode('not-found', 'The schedule service was not found.');
      const scheduleData = scheduleSnapshot.data() || {};
      const verifiedAssignment = assignmentForSchedule(assignment, scheduleData);
      const profileSnapshot = await transaction.get(profileReference);
      if (!profileSnapshot.exists) throw errorWithCode('not-found', 'The department member profile was not found.');
      const profile = profileSnapshot.data() || {};
      if (assignment.memberName && assignment.memberName !== String(profile.memberName || profile.member || '')) {
        throw errorWithCode('invalid-argument', 'The member name does not match the verified profile.');
      }
      const assignmentRevisions = scheduleData.assignmentRevisions || {};
      const assignments = scheduleData.assignments || {};
      assertFresh({
        expectedRevision,
        expectedWitness: expectedMemberName,
        currentRevision: currentRevision({ revision: assignmentRevisions[verifiedAssignment.duty] }),
        currentWitness: String(assignments[verifiedAssignment.duty] || ''),
        details: { memberName: String(assignments[verifiedAssignment.duty] || '') }
      });
      const result = authz.authorizeAssignment(actor, verifiedAssignment, profile);
      rejectDecision(result);
      const targetName = String(profile.memberName || profile.member || '');
      const conflictingDuty = Object.keys(assignments).find(duty => duty !== result.assignment.duty && assignments[duty] === targetName);
      if (conflictingDuty) throw errorWithCode('failed-precondition', 'The member is already serving in this service.');
      revisionValue = nextRevision({ revision: assignmentRevisions[result.assignment.duty] });
      record = assignmentRecord(result.assignment, profile, actor, now(), {
        override: false,
        authorization: 'normal-eligible-assignment',
        revision: revisionValue
      });
      const assignmentReference = db.collection('departmentAssignments').doc(assignmentIdFor(result.assignment));
      transaction.set(assignmentReference, record, { merge: false });
      transaction.set(scheduleReference, {
        assignments: { [result.assignment.duty]: record.memberName },
        assignmentRevisions: { [result.assignment.duty]: revisionValue }
      }, { merge: true });
    });
    return { ok: true, revision: revisionValue, assignment: record, override: false };
  }

  async function overrideDepartmentAssignment(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    assertAssignmentKeys(data);
    if (data.override !== true) {
      throw errorWithCode('failed-precondition', 'An explicit administrator override is required.');
    }
    const expectedRevision = data.expectedRevision;
    const expectedMemberName = data.expectedMemberName;
    let assignment;
    try {
      assignment = authz.normalizeAssignment({ ...assignmentCommandWithoutRevisionFields(data), override: true });
    } catch (error) {
      throw errorWithCode('invalid-argument', error.message);
    }
    const at = now();
    if (typeof db.runTransaction !== 'function') {
      throw errorWithCode('internal', 'Atomic override storage is unavailable.');
    }
    if (!assignment.serviceId) {
      throw errorWithCode('failed-precondition', 'A service ID is required for an assignment override.');
    }
    const profileReference = profileRef(db, assignment.departmentId, assignment.memberUid);
    const scheduleReference = db.collection('schedule').doc(assignment.serviceId);
    let record;
    let auditId;
    let revisionValue;
    await db.runTransaction(async transaction => {
      const scheduleSnapshot = await transaction.get(scheduleReference);
      if (!scheduleSnapshot.exists) throw errorWithCode('not-found', 'The schedule service was not found.');
      const scheduleData = scheduleSnapshot.data() || {};
      const verifiedAssignment = assignmentForSchedule(assignment, scheduleData);
      const profileSnapshot = await transaction.get(profileReference);
      if (!profileSnapshot.exists) throw errorWithCode('not-found', 'The department member profile was not found.');
      const profile = profileSnapshot.data() || {};
      if (assignment.memberName && assignment.memberName !== String(profile.memberName || profile.member || '')) {
        throw errorWithCode('invalid-argument', 'The member name does not match the verified profile.');
      }
      const assignmentRevisions = scheduleData.assignmentRevisions || {};
      const assignments = scheduleData.assignments || {};
      assertFresh({
        expectedRevision,
        expectedWitness: expectedMemberName,
        currentRevision: currentRevision({ revision: assignmentRevisions[verifiedAssignment.duty] }),
        currentWitness: String(assignments[verifiedAssignment.duty] || ''),
        details: { memberName: String(assignments[verifiedAssignment.duty] || '') }
      });
      const result = authz.authorizeAssignmentOverride(actor, verifiedAssignment, profile);
      rejectDecision(result);
      const id = assignmentIdFor(result.assignment);
      auditId = `administrator-assignment-override__${id}__${at}`;
      revisionValue = nextRevision({ revision: assignmentRevisions[result.assignment.duty] });
      record = assignmentRecord(result.assignment, profile, actor, at, {
        override: true,
        authorization: 'administrator-override',
        overrideReason: result.assignment.overrideReason,
        overriddenAt: at,
        overriddenByUid: actor.uid,
        auditId,
        revision: revisionValue
      });
      const auditRecord = {
        action: 'administrator-assignment-override', authorization: 'administrator-override', override: true,
        reason: result.assignment.overrideReason, actorUid: actor.uid,
        targetMemberUid: result.assignment.memberUid, departmentId: result.assignment.departmentId,
        duty: result.assignment.duty, serviceDate: result.assignment.serviceDate,
        serviceTime: result.assignment.serviceTime, assignmentId: id,
        profilePath: authz.profilePath(result.assignment.departmentId, result.assignment.memberUid),
        profileMutated: false, timestamp: at
      };
      const assignmentReference = db.collection('departmentAssignments').doc(id);
      const auditReference = db.collection('audit').doc(auditId);
      transaction.set(assignmentReference, record, { merge: false });
      transaction.set(auditReference, auditRecord, { merge: false });
      transaction.set(scheduleReference, {
        assignments: { [result.assignment.duty]: record.memberName },
        assignmentRevisions: { [result.assignment.duty]: revisionValue }
      }, { merge: true });
    });
    return {
      ok: true,
      revision: revisionValue,
      assignment: { ...record, auditId },
      override: true,
      auditId,
      profileMutated: false
    };
  }

  async function unassignDepartmentDuty(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    const allowed = new Set([
      'department', 'departmentId', 'duty', 'serviceId', 'serviceDate', 'date', 'serviceTime', 'time',
      'expectedRevision', 'expectedMemberName'
    ]);
    const unknown = Object.keys(data).find(key => !allowed.has(key));
    if (unknown) throw errorWithCode('invalid-argument', `Assignment field is not allowed: ${unknown}.`);
    const expectedRevision = data.expectedRevision;
    const expectedMemberName = data.expectedMemberName;
    let assignment;
    try {
      assignment = authz.normalizeAssignment({
        ...assignmentCommandWithoutRevisionFields(data),
        memberUid: actor.uid,
        override: false
      });
    } catch (error) {
      throw errorWithCode('invalid-argument', error.message);
    }
    if (!assignment.serviceId) {
      throw errorWithCode('invalid-argument', 'A service ID is required to clear an assignment.');
    }
    if (authz.departmentForDuty(assignment.duty) !== assignment.departmentId) {
      throw errorWithCode('failed-precondition', 'Department authorization denied: duty-department-mismatch.');
    }
    if (!authz.isAdministrator(actor) && !authz.managesDepartment(actor, assignment.departmentId)) {
      throw errorWithCode('permission-denied', 'Department authorization denied: profile-write-not-authorized.');
    }
    const assignmentReference = db.collection('departmentAssignments').doc(assignmentIdFor(assignment));
    const scheduleReference = db.collection('schedule').doc(assignment.serviceId);
    if (typeof db.runTransaction !== 'function') {
      throw errorWithCode('failed-precondition', 'Atomic schedule assignment storage is unavailable.');
    }
    let revisionValue;
    await db.runTransaction(async transaction => {
      const scheduleSnapshot = await transaction.get(scheduleReference);
      if (!scheduleSnapshot.exists) throw errorWithCode('not-found', 'The schedule service was not found.');
      const scheduleData = scheduleSnapshot.data() || {};
      assignment = assignmentForSchedule(assignment, scheduleData);
      const assignmentRevisions = scheduleData.assignmentRevisions || {};
      const assignments = scheduleData.assignments || {};
      assertFresh({
        expectedRevision,
        expectedWitness: expectedMemberName,
        currentRevision: currentRevision({ revision: assignmentRevisions[assignment.duty] }),
        currentWitness: String(assignments[assignment.duty] || ''),
        details: { memberName: String(assignments[assignment.duty] || '') }
      });
      revisionValue = nextRevision({ revision: assignmentRevisions[assignment.duty] });
      transaction.delete(assignmentReference);
      transaction.set(scheduleReference, {
        assignments: { [assignment.duty]: '' },
        assignmentRevisions: { [assignment.duty]: revisionValue }
      }, { merge: true });
    });
    return {
      ok: true,
      revision: revisionValue,
      departmentId: assignment.departmentId,
      duty: assignment.duty,
      serviceId: assignment.serviceId
    };
  }

  /* The month planner's save: many duties of one department at once. Each
     change is checked like assignDepartmentDuty (or clears like
     unassignDepartmentDuty); a change that fails a check, or whose duty
     changed since the planner showed it, is skipped and reported, and the
     rest are saved together. The schedule writes carry planBatch, so the
     server sends one notification per member instead of one per service. */
  async function saveDepartmentAssignments(request) {
    const actor = requestActor(request);
    const data = inputData(request);
    const unknown = Object.keys(data).find(key => !['departmentId', 'changes'].includes(key));
    if (unknown) throw errorWithCode('invalid-argument', `Field is not allowed: ${unknown}.`);
    const department = departmentInput({ departmentId: data.departmentId });
    if (!authz.isAdministrator(actor) && !authz.managesDepartment(actor, department)) {
      throw errorWithCode('permission-denied', 'Department authorization denied: cross-department.');
    }
    if (!Array.isArray(data.changes) || data.changes.length < 1 || data.changes.length > 200) {
      throw errorWithCode('invalid-argument', 'changes must hold 1 to 200 entries.');
    }
    const changes = data.changes.map(change => {
      if (!plainObject(change)) throw errorWithCode('invalid-argument', 'Each change must be an object.');
      const extra = Object.keys(change).find(key => !['serviceId', 'duty', 'memberUid', 'expectedMemberName'].includes(key));
      if (extra) throw errorWithCode('invalid-argument', `Change field is not allowed: ${extra}.`);
      const serviceId = String(change.serviceId || '').trim();
      const duty = String(change.duty || '').trim();
      if (!serviceId || !duty) throw errorWithCode('invalid-argument', 'Each change needs a serviceId and a duty.');
      if (authz.departmentForDuty(duty) !== department) {
        throw errorWithCode('failed-precondition', 'Department authorization denied: duty-department-mismatch.');
      }
      return {
        serviceId,
        duty,
        memberUid: change.memberUid == null ? '' : String(change.memberUid).trim(),
        expectedMemberName: change.expectedMemberName == null ? null : String(change.expectedMemberName)
      };
    });
    const serviceIds = Array.from(new Set(changes.map(change => change.serviceId)));
    const memberUids = Array.from(new Set(changes.map(change => change.memberUid).filter(Boolean)));
    const planBatch = `plan-${now()}-${Math.random().toString(36).slice(2, 8)}`;
    let saved = [];
    let skipped = [];
    await db.runTransaction(async transaction => {
      saved = [];
      skipped = [];
      const scheduleRefs = serviceIds.map(id => db.collection('schedule').doc(id));
      const profileRefs = memberUids.map(memberUid => profileRef(db, department, memberUid));
      const scheduleSnaps = await transaction.getAll(...scheduleRefs);
      const profileSnaps = profileRefs.length ? await transaction.getAll(...profileRefs) : [];
      const services = new Map();
      scheduleSnaps.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const value = snapshot.data() || {};
        services.set(serviceIds[index], {
          value,
          assignments: Object.assign({}, value.assignments),
          revisions: Object.assign({}, value.assignmentRevisions),
          changed: {},
          changedRevisions: {}
        });
      });
      const profiles = new Map();
      profileSnaps.forEach((snapshot, index) => { if (snapshot.exists) profiles.set(memberUids[index], snapshot.data() || {}); });
      const at = now();
      for (const change of changes) {
        const where = { serviceId: change.serviceId, duty: change.duty };
        const service = services.get(change.serviceId);
        if (!service) { skipped.push({ ...where, reason: 'no-service' }); continue; }
        const current = String(service.assignments[change.duty] || '');
        if (change.expectedMemberName != null && change.expectedMemberName !== current) {
          skipped.push({ ...where, reason: 'changed', memberName: current });
          continue;
        }
        let assignment;
        try {
          assignment = assignmentForSchedule(authz.normalizeAssignment({
            departmentId: department,
            memberUid: change.memberUid || actor.uid,
            duty: change.duty,
            serviceId: change.serviceId,
            serviceDate: String(service.value.date || ''),
            serviceTime: slugify(service.value.serviceTime || service.value.service || service.value.time || '')
          }), service.value);
        } catch (error) {
          skipped.push({ ...where, reason: 'invalid-service' });
          continue;
        }
        let name = '';
        let record = null;
        if (change.memberUid) {
          const profile = profiles.get(change.memberUid);
          if (!profile) { skipped.push({ ...where, reason: 'no-profile' }); continue; }
          const decision = authz.authorizeAssignment(actor, assignment, profile);
          if (!decision.allowed) { skipped.push({ ...where, reason: decision.reason }); continue; }
          name = String(profile.memberName || profile.member || '');
          if (Object.keys(service.assignments).some(duty => duty !== change.duty && service.assignments[duty] === name)) {
            skipped.push({ ...where, reason: 'already-serving' });
            continue;
          }
          assignment = decision.assignment;
          record = { profile };
        }
        if (name === current) continue;
        const revision = nextRevision({ revision: service.revisions[change.duty] });
        service.assignments[change.duty] = name;
        service.revisions[change.duty] = revision;
        service.changed[change.duty] = name;
        service.changedRevisions[change.duty] = revision;
        const reference = db.collection('departmentAssignments').doc(assignmentIdFor(assignment));
        if (record) {
          transaction.set(reference, assignmentRecord(assignment, record.profile, actor, at, {
            override: false, authorization: 'normal-eligible-assignment', revision, planBatch
          }), { merge: false });
        } else {
          transaction.delete(reference);
        }
        saved.push({ ...where, memberName: name, previous: current, date: String(service.value.date || ''), service: String(service.value.service || '') });
      }
      services.forEach((service, id) => {
        if (!Object.keys(service.changed).length) return;
        transaction.set(db.collection('schedule').doc(id), {
          assignments: service.changed,
          assignmentRevisions: service.changedRevisions,
          planBatch
        }, { merge: true });
      });
    });
    return { ok: true, departmentId: department, planBatch, saved, skipped };
  }

  return Object.freeze({
    saveDepartmentAssignments,
    listDepartmentRoster,
    updateDepartmentProfile,
    updateMemberAvailability,
    updateDepartmentAvailability: updateMemberAvailability,
    createDepartmentProfile,
    assignDepartmentDuty,
    unassignDepartmentDuty,
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
  requestActor,
  inputData,
  profileRef,
  assignmentForSchedule,
  assignmentRecord,
  errorWithCode,
  rejectDecision
};
