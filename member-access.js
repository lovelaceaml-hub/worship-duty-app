'use strict';

/*
 * Member identity cleanup + department-leader Manage visibility.
 *
 * This module is intentionally separate from app.js so it can:
 *  - clean legacy/duplicate member spellings in Firestore without disturbing
 *    the main scheduling renderer;
 *  - keep a shared list of department leaders in app/settings; and
 *  - hide the Manage tab for everyone else while preserving the existing
 *    editor-passcode requirement as a second layer.
 */

const FIREBASE_VERSION = '10.12.2';
const CLEANUP_MARKER = 'wds-member-cleanup-v4';

const STATIC_ALIASES = {
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
};

const LONG_PREFIXES = {
  brother: 'B.',
  bro: 'B.',
  deacon: 'D.',
  sister: 'S.',
  sis: 'S.',
  missionary: 'M.',
  evangelist: 'E.'
};

const SHORT_PREFIXES = {
  b: 'B.',
  d: 'D.',
  s: 'S.',
  m: 'M.',
  e: 'E.'
};

const NAME_FIELDS = [
  'name', 'memberName', 'displayName', 'canonicalName', 'requestedBy',
  'resolvedBy', 'createdBy', 'updatedBy', 'presider', 'schedulerName',
  'leaderName', 'editorName', 'ownerName', 'fromMember', 'toMember',
  'requesterName', 'recipientName', 'senderName', 'approverName',
  'accountName', 'targetName', 'member', 'assignedTo', 'confirmedBy',
  'editedBy', 'markedBy', 'archivedBy', 'restoredBy', 'actor', 'actorName',
  'targetMember', 'subjectMember', 'affectedMember', 'memberId', 'leaderId',
  'acknowledgedBy', 'acknowledgedFor', 'changedBy', 'reviewedBy', 'removedBy', 'by',
  'requester', 'recipient', 'assignee', 'leader', 'editor', 'account', 'subject'
];

const NAME_ARRAY_FIELDS = [
  'members', 'memberNames', 'names', 'departmentLeaders', 'leaderNames',
  'songEditors', 'songEditorNames', 'editorNames', 'presiders', 'leaders',
  'admins', 'globalLeaderManager', 'globalLeaderManagers', 'privilegedMembers',
  'recipients', 'owners', 'editors', 'targets', 'targetMembers',
  'membersToNotify', 'affectedMembers', 'acknowledgedMembers', 'departmentMembers'
];

const NAME_MAP_FIELDS = [
  'memberRoles', 'membersByDepartment', 'accounts', 'leadersByDepartment',
  'notificationsByMember', 'recipientsByMember', 'membershipsByMember',
  'byMember', 'memberMap', 'departmentLeaders', 'leaders', 'memberships',
  'acknowledgments', 'conflictAcknowledgements', 'notificationTargets'
];

