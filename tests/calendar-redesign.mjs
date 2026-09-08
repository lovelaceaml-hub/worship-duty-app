import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const canonicalRequire = createRequire('/Users/anthony/Projects/worship-duty-app/package.json');
const { chromium } = canonicalRequire('playwright');
const { AxeBuilder } = canonicalRequire('@axe-core/playwright');
const { createPreviewServer } = canonicalRequire(
  '/Users/anthony/Projects/worship-duty-app/scripts/real-preview.cjs'
);

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const canonicalPrototypeRoot = path.resolve(testDirectory, '../docs/design/prototype/open-bulletin');
const prototypeRoot = process.env.WORSHIP_PROTOTYPE_ROOT || canonicalPrototypeRoot;
const port = Number(process.env.WORSHIP_PREVIEW_TEST_PORT || 8120);
const baseURL = `http://127.0.0.1:${port}`;
const baseOrigin = new URL(baseURL).origin;

const members = ['Jordan Fixture', 'Casey Example', 'Robin Sample', 'Taylor Test'];

const categories = [
  { name: 'Worship', color: '#245b75', duties: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer', 'Choir'] },
  { name: 'Music', color: '#8a5a2b', duties: ['Choir Song', 'Preparation Song', 'Glory Song', 'Thanks Song'] },
  { name: 'Media', color: '#396b4b', duties: ['Media Booth #1', 'Media Booth #2'] },
  { name: 'Other', color: '#6b6076', duties: ['Parking #5'] }
];

const services = [
  {
    id: 'svc-history',
    date: '2026-11-29',
    worshipType: 'Sabbath Day',
    serviceLabel: 'Morning',
    time: '09:00',
    assignments: { Presider: 'Jordan Fixture', Sermon: 'Casey Example' }
  },
  {
    id: 'svc-jan-worship',
    date: '2027-01-03',
    worshipType: 'Sabbath Day',
    serviceLabel: 'Morning',
    time: '09:00',
    choirSong: 'Fictional Choir Anthem',
    assignments: {
      Presider: 'Jordan Fixture',
      Sermon: 'Casey Example',
      'Prayer of Thanks': 'Robin Sample',
      'Closing Prayer': 'Casey Example',
      Choir: 'Taylor Test',
      'Media Booth #1': 'Robin Sample',
      'Parking #5': 'Casey Example'
    }
  },
  {
    id: 'svc-feast',
    date: '2027-01-10',
    worshipType: 'Feast of Trumpets',
    serviceLabel: 'Feast service',
    time: '09:00',
    assignments: { Presider: 'Jordan Fixture', 'Prayer of Thanks': 'Jordan Fixture' }
  },
  {
    id: 'svc-worship',
    date: '2027-01-10',
    worshipType: 'Sabbath Day',
    serviceLabel: 'Afternoon',
    time: '13:00',
    assignments: { Sermon: 'Jordan Fixture', Choir: 'Taylor Test', 'Media Booth #2': 'Robin Sample' }
  },
  {
    id: 'svc-missing-plan',
    date: '2027-01-13',
    worshipType: 'Third Day',
    serviceLabel: 'Evening',
    time: '19:00',
    assignments: { Presider: 'Casey Example' }
  },
  {
    id: 'standalone-plan',
    date: '2027-01-05',
    worshipType: 'Third Day',
    serviceLabel: 'Standalone plan',
    time: '18:30',
    standalone: true,
    assignments: {}
  },
  {
    id: 'svc-later-presider',
    date: '2027-01-17',
    worshipType: 'Sabbath Day',
    serviceLabel: 'Morning',
    time: '09:00',
    assignments: { Presider: 'Taylor Test' }
  }
];

const songs = [
  { id: 'song-prep-1', number: 'F-01', title: 'Fictional Preparation Song', category: 'Faith', durationSec: 180 },
  { id: 'song-prep-2', number: 'F-02', title: 'Fictional Second Preparation Song', category: 'Hope', durationSec: 150 },
  { id: 'song-glory', number: 'F-03', title: 'Fictional Glory Song', category: 'Praise', durationSec: 210 },
  { id: 'song-thanks', number: 'F-04', title: 'Fictional Thanks Song', category: 'Gratitude', durationSec: 195 },
  { id: 'song-glory-alt', number: 'F-06', title: 'Fictional Alternate Glory Song', category: 'Praise', durationSec: 165 },
  { id: 'song-thanks-alt', number: 'F-07', title: 'Fictional Alternate Thanks Song', category: 'Gratitude', durationSec: 175 },
  { id: 'song-appendix', number: 'Appx. 3', title: 'Fictional Appendix Song', category: 'Appendix', durationSec: 120 },
  { id: 'song-extra', number: 'F-05', title: 'Fictional Search Result', category: 'Faith', durationSec: 135 }
];

const setlists = {
  'svc-history': {
    id: 'svc-history', date: '2026-11-29', worshipType: 'Sabbath Day', serviceLabel: 'Morning',
    time: '09:00', presider: 'Jordan Fixture', songs: ['song-prep-1', 'song-appendix'],
    glorySong: 'song-appendix', thanksSong: 'song-appendix', status: 'confirmed',
    confirmedAt: 1000, updatedAt: 900, history: []
  },
  'svc-jan-worship': {
    id: 'svc-jan-worship', date: '2027-01-03', worshipType: 'Sabbath Day', serviceLabel: 'Morning',
    time: '09:00', presider: 'Jordan Fixture', songs: ['song-prep-1', 'song-prep-2', 'song-appendix'],
    glorySong: 'song-glory', thanksSong: 'song-thanks',
    status: 'planned', confirmed: false, confirmedAt: null, updatedAt: 2000, history: []
  },
  'svc-feast': {
    id: 'svc-feast', date: '2027-01-10', worshipType: 'Feast of Trumpets', serviceLabel: 'Feast service',
    time: '09:00', presider: 'Jordan Fixture', songs: ['song-prep-2'],
    glorySong: 'song-glory', thanksSong: 'song-thanks', status: 'sung', confirmed: true, confirmedAt: 3001,
    updatedAt: 3000, history: []
  },
  'svc-worship': {
    id: 'svc-worship', date: '2027-01-10', worshipType: 'Sabbath Day', serviceLabel: 'Afternoon',
    time: '13:00', presider: 'Jordan Fixture', songs: ['song-prep-1'],
    glorySong: 'song-glory', thanksSong: 'song-thanks', status: 'changed', confirmed: false, confirmedAt: 3500,
    updatedAt: 4000, history: []
  },
  'standalone-plan': {
    id: 'standalone-plan', date: '2027-01-05', worshipType: 'Third Day', serviceLabel: 'Standalone plan',
    time: '18:30', presider: 'Casey Example', songs: ['song-extra'],
    glorySong: 'song-glory', thanksSong: 'song-thanks', status: 'planned', confirmed: false, confirmedAt: null,
    updatedAt: 5000, history: [], standalone: true
  },
  'svc-later-presider': {
    id: 'svc-later-presider', date: '2027-01-17', worshipType: 'Sabbath Day', serviceLabel: 'Morning',
    time: '09:00', presider: 'Taylor Test', songs: ['song-prep-1'],
    glorySong: 'song-glory', thanksSong: 'song-thanks', status: 'planned', confirmed: false, confirmedAt: null,
    updatedAt: 6000, history: []
  }
};

const departments = {
  Worship: ['Jordan Fixture', 'Casey Example', 'Robin Sample', 'Taylor Test'],
  Music: ['Taylor Test', 'Jordan Fixture'],
  Media: ['Robin Sample'],
  Other: ['Casey Example']
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePayload(readOnly) {
  return {
    readOnly,
    today: '2026-12-30',
    fetchedAt: '2026-09-08T16:00:00.000Z',
    source: readOnly ? 'Current Worship Service records' : 'Fictional test data',
    members: members.slice(),
    categories: clone(categories),
    departments: clone(departments),
    services: clone(services),
    setlists: clone(setlists),
    songs: clone(songs),
    songStats: {
      'song-prep-1': { songId: 'song-prep-1', timesSung: 2, sungCount: 2, lastSung: '2026-12-01', history: [] }
    },
    requests: [],
    features: {
      songPicker: true,
      whoElse: true,
      choirSong: true,
      changeRequests: true,
      pastServices: true,
      sheetSync: false,
      siteLock: false,
      editorLock: false
    }
  };
}

const realPayload = makePayload(true);
const fictionalPayload = makePayload(false);
let activePayload = realPayload;
let loadFailure = false;

const previewServer = createPreviewServer({
  port,
  prototypeRoot,
  loadData: async () => {
    if (loadFailure) throw new Error('fictional fixture load failure');
    return clone(activePayload);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function installRequestGuard(context) {
  const externalRequests = [];
  const writeRequests = [];
  const browserErrors = [];

  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== baseOrigin) externalRequests.push({ origin: url.origin, method: request.method() });
    if (request.method() !== 'GET') writeRequests.push({ url: request.url(), method: request.method() });
  });
  context.on('page', (page) => {
    page.on('pageerror', (error) => browserErrors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
  });
  context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === baseOrigin && request.method() === 'GET') {
      await route.continue();
      return;
    }
    await route.abort();
  });

  return { externalRequests, writeRequests, browserErrors };
}

