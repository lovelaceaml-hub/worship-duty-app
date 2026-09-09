'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../src/services/song-repository.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const { createSongRepository } = require(sourcePath);

function storageFixture() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

function doc(id, value) {
  return { id, data: () => value };
}

function snapshot(value, changes) {
  const docs = Object.entries(value || {}).map(([id, data]) => doc(id, data));
  return {
    docs,
    exists: () => value != null,
    data: () => value,
    docChanges: () => changes || []
  };
}

function remoteFixture() {
  const listeners = [];
  const calls = [];
  const firebase = {
    db: { fictional: true },
    doc(db, collection, id) { return { kind: 'doc', collection, id }; },
    collection(db, name) { return { kind: 'collection', name }; },
    async getDoc(ref) { calls.push(['getDoc', ref]); return snapshot(null); },
    async setDoc(ref, value, options) { calls.push(['setDoc', ref, value, options]); return 'set'; },
    async updateDoc(ref, value) { calls.push(['updateDoc', ref, value]); return 'update'; },
    async deleteDoc(ref) { calls.push(['deleteDoc', ref]); return 'delete'; },
    async runTransaction(db, callback) { calls.push(['runTransaction']); return callback({}); },
    arrayUnion(value) { return { op: 'union', value }; },
    arrayRemove(value) { return { op: 'remove', value }; },
    onSnapshot(ref, next, error) {
      const item = { ref, next, error, stopped: 0 };
      listeners.push(item);
      return () => { item.stopped += 1; };
    }
  };
  let authOpen = false;
  let authResolve;
  let authPromise = new Promise(resolve => { authResolve = resolve; });
  let writeCalls = 0;
  const gateway = {
    firebase,
    ref(collection, id) { return firebase.doc(firebase.db, collection, id); },
    write(task) {
      writeCalls += 1;
      const ready = authOpen ? Promise.resolve() : authPromise;
      return ready.then(() => { assert.equal(authOpen, true, 'the fictional auth gate must be open before the SDK task'); return task(); });
    }
  };
  return { gateway, firebase, listeners, calls, setAuth(value) { authOpen = value; if (value && authResolve) authResolve(); if (!value) authPromise = new Promise(resolve => { authResolve = resolve; }); }, get writeCalls() { return writeCalls; } };
}

test('exports a frozen CommonJS and browser safe factory', () => {
  assert.equal(typeof createSongRepository, 'function');
  const browser = { window: { WorshipApp: {} } };
  browser.globalThis = browser;
  vm.runInNewContext(source, browser, { filename: sourcePath });
  assert.equal(typeof browser.window.WorshipApp.services.songRepository.createSongRepository, 'function');
  assert.deepEqual(Object.keys(createSongRepository({})), [
    'isRemote', 'loadLocal', 'saveLocal', 'getDocument', 'setDocument',
    'updateOrCreate', 'deleteDocument', 'runTransaction', 'addArrayValue',
    'removeArrayValue', 'startSubscriptions'
  ]);
});

test('local storage round trip uses the configured key', () => {
  const storage = storageFixture();
  const repository = createSongRepository({ storage, key: 'fictional-songs' });
  const value = { stats: { song: { timesSung: 2 } }, setlists: {} };
  repository.saveLocal(value);
  assert.deepEqual(repository.loadLocal(), value);
  assert.equal(repository.isRemote(), false);
});

test('every remote write waits for the gateway auth write boundary', async () => {
  const fixture = remoteFixture();
  const repository = createSongRepository({ gateway: fixture.gateway });
  fixture.setAuth(false);
  const pending = repository.setDocument('songs', 'fictional-1', { title: 'Fixture' });
  await Promise.resolve();
  assert.equal(fixture.calls.length, 0);
  fixture.setAuth(true);
  await pending;
  await repository.deleteDocument('songs', 'fictional-1');
  await repository.runTransaction(() => undefined);
  await repository.addArrayValue('app', 'presiders', 'names', 'Fictional Person');
  await repository.removeArrayValue('app', 'presiders', 'names', 'Fictional Person');
  assert.equal(fixture.writeCalls, 5);
  assert.equal(fixture.calls.filter(call => call[0] === 'setDoc').length, 3);
});

test('update fallback stays inside the authenticated write boundary and replaces the record', async () => {
  const fixture = remoteFixture();
  const originalUpdate = fixture.firebase.updateDoc;
  let authAtFallback = false;
  fixture.firebase.updateDoc = async ref => {
    fixture.calls.push(['updateDoc', ref]);
    return Promise.reject(Object.assign(new Error('missing fictional document'), { code: 'not-found' }));
  };
  fixture.gateway.write = task => {
    fixture.setAuth(true);
    return Promise.resolve().then(() => task()).then(value => {
      authAtFallback = true;
      return value;
    });
  };
  const repository = createSongRepository({ gateway: fixture.gateway });
  await repository.updateOrCreate('setlists', 'fictional-service', { notes: 'later' }, { id: 'fictional-service', notes: 'later', songs: [] });
  const set = fixture.calls.find(call => call[0] === 'setDoc');
  assert.ok(set);
  assert.equal(set[3], undefined);
  assert.equal(authAtFallback, true);
  fixture.firebase.updateDoc = originalUpdate;
});

