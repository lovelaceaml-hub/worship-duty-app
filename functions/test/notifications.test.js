'use strict';

/* Who gets a phone notification when a member asks for a change, and when
   the request is answered. index.js runs on a small in-memory Firestore and
   a messaging stub that records what would be sent. */
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(__dirname, '..', 'index.js');

function loadWith(docs) {
  const sent = [];
  const snapshot = (id, data) => ({ id, exists: data !== undefined, data: () => data });
  const db = {
    collection(name) {
      return {
        doc: id => ({ get: async () => snapshot(id, docs[name + '/' + id]) }),
        get: async () => {
          const items = Object.keys(docs).filter(key => key.startsWith(name + '/'))
            .map(key => snapshot(key.slice(name.length + 1), docs[key]));
          return { docs: items, forEach: fn => items.forEach(fn) };
        }
      };
    },
    runTransaction: () => {},
    batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} })
  };
  const messaging = {
    async sendEachForMulticast(message) {
      sent.push(message);
      return { responses: message.tokens.map(() => ({ success: true })) };
    }
  };
  const original = Module._load;
  Module._load = function load(request, ...rest) {
    if (request === 'firebase-admin/app') return { initializeApp() {} };
    if (request === 'firebase-admin/firestore') return { getFirestore: () => db, FieldValue: { delete() {} } };
    if (request === 'firebase-admin/auth') return { getAuth: () => ({}) };
    if (request === 'firebase-admin/messaging') return { getMessaging: () => messaging };
    return original.call(this, request, ...rest);
  };
  try {
    delete require.cache[require.resolve(sourcePath)];
    return { functions: require(sourcePath), sent };
  } finally {
    Module._load = original;
  }
}

const tokens = {
  'tokens/scheduler-phone': { name: 'E. Joseph' },
  'tokens/leader-phone': { name: 'S. Grace' },
  'tokens/member-phone': { name: 'S. Leah' },
  'tokens/other-phone': { name: 'B. Caleb' }
};
const request = {
  name: 'S. Leah', duty: 'Usher Door', department: 'Usher Sisters', date: '2026-10-03',
  service: 'Morning', note: 'Family visiting.', status: 'pending'
};
const created = data => ({ data: { exists: true, data: () => data }, params: { id: 'r1' } });
const recipients = sent => sent.flatMap(message => message.tokens).sort();

test('a new change request reaches the scheduler and that department\'s leaders, not the member', async () => {
  const { functions, sent } = loadWith(Object.assign({
    'app/settings': { schedulerName: 'E. Joseph' },
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['S. Grace'], Media: ['B. Caleb'] } }
  }, tokens));
  await functions.onRequestCreated.run(created(request));
  assert.deepEqual(recipients(sent), ['leader-phone', 'scheduler-phone']);
  assert.equal(sent[0].data.title, 'Change request');
  assert.match(sent[0].data.body, /^S\. Leah asks to change Usher Door · Saturday, October 3 Morning · "Family visiting\."$/);
});

test('a leader who asks for a change is not told about their own request', async () => {
  const { functions, sent } = loadWith(Object.assign({
    'app/settings': {},
    'app/leaderConfig': { departmentLeaders: { 'Usher Sisters': ['S. Leah', 'S. Grace'] } }
  }, tokens));
  await functions.onRequestCreated.run(created(request));
  assert.deepEqual(recipients(sent), ['leader-phone']);
});

test('the member hears when their request is approved or declined', async () => {
  for (const [status, title] of [['approved', 'Your change request was approved'], ['declined', 'Your change request was declined']]) {
    const { functions, sent } = loadWith(Object.assign({}, tokens));
    await functions.onRequestResolved.run({
      data: {
        before: { exists: true, data: () => request },
        after: { exists: true, data: () => Object.assign({}, request, { status }) }
      },
      params: { id: 'r1' }
    });
    assert.deepEqual(recipients(sent), ['member-phone']);
    assert.equal(sent[0].data.title, title);
  }
});
