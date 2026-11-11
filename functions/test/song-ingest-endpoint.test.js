'use strict';

/* The Signal song ingest's endpoint: only with its token, only setlists and
   songStats, and a patch replaces just the fields it names. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { createSongIngestEndpoint } = require('../song-ingest-endpoint.js');

function harness(docs = {}) {
  const db = {
    collection: collection => ({
      doc: id => ({
        async get() {
          const data = docs[collection + '/' + id];
          return { exists: data !== undefined, data: () => data };
        },
        async set(fields, { mergeFields }) {
          const path = collection + '/' + id;
          docs[path] = Object.assign({}, docs[path]);
          mergeFields.forEach(name => { docs[path][name] = fields[name]; });
        }
      })
    })
  };
  const endpoint = createSongIngestEndpoint({ db, logger: { info() {}, error() {} }, token: () => 'right-token' });
  const call = async (body, { token = 'right-token', method = 'POST' } = {}) => {
    const out = {};
    const response = { status(code) { out.status = code; return response; }, json(value) { out.body = value; return response; } };
    await endpoint({ method, body, get: name => (name === 'authorization' && token ? 'Bearer ' + token : '') }, response);
    return out;
  };
  return { call, docs };
}

test('the song ingest endpoint refuses a missing or wrong token, and anything but POST', async () => {
  const { call } = harness({ 'setlists/a': { songs: [1] } });
  assert.equal((await call({ op: 'get', collection: 'setlists', id: 'a' }, { token: '' })).status, 401);
  assert.equal((await call({ op: 'get', collection: 'setlists', id: 'a' }, { token: 'wrong' })).status, 401);
  assert.equal((await call({ op: 'get', collection: 'setlists', id: 'a' }, { method: 'GET' })).status, 405);
});

test('it reads and patches only setlists and songStats, by plain document id', async () => {
  const { call } = harness({ 'accounts/B. Adam': { pinHash: 'x' } });
  for (const [collection, id] of [['accounts', 'B. Adam'], ['schedule', 'a'], ['setlists', 'a/b'], ['setlists', ''], ['setlists', '..']]) {
    assert.equal((await call({ op: 'get', collection, id })).status, 400, collection + '/' + id);
    assert.equal((await call({ op: 'patch', collection, id, fields: { a: 1 } })).status, 400, collection + '/' + id);
  }
  assert.equal((await call({ op: 'delete', collection: 'setlists', id: 'a' })).status, 400);
});

test('get says whether the document exists; patch replaces the named fields and keeps the rest', async () => {
  const { call, docs } = harness({ 'setlists/2026-10-10_morning': { songs: [1, 2], presider: 'B. Adam', meta: { a: 1, b: 2 } } });
  assert.deepEqual((await call({ op: 'get', collection: 'songStats', id: '12' })).body, { exists: false, data: null });
  assert.deepEqual((await call({ op: 'get', collection: 'setlists', id: '2026-10-10_morning' })).body.data.songs, [1, 2]);
  const patched = await call({ op: 'patch', collection: 'setlists', id: '2026-10-10_morning', fields: { songs: [3], meta: { a: 9 } } });
  assert.deepEqual(patched, { status: 200, body: { ok: true } });
  assert.deepEqual(docs['setlists/2026-10-10_morning'], { songs: [3], presider: 'B. Adam', meta: { a: 9 } });
  await call({ op: 'patch', collection: 'songStats', id: '12', fields: { timesSung: 1 } });
  assert.deepEqual(docs['songStats/12'], { timesSung: 1 });
  for (const fields of [{}, { 'a.b': 1 }, { '': 1 }, null, [1]]) {
    assert.equal((await call({ op: 'patch', collection: 'setlists', id: 'x', fields })).status, 400);
  }
});
