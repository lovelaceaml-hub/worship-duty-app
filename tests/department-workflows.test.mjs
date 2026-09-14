import { strict as assert } from 'node:assert';
import test from 'node:test';
import workflows from '../department-workflows.js';

const {
  MEMBERSHIP_ACTIVE,
  MEMBERSHIP_ARCHIVED,
  REQUEST_PENDING,
  REQUEST_RESOLVED,
  activeConflicts,
  acknowledgeConflict,
  actionableCounts,
  archiveDepartmentMember,
  conflictComposition,
  conflictAcknowledgementValid,
  conflictNeedsAttention,
  departmentForDuty,
  isConflictAcknowledged,
  isIntentionalPrayerUsherPair,
  membersForDepartment,
  membershipState,
  routeConflict,
  routeRequest,
  resolveRequest,
  upsertDepartmentMembership
} = workflows;

test('archives membership only within the selected department', () => {
  const memberships = [
    { department: 'Translation', member: 'S. Paola', status: MEMBERSHIP_ACTIVE },
    { department: 'Lobby', member: 'S. Paola', status: MEMBERSHIP_ACTIVE },
    { department: 'Translation', member: 'M. Chloe', status: MEMBERSHIP_ACTIVE }
  ];

  const next = archiveDepartmentMember(memberships, 'Translation', 'S. Paola');

  assert.equal(membershipState(next, 'Translation', 'S. Paola'), MEMBERSHIP_ARCHIVED);
  assert.equal(membershipState(next, 'Lobby', 'S. Paola'), MEMBERSHIP_ACTIVE);
  assert.equal(membershipState(next, 'Translation', 'M. Chloe'), MEMBERSHIP_ACTIVE);
  assert.deepEqual(membersForDepartment(next, 'Translation'), ['M. Chloe']);
  assert.deepEqual(membersForDepartment(next, 'Translation', { includeArchived: true }), [
    'M. Chloe',
    'S. Paola'
  ]);
  assert.deepEqual(memberships, [
    { department: 'Translation', member: 'S. Paola', status: MEMBERSHIP_ACTIVE },
    { department: 'Lobby', member: 'S. Paola', status: MEMBERSHIP_ACTIVE },
    { department: 'Translation', member: 'M. Chloe', status: MEMBERSHIP_ACTIVE }
  ]);
});

test('reactivating a department membership preserves the other department records', () => {
  const memberships = [
    { department: 'Translation', member: 'S. Paola', status: MEMBERSHIP_ARCHIVED, history: ['old duty'] },
    { department: 'Lobby', member: 'S. Paola', status: MEMBERSHIP_ACTIVE }
  ];
  const next = upsertDepartmentMembership(memberships, {
    department: 'Translation',
    member: 'S. Paola',
    status: MEMBERSHIP_ACTIVE
  });

  assert.equal(membershipState(next, 'Translation', 'S. Paola'), MEMBERSHIP_ACTIVE);
  assert.deepEqual(next[0].history, ['old duty']);
  assert.equal(membershipState(next, 'Lobby', 'S. Paola'), MEMBERSHIP_ACTIVE);
});

test('routes requests by duty and sends them to every leader plus explicit admins', () => {
  const route = routeRequest(
    {
      id: 'req-translation-1',
      duty: 'Translation #1',
      status: REQUEST_PENDING,
      originalRequester: 'M. Chloe'
    },
    {
      Translation: ['S. Paola', 'S. Paola'],
      Worship: ['E. Simon']
    },
    { adminNames: ['B. Anthony'] }
  );

  assert.deepEqual(route.departments, ['Translation']);
  assert.deepEqual(route.recipients, ['S. Paola', 'B. Anthony']);
  assert.equal(route.actionable, true);
  assert.equal(route.unroutable, false);

  const worshipRoute = routeRequest(
    { duty: 'Presider', status: REQUEST_PENDING },
    { Worship: ['E. Simon'] },
    { adminNames: ['B. Anthony'] }
  );
  assert.deepEqual(worshipRoute.recipients, ['E. Simon', 'B. Anthony']);
});

test('modern request routing excludes the requester from leaders and admins', () => {
  const route = routeRequest(
    {
      duty: 'Translation #1',
      status: REQUEST_PENDING,
      requester: 'S. Paola'
    },
    { Translation: ['S. Paola', 'B. Ben'] },
    { adminNames: ['S. Paola', 'B. Anthony'] }
  );

  assert.deepEqual(route.recipients, ['B. Ben', 'B. Anthony']);
  assert.deepEqual(route.allRecipients, ['B. Ben', 'B. Anthony']);
});

