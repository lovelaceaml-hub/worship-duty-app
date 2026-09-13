'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);
const pbkdf2Async = promisify(crypto.pbkdf2);

const DEFAULT_PIN = '0'.repeat(4);
const PIN_PATTERN = /^\d{4,6}$/;
const HASH_VERSION = 1;
const SCRYPT = Object.freeze({ cost: 16384, blockSize: 8, parallelization: 1, keyLength: 32 });
const PBKDF2 = Object.freeze({ iterations: 210000, keyLength: 32, digest: 'sha256' });
const PRIVILEGED_ROLES = new Set(['admin', 'leader', 'editor', 'presider']);

function validScryptParameters(cost, blockSize, parallelization, keyLength) {
  return Number.isSafeInteger(cost) && cost >= 1024 && cost <= 1048576 &&
    (cost & (cost - 1)) === 0 &&
    Number.isSafeInteger(blockSize) && blockSize >= 1 && blockSize <= 32 &&
    Number.isSafeInteger(parallelization) && parallelization >= 1 && parallelization <= 16 &&
    Number.isSafeInteger(keyLength) && keyLength >= 16 && keyLength <= 64;
}

function validPbkdf2Parameters(iterations, keyLength) {
  return Number.isSafeInteger(iterations) && iterations >= 100000 && iterations <= 1000000 &&
    Number.isSafeInteger(keyLength) && keyLength >= 16 && keyLength <= 64;
}

function authError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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

function encodeHash(algorithm, parameters, salt, derivedKey) {
  return [
    'pin',
    HASH_VERSION,
    algorithm,
    ...parameters,
    salt.toString('base64url'),
    derivedKey.toString('base64url')
  ].join('$');
}

function decodeHash(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts[0] !== 'pin' || parts[1] !== String(HASH_VERSION)) return null;

  try {
    if (parts[2] === 'scrypt' && parts.length === 9) {
      const cost = Number(parts[3]);
      const blockSize = Number(parts[4]);
      const parallelization = Number(parts[5]);
      const keyLength = Number(parts[6]);
      if (!validScryptParameters(cost, blockSize, parallelization, keyLength)) return null;
      const salt = Buffer.from(parts[7], 'base64url');
      const derivedKey = Buffer.from(parts[8], 'base64url');
      if (salt.length < 16 || derivedKey.length !== keyLength) return null;
      return { algorithm: 'scrypt', cost, blockSize, parallelization, keyLength, salt, derivedKey };
    }

    if (parts[2] === 'pbkdf2' && parts.length === 8 && parts[3] === PBKDF2.digest) {
      const iterations = Number(parts[4]);
      const keyLength = Number(parts[5]);
      if (!validPbkdf2Parameters(iterations, keyLength)) return null;
      const salt = Buffer.from(parts[6], 'base64url');
      const derivedKey = Buffer.from(parts[7], 'base64url');
      if (salt.length < 16 || derivedKey.length !== keyLength) return null;
      return { algorithm: 'pbkdf2', iterations, keyLength, digest: PBKDF2.digest, salt, derivedKey };
    }
  } catch (_error) {
    return null;
  }

  return null;
}

async function hashPin(pin, options = {}) {
  requireValidPin(pin);
  const algorithm = options.algorithm || 'scrypt';
  const salt = options.salt ? Buffer.from(options.salt) : crypto.randomBytes(16);

  if (salt.length < 16) throw authError('internal', 'Could not create a secure PIN hash.');

  if (algorithm === 'pbkdf2') {
    const iterations = options.iterations || PBKDF2.iterations;
    const keyLength = options.keyLength || PBKDF2.keyLength;
    if (!validPbkdf2Parameters(iterations, keyLength)) {
      throw authError('invalid-argument', 'Unsupported PIN hash parameters.');
    }
    const derivedKey = await pbkdf2Async(pin, salt, iterations, keyLength, PBKDF2.digest);
    return encodeHash('pbkdf2', [PBKDF2.digest, iterations, keyLength], salt, derivedKey);
  }

  if (algorithm !== 'scrypt') throw authError('invalid-argument', 'Unsupported PIN hash algorithm.');
  const cost = options.cost || SCRYPT.cost;
  const blockSize = options.blockSize || SCRYPT.blockSize;
  const parallelization = options.parallelization || SCRYPT.parallelization;
  const keyLength = options.keyLength || SCRYPT.keyLength;
  if (!validScryptParameters(cost, blockSize, parallelization, keyLength)) {
    throw authError('invalid-argument', 'Unsupported PIN hash parameters.');
  }
  const derivedKey = await scryptAsync(pin, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: Math.max(32 * 1024 * 1024, 128 * cost * blockSize + 1024)
  });
  return encodeHash('scrypt', [cost, blockSize, parallelization, keyLength], salt, derivedKey);
}

