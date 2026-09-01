'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const sync = require('../worship-sync');

const FIXTURE_SECRET = 'lv-zion-sync-test-key-only-20260831';
const FIXTURE_TIMESTAMP = '1788172800123';
const ROTATION_ACTIVATED_AT_MS = 1788172800000;

const eventService = {
  id: 'svc-2026-09-05-am',
  date: '2026-09-05',
  time: '09:00',
  serviceLabel: 'Sabbath Service',
  worshipLabel: 'Morning Worship',
  choirSong: 'Morning Light',
  sourceUpdatedAt: '1788172799000',
  assignments: [
    { dutyLabel: 'Presider', memberLabel: 'Avery Sample' },
    { dutyLabel: 'Reader', memberLabel: 'Jordan Example' },
  ],
};

const secondService = {
  id: 'svc-2026-09-06-pm',
  date: '2026-09-06',
  time: '18:00',
  serviceLabel: 'Sunday Service',
  worshipLabel: 'Evening Worship',
  sourceUpdatedAt: '1788259199000',
  assignments: [{ dutyLabel: 'Presider', memberLabel: 'Riley Fiction' }],
};

function expectedSignature(body) {
  return sync.hmacSignature(body, FIXTURE_TIMESTAMP, FIXTURE_SECRET);
}

function snapshotDoc(id, data) {
  return { id, exists: true, data: () => data };
}

function fakeDb(scheduleDocs = [], options = {}) {
  const store = new Map();
  const calls = [];
  const limits = {
    documentMaxBytes: 1024 * 1024,
    batchMaxWrites: 500,
    batchMaxBytes: 10 * 1024 * 1024,
    transactionMaxWrites: 500,
    transactionMaxBytes: 10 * 1024 * 1024,
    ...(options.limits || {}),
  };
  const stats = {
    batchWrites: [], transactionBatches: [], transactionWrites: 0,
    transactionBytes: 0, maxDocumentBytes: 0,
  };
  const encodedBytes = value => {
    if (Buffer.isBuffer(value)) return value.length;
    if (value instanceof Uint8Array) return value.byteLength;
    if (value === null || value === undefined) return 1;
    if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
    if (typeof value === 'number' || typeof value === 'boolean') return 8;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + encodedBytes(item), 0);
    if (typeof value === 'object') {
      return Object.entries(value).reduce((sum, [key, item]) =>
        sum + Buffer.byteLength(key, 'utf8') + encodedBytes(item), 0);
    }
    return 1;
  };
  const checkDocument = (path, value) => {
    const bytes = encodedBytes(value);
    stats.maxDocumentBytes = Math.max(stats.maxDocumentBytes, bytes);
    if (limits.documentMaxBytes !== undefined && bytes > limits.documentMaxBytes) {
      throw new Error('fake Firestore document limit exceeded: ' + path);
    }
    return bytes;
  };
  const writeValue = (path, value, merge) => {
    const old = store.get(path) || {};
    const next = merge ? { ...old, ...value } : value;
    checkDocument(path, next);
    store.set(path, next);
  };
  const snapshotFor = path => {
    const value = store.get(path);
    return { exists: value !== undefined, data: () => value };
  };
  const ref = path => ({
    path,
    id: path.split('/').pop(),
    collection(name) {
      calls.push('collection:' + path + '/' + name);
      return collection(path + '/' + name);
    },
    async get() { return snapshotFor(path); },
    async set(value, options) { writeValue(path, value, options && options.merge); },
    async delete() { store.delete(path); },
  });
  const collection = (path, constraints = []) => ({
    path,
    doc: id => ref(path + '/' + id),
    where(field, op, value) {
      return collection(path, constraints.concat({ kind: 'where', field, op, value }));
    },
    orderBy(field, direction = 'asc') {
      return collection(path, constraints.concat({ kind: 'orderBy', field, direction }));
    },
    limit(count) {
      return collection(path, constraints.concat({ kind: 'limit', count }));
    },
    startAfter(value) {
      return collection(path, constraints.concat({ kind: 'startAfter', value }));
    },
    async get() {
      if (path === 'schedule' && constraints.length === 0) {
        if (typeof db.onScheduleRead === 'function') await db.onScheduleRead();
        return { docs: scheduleDocs };
      }
      const prefix = path + '/';
      let docs = [];
      for (const [storedPath, value] of store.entries()) {
        if (!storedPath.startsWith(prefix) || storedPath.slice(prefix.length).includes('/')) continue;
        docs.push({ id: storedPath.slice(prefix.length), ref: ref(storedPath), data: () => value, exists: true });
      }
      for (const constraint of constraints) {
        if (constraint.kind !== 'where') continue;
        docs = docs.filter(doc => {
          const actual = constraint.field === '__name__' ? doc.id : doc.data()[constraint.field];
          if (constraint.op === '==') return actual === constraint.value;
          if (constraint.op === '<=') return actual <= constraint.value;
          if (constraint.op === '>=') return actual >= constraint.value;
          if (constraint.op === 'in') return constraint.value.includes(actual);
          throw new Error('unsupported fake query operator');
        });
      }
      const orderings = constraints.filter(constraint => constraint.kind === 'orderBy');
      if (orderings.length) {
        docs.sort((left, right) => {
          for (const ordering of orderings) {
            const leftValue = ordering.field === '__name__' ? left.id : left.data()[ordering.field];
            const rightValue = ordering.field === '__name__' ? right.id : right.data()[ordering.field];
            if (leftValue === rightValue) continue;
            const result = leftValue < rightValue ? -1 : 1;
            return ordering.direction === 'desc' ? -result : result;
          }
          return 0;
        });
      }
      const start = constraints.find(constraint => constraint.kind === 'startAfter');
      if (start) docs = docs.filter(doc => doc.id > start.value);
      const max = constraints.find(constraint => constraint.kind === 'limit');
      if (max) docs = docs.slice(0, max.count);
      return { docs };
    },
  });
  const db = {
    calls,
    store,
    stats,
    onScheduleRead: options.onScheduleRead,
    collection(name) {
      calls.push('collection:' + name);
      return collection(name);
    },
    batch() {
      const writes = [];
      return {
        set(target, value, writeOptions) { writes.push({ target, value, writeOptions }); },
        async commit() {
          const bytes = writes.reduce((sum, item) => sum + checkDocument(item.target.path,
            item.writeOptions && item.writeOptions.merge
              ? { ...(store.get(item.target.path) || {}), ...item.value } : item.value), 0);
          if (limits.batchMaxWrites !== undefined && writes.length > limits.batchMaxWrites) {
            throw new Error('fake Firestore batch write limit exceeded');
          }
          if (limits.batchMaxBytes !== undefined && bytes > limits.batchMaxBytes) {
            throw new Error('fake Firestore batch request limit exceeded');
          }
          stats.batchWrites.push({ count: writes.length, bytes });
          for (const item of writes) writeValue(item.target.path, item.value,
            item.writeOptions && item.writeOptions.merge);
        },
      };
    },
    async runTransaction(callback) {
      const beforeWrites = stats.transactionWrites;
      const beforeBytes = stats.transactionBytes;
      const checkTransactionWrite = (target, value, merge) => {
        const old = store.get(target.path) || {};
        const next = merge ? { ...old, ...value } : value;
        const bytes = checkDocument(target.path, next);
        stats.transactionWrites += 1;
        stats.transactionBytes += bytes;
        const writes = stats.transactionWrites - beforeWrites;
        const totalBytes = stats.transactionBytes - beforeBytes;
        if (limits.transactionMaxWrites !== undefined && writes > limits.transactionMaxWrites) {
          throw new Error('fake Firestore transaction write limit exceeded');
        }
        if (limits.transactionMaxBytes !== undefined && totalBytes > limits.transactionMaxBytes) {
          throw new Error('fake Firestore transaction request limit exceeded');
        }
      };
      const tx = {
        async get(target) {
          if (typeof target.get === 'function' && target.path && !target.id) return target.get();
          if (target.path && target.path.endsWith('/items')) return target.get();
          return snapshotFor(target.path);
        },
        create(target, value) {
          if (store.has(target.path)) throw new Error('already exists');
          checkTransactionWrite(target, value, false);
          store.set(target.path, value);
        },
        set(target, value, options) {
          checkTransactionWrite(target, value, options && options.merge);
          writeValue(target.path, value, options && options.merge);
        },
        delete(target) { store.delete(target.path); },
      };
      const result = await callback(tx);
      stats.transactionBatches.push({
        count: stats.transactionWrites - beforeWrites,
        bytes: stats.transactionBytes - beforeBytes,
      });
      return result;
    },
  };
  return db;
}

