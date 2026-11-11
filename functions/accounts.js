'use strict';

/* Sign-in, PINs and roles, on the accounts collection (accounts/{name}):
   the member store member-auth.js signs in against, who may reset whose PIN,
   and Manage, Leaders' role changes. The leader settings (app/leaderConfig)
   say who leads what; an account's stored roles are kept in step with them
   by updateRoleConfiguration. */
const crypto = require('node:crypto');
const permissions = require('./permissions.js');
const { DEFAULT_PIN, ORDINARY_DEFAULT_PIN, hashPin, createMemberAuthCallables } = require('./member-auth.js');
const { canonicalName, usableMemberName } = require('./names.js');
const appDocs = require('./app-docs.js');
const { refusal } = require('./refusals.js');
const { alreadyExists } = require('./util.js');

const PERMISSION_CONFIG = permissions.DEFAULT_PERMISSION_CONFIG;
const LOCK_AFTER_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const MAX_DEVICES = 8;

/* A device key is stored only as its SHA-256; '' for no usable key. */
function deviceId(key) {
  const text = typeof key === 'string' ? key : '';
  return /^[0-9a-f]{64}$/.test(text) ? crypto.createHash('sha256').update(text).digest('hex') : '';
}

/* What the leader settings give a member who has no roles stored yet: their
   roles, the departments they lead, and whether they must choose their own
   PIN. */
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

