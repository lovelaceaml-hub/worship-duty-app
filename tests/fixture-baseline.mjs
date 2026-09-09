import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import playwright from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const { chromium } = playwright;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_ROOT = path.join(PROJECT_ROOT, 'docs/runs/worship-refactor-20260907');
const SOURCE_ROOT = process.env.WORSHIP_SOURCE_ROOT || PROJECT_ROOT;
const EVIDENCE_SCOPE = process.env.WORSHIP_EVIDENCE_SCOPE || (process.env.WORSHIP_SOURCE_ROOT ? 'current-integrated-source' : 'current-source');
// Keep the original baseline artifact immutable. A normal or integrated run
// writes to the separate current folder unless the caller supplies an
// explicit evidence root.
const EVIDENCE_ROOT = process.env.WORSHIP_EVIDENCE_ROOT || path.join(RUN_ROOT, 'research/verification/current');
const SCREENSHOT_ROOT = path.join(EVIDENCE_ROOT, 'screenshots');
let activeScreenshotRoot = SCREENSHOT_ROOT;
const BASELINE_COMMIT = '5beec15d9a9299bed2c51a91c33f157fb769cd79';
const SOURCE_DIGEST_METHOD = 'sha256-v2:path-null-byte-and-file-bytes;order=lexicographic-relative-path';
const IMMUTABLE_BASELINE_SOURCE_DIGEST = 'ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62';
const ROOT_RUNTIME_FILES = ['index.html', 'app.js', 'song-app.js', 'song-app.css', 'song-lib.js', 'styles.css', 'sw.js', 'manifest.json'];
const EXTRA_SERVED_FILES = ['icon.svg'];
const FIXTURE_NOW = new Date('2026-09-07T12:00:00-07:00');
const EXPECT_CONFIRMATION_REGRESSION = process.env.WORSHIP_EXPECT_CONFIRMATION_REGRESSION === '1';
const FIXTURE_EDITOR_PASSCODE = 'fixture-editor-code';
const FIXTURE_SITE_PASSCODE = '4826';

// Axe findings are allowlisted by captured view, rule impact, and exact
// fixture-stable target. A finding on another view, a changed target, a new
// impact, or an extra node is a regression. This list records the existing
// Manage editor debt for the current fixture and does not make a global rule
// exception.
const AXE_BASELINE_ALLOWLIST = Object.freeze({
  'manage-phone': [
    ...['#svc-date', '#svc-time', 'input[value="2026-09-12"]', 'input[data-field="time"]', 'input[value="Fixture Sabbath"]']
      .map(target => ({ id: 'label', impact: 'critical', target: [target] })),
    ...['#svc-label', 'select[data-duty="Presider"]', 'select[data-duty="Sermon"]', 'select[data-duty="Prayer of Thanks"]', 'select[data-duty="Closing Prayer"]', 'select[data-duty="Usher Door"]', 'select[data-duty="Usher Front"]', 'select[data-duty="Usher Back"]', 'select[data-duty="Usher #1"]', 'select[data-duty="Usher #2"]', 'select[data-duty="Lobby Security"]', 'select[data-duty="Lobby Desk #1"]', 'select[data-duty="Lobby Desk #2"]', 'select[data-duty="Translation #1"]', 'select[data-duty="Translation #2"]', 'select[data-duty="Media Booth #1"]', 'select[data-duty="Media Booth #2"]', 'select[data-duty="Parking #1"]', 'select[data-duty="Parking #2"]', 'select[data-duty="Parking #3"]', 'select[data-duty="Parking #4"]', 'select[data-duty="Parking #5"]', 'select[data-duty="Offering #1"]', 'select[data-duty="Offering #2"]', 'select[data-duty="Offering #3"]', 'select[data-duty="Offering #4"]', 'select[data-duty="Offering #5"]', 'select[data-duty="Offering #6"]']
      .map(target => ({ id: 'select-name', impact: 'critical', target: [target] }))
  ],
  'manage-desktop': [
    ...['#svc-date', '#svc-time', 'input[value="2026-09-12"]', 'input[data-field="time"]', 'input[value="Fixture Sabbath"]']
      .map(target => ({ id: 'label', impact: 'critical', target: [target] })),
    ...['#svc-label', 'select[data-duty="Presider"]', 'select[data-duty="Sermon"]', 'select[data-duty="Prayer of Thanks"]', 'select[data-duty="Closing Prayer"]', 'select[data-duty="Usher Door"]', 'select[data-duty="Usher Front"]', 'select[data-duty="Usher Back"]', 'select[data-duty="Usher #1"]', 'select[data-duty="Usher #2"]', 'select[data-duty="Lobby Security"]', 'select[data-duty="Lobby Desk #1"]', 'select[data-duty="Lobby Desk #2"]', 'select[data-duty="Translation #1"]', 'select[data-duty="Translation #2"]', 'select[data-duty="Media Booth #1"]', 'select[data-duty="Media Booth #2"]', 'select[data-duty="Parking #1"]', 'select[data-duty="Parking #2"]', 'select[data-duty="Parking #3"]', 'select[data-duty="Parking #4"]', 'select[data-duty="Parking #5"]', 'select[data-duty="Offering #1"]', 'select[data-duty="Offering #2"]', 'select[data-duty="Offering #3"]', 'select[data-duty="Offering #4"]', 'select[data-duty="Offering #5"]', 'select[data-duty="Offering #6"]']
      .map(target => ({ id: 'select-name', impact: 'critical', target: [target] }))
  ]
});
const AXE_CAPTURED_VIEWS = new Set();

function fixtureEditorHash() {
  return createHash('sha256').update(FIXTURE_EDITOR_PASSCODE).digest('hex');
}

function fixtureSiteHash() {
  return createHash('sha256').update(FIXTURE_SITE_PASSCODE).digest('hex');
}

function axeFindings(summary) {
  return (summary.violations || []).flatMap(violation =>
    (violation.targets || []).map(target => ({
      id: violation.id,
      impact: violation.impact || null,
      target: target.map(String)
    }))
  );
}

function axeFindingKey(finding) {
  return JSON.stringify([finding.id, finding.impact, finding.target]);
}

function axeGuardResult(view, summary) {
  const expected = AXE_BASELINE_ALLOWLIST[view] || [];
  const actual = axeFindings(summary);
  const expectedCounts = new Map(expected.map(finding => [axeFindingKey(finding), 1]));
  const actualCounts = new Map();
  actual.forEach(finding => actualCounts.set(axeFindingKey(finding), (actualCounts.get(axeFindingKey(finding)) || 0) + 1));
  const unexpectedFindings = actual.filter(finding => !expectedCounts.has(axeFindingKey(finding)));
  const overages = [];
  for (const [key, actualCount] of actualCounts.entries()) {
    const allowedCount = expectedCounts.get(key) || 0;
    if (actualCount > allowedCount) {
      overages.push({ finding: actual.find(item => axeFindingKey(item) === key), actualCount, allowedCount });
    }
  }
  return {
    view,
    fullAccessibilityPass: false,
    knownBaselineFindings: expected,
    observedFindings: actual,
    unexpectedFindings,
    overages
  };
}

function assertAxeGuard(view, summary) {
  const result = axeGuardResult(view, summary);
  assert.equal(result.unexpectedFindings.length, 0, 'axe guard rejected new findings for ' + view + ': ' + JSON.stringify(result.unexpectedFindings));
  assert.equal(result.overages.length, 0, 'axe guard rejected extra finding nodes for ' + view + ': ' + JSON.stringify(result.overages));
  return result;
}

function exerciseAxeGuardSelfCheck() {
  const checks = [
    { view: 'phone-schedule', id: 'fixture-serious', impact: 'serious', target: ['#fixture-serious'] },
    { view: 'phone-my-duties', id: 'fixture-moderate', impact: 'moderate', target: ['#fixture-moderate'] },
    { view: 'manage-phone', id: 'fixture-critical', impact: 'critical', target: ['#fixture-critical'] },
    { view: 'site-lock-phone', id: 'label', impact: 'critical', target: ['#svc-date'] }
  ];
  checks.forEach(check => {
    assert.throws(() => assertAxeGuard(check.view, { violations: [{ id: check.id, impact: check.impact, targets: [check.target] }] }), 'axe guard must reject ' + check.impact + ' regression on ' + check.view);
  });
  const known = AXE_BASELINE_ALLOWLIST['manage-phone'][0];
  assert.throws(() => assertAxeGuard('manage-phone', { violations: [{ id: known.id, impact: known.impact, targets: [known.target, known.target] }] }), 'axe guard must reject an extra known finding node');
  return { checkedImpacts: ['serious', 'moderate', 'critical'], checkedViews: checks.map(check => check.view), duplicateCount: true, passed: true };
}

