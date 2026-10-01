/* Fill: when a leader asks, a member for each empty duty. A member is a
   choice when they can take the duty then (canTake: active, schedulable,
   eligible, available) and may hold it alongside whatever they already do in
   that service (conflicts.js: one duty, or one prayer with one usher duty).

   An usher duty goes first to someone praying in that service, whatever the
   mode: the prayers lead and the ushers follow. A service's duties are filled
   in department order, so its prayers are settled before its ushers. When
   more than one person praying could take it, the fairest goes (as in Auto).

   Everyone else is chosen the leader's way:
   - 'auto' (the default), fairest first:
     1. someone with no other duty that day,
     2. whoever has the fewest duties that month, counting the services
        already past and this fill,
     3. whoever has served least lately (last 8 weeks plus upcoming),
     4. whoever served longest ago,
     5. then a different order for each service, so no name always wins a tie.
   - 'rotation': everyone takes a turn before anyone serves again. Whoever has
     gone longest without a turn goes first, and people tied go by name. A
     department's duties share the turns, except that the Presider takes turns
     apart from the prayers. An usher duty held by someone praying in that
     service is not a turn.
   - 'random': anyone who can take it.

   `duties` is a list, or a function giving each service its own. `history`
   is every known service; it gives the month, the day and the turns their
   context. Nothing is saved here; the leader sees the proposals first. */
import { canTake, takesDuty } from './availability.js';
import { serviceId, byStart, startsAt } from './services.js';
import { hasDuty } from './worship.js';
import { canAlsoServe, isUsher, prayerOf } from './conflicts.js';
import { ALL_DUTIES, departmentOf } from '../config/duties.js';

export const FILL_MODES = [['auto', 'Auto (fairest first)'], ['rotation', 'Rotation (take turns)'], ['random', 'Random']];

/* Why a duty stayed empty: no one on the list takes it, no one who takes it
   is available then, or everyone available already serves in that service. */
export const UNFILLED_REASONS = {
  nobody: 'No one on the list takes this duty',
  away: 'No one who takes this duty is available then',
  serving: 'Everyone available already serves in this service'
};

/* A small stable number for a name at a service, to break ties fairly. */
function spread(name, id) {
  let hash = 2166136261;
  for (const char of name + '|' + id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/* The line of turns a duty belongs to in Rotation. */
function turnOf(duty) {
  return duty === 'Presider' ? 'Presider' : (departmentOf(duty) || { name: duty }).name;
}

/* Whether `name` holding `duty` in these assignments counts as a turn: an
   usher duty matched to their prayer does not. */
function isTurn(assignments, duty, name) {
  return !(isUsher(duty) && prayerOf(assignments, name));
}

export function fill(services, duties, rosterFor, stats, { mode = 'auto', history = [], random = Math.random } = {}) {
  const ordered = services.slice().sort(byStart);
  if (!ordered.length) return { proposals: [], unfilled: [] };
  const ids = new Set(ordered.map(serviceId));
  const months = new Set(ordered.map(service => service.date.slice(0, 7)));
  const days = new Set(ordered.map(service => service.date));
  const end = startsAt(ordered[ordered.length - 1]);

  // What everyone already does: duties per month, names per day, and each
  // line's latest turn per name, from the services being filled and every
  // other known service around them. This fill's picks are added as made.
  const monthCount = {}, dayNames = {}, lastTurn = {};
  const note = (service, duty, name, assignments) => {
    const monthKey = service.date.slice(0, 7);
    if (months.has(monthKey)) (monthCount[monthKey] = monthCount[monthKey] || {})[name] = (monthCount[monthKey][name] || 0) + 1;
    if (days.has(service.date)) (dayNames[service.date] = dayNames[service.date] || new Set()).add(name);
    const at = startsAt(service);
    if (at <= end && isTurn(assignments, duty, name)) {
      const line = lastTurn[turnOf(duty)] || (lastTurn[turnOf(duty)] = {});
      if (!(line[name] >= at)) line[name] = at;
    }
  };
  const noteAll = service => {
    const assignments = service.assignments || {};
    Object.entries(assignments).forEach(([duty, name]) => { if (name) note(service, duty, name, assignments); });
  };
  history.forEach(service => {
    if (service && /^\d{4}-\d{2}-\d{2}$/.test(service.date || '') && !ids.has(serviceId(service))) noteAll(service);
  });
  ordered.forEach(noteAll);

  const recent = name => { const s = stats[name] || {}; return (s.past8 || 0) + (s.upcoming || 0); };
  const last = name => (stats[name] || {}).last || '';
  const fairest = (service, id) => {
    const sameDay = name => (dayNames[service.date] && dayNames[service.date].has(name) ? 1 : 0);
    const thisMonth = name => (monthCount[service.date.slice(0, 7)] || {})[name] || 0;
    return (a, b) => sameDay(a.memberName) - sameDay(b.memberName) ||
      thisMonth(a.memberName) - thisMonth(b.memberName) ||
      recent(a.memberName) - recent(b.memberName) ||
      last(a.memberName).localeCompare(last(b.memberName)) ||
      spread(a.memberName, id) - spread(b.memberName, id);
  };
  const inTurn = duty => {
    const line = lastTurn[turnOf(duty)] || {};
    const at = name => (line[name] == null ? -Infinity : line[name]);
    return (a, b) => (at(a.memberName) - at(b.memberName)) || a.memberName.localeCompare(b.memberName);
  };

  const proposals = [], unfilled = [];
  ordered.forEach(service => {
    const id = serviceId(service);
    const assignments = Object.assign({}, service.assignments);
    const wanted = typeof duties === 'function' ? duties(service) : duties;
    ALL_DUTIES.filter(duty => wanted.includes(duty)).forEach(duty => {
      if (assignments[duty]) return;
      const roster = rosterFor(duty) || [];
      const able = roster.filter(profile => canTake(profile, service, duty));
      const choices = able.filter(profile => canAlsoServe(assignments, profile.memberName, duty));
      if (!choices.length) {
        const reason = able.length ? 'serving' : (roster.some(profile => takesDuty(profile, duty)) ? 'away' : 'nobody');
        unfilled.push({ serviceId: id, duty, reason });
        return;
      }
      const praying = isUsher(duty) ? choices.filter(profile => prayerOf(assignments, profile.memberName)) : [];
      let pick;
      if (praying.length) pick = praying.slice().sort(fairest(service, id))[0];
      else if (mode === 'rotation') pick = choices.slice().sort(inTurn(duty))[0];
      else if (mode === 'random') pick = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
      else pick = choices.slice().sort(fairest(service, id))[0];
      assignments[duty] = pick.memberName;
      note(service, duty, pick.memberName, assignments);
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
