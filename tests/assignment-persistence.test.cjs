'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const assignments = require('../src/services/assignments.js');
const setlist = require('../src/domain/setlist.js');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function snapshot(value) {
  return {
    exists: () => value !== undefined,
    data: () => clone(value)
  };
}

function makeFirebase({ schedule, plan } = {}) {
  const docs = {
    schedule: schedule === undefined ? undefined : clone(schedule),
    setlists: plan === undefined ? undefined : clone(plan)
  };
  const reads = [];
  const writes = [];
  const firebase = {
    db: { fictional: true },
    doc(_db, collection, id) { return { collection, id }; },
    async runTransaction(_db, callback) {
      const pending = [];
      const transaction = {
        async get(ref) {
          reads.push(ref.collection + '/' + ref.id);
          return snapshot(docs[ref.collection]);
        },
        update(ref, patch) {
          pending.push({ type: 'update', ref, patch: clone(patch) });
        },
        set(ref, value, options) {
          pending.push({ type: 'set', ref, value: clone(value), options });
        }
      };
      const result = await callback(transaction);
      pending.forEach(write => {
        writes.push(write);
        if (write.type === 'set') {
          docs[write.ref.collection] = clone(write.value);
          return;
        }
        const current = docs[write.ref.collection] || {};
        Object.keys(write.patch).forEach(key => {
          if (key === 'assignments.Presider') {
            current.assignments = Object.assign({}, current.assignments, { Presider: write.patch[key] });
          } else {
            current[key] = write.patch[key];
          }
        });
        docs[write.ref.collection] = current;
      });
      return result;
    }
  };
  return { firebase, docs, reads, writes };
}

function makeService(presider) {
  return {
    id: '2026-09-12_morning',
    date: '2026-09-12',
    service: 'Morning',
    assignments: { Presider: presider, 'Media Booth #1': 'Media Fixture' },
    unrelated: 'local value'
  };
}

function makePlan(presider) {
  return {
    id: '2026-09-12_morning',
    date: '2026-09-12',
    serviceLabel: 'Morning',
    presider,
    notes: 'Keep this outline note',
    songs: ['song-001', 'song-002'],
    order: ['song-002', 'song-001'],
    history: [{ songId: 'song-001', date: '2026-09-01' }],
    status: 'planned',
    confirmedAt: 100,
    updatedAt: 100,
    updatedBy: 'Old Presider',
    source: 'schedule'
  };
}

function makeAdapter(options) {
  const config = options || {};
  const firebaseRun = config.firebaseRun;
  const calls = { persist: 0, after: 0 };
  const service = assignments.create({
    getFirebase: () => config.firebase || null,
    getAuthReady: config.getAuthReady || (() => Promise.resolve()),
    persistService(value) {
      calls.persist++;
      if (config.persistError) return Promise.reject(config.persistError);
      calls.persisted = value;
      return Promise.resolve('persisted');
    },
    serviceId: value => value.id,
    afterDataChange() { calls.after++; },
    getMe: () => config.me || 'New Presider',
    now: () => config.now == null ? 101 : config.now,
    persistLocalSetlist: config.persistLocalSetlist
  });
  if (firebaseRun) return { service, calls, firebaseRun };
  return { service, calls };
}

test('exports the browser/CommonJS factory and stable saveService API', () => {
  assert.deepEqual(Object.keys(assignments), ['create']);
  const { service } = makeAdapter();
  assert.deepEqual(Object.keys(service), ['saveService']);
  assert.equal(typeof service.saveService, 'function');
});

test('waits for auth before reading or writing the schedule and plan transaction', async () => {
  const fake = makeFirebase({ schedule: makeService('Old Presider'), plan: makePlan('Old Presider') });
  let release;
  const authReady = new Promise(resolve => { release = resolve; });
  const { service } = makeAdapter({ firebase: fake.firebase, getAuthReady: () => authReady });
  const pending = service.saveService(makeService('New Presider'), { previousPresider: 'Old Presider' });

  await Promise.resolve();
  assert.deepEqual(fake.reads, [], 'transaction must not start before auth is ready');
  release();
  await pending;
  assert.deepEqual(fake.reads, ['schedule/2026-09-12_morning', 'setlists/2026-09-12_morning']);
  assert.equal(fake.writes.length, 2);
});

test('reassigns an existing confirmed plan while preserving songs, history, order, status, notes, and confirmation', async () => {
  const originalPlan = makePlan('Old Presider');
  const fake = makeFirebase({ schedule: makeService('Old Presider'), plan: originalPlan });
  const { service, calls } = makeAdapter({ firebase: fake.firebase, now: 100 });
  const result = await service.saveService(makeService('New Presider'), { previousPresider: 'Old Presider' });

  assert.equal(result.status, 'saved');
  assert.equal(result.planChanged, true);
  assert.deepEqual(fake.docs.schedule.assignments, {
    Presider: 'New Presider',
    'Media Booth #1': 'Media Fixture'
  });
  assert.equal(fake.docs.setlists.presider, 'New Presider');
  assert.equal(fake.docs.setlists.updatedAt, 101, 'reassignment must advance a repeated clock');
  assert.equal(fake.docs.setlists.updatedBy, 'New Presider');
  assert.equal(fake.docs.setlists.confirmedAt, originalPlan.confirmedAt);
  assert.deepEqual(fake.docs.setlists.songs, originalPlan.songs);
  assert.deepEqual(fake.docs.setlists.order, originalPlan.order);
  assert.deepEqual(fake.docs.setlists.history, originalPlan.history);
  assert.equal(fake.docs.setlists.status, originalPlan.status);
  assert.equal(fake.docs.setlists.notes, originalPlan.notes);
  assert.equal(setlist.isChanged(fake.docs.setlists), true);
  assert.equal(calls.persist, 0, 'Firebase reassignment must not whole-document overwrite the schedule');
  assert.equal(calls.after, 1);
  assert.deepEqual(fake.writes.map(write => write.type), ['update', 'update']);
  assert.deepEqual(fake.writes[0].patch, { 'assignments.Presider': 'New Presider' });
  assert.deepEqual(Object.keys(fake.writes[1].patch).sort(), ['presider', 'updatedAt', 'updatedBy']);
});

