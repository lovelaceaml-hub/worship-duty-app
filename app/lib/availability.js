/* Department member profiles: who is in a department, which duties they can
   take, whether leaders may schedule them, and when they are available.
   Availability has a weekly pattern per service time ("recurring") and
   one-day exceptions keyed by date. A date exception wins; "*" in an
   exception covers every service time that day. */
import { SERVICE_LABELS, departmentNamed } from '../config/duties.js';
import { addDays } from './dates.js';
import { canAlsoServe, isUsher, prayerOf } from './conflicts.js';

export function timeKey(serviceOrLabel) {
  const value = typeof serviceOrLabel === 'object'
    ? serviceOrLabel && (serviceOrLabel.serviceTime || serviceOrLabel.service || serviceOrLabel.time)
    : serviceOrLabel;
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* The weekly service times, with the days they come on (functions/
   service-year.js adds the year's services), and the times only feast days
   and special services have. The weekly pattern is kept per time, so "Not
   available" for Evening covers Saturday and Tuesday evenings alike. */
export const WEEKLY_TIMES = [['morning', 'Saturday'], ['afternoon', 'Saturday'], ['evening', 'Saturday and Tuesday']];
export const SPECIAL_TIMES = ['early-morning', 'commemoration'];

export function timeLabel(key) {
  if (key === '*') return 'All services that day';
  const known = SERVICE_LABELS.find(label => timeKey(label) === key);
  if (known) return known;
  return String(key || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function cleanStatuses(map) {
  const out = {};
  Object.entries(map && typeof map === 'object' ? map : {}).forEach(([key, value]) => {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'available' || status === 'unavailable') out[String(key).trim().toLowerCase()] = status;
  });
  return out;
}

export function normalizeAvailability(value) {
  const source = value && typeof value === 'object' ? value : {};
  const exceptions = {};
  Object.entries(source.exceptions || source.dateExceptions || {}).forEach(([date, entry]) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && entry && typeof entry === 'object') exceptions[date] = cleanStatuses(entry);
  });
  return { recurring: cleanStatuses(source.recurring), exceptions };
}

/* A profile as the server returns it, cleaned up, or null if it is not a
   valid profile for `department`. */
export function normalizeProfile(value, department) {
  if (!value || typeof value !== 'object') return null;
  const memberUid = String(value.memberUid || value.uid || '').trim();
  const departmentId = String(value.departmentId || value.department || '').trim();
  if (!memberUid || !departmentId || departmentId !== String(department || '').trim()) return null;
  if (value.memberUid != null && value.uid != null && String(value.memberUid) !== String(value.uid)) return null;
  if (value.departmentId != null && value.department != null && String(value.departmentId) !== String(value.department)) return null;
  const schedulable = value.schedulable == null ? value.isSchedulable : value.schedulable;
  if (typeof schedulable !== 'boolean') return null;
  const status = String(value.status || (value.active === false ? 'inactive' : 'active')).trim().toLowerCase();
  if (status !== 'active' && status !== 'inactive') return null;
  const duties = Array.isArray(value.eligibleDuties) ? value.eligibleDuties : (Array.isArray(value.duties) ? value.duties : []);
  return Object.assign({}, value, {
    departmentId,
    memberUid,
    memberName: String(value.memberName || value.member || memberUid).trim() || memberUid,
    role: String(value.role || 'member').trim(),
    status,
    eligibleDuties: duties.map(duty => String(duty).trim()).filter(Boolean),
    schedulable,
    availability: normalizeAvailability(value.availability)
  });
}

/* 'available' or 'unavailable' for one service time on one date ('unknown'
   only for a missing date or time). A time the member has not set counts as
   available: they are free unless they say they are not. */
export function availabilityOn(profile, date, key) {
  if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !key) return 'unknown';
  const { recurring = {}, exceptions = {} } = profile.availability || {};
  const exception = exceptions[date];
  if (exception && Object.prototype.hasOwnProperty.call(exception, key)) return exception[key];
  if (exception && Object.prototype.hasOwnProperty.call(exception, '*')) return exception['*'];
  return recurring[key] || 'available'; // not set counts as available
}

const lists = (profile, duty) => {
  const wanted = String(duty || '').trim().toLowerCase();
  return (profile.eligibleDuties || []).some(item => String(item).toLowerCase() === wanted);
};

/* Whether a profile takes `duty` at all: active, schedulable and listing it. */
export function takesDuty(profile, duty) {
  return !!profile && profile.status === 'active' && profile.schedulable === true && lists(profile, duty);
}

/* Why `profile` cannot take `duty` at `service`, or '' when they can. This is
   the one rule for who can take a duty: the planner's choices and its red
   names, suggestions for a replacement, a single change and Fill all use it,
   and the server checks the same in the same order (department-auth.js, then
   the pair rule in permissions.js). The codes are the server's; see
   reasons.js for the words. With `assignments` (the service's duties as the
   planner shows them), the duties the member already holds there count too:
   one duty each, or a prayer with one usher duty (conflicts.js). */
export function whyNot(profile, service, duty, assignments) {
  if (!profile) return 'no-profile';
  if (profile.status !== 'active') return 'target-inactive';
  if (!lists(profile, duty)) return 'target-ineligible';
  if (profile.schedulable !== true) return 'target-not-schedulable';
  if (availabilityOn(profile, service && service.date, timeKey(service)) !== 'available') return 'target-unavailable';
  if (assignments && !canAlsoServe(assignments, profile.memberName, duty)) return 'already-serving';
  return '';
}

/* A normal assignment needs an active, schedulable profile that lists the
   duty and is available at that service. Administrators can override. */
export function canTake(profile, service, duty) {
  return !whyNot(profile, service, duty);
}

/* Who of `people` can take `duty` at `service` with these assignments. For
   an usher duty, anyone praying in that service comes first, as in Fill. */
export function candidates(service, duty, people, assignments) {
  const able = people.filter(profile => !whyNot(profile, service, duty, assignments));
  if (!isUsher(duty)) return able;
  const praying = able.filter(profile => prayerOf(assignments, profile.memberName));
  return praying.concat(able.filter(profile => !praying.includes(profile)));
}

/* What a department's new member can take when added from the schedule, as
   the nightly job does (functions/serving-members.js): every duty of the
   department, except in Worship, whose duties are different jobs, where
   only the ones they have served count. */
export function dutiesFor(department, served = []) {
  const all = (departmentNamed(department) || { duties: [] }).duties;
  return department === 'Worship' ? all.filter(duty => served.includes(duty)) : all.slice();
}

/* Also as the nightly job: active when they served in the last 35 days or
   have a duty coming up (`last` is their latest date), else inactive. */
const RECENT_DAYS = 35;
export function statusFor(last, today) {
  return last >= addDays(today, -RECENT_DAYS) ? 'active' : 'inactive';
}
