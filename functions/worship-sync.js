'use strict';

/*
 * Firebase to Vercel Worship sender.
 *
 * This module intentionally has no Firebase imports.  The two exported
 * functions in index.js provide the Firestore boundary, while the pure
 * helpers here make the frozen wire contract directly testable.
 */

const crypto = require('node:crypto');

const SOURCE = 'lv-zion-duties';
const VERSION = 1;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_PART_SERVICES = 50;
const MAX_PART_COUNT = 40;
const MAX_SNAPSHOT_SERVICES = 2000;
const MAX_ASSIGNMENTS = 40;
const MAX_TEXT_LENGTH = 128;
const MAX_SOURCE_SEQUENCE = Number.MAX_SAFE_INTEGER;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;
const ATTEMPT_BUDGET_MS = 30000;
const PREVIOUS_KEY_OVERLAP_MS = 24 * 60 * 60 * 1000;
const FUNCTION_TIMEOUT_SECONDS = 1800;
const EVENT_FUNCTION_TIMEOUT_SECONDS = 540;
const STAGING_TTL_MS = 1500000;
const CHUNK_PLAINTEXT_BYTES = 24576;
const CHUNK_BATCH_MAX_WRITES = 50;
const CHUNK_BATCH_MAX_BYTES = 2 * 1024 * 1024;
const MAX_CHUNK_DOCUMENT_BYTES = 900 * 1024;
const MAX_CLEANUP_CHUNK_SETS = 100;
const MAX_CLEANUP_CHUNKS = 500;
const DISPATCH_OVERHEAD_MS = 5000;
const RETRY_DELAYS_MS = [250, 500];
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const EXPIRY_STATUSES = new Set([410]);
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const KEY_ID_PATTERN = ID_PATTERN;
const DECIMAL_13_PATTERN = /^\d{13}$/;
const KEYRING_MODE_CURRENT = 'current';
const KEYRING_MODE_ROTATING = 'rotating';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(toBytes(value)).digest('hex');
}

function hmacSignature(rawBody, timestamp, secret) {
  if (!DECIMAL_13_PATTERN.test(String(timestamp))) {
    throw new Error('invalid timestamp');
  }
  if (typeof secret !== 'string' || !secret) throw new Error('missing signing secret');
  const input = Buffer.concat([
    Buffer.from('lv-zion-worship-sync:v1\n' + String(timestamp) + '\n', 'ascii'),
    toBytes(rawBody),
  ]);
  return 'v1=' + crypto.createHmac('sha256', secret).update(input).digest('hex');
}

function toBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(String(value), 'utf8');
}

function canonicalJson(value) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string') throw new Error('value is not JSON serializable');
  return text;
}

function canonicalBytes(value) {
  return Buffer.from(canonicalJson(value), 'utf8');
}

function assertBodyLimit(rawBody) {
  const bytes = toBytes(rawBody);
  if (bytes.length > MAX_BODY_BYTES) throw new Error('body exceeds 1 MiB');
  return bytes;
}

function assertText(name, value, { nonEmpty = true } = {}) {
  if (typeof value !== 'string') throw new Error(name + ' must be text');
  if (nonEmpty && value.length === 0) throw new Error(name + ' must not be empty');
  assertUnicodeScalars(name, value);
  if ([...value].length > MAX_TEXT_LENGTH) throw new Error(name + ' is too long');
  if (/[\u0000-\u001f]/u.test(value)) throw new Error(name + ' contains a control');
  return value;
}

function assertUnicodeScalars(name, value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(name + ' contains an unpaired surrogate');
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(name + ' contains an unpaired surrogate');
    }
  }
}

function assertId(name, value) {
  assertText(name, value);
  if (!ID_PATTERN.test(value)) throw new Error(name + ' is not log-safe');
  return value;
}

function assertKeyId(value) {
  assertText('keyId', value);
  if (!KEY_ID_PATTERN.test(value)) throw new Error('keyId is not log-safe');
  return value;
}

function assertTimestampString(name, value) {
  if (typeof value !== 'string' || !DECIMAL_13_PATTERN.test(value)) {
    throw new Error(name + ' must be 13 decimal digits');
  }
  return value;
}

function assertSequence(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SOURCE_SEQUENCE) {
    throw new Error('sourceSequence out of range');
  }
  return value;
}

function assertDate(value) {
  assertText('date', value);
  if (!DATE_PATTERN.test(value)) throw new Error('date is not ISO format');
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day) throw new Error('date is not a real calendar date');
  return value;
}

function assertTime(value) {
  assertText('time', value);
  if (!TIME_PATTERN.test(value)) throw new Error('time is not 24-hour format');
  const [hour, minute] = value.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('time is out of range');
  return value;
}

function asciiSlug(value) {
  return String(value)
    .replace(/[A-Z]/g, ch => ch.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertIdIsNotMemberLabel(id, memberLabels) {
  for (const label of memberLabels) {
    if (id === label || id === asciiSlug(label)) {
      throw new Error('source id conflicts with a member label');
    }
  }
}

function compareText(left, right) {
  return left === right ? 0 : (left < right ? -1 : 1);
}

function documentData(documentOrData) {
  if (documentOrData && typeof documentOrData.data === 'function') {
    return documentOrData.data() || {};
  }
  return documentOrData || {};
}

function documentId(documentOrData, fallback) {
  if (documentOrData && typeof documentOrData.id === 'string' && documentOrData.id) {
    return documentOrData.id;
  }
  return fallback || '';
}

function documentUpdatedAt(documentOrData, fallback) {
  const updateTime = documentOrData && documentOrData.updateTime;
  if (updateTime && typeof updateTime.toMillis === 'function') {
    const value = String(updateTime.toMillis());
    if (DECIMAL_13_PATTERN.test(value)) return value;
  }
  const data = documentData(documentOrData);
  if (typeof data.sourceUpdatedAt === 'string' && DECIMAL_13_PATTERN.test(data.sourceUpdatedAt)) {
    return data.sourceUpdatedAt;
  }
  if (typeof fallback === 'string' && DECIMAL_13_PATTERN.test(fallback)) return fallback;
  return String(Date.now());
}

function eventFallbackUpdatedAt(event) {
  const eventTime = event && event.time;
  if (typeof eventTime === 'string') {
    const parsed = Date.parse(eventTime);
    if (Number.isFinite(parsed)) {
      const value = String(parsed);
      if (DECIMAL_13_PATTERN.test(value)) return value;
    }
  }
  return '0000000000000';
}

function assignmentEntries(rawAssignments) {
  if (!rawAssignments) return [];
  if (Array.isArray(rawAssignments)) {
    return rawAssignments.map(item => [item && item.dutyLabel, item && item.memberLabel]);
  }
  if (typeof rawAssignments !== 'object') throw new Error('assignments must be an object');
  return Object.keys(rawAssignments).map(key => [key, rawAssignments[key]]);
}

function serviceFromSchedule(documentOrData, options = {}) {
  const data = documentData(documentOrData);
  const rawId = documentId(documentOrData, data.id || '');
  const id = assertId('service.id', rawId);
  const serviceLabel = data.serviceLabel !== undefined ? data.serviceLabel : data.service;
  const worshipLabel = data.worshipLabel !== undefined ? data.worshipLabel : data.worship;
  const date = assertDate(data.date);
  const time = assertTime(data.time);
  assertText('serviceLabel', serviceLabel);
  assertText('worshipLabel', worshipLabel);

  const assignments = assignmentEntries(data.assignments)
    .filter(([, memberLabel]) => memberLabel !== undefined && memberLabel !== null && memberLabel !== '')
    .map(([dutyLabel, memberLabel]) => ({
      dutyLabel: assertText('dutyLabel', dutyLabel),
      memberLabel: assertText('memberLabel', memberLabel),
    }))
    .sort((left, right) => compareText(left.dutyLabel, right.dutyLabel) ||
      compareText(left.memberLabel, right.memberLabel));
  if (assignments.length > MAX_ASSIGNMENTS) throw new Error('too many assignments');

  const memberLabels = assignments.map(assignment => assignment.memberLabel);
  assertIdIsNotMemberLabel(id, memberLabels);
  const sourceUpdatedAt = assertTimestampString(
    'sourceUpdatedAt',
    typeof data.sourceUpdatedAt === 'string' && DECIMAL_13_PATTERN.test(data.sourceUpdatedAt)
      ? data.sourceUpdatedAt
      : documentUpdatedAt(documentOrData, options.fallbackUpdatedAt),
  );

  const service = {
    id,
    date,
    time,
    serviceLabel,
    worshipLabel,
    sourceUpdatedAt,
    assignments,
  };
  if (data.choirSong !== undefined && data.choirSong !== null && data.choirSong !== '') {
    service.choirSong = assertText('choirSong', data.choirSong);
    // Reinsert the optional field in the contract's defined position.
    return {
      id: service.id,
      date: service.date,
      time: service.time,
      serviceLabel: service.serviceLabel,
      worshipLabel: service.worshipLabel,
      choirSong: service.choirSong,
      sourceUpdatedAt: service.sourceUpdatedAt,
      assignments: service.assignments,
    };
  }
  return service;
}

function compareServices(left, right) {
  return compareText(left.date, right.date) || compareText(left.time, right.time) ||
    compareText(left.id, right.id);
}

function projectSchedule(documents, options = {}) {
  if (!Array.isArray(documents)) throw new Error('schedule documents must be an array');
  if (documents.length > MAX_SNAPSHOT_SERVICES) throw new Error('snapshot has too many services');
  const fallbackUpdatedAt = options.fallbackUpdatedAt || String(Date.now());
  const services = documents.map(document => serviceFromSchedule(document, { fallbackUpdatedAt }));
  services.sort(compareServices);
  const seen = new Set();
  const memberLabels = [];
  for (const service of services) {
    if (seen.has(service.id)) throw new Error('duplicate service id');
    seen.add(service.id);
    memberLabels.push(...service.assignments.map(assignment => assignment.memberLabel));
  }
  for (const service of services) {
    assertIdIsNotMemberLabel(service.id, memberLabels);
  }
  return services;
}

function buildEventPayload({ sequence, generatedAt, operation, service }) {
  assertSequence(sequence);
  assertTimestampString('generatedAt', generatedAt);
  if (operation !== 'upsert' && operation !== 'delete') throw new Error('invalid operation');
  const common = {
    version: VERSION,
    mode: 'event',
    source: SOURCE,
    sourceSequence: sequence,
    generatedAt,
    operation,
  };
  if (operation === 'delete') {
    const id = assertId('service.id', service && service.id);
    return { ...common, service: { id } };
  }
  if (!service || typeof service !== 'object') throw new Error('upsert service is required');
  const projected = serviceFromSchedule(service, { fallbackUpdatedAt: generatedAt });
  return { ...common, service: projected };
}

function buildEventBody(options) {
  const rawBody = canonicalJson(buildEventPayload(options));
  assertBodyLimit(rawBody);
  return rawBody;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function fullServicesHash(services) {
  return sha256Hex(canonicalBytes(services));
}

function buildSnapshotPayload({ sequence, generatedAt, snapshotId, partIndex, partCount,
  fullSha256, services }) {
  assertSequence(sequence);
  assertTimestampString('generatedAt', generatedAt);
  assertId('snapshotId', snapshotId);
  if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= partCount) {
    throw new Error('partIndex out of range');
  }
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > MAX_PART_COUNT) {
    throw new Error('partCount out of range');
  }
  if (!HEX_64_PATTERN.test(fullSha256)) throw new Error('fullSha256 is invalid');
  const partSha256 = sha256Hex(canonicalBytes(services));
  return {
    version: VERSION,
    mode: 'snapshot_part',
    source: SOURCE,
    sourceSequence: sequence,
    generatedAt,
    snapshotId,
    partIndex,
    partCount,
    partSha256,
    fullSha256,
    final: partIndex === partCount - 1,
    services: cloneJson(services),
  };
}

function snapshotPartsForSize(services, size, options) {
  const chunks = [];
  for (let offset = 0; offset < services.length; offset += size) {
    chunks.push(services.slice(offset, offset + size));
  }
  if (!chunks.length) chunks.push([]);
  if (chunks.length > MAX_PART_COUNT) throw new Error('snapshot needs too many parts');
  const parts = chunks.map((chunk, index) => {
    const payload = buildSnapshotPayload({ ...options, partIndex: index, partCount: chunks.length, services: chunk });
    const rawBody = canonicalJson(payload);
    assertBodyLimit(rawBody);
    return { payload, rawBody, bodySha256: sha256Hex(rawBody) };
  });
  return parts;
}

function buildSnapshotParts(services, options = {}) {
  if (!Array.isArray(services)) throw new Error('services must be an array');
  if (services.length > MAX_SNAPSHOT_SERVICES) throw new Error('snapshot has too many services');
  const fallbackUpdatedAt = options.fallbackUpdatedAt || options.generatedAt;
  const ordered = services.map(service => serviceFromSchedule(service, { fallbackUpdatedAt })).sort(compareServices);
  const seen = new Set();
  const memberLabels = [];
  for (const service of ordered) {
    assertId('service.id', service.id);
    if (seen.has(service.id)) throw new Error('duplicate service id');
    seen.add(service.id);
    memberLabels.push(...(service.assignments || []).map(a => a.memberLabel));
  }
  const sequence = assertSequence(options.sequence);
  const generatedAt = assertTimestampString('generatedAt', options.generatedAt);
  const snapshotId = assertId('snapshotId', options.snapshotId);
  assertIdIsNotMemberLabel(snapshotId, memberLabels);
  for (const service of ordered) assertIdIsNotMemberLabel(service.id, memberLabels);
  const fullSha256 = fullServicesHash(ordered);
  let size = options.partSize === undefined ? MAX_PART_SERVICES : options.partSize;
  if (!Number.isInteger(size) || size < 1 || size > MAX_PART_SERVICES) {
    throw new Error('partSize out of range');
  }
  while (size >= 1) {
    try {
      const parts = snapshotPartsForSize(ordered, size, {
        sequence,
        generatedAt,
        snapshotId,
        fullSha256,
      });
      return { services: ordered, fullSha256, parts };
    } catch (error) {
      if (!String(error && error.message).includes('1 MiB')) throw error;
      size -= 1;
    }
  }
  throw new Error('unable to fit snapshot part');
}

function buildSignedRequest({ rawBody, timestamp, keyId, secret, url }) {
  const body = assertBodyLimit(rawBody);
  const timestampValue = String(timestamp);
  assertTimestampString('timestamp', timestampValue);
  assertKeyId(keyId);
  if (typeof url !== 'string' || !url) throw new Error('missing destination URL');
  return {
    url,
    rawBody: body,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
      'X-LV-Zion-Sync-Timestamp': timestampValue,
      'X-LV-Zion-Sync-Key-Id': keyId,
      'X-LV-Zion-Sync-Signature': hmacSignature(body, timestampValue, secret),
    },
  };
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status);
}

