/* The app shell, end to end on the fake data: redraws that keep focus and
   unsaved fields, toasts and banners, signing out on a shared device,
   offline and start-up, the minute the schedule moves on, releases and the
   offline copy, the song planner's Signal copy, and the dev server.
   Run: node --test tests/browser/core.test.mjs */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { repo, startServer, launch, openPage, unlock, signIn, tab, section, PHONE, DESKTOP, TODAY } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function as(member, options = {}) {
  const opened = await openPage(browser, server.url, options);
  await unlock(opened.page);
  await signIn(opened.page, member);
  return opened;
}

async function signOut(page) {
  await page.locator('[data-slot="member"]').click();
  await page.locator('[data-slot="menu"] [data-act="sign-out"]').click();
  await page.locator('#sign-in-member').waitFor();
}

async function fromMenu(page, action, view = '') {
  await page.locator('[data-slot="member"]').click();
  await page.locator(`[data-slot="menu"] [data-act="${action}"]${view ? `[data-view="${view}"]` : ''}`).click();
  await page.waitForTimeout(300);
}

/* A change to the shared schedule arrives, the way another leader's edit
   would; resolves once the screen was drawn again. */
async function liveUpdate(page) {
  await page.evaluate(() => {
    const view = document.getElementById('view');
    Array.from(view.children).forEach(child => { child.__before = true; });
    const docPath = window.__fake.paths('schedule/').sort().pop();
    window.__fake.set(docPath, Object.assign(window.__fake.get(docPath), { choirSong: '#' + Date.now() + ' A New Song' }));
  });
  await page.waitForFunction(() => Array.from(document.getElementById('view').children).every(child => !child.__before));
}

const fakeDoc = (page, docPath) => page.evaluate(docPath => window.__fake.get(docPath), docPath);
const active = page => page.evaluate(() => {
  const el = document.activeElement;
  return el ? { tag: el.tagName, id: el.id, act: el.dataset.act || el.dataset.change || '', key: el.dataset.key || '', service: el.dataset.service || '', duty: el.dataset.duty || '' } : null;
});

/* ---- redraws keep the member's place ---- */

test('a redraw keeps keyboard focus on the control the member used, and through live updates', async () => {
  const { context, page, errors } = await as('B. Adam');
  await tab(page, 'my');
  const toggle = page.locator('.duty-card-toggle').first();
  const key = await toggle.getAttribute('data-key');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.locator('.duty-card.is-open').first().waitFor();
  assert.deepEqual([(await active(page)).act, (await active(page)).key], ['expand', key], 'focus stays on the card toggle');
  await liveUpdate(page);
  assert.deepEqual([(await active(page)).act, (await active(page)).key], ['expand', key], 'and after a live update');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a live update keeps the sign-in name and PIN a member has started to enter', async () => {
  const { context, page, errors } = await openPage(browser, server.url);
  await unlock(page);
  await page.locator('#sign-in-member').selectOption('S. Lydia');
  await page.locator('#sign-in-pin').fill('12');
  await page.evaluate(() => document.activeElement.blur());
  await liveUpdate(page);
  assert.equal(await page.locator('#sign-in-member').inputValue(), 'S. Lydia');
  assert.equal(await page.locator('#sign-in-pin').inputValue(), '12');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a live update keeps a half-filled "Days that are different" row', async () => {
  const { context, page, errors } = await as('S. Leah');
  await fromMenu(page, 'account', 'availability');
  const form = page.locator('form[data-act="availability-add"]');
  await form.locator('input[name="date"]').fill('2026-08-15');
  await form.locator('select[name="key"]').selectOption({ index: 2 });
  const chosen = await form.locator('select[name="key"]').inputValue();
  await page.evaluate(() => document.activeElement.blur());
  await liveUpdate(page);
  assert.equal(await form.locator('input[name="date"]').inputValue(), '2026-08-15');
  assert.equal(await form.locator('select[name="key"]').inputValue(), chosen);
  // Adding the day uses the values; the form is then drawn empty again.
  await form.locator('button[type="submit"]').click();
  await page.locator('.exception', { hasText: 'August 15' }).waitFor();
  assert.equal(await form.locator('input[name="date"]').inputValue(), '');
  assert.deepEqual(errors, []);
  await context.close();
});

