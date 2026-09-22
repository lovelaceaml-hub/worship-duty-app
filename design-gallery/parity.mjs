/** Pixel and DOM parity harness for the app.js split (docs/PLAN-2026-09-22-APP-JS-SPLIT.md).
 * Reuses design-gallery/test.mjs's mocked Firebase SDK, fictional fixtures and
 * external-request blocking. No production account, schedule, token, or
 * Firebase write is used by this harness. Date is frozen before any page
 * script runs, so every capture is deterministic.
 *
 * Usage:
 *   node design-gallery/parity.mjs --record <dir>
 *   node design-gallery/parity.mjs --compare <dir>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.hosting-gallery');
const loadEffectsPath = path.join(root, 'tests', 'fixtures', 'app-js-split', 'load-effects.json');

const APPEARANCES = ['classic', 'prism', 'navy', 'aurora'];
const VIEWPORTS = {desktop: {width: 1280, height: 800}, phone: {width: 375, height: 812}};
const STATES = ['sign-in-gate', 'schedule', 'my-duties', 'manage', 'presider-songs'];
const PIXEL_DIFF_THRESHOLD = 8;
const PIXEL_DIFF_RATIO = 0.001;

/* ---------- PNG decode (no external image library; Node built-ins only) ---------- */
function decodePNG(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Not a PNG buffer');
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (interlace !== 0) throw new Error('Interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 8 + length + 4;
  }
  if (bitDepth !== 8) throw new Error('Only 8-bit PNG supported, got depth ' + bitDepth);
  const channels = {0: 1, 2: 3, 4: 2, 6: 4}[colorType];
  if (!channels) throw new Error('Unsupported PNG color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = channels;
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(height * stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x];
      const a = x >= bytesPerPixel ? out[rowStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? out[prevRowStart + x] : 0;
      const c = y > 0 && x >= bytesPerPixel ? out[prevRowStart + x - bytesPerPixel] : 0;
      let value;
      if (filterType === 0) value = rawByte;
      else if (filterType === 1) value = rawByte + a;
      else if (filterType === 2) value = rawByte + b;
      else if (filterType === 3) value = rawByte + Math.floor((a + b) / 2);
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = rawByte + predictor;
      } else throw new Error('Unsupported PNG filter type ' + filterType);
      out[rowStart + x] = value & 0xff;
    }
    rawOffset += stride;
  }
  // Normalize to RGBA for comparison.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    const o = i * 4;
    if (channels === 4) { rgba[o] = out[p]; rgba[o + 1] = out[p + 1]; rgba[o + 2] = out[p + 2]; rgba[o + 3] = out[p + 3]; }
    else if (channels === 3) { rgba[o] = out[p]; rgba[o + 1] = out[p + 1]; rgba[o + 2] = out[p + 2]; rgba[o + 3] = 255; }
    else if (channels === 2) { rgba[o] = rgba[o + 1] = rgba[o + 2] = out[p]; rgba[o + 3] = out[p + 1]; }
    else { rgba[o] = rgba[o + 1] = rgba[o + 2] = out[p]; rgba[o + 3] = 255; }
  }
  return {width, height, data: rgba};
}

function comparePNGs(bufferA, bufferB) {
  const a = decodePNG(bufferA), b = decodePNG(bufferB);
  if (a.width !== b.width || a.height !== b.height) {
    return {equal: false, reason: `dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`, diffPixels: -1, totalPixels: -1, ratio: 1};
  }
  const totalPixels = a.width * a.height;
  let diffPixels = 0;
  for (let i = 0; i < totalPixels; i++) {
    const o = i * 4;
    const dr = Math.abs(a.data[o] - b.data[o]);
    const dg = Math.abs(a.data[o + 1] - b.data[o + 1]);
    const db = Math.abs(a.data[o + 2] - b.data[o + 2]);
    const da = Math.abs(a.data[o + 3] - b.data[o + 3]);
    if (dr > PIXEL_DIFF_THRESHOLD || dg > PIXEL_DIFF_THRESHOLD || db > PIXEL_DIFF_THRESHOLD || da > PIXEL_DIFF_THRESHOLD) diffPixels++;
  }
  const ratio = diffPixels / totalPixels;
  return {equal: ratio <= PIXEL_DIFF_RATIO, reason: `${diffPixels}/${totalPixels} pixels differ (${(ratio * 100).toFixed(3)}%)`, diffPixels, totalPixels, ratio};
}