test('sets six listeners, emits normalized values, reports errors, and stops once', () => {
  const fixture = remoteFixture();
  const repository = createSongRepository({ gateway: fixture.gateway });
  const received = {};
  let errorValue;
  const stop = repository.startSubscriptions({
    setlists(value, changes) { received.setlists = value; if (!received.setlistChanges) received.setlistChanges = changes; else received.secondSetlistChanges = changes; },
    stats(value) { received.stats = value; },
    settings(value) { received.settings = value; },
    presiders(value) { received.presiders = value; },
    nameMap(value) { received.nameMap = value; },
    schedule(value) { received.schedule = value; },
    error(value) { errorValue = value; }
  });
  assert.equal(fixture.listeners.length, 6);
  fixture.listeners[0].next(snapshot({ 'fictional-service': { updatedAt: 4, songs: [] } }, [{ type: 'added', doc: doc('fictional-service', { updatedAt: 4, songs: [] }) }]));
  fixture.listeners[1].next(snapshot({ 'fictional-song': { timesSung: 1 } }));
  fixture.listeners[2].next(snapshot({ editorPinHash: 'fictional-hash' }));
  fixture.listeners[3].next(snapshot({ names: ['Fictional Person'] }));
  fixture.listeners[4].next(snapshot({ map: { 'Fictional Variant': 'Fictional Person' } }));
  fixture.listeners[5].next(snapshot({ 'fictional-schedule': { date: '2099-01-02', service: 'Morning', assignments: {} } }));
  fixture.listeners[0].next(snapshot({ 'fictional-service': { updatedAt: 4, songs: [] } }, []));
  assert.deepEqual(received.setlists['fictional-service'], { updatedAt: 4, songs: [] });
  assert.deepEqual(received.setlistChanges, [{ type: 'added', id: 'fictional-service', data: { updatedAt: 4, songs: [] } }]);
  assert.deepEqual(received.secondSetlistChanges, []);
  assert.deepEqual(received.stats['fictional-song'], { timesSung: 1 });
  assert.deepEqual(received.settings, { editorPinHash: 'fictional-hash' });
  assert.deepEqual(received.presiders, ['Fictional Person']);
  assert.deepEqual(received.nameMap, { 'Fictional Variant': 'Fictional Person' });
  assert.equal(received.schedule[0].id, 'fictional-schedule');
  const error = new Error('fictional listener failure');
  fixture.listeners[0].error(error);
  assert.equal(errorValue, error);
  stop();
  stop();
  assert.deepEqual(fixture.listeners.map(listener => listener.stopped), [1, 1, 1, 1, 1, 1]);
});

test('partial listener setup tears down earlier listeners', () => {
  const fixture = remoteFixture();
  let setupError;
  const original = fixture.firebase.onSnapshot;
  fixture.firebase.onSnapshot = (...args) => {
    if (fixture.listeners.length === 2) throw new Error('fictional setup failure');
    return original(...args);
  };
  const repository = createSongRepository({ gateway: fixture.gateway });
  const stop = repository.startSubscriptions({ error(error) { setupError = error; } });
  assert.equal(fixture.listeners.length, 2);
  assert.equal(fixture.listeners[0].stopped, 1);
  assert.equal(fixture.listeners[1].stopped, 1);
  assert.equal(setupError.message, 'fictional setup failure');
  stop();
  assert.equal(fixture.listeners[0].stopped, 1);
  assert.equal(fixture.listeners[1].stopped, 1);
});

test('repository source has no rendering or state knowledge', () => {
  assert.doesNotMatch(source, /\brender\s*\(/);
  assert.doesNotMatch(source, /\bstate\b/);
  assert.doesNotMatch(source, /\balert\s*\(/);
});

test('song app source contains keyed save, overlay, and lifecycle seams', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../song-app.js'), 'utf8');
  assert.match(appSource, /const pendingPatchOverlays = \{\};/);
  assert.match(appSource, /const saveQueues = \{\};/);
  assert.match(appSource, /const saveStates = \{\};/);
  assert.match(appSource, /const entry = \{ timer: null, flush: fn \};/);
  assert.match(appSource, /clearTimeout\(entry\.timer\);[\s\S]{0,120}if \(entry\.flush\) entry\.flush\(\);/);
  assert.match(appSource, /const value = String\(el\.value \|\| ''\);/);
  assert.match(appSource, /function productionSaveState\(sl\)[\s\S]{0,180}const save = saveStates\[id\]/);
  assert.match(appSource, /export function unmount\(\)/);
  assert.match(appSource, /rootAbortController\.abort\(\)/);
  assert.match(appSource, /subscriptionStop\(\)/);
  assert.doesNotMatch(appSource, /clearMountResources\(\)[\s\S]{0,600}firebaseGateway = null/);
  assert.match(appSource, /function updateLocalPresider\(change\)[\s\S]{0,100}if \(fb\) return/);
  assert.match(appSource, /Opening prayer'.*Opening Prayer/);
  assert.doesNotMatch(appSource, /fb\.(setDoc|updateDoc|deleteDoc|runTransaction|onSnapshot)/);
  assert.doesNotMatch(appSource, /lastFailedPatch/);
});
