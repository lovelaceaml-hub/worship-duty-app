'use strict';

const { parsePinHash } = require('./member-auth');

/*
 * Canonical identity migration for the Worship Duty data model.
 *
 * This module is deliberately independent of Firebase. The pure planner can
 * be tested with plain objects, while migrateMemberAccess accepts a small
 * store adapter for a real Firestore run. The migration only updates or removes
 * existing records, never resets a collection, and is safe to run repeatedly.
 */

const STATIC_ALIASES = Object.freeze({
  'B. Anthony L': 'B. Anthony',
  'D. Chris K': 'D. Chris',
  'D. Chris Kane': 'D. Chris',
  'B. James D': 'B. James',
  'B. Jason S': 'B. Jason',
  'S. Martha B': 'S. Martha',
  'S. Monica Salazar': 'S. Monica S',
  'M.Chad': 'M. Chad',
  'B. Gio': 'B. Giomar',
  'D. Chloe': 'M. Chloe',
  'B,James': 'B. James',
  'BJason': 'B. Jason',
  'S. Melisaa': 'S. Melissa',
  'S. Monica C.': 'S. Monica C',
  'S. Monica S.': 'S. Monica S'
});

const MIGRATION_ID = 'wds-member-access-migration-v1';

/*
 * This is the requested initial role configuration. Keep it in one place so
 * the migration and its callers cannot drift into separate name lists. The
 * arrays are intentionally ordered for readable dry-run output; general
 * member lists are sorted while the role groups retain this declared order.
 */
const DEFAULT_ACCESS_CONFIGURATION = Object.freeze({
  admin: Object.freeze(['B. Anthony']),
  globalLeaderManager: Object.freeze(['B. Anthony', 'E. Simon']),
  departmentLeaders: Object.freeze({
    Worship: Object.freeze(['E. Simon', 'D. Armani', 'B. Brent']),
    'Usher Sisters': Object.freeze(['M. Chloe']),
    'Usher Brothers': Object.freeze(['D. Chris']),
    Lobby: Object.freeze(['S. Anessa']),
    Translation: Object.freeze(['S. Paola']),
    Media: Object.freeze(['D. Aaron', 'D. Armani', 'B. Brent']),
    'Parking Lot': Object.freeze(['D. Aaron']),
    Offering: Object.freeze(['S. Elisa'])
  }),
  songEditors: Object.freeze(['D. Danielle', 'B. James', 'D. Aaron', 'D. Armani', 'B. Brent'])
});

const LEADER_FIELD = 'departmentLeaders';
const SONG_EDITOR_NAMES_FIELD = 'editorNames';
const SONG_EDITOR_HASH_FIELD = 'editorPinHash';

const PLAINTEXT_PIN_FIELDS = Object.freeze([
  'pin', 'pinCode', 'plainPin', 'plaintextPin', 'initialPin',
  'privilegedPin', 'editorPin', 'songEditorPin'
]);

const PRIVILEGED_ROLE_ARRAYS = Object.freeze([
  'admin', 'admins', 'globalLeaderManager', 'globalLeaderManagers',
  'songEditors', 'songEditorNames', 'editorNames', 'leaderNames'
]);

const NAME_FIELDS = Object.freeze([
  'name', 'memberName', 'displayName', 'canonicalName', 'requestedBy',
  'resolvedBy', 'createdBy', 'updatedBy', 'presider', 'schedulerName',
  'leaderName', 'editorName', 'ownerName', 'fromMember', 'toMember',
  'requesterName', 'recipientName', 'senderName', 'approverName',
  'accountName', 'targetName', 'member', 'assignedTo', 'confirmedBy',
  'editedBy', 'markedBy', 'archivedBy', 'restoredBy', 'actor', 'actorName',
  'targetMember', 'subjectMember', 'affectedMember', 'memberId', 'leaderId',
  'acknowledgedBy', 'acknowledgedFor', 'changedBy', 'reviewedBy', 'removedBy', 'by',
  'requester', 'recipient', 'assignee', 'leader', 'editor', 'account', 'subject'
]);

const NAME_ARRAY_FIELDS = Object.freeze([
  'members', 'memberNames', 'names', 'departmentLeaders', 'leaderNames',
  'songEditors', 'songEditorNames', 'editorNames', 'presiders', 'leaders',
  'admins', 'globalLeaderManager', 'globalLeaderManagers', 'privilegedMembers',
  'recipients', 'owners', 'editors', 'targets', 'targetMembers',
  'membersToNotify', 'affectedMembers', 'acknowledgedMembers', 'departmentMembers'
]);

const NAME_MAP_FIELDS = Object.freeze([
  'memberRoles', 'membersByDepartment', 'accounts', 'leadersByDepartment',
  'notificationsByMember', 'recipientsByMember', 'membershipsByMember',
  'byMember', 'memberMap', 'departmentLeaders', 'leaders', 'memberships',
  'acknowledgments', 'conflictAcknowledgements', 'notificationTargets'
]);

function clone(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  if (!isPlainObject(value)) return value;
  const output = {};
  Object.keys(value).forEach(key => { output[key] = clone(value[key]); });
  return output;
}