/* ---------- Fixtures, reused from design-gallery/test.mjs ---------- */
const TEST_PIN = '2468';
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
const pinHash = hash(Buffer.from(TEST_PIN));
const members = [
  'Z. Rivera', 'Y. Nakamura', 'X. Delgado', 'W. Osei', 'V. Tran'
];
const services = [
  {
    date: '2026-07-01', service: 'Morning', worship: 'Sabbath Day', time: '09:00',
    choirSong: '#311 I Repent of My Sin',
    assignments: {
      Presider: 'Z. Rivera', Sermon: 'Z. Rivera',
      'Prayer of Thanks': 'Y. Nakamura', 'Usher #1': 'W. Osei'
    }
  },
  {
    date: '2026-07-02', service: 'Evening', worship: 'Sabbath Day', time: '20:00',
    choirSong: '',
    assignments: {
      Presider: 'Y. Nakamura', 'Media Booth #1': 'Y. Nakamura',
      'Usher #1': 'X. Delgado', 'Usher #2': 'W. Osei'
    }
  }
];
const departmentMap = {
  Worship: ['Z. Rivera', 'Y. Nakamura'],
  'Usher Sisters': ['W. Osei', 'V. Tran'],
  'Usher Brothers': ['X. Delgado'],
  Lobby: [], Translation: [], Media: ['Y. Nakamura'],
  'Parking Lot': [], Offering: []
};
const departmentRoster = {
  Worship: [{
    memberUid: 'member:Y. Nakamura', uid: 'member:Y. Nakamura', departmentId: 'Worship', department: 'Worship',
    role: 'leader', memberName: 'Y. Nakamura', status: 'active', eligibleDuties: ['Presider'], schedulable: true,
    availability: {recurring: {morning: 'available', evening: 'available'}, exceptions: {}},
    updatedBy: 'Roster setup', updatedByUid: 'member:Y. Nakamura', updatedAt: Date.parse('2026-06-20T10:00:00Z')
  }],
  Media: [{
    memberUid: 'member:Y. Nakamura', uid: 'member:Y. Nakamura', departmentId: 'Media', department: 'Media',
    role: 'leader', memberName: 'Y. Nakamura', status: 'active', eligibleDuties: ['Media Booth #1'], schedulable: true,
    availability: {recurring: {morning: 'available', evening: 'available'}, exceptions: {}},
    updatedBy: 'Y. Nakamura', updatedByUid: 'member:Y. Nakamura', updatedAt: Date.parse('2026-06-21T10:00:00Z')
  }]
};
const fixture = {
  services, departmentRoster, holdSettings: true,
  docs: {
    'app/settings': {
      sitePinHash: pinHash, pinHash,
      features: {
        siteLock: true, editorLock: true, notifications: true,
        reminders: false, calendarExport: false, whoElse: true,
        choirSong: true, songPicker: true, pastServices: true,
        emptyDuties: false, conflictWarnings: true, changeRequests: true,
        sheetSync: false
      }
    },
    'app/members': {list: members},
    'app/departments': {map: departmentMap},
    'app/leaderConfig': {
      admin: ['Z. Rivera'], globalLeaderManager: ['Z. Rivera'],
      departmentLeaders: {Worship: ['Y. Nakamura'], Media: ['Y. Nakamura']},
      songEditors: ['Y. Nakamura']
    },
    'app/nameMap': {map: {}},
    'app/presiders': {names: ['Z. Rivera', 'Y. Nakamura']},
    'app/songSettings': {pinHash},
    'setlists/2026-07-01_morning': {
      id: '2026-07-01_morning', date: '2026-07-01',
      worshipType: 'Sabbath Day', serviceLabel: 'Morning',
      presider: 'Z. Rivera', songs: ['001'], status: 'planned', updatedAt: 1
    }
  }
};

