'use strict';

const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const sheetLib = require('./sheet-lib');
const icsLib = require('./ics-lib');
const { publicScheduleService } = require('./public-schedule');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const { TIME_ZONE: TZ, pacificDate } = require('./time');
const {
  DEFAULT_PIN,
  ORDINARY_DEFAULT_PIN,
  hashPin,
  createMemberAuthCallables
} = require('./member-auth');
const permissions = require('./permissions');
const { createDepartmentHandlers } = require('./department-handlers');
const { createWorkflowHandlers } = require('./workflows');
const { createMembershipHandlers } = require('./membership');
const { createSheets, accountEmail } = require('./sheets');
const sheetSync = require('./sheet-sync');
const { serviceYear } = require('./service-year');
const { canonicalName, usableMemberName } = require('./names');
const { addServingMembers } = require('./serving-members');
const { setDutyDefault } = require('./duty-defaults');
const { renameMember: renameMemberEverywhere } = require('./rename-member');
const appDocs = require('./app-docs');
const { detailsFor } = require('./refusals');
const { createNotifier } = require('./notify');
const { reconcileScheduleAssignmentProjection } = require('./schedule-projection');

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

const notifier = createNotifier({ db, messaging: getMessaging(), logger });
const loadNameMap = () => appDocs.loadNameMap(db);
const runtimePermissionConfig = () => appDocs.runtimePermissionConfig(db);

/* What the leader settings (app/leaderConfig, see runtimePermissionConfig)
   give a member who has no roles stored yet: their roles, the departments
   they lead, and whether they must choose their own PIN. */
