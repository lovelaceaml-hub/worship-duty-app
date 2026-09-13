'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createNotificationRouter,
  departmentsFor,
  notificationDedupeKey,
  routeConflictNotifications,
  routeNotifications,
  routeRequestNotifications
} = require('../leader-notifications');

const directory = {
  leaders: [
    { name: 'Leader West', departments: ['Worship'], pushOptIn: true },
    { name: 'Leader Shared', departments: ['Usher Sisters', 'Worship'], pushOptIn: true },
    { name: 'Leader Off', departments: ['Media'], pushOptIn: true }
  ],
  admins: [
    { name: 'Admin One', pushOptIn: true },
    { name: 'Admin Quiet', pushOptIn: false }
  ]
};

test('routes a direct department request to matching leaders and opted-in admins', () => {
  const routes = routeRequestNotifications({
    id: 'request-101',
    name: 'Member Requester',
    department: 'Worship',
    duty: 'Presider',
    date: '2026-08-08',
    service: 'Morning',
    status: 'pending'
  }, directory);

  assert.deepEqual(routes.map(route => route.recipient), [
    'Admin One',
    'Leader Shared',
    'Leader West'
  ]);
  assert.deepEqual(routes.find(route => route.recipient === 'Leader Shared').departments, [
    'Usher Sisters',
    'Worship'
  ]);
  assert.equal(routes.some(route => route.recipient === 'Leader Off'), false);
  assert.equal(routes.some(route => route.recipient === 'Admin Quiet'), false);
});

test('unions multiple department leaders and deduplicates a shared leader deterministically', () => {
  const request = {
    id: 'request-102',
    name: 'Member Requester',
    departments: ['Worship', 'Usher Sisters'],
    duty: 'Usher',
    status: 'pending'
  };
  const reversed = {
    ...directory,
    leaders: [...directory.leaders].reverse(),
    admins: [...directory.admins].reverse()
  };

  const first = routeRequestNotifications(request, directory);
  const second = routeRequestNotifications(request, reversed);
  assert.deepEqual(first, second);
  assert.equal(first.filter(route => route.recipient === 'Leader Shared').length, 1);
  assert.deepEqual(first.map(route => route.recipient), [
    'Admin One',
    'Leader Shared',
    'Leader West'
  ]);
});

test('accepts an injected push opt-in resolver and never routes opted-out recipients', () => {
  const routes = routeRequestNotifications({
    id: 'request-103',
    name: 'Member Requester',
    department: 'Worship',
    duty: 'Prayer',
    status: 'pending'
  }, {
    leaders: [
      { name: 'Leader A', departments: ['Worship'] },
      { name: 'Leader B', departments: ['Worship'] }
    ],
    admins: [{ name: 'Admin A' }]
  }, {
    pushOptIn: name => name !== 'Leader B' && name !== 'Admin A'
  });

  assert.deepEqual(routes.map(route => route.recipient), ['Leader A']);
  assert.equal(routes.every(route => route.pushOptIn), true);
});

test('uses token registration as push opt-in state for nested multi-duty conflicts', () => {
  const routes = routeConflictNotifications({
    id: 'conflict-103',
    member: 'Member Serving',
    duties: [
      { duty: 'Presider', department: 'Worship' },
      { duty: 'Usher', department: 'Usher Sisters' }
    ],
    status: 'open'
  }, {
    leaders: [
      { name: 'Leader Worship', departments: ['Worship'] },
      { name: 'Leader Usher', departments: ['Usher Sisters'] }
    ],
    admins: ['Admin Quiet'],
    tokens: [
      { name: 'Leader Worship', token: 'token-a' },
      { name: 'Leader Usher', token: 'token-b', enabled: false },
      { name: 'Admin Quiet', token: 'token-c', enabled: true }
    ]
  });

  assert.deepEqual(routes.map(route => route.recipient), [
    'Admin Quiet',
    'Leader Worship'
  ]);
});

test('dedupe keys are stable when object and directory order changes', () => {
  const requestA = {
    id: 'request-104',
    name: 'Member Requester',
    department: 'Worship',
    duty: 'Media',
    status: 'pending'
  };
  const requestB = {
    status: 'pending',
    duty: 'Media',
    department: 'Worship',
    name: 'Member Requester',
    id: 'request-104'
  };
  assert.equal(
    notificationDedupeKey('request', requestA, 'Leader West'),
    notificationDedupeKey('request', requestB, 'Leader West')
  );
  assert.notEqual(
    notificationDedupeKey('request', requestA, 'Leader West'),
    notificationDedupeKey('request', requestA, 'Admin One')
  );
});

test('suppresses resolved requests and conflicts', () => {
  assert.deepEqual(routeRequestNotifications({
    id: 'request-105',
    department: 'Worship',
    status: 'approved'
  }, directory), []);
  assert.deepEqual(routeConflictNotifications({
    id: 'conflict-105',
    departments: ['Worship'],
    resolvedAt: 1720000000000
  }, directory), []);
});