test('does not route an unresolved request to everyone when its duty is unknown', () => {
  const route = routeRequest(
    { duty: 'Unknown Duty', status: REQUEST_PENDING },
    { Translation: ['S. Paola'], Lobby: ['S. Anessa'] },
    { adminNames: ['B. Anthony'] }
  );

  assert.equal(route.department, null);
  assert.deepEqual(route.recipients, []);
  assert.equal(route.unroutable, true);
});

test('resolving a request is globally visible and preserves audit history', () => {
  const pending = {
    id: 'req-1',
    duty: 'Lobby Desk #1',
    department: 'Lobby',
    status: REQUEST_PENDING,
    originalRequester: 'M. Chloe',
    createdAt: 100,
    audit: [{ action: 'created', by: 'M. Chloe', at: 100 }]
  };

  const resolved = resolveRequest(pending, {
    resolvedBy: 'S. Anessa',
    resolvedAt: 200,
    notes: 'Assigned a substitute'
  });

  assert.equal(resolved.status, REQUEST_RESOLVED);
  assert.equal(resolved.resolvedBy, 'S. Anessa');
  assert.equal(resolved.resolvedAt, 200);
  assert.equal(resolved.originalRequester, 'M. Chloe');
  assert.equal(resolved.notes, 'Assigned a substitute');
  assert.deepEqual(resolved.audit, [
    { action: 'created', by: 'M. Chloe', at: 100 },
    {
      action: 'resolved',
      by: 'S. Anessa',
      resolvedBy: 'S. Anessa',
      at: 200,
      resolvedAt: 200,
      notes: 'Assigned a substitute'
    }
  ]);
  assert.equal(pending.status, REQUEST_PENDING);
  assert.equal(routeRequest(resolved, { Lobby: ['S. Anessa'] }, { adminNames: ['B. Anthony'] }).recipients.length, 0);
});

test('routes a cross-department conflict to both departments and the admin', () => {
  const conflict = {
    id: 'conflict-1',
    serviceId: '2026-09-20_morning',
    member: 'M. Chloe',
    duties: ['Translation #1', 'Lobby Desk #1']
  };
  const route = routeConflict(
    conflict,
    {
      Translation: ['S. Paola'],
      Lobby: ['S. Anessa']
    },
    { adminNames: ['B. Anthony'] }
  );

  assert.deepEqual(route.departments, ['Translation', 'Lobby']);
  assert.deepEqual(route.recipients, ['S. Paola', 'S. Anessa', 'B. Anthony']);
  assert.equal(route.actionable, true);
});

test('conflict acknowledgement is shared and invalidated by a composition change', () => {
  const conflict = {
    id: 'conflict-2',
    serviceId: '2026-09-20_evening',
    member: 'M. Chloe',
    duties: ['Translation #1', 'Lobby Desk #1']
  };
  const acknowledged = acknowledgeConflict(conflict, {
    acknowledgedBy: 'S. Paola',
    acknowledgedAt: 300
  });

  assert.equal(isConflictAcknowledged(acknowledged), true);
  assert.equal(conflictNeedsAttention(acknowledged), false);
  assert.equal(conflictComposition(conflict), acknowledged.acknowledgement.composition);

  const changed = { ...acknowledged, duties: ['Translation #2', 'Lobby Desk #1'] };
  assert.equal(isConflictAcknowledged(changed), false);
  assert.equal(conflictNeedsAttention(changed), true);
  assert.equal(routeConflict(changed, {
    Translation: ['S. Paola'],
    Lobby: ['S. Anessa']
  }).acknowledgementState, 'stale');
});

test('conflict acknowledgement validity requires actor, timestamp, and composition', () => {
  const conflict = {
    serviceId: 'svc-ack-validity',
    member: 'M. Chloe',
    duties: ['Translation #1', 'Lobby Desk #1']
  };
  const composition = conflictComposition(conflict);

  assert.equal(conflictAcknowledgementValid({ compositionKey: composition }, conflict), false);
  assert.equal(conflictAcknowledgementValid({
    acknowledgedBy: 'S. Paola',
    compositionKey: composition
  }, conflict), false);
  assert.equal(conflictAcknowledgementValid({
    acknowledgedAt: 100,
    compositionKey: composition
  }, conflict), false);
  assert.equal(conflictAcknowledgementValid({
    acknowledgedBy: 'S. Paola',
    acknowledgedAt: 100,
    compositionKey: 'different-composition'
  }, conflict), false);
  assert.equal(conflictAcknowledgementValid({
    acknowledgedBy: 'S. Paola',
    acknowledgedAt: 100,
    compositionKey: composition
  }, conflict), true);
});