function normalizeMemberName(value) {
  let name = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!name) return '';

  const long = name.match(/^(Brother|Bro|Deacon|Sister|Sis|Missionary|Evangelist)\b[\s,.:;-]*(.+)$/i);
  if (long) {
    const prefix = {
      brother: 'B.', bro: 'B.', deacon: 'D.', sister: 'S.', sis: 'S.',
      missionary: 'M.', evangelist: 'E.'
    }[long[1].toLowerCase()];
    return prefix + ' ' + long[2].trim().replace(/\s+/g, ' ');
  }

  const short = name.match(/^([BDSME])(?:\s+|[.,:;-]\s*)(.+)$/i);
  if (short) {
    const prefix = { b: 'B.', d: 'D.', s: 'S.', m: 'M.', e: 'E.' }[short[1].toLowerCase()];
    return prefix + ' ' + short[2].trim().replace(/\s+/g, ' ');
  }
  return name;
}

function makeCanonicalizer(aliasMap) {
  const aliases = Object.assign({}, aliasMap || {}, STATIC_ALIASES);
  return value => {
    const original = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!original) return '';
    let current = original;
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      if (seen.has(current)) break;
      seen.add(current);
      const normalized = normalizeMemberName(current);
      const next = aliases[current] || aliases[normalized];
      if (!next) return normalized;
      current = String(next).trim().replace(/\s+/g, ' ');
    }
    return normalizeMemberName(current);
  };
}

function uniqueSorted(values, canon) {
  const seen = new Set();
  (values || []).forEach(value => {
    const name = canon ? canon(value) : value;
    if (name) seen.add(name);
  });
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function uniqueCanonical(values, canon) {
  const seen = new Set();
  (values || []).forEach(value => {
    const name = canon ? canon(value) : value;
    if (name) seen.add(name);
  });
  return Array.from(seen);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isEmptyMergeValue(value) {
  return value == null || value === '';
}

/*
 * Merge an alias record into its canonical record without dropping fields.
 * The canonical value is the primary value when both records have a scalar,
 * while arrays and nested objects retain information from both records.
 */
function mergeCanonicalValues(primary, fallback) {
  if (isEmptyMergeValue(primary)) return clone(fallback);
  if (isEmptyMergeValue(fallback)) return clone(primary);

  if (Array.isArray(primary) && Array.isArray(fallback)) {
    const output = primary.map(clone);
    fallback.forEach(value => {
      if (!output.some(existing => sameJson(existing, value))) output.push(clone(value));
    });
    return output;
  }

  if (isPlainObject(primary) && isPlainObject(fallback)) {
    const output = clone(fallback);
    Object.keys(primary).forEach(key => {
      output[key] = Object.prototype.hasOwnProperty.call(fallback, key)
        ? mergeCanonicalValues(primary[key], fallback[key])
        : clone(primary[key]);
    });
    return output;
  }

  if (typeof primary === 'number' && typeof fallback === 'number') {
    return Math.max(primary, fallback);
  }
  return clone(primary);
}

function remapIdentityMap(value, canon, fieldName) {
  const rows = Object.keys(value || {}).map((rawKey, index) => {
    const canonicalKey = canon(rawKey) || rawKey;
    return {
      rawKey,
      canonicalKey,
      index,
      isCanonical: canonicalKey === rawKey,
      data: transformNestedIdentityReferences(value[rawKey], canon, fieldName)
    };
  });

  // Process aliases first so the canonical record is always the primary side
  // of a collision merge, independent of Firestore/object enumeration order.
  rows.sort((left, right) => Number(left.isCanonical) - Number(right.isCanonical) || left.index - right.index);
  const output = {};
  rows.forEach(row => {
    if (!Object.prototype.hasOwnProperty.call(output, row.canonicalKey)) {
      output[row.canonicalKey] = row.data;
    } else if (row.isCanonical) {
      output[row.canonicalKey] = mergeCanonicalValues(row.data, output[row.canonicalKey]);
    } else {
      output[row.canonicalKey] = mergeCanonicalValues(output[row.canonicalKey], row.data);
    }
  });
  return output;
}

function remapAcknowledgment(value, canon, fieldName) {
  const keys = Object.keys(value || {});
  const usesNamedFields = keys.some(key => NAME_FIELDS.includes(key) ||
    NAME_ARRAY_FIELDS.includes(key) || NAME_MAP_FIELDS.includes(key));
  return usesNamedFields
    ? transformNestedIdentityReferences(value, canon, fieldName)
    : remapIdentityMap(value, canon, fieldName);
}

function canonicalizeArrayMap(value, canon) {
  const output = {};
  Object.keys(value || {}).forEach(key => {
    const source = value[key];
    output[key] = Array.isArray(source) ? uniqueCanonical(source, canon) : clone(source);
  });
  return output;
}

function transformNestedIdentityReferences(value, canon, fieldName) {
  if (Array.isArray(value)) {
    if (NAME_ARRAY_FIELDS.includes(fieldName)) return uniqueSorted(value, canon);
    return value.map(item => transformNestedIdentityReferences(item, canon, fieldName));
  }
  if (!isPlainObject(value)) return value;

  const output = {};
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (NAME_FIELDS.includes(key) && typeof child === 'string' && child) {
      output[key] = canon(child);
    } else if (NAME_ARRAY_FIELDS.includes(key) && Array.isArray(child)) {
      output[key] = uniqueSorted(child, canon);
    } else if ((key === 'acknowledgment' || key === 'acknowledgement' ||
      key === 'acknowledgments' || key === 'acknowledgements' ||
      key === 'conflictAcknowledgment' || key === 'conflictAcknowledgements') && isPlainObject(child)) {
      output[key] = remapAcknowledgment(child, canon, key);
    } else if (NAME_MAP_FIELDS.includes(key) && isPlainObject(child)) {
      output[key] = remapIdentityMap(child, canon, key);
    } else {
      output[key] = transformNestedIdentityReferences(child, canon, key);
    }
  });
  return output;
}