function classifyReceiverStatus(status) {
  if (status === 200) return 'accepted';
  if (status === 202) return 'accepted_pending_mapping';
  if (status === 400) return 'malformed';
  if (status === 401) return 'unauthorized';
  if (status === 409) return 'conflict_or_stale';
  if (status === 413) return 'oversized';
  if (status === 410) return 'expired';
  if (isRetryableStatus(status)) return 'retryable_transport';
  return 'unknown';
}

function classifyResponse(response) {
  if (!response || !Number.isInteger(response.status)) return { kind: 'unknown' };
  const status = response.status;
  if (status === 200 || status === 202) return { kind: 'accepted', status };
  if (isRetryableStatus(status)) return { kind: 'retryable', status };
  if (status === 400 || status === 401 || status === 409 || status === 410 || status === 413) {
    return { kind: 'failed', status };
  }
  return { kind: 'unknown', status };
}

async function sendWithRetry(request, options = {}) {
  const sendRequest = options.sendRequest || defaultSendRequest;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = typeof options.now === 'function'
    ? options.now
    : () => (options.now === undefined ? Date.now() : Number(options.now));
  const timeoutMs = options.timeoutMs === undefined ? REQUEST_TIMEOUT_MS : options.timeoutMs;
  const budgetMs = options.budgetMs === undefined ? ATTEMPT_BUDGET_MS : options.budgetMs;
  const startedAt = now();
  let attempts = 0;
  let last = { kind: 'unknown' };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remaining = budgetMs - (now() - startedAt);
    if (remaining <= 0) break;
    attempts += 1;
    const perRequestTimeout = Math.min(timeoutMs, remaining);
    let retryTransport = false;
    try {
      const response = await requestWithTimeout(sendRequest, request, perRequestTimeout);
      last = classifyResponse(response);
      if (last.kind === 'accepted' || last.kind === 'failed') {
        return { ...last, attempts, durationMs: now() - startedAt };
      }
      // An unrecognized but received HTTP response is unknown, not a
      // contract-defined retryable outcome. A missing response is a transport
      // unknown and may be retried with the exact same request.
      retryTransport = last.kind === 'retryable' || !response;
    } catch (_error) {
      // A transport error is unknown.  The exact body, sequence, and headers
      // are reused on the bounded retry so the receiver can safely replay it.
      last = { kind: 'unknown' };
      retryTransport = true;
    }
    if (!retryTransport) return { kind: 'unknown', status: last.status, attempts, durationMs: now() - startedAt };
    if (attempt >= MAX_ATTEMPTS - 1) break;
    const delayMs = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    const waitRemaining = budgetMs - (now() - startedAt);
    if (waitRemaining <= 0) break;
    await sleep(Math.min(delayMs, waitRemaining));
  }
  const outcome = last.kind === 'retryable' ? 'failed' : last.kind;
  return {
    kind: outcome === 'failed' ? 'failed' : 'unknown',
    status: last.status,
    attempts,
    durationMs: now() - startedAt,
  };
}

async function requestWithTimeout(sendRequest, request, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('request timed out');
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([sendRequest(request, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function defaultSendRequest(request, signal) {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.rawBody,
    signal,
    redirect: 'error',
  });
  return { status: response.status };
}

function syncConfig(env = process.env, secretValue, trustedNowMs = Date.now()) {
  const enabled = env.LV_ZION_WORSHIP_SYNC_ENABLED === 'true';
  const frozen = env.LV_ZION_WORSHIP_SYNC_SOURCE_FROZEN === 'true';
  const keyring = normalizeKeyring(secretValue, env, trustedNowMs);
  return {
    enabled,
    frozen,
    url: env.LV_ZION_WORSHIP_SYNC_URL || '',
    keyId: env.LV_ZION_WORSHIP_SYNC_KEY_ID || '',
    secret: keyring.current.value,
    keyring,
  };
}

function keyringMode(env = {}) {
  return env.LV_ZION_WORSHIP_SYNC_KEYRING_MODE === undefined
    ? KEYRING_MODE_CURRENT
    : env.LV_ZION_WORSHIP_SYNC_KEYRING_MODE;
}

function validateRotationEnvironment(env = {}, trustedNowMs = Date.now()) {
  const mode = keyringMode(env);
  if (mode !== KEYRING_MODE_CURRENT && mode !== KEYRING_MODE_ROTATING) {
    return 'keyring mode is invalid';
  }
  const currentVersion = env.LV_ZION_WORSHIP_SYNC_KEY_VERSION ||
    env.LV_ZION_WORSHIP_SYNC_KEY_ID || 'current';
  if (typeof currentVersion !== 'string' || !ID_PATTERN.test(currentVersion)) {
    return 'current key version is invalid';
  }
  if (mode === KEYRING_MODE_CURRENT) return '';
  const previousVersion = env.LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION;
  const activationValue = env.LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS;
  const previousVersionProvided = previousVersion !== undefined;
  const activationProvided = activationValue !== undefined;
  if (!previousVersionProvided) {
    return 'previous key version is required in rotating mode';
  }
  if (!activationProvided) {
    return 'previous key activation metadata is required in rotating mode';
  }
  if (previousVersionProvided &&
      (typeof previousVersion !== 'string' || !ID_PATTERN.test(previousVersion))) {
    return 'previous key version is invalid';
  }
  if (previousVersionProvided && previousVersion === currentVersion) {
    return 'current and previous key versions must differ';
  }
  if (activationProvided && !previousVersionProvided) {
    return 'previous key version is required with activation metadata';
  }
  if (previousVersionProvided && !activationProvided) {
    return 'previous key activation metadata is required';
  }
  if (!activationProvided) return '';
  if (typeof activationValue !== 'string' || !DECIMAL_13_PATTERN.test(activationValue)) {
    return 'previous key activation metadata is invalid';
  }
  if (!Number.isSafeInteger(trustedNowMs)) return 'trusted clock is invalid';
  const activatedAtMs = Number(activationValue);
  const expiresAtMs = activatedAtMs + PREVIOUS_KEY_OVERLAP_MS;
  if (!Number.isSafeInteger(activatedAtMs) || activatedAtMs < 0 ||
      !Number.isSafeInteger(expiresAtMs) || expiresAtMs < activatedAtMs ||
      trustedNowMs < activatedAtMs) {
    return 'previous key activation metadata is invalid';
  }
  return '';
}

function normalizeKeyring(secretValue, env = {}, trustedNowMs = Date.now()) {
  const mode = keyringMode(env);
  const currentVersion = env.LV_ZION_WORSHIP_SYNC_KEY_VERSION ||
    env.LV_ZION_WORSHIP_SYNC_KEY_ID || 'current';
  const keys = Object.create(null);
  let error = validateRotationEnvironment(env, trustedNowMs);
  let current = secretValue;
  if (secretValue && typeof secretValue === 'object' && !Buffer.isBuffer(secretValue)) {
    current = secretValue.current && typeof secretValue.current === 'object'
      ? secretValue.current.value : secretValue.current;
  }
  if (!error && typeof current === 'string' && current) keys[currentVersion] = current;
  const previous = mode === KEYRING_MODE_ROTATING && secretValue &&
    typeof secretValue === 'object' && !Buffer.isBuffer(secretValue)
    ? secretValue.previous : undefined;
  const previousConfigured = typeof previous === 'string'
    ? previous.length > 0
    : Boolean(previous && typeof previous === 'object' &&
      typeof previous.value === 'string' && previous.value);
  const previousVersion = env.LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION;
  const secretMaterialProvided = secretValue !== undefined && secretValue !== '';
  if (!error && mode === KEYRING_MODE_ROTATING && previousConfigured &&
      (!previousVersion || !ID_PATTERN.test(previousVersion))) {
    error = 'previous key version is required when previous secret is configured';
  } else if (!error && mode === KEYRING_MODE_ROTATING && previousConfigured &&
      previousVersion === currentVersion) {
    error = 'current and previous key versions must differ';
  } else if (!error && mode === KEYRING_MODE_ROTATING && previousConfigured &&
      !DECIMAL_13_PATTERN.test(
    String(env.LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS || ''),
  )) {
    error = 'previous key activation metadata is required';
  } else if (!error && mode === KEYRING_MODE_ROTATING && previousConfigured &&
      !Number.isSafeInteger(trustedNowMs)) {
    error = 'trusted clock is invalid';
  } else if (!error && mode === KEYRING_MODE_ROTATING && previousConfigured) {
    const previousValue = typeof previous === 'string' ? previous : previous.value;
    const activatedAtMs = Number(env.LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS);
    const expiresAtMs = activatedAtMs + PREVIOUS_KEY_OVERLAP_MS;
    if (!Number.isSafeInteger(activatedAtMs) || activatedAtMs < 0 ||
        !Number.isSafeInteger(expiresAtMs) || expiresAtMs < activatedAtMs ||
        trustedNowMs < activatedAtMs) {
      error = 'previous key activation metadata is invalid';
    } else if (trustedNowMs < expiresAtMs && !error) {
      keys[previousVersion] = previousValue;
    }
  }
  if (mode === KEYRING_MODE_ROTATING && secretMaterialProvided && !error &&
      Number.isSafeInteger(trustedNowMs)) {
    const activatedAtMs = Number(env.LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS);
    const expiresAtMs = activatedAtMs + PREVIOUS_KEY_OVERLAP_MS;
    if (previousVersion && Number.isSafeInteger(activatedAtMs) &&
        Number.isSafeInteger(expiresAtMs) && trustedNowMs < expiresAtMs &&
        !previousConfigured) {
      error = 'previous key secret is required during active rotation overlap';
    }
  }
  if (typeof currentVersion !== 'string' || !ID_PATTERN.test(currentVersion)) {
    error = 'current key version is invalid';
  }
  return {
    mode,
    current: { version: currentVersion, value: typeof current === 'string' ? current : '' },
    keys,
    error,
  };
}

function safeReceipt(fields) {
  const allowed = [
    'revision', 'mode', 'sourceSequence', 'snapshotId', 'partIndex', 'partCount',
    'serviceCount', 'bodySha256', 'fullSha256', 'keyId', 'status', 'attempts',
    'durationMs', 'sourceFrozen',
  ];
  const receipt = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) receipt[key] = fields[key];
  }
  return receipt;
}

