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
/* Manage, Services: open a service's details in the month planner. */
async function openPlanned(page, id) {
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  const want = id.slice(0, 7);
  for (let step = 0; step < 12; step++) {
    const shown = await page.locator('#view .plan-toolbar .month-title').innerText();
    const [name, year] = shown.split(' ');
    const month = year + '-' + String(new Date(name + ' 1, 2000').getMonth() + 1).padStart(2, '0');
    if (month === want) break;
    await page.locator('#view [data-act="plan-month"][data-step="' + (month < want ? 1 : -1) + '"]').click();
  }
  await page.locator(`#view [data-act="plan-open"][data-service="${id}"]`).click();
  const details = page.locator(`#view .plan-detail[data-service="${id}"]`);
  await details.waitFor();
  return details;
}
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
  const id = '2026-07-07_evening';
  const card = await openPlanned(page, id);
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
  const card = await openPlanned(page, id);
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
  const card = await openPlanned(page, duty.id);
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

  // Glory and Choir songs are chosen with their tags; the Glory song is not counted.
  assert.equal(await builder.locator('textarea').count(), 0);
  await builder.locator('[data-act="song-slot"][data-slot="glory"]').click();
  await page.locator('#song-root .selecting', { hasText: 'Selecting Glory song' }).waitFor();
  await page.locator('#song-root [data-act="song-add"][data-id="003"]').click();
  await builder.locator('.set-row.is-slot .num', { hasText: '003' }).waitFor();
  await builder.locator('.total', { hasText: '3 songs' }).waitFor();
  await builder.locator('[data-act="song-slot"][data-slot="choir"]').click();
  await page.locator('#song-root .selecting', { hasText: 'Selecting Choir song' }).waitFor();
  await page.locator('#song-root [data-act="song-add"][data-id="004"]').click();
  await page.locator('#song-root .selecting').waitFor({ state: 'detached' });

  await builder.locator('[data-act="song-confirm"]').click();
  await builder.locator('.confirm.is-done', { hasText: 'Songs confirmed by B. Adam' }).waitFor();
  const setlist = (await fakeDocs(page, 'setlists/'))[0];
  assert.deepEqual(setlist.songs, ['001', '015', '002', '003']);
  assert.equal(setlist.glorySong, '003');
  assert.ok(setlist.confirmedAt >= setlist.updatedAt);
  const service = (await fakeDocs(page, 'schedule/')).find(item => item.date === setlist.date && item.service === 'Morning');
  assert.match(service.choirSong, /^004 /);

  // Confirmed songs show on the card, under the people who pray.
  await section(page, 'song-section', 'home');
  const card = page.locator('#song-root .svc-card', { has: page.locator('[data-act="song-toggle-songs"]') }).first();
  await card.locator('.svc-role', { hasText: 'Opening Prayer' }).waitFor();
  await card.locator('.order-head', { hasText: 'Preparation Songs' }).waitFor();
  await card.locator('.order-head', { hasText: 'Glory & Thanks Song' }).waitFor();
  await card.locator('[data-act="song-toggle-songs"]', { hasText: 'Hide songs' }).click();
  await card.locator('.order').waitFor({ state: 'detached' });

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

test('a leader adds people who serve in the department but are not on its list', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'departments');
  await page.locator('[data-act="department-open"][data-department="Translation"]').click();
  const missing = page.locator('#view .missing-members');
  await missing.locator('.list-row', { hasText: 'B. Silas' }).waitFor();
  await missing.locator('[data-act="department-add-name"][data-name="B. Silas"]').click();
  await missing.waitFor({ state: 'detached' });
  const added = await page.evaluate(() => window.__fake.get('departments/Translation/members/member:B. Silas'));
  assert.equal(added.memberName, 'B. Silas');
  assert.equal(added.schedulable, true);
  assert.deepEqual(added.eligibleDuties.sort(), ['Translation #1', 'Translation #2']);
  assert.deepEqual(errors, []);
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

