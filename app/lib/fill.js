/* Fill: when a leader asks, a member for each empty duty. A member is a
   choice when they can take the duty then (canTake: active, schedulable,
   eligible, available) and may hold it alongside whatever they already do in
   that service (conflicts.js: one duty, or one prayer with one usher duty).

   A duty with a default member (Opening Prayer: see DUTY_DEFAULTS) goes to
   the default whenever they can take it, and to no one else: when they
   cannot, it stays empty for the leader to fill by hand. The default never
   gets another duty.

   An usher duty goes first to someone praying in that service (Thanks or
   Closing Prayer), whatever the mode: the prayers lead and the ushers follow.
   A service's duties are filled in department order, so its prayers are
   settled before its ushers. When more than one person praying could take
   it, the fairest goes (as in Auto).

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
     department's duties share the turns, except that the Presider and Opening
     Prayer each take turns of their own. An usher duty held by someone
     praying in that service is not a turn.
   - 'random': anyone who can take it.
   - 'pattern' (Usual): the department's own habits over the last 2 months
     (HABIT_DAYS before the first service being filled):
     1. someone with no other duty that day,
     2. someone still under their usual number of duties a month in this
        department (at least 1),
     3. turns shared in proportion to the habit: each person's count for
        this duty at this kind of service (same worship and label), divided
        by one more than the times they already have it this month. So 6
        mornings against 4 gives turns of about 3 to 2, taken in turn, not
        all of one person's first. Then the same for this duty at all, then
        for this kind of service in this department,
     4. then as in Auto.
     Someone new to the department has no habits yet, so the regulars come
     first until they reach their usual number.

   Nobody set to Manual only in a duty's department (manual-only.js) is
   proposed, except as that duty's default.

   When no one is free for a duty, Fill moves its own picks in that service
   around to free someone, and another free member takes the duty they leave.
   So a duty stays empty only when moving this fill's picks cannot fill it;
   the duties already saved never move.

   `duties` is a list, or a function giving each service its own. `history`
   is every known service; it gives the month, the day and the turns their
   context. `defaults` maps a duty to its default member's name. Nothing is
   saved here; the leader sees the proposals first. */
import { canTake, takesDuty } from './availability.js';
import { serviceId, byStart, startsAt } from './services.js';
import { hasDuty } from './worship.js';
import { canAdd, isPrayer, isUsher, prayerOf } from './conflicts.js';
import { recentLoad } from './workload.js';
import { ALL_DUTIES, departmentOf } from '../config/duties.js';
import { isManualOnly } from './manual-only.js';

/* How far back Usual looks for a department's habits. */
const HABIT_DAYS = 60;
const DAY_MS = 864e5;
const kindOf = service => (service.worship || '') + '|' + (service.service || '');
const departmentName = duty => (departmentOf(duty) || { name: duty }).name;

/* The three ways, each with one line saying what it does. */
export const FILL_MODES = [
  ['pattern', 'Usual (learns habits)', 'Who usually does each duty at each service goes first, about as often as they usually serve.'],
  ['auto', 'Auto (fairest first)', 'People with the fewest duties this month go first.'],
  ['rotation', 'Rotation (take turns)', 'Whoever has waited longest since their last turn goes first.'],
  ['random', 'Random', 'Anyone free, picked at random.']
];

/* Why a duty stayed empty, in a few words and in a sentence: its default
   cannot take it then, no one on the list takes it, no one who takes it is
   available then, or everyone available already serves in that service. */
export const UNFILLED_REASONS = {
  default: ['Default not free', 'The default for this duty cannot take it then. Choose someone by hand.'],
  nobody: ['No one takes it', 'No one on the list takes this duty.'],
  away: ['No one free then', 'No one who takes this duty is available then.'],
  manual: ['Only manual picks', 'Everyone free for it is set to Manual only. Choose someone by hand.'],
  serving: ['Everyone free is serving', 'Everyone available already serves in this service.']
};