function authRecords() {
  return {
    'Z. Rivera': {
      pin: TEST_PIN,
      claims: {
        memberId: 'Z. Rivera', memberName: 'Z. Rivera', role: 'admin',
        roles: ['admin'], departments: [], admin: true, mustChangePin: false, roleVersion: 1
      }
    }
  };
}

function authModule() {
  return `
    let authListener = () => {};
    const auth = {currentUser: null};
    const tokenName = token => decodeURIComponent(String(token).slice('fixture-token:'.length));
    const userFor = name => {
      const record = (window.__fixtureAuthRecords || {})[name];
      const claims = record ? record.claims : {};
      return {uid: 'member:' + name, getIdTokenResult: async () => ({claims})};
    };
    export const getAuth = () => auth;
    export const onAuthStateChanged = (_auth, callback) => {
      authListener = callback;
      setTimeout(() => callback(auth.currentUser), 0);
      return () => {};
    };
    export const signInWithCustomToken = async (_auth, token) => {
      const name = tokenName(token);
      auth.currentUser = userFor(name);
      window.__fixtureCurrentUserUid = auth.currentUser.uid;
      authListener(auth.currentUser);
      return {user: auth.currentUser};
    };
    export const signOut = async _auth => { auth.currentUser = null; authListener(null); };
  `;
}

function functionsModule() {
  return `
    const fail = code => { const error = new Error(code); error.code = 'functions/' + code; throw error; };
    export const getFunctions = () => ({});
    export const httpsCallable = (_functions, name) => async data => {
      const id = String((data && (data.selectedMemberId || data.memberId)) || '');
      const record = (window.__fixtureAuthRecords || {})[id];
      if (name === 'verifyMemberPin') {
        if (!record || String(data.pin) !== String(record.pin)) fail('permission-denied');
        return {data: {token: 'fixture-token:' + encodeURIComponent(id), memberId: id, memberName: id, mustChangePin: false}};
      }
      return {data: {ok: true}};
    };
  `;
}

/* ---------- Browser session plumbing ---------- */
async function ensureBuilt() {
  execFileSync(process.execPath, [path.join(root, 'design-gallery/build.mjs')], {stdio: 'inherit'});
}

async function loadAssets() {
  const entries = (await fs.readdir(stage, {withFileTypes: true})).filter(entry => entry.isFile());
  return new Map(await Promise.all(entries.map(async entry => [entry.name, await fs.readFile(path.join(stage, entry.name))])));
}

