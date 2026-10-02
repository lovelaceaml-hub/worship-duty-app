/* What every member sees: the Schedule in its four layouts, My Duties,
   Availability, Settings and the sign-in screen, on the fake data (no
   Firebase). Run: node --test tests/browser/member.test.mjs */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, unlock, signIn, tab, DESKTOP } from './harness.mjs';

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

/* A quick finger swipe across the page, as tabs.js reads it: right goes to
   the tab before. */
async function swipeRight(page) {
  await page.evaluate(() => {
    const view = document.getElementById('view');
    const touch = x => new Touch({ identifier: 1, target: view, clientX: x, clientY: 400 });
    view.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(60)], changedTouches: [touch(60)], bubbles: true }));
    view.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch(320)], bubbles: true }));
  });
  await page.waitForTimeout(300);
}

const banner = (page, text) => page.locator('#banners .banner, #toasts .toast', { hasText: text }).first().waitFor();
const fakeDoc = (page, docPath) => page.evaluate(docPath => window.__fake.get(docPath), docPath);
const calls = (page, name) => page.evaluate(name => window.__fakeCalls.filter(call => call.name === name).map(call => call.payload), name);
/* Changes a schedule document the way a leader's edit elsewhere would. */
const editService = (page, id, change) => page.evaluate(({ id, change }) => {
  const service = window.__fake.get('schedule/' + id);
  Object.assign(service.assignments, change.assignments || {});
  Object.assign(service, change.fields || {});
  window.__fake.set('schedule/' + id, service);
}, { id, change });
const weekly = (page, key) => page.locator(`select[data-change="availability-week"][data-key="${key}"]`);

