'use strict';

const crypto = require('node:crypto');

const MAX_TARGET_DOCUMENTS = 200;
const hasOwn = Object.prototype.hasOwnProperty;

class IdentityCorrectionError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'IdentityCorrectionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new IdentityCorrectionError(code, message, details);
}

function setOwn(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function constructorName(value) {
  const constructor = value && value.constructor;
  return constructor && typeof constructor.name === 'string' ? constructor.name : '';
}

function isExternalFirestoreValue(value) {
  return ['DocumentReference', 'CollectionReference', 'Firestore', 'Transaction',
    'WriteBatch', 'FieldPath'].includes(constructorName(value));
}

function cloneOpaque(value, seen) {
  if (isExternalFirestoreValue(value)) return value;
  if (seen.has(value)) return seen.get(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return value;
  const result = Object.create(prototype);
  seen.set(value, result);
  Reflect.ownKeys(value).forEach(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return;
    if (hasOwn.call(descriptor, 'value')) descriptor.value = clone(descriptor.value, seen);
    try {
      Object.defineProperty(result, key, descriptor);
    } catch {
      Object.defineProperty(result, key, {
        value: clone(value[key], seen), enumerable: true, configurable: true, writable: true
      });
    }
  });
  return result;
}

function clone(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      return new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    return new value.constructor(value);
  }
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value.slice(0);

  const prior = seen || new Map();
  if (prior.has(value)) return prior.get(value);
  if (value instanceof Map) {
    const result = new Map();
    prior.set(value, result);
    value.forEach((entry, key) => result.set(clone(key, prior), clone(entry, prior)));
    return result;
  }
  if (value instanceof Set) {
    const result = new Set();
    prior.set(value, result);
    value.forEach(entry => result.add(clone(entry, prior)));
    return result;
  }
  if (!isPlainObject(value) && !Array.isArray(value)) return cloneOpaque(value, prior);
  const result = Array.isArray(value) ? [] : {};
  prior.set(value, result);
  if (Array.isArray(value)) {
    value.forEach(item => result.push(clone(item, prior)));
  } else {
    Object.keys(value).forEach(key => setOwn(result, key, clone(value[key], prior)));
  }
  return result;
}

function deepFreeze(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  const visited = seen || new Set();
  if (visited.has(value)) return value;
  visited.add(value);
  Object.keys(value).forEach(key => deepFreeze(value[key], visited));
  return Object.freeze(value);
}

function stableSerialize(value, seen) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN';
    if (value === Infinity) return 'number:Infinity';
    if (value === -Infinity) return 'number:-Infinity';
    if (Object.is(value, -0)) return 'number:-0';
    return 'number:' + String(value);
  }
  if (typeof value === 'bigint') return 'bigint:' + String(value);
  if (typeof value === 'function') return 'function:' + String(value);
  if (value instanceof Date) return 'date:' + value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return 'buffer:' + value.toString('base64');
  }
  if (value instanceof Uint8Array) return 'bytes:' + Buffer.from(value).toString('base64');
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
    return 'typed-array:' + constructorName(value) + ':' + Buffer.from(
      value.buffer, value.byteOffset, value.byteLength).toString('base64');
  }
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return 'array-buffer:' + Buffer.from(value).toString('base64');
  }
  if (Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds) &&
      typeof value.toDate === 'function') {
    return 'timestamp:' + value.seconds + ':' + value.nanoseconds;
  }
  if (constructorName(value) === 'GeoPoint' &&
      Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) {
    return 'geo-point:' + String(value.latitude) + ':' + String(value.longitude);
  }
  const visited = seen || new Set();
  if (visited.has(value)) fail('CYCLIC_DATA', 'Cannot hash cyclic document data');
  visited.add(value);
  let result;
  if (Array.isArray(value)) {
    result = '[' + value.map(item => stableSerialize(item, visited)).join(',') + ']';
  } else if (isPlainObject(value)) {
    result = '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + stableSerialize(value[key], visited)).join(',') + '}';
  } else if (value instanceof Map) {
    result = 'map:[' + Array.from(value.entries()).map(([key, entry]) =>
      stableSerialize(key, visited) + ':' + stableSerialize(entry, visited)).join(',') + ']';
  } else if (value instanceof Set) {
    result = 'set:[' + Array.from(value, entry => stableSerialize(entry, visited)).join(',') + ']';
  } else if (isExternalFirestoreValue(value)) {
    result = 'external:' + constructorName(value) + ':' + String(value.path || value.id || '');
  } else {
    const name = constructorName(value) || Object.prototype.toString.call(value);
    result = 'object:' + name + '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + stableSerialize(value[key], visited)).join(',') + '}';
  }
  visited.delete(value);
  return result;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex');
}

function hashDocument(exists, data) {
  return hashValue({ exists: !!exists, data: exists ? data : null });
}

function snapshotVersion(value) {
  if (value == null) return null;
  if (Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return 'timestamp:' + value.seconds + ':' + value.nanoseconds;
  }
  if (typeof value.toMillis === 'function') return 'millis:' + String(value.toMillis());
  if (typeof value.toDate === 'function') return 'date:' + value.toDate().toISOString();
  return 'value:' + hashValue(value);
}

