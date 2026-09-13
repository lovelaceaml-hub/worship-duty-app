'use strict';

/*
 * Pure notification routing for department leaders and administrators.
 *
 * The Cloud Function entrypoint can provide Firestore records, token state,
 * and message formatters to these functions. This module deliberately has no
 * Firebase dependency so the routing rules can be tested without credentials
 * or a live database.
 */

const RESOLVED_STATUSES = new Set([
  'approved',
  'cancelled',
  'canceled',
  'closed',
  'complete',
  'completed',
  'declined',
  'done',
  'resolved',
  'rejected',
  'dismissed',
  'expired',
  'withdrawn',
  'superseded'
]);

const DEFAULT_DUTY_DEPARTMENTS = new Map([
  ['presider', 'Worship'],
  ['sermon', 'Worship'],
  ['message', 'Worship'],
  ['prayer of thanks', 'Worship'],
  ['opening prayer', 'Worship'],
  ['closing prayer', 'Worship'],
  ['translation #1', 'Translation'],
  ['translation #2', 'Translation'],
  ['translation', 'Translation'],
  ['usher door', 'Usher Sisters'],
  ['usher front', 'Usher Sisters'],
  ['usher back', 'Usher Sisters'],
  ['usher sisters', 'Usher Sisters'],
  ['usher #1', 'Usher Brothers'],
  ['usher #2', 'Usher Brothers'],
  ['lobby security', 'Usher Brothers'],
  ['usher brothers', 'Usher Brothers'],
  ['lobby desk #1', 'Lobby'],
  ['lobby desk #2', 'Lobby'],
  ['lobby desk', 'Lobby'],
  ['lobby', 'Lobby'],
  ['media booth #1', 'Media'],
  ['media booth #2', 'Media'],
  ['media booth', 'Media'],
  ['media', 'Media'],
  ['parking #1', 'Parking Lot'],
  ['parking #2', 'Parking Lot'],
  ['parking #3', 'Parking Lot'],
  ['parking #4', 'Parking Lot'],
  ['parking #5', 'Parking Lot'],
  ['parking', 'Parking Lot'],
  ['offering #1', 'Offering'],
  ['offering #2', 'Offering'],
  ['offering #3', 'Offering'],
  ['offering #4', 'Offering'],
  ['offering #5', 'Offering'],
  ['offering #6', 'Offering'],
  ['offering', 'Offering']
]);

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function valueText(value) {
  if (typeof value === 'string') return asText(value);
  if (typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return asText(firstValue(value, [
    'name',
    'department',
    'category',
    'label',
    'value',
    'id'
  ]));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function departmentKey(value) {
  return valueText(value).toLowerCase().replace(/\s+/g, ' ');
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = valueText(value);
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

function listValue(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return uniqueStrings(value);
  if (value instanceof Set) return uniqueStrings([...value]);
  return uniqueStrings([value]);
}

function recordsValue(value, role) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const personKeys = [
      'name',
      'memberName',
      'displayName',
      'id',
      'uid',
      'email',
      'role',
      'roles',
      'departments',
      'department',
      'pushOptIn',
      'pushEnabled',
      'notificationsEnabled',
      'optIn',
      'token',
      'tokens'
    ];
    if (personKeys.some(key => Object.prototype.hasOwnProperty.call(value, key))) {
      return [value];
    }
    return recordsFromRoleMap(value, role);
  }
  if (value == null || value === '') return [];
  return [value];
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object && object[key];
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function departmentMapValue(map, duty) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  const dutyText = valueText(duty);
  if (!dutyText) return undefined;
  const exact = Object.keys(map).find(key => key === dutyText);
  const folded = Object.keys(map).find(key => departmentKey(key) === departmentKey(dutyText));
  const value = map[exact || folded];
  return value == null ? undefined : value;
}

function defaultDepartmentForDuty(duty) {
  const key = departmentKey(duty);
  if (!key) return [];
  const exact = DEFAULT_DUTY_DEPARTMENTS.get(key);
  if (exact) return [exact];
  if (key.includes('translation')) return ['Translation'];
  if (key.includes('lobby desk') || key === 'lobby') return ['Lobby'];
  if (key.includes('media')) return ['Media'];
  if (key.includes('parking')) return ['Parking Lot'];
  if (key.includes('offering')) return ['Offering'];
  if (key.includes('usher door') || key.includes('usher front') || key.includes('usher back')) {
    return ['Usher Sisters'];
  }
  if (key.includes('usher #') || key.includes('lobby security')) return ['Usher Brothers'];
  if (key.includes('presider') || key.includes('sermon') || key.includes('prayer')) {
    return ['Worship'];
  }
  return [];
}

function departmentResolver(options, directory) {
  return (options && (options.departmentFor || options.resolveDepartment)) ||
    (directory && (directory.departmentFor || directory.resolveDepartment));
}

function dutyDepartmentValues(duty, item, options, directory) {
  const direct = duty && typeof duty === 'object' && !Array.isArray(duty)
    ? [
      duty.department,
      duty.departments,
      duty.category,
      duty.categories,
      duty.departmentName
    ].flatMap(listValue)
    : [];
  if (direct.length) return direct;

  const dutyName = valueText(duty && typeof duty === 'object' ? firstValue(duty, [
    'duty',
    'dutyName',
    'slot',
    'position',
    'title',
    'label',
    'name'
  ]) : duty);
  if (!dutyName) return [];

  const resolver = departmentResolver(options, directory);
  if (typeof resolver === 'function') {
    const resolved = resolver(dutyName, item, duty);
    if (resolved != null) return listValue(resolved);
  }

  const map = (options && (options.dutyDepartments || options.departmentByDuty)) ||
    (resolver && typeof resolver === 'object' ? resolver : undefined) ||
    (directory && (directory.dutyDepartments || directory.departmentByDuty ||
      directory.dutyCategories));
  const mapped = departmentMapValue(map, dutyName);
  if (mapped != null) return listValue(mapped);
  return defaultDepartmentForDuty(dutyName);
}

function dutyEntries(item) {
  if (!item || typeof item !== 'object') return [];
  const entries = [];
  for (const key of ['duty', 'duties', 'assignments', 'conflictingDuties', 'conflictDuties']) {
    const value = item[key];
    if (Array.isArray(value)) entries.push(...value);
    else if (value != null) entries.push(value);
  }
  for (const key of ['request', 'conflict']) {
    if (item[key] && typeof item[key] === 'object') entries.push(...dutyEntries(item[key]));
  }
  return entries;
}

function departmentsFor(item, options, directory) {
  if (!item || typeof item !== 'object') return [];
  const direct = [];
  for (const source of [item, item.request, item.conflict]) {
    if (!source || typeof source !== 'object') continue;
    direct.push(...[
      source.department,
      source.departments,
      source.category,
      source.categories,
      source.departmentNames,
      source.affectedDepartments,
      source.ownedDepartments,
      source.involvedDepartments
    ].flatMap(listValue));
  }
  const inferred = dutyEntries(item).flatMap(duty =>
    dutyDepartmentValues(duty, item, options || {}, directory || {}));
  const byKey = new Map();
  for (const department of [...direct, ...inferred]) {
    const key = departmentKey(department);
    if (key && !byKey.has(key)) byKey.set(key, valueText(department));
  }
  return [...byKey.values()].sort(compareText);
}

function nameFor(record) {
  if (typeof record === 'string') return asText(record);
  return asText(firstValue(record, ['name', 'memberName', 'displayName', 'id']));
}

function recordDepartments(record) {
  return departmentsFor(record || {});
}

function recordHasAllDepartments(record) {
  return record && (
    record.allDepartments === true ||
    record.global === true ||
    departmentKey(record.scope) === 'all'
  );
}

function leaderMatches(record, departments, options, directory) {
  if (!departments.length) return false;
  if (recordHasAllDepartments(record)) return true;
  const owned = recordDepartments(record);
  const wanted = new Set(departments.map(departmentKey));
  return owned.some(department => wanted.has(departmentKey(department)));
}

function recordsFromRoleMap(roleMap, role) {
  if (!roleMap || typeof roleMap !== 'object' || Array.isArray(roleMap)) return [];
  const roleEntry = [
    role,
    role === 'leader' ? 'leaders' : 'admins',
    role === 'leader' ? 'departmentLeaders' : '',
    role === 'leader' ? 'leadersByDepartment' : ''
  ].find(
    key => key && Object.prototype.hasOwnProperty.call(roleMap, key)
  );
  if (roleEntry) {
    if (roleEntry === 'departmentLeaders' || roleEntry === 'leadersByDepartment') {
      return recordsFromDepartmentMap(roleMap[roleEntry], role);
    }
    return recordsValue(roleMap[roleEntry], role);
  }
  const roleKeys = [
    'leader',
    'leaders',
    'departmentLeader',
    'departmentLeaders',
    'leadersByDepartment',
    'admin',
    'admins',
    'administrator',
    'administrators',
    'globalLeaderManager',
    'globalLeaderManagers'
  ];
  if (roleKeys.some(key => Object.prototype.hasOwnProperty.call(roleMap, key))) {
    return [];
  }
  return Object.entries(roleMap).map(([name, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { name, ...value };
    }
    return { name, departments: value };
  });
}

function recordsFor(directory, role) {
  const plural = role === 'leader' ? 'leaders' : 'admins';
  const singular = role === 'leader' ? 'leader' : 'admin';
  const configured = directory && firstValue(directory, role === 'admin'
    ? [plural, singular, 'administrators', 'globalAdmins', 'globalAdministrators']
    : [plural, singular]);
  const records = recordsValue(configured, role);
  const fromRoles = recordsFromRoleMap(directory && directory.roles, role)
    .filter(record => {
      const configuredRoles = listValue(record && firstValue(record, ['role', 'roles']))
        .map(value => value.toLowerCase().replace(/[\s_-]+/g, ''));
      return !configuredRoles.length || configuredRoles.includes(role);
    });
  const members = recordsValue(directory && directory.members, role)
    .filter(record => {
      const roles = listValue(record && firstValue(record, ['role', 'roles']))
        .map(value => value.toLowerCase().replace(/[\s_-]+/g, ''));
      return roles.includes(role);
    });
  const byDepartment = role === 'leader'
    ? recordsFromDepartmentMap(directory && (directory.leadersByDepartment || directory.departmentLeaders), role)
    : [];
  return [...records, ...fromRoles, ...members, ...byDepartment].map(record => {
    if (typeof record === 'string') return { name: record, role };
    return { ...record, role: record.role || role };
  });
}

function recordsFromDepartmentMap(departmentMap, role) {
  if (!departmentMap || typeof departmentMap !== 'object' || Array.isArray(departmentMap)) return [];
  const records = new Map();
  for (const [department, people] of Object.entries(departmentMap)) {
    let values;
    if (Array.isArray(people) || people instanceof Set) {
      values = [...people];
    } else if (people && typeof people === 'object') {
      const identityKeys = [
        'name',
        'memberName',
        'displayName',
        'id',
        'uid',
        'email',
        'pushOptIn',
        'pushEnabled',
        'notificationsEnabled',
        'optIn',
        'token',
        'tokens'
      ];
      values = identityKeys.some(key => Object.prototype.hasOwnProperty.call(people, key))
        ? [people]
        : Object.entries(people).map(([name, value]) => {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            return { name, ...value };
          }
          return { name, pushOptIn: value };
        });
    } else {
      values = [people];
    }
    for (const person of values) {
      const name = nameFor(person);
      if (!name) continue;
      const current = records.get(name) || { name, role, departments: [] };
      const mappedDepartments = uniqueStrings([...current.departments, department]);
      const existingOptIn = explicitPushOptIn(current);
      const incomingOptIn = explicitPushOptIn(person);
      if (person && typeof person === 'object') Object.assign(current, person);
      current.departments = uniqueStrings([
        ...mappedDepartments,
        ...(person && typeof person === 'object' ? recordDepartments(person) : [])
      ]);
      const optInValues = [existingOptIn, incomingOptIn].filter(value => value != null);
      if (optInValues.length) current.pushOptIn = optInValues.every(Boolean);
      records.set(name, current);
    }
  }
  return [...records.values()];
}