test('acknowledgeConflict preserves legacy at and timestamp fields', () => {
  const conflict = {
    serviceId: 'svc-legacy-ack-time',
    member: 'M. Chloe',
    duties: ['Translation #1', 'Lobby Desk #1']
  };

  const atAcknowledgement = acknowledgeConflict(conflict, { at: '300', by: 'scheduler' });
  assert.equal(atAcknowledgement.acknowledgedAt, 300);
  assert.equal(atAcknowledgement.acknowledgedBy, 'scheduler');
  assert.equal(conflictAcknowledgementValid(atAcknowledgement, conflict), true);

  const timestampAcknowledgement = acknowledgeConflict(conflict, {
    timestamp: 400,
    actor: 'coordinator'
  });
  assert.equal(timestampAcknowledgement.acknowledgedAt, 400);
  assert.equal(timestampAcknowledgement.acknowledgedBy, 'coordinator');
  assert.equal(conflictAcknowledgementValid(timestampAcknowledgement, conflict), true);
});

test('activeConflicts uses the shared predicate for embedded acknowledgements and resolved status', () => {
  const conflict = {
    serviceId: 'svc-embedded-state',
    member: 'M. Chloe',
    duties: ['Translation #1', 'Lobby Desk #1']
  };
  const acknowledged = acknowledgeConflict(conflict, {
    acknowledgedBy: 'S. Paola',
    acknowledgedAt: 300
  });
  const resolved = { ...conflict, status: REQUEST_RESOLVED };

  assert.deepEqual(activeConflicts([acknowledged]), []);
  assert.deepEqual(activeConflicts([resolved]), []);
  assert.equal(activeConflicts([conflict]).length, 1);
});

test('a shared acknowledgement requires an actor and timestamp', () => {
  const conflict = {
    serviceId: 'svc-ack-fields',
    member: 'M. Chloe',
    duties: ['Translation #1', 'Lobby Desk #1']
  };
  const composition = conflictComposition(conflict);

  assert.equal(isConflictAcknowledged(conflict, {
    acknowledgedBy: 'S. Paola',
    duties: conflict.duties,
    composition
  }), false);
  assert.equal(isConflictAcknowledged(conflict, {
    acknowledgedAt: 100,
    duties: conflict.duties,
    composition
  }), false);
});

test('preserves the intentional single prayer plus usher pair exception', () => {
  assert.equal(isIntentionalPrayerUsherPair(['Opening Prayer', 'Usher Sisters']), true);
  assert.equal(conflictNeedsAttention({
    serviceId: 'svc-1',
    member: 'M. Chloe',
    duties: ['Opening Prayer', 'Usher Sisters']
  }), false);
  assert.equal(isIntentionalPrayerUsherPair(['Opening Prayer', 'Usher Sisters', 'Lobby']), false);
});

test('counts only authorized actionable items and aggregates departments', () => {
  const counts = actionableCounts({
    requests: [
      { id: 'req-translation', duty: 'Translation #1', status: REQUEST_PENDING },
      { id: 'req-resolved', duty: 'Translation #2', status: REQUEST_RESOLVED },
      { id: 'req-duplicate', department: 'Lobby', status: REQUEST_PENDING },
      { id: 'req-duplicate', department: 'Lobby', status: REQUEST_PENDING }
    ],
    conflicts: [
      {
        id: 'conflict-cross',
        member: 'M. Chloe',
        serviceId: 'svc-1',
        duties: ['Translation #1', 'Lobby Desk #1']
      },
      {
        id: 'conflict-acknowledged',
        member: 'M. Chloe',
        serviceId: 'svc-2',
        duties: ['Translation #1', 'Lobby Desk #1'],
        acknowledgement: {
          acknowledgedBy: 'S. Paola',
          acknowledgedAt: 100,
          duties: ['Translation #1', 'Lobby Desk #1'],
          composition: conflictComposition({
            member: 'M. Chloe',
            serviceId: 'svc-2',
            duties: ['Translation #1', 'Lobby Desk #1']
          })
        }
      }
    ],
    leadersByDepartment: {
      Translation: ['S. Paola'],
      Lobby: ['S. Anessa']
    },
    adminNames: ['B. Anthony'],
    authorizedDepartments: ['Translation']
  });

  assert.equal(counts.requests, 1);
  assert.equal(counts.conflicts, 1);
  assert.equal(counts.total, 2);
  assert.deepEqual(counts.byDepartment, {
    Translation: { requests: 1, conflicts: 1 },
    Lobby: { requests: 0, conflicts: 1 }
  });
  assert.equal(counts.message, '1 request and 1 conflict need your attention');

  const adminCounts = actionableCounts({
    requests: [{ id: 'req-translation', duty: 'Translation #1', status: REQUEST_PENDING }],
    conflicts: [],
    leadersByDepartment: { Translation: ['S. Paola'] },
    authorization: { all: true }
  });
  assert.equal(adminCounts.total, 1);
});

