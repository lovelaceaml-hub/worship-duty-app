'use strict';

const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const sheetLib = require('./sheet-lib');
const icsLib = require('./ics-lib');
const { publicScheduleService } = require('./public-schedule');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { TIME_ZONE: TZ, pacificDate, serviceStart, longDate, clockTime } = require('./time');
const {
  DEFAULT_PIN,
  ORDINARY_DEFAULT_PIN,
  hashPin,
  createMemberAuthCallables
} = require('./member-auth');
const permissions = require('./permissions');
const { createDepartmentHandlers, assignmentIdFor } = require('./department-handlers');
const { currentRevision, nextRevision } = require('./revision');
const { createWorkflowHandlers } = require('./workflows');
const { createMembershipHandlers } = require('./membership');
const { createSheets, accountEmail } = require('./sheets');
const sheetSync = require('./sheet-sync');
const { serviceYear } = require('./service-year');
const { dutyName } = require('./names');
const { addServingMembers } = require('./serving-members');
const { setDutyDefault } = require('./duty-defaults');
const { renameMember: renameMemberEverywhere } = require('./rename-member');

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
const PERMISSION_CONFIG = permissions.DEFAULT_PERMISSION_CONFIG;
const departmentHandlers = createDepartmentHandlers({
  db,
  now: () => Date.now(),
  logger
});
const workflowHandlers = createWorkflowHandlers({ db, now: () => Date.now(), logger });
const membershipHandlers = createMembershipHandlers({ db, now: () => Date.now() });

const MEMBER_ALIASES = Object.freeze({
  'D. Chloe': 'M. Chloe',
  'B,James': 'B. James',
  'BJason': 'B. Jason',
  'S. Melisaa': 'S. Melissa',
  'S. Monica C.': 'S. Monica C',
  'S. Monica S.': 'S. Monica S'
});

function canonicalMemberName(name) {
  const value = String(name == null ? '' : name).trim();
  return MEMBER_ALIASES[value] || value;
}

function scheduleServiceTimeKey(service) {
  return String(service && (service.serviceTime || service.service || service.time) || '')
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function reconcileScheduleAssignmentProjection(serviceId, before, after) {
  const beforeAssignments = before && before.assignments || {};
  const afterAssignments = after && after.assignments || {};
  const changedDuties = Array.from(new Set([
    ...Object.keys(beforeAssignments),
    ...Object.keys(afterAssignments)
  ])).filter(duty => beforeAssignments[duty] !== afterAssignments[duty]);
  if (!changedDuties.length) return;
  const batch = db.batch();
  let writes = 0;
  /* Self-healing for the Needs-replacement markers written by
     saveMemberAvailability/resolveDutyAttention (Section 3): a marker is
     live only while schedule.assignments[duty] still equals
     needsReplacement[duty].memberName. This covers the legacy direct-write
     and Sheet-sync paths, which do not know about markers at all. */
  const existingNeedsReplacement = (after && after.needsReplacement) || {};
  const needsReplacementClears = {};
  for (const duty of changedDuties) {
    const marker = existingNeedsReplacement[duty];
    if (marker && String(afterAssignments[duty] || '') !== String(marker.memberName || '')) {
      needsReplacementClears[duty] = FieldValue.delete();
    }
  }
  if (Object.keys(needsReplacementClears).length) {
    batch.set(db.collection('schedule').doc(serviceId), { needsReplacement: needsReplacementClears }, { merge: true });
    writes += 1;
  }
  for (const duty of changedDuties) {
    const departmentId = permissions.departmentForDuty(duty);
    if (!departmentId) continue;
    const assignment = {
      departmentId,
      serviceId,
      serviceDate: after.date,
      serviceTime: scheduleServiceTimeKey(after),
      duty
    };
    const reference = db.collection('departmentAssignments').doc(assignmentIdFor(assignment));
    const name = String(afterAssignments[duty] || '').trim();
    if (!name) {
      batch.delete(reference);
      writes += 1;
      continue;
    }
    const existing = await reference.get();
    if (existing.exists && String((existing.data() || {}).memberName || '') === name) continue;
    const profiles = await db.collection('departments').doc(departmentId)
      .collection('members').where('memberName', '==', name).limit(2).get();
    if (profiles.size !== 1) {
      batch.delete(reference);
      writes += 1;
      logger.warn('schedule projection profile was not unique', { serviceId, duty, departmentId });
      continue;
    }
    const profileDocument = profiles.docs[0];
    const profile = profileDocument.data() || {};
    batch.set(reference, {
      id: reference.id,
      departmentId,
      memberUid: profileDocument.id,
      memberName: profile.memberName || name,
      duty,
      serviceId,
      serviceDate: after.date,
      serviceTime: assignment.serviceTime,
      profileId: profile.profileId || profile.id || '',
      assignedAt: Date.now(),
      assignedByUid: 'schedule-projection',
      assignedBy: 'schedule-projection',
      override: true,
      authorization: 'administrator-schedule-reconciliation',
      revision: nextRevision(existing.exists ? (existing.data() || {}) : {})
    }, { merge: false });
    writes += 1;
  }
  if (writes) await batch.commit();
}

function memberRoleRecord(name) {
  const memberName = canonicalMemberName(name);
  const actor = { name: memberName };
  const admin = permissions.isAdmin(actor, PERMISSION_CONFIG);
  const globalLeaderManager = permissions.isGlobalManager(actor, PERMISSION_CONFIG);
  const departments = permissions.departmentsForLeader(actor, PERMISSION_CONFIG);
  const departmentLeader = departments.length > 0 && !admin;
  const songEditor = permissions.canEditSongs(actor, {}, PERMISSION_CONFIG);
  const roles = [];
  if (admin) roles.push('admin');
  if (globalLeaderManager) roles.push('globalLeaderManager');
  if (departmentLeader) roles.push('departmentLeader');
  if (songEditor) roles.push('songEditor');
  const role = admin
    ? 'admin'
    : globalLeaderManager
      ? 'globalLeaderManager'
      : departmentLeader
        ? 'departmentLeader'
        : songEditor
          ? 'songEditor'
          : 'member';
  return {
    id: memberName,
    memberId: memberName,
    name: memberName,
    memberName,
    role,
    roles,
    departments,
    globalLeaderManager,
    mustChangePin: admin || globalLeaderManager || departmentLeader || songEditor
  };
}

function listFromMemberDocument(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.members)) return data.members;
  return [];
}

