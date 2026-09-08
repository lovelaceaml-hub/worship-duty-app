import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = process.env.WORSHIP_SOURCE_ROOT || path.resolve(TEST_DIR, '../../../../..');
const SOURCE_PATH = path.join(SOURCE_ROOT, 'song-app.js');
const BASELINE_COMMIT = process.env.WORSHIP_BASELINE_COMMIT || '670ddb7d2de4287963b14a42d3f8ecb5513f0fed';

const SONG_LIB = {
  serviceIdFor() { return ''; },
  recompute() { return {}; },
  applySung() { return { changed: {} }; },
  applyUndo() { return { changed: {} }; },
  backfillServiceId() { return ''; },
  applyBackfill() { return { changed: {} }; },
  removeHistoryEntry() { return { changed: {} }; },
  totalDuration() { return 0; },
  countedSongIds() { return []; }
};

function sourceText() {
  return readFileSync(SOURCE_PATH, 'utf8');
}

function baselineSourceText() {
  return execFileSync('git', ['show', `${BASELINE_COMMIT}:song-app.js`], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8'
  });
}

function makeStorage() {
  const values = new Map();
  const writes = [];
  return {
    writes,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      const text = String(value);
      values.set(key, text);
      writes.push({ key, value: text });
    },
    removeItem(key) { values.delete(key); }
  };
}

function makeFirebase({ rejectUpdate = false } = {}) {
  const writes = [];
  const fb = {
    db: { kind: 'fictional-db' },
    doc(_db, collection, id) { return { collection, id }; },
    updateDoc(ref, patch) {
      writes.push({ operation: 'updateDoc', ref, patch: Object.assign({}, patch) });
      if (rejectUpdate) {
        const error = new Error('fictional setlist document is absent');
        error.code = 'not-found';
        return Promise.reject(error);
      }
      return Promise.resolve();
    },
    setDoc(ref, data, options) {
      writes.push({ operation: 'setDoc', ref, data: Object.assign({}, data), options });
      return Promise.resolve();
    }
  };
  return { fb, writes };
}

function makeHarness(source, { firebase = null } = {}) {
  const storage = makeStorage();
  const alerts = [];
  const warnings = [];
  let clockValue = 100;
  let clockCalls = 0;
  class AdvancingDate extends Date {
    static now() {
      clockCalls += 1;
      clockValue += 1;
      return clockValue;
    }
  }

  const sandbox = {
    window: { SongLib: SONG_LIB, SONG_SEED: { songs: [] } },
    localStorage: storage,
    Date: AdvancingDate,
    document: { activeElement: null },
    fetch() { return Promise.reject(new Error('fictional catalog sync disabled')); },
    console: {
      log() {},
      warn(...args) { warnings.push(args.join(' ')); },
      error(...args) { warnings.push(args.join(' ')); }
    },
    alert(message) { alerts.push(String(message)); },
    confirm() { return true; },
    navigator: {},
    crypto: globalThis.crypto,
    TextEncoder,
    Uint8Array,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    Intl,
    RegExp,
    Error,
    Map,
    Set,
    Symbol,
    Reflect,
    isNaN,
    parseInt,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;
  const executable = source.replace('export function mount', 'function mount') + `
globalThis.__songTestApi = {
  state,
  confirmSetlist,
  updateSetlist,
  isConfirmed,
  changedSinceConfirmed,
  writeSetlistPatch,
  setFirebase(value) { fb = value; }
};
`;
  vm.runInNewContext(executable, sandbox, { filename: SOURCE_PATH });
  const api = sandbox.__songTestApi;
  if (firebase) api.setFirebase(firebase);
  return {
    api,
    storage,
    alerts,
    warnings,
    clock: { calls: () => clockCalls }
  };
}

function makeFixture() {
  return {
    id: '2099-01-01_Morning',
    date: '2099-01-01',
    worshipType: 'Sabbath Day',
    serviceLabel: 'Morning',
    presider: 'Fictional Presider',
    notes: 'Keep this fictional note',
    songs: ['fictional-song-101', 'fictional-song-202'],
    status: 'planned',
    sungAt: null,
    source: 'schedule',
    extraExistingField: 'preserve this fictional field'
  };
}

function seed(api, fixture = makeFixture()) {
  api.state.ui.me = fixture.presider;
  api.state.setlists[fixture.id] = fixture;
  return fixture.id;
}

async function settleWrites() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

function confirmationKeys() {
  return ['confirmedAt', 'confirmedBy', 'updatedAt', 'updatedBy'];
}

test('the immutable baseline reproduces the double timestamp failure', () => {
  const run = makeHarness(baselineSourceText());
  const id = seed(run.api);

  run.api.confirmSetlist(id);

  const stored = run.api.state.setlists[id];
  assert.equal(run.clock.calls(), 2);
  assert.equal(stored.confirmedAt, 101);
  assert.equal(stored.updatedAt, 102);
  assert.equal(run.api.isConfirmed(stored), false);
});

test('local confirmation, edit, and reconfirmation each stamp once', () => {
  const run = makeHarness(sourceText());
  const fixture = makeFixture();
  const id = seed(run.api, fixture);

  run.api.confirmSetlist(id);
  let stored = run.api.state.setlists[id];
  assert.equal(run.clock.calls(), 1);
  assert.equal(stored.confirmedAt, 101);
  assert.equal(stored.updatedAt, 101);
  assert.equal(stored.confirmedBy, 'Fictional Presider');
  assert.equal(stored.updatedBy, 'Fictional Presider');
  assert.equal(run.api.isConfirmed(stored), true);

  run.api.updateSetlist(id, { notes: 'Fictional later edit' });
  stored = run.api.state.setlists[id];
  assert.equal(run.clock.calls(), 2);
  assert.equal(stored.confirmedAt, 101);
  assert.equal(stored.updatedAt, 102);
  assert.equal(run.api.changedSinceConfirmed(stored), true);

  run.api.confirmSetlist(id);
  stored = run.api.state.setlists[id];
  assert.equal(run.clock.calls(), 3);
  assert.equal(stored.confirmedAt, 103);
  assert.equal(stored.updatedAt, 103);
  assert.equal(run.api.isConfirmed(stored), true);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'confirm'), false);

  const persisted = JSON.parse(run.storage.getItem('nss-data-v1'));
  assert.deepEqual(Object.keys(persisted.setlists[id]).sort(), [
    'confirmedAt', 'confirmedBy', 'date', 'extraExistingField', 'id',
    'notes', 'presider', 'serviceLabel', 'songs', 'source', 'status',
    'sungAt', 'updatedAt', 'updatedBy', 'worshipType'
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(persisted.setlists[id], 'confirm'), false);
});

