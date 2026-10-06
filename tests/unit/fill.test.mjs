/* Fill: who it proposes for each empty duty, in each of its four ways, and
   the rules it must never break, checked on hundreds of made-up months. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fill, fillDuties } from '../../app/lib/fill.js';
import { canTake, normalizeProfile } from '../../app/lib/availability.js';
import { canAlsoServe, doubleDuties, prayerOf } from '../../app/lib/conflicts.js';
import { serviceId } from '../../app/lib/services.js';
import { hasDuty } from '../../app/lib/worship.js';
import { workload } from '../../app/lib/workload.js';
import { ALL_DUTIES, DEPARTMENTS, PRAYER_DUTIES, USHER_DUTIES, departmentOf } from '../../app/config/duties.js';

const require = createRequire(import.meta.url);

/* A department profile: active, schedulable and free unless `extra` says otherwise. */
function profile(department, name, duties, extra = {}) {
  return normalizeProfile(Object.assign({
    memberUid: 'member:' + name, departmentId: department, memberName: name, status: 'active', schedulable: true,
    eligibleDuties: duties, availability: { recurring: {}, exceptions: {} }
  }, extra), department);
}
const away = dates => ({ availability: { recurring: {}, exceptions: Object.fromEntries(dates.map(date => [date, { '*': 'unavailable' }])) } });
const rostersFor = rosters => duty => rosters[departmentOf(duty).name] || [];
const service = (date, label = 'Morning', assignments = {}, worship = 'Sabbath Day') =>
  ({ date, service: label, time: { 'Early Morning': '05:00', Morning: '10:00', Afternoon: '14:30', Evening: '19:30' }[label], worship, assignments });
const picks = result => result.proposals.map(item => [item.serviceId, item.duty, item.memberName]);
const names = result => result.proposals.map(item => item.memberName);

test('Fill gives each empty duty to the least-served member who can take it, one duty each', () => {
  const sisters = ['Usher Door', 'Usher Front'];
  const roster = [
    profile('Usher Sisters', 'S. Leah', sisters, away(['2026-09-19'])),
    profile('Usher Sisters', 'S. Naomi', sisters), profile('Usher Sisters', 'S. Esther', sisters),
    profile('Usher Sisters', 'S. Grace', ['Usher Front'])
  ];
  const services = [service('2026-09-26', 'Morning', { 'Usher Door': 'S. Esther' }), service('2026-09-12'), service('2026-09-19')];
  const stats = {
    'S. Leah': { past8: 1, upcoming: 0, last: '2026-08-29' },
    'S. Naomi': { past8: 1, upcoming: 0, last: '2026-08-01' },
    'S. Esther': { past8: 2, upcoming: 1, last: '2026-08-22' }
  };
  const result = fill(services, sisters, () => roster, stats);
  assert.deepEqual(picks(result), [
    ['2026-09-12_morning', 'Usher Door', 'S. Naomi'],   // Leah and Naomi tie; Naomi served longer ago. Grace cannot take the door.
    ['2026-09-12_morning', 'Usher Front', 'S. Grace'],  // Grace has served least of all
    ['2026-09-19_morning', 'Usher Door', 'S. Naomi'],   // Leah is away; Naomi (2) still under Esther (3)
    ['2026-09-19_morning', 'Usher Front', 'S. Grace'],  // Naomi serves there already
    ['2026-09-26_morning', 'Usher Front', 'S. Leah']    // the door was already filled; Esther serves there
  ]);
  assert.equal(result.proposals[0].memberUid, 'member:S. Naomi');
  assert.deepEqual(result.unfilled, []);
  const none = fill([service('2026-09-19')], ['Usher Door'], () => roster.slice(0, 1), {});
  assert.deepEqual([none.proposals.length, none.unfilled], [0, [{ serviceId: '2026-09-19_morning', duty: 'Usher Door', reason: 'away' }]]);
});

