'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('node:path');
const vm = require('node:vm');

const sourceRoot = path.resolve(__dirname, '../../../../../');
const stateService = require(path.join(sourceRoot, 'src/core/state.js'));
const subscriptions = require(path.join(sourceRoot, 'src/services/subscriptions.js'));

test('missing subscriptions dependency fails before adapter side effects', () => {
  let storageAdapterCalls = 0;
  let firebaseAdapterCalls = 0;
  const sandbox = {
    window: {
      WorshipApp: {
        core: {},
        domain: { schedule: {}, sheet: {} },
        services: {
          storage: { createAdapter() { storageAdapterCalls++; } },
          firebase: { createAdapter() { firebaseAdapterCalls++; } }
        }
      }
    }
  };
  vm.createContext(sandbox);
  const appSource = fs.readFileSync(path.join(sourceRoot, 'app.js'), 'utf8')
    .replace(/\ninit\(\);\s*$/, '\n');
  assert.throws(
    () => vm.runInContext(appSource, sandbox, { filename: 'app.js' }),
    /WorshipApp foundation modules did not load/
  );
  assert.equal(storageAdapterCalls, 0);
  assert.equal(firebaseAdapterCalls, 0);
});

test('browser namespaces load after frozen core constants', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  ['src/core/constants.js', 'src/core/state.js', 'src/services/subscriptions.js']
    .forEach(relativePath => vm.runInContext(
      fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8'),
      sandbox,
      { filename: relativePath }
    ));
  assert(Object.isFrozen(sandbox.window.WorshipApp.core));
  assert.strictEqual(sandbox.window.WorshipApp.state, sandbox.window.WorshipApp.services.state);
  assert(Object.isFrozen(sandbox.window.WorshipApp.services.subscriptions));
});

test('state keeps reference replacement separate from readiness', () => {
  const initial = { members: ['Fictional Cached'], services: [] };
  const store = stateService.createStore(initial);
  assert.strictEqual(store.get(), initial);
  assert.equal(store.areReady('members'), false);
  assert.equal(store.areReady(['members', 'departments']), false);

  const replacement = { members: ['Fictional Live'], services: [] };
  assert.strictEqual(store.replace(replacement), replacement);
  assert.strictEqual(store.get(), replacement);
  assert.equal(store.areReady('members'), false);
  assert.equal(store.setReady('unknown', true), false);
  assert.equal(store.setReady('members', true), true);
  assert.equal(store.areReady('members'), true);
  assert.equal(store.areReady('departments'), false);
  assert.equal(store.setReady('departments', true), true);
  assert.equal(store.areReady(['members', 'departments']), true);

  const later = { members: [], services: [] };
  store.replace(later);
  assert.strictEqual(store.get(), later);
  assert.equal(store.areReady(), true);
});

function documentSnapshot(exists, data) {
  return {
    exists: () => exists,
    data: () => data
  };
}

function querySnapshot(docs) {
  return { docs, empty: docs.length === 0 };
}

function documentRecord(id, value) {
  return { id, data: () => value };
}

function fakeFirebase(options) {
  const config = options || {};
  const registrations = [];
  const calls = [];
  const firebase = {
    registrations,
    calls,
    setThrowOnRegistration(value) { config.throwOnRegistration = value; },
    collection(db, name) {
      return { kind: 'collection', db, name };
    },
    doc(db, collection, id) {
      return { kind: 'doc', db, collection, id };
    },
    where(field, operator, value) {
      return { field, operator, value };
    },
    query(collection, clause) {
      return { kind: 'query', collection, clause };
    },
    onSnapshot(query, next, error) {
      const registration = { query, next, error, unsubscribeCount: 0 };
      registrations.push(registration);
      calls.push(query);
      if (config.throwOnRegistration === registrations.length) {
        throw new Error('fictional registration failure');
      }
      return () => { registration.unsubscribeCount++; };
    }
  };
  return firebase;
}

