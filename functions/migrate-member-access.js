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

const DEFAULT_ACCESS_CONFIGURATION = Object.freeze({
  leaderNames: Object.freeze(['B. Anthony']),
  songEditorNames: Object.freeze(['B. Anthony']),
  leaderField: 'departmentLeaders',
  songEditorNamesField: 'editorNames',
  songEditorHashField: 'editorPinHash'
});

const NAME_FIELDS = Object.freeze([
  'name', 'memberName', 'displayName', 'canonicalName', 'requestedBy',
  'resolvedBy', 'createdBy', 'updatedBy', 'presider', 'schedulerName',
  'leaderName', 'editorName', 'ownerName', 'fromMember', 'toMember',
  'requesterName', 'recipientName', 'senderName', 'approverName',
  'accountName', 'targetName', 'member', 'assignedTo', 'confirmedBy'
]);

const NAME_ARRAY_FIELDS = Object.freeze([
  'members', 'memberNames', 'names', 'departmentLeaders', 'leaderNames',
  'songEditors', 'editorNames', 'presiders', 'leaders'
]);

function clone(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
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

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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
  const output = clone(input) || {};
  NAME_FIELDS.forEach(field => {
    if (typeof output[field] === 'string' && output[field]) output[field] = canon(output[field]);
  });
  NAME_ARRAY_FIELDS.forEach(field => {
    if (Array.isArray(output[field])) output[field] = uniqueSorted(output[field], canon);
  });
  if (output.assignments && typeof output.assignments === 'object') {
    output.assignments = remapAssignments(output.assignments, canon);
  }
  if (output.conflictOk && typeof output.conflictOk === 'object') {
    output.conflictOk = remapConflictOk(output.conflictOk, canon);
  }
  if (Array.isArray(output.recipients)) output.recipients = uniqueSorted(output.recipients, canon);
  if (Array.isArray(output.recipientNames)) output.recipientNames = uniqueSorted(output.recipientNames, canon);
  if (Array.isArray(output.leaderIds)) output.leaderIds = output.leaderIds.slice();
  if (Array.isArray(output.history)) {
    output.history = output.history.map(entry => {
      const next = clone(entry) || {};
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
    return value.map((doc, index) => ({ id: String(doc.id || index), data: doc }));
  }
  return Object.keys(value).map(id => ({ id, data: value[id] || {} }));
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
  const database = clone(input || {});
  const storedMap = (readAppDoc(database, 'nameMap') || {}).map || {};
  const canon = makeCanonicalizer(Object.assign({}, storedMap, options.aliases || {}));
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
      nextMap[category] = uniqueSorted(departments.map[category], canon);
    });
    const next = Object.assign({}, departments, { map: nextMap });
    if (!sameJson(departments, next)) counts.departments = 1;
    setAppDoc(database, 'departments', next);
    pushIfChanged(writes, 'app/departments', departments, next);
  }

  for (const collection of ['schedule', 'requests', 'tokens', 'notifications', 'accounts', 'memberships', 'leaders', 'presiders', 'setlists']) {
    entriesFor(database, collection).forEach(entry => {
      const before = entry.data || {};
      const next = transformNamedDocument(before, canon);
      if (collection === 'schedule' && before.conflictOk) counts.conflicts += sameJson(before.conflictOk, next.conflictOk) ? 0 : 1;
      if (!sameJson(before, next)) {
        if (collection === 'schedule') counts.schedules++;
        if (collection === 'requests') counts.requests++;
        if (collection === 'tokens' || collection === 'notifications') counts.notifications++;
        if (collection === 'accounts' || collection === 'memberships') counts.accounts++;
        if (collection === 'setlists') counts.songs++;
        writes.push({ path: collection + '/' + entry.id, data: next, options: { merge: false } });
        database[collection][entry.id] = next;
      }
    });
  }

  const settings = readAppDoc(database, 'settings');
  if (settings) {
    const next = transformNamedDocument(settings, canon);
    const configuredLeaders = options.leaderNames || settings.departmentLeaders || DEFAULT_ACCESS_CONFIGURATION.leaderNames;
    next[DEFAULT_ACCESS_CONFIGURATION.leaderField] = uniqueSorted(configuredLeaders, canon);
    if (!sameJson(settings, next)) counts.leaders = 1;
    setAppDoc(database, 'settings', next);
    pushIfChanged(writes, 'app/settings', settings, next);
  } else if (options.leaderNames) {
    const next = { [DEFAULT_ACCESS_CONFIGURATION.leaderField]: uniqueSorted(options.leaderNames, canon) };
    setAppDoc(database, 'settings', next);
    writes.push({ path: 'app/settings', data: next, options: { merge: false } });
    counts.leaders = 1;
  }

  const songSettings = readAppDoc(database, 'songSettings');
  if (songSettings) {
    const next = transformNamedDocument(songSettings, canon);
    const configuredEditors = options.songEditorNames || songSettings.editorNames || DEFAULT_ACCESS_CONFIGURATION.songEditorNames;
    next[DEFAULT_ACCESS_CONFIGURATION.songEditorNamesField] = uniqueSorted(configuredEditors, canon);
    if (options.privilegedPinHash) next[DEFAULT_ACCESS_CONFIGURATION.songEditorHashField] = options.privilegedPinHash;
    if (!sameJson(songSettings, next)) counts.songs++;
    setAppDoc(database, 'songSettings', next);
    pushIfChanged(writes, 'app/songSettings', songSettings, next);
  } else if (options.songEditorNames || options.privilegedPinHash) {
    const next = {
      [DEFAULT_ACCESS_CONFIGURATION.songEditorNamesField]: uniqueSorted(
        options.songEditorNames || DEFAULT_ACCESS_CONFIGURATION.songEditorNames, canon
      )
    };
    if (options.privilegedPinHash) next[DEFAULT_ACCESS_CONFIGURATION.songEditorHashField] = options.privilegedPinHash;
    setAppDoc(database, 'songSettings', next);
    writes.push({ path: 'app/songSettings', data: next, options: { merge: false } });
    counts.songs++;
  }

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

  const songStats = entriesFor(database, 'songStats');
  songStats.forEach(entry => {
    const before = entry.data || {};
    const next = transformNamedDocument(before, canon);
    if (!sameJson(before, next)) {
      counts.songs++;
      writes.push({ path: 'songStats/' + entry.id, data: next, options: { merge: false } });
      database.songStats[entry.id] = next;
    }
  });

  return { database, writes, counts, canonicalize: canon };
}