function normalizeIdentityMap(input) {
  if (input == null) return {};
  if (!isPlainObject(input)) fail('INVALID_MAP', 'Identity map must be an object');

  const raw = Object.create(null);
  Object.keys(input).forEach(alias => {
    const canonical = input[alias];
    if (typeof alias !== 'string' || !alias.trim() ||
        typeof canonical !== 'string' || !canonical.trim()) {
      fail('BLANK_IDENTITY', 'Identity aliases and canonical values must be nonblank strings');
    }
    if (alias === canonical) fail('SELF_LINK', 'Identity map contains a self link');
    setOwn(raw, alias, canonical);
  });

  const flattened = {};
  const visiting = new Set();
  const resolve = alias => {
    if (!hasOwn.call(raw, alias)) return alias;
    if (visiting.has(alias)) fail('CYCLE', 'Identity map contains a cycle');
    visiting.add(alias);
    const target = resolve(raw[alias]);
    visiting.delete(alias);
    if (target === alias) fail('SELF_LINK', 'Identity map contains a self link');
    return target;
  };

  Object.keys(raw).forEach(alias => setOwn(flattened, alias, resolve(alias)));
  return flattened;
}

function createIdentityResolver(input) {
  if (input && typeof input.canonicalize === 'function' && input.map) return input;
  const map = normalizeIdentityMap(input);
  const reverse = Object.create(null);
  Object.keys(map).forEach(alias => {
    const canonical = map[alias];
    if (!reverse[canonical]) reverse[canonical] = [];
    reverse[canonical].push(alias);
  });

  const canonicalizeName = name =>
    typeof name === 'string' && hasOwn.call(map, name) ? map[name] : name;
  const aliasesFor = name => {
    const canonical = canonicalizeName(name);
    return (reverse[canonical] || []).slice();
  };
  const variantsFor = name => {
    if (typeof name !== 'string' || !name) return [];
    const canonical = canonicalizeName(name);
    return [canonical].concat(aliasesFor(canonical));
  };
  const equivalent = (left, right) =>
    typeof left === 'string' && left.length > 0 &&
    typeof right === 'string' && right.length > 0 &&
    canonicalizeName(left) === canonicalizeName(right);

  return Object.freeze({
    map: deepFreeze(map),
    canonicalize: canonicalizeName,
    same: equivalent,
    aliases: aliasesFor,
    variants: variantsFor
  });
}

function correctedIdentityMap(existing, alias, canonical) {
  if (typeof alias !== 'string' || !alias.trim() ||
      typeof canonical !== 'string' || !canonical.trim()) {
    fail('BLANK_IDENTITY', 'Identity aliases and canonical values must be nonblank strings');
  }
  if (alias === canonical) fail('SELF_LINK', 'Identity correction cannot link an identity to itself');
  const merged = {};
  Object.keys(existing || {}).forEach(key => setOwn(merged, key, existing[key]));
  setOwn(merged, alias, canonical);
  return normalizeIdentityMap(merged);
}

function correctionResolver(mapping, existingMap) {
  const requested = normalizeIdentityMap(mapping);
  if (existingMap === undefined || existingMap === null) return createIdentityResolver(requested);
  if (!isPlainObject(existingMap)) fail('INVALID_MAP', 'Stored name map must be an object');

  const merged = {};
  Object.keys(existingMap).forEach(key => setOwn(merged, key, existingMap[key]));
  Object.keys(requested).forEach(key => setOwn(merged, key, requested[key]));
  const full = normalizeIdentityMap(merged);
  const requestedCanonicals = new Set(Object.keys(requested).map(alias => full[alias] || alias));
  const scoped = {};
  Object.keys(full).forEach(alias => {
    if (requestedCanonicals.has(full[alias])) setOwn(scoped, alias, full[alias]);
  });
  Object.keys(requested).forEach(alias => setOwn(scoped, alias, full[alias] || requested[alias]));
  return createIdentityResolver(scoped);
}

function sameIdentity(left, right, mapOrResolver) {
  return createIdentityResolver(mapOrResolver).same(left, right);
}

function canonicalize(name, mapOrResolver) {
  return createIdentityResolver(mapOrResolver).canonicalize(name);
}

function legacyAliases(name, mapOrResolver) {
  return createIdentityResolver(mapOrResolver).aliases(name);
}

function identityVariants(name, mapOrResolver) {
  return createIdentityResolver(mapOrResolver).variants(name);
}

const KNOWN_APP_DOCUMENTS = Object.freeze({
  nameMap: 'app/nameMap',
  members: 'app/members',
  departments: 'app/departments',
  presiders: 'app/presiders',
  settings: 'app/settings'
});

const KNOWN_COLLECTIONS = Object.freeze([
  'app', 'schedule', 'setlists', 'songStats', 'requests', 'tokens'
]);

const CORRECTION_ALLOWLIST = Object.freeze({
  'app/nameMap': ['map'],
  'app/members': ['list'],
  'app/departments': ['map roster values'],
  'app/presiders': ['names'],
  'app/settings': ['schedulerName'],
  schedule: ['assignments values', 'conflictOk keys'],
  setlists: ['presider', 'confirmedBy', 'updatedBy'],
  songStats: ['history[].by'],
  requests: ['name', 'resolvedBy'],
  tokens: ['name']
});

function collectionKind(collectionName, docId) {
  if (collectionName === 'app' && hasOwn.call(KNOWN_APP_DOCUMENTS, docId)) {
    return KNOWN_APP_DOCUMENTS[docId];
  }
  return collectionName;
}

