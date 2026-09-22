import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const readModule = name => { try { return fs.readFileSync(path.join(root, name), 'utf8'); } catch { return ''; } };
const manifest = JSON.parse(read('scripts/check-app-split.manifest.json'));
const app = manifest.moduleOrder.map(readModule).join('');
const index = read('index.html');
const bridge = read('design-gallery/host-bridge.js');
const build = read('design-gallery/build.mjs');
const auroraWorkspaces = read('prototype/workspaces.js');

test('department runtime exposes only secure UID keyed profile and assignment callables', () => {
  for (const name of [
    'listDepartmentRoster',
    'updateDepartmentProfile',
    'updateMemberAvailability',
    'createDepartmentProfile',
    'assignDepartmentDuty',
    'unassignDepartmentDuty',
    'overrideDepartmentAssignment'
  ]) assert.ok(app.includes(name), name + ' is wired into the runtime');
  assert.match(app, /departmentId:\s*department/);
  assert.match(app, /memberUid/);
  assert.match(app, /profileMutated !== false/);
});

test('assignment picker has no congregation-wide roster fallback', () => {
  const start = app.indexOf('function memberSelect(');
  const end = app.indexOf('/* Conflict notes', start);
  assert.ok(start >= 0 && end > start, 'memberSelect boundary is present');
  const picker = app.slice(start, end);
  assert.doesNotMatch(picker, /state\.members/);
  assert.match(picker, /departmentProfiles\(cat\.name\)/);
  assert.match(picker, /departmentProfileAssignable/);
  assert.match(picker, /Administrator override/);
});

test('runtime preserves date exception precedence and attribution rendering', () => {
  const start = app.indexOf('function departmentAvailability(');
  const end = app.indexOf('function departmentProfileAssignable', start);
  const availability = app.slice(start, end);
  assert.ok(availability.includes("exceptions[serviceDate]"));
  assert.ok(availability.indexOf("exception[key]") < availability.indexOf("recurring[key]"));
  assert.match(app, /profile\.fieldAttribution/);
  assert.match(app, /updatedByUid/);
  assert.match(app, /updatedAt/);
  assert.match(app, /configured service timezone/);
});

test('assignment callables are the only normal and override write boundary', () => {
  const applyStart = app.indexOf('function applyScheduleAssignment(');
  const applyEnd = app.indexOf('function assignDepartmentDutyForService(', applyStart);
  assert.ok(applyStart >= 0 && applyEnd > applyStart, 'assignment projection boundary is present');
  assert.doesNotMatch(app.slice(applyStart, applyEnd), /persistService/);
  const assignmentStart = app.indexOf('function assignDepartmentDutyForService(');
  const assignmentEnd = app.indexOf('function seedState(', assignmentStart);
  const assignment = app.slice(assignmentStart, assignmentEnd);
  assert.match(assignment, /authCall\(callable, payload\)/);
  assert.match(app, /function departmentAssignmentPayload\([\s\S]*memberUid:\s*profile\.memberUid/);
  assert.match(assignment, /overrideDepartmentAssignment/);
  assert.match(assignment, /profileMutated !== false/);
  assert.match(app, /function unassignDepartmentDutyForService\(/);
  assert.match(app, /authCall\('unassignDepartmentDuty', payload\)/);
  assert.doesNotMatch(app, /if \(!el\.value\)[\s\S]{0,180}persistService\(svc\)/);
  assert.match(app, /data-act="plan-assign"[\s\S]{0,180}data-uid=/);
  assert.match(assignment, /already serving in this service/);
});

test('roster load failures wait for an explicit retry', () => {
  const start = app.indexOf('function loadDepartmentRoster(');
  const end = app.indexOf('function loadOwnDepartmentProfiles(', start);
  const loader = app.slice(start, end);
  assert.match(loader, /!options\.force && departmentRuntime\.errors\[selected\]/);
  assert.match(app, /loadDepartmentRoster\(department, \{ force: true \}\)/);
});

test('history seed evidence is rendered as readable duty suggestions', () => {
  const start = app.indexOf('function renderDepartmentHistory(');
  const end = app.indexOf('function renderOwnAvailabilityProfile(', start);
  assert.ok(start >= 0 && end > start, 'history renderer boundary is present');
  const history = app.slice(start, end);
  assert.match(history, /Historical duty suggestions/);
  assert.match(history, /entry\.duty/);
  assert.match(history, /departmentHistoryDate/);
  assert.doesNotMatch(history, /JSON\.stringify/);
  assert.doesNotMatch(app, /JSON\.stringify\(profile\.historySeed/);
});

test('members receive an own-profile availability editor outside Manage', () => {
  assert.match(app, /function loadOwnDepartmentProfiles\(/);
  assert.match(app, /fb\.doc\(fb\.db, 'departments', category\.name, 'members', uid\)/);
  assert.match(app, /function renderOwnAvailability\(/);
  assert.match(app, /member-availability-recurring/);
  assert.match(app, /member-availability-exception-add/);
  assert.match(app, /saveOwnDepartmentAvailability/);
  assert.match(app, /isOwnDepartmentProfile\(department, memberUid\)/);
  assert.match(app, /updateMemberAvailability/);
  assert.match(app, /data-act=\"member-availability-save\"/);
});

test('all appearance adapters keep the shared Manage runtime and release stamping', () => {
  assert.match(bridge, /renderManage/);
  assert.match(bridge, /renderSiteLock/);
  assert.match(build, /service-worker stamp/);
  assert.match(build, /design-choice\.css/);
  assert.match(build, /data-design-open/);
  for (const mode of ['classic', 'prism', 'navy', 'aurora']) assert.match(build, new RegExp(mode));
});

test('request and conflict badges use the same actionable queue rules', () => {
  assert.match(app, /function requestIsActionable\(request\)/);
  assert.match(app, /service\.assignments \|\| \{\}\)\[request\.duty\]/);
  assert.match(app, /const actionableCounts = actionableCountsForViewer\(\)/);
  assert.match(app, /const pendingCount = actionableCounts\.requests/);
  assert.match(app, /const conflictCount = actionableCounts\.conflicts/);
  assert.match(app, /'Planning' \+ \(conflictCount > 0/);
  assert.match(app, /status-chip pending\">Unresolved/);
  assert.match(app, /Open service<\/button>/);
  assert.match(app, /const pending = all\.filter\(requestIsActionable\)/);
  assert.match(app, /service\.date < todayISO\(\)/);
  assert.match(auroraWorkspaces, /const counts = actionableCountsForViewer\(\)/);
  assert.match(auroraWorkspaces, /const conflicts = counts\.conflicts/);
  assert.match(auroraWorkspaces, /const pending = counts\.requests/);
});
