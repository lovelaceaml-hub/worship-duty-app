'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceRoot = path.resolve(__dirname, '../../../../../');
const core = require(path.join(sourceRoot, 'src/core/constants.js'));
const stateService = require(path.join(sourceRoot, 'src/core/state.js'));
const schedule = require(path.join(sourceRoot, 'src/domain/schedule.js'));
const member = require(path.join(sourceRoot, 'src/domain/member.js'));
const coordinator = require(path.join(sourceRoot, 'src/domain/coordinator.js'));
const sheet = require(path.join(sourceRoot, 'src/domain/sheet.js'));
const storage = require(path.join(sourceRoot, 'src/services/storage.js'));
const firebase = require(path.join(sourceRoot, 'src/services/firebase.js'));
const subscriptions = require(path.join(sourceRoot, 'src/services/subscriptions.js'));
assert.equal(member.dutiesFor, undefined);
assert.equal(coordinator.workloadStats, undefined);
assert.equal(coordinator.suggestSubs, undefined);

const runtimeModules = Array.from(fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8').matchAll(/<script[^>]*src=[\"'](src\/[^\"']+)[\"']/g), match => match[1].split('?')[0]);
assert.ok(runtimeModules.includes('src/services/assignments.js'), 'entrypoint must include assignment persistence');
const browserSandbox = { window: {} };
vm.createContext(browserSandbox);
runtimeModules.forEach(relativePath => {
  vm.runInContext(fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8'), browserSandbox, { filename: relativePath });
});
assert(Object.isFrozen(browserSandbox.window.WorshipApp.core));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.services.state));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.domain.schedule));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.domain.setlist));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.domain.member));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.domain.coordinator));
assert.equal(browserSandbox.window.WorshipApp.domain.member.dutiesFor, undefined);
assert.equal(browserSandbox.window.WorshipApp.domain.coordinator.workloadStats, undefined);
assert.equal(browserSandbox.window.WorshipApp.domain.coordinator.suggestSubs, undefined);
assert(Object.isFrozen(browserSandbox.window.WorshipApp.domain.sheet));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.services.storage));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.services.firebase));
assert(Object.isFrozen(browserSandbox.window.WorshipApp.services.subscriptions));

const appLocalStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) || null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
  key(index) { return Array.from(this.values.keys())[index] || null; },
  get length() { return this.values.size; }
};
const appSandbox = {
  window: {
    SEED_DATA: {
      members: ['Fictional Member'],
      services: [{ date: '2026-09-20', service: 'Morning', worship: 'Sabbath Day', time: '09:00', assignments: {} }]
    },
    localStorage: appLocalStorage
  },
  localStorage: appLocalStorage,
  document: { addEventListener() {} }
};
vm.createContext(appSandbox);
runtimeModules.forEach(relativePath => {
  vm.runInContext(fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8'), appSandbox, { filename: relativePath });
});
const appSource = fs.readFileSync(path.join(sourceRoot, 'app.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
vm.runInContext(appSource, appSandbox, { filename: 'app.js' });

assert(Object.isFrozen(core));
assert(Object.isFrozen(stateService));
assert(Object.isFrozen(schedule));
assert(Object.isFrozen(member));
assert(Object.isFrozen(coordinator));
assert(Object.isFrozen(sheet));
assert(Object.isFrozen(storage));
assert(Object.isFrozen(firebase));
assert(Object.isFrozen(subscriptions));

const categories = [
  { name: 'Worship', duties: ['Presider', 'Prayer of Thanks'] },
  { name: 'Usher Sisters', duties: ['Usher Door', 'Usher Front'] },
  { name: 'Media', duties: ['Media Booth #1'] }
];

const csv = [
  'Date,Service,Worship,Time,Duty,Member',
  '"Sat, Sep 12",Morning,Sabbath Day,9:00 AM,Prayer of Thanks,Alex Example',
  '"Sat, Sep 12",Morning,Sabbath Day,9:00 AM,Choir Song,"Song, Fictional"',
  '"Sat, Sep 12",Morning,Sabbath Day,9:00 AM,Presider,',
  '"Sat, Sep 12",Morning,Sabbath Day,9:00 AM,Unknown Duty,Casey Example'
].join('\r\n');
const rows = sheet.parseCSV(csv);
assert.deepEqual(rows[1][0], 'Sat, Sep 12');
assert.deepEqual(rows[1][5], 'Alex Example');
const parsed = sheet.sheetRowsToServices(rows, new Date(2026, 8, 10, 12), categories);
assert.equal(parsed.services.length, 1);
assert.equal(parsed.services[0].date, '2026-09-12');
assert.equal(parsed.services[0].assignments.Presider, '');
assert.equal(parsed.services[0].assignments['Prayer of Thanks'], 'Alex Example');
assert.equal(parsed.services[0].choirSong, 'Song, Fictional');
assert.deepEqual(parsed.members, ['Alex Example']);
assert.deepEqual(parsed.warnings, ['Unknown duty in sheet: "Unknown Duty"']);

const conflictService = {
  date: '2026-09-20', service: 'Morning', assignments: {
    'Prayer of Thanks': 'Alex Example',
    'Usher Door': 'Alex Example',
    'Usher Front': 'Alex Example'
  }
};
assert.deepEqual(schedule.conflictsFor(conflictService, categories), [
  { name: 'Alex Example', duties: ['Prayer of Thanks', 'Usher Door', 'Usher Front'] }
]);
const exemptService = {
  date: '2026-09-20', service: 'Morning', assignments: {
    'Prayer of Thanks': 'Alex Example',
    'Usher Door': 'Alex Example'
  }
};
assert.deepEqual(schedule.activeConflicts(exemptService, categories), []);

const existing = {
  date: '2026-09-12', service: 'Morning', worship: 'Sabbath Day', time: '08:00',
  assignments: { Presider: 'Legacy Example', 'Media Booth #1': 'Media Example' }
};
const merged = schedule.mergeSheetServices({
  currentServices: [existing],
  departments: { Worship: ['Legacy Example'], Media: ['Media Example'] },
  sheetServices: parsed.services,
  departmentsLoaded: true,
  categories
});
assert.equal(merged.updated, 1);
assert.equal(merged.services[0].assignments.Presider, '');
assert.equal(merged.services[0].assignments['Media Booth #1'], 'Media Example');
assert.deepEqual(merged.departments.Worship, ['Alex Example', 'Legacy Example']);
assert.equal(existing.assignments.Presider, 'Legacy Example');

const state = {
  members: ['Alex Example', 'Alex Example Old'],
  services: [{
    date: '2026-09-12', service: 'Morning', assignments: { Presider: 'Alex Example Old' },
    conflictOk: { 'Alex Example Old': ['Presider', 'Usher Door'] }
  }],
  departments: { Worship: ['Alex Example Old', 'Alex Example'] }
};
const renamed = schedule.applyNameMap(state, { 'Alex Example Old': 'Alex Example' });
assert.deepEqual(renamed.state.members, ['Alex Example']);
assert.equal(renamed.state.services[0].assignments.Presider, 'Alex Example');
assert.deepEqual(renamed.state.services[0].conflictOk['Alex Example'], ['Presider', 'Usher Door']);
assert.deepEqual(state.members, ['Alex Example', 'Alex Example Old']);

async function main() {
const calls = [];
let releaseAuth;
const auth = new Promise(resolve => { releaseAuth = resolve; });
const fakeStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) || null; },
  setItem(key, value) { this.values.set(key, value); }
};
const fakeFirebase = {
  db: {},
  doc(db, collection, id) { return { collection, id }; },
  setDoc(ref, value) { calls.push({ type: 'set', ref, value }); return Promise.resolve(); },
  deleteDoc(ref) { calls.push({ type: 'delete', ref }); return Promise.resolve(); },
  writeBatch() { return { set() {}, delete() {}, commit() { calls.push({ type: 'batch' }); return Promise.resolve(); } }; },
  knownIds: []
};
let currentState = { members: ['Alex Example'], services: [], settings: { features: {} }, departments: {}, requests: [] };
const gateway = storage.createAdapter({
  storage: fakeStorage,
  dataKey: 'fictional-state',
  getState: () => currentState,
  getFirebase: () => fakeFirebase,
  getAuthReady: () => auth,
  serviceId: schedule.serviceId
});
const pendingWrite = gateway.persistMembers();
assert.equal(calls.length, 0);
releaseAuth();
await pendingWrite;
assert.equal(calls.length, 1);
assert.equal(calls[0].ref.collection, 'app');
assert.equal(calls[0].ref.id, 'members');

let firebaseWriteRan = false;
const firebaseGateway = firebase.createAdapter({
  firebase: fakeFirebase,
  getAuthReady: () => Promise.reject(new Error('fictional auth failure'))
});
await firebaseGateway.write(() => { firebaseWriteRan = true; });
assert.equal(firebaseWriteRan, true);

console.log('Foundation harness passed: pure domains, sheet merge semantics, immutable name map, and auth-gated storage writes.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