test('Fill spreads a month evenly and avoids two services on one day', () => {
  const people = ['S. Ada', 'S. Bea', 'S. Cora', 'S. Dina', 'S. Eva', 'S. Fay'];
  const roster = people.map(name => profile('Usher Sisters', name, ['Usher Door', 'Usher Front', 'Usher Back']));
  // Four Saturdays with three services each, three duties per service: 36 duties for 6 people.
  const services = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24'].flatMap(date =>
    ['Morning', 'Afternoon', 'Evening'].map(label => service(date, label)));
  const result = fill(services, ['Usher Door', 'Usher Front', 'Usher Back'], () => roster, {});
  assert.equal(result.proposals.length, 36);
  assert.deepEqual(result.unfilled, []);
  assert.deepEqual(people.map(name => names(result).filter(item => item === name).length), [6, 6, 6, 6, 6, 6], 'everyone gets the same number');
  const perDay = {};
  result.proposals.forEach(item => { const key = item.serviceId.slice(0, 10) + item.memberName; perDay[key] = (perDay[key] || 0) + 1; });
  assert.ok(Object.values(perDay).every(count => count <= 2), 'at most two services a day each');
});

test('Auto counts the duties already served earlier in the month and earlier that day', () => {
  const roster = ['S. Ada', 'S. Bea'].map(name => profile('Usher Sisters', name, ['Usher Door']));
  // Ada served twice this month already; the services still to come go to Bea first.
  const history = [service('2026-10-03', 'Morning', { 'Usher Door': 'S. Ada' }), service('2026-10-03', 'Evening', { 'Usher Door': 'S. Ada' })];
  const month = fill([service('2026-10-10'), service('2026-10-17')], ['Usher Door'], () => roster, {}, { history });
  assert.deepEqual(names(month), ['S. Bea', 'S. Bea']);
  // Bea has more duties this month, but Ada already served this morning: the evening goes to Bea.
  const day = [service('2026-10-01', 'Evening', { 'Usher Door': 'S. Bea' }, 'Third Day'), service('2026-10-02', 'Evening', { 'Usher Door': 'S. Bea' }, 'Prayer Week'),
    service('2026-10-03', 'Morning', { 'Usher Door': 'S. Ada' })];
  assert.deepEqual(names(fill([service('2026-10-03', 'Evening')], ['Usher Door'], () => roster, {}, { history: day })), ['S. Bea']);
});

/* Usher Brothers and Worship, with B. Adam both praying and ushering. */
function brothers() {
  const brothersDuties = ['Usher #1', 'Usher #2', 'Lobby Security'];
  return {
    Worship: [profile('Worship', 'B. Adam', ['Prayer of Thanks', 'Closing Prayer']), profile('Worship', 'B. Eli', ['Prayer of Thanks', 'Closing Prayer']),
      profile('Worship', 'E. Joseph', ['Presider'])],
    'Usher Brothers': [profile('Usher Brothers', 'B. Adam', brothersDuties), profile('Usher Brothers', 'B. Cal', brothersDuties),
      profile('Usher Brothers', 'B. Dan', brothersDuties)]
  };
}

test('in every mode, an usher duty goes first to the member praying in that service', () => {
  const rosters = brothers();
  // Cal and Dan have waited longer and served less; Adam prays at this service.
  const stats = { 'B. Adam': { past8: 6, upcoming: 2, last: '2026-09-26' } };
  const history = [service('2026-09-26', 'Morning', { 'Usher #1': 'B. Adam' })];
  for (const mode of ['pattern', 'auto', 'rotation', 'random']) {
    const result = fill([service('2026-10-03', 'Morning', { 'Closing Prayer': 'B. Adam' })], ['Usher #1', 'Usher #2', 'Lobby Security'],
      rostersFor(rosters), stats, { mode, history, random: () => 0.99 });
    const given = Object.fromEntries(result.proposals.map(item => [item.duty, item.memberName]));
    assert.equal(given['Usher #1'], 'B. Adam', mode + ': the member praying ushers');
    assert.notEqual(given['Usher #2'], 'B. Adam', mode + ': only one usher duty with a prayer');
    assert.notEqual(given['Lobby Security'], 'B. Adam', mode + ': Lobby Security is not an usher duty here');
    assert.deepEqual(result.unfilled, [], mode);
  }
});

test('a prayer Fill proposes is matched too, and the prayers come first whatever order the duties are given', () => {
  const rosters = brothers();
  const result = fill([service('2026-10-03', 'Evening', {}, 'Third Day')], ['Usher #1', 'Closing Prayer'], rostersFor(rosters), {
    'B. Eli': { past8: 9, upcoming: 0, last: '2026-09-29' }
  });
  assert.deepEqual(picks(result), [
    ['2026-10-03_evening', 'Closing Prayer', 'B. Adam'],
    ['2026-10-03_evening', 'Usher #1', 'B. Adam']
  ]);
});