function memberRoleRecord(memberName, config) {
  const actor = { name: memberName };
  const admin = permissions.isAdmin(actor, config);
  const globalLeaderManager = permissions.isGlobalManager(actor, config);
  const departments = permissions.departmentsForLeader(actor, config);
  const departmentLeader = departments.length > 0 && !admin;
  const songEditor = permissions.canEditSongs(actor, {}, config);
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

/* The departments a member belongs to: the name lists in app/departments,
   plus any department where they have an active profile (members added in
   Manage by name search or invite link). Only the PIN reset check uses this.
   It is never stored or put into a sign-in token, where `departments` means
   the departments someone leads. */
async function departmentsForMember(name, nameMap) {
  const found = new Set();
  const listSnap = await db.collection('app').doc('departments').get().catch(() => null);
  const lists = listSnap && listSnap.exists ? (listSnap.data().map || {}) : {};
  Object.entries(lists).forEach(([department, names]) => {
    if (Array.isArray(names) && names.some(item => canonicalName(item, nameMap) === name)) found.add(department);
  });
  await Promise.all(permissions.DEPARTMENTS.map(async department => {
    const profiles = await db.collection('departments').doc(department).collection('members')
      .where('memberName', '==', name).limit(1).get().catch(() => null);
    if (profiles && !profiles.empty && (profiles.docs[0].data() || {}).status !== 'inactive') found.add(department);
  }));
  return Array.from(found);
}

/* An account as sign-in sees it. The roles and led departments stored on an
   account are its own, even when empty: removing someone's last role in
   Manage, Leaders stores []. Only an account that has never had them written
   gets them from the leader settings, and membership never counts as
   leading. */
async function decorateMember(record, context) {
  if (!record || typeof record !== 'object') return null;
  const next = Object.assign({}, record);
  const name = canonicalName(next.name || next.memberName || next.id || next.memberId, context.nameMap);
  if (!name) return null;
  next.id = String(next.id || next.memberId || name);
  next.memberId = String(next.memberId || next.id);
  next.name = name;
  next.memberName = name;
  if (!Array.isArray(next.roles) || !Array.isArray(next.departments) || next.mustChangePin === undefined) {
    const defaults = memberRoleRecord(name, await context.config());
    if (!Array.isArray(next.roles)) {
      next.roles = defaults.roles;
      if (!next.role) next.role = defaults.role;
      if (next.globalLeaderManager === undefined) next.globalLeaderManager = defaults.globalLeaderManager;
    }
    if (!Array.isArray(next.departments)) next.departments = defaults.departments;
    if (next.mustChangePin === undefined) next.mustChangePin = defaults.mustChangePin;
  }
  return next;
}

const LOCK_AFTER_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function createFirestoreMemberStore() {
  const accounts = db.collection('accounts');

  /* What one lookup reads: the name map, and the leader settings only when
     an account needs them. */
  function lookup(nameMap) {
    let config = null;
    return { nameMap, config: () => config || (config = runtimePermissionConfig()) };
  }

  async function accountById(id) {
    const nameMap = await loadNameMap();
    const requested = canonicalName(id, nameMap);
    if (!usableMemberName(requested)) return null;
    const context = lookup(nameMap);
    const snapshot = await accounts.doc(requested).get();
    if (snapshot.exists) return decorateMember(Object.assign({ id: snapshot.id }, snapshot.data()), context);
    const query = await accounts.where('memberId', '==', requested).limit(1).get();
    if (!query.empty) {
      const document = query.docs[0];
      return decorateMember(Object.assign({ id: document.id }, document.data()), context);
    }
    if (!(await appDocs.loadMemberNames(db, nameMap)).includes(requested)) return null;
    // The first sign-in of someone on the member list makes their account,
    // with the shared starting PIN (0000 for leaders, who must change it).
    const defaults = memberRoleRecord(requested, await context.config());
    defaults.pinHash = await hashPin(defaults.mustChangePin ? DEFAULT_PIN : ORDINARY_DEFAULT_PIN);
    defaults.active = true;
    defaults.roleVersion = 1;
    try {
      await accounts.doc(requested).create(defaults);
    } catch (error) {
      if (!alreadyExists(error)) throw error;
      const made = await accounts.doc(requested).get();
      return decorateMember(Object.assign({ id: made.id }, made.data()), context);
    }
    return defaults;
  }

  async function findByName(name) {
    const direct = await accountById(name);
    if (direct) return direct;
    const nameMap = await loadNameMap();
    const requested = canonicalName(name, nameMap);
    if (!requested) return null;
    const query = await accounts.where('name', '==', requested).limit(1).get();
    if (query.empty) return null;
    const document = query.docs[0];
    return decorateMember(Object.assign({ id: document.id }, document.data()), lookup(nameMap));
  }

  return {
    getById: accountById,
    findByName,
    /* Writes only what a PIN change or reset sets. Roles, departments and
       names are never written back from a sign-in. */
    async update(id, patch) {
      const memberId = String(id == null ? '' : id).trim();
      if (!memberId) throw new Error('Member id is required.');
      await accounts.doc(memberId).set(Object.assign({}, patch), { merge: true });
    },
    /* One sign-in attempt, counted before the PIN is checked and in one
       transaction, so attempts made at the same moment cannot all slip past
       the limit. The fifth in a row locks the account for 15 minutes; a
       correct PIN clears the count (clearFailedAttempts). */
    async beginAttempt(id) {
      const reference = accounts.doc(String(id));
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const data = snapshot.exists ? snapshot.data() || {} : {};
        const now = Date.now();
        if (Number(data.loginLockedUntil || 0) > now) {
          throw Object.assign(new Error('Too many attempts. Try again later.'), { code: 'resource-exhausted', details: { reason: 'locked' } });
        }
        const attempts = Number(data.failedLoginAttempts || 0) + 1;
        transaction.set(reference, {
          failedLoginAttempts: attempts,
          loginLockedUntil: attempts >= LOCK_AFTER_ATTEMPTS ? now + LOCK_MS : 0
        }, { merge: true });
      });
    },
    async clearFailedAttempts(id) {
      await accounts.doc(String(id)).set({ failedLoginAttempts: 0, loginLockedUntil: 0 }, { merge: true });
    }
  };
}

function alreadyExists(error) {
  return !!error && (error.code === 6 || error.code === 'already-exists' || /ALREADY_EXISTS/.test(String(error.message)));
}

function refusal(code, reason, message) {
  return Object.assign(new Error(message), { code, details: { reason } });
}

/* Who may reset whose PIN. An administrator: anyone's. A leader manager or a
   department leader: only someone who is not an administrator, leader
   manager, department leader or song editor, and a department leader only
   in a department they lead. */