function canonicalizeAccessConfiguration(config, canon) {
  const source = clone(config || {});
  const output = {};
  Object.keys(source).forEach(key => {
    const value = source[key];
    if (Array.isArray(value)) output[key] = uniqueCanonical(value, canon);
    else if (key === 'departmentLeaders' && isPlainObject(value)) {
      output[key] = canonicalizeArrayMap(value, canon);
    } else if (isPlainObject(value)) {
      output[key] = transformNestedIdentityReferences(value, canon, key);
    } else {
      output[key] = value;
    }
  });
  return output;
}

function configuredPrivilegedNames(accessConfig, options, canon) {
  const names = [];
  const add = value => {
    if (Array.isArray(value)) names.push(...value);
  };
  PRIVILEGED_ROLE_ARRAYS.forEach(field => add(accessConfig[field]));
  Object.values(accessConfig.departmentLeaders || {}).forEach(add);
  add(options && options.leaderNames);
  add(options && options.songEditorNames);
  return uniqueSorted(names, canon);
}

function requestedAccessConfiguration(settings, options, canon) {
  options = options || {};
  const explicit = options.accessConfiguration || options.accessConfig ||
    options.roleConfig || options.leaderConfiguration;
  const existing = settings && (settings.access || settings.roles || settings.memberAccess);
  const source = Object.assign({}, existing || {}, DEFAULT_ACCESS_CONFIGURATION, explicit || {});
  if (explicit && explicit.departmentLeaders) {
    source.departmentLeaders = explicit.departmentLeaders;
  }
  return canonicalizeAccessConfiguration(source, canon);
}

function allDepartmentLeaders(departmentLeaders, canon) {
  const names = [];
  if (Array.isArray(departmentLeaders)) names.push(...departmentLeaders);
  else Object.values(departmentLeaders || {}).forEach(value => {
    if (Array.isArray(value)) names.push(...value);
  });
  return uniqueSorted(names, canon);
}

function assertNoPlaintextPinFields(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPlaintextPinFields(item, path + '[' + index + ']'));
    return;
  }
  if (!isPlainObject(value)) return;
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (PLAINTEXT_PIN_FIELDS.includes(key) && !isEmptyMergeValue(child)) {
      throw new Error('plaintext PIN field is not allowed at ' + path + '.' + key);
    }
    assertNoPlaintextPinFields(child, path + '.' + key);
  });
}

function normalizeExistingHash(value, path) {
  if (isEmptyMergeValue(value)) return '';
  try {
    return assertHash(value);
  } catch (error) {
    throw new Error(path + ' must be a 64-character SHA-256 hex string');
  }
}

function normalizeAccountHash(value, path) {
  if (isEmptyMergeValue(value) || !parsePinHash(String(value))) {
    throw new Error(path + ' must be a supported salted PIN hash');
  }
  return String(value);
}

function applyHashField(target, field, replacement, path, options) {
  options = options || {};
  const current = target[field];
  if (replacement && options.force) {
    const replacementHash = assertHash(replacement);
    target[field] = replacementHash;
    return { replaced: !isEmptyMergeValue(current), changed: current !== replacementHash };
  }
  if (isEmptyMergeValue(current)) {
    if (!replacement) return { replaced: false, changed: false };
    const replacementHash = assertHash(replacement);
    target[field] = replacementHash;
    return { replaced: false, changed: true };
  }
  if (!isEmptyMergeValue(current)) {
    try {
      const normalized = normalizeExistingHash(current, path + '.' + field);
      target[field] = normalized;
      return { replaced: false, changed: current !== normalized };
    } catch (error) {
      if (!replacement) throw error;
      const replacementHash = assertHash(replacement);
      target[field] = replacementHash;
      return { replaced: true, changed: current !== replacementHash };
    }
  }
  return { replaced: false, changed: false };
}

function accountName(data, id, canon) {
  const candidate = data && (data.memberName || data.name || data.displayName || data.accountName);
  return canon(candidate || id || '');
}

function remapNameMap(map, canon) {
  const output = {};
  Object.keys(map || {}).forEach(rawKey => {
    const rawValue = map[rawKey];
    const key = String(rawKey).trim().replace(/\s+/g, ' ');
    const value = canon(rawValue || key);
    if (key && value && key !== value) output[key] = value;
  });
  Object.keys(STATIC_ALIASES).forEach(rawKey => {
    const value = canon(rawKey);
    if (rawKey !== value) output[rawKey] = value;
  });
  return output;
}

function remapConflictOk(conflictOk, canon) {
  const output = {};
  Object.keys(conflictOk || {}).forEach(rawName => {
    const name = canon(rawName);
    if (!name) return;
    const duties = Array.isArray(conflictOk[rawName]) ? conflictOk[rawName] : [];
    output[name] = Array.from(new Set((output[name] || []).concat(duties)));
  });
  return output;
}

function remapAssignments(assignments, canon) {
  const output = {};
  Object.keys(assignments || {}).forEach(duty => {
    const value = assignments[duty];
    output[duty] = value ? canon(value) : value;
  });
  return output;
}