async function openPage(browser, width, payload = realPayload, query = '?screen=home', options = {}) {
  activePayload = options.injectPayload ? realPayload : payload;
  loadFailure = Boolean(options.fail);
  const context = await browser.newContext({
    viewport: { width, height: width < 901 ? 932 : 1000 },
    reducedMotion: 'reduce'
  });
  const guard = installRequestGuard(context);
  if (options.injectPayload) {
    await context.addInitScript((injectedPayload) => {
      window.addEventListener('WorshipPrototypeReady', () => {
        window.WorshipPrototypeFixtures = injectedPayload;
      }, { once: true });
    }, clone(payload));
  }
  const page = await context.newPage();
  await page.goto(`${baseURL}/${query.replace(/^\?/, '?')}`, { waitUntil: 'domcontentloaded' });
  return { context, page, guard };
}

async function assertAxeClean(page, state) {
  const result = await new AxeBuilder({ page }).analyze();
  assert.equal(result.violations.length, 0, `${state} has accessibility violations: ${JSON.stringify(result.violations)}`);
}

async function assertGuardClean(guard, state, allowedBrowserErrors = []) {
  assert.deepEqual(guard.externalRequests, [], `${state} attempted an external request`);
  assert.deepEqual(guard.writeRequests, [], `${state} attempted a browser write`);
  const unexpectedBrowserErrors = guard.browserErrors.filter((error) => !allowedBrowserErrors.includes(error));
  assert.deepEqual(unexpectedBrowserErrors, [], `${state} emitted an unexpected browser error`);
}

function candidateLocator(page, candidate) {
  return typeof candidate === 'function' ? candidate(page) : page.locator(candidate);
}

async function firstVisible(page, candidates, label) {
  for (const candidate of candidates) {
    const locator = candidateLocator(page, candidate);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (await item.isVisible()) return item;
    }
  }
  assert.fail(`missing visible ${label}`);
}

async function clickControl(page, candidates, label) {
  const control = await firstVisible(page, candidates, label);
  await control.click();
  return control;
}