function logSafe(logger, fields) {
  if (logger && typeof logger.info === 'function') logger.info('worship sync outcome', safeReceipt(fields));
}

function hashRevision(revision) {
  return sha256Hex(revision).slice(0, 32);
}

const PRIVATE_ROOT_COLLECTION = 'worshipVercelSync';
const PRIVATE_STATE_DOCUMENT = 'state';
const PRIVATE_QUEUE_COLLECTION = 'queue';
const PRIVATE_REVISIONS_COLLECTION = 'revisions';
const PRIVATE_SNAPSHOTS_COLLECTION = 'snapshots';
const PRIVATE_LEASES_COLLECTION = 'leases';
const PRIVATE_RECONCILE_LEASE = 'reconcile';
const LEASE_TTL_MS = 30000;
const PRIVATE_STATUSES = new Set([
  'pending', 'in_flight', 'accepted', 'accepted_pending_mapping',
  'failed_retryable', 'failed_terminal', 'unknown',
]);

function privateRootRef(db) {
  return db.collection(PRIVATE_ROOT_COLLECTION);
}

function revisionRef(db, revision) {
  return privateRootRef(db).doc(PRIVATE_REVISIONS_COLLECTION).collection('items').doc(hashRevision(revision));
}

function revisionHashRef(db, revisionHash) {
  return privateRootRef(db).doc(PRIVATE_REVISIONS_COLLECTION).collection('items').doc(revisionHash);
}

function stateRef(db) {
  return privateRootRef(db).doc(PRIVATE_STATE_DOCUMENT);
}

function queueCollection(db) {
  return privateRootRef(db).doc(PRIVATE_QUEUE_COLLECTION).collection('items');
}

function queueRef(db, queueId) {
  return queueCollection(db).doc(queueId);
}

function snapshotIndexRef(db, fullSha256) {
  return privateRootRef(db).doc(PRIVATE_SNAPSHOTS_COLLECTION).collection('items').doc(fullSha256);
}

function reconcileLeaseRef(db) {
  return privateRootRef(db).doc(PRIVATE_LEASES_COLLECTION).collection('items').doc(PRIVATE_RECONCILE_LEASE);
}

function assertPrivateState(data) {
  if (!data || !Number.isSafeInteger(data.lastAllocatedSequence) || data.lastAllocatedSequence < 0 ||
      !Number.isSafeInteger(data.lastDispatchedSequence) || data.lastDispatchedSequence < -1 ||
      !Number.isSafeInteger(data.updatedAtMs) || data.updatedAtMs < 0 ||
      Object.keys(data).some(key => !['lastAllocatedSequence', 'lastDispatchedSequence', 'updatedAtMs'].includes(key))) {
    throw new Error('invalid private sync state');
  }
  if (data.lastDispatchedSequence > data.lastAllocatedSequence) {
    throw new Error('invalid private sync dispatch state');
  }
  return data;
}

function stateFromSnapshot(snapshot) {
  if (!snapshot || !snapshot.exists) {
    return { lastAllocatedSequence: -1, lastDispatchedSequence: -1, updatedAtMs: 0 };
  }
  return assertPrivateState(snapshot.data());
}

function hasOnlyKeys(data, allowed) {
  return Object.keys(data).every(key => allowed.includes(key));
}

function isPrivateChunkManifest(manifest) {
  return Boolean(manifest && typeof manifest === 'object' &&
    hasOnlyKeys(manifest, ['chunkSetId', 'chunkCount', 'rawLength', 'bodySha256', 'keyVersion', 'expiresAtMs']) &&
    ID_PATTERN.test(String(manifest.chunkSetId || '')) &&
    Number.isInteger(manifest.chunkCount) && manifest.chunkCount >= 1 &&
    manifest.chunkCount <= Math.ceil(MAX_BODY_BYTES / CHUNK_PLAINTEXT_BYTES) &&
    Number.isSafeInteger(manifest.rawLength) && manifest.rawLength >= 0 &&
    manifest.rawLength <= MAX_BODY_BYTES &&
    HEX_64_PATTERN.test(String(manifest.bodySha256 || '')) &&
    typeof manifest.keyVersion === 'string' && ID_PATTERN.test(manifest.keyVersion) &&
    Number.isSafeInteger(manifest.expiresAtMs) && manifest.expiresAtMs >= 0);
}

function assertPrivateRevision(data) {
  if (!data || typeof data !== 'object' || !ID_PATTERN.test(String(data.revision || '')) ||
      !hasOnlyKeys(data, ['revision', 'mode', 'sourceSequence', 'generatedAt', 'status', 'operation',
        'serviceCount', 'correctionFingerprint', 'keyVersion', 'attemptCount', 'attempts', 'lastStatus',
        'bodySha256', 'fullSha256', 'snapshotId', 'partBodyHashes', 'partCount', 'chunkManifests',
        'queueIds', 'createdAtMs', 'updatedAtMs']) ||
      !PRIVATE_STATUSES.has(data.status) || !Number.isSafeInteger(data.sourceSequence) ||
      data.sourceSequence < 0 || (data.mode !== 'event' && data.mode !== 'snapshot_part') ||
      !assertTimestampShape(data.generatedAt) || !Number.isInteger(data.partCount) ||
      data.partCount < 1 || data.partCount > MAX_PART_COUNT ||
      !Array.isArray(data.queueIds) || data.queueIds.length !== data.partCount ||
      data.queueIds.some(id => !ID_PATTERN.test(String(id))) ||
      !Array.isArray(data.partBodyHashes) || data.partBodyHashes.length !== data.partCount ||
      data.partBodyHashes.some(hash => !HEX_64_PATTERN.test(String(hash))) ||
      !Array.isArray(data.chunkManifests) || data.chunkManifests.length !== data.partCount ||
      data.chunkManifests.some(manifest => !isPrivateChunkManifest(manifest)) ||
      !HEX_64_PATTERN.test(String(data.correctionFingerprint || '')) ||
      typeof data.keyVersion !== 'string' || !ID_PATTERN.test(data.keyVersion) ||
      !Number.isSafeInteger(data.attemptCount) || data.attemptCount < 0 ||
      !Number.isSafeInteger(data.attempts) || data.attempts < 0 ||
      !(data.lastStatus === null || (Number.isInteger(data.lastStatus) && data.lastStatus >= 100 && data.lastStatus <= 599)) ||
      !Number.isSafeInteger(data.createdAtMs) || data.createdAtMs < 0 ||
      data.updatedAtMs < data.createdAtMs ||
      !Number.isSafeInteger(data.updatedAtMs) || data.updatedAtMs < 0 ||
      !Number.isInteger(data.serviceCount) || data.serviceCount < 0 || data.serviceCount > MAX_SNAPSHOT_SERVICES) {
    throw new Error('invalid private revision state');
  }
  for (const manifest of data.chunkManifests) {
    if (manifest.expiresAtMs < data.createdAtMs ||
        manifest.expiresAtMs > data.createdAtMs + STAGING_TTL_MS) {
      throw new Error('invalid private revision chunk expiry');
    }
  }
  for (let index = 0; index < data.partCount; index += 1) {
    const manifest = data.chunkManifests[index];
    if (data.queueIds[index] !== queueId(data.revision, index) ||
        manifest.bodySha256 !== data.partBodyHashes[index]) {
      throw new Error('invalid private revision manifest invariant');
    }
  }
  if (data.mode === 'event') {
    if ((data.operation !== 'upsert' && data.operation !== 'delete') ||
        data.partCount !== 1 || !HEX_64_PATTERN.test(String(data.bodySha256 || '')) ||
        data.serviceCount !== (data.operation === 'upsert' ? 1 : 0) ||
        data.fullSha256 !== undefined || data.snapshotId !== undefined) {
      throw new Error('invalid private event revision state');
    }
  } else if (!HEX_64_PATTERN.test(String(data.fullSha256 || '')) ||
      typeof data.snapshotId !== 'string' || !ID_PATTERN.test(data.snapshotId) ||
      data.operation !== undefined || data.bodySha256 !== undefined) {
    throw new Error('invalid private snapshot revision state');
  }
  return data;
}

function assertPrivateSnapshotIndex(data) {
  if (!data || typeof data !== 'object' || !HEX_64_PATTERN.test(String(data.fullSha256 || '')) ||
      !hasOnlyKeys(data, ['revision', 'sourceSequence', 'snapshotId', 'fullSha256', 'correctionFingerprint',
        'keyVersion', 'attemptCount', 'status', 'attempts', 'lastStatus', 'updatedAtMs']) ||
      !ID_PATTERN.test(String(data.revision || '')) || !ID_PATTERN.test(String(data.snapshotId || '')) ||
      !PRIVATE_STATUSES.has(data.status) || !Number.isSafeInteger(data.sourceSequence) ||
      data.sourceSequence < 0 || !HEX_64_PATTERN.test(String(data.correctionFingerprint || '')) ||
      typeof data.keyVersion !== 'string' || !ID_PATTERN.test(data.keyVersion) ||
      !Number.isSafeInteger(data.attemptCount) || data.attemptCount < 0 ||
      !Number.isSafeInteger(data.attempts) || data.attempts < 0 ||
      !(data.lastStatus === null || (Number.isInteger(data.lastStatus) && data.lastStatus >= 100 && data.lastStatus <= 599)) ||
      !Number.isSafeInteger(data.updatedAtMs) || data.updatedAtMs < 0) {
    throw new Error('invalid private snapshot index');
  }
  return data;
}

function assertSnapshotIndexMatchesRevision(index, revision) {
  if (index.revision !== revision.revision || index.sourceSequence !== revision.sourceSequence ||
      index.snapshotId !== revision.snapshotId || index.fullSha256 !== revision.fullSha256 ||
      index.correctionFingerprint !== revision.correctionFingerprint ||
      index.keyVersion !== revision.keyVersion || index.attemptCount !== revision.attemptCount ||
      index.status !== revision.status || index.attempts !== revision.attempts ||
      index.lastStatus !== revision.lastStatus) {
    throw new Error('invalid private snapshot cross-document state');
  }
}

function assertTimestampShape(value) {
  return typeof value === 'string' && DECIMAL_13_PATTERN.test(value);
}

