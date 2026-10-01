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

   When no one is free for a duty, Fill moves its own picks in that service
   around to free someone, and another free member takes the duty they leave.
   So a duty stays empty only when moving this fill's picks cannot fill it;
   the duties already saved never move.

   `duties` is a list, or a function giving each service its own. `history`
   is every known service; it gives the month, the day and the turns their
   context. Nothing is saved here; the leader sees the proposals first. */
import { canTake, takesDuty } from './availability.js';
import { serviceId, byStart, startsAt } from './services.js';
import { hasDuty } from './worship.js';
import { canAdd, isPrayer, isUsher, prayerOf } from './conflicts.js';
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

/* `list` in the order of the keys `keyOf` gives each member's name, compared
   one after another: numbers from low to high, text in the usual order. */
function sortBy(list, keyOf) {
  const compare = (a, b) => {
    for (let i = 0; i < a.length; i++) {
      const difference = typeof a[i] === 'string' ? a[i].localeCompare(b[i]) : a[i] - b[i];
      if (difference) return difference; // 0, or NaN for two -Infinity: look at the next key
    }
    return 0;
  };
  return list.map(profile => [keyOf(profile.memberName), profile]).sort((a, b) => compare(a[0], b[0])).map(([, profile]) => profile);
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
  // other known service around them. Each service's picks are added once
  // the service is settled.
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

  // The keys the two orders sort by (see the top of this file). They hold
  // while a service is filled, so each is worked out once per service.
  const remember = keyOf => {
    const known = new Map();
    return name => (known.has(name) ? known.get(name) : known.set(name, keyOf(name)).get(name));
  };
  const fairKey = (service, id) => {
    const day = dayNames[service.date] || new Set(), month = monthCount[service.date.slice(0, 7)] || {};
    return remember(name => {
      const served = stats[name] || {};
      return [day.has(name) ? 1 : 0, month[name] || 0, (served.past8 || 0) + (served.upcoming || 0), served.last || '', spread(name, id)];
    });
  };
  const turnKey = line => {
    const turns = lastTurn[line] || {};
    return remember(name => [turns[name] == null ? -Infinity : turns[name], name]);
  };

  const proposals = [], unfilled = [];
  ordered.forEach(service => {
    const id = serviceId(service);
    const state = {};         // duty -> name: the service as it will be
    const held = new Map();   // name -> the duties they hold in it
    const picks = {};         // duty -> profile: this fill's picks in it
    const log = [];           // [duty, the pick it had]: to undo moves that lead nowhere
    const holding = name => held.get(name) || [];
    const put = (duty, name) => { state[duty] = name; held.set(name, holding(name).concat(duty)); };
    const clear = duty => { const name = state[duty]; delete state[duty]; held.set(name, holding(name).filter(other => other !== duty)); };
    Object.entries(service.assignments || {}).forEach(([duty, name]) => { if (name) put(duty, name); });
    const give = (duty, profile) => { log.push([duty, picks[duty]]); if (state[duty]) clear(duty); put(duty, profile.memberName); picks[duty] = profile; };
    const take = duty => { log.push([duty, picks[duty]]); clear(duty); delete picks[duty]; };
    const undo = mark => {
      while (log.length > mark) {
        const [duty, before] = log.pop();
        if (state[duty]) clear(duty);
        delete picks[duty];
        if (before) { put(duty, before.memberName); picks[duty] = before; }
      }
    };
    const praying = name => holding(name).some(isPrayer);
    const fair = fairKey(service, id);
    const turns = {};
    const inTurn = duty => turns[turnOf(duty)] || (turns[turnOf(duty)] = turnKey(turnOf(duty)));
    const wanted = typeof duties === 'function' ? duties(service) : duties;
    const able = {};
    const free = duty => able[duty].filter(profile => canAdd(holding(profile.memberName), duty));

    /* The order to try members for `duty`: anyone praying in this service
       first for an usher duty (fairest of them first), then the leader's way. */
    const rank = (duty, list) => {
      const first = isUsher(duty) ? sortBy(list.filter(profile => praying(profile.memberName)), fair) : [];
      const firsts = new Set(first);
      let rest = list.filter(profile => !firsts.has(profile));
      if (mode === 'rotation') rest = sortBy(rest, inTurn(duty));
      else if (mode !== 'random') rest = sortBy(rest, fair);
      else if (rest.length) rest.unshift(rest.splice(Math.min(rest.length - 1, Math.floor(random() * rest.length)), 1)[0]);
      return first.concat(rest);
    };

    /* Move someone who can take `duty` to it, off one of their picks here or
       both of a prayer and usher pair, if `refill` fills what they leave. */
    const moveFor = (duty, movable, refill) => {
      for (const profile of rank(duty, able[duty])) {
        const name = profile.memberName;
        const mine = holding(name).filter(other => picks[other] && movable(other));
        for (const leave of mine.map(other => [other]).concat(mine.length === 2 ? [mine] : [])) {
          const mark = log.length;
          leave.forEach(take);
          if (canAdd(holding(name), duty)) {
            give(duty, profile);
            if (leave.every(refill)) return true;
          }
          undo(mark);
        }
      }
      return false;
    };
    /* Give `duty` to the first free member in order. When no one is free,
       move a pick here to it and place the duty that frees the same way (a
       chain, as long as it takes). Each duty is tried once per chain, which
       keeps it quick; with the prayer and usher pair that can pass over a
       single move, so those are tried too. */
    const place = (duty, tried) => {
      tried.add(duty);
      const direct = rank(duty, free(duty))[0];
      if (direct) { give(duty, direct); return true; }
      return moveFor(duty, other => !tried.has(other), other => place(other, tried));
    };
    const fillDuty = duty => place(duty, new Set()) || moveFor(duty, () => true, other => {
      const next = rank(other, free(other))[0];
      if (next) give(other, next);
      return !!next;
    });

    // Moving picks can hand a prayer to someone after the ushers were placed:
    // an usher duty this fill gave to someone not praying goes to them then.
    const matchUshers = () => ALL_DUTIES.filter(duty => isUsher(duty) && picks[duty] && !praying(picks[duty].memberName))
      .filter(duty => {
        const options = able[duty].filter(profile => praying(profile.memberName) && canAdd(holding(profile.memberName), duty));
        if (options.length) give(duty, sortBy(options, fair)[0]);
        return options.length > 0;
      }).length > 0;

    let empty = ALL_DUTIES.filter(duty => wanted.includes(duty) && !state[duty]).filter(duty => {
      able[duty] = (rosterFor(duty) || []).filter(profile => canTake(profile, service, duty));
      return !fillDuty(duty);
    });
    // Whoever a match frees may fill a duty still empty; go on while that
    // changes anything (each round makes a match or fills a duty).
    for (let round = 0; round < ALL_DUTIES.length; round++) {
      const matched = matchUshers();
      const before = empty.length;
      empty = empty.filter(duty => !fillDuty(duty));
      if (!matched && empty.length === before) break;
    }
    empty.forEach(duty => {
      const reason = able[duty].length ? 'serving' : ((rosterFor(duty) || []).some(profile => takesDuty(profile, duty)) ? 'away' : 'nobody');
      unfilled.push({ serviceId: id, duty, reason });
    });
    ALL_DUTIES.filter(duty => picks[duty]).forEach(duty => {
      const pick = picks[duty];
      note(service, duty, pick.memberName, state);
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