/* The departments a member belongs to: the name lists in app/departments,
   plus any department where they have an active profile (members added in
   Manage by name search or invite link). */
async function departmentsForMember(name) {
  const found = new Set();
  const listSnap = await db.collection('app').doc('departments').get().catch(() => null);
  const lists = listSnap && listSnap.exists ? (listSnap.data().map || {}) : {};
  Object.entries(lists).forEach(([department, names]) => {
    if (Array.isArray(names) && names.map(canonicalMemberName).includes(name)) found.add(department);
  });
  await Promise.all(permissions.DEPARTMENTS.map(async department => {
    const profiles = await db.collection('departments').doc(department).collection('members')
      .where('memberName', '==', name).limit(1).get().catch(() => null);
    if (profiles && !profiles.empty && (profiles.docs[0].data() || {}).status !== 'inactive') found.add(department);
  }));
  return Array.from(found);
}

async function decorateMember(record) {
  if (!record || typeof record !== 'object') return null;
  const next = Object.assign({}, record);
  const name = canonicalMemberName(next.name || next.memberName || next.id || next.memberId);
  if (!name) return null;
  next.id = String(next.id || next.memberId || name);
  next.memberId = String(next.memberId || next.id);
  next.name = name;
  next.memberName = name;
  if (!Array.isArray(next.departments) || !next.departments.length) {
    next.departments = await departmentsForMember(name);
  }
  if (!Array.isArray(next.roles) || !next.roles.length) {
    const defaults = memberRoleRecord(name);
    next.roles = defaults.roles;
    if (!next.role) next.role = defaults.role;
    if (next.globalLeaderManager === undefined) next.globalLeaderManager = defaults.globalLeaderManager;
  }
  if (next.mustChangePin === undefined) {
    const defaults = memberRoleRecord(name);
    next.mustChangePin = defaults.mustChangePin;
  }
  return next;
}

function createFirestoreMemberStore() {
  const accounts = db.collection('accounts');
  const appMembers = db.collection('app').doc('members');

  async function accountById(id) {
    const requested = canonicalMemberName(id);
    if (!requested) return null;
    const snapshot = await accounts.doc(requested).get();
    if (snapshot.exists) return decorateMember(Object.assign({ id: snapshot.id }, snapshot.data()));
    const query = await accounts.where('memberId', '==', requested).limit(1).get();
    if (!query.empty) {
      const document = query.docs[0];
      return decorateMember(Object.assign({ id: document.id }, document.data()));
    }
    const membersSnapshot = await appMembers.get();
    const names = listFromMemberDocument(membersSnapshot.exists ? membersSnapshot.data() : null)
      .map(canonicalMemberName);
    if (!names.includes(requested)) return null;
    const defaults = memberRoleRecord(requested);
    defaults.pinHash = await hashPin(defaults.mustChangePin ? DEFAULT_PIN : ORDINARY_DEFAULT_PIN);
    defaults.active = true;
    defaults.roleVersion = 1;
    await accounts.doc(requested).set(defaults, { merge: true });
    return defaults;
  }

  async function findByName(name) {
    const requested = canonicalMemberName(name);
    if (!requested) return null;
    const direct = await accountById(requested);
    if (direct) return direct;
    const query = await accounts.where('name', '==', requested).limit(1).get();
    if (!query.empty) {
      const document = query.docs[0];
      return decorateMember(Object.assign({ id: document.id }, document.data()));
    }
    return accountById(requested);
  }

  return {
    getById: accountById,
    findByName,
    async update(id, patch) {
      const memberId = canonicalMemberName(id);
      if (!memberId) throw new Error('Member id is required.');
      const current = await accountById(memberId) || memberRoleRecord(memberId);
      const safePatch = Object.assign({}, patch);
      await accounts.doc(memberId).set(Object.assign({}, current, safePatch, {
        id: memberId,
        memberId,
        name: canonicalMemberName(current.name || memberId),
        memberName: canonicalMemberName(current.memberName || current.name || memberId)
      }), { merge: true });
    },
    async assertCanAttempt(id) {
      const snapshot = await accounts.doc(canonicalMemberName(id)).get();
      const data = snapshot.exists ? snapshot.data() : {};
      if (Number(data.loginLockedUntil || 0) > Date.now()) {
        const error = new Error('Too many attempts. Try again later.');
        error.code = 'resource-exhausted';
        throw error;
      }
    },
    async recordFailedAttempt(id) {
      const ref = accounts.doc(canonicalMemberName(id));
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.exists ? snapshot.data() : {};
        const attempts = Number(data.failedLoginAttempts || 0) + 1;
        transaction.set(ref, {
          failedLoginAttempts: attempts,
          loginLockedUntil: attempts >= 5 ? Date.now() + 15 * 60 * 1000 : 0
        }, { merge: true });
      });
    },
    async clearFailedAttempts(id) {
      await accounts.doc(canonicalMemberName(id)).set({ failedLoginAttempts: 0, loginLockedUntil: 0 }, { merge: true });
    }
  };
}

function memberPermissionAdapter() {
  return {
    async assertActorCanAct({ actor, action, target }) {
      const identity = Object.assign({}, actor && actor.token, { uid: actor && actor.uid });
      if (action === 'member.pin.reset') {
        const config = await runtimePermissionConfig();
        if (permissions.isAdmin(identity, config) || permissions.isGlobalManager(identity, config)) return true;
        const targetIdentity = { name: canonicalMemberName(target && (target.name || target.memberName || target.id)), roles: target && target.roles };
        const privilegedTarget = permissions.isAdmin(targetIdentity, config) ||
          permissions.isGlobalManager(targetIdentity, config) ||
          permissions.departmentsForLeader(targetIdentity, config).length > 0 ||
          permissions.canEditSongs(targetIdentity, {}, config);
        const memberships = await departmentsForMember(targetIdentity.name);
        const scopedTarget = Object.assign({}, targetIdentity, { departments: memberships });
        if (privilegedTarget || !permissions.canResetPin(identity, scopedTarget, config)) {
          const error = new Error('You are not allowed to perform this action.');
          error.code = 'permission-denied';
          throw error;
        }
        return true;
      }
      if (permissions.canManageLeaders(identity, PERMISSION_CONFIG)) return true;
      const error = new Error('You are not allowed to perform this action.');
      error.code = 'permission-denied';
      throw error;
    }
  };
}