async function bodyText(page) {
  return page.locator('body').innerText();
}

async function waitForScreen(page, screen) {
  const root = await firstVisible(page, [`[data-prototype-screen="${screen}"]`], `${screen} screen`);
  await root.waitFor();
  return root;
}

const navLabels = {
  home: /home/i,
  duty: /my duties|duties/i,
  presider: /presider/i,
  manage: /manage/i
};

async function navigate(page, screen) {
  await clickControl(page, [
    `nav [data-nav="${screen}"]`,
    `[data-action="navigate-${screen}"]`,
    `[data-action="nav-${screen}"]`,
    (currentPage) => currentPage.getByRole('link', { name: navLabels[screen] }),
    (currentPage) => currentPage.getByRole('button', { name: navLabels[screen] })
  ], `${screen} navigation`);
  return waitForScreen(page, screen);
}

async function memberSelector(page) {
  return firstVisible(page, ['#header-member-select'], 'member selector');
}

async function chooseMember(page, name) {
  const selector = await memberSelector(page);
  await selector.focus();
  await selector.selectOption(name);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.waitForTimeout(0);
  return selector;
}

async function clearMember(page) {
  const selector = await memberSelector(page);
  const emptyValue = await selector.locator('option').evaluateAll((options) => {
    const option = options.find((item) => item.value === '' || /choose|select|no member|clear/i.test(item.textContent || ''));
    return option ? option.value : null;
  });
  assert.notEqual(emptyValue, null, 'member selector needs a clear or name-needed option');
  await selector.selectOption(emptyValue);
}

async function calendarControl(page, direction) {
  const action = direction === 'previous' ? 'calendar-prev' : 'calendar-next';
  return firstVisible(page, [`[data-action="${action}"]`], `${direction} month control`);
}

async function calendarDate(page, isoDate) {
  return firstVisible(page, [`[data-calendar-day="${isoDate}"]`], `calendar date ${isoDate}`);
}

async function assertMonthLabel(page, pattern) {
  const label = await firstVisible(page, ['[data-calendar-month]'], 'calendar month label');
  assert.match(await label.innerText(), pattern);
}

async function clearMonth(page) {
  return clickControl(page, ['[data-action="calendar-clear"]'], 'whole month clear control');
}

async function assertCalendarDateSelected(page, isoDate) {
  const date = await calendarDate(page, isoDate);
  const state = await date.evaluate((element) => ({
    ariaPressed: element.getAttribute('aria-pressed'),
    ariaCurrent: element.getAttribute('aria-current'),
    className: element.className
  }));
  assert.match(`${state.ariaPressed} ${state.ariaCurrent} ${state.className}`, /true|selected|active|current/i, `${isoDate} did not become selected`);
}

async function assertCalendarDateCleared(page, isoDate) {
  const date = await calendarDate(page, isoDate);
  const state = await date.evaluate((element) => ({
    ariaPressed: element.getAttribute('aria-pressed'),
    ariaCurrent: element.getAttribute('aria-current'),
    className: element.className
  }));
  assert.doesNotMatch(`${state.ariaPressed} ${state.className}`, /true|selected|active/i, `${isoDate} remained selected after whole-month clear`);
}

async function serviceCards(page) {
  return firstVisible(page, [
    '[data-service-card]',
    '[data-service-id]',
    '.service-card',
    '.duty-service-card'
  ], 'service cards');
}

async function serviceCardFor(page, serviceId) {
  return firstVisible(page, [`[data-service-card="${serviceId}"]`, `[data-service-summary][data-service-id="${serviceId}"]`], `service ${serviceId}`);
}

async function rowsWithin(container, label) {
  const rows = container.locator('[data-department-row]').filter({ visible: true });
  assert.ok(await rows.count(), `missing ${label} assignment rows`);
  return rows;
}

async function dateGroup(page, isoDate) {
  return firstVisible(page, [`[data-duty-date="${isoDate}"]`], `date group ${isoDate}`);
}

async function departmentControl(page, name) {
  const controls = {
    Home: '#home-department',
    'My Duties': '#duty-department',
    Manage: '#manage-department-choice'
  };
  return firstVisible(page, [
    controls[name] || '#home-department'
  ], `${name} department control`);
}

async function completeTeamControl(page, container = page) {
  return firstVisible(container, ['[data-action="open-duty-team"]'], 'complete team control');
}

async function allServicesFilter(page) {
  return firstVisible(page, ['#presider-filter'], 'All services filter');
}

async function selectOptionByText(select, pattern, label) {
  const options = await select.locator('option').evaluateAll((items) => items.map((item) => ({ value: item.value, text: item.textContent || '' })));
  const option = options.find((item) => pattern.test(item.text));
  assert.ok(option, `${label} option is missing`);
  await select.selectOption(option.value);
  return option.value;
}

async function serviceOption(select, serviceId, label) {
  const option = select.locator(`option[value="${serviceId}"]`);
  assert.equal(await option.count(), 1, `${label} option ${serviceId} is missing`);
  await select.selectOption(serviceId);
}

async function serviceIdOptions(select) {
  return select.locator('option').evaluateAll((items) => items.map((item) => item.value));
}

async function findEditableSongSelects(section) {
  const controls = section.locator('select, [role="combobox"]');
  const editable = [];
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (await control.isVisible() && await control.isEnabled()) editable.push(control);
  }
  return editable;
}

async function reorderPreparationControl(page) {
  return clickControl(page, [
    '[data-song-group="preparation"] [data-action="move-song"][data-direction="up"]:not([disabled])',
    '[data-song-group="preparation"] [data-action="move-song"][data-direction="down"]:not([disabled])'
  ], 'preparation reorder control');
}

