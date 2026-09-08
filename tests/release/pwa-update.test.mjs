import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const { readFile } = fs;
const ACTUAL_SW_PATH = process.env.WORSHIP_SW_PATH || fileURLToPath(new URL('../../sw.js', import.meta.url));
const RELEASE_ASSIGNMENT_RE = /(\bconst\s+RELEASE\s*=\s*["'])[^"']+(["'])/g;
const RELEASES = Object.freeze({ A: 'A', B: 'B' });
const SERVICE_WORKER_CSP = "script-src 'self'; connect-src 'self'";

function transformReleaseStamp(source, release) {
  RELEASE_ASSIGNMENT_RE.lastIndex = 0;
  const matches = source.match(RELEASE_ASSIGNMENT_RE) || [];
  assert.equal(matches.length, 1, 'actual sw.js must contain one RELEASE assignment');
  RELEASE_ASSIGNMENT_RE.lastIndex = 0;
  const transformed = source.replace(RELEASE_ASSIGNMENT_RE, `$1${release}$2`);
  RELEASE_ASSIGNMENT_RE.lastIndex = 0;
  return transformed;
}

function shellMarkup(release) {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>Fictional shell</title></head>',
    `<body><main id="shell">Fictional offline shell ${release}</main></body></html>`
  ].join('');
}

function assetMarkup(release) {
  return `window.FICTIONAL_ASSET_RELEASE = '${release}';`;
}

