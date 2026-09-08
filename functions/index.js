'use strict';

const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { createHandlers, createSystemClock } = require('./handlers');

const REGION = 'us-central1';
const TZ = 'America/Los_Angeles';

initializeApp();

const handlers = createHandlers({
  db: getFirestore(),
  messaging: getMessaging(),
  fetch: globalThis.fetch,
  logger,
  clock: createSystemClock()
});

exports.onScheduleWrite = onDocumentWritten(
  { document: 'schedule/{id}', region: REGION },
  handlers.onScheduleWrite
);

exports.dutyReminders = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TZ, region: REGION },
  handlers.dutyReminders
);

exports.onRequestCreated = onDocumentCreated(
  { document: 'requests/{id}', region: REGION },
  handlers.onRequestCreated
);

exports.onRequestResolved = onDocumentUpdated(
  { document: 'requests/{id}', region: REGION },
  handlers.onRequestResolved
);

exports.ics = onRequest({ region: REGION }, handlers.ics);

exports.publicSchedule = onRequest({ region: REGION }, handlers.publicSchedule);

exports.scheduledSheetSync = onSchedule(
  { schedule: 'every 2 hours', timeZone: TZ, region: REGION },
  handlers.scheduledSheetSync
);
