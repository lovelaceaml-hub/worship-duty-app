'use strict';

/*
 * Pure history-seed planning for department profiles.
 *
 * The planner accepts either flat assignment evidence or the schedule shape
 * already used by the Worship Duty app.  It only returns a deterministic
 * preview and profile suggestions.  Applying those suggestions still goes
 * through department-profile.js, where member and leader decisions are
 * protected from later imports.
 */

const {
  HISTORY_SEED_SOURCE,
  PROFILE_ROLE_LEADER,
  PROFILE_ROLE_MEMBER,
  PROFILE_STATUS_ACTIVE,
  createDepartmentProfile,
  mergeHistorySeed,
  profileIdFor
} = require('./department-profile.js');

const DEFAULT_DUTY_DEPARTMENTS = Object.freeze({
  Presider: 'Worship',
  Sermon: 'Worship',
  'Prayer of Thanks': 'Worship',
  'Closing Prayer': 'Worship',
  Prayer: 'Worship',
  'Opening Prayer': 'Worship',
  'Usher Door': 'Usher Sisters',
  'Usher Front': 'Usher Sisters',
  'Usher Back': 'Usher Sisters',
  'Usher #1': 'Usher Brothers',
  'Usher #2': 'Usher Brothers',
  'Lobby Security': 'Usher Brothers',
  'Lobby Desk #1': 'Lobby',
  'Lobby Desk #2': 'Lobby',
  'Translation #1': 'Translation',
  'Translation #2': 'Translation',
  'Media Booth #1': 'Media',
  'Media Booth #2': 'Media',
  'Media Booth': 'Media',
  'Parking #1': 'Parking Lot',
  'Parking #2': 'Parking Lot',
  'Parking #3': 'Parking Lot',
  'Parking #4': 'Parking Lot',
  'Parking #5': 'Parking Lot',
  'Parking Lot': 'Parking Lot',
  'Offering #1': 'Offering',
  'Offering #2': 'Offering',
  'Offering #3': 'Offering',
  'Offering #4': 'Offering',
  'Offering #5': 'Offering',
  'Offering #6': 'Offering',
  Offering: 'Offering'
});