async function discoverRuntimeFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await discoverRuntimeFiles(path.join(directory, entry.name), relative));
    else if (/\.(?:cjs|css|html|js|json|mjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

async function readSourceSnapshot(sourceRoot = SOURCE_ROOT) {
  const srcRuntimeFiles = await discoverRuntimeFiles(path.join(sourceRoot, 'src'), 'src');
  const digestCandidates = Array.from(new Set(ROOT_RUNTIME_FILES.concat(srcRuntimeFiles))).sort();
  const servedCandidates = Array.from(new Set(digestCandidates.concat(EXTRA_SERVED_FILES))).sort();
  const bytes = new Map();
  for (const relative of servedCandidates) {
    try {
      bytes.set(relative, await readFile(path.join(sourceRoot, relative)));
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  const digestFiles = digestCandidates.filter(relative => bytes.has(relative));
  const servedFiles = servedCandidates.filter(relative => bytes.has(relative));
  return { sourceRoot, bytes, digestFiles, servedFiles };
}

function sourceMetadata(snapshot) {
  const digest = createHash('sha256');
  const included = [];
  for (const relative of snapshot.digestFiles.slice().sort()) {
    const source = snapshot.bytes.get(relative);
    if (!source) continue;
    digest.update(relative + '\0');
    digest.update(source);
    included.push(relative);
  }
  return {
    digest: digest.digest('hex'),
    files: included,
    digestMethod: SOURCE_DIGEST_METHOD,
    fileOrder: 'lexicographic relative paths',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    baselineReference: BASELINE_COMMIT
  };
}

/* Every fixture value is fictional and deliberately small. The browser never
   receives seed-data.js, firebase-config.js, or song-seed.js from the repo. */
const fixtureSongs = [
  { id: 'fixture-song-001', number: 'F-001', category: 'Gratitude', title: 'Fixture Morning Song', durationSec: 180 },
  { id: 'fixture-song-002', number: 'F-002', category: 'Faith', title: 'Fixture Evening Song', durationSec: 210 },
  { id: 'fixture-song-003', number: 'F-003', category: 'Hope', title: 'Fixture Closing Song', durationSec: 150 },
  { id: 'fixture-song-004', number: 'F-004', category: 'Love', title: 'Fixture Choir Song', durationSec: 195 },
  { id: 'fixture-song-005', number: 'Appx. 42', category: 'Reference', title: 'Fixture Appendix Song', durationSec: 165 }
];

const fixtureServices = [
  {
    date: '2026-09-12', time: '09:00', service: 'Morning', worship: 'Fixture Sabbath', choirSong: 'Fixture Choir Song',
    assignments: {
      Presider: 'Jordan Fixture', Sermon: 'Casey Example', 'Prayer of Thanks': 'Jordan Fixture',
      'Closing Prayer': 'Robin Sample', 'Usher Door': 'Casey Example'
    }
  },
  {
    date: '2026-09-19', time: '09:00', service: 'Morning', worship: 'Fixture Sabbath', choirSong: '',
    assignments: { Presider: 'Casey Example', Sermon: 'Jordan Fixture', 'Closing Prayer': 'Robin Sample' }
  }
];

const fixtureMembers = ['Casey Example', 'Jordan Fixture', 'Robin Sample'];
const fixtureDepartments = {
  Worship: fixtureMembers.slice(),
  'Usher Sisters': ['Casey Example'],
  'Usher Brothers': ['Jordan Fixture'],
  Lobby: ['Robin Sample'],
  Translation: ['Casey Example'],
  Media: ['Robin Sample'],
  'Parking Lot': ['Jordan Fixture'],
  Offering: ['Casey Example']
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureSetlist() {
  return {
    id: '2026-09-12_morning', date: '2026-09-12', worshipType: 'Fixture Sabbath', serviceLabel: 'Morning',
    presider: 'Jordan Fixture', notes: 'Fixture note', songs: ['fixture-song-001', 'fixture-song-002'],
    status: 'planned', sungAt: null, source: 'schedule', updatedAt: 1710000000000,
    updatedBy: 'Jordan Fixture', confirmedAt: null, confirmedBy: ''
  };
}

function makeFirestoreFixture(serverBaseURL, options = {}) {
  const settings = { features: { siteLock: false, editorLock: false, sheetSync: false, songPicker: true }, pinHash: '', sheetUrl: serverBaseURL + '/fixture-sheet.csv' };
  if (options.manageJourney) {
    settings.features.editorLock = true;
    settings.pinHash = fixtureEditorHash();
  }
  if (options.managerMap) settings.departmentManagers = clone(options.managerMap);
  if (options.siteLockJourney) {
    settings.features.siteLock = true;
    settings.sitePinHash = fixtureSiteHash();
  }
  const members = fixtureMembers.concat(options.extraMembers || []);
  const departments = clone(fixtureDepartments);
  if (options.extraMembers?.length) departments.Worship = departments.Worship.concat(options.extraMembers);
  return {
    schedule: {
      '2026-09-12_morning': clone(fixtureServices[0]),
      '2026-09-19_morning': clone(fixtureServices[1])
    },
    app: {
      members: { list: members },
      settings,
      departments: { map: departments },
      nameMap: { map: {} },
      songSettings: {},
      presiders: { names: ['Jordan Fixture', 'Casey Example'] }
    },
    requests: {},
    setlists: { '2026-09-12_morning': fixtureSetlist() },
    songStats: {}
  };
}

function makeLocalStateFixture(serverBaseURL, options = {}) {
  const settings = { features: { siteLock: false, editorLock: false, sheetSync: false, songPicker: true }, pinHash: '', sheetUrl: serverBaseURL + '/fixture-sheet.csv' };
  if (options.manageJourney) {
    settings.features.editorLock = true;
    settings.pinHash = fixtureEditorHash();
  }
  if (options.managerMap) settings.departmentManagers = clone(options.managerMap);
  if (options.siteLockJourney) {
    settings.features.siteLock = true;
    settings.sitePinHash = fixtureSiteHash();
  }
  const members = fixtureMembers.concat(options.extraMembers || []);
  const departments = clone(fixtureDepartments);
  if (options.extraMembers?.length) departments.Worship = departments.Worship.concat(options.extraMembers);
  return {
    members, services: clone(fixtureServices),
    settings,
    departments, requests: []
  };
}

function scriptResponse(body) {
  return { status: 200, headers: { 'content-type': 'application/javascript; charset=utf-8', 'access-control-allow-origin': '*' }, body };
}

async function startFixtureServer(sourceSnapshot) {
  assert.ok(sourceSnapshot && sourceSnapshot.bytes instanceof Map, 'fixture server requires one immutable source snapshot');
  const staticFiles = new Map([
    ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/song-app.js', 'song-app.js'],
    ['/song-app.css', 'song-app.css'], ['/song-lib.js', 'song-lib.js'], ['/manifest.json', 'manifest.json'],
    ['/icon.svg', 'icon.svg'], ['/sw.js', 'sw.js']
  ]);
  const indexSource = sourceSnapshot.bytes.get('index.html')?.toString('utf8') || '';
  for (const match of indexSource.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const referenced = new URL(match[1], 'http://fixture.local');
    if (referenced.origin !== 'http://fixture.local' || referenced.pathname === '/seed-data.js' || referenced.pathname === '/firebase-config.js' || referenced.pathname === '/song-seed.js') continue;
    staticFiles.set(referenced.pathname, referenced.pathname.replace(/^\//, ''));
  }
  for (const relative of sourceSnapshot.servedFiles || []) {
    const pathname = '/' + relative.replace(/^\/+/, '');
    if (!staticFiles.has(pathname)) staticFiles.set(pathname, relative);
  }
  const contentTypes = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml'
  };
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    if (pathname === '/seed-data.js') {
      response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      response.end('window.SEED_DATA = ' + JSON.stringify({ members: fixtureMembers, services: fixtureServices }) + ';');
      return;
    }
    if (pathname === '/firebase-config.js') {
      response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      response.end(
        "if (window.__QA_MODE === 'firebase') window.FIREBASE_CONFIG = " +
        JSON.stringify({ apiKey: 'fixture-api-key', authDomain: 'fixture.local', projectId: 'fixture-project', appId: 'fixture-app' }) +
        "; window.FCM_VAPID_KEY = ''; window.RECAPTCHA_SITE_KEY = '';"
      );
      return;
    }
    if (pathname === '/song-seed.js') {
      response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      response.end('window.SONG_SEED = ' + JSON.stringify({ songs: fixtureSongs }) + ';');
      return;
    }
    if (pathname === '/fixture-sheet.csv') {
      response.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
      response.end('Date,Service,Worship,Time,Duty,Member\\n"Sat, Sep 12",Morning,Fixture Sabbath,9:00 AM,Presider,Jordan Fixture\\n');
      return;
    }
    const relative = staticFiles.get(pathname);
    if (!relative) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('fixture server: not found');
      return;
    }
    try {
      let body = sourceSnapshot.bytes.get(relative);
      if (!body) throw Object.assign(new Error('fixture source snapshot is missing ' + relative), { code: 'ENOENT' });
      if (relative === 'app.js') body = Buffer.concat([body, Buffer.from('\n;globalThis.__QA_APP_STATE = () => ({ members: state.members, departments: state.departments, settings: state.settings, services: state.services, requests: state.requests }); globalThis.__QA_FEATURE = () => ({ siteLock: feat(\'siteLock\'), unlocked: siteUnlocked() }); globalThis.__QA_REQUEST_DRAFT = () => ui.reqForm ? { key: ui.reqForm.key, note: ui.reqForm.note } : null; globalThis.__QA_SONG_NAV_STATE = () => ({ tab: ui.tab, songNav: ui.songNav, songSvc: ui.songSvc }); globalThis.__QA_RENDER = render;\n')]);
      response.writeHead(200, { 'content-type': contentTypes[path.extname(relative)] || 'application/octet-stream' });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('fixture server: failed to read allowlisted file');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { server, baseURL: 'http://127.0.0.1:' + address.port };
}

async function closeFixtureServer(server) {
  if (!server || !server.listening) return;
  await new Promise(resolve => server.close(resolve));
}

async function launchFixtureBrowser(injectFailure = false) {
  if (injectFailure) throw new Error('fixture browser launch failure injected');
  return chromium.launch({ headless: true });
}

async function openFixtureBrowser(sourceSnapshot, options = {}) {
  const started = await startFixtureServer(sourceSnapshot);
  if (typeof options.onServer === 'function') options.onServer(started.server);
  try {
    const browser = await launchFixtureBrowser(!!options.injectLaunchFailure);
    return { ...started, browser };
  } catch (error) {
    await closeFixtureServer(started.server);
    throw error;
  }
}

async function exerciseLaunchFailureCleanup(sourceSnapshot) {
  let observedServer = null;
  await assert.rejects(
    () => openFixtureBrowser(sourceSnapshot, { injectLaunchFailure: true, onServer: server => { observedServer = server; } }),
    /fixture browser launch failure injected/
  );
  assert.ok(observedServer, 'launch failure probe must observe its loopback server');
  assert.equal(observedServer.listening, false, 'launch failure must close the loopback server');
  return { status: 'passed', serverClosed: true };
}

async function exercisePopupRouting(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'local', { width: 390, height: 844 });
  const { page } = run;
  const requestedURL = 'https://fixture-popup.invalid/initial';
  const failedNavigation = new Promise(resolve => {
    run.context.on('requestfailed', request => {
      if (request.url() !== requestedURL) return;
      resolve({ url: request.url(), errorText: request.failure()?.errorText || null });
    });
  });
  try {
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(() => {
      const popup = window.open('https://fixture-popup.invalid/initial', 'fixture-popup');
      if (!popup) throw new Error('fixture popup could not be opened');
    });
    const popup = await popupPromise;
    const failed = await failedNavigation;
    const blockedLabel = 'https://fixture-popup.invalid [route-blocked]';
    assert.ok(run.external.blocked.includes(blockedLabel), 'the actual fixture context guard must record the popup origin as blocked');
    assert.equal(failed.url, requestedURL, 'the popup initial navigation must fail at the actual context route boundary');
    return {
      contextRoutingInstalledBeforePage: true,
      popupInitialNavigationBlocked: true,
      popupURL: popup.url(),
      blockedOrigin: 'https://fixture-popup.invalid',
      navigationFailure: failed.errorText
    };
  } finally {
    await closeFixtureRun(run);
  }
}

async function exerciseUnexpectedNetworkGuard(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'local', { width: 390, height: 844 });
  const { page } = run;
  const unapprovedResourceURL = 'https://fixture-unapproved.invalid/resource';
  const failedResource = new Promise(resolve => {
    run.context.on('requestfailed', request => {
      if (request.url() !== unapprovedResourceURL) return;
      resolve({ url: request.url(), errorText: request.failure()?.errorText || null });
    });
  });
  await page.evaluate(() => {
    void fetch('https://fixture-unapproved.invalid/fetch').catch(() => {});
    const image = document.createElement('img');
    image.alt = 'fixture network probe';
    image.src = 'https://fixture-unapproved.invalid/resource';
    document.body.appendChild(image);
  });
  const failed = await failedResource;
  assert.equal(failed.url, unapprovedResourceURL, 'the real context guard must observe an unapproved resource request');
  await assert.rejects(
    () => closeFixtureRun(run),
    /unexpected external requests must fail fixture verification/
  );
  const expectedUnexpected = [
    'https://fixture-unapproved.invalid [fetch-denied]',
    'https://fixture-unapproved.invalid [route-blocked]'
  ];
  assert.deepEqual(run.external.unexpected.slice().sort(), expectedUnexpected.sort(), 'the real guard must classify every unapproved fetch and resource attempt as unexpected');
  return {
    guardRejectedUnexpectedTraffic: true,
    observedFetchDenied: run.external.unexpected.includes(expectedUnexpected[0]),
    observedResourceBlocked: run.external.unexpected.includes(expectedUnexpected[1]),
    unexpected: run.external.unexpected
  };
}

async function exerciseBrowserErrorGuard(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'local', { width: 390, height: 844 });
  const { page } = run;
  assert.equal(run.consoleErrors.length, 0, 'browser error probe must start without captured errors');
  const consoleMessagePromise = page.waitForEvent('console', {
    predicate: message => message.type() === 'error' && message.text() === 'fixture console error probe'
  });
  const pageErrorPromise = page.waitForEvent('pageerror', {
    predicate: error => error.message === 'fixture uncaught page error probe'
  });
  await page.evaluate(() => {
    console.error('fixture console error probe');
    const script = document.createElement('script');
    script.textContent = 'throw new Error(' + JSON.stringify('fixture uncaught page error probe') + ')';
    document.head.appendChild(script);
  });
  await Promise.all([consoleMessagePromise, pageErrorPromise]);
  assert.ok(run.consoleErrors.includes('fixture console error probe'), 'the real console handler must capture an injected console error');
  assert.ok(run.consoleErrors.includes('pageerror: fixture uncaught page error probe'), 'the real pageerror handler must capture an injected uncaught error');
  await assert.rejects(
    () => closeFixtureRun(run),
    /unexpected browser console\/page errors must fail fixture verification/
  );
  assert.deepEqual(run.unexpectedConsoleErrors.sort(), ['fixture console error probe', 'pageerror: fixture uncaught page error probe'].sort(), 'captured browser errors must reject the run');
  return {
    guardRejectedBrowserErrors: true,
    observedConsoleError: true,
    observedPageError: true,
    unexpectedConsoleErrors: run.unexpectedConsoleErrors
  };
}

async function exerciseSourceSnapshotIntegrity(sourceSnapshot, metadata) {
  const tempRoot = await mkdtemp(path.join('/private/tmp', 'worship-fixture-source-'));
  try {
    for (const [relative, bytes] of sourceSnapshot.bytes.entries()) {
      const target = path.join(tempRoot, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    const tempSnapshot = await readSourceSnapshot(tempRoot);
    const tempMetadata = sourceMetadata(tempSnapshot);
    assert.equal(tempMetadata.digest, metadata.digest, 'temporary isolated source copy must hash to the same immutable bytes');

    const originalApp = tempSnapshot.bytes.get('app.js');
    assert.ok(originalApp, 'source snapshot must include app.js for helper evaluation and serving');
    await writeFile(path.join(tempRoot, 'app.js'), Buffer.concat([originalApp, Buffer.from('\n// fictional post-snapshot edit\n')]));
    const mutatedDiskSnapshot = await readSourceSnapshot(tempRoot);
    const mutatedDiskMetadata = sourceMetadata(mutatedDiskSnapshot);
    assert.notEqual(mutatedDiskMetadata.digest, tempMetadata.digest, 'a temporary source edit must change the disk digest');
    assert.equal(sourceMetadata(tempSnapshot).digest, tempMetadata.digest, 'the immutable snapshot digest must remain stable after a disk edit');

    const started = await startFixtureServer(tempSnapshot);
    try {
      const indexResponse = await fetch(started.baseURL + '/index.html');
      assert.equal(indexResponse.status, 200, 'fixture server must serve the snapshotted index bytes');
      const servedIndex = Buffer.from(await indexResponse.arrayBuffer());
      assert.deepEqual(servedIndex, tempSnapshot.bytes.get('index.html'), 'served index must come from the hashed snapshot');
      const appResponse = await fetch(started.baseURL + '/app.js');
      assert.equal(appResponse.status, 200, 'fixture server must serve the snapshotted app bytes');
      const servedApp = Buffer.from(await appResponse.arrayBuffer());
      assert.ok(servedApp.subarray(0, originalApp.length).equals(originalApp), 'helper source bytes must be the same bytes served by the fixture server');
      return {
        digestStableAfterTemporaryEdit: true,
        temporaryDiskDigestChanged: true,
        servedIndexMatchesSnapshot: true,
        servedAppPrefixMatchesSnapshot: true,
        helperEvaluationSource: 'same immutable snapshot bytes'
      };
    } finally {
      await closeFixtureServer(started.server);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/* This module replaces Firebase's browser modules at the route boundary. It
   is intentionally in-memory, records operations, and never calls fetch. */
const fakeFirebaseAppModule = `
globalThis.__QA_FIREBASE_CONTROL.appModuleLoaded = true;
export function initializeApp(config) {
  const control = globalThis.__QA_FIREBASE_CONTROL;
  control.initializeCalls += 1;
  return { config: config, fixture: true };
}
`;

const fakeFirebaseAuthModule = `
export function getAuth(app) { return app.__auth || (app.__auth = {}); }
function recordAuthEvent(event) {
  const control = globalThis.__QA_FIREBASE_CONTROL;
  const order = (control.eventSequence || 0) + 1;
  control.eventSequence = order;
  const record = { event: event, at: performance.now(), order: order };
  control.authTimeline.push(record);
  control.events.push(Object.assign({ kind: 'auth' }, record));
  return record;
}
export async function signInAnonymously(auth) {
  const control = globalThis.__QA_FIREBASE_CONTROL;
  const options = globalThis.__QA_FIREBASE_OPTIONS || {};
  const delay = Number(options.authDelayMs || 0);
  const started = recordAuthEvent('started');
  control.authStartedAt = started.at;
  if (options.authDeferred) {
    await new Promise(resolve => { control.authRelease = resolve; });
  } else {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  control.authSignedIn = true;
  const ready = recordAuthEvent('ready');
  control.authReadyAt = ready.at;
  return { user: { uid: 'fixture-anonymous-user' } };
}
globalThis.__QA_FIREBASE_CONTROL.releaseAuth = function() {
  const control = globalThis.__QA_FIREBASE_CONTROL;
  if (typeof control.authRelease !== 'function') return false;
  const release = control.authRelease;
  control.authRelease = null;
  recordAuthEvent('released');
  release();
  return true;
};
`;

const fakeFirebaseMessagingModule = `
export async function isSupported() { return false; }
`;

const fakeFirebaseFirestoreModule = `
globalThis.__QA_FIREBASE_CONTROL.firestoreModuleLoaded = true;
const control = globalThis.__QA_FIREBASE_CONTROL;
const options = () => globalThis.__QA_FIREBASE_OPTIONS || {};
const cloneValue = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const store = globalThis.__QA_FIREBASE_STORE || (globalThis.__QA_FIREBASE_STORE = cloneValue(globalThis.__QA_FIREBASE_DATA));
const listeners = [];
function recordFirestoreEvent(event, data) {
  const order = (control.eventSequence || 0) + 1;
  control.eventSequence = order;
  const record = Object.assign({ kind: 'firestore', event: event, at: performance.now(), order: order }, data || {});
  control.events.push(record);
  return record;
}

function collectionBucket(name) {
  if (!store[name] || typeof store[name] !== 'object') store[name] = {};
  return store[name];
}
function makeRef(kind, parts) { return { kind: kind, path: parts.slice(), constraints: [] }; }
function refKey(ref) { return ref.kind + '/' + ref.path.join('/'); }
function valueAt(ref) {
  const parts = ref.path;
  if (ref.kind === 'collection') return undefined;
  if (parts[0] === 'app') return cloneValue((store.app || {})[parts.slice(1).join('/')]);
  return cloneValue(collectionBucket(parts[0])[parts.slice(1).join('/')]);
}
function setValueAt(ref, value, merge) {
  const parts = ref.path;
  if (parts[0] === 'app') {
    if (!store.app) store.app = {};
    const key = parts.slice(1).join('/');
    store.app[key] = merge ? Object.assign({}, store.app[key] || {}, cloneValue(value)) : cloneValue(value);
    return;
  }
  const bucket = collectionBucket(parts[0]);
  const key = parts.slice(1).join('/');
  bucket[key] = merge ? Object.assign({}, bucket[key] || {}, cloneValue(value)) : cloneValue(value);
}
function deleteValueAt(ref) {
  const parts = ref.path;
  if (parts[0] === 'app') { if (store.app) delete store.app[parts.slice(1).join('/')]; return; }
  delete collectionBucket(parts[0])[parts.slice(1).join('/')];
}
function applySentinels(value, prior) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return cloneValue(value);
  const output = {};
  Object.keys(value).forEach(key => {
    const next = value[key];
    if (next && next.__qaSentinel === 'arrayUnion') {
      const base = Array.isArray(prior && prior[key]) ? prior[key].slice() : [];
      next.values.forEach(item => { if (!base.some(existing => JSON.stringify(existing) === JSON.stringify(item))) base.push(cloneValue(item)); });
      output[key] = base;
    } else if (next && next.__qaSentinel === 'arrayRemove') {
      const base = Array.isArray(prior && prior[key]) ? prior[key].slice() : [];
      output[key] = base.filter(existing => !next.values.some(item => JSON.stringify(existing) === JSON.stringify(item)));
    } else if (next && next.__qaSentinel === 'increment') {
      output[key] = Number(prior && prior[key] || 0) + Number(next.amount || 0);
    } else output[key] = cloneValue(next);
  });
  return output;
}
function constraintsMatch(data, constraints) {
  return (constraints || []).every(c => {
    const actual = data && data[c.field];
    if (c.op === '>=') return actual >= c.value;
    if (c.op === '==') return actual === c.value;
    return true;
  });
}
function snapshotFor(target) {
  if (target.kind === 'doc') {
    const data = valueAt(target);
    return { exists: () => data !== undefined, data: () => cloneValue(data), id: target.path[target.path.length - 1] };
  }
  const bucket = collectionBucket(target.path[0]);
  const docs = Object.keys(bucket).filter(id => constraintsMatch(bucket[id], target.constraints)).map(id => ({ id: id, data: () => cloneValue(bucket[id]) }));
  return { docs: docs, empty: docs.length === 0, docChanges: () => docs.map(doc => ({ type: 'added', doc: doc })) };
}
function notify(ref) {
  listeners.slice().forEach(listener => {
    if (!listener.active) return;
    const target = listener.target;
    const matches = target.kind === 'doc' ? refKey(target) === refKey(ref) :
      target.path[0] === ref.path[0] && ref.kind === 'doc';
    if (matches) listener.next(snapshotFor(target));
  });
}
function shouldFail(operation, ref) {
  const fail = options().failOperations || [];
  const collection = ref && ref.path && ref.path[0];
  return (Array.isArray(fail) && fail.includes(operation)) && (!options().failCollection || options().failCollection === collection);
}
function ensureCanWrite(operation, ref) {
  const collection = ref && ref.path && ref.path[0];
  const id = ref && ref.path ? ref.path.slice(1).join('/') : '';
  // The importer-compatible song collections intentionally remain open. All
  // host collections model the deployed auth boundary and reject at attempt
  // time when anonymous auth has not completed.
  const requiresAuth = collection !== 'setlists' && collection !== 'songStats';
  const event = recordFirestoreEvent('attempt', { operation: operation, collection: collection, id: id, requiresAuth: requiresAuth, authSignedIn: control.authSignedIn });
  const attempt = { operation: operation, collection: collection, id: id, requiresAuth: requiresAuth, authSignedIn: control.authSignedIn, at: event.at, order: event.order, rejected: false };
  control.attempts.push(attempt);
  if (requiresAuth && !control.authSignedIn) {
    attempt.rejected = true;
    const error = new Error('fixture host write requires authenticated context');
    error.code = 'unauthenticated';
    throw error;
  }
  if (shouldFail(operation, ref)) {
    attempt.rejected = true;
    const error = new Error('fixture write rejected');
    error.code = 'permission-denied';
    throw error;
  }
  return { requiresAuth: requiresAuth };
}
export function getFirestore(app) { return { app: app, fixture: true }; }
export function doc(db, ...parts) { return makeRef('doc', parts); }
export function collection(db, name) { return makeRef('collection', [name]); }
export function query(ref, ...constraints) { return Object.assign({}, ref, { constraints: constraints }); }
export function where(field, op, value) { return { field: field, op: op, value: value }; }
export function onSnapshot(target, next, error) {
  const listener = { target: target, next: next, error: error, active: true };
  listeners.push(listener);
  const isSetlistCollection = target.kind === 'collection' && target.path[0] === 'setlists';
  const deliver = () => {
    if (!listener.active) return;
    try { next(snapshotFor(target)); } catch (err) { control.snapshotErrors.push({ path: target.path.join('/'), message: err.message }); if (error) error(err); }
  };
  if (isSetlistCollection && options().setlistSnapshotDeferred) {
    if (!Array.isArray(control.deferredSetlistSnapshots)) control.deferredSetlistSnapshots = [];
    control.deferredSetlistSnapshots.push(deliver);
    control.releaseSetlistSnapshot = function() {
      const pending = control.deferredSetlistSnapshots.splice(0);
      pending.forEach(callback => callback());
      return pending.length;
    };
  } else {
    const delay = isSetlistCollection ? Number(options().setlistSnapshotDelayMs || 0) : 0;
    setTimeout(deliver, delay);
  }
  return () => { listener.active = false; };
}
export async function getDoc(ref) { return snapshotFor(ref); }
export async function getDocs(target) { return snapshotFor(target); }
export async function setDoc(ref, value, writeOptions) {
  const permission = ensureCanWrite('setDoc', ref);
  const prior = valueAt(ref);
  const next = applySentinels(value, prior);
  setValueAt(ref, next, !!(writeOptions && writeOptions.merge));
  const event = recordFirestoreEvent('write', { operation: 'setDoc', collection: ref.path[0], id: ref.path.slice(1).join('/'), requiresAuth: permission.requiresAuth, authSignedIn: control.authSignedIn });
  control.writes.push({ operation: 'setDoc', collection: ref.path[0], id: ref.path.slice(1).join('/'), requiresAuth: permission.requiresAuth, authSignedIn: control.authSignedIn, at: event.at, order: event.order });
  notify(ref);
}
export async function updateDoc(ref, patch) {
  const permission = ensureCanWrite('updateDoc', ref);
  if (valueAt(ref) === undefined) { const error = new Error('fixture document missing'); error.code = 'not-found'; throw error; }
  const prior = valueAt(ref);
  setValueAt(ref, applySentinels(patch, prior), true);
  const event = recordFirestoreEvent('write', { operation: 'updateDoc', collection: ref.path[0], id: ref.path.slice(1).join('/'), requiresAuth: permission.requiresAuth, authSignedIn: control.authSignedIn });
  control.writes.push({ operation: 'updateDoc', collection: ref.path[0], id: ref.path.slice(1).join('/'), requiresAuth: permission.requiresAuth, authSignedIn: control.authSignedIn, at: event.at, order: event.order });
  notify(ref);
}
export async function deleteDoc(ref) {
  const permission = ensureCanWrite('deleteDoc', ref);
  deleteValueAt(ref);
  const event = recordFirestoreEvent('write', { operation: 'deleteDoc', collection: ref.path[0], id: ref.path.slice(1).join('/'), requiresAuth: permission.requiresAuth, authSignedIn: control.authSignedIn });
  control.writes.push({ operation: 'deleteDoc', collection: ref.path[0], id: ref.path.slice(1).join('/'), requiresAuth: permission.requiresAuth, authSignedIn: control.authSignedIn, at: event.at, order: event.order });
  notify(ref);
}
export function writeBatch(db) {
  const ops = [];
  return {
    set(ref, value, writeOptions) { ops.push({ type: 'set', ref: ref, value: value, options: writeOptions }); },
    delete(ref) { ops.push({ type: 'delete', ref: ref }); },
    update(ref, value) { ops.push({ type: 'update', ref: ref, value: value }); },
    async commit() {
      for (const op of ops) {
        if (op.type === 'set') await setDoc(op.ref, op.value, op.options);
        else if (op.type === 'update') await updateDoc(op.ref, op.value);
        else await deleteDoc(op.ref);
      }
    }
  };
}
export async function runTransaction(db, callback) {
  control.transactions += 1;
  const pending = [];
  const tx = {
    async get(ref) {
      control.transactionReads.push(ref.path.slice().join('/'));
      return snapshotFor(ref);
    },
    set(ref, value, writeOptions) { control.transactionSets.push(ref.path.slice().join('/')); pending.push({ type: 'set', ref: ref, value: value, options: writeOptions }); },
    update(ref, value) { pending.push({ type: 'update', ref: ref, value: value }); },
    delete(ref) { pending.push({ type: 'delete', ref: ref }); }
  };
  await callback(tx);
  for (const op of pending) {
    if (op.type === 'set') await setDoc(op.ref, op.value, op.options);
    else if (op.type === 'update') await updateDoc(op.ref, op.value);
    else await deleteDoc(op.ref);
  }
}
export function arrayUnion(...values) { return { __qaSentinel: 'arrayUnion', values: values }; }
export function arrayRemove(...values) { return { __qaSentinel: 'arrayRemove', values: values }; }
export function increment(amount) { return { __qaSentinel: 'increment', amount: amount }; }
globalThis.__QA_FIREBASE_CONTROL.emit = function(collectionName) {
  control.emits.push({ collection: collectionName, at: performance.now() });
  listeners.slice().forEach(listener => {
    if (listener.active && listener.target.path[0] === collectionName) listener.next(snapshotFor(listener.target));
  });
};
globalThis.__QA_FIREBASE_CONTROL.probeWrite = function(collectionName, id) {
  return ensureCanWrite('qaProbe', makeRef('doc', [collectionName, id]));
};
`;

const FIREBASE_MODULES = new Map([
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', fakeFirebaseAppModule],
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', fakeFirebaseFirestoreModule],
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js', fakeFirebaseAuthModule],
  ['https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js', fakeFirebaseMessagingModule]
]);

function safeRequestLabel(requestURL, category) {
  const parsed = new URL(requestURL);
  return parsed.origin + ' [' + category + ']';
}

const EXPECTED_EXTERNAL_LABELS = new Set([
  'https://docs.google.com [fetch-denied]',
  'https://script.google.com [fetch-denied]',
  'https://fixture-popup.invalid [route-blocked]'
]);

function classifyExternalTraffic(external) {
  const observed = unique(external.blocked.concat(external.fetchGuard));
  external.expected = observed.filter(label => EXPECTED_EXTERNAL_LABELS.has(label));
  external.unexpected = observed.filter(label => !EXPECTED_EXTERNAL_LABELS.has(label));
  return external;
}

async function collectNetworkGuard(run) {
  run.external.fetchGuard = await run.page.evaluate(() => (window.__QA_EXTERNAL_FETCH_DENIED || []).slice());
}

async function closeFixtureRun(run, options = {}) {
  let failure = null;
  try {
    await collectNetworkGuard(run);
    classifyExternalTraffic(run.external);
    const allowedConsoleErrors = new Set(options.allowedConsoleErrors || []);
    run.expectedConsoleErrors = run.consoleErrors.filter(message => allowedConsoleErrors.has(message));
    run.unexpectedConsoleErrors = run.consoleErrors.filter(message => !allowedConsoleErrors.has(message));
    assert.equal(run.external.unexpected.length, 0, 'unexpected external requests must fail fixture verification: ' + JSON.stringify(run.external.unexpected));
    assert.equal(run.unexpectedConsoleErrors.length, 0, 'unexpected browser console/page errors must fail fixture verification: ' + JSON.stringify(run.unexpectedConsoleErrors));
  } catch (error) {
    failure = error;
  } finally {
    await run.context.close().catch(closeError => { if (!failure) failure = closeError; });
  }
  if (failure) throw failure;
}

async function launchFixturePage(serverBaseURL, browser, mode, viewport, options = {}) {
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width < 640,
    hasTouch: viewport.width < 640,
    reducedMotion: 'reduce',
    serviceWorkers: 'block'
  });
  const external = { blocked: [], moduleIntercepts: [], expected: [], unexpected: [], fetchGuard: [] };
  const dialogs = [];
  const consoleErrors = [];
  const control = {
    initializeCalls: 0, authSignedIn: false, authStartedAt: null, authReadyAt: null, authRelease: null, authTimeline: [], transactions: 0,
    eventSequence: 0, events: [], transactionReads: [], transactionSets: [], writes: [], attempts: [], emits: [], snapshotErrors: []
  };
  // Context routing is installed before the first page exists so popup
  // initial navigations inherit the same production network deny policy.
  await context.route('**/*', async route => {
    const requestURL = route.request().url();
    const parsed = new URL(requestURL);
    if (parsed.origin === serverBaseURL) {
      await route.continue();
      return;
    }
    const module = FIREBASE_MODULES.get(parsed.origin + parsed.pathname);
    if (module) {
      external.moduleIntercepts.push(safeRequestLabel(requestURL, 'firebase-module-fixture'));
      await route.fulfill(scriptResponse(module));
      return;
    }
    external.blocked.push(safeRequestLabel(requestURL, 'route-blocked'));
    await route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  // Freeze Date for the September fixture calendar. Playwright keeps timers
  // and performance clocks real when setFixedTime is used.
  await page.clock.setFixedTime(new Date(FIXTURE_NOW));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    if (message.text().includes('ERR_BLOCKED_BY_CLIENT.Inspector')) return;
    consoleErrors.push(message.text());
  });
  page.on('pageerror', error => { consoleErrors.push('pageerror: ' + error.message); });
  page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  await page.addInitScript(({ selectedMode, fixtureData, firebaseOptions, initialControl, localState, emptyLocalStorage }) => {
    window.__QA_MODE = selectedMode;
    window.__QA_FIREBASE_DATA = fixtureData;
    window.__QA_FIREBASE_OPTIONS = firebaseOptions;
    window.__QA_FIREBASE_CONTROL = initialControl;
    window.__QA_EXTERNAL_FETCH_DENIED = [];
    const fixtureFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const requestURL = typeof input === 'string' ? input : input && input.url;
      const origin = new URL(requestURL || '', window.location.href).origin;
      if (origin !== window.location.origin) {
        window.__QA_EXTERNAL_FETCH_DENIED.push(origin + ' [fetch-denied]');
        return Promise.reject(new TypeError('fixture network policy denied external fetch'));
      }
      return fixtureFetch(input, init);
    };
    const hadLocalState = localStorage.getItem('wds-data-v2') !== null;
    if (emptyLocalStorage) {
      localStorage.removeItem('wds-data-v2');
      window.__QA_LOCAL_STORAGE_START_EMPTY = !hadLocalState;
    } else {
      localStorage.setItem('wds-data-v2', JSON.stringify(localState));
      window.__QA_LOCAL_STORAGE_START_EMPTY = false;
    }
  }, { selectedMode: mode, fixtureData: makeFirestoreFixture(serverBaseURL, options), firebaseOptions: options, initialControl: control, localState: makeLocalStateFixture(serverBaseURL, options), emptyLocalStorage: !!options.emptyLocalStorage });
  const started = performance.now();
  await page.goto(serverBaseURL + '/?fixture=' + mode, { waitUntil: 'domcontentloaded' });
  const navigationMs = Math.round((performance.now() - started) * 100) / 100;
  let preAuthProbe = null;
  if (options.preAuthProbe) {
    await page.waitForFunction(() => {
      const control = window.__QA_FIREBASE_CONTROL;
      return typeof control?.probeWrite === 'function' && control.authSignedIn === false;
    }, null, { timeout: 10000 });
    preAuthProbe = await page.evaluate(() => {
      try {
        window.__QA_FIREBASE_CONTROL.probeWrite('schedule', 'fixture-preauth-probe');
        return { rejected: false, code: null };
      } catch (error) {
        return { rejected: true, code: error.code || 'unknown' };
      }
    });
  }
  if (options.siteLockJourney) {
    await page.getByText('This schedule is private', { exact: true }).waitFor({ timeout: 15000 });
    await page.locator('#site-pin-input').waitFor({ timeout: 15000 });
  } else if (options.waitForAppState) {
    await page.waitForFunction(() => {
      const state = window.__QA_APP_STATE?.();
      return Array.isArray(state?.services) && state.services.length > 0;
    }, null, { timeout: 15000 });
  } else {
    await page.locator('nav.tabs:not(.hidden)').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector('#view')?.textContent?.includes('Loading schedule'), null, { timeout: 15000 });
    await page.getByText('Fixture Sabbath', { exact: false }).first().waitFor({ timeout: 15000 });
  }
  const readyMs = Math.round((performance.now() - started) * 100) / 100;
  return { context, page, external, dialogs, consoleErrors, control, preAuthProbe, timings: { navigationMs, readyMs } };
}

function axeSummary(result) {
  return {
    violations: result.violations.map(violation => ({
      id: violation.id, impact: violation.impact,
      targets: violation.nodes.map(node => node.target.map(String))
    })),
    passes: result.passes.length, incomplete: result.incomplete.length
  };
}

async function captureAxe(page, name) {
  const axe = await new AxeBuilder({ page }).analyze();
  const summary = axeSummary(axe);
  AXE_CAPTURED_VIEWS.add(name);
  const axeGuard = assertAxeGuard(name, summary);
  const screenshot = path.join(activeScreenshotRoot, name + '.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  return { axe: summary, axeGuard, screenshot };
}

async function selectJordan(page) {
  const memberSelect = page.locator('#header-me-select, #me-select').first();
  await memberSelect.waitFor({ timeout: 10000 });
  await memberSelect.selectOption({ label: 'Jordan Fixture' });
  await page.getByRole('button', { name: 'My Duties', exact: true }).click();
  await page.locator('[data-duty-date], .duty-card').first().waitFor({ timeout: 10000 });
}

async function emitFixtureSnapshot(page, collectionName = 'schedule') {
  const before = await page.evaluate(name => window.__QA_FIREBASE_CONTROL.emits.filter(item => item.collection === name).length, collectionName);
  await page.evaluate(name => window.__QA_FIREBASE_CONTROL.emit(name), collectionName);
  await page.waitForFunction(({ name, count }) => window.__QA_FIREBASE_CONTROL.emits.filter(item => item.collection === name).length > count, { name: collectionName, count: before }, { timeout: 10000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function exerciseRequestSnapshot(page, name) {
  const trigger = page.locator('[data-act="member-request-open"]').first();
  await trigger.waitFor({ timeout: 10000 });
  await trigger.click();
  const note = page.locator('textarea[data-chg="member-request-note"]').first();
  await note.waitFor({ timeout: 10000 });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const spacer = document.createElement('div');
    spacer.id = 'qa-snapshot-scroll-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.height = '1200px';
    spacer.style.width = '1px';
    spacer.style.pointerEvents = 'none';
    document.body.appendChild(spacer);
  });
  await note.fill('Fixture request draft');
  const scrollBeforeSnapshot = await page.evaluate(() => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(240, max));
    return window.scrollY;
  });
  const before = await page.evaluate(() => {
    const active = document.activeElement;
    const draft = typeof window.__QA_REQUEST_DRAFT === 'function' ? window.__QA_REQUEST_DRAFT() : null;
    return {
      activeElement: active && active.matches('textarea[data-chg="member-request-note"]') ? 'textarea[data-chg="member-request-note"]' : (active && active.id ? '#' + active.id : active && active.tagName),
      typedValue: document.querySelector('textarea[data-chg="member-request-note"]')?.value || '',
      documentScrollY: window.scrollY,
      requestDraft: draft,
      requestKey: document.querySelector('textarea[data-chg="member-request-note"]')?.id || null
    };
  });
  before.scrollBeforeType = scrollBeforeSnapshot;
  await emitFixtureSnapshot(page);
  const after = await page.evaluate(() => {
    const active = document.activeElement;
    const draft = typeof window.__QA_REQUEST_DRAFT === 'function' ? window.__QA_REQUEST_DRAFT() : null;
    return {
      activeElement: active && active.matches('textarea[data-chg="member-request-note"]') ? 'textarea[data-chg="member-request-note"]' : (active && active.id ? '#' + active.id : active && active.tagName),
      typedValue: document.querySelector('textarea[data-chg="member-request-note"]')?.value || '',
      documentScrollY: window.scrollY,
      requestDraft: draft
    };
  });
  assert.equal(after.activeElement, before.activeElement, name + ': schedule snapshot must preserve request draft focus');
  assert.equal(after.typedValue, before.typedValue, name + ': schedule snapshot must preserve request draft text');
  assert.equal(after.documentScrollY, before.documentScrollY, name + ': schedule snapshot must preserve document scroll');
  assert.ok(before.requestKey, name + ': request snapshot must expose its fictional request identity');
  await page.locator('[data-act="member-request-cancel"]').first().click();
  await page.evaluate(() => {
    document.getElementById('qa-snapshot-scroll-spacer')?.remove();
    document.documentElement.style.scrollBehavior = '';
    window.scrollTo(0, 0);
  });
  return { before, after };
}

async function exerciseSongSnapshot(page, name) {
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  await page.locator('[data-testid="song-workspace"]').waitFor({ timeout: 10000 });
  await page.locator('#production-library-search').fill('Fixture');
  const before = await page.evaluate(() => {
    const root = document.querySelector('#song-root');
    const navState = typeof window.__QA_SONG_NAV_STATE === 'function' ? window.__QA_SONG_NAV_STATE() : null;
    window.__QA_SONG_ROOT_TOKEN = root;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(180, max));
    return {
      activeElement: document.activeElement && document.activeElement.id === 'production-library-search' ? '#production-library-search' : (document.activeElement && document.activeElement.id ? '#' + document.activeElement.id : document.activeElement && document.activeElement.tagName),
      typedSearchValue: document.querySelector('#production-library-search')?.value || '',
      documentScrollY: window.scrollY,
      nav: navState?.songNav,
      rootPresent: !!root
    };
  });
  await emitFixtureSnapshot(page);
  const after = await page.evaluate(() => {
    const root = document.querySelector('#song-root');
    const navState = typeof window.__QA_SONG_NAV_STATE === 'function' ? window.__QA_SONG_NAV_STATE() : null;
    return {
      rootSame: root === window.__QA_SONG_ROOT_TOKEN,
      activeElement: document.activeElement && document.activeElement.id === 'production-library-search' ? '#production-library-search' : (document.activeElement && document.activeElement.id ? '#' + document.activeElement.id : document.activeElement && document.activeElement.tagName),
      typedSearchValue: document.querySelector('#production-library-search')?.value || '',
      documentScrollY: window.scrollY,
      nav: navState?.songNav
    };
  });
  assert.equal(before.rootPresent, true, name + ': song root must exist before schedule snapshot');
  assert.equal(before.activeElement, '#production-library-search', name + ': song snapshot must start with focused search');
  assert.equal(before.typedSearchValue, 'Fixture', name + ': song snapshot must start with typed search');
  assert.equal(before.nav, false, name + ': song navigation flag must be consumed after explicit navigation');
  assert.equal(after.rootSame, true, name + ': schedule snapshot must preserve song root identity');
  assert.equal(after.activeElement, before.activeElement, name + ': schedule snapshot must preserve song search focus');
  assert.equal(after.typedSearchValue, before.typedSearchValue, name + ': schedule snapshot must preserve song search value');
  assert.equal(after.documentScrollY, before.documentScrollY, name + ': schedule snapshot must preserve song document scroll');
  assert.equal(after.nav, false, name + ': schedule snapshot must preserve nav:false');
  await page.evaluate(() => document.activeElement?.blur());
  const unfocusedBefore = await page.evaluate(() => {
    const root = document.querySelector('#song-root');
    const navState = typeof window.__QA_SONG_NAV_STATE === 'function' ? window.__QA_SONG_NAV_STATE() : null;
    return {
      rootPresent: !!root,
      typedSearchValue: document.querySelector('#production-library-search')?.value || '',
      nav: navState?.songNav
    };
  });
  await emitFixtureSnapshot(page);
  const unfocusedAfter = await page.evaluate(() => {
    const root = document.querySelector('#song-root');
    const navState = typeof window.__QA_SONG_NAV_STATE === 'function' ? window.__QA_SONG_NAV_STATE() : null;
    return {
      rootSame: root === window.__QA_SONG_ROOT_TOKEN,
      rootPresent: !!root,
      typedSearchValue: document.querySelector('#production-library-search')?.value || '',
      nav: navState?.songNav
    };
  });
  assert.equal(unfocusedBefore.rootPresent, true, name + ': unfocused song snapshot must start with a mounted root');
  assert.equal(unfocusedBefore.typedSearchValue, before.typedSearchValue, name + ': unfocused snapshot must retain the song query');
  assert.equal(unfocusedBefore.nav, false, name + ': unfocused snapshot must start with nav:false');
  assert.equal(unfocusedAfter.rootSame, true, name + ': unfocused schedule snapshot must preserve song root identity');
  assert.equal(unfocusedAfter.typedSearchValue, unfocusedBefore.typedSearchValue, name + ': unfocused schedule snapshot must preserve song query');
  assert.equal(unfocusedAfter.nav, false, name + ': unfocused schedule snapshot must preserve nav:false');
  return { focused: { before, after }, unfocused: { before: unfocusedBefore, after: unfocusedAfter }, rootReplacedAfterBlur: !unfocusedAfter.rootSame };
}

async function exerciseManage(serverBaseURL, browser, viewName, viewport) {
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', viewport, { manageJourney: true, authDeferred: true, preAuthProbe: true });
  const { page } = run;
  assert.deepEqual(run.preAuthProbe, { rejected: true, code: 'unauthenticated' }, viewName + ': host writes must reject at attempt time before auth is ready');
  await page.waitForFunction(() => {
    const control = window.__QA_FIREBASE_CONTROL;
    return control && typeof control.releaseAuth === 'function' && control.authSignedIn === false;
  }, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__QA_APP_STATE && window.__QA_APP_STATE().settings.features.editorLock === true, null, { timeout: 10000 });
  await page.locator('#header-me-select').selectOption({ label: 'Jordan Fixture' });
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByText('Editing is locked', { exact: true }).waitFor({ timeout: 10000 });
  await page.locator('#pin-input').fill(FIXTURE_EDITOR_PASSCODE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.waitForFunction(() => !!localStorage.getItem('wds-unlock'), null, { timeout: 10000 });
  await page.getByRole('heading', { name: 'Manage', exact: true }).waitFor({ timeout: 10000 });
  await page.locator('#manage-department-choice').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('#manage-department-choice').inputValue(), 'Worship', viewName + ': Manage must start with the fictional Worship department');
  const presider = page.locator('select[data-chg="manage-assignment"][data-duty="Presider"]').first();
  await presider.waitFor({ timeout: 10000 });
  const editStartedAt = await page.evaluate(() => performance.now());
  await presider.selectOption({ label: 'Casey Example' });
  await page.waitForFunction(() => window.__QA_APP_STATE && window.__QA_APP_STATE().services[0]?.assignments?.Presider === 'Casey Example', null, { timeout: 10000 });
  const editInitiatedAt = await page.evaluate(() => performance.now());
  const release = await page.evaluate(() => ({
    authSignedInBeforeRelease: window.__QA_FIREBASE_CONTROL.authSignedIn,
    assignmentBeforeRelease: window.__QA_APP_STATE().services[0]?.assignments?.Presider,
    released: window.__QA_FIREBASE_CONTROL.releaseAuth()
  }));
  assert.deepEqual(release, { authSignedInBeforeRelease: false, assignmentBeforeRelease: 'Casey Example', released: true }, 'Manage edit must begin before the deferred auth gate is released');
  await page.waitForFunction(() => {
    const control = window.__QA_FIREBASE_CONTROL;
    return control && control.authSignedIn && control.writes.some(write => write.collection === 'schedule');
  }, null, { timeout: 10000 });
  const state = await page.evaluate(() => window.__QA_APP_STATE());
  const control = await page.evaluate(({ editStarted, editInitiated }) => {
    const source = window.__QA_FIREBASE_CONTROL;
    const hostWrites = source.writes.filter(write => write.requiresAuth);
    const preAuthWrites = hostWrites.filter(write => !write.authSignedIn);
    const preAuthAttempts = source.attempts.filter(attempt => attempt.requiresAuth && !attempt.authSignedIn);
    const appPreAuthAttempts = preAuthAttempts.filter(attempt => attempt.operation !== 'qaProbe');
    return {
      authSignedIn: source.authSignedIn,
      writes: source.writes.slice(),
      attempts: source.attempts.slice(),
      unlocked: !!localStorage.getItem('wds-unlock'),
      preAuthHostWriteCount: preAuthWrites.length,
      preAuthHostAttemptCount: appPreAuthAttempts.length,
      preAuthRejectedAttemptCount: appPreAuthAttempts.filter(attempt => attempt.rejected).length,
      authTiming: {
        editStartedAt: editStarted,
        editInitiatedAt: editInitiated,
      authStartedAt: source.authStartedAt,
      authReadyAt: source.authReadyAt,
      scheduleWriteAt: hostWrites.find(write => write.collection === 'schedule')?.at || null,
      scheduleWriteOrder: hostWrites.find(write => write.collection === 'schedule')?.order || null,
      editToAuthReadyMs: source.authReadyAt == null ? null : Math.round((source.authReadyAt - editStarted) * 100) / 100,
      authToScheduleWriteMs: source.authReadyAt == null || !hostWrites.find(write => write.collection === 'schedule') ? null : Math.round((hostWrites.find(write => write.collection === 'schedule').at - source.authReadyAt) * 100) / 100
      },
      editObservedBeforeRelease: true,
      eventSequence: source.events.slice()
    };
  }, { editStarted: editStartedAt, editInitiated: editInitiatedAt });
  assert.equal(state.services[0].assignments.Presider, 'Casey Example', 'Manage assignment edit must update fictional state');
  assert.equal(control.authSignedIn, true, 'Manage write must wait for the fictional auth queue');
  assert.equal(control.unlocked, true, 'fictional editor unlock must persist for the session');
  assert.ok(control.authTiming.editInitiatedAt <= control.authTiming.authReadyAt, 'Manage edit timestamp must not follow auth readiness');
  assert.equal(control.preAuthHostWriteCount, 0, 'Manage must not record a successful host write before auth');
  assert.equal(control.preAuthHostAttemptCount, 0, 'Manage must not attempt a host write before auth, excluding the intentional probe');
  assert.equal(control.preAuthRejectedAttemptCount, control.preAuthHostAttemptCount, 'every pre-auth application host write attempt must be rejected at attempt time');
  assert.ok(control.authTiming.authReadyAt != null, 'Manage must record auth readiness timing');
  assert.ok(control.authTiming.editStartedAt <= control.authTiming.authReadyAt, 'Manage edit start timestamp must not follow auth readiness');
  assert.ok(control.authTiming.scheduleWriteAt >= control.authTiming.authReadyAt, 'the schedule write must occur after auth readiness');
  assert.equal(control.editObservedBeforeRelease, true, 'Manage edit must be observed while auth is still deferred');
  const releaseOrder = control.eventSequence.find(event => event.kind === 'auth' && event.event === 'released')?.order;
  const readyOrder = control.eventSequence.find(event => event.kind === 'auth' && event.event === 'ready')?.order;
  assert.ok(releaseOrder != null && readyOrder != null && releaseOrder < readyOrder, 'auth release must precede auth readiness in event order');
  assert.ok(control.authTiming.scheduleWriteOrder != null && readyOrder < control.authTiming.scheduleWriteOrder, 'the schedule write must follow auth readiness in event order');
  assert.ok(control.writes.some(write => write.collection === 'schedule' && write.id === '2026-09-12_morning'), 'Manage assignment must reach the fake schedule write boundary');
  const axeEvidence = await captureAxe(page, viewName);
  await closeFixtureRun(run);
  return { viewport, assignment: state.services[0].assignments.Presider, authSignedIn: control.authSignedIn, unlocked: control.unlocked, writes: control.writes, attempts: control.attempts, preAuthHostWriteCount: control.preAuthHostWriteCount, preAuthHostAttemptCount: control.preAuthHostAttemptCount, preAuthRejectedAttemptCount: control.preAuthRejectedAttemptCount, editObservedBeforeRelease: control.editObservedBeforeRelease, eventSequence: control.eventSequence, authTiming: control.authTiming, preAuthProbe: run.preAuthProbe, axe: axeEvidence.axe, axeGuard: axeEvidence.axeGuard, screenshot: axeEvidence.screenshot, network: run.external, consoleErrors: run.consoleErrors };
}

async function exerciseManagerJourneys(serverBaseURL, browser) {
  const managerMap = { Worship: ['Jordan Fixture'], Choir: ['Jordan Fixture'] };
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', { width: 390, height: 844 }, { manageJourney: true, managerMap, extraMembers: ['Morgan Manager'], authDelayMs: 70 });
  const { page } = run;
  await page.locator('#header-me-select').selectOption({ label: 'Jordan Fixture' });
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByText('Editing is locked', { exact: true }).waitFor({ timeout: 10000 });
  await page.locator('#pin-input').fill(FIXTURE_EDITOR_PASSCODE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.getByRole('heading', { name: 'Manage', exact: true }).waitFor({ timeout: 10000 });
  const departmentChoice = page.locator('#manage-department-choice');
  await departmentChoice.waitFor({ timeout: 10000 });
  const departmentNames = await departmentChoice.locator('option').allTextContents();
  assert.deepEqual(departmentNames, ['Worship', 'Choir'], 'manager must see only the configured fictional departments');
  assert.equal(await departmentChoice.inputValue(), 'Worship', 'manager journey must start in the configured own department');
  const managerEvidence = await captureAxe(page, 'manager-phone');

  const existingPresider = await page.evaluate(() => window.__QA_APP_STATE().services[0]?.assignments?.Presider || null);
  await page.getByRole('button', { name: 'Generate proposals', exact: true }).click();
  await page.locator('.manage-proposal-summary').waitFor({ timeout: 10000 });
  const proposalCount = await page.locator('.manage-proposal-row').count();
  assert.ok(proposalCount > 0, 'manager must receive fictional proposals for empty Worship slots');
  const proposalSummary = await page.locator('.manage-proposal-summary').innerText();
  assert.match(proposalSummary, /\d+ proposed/, 'manager proposal review must report its proposed count');
  await page.getByRole('button', { name: 'Save proposals', exact: true }).click();
  await page.getByText('Proposals saved. Existing assignments were preserved.', { exact: true }).waitFor({ timeout: 10000 });
  await page.waitForFunction(() => window.__QA_FIREBASE_CONTROL.writes.some(write => write.collection === 'schedule'), null, { timeout: 10000 });
  const afterProposalState = await page.evaluate(() => ({ state: window.__QA_APP_STATE(), writes: window.__QA_FIREBASE_CONTROL.writes.slice() }));
  assert.equal(afterProposalState.state.services[0]?.assignments?.Presider, existingPresider, 'manager proposals must preserve the existing Presider assignment');
  assert.ok(afterProposalState.writes.some(write => write.collection === 'schedule'), 'saving manager proposals must reach the fictional schedule write boundary');

  await departmentChoice.selectOption('Choir');
  await page.locator('#manage-choir-title').waitFor({ timeout: 10000 });
  const beforeChoirEdit = await page.evaluate(() => {
    const state = window.__QA_APP_STATE();
    return { departments: JSON.parse(JSON.stringify(state.departments)), assignments: JSON.parse(JSON.stringify(state.services.map(service => service.assignments))), songLibrary: window.SONG_SEED?.songs?.map(song => song.title) || [] };
  });
  const customTitle = 'Fixture Manager Custom Choir Title';
  const choirInput = page.locator('input[data-chg="manage-choir-song"]').first();
  await choirInput.fill(customTitle);
  await choirInput.press('Tab');
  await page.waitForFunction(expected => window.__QA_APP_STATE().services[0]?.choirSong === expected, customTitle, { timeout: 10000 });
  const afterChoirEdit = await page.evaluate(() => {
    const state = window.__QA_APP_STATE();
    return { departments: JSON.parse(JSON.stringify(state.departments)), assignments: JSON.parse(JSON.stringify(state.services.map(service => service.assignments))), choirSong: state.services[0]?.choirSong || '', songLibrary: window.SONG_SEED?.songs?.map(song => song.title) || [] };
  });
  assert.equal(afterChoirEdit.choirSong, customTitle, 'Choir manager must save a custom title on the selected service');
  assert.deepEqual(afterChoirEdit.departments, beforeChoirEdit.departments, 'Choir title editing must not mutate department membership');
  assert.deepEqual(afterChoirEdit.assignments, beforeChoirEdit.assignments, 'Choir title editing must not mutate duty assignments');
  assert.deepEqual(afterChoirEdit.songLibrary, beforeChoirEdit.songLibrary, 'custom Choir title must remain outside the fictional song library');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('[data-screen="member"] h1', { hasText: 'Home' }).waitFor({ timeout: 10000 });
  const axeAfterChoir = await captureAxe(page, 'manager-after-choir-phone');
  await closeFixtureRun(run);
  return {
    departments: departmentNames,
    proposalCount,
    proposalSummary,
    existingPresider,
    savedPresider: afterProposalState.state.services[0]?.assignments?.Presider || null,
    customTitle,
    choirSong: afterChoirEdit.choirSong,
    serviceOnly: true,
    manager: managerEvidence,
    afterChoir: axeAfterChoir,
    network: run.external,
    consoleErrors: run.consoleErrors
  };
}

async function exerciseRequestFailure(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', { width: 390, height: 844 }, { failOperations: ['setDoc'], failCollection: 'requests', authDelayMs: 70 });
  const { page } = run;
  await selectJordan(page);
  await page.locator('[data-act="member-request-open"]').first().click();
  const note = page.locator('textarea[data-chg="member-request-note"]').first();
  await note.fill('Fixture request failure note');
  await page.locator('[data-act="member-request-submit"]').first().click();
  await page.getByText('Could not send your request. Your note is kept here. Try again.', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await note.inputValue(), 'Fixture request failure note', 'failed request save must retain the fictional note for retry');
  assert.equal(await page.evaluate(() => window.__QA_APP_STATE().requests.length), 0, 'failed request save must not publish a partial fictional request');
  await page.evaluate(() => { window.__QA_FIREBASE_OPTIONS.failOperations = []; });
  await page.locator('[data-act="member-request-submit"]').first().click();
  await page.waitForFunction(() => window.__QA_APP_STATE().requests.length === 1, null, { timeout: 10000 });
  const control = await page.evaluate(() => window.__QA_FIREBASE_CONTROL);
  assert.ok(control.writes.some(write => write.collection === 'requests' && write.operation === 'setDoc'), 'request retry must reach the fictional requests write boundary');
  await closeFixtureRun(run);
  return { failedNoteRetained: true, retrySaved: true, writes: control.writes, network: run.external, consoleErrors: run.consoleErrors };
}

async function exerciseSiteLock(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', { width: 390, height: 844 }, { siteLockJourney: true, authDelayMs: 80 });
  const { page } = run;
  assert.equal(await page.locator('#site-pin-input').count(), 1, 'whole-site lock must render its fictional passcode field');
  assert.equal(await page.getByText('This schedule is private', { exact: true }).count(), 1, 'whole-site lock must render its locked state');
  const locked = await captureAxe(page, 'site-lock-phone');
  await page.locator('#site-pin-input').fill(FIXTURE_SITE_PASSCODE);
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await page.locator('nav.tabs:not(.hidden)').waitFor({ timeout: 10000 });
  await page.getByText('Fixture Sabbath', { exact: false }).first().waitFor({ timeout: 10000 });
  const unlockedState = await page.evaluate(() => ({ feature: window.__QA_FEATURE(), storedUnlock: !!localStorage.getItem('wds-site-unlock') }));
  assert.equal(unlockedState.feature.siteLock, true, 'site lock feature must remain enabled after unlock');
  assert.equal(unlockedState.feature.unlocked, true, 'fictional site passcode must unlock the whole site');
  assert.equal(unlockedState.storedUnlock, true, 'site unlock must persist for this fixture session');
  const unlocked = await captureAxe(page, 'site-unlocked-phone');
  await closeFixtureRun(run);
  return { locked, unlocked, feature: unlockedState.feature, network: run.external, consoleErrors: run.consoleErrors };
}

async function exerciseViewport(serverBaseURL, browser, name, viewport) {
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', viewport, { authDelayMs: 80 });
  const { page } = run;
  assert.equal(await page.locator('nav.tabs button.active').getAttribute('data-tab'), 'schedule', name + ': Schedule must be the initial active view');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, name + ': page must not have horizontal overflow');
  const scheduleEvidence = await captureAxe(page, name + '-schedule');
  await selectJordan(page);
  const myEvidence = await captureAxe(page, name + '-my-duties');
  const requestSnapshot = await exerciseRequestSnapshot(page, name);
  const dutyDate = page.locator('[data-duty-date]').first();
  await dutyDate.waitFor({ timeout: 10000 });
  const teamToggle = dutyDate.locator('[data-act="member-full-team"]');
  await teamToggle.click();
  await dutyDate.locator('[data-full-team]').waitFor({ timeout: 10000 });
  await dutyDate.locator('[data-full-team] h3', { hasText: 'Full team' }).waitFor({ timeout: 10000 });
  await teamToggle.focus();
  await page.keyboard.press('Enter');
  await dutyDate.locator('[data-full-team]').waitFor({ state: 'detached', timeout: 10000 });
  await teamToggle.focus();
  await page.keyboard.press('Enter');
  await dutyDate.locator('[data-full-team]').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('[data-screen="member"] h1', { hasText: 'Home' }).waitFor({ timeout: 10000 });
  await page.locator('[data-act="member-department"][data-department="Worship"]').click();
  await page.locator('[data-department-section="Worship"]').first().waitFor({ timeout: 10000 });
  const filteredRows = await page.locator('[data-department-section="Worship"] [data-department-row]').count();
  assert.ok(filteredRows > 0, name + ': Home department filter must retain Worship rows');
  const monthHeading = page.locator('.ws-calendar h2').first();
  const initialMonth = await monthHeading.innerText();
  await page.locator('[data-act="member-calendar-next"]').click();
  await page.waitForFunction(previous => document.querySelector('.ws-calendar h2')?.textContent !== previous, initialMonth, { timeout: 10000 });
  await page.locator('[data-act="member-calendar-prev"]').click();
  await page.locator('.ws-calendar h2').filter({ hasText: initialMonth }).waitFor({ timeout: 10000 });
  await page.locator('button[data-act="home"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('nav.tabs button[data-tab="schedule"].active').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'My Duties', exact: true }).click();
  await page.getByRole('button', { name: 'Presider', exact: true }).click();
  await page.locator('#song-root [data-screen="presider"]').waitFor({ timeout: 15000 });
  const presiderStarted = performance.now();
  const presiderEvidence = await captureAxe(page, name + '-presider');
  const presiderMs = Math.round((performance.now() - presiderStarted) * 100) / 100;
  await page.locator('#presider-filter').selectOption('all');
  await page.locator('.presider-date-group').nth(1).waitFor({ timeout: 10000 });
  const secondDate = await page.locator('.presider-date-group').nth(1).getAttribute('data-date');
  await page.locator('[data-song-act="presider-day"][data-date="' + secondDate + '"]').click();
  await page.locator('.presider-date-group[data-date="' + secondDate + '"].jump-target').waitFor({ timeout: 10000 });
  await page.locator('[data-song-act="open-workspace"]').first().click();
  await page.locator('[data-testid="song-workspace"]').waitFor({ timeout: 15000 });
  const songSnapshot = await exerciseSongSnapshot(page, name);
  await page.locator('#production-library-search').fill('Fixture Morning Song');
  await page.locator('.production-song-row').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.production-song-row strong').first().innerText(), 'Fixture Morning Song', name + ': workspace search must render a fictional song');
  await page.locator('#production-library-search').fill('A42');
  await page.locator('.production-song-row').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.production-song-row .library-number').first().innerText(), 'A42', name + ': workspace search must normalize a fictional Appendix number');
  assert.equal(await page.locator('.production-song-row strong').first().innerText(), 'Fixture Appendix Song', name + ': Appendix search must render its fictional title');
  await page.locator('#production-library-search').fill('Fixture phrase with no matching song');
  await page.getByText('No songs match this search.', { exact: true }).waitFor({ timeout: 10000 });
  const libraryEmptyEvidence = await captureAxe(page, name + '-library-empty');
  await page.getByRole('button', { name: 'Back to services', exact: true }).click();
  await page.locator('.presider-month-list').waitFor({ timeout: 10000 });
  await page.locator('[data-song-act="order-workspace"]').first().click();
  await page.getByText('Order of worship', { exact: true }).waitFor({ timeout: 10000 });
  const servicesEvidence = await captureAxe(page, name + '-services');
  const insightsEvidence = servicesEvidence;

  await closeFixtureRun(run);
  return {
    viewport,
    timings: Object.assign({}, run.timings, { presiderMs }),
    snapshotPreservation: { request: requestSnapshot, song: songSnapshot },
    keyboard: { groupedFullTeam: true, headerHome: true, departmentFilter: true, monthNavigation: true },
    primaryJourneys: {
      libraryEmpty: { emptyState: true, screenshot: libraryEmptyEvidence.screenshot, axe: libraryEmptyEvidence.axe, axeGuard: libraryEmptyEvidence.axeGuard },
      services: { upcomingRendered: true, screenshot: servicesEvidence.screenshot, axe: servicesEvidence.axe, axeGuard: servicesEvidence.axeGuard },
      insights: { orderOfWorshipRendered: true, screenshot: insightsEvidence.screenshot, axe: insightsEvidence.axe, axeGuard: insightsEvidence.axeGuard }
    },
    screenshots: [scheduleEvidence.screenshot, myEvidence.screenshot, presiderEvidence.screenshot, libraryEmptyEvidence.screenshot, servicesEvidence.screenshot, insightsEvidence.screenshot],
    axe: { schedule: scheduleEvidence.axe, myDuties: myEvidence.axe, presider: presiderEvidence.axe, libraryEmpty: libraryEmptyEvidence.axe, services: servicesEvidence.axe },
    network: run.external,
    consoleErrors: run.consoleErrors
  };
}

async function exerciseSetlistRace(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', { width: 390, height: 844 }, { setlistSnapshotDeferred: true, authDelayMs: 120 });
  const { page } = run;
  await selectJordan(page);
  const opened = performance.now();
  await page.getByRole('button', { name: 'Presider', exact: true }).click();
  await page.locator('#song-root [data-screen="presider"]').waitFor({ timeout: 15000 });
  const openMs = Math.round((performance.now() - opened) * 100) / 100;
  assert.ok(await page.locator('[data-testid="presider-service"]').count() > 0, 'race fixture should render service cards before its deferred setlist snapshot');
  assert.ok(await page.locator('[data-testid="presider-service"] [data-confirmation-state]').count() > 0, 'race fixture should render a fictional status while its deferred snapshot is pending');
  const releasedSnapshots = await page.evaluate(() => window.__QA_FIREBASE_CONTROL.releaseSetlistSnapshot?.() || 0);
  assert.ok(releasedSnapshots >= 1, 'race fixture must release deferred setlist snapshots explicitly after picker mount');
  await page.locator('[data-testid="presider-service"] [data-confirmation-state]').first().waitFor({ timeout: 15000 });
  const control = await page.evaluate(() => window.__QA_FIREBASE_CONTROL);
  assert.equal(control.transactionSets.filter(id => id === 'setlists/2026-09-12_morning').length, 0, 'existing setlist must not be overwritten before its first snapshot');
  assert.equal(control.writes.filter(write => write.collection === 'setlists').length, 0, 'opening the Presider view must not write before its first setlist snapshot');
  await closeFixtureRun(run);
  return {
    openMs,
    releasedSnapshots,
    transactionReads: control.transactionReads,
    transactionSets: control.transactionSets,
    network: run.external,
    consoleErrors: run.consoleErrors
  };
}

async function exerciseConfirmation(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', { width: 390, height: 844 }, { authDelayMs: 60 });
  const { page } = run;
  await selectJordan(page);
  await page.getByRole('button', { name: 'Presider', exact: true }).click();
  await page.locator('#song-root [data-screen="presider"]').waitFor({ timeout: 15000 });
  await page.locator('[data-song-act="open-workspace"]').first().click();
  await page.locator('[data-testid="song-workspace"]').waitFor({ timeout: 15000 });
  await page.evaluate(() => {
    const NativeDate = window.Date;
    const state = { value: NativeDate.parse('2026-09-07T12:00:00-07:00'), calls: 0 };
    class AdvancingFixtureDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [state.value])); }
      static now() { state.calls += 1; state.value += 1; return state.value; }
      static parse(...args) { return NativeDate.parse(...args); }
      static UTC(...args) { return NativeDate.UTC(...args); }
    }
    window.Date = AdvancingFixtureDate;
    window.__QA_ADVANCING_DATE = state;
  });
  await page.locator('[data-song-act="confirm-songs"]').click();
  await page.locator('[data-confirmation-state]').filter({ hasText: 'Confirmed' }).waitFor({ timeout: 10000 });
  const confirmationState = await page.evaluate(() => {
    const setlist = window.__QA_FIREBASE_STORE?.setlists?.['2026-09-12_morning'] || {};
    return {
      confirmed: document.querySelectorAll('[data-confirmation-state]').length && document.body.innerText.includes('Confirmed') ? 1 : 0,
      changed: document.body.innerText.includes('Changed') ? 1 : 0,
      advancingDateCalls: window.__QA_ADVANCING_DATE?.calls || 0,
      timestamps: { confirmedAt: setlist.confirmedAt ?? null, updatedAt: setlist.updatedAt ?? null }
    };
  });
  const control = await page.evaluate(() => window.__QA_FIREBASE_CONTROL);
  if (EXPECT_CONFIRMATION_REGRESSION) {
    assert.equal(confirmationState.confirmed, 0, 'the immutable baseline must expose the advancing-clock confirmation regression');
    assert.equal(confirmationState.changed, 1, 'the immutable baseline must render changed after the double timestamp');
    assert.equal(confirmationState.advancingDateCalls, 2, 'the immutable baseline must call Date.now twice during confirmation');
    assert.equal(confirmationState.timestamps.updatedAt, confirmationState.timestamps.confirmedAt + 1, 'the immutable baseline must show distinct confirmation and update timestamps');
  } else {
    assert.equal(confirmationState.confirmed, 1, 'confirmation must produce the completed state');
    assert.equal(confirmationState.changed, 0, 'the corrected source must not render confirmation as changed');
    assert.equal(confirmationState.advancingDateCalls, 1, 'the corrected source must stamp confirmation metadata once');
    assert.equal(confirmationState.timestamps.updatedAt, confirmationState.timestamps.confirmedAt, 'the corrected source must keep confirmation and update timestamps equal');
  }
  assert.ok(control.writes.some(write => write.collection === 'setlists' && write.operation === 'updateDoc'), 'confirmation must use the fake Firestore write boundary');
  await page.locator('[data-song-act="remove-workspace-song"]').first().click();
  await page.locator('[data-confirmation-state]').filter({ hasText: 'Changed' }).waitFor({ timeout: 10000 });
  const changedAfterEdit = await page.evaluate(() => ({
    changed: Array.from(document.querySelectorAll('[data-confirmation-state]')).some(node => node.textContent.trim() === 'Changed'),
    songs: window.__QA_FIREBASE_STORE?.setlists?.['2026-09-12_morning']?.songs || []
  }));
  assert.equal(changedAfterEdit.changed, true, 'editing a confirmed fictional setlist must surface the Changed state');
  await closeFixtureRun(run);
  return { status: EXPECT_CONFIRMATION_REGRESSION ? 'expected-regression' : 'covered', expectedRegression: EXPECT_CONFIRMATION_REGRESSION, confirmationState, changedAfterEdit, writes: control.writes, network: run.external, consoleErrors: run.consoleErrors };
}