async function presiderFilter(page) {
  return firstVisible(page, ['#presider-filter'], 'Presider service filter');
}

async function presiderService(page) {
  return firstVisible(page, ['#presider-service'], 'Presider service selector');
}

async function songSection(page, sectionName) {
  const key = sectionName.toLowerCase();
  return firstVisible(page, [
    `[data-song-group="${key}"]`
  ], `${sectionName} song section`);
}

async function songSelect(page, sectionName) {
  const section = await songSection(page, sectionName);
  const selects = section.locator('select, [role="combobox"]');
  for (let index = 0; index < await selects.count(); index += 1) {
    const select = selects.nth(index);
    if (await select.isVisible() && await select.isEnabled()) return select;
  }
  assert.fail(`missing editable ${sectionName} song dropdown`);
}

async function preparationRows(page) {
  const section = await songSection(page, 'Preparation');
  const rows = section.locator('.outline-row');
  assert.ok(await rows.count(), 'missing preparation song rows');
  return rows;
}

async function saveControl(page) {
  return firstVisible(page, ['[data-action="save-setlist"]'], 'save control');
}

async function addPreparationControl(page) {
  return clickControl(page, ['[data-action="add-song"][data-song="song-extra"]'], 'add preparation song control');
}

async function retryControl(page) {
  return firstVisible(page, ['[data-action="retry-save"]'], 'save retry control');
}

async function songLibraryControl(page, action) {
  return clickControl(page, [`[data-action="${action}-song-library"]`], `${action} song library control`);
}