function optionValue(source, name) {
  if (typeof source === 'function') return source(name);
  if (source instanceof Set) return source.has(name);
  if (Array.isArray(source)) return source.includes(name);
  if (source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, name)) {
    const value = source[name];
    if (value && typeof value === 'object') {
      return firstValue(value, ['pushOptIn', 'pushEnabled', 'enabled', 'optIn']);
    }
    return Boolean(value);
  }
  return undefined;
}

function explicitPushOptIn(record) {
  if (!record || typeof record !== 'object') return undefined;
  return firstValue(record, [
    'pushOptIn',
    'pushEnabled',
    'notificationsEnabled',
    'optIn'
  ]);
}

function tokenRecords(tokens) {
  if (Array.isArray(tokens)) return tokens;
  if (!tokens || typeof tokens !== 'object') return [];
  return Object.entries(tokens).map(([tokenName, value]) => {
    if (value && typeof value === 'object') return { name: tokenName, ...value };
    return { name: tokenName, enabled: value };
  });
}

function tokenOptIn(directory, record, name) {
  const configuredTokens = [
    directory && directory.tokens,
    record && record.tokens
  ].filter(Boolean);
  if (!configuredTokens.length) return undefined;
  const records = configuredTokens.flatMap(tokenRecords);
  const matches = records.filter(record => nameFor(record) === name || record.memberName === name);
  if (!matches.length) return undefined;
  return matches.some(record => {
    const value = firstValue(record, ['pushOptIn', 'pushEnabled', 'enabled', 'optIn']);
    return value == null ? true : Boolean(value);
  });
}