function transformNamedDocument(input, canon) {
  const output = transformNestedIdentityReferences(input || {}, canon, 'document') || {};
  if (output.assignments && typeof output.assignments === 'object') {
    output.assignments = remapAssignments(output.assignments, canon);
  }
  if (output.conflictOk && typeof output.conflictOk === 'object') {
    output.conflictOk = remapConflictOk(output.conflictOk, canon);
  }
  if (Array.isArray(output.recipientNames)) output.recipientNames = uniqueSorted(output.recipientNames, canon);
  if (Array.isArray(output.leaderIds)) output.leaderIds = output.leaderIds.slice();
  if (Array.isArray(output.history)) {
    output.history = output.history.map(entry => {
      const next = transformNestedIdentityReferences(entry, canon, 'history') || {};
      if (typeof next.by === 'string' && next.by) next.by = canon(next.by);
      if (typeof next.memberName === 'string' && next.memberName) next.memberName = canon(next.memberName);
      return next;
    });
  }
  return output;
}

function entriesFor(snapshot, collection) {
  const value = snapshot && snapshot[collection];
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((doc, index) => {
      const wrapped = isPlainObject(doc) && isPlainObject(doc.data) ? doc : null;
      return {
        id: String((wrapped && wrapped.id) || (doc && doc.id) || index),
        data: wrapped ? wrapped.data : doc,
        wrapped: !!wrapped,
        explicitId: !!(wrapped ? Object.prototype.hasOwnProperty.call(wrapped, 'id') : doc && Object.prototype.hasOwnProperty.call(doc, 'id'))
      };
    });
  }
  return Object.keys(value).map(id => {
    const doc = value[id];
    if (isPlainObject(doc) && isPlainObject(doc.data)) {
      return { id: String(doc.id || id), data: doc.data, wrapped: true, explicitId: true };
    }
    return { id, data: doc || {}, wrapped: false, explicitId: false };
  });
}

function setEntry(snapshot, collection, id, data) {
  if (Array.isArray(snapshot[collection])) {
    const row = snapshot[collection].find((item, index) => {
      const itemId = item && item.data ? item.id : item && item.id;
      return String(itemId == null ? index : itemId) === String(id);
    });
    if (row && row.data) row.data = data;
    else if (row) Object.assign(row, data);
    else if (snapshot[collection].some(item => item && item.data)) {
      snapshot[collection].push({ id: String(id), data });
    } else {
      snapshot[collection].push(Object.assign({ id: String(id) }, data));
    }
    return;
  }
  if (!snapshot[collection]) snapshot[collection] = {};
  const current = snapshot[collection][id];
  if (isPlainObject(current) && isPlainObject(current.data)) current.data = data;
  else snapshot[collection][id] = data;
}

function readAppDoc(snapshot, name) {
  return snapshot && snapshot.app && snapshot.app[name] ? snapshot.app[name] : null;
}

function setAppDoc(snapshot, name, data) {
  if (!snapshot.app) snapshot.app = {};
  snapshot.app[name] = data;
}

function pushIfChanged(writes, path, before, after, options) {
  if (!sameJson(before, after)) writes.push({ path, data: after, options: options || { merge: false } });
}

function replaceSetWrite(writes, path, data, options) {
  const existing = writes.find(write => write.path === path && !write.delete);
  if (existing) {
    existing.data = data;
    existing.options = options || existing.options || { merge: false };
    return;
  }
  writes.push({ path, data, options: options || { merge: false } });
}

function canonicalCollectionId(id, canon) {
  const raw = String(id == null ? '' : id);
  const target = canon(raw);
  return target && target !== raw ? target : raw;
}

function planCollection(database, collection, canon) {
  const source = database[collection];
  const entries = entriesFor(database, collection);
  if (!entries.length) return { writes: [], changed: 0, database: source };

  const groups = new Map();
  entries.forEach((entry, index) => {
    const id = String(entry.id);
    const targetId = canonicalCollectionId(id, canon);
    const transformed = transformNamedDocument(entry.data || {}, canon);
    if (targetId !== id && transformed.id === id) transformed.id = targetId;
    const row = {
      id,
      targetId,
      index,
      isCanonical: id === targetId,
      original: clone(entry.data || {}),
      data: transformed,
      wrapped: !!entry.wrapped,
      explicitId: !!entry.explicitId
    };
    if (!groups.has(targetId)) groups.set(targetId, []);
    groups.get(targetId).push(row);
  });

  const writes = [];
  const outputEntries = [];
  for (const [targetId, group] of groups) {
    group.sort((left, right) => Number(left.isCanonical) - Number(right.isCanonical) || left.index - right.index);
    let merged = group[0].data;
    for (let i = 1; i < group.length; i++) {
      merged = group[i].isCanonical
        ? mergeCanonicalValues(group[i].data, merged)
        : mergeCanonicalValues(merged, group[i].data);
    }

    const canonicalRow = group.find(row => row.id === targetId);
    const before = canonicalRow ? canonicalRow.original : undefined;
    if (!sameJson(before, merged)) {
      writes.push({
        path: collection + '/' + targetId,
        data: merged,
        options: { merge: false }
      });
    }
    group.filter(row => row.id !== targetId).forEach(row => {
      writes.push({ path: collection + '/' + row.id, delete: true });
    });

    outputEntries.push({ targetId, group, data: merged });
  }

  if (Array.isArray(source)) {
    database[collection] = outputEntries.map(entry => {
      const first = entry.group[0];
      if (first.wrapped) return { id: entry.targetId, data: clone(entry.data) };
      const row = clone(entry.data) || {};
      if (first.explicitId || entry.targetId !== first.id) row.id = entry.targetId;
      return row;
    });
  } else {
    const output = {};
    outputEntries.forEach(entry => { output[entry.targetId] = entry.data; });
    database[collection] = output;
  }

  return {
    writes,
    changed: outputEntries.filter(entry => {
      const canonicalRow = entry.group.find(row => row.id === entry.targetId);
      return !canonicalRow || !sameJson(canonicalRow.original, entry.data) || entry.group.some(row => row.id !== entry.targetId);
    }).length,
    database: database[collection]
  };
}

