'use strict';

/* TEST ONLY. Loads index.js on the in-memory Firestore (memory-db.js, `docs`
   keyed by path and changed in place), an Auth stub that records custom
   tokens, claims and revoked sessions, and a messaging stub that records what
   would be sent. `sheets`, if given, stands in for the Google Sheet (see
   fake-sheets.js); `messagingErrors` maps a token to the error code FCM
   would answer for it. */
const Module = require('node:module');
const path = require('node:path');
const { FieldValue } = require('firebase-admin/firestore');
const { memoryDb } = require('./memory-db.js');

const sourcePath = path.join(__dirname, '..', 'index.js');

function loadIndex(docs, { sheets = null, messagingErrors = {}, fetch = null } = {}) {
  const sent = [];
  const auth = {
    tokens: [],
    claims: [],
    revoked: [],
    async createCustomToken(uid, claims) {
      auth.tokens.push({ uid, claims });
      return JSON.stringify({ uid, claims });
    },
    async setCustomUserClaims(uid, claims) { auth.claims.push({ uid, claims }); },
    async revokeRefreshTokens(uid) { auth.revoked.push(uid); }
  };
  const db = memoryDb(docs, { live: true });
  const messaging = {
    async sendEachForMulticast(message) {
      sent.push(message);
      return {
        responses: message.tokens.map(token => messagingErrors[token]
          ? { success: false, error: { code: messagingErrors[token] } }
          : { success: true })
      };
    }
  };
  const original = Module._load;
  const realFetch = global.fetch;
  if (fetch) global.fetch = fetch;
  Module._load = function load(request, parent, ...rest) {
    if (request === 'firebase-admin/app') return { initializeApp() {} };
    if (request === 'firebase-admin/firestore') return { getFirestore: () => db, FieldValue };
    if (request === 'firebase-admin/auth') return { getAuth: () => auth };
    if (request === 'firebase-admin/messaging') return { getMessaging: () => messaging };
    if (request === './sheets' && sheets) return { createSheets: () => sheets, accountEmail: async () => 'server@example.test', sheetIdFrom: id => id };
    return original.call(this, request, parent, ...rest);
  };
  try {
    Object.keys(require.cache).filter(file => file.startsWith(path.join(__dirname, '..') + path.sep) &&
      !file.includes(path.sep + 'node_modules' + path.sep) && !file.includes(path.sep + 'test' + path.sep))
      .forEach(file => { delete require.cache[file]; });
    return { functions: require(sourcePath), sent, docs, auth, db, restore: () => { global.fetch = realFetch; } };
  } finally {
    Module._load = original;
  }
}

module.exports = { loadIndex };
