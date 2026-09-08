'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createHandlers } = require('../handlers');

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