test('actionable counts do not let a resolved duplicate hide a pending duplicate', () => {
  const pendingRequest = {
    id: 'request-duplicate',
    duty: 'Translation #1',
    status: REQUEST_PENDING
  };
  const resolvedRequest = { ...pendingRequest, status: REQUEST_RESOLVED };
  const pendingConflict = {
    id: 'conflict-duplicate',
    serviceId: 'svc-duplicate',
    member: 'M. Chloe',
    duties: ['Translation #1', 'Lobby Desk #1']
  };
  const resolvedConflict = { ...pendingConflict, status: REQUEST_RESOLVED };

  const counts = actionableCounts({
    requests: [resolvedRequest, pendingRequest],
    conflicts: [resolvedConflict, pendingConflict],
    leadersByDepartment: {
      Translation: ['S. Paola'],
      Lobby: ['S. Anessa']
    },
    authorizedDepartments: ['Translation', 'Lobby']
  });

  assert.equal(counts.requests, 1);
  assert.equal(counts.conflicts, 1);
  assert.equal(counts.total, 2);
});

test('maps the requested duty families to their owning departments', () => {
  assert.equal(departmentForDuty('Translation #1'), 'Translation');
  assert.equal(departmentForDuty('Usher Brothers #2'), 'Usher Brothers');
  assert.equal(departmentForDuty('Media Booth #1'), 'Media');
  assert.equal(departmentForDuty('Presider'), 'Worship');
  assert.equal(departmentForDuty('No Such Duty'), null);
  assert.equal(departmentForDuty('Presider', { Presider: 'Special Events' }), 'Special Events');
});

test('legacy membership helpers retain active and archived records', () => {
  const members = ['A. Ada', 'B. Ben'];
  const memberships = [
    { department: 'Translation', member: 'A. Ada', status: 'active' },
    { department: 'Translation', member: 'B. Ben', status: 'archived' },
    { department: 'Worship', member: 'B. Ben', status: 'active' }
  ];

  assert.deepEqual(workflows.activeDepartmentMembers(memberships, 'Translation'), ['A. Ada']);
  assert.deepEqual(workflows.archivedDepartmentMembers(memberships, 'Translation'), ['B. Ben']);
  const archived = workflows.removeDepartmentMembership(
    memberships,
    'Translation',
    'A. Ada',
    { at: 100, by: 'scheduler' }
  );
  assert.deepEqual(workflows.activeDepartmentMembers(archived, 'Translation'), []);
  assert.deepEqual(workflows.archivedDepartmentMembers(archived, 'Translation'), ['A. Ada', 'B. Ben']);
  assert.deepEqual(members, ['A. Ada', 'B. Ben']);
  assert.equal(archived.find(row => row.member === 'A. Ada').archivedBy, 'scheduler');
});

test('legacy grouped department maps still expose active and archived membership', () => {
  const source = {
    Translation: ['A. Ada'],
    Worship: { active: ['B. Ben'], archived: ['C. Cara'] }
  };
  assert.deepEqual(workflows.activeDepartmentMembers(source, 'Translation'), ['A. Ada']);
  assert.deepEqual(workflows.activeDepartmentMembers(source, 'Worship'), ['B. Ben']);
  assert.deepEqual(workflows.archivedDepartmentMembers(source, 'Worship'), ['C. Cara']);
});

