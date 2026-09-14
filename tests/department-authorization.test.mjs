import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const authz = require('../functions/department-auth.js');
const { createDepartmentHandlers } = require('../functions/department-handlers.js');

const memberUid = 'member-uid-fictional-1';
const leaderUid = 'leader-uid-fictional-1';
const otherLeaderUid = 'leader-uid-fictional-2';
const adminUid = 'admin-uid-fictional-1';

function actor(uid, roles, departments = []) {
  return { uid, token: { uid, roles, departments, memberUid: uid } };
}

const member = actor(memberUid, ['member']);
const leader = actor(leaderUid, ['departmentLeader'], ['Translation']);
const otherLeader = actor(otherLeaderUid, ['departmentLeader'], ['Media']);
const admin = actor(adminUid, ['admin']);

function profile(overrides = {}) {
  return {
    memberUid,
    uid: memberUid,
    departmentId: 'Translation',
    department: 'Translation',
    role: 'member',
    memberName: 'Riley Example',
    status: 'active',
    eligibleDuties: ['Translation #1'],
    schedulable: true,
    availability: {
      recurring: { morning: 'available' },
      exceptions: {}
    },
    ...overrides
  };
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

class FakeDoc {
  constructor(store, path) {
    this.store = store;
    this.path = path;
    this.id = path[path.length - 1];
  }

  collection(name) {
    return new FakeCollection(this.store, this.path.concat(name));
  }

  async get() {
    const value = this.store.get(this.path.join('/'));
    return {
      exists: value !== undefined,
      data: () => clone(value)
    };
  }

  async set(value) {
    this.store.set(this.path.join('/'), clone(value));
  }
}

class FakeCollection {
  constructor(store, path) {
    this.store = store;
    this.path = path;
  }

  doc(id) {
    return new FakeDoc(this.store, this.path.concat(String(id)));
  }

  async add(value) {
    const id = `audit-${this.store.nextAudit++}`;
    await this.doc(id).set(value);
    return { id };
  }

  async get() {
    const prefix = `${this.path.join('/')}/`;
    const docs = [];
    for (const [key, value] of this.store.entries()) {
      if (!key.startsWith(prefix) || key.slice(prefix.length).includes('/')) continue;
      docs.push({
        id: key.slice(prefix.length),
        data: () => clone(value)
      });
    }
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeDb {
  constructor() {
    this.values = new Map();
    this.nextAudit = 1;
  }

  collection(name) {
    return new FakeCollection(this.values, [name]);
  }

  read(path) {
    return clone(this.values.get(path));
  }

  async runTransaction(callback) {
    const writes = [];
    const transaction = {
      get(reference) {
        return reference.get();
      },
      set(reference, value, options = {}) {
        writes.push(['set', reference, clone(value), options]);
      },
      delete(reference) {
        writes.push(['delete', reference]);
      }
    };
    const result = await callback(transaction);
    writes.forEach(([operation, reference, value, options]) => {
      const key = reference.path.join('/');
      if (operation === 'delete') {
        reference.store.delete(key);
        return;
      }
      if (options && options.merge) {
        const before = reference.store.get(key) || {};
        reference.store.set(key, {
          ...clone(before),
          ...value,
          assignments: value.assignments
            ? { ...(before.assignments || {}), ...value.assignments }
            : before.assignments
        });
        return;
      }
      reference.store.set(key, value);
    });
    return result;
  }
}

function assignment(overrides = {}) {
  return {
    departmentId: 'Translation',
    memberUid,
    duty: 'Translation #1',
    serviceId: '2026-09-20-morning',
    serviceDate: '2026-09-20',
    serviceTime: 'morning',
    ...overrides
  };
}

test('profile reads and writes stay UID and department scoped', () => {
  assert.equal(authz.authorizeProfileRead(member, profile()).allowed, true);
  assert.equal(authz.authorizeProfileRead(otherLeader, profile()).reason, 'cross-department');
  assert.equal(authz.authorizeProfileRead(leader, profile()).allowed, true);

  const availabilityUpdate = {
    ...profile(),
    availability: { recurring: { morning: 'unavailable' }, exceptions: {} },
    updatedByUid: memberUid,
    updatedAt: 10
  };
  assert.equal(authz.authorizeProfileUpdate(member, profile(), availabilityUpdate).allowed, true);

  const escalation = {
    ...availabilityUpdate,
    role: 'leader'
  };
  assert.equal(authz.authorizeProfileUpdate(member, profile(), escalation).reason, 'immutable-identity');

  const crossDepartment = {
    ...availabilityUpdate,
    departmentId: 'Media',
    department: 'Media'
  };
  assert.equal(authz.authorizeProfileUpdate(member, profile(), crossDepartment).reason, 'immutable-identity');

  const leaderPatch = {
    ...profile(),
    status: 'inactive',
    schedulable: false,
    updatedByUid: leaderUid,
    updatedAt: 11
  };
  assert.equal(authz.authorizeProfileUpdate(leader, profile(), leaderPatch).allowed, true);
  assert.equal(authz.authorizeProfileUpdate(otherLeader, profile(), {
    ...leaderPatch,
    updatedByUid: otherLeaderUid
  }).reason, 'profile-write-not-authorized');
  const legacyAliasProfile = { ...profile(), active: true, duties: ['Translation #1'], isSchedulable: true };
  const legacyAliasPatch = {
    ...legacyAliasProfile,
    status: 'inactive',
    active: false,
    schedulable: false,
    isSchedulable: false,
    updatedByUid: leaderUid,
    updatedAt: 11
  };
  assert.equal(authz.authorizeProfileUpdate(leader, legacyAliasProfile, legacyAliasPatch).allowed, true);

  const forgedField = { ...availabilityUpdate, isAdmin: true };
  assert.equal(authz.authorizeProfileUpdate(member, profile(), forgedField).reason, 'field-not-allowed');
  assert.equal(authz.authorizeProfileUpdate(admin, profile(), {
    ...profile(),
    status: 'inactive',
    updatedByUid: adminUid,
    updatedAt: 12
  }).allowed, true);
  assert.throws(() => authz.normalizeProfilePatch({ status: 'suspended' }), /patch\.status/);
  assert.throws(() => authz.normalizeProfilePatch({ schedulable: 'yes' }), /patch\.schedulable/);
  assert.throws(() => authz.normalizeProfilePatch({ availability: { recurring: { morning: 'maybe' } } }),
    /patch\.availability/);
});

test('profile creation and patch helpers reject protected fields', () => {
  assert.equal(authz.authorizeProfileCreate(leader, profile(), {
    departmentId: 'Translation',
    memberUid
  }).allowed, true);
  assert.equal(authz.authorizeProfileCreate(otherLeader, profile(), {
    departmentId: 'Translation',
    memberUid
  }).reason, 'cross-department');
  assert.equal(authz.authorizeProfileCreate(leader, { ...profile(), role: 'leader' }, {
    departmentId: 'Translation',
    memberUid
  }).reason, 'role-not-allowed');
  assert.throws(() => authz.normalizeProfilePatch({ role: 'leader' }), /protected or unknown field/);
  assert.throws(() => authz.normalizeProfilePatch({ departmentId: 'Media' }), /protected or unknown field/);
  assert.throws(() => authz.normalizeProfilePatch({ availability: {}, role: 'leader' }),
    /protected or unknown field/);
});

test('availability aliases normalize to canonical exceptions and reject ambiguity', () => {
  const normalized = authz.normalizeProfilePatch({ availability: {
    recurring: { morning: 'available' },
    dateExceptions: { '2026-09-20': { morning: 'unavailable' } }
  } }).availability;
  assert.deepEqual(normalized, {
    recurring: { morning: 'available' },
    exceptions: { '2026-09-20': { morning: 'unavailable' } }
  });
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'dateExceptions'), false);
  assert.throws(() => authz.normalizeProfilePatch({ availability: {
    recurring: {},
    exceptions: {},
    dateExceptions: {}
  } }), /patch\.availability/);
});

test('normal assignments require active eligible schedulable available targets', () => {
  assert.equal(authz.authorizeAssignment(leader, assignment(), profile()).allowed, true);
  assert.equal(authz.authorizeAssignment(otherLeader, assignment(), profile()).reason, 'cross-department');
  assert.equal(authz.authorizeAssignment(
    leader,
    assignment({ duty: 'Sermon' }),
    profile()
  ).reason, 'duty-department-mismatch');
  assert.equal(authz.authorizeAssignment(leader, assignment(), profile({ status: 'inactive' })).reason, 'target-inactive');
  assert.equal(authz.authorizeAssignment(leader, assignment({ duty: 'Translation #2' }), profile()).reason, 'target-ineligible');
  assert.equal(authz.authorizeAssignment(leader, assignment(), profile({ schedulable: false })).reason, 'target-not-schedulable');
  assert.equal(authz.authorizeAssignment(
    leader,
    assignment(),
    profile({ availability: { recurring: { morning: 'unavailable' }, exceptions: {} } })
  ).reason, 'target-unavailable');
  assert.equal(authz.authorizeAssignment(
    leader,
    assignment({ serviceDate: '2026-09-21' }),
    profile({ availability: {
      recurring: { morning: 'available' },
      exceptions: { '2026-09-21': { morning: 'unavailable' } }
    } })
  ).reason, 'target-unavailable');
});

test('date exceptions override recurring availability at DST boundary dates', () => {
  const spring = profile({ availability: {
    recurring: { morning: 'available' },
    exceptions: { '2026-03-08': { morning: 'unavailable' } }
  } });
  const fall = profile({ availability: {
    recurring: { morning: 'unavailable' },
    exceptions: { '2026-11-01': { morning: 'available' } }
  } });
  assert.equal(authz.authorizeAssignment(leader, assignment({ serviceDate: '2026-03-08' }), spring).reason,
    'target-unavailable');
  assert.equal(authz.authorizeAssignment(leader, assignment({ serviceDate: '2026-11-01' }), fall).allowed, true);
});

test('administrator override is explicit, audited by the handler, and profile-neutral', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 500 });
  const stored = profile({ status: 'inactive', schedulable: false });
  await db.collection('departments').doc('Translation').collection('members').doc(memberUid).set(stored);
  await db.collection('schedule').doc('2026-09-20-morning').set({
    date: '2026-09-20', service: 'Morning', assignments: {}
  });
  const before = db.read(`departments/Translation/members/${memberUid}`);

  assert.equal(authz.authorizeAssignmentOverride(admin, assignment({ override: true, overrideReason: 'Emergency coverage' }), stored).allowed, true);
  assert.equal(authz.authorizeAssignmentOverride(leader, assignment({ override: true, overrideReason: 'Emergency coverage' }), stored).reason, 'administrator-required');
  assert.equal(authz.authorizeAssignmentOverride(admin, assignment({ override: true }), stored).reason, 'explicit-override-required');
  assert.equal(authz.authorizeAssignmentOverride(admin, assignment({
    duty: 'Sermon',
    override: true,
    overrideReason: 'Emergency coverage'
  }), stored).reason, 'duty-department-mismatch');

  const result = await handlers.overrideDepartmentAssignment({
    auth: admin,
    data: {
      assignmentId: 'fictional-assignment-1',
      ...assignment({ override: true, overrideReason: 'Emergency coverage' })
    }
  });
  assert.equal(result.override, true);
  assert.equal(result.profileMutated, false);
  assert.equal(result.assignment.authorization, 'administrator-override');
  assert.equal(result.assignment.overrideReason, 'Emergency coverage');
  assert.deepEqual(db.read(`departments/Translation/members/${memberUid}`), before);
  assert.equal(db.read(`audit/${result.auditId}`).profileMutated, false);
  assert.equal(db.read(`audit/${result.auditId}`).action, 'administrator-assignment-override');
  assert.equal(db.read('departmentAssignments/fictional-assignment-1'), undefined);
  assert.equal(
    db.read(`departmentAssignments/${result.assignment.id}`).auditId,
    result.auditId
  );

  await assert.rejects(
    handlers.overrideDepartmentAssignment({
      auth: admin,
      data: {
        assignmentId: 'fictional-assignment-wrong-duty',
        ...assignment({ duty: 'Sermon', override: true, overrideReason: 'Emergency coverage' })
      }
    }),
    error => error.code === 'failed-precondition' && /duty-department-mismatch/.test(error.message)
  );
});