test('reproduces all four frozen canonical body, hash, and signature vectors', () => {
  const eventBody = sync.buildEventBody({
    sequence: 42,
    generatedAt: '1788172800000',
    operation: 'upsert',
    service: eventService,
  });
  assert.equal(Buffer.byteLength(eventBody), 449);
  assert.equal(sync.sha256Hex(eventBody), 'f03f578dd9402ee4c01e48ed31d4b7359c361fc0fd39bd570f1b5a9140a4ecb5');
  assert.equal(expectedSignature(eventBody), 'v1=d60123ee993bf4870f3d285da3ea7ffb78f9198e9d85aa97a4bcc34fce40acd3');

  const deleteBody = sync.buildEventBody({
    sequence: 44,
    generatedAt: '1788172802000',
    operation: 'delete',
    service: { id: eventService.id },
  });
  assert.equal(Buffer.byteLength(deleteBody), 162);
  assert.equal(sync.sha256Hex(deleteBody), '3030238b4cc3daa54bf7ab9fe55c96703756694bce8621ef66db4d869299d4b8');
  assert.equal(expectedSignature(deleteBody), 'v1=1e6c062f1783fc33f01e3b0fd02d858dce217f322930585bd09b13976d56b192');

  const snapshot = sync.buildSnapshotParts([eventService, secondService], {
    sequence: 43,
    generatedAt: '1788172801000',
    snapshotId: 'snap-2026-09-05-weekend',
    partSize: 1,
  });
  assert.equal(snapshot.fullSha256, 'e7324a2ac7ded131b4d502dff6841ea4ebd022f753c284c709a2950119a24da3');
  const expected = [
    [680, 'f7fa1e9d39d88a70e57bf61e81e3421637dac5079f7161a5a42c2d4e6f6f3587', '4def391913ccf03d779e16d9a09147a3b7fe2f1be792801f47fbbe3ba6c5f8d3', 'v1=33b6397a4e3fbd0a7445b82f0e42afe4510eb808f7f08be057b665496f18dd78'],
    [597, '44fe5c1bbc170e71cf1a0c666046502f351b787375e0eb124caa6b55a49a682e', '0aa63c4b7ef1631b3639b89b7837a7ecc7e92b9f111a01e1547973c3947d6e50', 'v1=65194603a03086f3b7228a8aa11318a188c85edbc93ddf855fb2e8b58e9539d9'],
  ];
  snapshot.parts.forEach((part, index) => {
    assert.equal(Buffer.byteLength(part.rawBody), expected[index][0]);
    assert.equal(part.payload.partSha256, expected[index][1]);
    assert.equal(part.bodySha256, expected[index][2]);
    assert.equal(expectedSignature(part.rawBody), expected[index][3]);
  });
});

test('uses exact field allowlist and excludes conflictOk and unlisted metadata', () => {
  const service = sync.serviceFromSchedule({
    id: eventService.id,
    date: eventService.date,
    time: eventService.time,
    service: 'Sabbath Service',
    worship: 'Morning Worship',
    choirSong: eventService.choirSong,
    sourceUpdatedAt: eventService.sourceUpdatedAt,
    assignments: { Reader: 'Jordan Example', Presider: 'Avery Sample' },
    conflictOk: { 'Avery Sample': ['Presider'] },
    editorNote: 'fictional internal note',
    tokens: ['fictional token'],
  });
  assert.deepEqual(Object.keys(service), [
    'id', 'date', 'time', 'serviceLabel', 'worshipLabel', 'choirSong', 'sourceUpdatedAt', 'assignments',
  ]);
  assert.equal('conflictOk' in service, false);
  assert.equal('editorNote' in service, false);
  assert.equal('tokens' in service, false);
});

test('sorts services and assignments deterministically without mutating input documents', () => {
  const input = [
    { ...secondService, assignments: [...secondService.assignments] },
    { ...eventService, assignments: [...eventService.assignments].reverse() },
  ];
  const before = JSON.stringify(input);
  const built = sync.buildSnapshotParts(input, {
    sequence: 3,
    generatedAt: '1788172801000',
    snapshotId: 'snapshot-3',
  });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(built.services.map(service => service.id), [eventService.id, secondService.id]);
  assert.deepEqual(built.services[0].assignments.map(item => item.dutyLabel), ['Presider', 'Reader']);
  assert.equal(built.parts[0].payload.final, true);
});

test('supports empty full snapshots and absent services', () => {
  const empty = sync.buildSnapshotParts([], {
    sequence: 0,
    generatedAt: '0000000000000',
    snapshotId: 'empty-snapshot',
  });
  assert.equal(empty.parts.length, 1);
  assert.deepEqual(empty.parts[0].payload.services, []);
  assert.equal(empty.parts[0].payload.final, true);
  assert.equal(empty.fullSha256, sync.sha256Hex('[]'));
  const deleted = sync.buildEventPayload({
    sequence: 1,
    generatedAt: '1788172800000',
    operation: 'delete',
    service: { id: eventService.id },
  });
  assert.deepEqual(deleted.service, { id: eventService.id });
});

test('enforces exact source and snapshot identifier boundaries', () => {
  const one = 'A';
  const max = 'A'.repeat(128);
  assert.equal(sync.ID_PATTERN.test(one), true);
  assert.equal(sync.ID_PATTERN.test(max), true);
  assert.equal(sync.ID_PATTERN.test(''), false);
  assert.equal(sync.ID_PATTERN.test('A'.repeat(129)), false);
  assert.equal(sync.ID_PATTERN.test('has space'), false);
  assert.equal(sync.ID_PATTERN.test('é'), false);
  assert.equal(sync.asciiSlug('Avery Sample'), 'avery-sample');
  assert.throws(() => sync.serviceFromSchedule({ ...eventService, id: 'avery-sample' }), /member label/);
  assert.throws(() => sync.buildSnapshotParts([{ ...eventService, id: 'avery-sample' }], {
    sequence: 2, generatedAt: '1788172801000', snapshotId: 'snapshot-2',
  }), /member label/);
  const maxSnapshotId = 'S'.repeat(128);
  assert.equal(sync.buildSnapshotParts([], {
    sequence: 2, generatedAt: '1788172801000', snapshotId: maxSnapshotId,
  }).parts.length, 1);
  assert.throws(() => sync.buildSnapshotParts([], {
    sequence: 2, generatedAt: '1788172801000', snapshotId: 'S'.repeat(129),
  }), /too long/);
});

test('enforces assignment, snapshot, part, and raw-body limits', () => {
  const tooManyAssignments = {
    ...eventService,
    assignments: Array.from({ length: 41 }, (_, index) => ({
      dutyLabel: 'Duty' + index,
      memberLabel: 'Fictional Member ' + index,
    })),
  };
  assert.throws(() => sync.serviceFromSchedule(tooManyAssignments), /assignments/);
  const tooManyServices = Array.from({ length: 2001 }, (_, index) => ({
    ...secondService,
    id: 'svc-' + index,
  }));
  assert.throws(() => sync.buildSnapshotParts(tooManyServices, {
    sequence: 2, generatedAt: '1788172801000', snapshotId: 'snapshot-2',
  }), /too many services/);
  assert.throws(() => sync.buildSignedRequest({
    rawBody: Buffer.alloc(1024 * 1024 + 1),
    timestamp: FIXTURE_TIMESTAMP,
    keyId: 'test-fixture',
    secret: FIXTURE_SECRET,
    url: 'https://fictional.example/sync',
  }), /1 MiB/);
  assert.throws(() => sync.buildSnapshotParts([eventService], {
    sequence: 2, generatedAt: '1788172801000', snapshotId: 'snapshot-2', partSize: 51,
  }), /partSize/);
});

test('builds exact framing headers and raw-body HMAC', () => {
  const body = sync.buildEventBody({ sequence: 42, generatedAt: '1788172800000', operation: 'upsert', service: eventService });
  const request = sync.buildSignedRequest({
    rawBody: body,
    timestamp: FIXTURE_TIMESTAMP,
    keyId: 'test-fixture',
    secret: FIXTURE_SECRET,
    url: 'https://fictional.example/sync',
  });
  assert.equal(request.headers['Content-Length'], '449');
  assert.equal(request.headers['X-LV-Zion-Sync-Timestamp'], FIXTURE_TIMESTAMP);
  assert.equal(request.headers['X-LV-Zion-Sync-Key-Id'], 'test-fixture');
  assert.equal(request.headers['X-LV-Zion-Sync-Signature'], expectedSignature(body));
  assert.equal(request.rawBody.toString('utf8'), body);
});

test('classifies receiver statuses and retries only bounded transport outcomes', () => {
  assert.equal(sync.classifyReceiverStatus(200), 'accepted');
  assert.equal(sync.classifyReceiverStatus(202), 'accepted_pending_mapping');
  assert.equal(sync.classifyReceiverStatus(400), 'malformed');
  assert.equal(sync.classifyReceiverStatus(401), 'unauthorized');
  assert.equal(sync.classifyReceiverStatus(409), 'conflict_or_stale');
  assert.equal(sync.classifyReceiverStatus(413), 'oversized');
  assert.equal(sync.classifyReceiverStatus(410), 'expired');
  assert.equal(sync.classifyReceiverStatus(503), 'retryable_transport');
  assert.equal(sync.classifyReceiverStatus(418), 'unknown');
  assert.deepEqual([...sync.RETRY_DELAYS_MS], [250, 500]);
  assert.equal(sync.REQUEST_TIMEOUT_MS, 10000);
  assert.equal(sync.MAX_ATTEMPTS, 3);
  assert.equal(sync.ATTEMPT_BUDGET_MS, 30000);
});

test('retries 503 twice with the same exact request and then accepts', async () => {
  const calls = [];
  const waits = [];
  const request = { rawBody: Buffer.from('{"fictional":true}'), headers: {}, url: 'https://fictional.example/sync' };
  const result = await sync.sendWithRetry(request, {
    sendRequest: async sameRequest => {
      calls.push(sameRequest.rawBody.toString('utf8'));
      return { status: calls.length < 3 ? 503 : 200 };
    },
    sleep: async ms => waits.push(ms),
  });
  assert.equal(result.kind, 'accepted');
  assert.equal(result.attempts, 3);
  assert.deepEqual(waits, [250, 500]);
  assert.deepEqual(calls, ['{"fictional":true}', '{"fictional":true}', '{"fictional":true}']);
});