function structuralPath(kind, path, resolver) {
  const aliases = new Set(Object.keys(resolver.map));
  const structural = new Set([
    'map', 'list', 'names', 'schedulerName', 'assignments', 'conflictOk',
    'presider', 'confirmedBy', 'updatedBy', 'history', 'by', 'name', 'resolvedBy'
  ]);
  const parts = [kind, '*'];
  (path || []).forEach(part => {
    if (typeof part === 'number') parts.push('[]');
    else if (aliases.has(part)) parts.push('<identity>');
    else if (structural.has(part)) parts.push(part);
    else parts.push('<key>');
  });
  return parts.join('/');
}

function allowedValuePath(kind, path) {
  if (!path || !path.length) return false;
  if (kind === 'app/nameMap') return path.length === 2 && path[0] === 'map';
  if (kind === 'app/members') return path.length === 2 && path[0] === 'list';
  if (kind === 'app/departments') return path.length === 3 && path[0] === 'map' && typeof path[2] === 'number';
  if (kind === 'app/presiders') return path.length === 2 && path[0] === 'names';
  if (kind === 'app/settings') return path.length === 1 && path[0] === 'schedulerName';
  if (kind === 'schedule') return path.length === 2 && path[0] === 'assignments';
  if (kind === 'setlists') {
    return path.length === 1 && ['presider', 'confirmedBy', 'updatedBy'].includes(path[0]);
  }
  if (kind === 'songStats') return path.length === 3 && path[0] === 'history' && path[2] === 'by';
  if (kind === 'requests') return path.length === 1 && ['name', 'resolvedBy'].includes(path[0]);
  if (kind === 'tokens') return path.length === 1 && path[0] === 'name';
  return false;
}

function allowedKeyPath(kind, parentPath) {
  return (kind === 'app/nameMap' && parentPath.length === 1 && parentPath[0] === 'map') ||
    (kind === 'schedule' && parentPath.length === 1 && parentPath[0] === 'conflictOk');
}

function findUnexpectedOccurrences(data, kind, resolver) {
  const aliases = new Set(Object.keys(resolver.map));
  const counts = new Map();
  const record = path => {
    const safePath = structuralPath(kind, path, resolver);
    counts.set(safePath, (counts.get(safePath) || 0) + 1);
  };
  const visit = (value, path, seen) => {
    if (typeof value === 'string') {
      if (aliases.has(value) && !allowedValuePath(kind, path)) record(path);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (!isPlainObject(value) && !Array.isArray(value)) return;
    const active = seen || new Set();
    if (active.has(value)) fail('CYCLIC_DATA', 'Cannot inspect cyclic document data');
    active.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, path.concat(index), active));
    } else {
      Object.keys(value).forEach(key => {
        if (aliases.has(key) && !allowedKeyPath(kind, path)) record(path.concat(key));
        visit(value[key], path.concat(key), active);
      });
    }
    active.delete(value);
  };
  visit(data, [], new Set());
  return Array.from(counts.entries()).map(([path, count]) => ({ path, count }));
}

function valuesEqual(left, right) {
  return stableSerialize(left) === stableSerialize(right);
}

function rewriteIdentityList(value, resolver) {
  if (!Array.isArray(value)) return { value: clone(value), changed: false };
  const out = [];
  const seen = new Map();
  let changed = false;
  value.forEach(item => {
    const next = typeof item === 'string' ? resolver.canonicalize(item) : item;
    const itemChanged = next !== item;
    if (itemChanged) changed = true;
    if (typeof next === 'string' && seen.has(next)) {
      const previous = seen.get(next);
      if (itemChanged || previous.changed) {
        changed = true;
        return;
      }
    }
    out.push(clone(next));
    if (typeof next === 'string' && !seen.has(next)) seen.set(next, { changed: itemChanged });
  });
  return { value: out, changed: changed || !valuesEqual(value, out) };
}

function rewriteAssignments(value, resolver) {
  if (!isPlainObject(value)) return { value: clone(value), changed: false };
  const out = {};
  let changed = false;
  Object.keys(value).forEach(duty => {
    const current = value[duty];
    const next = typeof current === 'string' ? resolver.canonicalize(current) : current;
    setOwn(out, duty, clone(next));
    if (next !== current) changed = true;
  });
  return { value: out, changed };
}

function rewriteConflictOk(value, resolver) {
  if (!isPlainObject(value)) return { value: clone(value), changed: false };
  const out = {};
  let changed = false;
  Object.keys(value).forEach(identity => {
    const canonical = typeof identity === 'string' ? resolver.canonicalize(identity) : identity;
    const duties = clone(value[identity]);
    if (canonical !== identity) changed = true;
    if (!hasOwn.call(out, canonical)) {
      setOwn(out, canonical, duties);
      return;
    }
    changed = true;
    const current = out[canonical];
    if (Array.isArray(current) && Array.isArray(duties)) {
      const merged = current.slice();
      const present = new Set(current);
      duties.forEach(duty => {
        if (!present.has(duty)) {
          merged.push(duty);
          present.add(duty);
        }
      });
      setOwn(out, canonical, merged);
    }
  });
  return { value: out, changed: changed || !valuesEqual(value, out) };
}

function rewriteDepartmentMap(value, resolver) {
  if (!isPlainObject(value)) return { value: clone(value), changed: false };
  const out = {};
  let changed = false;
  Object.keys(value).forEach(department => {
    const result = rewriteIdentityList(value[department], resolver);
    setOwn(out, department, result.value);
    if (result.changed) changed = true;
  });
  return { value: out, changed };
}