const memberAuthCallables = createMemberAuthCallables({
  memberStore: createFirestoreMemberStore(),
  auth: getAuth(),
  permission: memberPermissionAdapter(),
  logger
});

const AUTH_ERROR_CODES = new Set([
  'cancelled', 'invalid-argument', 'deadline-exceeded', 'not-found',
  'already-exists', 'permission-denied', 'resource-exhausted',
  'failed-precondition', 'aborted', 'out-of-range', 'unauthenticated',
  'unavailable', 'data-loss', 'internal'
]);

function exposeMemberAuthCallable(handler) {
  return onCall({ region: REGION }, async request => {
    try {
      return await handler(request);
    } catch (error) {
      const code = error && AUTH_ERROR_CODES.has(error.code) ? error.code : 'internal';
      const message = code === 'internal'
        ? 'The member authentication service is unavailable.'
        : String(error.message || 'The requested authentication action failed.');
      throw new HttpsError(code, message);
    }
  });
}

exports.verifyMemberPin = exposeMemberAuthCallable(memberAuthCallables.verifyMemberPin);
exports.changeMemberPin = exposeMemberAuthCallable(memberAuthCallables.changeMemberPin);
exports.resetMemberPin = exposeMemberAuthCallable(memberAuthCallables.resetMemberPin);

function exposeDepartmentCallable(handler) {
  return onCall({ region: REGION }, async request => {
    try {
      const actor = await callableActor(request);
      return await handler({
        ...request,
        auth: actor
      });
    } catch (error) {
      const code = error && AUTH_ERROR_CODES.has(error.code) ? error.code : 'internal';
      const message = code === 'internal'
        ? 'The department authorization service is unavailable.'
        : String(error.message || 'The requested department action failed.');
      const details = error && error.details && typeof error.details === 'object' ? error.details : undefined;
      throw new HttpsError(code, message, details);
    }
  });
}

exports.updateDepartmentProfile = exposeDepartmentCallable(
  departmentHandlers.updateDepartmentProfile
);
exports.listDepartmentRoster = exposeDepartmentCallable(
  departmentHandlers.listDepartmentRoster
);
exports.updateMemberAvailability = exposeDepartmentCallable(
  departmentHandlers.updateMemberAvailability
);
exports.createDepartmentProfile = exposeDepartmentCallable(
  departmentHandlers.createDepartmentProfile
);
exports.assignDepartmentDuty = exposeDepartmentCallable(
  departmentHandlers.assignDepartmentDuty
);
exports.unassignDepartmentDuty = exposeDepartmentCallable(
  departmentHandlers.unassignDepartmentDuty
);
exports.overrideDepartmentAssignment = exposeDepartmentCallable(
  departmentHandlers.overrideDepartmentAssignment
);
exports.saveMemberAvailability = exposeDepartmentCallable(
  workflowHandlers.saveMemberAvailability
);
exports.resolveDutyAttention = exposeDepartmentCallable(
  workflowHandlers.resolveDutyAttention
);

/* The month planner's save. Members hear about their new duties in one
   notification each, however many services the save touched. */
exports.saveDepartmentAssignments = exposeDepartmentCallable(async request => {
  const result = await departmentHandlers.saveDepartmentAssignments(request);
  try {
    await alertPlanned(result.saved);
  } catch (error) {
    logger.error('Planner alerts failed', { error: String(error && error.message || error) });
  }
  return result;
});

/* Adding members by name search or invite link. exposeDepartmentCallable
   only establishes the verified, active, current-role, no-forced-PIN actor;
   each handler checks rights on top. Search, create and revoke need a leader
   of the department; accept does not, because any signed-in member may use
   an invite link they were sent. */
exports.searchDepartmentCandidates = exposeDepartmentCallable(
  membershipHandlers.searchDepartmentCandidates
);
exports.createDepartmentInvitation = exposeDepartmentCallable(
  membershipHandlers.createDepartmentInvitation
);
exports.revokeDepartmentInvitation = exposeDepartmentCallable(
  membershipHandlers.revokeDepartmentInvitation
);
exports.acceptDepartmentInvitation = exposeDepartmentCallable(
  membershipHandlers.acceptDepartmentInvitation
);

/* Every 30 minutes, record confirmed song lists as sung once their service
   ended (three hours after it started). A second run finds them sung and
   does nothing. */
exports.songHistoryRecorder = onSchedule(
  { schedule: 'every 30 minutes', timeZone: TZ, region: REGION },
  async () => {
    await workflowHandlers.recordSongHistory();
  }
);

async function readCurrentAccount(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'A verified member session is required.');
  const token = request.auth.token || {};
  const memberId = String(token.memberId || '').trim();
  if (!memberId) throw new HttpsError('permission-denied', 'The signed-in member account is missing.');
  const snapshot = await db.collection('accounts').doc(memberId).get();
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'The signed-in member account is missing.');
  const account = Object.assign({ id: snapshot.id }, snapshot.data() || {});
  const expectedUid = String(account.authUid || `member:${memberId}`);
  if (expectedUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'The signed-in member account is invalid.');
  }
  if (!Number.isSafeInteger(token.roleVersion)
      || !Number.isSafeInteger(account.roleVersion)
      || token.roleVersion !== account.roleVersion) {
    throw new HttpsError('permission-denied', 'The member role has changed. Sign in again.');
  }
  if (account.active === false) {
    throw new HttpsError('permission-denied', 'The member account is inactive.');
  }
  return { memberId, account };
}

