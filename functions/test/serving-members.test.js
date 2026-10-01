'use strict';

/* The nightly job that puts everyone who has served in a department into it:
   active if they served there in the last 35 days or have a duty coming up,
   inactive otherwise, and never touching a profile that already exists. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { addServingMembers, statusFor } = require('../serving-members.js');

function fakeDb(docs) {
  const store = new Map(Object.entries(docs));
  const docRef = path => ({
    id: path.split('/').pop(),
    collection: name => collectionRef(path + '/' + name),
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async value => { store.set(path, value); },
    update: async value => { store.set(path, Object.assign({}, store.get(path), value)); }
  });
  const collectionRef = path => ({
    doc: id => docRef(path + '/' + id),
    get: async () => ({
      docs: Array.from(store.keys()).filter(key => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'))
        .map(key => ({ id: key.slice(path.length + 1), ref: docRef(key), data: () => store.get(key) }))
    })
  });
  return { store, collection: name => collectionRef(name) };
}

const today = '2026-09-30';

test('a member counts as active when they served in the last 35 days or have a duty coming up', () => {
  assert.equal(statusFor({ last: '2026-08-26' }, today), 'active');
  assert.equal(statusFor({ last: '2026-08-25' }, today), 'inactive');
  assert.equal(statusFor({ last: '2026-10-03' }, today), 'active');
});

test('everyone who served in a department is added to it, once, with the duties they served in', async () => {
  const db = fakeDb({
    'app/members': { list: ['S. Leah', 'S. Naomi', 'B. Silas', 'S. Grace'] },
    'accounts/S. Grace': { memberName: 'S. Grace', authUid: 'grace-auth-uid' },
    'schedule/2026-09-26_morning': { date: '2026-09-26', service: 'Morning', assignments: { 'Usher Door': 'S. Leah', 'Usher Front': 'S. Grace', 'Translation #1': 'B. Silas' } },
    'schedule/2026-07-04_morning': { date: '2026-07-04', service: 'Morning', assignments: { 'Usher Back': 'S. Naomi', 'Usher Door': 'S. Leah', 'Usher #1': 'B. Guest' } },
    // S. Leah is already in Usher Sisters, archived by her leader.
    'departments/Usher Sisters/members/member:S. Leah': { memberUid: 'member:S. Leah', memberName: 'S. Leah', departmentId: 'Usher Sisters', status: 'inactive' }
  });
  const result = await addServingMembers(db, { today, now: 1000 });
  assert.deepEqual(result.added.map(item => [item.department, item.name, item.status]).sort(), [
    ['Translation', 'B. Silas', 'active'],
    ['Usher Sisters', 'S. Grace', 'active'],
    ['Usher Sisters', 'S. Naomi', 'inactive']
  ]);
  assert.deepEqual(result.unmatched, ['B. Guest']);
  const grace = db.store.get('departments/Usher Sisters/members/grace-auth-uid');
  assert.equal(grace.memberName, 'S. Grace');
  assert.deepEqual(grace.eligibleDuties, ['Usher Door', 'Usher Front', 'Usher Back'], 'any Usher Sisters duty');
  assert.equal(grace.schedulable, true);
  assert.equal(db.store.get('departments/Usher Sisters/members/member:S. Leah').status, 'inactive');

  const again = await addServingMembers(db, { today, now: 2000 });
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.widened, []);
});

test('a profile this job added earlier with only its served duties gets every duty, unless a leader changed them', async () => {
  const fromSchedule = { source: 'schedule' };
  const db = fakeDb({
    'app/members': { list: ['S. Naomi', 'S. Esther'] },
    'departments/Usher Sisters/members/member:S. Naomi': { memberUid: 'member:S. Naomi', memberName: 'S. Naomi', eligibleDuties: ['Usher Back'],
      provenance: fromSchedule, fieldAttribution: { eligibleDuties: fromSchedule } },
    'departments/Usher Sisters/members/member:S. Esther': { memberUid: 'member:S. Esther', memberName: 'S. Esther', eligibleDuties: ['Usher Back'],
      provenance: fromSchedule, fieldAttribution: { eligibleDuties: { source: 'manual' } } }
  });
  const result = await addServingMembers(db, { today, now: 1 });
  assert.deepEqual(result.widened.map(item => item.name), ['S. Naomi']);
  assert.deepEqual(db.store.get('departments/Usher Sisters/members/member:S. Naomi').eligibleDuties, ['Usher Door', 'Usher Front', 'Usher Back']);
  assert.deepEqual(db.store.get('departments/Usher Sisters/members/member:S. Esther').eligibleDuties, ['Usher Back']);
});