test('callable handlers share the same boundary for availability and normal assignment', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 700 });
  await db.collection('departments').doc('Translation').collection('members').doc(memberUid).set(profile());
  await db.collection('schedule').doc('2026-09-20-morning').set({
    date: '2026-09-20', service: 'Morning', assignments: {}
  });

  const updated = await handlers.updateMemberAvailability({
    auth: member,
    data: {
      departmentId: 'Translation',
      memberUid,
      availability: { recurring: { morning: 'unavailable' }, exceptions: {} }
    }
  });
  assert.equal(updated.profile.updatedByUid, memberUid);
  assert.deepEqual(updated.profile.availability.recurring, { morning: 'unavailable' });

  await assert.rejects(
    handlers.updateDepartmentProfile({
      auth: member,
      data: { departmentId: 'Translation', memberUid, status: 'inactive' }
    }),
    error => error.code === 'permission-denied'
  );

  await assert.rejects(
    handlers.assignDepartmentDuty({
      auth: leader,
      data: assignment()
    }),
    error => error.code === 'failed-precondition' && /target-unavailable/.test(error.message)
  );

  await handlers.updateMemberAvailability({
    auth: member,
    data: {
      departmentId: 'Translation',
      memberUid,
      availability: { recurring: { morning: 'available' }, exceptions: {} }
    }
  });
  const assigned = await handlers.assignDepartmentDuty({ auth: leader, data: assignment() });
  assert.equal(assigned.override, false);
  assert.equal(assigned.assignment.authorization, 'normal-eligible-assignment');
  assert.equal(db.read('schedule/2026-09-20-morning').assignments['Translation #1'], 'Riley Example');

  const attackerChosen = await handlers.assignDepartmentDuty({
    auth: leader,
    data: { assignmentId: 'existing-record-owned-by-someone-else', ...assignment() }
  });
  assert.equal(db.read('departmentAssignments/existing-record-owned-by-someone-else'), undefined);
  assert.equal(db.read(`departmentAssignments/${attackerChosen.assignment.id}`).memberUid, memberUid);

  const replacementUid = 'member-uid-fictional-2';
  await db.collection('departments').doc('Translation').collection('members').doc(replacementUid).set(profile({
    memberUid: replacementUid,
    uid: replacementUid,
    memberName: 'Riley Example'
  }));
  const replacement = await handlers.assignDepartmentDuty({
    auth: leader,
    data: assignment({ memberUid: replacementUid, memberName: 'Riley Example' })
  });
  assert.equal(replacement.assignment.id, assigned.assignment.id);
  assert.equal(db.read(`departmentAssignments/${assigned.assignment.id}`).memberUid, replacementUid);

  await handlers.unassignDepartmentDuty({
    auth: leader,
    data: {
      departmentId: 'Translation',
      duty: 'Translation #1',
      serviceId: '2026-09-20-morning',
      serviceDate: '2026-09-20',
      serviceTime: 'morning'
    }
  });
  assert.equal(db.read(`departmentAssignments/${assigned.assignment.id}`), undefined);
  assert.equal(db.read('schedule/2026-09-20-morning').assignments['Translation #1'], '');
});