async function verifyPin(pin, encodedHash) {
  if (!validatePin(pin)) return false;
  const parsed = decodeHash(encodedHash);
  if (!parsed) return false;

  let derivedKey;
  if (parsed.algorithm === 'scrypt') {
    derivedKey = await scryptAsync(pin, parsed.salt, parsed.keyLength, {
      N: parsed.cost,
      r: parsed.blockSize,
      p: parsed.parallelization,
      maxmem: Math.max(32 * 1024 * 1024, 128 * parsed.cost * parsed.blockSize + 1024)
    });
  } else {
    derivedKey = await pbkdf2Async(
      pin,
      parsed.salt,
      parsed.iterations,
      parsed.keyLength,
      parsed.digest
    );
  }

  return derivedKey.length === parsed.derivedKey.length &&
    crypto.timingSafeEqual(derivedKey, parsed.derivedKey);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPrivileged(member) {
  return Boolean(member && (member.privileged || member.isPrivileged || PRIVILEGED_ROLES.has(member.role)));
}

function effectiveMustChangePin(member) {
  if (Object.prototype.hasOwnProperty.call(member, 'mustChangePin')) return Boolean(member.mustChangePin);
  return isPrivileged(member);
}

function actorFromRequest(request) {
  const auth = request && (request.auth || request.actor);
  if (!auth || !cleanText(auth.uid)) {
    throw authError('unauthenticated', 'Sign-in is required.');
  }
  return { uid: cleanText(auth.uid), token: auth.token || {} };
}

function dataFromRequest(request) {
  return request && request.data && typeof request.data === 'object' ? request.data : (request || {});
}

function assertSafeMember(member, requestedId) {
  if (!member || typeof member !== 'object') throw authError('not-found', 'Member not found.');
  const id = cleanText(member.id || requestedId);
  if (!id) throw authError('internal', 'Member record is missing an id.');
  return Object.assign({}, member, { id });
}

async function findMember(memberStore, input) {
  const memberId = cleanText(input.memberId || input.selectedMemberId || input.targetMemberId);
  const memberName = cleanText(input.memberName || input.selectedMemberName || input.name);
  let member;

  if (memberId && typeof memberStore.getById === 'function') {
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
  return assertSafeMember(member, memberId);
}

async function updateMember(memberStore, member, patch) {
  if (typeof memberStore.update === 'function') return memberStore.update(member.id, patch);
  if (typeof memberStore.updateMember === 'function') return memberStore.updateMember(member.id, patch);
  if (typeof memberStore.save === 'function') return memberStore.save(member.id, Object.assign({}, member, patch));
  throw authError('internal', 'Member updates are not configured.');
}

async function assertActorCanAct(permission, actor, action, target) {
  if (!permission || typeof permission.assertActorCanAct !== 'function') {
    throw authError('internal', 'Permission checks are not configured.');
  }
  const safeTarget = target && {
    id: target.id,
    name: cleanText(target.name),
    role: cleanText(target.role) || 'member',
    privileged: isPrivileged(target),
    mustChangePin: effectiveMustChangePin(target),
    departments: Array.isArray(target.departments) ? target.departments.slice() : undefined
  };
  try {
    const allowed = await permission.assertActorCanAct({ actor, action, target: safeTarget });
    if (allowed === false) throw authError('permission-denied', 'You are not allowed to perform this action.');
  } catch (error) {
    if (error && error.code === 'permission-denied') throw error;
    throw authError('permission-denied', 'You are not allowed to perform this action.');
  }
}

function audit(logger, action, result) {
  if (!logger || typeof logger.info !== 'function') return;
  logger.info('member_auth_action', { action, result });
}

function sessionClaims(member) {
  const claims = {
    memberId: member.id,
    memberName: cleanText(member.name),
    role: cleanText(member.role) || 'member',
    privileged: isPrivileged(member),
    mustChangePin: effectiveMustChangePin(member)
  };
  if (Array.isArray(member.departments)) claims.departments = member.departments.slice();
  return claims;
}

function createMemberAuthService(dependencies = {}) {
  const memberStore = dependencies.memberStore || dependencies.store;
  const auth = dependencies.auth;
  const permission = dependencies.permission;
  const logger = dependencies.logger;
  if (!memberStore) throw new TypeError('memberStore is required');

  async function verifyMemberPin(request) {
    const input = dataFromRequest(request);
    const member = await findMember(memberStore, input);
    const valid = await verifyPin(input.pin, member.pinHash);
    if (!valid) {
      audit(logger, 'verify', 'denied');
      throw authError('unauthenticated', 'The member name or PIN is not correct.');
    }
    if (!auth || typeof auth.createCustomToken !== 'function') {
      throw authError('internal', 'Custom token creation is not configured.');
    }

    const claims = sessionClaims(member);
    const uid = cleanText(member.authUid) || `member:${member.id}`;
    if (member.authUid && typeof auth.setCustomUserClaims === 'function') {
      await auth.setCustomUserClaims(uid, claims);
    }
    const token = await auth.createCustomToken(uid, claims);
    audit(logger, 'verify', 'success');
    return { token, memberId: member.id, memberName: claims.memberName, mustChangePin: claims.mustChangePin };
  }

  async function changeMemberPin(request) {
    const actor = actorFromRequest(request);
    const input = dataFromRequest(request);
    const actorMemberId = cleanText(actor.token.memberId);
    const requestedId = cleanText(input.memberId || input.selectedMemberId || input.targetMemberId);
    let permissionChecked = false;
    if (requestedId && actorMemberId !== requestedId) {
      const target = await findMember(memberStore, input);
      await assertActorCanAct(permission, actor, 'member.pin.change', target);
      permissionChecked = true;
    }
    const member = await findMember(memberStore, requestedId ? { memberId: requestedId } : { memberId: actorMemberId });
    if (!permissionChecked && (!actorMemberId || actorMemberId !== member.id)) {
      await assertActorCanAct(permission, actor, 'member.pin.change', member);
    }
    requireValidPin(input.newPin);
    const pinHash = await hashPin(input.newPin);
    await updateMember(memberStore, member, { pinHash, mustChangePin: false });
    audit(logger, 'change', 'success');
    return { ok: true, memberId: member.id, mustChangePin: false };
  }

  async function resetMemberPin(request) {
    const actor = actorFromRequest(request);
    const member = await findMember(memberStore, dataFromRequest(request));
    await assertActorCanAct(permission, actor, 'member.pin.reset', member);
    const pinHash = await hashPin(DEFAULT_PIN);
    await updateMember(memberStore, member, { pinHash, mustChangePin: true });
    audit(logger, 'reset', 'success');
    return { ok: true, memberId: member.id, mustChangePin: true };
  }

  async function assertPrivilegedSession(request, action = 'privileged') {
    const actor = actorFromRequest(request);
    if (actor.token.mustChangePin) {
      throw authError('failed-precondition', 'Change your PIN before using this account.');
    }
    if (!actor.token.privileged) {
      throw authError('permission-denied', 'You are not allowed to perform this action.');
    }
    await assertActorCanAct(permission, actor, action, null);
    return actor;
  }

  return Object.freeze({ verifyMemberPin, changeMemberPin, resetMemberPin, assertPrivilegedSession });
}

function createMemberAuthCallables(dependencies = {}) {
  const service = createMemberAuthService(dependencies);
  return Object.freeze({
    verifyMemberPin: request => service.verifyMemberPin(request),
    changeMemberPin: request => service.changeMemberPin(request),
    resetMemberPin: request => service.resetMemberPin(request)
  });
}

module.exports = {
  DEFAULT_PIN,
  PRIVILEGED_ROLES,
  validatePin,
  isValidPin: validatePin,
  hashPin,
  verifyPin,
  createMemberAuthService,
  createMemberAuthCallables
};
