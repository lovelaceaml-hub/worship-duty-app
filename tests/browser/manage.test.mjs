/* Manage, end to end in a browser on the fake data (no Firebase): the month
   plan and Fill, service details, Requests, Checks, Departments and Features.
   Run: node --test tests/browser/manage.test.mjs */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, unlock, signIn, tab, section, DESKTOP } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function as(member, options = {}) {
  const opened = await openPage(browser, server.url, options);
  await unlock(opened.page);
  await signIn(opened.page, member);
  return opened;
}

/* A message on screen: a banner, or (once the core package's toasts are in)
   a short toast for good news. */
const banner = (page, text) => page.locator('#banners .banner, #toasts .toast', { hasText: text }).first().waitFor();
const fakeDoc = (page, docPath) => page.evaluate(docPath => window.__fake.get(docPath), docPath);
const setDoc = (page, docPath, value) => page.evaluate(([docPath, value]) => window.__fake.set(docPath, value), [docPath, value]);
const calls = (page, name) => page.evaluate(name => window.__fakeCalls.filter(call => call.name === name).map(call => call.payload), name);
const activeSection = page => page.locator('#view .sections button.is-active').getAttribute('data-section');
const accept = page => page.once('dialog', dialog => dialog.accept());
const cellAt = (page, id, duty) => page.locator(`#view td.plan-cell:has(select[data-service="${id}"][data-duty="${duty}"])`);

async function monthPlan(page) {
  await tab(page, 'manage');
  await section(page, 'manage-section', 'services');
  await page.locator('#view .plan-toolbar').waitFor();
}

/* Two Saturday mornings with nothing filled, for Fill to work on. */
const emptyMornings = { 'schedule/2026-07-18_morning': { assignments: {} }, 'schedule/2026-07-25_morning': { assignments: {} } };

test('Manage opens on Requests when one waits, else on the month plan; the picker shows only where it applies', async () => {
  const leader = await as('S. Grace');
  await tab(leader.page, 'manage');
  assert.equal(await activeSection(leader.page), 'requests', 'S. Leah\'s request waits');
  accept(leader.page);
  await leader.page.locator('#view [data-act="request-decline"]').click();
  await banner(leader.page, 'Request declined.');
  await leader.page.locator('#view .empty', { hasText: 'No requests waiting.' }).waitFor();
  assert.equal(await activeSection(leader.page), 'requests', 'answering the last one does not move the leader');
  await leader.context.close();

  const joseph = await as('E. Joseph', { viewport: DESKTOP });
  await tab(joseph.page, 'manage');
  assert.equal(await activeSection(joseph.page), 'services');
  assert.deepEqual(await joseph.page.locator('#view .sections button').evaluateAll(buttons => buttons.map(button => button.firstChild.textContent.trim())),
    ['Month plan', 'Requests', 'Checks', 'Departments', 'Data']);
  assert.equal(await joseph.page.locator('#view select[data-change="manage-department"]').count(), 1);
  await joseph.context.close();

  const admin = await as('B. Adam', { viewport: DESKTOP });
  await tab(admin.page, 'manage');
  await section(admin.page, 'manage-section', 'features');
  assert.equal(await admin.page.locator('#view select[data-change="manage-department"]').count(), 0, 'Features ignores the department');
  assert.deepEqual(admin.errors, []);
  await admin.context.close();
});

