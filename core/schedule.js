import {CATEGORIES} from './constants.js';
import {todayISO} from './format.js';
import {state} from './state.js';

export function sortedServices() {
  return state.services.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
export function upcomingServices() { const t = todayISO(); return sortedServices().filter(s => s.date >= t); }
export function pastServices() { const t = todayISO(); return sortedServices().filter(s => s.date < t); }
export function pacificWallNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = values.year + '-' + values.month + '-' + values.day;
  return { today, wallNow: Date.parse(today + 'T' + values.hour + ':' + values.minute + ':00Z') };
}
export function serviceStartWall(service) {
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(service.date || '')) return NaN;
  const fallback = { 'Early Morning': '05:00', Morning: '09:00', Afternoon: '15:00', Evening: '20:00' };
  const time = /^\d{2}:\d{2}$/.test(service.time || '') ? service.time : (fallback[service.service] || '12:00');
  return Date.parse(service.date + 'T' + time + ':00Z');
}
export function preferredScheduleService(services, now = new Date()) {
  const { wallNow } = pacificWallNow(now);
  const ordered = (services || []).filter(service => Number.isFinite(serviceStartWall(service)))
    .sort((left, right) => serviceStartWall(left) - serviceStartWall(right));
  return ordered.find(service => serviceStartWall(service) > wallNow) || ordered.at(-1) || null;
}
/* Services whose Pacific start minute has not arrived yet, the same rule the
   Schedule selector uses. A 5:00 AM duty stops counting as upcoming at 5:00 AM,
   not at midnight. */
export function servicesNotStarted(services, now = new Date()) {
  const { wallNow } = pacificWallNow(now);
  return (services || sortedServices()).filter(service => serviceStartWall(service) > wallNow);
}
export function dutiesFor(member, list) {
  const out = [];
  (list || servicesNotStarted()).forEach(svc => {
    CATEGORIES.forEach(cat => cat.duties.forEach(duty => {
      if ((svc.assignments || {})[duty] === member) out.push({ svc, duty, cat });
    }));
  });
  return out;
}