test('inactive current accounts cannot use availability handlers', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 705 });
  await db.collection('departments').doc('Translation').collection('members').doc(memberUid).set(profile());
  const inactiveMember = {
    uid: memberUid,
    token: { ...member.token, roleVersion: 2 },
    currentAccount: { roleVersion: 2, active: false }
  };
  await assert.rejects(
    handlers.updateMemberAvailability({
      auth: inactiveMember,
      data: {
        departmentId: 'Translation',
        memberUid,
        availability: { recurring: { morning: 'unavailable' }, exceptions: {} }
      }
    }),
    error => error.code === 'permission-denied' && /inactive/.test(error.message)
  );
});

test('assignment handlers bind profile and availability checks to an existing schedule', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 706 });
  await db.collection('departments').doc('Translation').collection('members').doc(memberUid).set(profile());
  await db.collection('schedule').doc('service-existing').set({
    date: '2026-09-20',
    service: 'Morning',
    assignments: { 'Translation #2': 'Riley Example' }
  });

  await assert.rejects(
    handlers.assignDepartmentDuty({ auth: leader, data: assignment({ serviceId: 'service-missing' }) }),
    error => error.code === 'not-found'
  );
  await assert.rejects(
    handlers.assignDepartmentDuty({
      auth: leader,
      data: assignment({ serviceId: 'service-existing', serviceDate: '2026-09-21' })
    }),
    error => error.code === 'failed-precondition' && /does not match/.test(error.message)
  );
  await assert.rejects(
    handlers.assignDepartmentDuty({
      auth: leader,
      data: assignment({ serviceId: 'service-existing', memberName: 'Spoofed Example' })
    }),
    error => error.code === 'invalid-argument' && /verified profile/.test(error.message)
  );
  await assert.rejects(
    handlers.assignDepartmentDuty({ auth: leader, data: assignment({ serviceId: 'service-existing' }) }),
    error => error.code === 'failed-precondition' && /already serving/.test(error.message)
  );
});