test('does not retry a receiver conflict or malformed request', async () => {
  let calls = 0;
  const waits = [];
  const result = await sync.sendWithRetry({ rawBody: Buffer.from('{}') }, {
    sendRequest: async () => { calls += 1; return { status: 409 }; },
    sleep: async ms => waits.push(ms),
  });
  assert.equal(result.kind, 'failed');
  assert.equal(result.status, 409);
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test('does not retry a received but unrecognized HTTP outcome', async () => {
  let calls = 0;
  const result = await sync.sendWithRetry({ rawBody: Buffer.from('{}') }, {
    sendRequest: async () => { calls += 1; return { status: 418 }; },
    sleep: async () => { throw new Error('unexpected retry'); },
  });
  assert.equal(result.kind, 'unknown');
  assert.equal(result.status, 418);
  assert.equal(calls, 1);
});

test('keeps unknown outcomes unknown after three attempts and never changes the request', async () => {
  let calls = 0;
  const waits = [];
  const request = { rawBody: Buffer.from('exact-body'), headers: { sequence: '9' } };
  const result = await sync.sendWithRetry(request, {
    sendRequest: async sameRequest => {
      calls += 1;
      assert.equal(sameRequest.rawBody.toString(), 'exact-body');
      throw Object.assign(new Error('fictional transport failure'), { code: 'ECONNRESET' });
    },
    sleep: async ms => waits.push(ms),
  });
  assert.equal(result.kind, 'unknown');
  assert.equal(result.attempts, 3);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [250, 500]);
});

test('applies the ten-second request timeout and bounded budget to a hanging request', async () => {
  const started = Date.now();
  const result = await sync.sendWithRetry({ rawBody: Buffer.from('{}') }, {
    timeoutMs: 2,
    budgetMs: 5,
    sleep: async () => {},
    sendRequest: async (_request, signal) => new Promise((resolve, reject) => {
      if (signal.aborted) reject(new Error('aborted'));
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      void resolve;
    }),
  });
  assert.equal(result.kind, 'unknown');
  assert.equal(result.attempts >= 1, true);
  assert.equal(Date.now() - started < 1000, true);
});

test('safe receipts redact bodies, member labels, secrets, tokens, URLs, and provider responses', () => {
  const receipt = sync.safeReceipt({
    revision: 'hash-only',
    mode: 'event',
    sourceSequence: 4,
    keyId: 'test-fixture',
    status: 'accepted',
    bodySha256: crypto.createHash('sha256').update('fictional').digest('hex'),
    rawBody: 'memberLabel: Avery Sample',
    memberLabel: 'Avery Sample',
    secret: FIXTURE_SECRET,
    token: 'fictional-token',
    url: 'https://fictional.example/?secret=hidden',
    providerResponse: 'Avery Sample',
  });
  const text = JSON.stringify(receipt);
  assert.equal(text.includes('Avery Sample'), false);
  assert.equal(text.includes(FIXTURE_SECRET), false);
  assert.equal(text.includes('fictional-token'), false);
  assert.equal(text.includes('fictional.example'), false);
  assert.deepEqual(Object.keys(receipt).sort(), ['bodySha256', 'keyId', 'mode', 'revision', 'sourceSequence', 'status']);
});

test('disabled and source-frozen handlers do not read secrets or make outbound requests', async () => {
  let secretCalls = 0;
  let outboundCalls = 0;
  const event = { data: { after: snapshotDoc(eventService.id, eventService), before: null }, params: { id: eventService.id } };
  const disabled = await sync.handleScheduleWrite(event, {
    env: {},
    secretProvider: () => { secretCalls += 1; return FIXTURE_SECRET; },
    db: { collection: () => { throw new Error('disabled path read Firestore'); } },
    sendRequest: async () => { outboundCalls += 1; },
  });
  const frozen = await sync.handleReconcile({
    env: { LV_ZION_WORSHIP_SYNC_ENABLED: 'true', LV_ZION_WORSHIP_SYNC_SOURCE_FROZEN: 'true' },
    secretProvider: () => { secretCalls += 1; return FIXTURE_SECRET; },
    db: { collection: () => { throw new Error('frozen path read Firestore'); } },
    sendRequest: async () => { outboundCalls += 1; },
  });
  assert.equal(disabled.status, 'disabled');
  assert.equal(frozen.status, 'source_frozen');
  assert.equal(secretCalls, 0);
  assert.equal(outboundCalls, 0);
});

test('reconcile reads schedule only, emits a deterministic full snapshot, and never writes Sheets', async () => {
  const db = fakeDb([
    snapshotDoc(secondService.id, { ...secondService, conflictOk: { 'Riley Fiction': ['Presider'] }, privateNote: 'omit' }),
    snapshotDoc(eventService.id, { ...eventService, editorOnly: 'omit' }),
  ]);
  const outbound = [];
  const loggerCalls = [];
  const result = await sync.handleReconcile({
    env: {
      LV_ZION_WORSHIP_SYNC_ENABLED: 'true',
      LV_ZION_WORSHIP_SYNC_URL: 'https://fictional.example/sync',
      LV_ZION_WORSHIP_SYNC_KEY_ID: 'test-fixture',
    },
    secret: FIXTURE_SECRET,
    db,
    now: () => 1788172801000,
    sendRequest: async request => {
      outbound.push(request);
      return { status: 200 };
    },
    sleep: async () => {},
    logger: { info: (_message, receipt) => loggerCalls.push(receipt) },
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.partCount, 1);
  assert.equal(outbound.length, 1);
  const payload = JSON.parse(outbound[0].rawBody.toString('utf8'));
  assert.deepEqual(payload.services.map(service => service.id), [eventService.id, secondService.id]);
  assert.equal('conflictOk' in payload.services[0], false);
  assert.equal('privateNote' in payload.services[0], false);
  assert.equal(db.calls.some(call => /settings|members|tokens|sheet/i.test(call)), false);
  assert.equal(db.calls.some(call => call.includes('collection:worshipVercelSync')), true);
  assert.equal(db.calls.some(call => call.includes('collection:app')), false);
  assert.equal(loggerCalls.every(receipt => !JSON.stringify(receipt).includes('Avery Sample')), true);
});

test('event sender includes only the changed service and preserves input data', async () => {
  const beforeData = { ...eventService, assignments: { Presider: 'Avery Sample' } };
  const afterData = { ...eventService, assignments: { Presider: 'Avery Sample', Reader: 'Jordan Example' }, conflictOk: { x: ['y'] }, privateNote: 'omit' };
  const beforeJson = JSON.stringify(afterData);
  const db = fakeDb();
  const outbound = [];
  const result = await sync.handleScheduleWrite({
    id: 'fictional-event-id',
    data: { before: snapshotDoc(eventService.id, beforeData), after: snapshotDoc(eventService.id, afterData) },
    params: { id: eventService.id },
  }, {
    env: {
      LV_ZION_WORSHIP_SYNC_ENABLED: 'true',
      LV_ZION_WORSHIP_SYNC_URL: 'https://fictional.example/sync',
      LV_ZION_WORSHIP_SYNC_KEY_ID: 'test-fixture',
    },
    secret: FIXTURE_SECRET,
    db,
    sendRequest: async request => { outbound.push(request); return { status: 202 }; },
    logger: { info: () => {} },
    timestamp: FIXTURE_TIMESTAMP,
    sleep: async () => {},
  });
  assert.equal(result.status, 'accepted_pending_mapping');
  assert.equal(outbound.length, 1);
  const body = outbound[0].rawBody.toString('utf8');
  assert.equal(body.includes('conflictOk'), false);
  assert.equal(body.includes('privateNote'), false);
  assert.equal(JSON.stringify(afterData), beforeJson);
});

test('replays an accepted event without allocating a new source sequence', async () => {
  const db = fakeDb();
  const outbound = [];
  const event = {
    id: 'stable-fictional-event',
    data: { before: snapshotDoc(eventService.id, eventService), after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const deps = {
    env: {
      LV_ZION_WORSHIP_SYNC_ENABLED: 'true',
      LV_ZION_WORSHIP_SYNC_URL: 'https://fictional.example/sync',
      LV_ZION_WORSHIP_SYNC_KEY_ID: 'test-fixture',
    },
    secret: FIXTURE_SECRET,
    db,
    sendRequest: async request => { outbound.push(request); return { status: 200 }; },
    logger: { info: () => {} },
    timestamp: FIXTURE_TIMESTAMP,
    sleep: async () => {},
  };
  const first = await sync.handleScheduleWrite(event, deps);
  const second = await sync.handleScheduleWrite(event, deps);
  assert.equal(first.status, 'accepted');
  assert.equal(second.status, 'accepted');
  assert.equal(first.sourceSequence, second.sourceSequence);
  assert.equal(outbound.length, 1);
});

test('unknown event outcomes retain the same sequence and exact body for a later replay', async () => {
  const db = fakeDb();
  const event = {
    id: 'unknown-fictional-event',
    data: { before: snapshotDoc(eventService.id, eventService), after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const base = {
    env: {
      LV_ZION_WORSHIP_SYNC_ENABLED: 'true',
      LV_ZION_WORSHIP_SYNC_URL: 'https://fictional.example/sync',
      LV_ZION_WORSHIP_SYNC_KEY_ID: 'test-fixture',
    },
    secret: FIXTURE_SECRET,
    db,
    logger: { info: () => {} },
    sleep: async () => {},
  };
  const firstBodies = [];
  const first = await sync.handleScheduleWrite(event, {
    ...base,
    sendRequest: async request => { firstBodies.push(request.rawBody.toString()); throw new Error('fictional timeout'); },
  });
  const secondBodies = [];
  const second = await sync.handleScheduleWrite(event, {
    ...base,
    sendRequest: async request => { secondBodies.push(request.rawBody.toString()); return { status: 200 }; },
  });
  assert.equal(first.status, 'unknown');
  assert.equal(second.status, 'accepted');
  assert.equal(first.sourceSequence, second.sourceSequence);
  assert.equal(firstBodies[0], secondBodies[0]);
});

test('receiver status classifications are exposed for replay and conflict handling', () => {
  assert.equal(sync.classifyReceiverStatus(200), 'accepted');
  assert.equal(sync.classifyReceiverStatus(202), 'accepted_pending_mapping');
  assert.equal(sync.classifyReceiverStatus(409), 'conflict_or_stale');
  assert.equal(sync.classifyReceiverStatus(400), 'malformed');
  assert.equal(sync.classifyReceiverStatus(413), 'oversized');
});

test('existing onScheduleWrite block remains byte-identical', () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  const start = source.indexOf('/* ---- 1. new-duty alerts ---- */');
  const end = source.indexOf('\n\n/* ---- 2. day-before reminders ---- */');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const blockHash = crypto.createHash('sha256').update(source.slice(start, end)).digest('hex');
  assert.equal(blockHash, '535f67182e87564170e9e6e8b8336b6f9d75c9e13f19c91b7cdf0ac76c71db92');
});

function enabledEnvironment() {
  return {
    LV_ZION_WORSHIP_SYNC_ENABLED: 'true',
    LV_ZION_WORSHIP_SYNC_URL: 'https://fictional.example/sync',
    LV_ZION_WORSHIP_SYNC_KEY_ID: 'test-fixture',
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'current',
  };
}

function senderDependencies(db, sendRequest, extra = {}) {
  return {
    env: enabledEnvironment(),
    secret: FIXTURE_SECRET,
    db,
    sendRequest,
    logger: { info: () => {} },
    sleep: async () => {},
    now: () => 1788172801000,
    timestamp: FIXTURE_TIMESTAMP,
    ...extra,
  };
}

test('private sender state is top-level, malformed state fails closed, and never resets sequence', async () => {
  const db = fakeDb();
  db.store.set('worshipVercelSync/state', { lastAllocatedSequence: 'not-a-sequence' });
  let outbound = 0;
  await assert.rejects(() => sync.handleScheduleWrite({
    id: 'malformed-state-event',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  }, senderDependencies(db, async () => { outbound += 1; return { status: 200 }; })), /invalid private sync state/);
  assert.equal(outbound, 0);
  assert.equal(db.store.get('worshipVercelSync/state').lastAllocatedSequence, 'not-a-sequence');
  assert.equal([...db.store.keys()].some(path => path.includes('/app/')), false);
});

test('private queue keeps member-bearing request bytes in encrypted binary chunks and strips undefined fields', async () => {
  const db = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const result = await sync.handleReconcile(senderDependencies(db, async () => ({ status: 200 })));
  assert.equal(result.status, 'accepted');
  for (const [path, value] of db.store.entries()) {
    if (!path.includes('worshipVercelSync/')) continue;
    const text = JSON.stringify(value);
    assert.equal(text.includes('Avery Sample'), false);
    assert.equal(text.includes('Jordan Example'), false);
    assert.equal(text.includes('rawBody'), false);
    assert.equal(text.includes('undefined'), false);
    assert.equal(Object.values(value).some(item => item === undefined), false);
  }
  const queueValues = [...db.store.entries()]
    .filter(([path]) => path.includes('worshipVercelSync/queue/items/'))
    .map(([, value]) => value);
  assert.equal(queueValues.length, 1);
  assert.equal(typeof queueValues[0].chunkSetId, 'string');
  assert.equal('sealedBody' in queueValues[0], false);
  const chunkValues = [...db.store.entries()]
    .filter(([path]) => path.includes('worshipVercelSync/chunks/sets/'))
    .map(([, value]) => value);
  const encryptedChunk = chunkValues.find(value => Buffer.isBuffer(value.ciphertext));
  assert.equal(Boolean(encryptedChunk), true);
});

test('empty, nonempty, empty generations allocate fresh increasing identities', async () => {
  const scheduleDocs = [];
  const db = fakeDb(scheduleDocs);
  const outbound = [];
  const deps = senderDependencies(db, async request => { outbound.push(JSON.parse(request.rawBody)); return { status: 200 }; });
  const first = await sync.handleReconcile(deps);
  scheduleDocs.push(snapshotDoc(eventService.id, eventService));
  const second = await sync.handleReconcile(deps);
  scheduleDocs.splice(0, scheduleDocs.length);
  const third = await sync.handleReconcile(deps);
  assert.deepEqual([first.sourceSequence, second.sourceSequence, third.sourceSequence], [0, 1, 2]);
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0, 1, 2]);
  assert.deepEqual(outbound.map(payload => payload.snapshotId), ['snap-0', 'snap-1', 'snap-2']);
  assert.deepEqual(outbound.map(payload => payload.services.length), [0, 1, 0]);
});

test('snapshot conflict tombstones the generation and retries with fresh sequence and snapshot ID', async () => {
  const db = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const outbound = [];
  let call = 0;
  const resultOne = await sync.handleReconcile(senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    call += 1;
    return { status: call === 1 ? 409 : 200 };
  }));
  const resultTwo = await sync.handleReconcile(senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  assert.equal(resultOne.status, 'failed_terminal');
  assert.equal(resultTwo.status, 'accepted');
  assert.deepEqual(outbound.map(payload => [payload.sourceSequence, payload.snapshotId]), [[0, 'snap-0'], [1, 'snap-1']]);
  const privateValues = [...db.store.entries()]
    .filter(([path]) => path.includes('worshipVercelSync/snapshots/items/'))
    .map(([, value]) => value);
  assert.equal(privateValues.length, 1);
  assert.equal(privateValues[0].status, 'accepted');
  assert.equal(privateValues[0].snapshotId, 'snap-1');
});

test('snapshot 202 remains accepted_pending_mapping and is not rewritten as accepted', async () => {
  const db = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const outbound = [];
  const deps = senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 202 };
  });
  const first = await sync.handleReconcile(deps);
  const second = await sync.handleReconcile(deps);
  assert.equal(first.status, 'accepted_pending_mapping');
  assert.equal(second.status, 'accepted_pending_mapping');
  assert.equal(outbound.length, 1);
  const revisions = [...db.store.entries()]
    .filter(([path]) => path.includes('worshipVercelSync/revisions/items/'))
    .map(([, value]) => value);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].status, 'accepted_pending_mapping');
});

