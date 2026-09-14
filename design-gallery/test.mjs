/** Integrated appearance gallery regression test.
 * Firebase SDK requests are replaced with deterministic browser doubles and
 * every other network request is blocked. No production account, schedule,
 * token, or Firebase write is used by this suite.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.hosting-gallery');
const out = path.join(root, 'design-gallery-results');
await fs.mkdir(path.join(out, 'screenshots'), {recursive: true});

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const protectedNames = [
  'app.js', 'song-app.js', 'index.html', 'permissions.js',
  'department-workflows.js', 'song-lib.js', 'song-app.css', 'song-seed.js',
  'firebase-config.js', 'firebase.json', 'sw.js', 'seed-data.js',
  'firestore.rules'
];
const hashes = async () => Object.fromEntries(await Promise.all(
  protectedNames.map(async name => [name, hash(await fs.readFile(path.join(root, name)))])
));

const before = await hashes();
execFileSync(process.execPath, [path.join(root, 'design-gallery/build.mjs')], {stdio: 'inherit'});
assert.deepEqual(await hashes(), before, 'Gallery build must not modify original source/runtime files');

const TEST_PIN = '2468';
const CHANGED_PIN = '3579';
const pinHash = hash(Buffer.from(TEST_PIN));
const members = ['B. Anthony', 'E. Simon', 'D. Caleb', 'S. Lisa', 'M. Chloe'];
const services = [
  {
    date: '2026-07-01', service: 'Morning', worship: 'Sabbath Day', time: '09:00',
    choirSong: '#311 I Repent of My Sin',
    assignments: {
      Presider: 'B. Anthony', Sermon: 'B. Anthony',
      'Prayer of Thanks': 'E. Simon', 'Usher #1': 'S. Lisa'
    }
  },
  {
    date: '2026-07-02', service: 'Evening', worship: 'Sabbath Day', time: '20:00',
    choirSong: '',
    assignments: {
      Presider: 'E. Simon', 'Media Booth #1': 'E. Simon',
      'Usher #1': 'D. Caleb', 'Usher #2': 'S. Lisa'
    }
  },
  {
    date: '2026-07-03', service: 'Morning', worship: 'Third Day', time: '09:00',
    choirSong: '', assignments: {Presider: 'D. Caleb', 'Usher #1': 'D. Chloe'}
  },
  {
    date: '2026-07-06', service: 'Afternoon', worship: 'Prayer Week', time: '15:00',
    choirSong: '', assignments: {Presider: 'S. Lisa', 'Usher #1': 'D. Caleb'}
  }
];

const departmentMap = {
  Worship: ['B. Anthony', 'E. Simon'],
  'Usher Sisters': ['S. Lisa', 'M. Chloe'],
  'Usher Brothers': ['D. Caleb'],
  Lobby: [], Translation: [], Media: ['E. Simon'],
  'Parking Lot': [], Offering: []
};
const fixture = {
  services,
  holdSettings: true,
  docs: {
    'app/settings': {
      sitePinHash: pinHash,
      pinHash,
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
    'app/nameMap': {map: {'B. Anthony L': 'B. Anthony', 'D. Chloe': 'M. Chloe'}},
    'app/presiders': {names: ['B. Anthony', 'E. Simon']},
    'app/songSettings': {pinHash},
    'setlists/2026-07-01_morning': {
      id: '2026-07-01_morning', date: '2026-07-01',
      worshipType: 'Sabbath Day', serviceLabel: 'Morning',
      presider: 'B. Anthony', songs: ['001'], status: 'planned', updatedAt: 1
    },
    'setlists/2026-07-02_evening': {
      id: '2026-07-02_evening', date: '2026-07-02',
      worshipType: 'Sabbath Day', serviceLabel: 'Evening',
      presider: 'E. Simon', songs: ['002'], status: 'planned', updatedAt: 1
    },
    'requests/req-worship': {
      id: 'req-worship', svcId: '2026-07-01_morning', name: 'D. Caleb',
      date: '2026-07-01', service: 'Morning', worship: 'Sabbath Day',
      duty: 'Presider', department: 'Worship', status: 'pending',
      requesterUid: 'member:D. Caleb', createdAt: Date.parse('2026-06-30T12:00:00Z')
    }
  }
};

function authRecords(forcedMember = '') {
  const records = {
    'B. Anthony': {
      pin: TEST_PIN,
      claims: {
        memberId: 'B. Anthony', memberName: 'B. Anthony', role: 'admin',
        roles: ['admin'], departments: [], admin: true, mustChangePin: false,
        roleVersion: 1
      }
    },
    'E. Simon': {
      pin: TEST_PIN,
      claims: {
        memberId: 'E. Simon', memberName: 'E. Simon', role: 'departmentLeader',
        roles: ['departmentLeader'], departments: ['Media'], mustChangePin: false,
        roleVersion: 1
      }
    },
    'D. Caleb': {
      pin: TEST_PIN,
      claims: {
        memberId: 'D. Caleb', memberName: 'D. Caleb', role: 'member',
        roles: ['member'], departments: [], mustChangePin: false, roleVersion: 1
      }
    },
    'S. Lisa': {
      pin: TEST_PIN,
      claims: {
        memberId: 'S. Lisa', memberName: 'S. Lisa', role: 'member',
        roles: ['member'], departments: [], mustChangePin: false, roleVersion: 1
      }
    }
  };
  if (forcedMember && records[forcedMember]) records[forcedMember].claims.mustChangePin = true;
  return records;
}

const report = {
  passed: false,
  checks: [],
  errors: [],
  blockedExternalRequests: [],
  screenshots: [],
  scope: 'HTTP browser, mocked Firebase SDK, real app domain handlers, no production writes'
};
function check(name, result, expected = true) {
  assert.deepEqual(result, expected, name);
  report.checks.push({name, passed: true});
  console.log('PASS', name);
}

const assets = new Map(await Promise.all(
  (await fs.readdir(stage)).map(async name => [name, await fs.readFile(path.join(stage, name))])
));
const firestoreMock = await fs.readFile(path.join(root, 'live-design/fixture-firestore.js'), 'utf8');
const browser = await chromium.launch();
const origin = 'http://localhost:8134';
const js = body => ({body, contentType: 'text/javascript'});

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
      window.__fixtureAuthCount = (window.__fixtureAuthCount || 0) + 1;
      authListener(auth.currentUser);
      return {user: auth.currentUser};
    };
    export const signOut = async _auth => {
      auth.currentUser = null;
      authListener(null);
    };
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
        return {data: {
          token: 'fixture-token:' + encodeURIComponent(id), memberId: id, memberName: id,
          mustChangePin: record.claims.mustChangePin === true
        }};
      }
      if (name === 'changeMemberPin') {
        if (!record) fail('permission-denied');
        record.pin = String(data.newPin);
        record.claims.mustChangePin = false;
        return {data: {ok: true}};
      }
      return {data: {ok: true}};
    };
  `;
}

async function make({member = '', forcedMember = ''} = {}) {
  const context = await browser.newContext({
    viewport: {width: 390, height: 850},
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    timezoneId: 'America/Los_Angeles'
  });
  await context.addInitScript(({fixtureValue, records, memberValue}) => {
    window.__designFixture = fixtureValue;
    window.__fixtureAuthRecords = records;
    localStorage.setItem('UNRELATED', 'keep');
    if (memberValue) localStorage.setItem('wds-me', memberValue);
  }, {fixtureValue: fixture, records: authRecords(forcedMember), memberValue: member});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      const name = url.pathname.slice(1) || 'index.html';
      const data = assets.get(name);
      if (!data) {
        await route.fulfill({status: 404, body: 'not found'});
        return;
      }
      const contentType = name.endsWith('.js') ? 'text/javascript' :
        name.endsWith('.css') ? 'text/css' :
        name.endsWith('.html') ? 'text/html' :
        name.endsWith('.svg') ? 'image/svg+xml' : 'application/json';
      await route.fulfill({body: data, contentType});
      return;
    }
    if (url.href.endsWith('/firebase-app.js')) {
      await route.fulfill(js('export const initializeApp = config => { window.__apps = (window.__apps || 0) + 1; return {config}; };'));
      return;
    }
    if (url.href.endsWith('/firebase-firestore.js')) {
      await route.fulfill(js(firestoreMock));
      return;
    }
    if (url.href.endsWith('/firebase-auth.js')) {
      await route.fulfill(js(authModule()));
      return;
    }
    if (url.href.endsWith('/firebase-functions.js')) {
      await route.fulfill(js(functionsModule()));
      return;
    }
    if (url.href.endsWith('/firebase-messaging.js')) {
      await route.fulfill(js('export const isSupported = async () => false;'));
      return;
    }
    report.blockedExternalRequests.push({url: route.request().url(), method: route.request().method()});
    await route.fulfill({status: 503, body: 'blocked by test'});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.clock.setSystemTime(new Date('2026-07-01T12:00:00-07:00'));
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__mockLive);
  return {context, page};
}

async function releaseSettings(page) {
  await page.evaluate(() => __mockLive.emit('app/settings', __designFixture.docs['app/settings']));
  await page.waitForTimeout(180);
}

async function unlockSite(page) {
  await page.locator('#site-pin-input').fill(TEST_PIN);
  await page.locator('[data-act="site-unlock"] button').click();
  await page.waitForSelector('#member-login');
}

async function login(page, member, forced = false) {
  await page.locator('#member-login').selectOption(member);
  await page.locator('#member-pin').fill(TEST_PIN);
  await page.locator('[data-act="member-login"] button').click();
  if (forced) {
    await page.waitForSelector('#member-new-pin');
    return;
  }
  await page.waitForFunction(() => !document.querySelector('nav.tabs')?.classList.contains('hidden'));
  await page.waitForTimeout(180);
}

async function changeForcedPin(page) {
  await page.locator('#member-new-pin').fill(CHANGED_PIN);
  await page.locator('#member-new-pin-confirm').fill(CHANGED_PIN);
  await page.locator('[data-act="member-change-pin"] button').click();
  await page.waitForFunction(() => !document.querySelector('nav.tabs')?.classList.contains('hidden'));
}

async function choose(page, mode) {
  if (!await page.locator('.wd-design-dialog[open]').count()) {
    await page.locator('[data-design-open]:visible').first().click();
  }
  await page.locator(`.wd-design-dialog[open] [data-design-select="${mode}"]`).click();
  await page.waitForFunction(expected => window.WorshipDesign?.getMode() === expected, mode);
  await page.waitForTimeout(180);
}

async function navigate(page, tab) {
  await page.locator(`nav.tabs [data-tab="${tab}"]`).click();
  await page.waitForTimeout(180);
}

const domainWrites = page => page.evaluate(() => __mockLive.writes.filter(write =>
  /^(schedule\/|setlists\/|songStats\/|requests\/|app\/settings$|app\/departments$)/.test(write.path)
));

const sessions = new Set();
async function closeSession(session) {
  if (!session) return;
  sessions.delete(session.context);
  await session.context.close();
}

let current;
try {
  check('Original repository sources unchanged', await hashes(), before);
  check('Four-choice release manifest staged', JSON.parse(assets.get('design-gallery-release.json')).choices,
    ['classic', 'prism', 'navy', 'aurora']);
  check('Permissions runtime asset staged', assets.has('permissions.js'));
  check('No rules or functions staged', assets.has('firestore.rules') || assets.has('functions'), false);

  current = await make();
  sessions.add(current.context);
  const page = current.page;
  await page.waitForTimeout(260);
  check('Appearance offer hidden until shared settings arrive', await page.locator('.wd-design-dialog').count(), 0);
  check('Site passcode gate is visible before unlock', await page.locator('#site-pin-input').count(), 1);
  await releaseSettings(page);
  check('Appearance offer remains behind site passcode', await page.locator('.wd-design-dialog').count(), 0);
  await unlockSite(page);
  check('Member authentication gate is visible after site unlock', await page.locator('#member-login').count(), 1);
  check('Navigation is hidden before member authentication', await page.locator('nav.tabs').evaluate(node => node.classList.contains('hidden')));
  await login(page, 'B. Anthony');
  await page.waitForSelector('.wd-design-dialog[open]');

  const tiles = await page.locator('[data-design-select]').evaluateAll(nodes => nodes.map(node => ({
    mode: node.dataset.designSelect,
    name: node.querySelector('strong')?.childNodes[0]?.textContent.trim()
  })));
  check('Gallery exposes all four exact design modes', tiles.map(tile => tile.mode), ['classic', 'prism', 'navy', 'aurora']);
  check('Gallery exposes all four exact design names', tiles.map(tile => tile.name),
    ['Original', 'Prism', 'Navy & Cream', 'Aurora']);
  check('Chooser describes one shared app', await page.locator('#wd-design-description').innerText()
    .then(text => text.includes('One app') && text.includes('shared schedule') && text.includes('permissions')));
  const writesBeforeSwitch = await domainWrites(page);
  await page.keyboard.press('Escape');
  for (const mode of ['classic', 'prism', 'navy', 'aurora']) {
    await choose(page, mode);
    check('Switches to ' + mode, await page.evaluate(() => WorshipDesign.getMode()), mode);
    check(mode + ' keeps the same authenticated member', await page.evaluate(() => localStorage.getItem('wds-me')), 'B. Anthony');
    check(mode + ' appearance switch creates no domain writes', await domainWrites(page), writesBeforeSwitch);
    check(mode + ' keeps one Firebase app', await page.evaluate(() => window.__apps), 1);
    if (mode === 'classic') check('Original shell mounted', await page.locator('.wrap header.app').count(), 1);
    if (mode === 'prism') check('Prism shell mounted', await page.locator('#wd-prism-root').count(), 1);
    if (mode === 'navy') check('Navy shell remains mounted', await page.locator('.wrap header.app').count(), 1);
    if (mode === 'aurora') check('Aurora shell mounted', await page.locator('#wd-aurora-root').count(), 1);
  }
  check('Unrelated local storage survives all design switches', await page.evaluate(() => localStorage.getItem('UNRELATED')), 'keep');

  await page.evaluate(() => {
    const service = __designFixture.services[0];
    __mockLive.emit('schedule/2026-07-01_morning', {
      ...service,
      assignments: {...service.assignments, 'Translation #1': 'B. Anthony'}
    });
  });
  await page.waitForFunction(() => Number(localStorage.getItem('wds-unread-B. Anthony') || 0) > 0);
  check('New duty creates a My Duties badge', await page.locator('#tab-my .dot').count(), 1);
  check('New duty appears in the top alert banner', await page.locator('#banners .banner.alert').allInnerTexts()
    .then(texts => texts.some(text => text.toLowerCase().includes('new duty'))));
  await navigate(page, 'my');
  check('Opening My Duties clears its unread badge', await page.locator('#tab-my .dot').count(), 0);
  check('My Duties shows the recent new-duty update', await page.locator('.alert-item').innerText()
    .then(text => text.includes('New duty')));

  await navigate(page, 'manage');
  check('Admin sees Manage', await page.locator('#tab-manage').isVisible());
  check('Admin sees multi-department Manage selector', await page.locator('#manage-dept').evaluate(select =>
    [...select.options].map(option => option.textContent)),
  ['All Departments', 'Worship', 'Usher Sisters', 'Usher Brothers', 'Lobby', 'Translation', 'Media', 'Parking Lot', 'Offering']);
  check('Manage alert banner shows request and conflict attention', await page.locator('#banners .banner.alert').allInnerTexts()
    .then(texts => texts.some(text => text.includes('request') && text.includes('conflict'))));

  await navigate(page, 'my');
  const requestOpen = page.locator('[data-act="req-open"]').first();
  check('My Duties includes a change-request action', await requestOpen.count(), 1);
  await requestOpen.click();
  const note = page.locator('[data-chg="req-note"]').first();
  await note.fill('Draft survives all four designs');
  for (const mode of ['prism', 'navy', 'aurora', 'classic']) {
    await choose(page, mode);
    check('Unsent change-request note survives switch to ' + mode,
      await page.locator('[data-chg="req-note"]').first().inputValue(), 'Draft survives all four designs');
  }

  await navigate(page, 'my');
  const openSongs = page.locator('[data-act="open-songs"]').first();
  check('Presider Home entry is present', await openSongs.count(), 1);
  await navigate(page, 'songs');
  await page.waitForSelector('#song-root .ns-tabs');
  check('Presider starts on Home', await page.locator('#song-root .ns-tabs button.active').innerText(), 'Home');
  check('Presider Home shows My Services', await page.locator('#song-root').innerText().then(text => text.includes('My Services')));
  check('Presider has no Services destination', await page.locator('#song-root .ns-tabs [data-tab="services"]').count(), 0);
  check('Presider has exactly Home, Library, Insights tabs', await page.locator('#song-root .ns-tabs button').allTextContents(),
    ['Home', 'Library', 'Insights']);
  await page.locator('#song-root [data-song-act="home-scope"][data-scope="all"]').click();
  await page.waitForTimeout(100);
  check('Presider Home switches to All Services', await page.locator('#song-root').innerText().then(text => text.includes('All Services')));
  await page.locator('#song-root [data-song-act="home-scope"][data-scope="mine"]').click();
  await page.waitForTimeout(100);
  check('Presider Home returns to My Services', await page.locator('#song-root').innerText().then(text => text.includes('My Services')));
  await navigate(page, 'schedule');

  await choose(page, 'prism');
  const prismMonth = page.locator('[data-aurora="month"]').first();
  await page.waitForSelector('[data-prism="date"][data-date="2026-07-01"]');
  const prismMonthBefore = await page.locator('.prism-month h2').innerText();
  await page.locator('[data-aurora="month"][data-step="1"]').click();
  await page.waitForTimeout(120);
  const prismMonthAfter = await page.locator('.prism-month h2').innerText();
  check('Prism next-month control changes the displayed month', prismMonthAfter !== prismMonthBefore);
  await page.locator('[data-aurora="month"][data-step="-1"]').click();
  await page.waitForTimeout(120);
  check('Prism previous-month control restores the displayed month', await page.locator('.prism-month h2').innerText(), prismMonthBefore);
  await page.locator('[data-prism="date"][data-date="2026-07-01"]').click();
  await page.waitForTimeout(120);
  check('Prism day control selects the choir-song service', await page.locator('[data-prism="date"][data-date="2026-07-01"]').getAttribute('aria-pressed'), 'true');
  check('Prism renders the canonical choir song', await page.locator('body').innerText().then(text => text.includes('#311 I Repent of My Sin')));
  check('Prism schedule has a month control', await prismMonth.count(), 1);
  for (const mode of ['aurora', 'navy', 'classic']) {
    await choose(page, mode);
    check(mode + ' renders the same canonical choir song', await page.locator('body').innerText()
      .then(text => text.includes('#311 I Repent of My Sin')));
  }

  for (const mode of ['classic', 'prism', 'navy', 'aurora']) {
    await choose(page, mode);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForTimeout(70);
      check(mode + ' has no page overflow at ' + width + 'px',
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
  }
  check('No uncaught JavaScript errors in authenticated gallery flow', report.errors, []);
  await closeSession(current);
  current = undefined;

  current = await make({member: 'E. Simon'});
  sessions.add(current.context);
  await releaseSettings(current.page);
  await unlockSite(current.page);
  await login(current.page, 'E. Simon');
  check('Leader sees Manage', await current.page.locator('#tab-manage').isVisible());
  await navigate(current.page, 'manage');
  const leaderOptions = await current.page.locator('#manage-dept option').allTextContents();
  check('Leader Manage selector is scoped to configured departments', leaderOptions, ['Worship', 'Media']);
  check('Leader cannot see the global Manage option', leaderOptions.includes('All Departments'), false);
  for (const mode of ['prism', 'navy', 'aurora', 'classic']) {
    await choose(current.page, mode);
    await navigate(current.page, 'manage');
    check('Leader-only Manage remains visible in ' + mode, await current.page.locator('#tab-manage').isVisible());
    check('Leader scope remains limited in ' + mode, await current.page.locator('#manage-dept option').allTextContents(), ['Worship', 'Media']);
  }
  check('No uncaught JavaScript errors in leader flow', report.errors, []);
  await closeSession(current);
  current = undefined;

  current = await make();
  sessions.add(current.context);
  await releaseSettings(current.page);
  await unlockSite(current.page);
  await login(current.page, 'D. Caleb');
  check('Unauthorized member can use the authenticated app', await current.page.locator('nav.tabs').isVisible());
  check('Unauthorized member cannot see Manage', await current.page.locator('#tab-manage').isVisible(), false);
  check('Unauthorized member has no visible Manage destination', await current.page.locator('nav.tabs').allTextContents()
    .then(labels => labels.includes('Manage')), false);
  await closeSession(current);
  current = undefined;

  current = await make({forcedMember: 'E. Simon'});
  sessions.add(current.context);
  await releaseSettings(current.page);
  await unlockSite(current.page);
  await login(current.page, 'E. Simon', true);
  check('Forced PIN account keeps navigation hidden', await current.page.locator('nav.tabs').isVisible(), false);
  check('Forced PIN account sees the required change form', await current.page.locator('#member-new-pin').count(), 1);
  await changeForcedPin(current.page);
  check('Forced PIN flow opens the app after the new PIN is saved', await current.page.locator('nav.tabs').isVisible());
  check('Forced PIN form is gone after completion', await current.page.locator('#member-new-pin').count(), 0);
  check('Forced PIN member identity is restored', await current.page.evaluate(() => localStorage.getItem('wds-me')), 'E. Simon');
  check('No uncaught JavaScript errors in forced PIN flow', report.errors, []);
  await closeSession(current);
  current = undefined;

  const ownedPaths = [
    path.join(root, 'design-gallery/test.mjs'),
    path.join(root, 'design-gallery/README.md'),
    path.join(root, 'design-gallery/STATUS.md'),
    path.join(root, '.github/workflows/design-gallery-qa.yml')
  ];
  for (const ownedPath of ownedPaths) {
    const content = await fs.readFile(ownedPath, 'utf8');
    check(path.basename(ownedPath) + ' has no typographic dash', /[\u2013\u2014]/u.test(content), false);
  }
  report.passed = true;
  console.log('PASS Appearance gallery verification complete');
} catch (error) {
  report.errors.push(error.stack || String(error));
  throw error;
} finally {
  for (const context of sessions) await context.close();
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