function memberPermissionAdapter() {
  return {
    async assertActorCanAct({ actor, action, target }) {
      const identity = Object.assign({}, actor && actor.token, { uid: actor && actor.uid });
      const config = await runtimePermissionConfig();
      if (action !== 'member.pin.reset') {
        if (permissions.canManageLeaders(identity, config)) return true;
        throw refusal('permission-denied', 'not-allowed', 'You are not allowed to perform this action.');
      }
      if (permissions.isAdmin(identity, config)) return true;
      const nameMap = await loadNameMap();
      const targetName = canonicalName(target && (target.name || target.memberName || target.id), nameMap);
      const targetIdentity = { name: targetName };
      const privilegedTarget = Boolean(target && (target.privileged || target.songEditor)) ||
        permissions.isAdmin(targetIdentity, config) ||
        permissions.isGlobalManager(targetIdentity, config) ||
        permissions.departmentsForLeader(targetIdentity, config).length > 0 ||
        permissions.canEditSongs(targetIdentity, {}, config);
      if (privilegedTarget) {
        throw refusal('permission-denied', 'privileged-target', 'Only an administrator can reset the PIN of an administrator, a leader or a song editor.');
      }
      if (permissions.isGlobalManager(identity, config)) return true;
      const memberships = await departmentsForMember(targetName, nameMap);
      if (!permissions.canResetPin(identity, { name: targetName, departments: memberships }, config)) {
        throw refusal('permission-denied', 'cross-department', 'Only a leader of one of their departments or an administrator can reset this PIN.');
      }
      return true;
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
      throw new HttpsError(code, message, detailsFor(error, code));
    }
  });
}

exports.verifyMemberPin = exposeMemberAuthCallable(memberAuthCallables.verifyMemberPin);

/* Changing one's own PIN needs a session that is still current (not ended by
   a reset or a role change), but not a changed PIN: this is how one is set. */
exports.changeMemberPin = exposeMemberAuthCallable(async request => {
  await readCurrentAccount(request);
  return memberAuthCallables.changeMemberPin(request);
});

/* A leader or an administrator resets someone's PIN to 0000. Their own
   account must be current with its PIN changed, and every reset is recorded
   in audit (who, whom, when), as overrides and role changes are. */
exports.resetMemberPin = exposeMemberAuthCallable(async request => {
  const actor = await callableActor(request);
  const result = await memberAuthCallables.resetMemberPin({ data: request.data, auth: actor });
  try {
    await db.collection('audit').add({
      action: 'member-pin-reset', actor: actor.memberName || actor.uid, actorUid: actor.uid,
      target: result.memberId, targetMemberId: result.memberId, timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Reset audit record failed', { error: String(error && error.message || error) });
  }
  return result;
});

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
      if (code === 'internal') logger.error('Department callable failed', { error: String(error && error.message || error) });
      const message = code === 'internal'
        ? 'The department authorization service is unavailable.'
        : String(error.message || 'The requested department action failed.');
      throw new HttpsError(code, message, detailsFor(error, code));
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
    await notifier.alertPlanned(result.saved);
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
  if (!request.auth) throw new HttpsError('unauthenticated', 'A verified member session is required.', { reason: 'sign-in-required' });
  const token = request.auth.token || {};
  const memberId = String(token.memberId || '').trim();
  if (!memberId) throw new HttpsError('permission-denied', 'The signed-in member account is missing.', { reason: 'session-ended' });
  const snapshot = await db.collection('accounts').doc(memberId).get();
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'The signed-in member account is missing.', { reason: 'session-ended' });
  const account = Object.assign({ id: snapshot.id }, snapshot.data() || {});
  const expectedUid = String(account.authUid || `member:${memberId}`);
  if (expectedUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'The signed-in member account is invalid.', { reason: 'session-ended' });
  }
  if (!Number.isSafeInteger(token.roleVersion)
      || !Number.isSafeInteger(account.roleVersion)
      || token.roleVersion !== account.roleVersion) {
    throw new HttpsError('permission-denied', 'The member role has changed. Sign in again.', { reason: 'session-ended' });
  }
  if (account.active === false) {
    throw new HttpsError('permission-denied', 'The member account is inactive.', { reason: 'account-inactive' });
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
    throw new HttpsError('failed-precondition', 'Change your PIN before using privileged actions.', { reason: 'pin-change-required' });
  }
  return Object.assign({
    uid: request.auth.uid,
    token,
    currentAccount: current.account
  }, token);
}

