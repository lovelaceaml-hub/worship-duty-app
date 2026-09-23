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
export function preferredScheduleService(services, now = new Date()) {
  const { wallNow } = pacificWallNow(now);
  const start = service => {
    if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(service.date || '')) return NaN;
    const fallback = { 'Early Morning': '05:00', Morning: '09:00', Afternoon: '15:00', Evening: '20:00' };
    const time = /^\d{2}:\d{2}$/.test(service.time || '') ? service.time : (fallback[service.service] || '12:00');
    return Date.parse(service.date + 'T' + time + ':00Z');
  };
  const ordered = (services || []).filter(service => Number.isFinite(start(service)))
    .sort((left, right) => start(left) - start(right));
  return ordered.find(service => start(service) > wallNow) || ordered.at(-1) || null;
}
export function dutiesFor(member, list) {
  const out = [];
  (list || upcomingServices()).forEach(svc => {
    CATEGORIES.forEach(cat => cat.duties.forEach(duty => {
      if ((svc.assignments || {})[duty] === member) out.push({ svc, duty, cat });
    }));
  });
  return out;
}
