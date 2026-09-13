'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);
const pbkdf2Async = promisify(crypto.pbkdf2);

const DEFAULT_PIN = '0000';
const ORDINARY_DEFAULT_PIN = '2217';
const PIN_PATTERN = /^[0-9]{4,6}$/;
const HASH_PREFIX = 'pin';
const HASH_VERSION = 1;

const MIN_SALT_BYTES = 16;
const MAX_SALT_BYTES = 64;
const MIN_KEY_BYTES = 16;
const MAX_KEY_BYTES = 64;
const MAX_SCRYPT_MEMORY = 64 * 1024 * 1024;

const SCRYPT = Object.freeze({
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32
});
const PBKDF2 = Object.freeze({
  iterations: 210000,
  keyLength: 32,
  digest: 'sha256'
});

// Roles are normalized before comparison so callers can use either camelCase
// or a hyphenated role name. Song-only editors deliberately remain separate
// from operational leaders and administrators.
const PRIVILEGED_ROLES = new Set([
  'admin',
  'administrator',
  'leader',
  'departmentleader',
  'globaladmin',
  'globalleadermanager'
]);
const SONG_EDITOR_ROLES = new Set([
  'editor',
  'presider',
  'songeditor',
  'choireditor',
  'choirsongeditor'
]);

const GENERIC_LOGIN_MESSAGE = 'The member name or PIN is not correct.';

function authError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRole(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rolesFor(record) {
  if (!record || typeof record !== 'object') return [];
  const values = [];
  if (record.role != null) values.push(record.role);
  if (Array.isArray(record.roles)) values.push(...record.roles);
  return Array.from(new Set(values.map(normalizeRole).filter(Boolean)));
}

function hasRole(record, roleSet) {
  return rolesFor(record).some(role => roleSet.has(role));
}

function isAdmin(record) {
  return Boolean(record && (record.admin === true || record.isAdmin === true)) ||
    rolesFor(record).some(role => role === 'admin' || role === 'administrator' || role === 'globaladmin');
}

function isSongEditor(record) {
  return Boolean(record && (
    record.songEditor === true ||
    record.choirSongEditor === true ||
    record.isSongEditor === true
  )) || hasRole(record, SONG_EDITOR_ROLES);
}

function isPrivileged(record) {
  return Boolean(record && (
    record.privileged === true ||
    record.isPrivileged === true ||
    record.admin === true ||
    record.isAdmin === true ||
    record.globalLeaderManager === true ||
    record.departmentLeader === true ||
    record.isLeader === true
  )) || hasRole(record, PRIVILEGED_ROLES);
}

function isPinProtected(record) {
  return isPrivileged(record) || isSongEditor(record);
}

function booleanValue(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return Boolean(value);
}

function effectiveMustChangePin(record) {
  if (!record || typeof record !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(record, 'mustChangePin')) {
    return booleanValue(record.mustChangePin);
  }
  if (Object.prototype.hasOwnProperty.call(record, 'must_change_pin')) {
    return booleanValue(record.must_change_pin);
  }
  // Missing state is treated as first-login state for protected accounts.
  // A successful PIN change writes an explicit false value.
  return isPinProtected(record);
}

function validatePin(pin) {
  return typeof pin === 'string' && PIN_PATTERN.test(pin);
}

function requireValidPin(pin) {
  if (!validatePin(pin)) {
    throw authError('invalid-argument', 'PIN must contain 4 to 6 digits.');
  }
  return pin;
}

function integerOption(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return NaN;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}

function validKeyLength(value) {
  return Number.isSafeInteger(value) && value >= MIN_KEY_BYTES && value <= MAX_KEY_BYTES;
}

function validSalt(salt) {
  return Buffer.isBuffer(salt) && salt.length >= MIN_SALT_BYTES && salt.length <= MAX_SALT_BYTES;
}

function isPowerOfTwo(value) {
  return Number.isSafeInteger(value) && value > 1 && (value & (value - 1)) === 0;
}

function validScryptParams(params) {
  if (!params || !isPowerOfTwo(params.cost) || params.cost < 1024 || params.cost > 262144) return false;
  if (!Number.isSafeInteger(params.blockSize) || params.blockSize < 1 || params.blockSize > 16) return false;
  if (!Number.isSafeInteger(params.parallelization) || params.parallelization < 1 || params.parallelization > 8) return false;
  if (!validKeyLength(params.keyLength)) return false;
  return 128 * params.cost * params.blockSize <= MAX_SCRYPT_MEMORY;
}

function validPbkdf2Params(params) {
  return Boolean(params) &&
    Number.isSafeInteger(params.iterations) &&
    params.iterations >= 100000 &&
    params.iterations <= 2000000 &&
    validKeyLength(params.keyLength) &&
    params.digest === PBKDF2.digest;
}

function saltFromOption(value) {
  if (value == null) return crypto.randomBytes(MIN_SALT_BYTES);
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw authError('invalid-argument', 'PIN hash salt is invalid.');
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length && encodeBase64Url(decoded) === value ? decoded : null;
  } catch (_error) {
    return null;
  }
}

