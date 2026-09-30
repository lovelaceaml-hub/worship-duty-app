/* The app's main flows, end to end in a browser, on the fake data (no
   Firebase). Run: node --test tests/browser/flows.test.mjs */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo, startServer, launch, openPage, unlock, signIn, tab, section, DESKTOP } from './harness.mjs';

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

async function openAccount(page, view) {
  await page.locator('[data-slot="member"]').click();
  await page.locator(`[data-slot="menu"] [data-view="${view}"]`).click();
  await page.waitForTimeout(300);
}

const requestCard = (page, name) => page.locator('.request', { has: page.locator('.card-subtitle', { hasText: name }) });
const banner = (page, text) => page.locator('#banners .banner', { hasText: text }).waitFor();
const fakeDoc = (page, docPath) => page.evaluate(docPath => window.__fake.get(docPath), docPath);
const fakeDocs = (page, prefix) => page.evaluate(prefix => window.__fake.paths(prefix).map(docPath => window.__fake.get(docPath)), prefix);
const calls = (page, name) => page.evaluate(name => window.__fakeCalls.filter(call => call.name === name).map(call => call.payload), name);

/* The member's first upcoming duty in the fake schedule. */
function firstDuty(page, name) {
  return page.evaluate(name => {
    const ids = window.__fake.paths('schedule/').sort();
    for (const docPath of ids) {
      const service = window.__fake.get(docPath);
      const duty = Object.keys(service.assignments).find(key => service.assignments[key] === name);
      if (service.date > '2026-07-07' && duty) return { id: docPath.split('/')[1], date: service.date, duty };
    }
    return null;
  }, name);
}