function rewriteHistory(value, resolver) {
  if (!Array.isArray(value)) return { value: clone(value), changed: false };
  let changed = false;
  const out = value.map(entry => {
    if (!isPlainObject(entry) || typeof entry.by !== 'string') return clone(entry);
    const next = resolver.canonicalize(entry.by);
    if (next === entry.by) return clone(entry);
    changed = true;
    return Object.assign({}, clone(entry), { by: next });
  });
  return { value: out, changed };
}

function combineNameMap(value, resolver) {
  const existing = value == null ? {} : value;
  if (!isPlainObject(existing)) fail('INVALID_MAP', 'Stored name map must be an object');
  const flattenedExisting = normalizeIdentityMap(existing);
  const merged = {};
  Object.keys(flattenedExisting).forEach(key => setOwn(merged, key, flattenedExisting[key]));
  Object.keys(resolver.map).forEach(key => setOwn(merged, key, resolver.map[key]));
  return merged;
}

function identitySnapshot(kind, before, after, changedFields) {
  const beforeIdentity = {};
  const afterIdentity = {};
  const missingBefore = [];
  const missingAfter = [];
  changedFields.forEach(field => {
    if (field === 'history' && kind === 'songStats') {
      const toBy = value => (Array.isArray(value) ? value : []).map(entry => {
        if (isPlainObject(entry) && hasOwn.call(entry, 'by')) return { by: clone(entry.by) };
        return { missing: true };
      });
      beforeIdentity.history = toBy(before.history);
      afterIdentity.history = toBy(after.history);
      return;
    }
    if (hasOwn.call(before, field)) setOwn(beforeIdentity, field, clone(before[field]));
    else missingBefore.push(field);
    if (hasOwn.call(after, field)) setOwn(afterIdentity, field, clone(after[field]));
    else missingAfter.push(field);
  });
  if (missingBefore.length) beforeIdentity._missing = missingBefore;
  if (missingAfter.length) afterIdentity._missing = missingAfter;
  return { before: beforeIdentity, after: afterIdentity };
}

function transformRecord(record, resolver) {
  const kind = record.collectionKind;
  const before = clone(record.data || {});
  const after = clone(before);
  const changedFields = [];
  const setField = (field, result) => {
    if (!result.changed) return;
    setOwn(after, field, result.value);
    changedFields.push(field);
  };

  if (kind === 'app/nameMap') {
    const result = { value: combineNameMap(before.map, resolver), changed: true };
    if (!valuesEqual(before.map, result.value)) setField('map', result);
  } else if (kind === 'app/members') {
    setField('list', rewriteIdentityList(before.list, resolver));
  } else if (kind === 'app/departments') {
    setField('map', rewriteDepartmentMap(before.map, resolver));
  } else if (kind === 'app/presiders') {
    setField('names', rewriteIdentityList(before.names, resolver));
  } else if (kind === 'app/settings') {
    if (typeof before.schedulerName === 'string') {
      const next = resolver.canonicalize(before.schedulerName);
      if (next !== before.schedulerName) {
        setOwn(after, 'schedulerName', next);
        changedFields.push('schedulerName');
      }
    }
  } else if (kind === 'schedule') {
    setField('assignments', rewriteAssignments(before.assignments, resolver));
    setField('conflictOk', rewriteConflictOk(before.conflictOk, resolver));
  } else if (kind === 'setlists') {
    ['presider', 'confirmedBy', 'updatedBy'].forEach(field => {
      if (typeof before[field] !== 'string') return;
      const next = resolver.canonicalize(before[field]);
      if (next !== before[field]) {
        setOwn(after, field, next);
        changedFields.push(field);
      }
    });
  } else if (kind === 'songStats') {
    setField('history', rewriteHistory(before.history, resolver));
  } else if (kind === 'requests') {
    ['name', 'resolvedBy'].forEach(field => {
      if (typeof before[field] !== 'string') return;
      const next = resolver.canonicalize(before[field]);
      if (next !== before[field]) {
        setOwn(after, field, next);
        changedFields.push(field);
      }
    });
  } else if (kind === 'tokens') {
    if (typeof before.name === 'string') {
      const next = resolver.canonicalize(before.name);
      if (next !== before.name) {
        setOwn(after, 'name', next);
        changedFields.push('name');
      }
    }
  }

  if (!changedFields.length) return null;
  const fields = {};
  changedFields.forEach(field => setOwn(fields, field, clone(after[field])));
  const identity = identitySnapshot(kind, before, after, changedFields);
  return {
    collectionName: record.collectionName,
    collectionKind: kind,
    docId: record.docId,
    beforeExists: record.exists === undefined ? true : !!record.exists,
    before,
    after,
    patch: fields,
    beforeIdentity: identity.before,
    afterIdentity: identity.after,
    beforeHash: hashDocument(record.exists === undefined ? true : !!record.exists, before),
    afterHash: hashDocument(true, after),
    beforeUpdateTime: record.updateTime || null,
    itemId: itemIdFor(kind, record.docId)
  };
}

function itemIdFor(collectionKindValue, docId) {
  return 'i_' + hashValue('identity-correction-item:' + collectionKindValue + ':' + String(docId)).slice(0, 40);
}

function collectRecordsFromSnapshots(snapshots) {
  const records = [];
  snapshots.forEach(({ collectionName, snapshot }) => {
    const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
    docs.forEach(document => {
      const data = document.data();
      records.push({
        collectionName,
        collectionKind: collectionKind(collectionName, document.id),
        docId: document.id,
        exists: document.exists === undefined ? true : !!document.exists,
        updateTime: snapshotVersion(document.updateTime),
        data: data === undefined ? {} : data
      });
    });
  });
  return records;
}

