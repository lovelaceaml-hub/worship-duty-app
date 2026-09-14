import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const prototype = require('./department-management.js');

function withMember(state, memberId = 'lena-ortiz') {
  state = prototype.reduce(state, { type: 'OPEN_DEPARTMENT', id: 'welcome-team' });
  return prototype.reduce(state, { type: 'OPEN_MEMBER', id: memberId });
}

test('the leader sees only assigned departments and a split active/inactive roster', () => {
  const state = prototype.createInitialState();
  assert.equal(state.data.currentUser, 'Mara Ellison');
  assert.deepEqual(state.data.departments.map(department => department.name), ['Welcome Team', 'Media Crew']);

  const welcome = prototype.getDepartment(state, 'welcome-team');
  const groups = prototype.splitMembers(prototype.getDepartmentMembers(state, welcome));
  assert.equal(groups.active.length, 3);
  assert.equal(groups.inactive.length, 1);
  assert.deepEqual(welcome.leaderIds.map(id => state.data.members[id].name), ['Mara Ellison', 'Quinn Reyes']);
});

test('the department journey opens a member with history-seeded suggestions', () => {
  let state = prototype.createInitialState();
  state = prototype.reduce(state, { type: 'OPEN_DEPARTMENT', id: 'welcome-team' });
  assert.equal(state.view, 'department');
  assert.equal(state.selectedDepartmentId, 'welcome-team');

  state = withMember(state);
  const member = prototype.getMember(state);
  assert.equal(state.view, 'member');
  assert.equal(member.history.length, 3);
  assert.deepEqual(member.eligibleDuties, ['Greeter', 'Welcome table']);
  assert.equal(prototype.canSchedule(member), true);
});

test('eligibility, schedulability, recurring times, and date exceptions are editable in memory', () => {
  let state = withMember(prototype.createInitialState());
  state = prototype.reduce(state, { type: 'SET_ELIGIBLE', duty: 'Welcome table', value: false });
  state = prototype.reduce(state, { type: 'SET_SCHEDULABLE', value: false });
  state = prototype.reduce(state, { type: 'SET_RECURRING', id: 'sun-1130', value: false });
  state = prototype.reduce(state, { type: 'ADD_EXCEPTION', date: '2026-10-18', label: 'Unavailable', note: 'Sample conflict' });

  let member = prototype.getMember(state);
  assert.deepEqual(member.eligibleDuties, ['Greeter']);
  assert.equal(member.schedulable, false);
  assert.deepEqual(member.recurring, ['sun-0900']);
  assert.deepEqual(member.exceptions, [{ date: '2026-10-18', label: 'Unavailable', note: 'Sample conflict' }]);
  assert.equal(prototype.canSchedule(member), false);

  state = prototype.reduce(state, { type: 'REMOVE_EXCEPTION', date: '2026-10-18' });
  member = prototype.getMember(state);
  assert.deepEqual(member.exceptions, []);
});

test('administrative override is explicit and save failure does not claim success', () => {
  let state = withMember(prototype.createInitialState());
  state = prototype.reduce(state, { type: 'TOGGLE_OVERRIDE' });
  assert.equal(state.adminOverride, true);

  state = prototype.reduce(state, { type: 'SET_SAVE_MODE', mode: 'error' });
  state = prototype.reduce(state, { type: 'SAVE_MEMBER' });
  assert.equal(state.saved, false);
  assert.match(state.saveError, /sample save failed/i);
  assert.equal(state.notice.kind, 'error');

  state = prototype.reduce(state, { type: 'SET_SAVE_MODE', mode: 'success' });
  state = prototype.reduce(state, { type: 'SAVE_MEMBER' });
  assert.equal(state.saved, true);
  assert.equal(prototype.getMember(state).lastChangedBy, 'Mara Ellison');
  assert.equal(state.notice.kind, 'success');
});

test('roster status changes preserve history and sample member addition is scoped', () => {
  let state = prototype.reduce(prototype.createInitialState(), { type: 'OPEN_DEPARTMENT', id: 'welcome-team' });
  state = prototype.reduce(state, { type: 'SET_MEMBER_STATUS', id: 'sage-hart', status: 'active' });
  assert.equal(prototype.getMember(state, 'sage-hart').status, 'active');
  assert.equal(prototype.getMember(state, 'sage-hart').schedulable, false);
  assert.equal(prototype.getMember(state, 'sage-hart').history.length, 1);

  state = prototype.reduce(state, { type: 'ADD_SAMPLE_MEMBER' });
  const welcome = prototype.getDepartment(state, 'welcome-team');
  assert.equal(welcome.memberIds.at(-1), 'sample-11');
  assert.equal(state.data.members['sample-11'].name, 'Jamie Solis');
  assert.equal(state.notice.kind, 'success');
});

test('loading, empty, error, navigation, appearance, and reduced-motion states recover', () => {
  let state = prototype.createInitialState();
  state = prototype.reduce(state, { type: 'SET_LOADING', value: true });
  assert.equal(state.loading, true);
  state = prototype.reduce(state, { type: 'SET_EMPTY', value: true });
  assert.equal(state.loading, false);
  assert.equal(state.empty, true);
  state = prototype.reduce(state, { type: 'SET_PAGE_ERROR', message: 'Sample error' });
  assert.equal(state.empty, false);
  assert.equal(state.pageError, 'Sample error');
  state = prototype.reduce(state, { type: 'SET_PAGE_ERROR', clear: true });
  assert.equal(state.pageError, '');
  state = prototype.reduce(state, { type: 'RESET' });
  state = prototype.reduce(state, { type: 'SET_NAV', id: 'songs' });
  assert.equal(state.view, 'preview');
  state = prototype.reduce(state, { type: 'SET_APPEARANCE', id: 'aurora' });
  state = prototype.reduce(state, { type: 'TOGGLE_MOTION' });
  assert.equal(state.appearance, 'aurora');
  assert.equal(state.motionReduced, true);
});

test('prototype package is directly openable and contains the exact appearance contract', async () => {
  const html = await readFile(new URL('./department-management.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('./department-management.css', import.meta.url), 'utf8');
  assert.match(html, /department-management\.css/);
  assert.match(html, /department-management\.js/);
  for (const id of ['classic', 'prism', 'navy', 'aurora']) assert.match(html, new RegExp('data-appearance="' + id + '"'));
  for (const label of ['Schedule', 'My Duties', 'Presider', 'Manage', 'Appearance']) assert.match(html, new RegExp(label));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});