test('a member praying is not matched when they cannot usher then, and the prayers lead', () => {
  const rosters = brothers();
  rosters['Usher Brothers'][0] = profile('Usher Brothers', 'B. Adam', ['Usher #1'], away(['2026-10-03']));
  const result = fill([service('2026-10-03', 'Morning', { 'Closing Prayer': 'B. Adam' })], ['Usher #1'], rostersFor(rosters), {});
  assert.notEqual(names(result)[0], 'B. Adam', 'away for ushering that day');
  // Someone already ushering in a service is not preferred for its prayer: Eli, with no duty that day, prays.
  const prayers = fill([service('2026-10-10', 'Morning', { 'Usher #1': 'B. Adam' })], ['Closing Prayer'], rostersFor(brothers()), {});
  assert.deepEqual(names(prayers), ['B. Eli']);
});

test('when no one is free, Fill moves its own picks to fill the duty, even both duties of a pair', () => {
  const rosters = {
    Worship: [profile('Worship', 'B. Adam', ['Closing Prayer']), profile('Worship', 'B. Eli', ['Closing Prayer'])],
    'Usher Brothers': [profile('Usher Brothers', 'B. Adam', ['Usher #1']), profile('Usher Brothers', 'B. Cal', ['Usher #1'])],
    Lobby: [profile('Lobby', 'B. Adam', ['Lobby Desk #1']), profile('Lobby', 'B. Dan', ['Lobby Desk #1', 'Lobby Desk #2'])]
  };
  const stats = { 'B. Eli': { past8: 9 }, 'B. Cal': { past8: 9 }, 'B. Dan': { past8: 9 } };
  // Adam is fairest for the prayer and then ushers with it; only he and Dan take Lobby Desk #1, and
  // Dan is needed at Lobby Desk #2. So Adam leaves both, Eli prays and Cal ushers.
  const result = fill([service('2026-10-03')], ['Closing Prayer', 'Usher #1', 'Lobby Desk #1', 'Lobby Desk #2'], rostersFor(rosters), stats);
  assert.deepEqual(picks(result).map(([, duty, name]) => duty + ': ' + name), ['Closing Prayer: B. Eli', 'Usher #1: B. Cal', 'Lobby Desk #1: B. Adam', 'Lobby Desk #2: B. Dan']);
  assert.deepEqual(result.unfilled, []);
  // One move: Ada, the fairest, took the door; the front needs her, so she moves and Bea takes the door.
  const sisters = { 'Usher Sisters': [profile('Usher Sisters', 'S. Ada', ['Usher Door', 'Usher Front']), profile('Usher Sisters', 'S. Bea', ['Usher Door'])] };
  const moved = fill([service('2026-10-03')], ['Usher Door', 'Usher Front'], rostersFor(sisters), { 'S. Bea': { past8: 9 } });
  assert.deepEqual(names(moved), ['S. Bea', 'S. Ada']);
});

