'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourceRoot = path.resolve(__dirname, '..');

function makeHarness() {
  const values = new Map();
  const sandbox = {
    window: {
      SongLib: {
        serviceIdFor(date, service) { return String(date) + '_' + String(service); },
        recompute() { return {}; }, applySung() { return { changed: {} }; }, applyUndo() { return { changed: {}, removed: [] }; },
        backfillServiceId() { return ''; }, applyBackfill() { return null; }, removeHistoryEntry() { return {}; },
        totalDuration() { return 0; }, countedSongIds(sl) { return (sl && sl.songs) || []; }
      },
      SONG_SEED: { songs: [] },
      WorshipApp: {}
    },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    document: { activeElement: null },
    location: { reload() {} },
    fetch() { return Promise.reject(new Error('fictional catalog sync disabled')); },
    console: { log() {}, warn() {}, error() {} },
    alert() {}, confirm() { return true; }, navigator: {},
    crypto: globalThis.crypto, TextEncoder, Uint8Array, Promise,
    Object, Array, String, Number, Boolean, Math, JSON, Intl, RegExp, Error, Map, Set, Symbol, Reflect,
    isNaN, parseInt, encodeURIComponent, decodeURIComponent, Date, setTimeout, clearTimeout,
    AbortController, URL, Blob
  };
  sandbox.globalThis = sandbox;
  const setlistSource = fs.readFileSync(path.join(sourceRoot, 'src/domain/setlist.js'), 'utf8');
  const repositorySource = fs.readFileSync(path.join(sourceRoot, 'src/services/song-repository.js'), 'utf8');
  vm.runInNewContext(setlistSource, sandbox, { filename: 'src/domain/setlist.js' });
  vm.runInNewContext(repositorySource, sandbox, { filename: 'src/services/song-repository.js' });
  const source = fs.readFileSync(path.join(sourceRoot, 'song-app.js'), 'utf8')
    .replace("import './src/domain/setlist.js?v=DEV';", '')
    .replace("import './src/services/song-repository.js?v=DEV';", '')
    .replace(/export function /g, 'function ');
  const executable = source + `
globalThis.__songOwnerApi = {
  state, productionCanMutate, productionIsMyPresider, productionServiceRows, productionMonthRows,
  productionSelectView, productionLibraryView, productionPrayerSummary, serviceOrder,
  ensureSetlist, updateSetlist, setlistAddSong, setlistRemoveSongAt, setlistReorder,
  confirmSetlist, handleAct, handleChg
};`;
  vm.runInNewContext(executable, sandbox, { filename: 'song-app.js' });
  return { sandbox, api: sandbox.__songOwnerApi, values };
}

function fixtureSchedule() {
  return [
    { date: '2099-01-03', service: 'Morning', worship: 'Sabbath Day', assignments: { Presider: 'Owner Alias', Sermon: 'Fictional Preacher' } },
    { date: '2099-01-10', service: 'Morning', worship: 'Sabbath Day', assignments: { Presider: 'Other Member', Sermon: 'Fictional Preacher' } }
  ];
}

function prepare(run, options = {}) {
  const id = '2099-01-03_Morning';
  const otherId = '2099-01-10_Morning';
  run.api.state.nameMap = { 'Owner Alias': 'Owner' };
  run.api.state.schedule = options.schedule || fixtureSchedule();
  run.api.state.setlists = options.setlists || {
    [id]: { id, date: '2099-01-03', serviceLabel: 'Morning', worshipType: 'Sabbath Day', presider: 'Stale Plan Owner', songs: ['song-1'], status: 'planned' },
    [otherId]: { id: otherId, date: '2099-01-10', serviceLabel: 'Morning', worshipType: 'Sabbath Day', presider: 'Other Member', songs: ['song-1'], status: 'planned' }
  };
  run.api.state.songs = [{ id: 'song-1', number: '001', title: 'Fictional Song', category: 'Glory', durationSec: 60 }];
  run.api.state.songById = { 'song-1': run.api.state.songs[0] };
  run.api.state.ui.me = options.me || 'Owner';
  run.api.state.ui.workspaceService = options.workspaceService || id;
  run.api.state.ui.currentSetlist = options.currentSetlist || id;
  run.api.state.ui.presiderFilter = 'all';
  run.api.state.ui.presiderMonth = '2099-01';
  run.api.state.settings = options.editor ? { editorPinHash: 'fictional-editor-hash' } : {};
  run.values.delete('nss-editor-unlock');
  if (options.editor) run.values.set('nss-editor-unlock', 'fictional-editor-hash');
  return { id, otherId };
}