function assertPrivateQueue(data) {
  if (!data || typeof data !== 'object' || !ID_PATTERN.test(String(data.revision || '')) ||
      !hasOnlyKeys(data, ['revision', 'mode', 'operation', 'sourceSequence', 'partIndex', 'partCount',
        'bodySha256', 'fullSha256', 'snapshotId', 'serviceCount', 'chunkSetId', 'chunkCount', 'rawLength',
        'keyVersion', 'correctionFingerprint', 'status', 'attempts', 'lastStatus', 'nextAttemptAtMs',
        'leaseId', 'leaseExpiresAtMs', 'createdAtMs', 'updatedAtMs']) ||
      (data.mode !== 'event' && data.mode !== 'snapshot_part') ||
      !PRIVATE_STATUSES.has(data.status) ||
      !Number.isSafeInteger(data.sourceSequence) || data.sourceSequence < 0 ||
      !Number.isInteger(data.partIndex) || data.partIndex < 0 ||
      !Number.isInteger(data.partCount) || data.partCount < 1 || data.partIndex >= data.partCount ||
      !HEX_64_PATTERN.test(String(data.bodySha256 || '')) ||
      !ID_PATTERN.test(String(data.chunkSetId || '')) ||
      !Number.isInteger(data.chunkCount) || data.chunkCount < 1 ||
      data.chunkCount > Math.ceil(MAX_BODY_BYTES / CHUNK_PLAINTEXT_BYTES) ||
      !Number.isSafeInteger(data.rawLength) || data.rawLength < 0 ||
      data.rawLength > MAX_BODY_BYTES ||
      typeof data.keyVersion !== 'string' || !data.keyVersion ||
      !HEX_64_PATTERN.test(String(data.correctionFingerprint || '')) ||
      !Number.isSafeInteger(data.attempts) || data.attempts < 0 ||
      !(data.lastStatus === null || (Number.isInteger(data.lastStatus) && data.lastStatus >= 100 && data.lastStatus <= 599)) ||
      !Number.isSafeInteger(data.nextAttemptAtMs) || data.nextAttemptAtMs < 0 ||
      (data.leaseId !== null && (typeof data.leaseId !== 'string' || !ID_PATTERN.test(data.leaseId))) ||
      !Number.isSafeInteger(data.leaseExpiresAtMs) || data.leaseExpiresAtMs < 0 ||
      !Number.isSafeInteger(data.createdAtMs) || data.createdAtMs < 0 ||
      !Number.isSafeInteger(data.updatedAtMs) || data.updatedAtMs < 0 ||
      data.updatedAtMs < data.createdAtMs ||
      !Number.isSafeInteger(data.serviceCount) || data.serviceCount < 0 || data.serviceCount > MAX_SNAPSHOT_SERVICES ||
      data.partCount > MAX_PART_COUNT ||
      (data.leaseId === null && data.leaseExpiresAtMs !== 0) ||
      (data.leaseId !== null && data.status !== 'in_flight') ||
      (data.status === 'in_flight' && data.leaseId === null) ||
      (data.mode === 'event' && (data.operation !== 'upsert' && data.operation !== 'delete')) ||
      (data.mode === 'event' && (data.fullSha256 !== undefined || data.snapshotId !== undefined)) ||
      (data.mode === 'snapshot_part' && (!HEX_64_PATTERN.test(String(data.fullSha256 || '')) ||
        !ID_PATTERN.test(String(data.snapshotId || '')) || data.operation !== undefined))) {
    throw new Error('invalid private queue state');
  }
  return data;
}

function keyForVersion(keyring, version) {
  const value = keyring && keyring.keys && keyring.keys[version];
  if (typeof value !== 'string' || !value) throw new Error('private queue key version unavailable');
  return crypto.createHash('sha256')
    .update(Buffer.from('lv-zion-worship-sync:queue-key:v1\n' + value, 'utf8'))
    .digest();
}

function chunkAad(candidateId, chunkIndex, chunkCount, keyVersion) {
  return Buffer.from('lv-zion-worship-sync:queue-chunk:v1\n' +
    candidateId + '\n' + String(chunkIndex) + '\n' + String(chunkCount) + '\n' + keyVersion, 'utf8');
}

function encryptChunk(plaintext, candidateId, chunkIndex, chunkCount, keyring, keyVersion) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyForVersion(keyring, keyVersion), iv);
  cipher.setAAD(chunkAad(candidateId, chunkIndex, chunkCount, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { version: 1, keyVersion, iv, tag: cipher.getAuthTag(), ciphertext };
}

function decryptChunk(chunk, candidateId, chunkIndex, chunkCount, keyring) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', keyForVersion(keyring, chunk.keyVersion), chunk.iv,
  );
  decipher.setAAD(chunkAad(candidateId, chunkIndex, chunkCount, chunk.keyVersion));
  decipher.setAuthTag(chunk.tag);
  return Buffer.concat([decipher.update(chunk.ciphertext), decipher.final()]);
}

function queueId(revisionHash, partIndex) {
  return revisionHash + '-part-' + String(partIndex);
}

function normalizeParts(built) {
  if (Array.isArray(built && built.parts)) return built.parts;
  if (built && built.rawBody !== undefined) return [built];
  throw new Error('sender build did not return raw body parts');
}

function safeBuildMetadata(metadata) {
  const copy = {};
  const allowed = ['mode', 'operation', 'generatedAt', 'fullSha256', 'serviceCount',
    'correctionFingerprint', 'keyVersion', 'attemptCount', 'snapshotId'];
  for (const key of allowed) {
    if (metadata[key] !== undefined) copy[key] = metadata[key];
  }
  return copy;
}

function shouldCreateFreshAttempt(existing, metadata) {
  if (!existing || existing.status !== 'failed_terminal') return false;
  if (existing.correctionFingerprint && metadata.correctionFingerprint &&
      existing.correctionFingerprint !== metadata.correctionFingerprint) return true;
  // A snapshot conflict means its generation is unusable and needs a fresh
  // identity. An unchanged event 409 is a terminal replay, since changing
  // only its source identity would blindly repeat the same conflict.
  if (existing.lastStatus === 409 && metadata.mode === 'snapshot_part') return true;
  if (EXPIRY_STATUSES.has(existing.lastStatus)) return true;
  if (existing.lastStatus === 401 && existing.keyVersion !== metadata.keyVersion) return true;
  return false;
}

function canReuseSnapshotAttempt(existing, metadata, lastAllocatedSequence) {
  if (!existing) return false;
  if (existing.status === 'failed_terminal') {
    return !shouldCreateFreshAttempt(existing, metadata);
  }
  // An unresolved attempt keeps its identity and exact bytes even if an
  // unrelated event has advanced the global allocator. It must be resolved
  // before a later snapshot generation can be allocated.
  if (!isQueueResolved(existing.status)) return true;
  return existing.sourceSequence === lastAllocatedSequence;
}

function safeBuiltMetadata(built) {
  const copy = {};
  for (const key of ['bodySha256', 'fullSha256', 'snapshotId', 'partBodyHashes', 'partCount']) {
    if (built[key] !== undefined) copy[key] = built[key];
  }
  return copy;
}

function stripUndefinedFields(value) {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}

function isBinary(value) {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

function chunkSetCollection(db, chunkSetId) {
  return privateRootRef(db).doc('chunks').collection('sets').doc(chunkSetId).collection('items');
}

function chunkSetsCollection(db) {
  return privateRootRef(db).doc('chunks').collection('sets');
}

function chunkSetMarkerRef(db, chunkSetId) {
  return chunkSetsCollection(db).doc(chunkSetId);
}

function assertPrivateChunkSetMarker(data) {
  if (!data || typeof data !== 'object' ||
      !hasOnlyKeys(data, ['version', 'chunkSetId', 'status', 'revision', 'createdAtMs', 'expiresAtMs']) ||
      data.version !== 1 || !ID_PATTERN.test(String(data.chunkSetId || '')) ||
      !['staged', 'active', 'resolved', 'empty'].includes(data.status) ||
      !(data.revision === null || (typeof data.revision === 'string' && ID_PATTERN.test(data.revision))) ||
      (data.status === 'staged' && data.revision !== null) ||
      (data.status !== 'staged' && typeof data.revision !== 'string') ||
      !Number.isSafeInteger(data.createdAtMs) || data.createdAtMs < 0 ||
      !Number.isSafeInteger(data.expiresAtMs) || data.expiresAtMs < data.createdAtMs ||
      data.expiresAtMs > data.createdAtMs + STAGING_TTL_MS) {
    throw new Error('invalid private chunk set marker');
  }
  return data;
}

function assertPrivateChunk(data) {
  if (!data || typeof data !== 'object' || !hasOnlyKeys(data, ['version', 'chunkSetId', 'chunkIndex', 'chunkCount',
      'plaintextLength', 'bodySha256', 'keyVersion', 'iv', 'tag', 'ciphertext', 'createdAtMs', 'expiresAtMs']) ||
      data.version !== 1 || !ID_PATTERN.test(String(data.chunkSetId || '')) ||
      !Number.isInteger(data.chunkIndex) || data.chunkIndex < 0 ||
      !Number.isInteger(data.chunkCount) || data.chunkCount < 1 || data.chunkIndex >= data.chunkCount ||
      data.chunkCount > Math.ceil(MAX_BODY_BYTES / CHUNK_PLAINTEXT_BYTES) ||
      !Number.isSafeInteger(data.plaintextLength) || data.plaintextLength < 0 ||
      data.plaintextLength > CHUNK_PLAINTEXT_BYTES ||
      !HEX_64_PATTERN.test(String(data.bodySha256 || '')) ||
      !Number.isSafeInteger(data.expiresAtMs) || data.expiresAtMs < 0 ||
      !Number.isSafeInteger(data.createdAtMs) || data.createdAtMs < 0 ||
      typeof data.keyVersion !== 'string' || !ID_PATTERN.test(data.keyVersion) || !isBinary(data.iv) ||
      !isBinary(data.tag) || !isBinary(data.ciphertext) ||
      data.iv.length !== 12 || data.tag.length !== 16 ||
      data.ciphertext.length !== data.plaintextLength) {
    throw new Error('invalid private chunk state');
  }
  if (data.ciphertext.length + data.iv.length + data.tag.length > MAX_CHUNK_DOCUMENT_BYTES) {
    throw new Error('private chunk exceeds document limit');
  }
  if (data.expiresAtMs < data.createdAtMs ||
      data.expiresAtMs > data.createdAtMs + STAGING_TTL_MS ||
      estimateChunkDocumentBytes(data) >= MAX_CHUNK_DOCUMENT_BYTES) {
    throw new Error('invalid private chunk expiry or document size');
  }
  return data;
}

function chunkDocumentId(index) {
  return String(index).padStart(6, '0');
}

function estimateChunkDocumentBytes(data) {
  return data.ciphertext.length + data.iv.length + data.tag.length +
    Buffer.byteLength(JSON.stringify({ ...data, ciphertext: '', iv: '', tag: '' }), 'utf8');
}

function estimateStoredDocumentBytes(data) {
  return data && isBinary(data.ciphertext)
    ? estimateChunkDocumentBytes(data)
    : Buffer.byteLength(JSON.stringify(data), 'utf8');
}

async function commitChunkBatch(db, writes) {
  if (!writes.length) return;
  if (typeof db.batch === 'function') {
    const batch = db.batch();
    let bytes = 0;
    for (let index = 0; index < writes.length; index += 1) {
      const write = writes[index];
      const size = estimateStoredDocumentBytes(write.data);
      if (index >= CHUNK_BATCH_MAX_WRITES || bytes + size > CHUNK_BATCH_MAX_BYTES) {
        throw new Error('chunk batch exceeds bounded request limit');
      }
      bytes += size;
      batch.set(write.ref, write.data);
    }
    await batch.commit();
    return;
  }
  for (const write of writes) await write.ref.set(write.data);
}

async function stageChunkParts(db, parts, keyring, keyVersion, candidateSeed, nowMs) {
  if (!keyring || !keyring.keys || !keyring.keys[keyVersion]) throw new Error('missing queue encryption key');
  const candidateId = hashRevision('candidate:' + candidateSeed + ':' +
    crypto.randomBytes(16).toString('hex'));
  const manifests = [];
  const chunkSetIds = [];
  let writes = [];
  let batchBytes = 0;
  const flush = async () => {
    if (!writes.length) return;
    await commitChunkBatch(db, writes);
    writes = [];
    batchBytes = 0;
  };
  try {
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const rawBody = assertBodyLimit(parts[partIndex].rawBody);
      const chunkSetId = hashRevision(candidateId + ':part:' + String(partIndex));
      chunkSetIds.push(chunkSetId);
      const marker = {
        version: 1,
        chunkSetId,
        status: 'staged',
        revision: null,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + STAGING_TTL_MS,
      };
      const markerBytes = estimateStoredDocumentBytes(marker);
      if (writes.length && (writes.length >= CHUNK_BATCH_MAX_WRITES ||
          batchBytes + markerBytes > CHUNK_BATCH_MAX_BYTES)) await flush();
      writes.push({ ref: chunkSetMarkerRef(db, chunkSetId), data: marker });
      batchBytes += markerBytes;
      const chunkCount = Math.max(1, Math.ceil(rawBody.length / CHUNK_PLAINTEXT_BYTES));
      const manifest = {
        chunkSetId,
        chunkCount,
        rawLength: rawBody.length,
        bodySha256: parts[partIndex].bodySha256 || sha256Hex(rawBody),
        keyVersion,
        expiresAtMs: nowMs + STAGING_TTL_MS,
      };
      if (sha256Hex(rawBody) !== manifest.bodySha256) throw new Error('private queue body hash mismatch');
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * CHUNK_PLAINTEXT_BYTES;
        const plaintext = rawBody.subarray(start, Math.min(rawBody.length, start + CHUNK_PLAINTEXT_BYTES));
        const encrypted = encryptChunk(plaintext, chunkSetId, chunkIndex, chunkCount, keyring, keyVersion);
        const data = stripUndefinedFields({
          version: 1,
          chunkSetId,
          chunkIndex,
          chunkCount,
          plaintextLength: plaintext.length,
          bodySha256: manifest.bodySha256,
          keyVersion,
          iv: encrypted.iv,
          tag: encrypted.tag,
          ciphertext: encrypted.ciphertext,
          createdAtMs: nowMs,
          expiresAtMs: manifest.expiresAtMs,
        });
        const docBytes = estimateChunkDocumentBytes(data);
        if (docBytes >= MAX_CHUNK_DOCUMENT_BYTES) throw new Error('private chunk exceeds document limit');
        if (writes.length && (writes.length >= CHUNK_BATCH_MAX_WRITES || batchBytes + docBytes > CHUNK_BATCH_MAX_BYTES)) await flush();
        writes.push({ ref: chunkSetCollection(db, chunkSetId).doc(chunkDocumentId(chunkIndex)), data });
        batchBytes += docBytes;
      }
      manifests.push(manifest);
    }
    await flush();
    return { candidateId, manifests };
  } catch (error) {
    await discardChunkCandidate(db, chunkSetIds);
    throw error;
  }
}