function pushOptedIn(record, directory, options) {
  const name = nameFor(record);
  const injected = optionValue(
    options && (options.pushOptIn || options.resolvePushOptIn),
    name
  );
  if (injected != null) return Boolean(injected);

  const explicit = explicitPushOptIn(record);
  if (explicit != null) return Boolean(explicit);

  const directoryOptIn = optionValue(directory && (
    directory.pushOptIn ||
    directory.pushEnabled ||
    directory.notificationPreferences ||
    directory.notificationPrefs ||
    directory.pushPreferences
  ), name);
  if (directoryOptIn != null) return Boolean(directoryOptIn);

  const tokenState = tokenOptIn(directory, record, name);
  if (tokenState != null) return tokenState;

  const defaultValue = options && options.defaultPushOptIn != null
    ? options.defaultPushOptIn
    : directory && directory.defaultPushOptIn;
  return defaultValue == null ? false : Boolean(defaultValue);
}

function requesterNames(item) {
  return uniqueStrings([
    firstValue(item, ['name', 'requester', 'requesterName', 'createdBy', 'memberName', 'member']),
    item && item.request && firstValue(item.request, ['name', 'requester', 'requesterName'])
  ]);
}

const ACKNOWLEDGEMENT_KEYS = [
  'acknowledgedDuties',
  'acknowledgementDuties',
  'acknowledgmentDuties',
  'ackDuties',
  'dutiesAtAcknowledgement',
  'dutiesAtAcknowledgment',
  'acknowledgedFor',
  'acknowledgementFor',
  'acknowledgmentFor',
  'acknowledgement',
  'acknowledgment',
  'ack'
];

