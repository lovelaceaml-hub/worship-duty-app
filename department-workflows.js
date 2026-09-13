'use strict';

/*
 * Pure department workflow helpers.
 *
 * The browser app currently stores department rosters as arrays.  These
 * helpers accept that legacy shape as well as the audit-friendly membership
 * record shape used by the authorization work.  No function in this module
 * mutates its input.
 */

const MEMBERSHIP_ACTIVE = 'active';
const MEMBERSHIP_ARCHIVED = 'archived';
const MEMBERSHIP_STATUSES = [MEMBERSHIP_ACTIVE, MEMBERSHIP_ARCHIVED];

const REQUEST_PENDING = 'pending';
const REQUEST_APPROVED = 'approved';
const REQUEST_DECLINED = 'declined';
const REQUEST_CANCELLED = 'cancelled';
const REQUEST_STATUSES = [REQUEST_PENDING, REQUEST_APPROVED, REQUEST_DECLINED, REQUEST_CANCELLED];

const TERMINAL_REQUEST_STATUSES = new Set([
  REQUEST_APPROVED,
  REQUEST_DECLINED,
  REQUEST_CANCELLED
]);

function text(value) {
  return String(value == null ? '' : value).trim();
}

function unique(values) {
  return Array.from(new Set((values || []).map(text).filter(Boolean)));
}

function sortedUnique(values) {
  return unique(values).sort((a, b) => a.localeCompare(b));
}

function providedTime(value) {
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

function memberName(value) {
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (!value || typeof value !== 'object') return '';
  return text(value.member || value.name || value.memberName || value.memberId);
}

function departmentName(value) {
  if (typeof value === 'string') return text(value);
  if (!value || typeof value !== 'object') return '';
  return text(value.department || value.category || value.departmentName);
}

function membershipStatus(value, fallback) {
  const status = text(value).toLowerCase();
  return MEMBERSHIP_STATUSES.includes(status) ? status : fallback;
}

function pushMembership(records, department, value, status, extra) {
  const member = memberName(value);
  const dept = text(department) || departmentName(value);
  if (!member || !dept) return;

  const source = value && typeof value === 'object' ? value : {};
  records.push(Object.assign({}, source, extra || {}, {
    department: dept,
    member,
    status: membershipStatus(source.status, status)
  }));
}

function expandDepartmentValue(records, department, value, status) {
  if (Array.isArray(value)) {
    value.forEach(item => pushMembership(records, department, item, status));
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value.active) || Array.isArray(value.archived)) {
    expandDepartmentValue(records, department, value.active || [], MEMBERSHIP_ACTIVE);
    expandDepartmentValue(records, department, value.archived || [], MEMBERSHIP_ARCHIVED);
    return;
  }
  if (value.member || value.name || value.memberName || value.memberId) {
    pushMembership(records, department, value, status);
  }
}

/* Convert legacy roster maps or record arrays into one stable record list. */
function normalizeMemberships(source) {
  const records = [];
  if (Array.isArray(source)) {
    source.forEach(item => {
      if (item && typeof item === 'object' && (item.member || item.name || item.memberName || item.memberId)) {
        pushMembership(records, item.department || item.category, item,
          membershipStatus(item.status, MEMBERSHIP_ACTIVE));
      }
    });
    return records;
  }
  if (!source || typeof source !== 'object') return records;

  if (source.active && typeof source.active === 'object') {
    Object.keys(source.active).forEach(dept => {
      expandDepartmentValue(records, dept, source.active[dept], MEMBERSHIP_ACTIVE);
    });
  }
  if (source.archived && typeof source.archived === 'object') {
    Object.keys(source.archived).forEach(dept => {
      expandDepartmentValue(records, dept, source.archived[dept], MEMBERSHIP_ARCHIVED);
    });
  }
  if (source.active || source.archived) return records;

  Object.keys(source).forEach(dept => {
    expandDepartmentValue(records, dept, source[dept], MEMBERSHIP_ACTIVE);
  });
  return records;
}

function membershipKey(department, member) {
  return text(department) + '\u0000' + text(member);
}

