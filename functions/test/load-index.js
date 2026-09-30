'use strict';

/* TEST ONLY. Loads index.js on a small in-memory Firestore (`docs`, keyed by
   path, changed in place) and a messaging stub that records what would be
   sent. `sheets`, if given, stands in for the Google Sheet (see
   fake-sheets.js). */
const Module = require('node:module');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', 'index.js');

function loadIndex(docs, { sheets = null } = {}) {
  const sent = [];
  const snapshot = (docPath, data) => ({
    id: docPath.split('/').pop(), exists: data !== undefined, data: () => data,
    ref: { delete: async () => { delete docs[docPath]; } }
  });
  const compare = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<': (a, b) => a < b };
  const merge = (docPath, value) => {
    const next = Object.assign({}, docs[docPath]);
    Object.entries(value).forEach(([key, field]) => {
      next[key] = field && typeof field === 'object' && !Array.isArray(field) ? Object.assign({}, next[key], field) : field;
    });
    docs[docPath] = next;
  };
  function doc(docPath) {
    return {
      id: docPath.split('/').pop(),
      path: docPath,
      get: async () => snapshot(docPath, docs[docPath]),
      set: async (value, options) => { if (options && options.merge) merge(docPath, value); else docs[docPath] = value; },
      collection: name => collection(docPath + '/' + name)
    };
  }
  function collection(collectionPath) {
    const filters = [];
    const query = {
      doc: id => doc(collectionPath + '/' + id),
      where: (field, op, value) => { filters.push(data => compare[op]((data || {})[field], value)); return query; },
      limit: () => query,
      get: async () => {
        const depth = collectionPath.split('/').length + 1;
        const items = Object.keys(docs).filter(key => key.startsWith(collectionPath + '/') && key.split('/').length === depth)
          .filter(key => filters.every(test => test(docs[key]))).map(key => snapshot(key, docs[key]));
        return { docs: items, size: items.length, empty: !items.length, forEach: fn => items.forEach(fn) };
      }
    };
    return query;
  }
  const db = {
    collection,
    runTransaction: () => {},
    batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    bulkWriter: () => {
      const writes = [];
      return {
        set: (ref, value, options) => writes.push(() => ref.set(value, options)),
        close: async () => { for (const write of writes) await write(); }
      };
    }
  };
  const messaging = {
    async sendEachForMulticast(message) {
      sent.push(message);
      return { responses: message.tokens.map(() => ({ success: true })) };
    }
  };
  const original = Module._load;
  Module._load = function load(request, parent, ...rest) {
    if (request === 'firebase-admin/app') return { initializeApp() {} };
    if (request === 'firebase-admin/firestore') return { getFirestore: () => db, FieldValue: { delete() {} } };
    if (request === 'firebase-admin/auth') return { getAuth: () => ({}) };
    if (request === 'firebase-admin/messaging') return { getMessaging: () => messaging };
    if (request === './sheets' && sheets) return { createSheets: () => sheets, accountEmail: async () => 'server@example.test', sheetIdFrom: id => id };
    return original.call(this, request, parent, ...rest);
  };
  try {
    delete require.cache[require.resolve(sourcePath)];
    return { functions: require(sourcePath), sent, docs };
  } finally {
    Module._load = original;
  }
}

module.exports = { loadIndex };