async function makeContext(browser, viewport, isoTime) {
  const origin = 'http://localhost:8134';
  const assets = await loadAssets();
  const firestoreMock = await fs.readFile(path.join(root, 'live-design/fixture-firestore.js'), 'utf8');
  const context = await browser.newContext({
    viewport, serviceWorkers: 'block', reducedMotion: 'reduce', deviceScaleFactor: 1,
    timezoneId: 'America/Los_Angeles'
  });
  await context.addInitScript(({fixtureValue, records}) => {
    window.__designFixture = fixtureValue;
    window.__fixtureAuthRecords = records;
    window.__fixtureDepartmentRoster = fixtureValue.departmentRoster;
  }, {fixtureValue: fixture, records: authRecords()});
  const js = body => ({body, contentType: 'text/javascript'});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      const name = url.pathname.slice(1) || 'index.html';
      const data = assets.get(name);
      if (!data) { await route.fulfill({status: 404, body: 'not found'}); return; }
      const contentType = name.endsWith('.js') ? 'text/javascript' :
        name.endsWith('.css') ? 'text/css' :
        name.endsWith('.html') ? 'text/html' :
        name.endsWith('.svg') ? 'image/svg+xml' : 'application/json';
      await route.fulfill({body: data, contentType});
      return;
    }
    if (url.href.endsWith('/firebase-app.js')) { await route.fulfill(js('export const initializeApp = config => { window.__apps = (window.__apps || 0) + 1; return {config}; };')); return; }
    if (url.href.endsWith('/firebase-firestore.js')) { await route.fulfill(js(firestoreMock)); return; }
    if (url.href.endsWith('/firebase-auth.js')) { await route.fulfill(js(authModule())); return; }
    if (url.href.endsWith('/firebase-functions.js')) { await route.fulfill(js(functionsModule())); return; }
    if (url.href.endsWith('/firebase-messaging.js')) { await route.fulfill(js('export const isSupported = async () => false;')); return; }
    await route.fulfill({status: 503, body: 'blocked by parity harness'});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  if (process.env.PARITY_DEBUG) {
    page.on('pageerror', err => console.error('[pageerror]', String(err)));
    page.on('console', msg => { if (msg.type() === 'error') console.error('[console.error]', msg.text()); });
  }
  await page.clock.setSystemTime(new Date(isoTime));
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__mockLive);
  await page.evaluate(() => window.__mockLive.emit('app/settings', window.__designFixture.docs['app/settings']));
  await page.waitForFunction(() => !!document.querySelector('#site-pin-input'));
  return {context, page};
}

/* A renderSoon() debounce can regenerate the view's innerHTML shortly after
 * first paint, wiping a value typed into a fresh input before it is
 * submitted. Fill-then-verify-then-click, retrying the fill if a debounced
 * re-render raced it. */
async function fillAndSubmit(page, inputSelector, buttonSelector, value) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.locator(inputSelector).fill(value);
    const actual = await page.locator(inputSelector).inputValue().catch(() => '');
    if (actual === value) break;
    await page.waitForTimeout(100);
  }
  await page.locator(buttonSelector).click();
}