test('profile handlers generate manual field attribution and reject forged metadata', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 710 });
  await db.collection('departments').doc('Translation').collection('members').doc(memberUid).set(profile());

  const updated = await handlers.updateDepartmentProfile({
    auth: leader,
    data: {
      departmentId: 'Translation',
      memberUid,
      status: 'inactive',
      eligibleDuties: ['Translation #2'],
      schedulable: false
    }
  });
  for (const field of ['status', 'eligibleDuties', 'schedulable']) {
    assert.deepEqual(updated.profile.fieldAttribution[field], {
      source: 'manual',
      authority: 'leader',
      by: leaderUid,
      at: 710
    });
  }
  assert.equal(updated.profile.fieldAttribution.availability.source, 'initial');

  await assert.rejects(
    handlers.updateDepartmentProfile({
      auth: leader,
      data: {
        departmentId: 'Translation',
        memberUid,
        fieldAttribution: { status: { source: 'manual', authority: 'admin', by: adminUid, at: 711 } },
        status: 'active'
      }
    }),
    error => error.code === 'invalid-argument' && /Profile field is not allowed/.test(error.message)
  );
});

test('stale role versions cannot use Admin SDK department handlers', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 720 });
  await db.collection('departments').doc('Translation').collection('members').doc(memberUid).set(profile());
  const staleLeader = {
    uid: leaderUid,
    token: { ...leader.token, roleVersion: 4 },
    currentAccount: { roleVersion: 5, active: true }
  };
  await assert.rejects(
    handlers.updateDepartmentProfile({
      auth: staleLeader,
      data: { departmentId: 'Translation', memberUid, status: 'inactive' }
    }),
    error => error.code === 'permission-denied'
  );
  const currentLeader = {
    uid: leaderUid,
    token: { ...leader.token, roleVersion: 5 },
    currentAccount: { roleVersion: 5, active: true }
  };
  const result = await handlers.updateDepartmentProfile({
    auth: currentLeader,
    data: { departmentId: 'Translation', memberUid, status: 'inactive' }
  });
  assert.equal(result.ok, true);
});