function normalizeMemberName(value) {
  let name = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!name) return '';

  let match = name.match(/^(Brother|Bro|Deacon|Sister|Sis|Missionary|Evangelist)\b[\s,.:;-]*(.+)$/i);
  if (match) {
    const prefix = LONG_PREFIXES[match[1].toLowerCase()];
    const rest = match[2].trim().replace(/\s+/g, ' ');
    return rest ? prefix + ' ' + rest : prefix;
  }

  // Single-letter titles require an actual separator so an ordinary name like
  // "Brent" can never be interpreted as "B. rent".
  match = name.match(/^([BDSME])(?:\s+|[.,:;-]\s*)(.+)$/i);
  if (match) {
    const prefix = SHORT_PREFIXES[match[1].toLowerCase()];
    const rest = match[2].trim().replace(/\s+/g, ' ');
    return rest ? prefix + ' ' + rest : prefix;
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
    for (let i = 0; i < 10; i++) {
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

function uniqueSorted(values) {
  return Array.from(new Set((values || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function sameArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isPlainObject(value)) return value;
  const output = {};
  Object.keys(value).forEach(key => { output[key] = cloneValue(value[key]); });
  return output;
}

function isEmptyMergeValue(value) {
  return value == null || value === '';
}

function mergeCanonicalValues(primary, fallback) {
  if (isEmptyMergeValue(primary)) return cloneValue(fallback);
  if (isEmptyMergeValue(fallback)) return cloneValue(primary);
  if (Array.isArray(primary) && Array.isArray(fallback)) {
    const output = primary.map(cloneValue);
    fallback.forEach(value => {
      if (!output.some(existing => sameJson(existing, value))) output.push(cloneValue(value));
    });
    return output;
  }
  if (isPlainObject(primary) && isPlainObject(fallback)) {
    const output = cloneValue(fallback);
    Object.keys(primary).forEach(key => {
      output[key] = Object.prototype.hasOwnProperty.call(fallback, key)
        ? mergeCanonicalValues(primary[key], fallback[key])
        : cloneValue(primary[key]);
    });
    return output;
  }
  if (typeof primary === 'number' && typeof fallback === 'number') return Math.max(primary, fallback);
  return cloneValue(primary);
}

function remapIdentityMap(value, canon, fieldName) {
  const rows = Object.keys(value || {}).map((rawKey, index) => {
    const canonicalKey = canon(rawKey) || rawKey;
    return {
      rawKey,
      canonicalKey,
      index,
      isCanonical: canonicalKey === rawKey,
      data: remapNestedIdentityReferences(value[rawKey], canon, fieldName)
    };
  });
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
    ? remapNestedIdentityReferences(value, canon, fieldName)
    : remapIdentityMap(value, canon, fieldName);
}

function remapNestedIdentityReferences(value, canon, fieldName) {
  if (Array.isArray(value)) {
    if (NAME_ARRAY_FIELDS.includes(fieldName)) return uniqueSorted(value.map(canon));
    return value.map(item => remapNestedIdentityReferences(item, canon, fieldName));
  }
  if (!isPlainObject(value)) return value;

  const output = {};
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (NAME_FIELDS.includes(key) && typeof child === 'string' && child) {
      output[key] = canon(child);
    } else if (key === 'history' && Array.isArray(child)) {
      output[key] = child.map(entry => {
        const next = remapNestedIdentityReferences(entry, canon, 'history') || {};
        if (typeof next.by === 'string' && next.by) next.by = canon(next.by);
        if (typeof next.memberName === 'string' && next.memberName) next.memberName = canon(next.memberName);
        return next;
      });
    } else if (NAME_ARRAY_FIELDS.includes(key) && Array.isArray(child)) {
      output[key] = uniqueSorted(child.map(canon));
    } else if ((key === 'acknowledgment' || key === 'acknowledgement' ||
      key === 'acknowledgments' || key === 'acknowledgements' ||
      key === 'conflictAcknowledgment' || key === 'conflictAcknowledgements') && isPlainObject(child)) {
      output[key] = remapAcknowledgment(child, canon, key);
    } else if (NAME_MAP_FIELDS.includes(key) && isPlainObject(child)) {
      output[key] = remapIdentityMap(child, canon, key);
    } else {
      output[key] = remapNestedIdentityReferences(child, canon, key);
    }
  });
  return output;
}

function remapNamedDocument(input, canon) {
  const output = remapNestedIdentityReferences(input || {}, canon, 'document') || {};
  if (Array.isArray(output.recipients)) output.recipients = uniqueSorted(output.recipients.map(canon));
  if (output.assignments && typeof output.assignments === 'object') {
    const assignments = {};
    Object.keys(output.assignments).forEach(duty => {
      assignments[duty] = output.assignments[duty] ? canon(output.assignments[duty]) : output.assignments[duty];
    });
    output.assignments = assignments;
  }
  if (output.conflictOk && typeof output.conflictOk === 'object') {
    output.conflictOk = remapConflictOk(output.conflictOk, canon);
  }
  if (Array.isArray(output.history)) {
    output.history = output.history.map(entry => {
      const next = Object.assign({}, entry);
      if (typeof next.by === 'string' && next.by) next.by = canon(next.by);
      if (typeof next.memberName === 'string' && next.memberName) next.memberName = canon(next.memberName);
      return next;
    });
  }
  return output;
}

function mergeCachedValues(existing, incoming) {
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
    // Preserve non-JSON values and let the existing app loader handle them.
  }
  return existing;
}

function remapCachedState(cached, canon) {
  if (!cached || typeof cached !== 'object') return cached;
  const output = remapNamedDocument(cached, canon);
  if (Array.isArray(output.members)) output.members = uniqueSorted(output.members.map(canon));
  if (Array.isArray(output.presiders)) output.presiders = uniqueSorted(output.presiders.map(canon));
  if (output.settings) output.settings = remapNamedDocument(output.settings, canon);
  if (output.departments) output.departments = remapNamedDocument(output.departments, canon);
  if (output.nameMap && typeof output.nameMap === 'object') {
    if (output.nameMap.map && typeof output.nameMap.map === 'object') {
      output.nameMap = Object.assign({}, output.nameMap, { map: remapNameMap(output.nameMap.map, canon) });
    } else {
      output.nameMap = remapNameMap(output.nameMap, canon);
    }
  }
  if (Array.isArray(output.services)) output.services = output.services.map(item => remapNamedDocument(item, canon));
  if (Array.isArray(output.requests)) output.requests = output.requests.map(item => remapNamedDocument(item, canon));
  if (output.setlists && typeof output.setlists === 'object') {
    Object.keys(output.setlists).forEach(id => { output.setlists[id] = remapNamedDocument(output.setlists[id], canon); });
  }
  if (output.stats && typeof output.stats === 'object') {
    Object.keys(output.stats).forEach(id => { output.stats[id] = remapNamedDocument(output.stats[id], canon); });
  }
  return output;
}

function migrateCachedMemberReferences() {
  if (typeof localStorage === 'undefined') return;
  const canon = makeCanonicalizer(STATIC_ALIASES);
  const moveNameKeys = prefix => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(prefix) === 0) keys.push(key);
    }
    keys.forEach(fromKey => {
      const rawName = fromKey.slice(prefix.length);
      const target = canon(rawName);
      if (!target || target === rawName) return;
      const toKey = prefix + target;
      const oldValue = localStorage.getItem(fromKey);
      const newValue = localStorage.getItem(toKey);
      localStorage.setItem(toKey, mergeCachedValues(newValue, oldValue));
      localStorage.removeItem(fromKey);
    });
  };

  ['wds-me', 'wds-fcm-name'].forEach(key => {
    const value = localStorage.getItem(key);
    if (value) localStorage.setItem(key, canon(value));
  });
  ['wds-seen-', 'wds-alerts-', 'wds-unread-'].forEach(moveNameKeys);

  const reminded = localStorage.getItem('wds-reminded');
  if (reminded) {
    try {
      const source = JSON.parse(reminded);
      if (isPlainObject(source)) {
        const output = {};
        Object.keys(source).forEach(key => {
          const parts = key.split('|');
          if (parts.length) parts[0] = canon(parts[0]);
          const target = parts.join('|');
          if (target && (output[target] == null || output[target] < source[key])) output[target] = source[key];
        });
        localStorage.setItem('wds-reminded', JSON.stringify(output));
      }
    } catch (error) {
      // Keep malformed reminder state unchanged.
    }
  }

  ['wds-data-v2', 'nss-data-v1'].forEach(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const cached = JSON.parse(raw);
      localStorage.setItem(key, JSON.stringify(remapCachedState(cached, canon)));
    } catch (error) {
      console.warn('Cached member identity cleanup skipped:', key);
    }
  });
}

