'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(__dirname, '..', 'index.js');
const source = fs.readFileSync(sourcePath, 'utf8');

/* Load index.js with the Firebase Admin SDK stubbed out, to see what it
   exports without a project or credentials. */
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
    'acceptDepartmentInvitation', 'assignDepartmentDuty', 'changeMemberPin', 'createDepartmentInvitation',
    'createDepartmentProfile', 'dutyReminders', 'ics', 'listDepartmentRoster', 'onRequestCreated',
    'onRequestResolved', 'onScheduleWrite', 'overrideDepartmentAssignment', 'publicSchedule', 'resetMemberPin',
    'resolveDutyAttention', 'revokeDepartmentInvitation', 'saveMemberAvailability', 'scheduledSheetSync',
    'searchDepartmentCandidates', 'songHistoryRecorder', 'syncSheetNow', 'unassignDepartmentDuty',
    'updateDepartmentProfile', 'updateMemberAvailability', 'updateRoleConfiguration', 'verifyMemberPin'
  ]);
});

test('keeps member PIN material out of the logs', () => {
  assert.match(source, /collection\('accounts'\)/);
  assert.match(source, /hashPin\(/);
  assert.doesNotMatch(source, /logger\.(info|warn|error)\([^\n]*\bpin\b/i);
  assert.doesNotMatch(source, /console\.(log|warn|error)\([^\n]*\bpin\b/i);
});

test('role changes need a leader manager and are recorded', () => {
  assert.match(source, /canManageLeaders\(actor, current\)/);
  assert.match(source, /collection\('audit'\)\.add\(/);
});

test('the sheet import needs an administrator when started by hand, and respects its switch', () => {
  assert.match(source, /exports\.syncSheetNow[\s\S]*permissions\.isAdmin\(actor/);
  assert.match(source, /exports\.scheduledSheetSync[\s\S]*sheetImportOn\(/);
});