test('expired staged chunks become terminal and the next reconcile gets a fresh snapshot identity', async () => {
  const db = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const outbound = [];
  const first = await sync.handleReconcile(senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    throw new Error('fictional unknown');
  }));
  assert.equal(first.status, 'unknown');
  const firstExpiry = [...db.store.entries()]
    .find(([path]) => path.includes('worshipVercelSync/chunks/sets/'))[1].expiresAtMs;
  const expired = await sync.handleReconcile(senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }, { now: () => firstExpiry + 1 }));
  assert.equal(expired.status, 'failed_terminal');
  const recovered = await sync.handleReconcile(senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }, { now: () => firstExpiry + 1 }));
  assert.equal(recovered.status, 'accepted');
  assert.deepEqual(outbound.map(payload => payload.snapshotId), ['snap-0', 'snap-0', 'snap-0', 'snap-1']);
});

test('event and event dispatch interleaving cannot overtake a lower in-flight sequence', async () => {
  const db = fakeDb();
  const firstSendStarted = new Promise(resolve => { db.resolveFirstSendStarted = resolve; });
  let releaseFirst;
  const firstMayFinish = new Promise(resolve => { releaseFirst = resolve; });
  const outbound = [];
  const sendRequest = async request => {
    const payload = JSON.parse(request.rawBody);
    outbound.push(payload);
    if (payload.sourceSequence === 0) {
      db.resolveFirstSendStarted();
      await firstMayFinish;
    }
    return { status: 200 };
  };
  const event = sequence => ({
    id: 'interleaving-event-' + sequence,
    data: { before: snapshotDoc(eventService.id, eventService), after: snapshotDoc(eventService.id, {
      ...eventService, sourceUpdatedAt: String(1788172799000 + sequence),
    }) },
    params: { id: eventService.id },
  });
  const first = sync.handleScheduleWrite(event(0), senderDependencies(db, sendRequest));
  await firstSendStarted;
  const second = await sync.handleScheduleWrite(event(1), senderDependencies(db, sendRequest));
  assert.equal(second.status, 'unknown');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0]);
  releaseFirst();
  const firstResult = await first;
  assert.equal(firstResult.status, 'accepted');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0]);
  const third = await sync.handleScheduleWrite(event(1), senderDependencies(db, sendRequest));
  assert.equal(third.status, 'accepted');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0, 1]);
});