function encodeHash(algorithm, parameters, salt, derivedKey) {
  return [
    HASH_PREFIX,
    HASH_VERSION,
    algorithm,
    ...parameters,
    encodeBase64Url(salt),
    encodeBase64Url(derivedKey)
  ].join('$');
}

function decodeHash(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts[0] !== HASH_PREFIX || parts[1] !== String(HASH_VERSION)) return null;

  if (parts[2] === 'scrypt' && parts.length === 9) {
    const parsed = {
      algorithm: 'scrypt',
      cost: integerOption(parts[3]),
      blockSize: integerOption(parts[4]),
      parallelization: integerOption(parts[5]),
      keyLength: integerOption(parts[6]),
      salt: decodeBase64Url(parts[7]),
      derivedKey: decodeBase64Url(parts[8])
    };
    if (!validScryptParams(parsed) || !validSalt(parsed.salt) ||
        !parsed.derivedKey || parsed.derivedKey.length !== parsed.keyLength) return null;
    return parsed;
  }

  if (parts[2] === 'pbkdf2' && parts.length === 8 && parts[3] === PBKDF2.digest) {
    const parsed = {
      algorithm: 'pbkdf2',
      digest: PBKDF2.digest,
      iterations: integerOption(parts[4]),
      keyLength: integerOption(parts[5]),
      salt: decodeBase64Url(parts[6]),
      derivedKey: decodeBase64Url(parts[7])
    };
    if (!validPbkdf2Params(parsed) || !validSalt(parsed.salt) ||
        !parsed.derivedKey || parsed.derivedKey.length !== parsed.keyLength) return null;
    return parsed;
  }

  return null;
}

async function hashPin(pin, options = {}) {
  requireValidPin(pin);
  const algorithm = options.algorithm == null ? 'scrypt' : options.algorithm;
  const salt = saltFromOption(options.salt);
  if (!validSalt(salt)) throw authError('invalid-argument', 'PIN hash salt is invalid.');

  if (algorithm === 'pbkdf2') {
    const params = {
      iterations: integerOption(options.iterations, PBKDF2.iterations),
      keyLength: integerOption(options.keyLength, PBKDF2.keyLength),
      digest: PBKDF2.digest
    };
    if (!validPbkdf2Params(params)) throw authError('invalid-argument', 'PIN hash parameters are invalid.');
    const derivedKey = await pbkdf2Async(pin, salt, params.iterations, params.keyLength, params.digest);
    return encodeHash('pbkdf2', [params.digest, params.iterations, params.keyLength], salt, derivedKey);
  }

  if (algorithm !== 'scrypt') throw authError('invalid-argument', 'Unsupported PIN hash algorithm.');
  const params = {
    cost: integerOption(options.cost, SCRYPT.cost),
    blockSize: integerOption(options.blockSize, SCRYPT.blockSize),
    parallelization: integerOption(options.parallelization, SCRYPT.parallelization),
    keyLength: integerOption(options.keyLength, SCRYPT.keyLength)
  };
  if (!validScryptParams(params)) throw authError('invalid-argument', 'PIN hash parameters are invalid.');
  const derivedKey = await scryptAsync(pin, salt, params.keyLength, {
    N: params.cost,
    r: params.blockSize,
    p: params.parallelization,
    maxmem: Math.max(32 * 1024 * 1024, 128 * params.cost * params.blockSize + 1024)
  });
  return encodeHash('scrypt', [params.cost, params.blockSize, params.parallelization, params.keyLength], salt, derivedKey);
}