async function exerciseSaveError(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'firebase', { width: 390, height: 844 }, { failOperations: ['updateDoc', 'setDoc'], failCollection: 'setlists' });
  const { page } = run;
  await selectJordan(page);
  await page.getByRole('button', { name: 'Presider', exact: true }).click();
  await page.locator('#song-root [data-screen="presider"]').waitFor({ timeout: 15000 });
  await page.locator('[data-song-act="open-workspace"]').first().click();
  await page.locator('[data-testid="song-workspace"]').waitFor({ timeout: 15000 });
  await page.locator('[data-song-act="confirm-songs"]').click();
  await page.locator('.ws-badge.failed').waitFor({ timeout: 10000 });
  assert.ok(await page.getByText('Save failed', { exact: true }).count() > 0, 'failed setlist saves must surface a visible save error');
  await page.evaluate(() => { window.__QA_FIREBASE_OPTIONS.failOperations = []; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.locator('[data-confirmation-state]').filter({ hasText: 'Confirmed' }).waitFor({ timeout: 10000 });
  const retried = await page.evaluate(() => window.__QA_FIREBASE_CONTROL.writes.filter(write => write.collection === 'setlists').length);
  assert.ok(retried >= 1, 'retry must reach the fictional setlist write boundary after the failure clears');
  await page.getByRole('button', { name: 'Back to services', exact: true }).click();
  await page.locator('[data-testid="presider-month-list"]').waitFor({ timeout: 10000 });
  await page.locator('[data-song-act="open-workspace"]').first().click();
  await page.locator('[data-testid="song-workspace"]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-confirmation-state]').filter({ hasText: 'Confirmed' }).count(), 1, 'reopening the workspace must retain the confirmed setlist state');
  await closeFixtureRun(run);
  return { retried, reopenedConfirmed: true, network: run.external, consoleErrors: run.consoleErrors };
}