async function discardChunkCandidate(db, chunkSetIds) {
  for (const chunkSetId of chunkSetIds) {
    const snap = await chunkSetCollection(db, chunkSetId).get();
    for (const doc of snap.docs || []) {
      if (doc.ref && typeof doc.ref.delete === 'function') await doc.ref.delete();
    }
    const marker = chunkSetMarkerRef(db, chunkSetId);
    const markerSnap = await marker.get();
    if (markerSnap.exists && typeof marker.delete === 'function') await marker.delete();
  }
}

async function cleanupExpiredResolvedChunks(db, nowMs, options = {}) {
  const maxSets = Number.isInteger(options.maxSets) ? options.maxSets : MAX_CLEANUP_CHUNK_SETS;
  const maxChunks = Number.isInteger(options.maxChunks) ? options.maxChunks : MAX_CLEANUP_CHUNKS;
  const markerQueries = ['staged', 'resolved'].map(status =>
    chunkSetsCollection(db)
      .where('status', '==', status)
      .where('expiresAtMs', '<=', nowMs)
      .orderBy('expiresAtMs')
      .orderBy('__name__')
      .limit(maxSets)
      .get());
  const markerSnapshots = await Promise.all(markerQueries);
  const markerDocs = markerSnapshots.flatMap(snapshot => snapshot.docs || [])
    .sort((left, right) => compareText(left.id, right.id));
  let sets = 0;
  let chunks = 0;
  for (const doc of markerDocs) {
    if (sets >= maxSets || chunks >= maxChunks) break;
    const marker = assertPrivateChunkSetMarker(doc.data());
    if (marker.status === 'empty') continue;
    const chunkSnap = await chunkSetCollection(db, marker.chunkSetId).get();
    const chunkDocs = [...(chunkSnap.docs || [])]
      .sort((left, right) => compareText(left.id, right.id));
    for (const chunkDoc of chunkDocs) {
      if (chunks >= maxChunks) break;
      const chunk = assertPrivateChunk(chunkDoc.data());
      if (chunk.chunkSetId !== marker.chunkSetId) {
        throw new Error('invalid private resolved chunk invariant');
      }
      if (chunkDoc.ref && typeof chunkDoc.ref.delete === 'function') {
        await chunkDoc.ref.delete();
        chunks += 1;
      }
    }
    if (chunks < maxChunks) {
      if (marker.status === 'staged') {
        // Staged candidates have no revision identity. Delete the marker after
        // draining its chunks because an empty marker cannot pass the private
        // marker schema without a revision.
        await chunkSetMarkerRef(db, marker.chunkSetId).delete();
      } else {
        await chunkSetMarkerRef(db, marker.chunkSetId).set({ status: 'empty' }, { merge: true });
      }
      sets += 1;
    }
  }
  return { sets, chunks, bounded: sets >= maxSets || chunks >= maxChunks };
}

async function readChunkBody(db, manifest, keyring, nowMs) {
  if (!manifest || !ID_PATTERN.test(String(manifest.chunkSetId || '')) ||
      !Number.isInteger(manifest.chunkCount) || manifest.chunkCount < 1 ||
      !Number.isSafeInteger(manifest.rawLength) || manifest.rawLength < 0 ||
      !HEX_64_PATTERN.test(String(manifest.bodySha256 || '')) ||
      typeof manifest.keyVersion !== 'string' || !ID_PATTERN.test(manifest.keyVersion)) {
    throw new Error('invalid private queue manifest');
  }
  const snap = await chunkSetCollection(db, manifest.chunkSetId).get();
  const docs = validateChunkSet(manifest, snap.docs || []);
  const buffers = [];
  let total = 0;
  for (let index = 0; index < docs.length; index += 1) {
    const chunk = docs[index];
    if (chunk.expiresAtMs <= nowMs) {
      const error = new Error('private chunk expired');
      error.code = 'CHUNK_EXPIRED';
      throw error;
    }
    if (chunk.chunkSetId !== manifest.chunkSetId || chunk.chunkIndex !== index ||
        chunk.chunkCount !== manifest.chunkCount || chunk.bodySha256 !== manifest.bodySha256 ||
        chunk.keyVersion !== manifest.keyVersion) {
      throw new Error('invalid private chunk manifest invariant');
    }
    const plaintext = decryptChunk(chunk, manifest.chunkSetId, index, manifest.chunkCount, keyring);
    if (plaintext.length !== chunk.plaintextLength) throw new Error('private chunk length mismatch');
    buffers.push(plaintext);
    total += plaintext.length;
  }
  if (total !== manifest.rawLength) throw new Error('private body length mismatch');
  const body = Buffer.concat(buffers);
  if (sha256Hex(body) !== manifest.bodySha256) throw new Error('private body hash mismatch');
  return body;
}

function validateChunkSet(manifest, rawDocs) {
  const docs = rawDocs.map(doc => assertPrivateChunk(typeof doc.data === 'function' ? doc.data() : doc))
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
  if (docs.length !== manifest.chunkCount) throw new Error('private chunk count mismatch');
  for (let index = 0; index < docs.length; index += 1) {
    const chunk = docs[index];
    if (chunk.chunkSetId !== manifest.chunkSetId || chunk.chunkIndex !== index ||
        chunk.chunkCount !== manifest.chunkCount || chunk.bodySha256 !== manifest.bodySha256 ||
        chunk.keyVersion !== manifest.keyVersion) {
      throw new Error('invalid private chunk manifest invariant');
    }
  }
  return docs;
}

async function reserveRevision(db, revision, buildForSequence, metadata = {}) {
  const baseRevision = revision;
  let candidateRevision = baseRevision;
  let attemptCount = 0;
  for (let effort = 0; effort < 5; effort += 1) {
    const existingSnap = await revisionRef(db, candidateRevision).get();
    if (existingSnap.exists) {
      const existing = assertPrivateRevision(existingSnap.data());
      if (shouldCreateFreshAttempt(existing, metadata)) {
        attemptCount = Math.max(attemptCount + 1, existing.attemptCount + 1);
        candidateRevision = baseRevision + ':retry:' + String(attemptCount);
        continue;
      }
      return { ...existing, existing: true };
    }
    const stateData = stateFromSnapshot(await stateRef(db).get());
    const prior = stateData.lastAllocatedSequence;
    const sequence = assertSequence(prior + 1);
    const built = await buildForSequence(sequence, metadata.generatedAt);
    const parts = normalizeParts(built);
    const staged = await stageChunkParts(
      db, parts, metadata.keyring, metadata.keyVersion,
      candidateRevision + ':' + String(sequence), Number(metadata.nowMs || Date.now()),
    );
    try {
      const result = await db.runTransaction(async tx => {
        const [currentSnap, currentStateSnap] = await Promise.all([
          tx.get(revisionRef(db, candidateRevision)), tx.get(stateRef(db)),
        ]);
        if (currentSnap.exists) return { ...assertPrivateRevision(currentSnap.data()), existing: true };
        const currentState = stateFromSnapshot(currentStateSnap);
        if (currentState.lastAllocatedSequence !== prior) throw new SequenceChangedError();
        const markerSnaps = await Promise.all(staged.manifests.map(manifest =>
          tx.get(chunkSetMarkerRef(db, manifest.chunkSetId))));
        markerSnaps.forEach((markerSnap, index) => {
          if (!markerSnap.exists) throw new Error('missing private chunk set marker');
          const marker = assertPrivateChunkSetMarker(markerSnap.data());
          if (marker.chunkSetId !== staged.manifests[index].chunkSetId || marker.status !== 'staged') {
            throw new Error('invalid private chunk set marker');
          }
        });
        const revisionHash = hashRevision(candidateRevision);
        const cleanMetadata = safeBuildMetadata({ ...metadata, attemptCount });
        const entry = stripUndefinedFields({
          revision: revisionHash,
          mode: cleanMetadata.mode,
          sourceSequence: sequence,
          generatedAt: metadata.generatedAt,
          status: 'pending',
          ...cleanMetadata,
          ...safeBuiltMetadata(built),
          partCount: parts.length,
          attempts: 0,
          lastStatus: null,
          bodySha256: parts.length === 1 ? staged.manifests[0].bodySha256 : undefined,
          partBodyHashes: staged.manifests.map(manifest => manifest.bodySha256),
          chunkManifests: staged.manifests,
          queueIds: parts.map((_part, index) => queueId(revisionHash, index)),
          createdAtMs: Number(metadata.nowMs || Date.now()),
          updatedAtMs: Number(metadata.nowMs || Date.now()),
        });
        for (let index = 0; index < parts.length; index += 1) {
          const manifest = staged.manifests[index];
          tx.create(queueRef(db, entry.queueIds[index]), stripUndefinedFields({
            revision: revisionHash,
            mode: cleanMetadata.mode,
            operation: cleanMetadata.operation,
            sourceSequence: sequence,
            partIndex: index,
            partCount: parts.length,
            bodySha256: manifest.bodySha256,
            fullSha256: entry.fullSha256,
            snapshotId: entry.snapshotId,
            serviceCount: entry.serviceCount,
            chunkSetId: manifest.chunkSetId,
            chunkCount: manifest.chunkCount,
            rawLength: manifest.rawLength,
            keyVersion: manifest.keyVersion,
            correctionFingerprint: entry.correctionFingerprint,
            status: 'pending',
            attempts: 0,
            lastStatus: null,
            nextAttemptAtMs: 0,
            leaseId: null,
            leaseExpiresAtMs: 0,
            createdAtMs: entry.createdAtMs,
            updatedAtMs: entry.updatedAtMs,
          }));
          tx.set(chunkSetMarkerRef(db, manifest.chunkSetId), {
            status: 'active',
            revision: entry.revision,
          }, { merge: true });
        }
        tx.create(revisionHashRef(db, revisionHash), entry);
        tx.set(stateRef(db), {
          lastAllocatedSequence: sequence,
          lastDispatchedSequence: currentState.lastDispatchedSequence,
          updatedAtMs: entry.updatedAtMs,
        }, { merge: true });
        return entry;
      });
      if (result && result.existing) {
        await discardChunkCandidate(db, staged.manifests.map(manifest => manifest.chunkSetId));
      }
      return result;
    } catch (error) {
      await discardChunkCandidate(db, staged.manifests.map(manifest => manifest.chunkSetId));
      if (error && error.code === 'SEQUENCE_CHANGED') continue;
      throw error;
    }
  }
  throw new Error('sequence changed during private reservation');
}

async function updateRevision(db, revision, fields) {
  await revisionRef(db, revision).set(fields, { merge: true });
}

async function updateRevisionHash(db, revisionHash, fields) {
  await revisionHashRef(db, revisionHash).set(fields, { merge: true });
}