async function verifyPin(pin, encodedHash) {
  if (!validatePin(pin)) return false;
  const parsed = decodeHash(encodedHash);
  if (!parsed) return false;

  try {
    const derivedKey = parsed.algorithm === 'scrypt'
      ? await scryptAsync(pin, parsed.salt, parsed.keyLength, {
        N: parsed.cost,
        r: parsed.blockSize,
        p: parsed.parallelization,
        maxmem: Math.max(32 * 1024 * 1024, 128 * parsed.cost * parsed.blockSize + 1024)
      })
      : await pbkdf2Async(pin, parsed.salt, parsed.iterations, parsed.keyLength, parsed.digest);
    return derivedKey.length === parsed.derivedKey.length &&
      crypto.timingSafeEqual(derivedKey, parsed.derivedKey);
  } catch (_error) {
    return false;
  }
}

function actorFromRequest(request) {
  const auth = request && (request.auth || request.actor);
  if (!auth || typeof auth !== 'object' || !cleanText(auth.uid)) {
    throw authError('unauthenticated', 'Sign-in is required.');
  }
  const token = auth.token && typeof auth.token === 'object' ? auth.token : {};
  return { uid: cleanText(auth.uid), token };
}

function dataFromRequest(request) {
  if (!request || typeof request !== 'object') return {};
  if (request.data && typeof request.data === 'object' && !Array.isArray(request.data)) return request.data;
  if (!Object.prototype.hasOwnProperty.call(request, 'auth') &&
      !Object.prototype.hasOwnProperty.call(request, 'actor')) return request;
  const data = Object.assign({}, request);
  delete data.auth;
  delete data.actor;
  return data;
}

function assertSafeMember(member, requestedId) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) {
    throw authError('not-found', 'Member not found.');
  }
  const storedId = cleanText(member.id || member.memberId);
  if (requestedId && storedId && storedId !== requestedId) {
    throw authError('not-found', 'Member not found.');
  }
  const id = storedId || requestedId;
  if (!id) throw authError('internal', 'Member record is missing an id.');
  const name = cleanText(member.name || member.memberName);
  return Object.assign({}, member, { id, name });
}

async function findMember(memberStore, input) {
  if (!memberStore) throw authError('internal', 'Member lookup is not configured.');
  const data = input && typeof input === 'object' ? input : {};
  const memberId = cleanText(data.memberId || data.selectedMemberId || data.targetMemberId || data.id);
  const memberName = cleanText(data.memberName || data.selectedMemberName || data.targetMemberName || data.name);
  if (!memberId && !memberName) throw authError('invalid-argument', 'A member selection is required.');

  let member;
  if (typeof memberStore === 'function') {
    member = await memberStore({ memberId, memberName });
  } else if (memberId && typeof memberStore.getById === 'function') {
    member = await memberStore.getById(memberId);
  } else if (memberId && typeof memberStore.getMember === 'function') {
    member = await memberStore.getMember(memberId);
  } else if (memberName && typeof memberStore.findByName === 'function') {
    member = await memberStore.findByName(memberName);
  } else if (memberName && typeof memberStore.getByName === 'function') {
    member = await memberStore.getByName(memberName);
  } else {
    throw authError('internal', 'Member lookup is not configured.');
  }

  if (Array.isArray(member)) {
    if (member.length !== 1) throw authError('not-found', 'Member not found.');
    member = member[0];
  }
  const safeMember = assertSafeMember(member, memberId);
  if (memberName && safeMember.name && safeMember.name !== memberName) {
    throw authError('not-found', 'Member not found.');
  }
  return safeMember;
}

function memberPinHash(member) {
  return cleanText(member && (member.pinHash || member.pin_hash || member.passwordHash));
}

