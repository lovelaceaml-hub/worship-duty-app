'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const setlist = require('../src/domain/setlist.js');
const member = require('../src/domain/member.js');

function comparable(value) {
  return {
    valueOf() { return value; },
    toMillis() { throw new Error('timestamp must be compared without normalization'); }
  };
}

test('exports the setlist domain through CommonJS with the stable API', () => {
  assert.deepEqual(Object.keys(setlist).sort(), ['isChanged', 'isConfirmed', 'status', 'summary']);
  assert.equal(typeof setlist.isConfirmed, 'function');
  assert.equal(typeof setlist.isChanged, 'function');
  assert.equal(typeof setlist.status, 'function');
  assert.equal(typeof setlist.summary, 'function');
});

test('confirmation compares truthy timestamps directly, including comparable timestamp values', () => {
  assert.equal(setlist.isConfirmed({ confirmedAt: 4, updatedAt: 4 }), true);
  assert.equal(setlist.isConfirmed({ confirmedAt: 5, updatedAt: 4 }), true);
  assert.equal(setlist.isConfirmed({ confirmedAt: 4, updatedAt: 5 }), false);
  assert.equal(setlist.isChanged({ confirmedAt: 4, updatedAt: 5 }), true);
  assert.equal(setlist.isChanged({ confirmedAt: 4, updatedAt: 4 }), false);
  assert.equal(setlist.isChanged({ confirmedAt: 5, updatedAt: 4 }), false);
  assert.equal(setlist.isConfirmed({ confirmedAt: comparable(9), updatedAt: comparable(9) }), true);
  assert.equal(setlist.isChanged({ confirmedAt: comparable(9), updatedAt: comparable(10) }), true);
  assert.equal(setlist.isConfirmed({ confirmedAt: 0, updatedAt: 0 }), false);
  assert.equal(setlist.isChanged({ confirmedAt: null, updatedAt: 10 }), false);
});

test('status emits semantic codes with sung and empty precedence preserved', () => {
  assert.equal(setlist.status({ status: 'sung', songs: ['fictional-song'], confirmedAt: 1, updatedAt: 2 }), 'sung');
  assert.equal(setlist.status({ songs: [] }), 'empty');
  assert.equal(setlist.status(null), 'empty');
  assert.equal(setlist.status({ songs: ['fictional-song'], confirmedAt: 9, updatedAt: 9 }), 'confirmed');
  assert.equal(setlist.status({ songs: ['fictional-song'], confirmedAt: 8, updatedAt: 9 }), 'changed');
  assert.equal(setlist.status({ songs: ['fictional-song'] }), 'picked');
});

test('summary preserves the existing null and count flag shape', () => {
  assert.equal(setlist.summary(undefined, 'missing'), null);
  assert.deepEqual(setlist.summary({ empty: { songs: [], confirmedAt: 8, updatedAt: 1 } }, 'empty'), {
    count: 0,
    confirmed: false,
    changed: false
  });
  assert.deepEqual(setlist.summary({ confirmed: { songs: ['fictional-song'], confirmedAt: 10, updatedAt: 10 } }, 'confirmed'), {
    count: 1,
    confirmed: true,
    changed: false
  });
  assert.deepEqual(setlist.summary({ changed: { songs: ['fictional-song'], confirmedAt: 9, updatedAt: 10 } }, 'changed'), {
    count: 1,
    confirmed: false,
    changed: true
  });
});

test('malformed records remain safe and inputs are not mutated', () => {
  const setlists = {
    malformed: { songs: null, confirmedAt: 3, updatedAt: 4 },
    stringSongs: { songs: 'fictional', confirmedAt: 3, updatedAt: 4 }
  };
  const before = JSON.stringify(setlists);
  assert.equal(setlist.isConfirmed(), false);
  assert.equal(setlist.isChanged(), false);
  assert.equal(setlist.status({ songs: null }), 'empty');
  assert.deepEqual(setlist.summary(setlists, 'malformed'), { count: 0, confirmed: false, changed: false });
  assert.equal(setlist.summary(setlists, 'stringSongs').count, 'fictional'.length);
  assert.equal(JSON.stringify(setlists), before);
});

test('member selectors delegate both compatibility names to the domain summary', () => {
  const records = { service: { songs: ['fictional-song'], confirmedAt: 4, updatedAt: 5 } };
  const expected = setlist.summary(records, 'service');
  assert.deepEqual(member.setlistSummary(records, 'service'), expected);
  assert.deepEqual(member.songStateFor(records, 'service'), expected);
  assert.equal(member.setlistSummary, member.songStateFor);
});

function makeMixedReleaseHarness() {
  const sourceRoot = path.resolve(__dirname, '..');
  const songSource = fs.readFileSync(path.join(sourceRoot, 'song-app.js'), 'utf8');
  const setlistSource = fs.readFileSync(path.join(sourceRoot, 'src/domain/setlist.js'), 'utf8');
  const stamp = '20990102030405';
  const sourceImport = "import './src/domain/setlist.js?v=DEV';";
  const stagedImport = `import './src/domain/setlist.js?v=${stamp}';`;
  const stagedSongSource = songSource.replace(
    sourceImport,
    stagedImport
  );
  assert.notEqual(stagedSongSource, songSource);

  let reloads = 0;
  const sandbox = {
    window: {
      SongLib: {
        serviceIdFor() { return ''; },
        recompute() { return {}; },
        applySung() { return {}; },
        applyUndo() { return {}; },
        backfillServiceId() { return ''; },
        applyBackfill() { return {}; },
        removeHistoryEntry() { return {}; },
        totalDuration() { return 0; },
        countedSongIds() { return []; }
      },
      SONG_SEED: { songs: [] }
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    document: {
      activeElement: null,
      createElement(tag) { return { tagName: String(tag).toUpperCase() }; }
    },
    location: { reload() { reloads += 1; } },
    fetch() { return Promise.reject(new Error('fictional catalog sync disabled')); },
    console: { log() {}, warn() {}, error() {} },
    alert() {},
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
    Date,
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;
  const oldHostNamespace = sandbox.window.WorshipApp;
  vm.runInNewContext(setlistSource, sandbox, { filename: path.join(sourceRoot, 'src/domain/setlist.js') });
  const executable = stagedSongSource.replace(stagedImport, '').replace('export function mount', 'function mount') + `
globalThis.__mixedReleaseApi = { songStatus, isConfirmed, changedSinceConfirmed };
`;
  vm.runInNewContext(executable, sandbox, { filename: path.join(sourceRoot, 'song-app.js') });
  return { sandbox, oldHostNamespace, stagedImport, reloads: () => reloads, stamp };
}

test('mixed release loads the stamped setlist dependency without forcing an old host reload', () => {
  const run = makeMixedReleaseHarness();
  assert.equal(run.oldHostNamespace, undefined);
  assert.equal(run.stagedImport, `import './src/domain/setlist.js?v=${run.stamp}';`);
  assert(Object.isFrozen(run.sandbox.window.WorshipApp.domain.setlist));
  const status = run.sandbox.__mixedReleaseApi.songStatus({
    songs: ['fictional-song'], confirmedAt: 4, updatedAt: 4
  });
  assert.equal(status.cls, 'confirmed');
  assert.equal(status.label, 'Confirmed');
  assert.equal(run.sandbox.__mixedReleaseApi.isConfirmed({ confirmedAt: 4, updatedAt: 4 }), true);
  assert.equal(run.reloads(), 0);
});
