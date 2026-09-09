'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const preview = require('../scripts/runtime-preview.cjs');

const sourceRoot = '/Users/anthony/Projects/worship-duty-app';

function fixtureData() {
  return {
    members: ['Fictional Member', 'Another Member'],
    departments: { Worship: ['Fictional Member'], Media: ['Another Member'] },
    features: { siteLock: true, editorLock: true, songPicker: true },
    today: '2026-09-08',
    services: [
      { id: 'fictional-service', date: '2026-09-12', worshipType: 'Sabbath Day', serviceLabel: 'Morning', time: '09:00', assignments: { Presider: 'Fictional Member' } },
      { id: 'standalone-setlist', date: '2026-09-13', worshipType: 'Third Day', serviceLabel: 'Evening', time: '18:00', standalone: true }
    ],
    setlists: {
      'fictional-service': { id: 'fictional-service', date: '2026-09-12', worshipType: 'Sabbath Day', serviceLabel: 'Morning', presider: 'Fictional Member', songs: ['F-001'], status: 'planned' },
      'standalone-setlist': { id: 'standalone-setlist', date: '2026-09-13', worshipType: 'Third Day', serviceLabel: 'Evening', presider: 'Another Member', songs: ['F-001'], status: 'planned' }
    },
    songs: [{ id: 'F-001', number: 'F-001', category: 'Fictional', title: 'Fictional Song', durationSec: 60 }],
    songStats: { 'F-001': { songId: 'F-001', timesSung: 1, sungCount: 1, lastSung: '2026-09-01', history: [] } },
    requests: []
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function request(port, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1', port, path: requestPath, method: options.method || 'GET',
      headers: Object.assign({ Host: '127.0.0.1:' + port }, options.headers || {})
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('runtime server uses an explicit current-source allowlist and same-origin read-only policy', async (t) => {
  const server = preview.createRuntimePreviewServer({ sourceRoot, loadData: async () => fixtureData() });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const index = await request(port, '/');
  assert.equal(index.status, 200);
  assert.match(index.body, /runtime-preview-bootstrap\.js/);
  assert.doesNotMatch(index.body, /firebase-config\.js|seed-data\.js|gstatic\.com|manifest\.json|sw\.js/);
  assert.match(index.headers['content-security-policy'], /default-src 'self'/);
  assert.match(index.headers['content-security-policy'], /connect-src 'self'/);
  assert.match(index.headers['content-security-policy'], /worker-src 'none'/);
  assert.match(index.headers['content-security-policy'], /form-action 'none'/);

  const app = await request(port, '/app.js');
  assert.equal(app.status, 200);
  assert.match(app.body, /function init\(/);
  const sourceSeed = await request(port, '/song-seed.js');
  assert.equal(sourceSeed.status, 200);
  assert.match(sourceSeed.body, /Fictional Song/);
  assert.doesNotMatch(sourceSeed.body, /Holy and Honorable Day/);

  assert.equal((await request(port, '/preview-data.json')).status, 200);
  assert.equal((await request(port, '/app.js', { method: 'POST' })).status, 405);
  assert.equal((await request(port, '/missing.js')).status, 404);
  assert.equal((await request(port, '/%2e%2e/app.js')).status, 400);
  assert.equal((await request(port, '/app.js', { headers: { Origin: 'http://example.test' } })).status, 403);
  assert.equal((await request(port, '/app.js', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});

test('bootstrap maps current data to runtime contracts and keeps storage memory-only', () => {
  const bootstrap = require('../scripts/runtime-preview-bootstrap.js');
  const runtime = bootstrap.toRuntimeData(fixtureData());
  assert.deepEqual(runtime.services[0], {
    id: 'fictional-service', date: '2026-09-12', service: 'Morning', worship: 'Sabbath Day', time: '09:00',
    assignments: { Presider: 'Fictional Member' }
  });
  assert.equal(runtime.setlists['fictional-service'].service, 'Morning');
  assert.equal(runtime.setlists['fictional-service'].worship, 'Sabbath Day');
  assert.equal(runtime.services.length, 1);
  assert.equal(runtime.services.some((service) => service.id === 'standalone-setlist'), false);
  assert.equal(runtime.setlists['standalone-setlist'].service, 'Evening');
  const request = bootstrap.runtimeRequest({ id: 'request-1', name: 'Fictional Member', serviceId: 'fictional-service', duty: 'Presider', status: 'pending' });
  assert.equal(request.svcId, 'fictional-service');
  assert.equal(request.serviceId, undefined);
  assert.equal(runtime.features.siteLock, false);
  assert.equal(runtime.features.editorLock, false);
  assert.equal(runtime.features.notifications, false);
  assert.equal(runtime.features.sheetSync, false);

  const storage = bootstrap.createMemoryStorage();
  storage.setItem('wds-data-v2', 'fictional');
  assert.equal(storage.getItem('wds-data-v2'), 'fictional');
  assert.equal(storage._values instanceof Map, true);
});

test('actual current runtime boots from fictional loopback data and blocks mutation actions', { timeout: 30000 }, async (t) => {
  let playwright;
  try { playwright = require('/Users/anthony/Projects/worship-duty-app/node_modules/playwright'); }
  catch (error) { t.skip('Playwright is unavailable'); return; }
  const server = preview.createRuntimePreviewServer({ sourceRoot, loadData: async () => fixtureData() });
  const port = await listen(server);
  const browser = await playwright.chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(String(error && error.message)));
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
  await page.locator('#header-me-select').waitFor();
  assert.equal(await page.locator('#header-me-select option').count(), 3);
  assert.match(await page.locator('#view').innerText(), /Sabbath Day/);
  assert.equal(await page.evaluate(() => window.FIREBASE_CONFIG), null);
  assert.equal(await page.evaluate(() => window.__WORSHIP_PREVIEW__.memoryOnly), true);
  assert.deepEqual(await page.evaluate(() => window.__WORSHIP_PREVIEW__.externalWrites), []);
  assert.match(await page.locator('#runtime-preview-label').innerText(), /Read-only preview/);

  await page.locator('#header-me-select').selectOption({ label: 'Fictional Member' });
  await page.locator('[data-act="settings-open"]').first().click();
  await page.locator('#settings-theme-select').selectOption('sage');
  await page.locator('.settings-close[data-act="settings-close"]').click();
  await page.locator('#tab-presider').click();
  const presiderPage = page.locator('[aria-labelledby="presider-page-title"]');
  await presiderPage.waitFor();
  assert.match(await presiderPage.innerText(), /Sabbath Day/i);
  const openWorkspace = page.locator('[data-song-act="open-workspace"]').first();
  await openWorkspace.click();
  const workspace = page.locator('[data-testid="song-workspace"]');
  await workspace.waitFor();
  assert.match(await workspace.innerText(), /Fictional Song/);
  const blockedSongAction = page.locator('[data-song-act="confirm-songs"]').first();
  await blockedSongAction.click();
  assert.match(await page.locator('#banners').innerText(), /Read-only preview: changes are disabled/);
  await page.locator('[data-song-act="presider-tab"][data-tab="services"]').click();
  await presiderPage.waitFor();
  const outline = page.locator('[data-song-act="view-service"]').first();
  if (await outline.count()) {
    await outline.click();
    assert.equal(await page.locator('[data-testid="presider-month-list"]').count(), 1);
  }
  await page.locator('[data-song-act="open-workspace"]').first().click();
  await page.locator('#presider-panel-select').waitFor();
  const service = await page.locator('#presider-service').inputValue();
  for (const tab of ['order', 'library', 'insights', 'services']) {
    await page.locator('[data-song-act="presider-tab"][data-tab="' + tab + '"]').click();
    await page.locator('#presider-panel-' + tab).waitFor();
    assert.equal(await page.locator('#presider-service').inputValue(), service);
  }
  await page.locator('#tab-manage').click();
  await page.locator('[data-act="manage-panel"][data-panel="services"]').click();
  const mutation = page.locator('[data-act="add-service"]').first();
  if (await mutation.count()) {
    await mutation.click();
    assert.match(await page.locator('#banners').innerText(), /Read-only preview: changes are disabled/);
  }
  assert.deepEqual(await page.evaluate(() => window.__WORSHIP_PREVIEW__.externalWrites), []);
  assert.deepEqual(browserErrors, []);
});

test('actual current runtime remounts Presider after cycling all primary tabs twice', { timeout: 30000 }, async (t) => {
  let playwright;
  try { playwright = require('/Users/anthony/Projects/worship-duty-app/node_modules/playwright'); }
  catch (error) { t.skip('Playwright is unavailable'); return; }
  const server = preview.createRuntimePreviewServer({ sourceRoot, loadData: async () => fixtureData() });
  const port = await listen(server);
  const browser = await playwright.chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message)));
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
  await page.locator('#header-me-select').selectOption({ label: 'Fictional Member' });
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.locator('#tab-my').click();
    await page.locator('[data-screen="member"]').first().waitFor();
    await page.locator('#tab-presider').click();
    await page.locator('[data-screen="presider"]').first().waitFor();
    await page.locator('#tab-manage').click();
    await page.locator('[data-screen="manage"]').first().waitFor();
    await page.locator('[data-act="tab"][data-tab="schedule"]').click();
    await page.locator('[data-screen="member"]').first().waitFor();
  }
  await page.locator('#tab-presider').click();
  await page.locator('[data-screen="presider"]').first().waitFor();
  assert.deepEqual(errors, []);
});

test('runtime tab clicks remain safe when the first cycle is rapid', { timeout: 30000 }, async (t) => {
  let playwright;
  try { playwright = require('/Users/anthony/Projects/worship-duty-app/node_modules/playwright'); }
  catch (error) { t.skip('Playwright is unavailable'); return; }
  const server = preview.createRuntimePreviewServer({ sourceRoot, loadData: async () => fixtureData() });
  const port = await listen(server);
  const browser = await playwright.chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message)));
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
  await page.locator('#header-me-select').selectOption({ label: 'Fictional Member' });
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.locator('#tab-my').click();
    await page.locator('#tab-presider').click();
    await page.locator('#tab-manage').click();
    await page.locator('[data-act="tab"][data-tab="schedule"]').click();
  }
  await page.locator('#tab-presider').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-screen="presider"]').count() > 0, true);
  assert.deepEqual(errors, []);
});
