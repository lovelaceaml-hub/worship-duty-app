/* Fill: when a leader asks, a member for each empty duty. Only members who
   can take the duty then (canTake: active, schedulable, eligible, available)
   and are not already serving in that service. Three ways to choose:
   - 'rotation': down the department's list in name order, picking up after
     whoever served in that department most recently, round and round;
   - 'random': anyone who can take it;
   - 'auto' (the default), fairest first:
   1. someone with no other duty that day,
   2. whoever has the fewest duties this month (counting this fill),
   3. whoever has served least lately (last 8 weeks plus upcoming),
   4. whoever served longest ago,
   5. then a different order for each service, so no name always wins a tie.
   `duties` is a list, or a function giving each service its own. Nothing is
   saved here; the leader sees the proposals first. */
import { canTake } from './availability.js';
import { serviceId, byStart } from './services.js';
import { hasDuty } from './worship.js';
import { ALL_DUTIES, departmentOf } from '../config/duties.js';

/* A small stable number for a name at a service, to break ties fairly. */
function spread(name, id) {
  let hash = 2166136261;
  for (const char of name + '|' + id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export const FILL_MODES = [['auto', 'Auto (fairest first)'], ['rotation', 'Rotation (in turn, by name)'], ['random', 'Random']];

/* Where each department's rotation starts: just after whoever served in it
   most recently before these services. */
function rotationStart(history, before) {
  const latest = {};
  history.filter(service => service.date < before).slice().sort(byStart).forEach(service => {
    Object.entries(service.assignments || {}).forEach(([duty, name]) => {
      const department = departmentOf(duty);
      if (name && department) latest[department.name] = name;
    });
  });
  return latest;
}

export function fill(services, duties, rosterFor, stats, { mode = 'auto', history = [], random = Math.random } = {}) {
  const ordered = services.slice().sort(byStart);
  const lastIn = mode === 'rotation' && ordered.length ? rotationStart(history, ordered[0].date) : {};
  const turn = {}; // department -> index of the next member in its list
  const month = {}, byDay = {};
  const note = (name, date) => {
    month[name] = (month[name] || 0) + 1;
    (byDay[date] = byDay[date] || new Set()).add(name);
  };
  ordered.forEach(service => Object.values(service.assignments || {}).forEach(name => { if (name) note(name, service.date); }));
  const recent = name => { const s = stats[name] || {}; return (s.past8 || 0) + (s.upcoming || 0); };
  const last = name => (stats[name] || {}).last || '';
  const proposals = [], unfilled = [];
  ordered.forEach(service => {
    const id = serviceId(service);
    const assignments = Object.assign({}, service.assignments);
    (typeof duties === 'function' ? duties(service) : duties).forEach(duty => {
      if (assignments[duty]) return;
      const serving = new Set(Object.values(assignments).filter(Boolean));
      const roster = rosterFor(duty);
      const free = profile => !serving.has(profile.memberName) && canTake(profile, service, duty);
      const choices = roster.filter(free);
      if (!choices.length) { unfilled.push({ serviceId: id, duty }); return; }
      let pick;
      if (mode === 'rotation') {
        const department = (departmentOf(duty) || { name: duty }).name;
        const list = roster.slice().sort((a, b) => a.memberName.localeCompare(b.memberName));
        if (turn[department] == null) turn[department] = list.findIndex(profile => profile.memberName === lastIn[department]) + 1;
        for (let step = 0; step < list.length && !pick; step++) {
          const index = (turn[department] + step) % list.length;
          if (free(list[index])) { pick = list[index]; turn[department] = index + 1; }
        }
      } else if (mode === 'random') {
        pick = choices[Math.floor(random() * choices.length)];
      } else {
        const sameDay = name => (byDay[service.date] && byDay[service.date].has(name) ? 1 : 0);
        choices.sort((a, b) => sameDay(a.memberName) - sameDay(b.memberName) ||
          (month[a.memberName] || 0) - (month[b.memberName] || 0) ||
          recent(a.memberName) - recent(b.memberName) ||
          last(a.memberName).localeCompare(last(b.memberName)) ||
          spread(a.memberName, id) - spread(b.memberName, id));
        pick = choices[0];
      }
      assignments[duty] = pick.memberName;
      note(pick.memberName, service.date);
      proposals.push({ serviceId: id, duty, memberUid: pick.memberUid, memberName: pick.memberName });
    });
  });
  return { proposals, unfilled };
}

/* The duties Fill looks at for a service: every duty this kind of service
   (same worship and label) has had filled at least once in the past year.
   A kind of service with no history gets every duty it has. Thanks Prayer
   and Closing Prayer only where the service has them. */
export function fillDuties(services, today) {
  const yearAgo = new Date(Date.parse(today + 'T12:00:00Z') - 365 * 864e5).toISOString().slice(0, 10);
  const used = {};
  services.forEach(service => {
    if (service.date >= today || service.date < yearAgo) return;
    const key = (service.worship || '') + '|' + (service.service || '');
    Object.entries(service.assignments || {}).forEach(([duty, name]) => { if (name) (used[key] = used[key] || new Set()).add(duty); });
  });
  return service => {
    const seen = used[(service.worship || '') + '|' + (service.service || '')];
    return ALL_DUTIES.filter(duty => hasDuty(service, duty) && (!seen || seen.has(duty)));
  };
}