function transformDatabase(input, options) {
  options = options || {};
  const directHash = options.privilegedPinHash || options.initialPinHash || options.initialPrivilegedPinHash;
  if (directHash) {
    options = Object.assign({}, options, { privilegedPinHash: assertAccountHash(directHash) });
  }
  if (options.songEditorPinHash || options.editorPinHash) {
    options = Object.assign({}, options, {
      songEditorPinHash: assertHash(options.songEditorPinHash || options.editorPinHash)
    });
  }
  const database = clone(input || {});
  if (!database.app) database.app = {};
  const storedMap = (readAppDoc(database, 'nameMap') || {}).map || {};
  const canon = makeCanonicalizer(Object.assign({}, storedMap, options.aliases || {}));
  assertNoPlaintextPinFields(database, 'database');
  const writes = [];
  const counts = {
    members: 0, departments: 0, schedules: 0, requests: 0, conflicts: 0,
    notifications: 0, leaders: 0, accounts: 0, songs: 0, presiders: 0,
    nameMap: 0, cached: 0
  };

  const members = readAppDoc(database, 'members');
  if (members && Array.isArray(members.list)) {
    const next = Object.assign({}, members, { list: uniqueSorted(members.list, canon) });
    if (!sameJson(members, next)) counts.members = 1;
    setAppDoc(database, 'members', next);
    pushIfChanged(writes, 'app/members', members, next);
  }

  const departments = readAppDoc(database, 'departments');
  if (departments && departments.map && typeof departments.map === 'object') {
    const nextMap = {};
    Object.keys(departments.map).forEach(category => {
      const before = departments.map[category];
      nextMap[category] = Array.isArray(before)
        ? uniqueSorted(before, canon)
        : transformNestedIdentityReferences(before, canon, category);
    });
    const next = Object.assign({}, departments, { map: nextMap });
    if (!sameJson(departments, next)) counts.departments = 1;
    setAppDoc(database, 'departments', next);
    pushIfChanged(writes, 'app/departments', departments, next);
  }

  for (const collection of [
    'schedule', 'requests', 'tokens', 'notifications', 'accounts',
    'memberships', 'leaders', 'leaderConfig', 'conflictAcknowledgements',
    'acknowledgments', 'presiders', 'setlists'
  ]) {
    const beforeEntries = entriesFor(database, collection);
    const plan = planCollection(database, collection, canon);
    writes.push(...plan.writes);
    if (collection === 'schedule') {
      beforeEntries.forEach(entry => {
        const next = transformNamedDocument(entry.data || {}, canon);
        if (entry.data && entry.data.conflictOk && !sameJson(entry.data.conflictOk, next.conflictOk)) counts.conflicts++;
      });
      counts.schedules += plan.changed;
    }
    if (collection === 'requests') counts.requests += plan.changed;
    if (collection === 'tokens' || collection === 'notifications') counts.notifications += plan.changed;
    if (collection === 'accounts' || collection === 'memberships') counts.accounts += plan.changed;
    if (collection === 'setlists') counts.songs += plan.changed;
  }

  const settings = readAppDoc(database, 'settings') || {};
  const access = requestedAccessConfiguration(settings, options, canon);
  const nextSettings = transformNamedDocument(settings, canon);
  nextSettings.access = access;
  nextSettings.roles = settings.roles ? access : nextSettings.roles;
  nextSettings.memberAccess = settings.memberAccess ? access : nextSettings.memberAccess;
  nextSettings.admin = uniqueCanonical(access.admin || [], canon);
  nextSettings.globalLeaderManager = uniqueCanonical(access.globalLeaderManager || [], canon);
  nextSettings.songEditors = uniqueCanonical(access.songEditors || [], canon);
  nextSettings.leaderNames = allDepartmentLeaders(access.departmentLeaders, canon);
  nextSettings[LEADER_FIELD] = Array.isArray(options.leaderNames)
    ? uniqueSorted(options.leaderNames, canon)
    : clone(access.departmentLeaders);
  applyHashField(nextSettings, 'pinHash', options.settingsPinHash, 'app/settings', { force: true });
  applyHashField(nextSettings, 'sitePinHash', '', 'app/settings');
  if (Object.keys(nextSettings).length) {
    if (!sameJson(settings, nextSettings)) counts.leaders = 1;
    setAppDoc(database, 'settings', nextSettings);
    pushIfChanged(writes, 'app/settings', settings, nextSettings);
  }

  const songSettings = readAppDoc(database, 'songSettings') || {};
  const nextSongSettings = transformNamedDocument(songSettings, canon);
  const configuredEditors = Array.isArray(options.songEditorNames)
    ? uniqueCanonical(options.songEditorNames, canon)
    : uniqueCanonical(access.songEditors || [], canon);
  nextSongSettings[SONG_EDITOR_NAMES_FIELD] = configuredEditors;
  if (songSettings.songEditors || options.songEditors) nextSongSettings.songEditors = configuredEditors;
  const songEditorHash = options.songEditorPinHash || options.editorPinHash || options.privilegedPinHash;
  applyHashField(nextSongSettings, SONG_EDITOR_HASH_FIELD, songEditorHash, 'app/songSettings');
  setAppDoc(database, 'songSettings', nextSongSettings);
  pushIfChanged(writes, 'app/songSettings', songSettings, nextSongSettings);

  const presiders = readAppDoc(database, 'presiders');
  if (presiders) {
    const next = transformNamedDocument(presiders, canon);
    if (!sameJson(presiders, next)) counts.presiders = 1;
    setAppDoc(database, 'presiders', next);
    pushIfChanged(writes, 'app/presiders', presiders, next);
  }

  const nameMap = readAppDoc(database, 'nameMap');
  const oldMap = nameMap && nameMap.map ? nameMap.map : {};
  const nextMap = remapNameMap(Object.assign({}, oldMap, STATIC_ALIASES, options.aliases || {}), canon);
  const nextNameMap = Object.assign({}, nameMap || {}, { map: nextMap });
  if (!nameMap || !sameJson(nameMap, nextNameMap)) counts.nameMap = 1;
  setAppDoc(database, 'nameMap', nextNameMap);
  if (!nameMap || !sameJson(nameMap, nextNameMap)) {
    writes.push({ path: 'app/nameMap', data: nextNameMap, options: { merge: false } });
  }

  ['leaderConfig', 'memberAccess', 'notifications'].forEach(name => {
    const before = readAppDoc(database, name);
    if (!before && name !== 'leaderConfig') return;
    const hasLegacyIdentity = before && Object.keys(STATIC_ALIASES)
      .some(alias => JSON.stringify(before).includes(JSON.stringify(alias)));
    const next = !before
      ? canonicalizeAccessConfiguration(access, canon)
      : (name === 'leaderConfig' && !hasLegacyIdentity ? clone(before) : transformNamedDocument(before, canon));
    setAppDoc(database, name, next);
    pushIfChanged(writes, 'app/' + name, before, next);
  });

  const appAccounts = readAppDoc(database, 'accounts');
  if (appAccounts) {
    const next = transformNamedDocument(appAccounts, canon);
    setAppDoc(database, 'accounts', next);
    pushIfChanged(writes, 'app/accounts', appAccounts, next);
  }

  const songStats = entriesFor(database, 'songStats');
  songStats.forEach(entry => {
    const before = entry.data || {};
    const next = transformNamedDocument(before, canon);
    if (!sameJson(before, next)) {
      counts.songs++;
      writes.push({ path: 'songStats/' + entry.id, data: next, options: { merge: false } });
      setEntry(database, 'songStats', entry.id, next);
    }
  });

  const privilegedNames = configuredPrivilegedNames(access, options, canon);
  if (options.privilegedPinHash) {
    const accountEntries = entriesFor(database, 'accounts');
    const matched = new Set();
    accountEntries.forEach(entry => {
      const before = entry.data || {};
      const name = accountName(before, entry.id, canon);
      if (!privilegedNames.includes(name)) return;
      matched.add(name);
      const next = transformNamedDocument(before, canon);
      const currentHash = next.pinHash;
      let validHash = false;
      if (!isEmptyMergeValue(currentHash)) {
        try {
          next.pinHash = normalizeAccountHash(currentHash, 'accounts/' + entry.id);
          validHash = true;
        } catch (error) {
          // An invalid privileged hash cannot be used for login. Replace it
          // with the injected bootstrap hash and force a private PIN change.
          next.pinHash = assertHash(options.privilegedPinHash);
          next.mustChangePin = true;
        }
      }
      if (!validHash && isEmptyMergeValue(currentHash)) {
        next.pinHash = assertHash(options.privilegedPinHash);
        next.mustChangePin = true;
      } else if (validHash && next.mustChangePin == null) {
        next.mustChangePin = true;
      }
      next.active = next.active !== false;
      next.roleVersion = Number(next.roleVersion || 1);
      if (!sameJson(before, next)) {
        counts.accounts++;
        replaceSetWrite(writes, 'accounts/' + entry.id, next, { merge: false });
        setEntry(database, 'accounts', entry.id, next);
      }
    });
    privilegedNames.forEach(name => {
      if (matched.has(name)) return;
      const data = {
        name,
        memberName: name,
        pinHash: assertHash(options.privilegedPinHash),
        mustChangePin: true,
        active: true,
        roleVersion: 1
      };
      writes.push({ path: 'accounts/' + name, data, options: { merge: false } });
      setEntry(database, 'accounts', name, data);
      counts.accounts++;
    });
  }

  // Non-privileged accounts still need a valid stored hash. Do not let an
  // invalid legacy value survive merely because it is outside the bootstrap
  // role list; callers can repair it explicitly with their own hash policy.
  entriesFor(database, 'accounts').forEach(entry => {
    const account = entry.data || {};
    let next = Object.assign({}, account, {
      active: account.active !== false,
      roleVersion: Number(account.roleVersion || 1)
    });
    if (!isEmptyMergeValue(account.pinHash)) {
      const normalized = normalizeAccountHash(account.pinHash, 'accounts/' + entry.id);
      next.pinHash = normalized;
    }
    if (!sameJson(next, account)) {
      replaceSetWrite(writes, 'accounts/' + entry.id, next, { merge: false });
      setEntry(database, 'accounts', entry.id, next);
    }
  });

  const cacheKey = database.cache ? 'cache' : (database.localStorage ? 'localStorage' : '');
  if (cacheKey) {
    const beforeCache = database[cacheKey];
    const afterCache = migrateCachedMemberState(beforeCache, options);
    if (!sameJson(beforeCache, afterCache)) counts.cached = 1;
    database[cacheKey] = afterCache;
  }

  return {
    migrationId: MIGRATION_ID,
    database,
    writes,
    counts,
    canonicalize: canon,
    accessConfiguration: access,
    privilegedNames
  };
}

