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
const {
  DEFAULT_PIN,
  ORDINARY_DEFAULT_PIN,
  hashPin,
  createMemberAuthCallables
} = require('./member-auth');
const permissions = require('./permissions');
const { createDepartmentHandlers } = require('./department-handlers');

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
const TZ = 'America/Los_Angeles';
const PERMISSION_CONFIG = permissions.DEFAULT_PERMISSION_CONFIG;
const departmentHandlers = createDepartmentHandlers({
  db,
  now: () => Date.now(),
  logger
});

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

function namesFromDepartmentDocument(data) {
  const result = {};
  if (!data || typeof data !== 'object') return result;
  Object.keys(data).forEach(department => {
    const value = data[department];
    const names = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? value.members || value.list || value.names || []
        : [];
    if (Array.isArray(names)) {
      result[department] = names.map(canonicalMemberName).filter(Boolean);
    }
  });
  return result;
}

async function departmentsForMember(name) {
  try {
    const snapshot = await db.collection('app').doc('departments').get();
    const departments = namesFromDepartmentDocument(snapshot.exists ? snapshot.data() : null);
    return Object.keys(departments).filter(department => departments[department].some(item => item === name));
  } catch (_error) {
    return [];
  }
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
      throw new HttpsError(code, message);
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
exports.overrideDepartmentAssignment = exposeDepartmentCallable(
  departmentHandlers.overrideDepartmentAssignment
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

exports.updateDepartmentMembership = onCall({ region: REGION }, async request => {
  const actor = await callableActor(request);
  const data = request.data || {};
  const department = String(data.department || '').trim();
  const memberName = canonicalMemberName(data.memberName);
  const status = data.status === 'archived' ? 'archived' : 'active';
  if (!department || !memberName) {
    throw new HttpsError('invalid-argument', 'Department and member name are required.');
  }
  const config = await runtimePermissionConfig();
  if (!permissions.canManageDepartmentMember(actor, department, { name: memberName }, config)) {
    throw new HttpsError('permission-denied', 'You cannot manage this department membership.');
  }
  const membershipId = encodeURIComponent(department) + '__' + encodeURIComponent(memberName);
  const actorName = canonicalMemberName(actor.memberName || actor.name || actor.uid);
  await db.runTransaction(async transaction => {
    const departmentsRef = db.collection('app').doc('departments');
    const membersRef = db.collection('app').doc('members');
    const membershipRef = db.collection('memberships').doc(membershipId);
    const [departmentsSnap, membersSnap] = await Promise.all([
      transaction.get(departmentsRef), transaction.get(membersRef)
    ]);
    const map = Object.assign({}, departmentsSnap.exists ? departmentsSnap.data().map : {});
    const roster = Array.isArray(map[department]) ? map[department].map(canonicalMemberName) : [];
    map[department] = status === 'active'
      ? Array.from(new Set(roster.concat(memberName))).sort()
      : roster.filter(name => name !== memberName);
    const members = listFromMemberDocument(membersSnap.exists ? membersSnap.data() : null)
      .map(canonicalMemberName);
    transaction.set(departmentsRef, { map }, { merge: true });
    if (status === 'active' && !members.includes(memberName)) {
      transaction.set(membersRef, { list: members.concat(memberName).sort() }, { merge: true });
    }
    transaction.set(membershipRef, {
      department, memberName, memberId: memberName, status,
      updatedAt: Date.now(), updatedByUid: request.auth.uid, updatedByName: actorName
    }, { merge: true });
    transaction.set(db.collection('audit').doc(), {
      actor: actorName, actorUid: request.auth.uid,
      action: status === 'active' ? 'department-member-activated' : 'department-member-archived',
      target: memberName, department, timestamp: Date.now()
    });
  });
  return { ok: true, department, memberName, status };
});

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

function dateInTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

/* ---- body formatting (kept close to the app's dutyLabel) ---- */
function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });
}
function fmtTime(t) {
  if (!t) return '';
  const [hs, m] = t.split(':');
  let h = parseInt(hs, 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}
function bodyFor(duty, svc) {
  return duty + ' - ' + (svc.worship || '') + ' ' + svc.service + ', ' +
    fmtDate(svc.date) + ' at ' + fmtTime(svc.time);
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

/* ---- 1. new-duty alerts ---- */
exports.onScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return; // deleted - nothing to alert
    // Brand-new service doc (initial seed, bulk import, or a fresh sheet-created
    // service): every assignment would read as "new", fanning a mass push out to
    // everyone at once. Skip - members still get the in-app badge and the
    // day-before reminder. Only alert on edits to an existing service.
    if (!(event.data.before && event.data.before.exists)) return;
    const svc = after.data() || {};
    const before = event.data.before.data() || {};
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
    await sendToNames(names, 'New duty assigned to you',
      (name) => bodyFor(perName[name], svc));
  });

