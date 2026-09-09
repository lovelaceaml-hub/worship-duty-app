'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createHandlers } = require('../handlers');
const identity = require('../identity-lib');
const correctionRunner = require('../scripts/correct-member-identity.cjs');

const PROJECT_ID = 'demo-worship-refactor';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '';
const ENV_PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const FIXTURE_PREFIX = 'backend-contract-' + process.pid;
const CLOCK_NOW = Date.parse('2027-01-02T20:00:00.000Z');

function emulatorGate() {
  if (!HOST) return 'FIRESTORE_EMULATOR_HOST is not set';
  const candidate = HOST.includes('://') ? HOST : 'http://' + HOST;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return 'FIRESTORE_EMULATOR_HOST must be a valid loopback host and port';
  }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    return 'FIRESTORE_EMULATOR_HOST must point to a loopback HTTP endpoint';
  }
  if (!parsed.port) return 'FIRESTORE_EMULATOR_HOST must include an explicit port';
  if (ENV_PROJECT !== PROJECT_ID) {
    return 'GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT must equal demo-worship-refactor';
  }
  return '';
}

function fixedClock() {
  return {
    nowMs: () => CLOCK_NOW,
    nowDate: () => new Date(CLOCK_NOW),
    fromMs: value => new Date(value),
    fromValue: value => new Date(value),
    toISOString: value => value.toISOString()
  };
}

async function restore(ref, original) {
  if (original.exists) {
    await ref.set(original.data());
  } else {
    await ref.delete();
  }
}

const gate = emulatorGate();

test('backend handlers preserve Firestore merge and reminder contracts in the guarded emulator',
  { skip: gate || false }, async () => {
    const app = initializeApp({ projectId: PROJECT_ID }, FIXTURE_PREFIX);
    const db = getFirestore(app);
    const settingsRef = db.collection('app').doc('settings');
    const nameMapRef = db.collection('app').doc('nameMap');
    const membersRef = db.collection('app').doc('members');
    const sheetServiceId = '2027-01-03_backend-contract-first';
    const legacySheetServiceId = '2027-01-03_first-service';
    const zeroServiceId = FIXTURE_PREFIX + '-zero-service';
    const reminderServiceId = FIXTURE_PREFIX + '-reminder-service';
    const tokenId = FIXTURE_PREFIX + '-token';
    const markerId = reminderServiceId + '_Presider_Demo-Avery';
    const refs = [
      settingsRef,
      nameMapRef,
      membersRef,
      db.collection('schedule').doc(sheetServiceId),
      db.collection('schedule').doc(legacySheetServiceId),
      db.collection('schedule').doc(zeroServiceId),
      db.collection('schedule').doc(reminderServiceId),
      db.collection('tokens').doc(tokenId),
      db.collection('sent').doc(markerId)
    ];
    const originals = await Promise.all(refs.map(ref => ref.get()));
    let sheetText = [
      'Date,Service,Worship,Time,Duty,Member',
      '"Sat, Jan 03",Backend Contract First,Main,3:00 PM,Presider,Demo Variant',
      '"Sat, Jan 03",Backend Contract First,Main,3:00 PM,Usher Door,'
    ].join('\n');
    const sends = [];
    const logs = [];
    const handlers = createHandlers({
      db,
      sendEachForMulticast: async message => {
        sends.push(message);
        return { responses: message.tokens.map(() => ({ success: true })) };
      },
      fetch: async (url, options) => {
        assert.equal(url, 'https://example.invalid/backend-contract.csv');
        assert.deepEqual(options, { redirect: 'follow' });
        return { ok: true, async text() { return sheetText; } };
      },
      logger: {
        error(message, details) { logs.push({ level: 'error', message, details }); },
        info(message, details) { logs.push({ level: 'info', message, details }); },
        warn(message, details) { logs.push({ level: 'warn', message, details }); }
      },
      clock: fixedClock()
    });

    try {
      await Promise.all([
        settingsRef.set({ sheetUrl: 'https://example.invalid/backend-contract.csv' }),
        nameMapRef.set({ map: { 'Demo Variant': 'Demo Canonical' } }),
        membersRef.set({ list: ['Demo Existing'] }),
        db.collection('schedule').doc(sheetServiceId).set({
          date: '2027-01-03',
          time: '14:00',
          service: 'Backend Contract First',
          worship: 'Old Label',
          assignments: {
            Presider: 'Demo Old',
            'Usher Door': 'Demo Old Usher',
            'Media Booth #1': 'Demo Manual'
          }
        }),
        db.collection('schedule').doc(zeroServiceId).set({
          date: '2027-01-03',
          time: '16:00',
          service: 'Zero Parse Guard',
          worship: 'Fictional',
          assignments: { Presider: 'Demo Manual' }
        }),
        db.collection('schedule').doc(reminderServiceId).set({
          date: '2027-01-03',
          time: '10:00',
          service: 'Reminder Service',
          worship: 'Second',
          assignments: { Presider: 'Demo Avery' }
        }),
        db.collection('tokens').doc(tokenId).set({ name: 'Demo Avery' })
      ]);

      await handlers.scheduledSheetSync();
      assert.deepEqual((await db.collection('schedule').doc(sheetServiceId).get()).data(), {
        date: '2027-01-03',
        time: '15:00',
        service: 'Backend Contract First',
        worship: 'Main',
        assignments: {
          Presider: 'Demo Canonical',
          'Usher Door': '',
          'Media Booth #1': 'Demo Manual'
        }
      });
      assert.deepEqual((await membersRef.get()).data(), {
        list: ['Demo Canonical', 'Demo Existing']
      });

      sheetText = 'not a valid sheet';
      await handlers.scheduledSheetSync();
      assert.deepEqual((await db.collection('schedule').doc(zeroServiceId).get()).data(), {
        date: '2027-01-03',
        time: '16:00',
        service: 'Zero Parse Guard',
        worship: 'Fictional',
        assignments: { Presider: 'Demo Manual' }
      });

      await handlers.dutyReminders();
      assert.equal(sends.length, 1);
      assert.equal(sends[0].data.title, 'Duty reminder');
      assert.equal(sends[0].data.body,
        'Presider: Second Reminder Service, Sunday, January 3 at 10:00 AM');
      assert.deepEqual((await db.collection('sent').doc(markerId).get()).data(), { t: CLOCK_NOW });

      await handlers.dutyReminders();
      assert.equal(sends.length, 1);
      assert.equal(logs.some(entry => entry.level === 'error'), false);
    } finally {
      await Promise.all(refs.map((ref, index) => restore(ref, originals[index])));
      await deleteApp(app);
    }
  });

