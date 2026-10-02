/* Services: one worship service on one date, with its duty assignments.
   A service is "upcoming" until its Pacific start minute; from then on it is
   past. The Schedule and My Duties still show it as "Now" for 20 minutes. The
   Presider planner treats a service as "in progress" for three hours after it
   starts, so the runsheet and Mark as sung stay reachable.
   Functions that take `now` accept a Date or a Pacific wall time already
   read (pacificNow().wall), so a list is checked against one clock reading. */
import { DEPARTMENTS, DEFAULT_TIMES, SERVICE_LABELS } from '../config/duties.js';
import { clockTime, pacificNow, wallTime, addDays } from './dates.js';

const IN_PROGRESS_MS = 3 * 60 * 60 * 1000;
const NOW_MS = 20 * 60 * 1000;

/* "2026-07-01_morning". Also the setlist id (song-lib.js serviceIdFor). */
export function serviceId(service) {
  return service.date + '_' + String(service.service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function startTime(service) {
  if (/^\d{2}:\d{2}$/.test(service.time || '')) return service.time;
  return DEFAULT_TIMES[service.service] || '12:00';
}

/* "9:00 AM": the start shown for a service, its usual time when the stored
   one is missing or cannot be read. */
export function serviceClock(service) {
  return clockTime(startTime(service));
}

/* Each service's start is worked out once, and again only when its date,
   time or label changes. */
const starts = new WeakMap();

/* Start as a Pacific wall-clock timestamp (see dates.js wallTime). NaN for a
   service without a valid date. */
export function startsAt(service) {
  if (!service || typeof service !== 'object') return NaN;
  const known = starts.get(service);
  if (known && known.date === service.date && known.time === service.time && known.label === service.service) return known.at;
  const at = /^\d{4}-\d{2}-\d{2}$/.test(service.date || '') ? wallTime(service.date, startTime(service)) : NaN;
  starts.set(service, { date: service.date, time: service.time, label: service.service, at });
  return at;
}

function labelOrder(service) {
  const at = SERVICE_LABELS.indexOf(service.service);
  return at === -1 ? SERVICE_LABELS.length : at;
}

/* By start, then by the order a day runs. Rows without a valid date go
   last, so the order stays the same however the list began. */
export function byStart(a, b) {
  const sa = startsAt(a), sb = startsAt(b);
  const va = Number.isFinite(sa), vb = Number.isFinite(sb);
  if (va !== vb) return va ? -1 : 1;
  return ((va && sa - sb) || 0) || labelOrder(a) - labelOrder(b);
}

function wallAt(now) {
  return typeof now === 'number' ? now : pacificNow(now).wall;
}

export function isUpcoming(service, now = new Date()) {
  return startsAt(service) > wallAt(now);
}

export function isInProgress(service, now = new Date()) {
  const start = startsAt(service);
  const wall = wallAt(now);
  return start <= wall && wall < start + IN_PROGRESS_MS;
}

/* The Schedule and My Duties show a service as "Now" for its first 20
   minutes; after that it is past there. */
export function isNow(service, now = new Date()) {
  const start = startsAt(service);
  const wall = wallAt(now);
  return start <= wall && wall < start + NOW_MS;
}

export function upcoming(services, now = new Date()) {
  const wall = wallAt(now);
  return services.filter(service => startsAt(service) > wall).sort(byStart);
}

/* Newest first. */
export function past(services, now = new Date()) {
  const wall = wallAt(now);
  return services.filter(service => startsAt(service) <= wall).sort((a, b) => byStart(b, a));
}

/* The service the Schedule opens on: the next one to start. When nothing is
   ahead, the most recent one. */
export function nextService(services, now = new Date()) {
  const wall = wallAt(now);
  const ordered = services.filter(service => Number.isFinite(startsAt(service))).sort(byStart);
  return ordered.find(service => startsAt(service) > wall) || ordered[ordered.length - 1] || null;
}

/* The next moment the screens change by themselves, as a Pacific wall time:
   a service starting, its 20 minutes as "Now" ending, its three hours in
   progress ending (the song planner), or midnight (Today and Tomorrow move
   on). */
export function nextChange(services, now = new Date()) {
  const wall = wallAt(now);
  const today = new Date(wall).toISOString().slice(0, 10);
  let next = wallTime(addDays(today, 1), '00:00');
  services.forEach(service => {
    const start = startsAt(service);
    if (start > wall) next = Math.min(next, start);
    else if (start + NOW_MS > wall) next = Math.min(next, start + NOW_MS);
    else if (start + IN_PROGRESS_MS > wall) next = Math.min(next, start + IN_PROGRESS_MS);
  });
  return next;
}

/* Every duty `member` holds in `services`, in date, time and department order. */
export function dutiesOf(member, services) {
  if (!member) return [];
  const out = [];
  services.slice().sort(byStart).forEach(service => {
    const assignments = service.assignments || {};
    DEPARTMENTS.forEach(department => department.duties.forEach(duty => {
      if (assignments[duty] === member) out.push({ service, duty, department });
    }));
  });
  return out;
}

export function departmentHasAssignments(service, departmentName) {
  const department = DEPARTMENTS.find(item => item.name === departmentName);
  const assignments = service.assignments || {};
  return !!department && department.duties.some(duty => !!assignments[duty]);
}

export function assignedCount(service) {
  return Object.values(service.assignments || {}).filter(Boolean).length;
}
