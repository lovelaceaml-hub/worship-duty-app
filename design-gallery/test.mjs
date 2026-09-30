/** Integrated appearance gallery regression test.
 * Firebase SDK requests are replaced with deterministic browser doubles and
 * every other network request is blocked. No production account, schedule,
 * token, or Firebase write is used by this suite.
 *
 * Run (outside the macOS sandbox, from the repository root): node design-gallery/test.mjs
 * Playwright is resolved by tests/helpers/playwright.mjs, so a git worktree without its
 * own node_modules borrows it from the main checkout. WD_STRICT=1 turns every open
 * KNOWN-ISSUE (a correct-behavior check waiting on an app fix) into a failure.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from '../tests/helpers/playwright.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.hosting-gallery');
const out = path.join(root, 'design-gallery-results');
await fs.mkdir(path.join(out, 'screenshots'), {recursive: true});
async function exists(file) {
  try { await fs.access(file); return true; }
  catch { return false; }
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const protectedNames = [
  'app.js', 'song-app.js', 'index.html', 'permissions.js',
  'department-workflows.js', 'song-lib.js', 'song-app.css', 'song-seed.js',
  'firebase-config.js', 'firebase.json', 'sw.js', 'seed-data.js',
  'firestore.rules',
  // docs/PLAN-2026-09-22-APP-JS-SPLIT.md module set. Not created until their section lands;
  // hashes() skips a path that does not exist yet.
  'core/constants.js', 'core/format.js', 'core/conflicts.js', 'core/planning.js', 'core/sheet-parse.js',
  'core/state.js', 'core/auth.js', 'core/departments.js', 'core/schedule.js', 'core/notify.js',
  'core/sheet-sync.js', 'core/calendar.js', 'core/session.js',
  'views/shell.js', 'views/schedule.js', 'views/songs.js', 'views/requests.js',
  'views/manage.js', 'views/departments.js', 'views/feedback.js',
  'actions/dispatch.js'
];
const hashes = async () => {
  const entries = await Promise.all(protectedNames.map(async name => {
    try { return [name, hash(await fs.readFile(path.join(root, name)))]; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }));
  return Object.fromEntries(entries.filter(Boolean));
};

const before = await hashes();
execFileSync(process.execPath, [path.join(root, 'design-gallery/build.mjs')], {stdio: 'inherit'});
assert.deepEqual(await hashes(), before, 'Gallery build must not modify original source/runtime files');

const TEST_PIN = '2468';
const CHANGED_PIN = '3579';
const pinHash = hash(Buffer.from(TEST_PIN));
const members = [
  'B. Anthony', 'E. Simon', 'D. Caleb', 'S. Lisa', 'M. Chloe',
  'B,James', 'B. James', 'BJason', 'B. Jason', 'B. James S', 'D,Armani', 'H.Elena',
  'S. Melisaa', 'S. Melissa', 'S. Monica C.', 'S. Monica C', 'S. Monica S.', 'S. Monica S'
];
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
const departmentRoster = {
  Worship: [
    {
      memberUid: 'member:E. Simon', uid: 'member:E. Simon', departmentId: 'Worship', department: 'Worship',
      role: 'leader', memberName: 'E. Simon', status: 'active', eligibleDuties: ['Presider'], schedulable: true,
      availability: {recurring: {morning: 'available', evening: 'available'}, exceptions: {}},
      updatedBy: 'Roster setup', updatedByUid: 'member:E. Simon', updatedAt: Date.parse('2026-06-20T10:00:00Z'),
      attribution: {updatedBy: 'Roster setup', updatedAt: Date.parse('2026-06-20T10:00:00Z')},
      fieldAttribution: {status: {source: 'initial', authority: 'system', by: 'system', at: 0}}
    }
  ],
  Media: [
    {
      memberUid: 'member:E. Simon', uid: 'member:E. Simon', departmentId: 'Media', department: 'Media',
      role: 'leader', memberName: 'E. Simon', status: 'active', eligibleDuties: ['Media Booth #1'], schedulable: true,
      availability: {recurring: {morning: 'available', evening: 'available'}, exceptions: {}},
      updatedBy: 'E. Simon', updatedByUid: 'member:E. Simon', updatedAt: Date.parse('2026-06-21T10:00:00Z'),
      attribution: {updatedBy: 'E. Simon', updatedAt: Date.parse('2026-06-21T10:00:00Z')},
      fieldAttribution: {status: {source: 'manual', authority: 'leader', by: 'member:E. Simon', at: Date.parse('2026-06-21T10:00:00Z')}}
    },
    {
      memberUid: 'member:S. Lisa', uid: 'member:S. Lisa', departmentId: 'Media', department: 'Media',
      role: 'member', memberName: 'S. Lisa', status: 'active', eligibleDuties: ['Media Booth #1'], schedulable: true,
      availability: {recurring: {morning: 'available', evening: 'unavailable'}, exceptions: {'2026-07-02': {'evening': 'available'}}},
      historySeed: {
        source: 'historical-assignments',
        seededBy: 'history-import',
        seededAt: Date.parse('2026-06-19T10:00:00Z'),
        evidence: [{
          department: 'Media', member: 'S. Lisa', duty: 'Media Booth #1',
          service: 'Evening', serviceTime: 'evening', date: '2026-06-19'
        }]
      },
      updatedBy: 'E. Simon', updatedByUid: 'member:E. Simon', updatedAt: Date.parse('2026-06-22T10:00:00Z'),
      attribution: {updatedBy: 'E. Simon', updatedAt: Date.parse('2026-06-22T10:00:00Z')}
    },
    {
      memberUid: 'member:M. Chloe', uid: 'member:M. Chloe', departmentId: 'Media', department: 'Media',
      role: 'member', memberName: 'M. Chloe', status: 'active', eligibleDuties: ['Media Booth #1'], schedulable: true,
      availability: {recurring: {evening: 'available'}, exceptions: {}},
      updatedBy: 'E. Simon', updatedByUid: 'member:E. Simon', updatedAt: Date.parse('2026-06-22T11:00:00Z'),
      attribution: {updatedBy: 'E. Simon', updatedAt: Date.parse('2026-06-22T11:00:00Z')}
    },
    {
      memberUid: 'member:D. Caleb', uid: 'member:D. Caleb', departmentId: 'Media', department: 'Media',
      role: 'member', memberName: 'D. Caleb', status: 'inactive', eligibleDuties: ['Media Booth #1'], schedulable: false,
      availability: {recurring: {evening: 'available'}, exceptions: {}},
      updatedBy: 'E. Simon', updatedByUid: 'member:E. Simon', updatedAt: Date.parse('2026-06-23T10:00:00Z')
    }
  ]
};
const fixture = {
  services,
  departmentRoster,
  holdSettings: true,
  // The live rules refuse app/songSettings, and app/presiders while that
  // document does not exist (its read rule needs resource.data).
  denied: ['app/songSettings', 'app/presiders'],
  delays: {songStats: 40},
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
    'app/leaderConfig': {
      admin: ['B. Anthony'], globalLeaderManager: ['B. Anthony'],
      departmentLeaders: {Worship: ['E. Simon'], Media: ['E. Simon']},
      songEditors: ['E. Simon']
    },
    'app/nameMap': {map: {'B. Anthony L': 'B. Anthony', 'D. Chloe': 'M. Chloe'}},
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
    'songStats/001': {
      songId: '001', timesSung: 3, lastSung: '2026-06-20',
      history: [
        {date: '2026-05-30', service: '2026-05-30_morning', by: 'B. Anthony', markedAt: 1},
        {date: '2026-06-13', service: '2026-06-13_morning', by: 'E. Simon', markedAt: 2},
        {date: '2026-06-20', service: '2026-06-20_morning', by: 'B. Anthony', markedAt: 3}
      ]
    },
    'requests/req-worship': {
      id: 'req-worship', svcId: '2026-07-01_morning', name: 'B. Anthony',
      date: '2026-07-01', service: 'Morning', worship: 'Sabbath Day',
      duty: 'Presider', department: 'Worship', status: 'pending',
      requesterUid: 'member:B. Anthony', createdAt: Date.parse('2026-06-30T12:00:00Z')
    },
    'feedback/fixture-note-1': {
      uid: 'member:S. Lisa', name: 'S. Lisa', kind: 'suggestion',
      message: 'Fixture suggestion: larger text on the duty list.',
      screen: 'my', appearance: 'prism', status: 'new',
      createdAt: Date.parse('2026-06-29T18:00:00Z')
    },
    'requests/req-stale': {
      id: 'req-stale', svcId: '2026-07-01_morning', name: 'D. Caleb',
      date: '2026-07-01', service: 'Morning', worship: 'Sabbath Day',
      duty: 'Translation #1', department: 'Translation', status: 'pending',
      requesterUid: 'member:D. Caleb', createdAt: Date.parse('2026-06-30T11:00:00Z')
    }
  }
};
fixture.docs['departments/Media/members/member:S. Lisa'] = departmentRoster.Media.find(profile => profile.memberUid === 'member:S. Lisa');
fixture.docs['departments/Media/members/member:M. Chloe'] = departmentRoster.Media.find(profile => profile.memberUid === 'member:M. Chloe');

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
        roles: ['member'], departments: ['Media'], mustChangePin: false, roleVersion: 1
      }
    }
  };
  if (forcedMember && records[forcedMember]) records[forcedMember].claims.mustChangePin = true;
  return records;
}

const report = {
  passed: false,
  checks: [],
  knownIssues: [],
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
/* A check that asserts the CORRECT behavior for an app bug this suite found but does
   not own the fix for. While the bug is open it is reported as KNOWN-ISSUE and listed
   in results.json without stopping the run; once the fix lands it reports PASS by
   itself. Run with WD_STRICT=1 to make every open known issue fail the suite. */