async function updateMember(memberStore, member, patch) {
  if (typeof memberStore.update === 'function') return memberStore.update(member.id, patch);
  if (typeof memberStore.updateMember === 'function') return memberStore.updateMember(member.id, patch);
  if (typeof memberStore.save === 'function') {
    return memberStore.save(member.id, Object.assign({}, member, patch));
  }
  throw authError('internal', 'Member updates are not configured.');
}

function permissionChecker(permission) {
  if (typeof permission === 'function') return { fn: permission, assertion: false };
  if (!permission || typeof permission !== 'object') return null;
  if (typeof permission.assertActorCanAct === 'function') {
    return { fn: permission.assertActorCanAct.bind(permission), assertion: true };
  }
  if (typeof permission.canActorAct === 'function') {
    return { fn: permission.canActorAct.bind(permission), assertion: false };
  }
  if (typeof permission.can === 'function') {
    return { fn: permission.can.bind(permission), assertion: false };
  }
  return null;
}

async function assertActorCanAct(permission, actor, action, target) {
  const checker = permissionChecker(permission);
  if (!checker) throw authError('internal', 'Permission checks are not configured.');
  const safeTarget = target && {
    id: target.id,
    name: cleanText(target.name),
    role: cleanText(target.role) || 'member',
    privileged: isPrivileged(target),
    songEditor: isSongEditor(target),
    mustChangePin: effectiveMustChangePin(target),
    departments: copyStrings(target.departments),
    roles: copyStrings(target.roles)
  };
  try {
    const result = await checker.fn({ actor, action, target: safeTarget });
    if ((!checker.assertion && result !== true) || (checker.assertion && result === false)) {
      throw authError('permission-denied', 'You are not allowed to perform this action.');
    }
  } catch (error) {
    if (error && error.code === 'permission-denied') throw error;
    throw authError('permission-denied', 'You are not allowed to perform this action.');
  }
}

function actorMemberId(actor) {
  return cleanText(actor && actor.token && (actor.token.memberId || actor.token.member_id));
}

function actorMemberName(actor) {
  return cleanText(actor && actor.token && (actor.token.memberName || actor.token.member_name));
}

function actorNeedsPinChange(actor) {
  const token = actor && actor.token;
  if (!token) return false;
  if (Object.prototype.hasOwnProperty.call(token, 'mustChangePin')) return booleanValue(token.mustChangePin);
  return booleanValue(token.must_change_pin);
}

function actorIsPrivileged(actor) {
  const token = actor && actor.token;
  return Boolean(token && (
    token.privileged === true ||
    token.isPrivileged === true ||
    token.admin === true ||
    token.isAdmin === true ||
    token.globalLeaderManager === true ||
    token.departmentLeader === true ||
    token.isLeader === true
  )) || hasRole(token, PRIVILEGED_ROLES);
}

function actorMatchesMember(actor, member) {
  const id = actorMemberId(actor);
  if (id && id === member.id) return true;
  if (member.authUid && member.authUid === actor.uid) return true;
  const name = actorMemberName(actor);
  return Boolean(!id && name && member.name && name === member.name);
}

function copyStrings(value) {
  return Array.isArray(value)
    ? value.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean)
    : undefined;
}

function sessionClaims(member) {
  const privileged = isPrivileged(member);
  const claims = {
    memberId: member.id,
    memberName: cleanText(member.name),
    role: cleanText(member.role) || 'member',
    privileged,
    isPrivileged: privileged,
    admin: isAdmin(member),
    leader: privileged && !isAdmin(member),
    globalLeaderManager: Boolean(member.globalLeaderManager === true),
    songEditor: isSongEditor(member),
    mustChangePin: effectiveMustChangePin(member)
  };
  const roles = copyStrings(member.roles);
  const departments = copyStrings(member.departments);
  if (roles && roles.length) claims.roles = Array.from(new Set(roles));
  if (departments && departments.length) claims.departments = Array.from(new Set(departments));
  return claims;
}