function dutySnapshotEntries(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(dutySnapshotEntries);
  if (value instanceof Set) return [...value].flatMap(dutySnapshotEntries);
  if (value && typeof value === 'object') {
    const nested = [];
    for (const key of ['duties', 'assignments', 'conflictingDuties', 'conflictDuties']) {
      if (value[key] != null) nested.push(...dutySnapshotEntries(value[key]));
    }
    if (value.duty != null || value.dutyName != null || value.slot != null ||
        value.position != null || value.title != null || value.label != null) {
      nested.push(value);
    }
    return nested.length ? nested : [value];
  }
  return [value];
}

function dutyDescriptor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { duty: valueText(value) };
  }
  const departments = [
    value.department,
    value.departments,
    value.category,
    value.categories,
    value.departmentName
  ].flatMap(listValue).map(departmentKey).filter(Boolean).sort(compareText);
  return {
    duty: valueText(firstValue(value, [
      'duty',
      'dutyName',
      'slot',
      'position',
      'title',
      'label',
      'name'
    ])),
    departments,
    serviceId: valueText(firstValue(value, ['serviceId', 'svcId'])),
    date: valueText(value.date)
  };
}

function dutyComposition(item) {
  const entries = dutySnapshotEntries(item && item.duties);
  entries.push(...dutySnapshotEntries(item && item.assignments));
  entries.push(...dutySnapshotEntries(item && item.conflictingDuties));
  entries.push(...dutySnapshotEntries(item && item.conflictDuties));
  if (item && item.duty != null) entries.push(item.duty);
  const serialized = new Set();
  for (const entry of entries) {
    const descriptor = dutyDescriptor(entry);
    if (!descriptor.duty && !descriptor.departments.length) continue;
    serialized.add(JSON.stringify(stableValue(descriptor)));
  }
  return [...serialized].sort(compareText);
}