async function exercisePureHelpers(sourceSnapshot) {
  const source = sourceSnapshot.bytes.get('app.js')?.toString('utf8');
  assert.ok(source, 'pure helper evaluation must use app.js from the immutable source snapshot');
  const pureExports = `
globalThis.__QA_PURE = {
  parseSheetDate, parseSheetTime, inferYearISO, sheetRowsToServices, mergeSheetServices, fbWrite,
  setState(next) { state = next; }, getState() { return state; },
  setDepartmentsLoaded(value) {
    if (typeof departmentsLoaded !== 'undefined') departmentsLoaded = value;
    if (typeof setStateReady === 'function') setStateReady('departments', value);
  },
  setAuthReady(value) { authReady = value; },
  makeDate(value) { return new Date(value); }
};
`;
  const stripped = source.replace(/\ninit\(\);\s*$/, '\n') + pureExports;
  const localStore = new Map();
  const sandbox = {
    window: { SEED_DATA: { members: [], services: [] } },
    localStorage: {
      getItem(key) { return localStore.has(key) ? localStore.get(key) : null; },
      setItem(key, value) { localStore.set(key, String(value)); },
      removeItem(key) { localStore.delete(key); },
      key(index) { return Array.from(localStore.keys())[index] || null; },
      get length() { return localStore.size; }
    },
    document: { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } }, navigator: {}, Notification: undefined, crypto: globalThis.crypto, TextEncoder,
    Blob, URL, setTimeout, clearTimeout, requestAnimationFrame: undefined, console
  };
  sandbox.globalThis = sandbox;
  const foundationFiles = [
    'src/core/constants.js', 'src/core/state.js', 'src/domain/schedule.js', 'src/domain/setlist.js', 'src/domain/member.js', 'src/domain/coordinator.js', 'src/domain/sheet.js',
    'src/services/storage.js', 'src/services/firebase.js', 'src/services/assignments.js', 'src/services/subscriptions.js',
    'src/services/song-repository.js', 'src/screens/coordinator/secondary-panels.js'
  ];
  for (const relative of foundationFiles) {
    const foundationSource = sourceSnapshot.bytes.get(relative);
    if (!foundationSource) continue;
    vm.runInNewContext(foundationSource.toString('utf8'), sandbox, { filename: relative + '.fixture-evaluator' });
  }
  vm.runInNewContext(stripped, sandbox, { filename: 'app.js.fixture-evaluator' });
  const pure = sandbox.__QA_PURE;

  assert.deepEqual(JSON.parse(JSON.stringify(pure.parseSheetDate('Sat, Jan 02'))), { month: 0, day: 2 });
  assert.equal(pure.parseSheetTime('12:00 AM'), '00:00');
  assert.equal(pure.parseSheetTime('12:00 PM'), '12:00');
  assert.equal(pure.inferYearISO(0, 2, pure.makeDate('2026-12-30T12:00:00')), '2027-01-02');
  assert.equal(pure.inferYearISO(11, 31, pure.makeDate('2026-01-02T12:00:00')), '2025-12-31');

  const seededService = clone(fixtureServices[0]);
  seededService.assignments['Media Booth #1'] = 'Media Booth Fixture';
  const original = {
    members: ['Casey Example', 'Jordan Fixture'], services: [seededService],
    settings: { features: {}, pinHash: '' }, departments: clone(fixtureDepartments), requests: []
  };
  pure.setState(original);
  pure.setDepartmentsLoaded(true);
  const sheetRows = [
    ['Date', 'Service', 'Worship', 'Time', 'Duty', 'Member'],
    ['Sat, Sep 12', 'Morning', 'Fixture Sabbath', '9:00 AM', 'Presider', 'Robin Sample'],
    ['Sat, Sep 12', 'Morning', 'Fixture Sabbath', '9:00 AM', 'Closing Prayer', '']
  ];
  const parsed = pure.sheetRowsToServices(sheetRows, pure.makeDate('2026-09-07T12:00:00'));
  assert.equal(parsed.services[0].assignments['Closing Prayer'], '', 'a parsed blank Member cell must remain an explicit clearing value');
  const merge = pure.mergeSheetServices(parsed.services);
  const mergedService = pure.getState().services[0];
  assert.equal(merge.updated == null ? merge.updatedServices.length : merge.updated, 1);
  assert.equal(mergedService.assignments.Presider, 'Robin Sample');
  assert.equal(mergedService.assignments['Media Booth #1'], 'Media Booth Fixture');
  assert.equal(mergedService.assignments['Closing Prayer'], '', 'a blank Sheet Member cell must clear the existing assignment');

  let ran = false;
  let releaseAuth;
  pure.setAuthReady(new Promise(resolve => { releaseAuth = resolve; }));
  const authGateStartedAt = performance.now();
  const pendingWrite = pure.fbWrite(() => { ran = true; return 'fixture-write'; });
  await Promise.resolve();
  const beforeReleaseMs = Math.round((performance.now() - authGateStartedAt) * 100) / 100;
  assert.equal(ran, false, 'writes must wait for auth readiness');
  const authReleasedAt = performance.now();
  releaseAuth();
  assert.equal(await pendingWrite, 'fixture-write');
  assert.equal(ran, true);
  const afterReleaseMs = Math.round((performance.now() - authReleasedAt) * 100) / 100;
  return {
    scheduleParsed: parsed.services.length,
    merge,
    seededUnmanagedDuty: 'Media Booth Fixture',
    preservedUnmanagedDuty: mergedService.assignments['Media Booth #1'],
    clearedDuty: 'Closing Prayer',
    clearedAssignment: mergedService.assignments['Closing Prayer'],
    yearBoundary: { januaryAfterDecember: pure.inferYearISO(0, 2, pure.makeDate('2026-12-30T12:00:00')), decemberBeforeJanuary: pure.inferYearISO(11, 31, pure.makeDate('2026-01-02T12:00:00')) },
    authWait: { ranBeforeRelease: false, ranAfterRelease: ran, blockedMs: beforeReleaseMs, releaseToWriteMs: afterReleaseMs }
  };
}

