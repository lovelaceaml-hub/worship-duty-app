import assert from 'node:assert/strict';
import test from 'node:test';
import workflows from '../department-workflows.js';

test('department membership separates active and archived people without global deletion', () => {
  const members = ['A. Ada', 'B. Ben'];
  const memberships = [
    { department: 'Translation', member: 'A. Ada', status: 'active' },
    { department: 'Translation', member: 'B. Ben', status: 'archived' },
    { department: 'Worship', member: 'B. Ben', status: 'active' }
  ];

  assert.deepEqual(workflows.activeDepartmentMembers(memberships, 'Translation'), ['A. Ada']);
  assert.deepEqual(workflows.archivedDepartmentMembers(memberships, 'Translation'), ['B. Ben']);

  const archived = workflows.removeDepartmentMembership(
    memberships, 'Translation', 'A. Ada', { at: 100, by: 'scheduler' }
  );
  assert.deepEqual(workflows.activeDepartmentMembers(archived, 'Translation'), []);
  assert.deepEqual(workflows.archivedDepartmentMembers(archived, 'Translation'), ['A. Ada', 'B. Ben']);
  assert.deepEqual(members, ['A. Ada', 'B. Ben']);
  assert.equal(archived.find(row => row.member === 'A. Ada').archivedBy, 'scheduler');
});

test('legacy department maps still expose active and archived membership', () => {
  const source = {
    Translation: ['A. Ada'],
    Worship: { active: ['B. Ben'], archived: ['C. Cara'] }
  };
  assert.deepEqual(workflows.activeDepartmentMembers(source, 'Translation'), ['A. Ada']);
  assert.deepEqual(workflows.activeDepartmentMembers(source, 'Worship'), ['B. Ben']);
  assert.deepEqual(workflows.archivedDepartmentMembers(source, 'Worship'), ['C. Cara']);
});

test('request routing excludes the requester and records status audit', () => {
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

test('conflicts route to department leaders and acknowledgement follows composition', () => {
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

test('authorized outstanding aggregation counts only visible pending work', () => {
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