test('event and snapshot dispatch interleaving preserves one global order', async () => {
  const db = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const firstSendStarted = new Promise(resolve => { db.resolveFirstSendStarted = resolve; });
  let releaseFirst;
  const firstMayFinish = new Promise(resolve => { releaseFirst = resolve; });
  const outbound = [];
  const sendRequest = async request => {
    const payload = JSON.parse(request.rawBody);
    outbound.push(payload);
    if (payload.mode === 'event') {
      db.resolveFirstSendStarted();
      await firstMayFinish;
    }
    return { status: 200 };
  };
  const eventPromise = sync.handleScheduleWrite({
    id: 'event-before-snapshot',
    data: { before: snapshotDoc(eventService.id, eventService), after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  }, senderDependencies(db, sendRequest));
  await firstSendStarted;
  const snapshotPromise = sync.handleReconcile(senderDependencies(db, sendRequest));
  const snapshotResult = await snapshotPromise;
  assert.equal(snapshotResult.status, 'unknown');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0]);
  releaseFirst();
  const eventResult = await eventPromise;
  assert.equal(eventResult.status, 'accepted');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0]);
  const later = await sync.handleReconcile(senderDependencies(db, sendRequest));
  assert.equal(later.status, 'accepted');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0, 1]);
  assert.equal(outbound[1].mode, 'snapshot_part');
});

test('a live lower lease blocks higher work and an expired lease is safely reclaimed', async () => {
  const db = fakeDb();
  const firstEvent = {
    id: 'crash-recovery-event-0',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const secondEvent = {
    id: 'crash-recovery-event-1',
    data: { before: null, after: snapshotDoc(eventService.id, {
      ...eventService, sourceUpdatedAt: '1788172799001',
    }) },
    params: { id: eventService.id },
  };
  const first = await sync.handleScheduleWrite(firstEvent, senderDependencies(db, async () => {
    throw new Error('fictional crash after claim');
  }));
  assert.equal(first.status, 'unknown');
  const queuePath = [...db.store.keys()].find(path => path.includes('worshipVercelSync/queue/items/'));
  const queue = db.store.get(queuePath);
  queue.status = 'in_flight';
  queue.leaseId = 'crashed-lease';
  queue.leaseExpiresAtMs = 1788172801000 + 1000;
  const blocked = await sync.handleScheduleWrite(secondEvent, senderDependencies(db, async () => {
    throw new Error('must not overtake live lease');
  }));
  assert.equal(blocked.status, 'unknown');
  queue.leaseExpiresAtMs = 0;
  const outbound = [];
  const reclaimed = await sync.handleScheduleWrite(secondEvent, senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  assert.equal(reclaimed.status, 'unknown');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0]);
  const accepted = await sync.handleScheduleWrite(secondEvent, senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  assert.equal(accepted.status, 'accepted');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [0, 1]);
});

test('reconcile references its schedule read before allocating around an intervening event', async () => {
  const db = fakeDb([], {});
  let injected = false;
  const event = {
    id: 'intervening-event',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const eventDeps = senderDependencies(db, async request => ({ status: 200 }));
  db.onScheduleRead = async () => {
    if (injected) return;
    injected = true;
    await sync.handleScheduleWrite(event, eventDeps);
  };
  const outbound = [];
  const result = await sync.handleReconcile(senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  assert.equal(result.status, 'accepted');
  assert.deepEqual(outbound.map(payload => payload.sourceSequence), [1]);
  assert.equal(injected, true);
});

test('rejects every unpaired surrogate and checks member labels across the full snapshot', () => {
  const high = '\ud800';
  const low = '\udfff';
  assert.throws(() => sync.serviceFromSchedule({ ...eventService, serviceLabel: high }), /unpaired surrogate/);
  assert.throws(() => sync.serviceFromSchedule({ ...eventService, assignments: [{ dutyLabel: low, memberLabel: 'Fictional Member' }] }), /unpaired surrogate/);
  const crossService = { ...secondService, id: 'avery-sample' };
  assert.throws(() => sync.projectSchedule([eventService, crossService]), /member label/);
  assert.throws(() => sync.buildSnapshotParts([eventService], {
    sequence: 1, generatedAt: '1788172801000', snapshotId: 'avery-sample',
  }), /member label/);
});

test('installed Firebase SDK exposes event and scheduler lifecycle limits', () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  const functions = require('../index.js');
  assert.match(source, /WORSHIP_SYNC_EVENT_TIMEOUT_SECONDS = 540/);
  assert.equal(Number(functions.onVercelScheduleWrite.__endpoint.timeoutSeconds), 540);
  assert.equal(Number(functions.worshipVercelReconcile.__endpoint.timeoutSeconds), 1800);
  assert.equal(functions.onVercelScheduleWrite.__endpoint.eventTrigger.eventFilterPathPatterns.document, 'schedule/{id}');
  assert.equal(functions.worshipVercelReconcile.__endpoint.scheduleTrigger.schedule, 'every 15 minutes');
});

test('stages a near-limit body as bounded binary chunks and keeps allocation compact', async () => {
  const db = fakeDb();
  const rawBody = Buffer.from(JSON.stringify({
    padding: 'a'.repeat(sync.MAX_BODY_BYTES - 32),
  }), 'utf8');
  assert.equal(rawBody.length <= sync.MAX_BODY_BYTES, true);
  assert.equal(rawBody.length > sync.MAX_BODY_BYTES - 1024, true);
  assert.equal(typeof JSON.parse(rawBody.toString('utf8')).padding, 'string');
  const bodySha256 = sync.sha256Hex(rawBody);
  const keyring = sync.syncConfig(enabledEnvironment(), FIXTURE_SECRET).keyring;
  const entry = await sync.reserveRevision(db, 'near-limit-fictional-body', () => ({ rawBody, bodySha256 }), {
    mode: 'event', operation: 'upsert', generatedAt: FIXTURE_TIMESTAMP,
    serviceCount: 0, correctionFingerprint: bodySha256, keyVersion: 'test-fixture',
    keyring, nowMs: 1788172801000,
  });
  assert.equal(entry.bodySha256, bodySha256);
  assert.equal(entry.chunkManifests[0].chunkCount > 1, true);
  assert.equal(db.stats.maxDocumentBytes < 1024 * 1024, true);
  assert.equal(db.stats.batchWrites.length >= 1, true);
  assert.equal(db.stats.batchWrites.every(batch => batch.count <= sync.CHUNK_BATCH_MAX_WRITES), true);
  assert.equal(db.stats.batchWrites.every(batch => batch.bytes <= sync.CHUNK_BATCH_MAX_BYTES), true);
  assert.equal(db.stats.transactionBatches.some(batch => batch.count <= 500 && batch.bytes < 10 * 1024 * 1024), true);
});

test('stages and dispatches the maximum forty-part snapshot within Firestore limits', async () => {
  const scheduleDocs = Array.from({ length: 2000 }, (_, index) => snapshotDoc('svc-' + index, {
    ...secondService,
    id: 'svc-' + index,
    assignments: [],
  }));
  const db = fakeDb(scheduleDocs);
  let sends = 0;
  const result = await sync.handleReconcile(senderDependencies(db, async request => {
    sends += 1;
    assert.equal(Buffer.isBuffer(request.rawBody), true);
    return { status: 200 };
  }));
  assert.equal(result.status, 'accepted');
  assert.equal(result.partCount, 40);
  assert.equal(sends, 40);
  assert.equal(db.stats.batchWrites.every(batch => batch.count <= sync.CHUNK_BATCH_MAX_WRITES), true);
  assert.equal(db.stats.batchWrites.every(batch => batch.bytes <= sync.CHUNK_BATCH_MAX_BYTES), true);
  assert.equal(db.stats.transactionBatches.every(batch => batch.count <= 500), true);
  assert.equal(sync.requiredDispatchBudget(40), 1205000);
  assert.equal(sync.requiredDispatchBudget(40) < sync.STAGING_TTL_MS, true);
});

test('defers event and snapshot work when the remaining invocation budget cannot finish it', async () => {
  const db = fakeDb();
  let sends = 0;
  const event = {
    id: 'deadline-fictional-event',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const eventResult = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }, { invocationStartedAtMs: 1788172801000, invocationBudgetMs: 1000 }));
  assert.equal(eventResult.status, 'deferred_insufficient_budget');
  assert.equal(sends, 0);

  const snapshotDb = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const snapshotResult = await sync.handleReconcile(senderDependencies(snapshotDb, async () => {
    sends += 1;
    return { status: 200 };
  }, { invocationStartedAtMs: 1788172800000, invocationBudgetMs: 1000 }));
  assert.equal(snapshotResult.status, 'deferred_insufficient_budget');
  assert.equal(sends, 0);
});