function departmentMemberships(source, department, status) {
  const wantedDepartment = text(department);
  const wantedStatus = membershipStatus(status, MEMBERSHIP_ACTIVE);
  return normalizeMemberships(source).filter(record =>
    record.department === wantedDepartment && record.status === wantedStatus
  );
}

function departmentMembers(source, department, status) {
  return sortedUnique(departmentMemberships(source, department, status).map(record => record.member));
}

function activeDepartmentMembers(source, department) {
  return departmentMembers(source, department, MEMBERSHIP_ACTIVE);
}

function archivedDepartmentMembers(source, department) {
  return departmentMembers(source, department, MEMBERSHIP_ARCHIVED);
}

function isActiveDepartmentMember(source, department, member) {
  return activeDepartmentMembers(source, department).includes(memberName(member));
}

function setDepartmentMembershipStatus(source, department, member, status, metadata) {
  const wantedDepartment = text(department);
  const wantedMember = memberName(member);
  const wantedStatus = membershipStatus(status, '');
  if (!wantedDepartment || !wantedMember || !wantedStatus) {
    throw new TypeError('department, member, and a valid membership status are required');
  }

  const records = normalizeMemberships(source);
  const key = membershipKey(wantedDepartment, wantedMember);
  let found = false;
  const next = records.map(record => {
    if (membershipKey(record.department, record.member) !== key) return Object.assign({}, record);
    found = true;
    const updated = Object.assign({}, record, metadata || {}, {
      department: wantedDepartment,
      member: wantedMember,
      status: wantedStatus
    });
    if (wantedStatus === MEMBERSHIP_ARCHIVED) {
      updated.archivedAt = updated.archivedAt !== undefined
        ? updated.archivedAt : providedTime(metadata && metadata.at);
      if (metadata && metadata.by) updated.archivedBy = metadata.by;
    } else if (metadata && metadata.at !== undefined) {
      updated.restoredAt = metadata.at;
      if (metadata.by) updated.restoredBy = metadata.by;
    }
    return updated;
  });

  if (!found) {
    const record = { department: wantedDepartment, member: wantedMember, status: wantedStatus };
    if (metadata && typeof metadata === 'object') Object.assign(record, metadata);
    if (wantedStatus === MEMBERSHIP_ARCHIVED) {
      record.archivedAt = record.archivedAt !== undefined
        ? record.archivedAt : providedTime(metadata && metadata.at);
      if (metadata && metadata.by) record.archivedBy = metadata.by;
    }
    next.push(record);
  }
  return next;
}

/* Removing someone from a department is an archival action, never a global
 * member deletion.  The caller keeps its separate member list unchanged. */
function archiveDepartmentMembership(source, department, member, metadata) {
  return setDepartmentMembershipStatus(source, department, member, MEMBERSHIP_ARCHIVED, metadata);
}

function restoreDepartmentMembership(source, department, member, metadata) {
  return setDepartmentMembershipStatus(source, department, member, MEMBERSHIP_ACTIVE, metadata);
}

function removeDepartmentMembership(source, department, member, metadata) {
  return archiveDepartmentMembership(source, department, member, metadata);
}

function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function requestId(requestOrServiceId, dutyValue, atValue) {
  if (typeof requestOrServiceId === 'string' && dutyValue !== undefined) {
    const at = Number.isFinite(Number(atValue)) ? Number(atValue) : Date.now();
    return text(requestOrServiceId) + '_' + slug(dutyValue) + '_' + at;
  }
  if (typeof requestOrServiceId === 'string') return requestOrServiceId;
  const source = requestOrServiceId || {};
  if (source.id) return text(source.id);
  const service = source.serviceId || source.svcId || source.service || 'service';
  const duty = source.duty || 'duty';
  const createdAt = Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : Date.now();
  return text(service) + '_' + slug(duty) + '_' + createdAt;
}

function auditEntry(action, data) {
  const source = data || {};
  const timestamp = source.at !== undefined ? source.at : source.timestamp;
  return Object.assign({}, source, {
    action: text(action),
    at: providedTime(timestamp)
  });
}

