'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourceRoot = path.resolve(__dirname, '../../../../../');
const constants = require(path.join(sourceRoot, 'src/core/constants.js'));
const schedule = require(path.join(sourceRoot, 'src/domain/schedule.js'));
const member = require(path.join(sourceRoot, 'src/domain/member.js'));
const coordinator = require(path.join(sourceRoot, 'src/domain/coordinator.js'));

const categories = [
  { name: 'Worship', color: '#4338ca', duties: ['Presider', 'Prayer of Thanks'] },
  { name: 'Usher Sisters', color: '#be185d', duties: ['Usher Door', 'Usher Front'] },
  { name: 'Media', color: '#6d28d9', duties: ['Media Booth #1'] }
];

function legacyDutiesFor(name, services) {
  const result = [];
  (services || []).forEach(service => {
    categories.forEach(category => category.duties.forEach(duty => {
      if ((service.assignments || {})[duty] === name) {
        result.push({ service, duty, cat: category });
      }
    }));
  });
  return result;
}

function rendererShape(records) {
  const days = [];
  const dayIndex = {};
  records.forEach(record => {
    let day = dayIndex[record.svc.date];
    if (!day) {
      day = dayIndex[record.svc.date] = {
        date: record.svc.date,
        edge: record.cat.color,
        services: [],
        svcIndex: {}
      };
      days.push(day);
    }
    const id = schedule.serviceId(record.svc);
    let service = day.svcIndex[id];
    if (!service) {
      service = day.svcIndex[id] = { svc: record.svc, id, duties: [] };
      day.services.push(service);
    }
    service.duties.push(record);
  });
  return days.map(day => ({
    date: day.date,
    edge: day.edge,
    services: day.services
  }));
}

function legacyUpcoming(services, today, labels) {
  return services.filter(service => service.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || labels.indexOf(a.service) - labels.indexOf(b.service));
}

function shiftISO(today, days) {
  const date = new Date(today + 'T12:00:00');
  date.setDate(date.getDate() + days);
  const pad = value => (value < 10 ? '0' : '') + value;
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function legacyWorkloadStats(services, members, today) {
  const w4 = shiftISO(today, -28);
  const w8 = shiftISO(today, -56);
  const stats = {};
  const ensure = name => stats[name] || (stats[name] = {
    past4: 0, past8: 0, upcoming: 0, total: 0, last: '', next: ''
  });
  (members || []).forEach(ensure);
  (services || []).forEach(service => {
    Object.keys(service.assignments || {}).forEach(duty => {
      const name = service.assignments[duty];
      if (!name) return;
      const result = ensure(name);
      result.total++;
      if (service.date < today) {
        if (service.date >= w8) result.past8++;
        if (service.date >= w4) result.past4++;
        if (service.date > result.last) result.last = service.date;
      } else {
        result.upcoming++;
        if (!result.next || service.date < result.next) result.next = service.date;
      }
    });
  });
  return stats;
}

function legacyExpectedDuties(service, services) {
  const filled = {};
  const count = {};
  services.forEach(item => {
    const assigned = Object.keys(item.assignments || {}).filter(duty => item.assignments[duty]);
    if (!assigned.length) return;
    const key = (item.worship || '') + '|' + (item.service || '');
    count[key] = (count[key] || 0) + 1;
    const bucket = filled[key] || (filled[key] = {});
    assigned.forEach(duty => { bucket[duty] = (bucket[duty] || 0) + 1; });
  });
  const key = (service.worship || '') + '|' + (service.service || '');
  const bucket = filled[key] || {};
  const planned = count[key] || 0;
  const allDuties = categories.reduce((out, category) => out.concat(category.duties), []);
  return planned ? allDuties.filter(duty => (bucket[duty] || 0) * 2 >= planned) : [];
}

function legacyGaps(services, today, horizon, labels) {
  return legacyUpcoming(services, today, labels).filter(service => service.date <= horizon)
    .reduce((rows, service) => {
      const assignments = service.assignments || {};
      if (!Object.keys(assignments).some(duty => assignments[duty])) return rows;
      const missing = legacyExpectedDuties(service, services).filter(duty => !assignments[duty]);
      if (missing.length) rows.push({ service, missing });
      return rows;
    }, []);
}

function legacyWorkloadRows(stats, members) {
  return Object.keys(stats).map(m => ({ m, s: stats[m] }))
    .filter(row => row.s.total > 0 || members.indexOf(row.m) !== -1)
    .sort((a, b) => (b.s.past8 + b.s.upcoming) - (a.s.past8 + a.s.upcoming) || a.m.localeCompare(b.m));
}

function legacyRoster(service, duty, departments, members) {
  const category = categories.find(item => item.duties.indexOf(duty) !== -1) || categories[0];
  const roster = (departments || {})[category.name] || [];
  let options = roster.length ? roster : members;
  const current = (service.assignments || {})[duty] || '';
  if (current && options.indexOf(current) === -1) options = [current].concat(options);
  return options;
}

test('actual browser script order exposes frozen member and coordinator domains', () => {
  const index = fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8');
  const sources = Array.from(index.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), match => match[1]);
  const expected = [
    'src/core/constants.js?v=DEV',
    'src/core/state.js?v=DEV',
    'src/domain/schedule.js?v=DEV',
    'src/domain/setlist.js?v=DEV',
    'src/domain/member.js?v=DEV',
    'src/domain/coordinator.js?v=DEV',
    'src/domain/sheet.js?v=DEV',
    'src/services/storage.js?v=DEV',
    'src/services/firebase.js?v=DEV',
    'src/services/subscriptions.js?v=DEV',
    'app.js?v=DEV'
  ];
  let previous = -1;
  expected.forEach(source => {
    const position = sources.indexOf(source);
    assert(position > previous, source + ' must load after its dependency');
    previous = position;
  });

  const sandbox = { window: {} };
  vm.createContext(sandbox);
  expected.slice(0, -1).forEach(source => vm.runInContext(
    fs.readFileSync(path.join(sourceRoot, source.split('?')[0]), 'utf8'),
    sandbox,
    { filename: source }
  ));
  assert(Object.isFrozen(sandbox.window.WorshipApp.core));
  assert(Object.isFrozen(sandbox.window.WorshipApp.domain.schedule));
  assert(Object.isFrozen(sandbox.window.WorshipApp.domain.setlist));
  assert(Object.isFrozen(sandbox.window.WorshipApp.domain.member));
  assert(Object.isFrozen(sandbox.window.WorshipApp.domain.coordinator));
  assert(Object.isFrozen(sandbox.window.WorshipApp.domain.sheet));
  assert(Object.isFrozen(sandbox.window.WorshipApp.services.storage));
  assert(Object.isFrozen(sandbox.window.WorshipApp.services.firebase));
  assert(Object.isFrozen(sandbox.window.WorshipApp.services.subscriptions));
});