function roleNames(account) {
  const roles = Array.isArray(account.roles)
    ? account.roles.filter(role => typeof role === 'string' && role.trim())
    : [];
  if (!roles.length && typeof account.role === 'string' && account.role.trim()) roles.push(account.role);
  if (!roles.length) roles.push('member');
  return Array.from(new Set(roles));
}

function currentTokenForAccount(requestToken, account, memberId) {
  const roles = roleNames(account);
  const normalizedRoles = new Set(roles.map(role => String(role).trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '')));
  const departments = Array.isArray(account.departments)
    ? account.departments.filter(value => typeof value === 'string' && value.trim())
    : [];
  return Object.assign({}, requestToken, {
    memberId: account.memberId || memberId,
    memberName: account.memberName || account.name || memberId,
    role: account.role || roles[0],
    roles,
    departments,
    departmentIds: Array.isArray(account.departmentIds) ? account.departmentIds : departments,
    departmentLeaders: account.departmentLeaders && typeof account.departmentLeaders === 'object'
      ? account.departmentLeaders
      : {},
    permissions: Array.isArray(account.permissions) ? account.permissions : [],
    admin: account.admin === true || normalizedRoles.has('admin') || normalizedRoles.has('administrator'),
    globalLeaderManager: account.globalLeaderManager === true || normalizedRoles.has('globalleadermanager'),
    departmentLeader: account.departmentLeader === true || normalizedRoles.has('departmentleader') || normalizedRoles.has('leader'),
    songEditor: account.songEditor === true || normalizedRoles.has('songeditor'),
    mustChangePin: account.mustChangePin === true,
    roleVersion: account.roleVersion
  });
}

async function callableActor(request) {
  const current = await readCurrentAccount(request);
  const token = currentTokenForAccount(request.auth.token || {}, current.account, current.memberId);
  if (token.mustChangePin === true) {
    throw new HttpsError('failed-precondition', 'Change your PIN before using privileged actions.');
  }
  return Object.assign({
    uid: request.auth.uid,
    token,
    currentAccount: current.account
  }, token);
}

async function runtimePermissionConfig() {
  const snapshot = await db.collection('app').doc('leaderConfig').get();
  return snapshot.exists
    ? Object.assign({}, snapshot.data(), {
      admin: PERMISSION_CONFIG.admin,
      globalLeaderManager: PERMISSION_CONFIG.globalLeaderManager
    })
    : PERMISSION_CONFIG;
}

exports.updateRoleConfiguration = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  const data = request.data || {};
  const roleType = data.roleType === 'songEditor' ? 'songEditor' : 'departmentLeader';
  const department = String(data.department || '').trim();
  const memberName = canonicalMemberName(data.memberName);
  const enabled = data.enabled === true;
  const current = await runtimePermissionConfig();
  if (!memberName || (roleType === 'departmentLeader' && !department)) {
    throw new HttpsError('invalid-argument', 'A valid role target is required.');
  }
  if (!permissions.canManageLeaders(actor, current)) {
    throw new HttpsError('permission-denied', 'Only global leader managers can change role assignments.');
  }
  const next = {
    admin: Array.from(PERMISSION_CONFIG.admin),
    globalLeaderManager: Array.from(PERMISSION_CONFIG.globalLeaderManager),
    departmentLeaders: Object.assign({}, current.departmentLeaders || PERMISSION_CONFIG.departmentLeaders),
    songEditors: Array.from(current.songEditors || PERMISSION_CONFIG.songEditors)
  };
  const list = roleType === 'songEditor'
    ? next.songEditors
    : Array.from(next.departmentLeaders[department] || []);
  const updated = enabled
    ? Array.from(new Set(list.concat(memberName))).sort()
    : list.filter(name => canonicalMemberName(name) !== memberName);
  if (roleType === 'songEditor') next.songEditors = updated;
  else next.departmentLeaders[department] = updated;
  const actorName = canonicalMemberName(actor.memberName || actor.name || actor.uid);
  await db.collection('app').doc('leaderConfig').set(next, { merge: false });
  const memberActor = { name: memberName };
  const departments = permissions.departmentsForLeader(memberActor, next);
  const roles = [];
  if (permissions.isAdmin(memberActor, next)) roles.push('admin');
  if (permissions.isGlobalManager(memberActor, next)) roles.push('globalLeaderManager');
  if (departments.length) roles.push('departmentLeader');
  if (permissions.canEditSongs(memberActor, {}, next)) roles.push('songEditor');
  const accountRef = db.collection('accounts').doc(memberName);
  const beforeAccount = await accountRef.get();
  const beforeData = beforeAccount.exists ? beforeAccount.data() : {};
  const wasPrivileged = Array.isArray(beforeData.roles) && beforeData.roles.some(role => role !== 'member');
  const nowPrivileged = roles.length > 0;
  const accountPatch = {
    roles, departments,
    role: roles[0] || 'member',
    globalLeaderManager: roles.includes('globalLeaderManager'),
    mustChangePin: !wasPrivileged && nowPrivileged ? true : Boolean(beforeData.mustChangePin),
    active: true,
    roleVersion: Number(beforeData.roleVersion || 1) + 1
  };
  if (!beforeData.pinHash) accountPatch.pinHash = await hashPin(nowPrivileged ? DEFAULT_PIN : ORDINARY_DEFAULT_PIN);
  await accountRef.set(accountPatch, { merge: true });
  try { await getAuth().revokeRefreshTokens(String(beforeData.authUid || 'member:' + memberName)); } catch (_error) { /* next token still uses the new role version */ }
  await db.collection('audit').add({
    actor: actorName, actorUid: request.auth.uid,
    action: 'role-configuration-changed', target: memberName,
    roleType, department: roleType === 'departmentLeader' ? department : '',
    enabled, timestamp: Date.now()
  });
  return { ok: true, config: next };
});

/* The duty line in a notification: "Presider · Sabbath Day Morning ·
   Wednesday, July 1 at 9:00 AM". */
function bodyFor(duty, svc) {
  return dutyName(duty) + ' · ' + [svc.worship, svc.service].filter(Boolean).join(' ') + ' · ' +
    longDate(svc.date) + (svc.time ? ' at ' + clockTime(svc.time) : '');
}

