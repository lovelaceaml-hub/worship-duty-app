'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

test('index registers exactly the frozen functions with the deployed trigger options', () => {
  const calls = [];
  const fakeDb = { collection() { throw new Error('registration test must not call Firestore'); } };
  const fakeMessaging = { sendEachForMulticast() { throw new Error('registration test must not send'); } };
  const fakeLogger = { error() {}, info() {}, warn() {} };
  let initialized = 0;

  const register = kind => (options, handler) => {
    calls.push({ kind, options, handler });
    return { kind, options, handler };
  };
  const stubs = {
    'firebase-functions/v2/firestore': {
      onDocumentWritten: register('onDocumentWritten'),
      onDocumentCreated: register('onDocumentCreated'),
      onDocumentUpdated: register('onDocumentUpdated')
    },
    'firebase-functions/v2/scheduler': { onSchedule: register('onSchedule') },
    'firebase-functions/v2/https': { onRequest: register('onRequest') },
    'firebase-functions/logger': fakeLogger,
    'firebase-admin/app': { initializeApp() { initialized++; } },
    'firebase-admin/firestore': { getFirestore() { return fakeDb; } },
    'firebase-admin/messaging': { getMessaging() { return fakeMessaging; } }
  };

  const originalLoad = Module._load;
  const indexPath = path.resolve(__dirname, '..', 'index.js');
  const existingFetch = globalThis.fetch;
  if (!existingFetch) globalThis.fetch = async () => ({ ok: true, text: async () => '' });
  Module._load = function(request, parent, isMain) {
    if (stubs[request]) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  let registered;
  try {
    delete require.cache[indexPath];
    registered = require(indexPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[indexPath];
    if (!existingFetch) delete globalThis.fetch;
  }

  assert.equal(initialized, 1);
  assert.deepEqual(Object.keys(registered), [
    'onScheduleWrite',
    'dutyReminders',
    'onRequestCreated',
    'onRequestResolved',
    'ics',
    'publicSchedule',
    'scheduledSheetSync'
  ]);
  assert.deepEqual(calls.map(call => ({ kind: call.kind, options: call.options })), [
    { kind: 'onDocumentWritten', options: { document: 'schedule/{id}', region: 'us-central1' } },
    { kind: 'onSchedule', options: { schedule: 'every 60 minutes', timeZone: 'America/Los_Angeles', region: 'us-central1' } },
    { kind: 'onDocumentCreated', options: { document: 'requests/{id}', region: 'us-central1' } },
    { kind: 'onDocumentUpdated', options: { document: 'requests/{id}', region: 'us-central1' } },
    { kind: 'onRequest', options: { region: 'us-central1' } },
    { kind: 'onRequest', options: { region: 'us-central1' } },
    { kind: 'onSchedule', options: { schedule: 'every 2 hours', timeZone: 'America/Los_Angeles', region: 'us-central1' } }
  ]);
  assert.equal(calls.every(call => typeof call.handler === 'function'), true);
});