test('member selectors match the pre extraction renderer inputs', () => {
  const services = [
    {
      date: '2026-09-20', service: 'Morning', time: '09:00',
      assignments: { Presider: 'Alex Example', 'Prayer of Thanks': 'Alex Example' }
    },
    {
      date: '2026-09-20', service: 'Evening', time: '18:00',
      assignments: { Presider: 'Alex Example' }
    },
    {
      date: '2026-09-27', service: 'Morning', time: '09:00',
      assignments: { 'Media Booth #1': 'Alex Example' }
    }
  ];
  const legacy = legacyDutiesFor('Alex Example', services, categories)
    .map(item => ({ svc: item.service, duty: item.duty, cat: item.cat }));
  const actual = schedule.dutiesFor('Alex Example', services, categories)
    .map(item => ({ svc: item.service, duty: item.duty, cat: item.cat }));
  assert.deepEqual(actual, legacy);
  assert.equal(member.dutiesFor, undefined);
  assert.deepEqual(
    member.groupDuties(actual, schedule.serviceId),
    rendererShape(legacy)
  );

  const requests = [
    { svcId: 'one', duty: 'Presider', name: 'Alex Example', status: 'resolved', createdAt: 10 },
    { svcId: 'one', duty: 'Presider', name: 'Alex Example', status: 'pending', createdAt: 20 },
    { svcId: 'two', duty: 'Presider', name: 'Other Example', status: 'pending', createdAt: 30 }
  ];
  assert.strictEqual(member.findPendingRequest(requests, 'one', 'Presider', 'Alex Example'), requests[1]);
  assert.deepEqual(member.requestsForMember(requests, 'Alex Example'), [requests[1], requests[0]]);
  assert.equal(member.pendingRequestCount(requests), 2);
  assert.deepEqual(member.setlistSummary({ one: { songs: ['Fictional Song'], confirmedAt: 4, updatedAt: 5 } }, 'one'), {
    count: 1, confirmed: false, changed: true
  });
});