async function startLoopbackServer(serviceWorkerSource) {
  let release = RELEASES.A;
  const requests = [];
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host}`);
    requests.push({ release, pathname: requestUrl.pathname, search: requestUrl.search });
    response.setHeader('Cache-Control', 'no-store');
    if (requestUrl.pathname === '/sw.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.setHeader('Content-Security-Policy', SERVICE_WORKER_CSP);
      response.end(transformReleaseStamp(serviceWorkerSource, release));
      return;
    }
    if (requestUrl.pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(shellMarkup(release));
      return;
    }
    if (requestUrl.pathname === '/app.js') {
      const assetRelease = requestUrl.searchParams.get('v');
      if (!Object.values(RELEASES).includes(assetRelease)) {
        response.statusCode = 404;
        response.end('missing fictional asset');
        return;
      }
      response.setHeader('Content-Type', 'application/javascript');
      response.end(assetMarkup(assetRelease));
      return;
    }
    response.statusCode = 404;
    response.end('missing fictional route');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object' && address.port, 'loopback server must expose a port');
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    requests,
    serviceWorkerPolicy: SERVICE_WORKER_CSP,
    setRelease(nextRelease) {
      assert.ok(Object.values(RELEASES).includes(nextRelease));
      release = nextRelease;
    },
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}

async function registerAndControl(page, origin) {
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    if (!registration.active || !navigator.serviceWorker.controller) {
      throw new Error(`loopback page did not become controlled by the actual service worker: active=${registration.active?.state || 'none'}, controller=${!!navigator.serviceWorker.controller}`);
    }
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', { timeout: 15000 });
}

async function readVersionedAsset(page, release) {
  return page.evaluate(async assetRelease => {
    const response = await fetch(`/app.js?v=${assetRelease}`);
    return { status: response.status, body: await response.text() };
  }, release);
}

async function waitForVersionedAssetCache(page, release) {
  await page.waitForFunction(async assetRelease => {
    const cache = await caches.open(`wds-${assetRelease}`);
    const response = await cache.match(`/app.js?v=${assetRelease}`);
    return !!response;
  }, release, { timeout: 15000 });
}

async function waitForShellCache(page, release) {
  await page.waitForFunction(async shellRelease => {
    const cache = await caches.open(`wds-${shellRelease}`);
    return !!(await cache.match('/'));
  }, release, { timeout: 15000 });
}

async function updateToRelease(page, release) {
  await page.evaluate(async expectedRelease => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error('service worker registration missing during update');
    const previousController = navigator.serviceWorker.controller;
    const controllerChanged = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`service worker did not activate release ${expectedRelease}`)), 15000);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    await registration.update();
    if (previousController && navigator.serviceWorker.controller === previousController) await controllerChanged;
  }, release);
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', { timeout: 15000 });
  const asset = await readVersionedAsset(page, release);
  assert.equal(asset.status, 200);
  assert.match(asset.body, new RegExp(`FICTIONAL_ASSET_RELEASE = '${release}'`));
  await page.waitForFunction(async assetRelease => {
    const cache = await caches.open(`wds-${assetRelease}`);
    return !!(await cache.match(`/app.js?v=${assetRelease}`));
  }, release, { timeout: 15000 });
}

async function cacheKeys(page) {
  return page.evaluate(() => caches.keys());
}

async function cacheContains(page, requestUrl) {
  return page.evaluate(async url => !!(await caches.match(url)), requestUrl);
}

test('runs actual service worker through release A, B, rollback A, offline recovery, and foreign-origin denial', { timeout: 90000 }, async () => {
  const serviceWorkerSource = await readFile(ACTUAL_SW_PATH, 'utf8');
  const releaseA = transformReleaseStamp(serviceWorkerSource, RELEASES.A);
  const releaseB = transformReleaseStamp(serviceWorkerSource, RELEASES.B);
  assert.notEqual(releaseA, releaseB, 'release transforms must produce distinct service worker scripts');
  assert.equal(
    releaseA.replace("const RELEASE = 'A'", "const RELEASE = 'DEV'"),
    serviceWorkerSource,
    'the isolated fixture may transform only the actual RELEASE assignment'
  );

  const server = await startLoopbackServer(serviceWorkerSource);
  assert.equal(server.serviceWorkerPolicy, SERVICE_WORKER_CSP);
  let browser;
  let context;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ serviceWorkers: 'allow' });
    const externalRequests = [];
    await context.route('**/*', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== server.origin) {
        externalRequests.push(requestUrl.href);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();

    await registerAndControl(page, server.origin);

    const firstAsset = await readVersionedAsset(page, RELEASES.A);
    assert.equal(firstAsset.status, 200);
    assert.match(firstAsset.body, /FICTIONAL_ASSET_RELEASE = 'A'/);
    await waitForVersionedAssetCache(page, RELEASES.A);

    const warmShell = await page.evaluate(async () => {
      const response = await fetch('/');
      return { status: response.status, body: await response.text() };
    });
    assert.equal(warmShell.status, 200);
    assert.match(warmShell.body, /Fictional offline shell A/);
    await waitForShellCache(page, RELEASES.A);

    server.setRelease(RELEASES.B);
    await updateToRelease(page, RELEASES.B);
    const secondAsset = await readVersionedAsset(page, RELEASES.B);
    assert.equal(secondAsset.status, 200);
    assert.match(secondAsset.body, /FICTIONAL_ASSET_RELEASE = 'B'/);
    assert.notEqual(firstAsset.body, secondAsset.body, 'release A and B assets must remain distinct');
    await waitForVersionedAssetCache(page, RELEASES.B);

    const afterBKeys = await cacheKeys(page);
    assert.ok(afterBKeys.includes('wds-B'), `release B cache missing: ${afterBKeys.join(', ')}`);
    assert.ok(!afterBKeys.includes('wds-A'), 'the current activate contract must remove the previous release cache');

    server.setRelease(RELEASES.A);
    await updateToRelease(page, RELEASES.A);
    const rollbackAsset = await readVersionedAsset(page, RELEASES.A);
    assert.equal(rollbackAsset.status, 200);
    assert.match(rollbackAsset.body, /FICTIONAL_ASSET_RELEASE = 'A'/);
    const afterRollbackKeys = await cacheKeys(page);
    assert.ok(afterRollbackKeys.includes('wds-A'), `rollback cache missing: ${afterRollbackKeys.join(', ')}`);
    assert.ok(!afterRollbackKeys.includes('wds-B'), 'rollback must remove release B cache');

    const rollbackWarmShell = await page.evaluate(async () => {
      const response = await fetch('/');
      return { status: response.status, body: await response.text() };
    });
    assert.equal(rollbackWarmShell.status, 200);
    assert.match(rollbackWarmShell.body, /Fictional offline shell A/);
    await waitForShellCache(page, RELEASES.A);

    await context.setOffline(true);
    const offlineShell = await page.evaluate(async () => {
      const response = await fetch('/', { cache: 'no-store' });
      return { status: response.status, body: await response.text() };
    });
    assert.equal(offlineShell.status, 200);
    assert.match(offlineShell.body, /Fictional offline shell A/);
    await context.setOffline(false);

    const foreignUrl = 'http://127.0.0.1:9/foreign.js?v=A';
    const foreignResult = await page.evaluate(async url => {
      try {
        await fetch(url);
        return 'unexpected success';
      } catch (error) {
        return error.name;
      }
    }, foreignUrl);
    assert.equal(foreignResult, 'TypeError');
    assert.ok(externalRequests.some(requestUrl => requestUrl === foreignUrl), 'foreign-origin request was not observed by the deny route');
    assert.equal(await cacheContains(page, foreignUrl), false, 'foreign-origin response must not enter the service worker caches');
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await server.close();
  }
});