test('subscriptions start without auth and keep preview until full success', () => {
  const firebase = fakeFirebase();
  const events = [];
  const manager = subscriptions.createManager({
    firebase,
    db: { fictional: true },
    recentSince: '2026-09-01',
    setlistsSince: '2026-09-08',
    emit: event => events.push(event)
  });

  manager.start();
  manager.start();
  assert.equal(firebase.registrations.length, 8);
  assert.equal(firebase.registrations[0].query.kind, 'query');
  assert.equal(firebase.registrations[0].query.collection.name, 'schedule');
  assert.equal(firebase.registrations[1].query.kind, 'collection');
  assert.equal(firebase.registrations[2].query.kind, 'doc');
  assert.equal(firebase.registrations[2].query.collection, 'app');
  assert.equal(firebase.registrations[2].query.id, 'members');
  assert.equal(firebase.registrations[3].query.id, 'settings');
  assert.equal(firebase.registrations[4].query.id, 'departments');
  assert.equal(firebase.registrations[5].query.id, 'nameMap');
  assert.equal(firebase.registrations[6].query.name, 'requests');
  assert.equal(firebase.registrations[7].query.kind, 'query');
  assert.equal(firebase.registrations[7].query.collection.name, 'setlists');

  const preview = firebase.registrations[0];
  const full = firebase.registrations[1];
  const members = firebase.registrations[2];
  const settings = firebase.registrations[3];
  const departments = firebase.registrations[4];
  const nameMap = firebase.registrations[5];
  const requests = firebase.registrations[6];
  const setlists = firebase.registrations[7];

  preview.next(querySnapshot([documentRecord('recent', { date: '2026-09-08', service: 'Morning' })]));
  assert.deepEqual(events, [{
    type: 'schedule-preview',
    services: [{ date: '2026-09-08', service: 'Morning' }]
  }]);

  full.next(querySnapshot([documentRecord('full', { date: '2026-09-09', service: 'Evening' })]));
  assert.deepEqual(events[1], {
    type: 'schedule-authoritative',
    services: [{ date: '2026-09-09', service: 'Evening' }],
    knownIds: ['full']
  });
  assert.equal(preview.unsubscribeCount, 1);

  preview.next(querySnapshot([documentRecord('late', { date: '2026-09-10' })]));
  assert.equal(events.length, 2);
  full.next(querySnapshot([]));
  assert.deepEqual(events[2], {
    type: 'schedule-authoritative',
    services: [],
    knownIds: []
  });

  members.next(documentSnapshot(false, { list: ['Ignored Missing'] }));
  settings.next(documentSnapshot(false, { pinHash: 'ignored' }));
  departments.next(documentSnapshot(false, { map: { Ignored: [] } }));
  nameMap.next(documentSnapshot(false, { map: { Ignored: 'Ignored' } }));
  requests.next(querySnapshot([documentRecord('request', { name: 'Fictional Member' })]));
  setlists.next(querySnapshot([documentRecord('setlist', { songs: ['Fictional Song'] })]));
  assert.deepEqual(events.slice(3), [
    { type: 'members', exists: false, list: undefined },
    { type: 'settings', exists: false, value: undefined },
    { type: 'departments', exists: false, map: null },
    { type: 'name-map', exists: false, map: null },
    { type: 'requests', items: [{ name: 'Fictional Member' }] },
    { type: 'setlists', byId: { setlist: { songs: ['Fictional Song'] } } }
  ]);
});

test('initial empty, later empty, errors, and restart are guarded', () => {
  const firebase = fakeFirebase();
  const events = [];
  const manager = subscriptions.createManager({
    firebase,
    db: {},
    recentSince: '2026-09-01',
    setlistsSince: '2026-09-08',
    emit: event => events.push(event)
  });

  manager.start();
  const firstPreview = firebase.registrations[0];
  const firstFull = firebase.registrations[1];
  firstPreview.next(querySnapshot([documentRecord('preview', { fictional: true })]));
  firstFull.error({ code: 'offline' });
  assert.equal(events[1].type, 'schedule-error');
  firstPreview.next(querySnapshot([documentRecord('preview-2', { fictional: true })]));
  assert.equal(events[2].type, 'schedule-preview');

  firstFull.next(querySnapshot([]));
  assert.deepEqual(events[3], { type: 'schedule-initial-empty' });
  assert.equal(firstPreview.unsubscribeCount, 1);
  firstPreview.next(querySnapshot([documentRecord('late-preview', {})]));
  assert.equal(events.length, 4);
  firstFull.next(querySnapshot([]));
  assert.deepEqual(events[4], { type: 'schedule-authoritative', services: [], knownIds: [] });

  const oldPreview = firstPreview;
  const oldFull = firstFull;
  manager.stop();
  manager.stop();
  assert.equal(manager.isStarted(), false);
  assert.equal(oldFull.unsubscribeCount, 1);
  oldPreview.next(querySnapshot([documentRecord('after-stop', {})]));
  oldFull.next(querySnapshot([documentRecord('after-stop', {})]));
  assert.equal(events.length, 5);

  manager.start();
  assert.equal(firebase.registrations.length, 16);
  const nextPreview = firebase.registrations[8];
  const nextFull = firebase.registrations[9];
  oldPreview.next(querySnapshot([documentRecord('old-generation', {})]));
  oldFull.next(querySnapshot([documentRecord('old-generation', {})]));
  assert.equal(events.length, 5);
  nextPreview.next(querySnapshot([documentRecord('new-preview', {})]));
  nextFull.next(querySnapshot([documentRecord('new-full', {})]));
  assert.equal(events[5].type, 'schedule-preview');
  assert.equal(events[6].type, 'schedule-authoritative');
  manager.stop();
});

test('partial startup rolls back earlier listeners and permits a clean restart', () => {
  const firebase = fakeFirebase({ throwOnRegistration: 2 });
  const events = [];
  const manager = subscriptions.createManager({
    firebase,
    db: {},
    recentSince: '2026-09-01',
    setlistsSince: '2026-09-08',
    emit: event => events.push(event)
  });

  assert.throws(() => manager.start(), /fictional registration failure/);
  assert.equal(manager.isStarted(), false);
  assert.equal(firebase.registrations[0].unsubscribeCount, 1);
  firebase.registrations[0].next(querySnapshot([documentRecord('late-preview', {})]));
  assert.deepEqual(events, []);

  firebase.registrations[1].next(querySnapshot([documentRecord('late-full', {})]));
  assert.deepEqual(events, []);
  firebase.setThrowOnRegistration(null);
  manager.start();
  assert.equal(manager.isStarted(), true);
  assert.equal(firebase.registrations.length, 10);
  const restartedPreview = firebase.registrations[2];
  const restartedFull = firebase.registrations[3];
  restartedPreview.next(querySnapshot([documentRecord('restart-preview', {})]));
  restartedFull.next(querySnapshot([documentRecord('restart-full', {})]));
  assert.deepEqual(events, [
    { type: 'schedule-preview', services: [{}] },
    { type: 'schedule-authoritative', services: [{}], knownIds: ['restart-full'] }
  ]);
  manager.stop();
});
