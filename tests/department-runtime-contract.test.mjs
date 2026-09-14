import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const index = read('index.html');
const bridge = read('design-gallery/host-bridge.js');
const build = read('design-gallery/build.mjs');

test('department runtime exposes only secure UID keyed profile and assignment callables', () => {
  for (const name of [
    'listDepartmentRoster',
    'updateDepartmentProfile',
    'updateMemberAvailability',
    'createDepartmentProfile',
    'assignDepartmentDuty',
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

test('all appearance adapters keep the shared Manage runtime and release stamping', () => {
  assert.match(bridge, /renderManage/);
  assert.match(bridge, /renderSiteLock/);
  assert.match(build, /service-worker stamp/);
  assert.match(build, /design-choice\.css/);
  assert.match(build, /data-design-open/);
  for (const mode of ['classic', 'prism', 'navy', 'aurora']) assert.match(build, new RegExp(mode));
});