function configForInvocation(deps = {}) {
  const env = deps.env || process.env;
  const trustedNowMs = invocationNow(deps);
  const environmentConfig = syncConfig(env, '', trustedNowMs);
  if (environmentConfig.keyring.error) return environmentConfig;
  if (env.LV_ZION_WORSHIP_SYNC_ENABLED !== 'true') return environmentConfig;
  if (env.LV_ZION_WORSHIP_SYNC_SOURCE_FROZEN === 'true') return environmentConfig;
  let secret = deps.secret;
  if (typeof deps.secretProvider === 'function') {
    secret = deps.secretProvider(environmentConfig.keyring.mode);
  }
  return syncConfig(env, secret, trustedNowMs);
}

function missingConfiguration(config) {
  return !config.url || !config.keyId || !config.secret ||
    Boolean(config.keyring && config.keyring.error);
}

function keyVersionFor(config) {
  return config.keyring && config.keyring.current && config.keyring.current.version
    ? config.keyring.current.version : config.keyId;
}

function eventCorrectionFingerprint(operation, service) {
  return sha256Hex(canonicalBytes({ operation, service }));
}

function invocationNow(deps = {}) {
  if (typeof deps.now === 'function') return Number(deps.now());
  if (deps.now !== undefined) return Number(deps.now);
  return Date.now();
}

async function deliverPart(part, config, context = {}) {
  const timestamp = context.timestamp || String(Date.now());
  const request = buildSignedRequest({
    rawBody: part.rawBody,
    timestamp,
    keyId: config.keyId,
    secret: config.secret,
    url: config.url,
  });
  const result = await sendWithRetry(request, {
    sendRequest: context.sendRequest,
    sleep: context.sleep,
    now: typeof context.now === 'function' ? context.now :
      (() => (context.now === undefined ? Date.now() : Number(context.now))),
    timeoutMs: context.timeoutMs,
    budgetMs: context.budgetMs,
  });
  return { ...result, bodySha256: part.bodySha256, request };
}

function queueOrder(left, right) {
  return left.sourceSequence - right.sourceSequence || left.partIndex - right.partIndex ||
    compareText(left.revision, right.revision);
}

function isQueueResolved(status) {
  return status === 'accepted' || status === 'accepted_pending_mapping' || status === 'failed_terminal';
}

function assertQueueMatchesRevision(data, revision, itemId) {
  const manifest = revision.chunkManifests[data.partIndex];
  if (data.mode !== revision.mode || data.operation !== revision.operation ||
      data.sourceSequence !== revision.sourceSequence || data.partCount !== revision.partCount ||
      revision.queueIds[data.partIndex] !== itemId ||
      revision.partBodyHashes[data.partIndex] !== data.bodySha256 ||
      data.fullSha256 !== revision.fullSha256 || data.snapshotId !== revision.snapshotId ||
      data.serviceCount !== revision.serviceCount || !manifest ||
      manifest.chunkSetId !== data.chunkSetId || manifest.chunkCount !== data.chunkCount ||
      manifest.rawLength !== data.rawLength || manifest.keyVersion !== data.keyVersion ||
      revision.correctionFingerprint !== data.correctionFingerprint ||
      revision.keyVersion !== data.keyVersion) {
    throw new Error('invalid private queue cross-document state');
  }
  return manifest;
}

async function claimNextQueue(db, nowMs, options = {}) {
  return db.runTransaction(async tx => {
    const snap = await tx.get(queueCollection(db));
    const items = (snap.docs || []).map(doc => ({
      ref: doc.ref || queueRef(db, doc.id),
      id: doc.id,
      data: assertPrivateQueue(doc.data()),
    })).sort((left, right) => queueOrder(left.data, right.data));
    const revisionHashes = [...new Set(items.map(item => item.data.revision))];
    const revisions = new Map();
    for (const revisionHash of revisionHashes) {
      const revisionSnap = await tx.get(revisionHashRef(db, revisionHash));
      if (!revisionSnap.exists) throw new Error('missing private revision state');
      revisions.set(revisionHash, assertPrivateRevision(revisionSnap.data()));
    }
    for (const revision of revisions.values()) {
      // The index is the current generation pointer. Historical resolved
      // revisions can legitimately share a full hash with a newer generation
      // and therefore no longer be the index target.
      if (revision.mode !== 'snapshot_part' || isQueueResolved(revision.status)) continue;
      const indexSnap = await tx.get(snapshotIndexRef(db, revision.fullSha256));
      if (!indexSnap.exists) throw new Error('missing private snapshot index');
      assertSnapshotIndexMatchesRevision(assertPrivateSnapshotIndex(indexSnap.data()), revision);
    }
    for (const item of items) {
      const data = item.data;
      const revision = revisions.get(data.revision);
      const manifest = assertQueueMatchesRevision(data, revision, item.id);
      const markerSnap = await tx.get(chunkSetMarkerRef(db, data.chunkSetId));
      if (!markerSnap.exists) throw new Error('missing private chunk set marker');
      const marker = assertPrivateChunkSetMarker(markerSnap.data());
      if (marker.chunkSetId !== data.chunkSetId ||
          (isQueueResolved(data.status)
            ? (isQueueResolved(revision.status)
              ? (marker.status !== 'resolved' && marker.status !== 'empty')
              : marker.status !== 'active')
            : (marker.status !== 'active' || marker.revision !== data.revision))) {
        throw new Error('invalid private chunk set marker');
      }
      if (isQueueResolved(data.status)) {
        // Resolved chunk sets may have been deterministically cleaned. If any
        // documents remain, validate them before allowing another item out.
        const resolvedChunkSnap = await tx.get(chunkSetCollection(db, data.chunkSetId));
        if ((resolvedChunkSnap.docs || []).length) {
          validateChunkSet(manifest, resolvedChunkSnap.docs || []);
        }
        continue;
      }
      const chunkSnap = await tx.get(chunkSetCollection(db, data.chunkSetId));
      validateChunkSet(manifest, chunkSnap.docs || []);
      if (options.eventOnly && data.mode !== 'event') return null;
      const activeLease = data.status === 'in_flight' && data.leaseId &&
        Number.isSafeInteger(data.leaseExpiresAtMs) && data.leaseExpiresAtMs > nowMs;
      if (activeLease) return null;
      if (Number.isSafeInteger(data.nextAttemptAtMs) && data.nextAttemptAtMs > nowMs) return null;
      const leaseId = crypto.randomBytes(16).toString('hex');
      tx.set(item.ref, {
        status: 'in_flight',
        leaseId,
        leaseExpiresAtMs: nowMs + LEASE_TTL_MS,
        attempts: Number.isSafeInteger(data.attempts) ? data.attempts : 0,
      }, { merge: true });
      return { ...data, id: item.id, leaseId };
    }
    return null;
  });
}

async function summarizeRevision(db, revisionHash) {
  const revisionSnap = await revisionHashRef(db, revisionHash).get();
  if (!revisionSnap.exists) throw new Error('missing private revision state');
  const revision = assertPrivateRevision(revisionSnap.data());
  if (revision.mode === 'snapshot_part') {
    const indexSnap = await snapshotIndexRef(db, revision.fullSha256).get();
    if (!indexSnap.exists) throw new Error('missing private snapshot index');
    assertSnapshotIndexMatchesRevision(assertPrivateSnapshotIndex(indexSnap.data()), revision);
  }
  const queueSnap = await queueCollection(db).get();
  const items = (queueSnap.docs || [])
    .map(doc => assertPrivateQueue(doc.data()))
    .filter(item => item.revision === revisionHash);
  if (items.length !== revision.partCount) throw new Error('incomplete private queue state');
  const byIndex = new Map(items.map(item => [item.partIndex, item]));
  if (byIndex.size !== revision.partCount || [...Array(revision.partCount).keys()].some(index => !byIndex.has(index))) {
    throw new Error('invalid private queue part order');
  }
  for (const item of items) {
    assertQueueMatchesRevision(item, revision, revision.queueIds[item.partIndex]);
  }
  let status = 'accepted';
  if (items.some(item => item.status === 'unknown' || item.status === 'pending' || item.status === 'in_flight' || item.status === 'failed_retryable')) {
    status = 'unknown';
  } else if (items.some(item => item.status === 'failed_terminal')) {
    status = 'failed_terminal';
  } else if (items.some(item => item.status === 'accepted_pending_mapping')) {
    status = 'accepted_pending_mapping';
  }
  return { revision, items, status };
}

async function finalizeQueueItem(db, claimed, result, nowMs) {
  let status;
  if (result.kind === 'accepted') {
    status = result.status === 202 ? 'accepted_pending_mapping' : 'accepted';
  } else if (result.kind === 'failed') {
    status = isRetryableStatus(result.status) ? 'failed_retryable' : 'failed_terminal';
  } else {
    status = 'unknown';
  }
  // The next invocation may retry immediately. Ordering is enforced by the
  // durable queue, so no wall-clock delay is needed to prevent overtaking.
  const nextAttemptAtMs = 0;
  return db.runTransaction(async tx => {
    const queueSnap = await tx.get(queueCollection(db));
    const revisionSnap = await tx.get(revisionHashRef(db, claimed.revision));
    const stateSnap = await tx.get(stateRef(db));
    if (!revisionSnap.exists) throw new Error('missing private revision state');
    const revision = assertPrivateRevision(revisionSnap.data());
    const state = stateFromSnapshot(stateSnap);
    const docs = (queueSnap.docs || []).map(doc => ({
      doc,
      data: assertPrivateQueue(doc.data()),
    }));
    const target = docs.find(item => item.doc.id === claimed.id || item.doc.ref && item.doc.ref.path.endsWith('/' + claimed.id));
    if (!target || target.data.revision !== claimed.revision) throw new Error('missing private queue state');
    if (target.data.leaseId !== claimed.leaseId) return { applied: false };
    assertQueueMatchesRevision(target.data, revision, claimed.id);
    const nextItems = docs.map(item => ({ id: item.doc.id, data: { ...item.data } }));
    for (const item of nextItems) {
      if (item.data.revision === claimed.revision && item.data.partIndex === target.data.partIndex) {
        item.data.status = status;
        item.data.lastStatus = result.status || null;
        item.data.attempts = result.attempts;
        item.data.nextAttemptAtMs = nextAttemptAtMs;
        item.data.leaseId = null;
        item.data.leaseExpiresAtMs = 0;
        item.data.updatedAtMs = nowMs;
      } else if (status === 'failed_terminal' && target.data.mode === 'snapshot_part' &&
                 item.data.revision === claimed.revision && !isQueueResolved(item.data.status)) {
        item.data.status = 'failed_terminal';
        item.data.nextAttemptAtMs = 0;
        item.data.leaseId = null;
        item.data.leaseExpiresAtMs = 0;
        item.data.updatedAtMs = nowMs;
      }
    }
    const summaryItems = nextItems.filter(item => item.data.revision === claimed.revision)
      .map(item => item.data);
    const summaryStatus = summarizeQueueItems(revision, summaryItems);
    for (const item of nextItems) {
      const original = docs.find(candidate => candidate.doc.id === item.id);
      if (original && JSON.stringify(original.data) !== JSON.stringify(item.data)) {
        tx.set(original.doc.ref || queueRef(db, item.id), item.data, { merge: true });
      }
    }
    tx.set(revisionHashRef(db, claimed.revision), {
      status: summaryStatus,
      lastStatus: result.status || null,
      attempts: result.attempts,
      updatedAtMs: nowMs,
    }, { merge: true });
    if (revision.mode === 'snapshot_part') {
      const indexRef = snapshotIndexRef(db, revision.fullSha256);
      tx.set(indexRef, {
        status: summaryStatus,
        lastStatus: result.status || null,
        attempts: result.attempts,
        updatedAtMs: nowMs,
      }, { merge: true });
    }
    if (isQueueResolved(summaryStatus)) {
      for (const item of summaryItems) {
        tx.set(chunkSetMarkerRef(db, item.chunkSetId), {
          status: 'resolved',
          revision: claimed.revision,
        }, { merge: true });
      }
    }
    const lowerUnresolved = nextItems.some(item => item.sourceSequence < claimed.sourceSequence && !isQueueResolved(item.status));
    if (isQueueResolved(status) && !lowerUnresolved) {
      tx.set(stateRef(db), {
        lastDispatchedSequence: Math.max(state.lastDispatchedSequence, claimed.sourceSequence),
        updatedAtMs: nowMs,
      }, { merge: true });
    }
    return { applied: true, status, summary: { revision, items: summaryItems, status: summaryStatus } };
  });
}

