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

function contrastRatio(foreground, background) {
  const luminance = hex => {
    const values = [0, 2, 4].map(index => parseInt(hex.slice(index + 1, index + 3), 16) / 255);
    const linear = values.map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
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

test('administrative override resets when navigating to another member, department, or tab', () => {
  let state = withMember(prototype.createInitialState());
  state = prototype.reduce(state, { type: 'TOGGLE_OVERRIDE' });
  assert.equal(state.adminOverride, true);

  state = prototype.reduce(state, { type: 'OPEN_MEMBER', id: 'caleb-wren' });
  assert.equal(state.adminOverride, false);
  state = prototype.reduce(state, { type: 'TOGGLE_OVERRIDE' });
  state = prototype.reduce(state, { type: 'OPEN_DEPARTMENT', id: 'media-crew' });
  assert.equal(state.adminOverride, false);
  state = prototype.reduce(state, { type: 'TOGGLE_OVERRIDE' });
  state = prototype.reduce(state, { type: 'SET_NAV', id: 'schedule' });
  assert.equal(state.adminOverride, false);
});

test('roster status changes preserve history and sample member addition is scoped', () => {
  let state = prototype.reduce(prototype.createInitialState(), { type: 'OPEN_DEPARTMENT', id: 'welcome-team' });
  state = prototype.reduce(state, { type: 'SET_MEMBER_STATUS', id: 'sage-hart', status: 'active' });
  let sage = prototype.getMember(state, 'sage-hart');
  assert.equal(sage.status, 'active');
  assert.equal(sage.schedulable, false);
  assert.equal(sage.history.length, 1);
  assert.equal(sage.lastChangedBy, 'Mara Ellison');
  assert.equal(sage.lastChangedAt, '2026-09-14T09:00:00');

  state = prototype.reduce(state, { type: 'SET_MEMBER_STATUS', id: 'sage-hart', status: 'inactive' });
  sage = prototype.getMember(state, 'sage-hart');
  assert.equal(sage.status, 'inactive');
  assert.equal(sage.schedulable, false);
  assert.equal(sage.lastChangedBy, 'Mara Ellison');
  assert.equal(sage.lastChangedAt, '2026-09-14T09:00:00');

  state = prototype.reduce(state, { type: 'OPEN_MEMBER', id: 'sage-hart' });
  assert.match(prototype.renderMember(state), /Last changed by Mara Ellison/);

  state = prototype.reduce(state, { type: 'ADD_SAMPLE_MEMBER' });
  const welcome = prototype.getDepartment(state, 'welcome-team');
  assert.equal(welcome.memberIds.at(-1), 'sample-11');
  assert.equal(state.data.members['sample-11'].name, 'Jamie Solis');
  assert.equal(state.notice.kind, 'success');
});

test('inactive members stay unschedulable even when the editor requests true', () => {
  let state = withMember(prototype.createInitialState(), 'sage-hart');
  state = prototype.reduce(state, { type: 'SET_SCHEDULABLE', value: true });
  assert.equal(prototype.getMember(state).schedulable, false);
  assert.equal(prototype.canSchedule(prototype.getMember(state)), false);
  assert.match(prototype.renderMember(state), /role="switch" aria-checked="false" data-field="schedulable" disabled/);

  state = prototype.reduce(state, { type: 'SET_MEMBER_STATUS', id: 'sage-hart', status: 'active' });
  state = prototype.reduce(state, { type: 'SET_SCHEDULABLE', value: true });
  assert.equal(prototype.getMember(state).schedulable, true);
  state = prototype.reduce(state, { type: 'SET_MEMBER_STATUS', id: 'sage-hart', status: 'inactive' });
  assert.equal(prototype.getMember(state).schedulable, false);
});

test('both appearance close controls use keyboard-operable buttons and dialog click delegation', async () => {
  const html = await readFile(new URL('./department-management.html', import.meta.url), 'utf8');
  const controls = html.match(/<button[^>]*data-action="close-appearance"[^>]*>/g) || [];
  assert.equal(controls.length, 2);
  assert.ok(controls.every(control => /type="button"/.test(control)));

  const handlers = {};
  const dialog = { addEventListener(type, handler) { handlers[type] = handler; } };
  let closeCount = 0;
  prototype.bindAppearanceDialog(dialog, () => { closeCount += 1; });
  const button = { closest() { return this; } };
  for (const control of controls) handlers.click({ target: button, currentTarget: dialog });
  assert.equal(closeCount, 2);
});

test('override switch exposes aria-checked and follows its current state', () => {
  let state = withMember(prototype.createInitialState());
  let markup = prototype.renderMember(state);
  let control = markup.match(/<button[^>]*role="switch"[^>]*data-action="toggle-override"[^>]*>/)?.[0] || '';
  assert.match(control, /aria-checked="false"/);
  assert.doesNotMatch(control, /aria-pressed/);

  state = prototype.reduce(state, { type: 'TOGGLE_OVERRIDE' });
  markup = prototype.renderMember(state);
  control = markup.match(/<button[^>]*role="switch"[^>]*data-action="toggle-override"[^>]*>/)?.[0] || '';
  assert.match(control, /aria-checked="true"/);
  assert.match(markup, />Disable override<\/button>/);
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

  const aurora = css.match(/\.prototype-root\[data-appearance="aurora"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  const actionColor = aurora.match(/--accent-action:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(actionColor, 'Aurora must define a dedicated primary action color');
  assert.match(css.match(/\.button-primary\s*\{([^}]+)\}/)?.[1] || '', /background:\s*var\(--accent-action\)/);
  assert.ok(contrastRatio('#ffffff', actionColor) >= 4.5, 'Aurora primary CTA must meet normal-text AA contrast');
});
