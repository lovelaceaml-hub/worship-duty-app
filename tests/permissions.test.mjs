import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const root = '/Users/anthony/Projects/worship-duty-app-worktrees/auth-l1';
const require = createRequire(import.meta.url);
const permissions = require(`${root}/permissions.js`);

const config = {
  roles: {
    admins: ['Admin'],
    globalLeaders: ['Global manager'],
    departmentLeaders: {
      Worship: ['Worship lead'],
      Media: ['Media lead'],
      Translation: ['Shared lead']
    },
    songEditors: ['Song editor']
  },
  departmentDuties: permissions.DEPARTMENT_DUTIES
};

test('exports the complete department and duty configuration', () => {
  assert.deepEqual(permissions.DEPARTMENTS, [
    'Worship', 'Usher Sisters', 'Usher Brothers', 'Lobby', 'Translation',
    'Media', 'Parking Lot', 'Offering'
  ]);
  assert.equal(permissions.DEPARTMENT_DUTIES.Worship[0], 'Presider');
  assert.equal(permissions.DUTY_TO_DEPARTMENT['Parking #5'], 'Parking Lot');
  assert.equal(permissions.DUTY_TO_DEPARTMENT['Offering #6'], 'Offering');
  assert.equal(permissions.departmentForDuty('media booth #2', config), 'Media');
  assert.equal(permissions.departmentForDuty('unknown duty', config), '');
});

test('default production role data encodes the requested scopes', () => {
  assert.equal(permissions.isAdmin('B. Anthony'), true);
  assert.equal(permissions.canManageLeaders('B. Anthony'), true);
  assert.equal(permissions.canManageLeaders('E. Simon'), true);
  assert.deepEqual(permissions.departmentsForLeader('E. Simon'), ['Worship']);
  assert.deepEqual(permissions.departmentsForLeader('D. Aaron'), ['Media', 'Parking Lot']);
  assert.deepEqual(permissions.departmentsForLeader('D. Armani'), ['Worship', 'Media']);
  assert.deepEqual(permissions.departmentsForLeader('B. Brent'), ['Worship', 'Media']);
  assert.equal(permissions.canEditSongs('D. Danielle'), true);
  assert.equal(permissions.canEditDuty('D. Danielle', 'Presider'), false);
  assert.equal(permissions.canCreateService('E. Simon'), false);
  assert.equal(permissions.canCreateService('B. Anthony'), true);
  assert.equal(permissions.canResetPin('E. Simon', { name: 'Member' }), true);
  assert.equal(permissions.canResetPin('S. Paola', { departments: ['Translation'] }), true);
  assert.equal(permissions.canResetPin('S. Paola', { departments: ['Lobby'] }), false);
  assert.equal(permissions.canResetPin('S. Paola', { departments: ['Translation', 'Lobby'] }), true);
  assert.equal(permissions.canResolveRequest('E. Simon', { duty: 'Sermon' }), true);
  assert.equal(permissions.canResolveRequest('E. Simon', { duty: 'Media Booth #1' }), false);
});

test('admin has global controls while the global leader manager stays operationally scoped', () => {
  for (const actor of ['Admin']) {
    assert.equal(permissions.canManageLeaders(actor, config), true, actor);
    assert.equal(permissions.canManageDepartment(actor, 'Offering', config), true, actor);
    assert.equal(permissions.canEditDuty(actor, 'Parking #1', config), true, actor);
    assert.equal(permissions.canCreateService(actor, config), true, actor);
    assert.equal(permissions.canResetPin(actor, { name: 'Any member' }, config), true, actor);
    assert.deepEqual(permissions.departmentsForLeader(actor, config), permissions.DEPARTMENTS);
  }
  assert.equal(permissions.canManageLeaders('Global manager', config), true);
  assert.equal(permissions.canManageDepartment('Global manager', 'Offering', config), false);
  assert.equal(permissions.canEditDuty('Global manager', 'Parking #1', config), false);
  assert.equal(permissions.canCreateService('Global manager', config), false);
  assert.equal(permissions.canResetPin('Global manager', { name: 'Any member' }, config), true);
  assert.equal(permissions.isAdmin('Admin', config), true);
  assert.equal(permissions.isAdmin('Global manager', config), false);
});