test('lease mismatch has no side effects and a reclaimed lease preserves last dispatched sequence', async () => {
  const db = fakeDb();
  const firstEvent = {
    id: 'lease-fictional-event-0',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const first = await sync.handleScheduleWrite(firstEvent, senderDependencies(db, async () => {
    throw new Error('fictional unknown');
  }));
  assert.equal(first.status, 'unknown');
  const queuePath = [...db.store.keys()].find(path => path.includes('worshipVercelSync/queue/items/'));
  const queue = db.store.get(queuePath);
  const queueId = queuePath.split('/').pop();
  queue.status = 'in_flight';
  queue.leaseId = 'lease-a';
  queue.leaseExpiresAtMs = 1788172801000 + 1000;
  const claimedA = { ...queue, id: queueId, leaseId: 'lease-a' };
  const claimedB = { ...queue, id: queueId, leaseId: 'lease-b' };
  queue.leaseId = 'lease-b';
  const beforeState = JSON.stringify(db.store.get('worshipVercelSync/state'));
  const lateA = await sync.finalizeQueueItem(db, claimedA, { kind: 'accepted', status: 200, attempts: 1 }, 1788172801000);
  assert.equal(lateA.applied, false);
  assert.equal(JSON.stringify(db.store.get('worshipVercelSync/state')), beforeState);
  const acceptedB = await sync.finalizeQueueItem(db, claimedB, { kind: 'accepted', status: 200, attempts: 1 }, 1788172801000);
  assert.equal(acceptedB.applied, true);
  assert.equal(db.store.get('worshipVercelSync/state').lastDispatchedSequence, 0);

  const secondEvent = {
    id: 'lease-fictional-event-1',
    data: { before: null, after: snapshotDoc(eventService.id, { ...eventService, sourceUpdatedAt: '1788172799001' }) },
    params: { id: eventService.id },
  };
  await sync.handleScheduleWrite(secondEvent, senderDependencies(db, async () => ({ status: 200 })));
  assert.equal(db.store.get('worshipVercelSync/state').lastDispatchedSequence, 1);
  const lateAfterB = await sync.finalizeQueueItem(db, claimedA, { kind: 'accepted', status: 200, attempts: 99 }, 1788172801000);
  assert.equal(lateAfterB.applied, false);
  assert.equal(db.store.get('worshipVercelSync/state').lastDispatchedSequence, 1);
});

test('terminal receiver outcomes replay exactly until the correction or managed key version changes', async () => {
  for (const terminalStatus of [400, 413]) {
    const db = fakeDb();
    let sends = 0;
    const event = {
      id: 'terminal-fictional-' + terminalStatus,
      data: { before: null, after: snapshotDoc(eventService.id, eventService) },
      params: { id: eventService.id },
    };
    const deps = senderDependencies(db, async () => { sends += 1; return { status: terminalStatus }; });
    const first = await sync.handleScheduleWrite(event, deps);
    const second = await sync.handleScheduleWrite(event, deps);
    assert.equal(first.status, 'failed_terminal');
    assert.equal(second.status, 'failed_terminal');
    assert.equal(sends, 1);
    const corrected = { ...event, data: { before: null, after: snapshotDoc(eventService.id, {
      ...eventService, sourceUpdatedAt: '1788172799001',
    }) } };
    const recovered = await sync.handleScheduleWrite(corrected, senderDependencies(db, async () => {
      sends += 1;
      return { status: 200 };
    }));
    assert.equal(recovered.status, 'accepted');
    assert.equal(sends, 2);
  }

  const db = fakeDb();
  let sends = 0;
  const event = {
    id: 'unauthorized-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const first = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 401 };
  }));
  const second = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 401 };
  }));
  assert.equal(first.status, 'failed_terminal');
  assert.equal(second.status, 'failed_terminal');
  assert.equal(sends, 1);
  const rotatedEnv = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'test-fixture',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
  };
  const rotated = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }, {
    env: rotatedEnv,
    secret: { current: FIXTURE_SECRET, previous: FIXTURE_SECRET },
  }));
  assert.equal(rotated.status, 'accepted');
  assert.equal(sends, 2);
});

test('terminal corrections remain gated after unrelated allocation advances', async () => {
  const db = fakeDb();
  const firstEvent = {
    id: 'terminal-gate-fictional-400',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const secondEvent = {
    id: 'terminal-gate-fictional-unrelated',
    data: { before: null, after: snapshotDoc(secondService.id, secondService) },
    params: { id: secondService.id },
  };
  const outbound = [];
  const first = await sync.handleScheduleWrite(firstEvent, senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 400 };
  }));
  const unrelated = await sync.handleScheduleWrite(secondEvent, senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  const replay = await sync.handleScheduleWrite(firstEvent, senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  assert.equal(first.status, 'failed_terminal');
  assert.equal(first.sourceSequence, 0);
  assert.equal(unrelated.status, 'accepted');
  assert.equal(unrelated.sourceSequence, 1);
  assert.equal(replay.status, 'failed_terminal');
  assert.equal(replay.sourceSequence, 0);
  assert.equal(outbound.length, 2);

  const scheduleDocs = [snapshotDoc(eventService.id, eventService)];
  const snapshotDb = fakeDb(scheduleDocs);
  const snapshotOutbound = [];
  const snapshotFirst = await sync.handleReconcile(senderDependencies(snapshotDb, async request => {
    snapshotOutbound.push(JSON.parse(request.rawBody));
    return { status: 400 };
  }));
  const snapshotUnrelated = await sync.handleScheduleWrite(secondEvent, senderDependencies(snapshotDb, async request => {
    snapshotOutbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  const snapshotReplay = await sync.handleReconcile(senderDependencies(snapshotDb, async request => {
    snapshotOutbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  assert.equal(snapshotFirst.status, 'failed_terminal');
  assert.equal(snapshotFirst.sourceSequence, 0);
  assert.equal(snapshotUnrelated.sourceSequence, 1);
  assert.equal(snapshotReplay.status, 'failed_terminal');
  assert.equal(snapshotReplay.sourceSequence, 0);
  assert.equal(snapshotOutbound.length, 2);
});

test('duplicate unchanged event conflict remains the same terminal identity', async () => {
  const db = fakeDb();
  const event = {
    id: 'duplicate-conflict-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  let sends = 0;
  const first = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 409 };
  }));
  const replay = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }));
  assert.equal(first.status, 'failed_terminal');
  assert.equal(replay.status, 'failed_terminal');
  assert.equal(first.sourceSequence, 0);
  assert.equal(replay.sourceSequence, 0);
  assert.equal(sends, 1);
  assert.equal(db.store.get('worshipVercelSync/state').lastAllocatedSequence, 0);
});

test('changed multipart snapshots wait behind an unresolved lower generation', async () => {
  const scheduleDocs = Array.from({ length: 2000 }, (_, index) => snapshotDoc('svc-' + index, {
    ...secondService,
    id: 'svc-' + index,
    assignments: [],
  }));
  const db = fakeDb(scheduleDocs);
  let sends = 0;
  const first = await sync.handleReconcile(senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }, { invocationStartedAtMs: 1788172801000, invocationBudgetMs: 1000 }));
  assert.equal(first.status, 'deferred_insufficient_budget');
  assert.equal(sends, 0);
  scheduleDocs[0] = snapshotDoc('svc-0', {
    ...secondService,
    id: 'svc-0',
    serviceLabel: 'Changed Fictional Service',
    assignments: [],
  });
  const outbound = [];
  const drained = await sync.handleReconcile(senderDependencies(db, async request => {
    const payload = JSON.parse(request.rawBody);
    outbound.push(payload);
    return { status: 200 };
  }));
  assert.equal(drained.status, 'accepted');
  assert.equal(drained.sourceSequence, 0);
  assert.equal(outbound.length, 40);
  const changed = await sync.handleReconcile(senderDependencies(db, async request => {
    outbound.push(JSON.parse(request.rawBody));
    return { status: 200 };
  }));
  assert.equal(changed.status, 'accepted');
  assert.equal(changed.sourceSequence, 1);
  assert.equal(outbound.length, 80);
  assert.deepEqual(outbound.slice(0, 40).map(payload => payload.sourceSequence), Array(40).fill(0));
  assert.deepEqual(outbound.slice(40).map(payload => payload.sourceSequence), Array(40).fill(1));
});

test('private nested chunk manifests reject unexpected fields before outbound work', async () => {
  const db = fakeDb();
  const event = {
    id: 'nested-manifest-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    throw new Error('fictional unknown');
  }));
  const revisionPath = [...db.store.keys()]
    .find(path => path.includes('worshipVercelSync/revisions/items/'));
  db.store.get(revisionPath).chunkManifests[0].unexpected = 'fictional';
  let outbound = 0;
  await assert.rejects(() => sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    outbound += 1;
    return { status: 200 };
  })), /invalid private revision state/);
  assert.equal(outbound, 0);
});

test('reconcile removes expired chunks from resolved revisions with bounded cleanup', async () => {
  const db = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const first = await sync.handleReconcile(senderDependencies(db, async () => ({ status: 200 })));
  assert.equal(first.status, 'accepted');
  const chunkPath = [...db.store.keys()]
    .find(path => path.includes('worshipVercelSync/chunks/sets/') && path.includes('/items/'));
  const expiry = db.store.get(chunkPath).expiresAtMs;
  const beforeCount = [...db.store.keys()]
    .filter(path => path.includes('worshipVercelSync/chunks/sets/')).length;
  assert.equal(beforeCount > 0, true);
  const cleanup = await sync.handleReconcile(senderDependencies(db, async () => {
    throw new Error('resolved revision must not send');
  }, { now: () => expiry + 1 }));
  assert.equal(cleanup.status, 'accepted');
  assert.equal([...db.store.keys()]
    .some(path => path.includes('worshipVercelSync/chunks/sets/') && path.includes('/items/')), false);
  const replay = await sync.handleReconcile(senderDependencies(db, async () => {
    throw new Error('cleaned resolved revision must not send');
  }, { now: () => expiry + 1 }));
  assert.equal(replay.status, 'accepted');
});