function acknowledgementComposition(item) {
  if (!item || typeof item !== 'object') return null;
  const entries = [];
  for (const key of ACKNOWLEDGEMENT_KEYS) {
    if (item[key] != null) entries.push(...dutySnapshotEntries(item[key]));
  }
  if (item.resolution && typeof item.resolution === 'object') {
    for (const key of ACKNOWLEDGEMENT_KEYS) {
      if (item.resolution[key] != null) {
        entries.push(...dutySnapshotEntries(item.resolution[key]));
      }
    }
  }
  if (!entries.length) return null;
  const serialized = new Set();
  for (const entry of entries) {
    const descriptor = dutyDescriptor(entry);
    if (!descriptor.duty && !descriptor.departments.length) continue;
    serialized.add(JSON.stringify(stableValue(descriptor)));
  }
  return [...serialized].sort(compareText);
}

function hasStaleAcknowledgement(item) {
  const current = dutyComposition(item);
  const acknowledged = acknowledgementComposition(item);
  return current.length > 0 && acknowledged && (
    current.length !== acknowledged.length ||
    current.some((entry, index) => entry !== acknowledged[index])
  );
}

function isResolved(item) {
  if (!item || typeof item !== 'object') return false;
  const status = asText(firstValue(item, ['status', 'state', 'resolutionStatus'])).toLowerCase();
  if (RESOLVED_STATUSES.has(status)) return true;
  if (item.resolvedAt || item.resolutionAt) return true;
  const acknowledged = status === 'acknowledged' || item.acknowledged === true ||
    item.acknowledgedAt || item.acknowledgement || item.acknowledgment;
  if (acknowledged && !hasStaleAcknowledgement(item)) return true;
  if (item.resolved === true || item.isResolved === true) return true;
  if (item.resolution && typeof item.resolution === 'object') {
    const nestedStatus = asText(firstValue(item.resolution, ['status', 'state'])).toLowerCase();
    if (RESOLVED_STATUSES.has(nestedStatus) || item.resolution.resolved === true) return true;
    if (nestedStatus === 'acknowledged' || item.resolution.acknowledged === true) {
      return !hasStaleAcknowledgement(item);
    }
  }
  return false;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function identityFor(kind, item) {
  const directId = firstValue(item, kind === 'request'
    ? ['id', 'requestId']
    : ['id', 'conflictId']);
  if (directId != null && directId !== '') {
    if (kind === 'conflict') {
      return 'id:' + asText(directId) + ':composition:' + JSON.stringify(dutyComposition(item));
    }
    return 'id:' + asText(directId);
  }

  const fields = kind === 'request'
    ? {
      svcId: firstValue(item, ['svcId', 'serviceId']),
      date: item.date,
      service: item.service,
      duty: item.duty,
      name: firstValue(item, ['name', 'requester', 'requesterName']),
      createdAt: item.createdAt
    }
    : {
      serviceId: firstValue(item, ['serviceId', 'svcId']),
      date: item.date,
      service: item.service,
      member: firstValue(item, ['member', 'memberName', 'name']),
      composition: dutyComposition(item)
    };
  return `fields:${JSON.stringify(stableValue(fields))}`;
}

function notificationDedupeKey(kind, item, recipient) {
  const normalizedKind = kind === 'conflict' ? 'conflict' : 'request';
  return `${normalizedKind}:${encodeURIComponent(identityFor(normalizedKind, item))}:${encodeURIComponent(asText(recipient))}`;
}

function candidateRecipients(item, directory, options, kind) {
  const departments = departmentsFor(item, options, directory);
  const excludeRequester = options && options.excludeRequester != null
    ? options.excludeRequester !== false
    : kind !== 'conflict';
  const requester = new Set(excludeRequester ? requesterNames(item) : []);
  const byName = new Map();

  for (const record of recordsFor(directory, 'leader')) {
    const name = nameFor(record);
    if (!name || requester.has(name) || !leaderMatches(record, departments, options, directory)) continue;
    const current = byName.get(name) || { name, roles: new Set(), departments: new Set(), pushOptIn: undefined };
    current.roles.add('leader');
    for (const department of recordDepartments(record)) current.departments.add(department);
    const leaderOptIn = explicitPushOptIn(record);
    if (leaderOptIn != null) current.pushOptIn = current.pushOptIn == null
      ? Boolean(leaderOptIn)
      : current.pushOptIn && Boolean(leaderOptIn);
    byName.set(name, current);
  }

  for (const record of recordsFor(directory, 'admin')) {
    const name = nameFor(record);
    if (!name || requester.has(name)) continue;
    const current = byName.get(name) || { name, roles: new Set(), departments: new Set(), pushOptIn: undefined };
    current.roles.add('admin');
    const adminOptIn = explicitPushOptIn(record);
    if (adminOptIn != null) current.pushOptIn = current.pushOptIn == null
      ? Boolean(adminOptIn)
      : current.pushOptIn && Boolean(adminOptIn);
    byName.set(name, current);
  }

  return [...byName.values()]
    .map(record => ({
      name: record.name,
      roles: [...record.roles].sort(),
      departments: [...record.departments].sort(compareText),
      pushOptIn: record.pushOptIn
    }))
    .filter(record => pushOptedIn(record, directory, options))
    .sort((a, b) => compareText(a.name, b.name));
}

function defaultTitle(kind) {
  return kind === 'conflict' ? 'Duty conflict requires attention' : 'Schedule change requested';
}

function defaultBody(kind, item) {
  const subject = kind === 'conflict'
    ? firstValue(item, ['member', 'memberName', 'name']) || 'A member'
    : firstValue(item, ['name', 'requester', 'requesterName']) || 'A member';
  const duty = asText(item && item.duty) || 'a duty';
  const service = asText(item && (item.service || item.serviceLabel));
  const date = asText(item && item.date);
  const where = [service, date].filter(Boolean).join(' on ');
  return kind === 'conflict'
    ? `${subject} has a duty conflict for ${duty}${where ? ` at ${where}` : ''}.`
    : `${subject} requested a change for ${duty}${where ? ` at ${where}` : ''}.`;
}

function route(kind, item, directory, options) {
  if (!item || typeof item !== 'object' || isResolved(item)) return [];
  const routingOptions = options || {};
  const recipients = candidateRecipients(item, directory || {}, routingOptions, kind);
  const title = typeof routingOptions.titleFor === 'function'
    ? routingOptions.titleFor(kind, item)
    : routingOptions.title || defaultTitle(kind);
  const body = typeof routingOptions.bodyFor === 'function'
    ? routingOptions.bodyFor(kind, item)
    : routingOptions.body || defaultBody(kind, item);

  return recipients.map(recipient => ({
    type: kind,
    recipient: recipient.name,
    roles: recipient.roles,
    departments: recipient.departments,
    pushOptIn: true,
    dedupeKey: notificationDedupeKey(kind, item, recipient.name),
    title,
    body
  }));
}

function routeRequestNotifications(request, directory, options) {
  return route('request', request, directory, options || {});
}

function routeConflictNotifications(conflict, directory, options) {
  return route('conflict', conflict, directory, options || {});
}

function eventEntries(events) {
  if (Array.isArray(events)) return events;
  if (!events || typeof events !== 'object') return [];
  if ((events.type || events.kind) && events.item) return [events];
  const entries = [];
  if (events.request) entries.push({ type: 'request', item: events.request });
  if (events.conflict) entries.push({ type: 'conflict', item: events.conflict });
  if (Array.isArray(events.requests)) {
    events.requests.forEach(item => entries.push({ type: 'request', item }));
  }
  if (Array.isArray(events.conflicts)) {
    events.conflicts.forEach(item => entries.push({ type: 'conflict', item }));
  }
  return entries;
}

function eventType(entry) {
  return entry && (entry.type || entry.kind ||
    (entry.conflict || entry.conflictId ? 'conflict' : 'request'));
}

function eventItem(entry, type) {
  if (!entry) return undefined;
  return entry.item || entry[type] || (entry.type || entry.kind ? undefined : entry);
}

function seenKeyValues(seenKeys) {
  if (seenKeys instanceof Set) return [...seenKeys];
  if (!Array.isArray(seenKeys)) return listValue(seenKeys);
  return seenKeys.map(value => value && typeof value === 'object'
    ? value.dedupeKey
    : value);
}

function dedupeNotifications(routes, seenKeys) {
  const previouslySent = new Set(seenKeyValues(seenKeys));
  const unique = new Map();
  for (const routeEntry of Array.isArray(routes) ? routes : []) {
    const key = routeEntry && routeEntry.dedupeKey;
    if (!key || previouslySent.has(key) || unique.has(key)) continue;
    unique.set(key, routeEntry);
  }
  return [...unique.values()].sort((a, b) => compareText(a.dedupeKey, b.dedupeKey));
}

function routeNotifications(events, directory, options) {
  const entries = eventEntries(events);
  const resolvedIdentities = new Set(entries
    .filter(entry => isResolved(eventItem(entry, eventType(entry))))
    .map(entry => {
      const type = eventType(entry);
      const item = eventItem(entry, type);
      if (!item) return '';
      const normalizedType = type === 'conflict' ? 'conflict' : 'request';
      return normalizedType + ':' + identityFor(normalizedType, item);
    })
    .filter(Boolean));
  const routed = [];
  for (const entry of entries) {
    const type = eventType(entry);
    const item = eventItem(entry, type);
    const normalizedType = type === 'conflict' ? 'conflict' : 'request';
    if (item && resolvedIdentities.has(normalizedType + ':' + identityFor(normalizedType, item))) {
      continue;
    }
    const routes = type === 'conflict'
      ? routeConflictNotifications(item, directory, options)
      : routeRequestNotifications(item, directory, options);
    routed.push(...routes);
  }
  return dedupeNotifications(routed, options && (options.seenKeys || options.alreadySent));
}

function createNotificationRouter(directory, baseOptions) {
  const configuredDirectory = directory || {};
  const configuredOptions = baseOptions || {};
  const withOptions = options => ({ ...configuredOptions, ...(options || {}) });
  return {
    routeRequest(request, options) {
      return routeRequestNotifications(request, configuredDirectory, withOptions(options));
    },
    routeConflict(conflict, options) {
      return routeConflictNotifications(conflict, configuredDirectory, withOptions(options));
    },
    route(events, options) {
      return routeNotifications(events, configuredDirectory, withOptions(options));
    }
  };
}

module.exports = {
  createNotificationRouter,
  defaultDepartmentForDuty,
  dedupeNotifications,
  departmentsFor,
  identityFor,
  isResolved,
  notificationDedupeKey,
  routeConflictNotification: routeConflictNotifications,
  routeConflictNotifications,
  routeNotifications,
  routeRequestNotification: routeRequestNotifications,
  routeRequestNotifications
};