function knownIssue(name, dependsOn, result, expected = true) {
  try {
    assert.deepEqual(result, expected, name);
  } catch (error) {
    if (process.env.WD_STRICT === '1') throw error;
    report.knownIssues.push({name, dependsOn, actual: result, expected});
    console.log('KNOWN-ISSUE', name, '(depends on ' + dependsOn + ')');
    return;
  }
  report.checks.push({name, passed: true});
  console.log('PASS', name);
}

// The app.js split (docs/PLAN-2026-09-22-APP-JS-SPLIT.md) stages real module
// subdirectories (core/, views/, actions/) that app.js imports by relative
// path, so the staged tree is no longer flat; walk it recursively.
async function collectStagedFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectStagedFiles(full, base));
    else if (entry.isFile()) files.push(path.relative(base, full));
  }
  return files;
}
const assets = new Map(await Promise.all(
  (await collectStagedFiles(stage)).map(async relPath =>
    [relPath.split(path.sep).join('/'), await fs.readFile(path.join(stage, relPath))])
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
      window.__fixtureCurrentUserUid = auth.currentUser.uid;
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
    const clone = value => JSON.parse(JSON.stringify(value));
    const rosterFor = department => (window.__fixtureDepartmentRoster || {})[department] || [];
    const profileFor = (department, memberUid) => rosterFor(department).find(profile => profile.memberUid === memberUid);
    const actorUid = () => window.__fixtureCurrentUserUid || 'member:B. Anthony';
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
      if (name === 'listDepartmentRoster') {
        return {data: {ok: true, departmentId: data.departmentId, members: clone(rosterFor(data.departmentId))}};
      }
      if (name === 'updateDepartmentProfile' || name === 'updateMemberAvailability') {
        const profile = profileFor(data.departmentId, data.memberUid);
        if (!profile) fail('not-found');
        (window.__profileWrites || (window.__profileWrites = [])).push({
          name, payload: clone(data), before: clone(profile)
        });
        Object.assign(profile, clone(data.patch || {}));
        profile.updatedByUid = actorUid();
        profile.updatedBy = (window.__fixtureAuthRecords || {})[actorUid().replace(/^member:/, '')]?.claims?.memberName || actorUid();
        profile.updatedAt = Date.now();
        return {data: {ok: true, departmentId: data.departmentId, memberUid: data.memberUid, profile: clone(profile)}};
      }
      if (name === 'searchDepartmentCandidates') {
        const needle = String(data.query || '').toLowerCase();
        const all = ((window.__designFixture.docs['app/members'] || {}).list || [])
          // The real lookup searches registered accounts, which use canonical names only.
          .filter(member => /^[A-Z]\. /.test(member) && member.toLowerCase().includes(needle))
          .map(member => ({memberUid: 'member:' + member, memberName: member}));
        const page = Number(data.page) || 1;
        (window.__searchCalls || (window.__searchCalls = [])).push(clone(data));
        return {data: {ok: true, departmentId: data.departmentId, page, total: all.length,
          members: all.slice((page - 1) * 10, page * 10)}};
      }
      if (name === 'createDepartmentProfile') {
        (window.__profileCreates || (window.__profileCreates = [])).push(clone(data));
        const department = data.departmentId;
        const profile = {
          memberUid: data.memberUid, uid: data.memberUid, departmentId: department, department,
          role: 'member', memberName: data.memberName, status: data.status || 'active',
          eligibleDuties: data.eligibleDuties || [], schedulable: data.schedulable === true,
          availability: clone(data.availability || {recurring: {}, exceptions: {}}),
          updatedByUid: actorUid(), updatedAt: Date.now()
        };
        rosterFor(department).push(profile);
        return {data: {ok: true, departmentId: department, memberUid: data.memberUid, profile: clone(profile)}};
      }
      if (name === 'updateRoleConfiguration') {
        const config = clone(window.__designFixture.docs['app/leaderConfig']);
        const list = data.roleType === 'songEditor'
          ? config.songEditors
          : (config.departmentLeaders[data.department] || (config.departmentLeaders[data.department] = []));
        const next = data.enabled
          ? [...new Set(list.concat(data.memberName))].sort()
          : list.filter(member => member !== data.memberName);
        if (data.roleType === 'songEditor') config.songEditors = next;
        else config.departmentLeaders[data.department] = next;
        window.__designFixture.docs['app/leaderConfig'] = config;
        (window.__roleWrites || (window.__roleWrites = [])).push({name, payload: clone(data)});
        return {data: {ok: true, config: clone(config)}};
      }
      if (name === 'assignDepartmentDuty') {
        const profile = profileFor(data.departmentId, data.memberUid);
        if (!profile) fail('not-found');
        const assignment = {...data, override: false, authorization: 'normal-eligible-assignment', assignedByUid: actorUid()};
        (window.__departmentWrites || (window.__departmentWrites = [])).push({name, assignment: clone(assignment)});
        return {data: {ok: true, assignment, override: false}};
      }
      if (name === 'overrideDepartmentAssignment') {
        const profile = profileFor(data.departmentId, data.memberUid);
        if (!profile) fail('not-found');
        const assignment = {...data, override: true, authorization: 'administrator-override', profileMutated: false, auditId: 'fixture-audit-1'};
        (window.__departmentWrites || (window.__departmentWrites = [])).push({name, assignment: clone(assignment)});
        return {data: {ok: true, assignment, override: true, auditId: assignment.auditId, profileMutated: false}};
      }
      return {data: {ok: true}};
    };
  `;
}

async function make({member = '', forcedMember = '', retainMaintenance = false} = {}) {
  const context = await browser.newContext({
    viewport: {width: 390, height: 850},
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    timezoneId: 'America/Los_Angeles'
  });
  await context.addInitScript(({fixtureValue, records, memberValue}) => {
    window.__designFixture = fixtureValue;
    window.__fixtureAuthRecords = records;
    window.__fixtureDepartmentRoster = fixtureValue.departmentRoster;
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
  // 8:00 AM Pacific, before the fixture's 9:00 AM service, so B. Anthony's duties
  // there are still upcoming (a duty stops being upcoming at its start minute).
  await page.clock.setSystemTime(new Date('2026-07-01T08:00:00-07:00'));
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__mockLive);
  await page.evaluate(() => {
    document.documentElement.dataset.maintenance = 'active';
    window.__mockLive.emit('app/settings', window.__designFixture.docs['app/settings']);
  });
  await page.waitForFunction(() => document.querySelector('#maintenance-schedule')?.textContent.includes('Presider'));
  check('Maintenance release hides the working app from members', await page.locator('.maintenance-screen').isVisible());
  check('Maintenance screen shows upcoming services and duties', await page.locator('#maintenance-schedule').innerText()
    .then(text => text.includes('Evening') && text.includes('Presider') && text.includes('E. Simon')));
  await page.evaluate(retain => {
    delete document.documentElement.dataset.maintenance;
    if (!retain) document.querySelector('.maintenance-screen')?.remove();
    window.__mockLive.emit('app/settings', window.__designFixture.docs['app/settings']);
  }, retainMaintenance);
  await page.waitForFunction(() => !!document.querySelector('#site-pin-input'));
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
  await page.waitForFunction(() => !document.querySelector('form[data-act="member-change-pin"] button')?.disabled);
  await page.evaluate(pin => {
    const form = document.querySelector('form[data-act="member-change-pin"]');
    form.querySelector('#member-new-pin').value = pin;
    form.querySelector('#member-new-pin-confirm').value = pin;
    form.requestSubmit();
  }, CHANGED_PIN);
  try {
    await page.waitForFunction(() => !document.querySelector('nav.tabs')?.classList.contains('hidden'));
  } catch (error) {
    const detail = await page.evaluate(() => ({
      body: document.getElementById('view')?.innerText || '',
      claims: window.__fixtureAuthRecords?.['E. Simon']?.claims || null
    }));
    throw new Error('Forced PIN test did not open navigation: ' + JSON.stringify(detail), {cause: error});
  }
}

async function choose(page, mode) {
  await page.evaluate(() => delete document.documentElement.dataset.maintenance);
  if (!await page.locator('.wd-design-dialog[open]').count()) {
    await page.locator('[data-design-open]:visible').first().click();
  }
  await page.locator(`.wd-design-dialog[open] [data-design-select="${mode}"]`).click();
  await page.waitForFunction(expected => window.WorshipDesign?.getMode() === expected, mode);
  await page.evaluate(() => delete document.documentElement.dataset.maintenance);
  await page.waitForTimeout(180);
}

async function navigate(page, tab) {
  await page.evaluate(() => delete document.documentElement.dataset.maintenance);
  await page.locator(`nav.tabs [data-tab="${tab}"]`).click();
  await page.waitForTimeout(180);
  await closeDesignDialog(page);
}

// The one-time appearance-invitation dialog can open on its own delayed timer
// (an internal setTimeout fired after the first post-login render), so calling
// dialog.close() only clears whatever is open right now: it does not stop a
// dialog that is still mid-flight from opening moments later and intercepting
// the next click via its full-viewport ::backdrop. closeDesignDialog() waits
// for the element to be fully removed from the DOM (not just missing its
// `open` attribute) before returning, and clickThroughDesignDialog() retries a
// click that gets intercepted by a dialog that (re)appeared in that window.
async function closeDesignDialog(page) {
  await page.keyboard.press('Escape');
  // Close on every poll, not just once: on a slow runner the invitation's
  // delayed timer can open a fresh dialog after the first close, and nothing
  // else would ever close it.
  await page.waitForFunction(() => {
    document.querySelectorAll('.wd-design-dialog[open]').forEach(dialog => dialog.close());
    return !document.querySelector('.wd-design-dialog');
  });
}

async function clickThroughDesignDialog(page, selector, {attempts = 4} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await page.locator(selector).click({timeout: 3000});
      return;
    } catch (error) {
      if (attempt === attempts || !(await page.locator('.wd-design-dialog').count())) throw error;
      await closeDesignDialog(page);
    }
  }
}

/* Secondary menus (Manage sub-tabs, Presider sections). On phones the app hides the
   original row and mirrors it into nav#subnav-top below the header (watchTopSubnav in
   app.js, html[data-subnav-top="on"]). A mirrored button carries only its position, so
   these helpers find the original by selector and then use whichever copy a person can
   actually see and tap at the current width. */
async function subButton(page, selector) {
  const original = page.locator(selector).first();
  await original.waitFor({state: 'attached'});
  if (await original.isVisible()) return original;
  const index = await original.evaluate(button =>
    [...button.closest('.subnav, .ns-tabs').querySelectorAll('button')].indexOf(button));
  const mirrored = page.locator(`nav#subnav-top button[data-top-index="${index}"]`);
  await mirrored.waitFor({state: 'visible'});
  return mirrored;
}
async function subClick(page, selector) {
  await (await subButton(page, selector)).click();
  await page.waitForTimeout(120);
}
const subText = async (page, selector) => (await (await subButton(page, selector)).innerText()).trim();
const manageSub = name => `#view .subnav:not(.chips) [data-act="sub"][data-sub="${name}"]`;
const songSub = name => `#song-root .ns-tabs [data-tab="${name}"]`;
const songSubActive = '#song-root .ns-tabs button.active';