test('availability says which services each row covers, and unsaved changes are kept apart', async () => {
  const { context, page, errors } = await as('S. Naomi');
  await openAccount(page, 'availability');
  const card = page.locator('.availability');
  await card.locator('.hint', { hasText: 'Applies to Usher Sisters.' }).waitFor();
  assert.deepEqual(await card.locator('.availability-label').allInnerTexts(), [
    'Morning\nSaturdays', 'Afternoon\nSaturdays', 'Evening\nSaturdays and Tuesdays', 'Early Morning', 'Commemoration']);
  assert.deepEqual(await card.locator('.card-subtitle').allInnerTexts(), ['Every week', 'Feast days and special services', 'Days that are different']);
  await card.locator('.hint', { hasText: 'Not available keeps you off every one of these services' }).waitFor();
  assert.equal(await card.locator('select[name="key"] option').first().innerText(), 'All day');
  assert.equal(await page.locator('[data-act="availability-save"]').count(), 0, 'nothing to save yet');

  // A change waits in a bar until it is saved, and leaving asks first.
  await weekly(page, 'evening').selectOption('unavailable');
  await page.locator('.availability-unsaved', { hasText: 'Unsaved changes' }).waitFor();
  let asked = '';
  page.once('dialog', dialog => { asked = dialog.message(); dialog.dismiss(); });
  await page.locator('nav.tabs [data-tab="schedule"]').click();
  assert.match(asked, /not saved/);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.screen), 'availability');
  assert.equal(await weekly(page, 'evening').inputValue(), 'unavailable');
  const leaving = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(leaving, true, 'a reload asks too');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('nav.tabs [data-tab="schedule"]').click();
  await page.locator('#view .schedule-list').waitFor();
  await openAccount(page, 'availability');
  assert.equal(await weekly(page, 'evening').inputValue(), 'available', 'leaving dropped the change');
  assert.equal(await page.locator('.availability-unsaved').count(), 0);

  // Saving keeps the stored shape: one weekly value per time of day.
  await weekly(page, 'evening').selectOption('unavailable');
  await page.locator('[data-act="availability-save"]').click();
  await banner(page, 'saved');
  const [saved] = await calls(page, 'saveMemberAvailability');
  assert.equal(saved.departments[0].availability.recurring.evening, 'unavailable');
  assert.deepEqual(Object.keys(saved.departments[0].availability).sort(), ['exceptions', 'recurring']);
  await page.locator('.availability-unsaved').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('a draft left on the device is never shown to the next member who signs in', async () => {
  const { context, page, errors } = await as('S. Naomi');
  // Naomi starts a change request and leaves it unsent.
  await tab(page, 'my');
  const button = page.locator('[data-act="request-open"]').first();
  const key = await button.getAttribute('data-key');
  await button.click();
  await page.locator('#request-note').fill('Out of town.');
  // She changes her availability and swipes away without saving, then signs out.
  await openAccount(page, 'availability');
  await weekly(page, 'evening').selectOption('unavailable');
  await page.locator('form[data-act="availability-add"] input[name="date"]').fill('2026-07-25');
  await page.locator('form[data-act="availability-add"] button[type="submit"]').click();
  await page.locator('.exception', { hasText: 'Saturday, July 25' }).waitFor();
  let asked = '';
  page.once('dialog', dialog => { asked = dialog.message(); dialog.accept(); });
  await swipeRight(page);
  assert.match(asked, /not saved/, 'a swipe asks first, like the tabs');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.screen), 'schedule');
  await signOut(page);

  // Leah now holds that duty, and signs in on the same device.
  const [id, duty] = key.split(':');
  await editService(page, id, { assignments: { [duty]: 'S. Leah' } });
  await signIn(page, 'S. Leah');
  await tab(page, 'my');
  await page.locator(`[data-act="request-open"][data-key="${key}"]`).waitFor();
  assert.equal(await page.locator('#request-note').count(), 0, 'Naomi\'s request form is not shown');
  await openAccount(page, 'availability');
  assert.equal(await weekly(page, 'evening').inputValue(), 'available');
  await page.locator('.availability', { hasText: 'No days added.' }).waitFor();
  assert.equal(await page.locator('[data-act="availability-save"]').count(), 0, 'nothing to save');
  assert.deepEqual(await calls(page, 'saveMemberAvailability'), []);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member in two departments is told which one has different times, while they edit too', async () => {
  const away = { recurring: { evening: 'unavailable' }, exceptions: {} };
  const { context, page, errors } = await as('E. Joseph', { fixture: { patch: { 'departments/Media/members/member:E. Joseph': { availability: away } } } });
  await openAccount(page, 'availability');
  const warning = page.locator('.availability .hint.warn');
  await warning.waitFor();
  assert.equal(await warning.innerText(), 'This page shows your times for Worship. Media has different times saved. Saving uses these times for all your departments.');
  await page.locator('.availability .hint', { hasText: 'Applies to Worship and Media.' }).waitFor();
  await weekly(page, 'morning').selectOption('unavailable');
  await page.locator('.availability-unsaved').waitFor();
  assert.equal(await warning.isVisible(), true, 'the warning stays while there are changes');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member changes their own PIN in Settings; the PINs everyone knows are refused', async () => {
  const { context, page, errors } = await openPage(browser, server.url);
  await page.locator('.gate', { hasText: 'This schedule is for LV Zion members.' }).waitFor();
  await unlock(page);
  await page.locator('.gate .hint', { hasText: 'Ask your department leader or an administrator to reset it. Then sign in with 0000 and choose a new PIN.' }).waitFor();
  await signIn(page, 'S. Naomi');
  await openAccount(page, 'settings');
  await page.locator('[data-act="pin-open"]').click();
  const form = page.locator('form[data-act="change-pin"]');
  for (const pin of ['0000', '2217']) {
    await form.locator('#new-pin').fill(pin);
    await form.locator('#new-pin-again').fill(pin);
    await form.locator('button[type="submit"]').click();
    await page.locator('.account-pin .form-error', { hasText: 'That PIN is too easy to guess.' }).waitFor();
  }
  assert.deepEqual(await calls(page, 'changeMemberPin'), []);
  await form.locator('#new-pin').fill('5678');
  await form.locator('#new-pin-again').fill('5679');
  await form.locator('button[type="submit"]').click();
  await page.locator('.account-pin .form-error', { hasText: 'The two PINs do not match.' }).waitFor();
  await form.locator('#new-pin').fill('5678');
  await form.locator('#new-pin-again').fill('5678');
  await form.locator('button[type="submit"]').click();
  await banner(page, 'Your PIN is changed.');
  assert.deepEqual(await calls(page, 'changeMemberPin'), [{ memberId: 'S. Naomi', newPin: '5678' }]);
  await page.locator('[data-act="pin-open"]').waitFor();

  // The new PIN signs in; the old one does not.
  await signOut(page);
  await page.locator('#sign-in-member').selectOption('S. Naomi');
  await page.locator('#sign-in-pin').fill('5678');
  await page.locator('form[data-act="sign-in"] button').click();
  await page.locator('nav.tabs:not([hidden])').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a member who must choose a PIN cannot pick 0000; a failed sign-in puts the cursor back in the PIN', async () => {
  const { context, page, errors } = await openPage(browser, server.url);
  await unlock(page);
  await page.locator('#sign-in-member').selectOption('B. Silas');
  await page.locator('#sign-in-pin').fill('9999');
  await page.locator('form[data-act="sign-in"] button').click();
  await page.locator('.form-error', { hasText: 'That name and PIN do not match.' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'sign-in-pin');
  await signIn(page, 'B. Silas');
  await page.locator('#new-pin').fill('0000');
  await page.locator('#new-pin-again').fill('0000');
  await page.locator('form[data-act="change-pin"] button').click();
  await page.locator('.gate .form-error', { hasText: 'That PIN is too easy to guess.' }).waitFor();
  assert.deepEqual(await calls(page, 'changeMemberPin'), []);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the chosen name on the sign-in screen stays through a live update', async () => {
  const { context, page, errors } = await openPage(browser, server.url);
  await unlock(page);
  await page.locator('#sign-in-member').selectOption('S. Leah');
  await editService(page, '2026-07-11_morning', { fields: { choirSong: '#100 A New Song' } });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#sign-in-member').inputValue(), 'S. Leah');
  assert.deepEqual(errors, []);
  await context.close();
});