const DUTY_PREFIX_RULES = Object.freeze([
  [/^translation(?:\s|#|-|$)/i, 'Translation'],
  [/^usher\s+sisters?(?:\s|#|-|$)/i, 'Usher Sisters'],
  [/^usher\s+brothers?(?:\s|#|-|$)/i, 'Usher Brothers'],
  [/^usher\s+#/i, 'Usher Brothers'],
  [/^lobby(?:\s|#|-|$)/i, 'Lobby'],
  [/^media(?:\s|#|-|$)/i, 'Media'],
  [/^parking(?:\s+lot)?(?:\s|#|-|$)/i, 'Parking Lot'],
  [/^offering(?:\s|#|-|$)/i, 'Offering'],
  [/^(?:presider|sermon|opening\s+prayer|closing\s+prayer|prayer)(?:\s|#|-|$)/i, 'Worship']
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value, options = {}) {
  const { required = false, max = 160 } = options;
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return '';
  }
  return normalized;
}

function date(value) {
  const normalized = text(value, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? normalized
    : '';
}

function identity(value) {
  return value.toLocaleLowerCase();
}

function mapDutyDepartment(duty, dutyDepartments = DEFAULT_DUTY_DEPARTMENTS) {
  const normalizedDuty = text(duty, { required: true, max: 100 });
  if (!normalizedDuty) return '';
  const entries = isPlainObject(dutyDepartments) ? Object.entries(dutyDepartments) : [];
  const exact = entries.find(([knownDuty]) => identity(text(knownDuty)) === identity(normalizedDuty));
  if (exact) return text(exact[1], { required: true, max: 100 });
  const prefix = DUTY_PREFIX_RULES.find(([rule]) => rule.test(normalizedDuty));
  return prefix ? prefix[1] : '';
}

function leaderSet(leaders, department) {
  if (!leaders) return new Set();
  if (Array.isArray(leaders)) return new Set(leaders.map(item => identity(text(item))).filter(Boolean));
  if (!isPlainObject(leaders)) return new Set();
  const value = leaders[department] ?? Object.entries(leaders).find(([key]) => identity(text(key)) === identity(department))?.[1];
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return new Set(list.map(item => identity(text(item))).filter(Boolean));
}

function sourceRows(input) {
  if (Array.isArray(input)) return input;
  if (!isPlainObject(input)) return [];
  if (Array.isArray(input.services)) return input.services;
  if (Array.isArray(input.assignments)) return input.assignments;
  if (isPlainObject(input.assignments)) return [input];
  if (Array.isArray(input.evidence)) return input.evidence;
  return [input];
}

function assignmentRows(row) {
  if (!isPlainObject(row)) return [];
  if (!isPlainObject(row.assignments)) return [row];
  return Object.entries(row.assignments).map(([duty, assignment]) => {
    if (typeof assignment === 'string') {
      return {
        department: row.department,
        member: assignment,
        duty,
        date: row.date,
        service: row.service,
        serviceTime: row.serviceTime ?? row.time,
        sourceId: row.sourceId
      };
    }
    if (!isPlainObject(assignment)) return { duty, member: '' };
    return {
      ...assignment,
      department: assignment.department ?? row.department,
      duty: assignment.duty ?? duty,
      date: assignment.date ?? row.date,
      service: assignment.service ?? row.service,
      serviceTime: assignment.serviceTime ?? assignment.time ?? row.serviceTime ?? row.time,
      sourceId: assignment.sourceId ?? row.sourceId
    };
  });
}

function normalizeEvidenceRow(row, index, options) {
  const member = text(row && (row.member ?? row.memberName ?? row.name), { required: true });
  const duty = text(row && (row.duty ?? row.role), { required: true, max: 100 });
  const explicitDepartment = text(row && (row.department ?? row.departmentName), { max: 100 });
  const department = explicitDepartment || mapDutyDepartment(duty, options.dutyDepartments);
  if (!member || !duty) return { skipped: { index, reason: 'missing-member-or-duty' } };
  if (!department) return { skipped: { index, reason: 'unknown-duty', duty } };

  const evidenceDate = row && row.date == null ? '' : date(row && row.date);
  if (row && row.date != null && !evidenceDate) {
    return { skipped: { index, reason: 'invalid-date', date: row.date } };
  }
  const service = text(row && row.service, { max: 100 });
  const serviceTime = text(row && (row.serviceTime ?? row.time), { max: 80 });
  const sourceId = text(row && row.sourceId, { max: 180 });
  const normalized = {
    department,
    member,
    duty
  };
  if (evidenceDate) normalized.date = evidenceDate;
  if (service) normalized.service = service;
  if (serviceTime) normalized.serviceTime = serviceTime;
  if (sourceId) normalized.sourceId = sourceId;
  return { evidence: normalized };
}

function evidenceKey(item) {
  return JSON.stringify([
    item.department,
    item.member,
    item.duty,
    item.date || '',
    item.service || '',
    item.serviceTime || '',
    item.sourceId || ''
  ].map(identity));
}

function normalizeSeededAt(value) {
  if (value == null) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('seededAt must be a non-negative safe integer timestamp');
  return value;
}

function normalizeSeededBy(value) {
  const normalized = text(value ?? 'history-seed', { required: true });
  if (!normalized) throw new TypeError('seededBy must be a non-empty safe string');
  return normalized;
}

function planHistorySeed(input, options = {}) {
  const seededAt = normalizeSeededAt(options.seededAt ?? options.at);
  const seededBy = normalizeSeededBy(options.seededBy);
  const groups = new Map();
  const skipped = [];
  let rowIndex = 0;

  for (const sourceRow of sourceRows(input)) {
    const rows = assignmentRows(sourceRow);
    for (const row of rows) {
      const normalized = normalizeEvidenceRow(row, rowIndex, options);
      rowIndex += 1;
      if (normalized.skipped) {
        skipped.push(normalized.skipped);
        continue;
      }
      const item = normalized.evidence;
      const id = profileIdFor(item.department, item.member);
      let group = groups.get(id);
      if (!group) {
        group = {
          id,
          department: item.department,
          member: item.member,
          duties: new Map(),
          evidence: new Map()
        };
        groups.set(id, group);
      }
      group.duties.set(identity(item.duty), item.duty);
      group.evidence.set(evidenceKey(item), item);
    }
  }

  const suggestions = Array.from(groups.values())
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(group => {
      const role = leaderSet(options.leaders, group.department).has(identity(group.member))
        ? PROFILE_ROLE_LEADER
        : PROFILE_ROLE_MEMBER;
      const evidence = Array.from(group.evidence.values()).sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      );
      return {
        id: group.id,
        profileId: group.id,
        department: group.department,
        member: group.member,
        role,
        status: PROFILE_STATUS_ACTIVE,
        eligibleDuties: Array.from(group.duties.values()).sort((left, right) => left.localeCompare(right)),
        schedulable: true,
        historySeed: {
          source: HISTORY_SEED_SOURCE,
          seededBy,
          seededAt,
          evidence
        }
      };
    });

  return {
    version: 1,
    source: HISTORY_SEED_SOURCE,
    seededBy,
    seededAt,
    suggestions,
    skipped
  };
}

function assertPlan(plan) {
  if (!isPlainObject(plan)) throw new TypeError('seed plan must be a plain object');
  if (!Array.isArray(plan.suggestions)) throw new TypeError('seed plan suggestions must be an array');
  return plan;
}

function applyHistorySeedPlan(profiles, plan, options = {}) {
  assertPlan(plan);
  const input = profiles == null ? [] : Array.isArray(profiles) ? profiles : [profiles];
  const byId = new Map();
  const order = [];
  for (const profile of input) {
    if (!profile || typeof profile !== 'object') throw new TypeError('profiles must contain profile objects');
    const id = profile.id ?? profile.profileId;
    if (typeof id !== 'string' || !id) throw new TypeError('existing profiles must have an id');
    if (byId.has(id)) throw new TypeError(`duplicate profile id: ${id}`);
    byId.set(id, profile);
    order.push(id);
  }

  const sortedSuggestions = plan.suggestions.slice().sort((left, right) => {
    const leftId = left.id ?? left.profileId;
    const rightId = right.id ?? right.profileId;
    return String(leftId).localeCompare(String(rightId));
  });
  const at = normalizeSeededAt(options.at ?? plan.seededAt);
  const actor = options.actor ?? {
    by: plan.seededBy || 'history-seed',
    role: 'history-seed',
    at
  };
  for (const suggestion of sortedSuggestions) {
    const id = suggestion.id ?? suggestion.profileId;
    if (typeof id !== 'string' || !id) throw new TypeError('each seed suggestion must have an id');
    const next = mergeHistorySeed(byId.get(id), suggestion, { at, actor });
    if (!byId.has(id)) order.push(id);
    byId.set(id, next);
  }

  return order.map(id => byId.get(id));
}

function applyHistorySeedToProfile(profile, suggestion, options = {}) {
  return mergeHistorySeed(profile, suggestion, options);
}

const API = {
  DEFAULT_DUTY_DEPARTMENTS,
  DUTY_PREFIX_RULES,
  mapDutyDepartment,
  planHistorySeed,
  createHistorySeedPlan: planHistorySeed,
  applyHistorySeedPlan,
  applyHistorySeed: applyHistorySeedPlan,
  applyHistorySeedToProfile,
  mergeHistorySeed
};

module.exports = API;