function recordRequestAudit(request, action, data) {
  const entry = auditEntry(action, data);
  const existing = Array.isArray(request && request.audit) ? request.audit : [];
  return Object.assign({}, request, { audit: existing.concat([entry]) });
}

function routeValues(value) {
  if (Array.isArray(value)) return value.map(memberName).filter(Boolean);
  if (value == null) return [];
  return [memberName(value)].filter(Boolean);
}

function configuredRoute(config, department) {
  const source = config || {};
  const byDepartment = source.departmentLeaders || source.leaders || source.routes || {};
  return routeValues(byDepartment[department]);
}

function routeChangeRequest(request, config) {
  const source = request || {};
  const department = text(source.department || source.category);
  const requester = memberName(source.requester || source.requesterName || source.name);
  const departmentRecipients = configuredRoute(config, department);
  let recipients = departmentRecipients;
  if (!recipients.filter(name => name !== requester).length) {
    recipients = routeValues((config || {}).scheduler || (config || {}).defaultScheduler);
  }
  recipients = sortedUnique(recipients.filter(name => name !== requester));
  return {
    requestId: requestId(source),
    department,
    recipients,
    route: recipients.length && departmentRecipients.filter(name => name !== requester).length
      ? 'department-leaders' : 'scheduler',
    status: text(source.status) || REQUEST_PENDING
  };
}

function createChangeRequest(input) {
  const source = Object.assign({}, input || {});
  const createdAt = Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : Date.now();
  const request = Object.assign({}, source, {
    id: requestId(Object.assign({}, source, { createdAt })),
    status: REQUEST_PENDING,
    createdAt
  });
  return recordRequestAudit(request, 'created', {
    at: createdAt,
    by: source.requester || source.requesterName || source.name || ''
  });
}

function canTransitionRequest(from, to) {
  const current = text(from) || REQUEST_PENDING;
  const next = text(to);
  if (!REQUEST_STATUSES.includes(current) || !REQUEST_STATUSES.includes(next)) return false;
  if (current === next) return true;
  return current === REQUEST_PENDING && TERMINAL_REQUEST_STATUSES.has(next);
}

function transitionRequestStatus(request, status, options) {
  const source = request || {};
  const current = text(source.status) || REQUEST_PENDING;
  const nextStatus = text(status);
  if (!canTransitionRequest(current, nextStatus)) {
    throw new RangeError('request status cannot transition from ' + current + ' to ' + nextStatus);
  }
  if (current === nextStatus) return Object.assign({}, source, { audit: (source.audit || []).slice() });

  const meta = options || {};
  const timestamp = meta.at !== undefined ? meta.at : meta.timestamp;
  const at = providedTime(timestamp);
  const next = Object.assign({}, source, { status: nextStatus });
  if (TERMINAL_REQUEST_STATUSES.has(nextStatus)) {
    next.resolvedAt = at;
    next.resolvedBy = memberName(meta.by || meta.actor || meta.resolvedBy) || 'editor';
  }
  return recordRequestAudit(next, 'status-changed', {
    at,
    by: meta.by || meta.actor || meta.resolvedBy || 'editor',
    from: current,
    to: nextStatus,
    reason: text(meta.reason)
  });
}

function isOutstandingRequest(request) {
  return text(request && request.status || REQUEST_PENDING) === REQUEST_PENDING;
}

function dutyCategory(duty, options) {
  const source = options || {};
  const map = source.dutyDepartments || source.categories || {};
  return text(map[duty]);
}

function normalizedDuties(duties) {
  return unique(Array.isArray(duties) ? duties : []).sort((a, b) => a.localeCompare(b));
}

function conflictCompositionKey(serviceId, member, duties) {
  return JSON.stringify([text(serviceId), memberName(member), normalizedDuties(duties)]);
}

function isPrayerDuty(duty, options) {
  const category = dutyCategory(duty, options);
  return category === 'Worship' && /prayer/i.test(duty) || (!category && /prayer/i.test(duty));
}

function isUsherDuty(duty, options) {
  const category = dutyCategory(duty, options);
  return category === 'Usher Sisters' || category === 'Usher Brothers' || /usher/i.test(duty);
}