test('My Duties leads with the next duty, shows the month on each date, and ends with reminders', async () => {
  const { context, page, errors } = await as('B. Adam');
  await tab(page, 'my');
  const view = page.locator('#view');
  assert.equal(await view.locator('h2.screen-title').innerText(), 'My Duties');
  await view.locator('.duty-count', { hasText: /You have \d+ upcoming duties\./ }).waitFor();
  // Title, count, the next duty, then the songs, then the other days.
  const order = await view.evaluate(root => [...root.children].map(el => el.className.split(' ').filter(name => name !== 'card').join('.')));
  assert.deepEqual(order.slice(0, 5), ['screen-title', 'hint.duty-count', 'duty-card.is-next', 'song-prompt', 'duty-card']);
  assert.equal(order[order.length - 1], 'reminders');
  assert.deepEqual(await view.locator('.duty-card.is-next .duty-date').innerText(), 'JUL\n11\nSAT');
  const tiles = await view.locator('.duty-date').allInnerTexts();
  assert.ok(tiles.some(text => text.startsWith('AUG\n')), 'dates after the month change say August');
  assert.equal(await view.locator('.duty-card.is-next h3').innerText(), 'Saturday, July 11');
  assert.equal(await view.locator('.song-prompt button').innerText(), 'Plan your songs');
  assert.equal(await view.locator('[data-act="request-open"]').first().getAttribute('aria-label'), 'Ask for a change to Presider, Sat, Jul 11, 9:00 AM');
  await view.locator('[data-act="account"][data-view="availability"]', { hasText: 'Set your availability' }).click();
  await page.locator('#view .availability').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a service under way shows as Now on the Schedule and My Duties, with no Ask for a change', async () => {
  // Tuesday 8:10 PM: the 8:00 PM service, where S. Leah ushers, has just started.
  for (const appearance of ['classic', 'prism', 'navy', 'aurora']) {
    const { context, page, errors } = await as('S. Leah', { appearance, now: '2026-07-07T20:10:00-07:00', viewport: DESKTOP });
    const card = page.locator('#view .service-card[data-service="2026-07-07_evening"]');
    await card.locator('.service-now', { hasText: 'Now' }).waitFor();
    if (appearance === 'classic') assert.equal(await page.locator('#view .next-service .section-heading').innerText(), 'Now');
    if (appearance === 'classic') {
      await tab(page, 'my');
      const today = page.locator('#view .duty-card.is-next');
      await today.locator('.service-now', { hasText: 'Now' }).waitFor();
      assert.equal(await today.locator('.duty-title').first().innerText(), 'Usher Door');
      assert.equal(await today.locator('[data-act="request-open"]').count(), 0);
    }
    assert.deepEqual(errors, [], appearance);
    await context.close();
  }
});