/* ---- shared send helpers: names -> tokens -> data-only multicast ----
   Prunes token docs FCM reports as invalid/unregistered on any send. */

/* Load every token doc once as [{ token, name }]. Callers that send in a loop
   (dutyReminders) load this a single time instead of re-scanning per recipient. */
async function loadTokenTargets() {
  const snap = await db.collection('tokens').get();
  const targets = []; // { token, name }
  snap.forEach(d => {
    const data = d.data();
    if (data && data.name) targets.push({ token: d.id, name: data.name });
  });
  return targets;
}

/* Send title/body to every already-loaded target whose name is in `names`. */
async function sendToTargets(targets, names, title, bodyFn) {
  const wanted = new Set(names.filter(Boolean));
  if (!wanted.size) return;
  const picked = targets.filter(t => wanted.has(t.name));
  if (!picked.length) return;
  // Bodies can differ per recipient, so batch tokens by identical body and
  // send one data-only multicast per distinct body.
  const byBody = {};
  picked.forEach(t => {
    const body = bodyFn(t.name);
    (byBody[body] || (byBody[body] = [])).push(t.token);
  });
  const dead = [];
  for (const body of Object.keys(byBody)) {
    const grp = byBody[body];
    const resp = await getMessaging().sendEachForMulticast({
      tokens: grp,
      data: { title: title, body: body }
    });
    resp.responses.forEach((r, i) => {
      if (!r.success && r.error) {
        const code = r.error.code || '';
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument' ||
            code === 'messaging/invalid-registration-token') {
          dead.push(grp[i]);
        }
      }
    });
  }
  await Promise.all(dead.map(tok =>
    db.collection('tokens').doc(tok).delete().catch(() => {})));
}

/* One-shot convenience for callers that send once (loads tokens then sends). */
async function sendToNames(names, title, bodyFn) {
  const wanted = new Set(names.filter(Boolean));
  if (!wanted.size) return;
  await sendToTargets(await loadTokenTargets(), names, title, bodyFn);
}

/* The switches in Manage, Features, saved in app/settings.features, with
   the same defaults as app/config/features.js. */
async function loadSettings() {
  const snapshot = await db.collection('app').doc('settings').get();
  return snapshot.exists ? snapshot.data() || {} : {};
}

function switchOn(settings, id, fallback = true) {
  const features = (settings && settings.features) || {};
  return Object.prototype.hasOwnProperty.call(features, id) ? features[id] === true : fallback;
}

/* The Sheet's Entry grid, when an administrator has set the Sheet's link
   (Manage, Data) and turned on "Write changes to the Sheet". Otherwise null,
   and the import keeps reading the published Raw Data link. */
function gridSheets(settings) {
  return settings.sheetId && switchOn(settings, 'sheetWrite', false) ? createSheets(settings.sheetId) : null;
}

/* The last Sheet write's outcome, shown in Manage. Written only when it
   changes, so a working Sheet costs no extra writes. */
async function noteSheetStatus(settings, error) {
  const was = settings.sheetStatus || {};
  const message = error ? String(error.message || error).slice(0, 300) : '';
  if (!error && was.ok !== false) return;
  if (error && was.ok === false && was.message === message) return;
  await db.collection('app').doc('settings').set({ sheetStatus: { ok: !error, message, at: Date.now() } }, { merge: true });
}

/* "Usher Door · Saturday, October 3 Morning", several joined, for one alert. */
function dutyList(items) {
  const lines = items.slice().sort((a, b) => a.date.localeCompare(b.date))
    .map(item => dutyName(item.duty) + ' · ' + longDate(item.date) + ' ' + item.service);
  return lines.length > 4 ? lines.slice(0, 3).join('; ') + '; and ' + (lines.length - 3) + ' more' : lines.join('; ');
}

/* A change made in the app goes into the Sheet's grid. Writes that came from
   the Sheet itself (the import, a generated year) carry a new sheetSyncedAt
   and are not written back. */
async function writeBack(event, before, after) {
  const existed = event.data.before && event.data.before.exists;
  if (after && after.sheetSyncedAt && after.sheetSyncedAt !== (existed ? before.sheetSyncedAt : undefined)) return;
  const settings = await loadSettings();
  const sheets = gridSheets(settings);
  if (!sheets) return;
  try {
    const done = await sheetSync.writeService(sheets, existed ? before : null, after);
    logger.info('Sheet write', { service: event.params.id, done });
    await noteSheetStatus(settings, null);
  } catch (error) {
    logger.error('Sheet write failed', { service: event.params.id, error: String(error && error.message || error) });
    await noteSheetStatus(settings, error);
  }
}

async function alertPlanned(saved) {
  const byName = {};
  saved.filter(item => item.memberName).forEach(item => { (byName[item.memberName] = byName[item.memberName] || []).push(item); });
  const names = Object.keys(byName);
  if (!names.length || !switchOn(await loadSettings(), 'notifications')) return;
  const one = names.filter(name => byName[name].length === 1);
  const many = names.filter(name => byName[name].length > 1);
  if (one.length) await sendToNames(one, 'New duty for you', name => dutyList(byName[name]));
  if (many.length) await sendToNames(many, 'New duties for you', name => dutyList(byName[name]));
}

/* ---- 1. new-duty alerts (switch: notifications) ---- */
exports.onScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION },
  async (event) => {
    const after = event.data && event.data.after;
    const before = event.data.before && event.data.before.exists
      ? event.data.before.data() || {}
      : {};
    if (!after || !after.exists) {
      await reconcileScheduleAssignmentProjection(event.params.id, before, { ...before, assignments: {} });
      await writeBack(event, before, null);
      return;
    }
    const svc = after.data() || {};
    await reconcileScheduleAssignmentProjection(event.params.id, before, svc);
    await writeBack(event, before, svc);
    // Brand-new service doc (initial seed, bulk import, or a fresh sheet-created
    // service): every assignment would read as "new", fanning a mass push out to
    // everyone at once. Skip - members still get the in-app badge and the
    // day-before reminder. Only alert on edits to an existing service.
    if (!(event.data.before && event.data.before.exists)) return;
    // The month planner's saves send one alert per member themselves.
    if (svc.planBatch && svc.planBatch !== before.planBatch) return;
    const beforeA = (before && before.assignments) || {};
    const afterA = svc.assignments || {};
    // for each duty whose member CHANGED to a new non-empty name
    const perName = {}; // name -> duty (first that changed for them)
    Object.keys(afterA).forEach(duty => {
      const name = afterA[duty];
      if (name && name !== beforeA[duty] && !(name in perName)) perName[name] = duty;
    });
    const names = Object.keys(perName);
    if (!names.length) return;
    if (!switchOn(await loadSettings(), 'notifications')) return;
    await sendToNames(names, 'New duty for you', name => bodyFor(perName[name], svc));
  });