test('Opening Prayer goes to its default in every mode, and the default gets no other duty', () => {
  const rosters = {
    Worship: [profile('Worship', 'E. Simon', ['Presider', 'Sermon', 'Closing Prayer']), profile('Worship', 'B. Adam', ['Sermon', 'Closing Prayer']),
      profile('Worship', 'E. Joseph', ['Presider'])],
    'Usher Brothers': [profile('Usher Brothers', 'E. Simon', ['Usher #1']), profile('Usher Brothers', 'B. Cal', ['Usher #1'])]
  };
  // Adam is fairer than Simon for the Opening Prayer, and in Rotation it is his turn; Simon gets it anyway.
  // Simon would be fairest for Presider and Usher #1, but the default gets no other duty.
  const stats = { 'E. Simon': { past8: 2, upcoming: 0, last: '2026-09-29' }, 'E. Joseph': { past8: 9, upcoming: 9 }, 'B. Cal': { past8: 9, upcoming: 9 } };
  const history = [service('2026-09-29', 'Evening', { Sermon: 'E. Simon' }, 'Third Day')];
  const services = [service('2026-10-03'), service('2026-10-03', 'Evening'), service('2026-10-06', 'Evening', {}, 'Third Day')];
  for (const mode of ['pattern', 'auto', 'rotation', 'random']) {
    const result = fill(services, ['Presider', 'Sermon', 'Closing Prayer', 'Usher #1'], rostersFor(rosters), stats,
      { mode, history, random: () => 0, defaults: { Sermon: 'E. Simon' } });
    const given = picks(result).map(([id, duty, name]) => id.slice(5) + ' ' + duty + ': ' + name);
    assert.deepEqual(given, ['10-03_morning Presider: E. Joseph', '10-03_morning Sermon: E. Simon', '10-03_morning Closing Prayer: B. Adam', '10-03_morning Usher #1: B. Cal',
      '10-03_evening Presider: E. Joseph', '10-03_evening Sermon: E. Simon', '10-03_evening Closing Prayer: B. Adam', '10-03_evening Usher #1: B. Cal',
      '10-06_evening Presider: E. Joseph', '10-06_evening Sermon: E. Simon', '10-06_evening Closing Prayer: B. Adam', '10-06_evening Usher #1: B. Cal'], mode);
  }
  // Another preacher gives the Opening Prayer there (put on by hand): Simon is still given nothing else.
  const guest = fill([service('2026-10-10', 'Morning', { Sermon: 'P. Paul' })], ['Presider', 'Usher #1'], rostersFor(rosters), stats, { defaults: { Sermon: 'E. Simon' } });
  assert.deepEqual(names(guest), ['E. Joseph', 'B. Cal']);
});

test('when the default cannot give the Opening Prayer, it stays empty for the leader to fill by hand', () => {
  const rosters = { Worship: [profile('Worship', 'E. Simon', ['Sermon'], away(['2026-10-10'])), profile('Worship', 'B. Adam', ['Sermon'])] };
  const result = fill([service('2026-10-03'), service('2026-10-10')], ['Sermon'], rostersFor(rosters), {}, { defaults: { Sermon: 'E. Simon' } });
  assert.deepEqual(picks(result), [['2026-10-03_morning', 'Sermon', 'E. Simon']]);
  assert.deepEqual(result.unfilled, [{ serviceId: '2026-10-10_morning', duty: 'Sermon', reason: 'default' }], 'Adam is not given it');
  // A default who is not on the Worship list for it: nobody is given it.
  const missing = fill([service('2026-10-03')], ['Sermon'], rostersFor(rosters), {}, { defaults: { Sermon: 'P. Paul' } });
  assert.deepEqual([missing.proposals, missing.unfilled.map(item => item.reason)], [[], ['default']]);
  // With no default, Fill gives it to whoever comes first.
  assert.deepEqual(names(fill([service('2026-10-10')], ['Sermon'], rostersFor(rosters), {})), ['B. Adam']);
});

test('Rotation: whoever has waited longest goes first, people tied go by name, and someone away goes first next time', () => {
  const roster = ['S. Ada', 'S. Bea', 'S. Cora', 'S. Dina'].map(name =>
    profile('Usher Sisters', name, ['Usher Door'], name === 'S. Dina' ? away(['2026-10-17']) : {}));
  const history = [service('2026-09-26', 'Morning', { 'Usher Door': 'S. Bea' })];
  const services = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'].map(date => service(date));
  const rotation = fill(services, ['Usher Door'], () => roster, {}, { mode: 'rotation', history });
  // Ada, Cora and Dina have not served yet; Dina is away on the 17th, so Bea goes and Dina follows.
  assert.deepEqual(names(rotation), ['S. Ada', 'S. Cora', 'S. Bea', 'S. Dina', 'S. Ada']);
  const random = fill(services, ['Usher Door'], () => roster, {}, { mode: 'random', random: () => 0.99 });
  assert.deepEqual(names(random), ['S. Dina', 'S. Dina', 'S. Cora', 'S. Dina', 'S. Dina']);
});

