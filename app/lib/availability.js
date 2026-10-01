/* Department member profiles: who is in a department, which duties they can
   take, whether leaders may schedule them, and when they are available.
   Availability has a weekly pattern per service time ("recurring") and
   one-day exceptions keyed by date. A date exception wins; "*" in an
   exception covers every service time that day. */
import { SERVICE_LABELS } from '../config/duties.js';

export function timeKey(serviceOrLabel) {
  const value = typeof serviceOrLabel === 'object'
    ? serviceOrLabel && (serviceOrLabel.serviceTime || serviceOrLabel.service || serviceOrLabel.time)
    : serviceOrLabel;
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

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

export function isLeaderProfile(profile) {
  return /leader|manager/i.test(String(profile && profile.role || ''));
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

/* Whether a profile takes `duty` at all: active, schedulable and listing it. */
export function takesDuty(profile, duty) {
  if (!profile || profile.status !== 'active' || profile.schedulable !== true) return false;
  const wanted = String(duty || '').trim().toLowerCase();
  return profile.eligibleDuties.some(item => item.toLowerCase() === wanted);
}

/* A normal assignment needs an active, schedulable profile that lists the
   duty and is available at that service. Administrators can override. */
export function canTake(profile, service, duty) {
  return takesDuty(profile, duty) && availabilityOn(profile, service && service.date, timeKey(service)) === 'available';
}