test('scheduled owner uses canonical current assignment, and all-services browsing remains available', () => {
  const run = makeHarness();
  const ids = prepare(run, { me: 'Owner' });
  const row = run.api.productionServiceRows().find(item => item.id === ids.id);
  assert.equal(run.api.productionCanMutate(ids.id), true);
  assert.equal(run.api.productionIsMyPresider(row), true);
  assert.deepEqual(run.api.productionMonthRows().map(item => item.id), [ids.id, ids.otherId]);
});

test('other selected member can browse a plan but receives disabled mutation affordances', () => {
  const run = makeHarness();
  const ids = prepare(run, { me: 'Other Member' });
  assert.equal(run.api.productionCanMutate(ids.id), false);
  const row = run.api.productionServiceRows().find(item => item.id === ids.id);
  const html = run.api.productionSelectView(row);
  assert.match(html, /View only/);
  assert.match(html, /data-song-act="confirm-songs"[^>]+disabled/);
  assert.match(html, /data-song-chg="workspace-notes"[^>]+readonly/);
  assert.match(html, /data-song-act="remove-workspace-song"[^>]+disabled/);
  assert.match(html, /data-song-act="add-library-song"[^>]+disabled/);
});

test('editor PIN overrides service ownership for an existing plan', () => {
  const run = makeHarness();
  const ids = prepare(run, { me: 'Other Member', editor: true });
  assert.equal(run.api.productionCanMutate(ids.id), true);
  const row = run.api.productionServiceRows().find(item => item.id === ids.id);
  assert.doesNotMatch(run.api.productionSelectView(row), /View only/);
});

test('stale plan presider and missing schedule never authorize a mutation', () => {
  const run = makeHarness();
  const ids = prepare(run, { me: 'Stale Plan Owner' });
  assert.equal(run.api.productionCanMutate(ids.id), false);
  const standalone = '2099-01-17_Evening';
  run.api.state.setlists[standalone] = { id: standalone, date: '2099-01-17', serviceLabel: 'Evening', presider: 'Stale Plan Owner', songs: [] };
  run.api.state.schedule = [];
  assert.equal(run.api.productionCanMutate(standalone), false);
  assert.equal(run.api.ensureSetlist('2099-01-18', 'Third Day', 'Evening', 'manual'), null);
});

test('synthetic events and direct low level calls cannot change another member plan', () => {
  const run = makeHarness();
  const ids = prepare(run, { me: 'Other Member' });
  const before = JSON.stringify(run.api.state.setlists[ids.id]);
  run.api.handleAct('add-library-song', { dataset: { id: 'song-2' } });
  run.api.handleAct('remove-workspace-song', { dataset: { index: '0', songId: 'song-1' } });
  run.api.handleAct('prep-up', { dataset: { index: '0' } });
  run.api.handleAct('confirm-songs', { dataset: { id: ids.id } });
  run.api.handleChg('song-role', { dataset: { songId: 'song-1' }, value: 'glory' });
  run.api.handleChg('workspace-notes', { value: 'Synthetic overwrite' });
  run.api.updateSetlist(ids.id, { notes: 'Direct overwrite' });
  run.api.setlistAddSong(ids.id, 'song-2');
  run.api.setlistRemoveSongAt(ids.id, 0);
  run.api.setlistReorder(ids.id, ['song-2']);
  assert.equal(JSON.stringify(run.api.state.setlists[ids.id]), before);
});

test('legacy opening prayer falls back to Sermon in both order renderers', () => {
  const run = makeHarness();
  prepare(run, { me: 'Owner' });
  const steps = run.api.serviceOrder('Sabbath Day', 'Morning', { Sermon: 'Fictional Preacher' }, {});
  assert.equal(steps.find(step => step.step === 'Opening prayer').who, 'Fictional Preacher');
  const summary = run.api.productionPrayerSummary({ assignments: { Sermon: 'Fictional Preacher' }, setlist: null, choirSong: '' });
  assert.match(summary, /Opening:<\/b> Fictional Preacher/);
});