test('Rotation: someone already on later that month waits, and the Presider and Opening Prayer take turns of their own', () => {
  const sisters = ['S. Ada', 'S. Bea', 'S. Cora'].map(name => profile('Usher Sisters', name, ['Usher Door', 'Usher Front', 'Usher Back']));
  const lastMonth = [service('2026-09-26', 'Morning', { 'Usher Door': 'S. Ada', 'Usher Front': 'S. Bea', 'Usher Back': 'S. Cora' })];
  const services = [service('2026-10-03'), service('2026-10-10'), service('2026-10-17', 'Morning', { 'Usher Door': 'S. Ada' })];
  assert.deepEqual(names(fill(services, ['Usher Door'], () => sisters, {}, { mode: 'rotation', history: lastMonth })), ['S. Bea', 'S. Cora']);

  const worship = [profile('Worship', 'E. Joseph', ['Presider', 'Sermon', 'Closing Prayer']), profile('Worship', 'E. Simon', ['Presider', 'Sermon']),
    profile('Worship', 'B. Adam', ['Sermon', 'Closing Prayer'])];
  const history = [service('2026-09-26', 'Morning', { Presider: 'E. Joseph', Sermon: 'E. Simon', 'Closing Prayer': 'B. Adam' })];
  const result = fill([service('2026-10-03')], ['Presider', 'Sermon', 'Closing Prayer'], () => worship, {}, { mode: 'rotation', history });
  // Simon gave the Opening Prayer last time but has not presided yet; Joseph presided. Adam's Closing Prayer
  // is not an Opening Prayer turn, so he gives the Opening Prayer, and Joseph, who has had no prayer turn, closes.
  assert.deepEqual(picks(result).map(([, duty, name]) => duty + ': ' + name), ['Presider: E. Simon', 'Sermon: B. Adam', 'Closing Prayer: E. Joseph']);
});

test('Rotation: an usher duty matched to a prayer is not a turn', () => {
  const rosters = brothers();
  const services = [service('2026-10-03', 'Morning', { 'Closing Prayer': 'B. Adam' }), service('2026-10-10')];
  const result = fill(services, ['Usher #1', 'Usher #2'], rostersFor(rosters), {}, { mode: 'rotation' });
  // The 3rd: Adam ushers with his prayer, Cal takes the first turn. The 10th: Adam has not had a turn yet.
  assert.deepEqual(names(result), ['B. Adam', 'B. Cal', 'B. Adam', 'B. Dan']);
});

test('Fill says why a duty stayed empty', () => {
  const rosters = {
    'Usher Sisters': [profile('Usher Sisters', 'S. Ada', ['Usher Door', 'Usher Front'], away(['2026-10-10'])), profile('Usher Sisters', 'S. Bea', ['Usher Door'])]
  };
  const result = fill([service('2026-10-10')], ['Usher Door', 'Usher Front', 'Usher Back'], rostersFor(rosters), {});
  assert.deepEqual(result.unfilled, [
    { serviceId: '2026-10-10_morning', duty: 'Usher Front', reason: 'away' },     // Ada takes it but is away
    { serviceId: '2026-10-10_morning', duty: 'Usher Back', reason: 'nobody' }     // no one takes it
  ]);
  const busy = fill([service('2026-10-17', 'Morning', { 'Usher Door': 'S. Bea' })], ['Usher Front'],
    rostersFor({ 'Usher Sisters': [profile('Usher Sisters', 'S. Bea', ['Usher Door', 'Usher Front'])] }), {});
  assert.deepEqual(busy.unfilled, [{ serviceId: '2026-10-17_morning', duty: 'Usher Front', reason: 'serving' }]);
  assert.deepEqual(fill([], ['Usher Door'], () => [], {}), { proposals: [], unfilled: [] });
});

test('Fill looks at every duty a kind of service has had in the past year', () => {
  const past = [
    service('2026-09-26', 'Evening', { 'Usher Door': 'S. Ada', 'Usher Back': 'S. Bea' }),
    service('2026-09-19', 'Evening', { 'Usher Door': 'S. Ada', Presider: 'B. Adam' })
  ];
  const duties = fillDuties(past, '2026-10-01');
  assert.deepEqual(duties({ worship: 'Sabbath Day', service: 'Evening' }), ['Presider', 'Usher Door', 'Usher Back']);
  // A kind of service with no history gets every duty it has (no Thanks Prayer or Closing Prayer at Prayer Week).
  const prayerWeek = duties({ worship: 'Prayer Week', service: 'Evening' });
  assert.ok(prayerWeek.includes('Usher Front') && prayerWeek.includes('Sermon'));
  assert.ok(!prayerWeek.includes('Closing Prayer') && !prayerWeek.includes('Prayer of Thanks'));
});

