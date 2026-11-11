'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { loadIndex } = require('./load-index.js');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'index.js');
const sources = fs.readdirSync(root).filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(root, file), 'utf8'));

/* Load index.js with the Firebase Admin SDK stubbed out, as
   scripts/deploy-functions.mjs does, to see what it exports without a
   project or credentials. */
function loadExports() {
  const original = Module._load;
  const db = { collection: () => ({ doc: () => ({}) }), runTransaction: () => {}, batch: () => {} };
  Module._load = function load(request, ...rest) {
    if (request === 'firebase-admin/app') return { initializeApp() {} };
    if (request === 'firebase-admin/firestore') return { getFirestore: () => db, FieldValue: { delete() {} } };
    if (request === 'firebase-admin/auth') return { getAuth: () => ({}) };
    if (request === 'firebase-admin/messaging') return { getMessaging: () => ({}) };
    return original.call(this, request, ...rest);
  };
  try {
    delete require.cache[require.resolve(sourcePath)];
    return require(sourcePath);
  } finally {
    Module._load = original;
  }
}

test('exports exactly the functions the app and the public site use', () => {
  assert.deepEqual(Object.keys(loadExports()).sort(), [
    'acceptDepartmentInvitation', 'addServiceYear', 'assignDepartmentDuty', 'changeMemberPin', 'checkSheet',
    'createDepartmentInvitation', 'createDepartmentProfile', 'dutyReminders', 'ics', 'listDepartmentRoster',
    'onFeedbackDone', 'onRequestCreated', 'onRequestResolved', 'onScheduleWrite', 'overrideDepartmentAssignment', 'publicSchedule',
    'renameMember', 'resetMemberPin', 'resolveDutyAttention', 'revokeDepartmentInvitation', 'saveDepartmentAssignments',
    'saveMemberAvailability', 'scheduledSheetSync', 'searchDepartmentCandidates', 'servingMembers', 'setDutyDefault', 'setManualOnly', 'setOkPair', 'songHistoryRecorder', 'songIngest',
    'syncSheetNow', 'unassignDepartmentDuty', 'updateDepartmentProfile', 'updateMemberAvailability',
    'updateRoleConfiguration', 'verifyMemberPin', 'yearlyServices'
  ]);
});

test('keeps member PIN material out of the logs', () => {
  for (const source of sources) {
    assert.doesNotMatch(source, /logger\.(info|warn|error)\([^\n]*\bpin\b/i);
    assert.doesNotMatch(source, /console\.(log|warn|error)\([^\n]*\bpin\b/i);
  }
});

const signedIn = (name, extra = {}) => ({ uid: 'member:' + name, token: Object.assign({ memberId: name, memberName: name, roleVersion: 1 }, extra) });
const account = (name, roles) => ({ memberName: name, active: true, roleVersion: 1, roles, departments: [], mustChangePin: false });

test('role changes need a leader manager and are recorded', async () => {
  const docs = { 'accounts/B. Anthony': account('B. Anthony', ['admin']), 'accounts/S. Leah': account('S. Leah', []) };
  const { functions } = loadIndex(docs);
  const change = auth => functions.updateRoleConfiguration.run({ auth, data: { roleType: 'songEditor', memberName: 'S. Ruth', enabled: true } });
  await assert.rejects(change(signedIn('S. Leah')), error => error.code === 'permission-denied' && error.details.reason === 'not-allowed');
  await change(signedIn('B. Anthony'));
  const audit = Object.entries(docs).filter(([key]) => key.startsWith('audit/')).map(([, entry]) => [entry.action, entry.actor, entry.target]);
  assert.deepEqual(audit, [['role-configuration-changed', 'B. Anthony', 'S. Ruth']]);
  assert.deepEqual(docs['accounts/S. Ruth'].roles, ['songEditor']);
});

test('the sheet import and check need a leader or an administrator, and the import respects its switch', async () => {
  const docs = {
    'accounts/S. Leah': account('S. Leah', []),
    'accounts/S. Grace': Object.assign(account('S. Grace', ['departmentLeader']), { departments: ['Usher Sisters'] }),
    'app/settings': { features: { sheetSync: false } }
  };
  let fetched = 0;
  const loaded = loadIndex(docs, { fetch: async () => { fetched += 1; throw new Error('not reached'); } });
  try {
    for (const name of ['syncSheetNow', 'checkSheet']) {
      await assert.rejects(loaded.functions[name].run({ auth: signedIn('S. Leah'), data: {} }),
        error => error.code === 'permission-denied' && error.details.reason === 'not-allowed', name);
    }
    // A leader gets past the access check; checking then needs the Sheet's link.
    await assert.rejects(loaded.functions.checkSheet.run({ auth: signedIn('S. Grace'), data: {} }),
      error => error.details && error.details.reason === 'sheet-not-set');
    await loaded.functions.scheduledSheetSync.run({});
  } finally {
    loaded.restore();
  }
  assert.equal(fetched, 0);
});