test('bounded cleanup makes monotonic progress across 105 expired resolved revisions', async () => {
  const db = fakeDb();
  const now = 1788172801000;
  for (let index = 0; index < 105; index += 1) {
    const service = {
      ...secondService,
      id: 'cleanup-svc-' + String(index),
      assignments: [],
    };
    const event = {
      id: 'cleanup-event-' + String(index),
      data: { before: null, after: snapshotDoc(service.id, service) },
      params: { id: service.id },
    };
    const result = await sync.handleScheduleWrite(event, senderDependencies(db, async () => ({ status: 200 })));
    assert.equal(result.status, 'accepted');
  }
  const expiredAt = now + sync.STAGING_TTL_MS + 1;
  const first = await sync.cleanupExpiredResolvedChunks(db, expiredAt);
  assert.equal(first.sets, 100);
  assert.equal(first.bounded, true);
  const emptyMarkers = [...db.store.entries()]
    .filter(([path, value]) => path.includes('worshipVercelSync/chunks/sets/') && value.status === 'empty')
    .map(([path]) => path.split('/').pop());
  assert.equal(emptyMarkers.length, 100);
  const callsBeforeSecond = db.calls.length;
  const second = await sync.cleanupExpiredResolvedChunks(db, expiredAt);
  assert.equal(second.sets, 5);
  assert.equal(second.bounded, false);
  assert.equal([...db.store.entries()]
    .filter(([path, value]) => path.includes('worshipVercelSync/chunks/sets/') && value.status === 'empty')
    .length, 105);
  const secondCalls = db.calls.slice(callsBeforeSecond);
  for (const markerId of emptyMarkers) {
    assert.equal(secondCalls.some(call => call.includes('/' + markerId + '/items')), false);
  }
});

test('expired staged marker-only and partial crash remnants are deleted with exact cleanup output', async () => {
  const db = fakeDb();
  const now = 3000;
  const sets = db.collection('worshipVercelSync').doc('chunks').collection('sets');
  await sets.doc('staged-marker-only').set({
    version: 1,
    chunkSetId: 'staged-marker-only',
    status: 'staged',
    revision: null,
    createdAtMs: 1000,
    expiresAtMs: 2000,
  });
  await sets.doc('staged-partial').set({
    version: 1,
    chunkSetId: 'staged-partial',
    status: 'staged',
    revision: null,
    createdAtMs: 1000,
    expiresAtMs: 2000,
  });
  await sets.doc('staged-partial').collection('items').doc('000000').set({
    version: 1,
    chunkSetId: 'staged-partial',
    chunkIndex: 0,
    chunkCount: 1,
    plaintextLength: 3,
    bodySha256: 'a'.repeat(64),
    keyVersion: 'v1',
    iv: Buffer.alloc(12),
    tag: Buffer.alloc(16),
    ciphertext: Buffer.from('abc'),
    createdAtMs: 1000,
    expiresAtMs: 2000,
  });

  const result = await sync.cleanupExpiredResolvedChunks(db, now);
  assert.deepEqual(result, { sets: 2, chunks: 1, bounded: false });
  assert.equal(db.store.has('worshipVercelSync/chunks/sets/staged-marker-only'), false);
  assert.equal(db.store.has('worshipVercelSync/chunks/sets/staged-partial'), false);
  assert.equal(db.store.has('worshipVercelSync/chunks/sets/staged-partial/items/000000'), false);
  assert.deepEqual(await sync.cleanupExpiredResolvedChunks(db, now), {
    sets: 0, chunks: 0, bounded: false,
  });
});

test('expired resolved marker cleanup preserves a schema-valid empty marker', async () => {
  const db = fakeDb();
  const marker = {
    version: 1,
    chunkSetId: 'resolved-empty-marker',
    status: 'resolved',
    revision: 'revision-hash',
    createdAtMs: 1000,
    expiresAtMs: 2000,
  };
  await db.collection('worshipVercelSync').doc('chunks').collection('sets')
    .doc(marker.chunkSetId).set(marker);
  const result = await sync.cleanupExpiredResolvedChunks(db, 3000);
  assert.deepEqual(result, { sets: 1, chunks: 0, bounded: false });
  assert.deepEqual(db.store.get(
    'worshipVercelSync/chunks/sets/' + marker.chunkSetId,
  ), { ...marker, status: 'empty' });
});

test('eligible marker cleanup query has the registered collection-scope composite index', () => {
  const root = path.resolve(__dirname, '../..');
  const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  assert.equal(firebase.firestore.indexes, 'firestore.indexes.json');
  const indexes = JSON.parse(fs.readFileSync(path.join(root, firebase.firestore.indexes), 'utf8'));
  assert.deepEqual(indexes.indexes, [{
    collectionGroup: 'sets',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'expiresAtMs', order: 'ASCENDING' },
    ],
  }]);
  const source = fs.readFileSync(path.join(__dirname, '../worship-sync.js'), 'utf8');
  assert.match(source, /collection\('sets'\)[\s\S]*?where\('status', '==', status\)/);
  assert.match(source, /where\('expiresAtMs', '<=', nowMs\)[\s\S]*?orderBy\('expiresAtMs'\)/);
});

test('pending queue decrypts after signing key rotation through the previous managed key', async () => {
  const db = fakeDb();
  const event = {
    id: 'rotation-fictional-event',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const firstBodies = [];
  const first = await sync.handleScheduleWrite(event, senderDependencies(db, async request => {
    firstBodies.push(request.rawBody.toString());
    throw new Error('fictional unknown');
  }));
  assert.equal(first.status, 'unknown');
  const rotatedEnv = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'test-fixture',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
  };
  const secondBodies = [];
  const second = await sync.handleScheduleWrite(event, senderDependencies(db, async request => {
    secondBodies.push(request.rawBody.toString());
    return { status: 200 };
  }, {
    env: rotatedEnv,
    secret: { current: FIXTURE_SECRET, previous: { version: 'test-fixture', value: FIXTURE_SECRET } },
  }));
  assert.equal(second.status, 'accepted');
  assert.equal(firstBodies[0], secondBodies[0]);
});

test('previous secret requires an explicit version and v1 resolves the rotated keyring', async () => {
  const rotatedEnv = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
  };
  const missingVersion = sync.syncConfig(rotatedEnv, {
    current: 'fictional-current-v2',
    previous: 'fictional-previous-v1',
  });
  assert.equal(missingVersion.keyring.error,
    'previous key version is required in rotating mode');
  const db = fakeDb();
  const event = {
    id: 'rotation-version-required-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  let sends = 0;
  const rejected = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }, {
    env: rotatedEnv,
    secret: { current: 'fictional-current-v2', previous: 'fictional-previous-v1' },
  }));
  assert.equal(rejected.status, 'configuration_missing');
  assert.equal(sends, 0);
  const validEnv = {
    ...rotatedEnv,
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'v1',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
  };
  const valid = sync.syncConfig(validEnv, {
    current: 'fictional-current-v2',
    previous: 'fictional-previous-v1',
  }, ROTATION_ACTIVATED_AT_MS + sync.PREVIOUS_KEY_OVERLAP_MS - 1);
  assert.equal(valid.keyring.error, '');
  assert.equal(valid.keyring.current.version, 'v2');
  assert.equal(valid.keyring.keys.v2, 'fictional-current-v2');
  assert.equal(valid.keyring.keys.v1, 'fictional-previous-v1');
});

test('previous key overlap accepts one millisecond before expiry and rejects at expiry', () => {
  const env = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'v1',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
  };
  const secrets = { current: 'fictional-current-v2', previous: 'fictional-previous-v1' };
  const beforeExpiry = sync.syncConfig(env, secrets,
    ROTATION_ACTIVATED_AT_MS + sync.PREVIOUS_KEY_OVERLAP_MS - 1);
  assert.equal(beforeExpiry.keyring.error, '');
  assert.equal(beforeExpiry.keyring.keys.v1, 'fictional-previous-v1');
  const atExpiry = sync.syncConfig(env, secrets,
    ROTATION_ACTIVATED_AT_MS + sync.PREVIOUS_KEY_OVERLAP_MS);
  assert.equal(atExpiry.keyring.error, '');
  assert.equal(atExpiry.keyring.keys.v1, undefined);
  assert.equal(atExpiry.keyring.keys.v2, 'fictional-current-v2');

  const currentOnlyAtExpiry = sync.syncConfig(env, { current: 'fictional-current-v2' },
    ROTATION_ACTIVATED_AT_MS + sync.PREVIOUS_KEY_OVERLAP_MS);
  assert.equal(currentOnlyAtExpiry.keyring.error, '');
  assert.equal(currentOnlyAtExpiry.keyring.keys.v1, undefined);
  assert.equal(currentOnlyAtExpiry.keyring.keys.v2, 'fictional-current-v2');
});

test('rotating mode missing metadata does not read managed secrets or touch sender state', async () => {
  const env = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
  };
  const db = fakeDb();
  const event = {
    id: 'rotating-metadata-before-secret-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  let secretReads = 0;
  let sends = 0;
  const result = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }, {
    env,
    secretProvider: () => {
      secretReads += 1;
      return { current: 'fictional-current-v2', previous: 'fictional-previous-v1' };
    },
    now: () => ROTATION_ACTIVATED_AT_MS,
  }));
  assert.equal(result.status, 'configuration_missing');
  assert.equal(secretReads, 0);
  assert.equal(sends, 0);
  assert.equal(db.store.size, 0);
  assert.equal(db.calls.length, 0);
  assert.equal([...db.store.values()].some(value => value && value.status === 'in_flight'), false);
});

test('current mode reads only the active managed secret and ignores inactive previous material', async () => {
  const env = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'bad/version',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: 'not-a-clock',
  };
  const managed = {
    current: 'fictional-current-v2',
    get previous() {
      throw new Error('inactive previous secret must not be read');
    },
  };
  const db = fakeDb();
  const event = {
    id: 'current-mode-secret-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  let currentReads = 0;
  let sends = 0;
  const result = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }, {
    env,
    secretProvider: mode => {
      assert.equal(mode, 'current');
      currentReads += 1;
      return { current: managed.current, previous: undefined };
    },
  }));
  assert.equal(result.status, 'accepted');
  assert.equal(currentReads, 1);
  assert.equal(sends, 1);
  assert.equal(db.store.size > 0, true);
});