function audit(logger, action, result, actor, target) {
  if (!logger || typeof logger.info !== 'function') return;
  const allowedActions = new Set(['verify', 'change', 'reset', 'privileged']);
  const allowedResults = new Set(['success', 'denied']);
  const details = {
    action: allowedActions.has(action) ? action : 'privileged',
    result: allowedResults.has(result) ? result : 'denied',
    timestamp: new Date().toISOString()
  };
  if (actor) {
    const actorId = actorMemberId(actor);
    const actorUid = cleanText(actor.uid);
    if (actorUid || actorId) {
      details.actor = {};
      if (actorUid) details.actor.uid = actorUid;
      if (actorId) details.actor.memberId = actorId;
    }
  }
  if (target) {
    const targetId = cleanText(target.id);
    if (targetId) details.target = { memberId: targetId };
  }
  try {
    // Deliberately log only fixed action/result values and opaque account
    // identifiers. No PIN, hash, name, or request payload is ever logged.
    logger.info('member_auth_action', details);
  } catch (_error) {
    // Logging must not turn a successful authentication into a failed one.
  }
}

async function setClaimsIfSupported(auth, member, uid, claims) {
  if (!auth || typeof auth !== 'object') return;
  const setter = typeof auth.setCustomUserClaims === 'function'
    ? auth.setCustomUserClaims.bind(auth)
    : typeof auth.setClaims === 'function' ? auth.setClaims.bind(auth) : null;
  // A generated uid may not exist in Firebase Auth yet. Persist claims only
  // when the member record explicitly identifies an existing Auth account.
  if (!member.authUid || !setter) return;
  await setter(uid, claims);
}

async function issueToken(auth, uid, claims) {
  if (!auth || typeof auth !== 'object') {
    throw authError('internal', 'Custom token creation is not configured.');
  }
  if (typeof auth.createCustomToken === 'function') return auth.createCustomToken(uid, claims);
  if (typeof auth.createSessionToken === 'function') return auth.createSessionToken({ uid, claims });
  if (typeof auth.issueToken === 'function') return auth.issueToken({ uid, claims });
  throw authError('internal', 'Custom token creation is not configured.');
}

function targetInputForChange(actor, input) {
  const memberId = cleanText(input.memberId || input.selectedMemberId || input.targetMemberId || input.id);
  const memberName = cleanText(input.memberName || input.selectedMemberName || input.targetMemberName || input.name);
  if (memberId || memberName) return { memberId, memberName };
  const actorId = actorMemberId(actor);
  const actorName = actorMemberName(actor);
  if (actorId) return { memberId: actorId };
  if (actorName) return { memberName: actorName };
  throw authError('invalid-argument', 'A member selection is required.');
}

function callableRequest(request, context) {
  if (context !== undefined) {
    return { data: request && typeof request === 'object' ? request : {}, auth: context && context.auth };
  }
  if (request && typeof request === 'object' &&
      Object.prototype.hasOwnProperty.call(request, 'data')) return request;
  return { data: request && typeof request === 'object' ? request : {}, auth: context && context.auth };
}

