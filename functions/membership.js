'use strict';

/*
 * Callable handlers for registered department membership.
 *
 * The integration wrapper supplies the verified account on request.auth.
 * This module checks that account again for every write so a revoked account
 * cannot use a request that was authorized before the write began.
 */

const crypto = require('node:crypto');
const authz = require('./department-auth.js');
const { memberListNames } = require('./department-handlers.js');
const { refusal, DEFAULT_REASONS } = require('./refusals.js');
const permissions = require('./permissions.js');
const { isPlainObject } = require('./util.js');

const PAGE_SIZE = 10;
const INVITATION_DAYS = 7;
const TOKEN_BYTES = 32;

/* An error for the app, with details.reason (by default the one for its code). */
function errorWithCode(code, message, reason) {
  return refusal(code, reason || DEFAULT_REASONS[code] || 'server-error', message);
}

function normalizeText(value, path, max = 160) {
  if (typeof value !== 'string') throw errorWithCode('invalid-argument', `${path} must be a string.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) throw errorWithCode('invalid-argument', `${path} must not be empty.`);
  if (normalized.length > max) throw errorWithCode('invalid-argument', `${path} is too long.`);
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw errorWithCode('invalid-argument', `${path} contains a control character.`);
  }
  return normalized;
}

function departmentFrom(value) {
  const department = normalizeText(value, 'departmentId', 100);
  if (!permissions.DEPARTMENTS.includes(department)) throw errorWithCode('invalid-argument', 'That is not one of the departments.');
  return department;
}

// "Add all" searches once per missing name; the account list read for the
// first search serves the ones right after it.
const SEARCH_CACHE_MS = 60 * 1000;

function requestData(request) {
  const data = request && request.data == null ? {} : request && request.data;
  if (!isPlainObject(data)) throw errorWithCode('invalid-argument', 'Request data must be an object.');
  return data;
}

function assertKeys(data, allowed) {
  const unknown = Object.keys(data).find(key => !allowed.has(key));
  if (unknown) throw errorWithCode('invalid-argument', `Request field is not allowed: ${unknown}.`);
}

function verifiedActor(request) {
  const auth = request && request.auth;
  if (!auth || !auth.uid) {
    throw errorWithCode('unauthenticated', 'A verified member session is required.');
  }
  const account = auth.currentAccount;
  if (!isPlainObject(account)) {
    throw errorWithCode('permission-denied', 'The signed-in member account is missing.', 'session-ended');
  }
  if (auth.token && auth.token.mustChangePin === true) {
    throw errorWithCode('failed-precondition', 'Change your PIN before using department membership.', 'pin-change-required');
  }
  if (!authz.isCurrentRoleVersion(auth, account)) {
    throw errorWithCode('permission-denied', 'The member role has changed. Sign in again.', 'session-ended');
  }
  if (account.active === false) {
    throw errorWithCode('permission-denied', 'The member account is inactive.', 'account-inactive');
  }
  const actor = {
    ...auth,
    uid: String(auth.uid),
    token: auth.token || auth.claims || {}
  };
  if (!authz.isAuthenticated(actor)) {
    throw errorWithCode('failed-precondition', 'Change your PIN before using department membership.', 'pin-change-required');
  }
  return actor;
}

function accountDocumentId(actor) {
  const account = actor.currentAccount || {};
  const token = actor.token || {};
  const value = account.id || account.memberId || token.memberId;
  if (value == null || String(value).trim() === '') {
    throw errorWithCode('permission-denied', 'The signed-in member account is missing.', 'session-ended');
  }
  return String(value).trim();
}

function accountUid(data, documentId) {
  const explicit = data && (data.authUid || data.uid);
  if (explicit != null && String(explicit).trim()) return String(explicit).trim();
  const memberId = data && (data.memberId || data.id);
  if (memberId != null && String(memberId).trim()) {
    const value = String(memberId).trim();
    return value.startsWith('member:') ? value : `member:${value}`;
  }
  const fallback = String(documentId || '').trim();
  return fallback.startsWith('member:') || !fallback ? fallback : `member:${fallback}`;
}

function accountName(data, documentId) {
  const value = data && (data.memberName || data.name || data.member || data.displayName);
  return String(value == null ? documentId || '' : value).trim().replace(/\s+/g, ' ');
}

function accountIsCurrent(actor, snapshot) {
  if (!snapshot || !snapshot.exists) {
    throw errorWithCode('permission-denied', 'The signed-in member account is missing.', 'session-ended');
  }
  const data = snapshot.data() || {};
  if (accountUid(data, snapshot.id) !== actor.uid) {
    throw errorWithCode('permission-denied', 'The signed-in member account is invalid.', 'session-ended');
  }
  if (data.active === false) {
    throw errorWithCode('permission-denied', 'The member account is inactive.', 'account-inactive');
  }
  if (data.mustChangePin === true) {
    throw errorWithCode('failed-precondition', 'Change your PIN before using department membership.', 'pin-change-required');
  }
  if (!authz.isCurrentRoleVersion(actor, data)) {
    throw errorWithCode('permission-denied', 'The member role has changed. Sign in again.', 'session-ended');
  }
  return data;
}

function accountRef(db, actor) {
  return db.collection('accounts').doc(accountDocumentId(actor));
}

function assertManagement(actor, departmentId) {
  if (!authz.managesDepartment(actor, departmentId)) {
    throw errorWithCode('permission-denied', 'You cannot manage this department.', 'cross-department');
  }
}

function invitationToken(value) {
  const token = normalizeText(value, 'token', 200);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw errorWithCode('invalid-argument', 'token is invalid.', 'invite-invalid');
  }
  return token;
}

function digestToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function tokenText(value) {
  if (Buffer.isBuffer(value)) return value.toString('base64url');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64url');
  throw errorWithCode('internal', 'Invitation token generation is unavailable.');
}

function newToken(randomBytes) {
  const bytes = randomBytes(TOKEN_BYTES);
  if (bytes && typeof bytes.then === 'function') {
    throw errorWithCode('internal', 'Invitation token generation must be synchronous.');
  }
  if (!bytes || typeof bytes.length !== 'number' || bytes.length !== TOKEN_BYTES) {
    throw errorWithCode('internal', 'Invitation token generation returned an invalid value.');
  }
  return tokenText(bytes);
}

function invitationRef(db, token) {
  return db.collection('departmentInvitations').doc(digestToken(token));
}

function profileRef(db, departmentId, memberUid) {
  return db.collection('departments').doc(departmentId).collection('members').doc(memberUid);
}

function profileForAccount(departmentId, memberUid, name, actor, at) {
  const availability = authz.normalizeAvailability({});
  const profile = {
    uid: memberUid,
    memberUid,
    department: departmentId,
    departmentId,
    role: 'member',
    memberName: name,
    status: 'active',
    active: true,
    eligibleDuties: [],
    duties: [],
    schedulable: false,
    isSchedulable: false,
    availability,
    createdAt: at,
    createdBy: actor.uid,
    updatedAt: at,
    updatedByUid: actor.uid,
    updatedBy: actor.token.memberName || actor.token.member || actor.uid,
    revision: 1,
    attribution: {
      createdBy: actor.uid,
      createdAt: at,
      updatedBy: actor.token.memberName || actor.token.member || actor.uid,
      updatedAt: at
    }
  };
  if (!authz.profileForScheduling(profile)) {
    throw errorWithCode('internal', 'The department member profile is invalid.');
  }
  return profile;
}

function accountSearchRows(snapshot) {
  const rows = [];
  (snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : []).forEach(document => {
    const data = document.data() || {};
    if (data.active === false || data.renamedTo) return;
    const name = accountName(data, document.id);
    const memberUid = accountUid(data, document.id);
    if (!name || !memberUid) return;
    rows.push({ memberUid, memberName: name });
  });
  return rows;
}

function compareRows(left, right) {
  const names = left.memberName.toLocaleLowerCase().localeCompare(
    right.memberName.toLocaleLowerCase(), 'en', { sensitivity: 'base' }
  );
  return names || left.memberUid.localeCompare(right.memberUid);
}

function assertPage(value) {
  if (value == null) return 1;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw errorWithCode('invalid-argument', 'page must be a positive integer.');
  }
  return value;
}

function assertTransactionDb(db) {
  if (!db || typeof db.runTransaction !== 'function') {
    throw errorWithCode('internal', 'Atomic membership storage is unavailable.');
  }
}

function createMembershipHandlers({ db, now = () => Date.now(), randomBytes = crypto.randomBytes } = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('db is required.');
  }
  if (typeof now !== 'function' || typeof randomBytes !== 'function') {
    throw new TypeError('now and randomBytes must be functions.');
  }

  let cachedRows = null;
  let cachedAt = 0;
  async function accountRows() {
    const at = Number(now());
    if (cachedRows && at - cachedAt < SEARCH_CACHE_MS && at >= cachedAt) return cachedRows;
    const accounts = db.collection('accounts');
    const selected = typeof accounts.select === 'function'
      ? accounts.select('authUid', 'uid', 'memberUid', 'memberId', 'id', 'memberName', 'name', 'member', 'displayName', 'active', 'renamedTo')
      : accounts;
    cachedRows = accountSearchRows(await selected.get());
    cachedAt = at;
    return cachedRows;
  }

  async function searchDepartmentCandidates(request) {
    const actor = verifiedActor(request);
    const data = requestData(request);
    assertKeys(data, new Set(['departmentId', 'query', 'page']));
    const departmentId = departmentFrom(data.departmentId);
    const query = normalizeText(data.query, 'query', 160);
    if (query.length < 2) throw errorWithCode('invalid-argument', 'query must contain at least two characters.');
    const page = assertPage(data.page);
    assertManagement(actor, departmentId);
    const normalizedQuery = query.toLocaleLowerCase();
    const rows = (await accountRows()).slice();
    // Members who have never signed in have no account yet; they get the
    // uid their first sign-in will give them.
    const known = new Set(rows.flatMap(row => [row.memberUid, row.memberName]));
    (await memberListNames(db)).forEach(name => {
      if (!known.has(name) && !known.has('member:' + name)) rows.push({ memberUid: 'member:' + name, memberName: name });
    });
    const found = rows.filter(row => row.memberName.toLocaleLowerCase().includes(normalizedQuery)).sort(compareRows);
    const start = (page - 1) * PAGE_SIZE;
    return {
      ok: true,
      departmentId,
      members: found.slice(start, start + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total: found.length
    };
  }

  async function createDepartmentInvitation(request) {
    const actor = verifiedActor(request);
    const data = requestData(request);
    assertKeys(data, new Set(['departmentId']));
    const departmentId = departmentFrom(data.departmentId);
    assertManagement(actor, departmentId);
    assertTransactionDb(db);
    const token = newToken(randomBytes);
    const reference = invitationRef(db, token);
    const createdAt = Number(now());
    if (!Number.isFinite(createdAt)) throw errorWithCode('internal', 'The server clock is unavailable.');
    const expiresAt = createdAt + INVITATION_DAYS * 24 * 60 * 60 * 1000;
    await db.runTransaction(async transaction => {
      const accountSnapshot = await transaction.get(accountRef(db, actor));
      accountIsCurrent(actor, accountSnapshot);
      transaction.set(reference, {
        departmentId,
        createdByUid: actor.uid,
        createdAt,
        expiresAt,
        status: 'active'
      }, { merge: false });
    });
    return { ok: true, token, departmentId, expiresAt };
  }

  async function revokeDepartmentInvitation(request) {
    const actor = verifiedActor(request);
    const data = requestData(request);
    assertKeys(data, new Set(['token']));
    const token = invitationToken(data.token);
    assertTransactionDb(db);
    const reference = invitationRef(db, token);
    let revoked = false;
    await db.runTransaction(async transaction => {
      const invitationSnapshot = await transaction.get(reference);
      if (!invitationSnapshot.exists) throw errorWithCode('not-found', 'The invitation was not found.', 'invite-invalid');
      const invitation = invitationSnapshot.data() || {};
      const departmentId = departmentFrom(invitation.departmentId);
      const accountSnapshot = await transaction.get(accountRef(db, actor));
      accountIsCurrent(actor, accountSnapshot);
      assertManagement(actor, departmentId);
      if (invitation.status === 'revoked') {
        revoked = true;
        return;
      }
      if (invitation.status === 'accepted') return;
      if (invitation.status !== 'active') {
        throw errorWithCode('failed-precondition', 'The invitation cannot be revoked.', 'invite-invalid');
      }
      transaction.set(reference, {
        status: 'revoked',
        revokedAt: Number(now()),
        revokedByUid: actor.uid
      }, { merge: true });
      revoked = true;
    });
    return { ok: true, revoked };
  }

  async function acceptDepartmentInvitation(request) {
    const actor = verifiedActor(request);
    const data = requestData(request);
    assertKeys(data, new Set(['token']));
    const token = invitationToken(data.token);
    assertTransactionDb(db);
    const reference = invitationRef(db, token);
    let result;
    await db.runTransaction(async transaction => {
      const invitationSnapshot = await transaction.get(reference);
      if (!invitationSnapshot.exists) throw errorWithCode('failed-precondition', 'The invitation is invalid or expired.', 'invite-invalid');
      const invitation = invitationSnapshot.data() || {};
      const departmentId = departmentFrom(invitation.departmentId);
      const accountSnapshot = await transaction.get(accountRef(db, actor));
      const account = accountIsCurrent(actor, accountSnapshot);
      const memberUid = accountUid(account, accountSnapshot.id);
      if (memberUid !== actor.uid) {
        throw errorWithCode('permission-denied', 'The signed-in member account is invalid.', 'session-ended');
      }
      const profileReference = profileRef(db, departmentId, memberUid);
      const profileSnapshot = await transaction.get(profileReference);
      const at = Number(now());
      if (!Number.isFinite(at)) throw errorWithCode('internal', 'The server clock is unavailable.');
      // Someone already in the department does not use up the link, which
      // stays for the person it was meant for. An inactive member is told so
      // (inactive: true), since only a leader can make them active.
      if (profileSnapshot.exists) {
        const status = String((profileSnapshot.data() || {}).status || 'active');
        result = { ok: true, departmentId, memberUid, alreadyMember: true, inactive: status === 'inactive' };
        return;
      }
      if (invitation.status === 'accepted') {
        throw errorWithCode('already-exists', 'The invitation has already been accepted.', 'invite-used');
      }
      if (invitation.status !== 'active' || Number(invitation.expiresAt) <= at) {
        throw errorWithCode('failed-precondition', 'The invitation is invalid or expired.', 'invite-invalid');
      }
      transaction.set(profileReference, profileForAccount(
        departmentId,
        memberUid,
        accountName(account, accountSnapshot.id),
        actor,
        at
      ), { merge: false });
      transaction.set(reference, {
        status: 'accepted',
        acceptedAt: at,
        acceptedByUid: actor.uid,
        acceptedMemberUid: memberUid
      }, { merge: true });
      result = { ok: true, departmentId, memberUid, alreadyMember: false };
    });
    return result;
  }

  return Object.freeze({
    searchDepartmentCandidates,
    createDepartmentInvitation,
    revokeDepartmentInvitation,
    acceptDepartmentInvitation
  });
}

module.exports = { createMembershipHandlers };