/* ---- 2. day-before reminders (switch: reminders) ---- */
exports.dutyReminders = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TZ, region: REGION },
  async () => {
    if (!switchOn(await loadSettings(), 'reminders')) return;
    const now = Date.now();
    const yesterday = new Date(now - 24 * 3600 * 1000);
    const cutoff = yesterday.toISOString().slice(0, 10); // date >= today-1
    const snap = await db.collection('schedule').where('date', '>=', cutoff).get();

    // Load every token once for the whole run instead of re-scanning the
    // collection per assigned duty (reads were services × duties × tokens).
    const tokenTargets = await loadTokenTargets();

    for (const d of snap.docs) {
      const svc = d.data() || {};
      if (!svc.date) continue;
      const when = serviceStart(svc);
      if (!(when > now && when - now < 24 * 3600 * 1000)) continue;
      const svcId = d.id;
      const assignments = svc.assignments || {};
      // group members by duty so each gets their own duty in the body
      for (const duty of Object.keys(assignments)) {
        const name = assignments[duty];
        if (!name) continue;
        const markerId = svcId + '_' + duty.replace(/[^a-zA-Z0-9]+/g, '-') + '_' +
          name.replace(/[^a-zA-Z0-9]+/g, '-');
        const marker = db.collection('sent').doc(markerId);
        const existing = await marker.get();
        if (existing.exists) continue;
        // Mark BEFORE sending: a crash between send and mark would otherwise
        // re-send next hour. We accept a rare missed reminder over a double one.
        await marker.set({ t: now });
        try {
          await sendToTargets(tokenTargets, [name], 'Duty reminder', () => bodyFor(duty, svc));
        } catch (e) {
          logger.error('dutyReminders: send failed', { markerId, error: String(e) });
        }
      }
    }
    // prune markers older than 7 days
    const old = await db.collection('sent')
      .where('t', '<', now - 7 * 24 * 3600 * 1000).get();
    await Promise.all(old.docs.map(m => m.ref.delete().catch(() => {})));
  });

/* ---- 3. change request sent: tell that department's leaders and the
   scheduler (Manage, Features), never the member who asked ---- */
exports.onRequestCreated = onDocumentCreated(
  { document: 'requests/{id}', region: REGION },
  async event => {
    const request = event.data && event.data.exists ? event.data.data() || {} : null;
    if (!request) return;
    const [settingsSnap, config] = await Promise.all([db.collection('app').doc('settings').get(), runtimePermissionConfig()]);
    const scheduler = (settingsSnap.exists && settingsSnap.data().schedulerName) || '';
    const department = request.department || permissions.departmentForDuty(request.duty);
    const leaders = ((config.departmentLeaders || {})[department] || []);
    const requester = canonicalMemberName(request.name);
    const recipients = Array.from(new Set([scheduler].concat(leaders).map(canonicalMemberName)))
      .filter(name => name && name !== requester);
    if (!recipients.length) return;
    const body = request.name + ' asks to change ' + dutyName(request.duty) + ' · ' + longDate(request.date) + ' ' + request.service +
      (request.note ? ' · "' + request.note + '"' : '');
    await sendToNames(recipients, 'Change request', () => body);
  });

/* ---- 4. change request answered: tell the member ---- */
exports.onRequestResolved = onDocumentUpdated(
  { document: 'requests/{id}', region: REGION },
  async event => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    const was = before.data() || {}, now = after.data() || {};
    if (!(was.status === 'pending' && now.status !== was.status)) return;
    const title = now.status === 'approved' ? 'Your change request was approved'
      : now.status === 'declined' ? 'Your change request was declined' : 'Your change request was answered';
    await sendToNames([now.name], title, () => dutyName(now.duty) + ' · ' + longDate(now.date) + ' ' + now.service);
  });

/* ---- 4b. feedback marked done: tell the member who sent it ---- */
exports.onFeedbackDone = onDocumentUpdated(
  { document: 'feedback/{id}', region: REGION },
  async event => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    const was = before.data() || {}, now = after.data() || {};
    if (was.status === 'done' || now.status !== 'done' || !now.name) return;
    const message = String(now.message || '').replace(/\s+/g, ' ').trim();
    await sendToNames([canonicalMemberName(now.name)], 'Your feedback was marked done',
      () => '"' + (message.length > 80 ? message.slice(0, 77) + '…' : message) + '" Thank you for sending it.');
  });

/* ---- 5. per-member .ics calendar feed ----
   Served through a hosting rewrite as /ics/<member name>. Subscribe once in
   Apple/Google Calendar and duty changes flow in automatically (calendars
   re-fetch every few hours). Note: schedule data is already world-readable
   via the open Firestore rules, so this endpoint exposes nothing new. */
exports.ics = onRequest({ region: REGION }, async (req, res) => {
  const member = decodeURIComponent(req.path.replace(/^\/(ics\/)?/, '')).replace(/[\r\n]/g, '').trim();
  if (!member) {
    res.status(400).type('text/plain').send('Usage: /ics/<member name>, e.g. /ics/B.%20Anthony');
    return;
  }
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [schedSnap, mapSnap] = await Promise.all([
    db.collection('schedule').where('date', '>=', since).get(),
    db.collection('app').doc('nameMap').get()
  ]);
  const services = schedSnap.docs.map(d => d.data() || {});
  const nameMap = (mapSnap.exists && mapSnap.data().map) || {};
  const body = icsLib.buildIcsForMember(services, member, nameMap);
  res.set('Cache-Control', 'public, max-age=300');
  res.type('text/calendar; charset=utf-8').send(body);
});