async function unlockAndLogin(page) {
  await page.waitForTimeout(250);
  for (let attempt = 0; attempt < 5; attempt++) {
    await fillAndSubmit(page, '#site-pin-input', '[data-act="site-unlock"] button', TEST_PIN);
    try {
      await page.waitForSelector('#member-login', {timeout: 3000});
      break;
    } catch (error) {
      if (attempt === 4) {
        if (process.env.PARITY_DEBUG) {
          await page.screenshot({path: '/tmp/parity-debug-fail.png', fullPage: true});
          console.error('[debug] body text:', (await page.locator('body').innerText().catch(() => '')).slice(0, 2000));
        }
        throw error;
      }
    }
  }
  await page.locator('#member-login').selectOption('Z. Rivera');
  await page.waitForTimeout(100);
  for (let attempt = 0; attempt < 5; attempt++) {
    await fillAndSubmit(page, '#member-pin', '[data-act="member-login"] button', TEST_PIN);
    try {
      await page.waitForFunction(() => !document.querySelector('nav.tabs')?.classList.contains('hidden'), {timeout: 3000});
      break;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  await page.waitForSelector('.wd-design-dialog[open]');
  await page.waitForTimeout(150);
}

async function chooseAppearance(page, mode) {
  if (mode === 'classic') {
    await page.locator('.wd-design-dialog[open] .wd-done').click();
    await page.waitForFunction(() => !document.querySelector('.wd-design-dialog[open]'));
    await page.waitForTimeout(150);
    return;
  }
  await page.locator(`.wd-design-dialog[open] [data-design-select="${mode}"]`).click();
  await page.waitForFunction(expected => window.WorshipDesign?.getMode() === expected, mode);
  await page.waitForTimeout(150);
}

async function navigate(page, tab) {
  await page.locator(`nav.tabs [data-tab="${tab}"]`).click();
  await page.waitForTimeout(150);
}

const SCHEDULE_SELECTOR = {
  classic: '.schedule-focus', prism: '.prism-service-times [aria-pressed="true"]',
  navy: '.nc-hero', aurora: '.service-switch .selected'
};

async function captureScheduleBoundaryFacts(page) {
  await page.evaluate(() => {
    const base = window.__designFixture.services[0];
    window.__mockLive.emit('schedule/parity-early-morning', {...base, date: '2026-07-01', service: 'Early Morning', time: '05:00'});
    window.__mockLive.emit('schedule/parity-evening', {...base, date: '2026-07-01', service: 'Evening', time: '19:30'});
  });
  const mode = await page.evaluate(() => window.WorshipDesign?.getMode() || 'classic');
  const selector = SCHEDULE_SELECTOR[mode];
  const facts = {};
  await page.clock.setSystemTime(new Date('2026-07-01T19:20:00-07:00'));
  await page.waitForTimeout(150);
  facts.at720pm = await page.locator(selector).first().innerText().catch(() => '');
  await page.clock.setSystemTime(new Date('2026-07-01T21:06:00-07:00'));
  await page.waitForTimeout(150);
  facts.at906pm = await page.locator(selector).first().innerText().catch(() => '');

  await page.evaluate(() => {
    document.documentElement.dataset.maintenance = 'active';
    window.__mockLive.emit('app/settings', window.__designFixture.docs['app/settings']);
  });
  await page.waitForFunction(() => document.querySelector('.maintenance-service-title')?.textContent?.length > 0).catch(() => {});
  facts.maintenanceTitle = await page.locator('.maintenance-service-title').first().innerText().catch(() => '');
  facts.maintenanceOmitsEarlyMorning = !(await page.locator('#maintenance-schedule').innerText().catch(() => '')).includes('5:00 AM');
  await page.evaluate(() => {
    delete document.documentElement.dataset.maintenance;
    window.__mockLive.emit('app/settings', window.__designFixture.docs['app/settings']);
  });
  return facts;
}

async function captureState(page, state, mode) {
  const facts = {url: page.url()};
  if (state === 'sign-in-gate') {
    facts.sitePinVisible = await page.locator('#site-pin-input').count() > 0;
  } else if (state === 'schedule') {
    facts.activeTab = await page.locator('nav.tabs button.active').textContent().catch(() => '');
  } else if (state === 'my-duties') {
    facts.activeTab = await page.locator('nav.tabs button.active').textContent().catch(() => '');
    facts.dutyCardCount = await page.locator('.duty-card').count().catch(() => 0);
  } else if (state === 'manage') {
    facts.activeTab = await page.locator('nav.tabs button.active').textContent().catch(() => '');
    facts.manageVisible = await page.locator('#tab-manage').isVisible().catch(() => false);
  } else if (state === 'presider-songs') {
    facts.activeSongTab = await page.locator('#song-root .ns-tabs button.active').innerText().catch(() => '');
  }
  const screenshot = await page.screenshot({fullPage: true});
  return {facts, screenshot};
}

async function captureBoundaryFactsForAppearance(browser, appearance) {
  const {context, page} = await makeContext(browser, VIEWPORTS.desktop, '2026-07-01T12:00:00-07:00');
  try {
    await unlockAndLogin(page);
    await chooseAppearance(page, appearance);
    await navigate(page, 'schedule');
    return await captureScheduleBoundaryFacts(page);
  } finally {
    await context.close();
  }
}

async function walkStates(page, mode) {
  const results = {};
  results['sign-in-gate'] = await captureState(page, 'sign-in-gate', mode);
  await unlockAndLogin(page);
  await chooseAppearance(page, mode);
  await navigate(page, 'schedule');
  results['schedule'] = await captureState(page, 'schedule', mode);
  await navigate(page, 'my');
  results['my-duties'] = await captureState(page, 'my-duties', mode);
  await navigate(page, 'manage');
  results['manage'] = await captureState(page, 'manage', mode);
  await navigate(page, 'my');
  const openSongs = page.locator('[data-act="open-songs"]').first();
  if (await openSongs.count()) {
    await openSongs.click();
  } else {
    await navigate(page, 'songs');
  }
  await page.waitForSelector('#song-root .ns-tabs', {timeout: 15000}).catch(() => {});
  results['presider-songs'] = await captureState(page, 'presider-songs', mode);
  return results;
}

/* ---------- Load-time effects fixture (observation only, no app.js edits) ---------- */
async function captureLoadEffects(browser) {
  const origin = 'http://localhost:8134';
  const assets = await loadAssets();
  const firestoreMock = await fs.readFile(path.join(root, 'live-design/fixture-firestore.js'), 'utf8');
  const context = await browser.newContext({viewport: VIEWPORTS.desktop, serviceWorkers: 'block', timezoneId: 'America/Los_Angeles'});
  await context.addInitScript(({fixtureValue, records}) => {
    window.__designFixture = fixtureValue;
    window.__fixtureAuthRecords = records;
    window.__loadEffects = {timersScheduled: 0, rafScheduled: 0, localStorageKeys: [], windowKeysBeforeLoad: Object.keys(window)};
    const origSetTimeout = window.setTimeout, origSetInterval = window.setInterval, origRaf = window.requestAnimationFrame;
    window.setTimeout = function (...args) { window.__loadEffects.timersScheduled++; return origSetTimeout.apply(this, args); };
    window.setInterval = function (...args) { window.__loadEffects.timersScheduled++; return origSetInterval.apply(this, args); };
    window.requestAnimationFrame = function (...args) { window.__loadEffects.rafScheduled++; return origRaf.apply(this, args); };
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage) window.__loadEffects.localStorageKeys.push(key);
      return origSetItem.call(this, key, value);
    };
  }, {fixtureValue: fixture, records: authRecords()});
  const requests = [];
  const js = body => ({body, contentType: 'text/javascript'});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      requests.push({method: route.request().method(), path: url.pathname});
      const name = url.pathname.slice(1) || 'index.html';
      const data = assets.get(name);
      if (!data) { await route.fulfill({status: 404, body: 'not found'}); return; }
      const contentType = name.endsWith('.js') ? 'text/javascript' :
        name.endsWith('.css') ? 'text/css' :
        name.endsWith('.html') ? 'text/html' :
        name.endsWith('.svg') ? 'image/svg+xml' : 'application/json';
      await route.fulfill({body: data, contentType});
      return;
    }
    if (url.href.endsWith('/firebase-app.js')) { await route.fulfill(js('export const initializeApp = config => { window.__apps = (window.__apps || 0) + 1; return {config}; };')); return; }
    if (url.href.endsWith('/firebase-firestore.js')) { await route.fulfill(js(firestoreMock)); return; }
    if (url.href.endsWith('/firebase-auth.js')) { await route.fulfill(js(authModule())); return; }
    if (url.href.endsWith('/firebase-functions.js')) { await route.fulfill(js(functionsModule())); return; }
    if (url.href.endsWith('/firebase-messaging.js')) { await route.fulfill(js('export const isSupported = async () => false;')); return; }
    await route.fulfill({status: 503, body: 'blocked by parity harness'});
  });
  const page = await context.newPage();
  await page.clock.setSystemTime(new Date('2026-07-01T12:00:00-07:00'));
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__mockLive);
  await page.evaluate(() => window.__mockLive.emit('app/settings', window.__designFixture.docs['app/settings']));
  await page.waitForFunction(() => !!document.querySelector('#site-pin-input'));
  await page.waitForTimeout(400);
  const effects = await page.evaluate(() => {
    const after = Object.keys(window);
    const added = after.filter(key => !window.__loadEffects.windowKeysBeforeLoad.includes(key));
    return {
      timersScheduled: window.__loadEffects.timersScheduled,
      rafScheduled: window.__loadEffects.rafScheduled,
      localStorageKeys: [...new Set(window.__loadEffects.localStorageKeys)].sort(),
      addedWindowKeys: added.sort()
    };
  });
  effects.appRequests = requests.map(r => r.path).sort();
  await context.close();
  return effects;
}