const domainWrites = page => page.evaluate(() => __mockLive.writes.filter(write =>
  /^(schedule\/|setlists\/|songStats\/|requests\/|app\/settings$|app\/departments$)/.test(write.path)
));

/* Shared phone chrome that every appearance must keep (F4, F6, F7, F10). */
async function chromeChecks(page, mode) {
  const facts = await page.evaluate(() => {
    const shown = el => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' &&
      el.getBoundingClientRect().width > 0;
    const all = selector => [...document.querySelectorAll(selector)].filter(shown);
    const box = el => { const r = el.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, width: r.width, height: r.height}; };
    const bar = document.querySelector('nav.tabs');
    const pill = document.getElementById('sync-pill');
    const feedback = document.getElementById('wd-feedback-open');
    return {
      viewport: innerHeight,
      bar: box(bar),
      headers: all('.wd-head').length,
      titles: all('[data-wd-head="screen"]').map(el => el.textContent.trim()),
      chips: all('[data-wd-head="member"]').map(el => el.getAttribute('aria-label')),
      appearance: all('[data-design-open]').map(box),
      removedButtons: all('[data-aurora="motion"], [data-aurora="theme"], .prism-utility').length,
      pill: pill && shown(pill) ? {...box(pill), label: pill.getAttribute('aria-label') || pill.textContent.trim()} : null,
      feedback: feedback && shown(feedback) ? {...box(feedback), label: feedback.getAttribute('aria-label')} : null,
      banners: document.getElementById('banners').innerText
    };
  });
  check(mode + ' main tabs float at the bottom of a phone screen',
    facts.bar.top > facts.viewport * 0.75 && facts.bar.bottom <= facts.viewport);
  check(mode + ' shows exactly one shared header', facts.headers, 1);
  check(mode + ' header names the current screen', facts.titles, ['Schedule']);
  check(mode + ' member chip names who is signed in', facts.chips, ['Signed in as B. Anthony. Account menu']);
  check(mode + ' has one small Appearance icon in the header',
    facts.appearance.length === 1 && facts.appearance[0].width <= 44 && facts.appearance[0].height <= 44);
  check(mode + ' has no dark mode button, pause button, or Prism utility row', facts.removedButtons, 0);
  check(mode + ' has no "Signed in as" banner', /Signed in as/.test(facts.banners), false);
  check(mode + ' shows the floating feedback button above the bottom bar',
    !!facts.feedback && facts.feedback.label === 'Send feedback' && facts.feedback.bottom <= facts.bar.top + 1);
  if (mode === 'classic' || mode === 'navy') {
    check(mode + ' shows Live sync as a labelled dot on phones',
      !!facts.pill && facts.pill.width <= 24 && facts.pill.label === 'Live sync on');
  }
  await page.emulateMedia({colorScheme: 'dark'});
  await page.waitForTimeout(120);
  check(mode + (mode === 'prism' || mode === 'aurora' ? ' follows the device dark setting' : ' stays light when the device is dark'),
    await page.evaluate(() => document.body.classList.contains('dark')), mode === 'prism' || mode === 'aurora');
  await page.emulateMedia({colorScheme: 'light'});
  await page.waitForTimeout(120);
  check(mode + ' returns to light with the device', await page.evaluate(() => document.body.classList.contains('dark')), false);
}

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
  check('Hosting release guard staged', await exists(path.join(stage, 'scripts', 'guard-gallery-deploy.mjs')));
  check('No rules or functions staged', assets.has('firestore.rules') || assets.has('functions'), false);
  const stagedApp = String(assets.get('app.js'));
  // manageServiceVisible and manageRequestVisible's real declarations moved
  // to views/manage.js (docs/PLAN-2026-09-22-APP-JS-SPLIT.md Section 4): app.js
  // now only imports the names, so counting stagedApp alone would undercount
  // by exactly the declaration (and, for manageRequestVisible, its own
  // internal call) that used to live inline. Count across both staged files,
  // the way the split actually ships them, instead of lowering the bar.
  const stagedManage = String(assets.get('views/manage.js') || '');
  check('Alternative Manage summaries use department-scoped services',
    (stagedApp + stagedManage).split('.filter(manageServiceVisible)').length >= 3);
  check('Alternative Manage summaries use authorized requests',
    (stagedApp + stagedManage).split('manageRequestVisible').length >= 5);

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
  const loginOptions = await page.locator('#member-login option').evaluateAll(options =>
    options.map(option => ({value: option.value, label: option.textContent})));
  check('Known ghost identities are removed from member choices', loginOptions.some(option =>
    ['B,James', 'BJason', 'S. Melisaa', 'S. Monica C.', 'S. Monica S.'].includes(option.value)), false);
  check('Canonical member choices remain unique', loginOptions.filter(option =>
    ['B. James', 'B. Jason', 'S. Melissa', 'S. Monica C', 'S. Monica S'].includes(option.value)), [
    {value: 'B. James', label: 'B. James'},
    {value: 'B. Jason', label: 'B. Jason'},
    {value: 'S. Melissa', label: 'S. Melissa'},
    {value: 'S. Monica C', label: 'S. Monica C.'},
    {value: 'S. Monica S', label: 'S. Monica S.'}
  ]);
  check('Other malformed stored names receive clean display-only labels', loginOptions.filter(option =>
    ['B. James S', 'D,Armani', 'H.Elena'].includes(option.value)), [
    {value: 'B. James S', label: 'B. James S.'},
    {value: 'D,Armani', label: 'D. Armani'},
    {value: 'H.Elena', label: 'H. Elena'}
  ]);
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
    if (mode !== 'classic') check(mode + ' appearance toast is the short version', await page.locator('#wd-design-status').innerText()
      .then(text => /design enabled\./.test(text) && !/unchanged/i.test(text)));
    await chromeChecks(page, mode);
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
  check('My Duties dot is announced as a new duty', await page.locator('#tab-my').getAttribute('aria-label'), 'My Duties, new duty');
  check('Manage dot is announced as needing attention', await page.locator('#tab-manage').getAttribute('aria-label'), 'Manage, needs attention');
  const dotColors = await page.evaluate(() => ['#tab-my .dot', '#tab-manage .dot'].map(selector =>
    getComputedStyle(document.querySelector(selector)).backgroundColor.match(/\d+/g).slice(0, 3).map(Number)));
  check('My Duties dot is green and differs from the Manage dot',
    dotColors[0][1] > dotColors[0][0] && dotColors[0][1] > dotColors[0][2] && dotColors[0].join() !== dotColors[1].join());
  check('New duty appears in the top alert banner', await page.locator('#banners .banner.alert').allInnerTexts()
    .then(texts => texts.some(text => text.toLowerCase().includes('new duty'))));
  await navigate(page, 'my');
  check('Opening My Duties clears its unread badge', await page.locator('#tab-my .dot').count(), 0);
  check('Cleared My Duties tab drops its new-duty label', await page.locator('#tab-my').getAttribute('aria-label'), null);
  check('Header follows the screen to My Duties', await page.locator('[data-wd-head="screen"]:visible').evaluate(el => el.textContent.trim()), 'My Duties');
  check('My Duties shows the recent new-duty update', await page.locator('.alert-item').innerText()
    .then(text => text.includes('New duty')));

  await navigate(page, 'manage');
  check('Admin sees Manage', await page.locator('#tab-manage').isVisible());
  check('Admin sees multi-department Manage selector', await page.locator('#manage-dept').evaluate(select =>
    [...select.options].map(option => option.textContent)),
  ['All Departments', 'Worship', 'Usher Sisters', 'Usher Brothers', 'Lobby', 'Translation', 'Media', 'Parking Lot', 'Offering']);
  check('Header follows the screen to Manage', await page.locator('[data-wd-head="screen"]:visible').evaluate(el => el.textContent.trim()), 'Manage');
  check('Phone hides the original Manage sub-tabs', await page.locator(manageSub('leaders')).isVisible(), false);
  check('Phone shows the mirrored Manage row below the header', await page.locator('nav#subnav-top').evaluate(nav =>
    document.documentElement.dataset.subnavTop === 'on' && !nav.hidden && nav.getAttribute('aria-label') === 'Manage sections' &&
    nav.getBoundingClientRect().top < document.getElementById('view').getBoundingClientRect().top));
  check('Mirrored row keeps the same labels and order as the original', await page.locator('nav#subnav-top button').allTextContents(),
    await page.locator('#view .subnav:not(.chips) button').allTextContents().then(labels => labels.map(label => label.trim())));
  check('Administrator has the Feedback sub-tab', await page.locator(manageSub('feedback')).count(), 1);
  check('Manage no longer carries its own Sign out', await page.locator('#view [data-act="member-logout"]').count(), 0);
  await page.setViewportSize({width: 1280, height: 850});
  await page.waitForTimeout(150);
  check('Wide screens keep the original Manage sub-tabs', await page.locator(manageSub('leaders')).isVisible());
  check('Wide screens do not show the mirrored row', await page.locator('nav#subnav-top').isVisible(), false);
  await page.setViewportSize({width: 390, height: 850});
  await page.waitForTimeout(150);
  await subClick(page, manageSub('leaders'));
  check('Leader Configuration does not render a congregation checkbox matrix', await page.locator('[data-chg="role-config"]').count(), 0);
  check('Leader Configuration lists only assigned department leaders', await page.locator('.role-assignment').allInnerTexts()
    .then(rows => rows.some(row => row.includes('E. Simon')) && rows.every(row => !row.includes('D. Caleb'))));
  const mediaLeaderForm = page.locator('form[data-act="role-config-add"][data-dept="Media"]');
  await mediaLeaderForm.locator('select').selectOption('D. Caleb');
  await mediaLeaderForm.locator('button').click();
  await page.waitForFunction(() => (window.__roleWrites || []).some(write =>
    write.payload.roleType === 'departmentLeader' && write.payload.department === 'Media' &&
    write.payload.memberName === 'D. Caleb' && write.payload.enabled === true));
  check('Adding a department leader uses the secured role callable', await page.locator('.role-assignment').allInnerTexts()
    .then(rows => rows.some(row => row.includes('D. Caleb'))));
  await page.locator('#manage-dept').selectOption('Media');
  check('Planning tab shows its unresolved conflict count', await subText(page, manageSub('planning')), 'Planning (2)');
  await subClick(page, manageSub('planning'));
  check('Unresolved doubles render as review cards', await page.locator('.plan-conflict.card').count(), 2);
  check('Every conflict review card can open its service', await page.locator('.plan-conflict [data-act="req-open-service"]').count(), 2);
  await subClick(page, manageSub('services'));
  await page.locator('[data-act="expand"][data-id="m:2026-07-02_evening"]').click();
  const mediaDuty = page.locator('[data-chg="assign"][data-duty="Media Booth #1"]').first();
  const scheduleWritesBeforeDepartmentAssignment = await domainWrites(page);
  await mediaDuty.selectOption('member:M. Chloe');
  await page.waitForFunction(() => (window.__departmentWrites || []).some(write => write.name === 'assignDepartmentDuty'));
  check('Normal assignment records the UID keyed callable write', await page.evaluate(() =>
    window.__departmentWrites.some(write => write.name === 'assignDepartmentDuty' && write.assignment.memberUid === 'member:M. Chloe')));
  check('Normal assignment does not write schedule directly after the callable', await domainWrites(page), scheduleWritesBeforeDepartmentAssignment);
  await page.locator('.department-override summary').first().click();
  const overrideTarget = page.locator('.department-override select').first();
  const overrideReason = page.locator('.department-override input').first();
  const scheduleWritesBeforeDepartmentOverride = await domainWrites(page);
  await overrideTarget.selectOption('member:D. Caleb');
  await overrideReason.fill('Emergency coverage approved by administrator');
  await page.locator('[data-act="department-override-submit"]').first().click();
  await page.waitForFunction(() => (window.__departmentWrites || []).some(write => write.name === 'overrideDepartmentAssignment'));
  check('Administrator override is explicit and profile neutral', await page.evaluate(() => {
    const write = (window.__departmentWrites || []).find(item => item.name === 'overrideDepartmentAssignment');
    const profile = (window.__fixtureDepartmentRoster.Media || []).find(item => item.memberUid === 'member:D. Caleb');
    return !!write && write.assignment.override === true && write.assignment.overrideReason && profile.status === 'inactive';
  }));
  check('Administrator override does not write schedule directly after the callable', await domainWrites(page), scheduleWritesBeforeDepartmentOverride);
  // The "needs your attention" banner was removed (2026-09-19); the dot on the Manage tab carries that signal.
  check('No request and conflict attention banner is rendered', await page.locator('#banners [data-act="open-manage-queue"]').count(), 0);
  check('Requests tab counts requests without adding conflicts', await subText(page, manageSub('requests')), 'Requests (1)');
  await subClick(page, manageSub('requests'));
  check('Stale request is removed from the pending queue', await page.locator('.aw-requests-content .card').allInnerTexts()
    .then(cards => cards.every(text => !text.includes('D. Caleb'))));
  check('Stale request remains available as completed history', await page.locator('[data-act="expand"][data-id="req-resolved"]').innerText(), 'Show 1 resolved request');

  await subClick(page, manageSub('feedback'));
  await page.waitForSelector('.wd-fbk-entry');
  check('Administrator Feedback list reads the feedback collection', await page.locator('.wd-fbk-entry').allInnerTexts().then(entries =>
    entries.length === 1 && entries[0].includes('Fixture suggestion') && entries[0].includes('S. Lisa') &&
    entries[0].includes('Suggest a change') && entries[0].includes('My Duties screen') && entries[0].includes('Prism')));
  check('Feedback list never shows a raw member ID', await page.locator('#view').innerText().then(text => /member:/.test(text)), false);
  await page.locator('.wd-fbk-entry [data-fbk="done"]').click();
  await page.waitForFunction(() => __mockLive.writes.some(write => write.path === 'feedback/fixture-note-1'));
  check('Mark done writes only to that feedback note', await page.evaluate(() =>
    __mockLive.writes.filter(write => write.path.startsWith('feedback/')).map(write => [write.path, write.value && write.value.status])),
  [['feedback/fixture-note-1', 'done']]);
  await subClick(page, manageSub('services'));

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
  await page.waitForSelector('#song-root .ns-tabs', {state: 'attached'});
  check('Header follows the screen to Presider', await page.locator('[data-wd-head="screen"]:visible').evaluate(el => el.textContent.trim()), 'Presider');
  check('Phone shows the mirrored Presider row', await page.locator('nav#subnav-top').evaluate(nav =>
    !nav.hidden && nav.getAttribute('aria-label') === 'Presider sections' && nav.offsetParent !== null));
  check('Presider starts on Home', await subText(page, songSubActive), 'Home');
  check('Presider Home shows My Services', await page.locator('#song-root').innerText().then(text => text.includes('My Services')));
  // A refused listener (app/songSettings, app/presiders) must not disconnect the planner.
  await page.waitForTimeout(150);
  check('Presider planner shows the shared song list after a refused read',
    await page.locator('#song-root').innerText().then(text => text.includes('1 song')));
  await subClick(page, songSub('library'));
  await page.waitForSelector('#song-root .song-row');
  check('Presider Library shows each song\'s times-sung count',
    (await page.locator('#song-root .song-row').first().locator('.s-times').innerText()).trim(), '3×');
  await subClick(page, songSub('home'));
  await page.evaluate(() => {
    const id = 'setlists/2026-07-01_morning';
    window.__mockLive.emit(id, {...window.__mockLive.get(id), songs: ['001', '002'], updatedAt: 2});
  });
  await page.waitForTimeout(150);
  check('Presider planner still receives live song-list changes',
    await page.locator('#song-root').innerText().then(text => text.includes('2 songs')));
  check('Presider has a Services tracking destination', await page.locator('#song-root .ns-tabs [data-tab="services"]').count(), 1);
  check('Presider has Home, Library, Services, and Insights tabs', await page.locator('#song-root .ns-tabs button').allTextContents(),
    ['Home', 'Library', 'Services', 'Insights']);
  await subClick(page, songSub('services'));
  check('Services tracking route opens', await subText(page, songSubActive), 'Services');
  check('Services tracking renders its service history view', await page.locator('#song-root').innerText().then(text => text.includes('Upcoming')));
  await subClick(page, songSub('home'));
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
    if (mode === 'aurora') await page.locator('[data-aurora="day"][data-date="2026-07-01"]').click();
    if (mode === 'navy') {
      await page.locator('[data-nc-act="date"][data-date="2026-07-01"]').click();
      await page.waitForTimeout(150);
      check('Navy & Cream month arrows have a real tap size and a visible icon', await page.locator('.nc-arrows .nc-button').evaluateAll(buttons =>
        buttons.length === 2 && buttons.every(button => {
          const box = button.getBoundingClientRect(), icon = button.querySelector('svg').getBoundingClientRect();
          return box.width >= 40 && box.height >= 40 && icon.width >= 14 && icon.height >= 14 && !!button.getAttribute('aria-label');
        })));
      // Correct behavior: Day view shows the one selected service. The shared "Next service"
      // card (section.schedule-focus) is still drawn under it today. Fix owned by lane F12.
      knownIssue('Navy & Cream Day view shows a single service card', 'F12 navy double card',
        await page.locator('#view .card:visible').count(), 1);
    }
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
  await closeDesignDialog(current.page);
  const leaderOptions = await current.page.locator('#manage-dept option').allTextContents();
  check('Leader Manage selector is scoped to configured departments', leaderOptions, ['Worship', 'Media']);
  check('Leader cannot see the global Manage option', leaderOptions.includes('All Departments'), false);
  check('Department leader has no Feedback sub-tab', await current.page.locator(manageSub('feedback')).count(), 0);
  check('Non-admin leader cannot activate administrator override UI', await current.page.locator('.department-override').count(), 0);
  await clickThroughDesignDialog(current.page, '[data-act="department-open"][data-department="Media"]');
  await current.page.waitForSelector('.department-hero');
  check('Leader department page shows returned leader records', await current.page.locator('.department-leader-strip').innerText().then(text => /E\. Simon/.test(text)));
  check('Leader department page shows active and inactive profile groups', await current.page.locator('.department-group-heading').allTextContents().then(texts =>
    texts.some(text => text.includes('Active profiles') && text.includes('3')) && texts.some(text => text.includes('Inactive profiles') && text.includes('1'))));
  check('Leader department page does not use the congregation-wide roster', await current.page.locator('.department-member-row').allTextContents().then(texts =>
    texts.length === 4 && texts.some(text => text.includes('E. Simon')) && texts.some(text => text.includes('S. Lisa')) && texts.some(text => text.includes('M. Chloe')) && texts.some(text => text.includes('D. Caleb'))));
  // Add member is a name search (F3): one search box, no UID or technical inputs.
  const addForm = current.page.locator('form.department-add-form[data-act="department-member-search"]');
  check('Add member form is a single name search', await addForm.locator('input').evaluateAll(inputs =>
    inputs.map(input => [input.id, input.type])), [['department-member-query', 'search']]);
  check('Add member form never asks for a UID', await addForm.innerText().then(text => /\bUID\b|member:/i.test(text)), false);
  await addForm.locator('#department-member-query').fill('Jas');
  await addForm.locator('button[type="submit"]').click();
  await current.page.waitForSelector('[data-act="department-member-add"]');
  check('Name search calls the scoped candidate lookup', await current.page.evaluate(() => window.__searchCalls),
    [{departmentId: 'Media', query: 'Jas', page: 1}]);
  check('Name search lists matching members by display name only', await addForm.locator('.department-member-row').allInnerTexts()
    .then(rows => rows.map(row => row.replace(/\s+/g, ' ').trim())), ['B. Jason Add']);
  await addForm.locator('[data-act="department-member-add"][data-uid="member:B. Jason"]').click();
  await current.page.waitForFunction(() => (window.__profileCreates || []).length === 1);
  check('Add creates an ordinary, not yet schedulable department profile', await current.page.evaluate(() => window.__profileCreates), [{
    departmentId: 'Media', memberUid: 'member:B. Jason', memberName: 'B. Jason', status: 'active',
    eligibleDuties: [], schedulable: false, availability: {recurring: {}, exceptions: {}}
  }]);
  await current.page.waitForFunction(() => [...document.querySelectorAll('.department-member-open')].some(row => row.textContent.includes('B. Jason')));
  check('Added member appears in the department roster', await current.page.locator('.department-member-open').allInnerTexts()
    .then(rows => rows.some(row => row.includes('B. Jason'))));
  await addForm.locator('#department-member-query').fill('S. Lis');
  await addForm.locator('button[type="submit"]').click();
  await current.page.waitForFunction(() => document.querySelector('form.department-add-form')?.textContent.includes('Already in Media'));
  check('Existing department members cannot be added twice', await addForm.locator('[data-act="department-member-add"]').count(), 0);
  check('Leader can reset a PIN for members of the department only', await current.page.locator('[data-act="reset-member-pin"]').evaluateAll(buttons =>
    buttons.length > 0 && buttons.every(button => button.dataset.dept === 'Media')));
  await current.page.locator('[data-act="department-member-open"][data-uid="member:S. Lisa"]').click();
  await current.page.waitForSelector('.department-profile-hero');
  check('Leader member profile opens for the chosen member', await current.page.locator('.department-profile-hero').innerText()
    .then(text => text.includes('S. Lisa')));
  check('Leader member profile shows no UID or raw member ID', await Promise.all([
    current.page.locator('.department-uid').count(),
    current.page.locator('#view').innerText().then(text => /\bUID\b|member:/.test(text))
  ]), [0, false]);
  check('Leader member profile exposes eligibility and availability editors', await current.page.locator('.department-editor').allTextContents().then(texts => texts.join(' ')).then(text =>
    text.includes('Eligible duties') && text.includes('Recurring availability') && text.includes('Date exceptions')));
  check('Date exception wins in the rendered profile model', await current.page.locator('.department-exception-row').innerText().then(text => /2026-07-02/.test(text)));
  check('Historical evidence renders as readable duty suggestions', await current.page.locator('.department-history').innerText()
    .then(text => text.includes('Historical duty suggestions') && text.includes('Media Booth #1') && text.includes('Evening')));
  check('Historical evidence does not render raw JSON', await current.page.locator('.department-history pre').count(), 0);
  for (const mode of ['prism', 'navy', 'aurora', 'classic']) {
    await choose(current.page, mode);
    await navigate(current.page, 'manage');
    check('Leader-only Manage remains visible in ' + mode, await current.page.locator('#tab-manage').isVisible());
    check('Leader scope remains limited in ' + mode, await current.page.locator('#manage-dept option').allTextContents(), ['Worship', 'Media']);
    check('Department profile journey remains available in ' + mode, await current.page.locator('.department-profile-hero').count(), 1);
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

  current = await make({member: 'S. Lisa'});
  sessions.add(current.context);
  await releaseSettings(current.page);
  await unlockSite(current.page);
  await login(current.page, 'S. Lisa');
  await current.page.waitForTimeout(260);
  await closeDesignDialog(current.page);
  await navigate(current.page, 'my');
  check('My Duties no longer holds the availability editor', await current.page.locator('.own-availability-card').count(), 0);
  // The availability editor opens from the account menu on the member chip.
  const memberChip = current.page.locator('[data-wd-head="member"]:visible');
  check('Member chip is a closed menu button', await memberChip.evaluate(chip =>
    [chip.getAttribute('aria-haspopup'), chip.getAttribute('aria-expanded')]), ['menu', 'false']);
  await memberChip.click();
  check('Account menu offers Availability, Settings, Sign out', await current.page.locator('[data-wd-head="menu"]:visible [role="menuitem"]').allTextContents(),
    ['Availability', 'Settings', 'Sign out']);
  await current.page.keyboard.press('Escape');
  check('Escape closes the account menu', await current.page.locator('[data-wd-head="menu"]:visible').count(), 0);
  await memberChip.click();
  await current.page.locator('[data-wd-head="menu"]:visible [data-view="availability"]').click();
  await current.page.waitForSelector('.own-availability-card');
  check('Header names the Availability view', await current.page.locator('[data-wd-head="screen"]:visible').evaluate(el => el.textContent.trim()), 'Availability');
  check('No bottom tab is highlighted on an account view', await current.page.locator('nav.tabs button.active').count(), 0);
  check('Member sees shared availability outside Manage', await current.page.locator('.own-availability-card').count(), 1);
  check('Member sees availability attribution', await current.page.locator('.own-availability-card .department-attribution').innerText()
    .then(text => text.includes('E. Simon') && text.includes('2026')));
  check('Attribution never shows a raw member ID', await current.page.locator('#view').innerText().then(text => /member:/.test(text)), false);
  const ownAvailability = current.page.locator('.own-availability-card').first();
  const ownAvailabilitySelect = ownAvailability.locator('[data-chg="member-availability-recurring"]').first();
  await ownAvailabilitySelect.selectOption('unavailable');
  await current.page.locator('[data-act="member-availability-save"]').click();
  await current.page.waitForFunction(() => (window.__profileWrites || []).some(write => write.name === 'updateMemberAvailability'));
  check('Member availability uses the availability callable with its own UID', await current.page.evaluate(() => {
    const write = (window.__profileWrites || []).find(item => item.name === 'updateMemberAvailability');
    return !!write && write.payload.departmentId === 'Media' &&
      write.payload.memberUid === 'member:S. Lisa' &&
      Object.keys(write.payload.patch || {}).join(',') === 'availability';
  }));
  check('Member availability update keeps profile identity and role', await current.page.evaluate(() => {
    const profile = (window.__fixtureDepartmentRoster.Media || []).find(item => item.memberUid === 'member:S. Lisa');
    return !!profile && profile.status === 'active' && profile.role === 'member' && profile.memberUid === 'member:S. Lisa';
  }));
  check('Member availability update does not write schedule directly', await domainWrites(current.page), []);

  // Settings view: notification help is a closed disclosure with the calendar link inside (F5).
  await current.page.evaluate(() => {
    const settings = structuredClone(__designFixture.docs['app/settings']);
    settings.features.calendarExport = true;
    __mockLive.emit('app/settings', settings);
  });
  await current.page.locator('[data-wd-head="member"]:visible').click();
  await current.page.locator('[data-wd-head="menu"]:visible [data-view="settings"]').click();
  await current.page.waitForSelector('.account-view[data-account="settings"] details.notify-help');
  check('Header names the Settings view', await current.page.locator('[data-wd-head="screen"]:visible').evaluate(el => el.textContent.trim()), 'Settings');
  const help = current.page.locator('.account-view[data-account="settings"] details.notify-help');
  check('Notification help starts closed', await help.evaluate(details => details.open), false);
  check('Copy calendar link lives inside the closed help', [
    await help.locator('[data-act="copy-ics"]').count(),
    await help.locator('[data-act="copy-ics"]').isVisible(),
    await current.page.locator('#view [data-act="copy-ics"]').count()
  ], [1, false, 1]);
  await help.locator('summary').click();
  check('Opening the help reveals Copy calendar link', await help.locator('[data-act="copy-ics"]').isVisible());
  check('Settings offers the Appearance chooser', await current.page.locator('.account-view [data-design-open]').count(), 1);

  // Floating feedback button and sheet (F10). The write goes to the mocked feedback collection only.
  await current.page.locator('#wd-feedback-open').click();
  await current.page.waitForSelector('#wd-feedback-sheet[open]');
  check('Feedback sheet offers the three kinds', await current.page.locator('#wd-feedback-sheet .wd-fbk-kinds label').allInnerTexts()
    .then(labels => labels.map(label => label.trim())), ['Feedback', 'Report a bug', 'Suggest a change']);
  await current.page.locator('#wd-feedback-sheet [data-fbk="send"]').click();
  check('Empty feedback is not sent', [
    await current.page.locator('#wd-feedback-sheet .wd-fbk-error').innerText(),
    await current.page.evaluate(() => __mockLive.writes.filter(write => write.path.startsWith('feedback/')).length)
  ], ['Type a message first.', 0]);
  await current.page.locator('#wd-feedback-sheet input[value="bug"]').check();
  await current.page.locator('#wd-fbk-text').fill('Fixture bug report from the test suite.');
  await current.page.locator('#wd-feedback-sheet [data-fbk="send"]').click();
  await current.page.waitForFunction(() => __mockLive.writes.some(write => write.path.startsWith('feedback/')));
  check('Feedback is saved once to the feedback collection with who, what and where', await current.page.evaluate(() =>
    __mockLive.writes.filter(write => write.path.startsWith('feedback/')).map(write => ({
      op: write.op, uid: write.value.uid, name: write.value.name, kind: write.value.kind, message: write.value.message,
      screen: write.value.screen, status: write.value.status, dated: Number.isFinite(write.value.createdAt)
    }))), [{
    op: 'set', uid: 'member:S. Lisa', name: 'S. Lisa', kind: 'bug', message: 'Fixture bug report from the test suite.',
    screen: 'my', status: 'new', dated: true
  }]);
  await current.page.waitForFunction(() => !document.querySelector('#wd-feedback-sheet')?.open);
  check('Sending feedback closes the sheet and thanks the member', await current.page.locator('#banners').innerText()
    .then(text => text.includes('Your feedback was sent')));
  check('Sending feedback touches no schedule or request data', await domainWrites(current.page), []);

  // Sign out lives in the account menu (F7).
  await current.page.locator('[data-wd-head="member"]:visible').click();
  await current.page.locator('[data-wd-head="menu"]:visible [data-act="member-logout"]').click();
  await current.page.waitForSelector('#member-login');
  check('Account menu Sign out returns to member sign-in', await current.page.locator('nav.tabs').isVisible(), false);
  check('Feedback button is hidden when signed out', await current.page.locator('#wd-feedback-open').isVisible(), false);
  check('Header falls back to Worship Duty when signed out', await current.page.locator('[data-wd-head="screen"]:visible').evaluate(el => el.textContent.trim()), 'Worship Duty');
  check('No uncaught JavaScript errors in member flow', report.errors, []);
  await closeSession(current);
  current = undefined;

  // One combined reminder banner for several duties in the next 24 hours (F5).
  current = await make({member: 'S. Lisa'});
  sessions.add(current.context);
  await current.page.clock.setSystemTime(new Date('2026-07-01T21:00:00-07:00'));
  await current.page.evaluate(() => {
    __designFixture.docs['app/settings'].features.reminders = true;
    const base = __designFixture.services[1];
    __mockLive.emit('schedule/2026-07-02_morning', {
      ...base, service: 'Morning', time: '09:00', assignments: {Presider: 'E. Simon', 'Usher #1': 'S. Lisa'}
    });
  });
  await releaseSettings(current.page);
  await unlockSite(current.page);
  await login(current.page, 'S. Lisa');
  await current.page.waitForFunction(() => /Reminder/.test(document.getElementById('banners')?.innerText || ''));
  check('Two duties tomorrow produce one combined reminder banner', await current.page.locator('#banners .banner').allInnerTexts()
    .then(banners => banners.filter(text => text.includes('Reminder')).map(text => text.replace(/\s*✕\s*$/, '').trim())),
  ['Reminder: you have 2 duties in the next 24 hours. See My Duties.']);
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

  current = await make({member: 'B. Anthony', retainMaintenance: true});
  sessions.add(current.context);
  await releaseSettings(current.page);
  await unlockSite(current.page);
  await login(current.page, 'B. Anthony');
  // AGENTS.md release gate: a service stops being the default the minute it starts, Pacific time,
  // in all four appearances. Same-day 5:00 AM and 7:30 PM pair, plus a 2:30 PM afternoon service.
  await current.page.evaluate(() => {
    const base = window.__designFixture.services[0];
    window.__mockLive.emit('schedule/2026-07-01_early-morning', {
      ...base, date: '2026-07-01', service: 'Early Morning', time: '05:00'
    });
    window.__mockLive.emit('schedule/2026-07-01_afternoon', {
      ...base, date: '2026-07-01', service: 'Afternoon', time: '14:30'
    });
    window.__mockLive.emit('schedule/2026-07-01_evening', {
      ...base, date: '2026-07-01', service: 'Evening', time: '19:30'
    });
  });
  await navigate(current.page, 'schedule');
  const defaultSelector = {classic:'.schedule-focus', prism:'.prism-service-times [aria-pressed="true"]',
    navy:'.nc-hero', aurora:'.service-switch .selected'};
  const boundaries = [
    ['14:29', '2:30 PM', 'still shows the 2:30 PM afternoon service at 2:29 PM'],
    ['14:31', '7:30 PM', 'advances to the 7:30 PM evening service at 2:31 PM'],
    ['19:29', '7:30 PM', 'still shows the 7:30 PM service at 7:29 PM, not 5 AM'],
    ['19:31', '8:00 PM', 'advances to the next day 8:00 PM service at 7:31 PM']
  ];
  for (const [clock, expected, label] of boundaries) {
    await current.page.clock.setSystemTime(new Date('2026-07-01T' + clock + ':00-07:00'));
    for (const mode of ['classic', 'prism', 'navy', 'aurora']) {
      await choose(current.page, mode);
      await current.page.evaluate(() => __mockLive.emit('schedule/2026-07-01_evening', __mockLive.get('schedule/2026-07-01_evening')));
      await current.page.waitForTimeout(150);
      check(mode + ' ' + label,
        await current.page.locator(defaultSelector[mode]).first().innerText().then(text => text.includes(expected)));
    }
  }
  // An explicit choice of a past service is kept while the automatic default moves on.
  await current.page.clock.setSystemTime(new Date('2026-07-01T19:29:00-07:00'));
  await choose(current.page, 'prism');
  await current.page.locator('.prism-service-times button', {hasText: '5:00 AM'}).first().click();
  await current.page.waitForTimeout(120);
  await current.page.clock.setSystemTime(new Date('2026-07-01T19:31:00-07:00'));
  await current.page.evaluate(() => __mockLive.emit('schedule/2026-07-01_evening', __mockLive.get('schedule/2026-07-01_evening')));
  await current.page.waitForTimeout(150);
  check('prism keeps an explicitly selected past service after the default advances',
    await current.page.locator(defaultSelector.prism).first().innerText().then(text => text.includes('5:00 AM')));
  await current.page.clock.setSystemTime(new Date('2026-07-01T19:29:00-07:00'));
  await current.page.evaluate(() => {
    document.documentElement.dataset.maintenance = 'active';
    window.__mockLive.emit('app/settings', window.__designFixture.docs['app/settings']);
  });
  await current.page.waitForFunction(() => document.querySelector('.maintenance-service-title')?.textContent.includes('Evening'));
  check('Maintenance schedule starts with the approaching evening service',
    await current.page.locator('.maintenance-service-title').first().innerText().then(text => text.includes('Evening')));
  check('Maintenance schedule omits the completed 5 AM service',
    await current.page.locator('#maintenance-schedule').innerText().then(text => !text.includes('5:00 AM')));
  await closeSession(current);
  current = undefined;

  const ownedPaths = [
    path.join(root, 'design-gallery/test.mjs'),
    path.join(root, 'tests/helpers/playwright.mjs'),
    path.join(root, 'tests/schedule-default.test.mjs'),
    path.join(root, 'design-gallery/README.md'),
    path.join(root, 'design-gallery/STATUS.md'),
    path.join(root, '.github/workflows/design-gallery-qa.yml'),
    // docs/PLAN-2026-09-22-APP-JS-SPLIT.md module set, checked once each exists.
    ...protectedNames.filter(name => name.startsWith('core/') || name.startsWith('views/') || name.startsWith('actions/'))
      .map(name => path.join(root, name))
  ];
  for (const ownedPath of ownedPaths) {
    let content;
    try { content = await fs.readFile(ownedPath, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
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
