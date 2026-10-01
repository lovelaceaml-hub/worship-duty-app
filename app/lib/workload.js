/* How much each member is serving, and who to suggest as a replacement. */
import { addDays } from './dates.js';
import { candidates } from './availability.js';
import { isUsher, prayerOf } from './conflicts.js';

/* { name: { past4, past8, upcoming, total, last, next } } across all services. */
export function workload(services, members, today) {
  const fourWeeks = addDays(today, -28), eightWeeks = addDays(today, -56);
  const stats = {};
  const entry = name => stats[name] || (stats[name] = { past4: 0, past8: 0, upcoming: 0, total: 0, last: '', next: '' });
  (members || []).forEach(entry);
  services.forEach(service => {
    Object.values(service.assignments || {}).forEach(name => {
      if (!name) return;
      const s = entry(name);
      s.total++;
      if (service.date < today) {
        if (service.date >= eightWeeks) s.past8++;
        if (service.date >= fourWeeks) s.past4++;
        if (service.date > s.last) s.last = service.date;
      } else {
        s.upcoming++;
        if (!s.next || service.date < s.next) s.next = service.date;
      }
    });
  });
  return stats;
}

/* How busy a member is lately: their duties in the last 8 weeks plus the
   ones coming up. Fill, suggestions and Checks all weigh people by this. */
export function recentLoad(stats, name) {
  const served = stats[name] || {};
  return (served.past8 || 0) + (served.upcoming || 0);
}

/* Up to `limit` profiles from `roster` who can take `duty` at `service` and
   may hold it with what they already do there (availability.js whyNot), the
   best first: for an usher duty someone praying in that service, as in Fill;
   then the lightest recent load; then whoever served longest ago. */
export function suggestReplacements(service, duty, roster, stats, { exclude = '', limit = 3 } = {}) {
  const assignments = service.assignments || {};
  const praying = name => (isUsher(duty) && prayerOf(assignments, name) ? 0 : 1);
  const last = name => (stats[name] || {}).last || '';
  const longestAgo = (a, b) => (last(a) === last(b) ? 0 : (last(a) < last(b) ? -1 : 1));
  return candidates(service, duty, roster.filter(profile => profile.memberName !== exclude), assignments)
    .sort((a, b) => praying(a.memberName) - praying(b.memberName) ||
      recentLoad(stats, a.memberName) - recentLoad(stats, b.memberName) || longestAgo(a.memberName, b.memberName))
    .slice(0, limit);
}