/* ---------- Record / compare orchestration ---------- */
async function recordAll() {
  await ensureBuilt();
  const browser = await chromium.launch();
  const results = {};
  try {
    for (const appearance of APPEARANCES) {
      if (process.env.PARITY_DEBUG) console.error('=== boundary for', appearance, '===');
      const boundary = await captureBoundaryFactsForAppearance(browser, appearance);
      for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
        if (process.env.PARITY_DEBUG) console.error('=== walk', appearance, viewportName, '===');
        const {context, page} = await makeContext(browser, viewport, '2026-07-01T12:00:00-07:00');
        try {
          const states = await walkStates(page, appearance);
          states.schedule.facts.boundary = boundary;
          for (const state of STATES) {
            const key = `${appearance}-${state}-${viewportName}`;
            results[key] = states[state];
          }
        } finally {
          await context.close();
        }
      }
    }
    const loadEffects = await captureLoadEffects(browser);
    await fs.mkdir(path.dirname(loadEffectsPath), {recursive: true});
    await fs.writeFile(loadEffectsPath, JSON.stringify(loadEffects, null, 2) + '\n');
  } finally {
    await browser.close();
  }
  return results;
}

async function writeBaseline(dir, results) {
  await fs.mkdir(path.join(dir, 'screenshots'), {recursive: true});
  const facts = {};
  for (const [key, entry] of Object.entries(results)) {
    facts[key] = entry.facts;
    await fs.writeFile(path.join(dir, 'screenshots', key + '.png'), entry.screenshot);
  }
  await fs.writeFile(path.join(dir, 'dom-facts.json'), JSON.stringify(facts, null, 2) + '\n');
  console.log(`Recorded ${Object.keys(results).length} screenshots and DOM facts to ${path.relative(root, dir)}`);
}