test('Firebase confirmation uses one metadata patch and preserves edit semantics', async () => {
  const firebase = makeFirebase();
  const run = makeHarness(sourceText(), { firebase: firebase.fb });
  const id = seed(run.api);

  run.api.confirmSetlist(id);
  await settleWrites();
  assert.equal(run.clock.calls(), 1);
  assert.equal(firebase.writes.length, 1);
  assert.equal(firebase.writes[0].operation, 'updateDoc');
  assert.deepEqual(Object.keys(firebase.writes[0].patch).sort(), confirmationKeys());
  assert.equal(firebase.writes[0].patch.confirmedAt, 101);
  assert.equal(firebase.writes[0].patch.updatedAt, 101);
  assert.equal(Object.prototype.hasOwnProperty.call(firebase.writes[0].patch, 'confirm'), false);
  assert.equal(run.api.isConfirmed(run.api.state.setlists[id]), true);

  run.api.updateSetlist(id, { notes: 'Fictional Firebase edit' });
  await settleWrites();
  assert.equal(run.clock.calls(), 2);
  assert.deepEqual(Object.keys(firebase.writes[1].patch).sort(), ['notes', 'updatedAt', 'updatedBy']);
  assert.equal(Object.prototype.hasOwnProperty.call(firebase.writes[1].patch, 'confirmedAt'), false);
  assert.equal(run.api.changedSinceConfirmed(run.api.state.setlists[id]), true);

  run.api.confirmSetlist(id);
  await settleWrites();
  assert.equal(run.clock.calls(), 3);
  assert.deepEqual(Object.keys(firebase.writes[2].patch).sort(), confirmationKeys());
  assert.equal(firebase.writes[2].patch.confirmedAt, 103);
  assert.equal(firebase.writes[2].patch.updatedAt, 103);
  assert.equal(run.api.isConfirmed(run.api.state.setlists[id]), true);
});

test('Firebase missing-document fallback keeps confirmation metadata and existing fields', async () => {
  const firebase = makeFirebase({ rejectUpdate: true });
  const run = makeHarness(sourceText(), { firebase: firebase.fb });
  const fixture = makeFixture();
  const id = seed(run.api, fixture);

  run.api.confirmSetlist(id);
  await settleWrites();

  assert.equal(run.clock.calls(), 1);
  assert.equal(firebase.writes.length, 2);
  assert.equal(firebase.writes[0].operation, 'updateDoc');
  assert.equal(firebase.writes[1].operation, 'setDoc');
  assert.deepEqual(firebase.writes[1].data.songs, fixture.songs);
  assert.equal(firebase.writes[1].data.notes, fixture.notes);
  assert.equal(firebase.writes[1].data.extraExistingField, fixture.extraExistingField);
  assert.equal(firebase.writes[1].data.confirmedAt, 101);
  assert.equal(firebase.writes[1].data.updatedAt, 101);
  assert.equal(firebase.writes[1].data.confirmedBy, 'Fictional Presider');
  assert.equal(Object.prototype.hasOwnProperty.call(firebase.writes[1].data, 'confirm'), false);
  assert.equal(run.alerts.length, 0);
  assert.equal(run.api.isConfirmed(run.api.state.setlists[id]), true);
});

test('confirmation is a no-op when the setlist has no songs in either mode', async () => {
  for (const mode of ['local', 'firebase']) {
    const firebase = mode === 'firebase' ? makeFirebase() : null;
    const run = makeHarness(sourceText(), { firebase: firebase && firebase.fb });
    const fixture = makeFixture();
    fixture.songs = [];
    const id = seed(run.api, fixture);
    const before = JSON.stringify(run.api.state.setlists[id]);

    run.api.confirmSetlist(id);
    await settleWrites();

    assert.equal(run.clock.calls(), 0, mode);
    assert.equal(JSON.stringify(run.api.state.setlists[id]), before, mode);
    assert.equal(run.storage.writes.length, 0, mode);
    if (firebase) assert.equal(firebase.writes.length, 0, mode);
  }
});