test('Fill\'s proposals stay with their department and month until saved or discarded', async () => {
  const { context, page, errors } = await as('E. Joseph', { viewport: DESKTOP, fixture: { patch: emptyMornings } });
  await monthPlan(page);
  await page.locator('#view select[data-change="manage-department"]').selectOption('Worship');
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  const proposed = await page.locator('#view .plan-cell.is-proposed').count();
  assert.ok(proposed > 3);

  // The department picker, the month arrows and opening another month's service all stay.
  await page.locator('#view select[data-change="manage-department"]').selectOption('Media');
  await banner(page, 'waiting in Worship, July 2026 first.');
  assert.equal(await page.locator('#view select[data-change="manage-department"]').inputValue(), 'Worship');
  await page.locator('#view [data-act="plan-month"][data-step="1"]').click();
  assert.equal(await page.locator('#view .plan-toolbar .month-title').innerText(), 'July 2026');
  await page.evaluate(async () => (await import('/app/screens/manage/services.js')).openService('2026-08-08_morning'));
  await page.locator('#view .plan-toolbar .month-title', { hasText: 'July 2026' }).waitFor();
  assert.equal(await page.locator('#view .plan-cell.is-proposed').count(), proposed, 'the proposals are still on screen');

  // More than three proposals: Discard asks first.
  accept(page);
  await page.locator('#view [data-act="plan-discard"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor({ state: 'detached' });
  await page.locator('#view select[data-change="manage-department"]').selectOption('Media');
  await page.locator('#view tbody th[scope="row"]', { hasText: 'Media Booth #1' }).waitFor();
  assert.equal((await calls(page, 'saveDepartmentAssignments')).length, 0, 'nothing was saved');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a failed save keeps the proposals, with one banner; saving again works', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture: { patch: emptyMornings } });
  await monthPlan(page);
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  await page.evaluate(() => { window.__fakeFail = { saveDepartmentAssignments: 'unavailable' }; });
  await page.locator('#view [data-act="plan-save"]').click();
  await banner(page, 'Nothing was saved. Usher Sisters was not saved: The server could not be reached. Try again.');
  assert.equal(await page.locator('#banners .banner').count(), 1, 'one banner');
  assert.equal(await page.locator('#view .plan-cell.is-proposed').count(), 4, 'the proposals are still there');
  await page.evaluate(() => { window.__fakeFail = {}; });
  await page.locator('#view [data-act="plan-save"]').click();
  await banner(page, 'Saved 4 duties.');
  assert.ok((await fakeDoc(page, 'schedule/2026-07-18_morning')).assignments['Usher Door']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Fill reads the lists first; a duty the server skips says why, and the summary names it', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture: { patch: emptyMornings } });
  await monthPlan(page);
  await page.locator('#view .plan-grid select').first().waitFor();
  // S. Naomi marks Jul 18 off on her phone after the planner loaded her list.
  const naomi = 'departments/Usher Sisters/members/member:S. Naomi';
  const before = await fakeDoc(page, naomi);
  await setDoc(page, naomi, Object.assign({}, before, { availability: { recurring: {}, exceptions: { '2026-07-18': { '*': 'unavailable' } } }, revision: 2 }));
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  const picks = await page.locator('#view .plan-cell.is-proposed select').evaluateAll(selects => selects.map(select => select.dataset.service + ' ' + select.value));
  assert.ok(!picks.includes('2026-07-18_morning member:S. Naomi'), 'Fill saw her day off');

  // S. Esther becomes unavailable on the 25th before the save: that one is skipped.
  const target = picks.find(item => item.startsWith('2026-07-25_morning'));
  const uid = target.slice(target.indexOf(' ') + 1);
  const path = 'departments/Usher Sisters/members/' + uid;
  await setDoc(page, path, Object.assign({}, await fakeDoc(page, path), { availability: { recurring: {}, exceptions: { '2026-07-25': { '*': 'unavailable' } } }, revision: 5 }));
  const rosterReads = (await calls(page, 'listDepartmentRoster')).length;
  await page.locator('#view [data-act="plan-save"]').click();
  await banner(page, 'Saved 3 of 4 duties. Not saved:');
  await banner(page, 'on Sat, Jul 25 Morning (' + uid.replace('member:', '') + ': not available then)');
  await page.locator('#view .plan-cell.is-skipped .plan-note', { hasText: 'Not saved: not available then' }).waitFor();
  await page.waitForFunction(count => window.__fakeCalls.filter(call => call.name === 'listDepartmentRoster').length > count, rosterReads);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Fill on all departments fills those with people and names the others', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, fixture: { patch: emptyMornings } });
  await page.evaluate(() => {
    window.__fake.paths('departments/Offering/members/').forEach(path => window.__fake.remove(path));
    window.__fakeFail = { listDepartmentRoster: payload => (payload.departmentId === 'Media' ? 'unavailable' : '') };
  });
  await monthPlan(page);
  await page.locator('#view .plan-status', { hasText: 'The Media list did not load' }).waitFor();
  await page.locator('#view .plan-status', { hasText: 'No one is on the Offering and Children\'s Teachers lists yet' }).waitFor();
  await page.locator('#view [data-act="plan-fill"]').click();
  await banner(page, 'Fill skipped Media, Offering');
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  const departments = await page.locator('#view .plan-cell.is-proposed select').evaluateAll(selects => selects.map(select => select.dataset.duty));
  assert.ok(departments.some(duty => duty.startsWith('Usher')) && !departments.some(duty => /^(Media|Offering)/.test(duty)));

  // Try again reads the list that failed.
  await page.evaluate(() => { window.__fakeFail = {}; });
  await page.locator('#view [data-act="plan-roster-retry"]').click();
  await page.locator('#view .plan-status', { hasText: 'The Media list did not load' }).waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('red names say why on phones too; an usher who also prays is marked calmly', async () => {
  const fixture = { patch: {
    'departments/Usher Sisters/members/member:S. Naomi': { availability: { recurring: {}, exceptions: { '2026-07-11': { '*': 'unavailable' } } } },
    'schedule/2026-07-18_morning': { assignments: { 'Closing Prayer': 'S. Leah', 'Usher Door': 'S. Leah', 'Usher Front': 'S. Esther' } }
  } };
  const { context, page, errors } = await as('S. Grace', { fixture });
  await monthPlan(page);
  const naomi = page.locator('#view .plan-day', { has: page.locator('[data-act="plan-open"][data-service="2026-07-11_morning"]') });
  await naomi.locator('.plan-cell.is-flagged .plan-note', { hasText: 'Not available then' }).waitFor();
  await naomi.locator('.plan-count', { hasText: '1 to check' }).waitFor();
  const leah = page.locator('#view .plan-day', { has: page.locator('[data-act="plan-open"][data-service="2026-07-18_morning"]') });
  await leah.locator('.plan-praying', { hasText: 'S. Leah (Closing Prayer)' }).waitFor();
  const door = leah.locator('td.plan-cell:has(select[data-duty="Usher Door"])');
  assert.equal(await door.getAttribute('class'), 'plan-cell is-paired');
  assert.equal(await door.locator('.plan-note').innerText(), 'Also Closing Prayer');
  assert.equal(await leah.locator('.plan-count.is-look').count(), 0, 'an allowed pair is nothing to check');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a service\'s details show Fill\'s proposals and change them without saving', async () => {
  const { context, page, errors } = await as('S. Grace', { fixture: { patch: emptyMornings } });
  await monthPlan(page);
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  await page.locator('#view .plan-day [data-act="plan-open"][data-service="2026-07-18_morning"]').click();
  const details = page.locator('#view .plan-detail[data-service="2026-07-18_morning"]');
  await details.waitFor();
  assert.equal(await details.locator('.plan-field.is-proposed').count(), 2);
  const select = details.locator('select[data-change="assign"][data-duty="Usher Door"]');
  const other = await select.evaluate(element => [...element.options].map(option => option.value).find(value => value.startsWith('member:') && value !== element.value));
  await select.selectOption(other);
  await page.waitForFunction(value => document.querySelector('#view select[data-change="assign"][data-duty="Usher Door"]').value === value, other);
  assert.equal((await calls(page, 'saveDepartmentAssignments')).length, 0, 'still a proposal');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a service that has started shows what happened and changes nothing', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await monthPlan(page);
  await page.locator('#view [data-act="plan-month"][data-step="-1"]').click();
  await page.locator('#view .plan-toolbar .month-title', { hasText: 'June 2026' }).waitFor();
  await page.locator('#view [data-act="plan-open"]').first().click();
  const details = page.locator('#view .plan-detail');
  await details.locator('.hint', { hasText: 'This service has started' }).waitFor();
  assert.equal(await details.locator('select, input, form').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('while a duty saves, its cell shows the new name', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await monthPlan(page);
  await page.evaluate(() => { window.__fakeDelay = { saveDepartmentAssignments: 1500 }; });
  const select = page.locator('#view select[data-change="plan-assign"][data-service="2026-07-11_morning"][data-duty="Usher Back"]');
  const uid = await select.evaluate(element => [...element.options].map(option => option.value).find(value => value.startsWith('member:')));
  await select.selectOption(uid);
  const busy = cellAt(page, '2026-07-11_morning', 'Usher Back');
  await page.locator('#view td.plan-cell.is-busy').waitFor();
  assert.equal(await busy.locator('.plan-value').innerText(), uid.replace('member:', ''));
  await page.locator('#view td.plan-cell.is-busy').waitFor({ state: 'detached' });
  assert.equal((await fakeDoc(page, 'schedule/2026-07-11_morning')).assignments['Usher Back'], uid.replace('member:', ''));
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member who can no longer make a duty can be kept on it, and is then available for that service', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  const id = '2026-07-11_morning';
  const service = await fakeDoc(page, 'schedule/' + id);
  const holder = service.assignments['Usher Door'];
  // The member marked the whole day off, which flagged the duty.
  const path = 'departments/Usher Sisters/members/member:' + holder;
  await setDoc(page, path, Object.assign({}, await fakeDoc(page, path), { availability: { recurring: {}, exceptions: { '2026-07-11': { '*': 'unavailable' } } } }));
  await setDoc(page, 'schedule/' + id, Object.assign({}, service, {
    needsReplacement: { 'Usher Door': { memberName: holder, memberUid: 'member:' + holder, departmentId: 'Usher Sisters', reason: 'unavailable' } }
  }));
  await monthPlan(page);
  const flagged = page.locator(`#view td.plan-cell.is-flagged:has(select[data-service="${id}"][data-duty="Usher Door"])`);
  await flagged.waitFor();
  await page.locator(`#view [data-act="plan-open"][data-service="${id}"]`).click();
  const form = page.locator('#view form[data-act="replace-duty"]');
  assert.equal(await form.locator('button[type="submit"]').isDisabled(), true, 'nothing chosen yet');
  await form.locator('select').selectOption('__keep');
  await form.locator('.hint', { hasText: holder + ' is then marked available for this service.' }).waitFor();
  await form.locator('button[type="submit"]', { hasText: 'Keep ' + holder }).click();
  await banner(page, holder + ' stays on Usher Door and is marked available for this service.');
  const [payload] = await calls(page, 'resolveDutyAttention');
  assert.deepEqual([payload.decision, payload.duty, payload.requestId], ['keep', 'Usher Door', undefined]);
  const after = await fakeDoc(page, 'schedule/' + id);
  assert.deepEqual([after.assignments['Usher Door'], after.needsReplacement['Usher Door']], [holder, undefined]);
  // Available for the morning service only; the rest of the day stays off.
  assert.deepEqual((await fakeDoc(page, path)).availability.exceptions['2026-07-11'], { '*': 'unavailable', morning: 'available' });
  await flagged.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('a duty someone can no longer make in another month is named above the month, with a way to it', async () => {
  const fixture = { patch: { 'schedule/2026-08-08_morning': { needsReplacement: { 'Usher Door': { memberName: 'S. Naomi', reason: 'unavailable' } } } } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  assert.equal((await fakeDoc(page, 'schedule/2026-08-08_morning')).assignments['Usher Door'], 'S. Naomi');
  await monthPlan(page);
  await page.locator('#view .sections [data-section="services"] .count', { hasText: '1' }).waitFor();
  const note = page.locator('#view .card-note', { hasText: 'S. Naomi can no longer make Usher Door on Sat, Aug 8 Morning.' });
  await note.waitFor();
  await note.locator('button', { hasText: 'Open' }).click();
  await page.locator('#view .plan-toolbar .month-title', { hasText: 'August 2026' }).waitFor();
  await page.locator('#view .plan-detail form[data-act="replace-duty"]', { hasText: 'S. Naomi can no longer make Usher Door.' }).waitFor();
  assert.equal(await page.locator('#view .card-note', { hasText: 'can no longer make Usher Door on' }).count(), 0, 'in its own month the cell says it');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a flag on a duty stored under an older spelling of the name still shows', async () => {
  // The schedule holds the Sheet's older spelling; the server's flag carries the name as stored.
  const fixture = { patch: {
    'app/nameMap': { map: { 'B. Adam A': 'B. Adam', 'S. Naomii': 'S. Naomi' } },
    'schedule/2026-07-11_morning': { assignments: { 'Usher Door': 'S. Naomii' }, needsReplacement: { 'Usher Door': { memberName: 'S. Naomii', reason: 'unavailable' } } }
  } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  await monthPlan(page);
  await page.locator('#view .sections [data-section="services"] .count', { hasText: '1' }).waitFor();
  await cellAt(page, '2026-07-11_morning', 'Usher Door').locator('.plan-note', { hasText: 'Can no longer make it' }).waitFor();
  await page.locator('#view [data-act="plan-open"][data-service="2026-07-11_morning"]').click();
  const form = page.locator('#view form[data-act="replace-duty"]', { hasText: 'S. Naomi can no longer make Usher Door.' });
  await form.waitFor();
  // The server compares names in their current spelling, and so does the fake.
  await form.locator('select').selectOption('__open');
  await form.locator('button[type="submit"]').click();
  await banner(page, 'Usher Door is open now.');
  assert.equal((await fakeDoc(page, 'schedule/2026-07-11_morning')).assignments['Usher Door'], '');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a flagged duty another leader gave away meanwhile is not kept or emptied', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  const id = '2026-07-11_morning', path = 'schedule/' + id;
  const service = await fakeDoc(page, path);
  const holder = service.assignments['Usher Door'];
  const other = ['S. Leah', 'S. Naomi', 'S. Esther'].find(name => !Object.values(service.assignments).includes(name));
  const flag = () => setDoc(page, path, Object.assign({}, service, { needsReplacement: { 'Usher Door': { memberName: holder, reason: 'unavailable' } } }));
  // Another leader gives Usher Door to someone else (which removes the flag)
  // just before this leader's answer reaches the server.
  const handOverFirst = () => page.evaluate(([path, other]) => {
    window.__fakeFail = { resolveDutyAttention: () => {
      const now = window.__fake.get(path);
      window.__fake.set(path, Object.assign(now, { assignments: Object.assign(now.assignments, { 'Usher Door': other }), needsReplacement: {} }));
      window.__fakeFail = {};
      return '';
    } };
  }, [path, other]);
  await flag();
  await monthPlan(page);
  await page.locator(`#view [data-act="plan-open"][data-service="${id}"]`).click();
  const form = page.locator('#view form[data-act="replace-duty"]');
  for (const choice of ['__keep', '__open']) {
    if (choice !== '__keep') await flag();
    await form.locator('select').selectOption(choice);
    await handOverFirst();
    await form.locator('button[type="submit"]').click();
    await banner(page, 'That was not saved: ' + holder + ' is no longer on Usher Door.');
    assert.equal((await fakeDoc(page, path)).assignments['Usher Door'], other, choice + ': the other leader\'s change stays');
    await page.locator('#banners .banner-close').first().click();
  }
  assert.deepEqual((await calls(page, 'resolveDutyAttention')).map(payload => payload.expectedMemberName), [holder, holder]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a service with Fill\'s proposals waiting is not moved or deleted until they are saved or discarded', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, fixture: { patch: emptyMornings } });
  await monthPlan(page);
  await page.locator('#view select[data-change="manage-department"]').selectOption('Usher Sisters');
  await page.locator('#view [data-act="plan-fill"]').click();
  await page.locator('#view .plan-cell.is-proposed').first().waitFor();
  const proposed = await page.locator('#view .plan-cell.is-proposed').count();
  const id = '2026-07-18_morning';
  await page.locator(`#view [data-act="plan-open"][data-service="${id}"]`).click();
  // Another day in the same month: the proposals for this service would be left behind.
  await page.locator('#view .plan-detail input[data-field="date"]').fill('2026-07-19');
  await banner(page, 'waiting in Usher Sisters, July 2026 first.');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#view [data-act="service-delete"]').click();
  await page.waitForTimeout(300);
  assert.ok(await fakeDoc(page, 'schedule/' + id), 'the service stays where it was');
  assert.equal(await page.locator('#view .plan-cell.is-proposed').count(), proposed, 'its proposals still show');
  // Another administrator deletes the other service on their device: the save names it by its day.
  await page.evaluate(() => window.__fake.remove('schedule/2026-07-25_morning'));
  await page.locator('#view [data-act="plan-save"]').click();
  await banner(page, 'Saved 2 of ' + proposed + ' duties. Not saved: Usher Door on Sat, Jul 25 Morning (');
  assert.equal(await page.locator('#banners .banner', { hasText: '2026-07-25_morning' }).count(), 0, 'no service id on screen');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a service moved to another date leaves what the Sheet said about the old date behind', async () => {
  const id = '2026-07-18_morning';
  const fixture = { patch: { ['schedule/' + id]: { sheetSeen: { 'Usher Door': 'S. Leah' }, sheetSyncedAt: 5 } } };
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP, fixture });
  await monthPlan(page);
  await page.locator(`#view [data-act="plan-open"][data-service="${id}"]`).click();
  await page.locator('#view .plan-detail input[data-field="date"]').fill('2026-07-19');
  await page.waitForFunction(() => !!window.__fake.get('schedule/2026-07-19_morning'));
  const moved = await fakeDoc(page, 'schedule/2026-07-19_morning');
  assert.deepEqual([moved.sheetSeen, moved.sheetSyncedAt, moved.date], [undefined, undefined, '2026-07-19']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Requests: a past request leaves the count, and one for a deleted service can be closed', async () => {
  const base = { name: 'S. Naomi', memberId: 'S. Naomi', requesterUid: 'member:S. Naomi', worship: 'Sabbath Day', department: 'Usher Sisters', duty: 'Usher Door', status: 'pending', createdAt: 1 };
  const fixture = { patch: {
    'requests/past': Object.assign({ id: 'past', svcId: '2026-07-04_morning', date: '2026-07-04', service: 'Morning' }, base),
    'requests/gone': Object.assign({ id: 'gone', svcId: '2026-07-14_gone', date: '2026-07-14', service: 'Evening' }, base)
  } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await page.locator('#view .sections [data-section="requests"] .count', { hasText: '2' }).waitFor();
  const gone = page.locator('#view .request', { hasText: 'This service was moved or deleted' });
  await gone.waitFor();
  accept(page);
  await gone.locator('[data-act="request-close"]').click();
  await banner(page, 'Request closed.');
  assert.equal((await fakeDoc(page, 'requests/gone')).status, 'declined');
  await page.locator('#view [data-act="expand"][data-key="requests-done"]').click();
  await page.locator('#view .list-item', { hasText: 'Sat, Jul 4' }).locator('.status', { hasText: /past/i }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader of two departments is told where the requests counted wait', async () => {
  const fixture = { patch: { 'requests/media-1': { id: 'media-1', svcId: '2026-07-11_morning', name: 'B. Titus', memberId: 'B. Titus', requesterUid: 'member:B. Titus',
    date: '2026-07-11', service: 'Morning', worship: 'Sabbath Day', duty: 'Media Booth #1', department: 'Media', status: 'pending', createdAt: 1 },
  'schedule/2026-07-11_morning': { assignments: { 'Media Booth #1': 'B. Titus' } } } };
  const { context, page, errors } = await as('E. Joseph', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  assert.equal(await activeSection(page), 'requests');
  assert.equal(await page.locator('#view select[data-change="manage-department"]').inputValue(), 'Worship');
  await page.locator('#view .sections [data-section="requests"] .count', { hasText: '1' }).waitFor();
  await page.locator('#view .empty', { hasText: 'No requests waiting in Worship.' }).waitFor();
  const note = page.locator('#view .card-note', { hasText: '1 request waits in Media.' });
  await note.waitFor();
  await note.locator('button', { hasText: 'Show Media' }).click();
  await page.locator('#view .request', { hasText: 'Media Booth #1' }).waitFor();
  assert.equal(await page.locator('#view select[data-change="manage-department"]').inputValue(), 'Media');
  assert.equal(await page.locator('#view .card-note', { hasText: 'waits in' }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('when Approve can no longer work, the request card offers to close it', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await tab(page, 'manage');
  const card = page.locator('#view .request', { has: page.locator('.card-subtitle', { hasText: 'S. Leah' }) });
  await card.locator('select[name="uid"]').selectOption('__open');
  await page.evaluate(() => { window.__fakeFail = { resolveDutyAttention: { code: 'failed-precondition', reason: 'not-holder', message: 'That member is no longer on that duty.' } }; });
  await card.locator('button[type="submit"]', { hasText: 'Approve, leave it open' }).click();
  await card.locator('.card-note', { hasText: 'That member is no longer on that duty. Decline the request to close it' }).waitFor();
  await page.evaluate(() => { window.__fakeFail = {}; });
  accept(page);
  await card.locator('[data-act="request-close"]').click();
  await banner(page, 'Request closed.');
  const request = await page.evaluate(() => window.__fake.paths('requests/').map(item => window.__fake.get(item)).find(item => item.name === 'S. Leah'));
  assert.equal(request.status, 'declined');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Checks lists the usual duties not filled in the next 4 weeks, unplanned services too, and the names to check', async () => {
  const fixture = { patch: {
    'schedule/2026-07-14_evening': { assignments: {} },
    'departments/Usher Sisters/members/member:S. Naomi': { availability: { recurring: {}, exceptions: { '2026-07-11': { '*': 'unavailable' } } } }
  } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'planning');
  await page.locator('#view .open-duty', { hasText: 'Tue, Jul 14 · Evening' }).locator('span', { hasText: 'Usher Door, Usher Front' }).waitFor();
  await page.locator('#view .open-duty', { hasText: 'Sat, Jul 11 · Morning' }).locator('span', { hasText: 'Usher Door: S. Naomi (not available then)' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader sets a member to Manual only in their department, and back', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'departments');
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Naomi' }).click();
  const toggle = page.locator('#view [data-change="profile-manual-only"]');
  await toggle.check();
  await banner(page, 'is Manual only in Usher Sisters');
  assert.deepEqual((await page.evaluate(() => window.__fake.get('app/settings'))).manualOnly, { 'Usher Sisters': ['S. Naomi'] });
  assert.ok(await toggle.isChecked());
  await toggle.uncheck();
  await banner(page, 'can be picked by Fill in Usher Sisters again.');
  assert.deepEqual((await page.evaluate(() => window.__fake.get('app/settings'))).manualOnly, { 'Usher Sisters': [] });
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader is not offered Reset PIN for someone inactive in the department', async () => {
  const fixture = { patch: { 'departments/Usher Sisters/members/member:S. Leah': { status: 'inactive' } } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'departments');
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Leah' }).click();
  await page.locator('#view [data-act="department-status"]', { hasText: 'Make active' }).waitFor();
  assert.equal(await page.locator('#view [data-act="department-reset-pin"]').count(), 0);
  await page.locator('#view [data-act="department-member-back"]').click();
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Naomi' }).click();
  await page.locator('#view [data-act="department-reset-pin"]').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('Make inactive changes only the status; unsaved edits stay and are marked', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'departments');
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Leah' }).click();
  await page.locator('#view input[data-change="profile-duty"][data-duty="Usher Back"]').uncheck();
  await page.locator('#view .profile-save').waitFor();
  await page.locator('#view [data-act="department-member-back"]').click();
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Leah' }).locator('.tag', { hasText: 'Unsaved changes' }).waitFor();
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Leah' }).click();
  accept(page);
  await page.locator('#view [data-act="department-status"]', { hasText: 'Make inactive' }).click();
  await banner(page, 'S. Leah is inactive now');
  const [payload] = await calls(page, 'updateDepartmentProfile');
  assert.deepEqual(payload.patch, { status: 'inactive' });
  assert.equal(payload.expectedRevision, 1);
  const stored = await fakeDoc(page, 'departments/Usher Sisters/members/member:S. Leah');
  assert.deepEqual([stored.status, stored.eligibleDuties.length], ['inactive', 3]);
  await page.locator('#view .profile-save', { hasText: 'Unsaved changes to S. Leah' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader\'s availability edit goes on top of the member\'s newer day off', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'departments');
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Naomi' }).click();
  // Meanwhile S. Naomi adds a day off on her phone.
  const path = 'departments/Usher Sisters/members/member:S. Naomi';
  const before = await fakeDoc(page, path);
  await setDoc(page, path, Object.assign({}, before, { availability: { recurring: before.availability.recurring, exceptions: { '2026-07-25': { '*': 'unavailable' } } }, revision: 2, updatedAt: before.updatedAt + 1 }));
  await page.locator('#view select[data-change="profile-week"][data-key="evening"]').selectOption('unavailable');
  await page.locator('#view [data-act="profile-save"]').click();
  await banner(page, 'S. Naomi’s profile changed while you were editing it.');
  await page.locator('#view .exception', { hasText: 'Saturday, July 25' }).waitFor();
  await page.locator('#view [data-act="profile-save"]').click();
  await banner(page, 'S. Naomi’s profile was saved. S. Naomi can no longer make ');
  const flagged = await page.evaluate(() => window.__fake.paths('schedule/').map(item => window.__fake.get(item))
    .filter(service => Object.values(service.needsReplacement || {}).some(marker => marker.memberName === 'S. Naomi')).length);
  assert.ok(flagged > 0, 'her evening duties are flagged for her leader');
  const stored = await fakeDoc(page, path);
  assert.equal(stored.availability.recurring.evening, 'unavailable');
  assert.deepEqual(stored.availability.exceptions['2026-07-25'], { '*': 'unavailable' }, 'her day off stayed');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member added by search can take the department\'s duties and opens to be checked; one who cannot be scheduled is marked', async () => {
  const joined = { uid: 'member:S. Priscilla', memberUid: 'member:S. Priscilla', department: 'Usher Sisters', departmentId: 'Usher Sisters', memberName: 'S. Priscilla',
    role: 'member', status: 'active', eligibleDuties: [], schedulable: false, availability: { recurring: {}, exceptions: {} } };
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP, fixture: { patch: { 'departments/Usher Sisters/members/member:S. Priscilla': joined } } });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'departments');
  await page.locator('#view [data-act="department-member"]', { hasText: 'S. Priscilla' }).locator('.tag', { hasText: 'Not ready' }).waitFor();
  await page.locator('#view input[name="query"]').fill('Joanna');
  await page.locator('#view form[data-act="department-search"] button').click();
  await page.locator('#view [data-act="department-add"][data-name="S. Joanna"]').click();
  await page.locator('#view .screen-title', { hasText: 'S. Joanna' }).waitFor();
  await banner(page, 'S. Joanna was added to Usher Sisters, able to take any Usher Sisters duty.');
  const stored = await fakeDoc(page, 'departments/Usher Sisters/members/member:S. Joanna');
  assert.deepEqual([stored.eligibleDuties.length, stored.schedulable, stored.status, stored.revision], [3, true, 'active', 1]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader of two departments has no "All departments" link, resets only a member\'s PIN, and returns the member to shared PIN setup', async () => {
  const { context, page, errors } = await as('E. Joseph', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'departments');
  await page.locator('#view .screen-title', { hasText: 'Worship' }).waitFor();
  assert.equal(await page.locator('#view [data-act="department-list"]').count(), 0);
  await page.locator('#view [data-act="department-member"]', { hasText: 'B. Adam' }).click();
  await page.locator('#view .screen-title', { hasText: 'B. Adam' }).waitFor();
  assert.equal(await page.locator('#view [data-act="department-reset-pin"]').count(), 0, 'an administrator\'s PIN is reset by an administrator');
  await page.locator('#view [data-act="department-member-back"]').click();
  await page.locator('#view [data-act="department-member"]', { hasText: 'B. Caleb' }).click();
  await setDoc(page, 'tokens/caleb-phone', { name: 'B. Caleb', updatedAt: 1, lastSeenAt: 1 });
  const asked = new Promise(resolve => page.once('dialog', dialog => { resolve(dialog.message()); dialog.accept(); }));
  await page.locator('#view [data-act="department-reset-pin"]').click();
  assert.match(await asked, /Their phones get no alerts until they sign in again\.$/);
  await banner(page, 'B. Caleb can now sign in with the shared setup PIN and choose a personal PIN.');
  assert.equal(await fakeDoc(page, 'tokens/caleb-phone'), undefined, 'their phones get no alerts');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Sheet writing needs a checked Sheet; the passcode is typed twice', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  await tab(page, 'manage');
  await section(page, 'manage-section', 'features');
  await page.locator('#view [data-change="feature"][data-id="sheetWrite"]').click();
  await banner(page, 'press "Check the Sheet" first');
  assert.equal(await page.locator('#view [data-change="feature"][data-id="sheetWrite"]').isChecked(), false);
  assert.equal(((await fakeDoc(page, 'app/settings')).features || {}).sheetWrite, undefined);
  const form = page.locator('#view form[data-act="site-passcode"]');
  await form.locator('input[name="code"]').fill('1357');
  await form.locator('input[name="again"]').fill('1358');
  await form.locator('button[type="submit"]').click();
  await banner(page, 'The two passcodes do not match.');
  assert.equal((await fakeDoc(page, 'app/settings')).sitePinHash, 'a1fb4e703a9ef1fa4936801721ff285a97ac85330856674412e054892afe6972');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member\'s availability saves after it changed elsewhere, and the save names the duties it flagged', async () => {
  const { context, page, errors } = await as('S. Naomi');
  await page.locator('[data-slot="member"]').click();
  await page.locator('[data-slot="menu"] [data-view="availability"]').click();
  const form = page.locator('form[data-act="availability-add"]');
  await form.locator('input[name="date"]').fill('2026-07-18');
  await form.locator('button[type="submit"]').click();
  // A leader changes her profile meanwhile.
  const path = 'departments/Usher Sisters/members/member:S. Naomi';
  await setDoc(page, path, Object.assign({}, await fakeDoc(page, path), { revision: 4, updatedAt: Date.parse('2026-07-07T09:00:00Z') }));
  await page.locator('[data-act="availability-save"]').click();
  await banner(page, 'Your availability changed on another device, or your leader changed it.');
  await page.locator('[data-act="availability-save"]:not([disabled])').click();
  await banner(page, 'Saved. Your leader was told you cannot make Usher');
  assert.ok((await fakeDoc(page, path)).availability.exceptions['2026-07-18']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the kind of worship is chosen from a list, with Other for a feast\'s own name', async () => {
  const { context, page, errors } = await as('B. Adam', { viewport: DESKTOP });
  await monthPlan(page);
  await page.locator('#view .plan-add summary').click();
  const form = page.locator('#view form[data-act="service-add"]');
  await form.locator('input[name="date"]').fill('2026-07-23');
  await form.locator('select[name="service"]').selectOption('Evening');
  await form.locator('select[name="worship"]').selectOption('__other');
  await form.locator('input[name="worship"]').fill('Feast of Trumpets');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => window.__fake.get('schedule/2026-07-23_evening'));
  assert.equal((await fakeDoc(page, 'schedule/2026-07-23_evening')).worship, 'Feast of Trumpets');
  // The details offer the same list, with the feast's name kept.
  const select = page.locator('#view .plan-detail select[data-field="worship"]');
  assert.equal(await select.inputValue(), 'Feast of Trumpets');
  await select.selectOption('Sabbath Day');
  await page.waitForFunction(() => window.__fake.get('schedule/2026-07-23_evening').worship === 'Sabbath Day');
  assert.deepEqual(errors, []);
  await context.close();
});

test('an administrator views the app as a leader and as a member, with changes off, then comes back', async () => {
  const { page, context } = await as('B. Adam', { viewport: DESKTOP });
  const menuItem = page.locator('[data-slot="view-as"]');
  await page.locator('[data-slot="member"]').click();
  await menuItem.click();
  await page.locator('#view select[name="member"]').selectOption('S. Grace');
  await page.locator('#view form[data-act="view-as-start"] button[type="submit"]').click();
  await banner(page, 'Viewing as S. Grace (department leader). Changes are off.');
  await tab(page, 'manage');
  const sections = async () => page.locator('#view .sections button').evaluateAll(buttons => buttons.map(button => button.dataset.section));
  assert.deepEqual(await sections(), ['services', 'requests', 'planning', 'departments', 'data'], 'the leader\'s sections, no admin ones');
  await section(page, 'manage-section', 'data');
  assert.deepEqual(await page.locator('#view .card button').allTextContents(), ['Import now', 'Check the Sheet']);
  await page.locator('#view [data-act="sheet-import"]').click();
  await banner(page, 'Changes are off.');
  assert.equal((await calls(page, 'syncSheetNow')).length, 0, 'nothing reaches the server while viewing');

  await page.locator('#banners [data-act="view-as-stop"]').click();
  await tab(page, 'manage');
  assert.ok((await sections()).includes('features'), 'back to the administrator\'s own Manage');
  assert.equal(await page.locator('#banners [data-banner="view-as"]').count(), 0);

  await page.locator('[data-slot="member"]').click();
  await menuItem.click();
  await page.locator('#view select[name="member"]').selectOption('B. Amos');
  await page.locator('#view form[data-act="view-as-start"] button[type="submit"]').click();
  await banner(page, 'Viewing as B. Amos (member).');
  assert.equal(await page.locator('.tabs [data-tab="manage"]').isVisible(), false, 'a member has no Manage');
  assert.equal(await page.locator('[data-slot="person"]').first().textContent(), 'B. Amos');
  await context.close();
});

test('View as is offered to administrators only', async () => {
  const { page, context } = await as('S. Grace');
  await page.locator('[data-slot="member"]').click();
  assert.equal(await page.locator('[data-slot="view-as"]').isVisible(), false);
  await context.close();
});