function remapConflictOk(conflictOk, canon) {
  const input = conflictOk || {};
  const output = {};
  Object.keys(input).forEach(name => {
    const target = canon(name);
    const duties = Array.isArray(input[name]) ? input[name] : [];
    output[target] = Array.from(new Set((output[target] || []).concat(duties)));
  });
  return output;
}

function remapNameMap(map, canon) {
  const output = {};
  Object.keys(map || {}).forEach(rawKey => {
    const key = String(rawKey).trim().replace(/\s+/g, ' ');
    const target = canon(map[rawKey] || key);
    if (key && target && key !== target) output[key] = target;
  });
  Object.keys(STATIC_ALIASES).forEach(rawKey => {
    const target = canon(rawKey);
    if (rawKey !== target) output[rawKey] = target;
  });
  return output;
}

async function ensureSignedIn(app) {
  const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  const auth = authMod.getAuth(app);
  if (!auth.currentUser) await authMod.signInAnonymously(auth);
  return auth;
}

async function commitWrites(fsMod, db, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = fsMod.writeBatch(db);
    writes.slice(i, i + 400).forEach(write => {
      if (write.delete) batch.delete(write.ref);
      else if (write.options) batch.set(write.ref, write.data, write.options);
      else batch.set(write.ref, write.data);
    });
    await batch.commit();
  }
}