test('changing a planner cell with the keyboard keeps focus on that cell', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  const cell = page.locator('#view select[data-change="plan-assign"]:not([disabled])').first();
  const where = { service: await cell.getAttribute('data-service'), duty: await cell.getAttribute('data-duty') };
  await cell.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(where => {
    const el = document.activeElement;
    return el && el.dataset.change === 'plan-assign' && el.dataset.service === where.service && el.dataset.duty === where.duty && !el.disabled;
  }, where);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a tab still opens while the search box has focus', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, appearance: 'prism' });
  await page.locator('#schedule-search').fill('Usher');
  assert.equal((await active(page)).id, 'schedule-search');
  // A tap on iOS leaves focus in the field; a plain click() does the same.
  await page.evaluate(() => document.querySelector('nav.tabs [data-tab="my"]').click());
  await page.locator('#view .duty-card').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.screen), 'my');
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---- toasts and banners ---- */

test('a confirmation is a toast that goes by itself; a problem is a banner with a named 44px close button', async () => {
  const { context, page, errors } = await as('S. Naomi');
  await fromMenu(page, 'feedback-open');
  await page.locator('#feedback-text').fill('The schedule is easy to read.');
  await page.locator('.feedback-dialog button[type="submit"]').click();
  const toast = page.locator('#toasts .toast', { hasText: 'Thank you. Your feedback was sent.' });
  await toast.waitFor();
  assert.equal(await page.locator('#toasts').getAttribute('role'), 'status');
  assert.equal(await page.locator('#banners .banner', { hasText: 'feedback' }).count(), 0, 'a confirmation is not a banner');
  await page.clock.runFor(5000);
  await toast.waitFor({ state: 'detached' });

  await page.evaluate(() => import('/app/ui/banners.js').then(module => module.notice('That was not saved: the server could not be reached.', true)));
  const close = page.locator('#banners .banner.is-alert .banner-close');
  const box = await close.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'close button is ' + box.width + 'x' + box.height);
  assert.match(await close.getAttribute('aria-label'), /^Dismiss: That was not saved/);
  await close.click();
  assert.equal(await page.locator('#banners .banner', { hasText: 'That was not saved' }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a new duty and a duty taken away show as news with "Open My Duties", and in Recent updates', async () => {
  const { context, page, errors } = await as('S. Naomi');
  const ids = await page.evaluate(today => window.__fake.paths('schedule/').sort().filter(docPath => docPath.slice(9, 19) > today), TODAY);
  const free = await page.evaluate(ids => ids.find(id => !Object.values(window.__fake.get(id).assignments).includes('S. Naomi')), ids);
  await page.evaluate(free => window.__fake.set(free, Object.assign(window.__fake.get(free), {
    assignments: Object.assign(window.__fake.get(free).assignments, { 'Usher Back': 'S. Naomi' })
  })), free);
  const news = page.locator('#banners .banner', { hasText: 'You have a new duty.' });
  await news.waitFor();
  assert.equal(await news.evaluate(el => el.classList.contains('is-alert')), false, 'good news is not styled as a problem');
  await news.locator('[data-act="tab"][data-tab="my"]', { hasText: 'Open My Duties' }).click();
  await page.locator('#view .update', { hasText: 'New duty: Usher Back' }).waitFor();
  assert.equal(await page.locator('#banners .banner', { hasText: 'new duty' }).count(), 0);

  await tab(page, 'schedule');
  const held = await page.evaluate(ids => {
    const id = ids.find(docPath => Object.values(window.__fake.get(docPath).assignments).includes('S. Naomi'));
    const service = window.__fake.get(id);
    const duty = Object.keys(service.assignments).find(key => service.assignments[key] === 'S. Naomi');
    service.assignments[duty] = 'S. Esther';
    window.__fake.set(id, service);
    return duty;
  }, ids);
  await page.locator('#banners .banner', { hasText: 'You are no longer on one of your duties.' }).waitFor();
  await tab(page, 'my');
  await page.locator('#view .update', { hasText: 'No longer on: ' + held }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---- signing out on a shared device ---- */

test('signing out leaves nothing of the member: drafts, banners, name, alerts and push token', async () => {
  const { context, page, errors } = await as('S. Leah');
  await page.evaluate(() => {
    localStorage.setItem('wds-fcm-token', 'device-token-1');
    localStorage.setItem('wds-fcm-name', 'S. Leah');
    window.__fake.set('tokens/device-token-1', { name: 'S. Leah', updatedAt: 1 });
  });
  await fromMenu(page, 'account', 'availability');
  const evening = page.locator('select[data-change="availability-week"][data-key="evening"]');
  await evening.selectOption('unavailable');
  await page.locator('[data-act="availability-save"]:not([disabled])').waitFor();
  await page.evaluate(() => import('/app/ui/banners.js').then(module => module.notice('Only for S. Leah.', true)));
  await page.locator('#banners .banner', { hasText: 'Only for S. Leah.' }).waitFor();

  let asked = '';
  page.once('dialog', dialog => { asked = dialog.message(); dialog.accept(); });
  await signOut(page);
  assert.match(asked, /not saved/, 'signing out with unsaved changes asks first');
  assert.equal(await fakeDoc(page, 'tokens/device-token-1'), undefined, 'the push token document is deleted');
  const stored = await page.evaluate(() => ['wds-me', 'wds-fcm-token', 'wds-seen-S. Leah'].map(key => localStorage.getItem(key)));
  assert.deepEqual(stored, [null, null, null]);

  await signIn(page, 'S. Naomi');
  assert.equal(await page.locator('#banners .banner', { hasText: 'Only for S. Leah.' }).count(), 0);
  await fromMenu(page, 'account', 'availability');
  assert.equal(await evening.inputValue(), 'available', 'Naomi sees her own pattern');
  assert.equal(await page.locator('.availability-unsaved').count(), 0, 'and nothing waits to be saved');

  // Offline after the sign-out, the app does not open as anyone.
  await signOut(page);
  await context.route('**/tests/fake/firebase-app.js', route => route.abort());
  await page.reload();
  await page.locator('.gate-title', { hasText: 'You are offline' }).waitFor();
  assert.equal(await page.locator('nav.tabs').isHidden(), true);
  assert.deepEqual(errors.filter(text => !/Failed to load|ERR_FAILED|firebase-app/.test(text)), []);
  await context.close();
});

test('Fill proposals left by one leader are gone for the next one who signs in', async () => {
  const fixture = { patch: { 'schedule/2026-07-18_morning': { assignments: {} } } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  await signOut(page);
  await signIn(page, 'B. Adam');
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  await page.locator('#view .plan-grid, #view .plan-days').first().waitFor();
  assert.equal(await page.locator('#view .plan-cell.is-proposed').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---- offline, start-up and the clock ---- */

test('offline, a member action says so in plain words, and the app says it is offline', async () => {
  const { context, page } = await as('S. Naomi');
  await tab(page, 'my');
  await context.route('**/tests/fake/firebase-app.js', route => route.abort());
  await page.reload();
  await page.locator('#banners .banner', { hasText: 'You are offline. This is the schedule saved on this device.' }).waitFor();
  await tab(page, 'my');
  await page.locator('#view [data-act="request-open"]').first().click();
  const refusal = page.locator('#banners .banner.is-alert', { hasText: 'You are offline. Connect to do that.' });
  await refusal.waitFor();
  assert.equal(await page.locator('#banners', { hasText: 'not allowed' }).count(), 0);
  await context.close();
});

test('start-up shows the saved schedule while the app connects', async () => {
  const { context, page, errors } = await as('S. Naomi');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await context.route('**/tests/fake/firebase-auth.js', async route => { await held; await route.continue(); });
  await page.reload();
  await page.locator('[data-slot="sync"]', { hasText: 'Connecting' }).waitFor();
  await page.locator('#view .next-service .service-card').waitFor();
  assert.equal(await page.locator('nav.tabs').isHidden(), false);
  release();
  await page.locator('[data-slot="sync"]', { hasText: 'Live' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a session the server ended (PIN reset, role change, name fix) signs the member out cleanly', async () => {
  const { context, page, errors } = await as('S. Naomi');
  await fromMenu(page, 'account', 'availability');
  await page.locator('select[data-change="availability-week"][data-key="evening"]').selectOption('unavailable');
  await page.evaluate(() => {
    window.__fakeCalls.push = () => { throw Object.assign(new Error('Your session has ended.'), { code: 'functions/unauthenticated', details: { reason: 'session-ended' } }); };
  });
  await page.locator('[data-act="availability-save"]').click();
  await page.locator('#sign-in-member').waitFor();
  await page.locator('.gate .form-error', { hasText: 'Please sign in again.' }).waitFor();
  assert.equal(await page.locator('nav.tabs').isHidden(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('wds-me')), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member whose PIN is locked after too many tries is told to wait', async () => {
  const { context, page } = await openPage(browser, server.url);
  await unlock(page);
  await page.evaluate(() => import('/app/firebase.js').then(({ fb }) => {
    const real = fb.callable;
    fb.callable = name => name !== 'verifyMemberPin' ? real(name)
      : async () => { throw Object.assign(new Error('Too many attempts. Try again later.'), { code: 'functions/resource-exhausted' }); };
  }));
  await page.locator('#sign-in-member').selectOption('S. Lydia');
  await page.locator('#sign-in-pin').fill('1234');
  await page.locator('form[data-act="sign-in"] button').click();
  await page.locator('.form-error', { hasText: 'Too many tries. Wait 15 minutes, then try again.' }).waitFor();
  await context.close();
});

test('an open Schedule marks the service Now at its start minute, and moves on after it, by itself', async () => {
  const { context, page, errors } = await as('B. Adam', { now: '2026-07-07T19:59:10-07:00' });
  const card = page.locator('.next-service .service-card');
  assert.equal(await card.getAttribute('data-service'), '2026-07-07_evening');
  assert.equal(await card.locator('.service-now').count(), 0);
  await page.clock.runFor(90 * 1000);
  await card.locator('.service-now').waitFor();
  assert.equal(await card.getAttribute('data-service'), '2026-07-07_evening', 'the service under way stays on');
  await page.clock.runFor(20 * 60 * 1000);
  await page.waitForFunction(() => document.querySelector('.next-service .service-card')?.dataset.service === '2026-07-11_morning');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a reminder for a service without a stored time uses its usual time', async () => {
  const fixture = { patch: { 'schedule/2026-07-07_evening': { time: '' } } };
  const { context, page, errors } = await openPage(browser, server.url, { fixture });
  await unlock(page);
  // Whoever has Usher Door at tonight's service.
  await signIn(page, await page.evaluate(() => window.__fake.get('schedule/2026-07-07_evening').assignments['Usher Door']));
  const reminder = page.locator('#banners .banner', { hasText: 'Reminder:' });
  await reminder.waitFor();
  assert.match(await reminder.innerText(), /Tue, Jul 7, 7:30 PM/);
  assert.equal(await reminder.evaluate(el => el.classList.contains('is-alert')), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a deleted service leaves the Schedule at the next update', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  const card = page.locator('.next-service .service-card');
  const id = await card.getAttribute('data-service');
  await page.evaluate(id => window.__fake.remove('schedule/' + id), id);
  await page.waitForFunction(id => document.querySelector('.next-service .service-card')?.dataset.service !== id, id);
  assert.equal(await page.locator(`#view [data-service="${id}"]`).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---- the shell's design ---- */

test('on a phone, feedback and Appearance are in the account menu, and My Duties stays marked in Availability', async () => {
  const { context, page, errors } = await as('S. Naomi');
  assert.equal(await page.locator('.feedback-button').isVisible(), false);
  await page.locator('[data-slot="member"]').click();
  await page.locator('[data-slot="menu"] [data-act="feedback-open"]', { hasText: 'Feedback about the app' }).waitFor();
  await page.locator('[data-slot="menu"] [data-act="appearance-open"]').waitFor();
  await page.locator('[data-slot="menu"] [data-view="availability"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('nav.tabs [data-tab="my"]').evaluate(el => el.classList.contains('is-active')), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('no appearance makes Manage scroll sideways on a computer, and every section button can be reached', async () => {
  for (const appearance of ['classic', 'prism', 'navy', 'aurora']) {
    const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, appearance });
    await tab(page, 'manage');
    await section(page, 'manage-section', 'services');
    await page.locator('#view .plan-grid').waitFor();
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(widths[0] <= widths[1], appearance + ': page ' + widths[0] + 'px wide in a ' + widths[1] + 'px window');
    const feedback = await page.locator('#view [data-act="manage-section"][data-section="feedback"]').boundingBox();
    const row = await page.locator('#view nav.sections').boundingBox();
    assert.ok(feedback.x + feedback.width <= row.x + row.width + 1, appearance + ': the Feedback section button is not cut off');
    assert.deepEqual(errors, [], appearance);
    await context.close();
  }
});

/* ---- the song planner ---- */

test('Copy for Signal names the Presider and gives the Glory and Thanks songs a heading each', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  await tab(page, 'songs');
  const card = page.locator('#song-root .svc-card', { has: page.locator('[data-act="song-copy"]') }).first();
  await card.waitFor();
  const id = await card.locator('[data-act="song-copy"]').getAttribute('data-id');
  const copy = async () => {
    await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.__copied = text; }; });
    await card.locator('[data-act="song-copy"]').click();
    await page.waitForFunction(() => window.__copied);
    return page.evaluate(() => { const text = window.__copied; window.__copied = ''; return text; });
  };
  await page.evaluate(id => window.__fake.set('setlists/' + id, Object.assign(window.__fake.get('setlists/' + id), { glorySong: '003', songs: ['001', '015', '003'] })), id);
  await page.waitForTimeout(200);
  let text = await copy();
  assert.match(text, /^Sabbath Day Morning - \w{3}, \w{3} \d+\nPresider: B\. Adam\nOpening Prayer: /);
  assert.match(text, /\n\nGlory Song\n\n\* 003 [^\n]+$/);
  assert.doesNotMatch(text, /Thanks Song|Glory & Thanks/);
  await page.evaluate(id => window.__fake.set('setlists/' + id, Object.assign(window.__fake.get('setlists/' + id), { thanksSong: '004', songs: ['001', '015', '003', '004'] })), id);
  await page.waitForTimeout(200);
  text = await copy();
  assert.match(text, /\n\nGlory Song\n\n\* 003 [^\n]+\n\n\nThanks Song\n\n\* 004 [^\n]+$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a song editor with no Presider duty starts on every service, and history does not repeat itself', async () => {
  const { context, page, errors } = await as('M. Ruth', { viewport: DESKTOP });
  // M. Ruth edits songs; here she presides nowhere.
  await page.evaluate(() => window.__fake.paths('schedule/').forEach(docPath => {
    const service = window.__fake.get(docPath);
    if (service.assignments.Presider === 'M. Ruth') { service.assignments.Presider = 'B. Caleb'; window.__fake.set(docPath, service); }
  }));
  await tab(page, 'songs');
  await page.locator('#song-root .planner-role', { hasText: 'Song editor' }).waitFor();
  assert.equal(await page.locator('#song-root [data-act="song-scope"][data-scope="all"]').getAttribute('aria-pressed'), 'true');
  await section(page, 'song-section', 'history');
  const longest = page.locator('#song-root .card', { has: page.locator('.card-subtitle', { hasText: 'Not sung for the longest' }) });
  await longest.locator('.hint', { hasText: 'never been sung' }).waitFor();
  await longest.locator('.song-row').first().waitFor();
  const rows = await longest.locator('.song-row .times').allInnerTexts();
  assert.ok(rows.length && rows.every(times => times !== '0×'), 'only songs sung before: ' + rows.join(', '));
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---- releases and the offline copy ---- */

function freePort() {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.listen(0, () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

/* A fake-data server for `root` on a fixed port, so one origin can be
   stopped and started again (offline, then a new release). */
async function serveAt(root, port) {
  const child = spawn(process.execPath, [path.join(repo, 'scripts/serve.mjs'), '--fake', '--port', String(port), '--root', root], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('Serving')) resolve(); });
    child.on('exit', code => reject(new Error('Server stopped: ' + code)));
  });
  return () => new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

async function build(out, stamp) {
  const built = spawnSync(process.execPath, ['scripts/build.mjs', '--out', out], { cwd: repo, encoding: 'utf8', env: Object.assign({}, process.env, { RELEASE_STAMP: stamp }) });
  assert.equal(built.status, 0, built.stderr);
}

async function publish(from, site) {
  await fs.rm(site, { recursive: true, force: true });
  await fs.cp(from, site, { recursive: true });
}

test('a page opened before a release asks for a reload instead of loading the new song planner', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'wds-release-'));
  try {
    await build(path.join(out, 'r1'), 'r1');
    await build(path.join(out, 'r2'), 'r2');
    const site = path.join(out, 'site');
    await publish(path.join(out, 'r1'), site);
    const live = await startServer(site);
    const { context, page } = await openPage(browser, live.url);
    try {
      await unlock(page);
      await signIn(page, 'B. Adam');
      await publish(path.join(out, 'r2'), site);
      const next = [];
      page.on('request', request => { if (request.url().includes('v=r2')) next.push(request.url()); });
      await tab(page, 'songs');
      await page.locator('#song-root', { hasText: 'The app was updated. Reload to open the song planner.' }).waitFor();
      assert.deepEqual(next, [], 'no file of the next release was loaded');
      await Promise.all([page.waitForEvent('load'), page.locator('#song-root [data-act="reload"]').click()]);
      assert.match(await page.evaluate(() => document.querySelector('script[type="module"]').src), /v=r2/);
    } finally {
      await context.close();
      live.stop();
    }
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});

test('the first visit, and the first visit after a release, leave a working offline copy', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'wds-offline-'));
  const port = await freePort();
  const url = 'http://localhost:' + port + '/?today=' + TODAY;
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'allow', reducedMotion: 'reduce' });
  let stop = null;
  const stored = page => page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(names.map(async name => [name, (await (await caches.open(name)).keys()).length]));
  });
  // The release's worker has stored every file, taken over, and removed the last copy.
  const settled = async (page, release) => {
    for (let tries = 0; tries < 150; tries++) {
      const done = await page.evaluate(async release => {
        const names = await caches.keys();
        const worker = navigator.serviceWorker.controller;
        return names.length === 1 && names[0] === 'wds-' + release && !!worker && worker.scriptURL.endsWith('sw.js') &&
          (await navigator.serviceWorker.getRegistration()).active === worker && !(await navigator.serviceWorker.getRegistration()).installing;
      }, release).catch(() => false);
      if (done) return;
      await page.waitForTimeout(200);
    }
    throw new Error('The ' + release + ' offline copy did not settle: ' + JSON.stringify(await stored(page)));
  };
  try {
    await build(path.join(out, 'r1'), 'r1');
    await build(path.join(out, 'r2'), 'r2');
    const site = path.join(out, 'site');
    await publish(path.join(out, 'r1'), site);
    stop = await serveAt(site, port);
    const page = await context.newPage();
    await page.goto(url);
    await page.locator('#site-passcode').waitFor();
    await settled(page, 'r1');
    assert.ok((await stored(page))[0][1] > 40, 'the whole release is stored: ' + JSON.stringify(await stored(page)));

    // Offline on the second open: the stored copy opens.
    await stop(); stop = null;
    await page.reload();
    await page.locator('#site-passcode').waitFor();

    // A release goes live; the device opens the app online once.
    await publish(path.join(out, 'r2'), site);
    stop = await serveAt(site, port);
    await page.reload();
    await settled(page, 'r2');
    await stop(); stop = null;
    await page.reload();
    await page.locator('#site-passcode').waitFor();
    assert.match(await page.evaluate(() => document.querySelector('script[type="module"]').src), /v=r2/);
  } finally {
    await context.close();
    if (stop) await stop();
    await fs.rm(out, { recursive: true, force: true });
  }
});

test('a release that cannot be stored whole leaves the last offline copy in charge', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'wds-partial-'));
  const port = await freePort();
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: 'allow', reducedMotion: 'reduce' });
  let stop = null;
  const caches = page => page.evaluate(async () => (await caches.keys()).sort());
  try {
    await build(path.join(out, 'r1'), 'r1');
    await build(path.join(out, 'r2'), 'r2');
    const site = path.join(out, 'site');
    await publish(path.join(out, 'r1'), site);
    stop = await serveAt(site, port);
    const page = await context.newPage();
    await page.goto('http://localhost:' + port + '/?today=' + TODAY);
    await page.locator('#site-passcode').waitFor();
    for (let tries = 0; ; tries++) {
      const ready = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return (await caches.keys()).join() === 'wds-r1' && !!registration && !!registration.active && !registration.installing &&
          navigator.serviceWorker.controller === registration.active;
      });
      if (ready) break;
      assert.ok(tries < 150, 'the r1 offline copy did not settle');
      await page.waitForTimeout(200);
    }

    // r2 goes live, but one of its files does not load on this phone.
    await stop(); stop = null;
    await publish(path.join(out, 'r2'), site);
    await fs.rm(path.join(site, 'app', 'lib', 'reasons.js'));
    stop = await serveAt(site, port);
    const failed = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      try { await registration.update(); } catch (_error) { /* the install fails */ }
      for (let tries = 0; tries < 100 && registration.installing; tries++) await new Promise(resolve => setTimeout(resolve, 100));
      return !registration.waiting && registration.active.scriptURL.endsWith('sw.js');
    });
    assert.ok(failed, 'the r2 worker did not take over');
    assert.deepEqual(await caches(page), ['wds-r1'], 'the r1 copy stays, and no half copy is kept');

    // Offline, the r1 copy still opens.
    await stop(); stop = null;
    await page.reload();
    await page.locator('#site-passcode').waitFor();
  } finally {
    await context.close();
    if (stop) await stop();
    await fs.rm(out, { recursive: true, force: true });
  }
});

/* ---- the dev server ---- */

test('the dev server serves only the app, inside its folder, and survives a bad address', async () => {
  const get = async address => (await fetch(server.url + address)).status;
  assert.equal(await get('/'), 200);
  assert.equal(await get('/app/main.js'), 200);
  assert.equal(await get('/tests/fake/fixture.js'), 200);
  for (const address of ['/.git/config', '/functions/index.js', '/package.json', '/.claude/settings.json', '/app/../.git/config']) {
    assert.equal(await get(address), 404, address);
  }
  assert.equal(await get('/%E0%A4%A'), 400);
  assert.equal(await get('/..%2f' + path.basename(repo) + '-secret/token.txt'), 403);
  assert.equal(await get('/index.html'), 200, 'still serving after a bad address');
});
