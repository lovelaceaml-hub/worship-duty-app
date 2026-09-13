import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rulesPath = '/Users/anthony/Projects/worship-duty-app-worktrees/auth-l3/firestore.rules';
const source = readFileSync(rulesPath, 'utf8');

function matchBlock(path) {
  const marker = `match /${path}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing rules match ${marker}`);
  const pathEnd = source.indexOf('}', start);
  const open = source.indexOf('{', pathEnd + 1);
  assert.notEqual(open, -1, `missing opening brace for ${marker}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`unclosed rules match ${marker}`);
}

function has(text, fragment, message = fragment) {
  assert.ok(text.includes(fragment), `missing ${message}`);
}

test('rules are authenticated and fail closed by default', () => {
  has(source, "rules_version = '2';");
  has(source, 'function signedIn()');
  has(source, 'request.auth != null');
  has(source, 'function isCoordinator()');
  has(source, 'function hasAccount()');
  has(source, 'match /{document=**} { allow read, write: if false; }');
});

test('schedule keeps public reads and separates structural from assignment writes', () => {
  const schedule = matchBlock('schedule/{scheduleId}');
  has(schedule, 'allow read: if true;');
  has(schedule, 'allow create: if canCreateStructuralSchedule();');
  has(schedule, 'allow update: if canUpdateSchedule();');
  has(schedule, 'allow delete: if isCoordinator();');
  has(source, 'function scheduleStructuralChange()');
  has(source, 'function scheduleAssignmentChange()');
  has(source, 'function canEditAssignments(before, after)');
  has(source, 'affectedKeys().hasOnly');
  has(source, 'match /departmentSchedules/{scheduleId}');
  has(source, 'match /departmentAssignments/{assignmentId}');
});

test('app settings and account secrets cannot be read directly', () => {
  assert.equal(matchBlock('app/settings').includes('allow read: if false;'), true);
  assert.equal(matchBlock('app/songSettings').includes('allow read: if false;'), true);
  has(matchBlock('app/{appDocument}'), "appDocument != 'settings'");
  has(matchBlock('app/{appDocument}'), "appDocument != 'songSettings'");
  has(source, 'function secretFieldsAbsent(data)');
  for (const field of ['pinHash', 'sitePinHash', 'editorPinHash', 'passwordHash', 'hash']) {
    has(source, `'${field}'`, `secret field ${field}`);
  }
  has(matchBlock('accounts/{accountUid}'), 'secretFieldsAbsent(resource.data)');
});

test('membership, requests, conflicts, alerts, tokens, and audit have boundaries', () => {
  for (const path of [
    'app/config',
    'app/members',
    'app/membership/{memberId}',
    'app/departments',
    'requests/{requestId}',
    'conflicts/{conflictId}',
    'alerts/{alertId}',
    'tokens/{tokenId}',
    'audit/{auditId}',
    'memberships/{membershipId}'
  ]) {
    matchBlock(path);
  }
  has(source, 'function requestIsOwned(data)');
  has(source, 'function tokenBelongsToCaller(data)');
  has(source, 'allow update, delete: if false;', 'append-only audit boundary');
  assert.equal(matchBlock('tokens/{tokenId}').includes('allow read, write: if true;'), false);
});

test('song ingest compatibility stays open while sent markers stay private', () => {
  assert.equal(matchBlock('songStats/{songId}').includes('allow read, write: if true;'), true);
  assert.equal(matchBlock('setlists/{setlistId}').includes('allow read, write: if true;'), true);
  assert.equal(matchBlock('sent/{markerId}').includes('allow read, write: if false;'), true);
});

test('new rule and contract files contain no forbidden dash characters', () => {
  const testPath = '/Users/anthony/Projects/worship-duty-app-worktrees/auth-l3/tests/firestore-rules-contract.test.mjs';
  const contract = readFileSync(testPath, 'utf8');
  assert.equal(/[\u2013\u2014]/u.test(source), false);
  assert.equal(/[\u2013\u2014]/u.test(contract), false);
});