test('the passcode and the PIN keep the app closed; a reset PIN is changed first', async () => {
  const { context, page, errors } = await openPage(browser, server.url);
  await page.locator('#site-passcode').fill('1111');
  await page.locator('form[data-act="site-unlock"] button').click();
  await page.locator('.gate .form-error').waitFor();
  await unlock(page);
  await page.locator('#sign-in-member').selectOption('B. Silas');
  await page.locator('#sign-in-pin').fill('9999');
  await page.locator('form[data-act="sign-in"] button').click();
  await page.locator('.form-error', { hasText: 'That name and PIN do not match.' }).waitFor();
  assert.equal(await page.locator('nav.tabs').isHidden(), true);

  await signIn(page, 'B. Silas');
  await page.locator('#new-pin').fill('5678');
  await page.locator('#new-pin-again').fill('5679');
  await page.locator('form[data-act="change-pin"] button').click();
  await page.locator('.form-error', { hasText: 'The two PINs do not match.' }).waitFor();
  await page.locator('#new-pin').fill('5678');
  await page.locator('#new-pin-again').fill('5678');
  await page.locator('form[data-act="change-pin"] button').click();
  await page.locator('nav.tabs').waitFor();
  assert.equal((await calls(page, 'changeMemberPin')).length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the Schedule opens on the next service and moves on at its start minute', async () => {
  // Tuesday 2026-07-07 has an 8:00 PM service; the next one is Saturday morning.
  for (const [time, expected] of [['19:59', '2026-07-07_evening'], ['20:00', '2026-07-11_morning'], ['20:01', '2026-07-11_morning']]) {
    const { context, page, errors } = await as('B. Adam', { now: '2026-07-07T' + time + ':00-07:00' });
    assert.equal(await page.locator('.next-service .service-card').getAttribute('data-service'), expected, 'at ' + time);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('a member asks for a change; their leader declines it and the member stays on', async () => {
  const { context, page, errors } = await as('S. Naomi');
  await tab(page, 'my');
  await page.locator('[data-act="request-open"]').first().click();
  await page.locator('#request-note').fill('Out of town.');
  await page.locator('form[data-act="request-send"] button[type="submit"]').click();
  await banner(page, 'Your request was sent to your leader.');
  await page.locator('.tag', { hasText: 'Change asked' }).first().waitFor();
  const request = (await fakeDocs(page, 'requests/')).find(item => item.name === 'S. Naomi');
  assert.deepEqual([request.department, request.note, request.status], ['Usher Sisters', 'Out of town.', 'pending']);

  await signOut(page);
  await signIn(page, 'S. Grace');
  await tab(page, 'manage');
  await section(page, 'manage-section', 'requests');
  const card = requestCard(page, 'S. Naomi');
  await card.waitFor();
  page.once('dialog', dialog => dialog.accept());
  await card.locator('[data-act="request-decline"]').click();
  await banner(page, 'Request declined.');
  assert.equal((await fakeDoc(page, 'requests/' + request.id)).status, 'declined');
  assert.equal((await fakeDoc(page, 'schedule/' + request.svcId)).assignments[request.duty], 'S. Naomi');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader approves a request and gives the duty to someone else in one step', async () => {
  const { context, page, errors } = await as('S. Grace');
  await tab(page, 'manage');
  await section(page, 'manage-section', 'requests');
  const card = requestCard(page, 'S. Leah');
  const choice = card.locator('select[name="uid"] option:nth-child(2)');
  await choice.waitFor({ state: 'attached' });
  const uid = await choice.getAttribute('value');
  await card.locator('select[name="uid"]').selectOption(uid);
  await card.locator('button[type="submit"]').click();
  await banner(page, 'Approved. The duty has a new person.');

  const request = (await fakeDocs(page, 'requests/')).find(item => item.name === 'S. Leah');
  assert.equal(request.status, 'approved');
  assert.equal((await fakeDoc(page, 'schedule/' + request.svcId)).assignments[request.duty], uid.replace('member:', ''));
  const [payload] = await calls(page, 'resolveDutyAttention');
  const allowed = ['departmentId', 'serviceId', 'duty', 'requestId', 'decision', 'replacementMemberUid', 'acknowledgeConflict', 'expectedRevision', 'expectedMemberName'];
  assert.deepEqual(Object.keys(payload).filter(key => !allowed.includes(key)), []);
  assert.deepEqual([payload.decision, payload.replacementMemberUid, payload.departmentId], ['approved', uid, 'Usher Sisters']);
  await card.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('an administrator fills a duty, and overrides with a reason for someone who cannot take it', async () => {
  const fixture = { patch: { 'departments/Usher Brothers/members/member:B. Levi': { schedulable: false } } };
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  const card = page.locator('#view article.service-card').first();
  await card.locator('button.service-head').click();
  const id = await card.getAttribute('data-service');
  const service = await fakeDoc(page, 'schedule/' + id);

  const usherBack = card.locator('select[data-change="assign"][data-duty="Usher Back"]');
  await usherBack.locator('option:nth-child(2)').waitFor({ state: 'attached' });
  const free = await usherBack.evaluate((select, taken) => [...select.options].map(option => option.value)
    .find(value => value && !taken.includes(value.replace('member:', ''))), Object.values(service.assignments));
  await usherBack.selectOption(free);
  await page.waitForFunction(([docPath, name]) => window.__fake.get(docPath).assignments['Usher Back'] === name, ['schedule/' + id, free.replace('member:', '')]);

  const lobbySecurity = card.locator('select[data-change="assign"][data-duty="Lobby Security"]');
  assert.equal(await lobbySecurity.locator('option[value="member:B. Levi"]').count(), 0, 'B. Levi cannot be scheduled, so he is not offered');
  const override = card.locator('form[data-act="assign-override"][data-duty="Lobby Security"]');
  await override.locator('xpath=ancestor::details').locator('summary').click();
  await override.locator('select[name="uid"]').selectOption('member:B. Levi');
  await override.locator('input[name="reason"]').fill('Filling in this week');
  await override.locator('button[type="submit"]').click();
  await banner(page, 'Override recorded');
  const [payload] = await calls(page, 'overrideDepartmentAssignment');
  assert.deepEqual([payload.memberName, payload.override, payload.overrideReason, payload.duty], ['B. Levi', true, 'Filling in this week', 'Lobby Security']);
  assert.equal((await fakeDoc(page, 'schedule/' + id)).assignments['Lobby Security'], 'B. Levi');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader marks a double duty OK; only that person\'s mark is written', async () => {
  // B. Adam is Presider and on Media Booth #1 on Saturday; an older mark for someone else stays as it is.
  const id = '2026-07-11_morning';
  const fixture = { patch: { ['schedule/' + id]: { conflictOk: { 'S. Leah': ['Usher Door', 'Usher Front'] } } } };
  const { context, page, errors } = await as('E. Joseph', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  const card = page.locator(`#view article.service-card[data-service="${id}"]`);
  await card.locator('button.service-head').click();
  await card.locator('[data-act="double-duty"][data-name="B. Adam"][data-ok="true"]').click();
  await card.locator('.card-note', { hasText: 'marked OK' }).waitFor();
  const written = await page.evaluate(docPath => window.__fake.writes.filter(item => item.path === docPath).pop().value, 'schedule/' + id);
  assert.deepEqual(written.conflictOk, { 'S. Leah': ['Usher Door', 'Usher Front'], 'B. Adam': ['Presider', 'Media Booth #1'] });
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member marks a day off; the duty that day is flagged and their leader fills it', async () => {
  const { context, page, errors } = await as('S. Naomi');
  const duty = await firstDuty(page, 'S. Naomi');
  await openAccount(page, 'availability');
  const form = page.locator('form[data-act="availability-add"]');
  await form.locator('input[name="date"]').fill(duty.date);
  await form.locator('button[type="submit"]').click();
  await page.locator('[data-act="availability-save"]:not([disabled])').click();
  await banner(page, 'Saved. 1 duty you can no longer make was flagged for your leader.');
  const [saved] = await calls(page, 'saveMemberAvailability');
  assert.deepEqual(saved.departments.map(item => [item.departmentId, item.availability.exceptions[duty.date]]), [['Usher Sisters', { '*': 'unavailable' }]]);
  assert.ok((await fakeDoc(page, 'schedule/' + duty.id)).needsReplacement[duty.duty]);

  await signOut(page);
  await signIn(page, 'S. Grace');
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  const card = page.locator(`#view article.service-card[data-service="${duty.id}"]`);
  await card.locator('button.service-head').click();
  const replace = card.locator('form[data-act="replace-duty"]');
  await replace.locator('option:nth-child(2)').waitFor({ state: 'attached' });
  const uid = await replace.locator('option:nth-child(2)').getAttribute('value');
  await replace.locator('select').selectOption(uid);
  await replace.locator('button[type="submit"]').click();
  await banner(page, 'Replacement saved.');
  const after = await fakeDoc(page, 'schedule/' + duty.id);
  assert.equal(after.assignments[duty.duty], uid.replace('member:', ''));
  assert.equal(after.needsReplacement[duty.duty], undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader makes and cancels an invite link; a member opens one and joins', async () => {
  const leader = await as('E. Joseph', { viewport: DESKTOP });
  await tab(leader.page, 'manage');
  await section(leader.page, 'manage-section', 'departments');
  await leader.page.locator('select[data-change="manage-department"]').selectOption('Media');
  await leader.page.locator('[data-act="invite-create"]').click();
  const link = await leader.page.locator('.invite input').inputValue();
  assert.match(link, /\/#join=[A-Za-z0-9_-]{43}$/);
  leader.page.once('dialog', dialog => dialog.accept());
  await leader.page.locator('[data-act="invite-cancel"]').click();
  await banner(leader.page, 'That invite link no longer works.');
  await leader.page.locator('.invite').waitFor({ state: 'detached' });
  assert.deepEqual(leader.errors, []);
  await leader.context.close();

  const token = 'A'.repeat(43);
  const invites = { [token]: { departmentId: 'Media', status: 'active', expiresAt: Date.parse('2026-07-14T00:00:00Z') } };
  const { context, page, errors } = await openPage(browser, server.url, { hash: '#join=' + token, fixture: { invites } });
  await page.locator('#site-passcode').waitFor();
  assert.equal(new URL(page.url()).hash, '', 'the token is taken out of the address bar');
  await unlock(page);
  await page.locator('.gate', { hasText: 'Sign in to join the department from your invite link.' }).waitFor();
  await signIn(page, 'S. Joanna');
  await banner(page, 'You joined Media.');
  assert.deepEqual(await calls(page, 'acceptDepartmentInvitation'), [{ token }]);
  await openAccount(page, 'availability');
  await page.locator('.availability', { hasText: 'Saved for Media.' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member sends feedback and an administrator reads it', async () => {
  const { context, page, errors } = await as('S. Naomi');
  await page.locator('.feedback-button').click();
  await page.locator('.feedback-dialog input[value="suggestion"]').check();
  await page.locator('#feedback-text').fill('The schedule is easy to read.');
  await page.locator('.feedback-dialog button[type="submit"]').click();
  await banner(page, 'Thank you. Your feedback was sent.');
  const sent = (await fakeDocs(page, 'feedback/')).find(item => item.message === 'The schedule is easy to read.');
  assert.deepEqual([sent.name, sent.kind, sent.status], ['S. Naomi', 'suggestion', 'new']);

  await signOut(page);
  await signIn(page, 'B. Adam');
  await tab(page, 'manage');
  await section(page, 'manage-section', 'feedback');
  await page.locator('#view', { hasText: 'The schedule is easy to read.' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('the song planner shows how often songs were sung, adds a song and confirms the list', async () => {
  const { context, page, errors } = await as('B. Adam');
  await tab(page, 'my');
  await page.locator('[data-act="open-songs"]', { hasText: 'Finish your songs' }).click();
  const builder = page.locator('#song-root .builder');
  await builder.waitFor();
  await builder.locator('.total', { hasText: '2 songs' }).waitFor();
  const first = page.locator('#song-root .song', { has: page.locator('[data-act="song-add"][data-id="001"]') });
  await first.locator('.times', { hasText: '3×' }).waitFor();

  await page.locator('#song-root [data-act="song-add"][data-id="002"]').click();
  await builder.locator('.total', { hasText: '3 songs' }).waitFor();
  await builder.locator('[data-act="song-confirm"]').click();
  await builder.locator('.confirm.is-done', { hasText: 'Songs confirmed by B. Adam' }).waitFor();
  const setlist = (await fakeDocs(page, 'setlists/'))[0];
  assert.deepEqual(setlist.songs, ['001', '015', '002']);
  assert.ok(setlist.confirmedAt >= setlist.updatedAt);

  await tab(page, 'my');
  await page.locator('[data-act="open-songs"]', { hasText: 'See your songs' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('each appearance has its own look and Schedule layout, and the choice is remembered', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  for (const [id, layout] of [['prism', '.schedule-calendar'], ['navy', '.schedule-rail'], ['aurora', '.schedule-strip'], ['classic', '.next-service']]) {
    await page.locator('header [data-act="appearance-open"]').click();
    await page.locator(`[data-appearance-choice="${id}"]`).click();
    await page.waitForFunction(id => document.documentElement.dataset.appearance === id, id);
    await page.locator('#view ' + layout).waitFor();
    const sheet = await page.evaluate(() => document.getElementById('theme-css')?.getAttribute('href') || '');
    assert.equal(sheet.includes('styles/themes/' + id + '.css'), id !== 'classic', id);
  }
  await page.locator('header [data-act="appearance-open"]').click();
  await page.locator('[data-appearance-choice="aurora"]').click();
  // The choice is saved once its stylesheet has loaded, in the same step that switches the page.
  await page.waitForFunction(() => document.documentElement.dataset.appearance === 'aurora');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.appearance === 'aurora');
  await page.locator('#view .schedule-strip').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('each appearance\'s own Schedule controls work', async () => {
  for (const appearance of ['prism', 'navy', 'aurora']) {
    const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, appearance });
    const view = page.locator('#view');
    await view.locator('[data-act="schedule-date"][data-date="2026-07-18"]').click();
    await view.locator('[data-act="schedule-date"][data-date="2026-07-18"][aria-pressed="true"]').waitFor();
    await view.locator('[data-act="schedule-service"][data-service="2026-07-18_evening"]').click();
    await view.locator('[data-act="schedule-service"][data-service="2026-07-18_evening"][aria-pressed="true"]').waitFor();
    await view.locator('[data-act="schedule-month"][data-step="1"]').click();
    await page.locator('#view', { hasText: 'August 2026' }).waitFor();
    await view.locator('[data-act="schedule-month"][data-step="-1"]').click();
    await page.locator('#view', { hasText: 'July 2026' }).waitFor();
    await view.locator('[data-act="schedule-mode"][data-mode="all"]').click();
    await view.locator('[data-act="schedule-mode"][data-mode="all"][aria-pressed="true"]').waitFor();
    const search = view.locator('[data-input="schedule-search"]');
    if (await search.count()) {
      await search.fill('Silas');
      await page.locator('#view', { hasText: 'B. Silas' }).waitFor();
    }
    assert.deepEqual(errors, [], appearance);
    await context.close();
  }
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  await page.locator('#view [data-act="department-filter"][data-department="Media"]').click();
  await page.locator('#view [data-act="toggle-past"]').click();
  await page.locator('#view', { hasText: 'Hide past services' }).waitFor();
  assert.deepEqual(errors, [], 'classic');
  await context.close();
});

test('every screen opens without errors for each kind of member', async () => {
  for (const member of ['B. Adam', 'E. Joseph', 'S. Grace', 'M. Ruth', 'S. Naomi', 'S. Joanna']) {
    const { context, page, errors } = await as(member, { viewport: DESKTOP });
    const tabs = await page.locator('nav.tabs [data-tab]:visible').evaluateAll(buttons => buttons.map(button => button.dataset.tab));
    for (const name of tabs) {
      await tab(page, name);
      const sections = await page.locator('#view [data-act="manage-section"], #song-root [data-act="song-section"]').evaluateAll(buttons => buttons.map(button => [button.dataset.act, button.dataset.section]));
      for (const [action, value] of sections) await section(page, action, value);
    }
    for (const view of ['availability', 'settings']) await openAccount(page, view);
    assert.deepEqual(errors, [], member);
    assert.ok(tabs.includes('schedule') && tabs.includes('my'), member + ' sees Schedule and My Duties');
    assert.equal(tabs.includes('manage'), ['B. Adam', 'E. Joseph', 'S. Grace'].includes(member), member + ' and Manage');
    await context.close();
  }
});

test('offline, the app shows the schedule this device saw last', async () => {
  const { context, page } = await as('S. Naomi');
  await tab(page, 'my');
  const duties = await page.locator('#view .duty-title').allInnerTexts();
  await context.route('**/tests/fake/firebase-app.js', route => route.abort());
  await page.reload();
  await page.locator('[data-slot="sync"]', { hasText: 'Offline' }).waitFor();
  await page.locator('#view .next-service .service-card').waitFor();
  await tab(page, 'my');
  assert.deepEqual(await page.locator('#view .duty-title').allInnerTexts(), duties);
  await context.close();
});

test('a build works with its stamped files; the maintenance build shows only the schedule', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'wds-build-'));
  try {
    for (const maintenance of [false, true]) {
      const folder = path.join(out, maintenance ? 'maintenance' : 'normal');
      const built = spawnSync(process.execPath, ['scripts/build.mjs', '--out', folder], {
        cwd: repo, encoding: 'utf8', env: Object.assign({}, process.env, { RELEASE_STAMP: 'test1', WDS_MAINTENANCE: maintenance ? '1' : '0' })
      });
      assert.equal(built.status, 0, built.stderr);
      const copy = await startServer(folder);
      const { context, page, errors } = await openPage(browser, copy.url);
      try {
        const unstamped = [];
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.origin === copy.url && /\.(js|css)$/.test(url.pathname) && !url.pathname.startsWith('/tests/fake/') && url.search !== '?v=test1') unstamped.push(url.pathname);
        });
        await page.reload();
        if (maintenance) {
          await page.locator('.maintenance', { hasText: 'The app is being updated' }).waitFor();
          await page.locator('.maintenance-service').first().waitFor();
          assert.equal(await page.locator('#site-passcode').count(), 0);
          assert.equal(await page.locator('nav.tabs').isHidden(), true);
        } else {
          await unlock(page);
          await signIn(page, 'B. Adam');
          await tab(page, 'songs');
          await page.locator('#song-root .planner-sections').waitFor({ state: 'attached' });
          await page.locator('header [data-act="appearance-open"]').click();
          await page.locator('[data-appearance-choice="prism"]').click();
          await tab(page, 'schedule');
          await page.locator('#view .schedule-calendar').waitFor();
        }
        assert.deepEqual(unstamped, []);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
        copy.stop();
      }
    }
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});