test('department roster listing is scoped to the leader department and omits secrets', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 730 });
  await db.collection('departments').doc('Translation').collection('members').doc(memberUid).set({
    ...profile(),
    pinHash: 'fictional-secret-that-must-not-leak'
  });

  const result = await handlers.listDepartmentRoster({
    auth: leader,
    data: { departmentId: 'Translation' }
  });
  assert.equal(result.departmentId, 'Translation');
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0].memberUid, memberUid);
  assert.equal(Object.prototype.hasOwnProperty.call(result.members[0], 'pinHash'), false);

  await assert.rejects(
    handlers.listDepartmentRoster({
      auth: otherLeader,
      data: { departmentId: 'Translation' }
    }),
    error => error.code === 'permission-denied'
  );
});

test('assigned leaders can add department members without granting a role', async () => {
  const db = new FakeDb();
  const handlers = createDepartmentHandlers({ db, now: () => 900 });
  const addedUid = 'member-uid-fictional-2';
  await db.collection('accounts').doc(addedUid).set({ authUid: addedUid, memberName: 'Morgan Example', active: true });
  await db.collection('accounts').doc('member-uid-fictional-3').set({
    authUid: 'member-uid-fictional-3', memberName: 'Taylor Example', active: true
  });
  const result = await handlers.createDepartmentProfile({
    auth: leader,
    data: {
      departmentId: 'Translation',
      memberUid: addedUid,
      memberName: 'Morgan Example',
      eligibleDuties: ['Translation #2'],
      schedulable: true,
      availability: {
        recurring: { morning: 'available' },
        dateExceptions: { '2026-09-21': { morning: 'unavailable' } }
      }
    }
  });
  assert.equal(result.profile.memberUid, addedUid);
  assert.equal(result.profile.role, 'member');
  assert.deepEqual(result.profile.availability.exceptions, {
    '2026-09-21': { morning: 'unavailable' }
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result.profile.availability, 'dateExceptions'), false);
  assert.equal(result.profile.fieldAttribution.status.source, 'manual');
  assert.equal(result.profile.fieldAttribution.status.authority, 'leader');
  assert.deepEqual(db.read(`departments/Translation/members/${addedUid}`), result.profile);

  await assert.rejects(
    handlers.createDepartmentProfile({
      auth: leader,
      data: {
        departmentId: 'Translation',
        memberUid: 'member-uid-not-an-account',
        memberName: 'Missing Example'
      }
    }),
    error => error.code === 'not-found'
  );

  await assert.rejects(
    handlers.createDepartmentProfile({
      auth: leader,
      data: {
        departmentId: 'Translation',
        memberUid: 'member-uid-fictional-3',
        role: 'leader'
      }
    }),
    error => error.code === 'failed-precondition'
  );
});