/* ---- made-up months ---- */

/* A small seeded random number generator, so a failure can be repeated. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = ['Early Morning', 'Morning', 'Afternoon', 'Evening'];
const WORSHIPS = ['Sabbath Day', 'Sabbath Day', 'Third Day', 'Prayer Week', 'Pentecost'];
const PEOPLE = ['B. Amos', 'B. Boaz', 'B. Caleb', 'B. Dan', 'B. Ezra', 'B. Gad', 'S. Ada', 'S. Bea', 'S. Cora', 'S. Dina', 'S. Eva',
  'E. Joseph', 'D. Miriam', 'M. Ruth'];

function madeUpMonth(seed) {
  const rand = seeded(seed);
  const pick = list => list[Math.floor(rand() * list.length)];
  const some = (list, chance) => list.filter(() => rand() < chance);
  const day = n => '2026-10-' + String(n).padStart(2, '0');
  const rosters = {};
  DEPARTMENTS.slice(0, 5).forEach(department => {
    rosters[department.name] = some(PEOPLE, 0.55).map(name => {
      const exceptions = {};
      some([3, 6, 10, 13, 17, 20, 24, 27, 31], 0.2).forEach(n => { exceptions[day(n)] = rand() < 0.5 ? { '*': 'unavailable' } : { [pick(['morning', 'evening'])]: pick(['available', 'unavailable']) }; });
      const recurring = {};
      some(['early-morning', 'morning', 'afternoon', 'evening'], 0.3).forEach(key => { recurring[key] = rand() < 0.7 ? 'unavailable' : 'available'; });
      const duties = some(department.duties, 0.7);
      return profile(department.name, name, duties.length ? duties : [department.duties[0]], {
        status: rand() < 0.88 ? 'active' : 'inactive', schedulable: rand() < 0.92, availability: { recurring, exceptions }
      });
    });
  });
  const anyone = () => pick(PEOPLE);
  const makeService = (date, label) => {
    const made = service(date, label, {}, pick(WORSHIPS));
    ALL_DUTIES.filter(duty => hasDuty(made, duty) && rand() < 0.25).forEach(duty => { made.assignments[duty] = anyone(); });
    return made;
  };
  const known = new Map();
  const add = made => { if (!known.has(serviceId(made))) known.set(serviceId(made), made); return known.get(serviceId(made)); };
  // Earlier services this month and last month, with whatever duties they had.
  for (let n = 0; n < 6; n++) add(makeService(rand() < 0.5 ? '2026-09-' + String(1 + Math.floor(rand() * 30)).padStart(2, '0') : day(1 + Math.floor(rand() * 3)), pick(LABELS)));
  const toFill = [];
  const count = 4 + Math.floor(rand() * 9);
  for (let n = 0; n < count; n++) {
    const made = add(makeService(day(4 + Math.floor(rand() * 28)), pick(LABELS)));
    if (!toFill.includes(made)) toFill.push(made);
  }
  // The duties to fill come in any order; Fill must still settle the prayers before the ushers.
  const shuffle = list => list.map(item => [rand(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  const wanted = new Map(toFill.map(made => [serviceId(made), shuffle(some(ALL_DUTIES.filter(duty => hasDuty(made, duty) && rosters[departmentOf(duty).name]), 0.8))]));
  // Some months have a default for Opening Prayer: someone who takes it, someone who may not, or no one.
  const takers = (rosters.Worship || []).map(entry => entry.memberName);
  const defaults = rand() < 0.5 ? {} : { Sermon: rand() < 0.8 && takers.length ? pick(takers) : pick(PEOPLE) };
  return {
    services: toFill, history: Array.from(known.values()), rosters, defaults,
    dutiesFor: made => wanted.get(serviceId(made)) || [],
    rosterFor: rostersFor(rosters),
    mode: pick(['pattern', 'auto', 'rotation', 'random']), random: seeded(seed * 7 + 1)
  };
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

function checkFill(scenario, result, label) {
  const byId = new Map(scenario.services.map(made => [serviceId(made), made]));
  // Who Fill may give a duty to: its default alone, or anyone but a default.
  const defaultNames = new Set(Object.values(scenario.defaults));
  const allowed = (entry, duty) => (scenario.defaults[duty] ? entry.memberName === scenario.defaults[duty] : !defaultNames.has(entry.memberName));
  const candidates = duty => scenario.rosterFor(duty).filter(entry => allowed(entry, duty));
  const finals = new Map(scenario.services.map(made => [serviceId(made), Object.assign({}, made.assignments)]));
  const proposed = new Set(), empty = new Set();
  const before = new Map(scenario.services.map(made => [serviceId(made), Object.assign({}, made.assignments)]));
  for (const item of result.proposals) {
    const key = item.serviceId + '|' + item.duty;
    const made = byId.get(item.serviceId);
    assert.ok(made, label + ': a service being filled');
    assert.ok(!proposed.has(key), label + ': one proposal per duty');
    proposed.add(key);
    assert.ok(scenario.dutiesFor(made).includes(item.duty), label + ': a duty Fill was asked about');
    assert.ok(!made.assignments[item.duty], label + ': a duty that was empty');
    const person = scenario.rosterFor(item.duty).find(entry => entry.memberUid === item.memberUid);
    assert.ok(person && person.memberName === item.memberName, label + ': someone on the department list');
    assert.ok(allowed(person, item.duty), label + ': ' + item.duty + ' to ' + item.memberName + ', not the default or a default elsewhere');
    assert.ok(canTake(person, made, item.duty), label + ': who can take the duty then');
    const state = before.get(item.serviceId);
    assert.ok(canAlsoServe(state, item.memberName, item.duty), label + ': who may hold it with their other duties');
    const earlier = result.proposals.filter(other => other.serviceId === item.serviceId && ALL_DUTIES.indexOf(other.duty) > ALL_DUTIES.indexOf(item.duty));
    assert.ok(earlier.every(other => result.proposals.indexOf(other) > result.proposals.indexOf(item)), label + ': a service is filled in department order');
    state[item.duty] = item.memberName;
    finals.get(item.serviceId)[item.duty] = item.memberName;
  }
  for (const item of result.unfilled) {
    const key = item.serviceId + '|' + item.duty;
    assert.ok(!proposed.has(key) && !empty.has(key), label + ': a duty is filled or left empty, once');
    empty.add(key);
    assert.ok((scenario.defaults[item.duty] ? ['default', 'serving'] : ['nobody', 'away', 'serving']).includes(item.reason), label + ': a reason');
    const made = byId.get(item.serviceId);
    const final = finals.get(item.serviceId);
    assert.ok(!candidates(item.duty).some(entry => canTake(entry, made, item.duty) && canAlsoServe(final, entry.memberName, item.duty)),
      label + ': ' + item.duty + ' left empty although someone could take it');
    // Nor could one of this fill's picks there move to it, with someone free taking their duty instead.
    const swap = result.proposals.filter(other => other.serviceId === item.serviceId).find(other => {
      const mover = candidates(item.duty).find(entry => entry.memberName === other.memberName);
      if (!mover || !canTake(mover, made, item.duty)) return false;
      const moved = Object.assign({}, final, { [other.duty]: '' });
      if (!canAlsoServe(moved, other.memberName, item.duty)) return false;
      moved[item.duty] = other.memberName;
      return candidates(other.duty).some(entry => entry.memberName !== other.memberName &&
        canTake(entry, made, other.duty) && canAlsoServe(moved, entry.memberName, other.duty));
    });
    assert.equal(swap, undefined, label + ': ' + item.duty + ' left empty though ' + (swap && swap.memberName) + ' could move to it');
  }
  // An usher duty Fill gave to someone not praying: everyone praying there who
  // could have taken it ushers there too.
  for (const item of result.proposals) {
    const final = finals.get(item.serviceId);
    if (!USHER_DUTIES.includes(item.duty) || prayerOf(final, item.memberName)) continue;
    const passedOver = candidates(item.duty).find(entry => prayerOf(final, entry.memberName) &&
      canAlsoServe(final, entry.memberName, item.duty) && canTake(entry, byId.get(item.serviceId), item.duty));
    assert.equal(passedOver, undefined, label + ': ' + item.duty + ' passed over ' + (passedOver && passedOver.memberName) + ', who prays there');
  }
  // Every empty duty Fill was asked about is either proposed or left empty.
  for (const made of scenario.services) {
    for (const duty of scenario.dutiesFor(made)) {
      const key = serviceId(made) + '|' + duty;
      if (!made.assignments[duty]) assert.ok(proposed.has(key) || empty.has(key), label + ': ' + key + ' was skipped');
    }
    // Fill never makes a double duty: anyone with one now had it before Fill.
    const now = doubleDuties({ assignments: finals.get(serviceId(made)) });
    const was = new Set(doubleDuties(made).map(item => item.name));
    now.forEach(item => assert.ok(was.has(item.name) && item.duties.every(duty => made.assignments[duty] === item.name),
      label + ': Fill gave ' + item.name + ' a double duty'));
  }
}

test('Fill never breaks a rule, on 400 made-up months in every mode', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const scenario = freeze(madeUpMonth(seed));
    const stats = workload(scenario.history, [], '2026-10-04');
    const options = { mode: scenario.mode, history: scenario.history, random: scenario.random, defaults: scenario.defaults };
    const result = fill(scenario.services, scenario.dutiesFor, scenario.rosterFor, stats, options);
    checkFill(scenario, result, 'seed ' + seed + ' (' + scenario.mode + ')');
    if (scenario.mode !== 'random') {
      assert.deepEqual(fill(scenario.services, scenario.dutiesFor, scenario.rosterFor, stats, options), result, 'seed ' + seed + ': the same every time');
    }
  }
});

/* Fill and the server agree on who can take a duty: the planner's save
   (saveDepartmentAssignments, with the server's own checks and pair rule)
   takes everything Fill proposes. It needs the functions' packages (npm ci
   in functions/); without them it is skipped. */