function scopeForRecords(records) {
  return records.map(record => ({
    collectionName: record.collectionName,
    collectionKind: record.collectionKind,
    docId: record.docId,
    exists: record.exists === undefined ? true : !!record.exists,
    updateTime: record.updateTime || null,
    hash: hashDocument(record.exists === undefined ? true : !!record.exists, record.data || {})
  })).sort((left, right) =>
    (left.collectionName + '\u0000' + left.docId).localeCompare(right.collectionName + '\u0000' + right.docId));
}

function identityValueHash(value) {
  return hashValue('identity-correction-identity:' + value);
}

function identityScopeHashes(mapping) {
  const hashes = new Set();
  Object.keys(mapping || {}).forEach(alias => {
    hashes.add(identityValueHash(alias));
    hashes.add(identityValueHash(mapping[alias]));
  });
  return Array.from(hashes).sort();
}

function addIdentityOccurrence(rows, slot, value, identityHashes) {
  if (typeof value !== 'string') return;
  const valueHash = identityValueHash(value);
  if (!identityHashes.has(valueHash)) return;
  rows.push({ slot, value: valueHash });
}

function identityOccurrences(kind, data, identityHashes) {
  const rows = [];
  const source = data || {};
  const addArray = (field, values) => {
    if (!Array.isArray(values)) return;
    values.forEach((value, index) => addIdentityOccurrence(
      rows, field + ':index:' + index, value, identityHashes));
  };
  const addScalar = field => addIdentityOccurrence(rows, field, source[field], identityHashes);

  if (kind === 'app/nameMap') {
    const map = source.map;
    if (isPlainObject(map)) {
      Object.keys(map).forEach(alias => {
        const aliasHash = identityValueHash(alias);
        if (identityHashes.has(aliasHash)) {
          rows.push({ slot: 'map:key', value: aliasHash });
        }
        addIdentityOccurrence(rows, 'map:value:' + aliasHash, map[alias], identityHashes);
      });
    }
  } else if (kind === 'app/members') {
    addArray('list', source.list);
  } else if (kind === 'app/departments') {
    if (isPlainObject(source.map)) {
      Object.keys(source.map).forEach(department => {
        const departmentHash = identityValueHash(department);
        if (Array.isArray(source.map[department])) {
          source.map[department].forEach((value, index) => addIdentityOccurrence(
            rows, 'map:' + departmentHash + ':index:' + index, value, identityHashes));
        }
      });
    }
  } else if (kind === 'app/presiders') {
    addArray('names', source.names);
  } else if (kind === 'app/settings') {
    addScalar('schedulerName');
  } else if (kind === 'schedule') {
    if (isPlainObject(source.assignments)) {
      Object.keys(source.assignments).forEach(duty => addIdentityOccurrence(
        rows, 'assignments:' + identityValueHash(duty), source.assignments[duty], identityHashes));
    }
    if (isPlainObject(source.conflictOk)) {
      Object.keys(source.conflictOk).forEach(identity => {
        addIdentityOccurrence(rows, 'conflictOk:key', identity, identityHashes);
      });
    }
  } else if (kind === 'setlists') {
    ['presider', 'confirmedBy', 'updatedBy'].forEach(addScalar);
  } else if (kind === 'songStats') {
    if (Array.isArray(source.history)) {
      source.history.forEach((entry, index) => {
        if (isPlainObject(entry)) addIdentityOccurrence(
          rows, 'history:index:' + index, entry.by, identityHashes);
      });
    }
  } else if (kind === 'requests') {
    ['name', 'resolvedBy'].forEach(addScalar);
  } else if (kind === 'tokens') {
    addScalar('name');
  }
  return rows.sort((left, right) =>
    (left.slot + '\u0000' + left.value).localeCompare(right.slot + '\u0000' + right.value));
}

function scopeProof(records, identityHashList) {
  const identityHashes = new Set(identityHashList || []);
  const rows = [];
  (records || []).forEach(record => {
    const occurrences = identityOccurrences(record.collectionKind, record.data, identityHashes);
    occurrences.forEach(occurrence => rows.push({
      itemId: itemIdFor(record.collectionKind, record.docId),
      collectionKind: record.collectionKind,
      slot: occurrence.slot,
      value: occurrence.value
    }));
  });
  rows.sort((left, right) =>
    (left.itemId + '\u0000' + left.collectionKind + '\u0000' + left.slot + '\u0000' + left.value)
      .localeCompare(right.itemId + '\u0000' + right.collectionKind + '\u0000' + right.slot + '\u0000' + right.value));
  return hashValue({ version: 2, rows });
}

async function readRecordsInTransaction(transaction, db) {
  const snapshots = [];
  for (const collectionName of KNOWN_COLLECTIONS) {
    snapshots.push({
      collectionName,
      snapshot: await transaction.get(db.collection(collectionName))
    });
  }
  return collectRecordsFromSnapshots(snapshots);
}

async function loadCorrectionRecords(db) {
  if (!db || typeof db.collection !== 'function') fail('INVALID_DB', 'Correction requires a Firestore adapter');
  const snapshots = await Promise.all(KNOWN_COLLECTIONS.map(async collectionName => ({
    collectionName,
    snapshot: await db.collection(collectionName).get()
  })));
  return collectRecordsFromSnapshots(snapshots);
}