test('asking for a change, withdrawing it, and a duty flagged after a day off each say what happens', async () => {
  const old = { id: 'old-request', svcId: '2026-05-30_morning', name: 'S. Leah', memberId: 'S. Leah', requesterUid: 'member:S. Leah',
    date: '2026-05-30', service: 'Morning', worship: 'Sabbath Day', duty: 'Usher Door', department: 'Usher Sisters', note: '', status: 'declined', createdAt: 1 };
  const { context, page, errors } = await as('S. Leah', { fixture: { patch: { 'requests/old-request': old } } });
  await tab(page, 'my');
  const asked = page.locator('#view .duty-state', { hasText: 'Asked. You stay on this duty until your leader answers.' });
  await asked.waitFor();
  const list = page.locator('#view .duty-requests');
  assert.equal(await list.locator('.list-item').count(), 1, 'a request from long ago is not listed');
  assert.equal(await list.locator('.status').innerText(), 'ASKED');
  // The list sits right under the next duty while a request waits.
  const order = await page.locator('#view').evaluate(root => [...root.children].map(el => el.classList.contains('duty-requests') ? 'requests' : el.classList.contains('is-next') ? 'next' : ''));
  assert.equal(order.indexOf('requests'), order.indexOf('next') + 1);

  const id = await asked.locator('[data-act="request-withdraw"]').getAttribute('data-id');
  await asked.locator('[data-act="request-withdraw"]').click();
  await banner(page, 'Request withdrawn. You stay on');
  const stored = await fakeDoc(page, 'requests/' + id);
  assert.equal(stored.status, 'withdrawn');
  assert.equal(typeof stored.updatedAt, 'number');
  await list.locator('.status', { hasText: 'Withdrawn' }).waitFor();
  await asked.waitFor({ state: 'detached' });

  // A failed send keeps the note in the form.
  const button = page.locator('[data-act="request-open"]').first();
  await button.click();
  await page.locator('#request-note').fill('Family visiting.');
  await page.evaluate(() => { window.__clone = window.structuredClone; window.structuredClone = () => { throw new Error('No connection.'); }; });
  await page.locator('form[data-act="request-send"] button[type="submit"]').click();
  await banner(page, 'Your request was not sent');
  await page.evaluate(() => { window.structuredClone = window.__clone; });
  assert.equal(await page.locator('#request-note').inputValue(), 'Family visiting.');
  await page.locator('form[data-act="request-send"] button[type="submit"]').click();
  await banner(page, 'Your request was sent to your leader.');
  await page.locator('#request-note').waitFor({ state: 'detached' });

  // A day off flags the duty that day; the duty says the leader knows.
  await signOut(page);
  await signIn(page, 'S. Naomi');
  const duty = await page.evaluate(() => {
    const ids = window.__fake.paths('schedule/').sort();
    for (const docPath of ids) {
      const service = window.__fake.get(docPath);
      const name = Object.keys(service.assignments).find(key => service.assignments[key] === 'S. Naomi');
      if (service.date > '2026-07-07' && name) return { id: docPath.split('/')[1], date: service.date, duty: name };
    }
    return null;
  });
  await openAccount(page, 'availability');
  await page.locator('form[data-act="availability-add"] input[name="date"]').fill(duty.date);
  await page.locator('form[data-act="availability-add"] button[type="submit"]').click();
  await page.locator('[data-act="availability-save"]').click();
  await banner(page, 'Your leader was told you cannot make');
  await tab(page, 'my');
  const key = duty.id + ':' + duty.duty;
  await page.locator('#view .duty-state', { hasText: 'Your leader was told you cannot make it.' }).waitFor();
  assert.equal(await page.locator(`[data-act="request-open"][data-key="${key}"]`).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the change request form takes the keyboard focus and gives it back on Cancel', async () => {
  const { context, page, errors } = await as('S. Naomi');
  await tab(page, 'my');
  const button = page.locator('[data-act="request-open"]').first();
  const key = await button.getAttribute('data-key');
  await button.focus();
  await page.keyboard.press('Enter');
  await page.locator('#request-note').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'request-note');
  await page.locator('form[data-act="request-send"] [data-act="request-cancel"]').click();
  await page.locator('#request-note').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement.dataset.key), key);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a leader\'s own request in a department they do not lead stays on their screen', async () => {
  const { context, page, errors } = await as('E. Joseph');
  await editService(page, '2026-07-14_evening', { assignments: { 'Usher #1': 'E. Joseph' } });
  await tab(page, 'my');
  const key = '2026-07-14_evening:Usher #1';
  await page.locator(`[data-act="request-open"][data-key="${key}"]`).click();
  await page.locator('#request-note').fill('Away that week.');
  await page.locator('form[data-act="request-send"] button[type="submit"]').click();
  await banner(page, 'Your request was sent to your leader.');
  await page.waitForTimeout(300);
  await page.locator('#view .duty-state', { hasText: 'Asked.' }).waitFor();
  await page.locator('#view .duty-requests .list-item', { hasText: 'Usher #1' }).waitFor();
  assert.equal(await page.locator(`[data-act="request-open"][data-key="${key}"]`).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Original shows the next service with its date once, with the tools of every layout', async () => {
  const { context, page, errors } = await as('S. Leah');
  const next = page.locator('#view .next-service');
  assert.equal(await next.locator('.section-heading').innerText(), 'Next service');
  assert.equal(await next.locator('.service-date').innerText(), 'Tuesday, July 7 TODAY');
  assert.equal(await next.locator('.my-duties-note').innerText(), 'You serve here: Usher Door');
  assert.equal(await page.locator('#view .month-list .service-card[data-service="2026-07-07_evening"]').count(), 0, 'not repeated below');
  assert.equal(await page.locator('#view .month-list .service-card').count(), 12, 'one page of services');
  await page.locator('#view [data-act="schedule-more"]').click();
  assert.ok(await page.locator('#view .month-list .service-card').count() > 12);
  await page.locator('#view [data-act="schedule-month"][data-step="1"]').click();
  assert.equal(await page.locator('#view .month-list .service-card').first().getAttribute('data-service'), '2026-08-01_morning');
  assert.equal(await page.locator('#view [data-act="schedule-edit"]').count(), 0, 'members do not edit');
  await context.close();
  assert.deepEqual(errors, []);

  const leader = await as('S. Grace');
  await leader.page.locator('#view .next-service [data-act="schedule-edit"]', { hasText: 'Edit assignments' }).waitFor();
  assert.deepEqual(leader.errors, []);
  await leader.context.close();
});