function canonicalDocumentId(id, remember) {
  const raw = String(id == null ? '' : id);
  const target = remember(raw);
  return target && target !== raw ? target : raw;
}

function remapFirestoreCollection(collectionName, snapshot, remember, fsMod, db) {
  const groups = new Map();
  let index = 0;
  snapshot.forEach(doc => {
    const before = doc.data() || {};
    const targetId = canonicalDocumentId(doc.id, remember);
    const transformed = remapNamedDocument(before, remember);
    if (targetId !== doc.id && transformed.id === doc.id) transformed.id = targetId;
    const row = {
      id: doc.id,
      targetId,
      index: index++,
      isCanonical: doc.id === targetId,
      original: before,
      data: transformed,
      ref: doc.ref
    };
    if (!groups.has(targetId)) groups.set(targetId, []);
    groups.get(targetId).push(row);
  });

  const writes = [];
  let changed = 0;
  for (const [targetId, group] of groups) {
    group.sort((left, right) => Number(left.isCanonical) - Number(right.isCanonical) || left.index - right.index);
    let merged = group[0].data;
    for (let i = 1; i < group.length; i++) {
      merged = group[i].isCanonical
        ? mergeCanonicalValues(group[i].data, merged)
        : mergeCanonicalValues(merged, group[i].data);
    }
    const targetRow = group.find(row => row.id === targetId);
    const targetRef = targetRow ? targetRow.ref : fsMod.doc(db, collectionName, targetId);
    if (!targetRow || !sameJson(targetRow.original, merged)) {
      writes.push({ ref: targetRef, data: merged });
      changed++;
    }
    group.filter(row => row.id !== targetId).forEach(row => {
      writes.push({ ref: row.ref, delete: true });
      changed++;
    });
  }
  return { writes, changed };
}