function migrateCachedMemberState(input, options) {
  const source = clone(input || {});
  const canon = makeCanonicalizer((options && options.aliases) || {});
  if (Array.isArray(source.members)) source.members = uniqueSorted(source.members, canon);
  if (source.settings) source.settings = transformNamedDocument(source.settings, canon);
  if (source.departments) source.departments = transformNamedDocument(source.departments, canon);
  if (Array.isArray(source.services)) source.services = source.services.map(service => transformNamedDocument(service, canon));
  if (Array.isArray(source.requests)) source.requests = source.requests.map(request => transformNamedDocument(request, canon));
  if (source.setlists && typeof source.setlists === 'object') {
    Object.keys(source.setlists).forEach(id => { source.setlists[id] = transformNamedDocument(source.setlists[id], canon); });
  }
  if (Array.isArray(source.presiders)) source.presiders = uniqueSorted(source.presiders, canon);
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
  if (options.privilegedPinHash) return assertHash(options.privilegedPinHash);
  if (typeof options.hashPin !== 'function') return '';
  const hash = await options.hashPin(options.privilegedPin);
  return assertHash(hash);
}

async function migrateMemberAccess(options) {
  options = options || {};
  if (!options.store || typeof options.store.read !== 'function') {
    throw new TypeError('migrateMemberAccess requires a store with read()');
  }
  const privilegedPinHash = await resolvePrivilegedPinHash(options);
  const input = await options.store.read();
  const planned = transformDatabase(input, Object.assign({}, options, { privilegedPinHash }));

  if (!options.dryRun) {
    if (typeof options.store.write !== 'function') throw new TypeError('migration store requires write(path, data)');
    for (const write of planned.writes) await options.store.write(write.path, write.data, write.options);
  }

  return {
    dryRun: !!options.dryRun,
    changed: planned.writes.length,
    writes: planned.writes,
    counts: planned.counts,
    database: planned.database,
    privilegedPinHashApplied: !!privilegedPinHash
  };
}

function createFirestoreStore(db) {
  if (!db || typeof db.collection !== 'function') throw new TypeError('createFirestoreStore requires a Firestore db');
  const appDocs = ['members', 'departments', 'settings', 'nameMap', 'songSettings', 'presiders'];
  const collections = ['schedule', 'requests', 'tokens', 'notifications', 'accounts', 'memberships', 'leaders', 'presiders', 'setlists', 'songStats'];
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

const API = {
  STATIC_ALIASES,
  DEFAULT_ACCESS_CONFIGURATION,
  NAME_FIELDS,
  NAME_ARRAY_FIELDS,
  normalizeMemberName,
  makeCanonicalizer,
  remapConflictOk,
  remapAssignments,
  transformNamedDocument,
  transformDatabase,
  migrateCachedMemberState,
  migrateMemberAccess,
  createFirestoreStore
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.MemberAccessMigration = API;