function hasNonExemptPair(duties, options) {
  const source = options || {};
  if (typeof source.intentionalPair === 'function') {
    return duties.some((left, i) => duties.slice(i + 1).some(right => !source.intentionalPair(left, right)));
  }
  for (let i = 0; i < duties.length; i++) {
    for (let j = i + 1; j < duties.length; j++) {
      const prayerUsher = (isPrayerDuty(duties[i], source) && isUsherDuty(duties[j], source)) ||
        (isUsherDuty(duties[i], source) && isPrayerDuty(duties[j], source));
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
  Object.keys(assignments).forEach(duty => {
    const member = memberName(assignments[duty]);
    if (!member) return;
    (byMember[member] || (byMember[member] = [])).push(duty);
  });
  const serviceId = source.serviceId || source.id || source.svcId;
  return Object.keys(byMember).filter(member => {
    const duties = normalizedDuties(byMember[member]);
    return duties.length >= 2 && hasNonExemptPair(duties, settings);
  }).map(member => {
    const duties = normalizedDuties(byMember[member]);
    const departments = sortedUnique(duties.map(duty => dutyCategory(duty, settings)).filter(Boolean));
    return {
      serviceId: text(serviceId),
      member,
      name: member,
      duties,
      departments,
      compositionKey: conflictCompositionKey(serviceId, member, duties)
    };
  });
}

function acknowledgeConflict(conflict, metadata) {
  const source = conflict || {};
  const meta = metadata || {};
  const duties = normalizedDuties(source.duties);
  const timestamp = meta.at !== undefined ? meta.at : meta.timestamp;
  const at = providedTime(timestamp);
  return {
    serviceId: text(source.serviceId || source.svcId),
    member: memberName(source.member || source.name),
    duties,
    compositionKey: conflictCompositionKey(source.serviceId || source.svcId, source.member || source.name, duties),
    acknowledgedAt: at,
    acknowledgedBy: memberName(meta.by || meta.actor) || 'editor'
  };
}

function conflictAcknowledgementValid(acknowledgement, conflict) {
  if (!acknowledgement || !conflict) return false;
  const serviceId = conflict.serviceId || conflict.svcId;
  const member = conflict.member || conflict.name;
  const key = conflictCompositionKey(serviceId, member, conflict.duties);
  return (acknowledgement.compositionKey === key) || (
    text(acknowledgement.serviceId || acknowledgement.svcId) === text(serviceId) &&
    memberName(acknowledgement.member || acknowledgement.name) === memberName(member) &&
    JSON.stringify(normalizedDuties(acknowledgement.duties)) === JSON.stringify(normalizedDuties(conflict.duties))
  );
}

function invalidateConflictAcknowledgements(acknowledgements, conflicts) {
  const current = Array.isArray(conflicts) ? conflicts : [];
  if (Array.isArray(acknowledgements)) {
    return acknowledgements.filter(ack => current.some(conflict => conflictAcknowledgementValid(ack, conflict)));
  }
  const source = acknowledgements || {};
  const result = {};
  Object.keys(source).forEach(member => {
    const conflict = current.find(item => memberName(item.member || item.name) === memberName(member));
    if (conflict && JSON.stringify(normalizedDuties(source[member])) === JSON.stringify(normalizedDuties(conflict.duties))) {
      result[member] = normalizedDuties(source[member]);
    }
  });
  return result;
}

function activeConflicts(conflicts, acknowledgements) {
  const current = Array.isArray(conflicts) ? conflicts : [];
  if (Array.isArray(acknowledgements)) {
    return current.filter(conflict => !acknowledgements.some(ack => conflictAcknowledgementValid(ack, conflict)));
  }
  const valid = invalidateConflictAcknowledgements(acknowledgements || {}, current);
  return current.filter(conflict => {
    const member = memberName(conflict.member || conflict.name);
    return !valid[member] || JSON.stringify(normalizedDuties(valid[member])) !== JSON.stringify(normalizedDuties(conflict.duties));
  });
}

function routeConflict(conflict, config) {
  const source = conflict || {};
  const settings = config || {};
  const departments = sortedUnique(source.departments || [source.department].filter(Boolean));
  const departmentRecipients = departments.flatMap(department => configuredRoute(settings, department));
  let recipients = departmentRecipients;
  const member = memberName(source.member || source.name);
  if (!recipients.filter(name => name !== member).length) {
    recipients = routeValues(settings.scheduler || settings.defaultScheduler);
  }
  recipients = sortedUnique(recipients.filter(name => name !== member));
  return {
    serviceId: text(source.serviceId || source.svcId),
    member,
    departments,
    recipients,
    route: recipients.length && departmentRecipients.filter(name => name !== member).length
      ? 'department-leaders' : 'scheduler'
  };
}

function itemKind(item, fallback) {
  const kind = text(item && (item.kind || item.type || item.workflow));
  if (kind) return kind;
  if (item && Object.prototype.hasOwnProperty.call(item, 'duties')) return 'conflict';
  if (item && Object.prototype.hasOwnProperty.call(item, 'status')) return 'request';
  return fallback || 'item';
}

function itemDepartment(item) {
  return text(item && (item.department || item.category || (item.departments && item.departments[0])));
}

function defaultAuthorized(item, viewer) {
  const person = viewer || {};
  const role = text(person.role || person.access).toLowerCase();
  if (['admin', 'coordinator', 'scheduler', 'editor'].includes(role)) return true;
  const viewerName = memberName(person);
  const owner = memberName(item && (item.requester || item.requesterName || item.name || item.member));
  if (viewerName && owner && viewerName === owner) return true;
  const departments = person.departments || person.department || [];
  const visibleDepartments = Array.isArray(departments) ? departments : [departments];
  return !!itemDepartment(item) && visibleDepartments.map(text).includes(itemDepartment(item));
}

function itemIsOutstanding(item) {
  const kind = itemKind(item);
  if (kind === 'request') return isOutstandingRequest(item);
  if (kind === 'conflict') return item.active !== false && item.resolved !== true && item.acknowledged !== true;
  return item && item.outstanding !== false && item.resolved !== true;
}

/*
 * Count only outstanding records the viewer may see.  The result is an
 * aggregate, not a raw cross-department feed, so an unauthorized viewer never
 * learns another department's count.
 */
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
  visible.forEach(item => {
    const kind = itemKind(item);
    const department = itemDepartment(item) || 'unassigned';
    const status = text(item.status) || 'active';
    byKind[kind] = (byKind[kind] || 0) + 1;
    byDepartment[department] = (byDepartment[department] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
  });
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

module.exports = {
  MEMBERSHIP_ACTIVE,
  MEMBERSHIP_ARCHIVED,
  MEMBERSHIP_STATUSES,
  REQUEST_PENDING,
  REQUEST_APPROVED,
  REQUEST_DECLINED,
  REQUEST_CANCELLED,
  REQUEST_STATUSES,
  normalizeMemberships,
  departmentMemberships,
  departmentMembers,
  activeDepartmentMembers,
  archivedDepartmentMembers,
  getActiveDepartmentMembers: activeDepartmentMembers,
  getArchivedDepartmentMembers: archivedDepartmentMembers,
  isActiveDepartmentMember,
  setDepartmentMembershipStatus,
  archiveDepartmentMembership,
  restoreDepartmentMembership,
  removeDepartmentMembership,
  requestId,
  createChangeRequest,
  recordRequestAudit,
  routeChangeRequest,
  routeRequest: routeChangeRequest,
  canTransitionRequest,
  transitionRequestStatus,
  isOutstandingRequest,
  normalizedDuties,
  conflictCompositionKey,
  composeConflicts,
  acknowledgeConflict,
  acknowledgeSharedConflict: acknowledgeConflict,
  conflictAcknowledgementValid,
  isConflictAcknowledgementValid: conflictAcknowledgementValid,
  invalidateConflictAcknowledgements,
  invalidateSharedAcknowledgements: invalidateConflictAcknowledgements,
  activeConflicts,
  routeConflict,
  aggregateAuthorizedOutstanding,
  authorizedOutstandingCount
};