function summarizeQueueItems(revision, items) {
  if (items.length !== revision.partCount) throw new Error('incomplete private queue state');
  let status = 'accepted';
  if (items.some(item => item.status === 'unknown' || item.status === 'pending' ||
      item.status === 'in_flight' || item.status === 'failed_retryable')) status = 'unknown';
  else if (items.some(item => item.status === 'failed_terminal')) status = 'failed_terminal';
  else if (items.some(item => item.status === 'accepted_pending_mapping')) status = 'accepted_pending_mapping';
  return status;
}

async function dispatchQueue(db, config, deps = {}, targetRevisionHash, dispatchOptions = {}) {
  const options = { ...(deps.dispatchOptions || {}), ...dispatchOptions };
  const now = typeof deps.now === 'function' ? deps.now :
    (() => (deps.now === undefined ? Date.now() : Number(deps.now)));
  const outcomes = [];
  while (options.maxItems === undefined || outcomes.length < options.maxItems) {
    const nowMs = Number(now());
    const claimed = await claimNextQueue(db, nowMs, {
      eventOnly: options.eventOnly === true,
    });
    if (!claimed) break;
    let rawBody;
    try {
      rawBody = await readChunkBody(db, {
        chunkSetId: claimed.chunkSetId,
        chunkCount: claimed.chunkCount,
        rawLength: claimed.rawLength,
        bodySha256: claimed.bodySha256,
        keyVersion: claimed.keyVersion,
      }, config.keyring, nowMs);
    } catch (error) {
      if (error && error.code === 'CHUNK_EXPIRED') {
        const expired = await finalizeQueueItem(db, claimed,
          { kind: 'failed', status: 410, attempts: claimed.attempts }, Number(now()));
        if (!expired.applied) {
          return targetRevisionHash ? {
            status: 'unknown', revision: claimed.revision, items: [], outcomes, applied: false,
          } : outcomes;
        }
        outcomes.push({ revision: claimed.revision, partIndex: claimed.partIndex,
          status: expired.status, result: { kind: 'failed', status: 410, attempts: claimed.attempts } });
        break;
      }
      throw error;
    }
    const result = await deliverPart({ rawBody, bodySha256: claimed.bodySha256 }, config, deps);
    const finalized = await finalizeQueueItem(db, claimed, result, Number(now()));
    if (!finalized.applied) {
      return targetRevisionHash ? {
        status: 'unknown', revision: claimed.revision, items: [], outcomes,
        applied: false,
      } : outcomes;
    }
    outcomes.push({ revision: claimed.revision, partIndex: claimed.partIndex, status: finalized.status, result });
    if (finalized.status === 'unknown' || finalized.status === 'failed_retryable' ||
        finalized.status === 'failed_terminal') break;
  }
  if (!targetRevisionHash) return outcomes;
  const summary = await summarizeRevision(db, targetRevisionHash);
  return { status: summary.status, revision: summary.revision, items: summary.items, outcomes };
}

function invocationRemainingMs(deps, nowMs) {
  const budgetMs = Number.isSafeInteger(deps.invocationBudgetMs)
    ? deps.invocationBudgetMs : FUNCTION_TIMEOUT_SECONDS * 1000;
  const startedAtMs = Number.isSafeInteger(deps.invocationStartedAtMs)
    ? deps.invocationStartedAtMs : nowMs;
  return Math.max(0, budgetMs - Math.max(0, nowMs - startedAtMs));
}

function requiredDispatchBudget(partCount) {
  return DISPATCH_OVERHEAD_MS + partCount * ATTEMPT_BUDGET_MS;
}

async function unresolvedQueueCountThrough(db, sourceSequence) {
  const snap = await queueCollection(db).get();
  let count = 0;
  for (const doc of snap.docs || []) {
    const item = assertPrivateQueue(doc.data());
    if (item.sourceSequence <= sourceSequence && !isQueueResolved(item.status)) count += 1;
  }
  return count;
}

async function lowestUnresolvedQueueItem(db) {
  const snap = await queueCollection(db).get();
  let lowest = null;
  for (const doc of snap.docs || []) {
    const data = assertPrivateQueue(doc.data());
    if (isQueueResolved(data.status)) continue;
    const candidate = { id: doc.id, revision: data.revision, sourceSequence: data.sourceSequence, data };
    if (!lowest || queueOrder(candidate.data, lowest.data) < 0) lowest = candidate;
  }
  return lowest;
}

function assertReconcileLease(data) {
  if (!data || typeof data !== 'object' ||
      !hasOnlyKeys(data, ['leaseId', 'fenceSequence', 'expiresAtMs']) ||
      (data.leaseId !== null && (typeof data.leaseId !== 'string' || !ID_PATTERN.test(data.leaseId))) ||
      !Number.isSafeInteger(data.fenceSequence) || data.fenceSequence < -1 ||
      !Number.isSafeInteger(data.expiresAtMs) || data.expiresAtMs < 0) {
    throw new Error('invalid private reconcile lease');
  }
  return data;
}

async function acquireReconcileFence(db, nowMs) {
  return db.runTransaction(async tx => {
    const stateData = stateFromSnapshot(await tx.get(stateRef(db)));
    const leaseSnap = await tx.get(reconcileLeaseRef(db));
    if (leaseSnap.exists) {
      const lease = assertReconcileLease(leaseSnap.data());
      if (lease.leaseId && lease.expiresAtMs > nowMs) return null;
    }
    const leaseId = crypto.randomBytes(16).toString('hex');
    tx.set(reconcileLeaseRef(db), {
      leaseId,
      fenceSequence: stateData.lastAllocatedSequence,
      expiresAtMs: nowMs + LEASE_TTL_MS,
    }, { merge: true });
    return { leaseId, fenceSequence: stateData.lastAllocatedSequence };
  });
}

async function releaseReconcileFence(db, leaseId) {
  await db.runTransaction(async tx => {
    const ref = reconcileLeaseRef(db);
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const lease = assertReconcileLease(snap.data());
    if (lease.leaseId === leaseId) tx.delete(ref);
  });
}

class SequenceChangedError extends Error {
  constructor() {
    super('source sequence changed during reconcile read');
    this.code = 'SEQUENCE_CHANGED';
  }
}

async function reserveSnapshotRevision(db, fullSha256, fence, buildForSequence, metadata = {}) {
  const nowMs = Number.isSafeInteger(metadata.nowMs) ? metadata.nowMs : Date.now();
  const indexRef = snapshotIndexRef(db, fullSha256);
  const initialState = stateFromSnapshot(await stateRef(db).get());
  const initialIndexSnap = await indexRef.get();
  let attemptCount = 0;
  if (initialIndexSnap.exists) {
    const index = assertPrivateSnapshotIndex(initialIndexSnap.data());
    if (index.sourceSequence > initialState.lastAllocatedSequence) {
      throw new Error('invalid private snapshot sequence');
    }
    const existingSnap = await revisionHashRef(db, index.revision).get();
    if (!existingSnap.exists) throw new Error('missing private snapshot revision');
    const existing = assertPrivateRevision(existingSnap.data());
    assertSnapshotIndexMatchesRevision(index, existing);
    if (canReuseSnapshotAttempt(existing, metadata, initialState.lastAllocatedSequence)) {
      return { ...existing, existing: true };
    }
    attemptCount = existing.attemptCount + 1;
  }

  const prior = initialState.lastAllocatedSequence;
  const sequence = assertSequence(prior + 1);
  const built = await buildForSequence(sequence, metadata.generatedAt);
  const parts = normalizeParts(built);
  const staged = await stageChunkParts(
    db, parts, metadata.keyring, metadata.keyVersion,
    'snapshot:' + fullSha256 + ':generation:' + String(sequence), nowMs,
  );

  try {
    const result = await db.runTransaction(async tx => {
    const stateRefValue = stateRef(db);
    const currentState = stateFromSnapshot(await tx.get(stateRefValue));
    const leaseSnap = await tx.get(reconcileLeaseRef(db));
    if (!leaseSnap.exists) throw new SequenceChangedError();
    const lease = assertReconcileLease(leaseSnap.data());
    if (lease.leaseId !== fence.leaseId || lease.fenceSequence !== fence.fenceSequence ||
        lease.expiresAtMs <= nowMs || currentState.lastAllocatedSequence !== fence.fenceSequence ||
        currentState.lastAllocatedSequence !== prior) throw new SequenceChangedError();

    const currentIndexSnap = await tx.get(indexRef);
    if (currentIndexSnap.exists) {
      const index = assertPrivateSnapshotIndex(currentIndexSnap.data());
      if (index.sourceSequence > currentState.lastAllocatedSequence) {
        throw new Error('invalid private snapshot sequence');
      }
      const existingSnap = await tx.get(revisionHashRef(db, index.revision));
      if (!existingSnap.exists) throw new Error('missing private snapshot revision');
      const existing = assertPrivateRevision(existingSnap.data());
      assertSnapshotIndexMatchesRevision(index, existing);
      if (canReuseSnapshotAttempt(existing, metadata, currentState.lastAllocatedSequence)) {
        return { ...existing, existing: true };
      }
    }
    const markerSnaps = await Promise.all(staged.manifests.map(manifest =>
      tx.get(chunkSetMarkerRef(db, manifest.chunkSetId))));
    markerSnaps.forEach((markerSnap, index) => {
      if (!markerSnap.exists) throw new Error('missing private chunk set marker');
      const marker = assertPrivateChunkSetMarker(markerSnap.data());
      if (marker.chunkSetId !== staged.manifests[index].chunkSetId || marker.status !== 'staged') {
        throw new Error('invalid private chunk set marker');
      }
    });

    const revisionIdentity = 'snapshot:' + fullSha256 + ':generation:' + String(sequence);
    const revisionHash = hashRevision(revisionIdentity);
    const correctionFingerprint = metadata.correctionFingerprint || fullSha256;
    const keyVersion = metadata.keyVersion;
    const cleanMetadata = safeBuildMetadata({
      ...metadata, fullSha256, correctionFingerprint, keyVersion, attemptCount,
    });
    const entry = stripUndefinedFields({
      revision: revisionHash,
      mode: cleanMetadata.mode,
      sourceSequence: sequence,
      generatedAt: cleanMetadata.generatedAt,
      status: 'pending',
      ...cleanMetadata,
      ...safeBuiltMetadata(built),
      correctionFingerprint,
      keyVersion,
      partCount: parts.length,
      attempts: 0,
      lastStatus: null,
      partBodyHashes: staged.manifests.map(manifest => manifest.bodySha256),
      chunkManifests: staged.manifests,
      queueIds: parts.map((_part, index) => queueId(revisionHash, index)),
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    });
    for (let index = 0; index < parts.length; index += 1) {
      const manifest = staged.manifests[index];
      tx.create(queueRef(db, entry.queueIds[index]), stripUndefinedFields({
        revision: revisionHash,
        mode: cleanMetadata.mode,
        sourceSequence: sequence,
        partIndex: index,
        partCount: parts.length,
        bodySha256: manifest.bodySha256,
        fullSha256: entry.fullSha256,
        snapshotId: entry.snapshotId,
        serviceCount: entry.serviceCount,
        chunkSetId: manifest.chunkSetId,
        chunkCount: manifest.chunkCount,
        rawLength: manifest.rawLength,
        keyVersion: manifest.keyVersion,
        correctionFingerprint: entry.correctionFingerprint,
        status: 'pending',
        attempts: 0,
        lastStatus: null,
        nextAttemptAtMs: 0,
        leaseId: null,
        leaseExpiresAtMs: 0,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      }));
      tx.set(chunkSetMarkerRef(db, manifest.chunkSetId), {
        status: 'active',
        revision: entry.revision,
      }, { merge: true });
    }
    tx.create(revisionHashRef(db, revisionHash), entry);
    tx.set(indexRef, {
      revision: revisionHash,
      sourceSequence: sequence,
      snapshotId: entry.snapshotId,
      fullSha256: entry.fullSha256,
      correctionFingerprint: entry.correctionFingerprint,
      keyVersion: entry.keyVersion,
      attemptCount,
      status: 'pending',
      attempts: 0,
      lastStatus: null,
      updatedAtMs: nowMs,
    }, { merge: true });
    tx.set(stateRefValue, {
      lastAllocatedSequence: sequence,
      lastDispatchedSequence: currentState.lastDispatchedSequence,
      updatedAtMs: nowMs,
    }, { merge: true });
      return entry;
    });
    if (result && result.existing) {
      await discardChunkCandidate(db, staged.manifests.map(manifest => manifest.chunkSetId));
    }
    return result;
  } catch (error) {
    await discardChunkCandidate(db, staged.manifests.map(manifest => manifest.chunkSetId));
    throw error;
  }
}