test('department leaders are scoped to their configured departments', () => {
  assert.deepEqual(permissions.departmentsForLeader('Worship lead', config), ['Worship']);
  assert.deepEqual(permissions.departmentsForLeader('Shared lead', config), ['Translation']);
  assert.equal(permissions.canManageDepartment('Worship lead', 'Worship', config), true);
  assert.equal(permissions.canManageDepartment('Worship lead', 'Media', config), false);
  assert.equal(permissions.canEditDuty('Worship lead', 'Presider', config), true);
  assert.equal(permissions.canEditDuty('Worship lead', 'Media Booth #1', config), false);
  assert.equal(permissions.canManageDepartmentMember('Media lead', 'Media', 'New member', config), true);
  assert.equal(permissions.canManageDepartmentMember('Media lead', 'Worship', 'New member', config), false);
  assert.equal(permissions.canManageLeaders('Worship lead', config), false);
  assert.equal(permissions.canResetPin('Worship lead', { departments: ['Worship'] }, config), true);
  assert.equal(permissions.canResetPin('Worship lead', { departments: ['Media'] }, config), false);
});

test('requests and conflicts require an affected department scope', () => {
  assert.equal(permissions.canResolveRequest('Worship lead', { duty: 'Sermon' }, config), true);
  assert.equal(permissions.canResolveRequest('Worship lead', { duty: 'Media Booth #1' }, config), false);
  assert.equal(permissions.canResolveRequest('Worship lead', { duties: ['Presider', 'Media Booth #1'] }, config), false);

  const worshipConflict = {
    assignments: { Presider: 'Member', Sermon: 'Member' }
  };
  const mixedConflict = {
    assignments: { Presider: 'Member', 'Media Booth #1': 'Member' }
  };
  assert.equal(permissions.canAcknowledgeConflict('Worship lead', worshipConflict, config), true);
  assert.equal(permissions.canAcknowledgeConflict('Worship lead', mixedConflict, config), true);
  assert.equal(permissions.canAcknowledgeConflict('Media lead', mixedConflict, config), true);
  assert.equal(permissions.canAcknowledgeConflict('Admin', mixedConflict, config), true);
});

test('song editor and presider song boundaries are centralized', () => {
  assert.equal(permissions.canEditSongs('Song editor', {}, config), true);
  assert.equal(permissions.canEditSongs('Worship lead', {}, config), false);
  assert.equal(permissions.canEditSongs('unknown person', {}, config), false);
  assert.equal(permissions.canEditSongs(
    { name: 'Assigned presider' },
    { assignments: { Presider: 'Assigned presider' } },
    config
  ), true);
  assert.equal(permissions.canEditSongs(
    { name: 'Other presider', role: 'presider' },
    { assignments: { Presider: 'Assigned presider' } },
    config
  ), false);
});

test('unknown identities, duties, departments, and requests fail closed', () => {
  const nobody = 'Not configured';
  assert.equal(permissions.isAdmin(nobody, config), false);
  assert.equal(permissions.canManageDepartment(nobody, 'Worship', config), false);
  assert.equal(permissions.canEditDuty('Worship lead', 'Not a duty', config), false);
  assert.equal(permissions.canManageDepartment('Global manager', 'Not a department', config), false);
  assert.equal(permissions.canResolveRequest('Worship lead', { duty: 'Not a duty' }, config), false);
  assert.equal(permissions.canAcknowledgeConflict('Worship lead', { duty: 'Not a duty' }, config), false);
});