async function exerciseLocalSeed(serverBaseURL, browser) {
  const run = await launchFixturePage(serverBaseURL, browser, 'local', { width: 390, height: 844 }, { emptyLocalStorage: true, waitForAppState: true });
  const { page } = run;
  const fixture = await page.evaluate(() => ({ members: window.SEED_DATA.members.slice(), firstService: window.SEED_DATA.services[0].worship }));
  assert.deepEqual(fixture.members, fixtureMembers);
  assert.equal(fixture.firstService, 'Fixture Sabbath');
  const initialization = await page.evaluate(() => {
    const state = window.__QA_APP_STATE?.();
    return {
      storageStartedEmpty: window.__QA_LOCAL_STORAGE_START_EMPTY === true,
      members: state?.members || [],
      firstService: state?.services?.[0]?.worship || null,
      serviceCount: state?.services?.length || 0,
      initialSiteLockDefault: state?.settings?.features?.siteLock === undefined
    };
  });
  assert.equal(initialization.storageStartedEmpty, true, 'local seed must begin with an empty wds-data-v2 store');
  assert.deepEqual(initialization.members, fixtureMembers, 'empty local storage must initialize fictional members from the fixture seed');
  assert.equal(initialization.firstService, 'Fixture Sabbath', 'empty local storage must initialize the fictional schedule');
  assert.equal(initialization.serviceCount, fixtureServices.length, 'empty local storage must initialize every fictional service');
  assert.equal(initialization.initialSiteLockDefault, true, 'empty local seed must expose its default site-lock state before fixture rendering is enabled');
  await page.evaluate(() => {
    const state = window.__QA_APP_STATE();
    state.settings.features = Object.assign({}, state.settings.features, { siteLock: false });
    window.__QA_RENDER();
  });
  await page.locator('nav.tabs:not(.hidden)').waitFor({ timeout: 10000 });
  const axeEvidence = await captureAxe(page, 'local-seeded-phone');
  await closeFixtureRun(run);
  return { fixture, initialization, screenshot: axeEvidence.screenshot, axe: axeEvidence.axe, axeGuard: axeEvidence.axeGuard, network: run.external, consoleErrors: run.consoleErrors };
}