/* ---- 6. read-only public schedule projection ----
   LV Zion's temporary public release fetches this server-to-server. It cannot
   read app settings, members, requests, tokens, or any other Firestore data. */
exports.publicSchedule = onRequest({ region: REGION }, async (_req, res) => {
  const today = pacificDate();
  const snapshot = await db.collection('schedule')
    .where('date', '>=', today)
    .orderBy('date')
    .limit(260)
    .get();
  const services = snapshot.docs
    .map(document => publicScheduleService(document.data()))
    .filter(Boolean);
  res.set('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.set('X-Content-Type-Options', 'nosniff');
  res.json({ version: 1, generatedAt: new Date().toISOString(), services });
});


/* ---- 7. Google Sheet import ----
   Other coordinators keep the schedule in a Google Sheet; the app only reads
   it. Every 2 hours (and when an administrator taps Import now in Manage,
   Data) the published sheet is merged into the schedule: only the duties the
   sheet lists are changed, anything added in the app stays. New names join
   the member list and their department's name list. The Google Sheet import
   switch in Manage, Features turns the automatic import off. */
async function importSheet() {
  const settings = await loadSettings();
  // Old spellings are mapped to the current ones first, so the sheet cannot
  // bring back a name the app has already cleaned up.
  const nameMapSnap = await db.collection('app').doc('nameMap').get();
  const nameMap = (nameMapSnap.exists && nameMapSnap.data().map) || {};
  const sheets = gridSheets(settings);
  let parsed;
  if (sheets) {
    // The grid itself: edits the app makes through the API never reach Raw Data.
    parsed = await sheetSync.readServices(sheets, nameMap);
  } else {
    const response = await fetch(settings.sheetUrl || sheetLib.DEFAULT_SHEET_URL, { redirect: 'follow' });
    if (!response.ok) throw new HttpsError('unavailable', 'The Google Sheet could not be read (' + response.status + ').');
    parsed = sheetLib.sheetRowsToServices(sheetLib.parseCSV(await response.text()), new Date());
    parsed.services.forEach(service => {
      const assignments = service.assignments || {};
      Object.keys(assignments).forEach(duty => { assignments[duty] = icsLib.canonName(assignments[duty], nameMap); });
    });
  }
  if (!parsed.services.length) {
    throw new HttpsError('failed-precondition', 'The sheet had no services in it, so nothing was changed.');
  }
  const sheetMembers = Array.from(new Set(parsed.members.map(name => icsLib.canonName(name, nameMap))));

  const [existingSnap, membersSnap, departmentsSnap] = await Promise.all([
    db.collection('schedule').get(),
    db.collection('app').doc('members').get(),
    db.collection('app').doc('departments').get()
  ]);
  const existing = {};
  existingSnap.forEach(document => { existing[document.id] = document.data() || {}; });
  const plan = sheetLib.planMerge(parsed.services, existing);
  const members = (membersSnap.exists && membersSnap.data().list) || [];
  const newMembers = sheetMembers.filter(name => name && !members.includes(name));
  const rosters = Object.assign({}, departmentsSnap.exists ? departmentsSnap.data().map : {});
  let rostersChanged = false;
  parsed.services.forEach(service => Object.entries(service.assignments || {}).forEach(([duty, name]) => {
    const department = permissions.departmentForDuty(duty);
    if (!name || !department) return;
    const roster = rosters[department] || (rosters[department] = []);
    if (!roster.includes(name)) { rosters[department] = roster.concat(name).sort(); rostersChanged = true; }
  }));

  if (plan.creates.length || plan.updates.length || newMembers.length || rostersChanged) {
    // BulkWriter splits a large import into batches under Firestore's limit.
    const writer = db.bulkWriter();
    const sheetSyncedAt = Date.now(); // these changes came from the Sheet, so none is written back
    plan.creates.forEach(item => writer.set(db.collection('schedule').doc(item.id), Object.assign({}, item.svc, { sheetSyncedAt })));
    plan.updates.forEach(item => writer.set(db.collection('schedule').doc(item.id), Object.assign({}, item.patch, { sheetSyncedAt }), { merge: true }));
    if (newMembers.length) writer.set(db.collection('app').doc('members'), { list: members.concat(newMembers).sort() });
    if (rostersChanged) writer.set(db.collection('app').doc('departments'), { map: rosters }, { merge: true });
    await writer.close();
  }
  const result = { added: plan.creates.length, updated: plan.updates.length, newMembers: newMembers.length, warnings: parsed.warnings.slice(0, 20) };
  logger.info('importSheet: done', result);
  return result;
}

exports.scheduledSheetSync = onSchedule(
  { schedule: 'every 2 hours', timeZone: TZ, region: REGION },
  async () => {
    if (!switchOn(await loadSettings(), 'sheetSync')) return;
    try {
      await importSheet();
    } catch (error) {
      logger.error('scheduledSheetSync: import failed', { error: String(error && error.message || error) });
    }
  });

/* Manage, Data, Check the Sheet: reads the Sheet's Entry grid and compares
   it with the app, changing nothing. Administrators only. */
exports.checkSheet = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  if (!permissions.isAdmin(actor, await runtimePermissionConfig())) {
    throw new HttpsError('permission-denied', 'Only an administrator can check the Sheet.');
  }
  const settings = await loadSettings();
  if (!settings.sheetId) throw new HttpsError('failed-precondition', 'Paste the Sheet\'s link first.');
  const nameMapSnap = await db.collection('app').doc('nameMap').get();
  const nameMap = (nameMapSnap.exists && nameMapSnap.data().map) || {};
  let read;
  try {
    read = await sheetSync.readServices(createSheets(settings.sheetId), nameMap);
  } catch (error) {
    throw new HttpsError('failed-precondition', String(error.message || error));
  }
  const schedule = await db.collection('schedule').get();
  const app = new Map(schedule.docs.map(doc => [doc.id, doc.data() || {}]));
  const inSheet = new Set();
  const differences = [];
  read.services.forEach(service => {
    const id = sheetLib.svcId(service);
    inSheet.add(id);
    const mine = app.get(id);
    if (!mine) return;
    Object.entries(service.assignments).forEach(([duty, name]) => {
      const current = icsLib.canonName(String((mine.assignments || {})[duty] || ''), nameMap);
      if (current !== name) differences.push({ service: id, duty, sheet: name, app: current });
    });
  });
  const today = pacificDate();
  return {
    ok: true,
    account: await accountEmail(),
    tabs: read.tabs,
    services: read.services.length,
    notInApp: read.services.filter(service => !app.has(sheetLib.svcId(service))).length,
    notInSheet: Array.from(app.entries()).filter(([id, service]) => !inSheet.has(id) && String(service.date || '') >= today).length,
    differences: differences.slice(0, 25),
    differenceCount: differences.length,
    warnings: read.warnings.slice(0, 10)
  };
});

