'use strict';

/**
 * Pure department workflow helpers.
 *
 * This module deliberately knows nothing about Firestore, UI state, or auth
 * tokens. Callers provide the current membership, leader, and authorization
 * snapshots, then persist the returned values through their own boundary.
 */

const MEMBERSHIP_ACTIVE = 'active';
const MEMBERSHIP_ARCHIVED = 'archived';
const MEMBERSHIP_STATUSES = [MEMBERSHIP_ACTIVE, MEMBERSHIP_ARCHIVED];
const REQUEST_PENDING = 'pending';
const REQUEST_APPROVED = 'approved';
const REQUEST_DECLINED = 'declined';
const REQUEST_CANCELLED = 'cancelled';
const REQUEST_RESOLVED = 'resolved';
const REQUEST_STATUSES = [
  REQUEST_PENDING,
  REQUEST_APPROVED,
  REQUEST_DECLINED,
  REQUEST_CANCELLED,
  REQUEST_RESOLVED
];
const TERMINAL_REQUEST_STATUSES = new Set([
  REQUEST_APPROVED,
  REQUEST_DECLINED,
  REQUEST_CANCELLED,
  REQUEST_RESOLVED
]);

const DEFAULT_DUTY_DEPARTMENTS = Object.freeze({
  'Presider': 'Worship',
  'Sermon': 'Worship',
  'Opening Prayer': 'Worship',
  'Closing Prayer': 'Worship',
  'Prayer': 'Worship',
  'Prayer #1': 'Worship',
  'Prayer #2': 'Worship',
  'Translation #1': 'Translation',
  'Translation #2': 'Translation',
  'Usher Sisters': 'Usher Sisters',
  'Usher Brothers': 'Usher Brothers',
  'Lobby': 'Lobby',
  'Lobby Desk #1': 'Lobby',
  'Lobby Desk #2': 'Lobby',
  'Media': 'Media',
  'Media Booth': 'Media',
  'Parking Lot': 'Parking Lot',
  'Offering': 'Offering'
});