test('identity correction preserves allowlisted history, rejects a concurrent write, and rolls back',
  { skip: gate || false }, async () => {
    const app = initializeApp({ projectId: PROJECT_ID }, FIXTURE_PREFIX + '-identity');
    const db = getFirestore(app);
    const jobId = FIXTURE_PREFIX + '-identity-job';
    const oldName = 'Fictional Emulator Old';
    const newName = 'Fictional Emulator New';
    const otherName = 'Fictional Emulator Other';
    const refs = [
      db.collection('app').doc('nameMap'),
      db.collection('app').doc('members'),
      db.collection('app').doc('departments'),
      db.collection('app').doc('presiders'),
      db.collection('app').doc('settings'),
      db.collection('schedule').doc(FIXTURE_PREFIX + '-identity-service'),
      db.collection('setlists').doc(FIXTURE_PREFIX + '-identity-service'),
      db.collection('songStats').doc(FIXTURE_PREFIX + '-identity-song'),
      db.collection('requests').doc(FIXTURE_PREFIX + '-identity-request'),
      db.collection('tokens').doc(FIXTURE_PREFIX + '-identity-token'),
      db.collection('tokens').doc(FIXTURE_PREFIX + '-identity-new-target'),
      db.collection('tokens').doc(FIXTURE_PREFIX + '-identity-unrelated-after-apply')
    ];
    const originals = await Promise.all(refs.map(ref => ref.get()));
      const scheduleRef = refs[5];
      const tokenRef = refs[9];
      const newTargetRef = refs[10];
      const unrelatedTokenRef = refs[11];
    const backupRoot = db.collection('_adminIdentityCorrections').doc(jobId);

    try {
      await Promise.all([
        refs[0].set({ map: { [oldName]: 'Fictional Emulator Middle' } }),
        refs[1].set({ list: [oldName, newName, otherName], marker: 'fictional-members-marker' }),
        refs[2].set({ map: { Choir: [oldName, newName, otherName] }, note: 'fictional-department-note' }),
        refs[3].set({ names: [oldName, newName, otherName], ordering: ['a', 'b'] }),
        refs[4].set({ schedulerName: oldName, sheetUrl: 'https://example.invalid/fictional-sheet' }),
        scheduleRef.set({
          date: '2027-02-07',
          assignments: { Presider: oldName, 'Usher Door': otherName },
          conflictOk: {
            [oldName]: ['Usher Door'],
            [newName]: ['Media Booth #1', 'Usher Door']
          },
          notes: 'fictional-schedule-note',
          confirmed: true
        }),
        refs[6].set({ presider: oldName, confirmedBy: oldName, updatedBy: otherName,
          songs: ['Fictional Emulator Song'], note: 'fictional-setlist-note' }),
        refs[7].set({ history: [
          { by: oldName, date: '2027-02-07', songs: ['Fictional Emulator Song'] }
        ], count: 1 }),
        refs[8].set({ name: oldName, resolvedBy: oldName, status: 'approved', note: 'fictional-request-note' }),
        tokenRef.set({ name: oldName, token: 'fictional-emulator-token', createdAt: 'fictional-token-stamp' })
      ]);

      const firstPlan = await identity.planCorrection(db, { [oldName]: newName });
      const changedBeforeApply = (await scheduleRef.get()).data();
      await scheduleRef.set({ ...changedBeforeApply, notes: 'fictional-concurrent-note' });
      await assert.rejects(
        identity.applyCorrection(db, firstPlan, { jobId: jobId + '-conflict' }),
        error => error.code === 'OPTIMISTIC_SCOPE_CONFLICT'
      );
      assert.equal((await scheduleRef.get()).data().assignments.Presider, oldName);
      assert.equal((await db.collection('_adminIdentityCorrections').doc(jobId + '-conflict').get()).exists, false);

      const plan = await identity.planCorrection(db, { [oldName]: newName });
      const result = await identity.applyCorrection(db, plan, { jobId });
      assert.equal(result.jobId, jobId);
      assert.ok(result.targetCount >= 8);
      const correctedSchedule = (await scheduleRef.get()).data();
      assert.equal(correctedSchedule.assignments.Presider, newName);
      assert.deepEqual(correctedSchedule.conflictOk, {
        [newName]: ['Usher Door', 'Media Booth #1']
      });
      assert.equal(correctedSchedule.notes, 'fictional-concurrent-note');
      assert.equal(correctedSchedule.confirmed, true);
      assert.equal((await tokenRef.get()).data().name, newName);
      assert.deepEqual((await refs[6].get()).data(), {
        presider: newName,
        confirmedBy: newName,
        updatedBy: otherName,
        songs: ['Fictional Emulator Song'],
        note: 'fictional-setlist-note'
      });
      assert.deepEqual((await refs[7].get()).data(), {
        history: [{ by: newName, date: '2027-02-07', songs: ['Fictional Emulator Song'] }],
        count: 1
      });
      assert.deepEqual((await refs[8].get()).data(), {
        name: newName,
        resolvedBy: newName,
        status: 'approved',
        note: 'fictional-request-note'
      });

      const itemSnapshot = await backupRoot.collection('items').get();
      assert.equal(itemSnapshot.size, result.targetCount);
      itemSnapshot.forEach(item => {
        const data = item.data();
        assert.match(item.id, /^i_[a-f0-9]{40}$/);
        assert.equal(data.docId, undefined);
        assert.equal(data.collectionName, undefined);
        assert.equal(data.notes, undefined);
        assert.equal(data.token, undefined);
        assert.ok(data.precondition.beforeUpdateTime);
      });

      await newTargetRef.set({ name: newName, token: 'fictional-new-target-token' });
      await assert.rejects(
        correctionRunner.runRollback({ db, rollbackJobId: jobId, output: { log() {} } }),
        error => error.code === 'ROLLBACK_CONFLICT'
      );
      assert.equal((await backupRoot.get()).data().status, 'applied');
      await newTargetRef.delete();

      const postApplySchedule = (await scheduleRef.get()).data();
      await scheduleRef.set({ ...postApplySchedule, notes: 'fictional-post-apply-note' });
      await unrelatedTokenRef.set({
        name: otherName,
        token: 'fictional-unrelated-after-apply-token'
      });

      const rollbackLogs = [];
      const restored = await correctionRunner.runRollback({ db, rollbackJobId: jobId, output: { log(value) { rollbackLogs.push(JSON.parse(value)); } } });
      const rollback = restored.summary;
      assert.equal(rollbackLogs[0].mode, 'rollback');
      assert.equal(JSON.stringify(rollbackLogs).includes(oldName), false);
      assert.equal(JSON.stringify(rollbackLogs).includes(newName), false);
      assert.equal(rollback.jobId, jobId);
      assert.equal((await scheduleRef.get()).data().assignments.Presider, oldName);
      assert.equal((await scheduleRef.get()).data().notes, 'fictional-post-apply-note');
      assert.deepEqual((await scheduleRef.get()).data().conflictOk, {
        [oldName]: ['Usher Door'],
        [newName]: ['Media Booth #1', 'Usher Door']
      });
      assert.equal((await tokenRef.get()).data().name, oldName);
      assert.equal((await refs[6].get()).data().presider, oldName);
      assert.equal((await refs[7].get()).data().history[0].by, oldName);
      assert.equal((await refs[8].get()).data().resolvedBy, oldName);
      assert.deepEqual((await unrelatedTokenRef.get()).data(), {
        name: otherName,
        token: 'fictional-unrelated-after-apply-token'
      });
      assert.equal((await backupRoot.get()).data().status, 'rolledBack');
    } finally {
      const itemSnapshot = await backupRoot.collection('items').get();
      await Promise.all(itemSnapshot.docs.map(item => item.ref.delete()));
      await backupRoot.delete().catch(() => {});
      await Promise.all(refs.map((ref, index) => restore(ref, originals[index])));
      await deleteApp(app);
    }
  });