async function cleanMemberIdentities(app, db, fsMod, interactive) {
  await ensureSignedIn(app);

  const membersRef = fsMod.doc(db, 'app', 'members');
  const departmentsRef = fsMod.doc(db, 'app', 'departments');
  const nameMapRef = fsMod.doc(db, 'app', 'nameMap');
  const settingsRef = fsMod.doc(db, 'app', 'settings');
  const songSettingsRef = fsMod.doc(db, 'app', 'songSettings');
  const presidersRef = fsMod.doc(db, 'app', 'presiders');
  const extraCollections = [
    'tokens', 'notifications', 'accounts', 'memberships', 'leaders',
    'leaderConfig', 'conflictAcknowledgements', 'acknowledgments',
    'setlists', 'songStats'
  ];

  const [membersSnap, departmentsSnap, nameMapSnap, settingsSnap, songSettingsSnap, presidersSnap, scheduleSnap, requestsSnap, ...extraSnaps] =
    await Promise.all([
      fsMod.getDoc(membersRef),
      fsMod.getDoc(departmentsRef),
      fsMod.getDoc(nameMapRef),
      fsMod.getDoc(settingsRef),
      fsMod.getDoc(songSettingsRef),
      fsMod.getDoc(presidersRef),
      fsMod.getDocs(fsMod.collection(db, 'schedule')),
      fsMod.getDocs(fsMod.collection(db, 'requests')),
      ...extraCollections.map(name => fsMod.getDocs(fsMod.collection(db, name)))
    ]);

  const storedMap = nameMapSnap.exists() ? (nameMapSnap.data().map || {}) : {};
  const canon = makeCanonicalizer(storedMap);
  const learnedAliases = {};

  const remember = value => {
    const raw = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    const target = canon(raw);
    if (target && target !== raw) learnedAliases[raw] = target;
    return target;
  };

  const writes = [];
  let memberRowsRemoved = 0;
  let servicesChanged = 0;
  let requestsChanged = 0;
  let departmentsChanged = false;
  let settingsChanged = false;

  const oldMembers = membersSnap.exists() && Array.isArray(membersSnap.data().list)
    ? membersSnap.data().list : [];
  const mappedMembers = oldMembers.map(remember);
  const cleanedMembers = uniqueSorted(mappedMembers);
  memberRowsRemoved = oldMembers.filter((name, index) => {
    const target = mappedMembers[index];
    return target !== name || mappedMembers.indexOf(target) !== index;
  }).length;

  if (!sameArray(oldMembers, cleanedMembers)) {
    writes.push({ ref: membersRef, data: { list: cleanedMembers } });
  }

  const oldDepartments = departmentsSnap.exists() ? (departmentsSnap.data().map || {}) : {};
  const cleanedDepartments = {};
  Object.keys(oldDepartments).forEach(category => {
    cleanedDepartments[category] = uniqueSorted((oldDepartments[category] || []).map(remember));
  });
  if (!sameJson(oldDepartments, cleanedDepartments)) {
    departmentsChanged = true;
    writes.push({ ref: departmentsRef, data: { map: cleanedDepartments } });
  }

  [
    ['schedule', scheduleSnap],
    ['requests', requestsSnap],
    ...extraCollections.map((name, index) => [name, extraSnaps[index]])
  ].forEach(([collectionName, collectionSnap]) => {
    const result = remapFirestoreCollection(collectionName, collectionSnap, remember, fsMod, db);
    writes.push(...result.writes);
    if (collectionName === 'schedule') servicesChanged += result.changed;
    if (collectionName === 'requests') requestsChanged += result.changed;
  });

  const songSettings = songSettingsSnap.exists() ? (songSettingsSnap.data() || {}) : {};
  const nextSongSettings = remapNamedDocument(songSettings, remember);
  if (!sameJson(songSettings, nextSongSettings)) {
    writes.push({ ref: songSettingsRef, data: nextSongSettings });
  }

  const presiders = presidersSnap.exists() ? (presidersSnap.data() || {}) : {};
  const nextPresiders = remapNamedDocument(presiders, remember);
  if (!sameJson(presiders, nextPresiders)) writes.push({ ref: presidersRef, data: nextPresiders });

  const settings = settingsSnap.exists() ? (settingsSnap.data() || {}) : {};
  const nextSettings = remapNamedDocument(settings, remember);
  if (Array.isArray(settings.departmentLeaders)) {
    nextSettings.departmentLeaders = uniqueSorted(settings.departmentLeaders.map(remember));
  } else if (settings.departmentLeaders && typeof settings.departmentLeaders === 'object') {
    nextSettings.departmentLeaders = {};
    Object.keys(settings.departmentLeaders).forEach(category => {
      nextSettings.departmentLeaders[category] = uniqueSorted(
        (settings.departmentLeaders[category] || []).map(remember)
      );
    });
  }
  ['access', 'roles', 'memberAccess'].forEach(field => {
    if (settings[field] && typeof settings[field] === 'object') {
      nextSettings[field] = remapNamedDocument(settings[field], remember);
      if (nextSettings[field].departmentLeaders && typeof nextSettings[field].departmentLeaders === 'object') {
        Object.keys(nextSettings[field].departmentLeaders).forEach(category => {
          nextSettings[field].departmentLeaders[category] = uniqueSorted(
            (nextSettings[field].departmentLeaders[category] || []).map(remember)
          );
        });
      }
    }
  });
  settingsChanged = !sameJson(settings, nextSettings);
  if (settingsChanged) writes.push({ ref: settingsRef, data: nextSettings });

  const mergedNameMap = Object.assign({}, storedMap, STATIC_ALIASES, learnedAliases);
  Object.keys(mergedNameMap).forEach(rawKey => {
    const target = remember(mergedNameMap[rawKey]);
    if (target) mergedNameMap[rawKey] = target;
  });
  if (!sameJson(storedMap, mergedNameMap)) {
    const nameMapData = Object.assign({}, nameMapSnap.exists() ? nameMapSnap.data() : {}, { map: mergedNameMap });
    writes.push({ ref: nameMapRef, data: nameMapData });
  }

  if (writes.length) await commitWrites(fsMod, db, writes);
  if (typeof localStorage !== 'undefined') localStorage.setItem(CLEANUP_MARKER, '1');

  if (interactive) {
    const details = [
      memberRowsRemoved + ' duplicate/variant member entr' + (memberRowsRemoved === 1 ? 'y' : 'ies') + ' cleaned',
      servicesChanged + ' service' + (servicesChanged === 1 ? '' : 's') + ' updated',
      departmentsChanged ? 'department rosters cleaned' : 'department rosters already clean',
      requestsChanged + ' request' + (requestsChanged === 1 ? '' : 's') + ' updated'
    ];
    alert('Member cleanup complete.\n\n' + details.join('\n'));
  }
}

