'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const coordinator = require('../src/screens/coordinator/coordinator-screen.js');

function fixtureState() {
  return {
    members: ['Fixture Manager', 'Fixture Presider', 'Fixture Singer'],
    services: [{
      id: '2026-09-12_morning',
      date: '2026-09-12',
      service: 'Morning',
      worship: 'Worship',
      time: '10:00',
      assignments: { Media: 'Fixture Media' },
      choirSong: 'Fixture Choir Song'
    }],
    departments: {
      Media: ['Fixture Media'],
      Choir: ['Fixture Choir Member']
    },
    settings: {
      departmentManagers: { Admin: ['Fixture Manager'] }
    },
    requests: []
  };
}

function makeScreen(state, saveService) {
  const ui = { me: 'Fixture Manager' };
  return coordinator.create({
    getState: () => state,
    getUi: () => ui,
    core: { CATEGORIES: [{ name: 'Media', duties: ['Presider', 'Sermon'], color: '#246' }] },
    fmt: {
      today: () => '2026-09-01',
      serviceId: service => service.id,
      date: value => value,
      time: value => value,
      esc: value => String(value == null ? '' : value)
    },
    commands: { saveService },
    requestRender() {},
    addBanner() {}
  });
}

test('Choir keeps roster and manual song editing without an assignment duty', () => {
  const state = fixtureState();
  const screen = makeScreen(state, () => Promise.resolve());
  screen.handle('chg', 'manage-department', { value: 'Choir' });
  const html = screen.render();

  assert.match(html, /Choir song titles/);
  assert.match(html, /data-chg="manage-choir-song"/);
  assert.doesNotMatch(html, /data-duty="Choir"/);
});

test('auto-save sends every proposed duty with its previous and desired values', async () => {
  const state = fixtureState();
  state.departments.Media = ['Fixture Presider', 'Fixture Singer'];
  const calls = [];
  const screen = makeScreen(state, (service, metadata) => {
    calls.push({ service, metadata });
    return Promise.resolve();
  });
  screen.handle('chg', 'manage-department', { value: 'Media' });
  screen.handle('act', 'manage-auto-propose', {});
  await screen.handle('act', 'manage-auto-save', {});

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].metadata, {
    assignmentChanges: {
      Presider: { previous: '', desired: 'Fixture Presider' },
      Sermon: { previous: '', desired: 'Fixture Singer' }
    }
  });
});

test('failed auto-save restores optimistic values and retains proposals for retry', async () => {
  const state = fixtureState();
  state.departments.Media = ['Fixture Presider', 'Fixture Singer'];
  const screen = makeScreen(state, () => Promise.reject(new Error('fictional write failure')));
  screen.handle('chg', 'manage-department', { value: 'Media' });
  screen.handle('act', 'manage-auto-propose', {});
  const before = JSON.stringify(state.services[0].assignments);
  await screen.handle('act', 'manage-auto-save', {});

  assert.equal(JSON.stringify(state.services[0].assignments), before);
  assert.match(screen.render(), /Save proposals/);
});

test('failed auto-save keeps a service-layer concurrent value during rollback', async () => {
  const state = fixtureState();
  state.departments.Media = ['Fixture Presider', 'Fixture Singer'];
  const screen = makeScreen(state, service => {
    service.assignments.Presider = 'Concurrent Presider';
    return Promise.reject(new Error('fictional write failure'));
  });
  screen.handle('chg', 'manage-department', { value: 'Media' });
  screen.handle('act', 'manage-auto-propose', {});
  await screen.handle('act', 'manage-auto-save', {});

  assert.equal(state.services[0].assignments.Presider, 'Concurrent Presider');
  assert.equal(state.services[0].assignments.Sermon, undefined);
  assert.match(screen.render(), /Save proposals/);
});


test('input plus change dispatch writes an assignment once and repeated choices are no-ops', async () => {
  const state = fixtureState();
  state.departments.Media = ['Fixture Presider', 'Fixture Singer'];
  const calls = [];
  const screen = makeScreen(state, (service, metadata) => { calls.push(metadata); return Promise.resolve(); });
  screen.handle('chg', 'manage-department', { value: 'Media' });
  const control = { value: 'Fixture Presider', dataset: { service: state.services[0].id, duty: 'Presider', department: 'Media' } };
  screen.handle('input', 'manage-assignment', control);
  assert.equal(calls.length, 0);
  assert.equal(state.services[0].assignments.Presider, undefined);
  screen.handle('chg', 'manage-assignment', control);
  await Promise.resolve();
  screen.handle('chg', 'manage-assignment', control);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { assignmentChanges: { Presider: { previous: '', desired: 'Fixture Presider' } } });
});