async function compareBaseline(dir, results) {
  const baselineFacts = JSON.parse(await fs.readFile(path.join(dir, 'dom-facts.json'), 'utf8'));
  const failures = [];
  for (const [key, entry] of Object.entries(results)) {
    try {
      assert.deepEqual(entry.facts, baselineFacts[key]);
    } catch {
      failures.push(`DOM facts differ for ${key}`);
    }
    const baselinePath = path.join(dir, 'screenshots', key + '.png');
    let baselinePng;
    try { baselinePng = await fs.readFile(baselinePath); }
    catch { failures.push(`missing baseline screenshot for ${key}`); continue; }
    const cmp = comparePNGs(baselinePng, entry.screenshot);
    if (!cmp.equal) failures.push(`screenshot differs for ${key}: ${cmp.reason}`);
  }
  for (const key of Object.keys(baselineFacts)) {
    if (!(key in results)) failures.push(`baseline has ${key} but the current run did not capture it`);
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const recordIndex = args.indexOf('--record');
  const compareIndex = args.indexOf('--compare');
  if (recordIndex === -1 && compareIndex === -1) {
    console.error('Usage: node design-gallery/parity.mjs --record <dir> | --compare <dir>');
    process.exitCode = 1;
    return;
  }
  const results = await recordAll();
  if (recordIndex !== -1) {
    const dir = path.resolve(root, args[recordIndex + 1]);
    await writeBaseline(dir, results);
    return;
  }
  const dir = path.resolve(root, args[compareIndex + 1]);
  const failures = await compareBaseline(dir, results);
  if (failures.length) {
    console.error(`parity: ${failures.length} failure(s)`);
    for (const failure of failures) console.error('  - ' + failure);
    process.exitCode = 1;
    return;
  }
  console.log(`parity: PASS (${Object.keys(results).length} states compared against ${path.relative(root, dir)})`);
}

await main();