test('calendar redesign journeys stay fictional, accessible, and read-only in real mode', async (t) => {
  await listen(previewServer);
  t.after(async () => close(previewServer));

  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());
  const runs = [];
  t.after(async () => {
    loadFailure = false;
    await Promise.all(runs.map((run) => run.context.close()));
  });

  async function newRun(width, payload = realPayload, query = '?screen=home', options = {}) {
    const run = await openPage(browser, width, payload, query, options);
    runs.push(run);
    await run.page.waitForLoadState('load');
    return run;
  }

  for (const width of [430, 1280]) {
    const run = await newRun(width);
    const { page } = run;
    await waitForScreen(page, 'home');

    const header = page.locator('header').first();
    assert.equal(await header.count(), 1, 'shared header is missing');
    assert.match(await header.innerText(), /\bL[ VZ]\b/i, 'shared header brand initials are missing or incorrect');
    assert.doesNotMatch(await header.innerText(), /[\u2020\u271d\u2626\u2628\u2720\u271e]/, 'header contains a religious glyph');
    assert.match(await bodyText(page), /select.*name|choose.*name|name.*needed/i, 'clear name-needed state is missing');

    await chooseMember(page, members[0]);
    assert.match(await bodyText(page), new RegExp(members[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(await bodyText(page), /view[ -]*only|read[ -]*only/i, 'real preview does not identify its view-only state');
    assert.equal(await page.locator('#header-member-select').evaluate((element) => document.activeElement === element), true, 'header name selection did not retain focus');
    await clearMember(page);
    assert.match(await bodyText(page), /choose your name|name needed|select.*name/i, 'clearing the member did not restore the name-needed state');
    await chooseMember(page, members[0]);
    assert.equal(await page.locator('#header-member-select').evaluate((element) => document.activeElement === element), true, 'header name reselection did not retain focus');

    const nextDuty = await firstVisible(page, [
      '[data-next-duty]',
      '.next-duty',
      '[data-section="next-duty"]',
      (currentPage) => currentPage.getByRole('heading', { name: /my next duty|next duty/i }).locator('..')
    ], 'upcoming duty card');
    const defaultUpcoming = await nextDuty.innerText();
    assert.match(defaultUpcoming, /January 3|Jan 3|2027-01-03|Sabbath Day/i, 'default upcoming card does not show the nearest upcoming service');

    const initialCalendarText = await bodyText(page);
    if (/January 2027/i.test(initialCalendarText)) {
      await (await calendarControl(page, 'previous')).click();
      await assertMonthLabel(page, /December 2026/i);
      await (await calendarControl(page, 'next')).click();
      await assertMonthLabel(page, /January 2027/i);
    } else {
      await assertMonthLabel(page, /December 2026/i);
      await (await calendarControl(page, 'next')).click();
      await assertMonthLabel(page, /January 2027/i);
      await (await calendarControl(page, 'previous')).click();
      await assertMonthLabel(page, /December 2026/i);
      await (await calendarControl(page, 'next')).click();
      await assertMonthLabel(page, /January 2027/i);
    }
    assert.match(await nextDuty.innerText(), /January 3|Jan 3|2027-01-03|Sabbath Day/i, 'browsing a month suppressed the default upcoming card');
    const keyboardNext = await calendarControl(page, 'next');
    await keyboardNext.focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await assertMonthLabel(page, /February 2027/i);
    assert.equal(await page.locator('[data-action="calendar-next"]').evaluate((element) => document.activeElement === element), true, 'calendar focus was lost after the first keyboard month change');
    await page.keyboard.press('Enter');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await assertMonthLabel(page, /March 2027/i);
    assert.equal(await page.locator('[data-action="calendar-next"]').evaluate((element) => document.activeElement === element), true, 'calendar focus was lost after the second keyboard month change');
    await (await calendarControl(page, 'previous')).click();
    await (await calendarControl(page, 'previous')).click();
    await assertMonthLabel(page, /January 2027/i);
    const januaryDate = await calendarDate(page, '2027-01-03');
    await januaryDate.click();
    await assertCalendarDateSelected(page, '2027-01-03');
    assert.match(await bodyText(page), /Sabbath Day|January 3|Jan 3/i, 'selected day context is missing');
    await clearMonth(page);
    await assertCalendarDateCleared(page, '2027-01-03');
    assert.match(await nextDuty.innerText(), /January 3|Jan 3|2027-01-03|Sabbath Day/i, 'whole-month clearing changed the upcoming card');

    for (const category of categories) {
      assert.ok(await page.getByText(category.name, { exact: true }).count(), `${category.name} department label is missing`);
    }
    const mediaControl = await departmentControl(page, 'Home');
    if ((await mediaControl.evaluate((element) => element.tagName)) === 'SELECT') await mediaControl.selectOption('Media');
    else await mediaControl.click();
    assert.match(await bodyText(page), /Media Booth #1/i, 'department filter did not expose its labeled duty rows');
    const filteredMonthRows = page.locator('[data-month-service-list] details[data-service-id]');
    const filteredMonthCount = await filteredMonthRows.count();
    assert.ok(filteredMonthCount > 0, 'department filter removed every visible month service unexpectedly');
    assert.match((await page.locator('[data-schedule="month"] .schedule-count').innerText()).trim(), new RegExp(`^${filteredMonthCount} service${filteredMonthCount === 1 ? '' : 's'} in month$`), 'month service count does not match the active department filter');
    if ((await mediaControl.evaluate((element) => element.tagName)) === 'SELECT') await mediaControl.selectOption('All');
    else await mediaControl.click();

    const januaryCard = await serviceCardFor(page, 'svc-jan-worship');
    const rows = await rowsWithin(januaryCard, 'January 3');
    const rowTexts = await rows.evaluateAll((items) => items.map((item) => item.innerText.trim()).filter(Boolean));
    assert.ok(rowTexts.length >= 6, 'assignment rows are missing from the selected service');
    assert.equal(new Set(rowTexts).size, rowTexts.length, 'assignment rows repeat instead of retaining distinct duty and person pairs');
    for (const expected of ['Presider', 'Sermon', 'Prayer', 'Choir', 'Media Booth #1', 'Parking #5']) {
      assert.ok(rowTexts.some((row) => row.includes(expected)), `assignment row ${expected} is missing`);
    }
    const departmentSections = januaryCard.locator('[data-department-section]');
    const departmentNames = await departmentSections.evaluateAll((items) => items.map((item) => item.dataset.departmentSection));
    assert.equal(new Set(departmentNames).size, departmentNames.length, 'department labels repeat instead of grouping duty rows');
    assert.match(await januaryCard.innerText(), /Worship|Media|Other/i, 'assignment rows lack clear department labels');
    assert.equal(await page.getByText('Standalone plan', { exact: true }).count(), 0, 'standalone setlist shell leaked into Home');
    assert.ok(await page.locator('[data-service-id="svc-jan-worship"]').count(), 'Home service ID anchor is missing');
    assert.ok((await page.locator('[data-schedule="upcoming"] [data-service-id]').count()) <= 3, 'Upcoming shows more than the nearest service group');

    const monthList = await firstVisible(page, ['[data-month-service-list]'], 'selected month service list');
    const monthService = monthList.locator('details[data-service-id="svc-jan-worship"]');
    assert.equal(await monthService.count(), 1, 'selected month list omitted January 3');
    assert.match(await monthService.innerText(), /January 3|Jan 3|2027-01-03/i, 'selected month list omitted the service date');
    assert.match(await monthService.innerText(), /09:00|9:00 AM/i, 'selected month list omitted the service time');
    assert.match(await monthService.innerText(), /Sabbath Day|Morning/i, 'selected month list omitted the service type');
    await monthService.locator('summary').click();
    assert.ok(await monthService.locator('[data-department-row]').count(), 'month service expansion omitted assignments');
    await assertAxeClean(page, `home ${width}`);

    await navigate(page, 'duty');
    await chooseMember(page, members[0]);
    if (/December 2026/i.test(await bodyText(page))) {
      await (await calendarControl(page, 'next')).click();
      await assertMonthLabel(page, /January 2027/i);
    }
    await (await calendarControl(page, 'previous')).click();
    await (await calendarControl(page, 'previous')).click();
    await assertMonthLabel(page, /November 2026/i);
    const pastDutyGroup = await dateGroup(page, '2026-11-29');
    assert.match(await pastDutyGroup.innerText(), /Sabbath Day|Morning/i, 'browsing the past month did not reveal the member duty');
    assert.match(await pastDutyGroup.innerText(), /09:00|9:00 AM/i, 'past duty time is missing');
    await (await calendarControl(page, 'next')).click();
    await (await calendarControl(page, 'next')).click();
    await assertMonthLabel(page, /January 2027/i);
    const dutyGroup = await dateGroup(page, '2027-01-10');
    const dutyGroupText = await dutyGroup.innerText();
    assert.match(dutyGroupText, /Feast of Trumpets/i, 'feast label is missing from the grouped personal date');
    assert.match(dutyGroupText, /Sabbath Day/i, 'worship label is missing from the grouped personal date');
    const groupedCards = dutyGroup.locator('[data-service-id], [data-service-card]');
    assert.equal(await groupedCards.count(), 2, 'coincident services were merged or duplicated');
    const groupedIds = await groupedCards.evaluateAll((items) => items.map((item) => item.dataset.serviceId || item.dataset.serviceCard));
    assert.deepEqual(new Set(groupedIds), new Set(['svc-feast', 'svc-worship']), 'grouped services lost distinct source IDs');
    assert.match(dutyGroupText, /09:00|9:00 AM/i, 'first coincident service time is missing');
    assert.match(dutyGroupText, /13:00|1:00 PM/i, 'second coincident service time is missing');
    const teamButton = await completeTeamControl(dutyGroup);
    await teamButton.click();
    const team = await firstVisible(page, [
      '.complete-team[data-complete-team="svc-feast"]',
      '.complete-team[data-complete-team="svc-worship"]'
    ], 'expanded service team');
    const teamText = await team.innerText();
    assert.match(teamText, /Jordan Fixture|Casey Example|Robin Sample|Taylor Test/, 'full team expansion lacks the service team');
    assert.equal(await page.getByText('Standalone plan', { exact: true }).count(), 0, 'standalone setlist shell leaked into My Duties');
    await assertAxeClean(page, `My Duties ${width}`);

    await navigate(page, 'presider');
    const filter = await presiderFilter(page);
    if ((await filter.evaluate((element) => element.tagName)) === 'SELECT') {
      const filterValue = await filter.inputValue();
      const filterText = await filter.locator('option:checked').innerText();
      assert.match(`${filterValue} ${filterText}`, /my|presid|upcoming/i, 'Presider did not default to My presiding');
    } else {
      assert.match(await bodyText(page), /My presiding/i, 'Presider did not default to My presiding');
    }
    assert.doesNotMatch(await bodyText(page), /November 29|2026-11-29/i, 'historical saved plan was auto-selected in default Presider view');
    await (await calendarControl(page, 'previous')).click();
    await (await calendarControl(page, 'previous')).click();
    await assertMonthLabel(page, /November 2026/i);
    const historicalPresider = await firstVisible(page, ['[data-service-summary][data-service-id="svc-history"]'], 'historical Presider service while browsing past month');
    assert.match(await historicalPresider.innerText(), /November 29|2026-11-29/i, 'browsing the past Presider month did not reveal the saved plan');
    assert.match((await historicalPresider.locator('[data-confirmation-state]').innerText()).trim(), /^Confirmed$/i, 'legacy confirmed status is not prominent in the saved plan summary');
    assert.match(await (await songSection(page, 'Glory')).innerText(), /A03/i, 'Appendix number is missing from the read-only Glory section');
    assert.match(await (await songSection(page, 'Thanks')).innerText(), /A03/i, 'Appendix number is missing from the read-only Thanks section');
    await (await calendarControl(page, 'next')).click();
    await (await calendarControl(page, 'next')).click();
    await assertMonthLabel(page, /January 2027/i);
    const serviceControl = await presiderService(page);
    if ((await serviceControl.evaluate((element) => element.tagName)) === 'SELECT') {
      const values = await serviceIdOptions(serviceControl);
      assert.ok(!values.includes('svc-history') || !(await serviceControl.inputValue()).includes('svc-history'), 'historical plan became the default Presider selection');
      await serviceOption(serviceControl, 'svc-jan-worship', 'January Presider service');
    } else {
      assert.match(await bodyText(page), /Sabbath Day|January 3/i, 'upcoming presiding service is missing');
      assert.match(await bodyText(page), /Standalone plan/i, 'standalone plan is unavailable in Presider');
    }
    const allFilter = await allServicesFilter(page);
    if ((await allFilter.evaluate((element) => element.tagName)) === 'SELECT') {
      await selectOptionByText(allFilter, /all services/i, 'All services');
    } else {
      await allFilter.click();
    }
    if ((await serviceControl.evaluate((element) => element.tagName)) === 'SELECT') {
      const allServiceValues = await serviceIdOptions(serviceControl);
      assert.ok(allServiceValues.includes('standalone-plan'), 'standalone plan is unavailable in All services Presider');
    } else {
      assert.match(await bodyText(page), /Standalone plan/i, 'standalone plan is unavailable in All services Presider');
    }
    assert.match(await bodyText(page), /Standalone plan|December 20|2026-12-20/i, 'All services did not expose saved plan shells and history');
    if ((await serviceControl.evaluate((element) => element.tagName)) === 'SELECT') {
      await serviceOption(serviceControl, 'svc-worship', 'changed Presider service');
      const changedSummary = await firstVisible(page, ['[data-service-summary][data-service-id="svc-worship"]'], 'changed Presider service summary');
      assert.match((await changedSummary.locator('[data-confirmation-state]').innerText()).trim(), /^Changed(?: after confirmation)?$/i, 'changed setlist status is not distinguished in the Presider summary');
      await serviceOption(serviceControl, 'svc-feast', 'sung Presider service');
      const sungSummary = await firstVisible(page, ['[data-service-summary][data-service-id="svc-feast"]'], 'sung Presider service summary');
      assert.match((await sungSummary.locator('[data-confirmation-state]').innerText()).trim(), /^Sung$/i, 'sung setlist status is not distinguished in the Presider summary');
      await serviceOption(serviceControl, 'svc-missing-plan', 'no-plan Presider service');
      const noPlan = await firstVisible(page, ['[data-presider-state="no-plan"]'], 'no-plan Presider state');
      assert.match(await noPlan.innerText(), /January 13|Jan 13|2027-01-13/i, 'no-plan service date is missing');
      assert.match(await noPlan.innerText(), /Casey Example/i, 'no-plan service presider is missing');
      await serviceOption(serviceControl, 'svc-jan-worship', 'January Presider service after All services');
    }
    const presiderCard = await serviceCardFor(page, 'svc-jan-worship');
    const presiderText = await presiderCard.innerText();
    assert.match(presiderText, /Sabbath Day|Morning/i, 'Presider service label is not prominent');
    assert.match(presiderText, /January 3|Jan 3|2027-01-03/i, 'Presider service date is not prominent');
    assert.match(presiderText, /Jordan Fixture/i, 'Presider name is missing');
    const serviceInfo = await firstVisible(page, ['.service-info'], 'Presider prayer and choir context');
    const confirmation = await firstVisible(page, [
      '[data-confirmation-state]',
      '.planner-state-bar',
      '[data-state="confirmation"]'
    ], 'Presider confirmation state');
    assert.match(await confirmation.innerText(), /not confirmed|songs not confirmed/i, 'unconfirmed service is presented without an explicit unconfirmed state');
    assert.match(await serviceInfo.innerText(), /Prayer|Robin Sample/i, 'prayer information is missing');
    assert.match(await serviceInfo.innerText(), /Fictional Choir Anthem/i, 'choir information is missing');
    const presiderPageText = await bodyText(page);
    assert.ok(presiderPageText.indexOf('Preparation') < presiderPageText.indexOf('Glory'), 'Preparation must precede Glory');
    assert.ok(presiderPageText.indexOf('Glory') < presiderPageText.indexOf('Thanks'), 'Glory must precede Thanks');
    assert.match(presiderPageText, /A03/i, 'Appendix song number is not displayed as A##');
    for (const sectionName of ['Preparation', 'Glory', 'Thanks']) {
      const section = await songSection(page, sectionName);
      const editable = await findEditableSongSelects(section);
      assert.equal(editable.length, 0, `${sectionName} has editable controls in real read-only mode`);
    }
    await assertAxeClean(page, `Presider real ${width}`);

    await navigate(page, 'manage');
    assert.match(await bodyText(page), /select.*department|choose.*department/i, 'Manage does not begin with department selection');
    const manageDepartment = await departmentControl(page, 'Manage');
    const beforeDepartment = await bodyText(page);
    assert.doesNotMatch(beforeDepartment, /assignment editor|save assignment|service editor/i, 'Manage exposed editing before department selection');
    assert.equal(await page.locator('[data-change="assignment"]').count(), 0, 'Manage exposed assignment controls before department selection');
    if ((await manageDepartment.evaluate((element) => element.tagName)) === 'SELECT') await manageDepartment.selectOption('Media');
    else await manageDepartment.click();
    const readOnlyRows = page.locator('.assignment-read-only-row');
    assert.ok(await readOnlyRows.count(), 'Manage department selection did not reveal its assignment rows');
    const readOnlyRowTexts = await readOnlyRows.evaluateAll((items) => items.map((item) => item.innerText.trim()));
    assert.ok(readOnlyRowTexts.every((row) => /Media|Media Booth/i.test(row)), 'Manage department selection did not filter assignment rows');
    await assertAxeClean(page, `Manage ${width}`);
    await assertGuardClean(run.guard, `real journey ${width}`);
  }

  const fictional = await newRun(430, fictionalPayload, '?screen=presider&review=save-failure', { injectPayload: true });
  const fictionalPage = fictional.page;
  await waitForScreen(fictionalPage, 'presider');
  await chooseMember(fictionalPage, members[0]);
  const fictionalService = await presiderService(fictionalPage);
  if ((await fictionalService.evaluate((element) => element.tagName)) === 'SELECT') {
    assert.equal(await fictionalService.inputValue(), 'svc-jan-worship', 'fictional Presider did not default to the January service');
  }
  const glorySelect = await songSelect(fictionalPage, 'Glory');
  const thanksSelect = await songSelect(fictionalPage, 'Thanks');
  await glorySelect.selectOption('song-glory-alt');
  await thanksSelect.selectOption('song-thanks-alt');
  assert.equal(await glorySelect.inputValue(), 'song-glory-alt', 'Glory song selection did not persist in fictional mode');
  assert.equal(await thanksSelect.inputValue(), 'song-thanks-alt', 'Thanks song selection did not persist in fictional mode');
  const preparation = await songSection(fictionalPage, 'Preparation');
  const preparationBefore = await preparationRows(fictionalPage);
  const preparationBeforeCount = await preparationBefore.count();
  const preparationBeforeText = await preparation.innerText();
  await songLibraryControl(fictionalPage, 'open');
  await addPreparationControl(fictionalPage);
  await songLibraryControl(fictionalPage, 'close');
  const preparationAfter = await preparationRows(fictionalPage);
  assert.ok((await preparationAfter.count()) > preparationBeforeCount, 'Preparation add control did not add a song row');
  await reorderPreparationControl(fictionalPage);
  const preparationAfterText = await preparation.innerText();
  assert.notEqual(preparationAfterText, preparationBeforeText, 'Preparation reorder did not change the ordered rows');
  assert.match(await bodyText(fictionalPage), /A03/i, 'fictional Appendix song number is not displayed as A03');

  assert.match(await bodyText(fictionalPage), /save failed|could not save|try again|unable to save/i, 'fictional save failure state is missing');
  await (await retryControl(fictionalPage)).click();
  await fictionalPage.locator('[data-save-state="saved"]').waitFor({ state: 'visible' });
  assert.match((await fictionalPage.locator('[data-save-state="saved"]').innerText()).trim(), /saved locally/i, 'fictional save retry did not recover');
  await clickControl(fictionalPage, [
    '[data-action="confirm"]',
    '[data-action="confirm-songs"]',
    (currentPage) => currentPage.getByRole('button', { name: /confirm songs|confirm service/i })
  ], 'fictional confirmation control');
  const confirmedState = await firstVisible(fictionalPage, [
    '[data-confirmation-state]',
    '.planner-state-bar',
    '[data-state="confirmation"]'
  ], 'confirmed fictional state');
  assert.match((await confirmedState.innerText()).trim(), /^Confirmed$/i, 'fictional confirmation state did not change');
  await glorySelect.selectOption('song-glory');
  const changedBeforeSave = await firstVisible(fictionalPage, ['[data-confirmation-state]'], 'changed fictional state before save');
  assert.match((await changedBeforeSave.innerText()).trim(), /^Changed(?: after confirmation)?$/i, 'fictional edit did not expose changed state');
  await (await saveControl(fictionalPage)).click();
  await fictionalPage.locator('[data-save-state="saved"]').waitFor({ state: 'visible' });
  const changedAfterSave = await firstVisible(fictionalPage, ['[data-confirmation-state]'], 'changed fictional state after save');
  assert.match((await changedAfterSave.innerText()).trim(), /^Changed(?: after confirmation)?$/i, 'confirmed service did not retain changed state after save');

  await songLibraryControl(fictionalPage, 'open');
  const searchInput = await firstVisible(fictionalPage, ['#song-search'], 'song library search');
  await searchInput.fill('Fictional Appendix Song');
  assert.match(await bodyText(fictionalPage), /Fictional Appendix Song/i, 'song search did not return the fictional Appendix song');
  await songLibraryControl(fictionalPage, 'close');
  await songLibraryControl(fictionalPage, 'open');
  await firstVisible(fictionalPage, ['#song-library-panel'], 'reopened song library');
  await assertAxeClean(fictionalPage, 'fictional Presider phone');
  await songLibraryControl(fictionalPage, 'close');
  await navigate(fictionalPage, 'manage');
  const fictionalManageFirst = await firstVisible(fictionalPage, ['[data-manage-department-first]'], 'fictional Manage department choice');
  assert.equal(await fictionalManageFirst.locator('#manage-department-choice').count(), 1, 'fictional Manage did not begin with department selection');
  const fictionalManageDepartment = fictionalManageFirst.locator('#manage-department-choice');
  await fictionalManageDepartment.selectOption('Media');
  const fictionalAssignmentRows = fictionalPage.locator('.assignment-edit-row');
  assert.ok(await fictionalAssignmentRows.count(), 'fictional Manage department selection did not reveal assignment rows');
  const fictionalAssignmentTexts = await fictionalAssignmentRows.evaluateAll((items) => items.map((item) => item.innerText.trim()));
  assert.ok(fictionalAssignmentTexts.every((row) => /Media|Media Booth/i.test(row)), 'fictional Manage department selection did not filter assignment rows');
  await assertAxeClean(fictionalPage, 'fictional Manage phone');
  await assertGuardClean(fictional.guard, 'fictional editing journey');

  const laterMember = await newRun(430, realPayload, '?screen=home');
  const laterPage = laterMember.page;
  await waitForScreen(laterPage, 'home');
  await chooseMember(laterPage, 'Taylor Test');
  const laterNextDuty = await firstVisible(laterPage, ['.next-duty'], 'later member next duty');
  assert.match(await laterNextDuty.innerText(), /January 3|Jan 3|2027-01-03|Choir/i, 'later member fixture lost its nearest upcoming duty');
  await clearMonth(laterPage);
  await navigate(laterPage, 'presider');
  const laterService = await presiderService(laterPage);
  assert.equal(await laterService.inputValue(), 'svc-later-presider', 'My presiding default did not use the selected member\'s later presiding service');
  assert.match(await bodyText(laterPage), /January 17|Jan 17|2027-01-17/i, 'later member Presider service date is missing');
  await (await calendarDate(laterPage, '2027-01-03')).click();
  await firstVisible(laterPage, ['[data-presider-state="empty"]'], 'explicit no-presider day state');
  assert.doesNotMatch(await bodyText(laterPage), /January 17|Jan 17|2027-01-17/i, 'explicit calendar day did not constrain Presider services');
  await clearMonth(laterPage);
  assert.equal(await (await presiderService(laterPage)).inputValue(), 'svc-later-presider', 'clearing the calendar day did not restore the member Presider service');
  await assertAxeClean(laterPage, 'later member Presider phone');
  await assertGuardClean(laterMember.guard, 'later member Presider journey');

  const empty = makePayload(true);
  empty.services = [];
  empty.setlists = {};
  empty.members = [];
  empty.departments = {};
  const emptyRun = await newRun(430, empty);
  await waitForScreen(emptyRun.page, 'home');
  assert.match(await bodyText(emptyRun.page), /no upcoming|nothing scheduled|no duties|empty/i, 'empty Home state is missing');
  await assertAxeClean(emptyRun.page, 'empty Home');
  for (const screen of ['duty', 'presider', 'manage']) {
    await navigate(emptyRun.page, screen);
    assert.match(await bodyText(emptyRun.page), /no upcoming|nothing scheduled|no duties|empty|select.*department|name needed|choose your name/i, `empty ${screen} state is missing`);
    await assertAxeClean(emptyRun.page, `empty ${screen}`);
  }
  await assertGuardClean(emptyRun.guard, 'empty fictional journey');

  const errorRun = await newRun(430, realPayload, '?screen=home', { fail: true });
  const errorState = await firstVisible(errorRun.page, [
    '[data-preview-state="unavailable"]',
    '[data-preview-state="error"]',
    '[role="alert"]',
    (currentPage) => currentPage.getByText(/preview.*unavailable|unable to load|could not load/i)
  ], 'preview error state');
  assert.match(await errorState.innerText(), /unavailable|unable|could not|error/i, 'preview error state text is missing');
  assert.equal(await errorRun.page.locator('[data-prototype-screen]').count(), 0, 'error state rendered an application screen');
  const expectedPreviewError = 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)';
  assert.deepEqual(errorRun.guard.browserErrors, [expectedPreviewError], 'preview error emitted an unexpected browser error');
  await assertGuardClean(errorRun.guard, 'preview error journey', [expectedPreviewError]);
});

export {
  assertAxeClean,
  assertGuardClean,
  categories,
  fictionalPayload,
  makePayload,
  members,
  openPage,
  prototypeRoot,
  realPayload,
  services,
  setlists,
  songs
};