test('coordinator selectors preserve planning order, gaps, rosters, and workload', () => {
  const services = [
    {
      date: '2026-08-30', service: 'Morning', worship: 'Sabbath Day',
      assignments: { Presider: 'Alex Example', 'Prayer of Thanks': 'Casey Example' }
    },
    {
      date: '2026-09-20', service: 'Evening', worship: 'Sabbath Day',
      assignments: { Presider: 'Alex Example' }
    },
    {
      date: '2026-09-20', service: 'Morning', worship: 'Sabbath Day',
      assignments: { Presider: 'Alex Example', 'Prayer of Thanks': 'Casey Example' }
    }
  ];
  const today = '2026-09-01';
  const labels = ['Morning', 'Evening'];
  assert.deepEqual(coordinator.upcomingServices(services, today, labels), legacyUpcoming(services, today, labels));
  assert.deepEqual(
    schedule.workloadStats(services, ['Alex Example', 'Casey Example', 'Drew Example'], today, categories),
    legacyWorkloadStats(services, ['Alex Example', 'Casey Example', 'Drew Example'], today)
  );
  const stats = schedule.workloadStats(services, ['Alex Example', 'Casey Example', 'Drew Example'], today, categories);
  assert.equal(coordinator.workloadStats, undefined);
  assert.equal(coordinator.suggestSubs, undefined);
  assert.deepEqual(coordinator.workloadRows(stats, ['Alex Example', 'Casey Example', 'Drew Example']), legacyWorkloadRows(stats, ['Alex Example', 'Casey Example', 'Drew Example']));
  const horizon = '2026-10-01';
  assert.deepEqual(coordinator.gapRows(services, today, horizon, categories, labels), legacyGaps(services, today, horizon, labels));
  assert.deepEqual(
    coordinator.eligibleDutyRoster(
      { assignments: { Presider: 'Legacy Example' } },
      'Presider',
      { Worship: ['Alex Example'] },
      ['Alex Example'],
      categories
    ),
    legacyRoster({ assignments: { Presider: 'Legacy Example' } }, 'Presider', { Worship: ['Alex Example'] }, ['Alex Example'])
  );

  const conflictService = {
    date: '2026-09-20', service: 'Morning', worship: 'Sabbath Day',
    assignments: { Presider: 'Alex Example', 'Prayer of Thanks': 'Alex Example' }
  };
  let suggestionCalls = 0;
  const planningSchedule = Object.assign({}, schedule, {
    suggestSubs(...args) {
      suggestionCalls++;
      return schedule.suggestSubs(...args);
    }
  });
  const departments = { Worship: ['Alex Example', 'Casey Example', 'Drew Example'] };
  const members = ['Alex Example', 'Casey Example', 'Drew Example'];
  const planningRows = coordinator.conflictsWithSuggestions([conflictService], {
    categories,
    stats,
    departments,
    members,
    schedule: planningSchedule
  });
  assert.equal(planningRows.length, 1);
  assert.equal(suggestionCalls, planningRows[0].conflict.duties.length);
  assert.deepEqual(
    planningRows[0].suggestions.map(item => item.members),
    planningRows[0].conflict.duties.map(duty => schedule.suggestSubs(
      conflictService,
      duty,
      planningRows[0].conflict.name,
      stats,
      departments,
      members,
      categories
    ))
  );

  const requests = [
    { status: 'resolved', createdAt: 1, name: 'Alex Example' },
    { status: 'pending', createdAt: 3, name: 'Casey Example' },
    { status: 'pending', createdAt: 2, name: 'Alex Example' }
  ];
  const split = coordinator.splitRequests(requests);
  assert.deepEqual(split.all, [requests[1], requests[2], requests[0]]);
  assert.deepEqual(split.pending, [requests[1], requests[2]]);
  assert.deepEqual(split.resolved, [requests[0]]);
  assert.throws(
    () => coordinator.conflictsWithSuggestions([], { categories }),
    /requires schedule\.activeConflicts/
  );
  assert.throws(
    () => coordinator.conflictsWithSuggestions([], { categories, schedule: { activeConflicts() {} } }),
    /requires schedule\.suggestSubs/
  );
});

test('composition root calls the extracted selectors', () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'app.js'), 'utf8');
  [
    'DOMAIN.dutiesFor',
    'MEMBER_DOMAIN.groupDuties',
    'MEMBER_DOMAIN.findPendingRequest',
    'MEMBER_DOMAIN.requestsForMember',
    'MEMBER_DOMAIN.pendingRequestCount',
    'MEMBER_DOMAIN.setlistSummary',
    'COORDINATOR_DOMAIN.upcomingServices',
    'COORDINATOR_DOMAIN.eligibleDutyRoster',
    'COORDINATOR_DOMAIN.conflictsWithSuggestions',
    'COORDINATOR_DOMAIN.gapRows',
    'COORDINATOR_DOMAIN.workloadRows',
    'COORDINATOR_DOMAIN.splitRequests'
  ].forEach(symbol => assert.match(source, new RegExp(symbol.replace('.', '\\.'), 'g')));
});