/* A planning year of regular services (service-year.js): each one missing
   from the app is added, and, when the app writes to the Sheet, a blank row
   goes into the Sheet too. Administrators are then reminded to add that
   year's feast services. */
async function addServiceYear(year) {
  const settings = await loadSettings();
  // New services start with each duty's default member on it (Opening Prayer).
  const defaults = {};
  Object.keys(permissions.DUTY_DEFAULTS).forEach(duty => { const name = permissions.dutyDefault(settings, duty); if (name) defaults[duty] = name; });
  const wanted = serviceYear(year).map(service => Object.assign(service, { assignments: Object.assign({}, defaults) }));
  const existing = await db.collection('schedule').where('date', '>=', wanted[0].date).get();
  const have = new Map(existing.docs.map(doc => [doc.id, doc.data() || {}]));
  const missing = wanted.filter(service => !have.has(service.id));
  // Every regular service gets a Sheet row, including ones the app already
  // has (with their duties); rows already in the grid are left alone.
  const sheets = gridSheets(settings);
  const sheetRows = sheets ? await sheetSync.addServices(sheets, wanted.map(service => have.has(service.id) ? Object.assign({}, have.get(service.id), { date: service.date, service: service.service }) : service)) : 0;
  if (missing.length) {
    const writer = db.bulkWriter();
    const sheetSyncedAt = Date.now();
    missing.forEach(({ id, ...service }) => writer.set(db.collection('schedule').doc(id), Object.assign(service, { sheetSyncedAt })));
    await writer.close();
  }
  await db.collection('app').doc('settings').set({ feastNotice: { year: year + 1, since: Date.now() } }, { merge: true });
  return { added: missing.length, sheetRows, from: wanted[0].date, to: wanted[wanted.length - 1].date };
}

exports.addServiceYear = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  if (!permissions.isAdmin(actor, await runtimePermissionConfig())) {
    throw new HttpsError('permission-denied', 'Only an administrator can add a year of services.');
  }
  const year = Number(request.data && request.data.year);
  if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new HttpsError('invalid-argument', 'Choose a year.');
  try {
    return Object.assign({ ok: true }, await addServiceYear(year));
  } catch (error) {
    throw new HttpsError('failed-precondition', String(error && error.message || error));
  }
});

/* Every November 1: December through the next December. */
exports.yearlyServices = onSchedule(
  { schedule: '0 6 1 11 *', timeZone: TZ, region: REGION },
  async () => {
    try {
      logger.info('yearlyServices: done', await addServiceYear(Number(pacificDate().slice(0, 4))));
    } catch (error) {
      logger.error('yearlyServices: failed', { error: String(error && error.message || error) });
    }
  });

/* Every night: everyone who has served in a department's duties gets a
   profile there (inactive when they have not served there in 35 days), so
   the planner can offer them. Profiles that already exist are left alone. */
exports.servingMembers = onSchedule(
  { schedule: '30 3 * * *', timeZone: TZ, region: REGION },
  async () => {
    try {
      const result = await addServingMembers(db, { today: pacificDate(), canonicalName: canonicalMemberName, logger });
      logger.info('servingMembers: done', { added: result.added.length, widened: result.widened.length, unmatched: result.unmatched });
    } catch (error) {
      logger.error('servingMembers: failed', { error: String(error && error.message || error) });
    }
  });

/* Manage, Data, Fix a member's name. Administrators only. */
exports.renameMember = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  if (!permissions.isAdmin(actor, await runtimePermissionConfig())) {
    throw new HttpsError('permission-denied', 'Only an administrator can fix a name.');
  }
  const data = request.data || {};
  try {
    const result = await renameMemberEverywhere(db, {
      from: data.from, to: data.to,
      newAccount: async name => Object.assign(memberRoleRecord(name), {
        pinHash: await hashPin(memberRoleRecord(name).mustChangePin ? DEFAULT_PIN : ORDINARY_DEFAULT_PIN), active: true, roleVersion: 1
      })
    });
    logger.info('renameMember', result);
    return Object.assign({ ok: true }, result);
  } catch (error) {
    if (error && ['invalid-argument', 'not-found', 'already-exists'].includes(error.code)) throw new HttpsError(error.code, error.message);
    throw error;
  }
});

/* Manage, Worship: the default for Opening Prayer. The Worship leaders and
   administrators (duty-defaults.js). */
exports.setDutyDefault = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  try {
    const result = await setDutyDefault({ db, actor, config: await runtimePermissionConfig(), data: request.data || {} });
    logger.info('setDutyDefault', { duty: result.duty, set: !!result.memberName });
    return result;
  } catch (error) {
    if (error && ['invalid-argument', 'permission-denied', 'failed-precondition'].includes(error.code)) throw new HttpsError(error.code, error.message);
    throw error;
  }
});

/* Manage, Data, Import now. Administrators only. */
exports.syncSheetNow = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  if (!permissions.isAdmin(actor, await runtimePermissionConfig())) {
    throw new HttpsError('permission-denied', 'Only an administrator can import the sheet.');
  }
  return Object.assign({ ok: true }, await importSheet());
});