test('combined routing deduplicates by stable key across event order', () => {
  const request = {
    id: 'request-106',
    name: 'Member Requester',
    department: 'Worship',
    duty: 'Presider',
    status: 'pending'
  };
  const conflict = {
    id: 'conflict-106',
    member: 'Member Serving',
    departments: ['Worship'],
    duty: 'Usher',
    status: 'open'
  };
  const routes = routeNotifications({ request, conflict }, directory);
  assert.equal(routes.length, 6);
  assert.deepEqual(routes, routeNotifications([
    { type: 'conflict', item: conflict },
    { type: 'request', item: request },
    { type: 'request', item: request }
  ], directory));
});

test('infers the owning department from a duty and supports department leader maps', () => {
  const request = {
    id: 'request-107',
    name: 'Member Requester',
    duty: 'Translation #1',
    status: 'pending'
  };
  const routes = routeRequestNotifications(request, {
    departmentLeaders: {
      Translation: [{ name: 'Translation Lead', pushOptIn: true }],
      Worship: [{ name: 'Worship Lead', pushOptIn: true }]
    },
    admins: [{ name: 'Admin One', pushOptIn: true }]
  });

  assert.deepEqual(departmentsFor(request), ['Translation']);
  assert.deepEqual(routes.map(route => route.recipient), [
    'Admin One',
    'Translation Lead'
  ]);
});

test('routes a cross-department conflict to every involved department and the admin', () => {
  const routes = routeConflictNotifications({
    id: 'conflict-107',
    member: 'Member Serving',
    duties: [
      { duty: 'Translation #1' },
      { duty: 'Lobby Desk #1' }
    ],
    status: 'open'
  }, {
    leaders: [
      { name: 'Translation Lead', departments: ['Translation'], pushOptIn: true },
      { name: 'Lobby Lead', departments: ['Lobby'], pushOptIn: true },
      { name: 'Worship Lead', departments: ['Worship'], pushOptIn: true }
    ],
    admins: [{ name: 'Admin One', pushOptIn: true }]
  });

  assert.deepEqual(routes.map(route => route.recipient), [
    'Admin One',
    'Lobby Lead',
    'Translation Lead'
  ]);
});

test('an explicit per-record opt-out wins over a directory default', () => {
  const routes = routeRequestNotifications({
    id: 'request-108',
    name: 'Member Requester',
    duty: 'Translation #1',
    status: 'pending'
  }, {
    leaders: [
      { name: 'Quiet Translation Lead', departments: ['Translation'], pushOptIn: false },
      { name: 'Translation Lead', departments: ['Translation'], pushOptIn: true }
    ],
    defaultPushOptIn: true
  });

  assert.deepEqual(routes.map(route => route.recipient), ['Translation Lead']);
});

test('changes in conflict composition invalidate stale acknowledgements and keys', () => {
  const conflict = {
    id: 'conflict-108',
    member: 'Member Serving',
    duties: [{ duty: 'Translation #1', department: 'Translation' }],
    status: 'acknowledged',
    acknowledgedDuties: [{ duty: 'Lobby Desk #1', department: 'Lobby' }]
  };
  const directoryWithLeader = {
    leaders: [{ name: 'Translation Lead', departments: ['Translation'], pushOptIn: true }]
  };

  assert.notEqual(
    notificationDedupeKey('conflict', conflict, 'Translation Lead'),
    notificationDedupeKey('conflict', {
      ...conflict,
      duties: [{ duty: 'Translation #2', department: 'Translation' }]
    }, 'Translation Lead')
  );
  assert.equal(routeConflictNotifications(conflict, directoryWithLeader).length, 1);
  assert.equal(routeConflictNotifications({
    ...conflict,
    acknowledgedDuties: [{ duty: 'Translation #1', department: 'Translation' }]
  }, directoryWithLeader).length, 0);
});

test('supports pure seen-key filtering and a bound router factory', () => {
  const router = createNotificationRouter(directory);
  const request = {
    id: 'request-109',
    name: 'Member Requester',
    department: 'Worship',
    duty: 'Presider',
    status: 'pending'
  };
  const all = router.routeRequest(request);
  const filtered = router.route({ request }, {
    seenKeys: new Set([all[0].dedupeKey])
  });

  assert.equal(all.length, 3);
  assert.equal(filtered.length, 2);
  assert.equal(filtered.some(route => route.dedupeKey === all[0].dedupeKey), false);
});

test('accepts an injected duty resolver and bare event objects', () => {
  const resolver = duty => duty === 'Custom Slot' ? 'Special Department' : undefined;
  const request = {
    id: 'request-110',
    name: 'Member Requester',
    duty: 'Custom Slot',
    status: 'pending'
  };
  const directoryWithSpecialist = {
    leaders: [{ name: 'Special Lead', departments: ['special department'], pushOptIn: true }]
  };

  assert.deepEqual(departmentsFor(request, { departmentFor: resolver }), ['Special Department']);
  assert.deepEqual(
    routeNotifications([request], directoryWithSpecialist, { departmentFor: resolver })
      .map(route => route.recipient),
    ['Special Lead']
  );
});

test('suppresses an earlier pending event when the same item is resolved in the batch', () => {
  const pending = {
    id: 'request-111',
    name: 'Member Requester',
    department: 'Worship',
    duty: 'Presider',
    status: 'pending'
  };
  const resolved = { ...pending, status: 'approved' };

  assert.deepEqual(routeNotifications([
    { type: 'request', item: pending },
    { type: 'request', item: resolved }
  ], directory), []);
});