function createMemberAuthService(dependencies = {}) {
  const memberStore = dependencies.memberStore || dependencies.store;
  const auth = dependencies.auth;
  const permission = dependencies.permission || dependencies.permissions || dependencies.assertActorCanAct;
  const logger = dependencies.logger;
  if (!memberStore) throw new TypeError('memberStore is required');

  async function verifyMemberPin(request) {
    const input = dataFromRequest(request);
    requireValidPin(input.pin);

    let member;
    try {
      member = await findMember(memberStore, input);
    } catch (error) {
      if (error && error.code === 'internal') throw error;
      audit(logger, 'verify', 'denied', null, member);
      throw authError('unauthenticated', GENERIC_LOGIN_MESSAGE);
    }

    const storedHash = memberPinHash(member);
    const valid = storedHash && await verifyPin(input.pin, storedHash);
    if (!valid) {
      audit(logger, 'verify', 'denied', null, member);
      throw authError('unauthenticated', GENERIC_LOGIN_MESSAGE);
    }

    const claims = sessionClaims(member);
    const uid = cleanText(member.authUid) || `member:${member.id}`;
    await setClaimsIfSupported(auth, member, uid, claims);
    const token = await issueToken(auth, uid, claims);
    audit(logger, 'verify', 'success', null, member);
    return {
      token,
      memberId: member.id,
      memberName: claims.memberName,
      mustChangePin: claims.mustChangePin,
      claims
    };
  }

  async function changeMemberPin(request) {
    const actor = actorFromRequest(request);
    const input = dataFromRequest(request);
    requireValidPin(input.newPin);
    const member = await findMember(memberStore, targetInputForChange(actor, input));
    const selfChange = actorMatchesMember(actor, member);

    if (!selfChange) {
      if (actorNeedsPinChange(actor)) {
        throw authError('failed-precondition', 'Change your PIN before managing another account.');
      }
      try {
        await assertActorCanAct(permission, actor, 'member.pin.change', member);
      } catch (error) {
        audit(logger, 'change', 'denied', actor, member);
        throw error;
      }
    }

    const pinHash = await hashPin(input.newPin);
    await updateMember(memberStore, member, { pinHash, mustChangePin: false });
    const nextClaims = sessionClaims(Object.assign({}, member, { pinHash, mustChangePin: false }));
    if (member.authUid) await setClaimsIfSupported(auth, member, member.authUid, nextClaims);
    audit(logger, 'change', 'success', actor, member);
    return { ok: true, memberId: member.id, mustChangePin: false };
  }

  async function resetMemberPin(request) {
    const actor = actorFromRequest(request);
    if (actorNeedsPinChange(actor)) {
      throw authError('failed-precondition', 'Change your PIN before managing accounts.');
    }
    if (!actorIsPrivileged(actor)) {
      throw authError('permission-denied', 'You are not allowed to perform this action.');
    }
    const member = await findMember(memberStore, dataFromRequest(request));
    try {
      await assertActorCanAct(permission, actor, 'member.pin.reset', member);
    } catch (error) {
      audit(logger, 'reset', 'denied', actor, member);
      throw error;
    }
    const pinHash = await hashPin(DEFAULT_PIN);
    await updateMember(memberStore, member, { pinHash, mustChangePin: true });

    if (member.authUid && auth && typeof auth.setCustomUserClaims === 'function') {
      const nextClaims = sessionClaims(Object.assign({}, member, { mustChangePin: true }));
      await auth.setCustomUserClaims(member.authUid, nextClaims);
    }
    audit(logger, 'reset', 'success', actor, member);
    return { ok: true, memberId: member.id, mustChangePin: true };
  }

  async function assertPrivilegedSession(request, action = 'privileged') {
    const actor = actorFromRequest(request);
    if (actorNeedsPinChange(actor)) {
      throw authError('failed-precondition', 'Change your PIN before using this account.');
    }
    if (!actorIsPrivileged(actor)) {
      throw authError('permission-denied', 'You are not allowed to perform this action.');
    }
    try {
      await assertActorCanAct(permission, actor, action, null);
    } catch (error) {
      audit(logger, 'privileged', 'denied', actor, null);
      throw error;
    }
    audit(logger, 'privileged', 'success', actor, null);
    return actor;
  }

  return Object.freeze({ verifyMemberPin, changeMemberPin, resetMemberPin, assertPrivilegedSession });
}

function createMemberAuthCallables(dependencies = {}) {
  const service = createMemberAuthService(dependencies);
  return Object.freeze({
    verifyMemberPin: (request, context) => service.verifyMemberPin(callableRequest(request, context)),
    changeMemberPin: (request, context) => service.changeMemberPin(callableRequest(request, context)),
    resetMemberPin: (request, context) => service.resetMemberPin(callableRequest(request, context))
  });
}

module.exports = {
  DEFAULT_PIN,
  ORDINARY_DEFAULT_PIN,
  PRIVILEGED_ROLES,
  SONG_EDITOR_ROLES,
  validatePin,
  isValidPin: validatePin,
  isPrivileged,
  isSongEditor,
  effectiveMustChangePin,
  hashPin,
  verifyPin,
  parsePinHash: decodeHash,
  sessionClaims,
  createMemberAuthService,
  createMemberAuthCallables
};