function buildCorrectionPlan(records, mapping, options) {
  const opts = options || {};
  const maxTargets = opts.maxTargets == null ? MAX_TARGET_DOCUMENTS : opts.maxTargets;
  if (!Number.isInteger(maxTargets) || maxTargets < 1 || maxTargets > MAX_TARGET_DOCUMENTS) {
    fail('INVALID_CAP', 'Correction target cap must be between one and the hard maximum');
  }
  const resolver = correctionResolver(mapping, opts.existingNameMap);
  const sourceRecords = Array.isArray(records) ? records : [];
  const occurrences = [];
  sourceRecords.forEach(record => {
    occurrences.push(...findUnexpectedOccurrences(record.data || {}, record.collectionKind, resolver));
  });
  if (occurrences.length) {
    const grouped = new Map();
    occurrences.forEach(entry => grouped.set(entry.path, (grouped.get(entry.path) || 0) + entry.count));
    fail('UNEXPECTED_OCCURRENCES', 'Unexpected exact identity occurrence outside the correction allowlist', {
      occurrences: Array.from(grouped.entries()).map(([path, count]) => ({ path, count }))
    });
  }

  const entries = sourceRecords.map(record => transformRecord(record, resolver)).filter(Boolean);
  const hasNameMap = sourceRecords.some(record =>
    record.collectionKind === 'app/nameMap' && record.exists !== false);
  if (!hasNameMap && Object.keys(resolver.map).length) {
    const synthetic = transformRecord({
      collectionName: 'app', collectionKind: 'app/nameMap', docId: 'nameMap', exists: false, data: {}
    }, resolver);
    if (synthetic) entries.push(synthetic);
  }
  if (entries.length > maxTargets) {
    fail('TARGET_CAP', 'Correction exceeds the target document cap', {
      targetCount: entries.length, maxTargets
    });
  }
  const frozenEntries = entries.map(entry => deepFreeze(entry));
  return deepFreeze({
    version: 1,
    targetCount: frozenEntries.length,
    maxTargets,
    mapping: resolver.map,
    scope: scopeForRecords(sourceRecords),
    entries: frozenEntries
  });
}

async function planCorrection(db, mapping, options) {
  const records = await loadCorrectionRecords(db);
  const opts = options || {};
  const storedMap = opts.existingNameMap !== undefined
    ? opts.existingNameMap
    : ((records.find(record => record.collectionKind === 'app/nameMap') || {}).data || {}).map;
  return buildCorrectionPlan(records, mapping, Object.assign({}, opts, {
    existingNameMap: storedMap
  }));
}

function describePlan(plan) {
  const kinds = Array.from(new Set((plan && plan.entries || []).map(entry => entry.collectionKind))).sort();
  return {
    targetCount: plan && plan.targetCount || 0,
    collectionKinds: kinds,
    maxTargets: plan && plan.maxTargets || MAX_TARGET_DOCUMENTS
  };
}

function requireTransaction(db) {
  if (!db || typeof db.runTransaction !== 'function') {
    fail('TRANSACTION_REQUIRED', 'Correction requires a transactional Firestore adapter');
  }
  return db.runTransaction.bind(db);
}

function documentRef(db, entry) {
  return db.collection(entry.collectionName).doc(entry.docId);
}

function backupRootRef(db, jobId) {
  return db.collection('_adminIdentityCorrections').doc(jobId);
}

function backupItemRef(db, jobId, itemId) {
  const root = backupRootRef(db, jobId);
  if (root && typeof root.collection === 'function') return root.collection('items').doc(itemId);
  return db.collection('_adminIdentityCorrections').doc(jobId + '__' + itemId);
}

function validateJobId(jobId) {
  if (typeof jobId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,127}$/.test(jobId)) {
    fail('INVALID_JOB_ID', 'Correction job ID must be opaque');
  }
  return jobId;
}

function makeJobId() {
  return crypto.randomUUID();
}

function backupItem(entry) {
  const item = {
    schemaVersion: 1,
    collectionKind: entry.collectionKind,
    before: clone(entry.beforeIdentity),
    after: clone(entry.afterIdentity),
    precondition: {
      beforeExists: entry.beforeExists,
      afterExists: true,
      beforeHash: entry.beforeHash,
      afterHash: entry.afterHash,
      beforeUpdateTime: entry.beforeUpdateTime || null
    }
  };
  return item;
}

function checkPlan(plan) {
  if (!plan || !Array.isArray(plan.entries)) fail('INVALID_PLAN', 'Correction plan is invalid');
  if (!Array.isArray(plan.scope)) fail('INVALID_PLAN', 'Correction plan is missing its scan precondition');
  if (!Object.isFrozen(plan) || plan.entries.some(entry => !Object.isFrozen(entry))) {
    fail('INVALID_PLAN', 'Correction plan must remain immutable after preflight');
  }
  const maxTargets = plan.maxTargets == null ? MAX_TARGET_DOCUMENTS : plan.maxTargets;
  if (!Number.isInteger(maxTargets) || maxTargets < 1 || maxTargets > MAX_TARGET_DOCUMENTS) {
    fail('INVALID_CAP', 'Correction target cap must be between one and the hard maximum');
  }
  if (plan.entries.length > MAX_TARGET_DOCUMENTS || plan.entries.length > maxTargets) {
    fail('TARGET_CAP', 'Correction exceeds the target document cap', {
      targetCount: plan.entries.length, maxTargets
    });
  }
  return plan;
}