function migrateCachedMemberState(input, options) {
  let source = clone(input || {});
  const storageKeys = Object.keys(source.storage || source);
  if (storageKeys.some(key => key.indexOf('wds-') === 0 || key.indexOf('nss-') === 0)) {
    return migrateLocalStorageSnapshot(source, options);
  }
  const canon = makeCanonicalizer((options && options.aliases) || {});
  source = transformNamedDocument(source, canon);
  if (Array.isArray(source.members)) source.members = uniqueSorted(source.members, canon);
  if (source.settings) source.settings = transformNamedDocument(source.settings, canon);
  if (source.departments) source.departments = transformNamedDocument(source.departments, canon);
  if (source.schedule && typeof source.schedule === 'object') {
    if (Array.isArray(source.schedule)) {
      source.schedule = source.schedule.map(service => transformNamedDocument(service, canon));
    } else {
      Object.keys(source.schedule).forEach(id => {
        source.schedule[id] = transformNamedDocument(source.schedule[id], canon);
      });
    }
  }
  if (Array.isArray(source.services)) source.services = source.services.map(service => transformNamedDocument(service, canon));
  if (Array.isArray(source.requests)) source.requests = source.requests.map(request => transformNamedDocument(request, canon));
  if (source.setlists && typeof source.setlists === 'object') {
    Object.keys(source.setlists).forEach(id => { source.setlists[id] = transformNamedDocument(source.setlists[id], canon); });
  }
  if (source.stats && typeof source.stats === 'object') {
    Object.keys(source.stats).forEach(id => { source.stats[id] = transformNamedDocument(source.stats[id], canon); });
  }
  if (source.nameMap && typeof source.nameMap === 'object') {
    if (source.nameMap.map && typeof source.nameMap.map === 'object') {
      source.nameMap = Object.assign({}, source.nameMap, { map: remapNameMap(source.nameMap.map, canon) });
    } else {
      source.nameMap = remapNameMap(source.nameMap, canon);
    }
  }
  if (Array.isArray(source.presiders)) source.presiders = uniqueSorted(source.presiders, canon);
  return source;
}

