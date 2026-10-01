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
    ['Month plan', 'Requests', 'Checks', 'Departments']);
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
  await page.locator('#view .plan-status', { hasText: 'No one is on the Offering list yet' }).waitFor();
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

test('a member who can no longer make a duty can be kept on it', async () => {
  const { context, page, errors } = await as('S. Grace', { viewport: DESKTOP });
  const id = '2026-07-11_morning';
  const service = await fakeDoc(page, 'schedule/' + id);
  const holder = service.assignments['Usher Door'];
  await setDoc(page, 'schedule/' + id, Object.assign({}, service, { needsReplacement: { 'Usher Door': { memberName: holder, reason: 'unavailable' } } }));
  await monthPlan(page);
  await page.locator(`#view [data-act="plan-open"][data-service="${id}"]`).click();
  const form = page.locator('#view form[data-act="replace-duty"]');
  assert.equal(await form.locator('button[type="submit"]').isDisabled(), true, 'nothing chosen yet');
  await form.locator('select').selectOption('__keep');
  await form.locator('button[type="submit"]', { hasText: 'Keep ' + holder }).click();
  await banner(page, holder + ' stays on Usher Door.');
  const [payload] = await calls(page, 'resolveDutyAttention');
  assert.deepEqual([payload.decision, payload.duty, payload.requestId], ['keep', 'Usher Door', undefined]);
  const after = await fakeDoc(page, 'schedule/' + id);
  assert.deepEqual([after.assignments['Usher Door'], after.needsReplacement['Usher Door']], [holder, undefined]);
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

test('a leader of two departments has no "All departments" link, resets only a member\'s PIN, and is told the temporary PIN', async () => {
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
  accept(page);
  await page.locator('#view [data-act="department-reset-pin"]').click();
  await banner(page, 'B. Caleb’s PIN was reset. Tell them to sign in with 0000 and choose a new PIN.');
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
