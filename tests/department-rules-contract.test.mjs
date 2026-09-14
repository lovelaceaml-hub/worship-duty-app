import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rules = read('firestore.rules');
const functionsIndex = read(path.join('functions', 'index.js'));
const authSource = read(path.join('functions', 'department-auth.js'));
const handlersSource = read(path.join('functions', 'department-handlers.js'));

function matchBody(marker) {
  const markerIndex = rules.indexOf(`match ${marker}`);
  assert.notEqual(markerIndex, -1, `missing rules match ${marker}`);
  const openingBrace = rules.indexOf('{', markerIndex + marker.length + 6);
  let depth = 0;
  for (let index = openingBrace; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') depth -= 1;
    if (depth === 0) return rules.slice(openingBrace + 1, index);
  }
  throw new Error(`unclosed rules match ${marker}`);
}

test('department profiles are UID keyed and department scoped', () => {
  const profile = matchBody('/departments/{departmentId}/members/{memberUid}');
  assert.match(rules, /function profileMemberUid\(data\)/);
  assert.match(rules, /function profileIdentityAtPath\(data, departmentId, memberUid\)/);
  assert.match(rules, /function departmentProfileIdentityStable\(before, after\)/);
  assert.match(profile, /canReadDepartmentProfile\(departmentId, memberUid, resource\.data\)/);
  assert.match(profile, /allow create, update: if false;/);
  assert.match(profile, /allow delete: if isAdmin\(\);/);
  assert.match(rules, /function departmentProfileMemberPatch\(\)/);
  assert.match(rules, /function departmentProfileLeaderPatch\(\)/);
  assert.match(rules, /function departmentProfileValuesSafe\(data\)/);
  assert.match(rules, /function profileMetadataShapeSafe\(data\)/);
  assert.match(rules, /function profileManualMetadataOwned\(data\)/);
  assert.match(rules, /request\.resource\.data\.role == 'member' \|\| isAdmin\(\)/);
  assert.match(rules, /'availability'/);
  assert.match(rules, /'eligibleDuties'/);
  assert.match(rules, /'schedulable'/);
});

test('profile allowlists block role and department escalation', () => {
  const update = rules.slice(rules.indexOf('function canUpdateDepartmentProfile'));
  assert.match(update, /departmentProfileIdentityStable\(resource\.data, request\.resource\.data\)/);
  assert.match(update, /departmentProfileMemberPatch\(\)/);
  assert.match(update, /departmentProfileLeaderPatch\(\)/);
  assert.match(update, /request\.auth\.uid == memberUid/);
  assert.match(rules, /data\.role in \['member', 'leader'\]/);
  assert.match(authSource, /PROFILE_IDENTITY_FIELDS/);
  assert.match(authSource, /immutable-identity/);
  assert.match(authSource, /profile-write-not-authorized/);
});

test('normal assignments require profile eligibility and explicit admin override', () => {
  const assignments = matchBody('/departmentAssignments/{assignmentId}');
  assert.match(rules, /function departmentAssignmentNormalAllowed\(data\)/);
  assert.match(rules, /function departmentAssignmentOverrideAllowed\(data\)/);
  assert.match(rules, /function assignmentProfileHasAvailableSlot\(data\)/);
  assert.match(rules, /function assignmentProfileDateExceptionOverridesTime\(data\)/);
  assert.match(assignments, /departmentAssignmentNormalAllowed\(request\.resource\.data\)/);
  assert.doesNotMatch(assignments, /allow create:[^;]*departmentAssignmentOverrideAllowed/s);
  assert.doesNotMatch(assignments, /allow update:[^;]*departmentAssignmentOverrideAllowed/s);
  assert.match(rules, /data\.authorization == 'administrator-override'/);
  assert.match(rules, /data\.overrideReason is string/);
  assert.match(rules, /data\.overriddenByUid == request\.auth\.uid/);
  assert.match(rules, /function assignmentDutyInDepartment\(data\)/);
  assert.match(rules, /departmentAssignmentOverrideAllowed\(data\)/);
  assert.match(authSource, /target-inactive/);
  assert.match(authSource, /target-ineligible/);
  assert.match(authSource, /target-not-schedulable/);
  assert.match(authSource, /target-unavailable/);
});

test('callable names are wired without replacing existing routes', () => {
  assert.match(functionsIndex, /require\('\.\/department-handlers'\)/);
  assert.match(functionsIndex, /exports\.updateDepartmentProfile\s*=/);
  assert.match(functionsIndex, /exports\.updateMemberAvailability\s*=/);
  assert.match(functionsIndex, /exports\.createDepartmentProfile\s*=/);
  assert.match(functionsIndex, /exports\.assignDepartmentDuty\s*=/);
  assert.match(functionsIndex, /exports\.overrideDepartmentAssignment\s*=/);
  assert.match(handlersSource, /profileMutated: false/);
  assert.match(handlersSource, /administrator-assignment-override/);
  assert.match(handlersSource, /listDepartmentRoster/);
  assert.match(functionsIndex, /exports\.listDepartmentRoster\s*=/);
  assert.match(functionsIndex, /async function readCurrentAccount/);
  assert.match(functionsIndex, /token\.roleVersion/);
  assert.match(functionsIndex, /account\.roleVersion/);
  assert.match(functionsIndex, /const actor = await callableActor\(request\)/);
  assert.match(functionsIndex, /exports\.verifyMemberPin\s*=/);
  assert.match(functionsIndex, /exports\.onScheduleWrite\s*=|exports\.onScheduleWrite/);
  assert.match(rules, /match \/schedule\/\{scheduleId\}/);
  assert.match(rules, /match \/setlists\/\{setlistId\}/);
  assert.match(rules, /match \/requests\/\{requestId\}/);
  assert.match(rules, /match \/notifications\/\{notificationId\}/);
});

test('rules use canonical exceptions and validate attribution metadata', () => {
  assert.match(rules, /function availabilityShapeSafe\(data\)/);
  assert.match(rules, /data\.keys\(\)\.hasOnly\(\['recurring', 'exceptions'\]\)/);
  assert.doesNotMatch(rules, /data\.keys\(\)\.hasOnly\(\['recurring', 'exceptions', 'dateExceptions'\]\)/);
  assert.match(rules, /function profileAttributionShapeSafe\(value\)/);
  assert.match(rules, /function profileFieldDecisionShapeSafe\(value\)/);
  assert.match(rules, /function profileFieldAttributionShapeSafe\(value\)/);
  assert.match(rules, /metadataActorLabelOwned\(value\)/);
  assert.match(rules, /request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\[/);
  assert.match(handlersSource, /source: 'manual'/);
  assert.match(handlersSource, /authority/);
  assert.match(handlersSource, /authz\.normalizeAvailability/);
  const profiles = matchBody('/departments/{departmentId}/members/{memberUid}');
  assert.match(profiles, /allow create, update: if false;/);
  const audit = matchBody('/audit/{auditId}');
  assert.match(audit, /allow create: if false;/);
  assert.match(handlersSource, /db\.runTransaction/);
});

test('owned authorization sources contain no forbidden dash characters', () => {
  for (const source of [rules, authSource, handlersSource, fs.readFileSync(new URL(import.meta.url), 'utf8')]) {
    assert.doesNotMatch(source, /[\u2013\u2014]/u);
  }
});