const DUTY_PREFIX_RULES = Object.freeze([
  [/^translation(?:\s|#|-|$)/i, 'Translation'],
  [/^usher\s+sisters?(?:\s|#|-|$)/i, 'Usher Sisters'],
  [/^usher\s+brothers?(?:\s|#|-|$)/i, 'Usher Brothers'],
  [/^lobby(?:\s|#|-|$)/i, 'Lobby'],
  [/^media(?:\s|#|-|$)/i, 'Media'],
  [/^parking(?:\s+lot)?(?:\s|#|-|$)/i, 'Parking Lot'],
  [/^offering(?:\s|#|-|$)/i, 'Offering'],
  [/^(?:presider|sermon|opening\s+prayer|closing\s+prayer|prayer)(?:\s|#|-|$)/i, 'Worship']
]);

function text(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function key(value) {
  return text(value).toLocaleLowerCase();
}

function firstText(...values) {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return '';
}

function memberName(value) {
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (!value || typeof value !== 'object') return '';
  return firstText(value.member, value.name, value.memberName, value.memberId);
}

function departmentName(value) {
  if (typeof value === 'string') return text(value);
  if (!value || typeof value !== 'object') return '';
  return firstText(value.department, value.category, value.departmentName);
}

function membershipStatus(value, fallback) {
  const status = key(value);
  return MEMBERSHIP_STATUSES.includes(status) ? status : fallback;
}

function finiteTimestamp(value, fallback) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values || []) {
    const normalized = text(value);
    const normalizedKey = key(normalized);
    if (!normalized || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    result.push(normalized);
  }
  return result;
}

function sortedStrings(values) {
  return uniqueStrings(values).sort((left, right) => left.localeCompare(right));
}

function statusFromRecord(record) {
  if (record && record.archived === true) return MEMBERSHIP_ARCHIVED;
  const status = key(record && record.status);
  return status === MEMBERSHIP_ARCHIVED ? MEMBERSHIP_ARCHIVED : MEMBERSHIP_ACTIVE;
}

function normalizeMembershipRecord(record, fallbackDepartment) {
  if (typeof record === 'string') {
    const department = text(fallbackDepartment);
    const member = text(record);
    return department && member ? { department, member, status: MEMBERSHIP_ACTIVE } : null;
  }
  if (!record || typeof record !== 'object') return null;
  const department = firstText(record.department, record.departmentId, fallbackDepartment);
  const member = firstText(record.member, record.memberName, record.name, record.person);
  if (!department || !member) return null;
  return {
    ...record,
    department,
    member,
    status: statusFromRecord(record)
  };
}

function membershipRecords(input) {
  if (Array.isArray(input)) {
    return input
      .map(record => normalizeMembershipRecord(record))
      .filter(Boolean);
  }
  if (!input || typeof input !== 'object') return [];

  const groupedRecords = [];
  const hasGroupedStatus = Object.prototype.hasOwnProperty.call(input, MEMBERSHIP_ACTIVE) ||
    Object.prototype.hasOwnProperty.call(input, MEMBERSHIP_ARCHIVED);
  if (hasGroupedStatus) {
    for (const status of [MEMBERSHIP_ACTIVE, MEMBERSHIP_ARCHIVED]) {
      const grouped = input[status];
      if (!grouped || typeof grouped !== 'object' || Array.isArray(grouped)) continue;
      for (const [departmentKey, value] of Object.entries(grouped)) {
        const department = text(departmentKey);
        if (!department || value == null) continue;
        const entries = Array.isArray(value) ? value : [value];
        for (const entry of entries) {
          if (entry && typeof entry === 'object' &&
              (Array.isArray(entry.active) || Array.isArray(entry.archived))) {
            for (const nestedStatus of [MEMBERSHIP_ACTIVE, MEMBERSHIP_ARCHIVED]) {
              for (const nestedEntry of entry[nestedStatus] || []) {
                const record = normalizeMembershipRecord(
                  typeof nestedEntry === 'string'
                    ? { member: nestedEntry, status: nestedStatus }
                    : { ...nestedEntry, status: nestedStatus },
                  department
                );
                if (record) groupedRecords.push(record);
              }
            }
            continue;
          }
          const record = normalizeMembershipRecord(
            typeof entry === 'string' ? { member: entry, status } : { ...entry, status },
            department
          );
          if (record) groupedRecords.push(record);
        }
      }
    }
    return groupedRecords;
  }

  const records = [];
  for (const [departmentKey, value] of Object.entries(input)) {
    const department = text(departmentKey);
    if (!department || value == null) continue;

    if (Array.isArray(value)) {
      for (const entry of value) {
        const record = normalizeMembershipRecord(entry, department);
        if (record) records.push(record);
      }
      continue;
    }

    if (typeof value !== 'object') continue;
    for (const status of [MEMBERSHIP_ACTIVE, MEMBERSHIP_ARCHIVED]) {
      const members = value[status];
      if (!Array.isArray(members)) continue;
      for (const member of members) {
        const record = normalizeMembershipRecord(
          typeof member === 'string' ? { member, status } : { ...member, status },
          department
        );
        if (record) records.push(record);
      }
    }
    if (Array.isArray(value.members)) {
      for (const member of value.members) {
        const record = normalizeMembershipRecord(member, department);
        if (record) records.push(record);
      }
    }
    if (value.member || value.name || value.memberName || value.memberId) {
      const record = normalizeMembershipRecord(value, department);
      if (record) records.push(record);
    }
  }
  return records;
}

function membershipArguments(departmentOrInput, member, status, metadata) {
  if (departmentOrInput && typeof departmentOrInput === 'object') {
    return { ...departmentOrInput };
  }
  return {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    department: departmentOrInput,
    member,
    status
  };
}

/**
 * Add or update one department membership without deleting a global member or
 * any membership in another department. The returned value is a new array.
 */
function upsertDepartmentMembership(memberships, departmentOrInput, member, status, metadata) {
  const input = membershipArguments(departmentOrInput, member, status, metadata);
  const record = normalizeMembershipRecord(input);
  if (!record) throw new TypeError('department and member are required');

  const records = membershipRecords(memberships);
  const targetDepartment = key(record.department);
  const targetMember = key(record.member);
  const index = records.findIndex(candidate => (
    key(candidate.department) === targetDepartment && key(candidate.member) === targetMember
  ));
  if (index === -1) {
    if (record.status === MEMBERSHIP_ARCHIVED) {
      record.archivedAt = record.archivedAt !== undefined
        ? record.archivedAt
        : finiteTimestamp(input.at, Date.now());
      if (input.by) record.archivedBy = memberName(input.by) || text(input.by);
    }
    return [...records, record];
  }

  records[index] = { ...records[index], ...record, status: record.status };
  if (record.status === MEMBERSHIP_ARCHIVED) {
    records[index].archivedAt = records[index].archivedAt !== undefined
      ? records[index].archivedAt
      : finiteTimestamp(input.at, Date.now());
    if (input.by) records[index].archivedBy = memberName(input.by) || text(input.by);
  } else if (input.at !== undefined) {
    records[index].restoredAt = input.at;
    if (input.by) records[index].restoredBy = memberName(input.by) || text(input.by);
  }
  return records;
}

function archiveDepartmentMember(memberships, department, member, metadata) {
  return upsertDepartmentMembership(
    memberships,
    { ...(metadata || {}), department, member, status: MEMBERSHIP_ARCHIVED }
  );
}

function reactivateDepartmentMember(memberships, department, member, metadata) {
  return upsertDepartmentMembership(
    memberships,
    { ...(metadata || {}), department, member, status: MEMBERSHIP_ACTIVE }
  );
}

function membershipsForMember(memberships, member, options) {
  const includeArchived = Boolean(options && options.includeArchived);
  const memberKey = key(member);
  return membershipRecords(memberships)
    .filter(record => key(record.member) === memberKey)
    .filter(record => includeArchived || record.status === MEMBERSHIP_ACTIVE)
    .sort((left, right) => left.department.localeCompare(right.department));
}

function membersForDepartment(memberships, department, options) {
  const includeArchived = Boolean(options && options.includeArchived);
  const departmentKey = key(department);
  return sortedStrings(
    membershipRecords(memberships)
      .filter(record => key(record.department) === departmentKey)
      .filter(record => includeArchived || record.status === MEMBERSHIP_ACTIVE)
      .map(record => record.member)
  );
}

function activeMembersForDepartment(memberships, department) {
  return membersForDepartment(memberships, department);
}

function membershipState(memberships, department, member) {
  const departmentKey = key(department);
  const memberKey = key(member);
  const record = membershipRecords(memberships).find(candidate => (
    key(candidate.department) === departmentKey && key(candidate.member) === memberKey
  ));
  return record ? record.status : null;
}

function isActiveDepartmentMember(memberships, department, member) {
  return membershipState(memberships, department, member) === MEMBERSHIP_ACTIVE;
}

function departmentMemberships(source, department, status) {
  const wantedDepartment = text(department);
  const wantedStatus = membershipStatus(status, MEMBERSHIP_ACTIVE);
  return membershipRecords(source).filter(record => (
    record.department === wantedDepartment && record.status === wantedStatus
  ));
}

function departmentMembers(source, department, status) {
  return sortedStrings(departmentMemberships(source, department, status).map(record => record.member));
}

function activeDepartmentMembers(source, department) {
  return departmentMembers(source, department, MEMBERSHIP_ACTIVE);
}

function archivedDepartmentMembers(source, department) {
  return departmentMembers(source, department, MEMBERSHIP_ARCHIVED);
}

function setDepartmentMembershipStatus(source, department, member, status, metadata) {
  const wantedDepartment = text(department);
  const wantedMember = memberName(member);
  const wantedStatus = membershipStatus(status, '');
  if (!wantedDepartment || !wantedMember || !wantedStatus) {
    throw new TypeError('department, member, and a valid membership status are required');
  }
  return upsertDepartmentMembership(source, {
    ...(metadata || {}),
    department: wantedDepartment,
    member: wantedMember,
    status: wantedStatus
  });
}

function archiveDepartmentMembership(source, department, member, metadata) {
  return setDepartmentMembershipStatus(source, department, member, MEMBERSHIP_ARCHIVED, metadata);
}

function restoreDepartmentMembership(source, department, member, metadata) {
  return setDepartmentMembershipStatus(source, department, member, MEMBERSHIP_ACTIVE, metadata);
}

function removeDepartmentMembership(source, department, member, metadata) {
  return archiveDepartmentMembership(source, department, member, metadata);
}

function mapDutyDepartments(dutyDepartments) {
  if (!dutyDepartments || typeof dutyDepartments !== 'object') {
    return new Map();
  }
  const entries = dutyDepartments instanceof Map
    ? Array.from(dutyDepartments.entries())
    : Object.entries(dutyDepartments);
  return new Map(entries.map(([duty, department]) => [key(duty), text(department)])
    .filter(([duty, department]) => duty && department));
}

function departmentForDuty(duty, dutyDepartments) {
  const normalizedDuty = text(duty);
  if (!normalizedDuty) return null;

  const configured = mapDutyDepartments(dutyDepartments);
  const configuredDepartment = configured.get(key(normalizedDuty));
  if (configuredDepartment) return configuredDepartment;

  const defaultDepartment = mapDutyDepartments(DEFAULT_DUTY_DEPARTMENTS).get(key(normalizedDuty));
  if (defaultDepartment) return defaultDepartment;

  for (const [pattern, department] of DUTY_PREFIX_RULES) {
    if (pattern.test(normalizedDuty)) return department;
  }
  return null;
}

function departmentsForDuties(duties, dutyDepartments) {
  const result = [];
  const seen = new Set();
  for (const duty of uniqueStrings(duties)) {
    const department = departmentForDuty(duty, dutyDepartments);
    const departmentKey = key(department);
    if (!department || seen.has(departmentKey)) continue;
    seen.add(departmentKey);
    result.push(department);
  }
  return result;
}

function leaderEntries(leadersByDepartment) {
  if (leadersByDepartment instanceof Map) return Array.from(leadersByDepartment.entries());
  if (Array.isArray(leadersByDepartment)) {
    return leadersByDepartment
      .filter(record => record && typeof record === 'object')
      .map(record => [record.department, record.leaders || record.members || record.member]);
  }
  if (!leadersByDepartment || typeof leadersByDepartment !== 'object') return [];
  return Object.entries(leadersByDepartment);
}

function leadersForDepartment(leadersByDepartment, department) {
  const departmentKey = key(department);
  for (const [candidateDepartment, leaders] of leaderEntries(leadersByDepartment)) {
    if (key(candidateDepartment) !== departmentKey) continue;
    if (Array.isArray(leaders)) return uniqueStrings(leaders);
    if (leaders instanceof Set) return uniqueStrings(Array.from(leaders));
    if (leaders && typeof leaders === 'object') {
      return uniqueStrings(leaders.leaders || leaders.members || []);
    }
    if (typeof leaders === 'string') return [text(leaders)];
  }
  return [];
}

function optionNames(options, ...names) {
  const values = [];
  for (const name of names) {
    const value = options && options[name];
    if (Array.isArray(value)) values.push(...value);
    else if (value instanceof Set) values.push(...Array.from(value));
    else if (typeof value === 'string') values.push(value);
  }
  return uniqueStrings(values);
}

function requestStatus(request) {
  const status = key(request && (request.status || request.state));
  if (!status) return REQUEST_PENDING;
  if (status === 'open' || status === 'outstanding') return REQUEST_PENDING;
  if (status === 'closed' || status === 'complete') return REQUEST_RESOLVED;
  if (REQUEST_STATUSES.includes(status)) return status;
  return status;
}

function requestNeedsAttention(request) {
  return Boolean(request && requestStatus(request) === REQUEST_PENDING);
}

function requestDepartment(request, options) {
  return firstText(
    departmentName(request && request.department),
    request && request.category,
    departmentForDuty(request && (request.duty || request.dutyName), options && options.dutyDepartments)
  ) || null;
}

function requestAudit(request) {
  return Array.isArray(request && request.audit)
    ? request.audit.map(event => ({ ...event }))
    : [];
}

function slug(value) {
  return text(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function requestId(requestOrServiceId, dutyValue, atValue) {
  if (typeof requestOrServiceId === 'string' && dutyValue !== undefined) {
    const at = finiteTimestamp(atValue, Date.now());
    return text(requestOrServiceId) + '_' + slug(dutyValue) + '_' + at;
  }
  if (typeof requestOrServiceId === 'string') return requestOrServiceId;
  const source = requestOrServiceId || {};
  if (source.id) return text(source.id);
  const service = source.serviceId || source.svcId || source.service || 'service';
  const duty = source.duty || source.dutyName || 'duty';
  const createdAt = finiteTimestamp(source.createdAt, Date.now());
  return text(service) + '_' + slug(duty) + '_' + createdAt;
}

function auditEntry(action, data) {
  const source = data || {};
  const timestamp = source.at !== undefined ? source.at : source.timestamp;
  return {
    ...source,
    action: text(action),
    at: finiteTimestamp(timestamp, Date.now())
  };
}

function recordRequestAudit(request, action, data) {
  return {
    ...(request || {}),
    audit: requestAudit(request).concat([auditEntry(action, data)])
  };
}

function routeRequest(request, leadersByDepartment, options) {
  if (leadersByDepartment && (leadersByDepartment.departmentLeaders ||
      leadersByDepartment.routes || leadersByDepartment.defaultScheduler)) {
    return routeChangeRequest(request, leadersByDepartment);
  }
  const routingOptions = options || {};
  const department = requestDepartment(request, routingOptions);
  const departments = department ? [department] : [];
  const leaders = department ? leadersForDepartment(leadersByDepartment, department) : [];
  const admins = optionNames(routingOptions, 'adminNames', 'admins', 'adminName');
  const allRecipients = uniqueStrings([...leaders, ...admins]);
  const actionable = requestNeedsAttention(request) && Boolean(department);
  return {
    department,
    departments,
    recipients: actionable ? allRecipients : [],
    allRecipients,
    status: requestStatus(request),
    actionable,
    unroutable: requestNeedsAttention(request) && !department
  };
}

function routeValues(value) {
  if (Array.isArray(value)) return value.map(memberName).filter(Boolean);
  if (value instanceof Set) return Array.from(value).map(memberName).filter(Boolean);
  if (value == null) return [];
  return [memberName(value)].filter(Boolean);
}

function configuredRoute(config, department) {
  const source = config || {};
  const byDepartment = source.departmentLeaders || source.leaders || source.routes || {};
  if (byDepartment instanceof Map) return routeValues(byDepartment.get(department));
  return routeValues(byDepartment[department]);
}

/* Compatibility adapter for the original config shape. New callers should
 * use routeRequest(request, leadersByDepartment, options), which keeps admin
 * recipients explicit and does not silently fall back to a global scheduler.
 */
function routeChangeRequest(request, config) {
  const source = request || {};
  const settings = config || {};
  const department = requestDepartment(source, settings) || departmentName(source);
  const requester = memberName(source.requester || source.requesterName || source.name || source.originalRequester);
  const departmentRecipients = configuredRoute(settings, department);
  const admins = optionNames(settings, 'adminNames', 'admins', 'adminName');
  let recipients = uniqueStrings([...departmentRecipients, ...admins])
    .filter(name => name !== requester);
  let route = 'department-leaders';
  if (!departmentRecipients.filter(name => name !== requester).length) {
    recipients = uniqueStrings([
      ...routeValues(settings.scheduler || settings.defaultScheduler),
      ...admins
    ]).filter(name => name !== requester);
    route = recipients.length ? 'scheduler' : 'unroutable';
  }
  return {
    requestId: requestId({ ...source, department }),
    department: department || '',
    recipients: sortedStrings(recipients),
    route,
    status: requestStatus(source)
  };
}

function createChangeRequest(input, leadersByDepartment, options) {
  const requestInput = input && typeof input === 'object' ? input : {};
  const creationOptions = options || {};
  const createdAt = finiteTimestamp(
    requestInput.createdAt,
    finiteTimestamp(creationOptions.now, Date.now())
  );
  const originalRequester = firstText(
    requestInput.originalRequester,
    requestInput.requester,
    requestInput.requestedBy
  );
  const request = {
    ...requestInput,
    id: requestId({ ...requestInput, createdAt }),
    status: REQUEST_PENDING,
    createdAt,
    originalRequester,
    audit: requestAudit(requestInput)
  };
  if (!request.audit.some(event => event && event.action === 'created')) {
    request.audit.push({
      action: 'created',
      by: originalRequester || null,
      at: createdAt
    });
  }
  const route = routeRequest(request, leadersByDepartment, creationOptions);
  if (route.department) request.department = route.department;
  return request;
}

function canTransitionRequest(from, to) {
  const current = key(from) || REQUEST_PENDING;
  const next = key(to);
  if (!REQUEST_STATUSES.includes(current) || !REQUEST_STATUSES.includes(next)) return false;
  if (current === next) return true;
  return current === REQUEST_PENDING && TERMINAL_REQUEST_STATUSES.has(next);
}

function transitionRequestStatus(request, status, options) {
  const source = request || {};
  const current = key(source.status) || REQUEST_PENDING;
  const nextStatus = key(status);
  if (!canTransitionRequest(current, nextStatus)) {
    throw new RangeError('request status cannot transition from ' + current + ' to ' + nextStatus);
  }
  if (current === nextStatus) return { ...source, audit: requestAudit(source) };

  const details = options || {};
  const at = finiteTimestamp(
    details.at !== undefined ? details.at : details.timestamp,
    Date.now()
  );
  const by = memberName(details.by || details.actor || details.resolvedBy) ||
    text(details.by || details.actor || details.resolvedBy) || 'editor';
  const next = { ...source, status: nextStatus, audit: requestAudit(source) };
  if (TERMINAL_REQUEST_STATUSES.has(nextStatus)) {
    next.resolvedAt = at;
    next.resolvedBy = by;
  }
  const audit = {
    action: 'status-changed',
    at,
    by,
    from: current,
    to: nextStatus,
    reason: text(details.reason)
  };
  next.audit.push(audit);
  return next;
}

function isOutstandingRequest(request) {
  return requestNeedsAttention(request);
}

function resolveRequest(request, resolution) {
  if (!request || typeof request !== 'object') throw new TypeError('request is required');
  if (!requestNeedsAttention(request)) return { ...request, audit: requestAudit(request) };

  const details = resolution && typeof resolution === 'object' ? resolution : {};
  const resolvedBy = firstText(details.resolvedBy, details.by);
  if (!resolvedBy) throw new TypeError('resolvedBy is required');
  const resolvedAt = finiteTimestamp(details.resolvedAt, Date.now());
  const next = {
    ...request,
    status: REQUEST_RESOLVED,
    resolvedBy,
    resolvedAt,
    audit: requestAudit(request)
  };
  if (Object.prototype.hasOwnProperty.call(details, 'notes')) next.notes = details.notes;
  const event = {
    action: 'resolved',
    by: resolvedBy,
    resolvedBy,
    at: resolvedAt,
    resolvedAt
  };
  if (Object.prototype.hasOwnProperty.call(details, 'notes')) event.notes = details.notes;
  next.audit.push(event);
  return next;
}

function conflictMember(conflict) {
  return memberName(conflict && (conflict.member || conflict.memberName || conflict.name));
}

function conflictDuties(conflict) {
  if (!conflict || typeof conflict !== 'object') return [];
  const raw = conflict.duties || conflict.dutyNames || conflict.dutiesInvolved;
  const duties = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string') duties.push(entry);
      else if (entry && typeof entry === 'object') duties.push(
        firstText(entry.duty, entry.dutyName, entry.name)
      );
    }
  }
  if (raw && !Array.isArray(raw) && typeof raw === 'object') duties.push(...Object.keys(raw));
  if (!duties.length && conflict.assignments && typeof conflict.assignments === 'object') {
    const member = key(conflictMember(conflict));
    for (const [duty, assigned] of Object.entries(conflict.assignments)) {
      if (!member || key(memberName(assigned)) === member) duties.push(duty);
    }
  }
  if (!duties.length && conflict.duty) duties.push(conflict.duty);
  return uniqueStrings(duties);
}

function dutyCategory(duty, options) {
  const settings = options || {};
  const configured = settings.dutyDepartments || settings.categories || {};
  return departmentForDuty(duty, configured);
}

function normalizedDuties(duties) {
  return sortedStrings(Array.isArray(duties) ? duties : []);
}

function conflictCompositionKey(serviceId, member, duties) {
  return JSON.stringify([
    text(serviceId),
    memberName(member),
    normalizedDuties(duties)
  ]);
}

function isPrayerDuty(duty, options) {
  const category = dutyCategory(duty, options);
  return (category === 'Worship' && /prayer/i.test(text(duty))) ||
    (!category && /prayer/i.test(text(duty)));
}

function isUsherDuty(duty, options) {
  const category = dutyCategory(duty, options);
  return category === 'Usher Sisters' || category === 'Usher Brothers' || /usher/i.test(text(duty));
}

function hasNonExemptPair(duties, options) {
  const settings = options || {};
  if (typeof settings.intentionalPair === 'function') {
    return duties.some((left, index) => duties.slice(index + 1)
      .some(right => !settings.intentionalPair(left, right)));
  }
  for (let index = 0; index < duties.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < duties.length; otherIndex += 1) {
      const prayerUsher = (isPrayerDuty(duties[index], settings) && isUsherDuty(duties[otherIndex], settings)) ||
        (isUsherDuty(duties[index], settings) && isPrayerDuty(duties[otherIndex], settings));
      if (!prayerUsher) return true;
    }
  }
  return false;
}

function composeConflicts(service, options) {
  const source = service || {};
  const settings = options || {};
  const assignments = source.assignments || source.duties || {};
  const byMember = {};
  for (const [duty, assigned] of Object.entries(assignments)) {
    const member = memberName(assigned);
    if (!member) continue;
    (byMember[member] || (byMember[member] = [])).push(duty);
  }
  const serviceId = source.serviceId || source.id || source.svcId;
  return Object.keys(byMember).filter(member => {
    const duties = normalizedDuties(byMember[member]);
    return duties.length >= 2 && hasNonExemptPair(duties, settings);
  }).map(member => {
    const duties = normalizedDuties(byMember[member]);
    const departments = sortedStrings(duties.map(duty => dutyCategory(duty, settings)).filter(Boolean));
    const compositionKey = conflictCompositionKey(serviceId, member, duties);
    return {
      serviceId: text(serviceId),
      member,
      name: member,
      duties,
      departments,
      compositionKey,
      composition: compositionKey
    };
  });
}

function conflictServiceIdentity(conflict) {
  const id = firstText(conflict && (conflict.serviceId || conflict.service || conflict.id));
  if (id) return id;
  return JSON.stringify({
    date: firstText(conflict && conflict.date),
    worship: firstText(conflict && (conflict.worship || conflict.worshipType || conflict.serviceType))
  });
}

/**
 * A stable composition key makes an acknowledgement valid only for the exact
 * service, member, and duty set that was reviewed.
 */
function conflictComposition(conflict) {
  return conflictCompositionKey(
    conflictServiceIdentity(conflict),
    conflictMember(conflict),
    conflictDuties(conflict)
  );
}

function isIntentionalPrayerUsherPair(duties) {
  const normalized = uniqueStrings(duties);
  if (normalized.length !== 2) return false;
  return normalized.some(duty => /\bprayer\b/i.test(duty)) &&
    normalized.some(duty => /\busher\b/i.test(duty));
}

function conflictAcknowledgement(conflictOrAcknowledgement) {
  if (!conflictOrAcknowledgement || typeof conflictOrAcknowledgement !== 'object') return null;
  const nested = conflictOrAcknowledgement.acknowledgement ||
    conflictOrAcknowledgement.acknowledgment ||
    conflictOrAcknowledgement.ack ||
    conflictOrAcknowledgement.conflictAck ||
    null;
  if (nested) return nested;
  if (conflictOrAcknowledgement.acknowledgedBy ||
      conflictOrAcknowledgement.acknowledgedAt !== undefined ||
      conflictOrAcknowledgement.compositionKey) {
    return conflictOrAcknowledgement;
  }
  return null;
}

function acknowledgementState(conflict, acknowledgement) {
  const candidate = conflictAcknowledgement(acknowledgement) ||
    acknowledgement || conflictAcknowledgement(conflict);
  if (!candidate || typeof candidate !== 'object') return 'none';
  const expectedComposition = conflictComposition(conflict);
  if (candidate.composition && candidate.composition !== expectedComposition) return 'stale';
  if (candidate.compositionKey && candidate.compositionKey !== expectedComposition) return 'stale';
  const candidateDuties = sortedStrings(candidate.duties || candidate.dutiesInvolved);
  const currentDuties = sortedStrings(conflictDuties(conflict));
  if (!candidateDuties.length || candidateDuties.join('\u0000') !== currentDuties.join('\u0000')) {
    return 'stale';
  }
  if (!firstText(candidate.acknowledgedBy, candidate.by) ||
      !Number.isFinite(finiteTimestamp(candidate.acknowledgedAt, NaN))) {
    return 'stale';
  }
  return 'acknowledged';
}

function isConflictAcknowledged(conflict, acknowledgement) {
  return acknowledgementState(conflict, acknowledgement) === 'acknowledged';
}

function acknowledgeConflict(conflict, details) {
  if (!conflict || typeof conflict !== 'object') throw new TypeError('conflict is required');
  const input = details && typeof details === 'object' ? details : {};
  const acknowledgedBy = firstText(input.acknowledgedBy, input.by);
  if (!acknowledgedBy) throw new TypeError('acknowledgedBy is required');
  const acknowledgedAt = finiteTimestamp(input.acknowledgedAt, Date.now());
  const duties = sortedStrings(conflictDuties(conflict));
  const acknowledgement = {
    acknowledgedBy,
    acknowledgedAt,
    duties,
    composition: conflictComposition(conflict),
    compositionKey: conflictComposition(conflict),
    serviceId: text(conflictServiceIdentity(conflict)),
    member: conflictMember(conflict)
  };
  /* Keep the flat fields for callers that persist a standalone acknowledgement
   * record, while also returning the shared nested shape for conflict state. */
  return {
    ...conflict,
    serviceId: text(conflictServiceIdentity(conflict)),
    member: conflictMember(conflict),
    duties,
    acknowledgedBy,
    acknowledgedAt,
    compositionKey: acknowledgement.compositionKey,
    acknowledgement
  };
}

function conflictStatus(conflict) {
  const status = key(conflict && conflict.status);
  return status === REQUEST_RESOLVED || status === 'closed' ? REQUEST_RESOLVED : REQUEST_PENDING;
}

function conflictNeedsAttention(conflict) {
  if (!conflict || conflictStatus(conflict) !== REQUEST_PENDING ||
      conflict.active === false || conflict.resolved === true) return false;
  const duties = conflictDuties(conflict);
  if (duties.length < 2 || isIntentionalPrayerUsherPair(duties)) return false;
  if (conflict.acknowledged === true && !conflictAcknowledgement(conflict)) return false;
  return !isConflictAcknowledged(conflict);
}

function conflictDepartments(conflict, dutyDepartments) {
  const explicit = conflict && (conflict.departments || conflict.departmentNames || conflict.department);
  const explicitDepartments = Array.isArray(explicit)
    ? uniqueStrings(explicit)
    : uniqueStrings([explicit]);
  return explicitDepartments.length
    ? explicitDepartments
    : departmentsForDuties(conflictDuties(conflict), dutyDepartments);
}

function routeConflict(conflict, leadersByDepartment, options) {
  if (leadersByDepartment && (leadersByDepartment.departmentLeaders ||
      leadersByDepartment.leaders || leadersByDepartment.routes ||
      leadersByDepartment.scheduler || leadersByDepartment.defaultScheduler)) {
    return routeLegacyConflict(conflict, leadersByDepartment);
  }
  const routingOptions = options || {};
  const departments = conflictDepartments(conflict, routingOptions.dutyDepartments);
  const leaders = departments.flatMap(department => leadersForDepartment(leadersByDepartment, department));
  const admins = optionNames(routingOptions, 'adminNames', 'admins', 'adminName');
  const allRecipients = uniqueStrings([...leaders, ...admins]);
  const actionable = conflictNeedsAttention(conflict);
  return {
    departments,
    recipients: actionable ? allRecipients : [],
    allRecipients,
    composition: conflictComposition(conflict),
    acknowledgement: conflictAcknowledgement(conflict),
    acknowledgementState: acknowledgementState(conflict),
    actionable
  };
}

function routeLegacyConflict(conflict, config) {
  const source = conflict || {};
  const settings = config || {};
  const departments = sortedStrings(
    source.departments || [source.department].filter(Boolean)
  );
  const departmentRecipients = departments.flatMap(department => configuredRoute(settings, department));
  const member = memberName(source.member || source.name);
  const admins = optionNames(settings, 'adminNames', 'admins', 'adminName');
  let recipients = uniqueStrings([...departmentRecipients, ...admins])
    .filter(name => name !== member);
  let route = 'department-leaders';
  if (!departmentRecipients.filter(name => name !== member).length) {
    recipients = uniqueStrings([
      ...routeValues(settings.scheduler || settings.defaultScheduler),
      ...admins
    ]).filter(name => name !== member);
    route = recipients.length ? 'scheduler' : 'unroutable';
  }
  return {
    serviceId: text(source.serviceId || source.svcId),
    member,
    departments,
    recipients: sortedStrings(recipients),
    route
  };
}

function conflictAcknowledgementValid(acknowledgement, conflict) {
  if (!acknowledgement || !conflict) return false;
  const candidate = conflictAcknowledgement(acknowledgement) || acknowledgement;
  const expected = conflictComposition(conflict);
  if (candidate.composition === expected || candidate.compositionKey === expected) return true;
  const serviceId = conflictServiceIdentity(conflict);
  const candidateServiceId = firstText(candidate.serviceId, candidate.svcId) ||
    conflictServiceIdentity(candidate);
  return text(candidateServiceId) === text(serviceId) &&
    memberName(candidate.member || candidate.name) === conflictMember(conflict) &&
    JSON.stringify(normalizedDuties(candidate.duties || candidate.dutiesInvolved)) ===
      JSON.stringify(normalizedDuties(conflictDuties(conflict)));
}

function invalidateConflictAcknowledgements(acknowledgements, conflicts) {
  const current = Array.isArray(conflicts) ? conflicts : [];
  if (Array.isArray(acknowledgements)) {
    return acknowledgements.filter(ack => current.some(conflict => (
      conflictAcknowledgementValid(ack, conflict)
    )));
  }
  const source = acknowledgements || {};
  const result = {};
  for (const [member, duties] of Object.entries(source)) {
    const conflict = current.find(item => conflictMember(item) === memberName(member));
    if (conflict && JSON.stringify(normalizedDuties(duties)) ===
        JSON.stringify(normalizedDuties(conflictDuties(conflict)))) {
      result[member] = normalizedDuties(duties);
    }
  }
  return result;
}

function activeConflicts(conflicts, acknowledgements) {
  const current = Array.isArray(conflicts) ? conflicts : [];
  return current.filter(conflict => {
    if (Array.isArray(acknowledgements) && acknowledgements.some(ack => (
      conflictAcknowledgementValid(ack, conflict)
    ))) return false;
    if (!Array.isArray(acknowledgements)) {
      const valid = invalidateConflictAcknowledgements(acknowledgements || {}, [conflict]);
      if (valid[conflictMember(conflict)]) return false;
    }
    if (conflict.active === false || conflict.resolved === true || conflict.acknowledged === true) {
      return false;
    }
    const duties = conflictDuties(conflict);
    return !isIntentionalPrayerUsherPair(duties);
  });
}

function conflictIdentity(conflict) {
  const id = firstText(conflict && conflict.id, conflict && conflict.conflictId);
  return id || conflictComposition(conflict);
}

function requestIdentity(request) {
  const id = firstText(request && request.id, request && request.requestId);
  if (id) return id;
  return JSON.stringify({
    serviceId: firstText(request && request.serviceId, request && request.service),
    duty: firstText(request && (request.duty || request.dutyName)),
    requester: firstText(request && (request.originalRequester || request.requester))
  });
}

function hasDepartmentAuthorization(item, departments, context, type) {
  const specific = type === 'request' ? context.canManageRequest : context.canManageConflict;
  if (typeof specific === 'function') return Boolean(specific(item, departments));
  if (typeof context.isAuthorized === 'function') return Boolean(context.isAuthorized(item, departments, type));

  const authorization = context.authorization && typeof context.authorization === 'object'
    ? context.authorization
    : {};
  const authorizationSpecific = type === 'request'
    ? authorization.canManageRequest
    : authorization.canManageConflict;
  if (typeof authorizationSpecific === 'function') {
    return Boolean(authorizationSpecific(item, departments));
  }
  if (typeof authorization.canManage === 'function') {
    return Boolean(authorization.canManage(item, departments, type));
  }
  if (authorization.all === true || authorization.admin === true || context.allDepartments === true) {
    return true;
  }

  const allowed = context.authorizedDepartments || context.departments || authorization.departments;
  if (allowed instanceof Set) {
    const allowedKeys = new Set(Array.from(allowed).map(value => key(value)));
    return departments.some(department => allowedKeys.has(key(department)));
  }
  if (Array.isArray(allowed)) {
    const allowedKeys = new Set(allowed.map(value => key(value)));
    return departments.some(department => allowedKeys.has(key(department)));
  }
  return false;
}

function incrementDepartmentCounts(byDepartment, departments, type) {
  for (const department of departments) {
    const existing = byDepartment[department] || { requests: 0, conflicts: 0 };
    existing[type] += 1;
    byDepartment[department] = existing;
  }
}

function formatActionableAlert(counts) {
  const parts = [];
  if (counts.requests) parts.push(`${counts.requests} request${counts.requests === 1 ? '' : 's'}`);
  if (counts.conflicts) parts.push(`${counts.conflicts} conflict${counts.conflicts === 1 ? '' : 's'}`);
  if (!parts.length) return '';
  const total = (counts.requests || 0) + (counts.conflicts || 0);
  return `${parts.join(' and ')} ${total === 1 ? 'needs' : 'need'} your attention`;
}

/**
 * Count only pending requests and unacknowledged conflicts visible to the
 * supplied authorization snapshot. Missing authorization fails closed.
 */
function actionableCounts(input, leadersByDepartment, options) {
  const context = input && typeof input === 'object' ? input : {};
  const routingOptions = {
    ...(options || {}),
    ...(context.routing || {})
  };
  const leaders = leadersByDepartment || context.leadersByDepartment || routingOptions.leadersByDepartment;
  const requests = Array.isArray(context.requests) ? context.requests : [];
  const conflicts = Array.isArray(context.conflicts) ? context.conflicts : [];
  const byDepartment = {};
  const seenRequests = new Set();
  const seenConflicts = new Set();
  let requestCount = 0;
  let conflictCount = 0;

  for (const request of requests) {
    const identity = requestIdentity(request);
    if (seenRequests.has(identity)) continue;
    seenRequests.add(identity);
    if (!requestNeedsAttention(request)) continue;
    const route = routeRequest(request, leaders, routingOptions);
    if (!hasDepartmentAuthorization(request, route.departments, context, 'request')) continue;
    requestCount += 1;
    incrementDepartmentCounts(byDepartment, route.departments, 'requests');
  }

  for (const conflict of conflicts) {
    const identity = conflictIdentity(conflict);
    if (seenConflicts.has(identity)) continue;
    seenConflicts.add(identity);
    if (!conflictNeedsAttention(conflict)) continue;
    const route = routeConflict(conflict, leaders, routingOptions);
    if (!hasDepartmentAuthorization(conflict, route.departments, context, 'conflict')) continue;
    conflictCount += 1;
    incrementDepartmentCounts(byDepartment, route.departments, 'conflicts');
  }

  const result = {
    requests: requestCount,
    conflicts: conflictCount,
    total: requestCount + conflictCount,
    byDepartment
  };
  return { ...result, message: formatActionableAlert(result) };
}

function itemKind(item, fallback) {
  const kind = text(item && (item.kind || item.type || item.workflow));
  if (kind) return kind;
  if (item && Object.prototype.hasOwnProperty.call(item, 'duties')) return 'conflict';
  if (item && Object.prototype.hasOwnProperty.call(item, 'status')) return 'request';
  return fallback || 'item';
}

function itemDepartment(item) {
  return text(item && (item.department || item.category ||
    (Array.isArray(item.departments) && item.departments[0])));
}

function defaultAuthorized(item, viewer) {
  const person = viewer || {};
  const role = text(person.role || person.access).toLocaleLowerCase();
  if (['admin', 'coordinator', 'scheduler', 'editor'].includes(role)) return true;
  const viewerName = memberName(person);
  const owner = memberName(item && (
    item.requester || item.requesterName || item.originalRequester || item.name || item.member
  ));
  if (viewerName && owner && viewerName === owner) return true;
  const departments = person.departments || person.department || [];
  const visibleDepartments = Array.isArray(departments) ? departments : [departments];
  const itemDept = itemDepartment(item);
  return Boolean(itemDept) && visibleDepartments.map(text).includes(itemDept);
}

function itemIsOutstanding(item) {
  const kind = itemKind(item);
  if (kind === 'request') return isOutstandingRequest(item);
  if (kind === 'conflict') {
    if (conflictDuties(item).length >= 2) return conflictNeedsAttention(item);
    return item.active !== false && item.resolved !== true && item.acknowledged !== true;
  }
  return Boolean(item && item.outstanding !== false && item.resolved !== true);
}

/* Legacy aggregate used by the existing Manage surface. It accepts either a
 * flat item list or an object with requests/conflicts and keeps authorization
 * outside the data transformation. */
function aggregateAuthorizedOutstanding(input, viewer, options) {
  const settings = options || {};
  let source = input;
  let person = viewer;
  if (!Array.isArray(input) && input && typeof input === 'object' &&
      (input.requests || input.conflicts || input.items)) {
    source = (input.items || []).concat(input.requests || [], input.conflicts || []);
    person = viewer || input.viewer;
  }
  const items = Array.isArray(source) ? source : [];
  const authorize = typeof settings.authorize === 'function' ? settings.authorize : defaultAuthorized;
  const visible = items.filter(item => itemIsOutstanding(item) && authorize(item, person || {}));
  const byKind = {};
  const byDepartment = {};
  const byStatus = {};
  for (const item of visible) {
    const kind = itemKind(item);
    const department = itemDepartment(item) || 'unassigned';
    const status = text(item.status) || 'active';
    byKind[kind] = (byKind[kind] || 0) + 1;
    byDepartment[department] = (byDepartment[department] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  return {
    total: visible.length,
    count: visible.length,
    byKind,
    byDepartment,
    byStatus
  };
}

function authorizedOutstandingCount(input, viewer, options) {
  return aggregateAuthorizedOutstanding(input, viewer, options).total;
}

const api = {
  MEMBERSHIP_ACTIVE,
  MEMBERSHIP_ARCHIVED,
  MEMBERSHIP_STATUSES,
  REQUEST_PENDING,
  REQUEST_APPROVED,
  REQUEST_DECLINED,
  REQUEST_CANCELLED,
  REQUEST_RESOLVED,
  REQUEST_STATUSES,
  DEFAULT_DUTY_DEPARTMENTS,
  membershipRecords,
  normalizeMemberships: membershipRecords,
  departmentMemberships,
  departmentMembers,
  activeDepartmentMembers,
  archivedDepartmentMembers,
  getActiveDepartmentMembers: activeDepartmentMembers,
  getArchivedDepartmentMembers: archivedDepartmentMembers,
  upsertDepartmentMembership,
  setDepartmentMembership: upsertDepartmentMembership,
  setDepartmentMembershipStatus,
  archiveDepartmentMember,
  archiveDepartmentMembership,
  reactivateDepartmentMember,
  restoreDepartmentMembership,
  removeDepartmentMembership,
  membershipsForMember,
  membersForDepartment,
  activeMembersForDepartment,
  membershipState,
  isActiveDepartmentMember,
  departmentForDuty,
  departmentsForDuties,
  requestId,
  requestStatus,
  requestNeedsAttention,
  requestAudit,
  recordRequestAudit,
  routeRequest,
  routeChangeRequest,
  createChangeRequest,
  createRequest: createChangeRequest,
  resolveRequest,
  canTransitionRequest,
  transitionRequestStatus,
  isOutstandingRequest,
  conflictDuties,
  normalizedDuties,
  conflictCompositionKey,
  conflictComposition,
  composeConflicts,
  conflictAcknowledgement,
  acknowledgementState,
  isConflictAcknowledged,
  acknowledgeConflict,
  acknowledgeSharedConflict: acknowledgeConflict,
  conflictAcknowledgementValid,
  isConflictAcknowledgementValid: conflictAcknowledgementValid,
  invalidateConflictAcknowledgements,
  invalidateSharedAcknowledgements: invalidateConflictAcknowledgements,
  activeConflicts,
  isIntentionalPrayerUsherPair,
  conflictStatus,
  conflictNeedsAttention,
  conflictDepartments,
  routeConflict,
  routeConflicts: routeConflict,
  actionableCounts,
  authorizedActionableCounts: actionableCounts,
  formatActionableAlert,
  aggregateAuthorizedOutstanding,
  authorizedOutstandingCount
};

module.exports = api;