function createAccounts({ db, auth, logger, now = () => Date.now() }) {
  const loadNameMap = () => appDocs.loadNameMap(db);
  const runtimePermissionConfig = () => appDocs.runtimePermissionConfig(db);

  /* A starting account for `name`: roles from the leader settings, and the
     shared starting PIN (0000 for leaders, who must change it). */
  async function newAccount(name, config) {
    const record = memberRoleRecord(name, config || await runtimePermissionConfig());
    return Object.assign(record, {
      pinHash: await hashPin(record.mustChangePin ? DEFAULT_PIN : ORDINARY_DEFAULT_PIN), active: true, roleVersion: 1
    });
  }

  /* The departments a member belongs to: the name lists in app/departments,
     plus any department where they have an active profile (members added in
     Manage by name search or invite link). Only the PIN reset check uses
     this. It is never stored or put into a sign-in token, where
     `departments` means the departments someone leads. */
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
      // The first sign-in of someone on the member list makes their account.
      const defaults = await newAccount(requested, await context.config());
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
         correct PIN clears the count (signedIn).

         A device this member has signed in on before sends the key it was
         given then. Its attempts are counted on that device alone, and it is
         not held by the account's lock: someone guessing at a member's name
         from elsewhere can lock out other new devices, never the member's
         own phone. A key is only ever given after a correct PIN. */
      async beginAttempt(id, deviceKey) {
        const reference = accounts.doc(String(id));
        const device = deviceId(deviceKey);
        await db.runTransaction(async transaction => {
          const snapshot = await transaction.get(reference);
          const data = snapshot.exists ? snapshot.data() || {} : {};
          const at = now();
          const known = device && data.trustedDevices && data.trustedDevices[device];
          if (known) {
            if (Number(known.lockedUntil || 0) > at) throw refusal('resource-exhausted', 'locked', 'Too many attempts. Try again later.');
            const attempts = Number(known.attempts || 0) + 1;
            transaction.set(reference, { trustedDevices: { [device]: {
              attempts, lockedUntil: attempts >= LOCK_AFTER_ATTEMPTS ? at + LOCK_MS : 0
            } } }, { merge: true });
            return;
          }
          if (Number(data.loginLockedUntil || 0) > at) throw refusal('resource-exhausted', 'locked', 'Too many attempts. Try again later.');
          const attempts = Number(data.failedLoginAttempts || 0) + 1;
          transaction.set(reference, {
            failedLoginAttempts: attempts,
            loginLockedUntil: attempts >= LOCK_AFTER_ATTEMPTS ? at + LOCK_MS : 0
          }, { merge: true });
        });
      },
      async clearFailedAttempts(id) {
        await accounts.doc(String(id)).set({ failedLoginAttempts: 0, loginLockedUntil: 0 }, { merge: true });
      },
      /* After a correct PIN: the counts start again, and a device not known
         yet is given a key (returned once, only its hash is stored). The
         newest MAX_DEVICES are kept. A known device returns null. */
      async signedIn(id, deviceKey) {
        const reference = accounts.doc(String(id));
        const device = deviceId(deviceKey);
        return db.runTransaction(async transaction => {
          const snapshot = await transaction.get(reference);
          const data = snapshot.exists ? snapshot.data() || {} : {};
          const devices = Object.assign({}, data.trustedDevices);
          const at = now();
          let issued = null;
          if (device && devices[device]) {
            devices[device] = { at: Number(devices[device].at || at), attempts: 0, lockedUntil: 0 };
          } else {
            issued = crypto.randomBytes(32).toString('hex');
            devices[deviceId(issued)] = { at, attempts: 0, lockedUntil: 0 };
          }
          const kept = Object.keys(devices).sort((a, b) => Number(devices[b].at || 0) - Number(devices[a].at || 0)).slice(0, MAX_DEVICES);
          const trustedDevices = {};
          kept.forEach(key => { trustedDevices[key] = devices[key]; });
          // update(), not a merge: the map is replaced, so dropped devices go.
          const patch = { failedLoginAttempts: 0, loginLockedUntil: 0, trustedDevices };
          if (snapshot.exists) transaction.update(reference, patch);
          else transaction.set(reference, patch, { merge: true });
          return issued;
        });
      }
    };
  }

  /* Who may reset whose PIN. An administrator: anyone's. A leader manager or
     a department leader: only someone who is not an administrator, leader
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
        if (privilegedTarget) throw refusal('permission-denied', 'privileged-target');
        if (permissions.isGlobalManager(identity, config)) return true;
        const memberships = await departmentsForMember(targetName, nameMap);
        if (!permissions.canResetPin(identity, { name: targetName, departments: memberships }, config)) {
          throw refusal('permission-denied', 'cross-department', 'Only a leader of one of their departments or an administrator can reset this PIN.');
        }
        return true;
      }
    };
  }

  const memberAuth = createMemberAuthCallables({
    memberStore: createFirestoreMemberStore(),
    auth,
    permission: memberPermissionAdapter(),
    logger
  });

  /* A leader or an administrator resets someone's PIN to 0000 (request.auth
     is their verified, current account). Every reset is recorded in audit
     (who, whom, when), as overrides and role changes are. The member's
     phones get no alerts until they sign in again (each sign-in registers
     its phone again), so a lost phone stops getting them at once. */
  async function resetMemberPin(request) {
    const actor = request.auth;
    const result = await memberAuth.resetMemberPin({ data: request.data, auth: actor });
    try {
      const nameMap = await loadNameMap();
      const name = canonicalName(result.memberId, nameMap);
      const devices = await db.collection('tokens').get();
      await Promise.all(devices.docs.filter(document => canonicalName((document.data() || {}).name, nameMap) === name)
        .map(document => document.ref.delete()));
    } catch (error) {
      logger.error('Reset device cleanup failed', { error: String(error && error.message || error) });
    }
    try {
      await db.collection('audit').add({
        action: 'member-pin-reset', actor: actor.memberName || actor.uid, actorUid: actor.uid,
        target: result.memberId, targetMemberId: result.memberId, timestamp: now()
      });
    } catch (error) {
      logger.error('Reset audit record failed', { error: String(error && error.message || error) });
    }
    return result;
  }

  /* Manage, Leaders: make someone a department leader or song editor, or
     stop. The leader settings and the person's account change together; the
     account's new role version ends their sessions, so their next sign-in
     carries the change. Leader managers only; recorded in audit. */
  async function updateRoleConfiguration(request) {
    const actor = request.auth;
    const data = request.data || {};
    const roleType = data.roleType === 'songEditor' ? 'songEditor' : 'departmentLeader';
    const department = permissions.DEPARTMENTS.includes(String(data.department || '').trim()) ? String(data.department).trim() : '';
    const nameMap = await loadNameMap();
    const memberName = canonicalName(data.memberName, nameMap);
    const enabled = data.enabled === true;
    if (!usableMemberName(memberName) || (roleType === 'departmentLeader' && !department)) {
      throw refusal('invalid-argument', 'invalid-input', 'A valid role target is required.');
    }
    const actorName = canonicalName(actor.memberName || actor.name || actor.uid, nameMap);
    const configRef = db.collection('app').doc('leaderConfig');
    const accountRef = db.collection('accounts').doc(memberName);
    // Both starting PINs are hashed before the transaction (hashing is slow);
    // only an account that has none yet is given one.
    const startingPins = { leader: await hashPin(DEFAULT_PIN), member: await hashPin(ORDINARY_DEFAULT_PIN) };
    // The leader settings and the account are read and written in one
    // transaction, so two managers saving at the same moment both land.
    const { next, beforeData } = await db.runTransaction(async transaction => {
      const configSnapshot = await transaction.get(configRef);
      const beforeAccount = await transaction.get(accountRef);
      const current = configSnapshot.exists
        ? Object.assign({}, configSnapshot.data(), { admin: PERMISSION_CONFIG.admin, globalLeaderManager: PERMISSION_CONFIG.globalLeaderManager })
        : PERMISSION_CONFIG;
      if (!permissions.canManageLeaders(actor, current)) {
        throw refusal('permission-denied', 'not-allowed', 'Only global leader managers can change role assignments.');
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
      const memberActor = { name: memberName };
      const departments = permissions.departmentsForLeader(memberActor, next);
      const roles = [];
      if (permissions.isAdmin(memberActor, next)) roles.push('admin');
      if (permissions.isGlobalManager(memberActor, next)) roles.push('globalLeaderManager');
      if (departments.length) roles.push('departmentLeader');
      if (permissions.canEditSongs(memberActor, {}, next)) roles.push('songEditor');
      const beforeData = beforeAccount.exists ? beforeAccount.data() || {} : {};
      const wasPrivileged = Array.isArray(beforeData.roles) && beforeData.roles.some(name => name !== 'member');
      const nowPrivileged = roles.length > 0;
      const accountPatch = {
        roles, departments,
        role: roles[0] || 'member',
        globalLeaderManager: roles.includes('globalLeaderManager'),
        mustChangePin: !wasPrivileged && nowPrivileged ? true : Boolean(beforeData.mustChangePin),
        active: true,
        roleVersion: Number(beforeData.roleVersion || 1) + 1
      };
      if (!beforeData.pinHash) accountPatch.pinHash = nowPrivileged ? startingPins.leader : startingPins.member;
      transaction.set(configRef, next, { merge: false });
      transaction.set(accountRef, accountPatch, { merge: true });
      return { next, beforeData };
    });
    try { await auth.revokeRefreshTokens(String(beforeData.authUid || 'member:' + memberName)); } catch (_error) { /* next token still uses the new role version */ }
    await db.collection('audit').add({
      actor: actorName, actorUid: actor.uid,
      action: 'role-configuration-changed', target: memberName,
      roleType, department: roleType === 'departmentLeader' ? department : '',
      enabled, timestamp: now()
    });
    return { ok: true, config: next };
  }

  return Object.freeze({
    verifyMemberPin: memberAuth.verifyMemberPin,
    changeMemberPin: memberAuth.changeMemberPin,
    resetMemberPin,
    updateRoleConfiguration,
    newAccount
  });
}

module.exports = { createAccounts, memberRoleRecord };