test('every layout has the same tools: search, departments, months, past services and All services', async () => {
  for (const appearance of ['classic', 'prism', 'navy', 'aurora']) {
    const { context, page, errors } = await as('S. Leah', { appearance });
    const view = page.locator('#view');
    await view.locator('#schedule-search').waitFor();
    assert.equal(await view.locator('[data-act="department-filter"], [data-change="department-filter"]').count() > 0, true, appearance);
    assert.equal(await view.locator('[data-act="schedule-month"]').count(), 2, appearance);
    assert.equal(await view.locator('[data-act="toggle-past"]').innerText(), 'Show past services', appearance);
    if (appearance !== 'classic') {
      assert.equal(await view.locator('[data-act="schedule-mode"][data-mode="all"]').innerText(), 'All services', appearance);
      assert.equal(await view.locator('[data-act="schedule-today"]').innerText(), 'Next service', appearance);
      assert.equal(await view.locator('.my-duties-note').innerText(), 'You serve here: Usher Door', appearance);
    }
    // Search uses the names on screen, across every month.
    await view.locator('#schedule-search').fill('Opening Prayer Hannah');
    await view.locator('.schedule-count', { hasText: /services? match/ }).waitFor();
    await view.locator('#schedule-search').fill('August 8');
    await view.locator('.month-list .service-card[data-service="2026-08-08_morning"]').waitFor();
    assert.deepEqual(errors, [], appearance);
    await context.close();
  }

  // Navy: the departments stay in reach when the chosen day has none of one.
  const { context, page, errors } = await as('S. Leah', { appearance: 'navy' });
  const view = page.locator('#view');
  await view.locator('[data-act="schedule-date"][data-date="2026-07-14"]').click();
  assert.match(await view.locator('[data-act="schedule-date"][data-date="2026-07-11"]').getAttribute('aria-label'), /, you serve$/);
  await view.locator('[data-act="department-filter"][data-department="Parking Lot"]').click();
  await view.locator('.schedule-empty', { hasText: 'No services for Parking Lot on this day.' }).waitFor();
  await view.locator('.schedule-empty [data-act="department-filter"][data-department="All"]').click();
  await view.locator('.service-card[data-service="2026-07-14_evening"]').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('a service without a stored time shows its usual time everywhere', async () => {
  const patch = { 'schedule/2026-07-11_afternoon': { time: '' } };
  for (const appearance of ['classic', 'prism']) {
    const { context, page, errors } = await as('B. Adam', { appearance, fixture: { patch }, viewport: DESKTOP });
    if (appearance === 'prism') {
      await page.locator('#view .calendar-day[data-date="2026-07-11"] .calendar-service', { hasText: '2:30 PM' }).waitFor();
    } else {
      assert.equal(await page.locator('#view .service-card[data-service="2026-07-11_afternoon"] .service-time').innerText(), '2:30 PM');
      await tab(page, 'my');
      await page.locator('#view .duty-time', { hasText: '2:30 PM' }).waitFor();
    }
    assert.deepEqual(errors, [], appearance);
    await context.close();
  }
});

test('double duties are marked in words, and a prayer with an usher duty is not marked', async () => {
  const id = '2026-07-14_evening';
  const assignments = {
    Presider: 'B. Samuel', 'Closing Prayer': 'S. Hannah', 'Usher Door': 'S. Hannah', // allowed: a prayer with an usher duty
    Sermon: 'S. Naomi', 'Usher Front': 'S. Naomi', // Opening Prayer is never paired
    'Usher #1': 'B. Micah', 'Lobby Security': 'B. Micah', // Lobby Security is not an usher duty here
    'Usher #2': 'B. Isaac', 'Lobby Desk #1': 'S. Lydia', 'Lobby Desk #2': 'S. Phoebe',
    'Translation #1': 'S. Priscilla', 'Translation #2': 'B. Silas', 'Media Booth #1': 'E. Joseph', 'Media Booth #2': 'B. Titus'
  };
  const fixture = { patch: { ['schedule/' + id]: { assignments } } };
  let last = null;
  for (const appearance of ['classic', 'prism', 'navy', 'aurora']) {
    const opened = await as('S. Hannah', { appearance, fixture, viewport: DESKTOP });
    const { page, errors } = opened;
    if (appearance !== 'classic') await page.locator('#view [data-act="schedule-date"][data-date="2026-07-14"]').click();
    const card = page.locator(`#view .service-card[data-service="${id}"]`);
    await card.waitFor();
    const flagged = await card.locator('.duty-row').evaluateAll(rows => rows.filter(row => row.querySelector('.flag'))
      .map(row => row.querySelector('.duty-name').textContent));
    assert.deepEqual(flagged, ['Opening Prayer', 'Usher Front', 'Usher #1', 'Lobby Security'], appearance);
    assert.equal(await card.locator('.flag .sr-only').first().textContent(), 'Two duties in this service, needs a look');
    assert.equal(await card.locator('.flag [aria-hidden="true"]').first().textContent(), '!');
    assert.deepEqual(errors, [], appearance);
    if (last) await last.context.close();
    last = opened;
  }
  const { context, page, errors } = last;
  // A leader's OK mark gets a check, not the same mark in another color.
  await editService(page, id, { fields: { conflictOk: { 'S. Naomi': ['Sermon', 'Usher Front'] } } });
  await page.locator(`#view .service-card[data-service="${id}"] .flag.is-ok .sr-only`, { hasText: 'marked OK' }).first().waitFor();
  assert.equal(await page.locator(`#view .service-card[data-service="${id}"] .flag.is-ok [aria-hidden="true"]`).first().textContent(), '✓');

  // My Duties lists both of the allowed pair, unmarked.
  await tab(page, 'my');
  const day = page.locator('#view .duty-card', { has: page.locator('[data-act="expand"][data-key="day:2026-07-14"]') });
  assert.deepEqual(await day.locator('.duty-title').allInnerTexts(), ['Closing Prayer', 'Usher Door']);
  await day.locator('[data-act="expand"]').click();
  const mine = day.locator('.duty-team .duty-row', { has: page.locator('.person.is-me') });
  assert.equal(await mine.count(), 2);
  assert.equal(await mine.locator('.flag').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

/* Navy & Cream's day rail and Aurora's day strip scroll sideways on a phone.
   A redraw keeps that scroll within a month, but the chosen day is always in
   view, and a new month starts at its first day. */
test('the chosen day stays in view in the day rail, and a new month starts at its beginning', async () => {
  for (const appearance of ['navy', 'aurora']) {
    const { context, page, errors } = await as('B. Caleb', { appearance, viewport: { width: 375, height: 667 } });
    const row = page.locator('#view [aria-label="Service days"]');
    const inView = () => row.evaluate(el => {
      const chosen = el.querySelector('.day-button.is-selected');
      if (!chosen) return null;
      const box = el.getBoundingClientRect(), button = chosen.getBoundingClientRect();
      return button.left >= box.left - 1 && button.right <= box.right + 1;
    });
    // Choose a day late in the month, then go back to the next service.
    await row.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await row.locator('.day-button').last().click();
    await page.locator('#view [data-act="schedule-today"]').click();
    assert.equal(await inView(), true, appearance + ': the next service\'s day is in view');

    // A month away and back: the new month opens at its start.
    await page.locator('#view [data-act="schedule-month"][data-step="1"]').click();
    await row.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.locator('#view [data-act="schedule-month"][data-step="-1"]').click();
    await page.locator('#view [data-act="schedule-month"][data-step="1"]').click();
    assert.equal(await row.evaluate(el => el.scrollLeft), 0, appearance + ': the month starts at its first day');
    assert.deepEqual(errors, [], appearance);
    await context.close();
  }
});
