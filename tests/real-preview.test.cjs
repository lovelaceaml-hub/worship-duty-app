'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const preview = require('../scripts/real-preview.cjs');

const prototypeRoot = path.resolve(__dirname, '../docs/design/prototype/open-bulletin');

function firestoreFields(fields) {
  const encoded = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value === null) encoded[key] = { nullValue: null };
    else if (typeof value === 'boolean') encoded[key] = { booleanValue: value };
    else if (typeof value === 'number' && Number.isInteger(value)) encoded[key] = { integerValue: String(value) };
    else if (typeof value === 'number') encoded[key] = { doubleValue: value };
    else if (typeof value === 'string') encoded[key] = { stringValue: value };
    else if (Array.isArray(value)) encoded[key] = { arrayValue: { values: value.map((item) => ({ stringValue: String(item) })) } };
    else if (value && typeof value === 'object') encoded[key] = { mapValue: { fields: firestoreFields(value) } };
  });
  return encoded;
}

function firestoreDocument(collection, id, fields) {
  return {
    name: preview.FIRESTORE_BASE + collection + '/' + id,
    fields: firestoreFields(fields)
  };
}

function fakeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

function tinyConstants() {
  return {
    CATEGORIES: [
      { name: 'Worship', color: '#000000', duties: ['Presider', 'Sermon'] },
      { name: 'Media', color: '#111111', duties: ['Media Booth #1'] }
    ],
    FEATURES: [
      { id: 'siteLock', def: true },
      { id: 'songPicker', def: true },
      { id: 'sheetSync', def: false }
    ]
  };
}

function tinySongs() {
  return [{ id: '001', number: '001', category: 'Festival', title: 'First Song', durationSec: 120 }];
}

function sourceRecords() {
  return {
    members: { list: ['A. Member', 'B. Member'] },
    departments: { map: { Worship: ['A. Member'], Media: ['B. Member'] } },
    settings: { features: { songPicker: false, ignored: true }, pinHash: 'do-not-return', sitePinHash: 'do-not-return', sheetUrl: 'do-not-return' },
    schedule: [
      {
        id: 'service-1',
        date: '2026-09-12',
        worship: 'Sabbath Day',
        service: 'Morning',
        time: '9:05 AM',
        notes: 'Real note for the fictional test',
        assignments: { Presider: 'A. Member', 'Media Booth #1': 'B. Member' },
        updatedBy: 'private actor',
        secretField: 'private value'
      }
    ],
    setlists: [
      {
        id: 'service-1',
        date: '2026-09-12',
        worshipType: 'Sabbath Day',
        serviceLabel: 'Morning',
        presider: 'A. Member',
        notes: 'Outline note',
        songs: ['001', 'missing-77'],
        glorySong: 'missing-77',
        thanksSong: null,
        updatedAt: '2026-09-08T12:00:00.000Z',
        confirmedAt: '2026-09-08T12:00:00.000Z',
        confirmedBy: 'A. Member',
        status: 'planned',
        updatedBy: 'private actor',
        history: [{ date: '2026-09-01', service: 'old-service', by: 'private actor', markedAt: 'private' }]
      },
      {
        id: 'standalone-2',
        date: '2026-09-13',
        worshipType: 'Third Day',
        serviceLabel: 'Evening',
        presider: 'B. Member',
        time: '6:30 PM',
        songs: ['missing-99'],
        updatedAt: '2026-09-07T12:00:00.000Z',
        confirmedAt: '2026-09-06T12:00:00.000Z',
        status: 'planned'
      },
      {
        id: 'sung-3',
        date: '2026-09-14',
        worshipType: 'Third Day',
        serviceLabel: 'Morning',
        presider: 'A. Member',
        songs: ['001'],
        updatedAt: '2026-09-07T12:00:00.000Z',
        confirmedAt: null,
        status: 'sung'
      }
    ],
    songStats: [
      {
        id: '001',
        timesSung: 4,
        lastSung: '2026-09-01',
        history: [
          { date: '2026-09-01', service: 'old-service', by: 'private actor' },
          { date: '2026-08-01', service: 'older-service', markedAt: 'private' }
        ],
        updatedBy: 'private actor'
      }
    ],
    requests: [
      {
        id: 'request-1',
        name: 'A. Member',
        svcId: 'service-1',
        duty: 'Sermon',
        note: 'Please review this fictional request',
        status: 'pending',
        createdAt: '2026-09-08T10:00:00.000Z',
        resolvedAt: '2026-09-08T11:00:00.000Z',
        updatedBy: 'private actor'
      },
      {
        id: 'request-blank-status',
        name: 'B. Member',
        svcId: 'service-1',
        duty: 'Media',
        note: 'Blank status defaults to pending in this fictional test',
        status: '',
        createdAt: '2026-09-08T09:00:00.000Z'
      },
      {
        id: 'request-spaced-status',
        name: 'A. Member',
        svcId: 'service-1',
        duty: 'Prayer',
        note: 'Mixed case and spaces normalize to pending in this fictional test',
        status: '  PeNdInG  ',
        createdAt: '2026-09-08T08:00:00.000Z'
      },
      {
        id: 'request-approved',
        name: 'A. Member',
        svcId: 'service-1',
        duty: 'Sermon',
        note: 'Approved history must not enter the preview',
        status: 'approved',
        createdAt: '2026-09-07T10:00:00.000Z'
      },
      {
        id: 'request-declined',
        name: 'B. Member',
        svcId: 'service-1',
        duty: 'Media',
        note: 'Declined history must not enter the preview',
        status: 'declined',
        createdAt: '2026-09-06T10:00:00.000Z'
      }
    ]
  };
}