function mergeCacheValues(existing, incoming) {
  if (existing == null) return incoming;
  if (incoming == null) return existing;
  const leftNumber = typeof existing === 'number' ? existing :
    (typeof existing === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(existing) ? Number(existing) : NaN);
  const rightNumber = typeof incoming === 'number' ? incoming :
    (typeof incoming === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(incoming) ? Number(incoming) : NaN);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    const maximum = Math.max(leftNumber, rightNumber);
    return typeof existing === 'number' && typeof incoming === 'number' ? maximum : String(maximum);
  }
  try {
    const left = JSON.parse(existing);
    const right = JSON.parse(incoming);
    if (Array.isArray(left) && Array.isArray(right)) {
      return JSON.stringify(left.concat(right.filter(item => !left.some(old => sameJson(old, item)))));
    }
    if (isPlainObject(left) && isPlainObject(right)) return JSON.stringify(mergeCanonicalValues(left, right));
  } catch (error) {
    // Non-JSON cache values are intentionally preserved as strings below.
  }
  return existing;
}

function migrateLocalStorageSnapshot(input, options) {
  const source = clone(input || {});
  const storage = isPlainObject(source.storage) ? source.storage : source;
  const canon = makeCanonicalizer((options && options.aliases) || {});
  const setValue = (key, value) => { storage[key] = value; };
  const moveNameKeys = prefix => {
    Object.keys(storage).filter(key => key.indexOf(prefix) === 0).forEach(key => {
      const rawName = key.slice(prefix.length);
      const name = canon(rawName);
      if (!name || name === rawName) return;
      const targetKey = prefix + name;
      storage[targetKey] = mergeCacheValues(storage[targetKey], storage[key]);
      delete storage[key];
    });
  };

  ['wds-me', 'wds-fcm-name'].forEach(key => {
    if (typeof storage[key] === 'string' && storage[key]) setValue(key, canon(storage[key]));
  });
  ['wds-seen-', 'wds-alerts-', 'wds-unread-'].forEach(moveNameKeys);

  if (typeof storage['wds-reminded'] === 'string') {
    try {
      const reminded = JSON.parse(storage['wds-reminded']);
      if (isPlainObject(reminded)) {
        const next = {};
        Object.keys(reminded).forEach(key => {
          const parts = key.split('|');
          if (parts.length) parts[0] = canon(parts[0]);
          const target = parts.join('|');
          if (target && (next[target] == null || next[target] < reminded[key])) next[target] = reminded[key];
        });
        storage['wds-reminded'] = JSON.stringify(next);
      }
    } catch (error) {
      // Keep a malformed reminder cache untouched so normal startup can ignore it.
    }
  }

  ['wds-data-v2', 'nss-data-v1'].forEach(key => {
    if (typeof storage[key] !== 'string') return;
    try {
      storage[key] = JSON.stringify(migrateCachedMemberState(JSON.parse(storage[key]), options));
    } catch (error) {
      // Keep malformed local state untouched; the app's existing loader handles it.
    }
  });

  if (isPlainObject(source.storage)) source.storage = storage;
  return source;
}

function assertHash(hash) {
  if (hash == null || hash === '') return '';
  if (typeof hash !== 'string' || (!/^[0-9a-f]{64}$/i.test(hash) && !parsePinHash(hash))) {
    throw new Error('PIN hash must be a supported salted hash or legacy SHA-256 hex string');
  }
  return /^[0-9a-f]{64}$/i.test(hash) ? hash.toLowerCase() : hash;
}

