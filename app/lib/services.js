/* Services: one worship service on one date, with its duty assignments.
   A service is "upcoming" until its Pacific start minute; from then on it is
   past. The Presider planner also treats a service as "in progress" for three
   hours after it starts, so the runsheet and Mark as sung stay reachable. */
import { DEPARTMENTS, DEFAULT_TIMES, SERVICE_LABELS } from '../config/duties.js';
import { pacificNow, wallTime } from './dates.js';

const IN_PROGRESS_MS = 3 * 60 * 60 * 1000;

/* "2026-07-01_morning". Also the setlist id (song-lib.js serviceIdFor). */
export function serviceId(service) {
  return service.date + '_' + String(service.service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function startTime(service) {
  if (/^\d{2}:\d{2}$/.test(service.time || '')) return service.time;
  return DEFAULT_TIMES[service.service] || '12:00';
}

/* Start as a Pacific wall-clock timestamp (see dates.js wallTime). NaN for a
   service without a valid date. */
export function startsAt(service) {
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(service.date || '')) return NaN;
  return wallTime(service.date, startTime(service));
}

export function byStart(a, b) {
  return (startsAt(a) - startsAt(b)) ||
    SERVICE_LABELS.indexOf(a.service) - SERVICE_LABELS.indexOf(b.service);
}

export function isUpcoming(service, now = new Date()) {
  return startsAt(service) > pacificNow(now).wall;
}

export function isInProgress(service, now = new Date()) {
  const start = startsAt(service);
  const wall = pacificNow(now).wall;
  return start <= wall && wall < start + IN_PROGRESS_MS;
}

export function upcoming(services, now = new Date()) {
  return services.filter(service => isUpcoming(service, now)).sort(byStart);
}

/* Newest first. */
export function past(services, now = new Date()) {
  return services.filter(service => Number.isFinite(startsAt(service)) && !isUpcoming(service, now))
    .sort((a, b) => byStart(b, a));
}

/* The service the Schedule opens on: the next one to start. When nothing is
   ahead, the most recent one. */
export function nextService(services, now = new Date()) {
  const ordered = services.filter(service => Number.isFinite(startsAt(service))).sort(byStart);
  return ordered.find(service => isUpcoming(service, now)) || ordered[ordered.length - 1] || null;
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