test('decodes Firestore values and normalizes the prototype payload safely', () => {
  const data = preview.normalizePreviewData(sourceRecords(), {
    constants: tinyConstants(),
    songs: tinySongs(),
    today: '2026-09-08',
    fetchedAt: '2026-09-08T20:00:00.000Z'
  });

  assert.deepEqual(data.members, ['A. Member', 'B. Member']);
  assert.deepEqual(data.features, { siteLock: true, songPicker: false, sheetSync: false });
  assert.equal(data.services[0].worshipType, 'Sabbath Day');
  assert.equal(data.services[0].serviceLabel, 'Morning');
  assert.equal(data.services[0].time, '09:05');
  assert.equal(data.services[0].notes, 'Real note for the fictional test');
  assert.equal(data.services[0].worship, undefined);
  assert.equal(data.services[0].updatedBy, undefined);

  assert.equal(data.setlists['service-1'].confirmed, true);
  assert.equal(data.setlists['service-1'].status, 'confirmed');
  assert.deepEqual(data.setlists['service-1'].history, [{ date: '2026-09-01', service: 'old-service' }]);
  assert.equal(data.setlists['service-1'].updatedBy, undefined);
  assert.equal(data.setlists['standalone-2'].status, 'changed');
  assert.equal(data.setlists['sung-3'].status, 'sung');

  const standalone = data.services.find((service) => service.id === 'standalone-2');
  assert.deepEqual(standalone, {
    id: 'standalone-2',
    date: '2026-09-13',
    worshipType: 'Third Day',
    serviceLabel: 'Evening',
    time: '18:30',
    presider: 'B. Member',
    assignments: {},
    standalone: true
  });

  assert.deepEqual(data.requests[0], {
    id: 'request-1',
    name: 'A. Member',
    serviceId: 'service-1',
    duty: 'Sermon',
    note: 'Please review this fictional request',
    status: 'pending',
    createdAt: '2026-09-08T10:00:00.000Z',
    resolvedAt: '2026-09-08T11:00:00.000Z'
  });
  assert.equal(data.requests.length, 3);
  assert.deepEqual(data.requests.slice(1).map((request) => ({ id: request.id, status: request.status })), [
    { id: 'request-blank-status', status: 'pending' },
    { id: 'request-spaced-status', status: 'pending' }
  ]);
  assert.equal(data.requests.some((request) => request.id === 'request-approved'), false);
  assert.equal(data.requests.some((request) => request.id === 'request-declined'), false);
  assert.equal(data.requests[0].svcId, undefined);

  assert.deepEqual(data.songStats['001'], {
    songId: '001',
    timesSung: 4,
    sungCount: 4,
    lastSung: '2026-09-01',
    history: [
      { date: '2026-09-01', service: 'old-service' },
      { date: '2026-08-01', service: 'older-service' }
    ]
  });
  assert.equal(data.songStats['001'].history[0].by, undefined);
  assert.equal(data.songs.find((song) => song.id === 'missing-77').title, 'Title unavailable');
  assert.equal(data.songs.find((song) => song.id === 'missing-77').number, 'missing-77');
  assert.deepEqual(data.passcodes, { editor: '', site: '' });
  assert.equal(data.readOnly, true);
  assert.equal(data.today, '2026-09-08');
  assert.equal(data.fetchedAt, '2026-09-08T20:00:00.000Z');
  assert.equal(data.source, 'Current Worship Service records');
  assert.deepEqual(data.nameMap, {});
});