exports.updateRoleConfiguration = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  const data = request.data || {};
  const roleType = data.roleType === 'songEditor' ? 'songEditor' : 'departmentLeader';
  const department = permissions.DEPARTMENTS.includes(String(data.department || '').trim()) ? String(data.department).trim() : '';
  const nameMap = await loadNameMap();
  const memberName = canonicalName(data.memberName, nameMap);
  const enabled = data.enabled === true;
  const current = await runtimePermissionConfig();
  if (!usableMemberName(memberName) || (roleType === 'departmentLeader' && !department)) {
    throw new HttpsError('invalid-argument', 'A valid role target is required.', { reason: 'invalid-input' });
  }
  if (!permissions.canManageLeaders(actor, current)) {
    throw new HttpsError('permission-denied', 'Only global leader managers can change role assignments.', { reason: 'not-allowed' });
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
    : list.filter(name => canonicalName(name, nameMap) !== memberName);
  if (roleType === 'songEditor') next.songEditors = updated;
  else next.departmentLeaders[department] = updated;
  const actorName = canonicalName(actor.memberName || actor.name || actor.uid, nameMap);
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

const loadSettings = () => appDocs.loadSettings(db);
const switchOn = appDocs.switchOn;

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

/* ---- 1. after every schedule write: the assignment records, the Sheet's
   grid and new-duty alerts (switch: notifications). Each runs on its own, so
   one that fails does not stop the others. ---- */
exports.onScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION },
  async (event) => {
    const existed = !!(event.data && event.data.before && event.data.before.exists);
    const before = existed ? event.data.before.data() || {} : {};
    const afterSnapshot = event.data && event.data.after;
    const after = afterSnapshot && afterSnapshot.exists ? afterSnapshot.data() || {} : null;
    const steps = [
      ['projection', () => reconcileScheduleAssignmentProjection({ db, logger }, event.params.id, before, after || { ...before, assignments: {} })],
      ['sheet', () => writeBack(event, before, after)],
      ['alerts', () => notifier.alertScheduleWrite(before, after, existed)]
    ];
    for (const [step, run] of steps) {
      try {
        await run();
      } catch (error) {
        logger.error('onScheduleWrite: ' + step + ' failed', { service: event.params.id, error: String(error && error.message || error) });
      }
    }
  });

/* ---- 2. day-before reminders (switch: reminders) ---- */
exports.dutyReminders = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TZ, region: REGION },
  async () => {
    await notifier.sendReminders();
  });

/* ---- 3. change request sent: tell that department's leaders and the
   scheduler (Manage, Features), never the member who asked ---- */
exports.onRequestCreated = onDocumentCreated(
  { document: 'requests/{id}', region: REGION },
  async event => {
    const request = event.data && event.data.exists ? event.data.data() || {} : null;
    if (request) await notifier.alertRequestCreated(event.params.id, request);
  });

/* ---- 4. change request answered: tell the member ---- */
exports.onRequestResolved = onDocumentUpdated(
  { document: 'requests/{id}', region: REGION },
  async event => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    await notifier.alertRequestResolved(event.params.id, before.data() || {}, after.data() || {});
  });

/* ---- 4b. feedback marked done: tell the member who sent it ---- */
exports.onFeedbackDone = onDocumentUpdated(
  { document: 'feedback/{id}', region: REGION },
  async event => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    await notifier.alertFeedbackDone(event.params.id, before.data() || {}, after.data() || {});
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
      const nameMap = await loadNameMap();
      const result = await addServingMembers(db, { today: pacificDate(), canonicalName: name => canonicalName(name, nameMap), logger });
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
      from: data.from, to: data.to, auth: getAuth(),
      newAccount: async name => {
        const record = memberRoleRecord(name, await runtimePermissionConfig());
        return Object.assign(record, { pinHash: await hashPin(record.mustChangePin ? DEFAULT_PIN : ORDINARY_DEFAULT_PIN), active: true, roleVersion: 1 });
      }
    });
    logger.info('renameMember', result);
    return Object.assign({ ok: true }, result);
  } catch (error) {
    if (error && ['invalid-argument', 'not-found'].includes(error.code)) {
      throw new HttpsError(error.code, error.message, { reason: error.code === 'not-found' ? 'not-on-list' : 'invalid-input' });
    }
    // Every step can run again, so the same fix finishes the job.
    logger.error('renameMember failed', { error: String(error && error.message || error) });
    throw new HttpsError('aborted', 'The name was only partly fixed. Fix the same name again to finish.', { reason: 'rename-incomplete' });
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