test('the server saves everything Fill proposes, on 400 made-up months', async t => {
  let createDepartmentHandlers, memoryDb;
  try {
    ({ createDepartmentHandlers } = require('../../functions/department-handlers.js'));
    ({ memoryDb } = require('../../functions/test/memory-db.js'));
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') { t.skip('the functions packages are not installed'); return; }
    throw error;
  }
  const admin = { uid: 'uid-admin', token: { uid: 'uid-admin', admin: true, memberName: 'B. Admin' } };
  for (let seed = 1; seed <= 400; seed++) {
    const scenario = madeUpMonth(seed);
    const stats = workload(scenario.history, [], '2026-10-04');
    const result = fill(scenario.services, scenario.dutiesFor, scenario.rosterFor, stats,
      { mode: scenario.mode, history: scenario.history, random: scenario.random, defaults: scenario.defaults });
    const docs = {};
    scenario.history.forEach(made => { docs['schedule/' + serviceId(made)] = structuredClone(made); });
    Object.entries(scenario.rosters).forEach(([department, list]) => list.forEach(entry => {
      docs['departments/' + department + '/members/' + entry.memberUid] = structuredClone(entry);
    }));
    const { saveDepartmentAssignments } = createDepartmentHandlers({ db: memoryDb(docs), now: () => Date.parse('2026-10-01T12:00:00Z') });
    // As the planner saves: one call per department.
    const byDepartment = {};
    result.proposals.forEach(item => {
      (byDepartment[departmentOf(item.duty).name] = byDepartment[departmentOf(item.duty).name] || [])
        .push({ serviceId: item.serviceId, duty: item.duty, memberUid: item.memberUid, expectedMemberName: '' });
    });
    for (const [departmentId, changes] of Object.entries(byDepartment)) {
      const saved = await saveDepartmentAssignments({ auth: admin, data: { departmentId, changes } });
      assert.deepEqual(saved.skipped, [], 'seed ' + seed + ': the server refused what Fill proposed in ' + departmentId);
      assert.equal(saved.saved.length, changes.length, 'seed ' + seed);
    }
  }
});

test('the prayer lists name real duties of the Worship and usher departments', () => {
  PRAYER_DUTIES.forEach(duty => assert.equal(departmentOf(duty).name, 'Worship'));
  USHER_DUTIES.forEach(duty => assert.ok(['Usher Sisters', 'Usher Brothers'].includes(departmentOf(duty).name)));
  assert.ok(!USHER_DUTIES.includes('Lobby Security'));
  assert.ok(!PRAYER_DUTIES.includes('Sermon'), 'Opening Prayer is never paired');
});