test('time24 handles 12-hour and already-normalized values', () => {
  assert.equal(preview.time24('12:00 AM'), '00:00');
  assert.equal(preview.time24('12:00 PM'), '12:00');
  assert.equal(preview.time24('7:30 PM'), '19:30');
  assert.equal(preview.time24('07:30'), '07:30');
  assert.equal(preview.time24('25:00'), '');
  assert.equal(preview.time24('not a time'), '');
});

test('Firestore loader uses only allowlisted GET paths and paginates list calls', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    if (parsed.pathname.endsWith('/schedule') && !parsed.searchParams.has('pageToken')) {
      return fakeResponse({
        documents: [firestoreDocument('schedule', 'one', { date: '2026-09-12', worship: 'Sabbath Day', service: 'Morning', time: '9:00 AM' })],
        nextPageToken: 'page-two'
      });
    }
    if (parsed.pathname.endsWith('/schedule') && parsed.searchParams.get('pageToken') === 'page-two') {
      return fakeResponse({ documents: [firestoreDocument('schedule', 'two', { date: '2026-09-13', worship: 'Third Day', service: 'Evening', time: '7:00 PM' })] });
    }
    if (parsed.pathname.endsWith('/setlists')) return fakeResponse({ documents: [] });
    if (parsed.pathname.endsWith('/songStats')) return fakeResponse({ documents: [] });
    if (parsed.pathname.endsWith('/requests')) return fakeResponse({ documents: [] });
    if (parsed.pathname.endsWith('/app/members')) return fakeResponse({ fields: firestoreFields({ list: ['A. Member'] }) });
    if (parsed.pathname.endsWith('/app/departments')) return fakeResponse({ fields: firestoreFields({ map: { Worship: ['A. Member'] } }) });
    if (parsed.pathname.endsWith('/app/settings')) return fakeResponse({ fields: firestoreFields({ features: { siteLock: true }, pinHash: 'secret' }) });
    return fakeResponse({ error: 'unexpected' }, 404);
  };
  const loader = preview.createFirestoreLoader({ fetchImpl: fakeFetch, pageSize: 2 });
  const data = await preview.loadProductionData({ loader, constants: tinyConstants(), songs: tinySongs(), today: '2026-09-08', fetchedAt: '2026-09-08T20:00:00.000Z' });

  assert.equal(data.services.length, 2);
  assert.equal(calls.length, 8);
  const paths = calls.map((call) => call.url.pathname.replace('/v1/projects/lv-zion-duties/databases/(default)/documents/', ''));
  assert.deepEqual(paths.sort(), ['app/departments', 'app/members', 'app/settings', 'requests', 'schedule', 'schedule', 'setlists', 'songStats'].sort());
  assert.equal(calls.filter((call) => call.url.pathname.endsWith('/schedule'))[0].url.searchParams.get('pageSize'), '2');
  assert.equal(calls.filter((call) => call.url.pathname.endsWith('/schedule'))[1].url.searchParams.get('pageToken'), 'page-two');
  calls.forEach(({ options }) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, undefined);
  });
  const settingsCall = calls.find((call) => call.url.pathname.endsWith('/app/settings'));
  assert.equal(settingsCall.url.searchParams.get('mask.fieldPaths'), 'features');
});

