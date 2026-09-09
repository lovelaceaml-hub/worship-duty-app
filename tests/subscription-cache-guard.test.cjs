'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createManager } = require('../src/services/subscriptions.js');

function makeSnapshot(docs, fromCache) {
  const snapshot = { docs, empty: docs.length === 0 };
  if (fromCache !== undefined) snapshot.metadata = { fromCache };
  return snapshot;
}

function makeFakeFirebase() {
  const listeners = [];
  const calls = [];
  const firebase = {
    collection(db, name) { return { kind: 'collection', path: [name] }; },
    doc(db, collection, id) { return { kind: 'doc', path: [collection, id] }; },
    onSnapshot(...args) {
      const [target, optionsOrNext, nextOrError, maybeError] = args;
      const withOptions = optionsOrNext && typeof optionsOrNext === 'object';
      const options = withOptions ? optionsOrNext : undefined;
      const next = withOptions ? nextOrError : optionsOrNext;
      const error = withOptions ? maybeError : nextOrError;
      const listener = { target, options, next, error, active: true };
      listeners.push(listener);
      calls.push({ target, options });
      return () => { listener.active = false; };
    }
  };
  return {
    firebase,
    calls,
    emitSchedule(snapshot) {
      listeners
        .filter(listener => listener.active && listener.options && listener.target.kind === 'collection' && listener.target.path[0] === 'schedule')
        .forEach(listener => listener.next(snapshot));
    },
    activeListeners() { return listeners.filter(listener => listener.active); }
  };
}

function startWithEvents() {
  const fake = makeFakeFirebase();
  const events = [];
  const manager = createManager({ firebase: fake.firebase, db: {}, emit: event => events.push(event) });
  manager.start();
  return { fake, events, manager };
}

test('cached empty followed by server empty seeds once', () => {
  const { fake, events } = startWithEvents();

  fake.emitSchedule(makeSnapshot([], true));
  assert.equal(events.some(event => event.type === 'schedule-initial-empty'), false);

  fake.emitSchedule(makeSnapshot([], false));
  assert.deepEqual(events.map(event => event.type), ['schedule-initial-empty']);

  fake.emitSchedule(makeSnapshot([], false));
  assert.deepEqual(events.map(event => event.type), ['schedule-initial-empty', 'schedule-authoritative']);
});

test('cached empty followed by server populated applies server state without seeding', () => {
  const { fake, events } = startWithEvents();
  const doc = { id: 'service-1', data: () => ({ date: '2026-09-13' }) };

  fake.emitSchedule(makeSnapshot([], true));
  fake.emitSchedule(makeSnapshot([doc], false));

  assert.deepEqual(events.map(event => event.type), ['schedule-authoritative']);
  assert.deepEqual(events[0].services, [{ date: '2026-09-13' }]);
  assert.deepEqual(events[0].knownIds, ['service-1']);
});

test('offline warm cache with populated schedule remains authoritative data', () => {
  const { fake, events } = startWithEvents();
  const doc = { id: 'cached-1', data: () => ({ date: '2026-09-06' }) };

  fake.emitSchedule(makeSnapshot([doc], true));

  assert.deepEqual(events.map(event => event.type), ['schedule-authoritative']);
  assert.deepEqual(events[0].knownIds, ['cached-1']);
});

test('schedule listener requests metadata changes and stop permits restart', () => {
  const { fake, events, manager } = startWithEvents();
  const firstScheduleCall = fake.calls.find(call => call.target.kind === 'collection' && call.target.path[0] === 'schedule' && call.options);
  assert.deepEqual(firstScheduleCall.options, { includeMetadataChanges: true });

  manager.stop();
  assert.equal(fake.activeListeners().length, 0);
  fake.emitSchedule(makeSnapshot([], false));
  assert.equal(events.length, 0);

  manager.start();
  fake.emitSchedule(makeSnapshot([], false));
  assert.deepEqual(events.map(event => event.type), ['schedule-initial-empty']);
});