test('updates the schedule but never creates a missing song plan', async () => {
  const fake = makeFirebase({ schedule: makeService('Old Presider') });
  const { service } = makeAdapter({ firebase: fake.firebase });
  const result = await service.saveService(makeService('New Presider'), { previousPresider: 'Old Presider' });

  assert.equal(result.planExists, false);
  assert.equal(fake.docs.setlists, undefined);
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(fake.writes[0].patch, { 'assignments.Presider': 'New Presider' });
});

test('rejects a stale previous presider without writing either record or keeping the optimistic name', async () => {
  const fake = makeFirebase({ schedule: makeService('Someone Else'), plan: makePlan('Someone Else') });
  const { service, calls } = makeAdapter({ firebase: fake.firebase });
  const value = makeService('New Presider');

  await assert.rejects(
    service.saveService(value, { previousPresider: 'Old Presider' }),
    error => error.code === 'ASSIGNMENT_STALE' && /refresh the schedule/i.test(error.message)
  );
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.docs.schedule.assignments.Presider, 'Someone Else');
  assert.equal(fake.docs.setlists.presider, 'Someone Else');
  assert.equal(value.assignments.Presider, 'Someone Else');
  assert.equal(calls.after, 1, 'the host refreshes after reverting the optimistic value');
});

test('rejects a deleted schedule target and restores the previous local value', async () => {
  const fake = makeFirebase({ plan: makePlan('Old Presider') });
  const { service, calls } = makeAdapter({ firebase: fake.firebase });
  const value = makeService('New Presider');

  await assert.rejects(
    service.saveService(value, { previousPresider: 'Old Presider' }),
    error => error.code === 'ASSIGNMENT_SERVICE_MISSING' && /refresh the schedule/i.test(error.message)
  );
  assert.equal(fake.writes.length, 0);
  assert.equal(value.assignments.Presider, 'Old Presider');
  assert.equal(calls.after, 1);
});

test('clears the plan presider to the established blank value when Presider is removed', async () => {
  const fake = makeFirebase({ schedule: makeService('Old Presider'), plan: makePlan('Old Presider') });
  const { service } = makeAdapter({ firebase: fake.firebase, now: 100 });
  const value = makeService('Old Presider');
  delete value.assignments.Presider;

  const result = await service.saveService(value, { previousPresider: 'Old Presider' });

  assert.equal(result.planChanged, true);
  assert.equal(fake.docs.setlists.presider, '');
  assert.equal(fake.docs.setlists.updatedAt, 101);
  assert.equal(fake.docs.schedule.assignments.Presider, undefined);
  assert.equal(fake.docs.schedule.assignments['Media Booth #1'], 'Media Fixture');
});

test('non-Presider calls pass through whole-service persistence and refresh callback', async () => {
  const serviceValue = makeService('Old Presider');
  serviceValue.assignments['Media Booth #1'] = 'Another Fixture';
  const { service, calls } = makeAdapter();
  const result = await service.saveService(serviceValue);

  assert.equal(result, 'persisted');
  assert.equal(calls.persist, 1);
  assert.equal(calls.persisted, serviceValue);
  assert.equal(calls.after, 1);
});

test('local reassignment uses the injected song-plan bridge and established schedule persistence', async () => {
  const bridgeCalls = [];
  const { service, calls } = makeAdapter({
    persistLocalSetlist(payload) { bridgeCalls.push(payload); return 'local plan saved'; }
  });
  const value = makeService('New Presider');
  const result = await service.saveService(value, { previousPresider: 'Old Presider' });

  assert.equal(result.status, 'local');
  assert.equal(calls.persist, 1);
  assert.equal(calls.after, 1);
  assert.deepEqual(bridgeCalls, [{
    serviceId: value.id,
    presider: 'New Presider',
    previousPresider: 'Old Presider',
    service: value
  }]);
});

test('does not swallow auth, transaction, or ordinary persistence failures', async () => {
  const authError = new Error('fictional auth failure');
  const fake = makeFirebase({ schedule: makeService('Old Presider'), plan: makePlan('Old Presider') });
  const authAdapter = makeAdapter({ firebase: fake.firebase, getAuthReady: () => Promise.reject(authError) });
  await assert.rejects(
    authAdapter.service.saveService(makeService('New Presider'), { previousPresider: 'Old Presider' }),
    authError
  );
  assert.equal(authAdapter.calls.after, 0);

  const transactionError = new Error('fictional transaction failure');
  const brokenFirebase = Object.assign({}, fake.firebase, {
    runTransaction() { return Promise.reject(transactionError); }
  });
  const transactionAdapter = makeAdapter({ firebase: brokenFirebase });
  await assert.rejects(
    transactionAdapter.service.saveService(makeService('New Presider'), { previousPresider: 'Old Presider' }),
    transactionError
  );
  assert.equal(transactionAdapter.calls.after, 0);

  const persistenceError = new Error('fictional persistence failure');
  const passthroughAdapter = makeAdapter({ persistError: persistenceError });
  await assert.rejects(passthroughAdapter.service.saveService(makeService('Old Presider')), persistenceError);
  assert.equal(passthroughAdapter.calls.after, 0);
});