test('a leader plans the month in a grid; a changed duty saves at once', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  const grid = page.locator('#view .plan-grid');
  await grid.waitFor();
  assert.deepEqual(await grid.locator('tbody th[scope="row"]').allInnerTexts(), ['Usher Door', 'Usher Front', 'Usher Back']);
  assert.equal(await grid.locator('.plan-head.is-past').count(), 0, 'only the services still to come');
  assert.match(await grid.locator('.plan-head').first().innerText(), /^Tue 7/);

  const id = '2026-07-11_morning';
  const cell = grid.locator(`select[data-service="${id}"][data-duty="Usher Back"]`);
  await cell.locator('option:nth-child(2)').waitFor({ state: 'attached' });
  const uid = await cell.locator('option:nth-child(2)').getAttribute('value');
  await cell.selectOption(uid);
  await page.waitForFunction(([docPath, name]) => window.__fake.get(docPath).assignments['Usher Back'] === name, ['schedule/' + id, uid.replace('member:', '')]);
  const [payload] = await calls(page, 'saveDepartmentAssignments');
  assert.deepEqual(payload, { departmentId: 'Usher Sisters', changes: [{ serviceId: id, duty: 'Usher Back', memberUid: uid, expectedMemberName: '' }] });

  // A month that is over shows what happened, and nothing can be changed there.
  await page.locator('#view [data-act="plan-month"][data-step="-1"]').click();
  await page.locator('#view .plan-toolbar .month-title', { hasText: 'June 2026' }).waitFor();
  assert.ok(await grid.locator('.plan-head.is-past').count() > 0);
  assert.equal(await grid.locator('select').count(), 0);
  assert.equal(await page.locator('#view [data-act="plan-fill"]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Fill proposes members for the usual empty duties; the leader saves them together', async () => {
  const empty = { assignments: {} };
  const fixture = { patch: { 'schedule/2026-07-18_morning': empty, 'schedule/2026-07-25_morning': empty } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  await page.locator('#view .plan-grid').waitFor();
  await page.locator('#view [data-act="plan-fill"]').click();
  const proposed = page.locator('#view .plan-cell.is-proposed');
  await proposed.first().waitFor();
  const cells = await proposed.locator('select').evaluateAll(selects => selects.map(select => [select.dataset.service, select.dataset.duty, select.value]));
  // Usher Door and Usher Front, the duties these services usually have; not Usher Back.
  assert.deepEqual(cells.map(([id, duty]) => id + ' ' + duty).sort(), ['2026-07-18_morning Usher Door', '2026-07-18_morning Usher Front', '2026-07-25_morning Usher Door', '2026-07-25_morning Usher Front']);
  for (const id of ['2026-07-18_morning', '2026-07-25_morning']) {
    const names = cells.filter(([service]) => service === id).map(([, , value]) => value);
    assert.equal(new Set(names).size, names.length, 'no one twice in one service');
  }
  await page.locator('#view .plan-actions', { hasText: 'Fill picked 4 members' }).waitFor();

  await page.locator('#view [data-act="plan-save"]').click();
  await banner(page, 'Saved 4 duties.');
  const saved = await fakeDoc(page, 'schedule/2026-07-18_morning');
  assert.ok(saved.assignments['Usher Door'] && saved.assignments['Usher Front'] && saved.planBatch);
  await page.locator('#view .plan-cell.is-proposed').first().waitFor({ state: 'detached' });
  assert.equal((await calls(page, 'saveDepartmentAssignments')).length, 1, 'one call for the whole fill');

  await page.locator('#view [data-act="plan-fill"]').click();
  await banner(page, 'The usual duties this month are all filled.');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Fill gives an usher duty to the sister praying there first, and outlines the duties no one is free for', async () => {
  const away = { availability: { recurring: {}, exceptions: { '2026-07-25': { '*': 'unavailable' } } } };
  const fixture = { patch: Object.assign({
    'schedule/2026-07-18_morning': { assignments: { 'Closing Prayer': 'S. Leah' } },
    'schedule/2026-07-25_morning': { assignments: {} }
  }, Object.fromEntries(['S. Leah', 'S. Naomi', 'S. Esther', 'S. Grace'].map(name => ['departments/Usher Sisters/members/member:' + name, away]))) };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  await page.locator('#view .plan-grid').waitFor();
  // Leah prays at that service: she is the first choice for an usher duty there, and the list says why.
  const door = page.locator('#view select[data-service="2026-07-18_morning"][data-duty="Usher Door"]');
  assert.match(await door.locator('option').nth(1).textContent(), /^S\. Leah \(Closing Prayer\)/);
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  assert.equal(await door.inputValue(), 'member:S. Leah');
  const front = await page.locator('#view select[data-service="2026-07-18_morning"][data-duty="Usher Front"]').inputValue();
  assert.ok(front && front !== 'member:S. Leah', 'one usher duty with her prayer');
  // Everyone is away on the 25th: those duties stay empty, outlined, with the reason.
  const outlined = page.locator('#view .plan-cell.is-unfilled');
  assert.equal(await outlined.count(), 2);
  assert.equal(await outlined.first().getAttribute('title'), 'No one who takes this duty is available then.');
  await page.locator('#view .plan-actions', { hasText: 'Fill picked 2 members; 2 duties have no one free (outlined)' }).waitFor();
  await page.locator('#view [data-act="plan-save"]').click();
  await banner(page, 'Saved 2 duties.');
  const saved = await fakeDoc(page, 'schedule/2026-07-18_morning');
  assert.equal(saved.assignments['Closing Prayer'], 'S. Leah');
  assert.equal(saved.assignments['Usher Door'], 'S. Leah');
  assert.equal(await page.locator('#view .plan-cell.is-unfilled').count(), 0, 'the outlines go once the fill is saved');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Opening Prayer goes to its default: Fill proposes them, a Worship leader changes them, a new service starts with them', async () => {
  const fixture = { patch: { 'schedule/2026-07-18_morning': { assignments: {} } } };
  const { context, page, errors } = await as('E. Joseph', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await page.locator('#view select[data-change="manage-department"]').selectOption('Worship');
  await section(page, 'manage-section', 'services');
  await page.locator('#view .plan-grid').waitFor();
  const sermon = page.locator('#view select[data-service="2026-07-18_morning"][data-duty="Sermon"]');
  assert.ok((await sermon.locator('option').allTextContents()).some(text => /^B\. Samuel \(default\)/.test(text)), 'the default is marked in the list');
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  assert.equal(await sermon.inputValue(), 'member:B. Samuel');
  const given = await page.locator('#view select[data-service="2026-07-18_morning"]').evaluateAll(selects => selects.map(select => select.value));
  assert.equal(given.filter(value => value === 'member:B. Samuel').length, 1, 'the default gets no other duty');
  await page.locator('#view [data-act="plan-discard"]').click();

  await section(page, 'manage-section', 'departments');
  const choice = page.locator('#view select[data-change="duty-default"][data-duty="Sermon"]');
  assert.equal(await choice.inputValue(), 'B. Samuel');
  await choice.selectOption('B. Caleb');
  await banner(page, 'B. Caleb is the default for Opening Prayer.');
  assert.deepEqual(await calls(page, 'setDutyDefault'), [{ duty: 'Sermon', memberName: 'B. Caleb' }]);
  assert.deepEqual((await fakeDoc(page, 'app/settings')).dutyDefaults, { Sermon: 'B. Caleb' });
  assert.deepEqual(errors, []);
  await context.close();

  // An administrator adds a service: it starts with the default on Opening Prayer.
  const admin = await as('B. Adam', { viewport: DESKTOP });
  await tab(admin.page, 'manage');
  await section(admin.page, 'manage-section', 'services');
  await admin.page.locator('#view .plan-add summary').click();
  const form = admin.page.locator('#view form[data-act="service-add"]');
  await form.locator('input[name="date"]').fill('2026-07-16');
  await form.locator('select[name="service"]').selectOption('Evening');
  await form.locator('input[name="worship"]').fill('Pentecost');
  await form.locator('button[type="submit"]').click();
  await admin.page.waitForFunction(() => window.__fake.get('schedule/2026-07-16_evening'));
  assert.deepEqual((await fakeDoc(admin.page, 'schedule/2026-07-16_evening')).assignments, { Sermon: 'B. Samuel' });
  assert.deepEqual(admin.errors, []);
  await admin.context.close();
});

test('on a phone the month is one list, and a service opens in place', async () => {
  const { context, page, errors } = await as('S. Grace');
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  await page.locator('#view .plan-days .plan-day').first().waitFor();
  assert.equal(await page.locator('#view .plan-grid').count(), 0);
  const id = '2026-07-14_evening';
  await page.locator(`#view .plan-day [data-act="plan-open"][data-service="${id}"]`).click();
  await page.locator(`#view .plan-day .plan-detail[data-service="${id}"]`).waitFor();
  await page.locator('#view .plan-detail [data-act="plan-close"]').click();
  await page.locator('#view .plan-detail').waitFor({ state: 'detached' });
  await page.locator('#view [data-act="plan-month"][data-step="1"]').click();
  await page.locator('#view .plan-toolbar .month-title', { hasText: 'August 2026' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('an administrator links the Sheet, checks it, and adds a year of services', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'features');
  const toggle = page.locator('#view input[data-feature="sheetWrite"], #view [data-change="feature"][data-id="sheetWrite"]');
  if (await toggle.count()) assert.equal(await toggle.first().isChecked(), false, 'writing to the Sheet starts off');
  await section(page, 'manage-section', 'data');
  const link = page.locator('#view [data-change="sheet-edit-link"]');
  await link.fill('https://docs.google.com/spreadsheets/d/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123/edit#gid=0');
  await link.press('Tab');
  await banner(page, 'Sheet link saved. Check the Sheet next.');
  assert.equal((await fakeDoc(page, 'app/settings')).sheetId, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123');
  await page.locator('#view [data-act="sheet-check"]').click();
  await page.locator('#view .sheet-check', { hasText: 'Read 40 services from 2026 Entry.' }).waitFor();
  await page.locator('#view .sheet-check li', { hasText: 'Usher Door' }).waitFor();

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#view form[data-act="year-add"] button[type="submit"]').click();
  await banner(page, 'Added 225 services.');
  assert.equal((await fakeDoc(page, 'schedule/2027-01-02_morning')).worship, 'Sabbath Day');

  await section(page, 'manage-section', 'services');
  const reminder = page.locator('#view .card-note', { hasText: 'Add that year\'s feast services.' });
  await reminder.waitFor();
  await reminder.locator('[data-act="feast-done"]').click();
  await reminder.waitFor({ state: 'detached' });
  assert.equal((await fakeDoc(page, 'app/settings')).feastNotice, null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Edit assignments on the Schedule opens that service in the planner', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, appearance: 'prism' });
  await page.locator('#view [data-act="schedule-date"][data-date="2026-07-18"]').click();
  await page.locator('#view [data-act="schedule-edit"]').click();
  await page.locator('#view .plan-detail[data-service^="2026-07-18"]').waitFor();
  assert.equal(await page.locator('#view .plan-toolbar .month-title').innerText(), 'July 2026');
  assert.deepEqual(errors, []);
  await context.close();
});