function currentMember() {
  const select = document.getElementById('me-select');
  const raw = (select && select.value) || localStorage.getItem('wds-me') || '';
  return normalizeMemberName(raw);
}

function setupLeaderAccess(app, db, fsMod) {
  const settingsRef = fsMod.doc(db, 'app', 'settings');
  const membersRef = fsMod.doc(db, 'app', 'members');
  let settings = {};
  let members = [];
  let settingsLoaded = false;
  let renderQueued = false;

  const leaders = () => {
    const names = [];
    const collect = value => {
      if (Array.isArray(value)) names.push(...value);
      else if (value && typeof value === 'object') {
        Object.keys(value).forEach(key => collect(value[key]));
      }
    };
    collect(settings.departmentLeaders);
    collect(settings.access && settings.access.departmentLeaders);
    collect(settings.roles && settings.roles.departmentLeaders);
    collect(settings.memberAccess && settings.memberAccess.departmentLeaders);
    return uniqueSorted(names.map(normalizeMemberName));
  };
  const restrictionActive = () => leaders().length > 0;
  const canManage = () => settingsLoaded && (!restrictionActive() || leaders().includes(currentMember()));

  function queueApply() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      applyAccess();
      renderLeaderEditor();
    });
  }

  function applyAccess() {
    const manageTab = document.getElementById('tab-manage');
    if (!manageTab) return;
    const allowed = canManage();
    manageTab.classList.toggle('hidden', !allowed);
    manageTab.setAttribute('aria-hidden', allowed ? 'false' : 'true');

    if (!allowed && manageTab.classList.contains('active')) {
      const myTab = document.getElementById('tab-my');
      if (myTab) myTab.click();
    }
  }

  function renderLeaderEditor() {
    const view = document.getElementById('view');
    if (!view) return;
    const peopleTab = view.querySelector('.subnav button[data-sub="people"].active');
    const existing = document.getElementById('department-leader-access');
    if (!peopleTab || !canManage()) {
      if (existing) existing.remove();
      return;
    }

    const selected = new Set(leaders());
    const available = uniqueSorted(members.map(normalizeMemberName));
    const signature = JSON.stringify({ available, selected: Array.from(selected), active: restrictionActive() });
    if (existing && existing.dataset.signature === signature) return;

    const card = existing || document.createElement('div');
    card.id = 'department-leader-access';
    card.className = 'card';
    card.dataset.signature = signature;
    card.innerHTML =
      '<div class="f-label">Department leader access</div>' +
      '<div class="f-desc">Only selected department leaders will see the Manage tab. The existing editor passcode still applies after they open it.</div>' +
      (!restrictionActive()
        ? '<p class="hint" style="margin-top:10px"><b>Leader-only access is not active yet.</b> Select every department leader below, then save.</p>'
        : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px">' +
      available.map(name =>
        '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px">' +
        '<input type="checkbox" data-access-leader value="' + escapeHtml(name) + '"' +
        (selected.has(name) ? ' checked' : '') + '>' + escapeHtml(name) + '</label>'
      ).join('') +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px">' +
      '<button class="primary" type="button" data-access-save-leaders>Save department leaders</button>' +
      '<span class="hint" style="margin:0">' + selected.size + ' currently selected</span>' +
      '</div>';

    if (!existing) {
      const subnav = view.querySelector('.subnav');
      if (subnav) subnav.insertAdjacentElement('afterend', card);
    }
  }

  // Default closed until the shared settings snapshot arrives so a non-leader
  // never sees a brief Manage-tab flash during startup.
  const initialManageTab = document.getElementById('tab-manage');
  if (initialManageTab) {
    initialManageTab.classList.add('hidden');
    initialManageTab.setAttribute('aria-hidden', 'true');
  }

  fsMod.onSnapshot(settingsRef, snap => {
    settings = snap.exists() ? (snap.data() || {}) : {};
    settingsLoaded = true;
    queueApply();
  });

  fsMod.onSnapshot(membersRef, snap => {
    members = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    queueApply();
  });

  document.addEventListener('click', event => {
    const manageTab = event.target.closest && event.target.closest('#tab-manage');
    if (manageTab && !canManage()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const saveButton = event.target.closest && event.target.closest('[data-access-save-leaders]');
    if (!saveButton) return;

    event.preventDefault();
    const checked = Array.from(document.querySelectorAll('#department-leader-access [data-access-leader]:checked'))
      .map(input => normalizeMemberName(input.value))
      .filter(Boolean);
    const next = uniqueSorted(checked);
    if (!next.length) {
      alert('Select at least one department leader before saving.');
      return;
    }

    const me = currentMember();
    if (me && !next.includes(me) &&
        !confirm('Your name is not selected. After saving, Manage will disappear for you on this device. Save anyway?')) {
      return;
    }

    ensureSignedIn(app)
      .then(() => fsMod.setDoc(settingsRef, { departmentLeaders: next }, { merge: true }))
      .catch(error => {
        console.warn('Could not save department leaders:', error);
        alert('Could not save department leaders. Check the connection and try again.');
      });
  }, true);

  document.addEventListener('change', event => {
    if (event.target && event.target.id === 'me-select') setTimeout(queueApply, 0);
  });

  const observer = new MutationObserver(queueApply);
  observer.observe(document.body, { childList: true, subtree: true });
  queueApply();
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function start() {
  if (typeof localStorage !== 'undefined') migrateCachedMemberReferences();
  if (typeof window === 'undefined' || !window.FIREBASE_CONFIG) return;

  const [appMod, fsMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
  ]);

  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(window.FIREBASE_CONFIG);
  const db = fsMod.getFirestore(app);

  setupLeaderAccess(app, db, fsMod);

  // Replace the old one-time cleanup handler with the stronger version. Capture
  // phase lets this run before app.js's delegated click handler.
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('[data-act="unify-names"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm('Clean duplicate and variant member names across members, duties, departments, and requests?')) return;
    cleanMemberIdentities(app, db, fsMod, true).catch(error => {
      console.warn('Member cleanup failed:', error);
      alert('Member cleanup could not finish. Check the connection and try again.');
    });
  }, true);

  // One idempotent migration per device after this release. This fixes existing
  // ghost identities without requiring every member to press the cleanup button.
  if (localStorage.getItem(CLEANUP_MARKER) !== '1') {
    setTimeout(() => {
      cleanMemberIdentities(app, db, fsMod, false).catch(error => {
        console.warn('Background member cleanup skipped:', error);
      });
    }, 5000);
  }
}

const API = {
  FIREBASE_VERSION,
  CLEANUP_MARKER,
  STATIC_ALIASES,
  normalizeMemberName,
  makeCanonicalizer,
  mergeCanonicalValues,
  remapIdentityMap,
  mergeCachedValues,
  remapFirestoreCollection,
  remapNamedDocument,
  remapNameMap,
  remapCachedState,
  migrateCachedMemberReferences,
  cleanMemberIdentities,
  setupLeaderAccess
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') {
  window.MemberAccess = API;
  start().catch(error => console.warn('Member access module did not start:', error));
}
