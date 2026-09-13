'use strict';

/*
 * Canonical identity migration for the Worship Duty data model.
 *
 * This module is deliberately independent of Firebase. The pure planner can
 * be tested with plain objects, while migrateMemberAccess accepts a small
 * store adapter for a real Firestore run. The migration only updates existing
 * records and is safe to run repeatedly.
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
  'D. Chloe': 'M. Chloe'
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
    } else if (NAME_MAP_FIELDS.includes(key) && isPlainObject(child)) {
      const mapped = {};
      Object.keys(child).forEach(rawKey => {
        const canonicalKey = canon(rawKey);
        const mappedValue = child[rawKey];
        mapped[canonicalKey || rawKey] = transformNestedIdentityReferences(mappedValue, canon, key);
      });
      output[key] = mapped;
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
    if (PLAINTEXT_PIN_FIELDS.includes(key) && typeof child === 'string' && child.trim()) {
      throw new Error('plaintext PIN field is not allowed at ' + path + '.' + key);
    }
    assertNoPlaintextPinFields(child, path + '.' + key);
  });
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
        data: wrapped ? wrapped.data : doc
      };
    });
  }
  return Object.keys(value).map(id => {
    const doc = value[id];
    if (isPlainObject(doc) && isPlainObject(doc.data)) {
      return { id: String(doc.id || id), data: doc.data };
    }
    return { id, data: doc || {} };
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

function transformDatabase(input, options) {
  options = options || {};
  const directHash = options.privilegedPinHash || options.initialPinHash || options.initialPrivilegedPinHash;
  if (directHash && !options.privilegedPinHash) {
    options = Object.assign({}, options, { privilegedPinHash: assertHash(directHash) });
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
    entriesFor(database, collection).forEach(entry => {
      const before = entry.data || {};
      const next = transformNamedDocument(before, canon);
      if (collection === 'schedule' && before.conflictOk) {
        counts.conflicts += sameJson(before.conflictOk, next.conflictOk) ? 0 : 1;
      }
      if (!sameJson(before, next)) {
        if (collection === 'schedule') counts.schedules++;
        if (collection === 'requests') counts.requests++;
        if (collection === 'tokens' || collection === 'notifications') counts.notifications++;
        if (collection === 'accounts' || collection === 'memberships') counts.accounts++;
        if (collection === 'setlists') counts.songs++;
        writes.push({ path: collection + '/' + entry.id, data: next, options: { merge: false } });
        setEntry(database, collection, entry.id, next);
      }
    });
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
  if (options.settingsPinHash) nextSettings.pinHash = assertHash(options.settingsPinHash);
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
  if (!nextSongSettings[SONG_EDITOR_HASH_FIELD] && songEditorHash) {
    nextSongSettings[SONG_EDITOR_HASH_FIELD] = assertHash(songEditorHash);
  }
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
    if (!before) return;
    const next = name === 'leaderConfig'
      ? Object.assign({}, before, access)
      : transformNamedDocument(before, canon);
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
      const hadPinHash = typeof next.pinHash === 'string' && next.pinHash.length > 0;
      if (!hadPinHash) {
        next.pinHash = assertHash(options.privilegedPinHash);
        next.mustChangePin = true;
      } else if (next.mustChangePin == null) {
        next.mustChangePin = true;
      }
      if (!sameJson(before, next)) {
        counts.accounts++;
        writes.push({ path: 'accounts/' + entry.id, data: next, options: { merge: false } });
        setEntry(database, 'accounts', entry.id, next);
      }
    });
    privilegedNames.forEach(name => {
      if (matched.has(name)) return;
      const data = {
        name,
        memberName: name,
        pinHash: assertHash(options.privilegedPinHash),
        mustChangePin: true
      };
      writes.push({ path: 'accounts/' + name, data, options: { merge: false } });
      setEntry(database, 'accounts', name, data);
      counts.accounts++;
    });
  }

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
  try {
    const left = JSON.parse(existing);
    const right = JSON.parse(incoming);
    if (Array.isArray(left) && Array.isArray(right)) {
      return JSON.stringify(left.concat(right.filter(item => !left.some(old => sameJson(old, item)))));
    }
    if (isPlainObject(left) && isPlainObject(right)) {
      return JSON.stringify(Object.assign({}, right, left));
    }
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
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) {
    throw new Error('privileged PIN hash must be a 64-character SHA-256 hex string');
  }
  return hash.toLowerCase();
}

async function resolvePrivilegedPinHash(options) {
  options = options || {};
  const suppliedHash = options.privilegedPinHash || options.initialPinHash ||
    options.initialPrivilegedPinHash || options.pinHash;
  if (suppliedHash) return assertHash(suppliedHash);
  if (typeof options.hashPin !== 'function') return '';
  const plaintext = options.privilegedPin || options.initialPin || options.pin;
  if (!plaintext && options.hashPin.length > 0) {
    throw new TypeError('hashPin requires an injected initial PIN value');
  }
  const hash = plaintext ? await options.hashPin(plaintext) : await options.hashPin();
  return assertHash(hash);
}

async function migrateMemberAccess(options, overrides) {
  if (options && typeof options.read === 'function') {
    options = Object.assign({}, overrides || {}, { store: options });
  }
  options = options || {};
  if (options.privilegedPin || options.initialPin || options.pin || options.plaintextPin) {
    if (options.plaintextPin) throw new Error('plaintext PIN input is not accepted; inject hashPin instead');
  }
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
    for (const write of planned.writes) await store.write(write.path, write.data, write.options);
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
    'presiders', 'leaderConfig', 'memberAccess'
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
    async write(path, data) {
      const parts = path.split('/');
      if (parts.length !== 2) throw new Error('invalid migration path: ' + path);
      await db.collection(parts[0]).doc(parts[1]).set(data);
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
  remapConflictOk,
  remapAssignments,
  transformNamedDocument,
  canonicalizeMemberDocument,
  transformDatabase,
  planMemberAccessMigration,
  migrateCachedMemberState,
  migrateLocalStorageSnapshot,
  assertHash,
  resolvePrivilegedPinHash,
  migrateMemberAccess,
  runMigration,
  createFirestoreStore
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.MemberAccessMigration = API;
