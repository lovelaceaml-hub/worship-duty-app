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

test('saving times a department already has is not refused', async () => {
  // For example a change made and undone before saving.
  const { db, save } = setup({ 'departments/Usher Sisters/members/uid-leah': profile({ availability: eveningsOff, revision: 2, updatedAt: 9 }) });
  const result = await save({ recurring: { evening: 'unavailable' }, exceptions: {} }, { expectedRevision: 2, expectedUpdatedAt: 9 });
  assert.deepEqual([result.ok, result.revision, result.departments[0].revision], [true, 2, 2]);
  assert.equal(db.store.get('departments/Usher Sisters/members/uid-leah').updatedAt, 9, 'nothing to write');
  // Someone else still cannot save them, nor read the profile that way.
  const ruth = { uid: 'uid-ruth', token: { uid: 'uid-ruth', memberUid: 'uid-ruth', memberName: 'S. Ruth', roles: ['member'], roleVersion: 1 } };
  const workflows = createWorkflowHandlers({ db, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });
  await assert.rejects(workflows.saveMemberAvailability({ auth: ruth, data: { memberUid: 'uid-leah', departments: [
    { departmentId: 'Usher Sisters', availability: eveningsOff }
  ] } }), error => error.code === 'permission-denied');
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

test('a member kept on a flagged duty is available for that service in every department, and saving again flags nothing', async () => {
  const dayOff = { recurring: {}, exceptions: { '2026-10-10': { '*': 'unavailable' } } };
  const flag = (departmentId, duty) => ({ [duty]: { memberName: 'S. Leah', memberUid: 'uid-leah', departmentId, reason: 'unavailable', since: 1 } });
  const { db } = setup({
    'departments/Usher Sisters/members/uid-leah': profile({ availability: dayOff, revision: 4 }),
    'departments/Lobby/members/uid-leah': lobby({ availability: dayOff }),
    [LATER]: { date: '2026-10-10', service: 'Morning', time: '10:00', assignments: { 'Usher Door': 'S. Leah', 'Lobby Desk #1': 'S. Leah' },
      needsReplacement: Object.assign(flag('Usher Sisters', 'Usher Door'), flag('Lobby', 'Lobby Desk #1')) },
    'schedule/2026-10-10_evening': { date: '2026-10-10', service: 'Evening', time: '19:30', assignments: { 'Usher Back': 'S. Leah' },
      needsReplacement: flag('Usher Sisters', 'Usher Back') }
  });
  const workflows = createWorkflowHandlers({ db, now: () => NOW, logger: { info() {}, warn() {}, error() {} } });
  const grace = { uid: 'uid-grace', token: { uid: 'uid-grace', roles: ['departmentLeader'], departments: ['Usher Sisters'], memberName: 'S. Grace' } };
  const kept = await workflows.resolveDutyAttention({ auth: grace, data: { departmentId: 'Usher Sisters', serviceId: '2026-10-10_morning', duty: 'Usher Door', decision: 'keep' } });
  assert.deepEqual([kept.kept, kept.markedAvailable], [true, true]);

  const sisters = db.store.get('departments/Usher Sisters/members/uid-leah');
  const lobbyProfile = db.store.get('departments/Lobby/members/uid-leah');
  assert.deepEqual(sisters.availability.exceptions['2026-10-10'], { '*': 'unavailable', morning: 'available' }, 'the evening that day stays off');
  assert.deepEqual(lobbyProfile.availability, sisters.availability, 'one record for all departments');
  assert.deepEqual([sisters.revision, sisters.updatedByUid, lobbyProfile.revision], [5, 'uid-grace', 1]);
  assert.deepEqual(Object.keys(db.store.get(LATER).needsReplacement), ['Lobby Desk #1'], 'the Lobby leader still answers their own flag');
  assert.deepEqual(Object.keys(db.store.get('schedule/2026-10-10_evening').needsReplacement), ['Usher Back']);

  // The member saves the record the app now shows: nothing is flagged again,
  // and the Lobby flag goes, as for any save saying they can come.
  const again = await workflows.saveMemberAvailability({ auth: leah, data: { memberUid: 'uid-leah', departments: [
    { departmentId: 'Usher Sisters', availability: sisters.availability }, { departmentId: 'Lobby', availability: lobbyProfile.availability }
  ] } });
  assert.deepEqual([again.replacements.marked, again.replacements.cleared.map(item => item.duty)], [[], ['Lobby Desk #1']]);
  assert.deepEqual(db.store.get(LATER).needsReplacement, {});

  // A second keep finds the record already saying so and changes nothing.
  db.store.set(LATER, Object.assign(db.store.get(LATER), { needsReplacement: flag('Usher Sisters', 'Usher Door') }));
  const twice = await workflows.resolveDutyAttention({ auth: grace, data: { departmentId: 'Usher Sisters', serviceId: '2026-10-10_morning', duty: 'Usher Door', decision: 'keep' } });
  assert.equal(twice.markedAvailable, false);
  assert.equal(db.store.get('departments/Usher Sisters/members/uid-leah').revision, 5, 'neither the save nor this keep wrote it');
});