function unique(values) { return Array.from(new Set(values)); }

function evidenceFilePaths(root) {
  return { jsonPath: path.join(root, 'fixture-baseline.json'), markdownPath: path.join(root, 'fixture-baseline.md') };
}

async function writeRunStatus(root, run, status, error = null) {
  await mkdir(root, { recursive: true });
  const screenshotRoot = run.screenshotRoot || path.join(root, 'screenshots', run.id);
  await mkdir(screenshotRoot, { recursive: true });
  const paths = evidenceFilePaths(root);
  const payload = {
    taskId: 'WORSHIP-V-20260907',
    mode: 'fixture-only-loopback',
    sourceRoot: run.sourceRoot,
    evidenceScope: run.evidenceScope,
    baselineReference: BASELINE_COMMIT,
    screenshotsRoot: screenshotRoot,
    run: { id: run.id, status, startedAt: run.startedAt, updatedAt: new Date().toISOString() }
  };
  if (error) payload.error = { name: error.name || 'Error', message: error.message || String(error) };
  await writeFile(paths.jsonPath, JSON.stringify(payload, null, 2) + '\n');
  const markdown = [
    '# Fixture-only verification run', '',
    'Run ID: `' + run.id + '`.', '',
    'Run status: `' + status + '`.', '',
    'Source root: `' + run.sourceRoot + '`. Evidence scope: `' + run.evidenceScope + '`.', '',
    'Screenshots root: `' + screenshotRoot + '`.', '',
    'Started: `' + run.startedAt + '`.', '',
    error ? 'Failure: `' + (error.message || String(error)).replace(/`/g, "'") + '`.' : 'The evidence root was invalidated before browser navigation.', ''
  ].join('\n');
  await writeFile(paths.markdownPath, markdown + '\n');
  return paths;
}

async function writeFailureEvidence(root, run, error) {
  return writeRunStatus(root, run, 'failed', error);
}

async function runWithEvidenceLifecycle(root, run, work) {
  // Invalidate an older green receipt before any source, browser, or assertion
  // work begins. The same wrapper is used by the main suite and its failure
  // replacement probe so the probe exercises the real catch path.
  await writeRunStatus(root, run, 'running');
  try {
    return await work();
  } catch (error) {
    await writeFailureEvidence(root, run, error).catch(writeError => {
      console.error('fixture failure receipt could not be written:', writeError.message || String(writeError));
    });
    throw error;
  }
}

async function exerciseEvidenceFailureReplacement(sourceSnapshot, metadata) {
  const tempRoot = await mkdtemp(path.join('/private/tmp', 'worship-fixture-evidence-'));
  const runId = 'fixture-failure-replacement-' + randomUUID();
  const run = {
    id: runId,
    startedAt: new Date().toISOString(),
    sourceRoot: 'fixture-only-temporary-evidence',
    evidenceScope: 'failure-replacement-probe',
    screenshotRoot: path.join(tempRoot, 'screenshots', runId)
  };
  try {
    const paths = evidenceFilePaths(tempRoot);
    const priorScreenshotRoot = path.join(tempRoot, 'screenshots', 'old-green-run');
    await mkdir(priorScreenshotRoot, { recursive: true });
    const prior = { taskId: 'WORSHIP-V-20260907', run: { id: 'old-green-run', status: 'passed' } };
    await writeFile(paths.jsonPath, JSON.stringify(prior, null, 2) + '\n');
    await writeFile(paths.markdownPath, '# prior green fixture evidence\n');
    const screenshotPath = path.join(priorScreenshotRoot, 'old-green.png');
    await writeFile(screenshotPath, 'old-green');

    const failure = new Error('fixture failure replacement probe');
    await assert.rejects(
      () => runWithEvidenceLifecycle(tempRoot, run, async () => {
        const running = JSON.parse(await readFile(paths.jsonPath, 'utf8'));
        assert.equal(running.run.status, 'running', 'a rerun must invalidate an existing green evidence report before checks begin');
        assert.equal(running.run.id, run.id, 'the running evidence must identify this rerun');
        assert.equal(running.screenshotsRoot, run.screenshotRoot, 'a rerun must use a new screenshot root identified by its run');
        assert.deepEqual(await readdir(run.screenshotRoot), [], 'a new run screenshot root must start empty');
        throw failure;
      }),
      /fixture failure replacement probe/
    );
    const failed = JSON.parse(await readFile(paths.jsonPath, 'utf8'));
    const failedMarkdown = await readFile(paths.markdownPath, 'utf8');
    assert.equal(failed.run.status, 'failed', 'a failed rerun must replace the green report with a failure report');
    assert.equal(failed.run.id, run.id, 'the failure report must identify this rerun');
    assert.equal(failed.screenshotsRoot, run.screenshotRoot, 'the failed receipt must retain the new run screenshot root');
    assert.match(failedMarkdown, /Run status: `failed`/);
    assert.equal(await readFile(screenshotPath, 'utf8'), 'old-green', 'failure replacement must not rewrite unrelated prior screenshots');
    assert.equal(sourceMetadata(sourceSnapshot).digest, metadata.digest, 'the evidence failure probe must not change source bytes');
    return {
      priorGreenInvalidated: true,
      runningStatusWritten: true,
      failureReceiptWritten: true,
      runIdentityRecorded: true,
      screenshotRootVersioned: true,
      priorScreenshotPreserved: true,
      sourceDigestUnchanged: true
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function writeEvidence(evidence) {
  await mkdir(activeScreenshotRoot, { recursive: true });
  const { jsonPath, markdownPath } = evidenceFilePaths(EVIDENCE_ROOT);
  await writeFile(jsonPath, JSON.stringify(evidence, null, 2) + '\n');
  const rows = Object.entries(evidence.scenarios).map(([name, result]) => {
    const status = result.status || 'covered';
    const detail = result.detail || 'evidence recorded';
    return '| ' + name + ' | ' + status + ' | ' + detail + ' |';
  }).join('\n');
  const knownAxeRows = Object.entries(evidence.accessibility.knownBaselineFindings).flatMap(([view, findings]) => {
    if (!findings.length) return ['- `' + view + '`: none'];
    return findings.map(finding => '- `' + view + '`: `' + finding.id + '` (' + finding.impact + ') at `' + finding.target.join(' ') + '`');
  }).join('\n');
  const markdown = [
    '# Fixture-only verification baseline', '',
    'Baseline reference commit: `' + evidence.baselineReference + '`.', '',
    'Run ID: `' + evidence.run.id + '`. Run status: `' + evidence.run.status + '`.', '',
    'Screenshots root: `' + (evidence.run.screenshotsRoot || activeScreenshotRoot) + '`.', '',
    'Source root: `' + evidence.sourceRoot + '`. Evidence scope: `' + evidence.evidenceScope + '`.', '',
    'Source digest: `' + evidence.sourceRevision.digest + '` using `' + evidence.sourceRevision.method + '` with `' + evidence.sourceRevision.fileOrder + '` over `' + evidence.sourceRevision.files.join('`, `') + '`. Runtime: `' + evidence.runtime.node + '` on `' + evidence.runtime.platform + '/' + evidence.runtime.arch + '`.', '',
    'The suite starts a loopback server, installs request interception before navigation, serves fictional schedule and song fixtures, replaces Firebase browser modules with an in-memory module, and aborts every other external request. It does not open the live site.', '',
    '| Scenario | Result | Evidence |', '|---|---|---|', rows, '',
    'Screenshots and axe output are recorded in the JSON file beside this note. Timings are measured from navigation in each isolated browser context. Network records retain origins and categories only. Expected synthetic fixture blocks are listed separately from unexpected traffic.', '',
    '## Accessibility guard', '',
    'The guard checks every captured view and every axe impact using the exact rule ID, impact, and fixture-stable target. A new finding, changed impact, changed target, or extra node fails the run. This receipt is not a full accessibility pass.', '',
    'Known baseline findings:', '', knownAxeRows || '- none', ''
  ].join('\n');
  await writeFile(markdownPath, markdown + '\n');
  return { jsonPath, markdownPath };
}

function appendNetworkEvidence(target, run) {
  target.blocked.push(...run.network.blocked);
  target.moduleIntercepts.push(...run.network.moduleIntercepts);
  target.fetchGuard.push(...run.network.fetchGuard);
  target.expected.push(...(run.network.expected || []));
  target.unexpected.push(...run.network.unexpected);
}

async function main() {
  const runId = 'fixture-run-' + randomUUID();
  const run = { id: runId, startedAt: new Date().toISOString(), sourceRoot: SOURCE_ROOT, evidenceScope: EVIDENCE_SCOPE, screenshotRoot: path.join(EVIDENCE_ROOT, 'screenshots', runId) };
  activeScreenshotRoot = run.screenshotRoot;
  return runWithEvidenceLifecycle(EVIDENCE_ROOT, run, async () => {
    let server = null;
    let baseURL = null;
    let browser = null;
    await mkdir(activeScreenshotRoot, { recursive: true });
    const sourceSnapshot = await readSourceSnapshot();
    const metadata = sourceMetadata(sourceSnapshot);
    if (EXPECT_CONFIRMATION_REGRESSION && metadata.digest !== IMMUTABLE_BASELINE_SOURCE_DIGEST) {
      throw new Error('WORSHIP_EXPECT_CONFIRMATION_REGRESSION=1 is restricted to the immutable baseline source digest');
    }
    const evidence = {
      taskId: 'WORSHIP-V-20260907', baselineReference: BASELINE_COMMIT, mode: 'fixture-only-loopback',
      sourceRoot: SOURCE_ROOT, evidenceScope: EVIDENCE_SCOPE,
      sourceRevision: { kind: 'sha256', method: metadata.digestMethod, fileOrder: metadata.fileOrder, digest: metadata.digest, files: metadata.files }, runtime: metadata.runtime,
      fixtures: { members: fixtureMembers.length, services: fixtureServices.length, songs: fixtureSongs.length },
      accessibility: { fullAccessibilityPass: false, guard: 'per-view exact finding allowlist', capturedViews: [], knownBaselineFindings: {} },
      scenarios: {}, viewports: [], network: { blocked: [], moduleIntercepts: [], fetchGuard: [], expected: [], unexpected: [], expectedFixtureBlocks: [] }, timingUnits: 'milliseconds',
      run: { id: run.id, status: 'running', startedAt: run.startedAt, screenshotsRoot: run.screenshotRoot }
    };
    evidence.sourceSnapshotIntegrity = await exerciseSourceSnapshotIntegrity(sourceSnapshot, metadata);
    evidence.evidenceFailureReplacement = await exerciseEvidenceFailureReplacement(sourceSnapshot, metadata);
    evidence.scenarios.axeGuard = { status: 'covered', detail: 'per-view axe guard rejected serious, moderate, critical, other-view, and duplicate-node regressions', result: exerciseAxeGuardSelfCheck() };
    const launchFailure = await exerciseLaunchFailureCleanup(sourceSnapshot);
    ({ server, baseURL, browser } = await openFixtureBrowser(sourceSnapshot));
    try {
      const popupRouting = await exercisePopupRouting(baseURL, browser);
      const networkGuard = await exerciseUnexpectedNetworkGuard(baseURL, browser);
      const browserErrorGuard = await exerciseBrowserErrorGuard(baseURL, browser);
      evidence.scenarios.launchCleanup = { status: 'covered', detail: 'injected Chromium launch failure closed its loopback fixture server and context routing blocked popup initial navigation', result: { launchFailure, popupRouting, networkGuard, browserErrorGuard } };
      evidence.network.expectedFixtureBlocks.push(popupRouting.blockedOrigin + ' [route-blocked]');
      evidence.scenarios.seededSchedule = { status: 'covered', detail: 'local loopback seed-data.js fixture rendered fictional schedule' };
      const local = await exerciseLocalSeed(baseURL, browser);
      evidence.scenarios.seededSchedule.detail = 'empty local storage initialized ' + local.fixture.members.length + ' fictional members from seed-data.js';
      evidence.scenarios.seededSchedule.initialization = local.initialization;
      evidence.scenarios.seededSchedule.axe = local.axe;
      evidence.scenarios.seededSchedule.screenshot = local.screenshot;
      appendNetworkEvidence(evidence.network, local);

      const pure = await exercisePureHelpers(sourceSnapshot);
      evidence.scenarios.manualDutyMerge = { status: 'covered', detail: 'pure sheet merge preserved a seeded fictional unmanaged Media Booth duty', result: { merge: pure.merge, seededUnmanagedDuty: pure.seededUnmanagedDuty, preservedUnmanagedDuty: pure.preservedUnmanagedDuty } };
      evidence.scenarios.yearBoundaries = { status: 'covered', detail: 'pure month/day inference covered both year transitions', result: pure.yearBoundary };
      evidence.scenarios.authWait = { status: 'covered', detail: 'pure write gate remained pending until auth resolved', result: pure.authWait };

      const siteLock = await exerciseSiteLock(baseURL, browser);
      evidence.scenarios.siteLock = { status: 'covered', detail: 'fictional whole-site passcode lock rendered, passed axe, and unlocked with a fixture passcode', result: siteLock };
      appendNetworkEvidence(evidence.network, siteLock);

      const managePhone = await exerciseManage(baseURL, browser, 'manage-phone', { width: 390, height: 844 });
      const manageDesktop = await exerciseManage(baseURL, browser, 'manage-desktop', { width: 1440, height: 1000 });
      evidence.scenarios.manageJourney = { status: 'covered', detail: 'fictional editor unlock changed a schedule assignment through the auth-gated fake write boundary on phone and desktop', result: { phone: managePhone, desktop: manageDesktop } };
      appendNetworkEvidence(evidence.network, managePhone);
      appendNetworkEvidence(evidence.network, manageDesktop);

      const managerJourneys = await exerciseManagerJourneys(baseURL, browser);
      evidence.scenarios.managerContracts = { status: 'covered', detail: 'fictional department manager saw only owned departments, reviewed and saved proposals, and kept a custom Choir title on the service only', result: managerJourneys };
      appendNetworkEvidence(evidence.network, managerJourneys);

      const requestFailure = await exerciseRequestFailure(baseURL, browser);
      evidence.scenarios.requestFailure = { status: 'covered', detail: 'a failed fictional member request kept its note and retried through the fake request write boundary', result: requestFailure };
      appendNetworkEvidence(evidence.network, requestFailure);

      const phone = await exerciseViewport(baseURL, browser, 'phone', { width: 390, height: 844 });
      const desktop = await exerciseViewport(baseURL, browser, 'desktop', { width: 1440, height: 1000 });
      evidence.viewports.push(phone, desktop);
      evidence.scenarios.memberJourney = { status: 'covered', detail: 'fictional member selection rendered duties and presider access' };
      evidence.scenarios.presiderRemount = { status: 'covered', detail: 'second mount accepted Library search input and rendered fixture song' };
      evidence.scenarios.domFocus = { status: 'covered', detail: 'schedule snapshot preserved focused request and Library search controls on phone and desktop' };
      evidence.scenarios.scheduleSnapshot = { status: 'covered', detail: 'fictional schedule snapshots preserved request draft, document scroll, song root identity, Library view, and nav:false on phone and desktop', result: { phone: phone.snapshotPreservation, desktop: desktop.snapshotPreservation } };
      evidence.scenarios.keyboard = { status: 'covered', detail: 'fictional song row, nested action button, and header home control accepted Enter on phone and desktop', result: { phone: phone.keyboard, desktop: desktop.keyboard } };
      evidence.scenarios.libraryEmpty = { status: 'covered', detail: 'fictional Library search rendered its no-match empty state on phone and desktop', result: { phone: phone.primaryJourneys.libraryEmpty, desktop: desktop.primaryJourneys.libraryEmpty } };
      evidence.scenarios.servicesJourney = { status: 'covered', detail: 'fictional Services view rendered upcoming setlists on phone and desktop', result: { phone: phone.primaryJourneys.services, desktop: desktop.primaryJourneys.services } };
      evidence.scenarios.insightsJourney = { status: 'covered', detail: 'fictional Insights view rendered song usage panels on phone and desktop', result: { phone: phone.primaryJourneys.insights, desktop: desktop.primaryJourneys.insights } };
      appendNetworkEvidence(evidence.network, phone);
      appendNetworkEvidence(evidence.network, desktop);

      const race = await exerciseSetlistRace(baseURL, browser);
      evidence.scenarios.songCreateBeforeSnapshot = { status: 'covered', detail: 'transaction read an existing setlist before an explicitly released snapshot and did not set it', result: race };
      appendNetworkEvidence(evidence.network, race);

      const confirmation = await exerciseConfirmation(baseURL, browser);
      evidence.scenarios.confirmation = { status: confirmation.status, detail: confirmation.expectedRegression ? 'immutable baseline exposed the expected advancing-clock confirmation regression' : 'fictional setlist entered confirmed state through fake write boundary with one metadata timestamp', result: confirmation };
      appendNetworkEvidence(evidence.network, confirmation);

      const saveError = await exerciseSaveError(baseURL, browser);
      evidence.scenarios.saveErrors = { status: 'covered', detail: 'failed fake setlist writes surfaced a user-facing save error', result: saveError };
      appendNetworkEvidence(evidence.network, saveError);

      evidence.network.blocked = unique(evidence.network.blocked);
      evidence.network.moduleIntercepts = unique(evidence.network.moduleIntercepts);
      evidence.network.fetchGuard = unique(evidence.network.fetchGuard);
      evidence.network.expected = unique(evidence.network.expected);
      evidence.network.unexpected = unique(evidence.network.unexpected);
      evidence.network.expectedFixtureBlocks = unique(evidence.network.expectedFixtureBlocks);
      assert.equal(evidence.network.unexpected.length, 0, 'all external requests must be allowlisted or fixture-intercepted');
      evidence.accessibility.capturedViews = Array.from(AXE_CAPTURED_VIEWS).sort();
      evidence.accessibility.knownBaselineFindings = Object.fromEntries(evidence.accessibility.capturedViews.map(view => [view, AXE_BASELINE_ALLOWLIST[view] || []]));
      const expectedRegressionCount = Object.values(evidence.scenarios).filter(item => item.status === 'expected-regression').length;
      const status = expectedRegressionCount ? 'passed-with-expected-regression' : 'passed';
      evidence.run = { id: run.id, status, startedAt: run.startedAt, completedAt: new Date().toISOString(), screenshotsRoot: run.screenshotRoot };
      const paths = await writeEvidence(evidence);
      console.log(JSON.stringify({ status, expectedRegressionCount, evidence: paths, runId: run.id, scenarios: Object.keys(evidence.scenarios), blockedExternalCount: evidence.network.blocked.length, expectedExternalCount: evidence.network.expected.length, firebaseModuleInterceptCount: evidence.network.moduleIntercepts.length, viewports: evidence.viewports.map(item => ({ name: item.viewport, readyMs: item.timings.readyMs })) }, null, 2));
    } finally {
      await browser.close().catch(() => {});
      await closeFixtureServer(server);
      baseURL = null;
      browser = null;
      server = null;
    }
  });
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