async function handleScheduleWrite(event, deps = {}) {
  const config = configForInvocation(deps);
  if (!config.enabled) return { status: 'disabled' };
  if (config.frozen) return { status: 'source_frozen' };
  if (missingConfiguration(config)) return { status: 'configuration_missing' };
  const before = event && event.data && event.data.before;
  const after = event && event.data && event.data.after;
  const afterExists = Boolean(after && after.exists);
  const beforeExists = Boolean(before && before.exists);
  if (!afterExists && !beforeExists) return { status: 'no_source_document' };
  const operation = afterExists ? 'upsert' : 'delete';
  const sourceDocument = afterExists ? after : before;
  const id = documentId(sourceDocument, event && event.params && event.params.id);
  const fallback = documentUpdatedAt(sourceDocument, eventFallbackUpdatedAt(event));
  let service;
  if (operation === 'upsert') {
    service = serviceFromSchedule(sourceDocument, { fallbackUpdatedAt: fallback });
  } else {
    service = { id: assertId('service.id', id) };
  }
  const generatedAt = fallback;
  const correctionFingerprint = eventCorrectionFingerprint(operation, service);
  const revision = 'event:' + String(event && event.id || `${id}:${operation}:${generatedAt}`) +
    ':fingerprint:' + correctionFingerprint;
  const entry = await reserveRevision(deps.db, revision, sequence => {
    const payload = buildEventPayload({ sequence, generatedAt, operation, service });
    const rawBody = canonicalJson(payload);
    assertBodyLimit(rawBody);
    return { rawBody, bodySha256: sha256Hex(rawBody) };
  }, {
    mode: 'event', operation, generatedAt, serviceCount: operation === 'upsert' ? 1 : 0,
    correctionFingerprint,
    keyVersion: keyVersionFor(config),
    keyring: config.keyring,
    nowMs: Number.isSafeInteger(deps.nowMs) ? deps.nowMs : invocationNow(deps),
  });
  const payload = buildEventPayload({ sequence: entry.sourceSequence, generatedAt: entry.generatedAt,
    operation, service });
  const rawBody = canonicalJson(payload);
  const bodySha256 = sha256Hex(rawBody);
  if (entry.bodySha256 !== bodySha256) {
    return { status: 'conflicting_revision', sourceSequence: entry.sourceSequence };
  }
  const existingSummary = await summarizeRevision(deps.db, entry.revision);
  if (existingSummary.status === 'accepted' || existingSummary.status === 'accepted_pending_mapping' ||
      existingSummary.status === 'failed_terminal') {
    return { status: existingSummary.status, sourceSequence: entry.sourceSequence };
  }
  const eventNowMs = invocationNow(deps);
  if (invocationRemainingMs(deps, eventNowMs) < requiredDispatchBudget(1)) {
    return { status: 'deferred_insufficient_budget', sourceSequence: entry.sourceSequence, bodySha256 };
  }
  const dispatch = await dispatchQueue(deps.db, config, deps, entry.revision, {
    eventOnly: true,
    maxItems: 1,
  });
  if (dispatch && dispatch.applied === false) {
    return { status: 'unknown', sourceSequence: entry.sourceSequence, bodySha256 };
  }
  const status = dispatch.status;
  const result = dispatch.outcomes.filter(outcome => outcome.revision === entry.revision).pop();
  logSafe(deps.logger, {
    revision: entry.revision, mode: 'event', sourceSequence: entry.sourceSequence,
    serviceCount: operation === 'upsert' ? 1 : 0, bodySha256, keyId: config.keyId,
    status, attempts: result && result.result.attempts,
    durationMs: result && result.result.durationMs,
  });
  return { status, sourceSequence: entry.sourceSequence, bodySha256,
    attempts: result && result.result.attempts };
}

function snapshotGeneratedAt(services, fallback) {
  if (!services.length) return '0000000000000';
  return services.reduce((latest, service) =>
    service.sourceUpdatedAt > latest ? service.sourceUpdatedAt : latest, fallback);
}

async function handleReconcile(deps = {}) {
  const config = configForInvocation(deps);
  if (!config.enabled) return { status: 'disabled' };
  if (config.frozen) return { status: 'source_frozen' };
  if (missingConfiguration(config)) return { status: 'configuration_missing' };
  const now = typeof deps.now === 'function' ? deps.now :
    (() => (deps.now === undefined ? Date.now() : Number(deps.now)));
  await cleanupExpiredResolvedChunks(deps.db, Number(now()));
  for (let readAttempt = 0; readAttempt < 3; readAttempt += 1) {
    const fence = await acquireReconcileFence(deps.db, Number(now()));
    if (!fence) return { status: 'reconcile_busy' };
    let reserved;
    let services;
    let generatedAt;
    let fullSha256;
    try {
      const scheduleSnap = await deps.db.collection('schedule').get();
      const documents = scheduleSnap.docs || [];
      const fallback = String(Number(now()));
      services = projectSchedule(documents, { fallbackUpdatedAt: fallback });
      generatedAt = snapshotGeneratedAt(services, fallback);
      fullSha256 = fullServicesHash(services);

      // Do not allocate a changed snapshot behind an unresolved multipart
      // attempt. The scheduler first drains the lowest existing item, then a
      // later invocation can allocate the new generation. This bounds each
      // invocation and prevents two 40-part generations from exceeding the
      // staging TTL forever.
      const existingUnresolved = await lowestUnresolvedQueueItem(deps.db);
      if (existingUnresolved) {
        await releaseReconcileFence(deps.db, fence.leaseId);
        const unresolvedCount = await unresolvedQueueCountThrough(
          deps.db, existingUnresolved.sourceSequence,
        );
        const requiredBudget = requiredDispatchBudget(unresolvedCount);
        const remainingBudget = invocationRemainingMs(deps, Number(now()));
        if (requiredBudget > STAGING_TTL_MS || remainingBudget < requiredBudget) {
          return {
            status: 'deferred_insufficient_budget',
            sourceSequence: existingUnresolved.sourceSequence,
            fullSha256,
          };
        }
        const dispatch = await dispatchQueue(
          deps.db, config, deps, existingUnresolved.revision, { maxItems: unresolvedCount },
        );
        if (dispatch && dispatch.applied === false) {
          return {
            status: 'unknown',
            sourceSequence: existingUnresolved.sourceSequence,
            fullSha256,
          };
        }
        return {
          status: dispatch.status,
          sourceSequence: existingUnresolved.sourceSequence,
          fullSha256,
          partCount: dispatch.revision && dispatch.revision.partCount,
        };
      }
      reserved = await reserveSnapshotRevision(deps.db, fullSha256, fence, sequence => {
        const snapshotId = 'snap-' + String(sequence);
        const built = buildSnapshotParts(services, { sequence, generatedAt, snapshotId });
        return {
          ...built,
          snapshotId,
          fullSha256: built.fullSha256,
          partBodyHashes: built.parts.map(part => part.bodySha256),
        };
      }, {
        mode: 'snapshot_part', generatedAt, fullSha256, serviceCount: services.length,
        correctionFingerprint: fullSha256,
        keyVersion: keyVersionFor(config),
        keyring: config.keyring,
        nowMs: Number(now()),
      });
    } catch (error) {
      await releaseReconcileFence(deps.db, fence.leaseId);
      if (error && error.code === 'SEQUENCE_CHANGED') continue;
      throw error;
    }
    await releaseReconcileFence(deps.db, fence.leaseId);
    const reservedSummary = await summarizeRevision(deps.db, reserved.revision);
    if (reservedSummary.status === 'accepted' || reservedSummary.status === 'accepted_pending_mapping' ||
        reservedSummary.status === 'failed_terminal') {
      return { status: reservedSummary.status, sourceSequence: reserved.sourceSequence, fullSha256 };
    }
    const built = buildSnapshotParts(services, {
      sequence: reserved.sourceSequence,
      generatedAt: reserved.generatedAt,
      snapshotId: reserved.snapshotId,
    });
    const hashes = built.parts.map(part => part.bodySha256);
    if (reserved.fullSha256 !== built.fullSha256 ||
        JSON.stringify(reserved.partBodyHashes) !== JSON.stringify(hashes)) {
      throw new Error('conflicting private snapshot revision');
    }
    const unresolvedCount = await unresolvedQueueCountThrough(deps.db, reserved.sourceSequence);
    const requiredBudget = requiredDispatchBudget(unresolvedCount);
    const remainingBudget = invocationRemainingMs(deps, Number(now()));
    if (requiredBudget > STAGING_TTL_MS || remainingBudget < requiredBudget) {
      return {
        status: 'deferred_insufficient_budget',
        sourceSequence: reserved.sourceSequence,
        fullSha256,
        partCount: reserved.partCount,
      };
    }
    const dispatch = await dispatchQueue(deps.db, config, deps, reserved.revision, {
      maxItems: unresolvedCount,
    });
    if (dispatch && dispatch.applied === false) {
      return {
        status: 'unknown',
        sourceSequence: reserved.sourceSequence,
        fullSha256,
        partCount: reserved.partCount,
      };
    }
    const status = dispatch.status;
    const failed = dispatch.items.find(item => item.status === 'unknown' ||
      item.status === 'failed_retryable' || item.status === 'failed_terminal');
    for (const outcome of dispatch.outcomes.filter(item => item.revision === reserved.revision)) {
      const item = dispatch.items.find(candidate => candidate.partIndex === outcome.partIndex);
      logSafe(deps.logger, {
        revision: reserved.revision, mode: 'snapshot_part', sourceSequence: reserved.sourceSequence,
        snapshotId: reserved.snapshotId, partIndex: item && item.partIndex,
        partCount: reserved.partCount, serviceCount: reserved.serviceCount,
        bodySha256: item && item.bodySha256, fullSha256, keyId: config.keyId,
        status: outcome.status, attempts: outcome.result.attempts,
        durationMs: outcome.result.durationMs,
      });
    }
    return {
      status,
      sourceSequence: reserved.sourceSequence,
      fullSha256,
      partCount: reserved.partCount,
      failedPartIndex: failed && failed.partIndex,
    };
  }
  return { status: 'source_changed_during_reconcile' };
}

module.exports = {
  SOURCE,
  VERSION,
  MAX_BODY_BYTES,
  MAX_PART_SERVICES,
  MAX_PART_COUNT,
  MAX_SNAPSHOT_SERVICES,
  MAX_ASSIGNMENTS,
  REQUEST_TIMEOUT_MS,
  MAX_ATTEMPTS,
  ATTEMPT_BUDGET_MS,
  PREVIOUS_KEY_OVERLAP_MS,
  FUNCTION_TIMEOUT_SECONDS,
  EVENT_FUNCTION_TIMEOUT_SECONDS,
  STAGING_TTL_MS,
  CHUNK_PLAINTEXT_BYTES,
  CHUNK_BATCH_MAX_WRITES,
  CHUNK_BATCH_MAX_BYTES,
  MAX_CHUNK_DOCUMENT_BYTES,
  MAX_CLEANUP_CHUNK_SETS,
  MAX_CLEANUP_CHUNKS,
  RETRY_DELAYS_MS,
  ID_PATTERN,
  canonicalJson,
  canonicalBytes,
  sha256Hex,
  hmacSignature,
  asciiSlug,
  serviceFromSchedule,
  projectSchedule,
  buildEventPayload,
  buildEventBody,
  buildSnapshotPayload,
  buildSnapshotParts,
  buildSignedRequest,
  classifyReceiverStatus,
  classifyResponse,
  isRetryableStatus,
  sendWithRetry,
  syncConfig,
  validateRotationEnvironment,
  safeReceipt,
  hashRevision,
  reserveRevision,
  claimNextQueue,
  finalizeQueueItem,
  readChunkBody,
  cleanupExpiredResolvedChunks,
  requiredDispatchBudget,
  invocationRemainingMs,
  handleScheduleWrite,
  handleReconcile,
};