function assertAccountHash(hash) {
  if (typeof hash !== 'string' || !parsePinHash(hash)) {
    throw new Error('privileged PIN hash must use the supported salted account format');
  }
  return hash;
}

async function resolvePrivilegedPinHash(options) {
  options = options || {};
  const plaintext = [options.privilegedPin, options.initialPin, options.pin]
    .find(value => !isEmptyMergeValue(value));
  if (!isEmptyMergeValue(options.plaintextPin)) {
    throw new Error('plaintext PIN input is not accepted; inject hashPin instead');
  }
  const suppliedHash = options.privilegedPinHash || options.initialPinHash ||
    options.initialPrivilegedPinHash || options.pinHash;
  if (!isEmptyMergeValue(plaintext)) {
    if (suppliedHash) throw new Error('provide a PIN hash or plaintext PIN, not both');
    if (typeof options.hashPin !== 'function') {
      throw new Error('plaintext PIN input is not accepted without an injected hashPin function');
    }
    return assertAccountHash(await options.hashPin(plaintext));
  }
  if (suppliedHash) return assertAccountHash(suppliedHash);
  if (typeof options.hashPin !== 'function') return '';
  if (options.hashPin.length > 0) {
    throw new TypeError('hashPin requires an injected initial PIN value');
  }
  const hash = await options.hashPin();
  return assertAccountHash(hash);
}

async function migrateMemberAccess(options, overrides) {
  if (options && typeof options.read === 'function') {
    options = Object.assign({}, overrides || {}, { store: options });
  }
  options = options || {};
  if (!options.store && options.db) options.store = createFirestoreStore(options.db);
  const store = options.store;
  const hasStore = store && typeof store.read === 'function';
  const sourceInput = options.snapshot || options.data;
  if (!hasStore && sourceInput === undefined) {
    throw new TypeError('migrateMemberAccess requires a store with read() or a snapshot/data input');
  }
  const privilegedPinHash = await resolvePrivilegedPinHash(options);
  const input = hasStore ? await store.read() : sourceInput;
  const migrationInput = options.cache || options.localStorage
    ? Object.assign({}, input, { cache: options.cache || options.localStorage })
    : input;
  const planned = transformDatabase(migrationInput, Object.assign({}, options, { privilegedPinHash }));

  const dryRun = options.dryRun !== false;
  if (!dryRun) {
    if (!hasStore || typeof store.write !== 'function') throw new TypeError('migration requires write(path, data) when dryRun is false');
    for (const write of planned.writes) {
      const writeOptions = write.delete
        ? Object.assign({}, write.options || {}, { delete: true })
        : write.options;
      await store.write(write.path, write.delete ? undefined : write.data, writeOptions);
    }
  }

  return {
    migrationId: MIGRATION_ID,
    dryRun,
    changed: planned.writes.length,
    writes: planned.writes,
    counts: planned.counts,
    database: planned.database,
    cache: planned.database.cache || planned.database.localStorage || null,
    privilegedPinHashApplied: !!privilegedPinHash
  };
}

function createFirestoreStore(db) {
  if (!db || typeof db.collection !== 'function') throw new TypeError('createFirestoreStore requires a Firestore db');
  const appDocs = [
    'members', 'departments', 'settings', 'nameMap', 'songSettings',
    'presiders', 'leaderConfig', 'memberAccess', 'accounts', 'notifications'
  ];
  const collections = [
    'schedule', 'requests', 'tokens', 'notifications', 'accounts',
    'memberships', 'leaders', 'leaderConfig', 'conflictAcknowledgements',
    'acknowledgments', 'presiders', 'setlists', 'songStats'
  ];
  return {
    async read() {
      const database = { app: {} };
      for (const name of appDocs) {
        const snap = await db.collection('app').doc(name).get();
        if (snap.exists) database.app[name] = snap.data() || {};
      }
      for (const collection of collections) {
        const snap = await db.collection(collection).get();
        database[collection] = {};
        snap.forEach(doc => { database[collection][doc.id] = doc.data() || {}; });
      }
      return database;
    },
    async write(path, data, options) {
      const parts = path.split('/');
      if (parts.length !== 2) throw new Error('invalid migration path: ' + path);
      const ref = db.collection(parts[0]).doc(parts[1]);
      if (options && options.delete) await ref.delete();
      else if (options) await ref.set(data, options);
      else await ref.set(data);
    }
  };
}

const planMemberAccessMigration = transformDatabase;
const canonicalizeMemberDocument = transformNamedDocument;
const runMigration = migrateMemberAccess;

const API = {
  MIGRATION_ID,
  STATIC_ALIASES,
  DEFAULT_ACCESS_CONFIGURATION,
  NAME_FIELDS,
  NAME_ARRAY_FIELDS,
  NAME_MAP_FIELDS,
  normalizeMemberName,
  makeCanonicalizer,
  uniqueCanonical,
  uniqueSorted,
  canonicalizeAccessConfiguration,
  configuredPrivilegedNames,
  transformNestedIdentityReferences,
  remapIdentityMap,
  mergeCanonicalValues,
  remapConflictOk,
  remapAssignments,
  planCollection,
  transformNamedDocument,
  canonicalizeMemberDocument,
  transformDatabase,
  planMemberAccessMigration,
  migrateCachedMemberState,
  migrateLocalStorageSnapshot,
  mergeCacheValues,
  assertHash,
  resolvePrivilegedPinHash,
  migrateMemberAccess,
  runMigration,
  createFirestoreStore
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.MemberAccessMigration = API;