test('server enforces loopback host, same-origin policy, methods, and asset allowlist', async (t) => {
  let dataReads = 0;
  const testPrototypeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'real-preview-assets-'));
  t.after(() => fs.rmSync(testPrototypeRoot, { recursive: true, force: true }));
  ['index.html', 'app.js', 'styles.css'].forEach((name) => {
    fs.copyFileSync(path.join(prototypeRoot, name), path.join(testPrototypeRoot, name));
  });
  fs.writeFileSync(path.join(testPrototypeRoot, 'real-preview.js'), 'window.WorshipPrototypeReady = true;\n');
  const server = preview.createPreviewServer({
    port: 18100,
    prototypeRoot: testPrototypeRoot,
    loadData: async () => {
      dataReads += 1;
      return { members: ['A. Member'], readOnly: true };
    }
  });
  await new Promise((resolve) => server.listen(18100, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  async function request(requestPath, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 18100,
        path: requestPath,
        method: options.method || 'GET',
        headers: Object.assign({ Host: '127.0.0.1:18100' }, options.headers || {})
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  const index = await request('/index.html');
  assert.equal(index.status, 200);
  assert.match(index.body, /real-preview\.js/);
  assert.doesNotMatch(index.body, /fixtures\.js/);
  assert.equal(index.headers['cache-control'], 'no-store');
  assert.equal(index.headers['x-content-type-options'], 'nosniff');
  assert.match(index.headers['content-security-policy'], /default-src 'none'/);

  const nested = await request('/open-bulletin/index.html');
  assert.equal(nested.status, 200);
  const loader = await request('/real-preview.js');
  assert.equal(loader.status, 200);
  assert.equal(loader.body, 'window.WorshipPrototypeReady = true;\n');

  const data = await request('/preview-data.json');
  assert.equal(data.status, 200);
  assert.deepEqual(JSON.parse(data.body), { members: ['A. Member'], readOnly: true });
  assert.equal(dataReads, 1);
  assert.equal(data.headers['access-control-allow-origin'], undefined);

  assert.equal((await request('/preview-data.json', { method: 'HEAD' })).status, 405);
  assert.equal((await request('/preview-data.json', { method: 'POST' })).status, 405);
  assert.equal((await request('/fixtures.js')).status, 404);
  assert.equal((await request('/../AGENTS.md')).status, 404);
  assert.equal((await request('/%2e%2e/AGENTS.md')).status, 400);
  assert.equal((await request('/index.html', { headers: { Host: 'evil.example:18100' } })).status, 403);
  assert.equal((await request('/index.html', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/index.html', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await request('/index.html', { headers: { Origin: 'http://localhost:18100' } })).status, 200);

  const head = await request('/styles.css', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

test('missing production reads return a generic 503 without error details', async (t) => {
  const server = preview.createPreviewServer({ port: 18101, prototypeRoot, loadData: async () => { throw new Error('private record detail'); } });
  await new Promise((resolve) => server.listen(18101, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 18101, path: '/preview-data.json', headers: { Host: 'localhost:18101' } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(result.status, 503);
  assert.equal(result.body, JSON.stringify({ error: 'Preview data unavailable.' }));
  assert.doesNotMatch(result.body, /private record detail/);
});

test('default catalog is loaded from the local static source only', () => {
  const catalog = preview.loadSafeCatalog();
  assert.equal(catalog.length, 509);
  assert.deepEqual(catalog[0], { id: '001', number: '001', category: 'Festival', title: 'Holy and Honorable Day', durationSec: 124 });
  assert.equal(fs.existsSync(path.resolve(__dirname, '../song-seed.js')), true);
});
