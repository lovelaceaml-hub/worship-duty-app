/* Optional Messaging must not delay normal startup. All push delivery and
   permissions below are simulated, without reaching Firebase or the OS. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, unlock, signIn } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

function fakePush() {
  window.FCM_VAPID_KEY = 'test-vapid';
  window.__pushCalls = [];
  window.Notification = class {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor() { window.__pushCalls.push('notification'); }
  };
  Object.defineProperty(navigator.serviceWorker, 'ready', {
    configurable: true,
    value: Promise.resolve({ showNotification() { window.__pushCalls.push('notification'); } })
  });
}

const MESSAGING = `
  export async function isSupported() {
    window.__pushCalls.push('supported');
    if (window.__waitForPush) await window.__waitForPush;
    if (window.__pushFailure) throw new Error('Messaging temporarily unavailable');
    return window.__pushSupported !== false;
  }
  export function getMessaging() {
    window.__pushCalls.push('initialize');
    return {};
  }
  export async function getToken() {
    window.__pushCalls.push('getToken');
    return 'test-push-token';
  }
  export async function deleteToken() { window.__pushCalls.push('deleteToken'); }
`;

async function open() {
  const opened = await openPage(browser, server.url);
  await opened.context.addInitScript(fakePush);
  await opened.page.evaluate(fakePush);
  let requests = 0;
  await opened.page.route('**/firebase-messaging.js', route => {
    requests++;
    return route.fulfill({ contentType: 'text/javascript', body: MESSAGING });
  });
  return { ...opened, requests: () => requests };
}

const turnOn = page => page.evaluate(() => import('/app/services/notifications.js').then(module => module.turnOn()));
const pushCalls = page => page.evaluate(() => window.__pushCalls);

test('ordinary startup and sign-in never request the optional Messaging SDK', async () => {
  const { context, page, errors } = await open();
  let requests = 0;
  page.on('request', request => { if (request.url().includes('firebase-messaging.js')) requests++; });
  await page.reload();
  await unlock(page);
  await signIn(page, 'S. Naomi');
  await page.locator('.schedule-calendar').waitFor();
  assert.equal(requests, 0);
  assert.deepEqual(await pushCalls(page), []);
  assert.deepEqual(errors, []);
  await context.close();
});

test('enabling push loads Messaging once and reopening refreshes the saved token', async () => {
  const { context, page, errors, requests } = await open();
  await unlock(page);
  await signIn(page, 'S. Naomi');
  await turnOn(page);
  assert.equal(requests(), 1);
  assert.deepEqual(await pushCalls(page), ['notification', 'supported', 'initialize', 'getToken']);
  assert.equal(await page.evaluate(() => window.__fake.get('tokens/test-push-token').name), 'S. Naomi');
  await page.evaluate(() => {
    window.__fake.set('tokens/test-push-token', { name: 'S. Naomi', lastSeenAt: 1 });
    localStorage.removeItem('wds-reminded');
  });
  await page.reload();
  await page.waitForFunction(() => window.__fake.get('tokens/test-push-token')?.lastSeenAt > 1);
  assert.deepEqual(await pushCalls(page), ['supported', 'initialize', 'getToken']);
  assert.equal(await page.evaluate(() => localStorage.getItem('wds-fcm-token')), 'test-push-token');
  assert.deepEqual(errors, []);
  await context.close();
});

test('concurrent callers initialize once and failed initialization can be retried', async () => {
  const { context, page, errors, requests } = await open();
  const result = await page.evaluate(async () => {
    const { ensureMessaging } = await import('/app/firebase.js');
    window.__pushFailure = true;
    const first = await Promise.allSettled([ensureMessaging(), ensureMessaging()]);
    window.__pushFailure = false;
    const retry = await Promise.all([ensureMessaging(), ensureMessaging()]);
    return { first: first.map(item => item.status), retry };
  });
  assert.deepEqual(result, { first: ['rejected', 'rejected'], retry: [true, true] });
  assert.equal(requests(), 1);
  assert.deepEqual(await pushCalls(page), ['supported', 'supported', 'initialize']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('unsupported browsers keep local alerts and do not register a push token', async () => {
  const { context, page, errors } = await open();
  await unlock(page);
  await signIn(page, 'S. Naomi');
  await page.evaluate(() => { window.__pushSupported = false; });
  await turnOn(page);
  await page.locator('#banners', { hasText: 'Alerts show while the app is open' }).waitFor();
  assert.deepEqual(await pushCalls(page), ['notification', 'supported']);
  assert.equal(await page.evaluate(() => localStorage.getItem('wds-fcm-token')), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a Messaging failure is reported and enabling push again retries it', async () => {
  const { context, page, errors } = await open();
  await unlock(page);
  await signIn(page, 'S. Naomi');
  await page.evaluate(() => { window.__pushFailure = true; });
  await turnOn(page);
  await page.locator('#banners', { hasText: 'Alerts show while the app is open' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('wds-fcm-token')), null);
  await page.evaluate(() => { window.__pushFailure = false; });
  await turnOn(page);
  assert.equal(await page.evaluate(() => window.__fake.get('tokens/test-push-token').name), 'S. Naomi');
  const calls = await pushCalls(page);
  assert.equal(calls.filter(call => call === 'notification').length, 2);
  assert.deepEqual(calls.filter(call => call !== 'notification'), ['supported', 'supported', 'initialize', 'getToken']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('signing out before optional initialization finishes does not register a token', async () => {
  const { context, page, errors } = await open();
  await unlock(page);
  await signIn(page, 'S. Naomi');
  await page.evaluate(() => {
    localStorage.setItem('wds-fcm-token', 'test-push-token');
    window.__fake.set('tokens/test-push-token', { name: 'S. Naomi' });
    window.__waitForPush = new Promise(resolve => { window.__finishPush = resolve; });
    window.__turningOn = import('/app/services/notifications.js').then(module => module.turnOn());
  });
  await page.waitForFunction(() => window.__pushCalls.includes('supported'));
  await page.evaluate(async () => {
    const { signOut } = await import('/app/services/session.js');
    window.__signingOut = signOut();
  });
  await page.evaluate(async () => {
    window.__finishPush();
    await Promise.all([window.__turningOn, window.__signingOut]);
  });
  assert.equal(await page.evaluate(() => window.__fake.get('tokens/test-push-token')), undefined);
  assert.equal(await page.evaluate(() => localStorage.getItem('wds-fcm-token')), null);
  assert.ok(!(await pushCalls(page)).includes('getToken'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('saved token cleanup loads Messaging even before push registration', async () => {
  const { context, page, errors, requests } = await open();
  await page.evaluate(async () => {
    localStorage.setItem('wds-fcm-token', 'test-push-token');
    window.__fake.set('tokens/test-push-token', { name: 'S. Naomi' });
    const { unregisterPush } = await import('/app/services/notifications.js');
    await unregisterPush();
  });
  assert.equal(requests(), 1);
  assert.deepEqual(await pushCalls(page), ['supported', 'initialize', 'deleteToken']);
  assert.equal(await page.evaluate(() => window.__fake.get('tokens/test-push-token')), undefined);
  assert.equal(await page.evaluate(() => localStorage.getItem('wds-fcm-token')), null);
  assert.deepEqual(errors, []);
  await context.close();
});
