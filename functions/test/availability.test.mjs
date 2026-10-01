/* A member's own availability save (saveMemberAvailability): it works for a
   profile with no stored revision (the callable SDK sends the missing
   revision as null), still refuses a stale copy, and flags the member's
   upcoming duties they can no longer make. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createWorkflowHandlers } = require('../workflows.js');
const { memoryDb } = require('./memory-db.js');

const NOW = Date.parse('2026-10-01T17:00:00Z');
const leah = { uid: 'uid-leah', token: { uid: 'uid-leah', memberUid: 'uid-leah', memberName: 'S. Leah', roles: ['member'], roleVersion: 1 } };
const profile = (extra = {}) => ({
  uid: 'uid-leah', memberUid: 'uid-leah', departmentId: 'Usher Sisters', department: 'Usher Sisters', role: 'member',
  memberName: 'S. Leah', status: 'active', schedulable: true, eligibleDuties: ['Usher Door', 'Usher Front', 'Usher Back'],
  availability: { recurring: {}, exceptions: {} }, ...extra
});

function setup(docs = {}) {
  const db = memoryDb(Object.assign({ 'departments/Usher Sisters/members/uid-leah': profile() }, docs));
  const workflows = createWorkflowHandlers({ db, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });
  const save = (availability, extra = {}) => workflows.saveMemberAvailability({ auth: leah, data: {
    memberUid: 'uid-leah', departments: [Object.assign({ departmentId: 'Usher Sisters', availability }, extra)]
  } });
  return { db, save };
}

const eveningsOff = { recurring: { evening: 'unavailable' }, exceptions: {} };

test('a profile made without a revision saves when the app sends the missing revision as null', async () => {
  const { db, save } = setup();
  const result = await save(eveningsOff, { expectedRevision: null, expectedUpdatedAt: null });
  assert.equal(result.ok, true);
  const stored = db.store.get('departments/Usher Sisters/members/uid-leah');
  assert.deepEqual(stored.availability.recurring, { evening: 'unavailable' });
  assert.equal(stored.revision, 1);
});

test('a stale copy is still refused, with the reason the app can show', async () => {
  const { save } = setup({ 'departments/Usher Sisters/members/uid-leah': profile({ revision: 3, updatedAt: 50 }) });
  await assert.rejects(save(eveningsOff, { expectedRevision: 2, expectedUpdatedAt: 50 }),
    error => error.code === 'aborted' && error.details.reason === 'changed');
  await assert.rejects(save(eveningsOff, { expectedRevision: null, expectedUpdatedAt: 40 }),
    error => error.code === 'aborted' && error.details.reason === 'changed', 'the time it was last saved is checked on its own');
  await assert.rejects(save(eveningsOff, { expectedRevision: 'x' }), error => error.code === 'invalid-argument');
});

const LATER = 'schedule/2026-10-10_morning';
const lobby = (extra = {}) => Object.assign(profile({ departmentId: 'Lobby', department: 'Lobby', eligibleDuties: ['Lobby Desk #1', 'Lobby Desk #2'] }), extra);
const morningsOff = { recurring: { morning: 'unavailable' }, exceptions: {} };

test('every upcoming duty the member can no longer make is flagged, found in the schedule itself', async () => {
  const { db, save } = setup({
    // Imported from the Sheet: no departmentAssignments record, an older spelling.
    [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah', 'Usher Front': 'S. Ruth' } },
    'schedule/2026-10-17_morning': { date: '2026-10-17', service: 'Morning', time: '10:00', assignments: { 'Usher Back': 'S.  Leah' } },
    'schedule/2026-10-13_evening': { date: '2026-10-13', service: 'Evening', time: '19:30', assignments: { 'Usher Door': 'S. Leah' } },
    'schedule/2026-09-26_morning': { date: '2026-09-26', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah' } }
  });
  const result = await save(morningsOff);
  assert.deepEqual(result.replacements.marked.map(item => [item.serviceId, item.duty]).sort(),
    [['2026-10-10_morning', 'Usher Door'], ['2026-10-17_morning', 'Usher Back']]);
  assert.deepEqual(result.replacements.marked.find(item => item.serviceId === '2026-10-10_morning'),
    { serviceId: '2026-10-10_morning', duty: 'Usher Door', date: '2026-10-10', service: 'Morning' });
  const flag = db.store.get(LATER).needsReplacement['Usher Door'];
  assert.deepEqual([flag.memberName, flag.memberUid, flag.reason], ['S. Leah', 'uid-leah', 'unavailable']);
  assert.equal(db.store.get('schedule/2026-09-26_morning').needsReplacement, undefined, 'a past service is left alone');
  assert.equal(db.store.get('schedule/2026-10-13_evening').needsReplacement, undefined, 'evenings are still fine');
});

test('a flag left for the previous holder does not hide the new one, and only the member\'s own flag is lifted', async () => {
  const { db, save } = setup({
    [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah', 'Usher Front': 'S. Leah' },
      needsReplacement: { 'Usher Door': { memberName: 'S. Naomi', reason: 'unavailable' } } }
  });
  await save(morningsOff);
  const flags = db.store.get(LATER).needsReplacement;
  assert.deepEqual([flags['Usher Door'].memberName, flags['Usher Front'].memberName], ['S. Leah', 'S. Leah']);
  const again = await save({ recurring: {}, exceptions: {} });
  assert.deepEqual(again.replacements.cleared.map(item => item.duty).sort(), ['Usher Door', 'Usher Front']);
  assert.deepEqual(db.store.get(LATER).needsReplacement, {});
});

test('duties in two departments on one service are flagged in one write', async () => {
  const { db, workflows } = (() => {
    const made = setup({
      'departments/Lobby/members/uid-leah': lobby(),
      [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah', 'Lobby Desk #1': 'S. Leah' } }
    });
    return { db: made.db, workflows: createWorkflowHandlers({ db: made.db, now: () => NOW, logger: { info() {}, warn() {}, error() {} } }) };
  })();
  const result = await workflows.saveMemberAvailability({ auth: leah, data: { memberUid: 'uid-leah', departments: [
    { departmentId: 'Usher Sisters', availability: morningsOff }, { departmentId: 'Lobby', availability: morningsOff }
  ] } });
  assert.equal(result.replacements.marked.length, 2);
  assert.deepEqual(Object.keys(db.store.get(LATER).needsReplacement).sort(), ['Lobby Desk #1', 'Usher Door']);
});

test('a leader marking a member unavailable flags their duties too', async () => {
  const { createDepartmentHandlers } = require('../department-handlers.js');
  const { db } = setup({ [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah' } } });
  const handlers = createDepartmentHandlers({ db, now: () => NOW });
  const grace = { uid: 'uid-grace', token: { uid: 'uid-grace', roles: ['departmentLeader'], departments: ['Usher Sisters'], memberName: 'S. Grace' } };
  const result = await handlers.updateDepartmentProfile({ auth: grace, data: { departmentId: 'Usher Sisters', memberUid: 'uid-leah', patch: { availability: morningsOff } } });
  assert.deepEqual(result.replacements.marked.map(item => item.duty), ['Usher Door']);
  assert.equal(db.store.get(LATER).needsReplacement['Usher Door'].markedByUid, 'uid-grace');
  const status = await handlers.updateDepartmentProfile({ auth: grace, data: { departmentId: 'Usher Sisters', memberUid: 'uid-leah', patch: { status: 'inactive' } } });
  assert.deepEqual(status.replacements, { marked: [], cleared: [] }, 'other changes flag nothing');
});