function assertPlanEntriesUnchanged(plan) {
  plan.entries.forEach(entry => {
    if (hashDocument(entry.beforeExists, entry.before) !== entry.beforeHash ||
        hashDocument(true, entry.after) !== entry.afterHash) {
      fail('OPTIMISTIC_CONFLICT', 'Correction plan changed after preflight');
    }
  });
}

async function applyCorrection(db, plan, options) {
  checkPlan(plan);
  if (!plan.entries.length) return { jobId: null, targetCount: 0, collectionKinds: [] };
  assertPlanEntriesUnchanged(plan);
  const scopeIdentityHashList = identityScopeHashes(plan.mapping);
  const runTransaction = requireTransaction(db);
  const opts = options || {};
  const jobId = validateJobId(opts.jobId || makeJobId());
  const rootRef = backupRootRef(db, jobId);

  await runTransaction(async transaction => {
    const existingJob = await transaction.get(rootRef);
    if (existingJob && existingJob.exists) fail('JOB_EXISTS', 'Correction job already exists');
    const currentRecords = await readRecordsInTransaction(transaction, db);
    const currentScope = scopeForRecords(currentRecords);
    if (!valuesEqual(currentScope, plan.scope)) {
      fail('OPTIMISTIC_SCOPE_CONFLICT', 'A correction collection changed during preflight');
    }
    const currentByItem = new Map(currentRecords.map(record => [
      itemIdFor(record.collectionKind, record.docId), record
    ]));
    const current = [];
    for (const entry of plan.entries) {
      const currentRecord = currentByItem.get(entry.itemId);
      const exists = !!currentRecord && currentRecord.exists !== false;
      const data = exists ? (currentRecord.data || {}) : {};
      if (exists !== entry.beforeExists ||
          (currentRecord ? currentRecord.updateTime || null : null) !== (entry.beforeUpdateTime || null) ||
          hashDocument(exists, data) !== entry.beforeHash) {
        fail('OPTIMISTIC_CONFLICT', 'Correction target changed during preflight', {
          collectionKind: entry.collectionKind
        });
      }
      const after = clone(entry.after);
      if (hashDocument(true, after) !== entry.afterHash) {
        fail('OPTIMISTIC_CONFLICT', 'Correction plan changed after preflight');
      }
      current.push({ entry, record: currentRecord, data, after });
    }

    const afterByItem = new Map(current.map(item => [item.entry.itemId, item.after]));
    const afterRecords = currentRecords.map(record => {
      const itemId = itemIdFor(record.collectionKind, record.docId);
      return afterByItem.has(itemId)
        ? Object.assign({}, record, { exists: true, data: afterByItem.get(itemId) })
        : record;
    });
    current.forEach(({ entry, record, after }) => {
      if (record) return;
      afterRecords.push({
        collectionName: entry.collectionName,
        collectionKind: entry.collectionKind,
        docId: entry.docId,
        exists: true,
        updateTime: null,
        data: after
      });
    });
    const afterScopeProof = scopeProof(afterRecords, scopeIdentityHashList);

    transaction.set(rootRef, {
      schemaVersion: 1,
      status: 'applied',
      itemCount: plan.entries.length,
      scopeProofVersion: 1,
      scopeProof: afterScopeProof,
      scopeIdentityHashes: scopeIdentityHashList
    });
    current.forEach(({ entry, after }) => {
      const ref = documentRef(db, entry);
      // A full replacement is intentional. Firestore's merge mode recursively
      // retains removed conflictOk keys, which would leave the old identity
      // active after a correction.
      transaction.set(ref, after);
      const itemRef = backupItemRef(db, jobId, entry.itemId);
      const item = backupItem(entry);
      if (typeof rootRef.collection !== 'function') item.jobId = jobId;
      transaction.set(itemRef, item);
    });
  });

  return Object.assign(describePlan(plan), { jobId });
}

function readSnapshotData(snapshot) {
  return snapshot && snapshot.exists ? (snapshot.data() || {}) : {};
}

function matchesIdentitySnapshot(kind, data, snapshot) {
  const expected = snapshot || {};
  const missing = new Set(Array.isArray(expected._missing) ? expected._missing : []);
  for (const field of missing) {
    if (hasOwn.call(data, field)) return false;
  }
  for (const field of Object.keys(expected)) {
    if (field === '_missing') continue;
    if (kind === 'songStats' && field === 'history') {
      const history = Array.isArray(data.history) ? data.history : [];
      if (history.length !== expected.history.length) return false;
      for (let i = 0; i < expected.history.length; i++) {
        const wanted = expected.history[i];
        const present = isPlainObject(history[i]) && hasOwn.call(history[i], 'by');
        if (wanted.missing ? present : !present || !valuesEqual(history[i].by, wanted.by)) return false;
      }
      continue;
    }
    if (!hasOwn.call(data, field) || !valuesEqual(data[field], expected[field])) return false;
  }
  return true;
}

function restoreIdentitySnapshot(kind, data, before) {
  const restored = clone(data || {});
  const missing = new Set(Array.isArray(before && before._missing) ? before._missing : []);
  Object.keys(before || {}).forEach(field => {
    if (field === '_missing') return;
    if (kind === 'songStats' && field === 'history') {
      const history = Array.isArray(restored.history) ? restored.history.map(item => clone(item)) : [];
      before.history.forEach((wanted, index) => {
        if (!history[index] || typeof history[index] !== 'object') return;
        if (wanted.missing) delete history[index].by;
        else history[index].by = clone(wanted.by);
      });
      restored.history = history;
      return;
    }
    setOwn(restored, field, clone(before[field]));
  });
  missing.forEach(field => { delete restored[field]; });
  return restored;
}