test('legacy request routing excludes requester and preserves terminal audit transitions', () => {
  const request = workflows.createChangeRequest({
    serviceId: '2026-09-20_morning',
    duty: 'Translation #1',
    department: 'Translation',
    requester: 'A. Ada',
    note: 'I am unavailable',
    createdAt: 100
  });
  const route = workflows.routeChangeRequest(request, {
    departmentLeaders: { Translation: ['A. Ada', 'B. Ben'] },
    scheduler: 'C. Cara'
  });
  assert.deepEqual(route.recipients, ['B. Ben']);
  assert.equal(route.route, 'department-leaders');
  assert.equal(request.status, 'pending');
  assert.equal(request.audit[0].action, 'created');

  const resolved = workflows.transitionRequestStatus(request, 'approved', {
    at: 200,
    by: 'B. Ben',
    reason: 'Covered by another member'
  });
  assert.equal(resolved.status, 'approved');
  assert.equal(resolved.resolvedAt, 200);
  assert.equal(resolved.resolvedBy, 'B. Ben');
  assert.deepEqual(resolved.audit.at(-1), {
    action: 'status-changed',
    at: 200,
    by: 'B. Ben',
    from: 'pending',
    to: 'approved',
    reason: 'Covered by another member'
  });
  assert.throws(() => workflows.transitionRequestStatus(resolved, 'declined'), /cannot transition/);
  assert.equal(workflows.requestId('2026-09-20_morning', 'Translation #1', 100), request.id);
  assert.deepEqual(workflows.routeChangeRequest(
    { ...request, requester: 'B. Ben' },
    { departmentLeaders: { Translation: ['B. Ben'] }, scheduler: 'C. Cara' }
  ).recipients, ['C. Cara']);
});

test('legacy conflict composition and acknowledgement helpers remain compatible', () => {
  const service = {
    id: '2026-09-20_morning',
    assignments: {
      'Translation #1': 'A. Ada',
      'Translation #2': 'A. Ada',
      Presider: 'B. Ben',
      'Prayer of Thanks': 'B. Ben',
      'Usher Door': 'B. Ben'
    }
  };
  const conflicts = workflows.composeConflicts(service, {
    dutyDepartments: {
      'Translation #1': 'Translation',
      'Translation #2': 'Translation',
      Presider: 'Worship',
      'Prayer of Thanks': 'Worship',
      'Usher Door': 'Usher Sisters'
    }
  });
  assert.equal(conflicts.length, 2);
  const ada = conflicts.find(conflict => conflict.member === 'A. Ada');
  const ben = conflicts.find(conflict => conflict.member === 'B. Ben');
  assert.deepEqual(ada.duties, ['Translation #1', 'Translation #2']);
  assert.deepEqual(ben.duties, ['Prayer of Thanks', 'Presider', 'Usher Door']);

  const ack = workflows.acknowledgeSharedConflict(ada, { at: 300, by: 'scheduler' });
  assert.equal(workflows.conflictAcknowledgementValid(ack, ada), true);
  assert.equal(workflows.activeConflicts(conflicts, [ack]).length, 1);
  assert.equal(workflows.routeConflict(ada, {
    departmentLeaders: { Translation: ['B. Ben'] },
    scheduler: 'C. Cara'
  }).recipients[0], 'B. Ben');

  const changed = { ...ada, duties: ['Translation #1', 'Translation #2', 'Translation #3'] };
  assert.equal(workflows.conflictAcknowledgementValid(ack, changed), false);
  assert.equal(workflows.activeConflicts([changed], [ack]).length, 1);
  assert.deepEqual(workflows.invalidateSharedAcknowledgements({ 'A. Ada': ada.duties }, [changed]), {});
});

test('legacy authorized aggregation counts only visible pending work', () => {
  const items = [
    { id: 'r1', kind: 'request', department: 'Translation', status: 'pending' },
    { id: 'r2', kind: 'request', department: 'Worship', status: 'pending' },
    { id: 'r3', kind: 'request', department: 'Translation', status: 'approved' },
    { id: 'c1', kind: 'conflict', department: 'Translation', active: true },
    { id: 'c2', kind: 'conflict', department: 'Worship', active: true }
  ];
  const result = workflows.aggregateAuthorizedOutstanding(items, { departments: ['Translation'] });
  assert.equal(result.total, 2);
  assert.deepEqual(result.byKind, { request: 1, conflict: 1 });
  assert.deepEqual(result.byDepartment, { Translation: 2 });
  assert.deepEqual(result.byStatus, { pending: 1, active: 1 });
  assert.equal(workflows.authorizedOutstandingCount(items, { role: 'scheduler' }), 4);
});
