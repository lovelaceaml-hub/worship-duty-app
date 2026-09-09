'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const assignments = require('../../src/services/assignments.js');
const allowed = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8193' && process.env.GCLOUD_PROJECT === 'demo-worship-refactor';

test('mixed assignment proposals commit together and reject conflicts in the demo emulator', { skip: allowed ? false : 'Requires the explicit loopback demo emulator' }, async () => {
  const app = initializeApp({ projectId: 'demo-worship-refactor' }, 'assignment-proposals-' + process.pid);
  const db = getFirestore(app);
  const id = 'assignment-proposals-' + process.pid;
  const schedule = db.collection('schedule').doc(id);
  const plan = db.collection('setlists').doc(id);
  const firebase = { db, doc: (database, collection, key) => database.collection(collection).doc(key), runTransaction: (database, callback) => database.runTransaction(callback), deleteField: () => FieldValue.delete() };
  let authReady = false;
  const persistence = assignments.create({ getFirebase: () => firebase, getAuthReady: async () => { authReady = true; }, persistService: () => { throw new Error('Must use transaction'); }, serviceId: () => id, getMe: () => 'Fictional Manager', now: () => 30 });
  try {
    await schedule.set({ assignments: { Presider: '', Sermon: '', 'Media Booth #1': 'Fictional Concurrent' }, notes: 'Preserved' });
    await plan.set({ presider: '', songs: ['fictional-song'], confirmedAt: 20, updatedAt: 10 });
    const service = { assignments: { Presider: 'Fictional Owner', Sermon: 'Fictional Speaker', 'Media Booth #1': 'Stale Local' } };
    await persistence.saveService(service, { assignmentChanges: { Presider: { previous: '', desired: 'Fictional Owner' }, Sermon: { previous: '', desired: 'Fictional Speaker' } } });
    assert.equal(authReady, true);
    const saved = (await schedule.get()).data();
    assert.equal(saved.assignments.Presider, 'Fictional Owner');
    assert.equal(saved.assignments.Sermon, 'Fictional Speaker');
    assert.equal(saved.assignments['Media Booth #1'], 'Fictional Concurrent');
    assert.equal(saved.notes, 'Preserved');
    const savedPlan = (await plan.get()).data();
    assert.equal(savedPlan.presider, 'Fictional Owner');
    assert.deepEqual(savedPlan.songs, ['fictional-song']);
    assert.ok(savedPlan.updatedAt > savedPlan.confirmedAt);
    await schedule.update({ 'assignments.Sermon': 'Fictional Other Editor' });
    const beforeConflict = (await schedule.get()).data();
    await assert.rejects(persistence.saveService({ assignments: { Presider: 'Fictional Replacement', Sermon: 'Fictional Proposed' } }, { assignmentChanges: { Presider: { previous: 'Fictional Owner', desired: 'Fictional Replacement' }, Sermon: { previous: 'Fictional Speaker', desired: 'Fictional Proposed' } } }), { code: 'ASSIGNMENT_STALE' });
    assert.deepEqual((await schedule.get()).data(), beforeConflict);
    assert.deepEqual((await plan.get()).data(), savedPlan);
  } finally {
    await Promise.all([schedule.delete(), plan.delete()]);
    await deleteApp(app);
  }
});