async function loadBackupItems(db, jobId, root) {
  if (root && typeof root.collection === 'function') {
    const snapshot = await root.collection('items').get();
    return (snapshot.docs || []).map(document => ({ id: document.id, data: document.data() || {} }));
  }
  const snapshot = await db.collection('_adminIdentityCorrections').get();
  return (snapshot.docs || []).map(document => ({ id: document.id, data: document.data() || {} }))
    .filter(item => item.data.jobId === jobId && item.id !== jobId);
}

async function rollbackCorrection(db, jobId, options) {
  const validJobId = validateJobId(jobId);
  const root = backupRootRef(db, validJobId);
  const rootSnapshot = await root.get();
  if (!rootSnapshot || !rootSnapshot.exists) fail('BACKUP_NOT_FOUND', 'Correction backup was not found');
  const rootData = rootSnapshot.data() || {};
  if (rootData.status !== 'applied') fail('BACKUP_NOT_ACTIVE', 'Correction backup is not active');
  const items = await loadBackupItems(db, validJobId, root);
  if (items.length !== rootData.itemCount) fail('BACKUP_INCOMPLETE', 'Correction backup item count is incomplete');
  if (items.length > MAX_TARGET_DOCUMENTS) fail('TARGET_CAP', 'Correction backup exceeds the target document cap');
  if (rootData.scopeProofVersion !== 1 || typeof rootData.scopeProof !== 'string') {
    fail('BACKUP_INCOMPLETE', 'Correction backup scope proof is missing');
  }
  if (!Array.isArray(rootData.scopeIdentityHashes) ||
      rootData.scopeIdentityHashes.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
    fail('BACKUP_INCOMPLETE', 'Correction backup identity scope proof is missing');
  }
  const itemIds = new Set();
  items.forEach(item => {
    const data = item.data || {};
    const precondition = data.precondition || {};
    if (typeof item.id !== 'string' || itemIds.has(item.id) ||
        !/^i_[a-f0-9]{40}$/.test(item.id) ||
        typeof data.collectionKind !== 'string' ||
        typeof precondition.beforeExists !== 'boolean' ||
        typeof precondition.afterExists !== 'boolean' ||
        typeof precondition.beforeHash !== 'string' ||
        typeof precondition.afterHash !== 'string') {
      fail('BACKUP_INCOMPLETE', 'Correction backup preconditions are incomplete');
    }
    itemIds.add(item.id);
  });

  let targets = [];
  const runTransaction = requireTransaction(db);
  await runTransaction(async transaction => {
    const currentRecords = await readRecordsInTransaction(transaction, db);
    if (scopeProof(currentRecords, rootData.scopeIdentityHashes) !== rootData.scopeProof) {
      fail('ROLLBACK_CONFLICT', 'Correction identity scope changed after the correction');
    }
    const recordByItem = new Map();
    currentRecords.forEach(record => {
      recordByItem.set(itemIdFor(record.collectionKind, record.docId), record);
    });
    targets = items.map(item => {
      const data = item.data || {};
      const record = recordByItem.get(item.id);
      if (!data.collectionKind || !data.precondition || !data.before || !data.after) {
        fail('BACKUP_TARGET_MISSING', 'Correction backup target metadata is incomplete');
      }
      if (!record || data.collectionKind !== record.collectionKind) {
        fail('ROLLBACK_CONFLICT', 'Correction target changed after the correction');
      }
      return { item, record };
    });
    const current = [];
    for (const target of targets) {
      const data = target.item.data;
      const snapshot = await transaction.get(documentRef(db, target.record));
      const exists = !!(snapshot && snapshot.exists);
      const currentData = readSnapshotData(snapshot);
      if (!exists || exists !== !!data.precondition.afterExists ||
          (!data.precondition.beforeExists && hashDocument(exists, currentData) !== data.precondition.afterHash) ||
          !matchesIdentitySnapshot(data.collectionKind, currentData, data.after)) {
        fail('ROLLBACK_CONFLICT', 'Correction target changed after the correction');
      }
      current.push({ target, currentData });
    }
    current.forEach(({ target, currentData }) => {
      const data = target.item.data;
      const ref = documentRef(db, target.record);
      if (!data.precondition.beforeExists) transaction.delete(ref);
      else transaction.set(ref, restoreIdentitySnapshot(data.collectionKind, currentData, data.before));
    });
    transaction.set(root, { status: 'rolledBack' }, { merge: true });
  });

  return {
    jobId: validJobId,
    targetCount: targets.length,
    collectionKinds: Array.from(new Set(targets.map(target => target.item.data.collectionKind))).sort()
  };
}

module.exports = {
  MAX_TARGET_DOCUMENTS,
  KNOWN_COLLECTIONS,
  CORRECTION_ALLOWLIST,
  IdentityCorrectionError,
  normalizeIdentityMap,
  createIdentityResolver,
  correctedIdentityMap,
  correctionResolver,
  canonicalize,
  sameIdentity,
  legacyAliases,
  identityVariants,
  stableSerialize,
  hashValue,
  hashDocument,
  snapshotVersion,
  deepFreeze,
  itemIdFor,
  loadCorrectionRecords,
  buildCorrectionPlan,
  planCorrection,
  describePlan,
  applyCorrection,
  rollbackCorrection,
  makeJobId
};