/* A small stable number for a name at a service, to break ties fairly. */
function spread(name, id) {
  let hash = 2166136261;
  for (const char of name + '|' + id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/* The line of turns a duty belongs to in Rotation: its department's, but
   the Presider and Opening Prayer (Sermon) each have their own. */
function turnOf(duty) {
  return duty === 'Presider' || duty === 'Sermon' ? duty : (departmentOf(duty) || { name: duty }).name;
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

/* Step 1. What everyone already does: duties per month, names per day, and
   each line's latest turn per name, from the services being filled and every
   other known service around them, plus Usual's habits. `note` adds a pick
   once its service is settled. */
function tally(ordered, history, mode) {
  const ids = new Set(ordered.map(serviceId));
  const months = new Set(ordered.map(service => service.date.slice(0, 7)));
  const days = new Set(ordered.map(service => service.date));
  const end = startsAt(ordered[ordered.length - 1]);

  // What everyone already does: duties per month, names per day, and each
  // line's latest turn per name, from the services being filled and every
  // other known service around them. Each service's picks are added once
  // the service is settled.
  const monthCount = {}, dayNames = {}, lastTurn = {}, departmentMonth = {}, habitMonth = {};
  const note = (service, duty, name, assignments) => {
    const monthKey = service.date.slice(0, 7);
    if (months.has(monthKey)) {
      (monthCount[monthKey] = monthCount[monthKey] || {})[name] = (monthCount[monthKey][name] || 0) + 1;
      const key = monthKey + '|' + departmentName(duty);
      (departmentMonth[key] = departmentMonth[key] || {})[name] = (departmentMonth[key][name] || 0) + 1;
      // What Usual shares out: this month's turns at each habit.
      ['duty|' + duty + '|' + kindOf(service), 'duty|' + duty, 'kind|' + departmentName(duty) + '|' + kindOf(service)].forEach(habitKey => {
        const row = habitMonth[monthKey + '|' + habitKey] || (habitMonth[monthKey + '|' + habitKey] = {});
        row[name] = (row[name] || 0) + 1;
      });
    }
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

  // Usual's habits: what each person held in the HABIT_DAYS before the first
  // service being filled. Counts per duty at a kind of service, per duty,
  // per kind of service in a department, and per department.
  const habitTo = ordered[0].date;
  const habitFrom = new Date(Date.parse(habitTo + 'T12:00:00Z') - HABIT_DAYS * DAY_MS).toISOString().slice(0, 10);
  const habits = {};
  const count = (key, name) => { const row = habits[key] || (habits[key] = {}); row[name] = (row[name] || 0) + 1; };
  if (mode === 'pattern') {
    history.forEach(service => {
      if (!service || !(service.date >= habitFrom && service.date < habitTo) || ids.has(serviceId(service))) return;
      Object.entries(service.assignments || {}).forEach(([duty, name]) => {
        if (!name || !departmentOf(duty)) return;
        const department = departmentName(duty);
        count('duty|' + duty + '|' + kindOf(service), name);
        count('duty|' + duty, name);
        count('kind|' + department + '|' + kindOf(service), name);
        count('department|' + department, name);
      });
    });
  }
  const habit = (key, name) => (habits[key] || {})[name] || 0;
  const usualPerMonth = (department, name) => Math.max(1, Math.round(habit('department|' + department, name) * 30.4 / HABIT_DAYS));
  return { note, habit, usualPerMonth, monthCount, dayNames, lastTurn, departmentMonth, habitMonth };
}

/* Step 2. The keys each way of filling sorts members by (see the top of this
   file), read from the tally as it stands when a service is filled. */
function orderKeys(known, stats) {
  const { habit, usualPerMonth, monthCount, dayNames, lastTurn, departmentMonth, habitMonth } = known;
  // The keys the two orders sort by (see the top of this file). They hold
  // while a service is filled, so each is worked out once per service.
  const remember = keyOf => {
    const known = new Map();
    return name => (known.has(name) ? known.get(name) : known.set(name, keyOf(name)).get(name));
  };
  const fairKey = (service, id) => {
    const day = dayNames[service.date] || new Set(), month = monthCount[service.date.slice(0, 7)] || {};
    return remember(name => {
      return [day.has(name) ? 1 : 0, month[name] || 0, recentLoad(stats, name), (stats[name] || {}).last || '', spread(name, id)];
    });
  };
  const patternKey = (service, id, duty) => {
    const fairOf = fairKey(service, id);
    const department = departmentName(duty);
    const day = dayNames[service.date] || new Set();
    const month = departmentMonth[service.date.slice(0, 7) + '|' + department] || {};
    const kind = kindOf(service);
    const monthKey = service.date.slice(0, 7);
    // The habit shared out in proportion: count / (turns this month + 1).
    const share = (key, name) => habit(key, name) / (((habitMonth[monthKey + '|' + key] || {})[name] || 0) + 1);
    return remember(name => [
      day.has(name) ? 1 : 0,
      (month[name] || 0) >= usualPerMonth(department, name) ? 1 : 0,
      -share('duty|' + duty + '|' + kind, name),
      -share('duty|' + duty, name),
      -share('kind|' + department + '|' + kind, name)
    ].concat(fairOf(name)));
  };
  const turnKey = line => {
    const turns = lastTurn[line] || {};
    return remember(name => [turns[name] == null ? -Infinity : turns[name], name]);
  };
  return { fairKey, patternKey, turnKey };
}

/* Step 3. One service: place someone on every empty duty it wants, moving
   this fill's own picks in it when no one is free. Returns the picks and the
   duties left empty, each with its reason. */
function fillService(service, { duties, rosterFor, mode, random, defaults, allowedFor, known, keys }) {
  const { note, habit } = known;
  const { fairKey, patternKey, turnKey } = keys;
  const proposals = [], unfilled = [];
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
  const usual = {};
  const inPattern = duty => usual[duty] || (usual[duty] = patternKey(service, id, duty));
  const turns = {};
  const inTurn = duty => turns[turnOf(duty)] || (turns[turnOf(duty)] = turnKey(turnOf(duty)));
  const wanted = typeof duties === 'function' ? duties(service) : duties;
  const able = {};
  const manualOnly = new Set(); // duties only Manual only members are free for
  const free = duty => able[duty].filter(profile => canAdd(holding(profile.memberName), duty));

  /* The order to try members for `duty`: anyone praying in this service
     first for an usher duty (fairest of them first), then the leader's way. */
  const rank = (duty, list) => {
    const first = isUsher(duty) ? sortBy(list.filter(profile => praying(profile.memberName)), fair) : [];
    const firsts = new Set(first);
    let rest = list.filter(profile => !firsts.has(profile));
    if (mode === 'rotation') rest = sortBy(rest, inTurn(duty));
    else if (mode === 'pattern') rest = sortBy(rest, inPattern(duty));
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

  let empty = ALL_DUTIES.filter(duty => wanted.includes(duty) && !state[duty]);
  empty.forEach(duty => {
    const open = (rosterFor(duty) || []).filter(profile => allowedFor(duty)(profile) && canTake(profile, service, duty));
    able[duty] = defaults[duty] ? open : open.filter(profile => !isManualOnly(duty, profile.memberName));
    if (open.length && !able[duty].length) manualOnly.add(duty);
  });
  // Usual: within a department, the duty someone holds most by habit here
  // is filled first, so the habit is not taken by a duty filled before it.
  if (mode === 'pattern') {
    const start = duty => ALL_DUTIES.findIndex(other => departmentName(other) === departmentName(duty));
    const strongest = duty => Math.max(0, ...able[duty].map(profile => habit('duty|' + duty + '|' + kindOf(service), profile.memberName)));
    empty = empty.map((duty, index) => [duty, start(duty), -strongest(duty), index])
      .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3]).map(([duty]) => duty);
  }
  empty = empty.filter(duty => !fillDuty(duty));
  // Whoever a match frees may fill a duty still empty; go on while that
  // changes anything (each round makes a match or fills a duty).
  for (let round = 0; round < ALL_DUTIES.length; round++) {
    const matched = matchUshers();
    const before = empty.length;
    empty = empty.filter(duty => !fillDuty(duty));
    if (!matched && empty.length === before) break;
  }
  empty.forEach(duty => {
    const takers = (rosterFor(duty) || []).filter(profile => takesDuty(profile, duty));
    const reason = defaults[duty] && !able[duty].length ? 'default'
      : manualOnly.has(duty) ? 'manual'
        : (able[duty].length ? 'serving' : (takers.length ? 'away' : 'nobody'));
    unfilled.push({ serviceId: id, duty, reason });
  });
  ALL_DUTIES.filter(duty => picks[duty]).forEach(duty => {
    const pick = picks[duty];
    note(service, duty, pick.memberName, state);
    proposals.push({ serviceId: id, duty, memberUid: pick.memberUid, memberName: pick.memberName });
  });
  return { proposals, unfilled };
}

export function fill(services, duties, rosterFor, stats, { mode = 'auto', history = [], random = Math.random, defaults = {} } = {}) {
  const ordered = services.slice().sort(byStart);
  if (!ordered.length) return { proposals: [], unfilled: [] };
  const defaultNames = new Set(Object.values(defaults).filter(Boolean));
  // Who may be given `duty`: its default alone, or anyone but a default.
  const allowedFor = duty => (defaults[duty]
    ? profile => profile.memberName === defaults[duty]
    : profile => !defaultNames.has(profile.memberName));
  const known = tally(ordered, history, mode);
  const keys = orderKeys(known, stats);
  // In order of start: each service's picks are in the tally before the next.
  const proposals = [], unfilled = [];
  ordered.forEach(service => {
    const result = fillService(service, { duties, rosterFor, mode, random, defaults, allowedFor, known, keys });
    proposals.push(...result.proposals);
    unfilled.push(...result.unfilled);
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