/* ---- 2. day-before reminders ---- */
exports.dutyReminders = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TZ, region: REGION },
  async () => {
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
      const when = laStartMs(svc.date, svc.time || '12:00');
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

/* Compute a service's start time as epoch ms, interpreting date+time as
   America/Los_Angeles wall-clock. Derives LA's UTC offset for that instant
   via Intl so DST is handled without a fixed offset. */
function laStartMs(dateIso, time) {
  const [y, mo, da] = dateIso.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUTC = Date.UTC(y, mo - 1, da, h, mi, 0);
  // offset (ms) between the LA wall-clock and UTC at this instant
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  dtf.formatToParts(new Date(asUTC)).forEach(p => { parts[p.type] = p.value; });
  const asLA = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asLA - asUTC;
  return asUTC - offset;
}

/* ---- 3. schedule-change request created: notify the scheduler ---- */
exports.onRequestCreated = onDocumentCreated(
  { document: 'requests/{id}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap || !snap.exists) return;
    const req = snap.data() || {};

    const settingsSnap = await db.collection('app').doc('settings').get();
    const schedulerName = (settingsSnap.exists && settingsSnap.data().schedulerName) || '';
    if (!schedulerName) {
      logger.info('onRequestCreated: no schedulerName configured, skipping notify');
      return;
    }

    const body = req.name + ' requests a change: ' + req.duty + ' - ' +
      fmtDate(req.date) + ' ' + req.service +
      (req.note ? ' · "' + req.note + '"' : '');

    if (req.name === schedulerName) {
      logger.info('onRequestCreated: requester is the scheduler, skipping self-notify', { id: event.params.id });
      return;
    }

    await sendToNames([schedulerName], 'Schedule change requested', () => body);
  });

/* ---- 4. schedule-change request resolved: notify the requester ---- */
exports.onRequestResolved = onDocumentUpdated(
  { document: 'requests/{id}', region: REGION },
  async (event) => {
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    if (!before || !before.exists || !after || !after.exists) return;
    const beforeData = before.data() || {};
    const afterData = after.data() || {};
    if (!(beforeData.status === 'pending' && afterData.status !== beforeData.status)) return;

    const body = afterData.duty + ' - ' + fmtDate(afterData.date) + ' ' + afterData.service;
    await sendToNames([afterData.name], 'Schedule change ' + afterData.status, () => body);
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
  const today = dateInTimeZone(new Date());
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

/* ---- 7. scheduled Sheet -> Firestore sync ----
   The Google Sheet is the source of truth (other coordinators edit it); the
   app already pulls the published CSV, but only when someone opens it. This
   runs the same parse+merge server-side every 2 hours so Firestore (and
   therefore push reminders, the song app, and the .ics feeds) stays fresh
   even if nobody opens the app. Same merge policy as the app: only duties
   the sheet mentions are touched, in-app-only edits are preserved. */
exports.scheduledSheetSync = onSchedule(
  { schedule: 'every 2 hours', timeZone: TZ, region: REGION },
  async () => {
    const settingsSnap = await db.collection('app').doc('settings').get();
    const url = (settingsSnap.exists && settingsSnap.data().sheetUrl) || sheetLib.DEFAULT_SHEET_URL;

    let text;
    try {
      const resp = await fetch(url, { redirect: 'follow' });
      if (!resp.ok) {
        logger.error('scheduledSheetSync: sheet fetch failed', { status: resp.status });
        return;
      }
      text = await resp.text();
    } catch (e) {
      logger.error('scheduledSheetSync: sheet fetch threw', { error: String(e) });
      return;
    }
    const parsed = sheetLib.sheetRowsToServices(sheetLib.parseCSV(text), new Date());
    if (parsed.warnings.length) logger.warn('scheduledSheetSync: parse warnings', { warnings: parsed.warnings });
    if (!parsed.services.length) {
      logger.warn('scheduledSheetSync: sheet parsed to zero services - leaving Firestore untouched');
      return;
    }

    // Canonicalize sheet names before merging so the sync can't re-introduce
    // variant spellings the app has already unified (which would silently
    // misdirect push and .ics feeds keyed on the canonical name). Blank ''
    // clears (see sheet-lib) pass through unchanged.
    const nameMapSnap = await db.collection('app').doc('nameMap').get();
    const nameMap = (nameMapSnap.exists && nameMapSnap.data().map) || {};
    parsed.services.forEach(svc => {
      const a = svc.assignments || {};
      Object.keys(a).forEach(duty => { a[duty] = icsLib.canonName(a[duty], nameMap); });
    });
    parsed.members = Array.from(new Set(parsed.members.map(m => icsLib.canonName(m, nameMap)))).sort();

    const existingSnap = await db.collection('schedule').get();
    const existingById = {};
    existingSnap.forEach(d => { existingById[d.id] = d.data() || {}; });

    const plan = sheetLib.planMerge(parsed.services, existingById);

    // grow the members list with any new names from the sheet
    const membersSnap = await db.collection('app').doc('members').get();
    const members = (membersSnap.exists && membersSnap.data().list) || [];
    const newMembers = parsed.members.filter(m => m && members.indexOf(m) === -1);

    // Use a BulkWriter so a large import can't blow past Firestore's 500-op
    // single-batch cap (it auto-chunks and throttles under the hood).
    if (plan.creates.length || plan.updates.length || newMembers.length) {
      const writer = db.bulkWriter();
      plan.creates.forEach(c => writer.set(db.collection('schedule').doc(c.id), c.svc));
      plan.updates.forEach(u => writer.set(db.collection('schedule').doc(u.id), u.patch, { merge: true }));
      if (newMembers.length) {
        writer.set(db.collection('app').doc('members'), { list: members.concat(newMembers).sort() });
      }
      await writer.close();
    }
    logger.info('scheduledSheetSync: done', {
      added: plan.creates.length, updated: plan.updates.length, newMembers: newMembers.length
    });
  });
