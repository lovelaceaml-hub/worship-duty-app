/* How much each member is serving, and who to suggest as a replacement. */
import { ALL_DUTIES } from '../config/duties.js';
import { addDays } from './dates.js';
import { canTake } from './availability.js';
import { canAlsoServe, isUsher, prayerOf } from './conflicts.js';
import { hasDuty } from './worship.js';

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

/* Up to `limit` profiles from `roster` who can take `duty` at `service` and
   may hold it with what they already do there (conflicts.js). For an usher
   duty, someone praying in that service comes first, as in Fill. Then the
   lightest recent and upcoming load, then longest since they last served. */
export function suggestReplacements(service, duty, roster, stats, { exclude = '', limit = 3 } = {}) {
  const assignments = service.assignments || {};
  const none = { past4: 0, upcoming: 0, last: '' };
  const praying = name => (isUsher(duty) && prayerOf(assignments, name) ? 0 : 1);
  return roster
    .filter(profile => profile.memberName !== exclude && canAlsoServe(assignments, profile.memberName, duty) && canTake(profile, service, duty))
    .map(profile => ({ profile, load: stats[profile.memberName] || none }))
    .sort((a, b) => praying(a.profile.memberName) - praying(b.profile.memberName) ||
      (a.load.upcoming + a.load.past4) - (b.load.upcoming + b.load.past4) ||
      (a.load.last === b.load.last ? 0 : (a.load.last < b.load.last ? -1 : 1)))
    .slice(0, limit)
    .map(item => item.profile);
}

/* Duties a service normally has filled: those filled in at least half of the
   planned services of the same worship and service label. Services with no
   assignments at all are not planned yet and are left out. */
export function usualDuties(services) {
  const filled = {}, planned = {};
  services.forEach(service => {
    const duties = Object.keys(service.assignments || {}).filter(duty => service.assignments[duty]);
    if (!duties.length) return;
    const key = (service.worship || '') + '|' + (service.service || '');
    planned[key] = (planned[key] || 0) + 1;
    const counts = filled[key] || (filled[key] = {});
    duties.forEach(duty => { counts[duty] = (counts[duty] || 0) + 1; });
  });
  return service => {
    const key = (service.worship || '') + '|' + (service.service || '');
    const counts = filled[key] || {}, total = planned[key] || 0;
    return total ? ALL_DUTIES.filter(duty => (counts[duty] || 0) * 2 >= total && hasDuty(service, duty)) : [];
  };
}