test('rotating mode missing previous secret stops event and reconcile before DB work', async () => {
  const env = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'v1',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
  };
  const event = {
    id: 'rotating-missing-previous-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const eventDb = fakeDb();
  let eventSecretProviderCalls = 0;
  let eventSends = 0;
  const eventResult = await sync.handleScheduleWrite(event, senderDependencies(eventDb, async () => {
    eventSends += 1;
    return { status: 200 };
  }, {
    env,
    secretProvider: () => {
      eventSecretProviderCalls += 1;
      return { current: 'fictional-current-v2', previous: '' };
    },
    now: () => ROTATION_ACTIVATED_AT_MS,
  }));
  assert.equal(eventResult.status, 'configuration_missing');
  assert.equal(eventSecretProviderCalls, 1);
  assert.equal(eventSends, 0);
  assert.equal(eventDb.store.size, 0);
  assert.equal(eventDb.calls.length, 0);
  assert.equal([...eventDb.store.values()].some(value => value && value.status === 'in_flight'), false);

  const pendingDb = fakeDb([snapshotDoc(eventService.id, eventService)]);
  const pending = await sync.handleScheduleWrite(event, senderDependencies(pendingDb, async () => {
    throw new Error('fictional unknown');
  }));
  assert.equal(pending.status, 'unknown');
  const storeSizeBefore = pendingDb.store.size;
  const callsBefore = pendingDb.calls.length;
  let reconcileSecretProviderCalls = 0;
  let reconcileSends = 0;
  const reconcileResult = await sync.handleReconcile(senderDependencies(pendingDb, async () => {
    reconcileSends += 1;
    return { status: 200 };
  }, {
    env,
    secretProvider: () => {
      reconcileSecretProviderCalls += 1;
      return { current: 'fictional-current-v2', previous: '' };
    },
    now: () => ROTATION_ACTIVATED_AT_MS,
  }));
  assert.equal(reconcileResult.status, 'configuration_missing');
  assert.equal(reconcileSecretProviderCalls, 1);
  assert.equal(reconcileSends, 0);
  assert.equal(pendingDb.store.size, storeSizeBefore);
  assert.equal(pendingDb.calls.length, callsBefore);
  assert.equal([...pendingDb.store.values()].some(value => value && value.status === 'in_flight'), false);
});

test('same current and previous key versions fail closed before queue or send work', async () => {
  const env = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v1',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'v1',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
  };
  const db = fakeDb();
  const event = {
    id: 'same-key-version-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  let sends = 0;
  let secretProviderCalls = 0;
  const result = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    sends += 1;
    return { status: 200 };
  }, {
    env,
    secretProvider: () => {
      secretProviderCalls += 1;
      return { current: 'fictional-current-v1', previous: 'fictional-previous-v1' };
    },
    now: () => ROTATION_ACTIVATED_AT_MS,
  }));
  assert.equal(result.status, 'configuration_missing');
  assert.equal(secretProviderCalls, 0);
  assert.equal(sends, 0);
  assert.equal(db.store.size, 0);
  assert.equal(db.calls.length, 0);
  assert.equal([...db.store.values()].some(value => value && value.status === 'in_flight'), false);
});

test('prototype-like key IDs remain valid own key values', async () => {
  const currentEnv = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEY_ID: '__proto__',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: '__proto__',
  };
  const current = sync.syncConfig(currentEnv, 'fictional-current-proto', ROTATION_ACTIVATED_AT_MS);
  assert.equal(current.keyring.error, '');
  assert.equal(Object.prototype.hasOwnProperty.call(current.keyring.keys, '__proto__'), true);
  assert.equal(current.keyring.keys.__proto__, 'fictional-current-proto');

  const previousEnv = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: '__proto__',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
  };
  const previous = sync.syncConfig(previousEnv, {
    current: 'fictional-current-v2',
    previous: 'fictional-previous-proto',
  }, ROTATION_ACTIVATED_AT_MS);
  assert.equal(previous.keyring.error, '');
  assert.equal(Object.prototype.hasOwnProperty.call(previous.keyring.keys, '__proto__'), true);
  assert.equal(previous.keyring.keys.__proto__, 'fictional-previous-proto');

  const db = fakeDb();
  const event = {
    id: 'proto-key-id-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  const result = await sync.handleScheduleWrite(event, senderDependencies(db, async () => ({ status: 200 }), {
    env: currentEnv,
    secret: 'fictional-current-proto',
    now: () => ROTATION_ACTIVATED_AT_MS,
  }));
  assert.equal(result.status, 'accepted');
  const queueStatuses = [...db.store.entries()]
    .filter(([path]) => path.includes('worshipVercelSync/queue/items/'))
    .map(([, value]) => value.status);
  assert.deepEqual(queueStatuses, ['accepted']);
});

test('missing or malformed overlap metadata fails closed before database or send work', async () => {
  const baseEnv = {
    ...enabledEnvironment(),
    LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'rotating',
    LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'v2',
    LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'v1',
  };
  const event = {
    id: 'rotation-metadata-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  for (const [label, env] of [
    ['missing', baseEnv],
    ['malformed', { ...baseEnv, LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: 'not-a-clock' }],
    ['future', { ...baseEnv, LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS + 1) }],
    ['invalid current version', {
      ...baseEnv,
      LV_ZION_WORSHIP_SYNC_KEY_VERSION: 'bad/version',
      LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
    }],
    ['invalid previous version', {
      ...baseEnv,
      LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: 'bad/version',
      LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
    }],
    ['empty previous version', {
      ...baseEnv,
      LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_VERSION: '',
      LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
    }],
    ['empty activation metadata', {
      ...baseEnv,
      LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: '',
    }],
    ['invalid keyring mode', {
      ...baseEnv,
      LV_ZION_WORSHIP_SYNC_KEYRING_MODE: 'unexpected',
      LV_ZION_WORSHIP_SYNC_PREVIOUS_KEY_ACTIVATED_AT_MS: String(ROTATION_ACTIVATED_AT_MS),
    }],
  ]) {
    const db = fakeDb();
    let sends = 0;
    let secretProviderCalls = 0;
    const result = await sync.handleScheduleWrite(event, senderDependencies(db, async () => {
      sends += 1;
      return { status: 200 };
    }, {
      env,
      secretProvider: () => {
        secretProviderCalls += 1;
        return { current: 'fictional-current-v2', previous: 'fictional-previous-v1' };
      },
      now: () => ROTATION_ACTIVATED_AT_MS,
    }));
    assert.equal(result.status, 'configuration_missing', label);
    assert.equal(secretProviderCalls, 0, label);
    assert.equal(sends, 0, label);
    assert.equal(db.store.size, 0, label);
    assert.equal(db.calls.length, 0, label);
    assert.equal([...db.store.values()].some(value => value && value.status === 'in_flight'), false, label);
  }
});

test('malformed private queue, chunk, revision, index, and lease state fails closed', async () => {
  const db = fakeDb();
  const event = {
    id: 'malformed-queue-fictional',
    data: { before: null, after: snapshotDoc(eventService.id, eventService) },
    params: { id: eventService.id },
  };
  await sync.handleScheduleWrite(event, senderDependencies(db, async () => { throw new Error('fictional unknown'); }));
  const queuePath = [...db.store.keys()].find(path => path.includes('worshipVercelSync/queue/items/'));
  db.store.get(queuePath).attempts = 'bad';
  await assert.rejects(() => sync.handleScheduleWrite(event, senderDependencies(db, async () => {
    throw new Error('must not send');
  })), /invalid private queue state/);

  const chunkDb = fakeDb();
  await sync.handleScheduleWrite(event, senderDependencies(chunkDb, async () => { throw new Error('fictional unknown'); }));
  const chunkPath = [...chunkDb.store.keys()]
    .find(path => path.includes('worshipVercelSync/chunks/sets/') && path.includes('/items/'));
  chunkDb.store.get(chunkPath).ciphertext = Buffer.from('tampered');
  await assert.rejects(() => sync.handleScheduleWrite(event, senderDependencies(chunkDb, async () => {
    throw new Error('must not send');
  })), /invalid private chunk state/);

  const revisionDb = fakeDb();
  await sync.handleScheduleWrite(event, senderDependencies(revisionDb, async () => { throw new Error('fictional unknown'); }));
  const revisionPath = [...revisionDb.store.keys()].find(path => path.includes('worshipVercelSync/revisions/items/'));
  revisionDb.store.get(revisionPath).lastStatus = 'bad';
  await assert.rejects(() => sync.handleScheduleWrite(event, senderDependencies(revisionDb, async () => {
    throw new Error('must not send');
  })), /invalid private revision state/);

  const snapshotDb = fakeDb([snapshotDoc(eventService.id, eventService)]);
  await sync.handleReconcile(senderDependencies(snapshotDb, async () => { throw new Error('fictional unknown'); }));
  const indexPath = [...snapshotDb.store.keys()].find(path => path.includes('worshipVercelSync/snapshots/items/'));
  snapshotDb.store.get(indexPath).attempts = 'bad';
  await assert.rejects(() => sync.handleReconcile(senderDependencies(snapshotDb, async () => {
    throw new Error('must not send');
  })), /invalid private snapshot index/);

  const leaseDb = fakeDb();
  leaseDb.store.set('worshipVercelSync/leases/items/reconcile', { leaseId: 'bad' });
  await assert.rejects(() => sync.handleReconcile(senderDependencies(leaseDb, async () => {
    throw new Error('must not send');
  })), /invalid private reconcile lease/);
});