test('browser and Node consumers receive the same API', async () => {
  const source = await readFile(`${root}/permissions.js`, 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  assert.ok(window.WorshipDutyPermissions);
  assert.equal(window.WorshipDutyPermissions.canEditDuty('Worship lead', 'Presider', config), true);
  assert.deepEqual(
    Object.keys(window.WorshipDutyPermissions).sort(),
    Object.keys(permissions).sort()
  );
  assert.equal(window.WDS_PERMISSIONS, window.WorshipDutyPermissions);
  assert.equal(window.Permissions, window.WorshipDutyPermissions);
});

test('role config aliases and inverse membership maps remain supported', () => {
  const replacement = {
    roles: {
      admin: ['Configured admin'],
      globalLeaderManager: ['Configured manager'],
      departmentLeaders: {
        'Configured lead': ['Translation']
      },
      songEditors: ['Configured song editor']
    }
  };
  assert.equal(permissions.isAdmin('Configured admin', replacement), true);
  assert.equal(permissions.canManageLeaders('Configured manager', replacement), true);
  assert.equal(permissions.canManageDepartment('Configured lead', 'Translation', replacement), true);
  assert.equal(permissions.canEditDuty('Configured lead', 'Translation #1', replacement), true);
  assert.equal(permissions.canEditSongs('Configured song editor', {}, replacement), true);
  assert.equal(permissions.isAdmin('B. Anthony', replacement), false);

  const inverse = {
    departmentLeaders: {
      'Configured lead': ['Media', 'Parking Lot']
    },
    departmentMembers: {
      Media: ['Target member']
    }
  };
  assert.deepEqual(permissions.departmentsForLeader('Configured lead', inverse), ['Media', 'Parking Lot']);
  assert.equal(permissions.canResetPin('Configured lead', { name: 'Target member' }, inverse), true);
});

test('factory binds one config without changing the helper contract', () => {
  const scoped = permissions.createPermissions(config);
  assert.equal(scoped.isAdmin('Admin'), true);
  assert.equal(scoped.canEditDuty('Worship lead', 'Presider'), true);
  assert.equal(scoped.canEditDuty('Worship lead', 'Media Booth #1'), false);
  assert.equal(scoped.canResetPin('Worship lead', { departments: ['Worship'] }), true);
});

test('scope helpers tolerate config-first calls used by adapters', () => {
  assert.equal(permissions.canManageDepartment(config, 'Worship lead', 'Worship'), true);
  assert.equal(permissions.canManageDepartment(
    config,
    { name: 'Worship lead', department: 'Media' },
    'Worship'
  ), true);
  assert.equal(permissions.canEditDuty(config, 'Worship lead', 'Presider'), true);
  assert.equal(permissions.canEditDuty(
    config,
    { name: 'Worship lead', duty: 'Media Booth #1' },
    'Presider'
  ), true);
  assert.equal(permissions.canResolveRequest(config, 'Worship lead', { duty: 'Sermon' }), true);
  assert.equal(permissions.canResolveRequest(
    config,
    { name: 'Worship lead', departments: ['Media'] },
    { duty: 'Sermon' }
  ), true);
  assert.equal(permissions.canAcknowledgeConflict(
    config,
    'Worship lead',
    { duties: ['Presider', 'Media Booth #1'] }
  ), true);
  assert.equal(permissions.canResetPin(
    config,
    'Worship lead',
    { departments: ['Media'] }
  ), false);
  assert.equal(permissions.canResetPin(
    config,
    { name: 'Worship lead', departments: ['Media'] },
    { departments: ['Worship'] }
  ), true);
});

test('verified role claims work without privileged name matching', () => {
  assert.equal(permissions.isAdmin({ uid: 'admin-id', claims: { role: 'admin' } }, {}), true);
  assert.equal(permissions.canCreateService({ uid: 'admin-id', customClaims: { roles: ['admin'] } }, {}), true);
  assert.equal(permissions.isAdmin('B. Anthony', {}), false);
  assert.equal(permissions.isAdmin({ uid: 'untrusted', isAdmin: true }, {}), false);
});
