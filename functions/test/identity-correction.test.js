'use strict';

const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../identity-lib');
const runner = require('../scripts/correct-member-identity.cjs');

const OLD = 'Fictional Old';
const NEW = 'Fictional New';
const OTHER = 'Fictional Other';

function copy(value) {
  return value === undefined ? value : structuredClone(value);
}

class FakeSnapshot {
  constructor(ref, entry) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = !!entry;
    this._entry = entry ? { data: copy(entry.data), updateTime: copy(entry.updateTime) } : null;
    this.updateTime = this._entry ? copy(this._entry.updateTime) : undefined;
  }

  data() {
    return this._entry ? copy(this._entry.data) : undefined;
  }
}

class FakeDocumentReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').at(-1);
  }

  collection(name) {
    return new FakeCollection(this.db, this.path + '/' + name);
  }

  async get() {
    return this.db._snapshot(this);
  }

  async set(value, options) {
    this.db._write(this.path, value, options);
  }

  async delete() {
    this.db._delete(this.path);
  }
}

class FakeQuery {
  constructor(db, path, filters, ordering, limitCount) {
    this.db = db;
    this.path = path;
    this.filters = filters || [];
    this.ordering = ordering || [];
    this.limitCount = limitCount;
  }

  where(field, operator, value) {
    return new FakeQuery(this.db, this.path,
      this.filters.concat([{ field, operator, value }]), this.ordering, this.limitCount);
  }

  orderBy(field, direction) {
    return new FakeQuery(this.db, this.path, this.filters,
      this.ordering.concat([{ field, direction: direction || 'asc' }]), this.limitCount);
  }

  limit(count) {
    return new FakeQuery(this.db, this.path, this.filters, this.ordering, count);
  }

  async get() {
    let entries = this.db._list(this.path);
    entries = entries.filter(entry => this.filters.every(filter => {
      const actual = entry.data && entry.data[filter.field];
      if (filter.operator === '==') return actual === filter.value;
      if (filter.operator === '>=') return actual >= filter.value;
      if (filter.operator === '<') return actual < filter.value;
      throw new Error('unsupported fictional query operator');
    }));
    for (let index = this.ordering.length - 1; index >= 0; index--) {
      const order = this.ordering[index];
      entries.sort((left, right) => {
        const a = left.data && left.data[order.field];
        const b = right.data && right.data[order.field];
        const result = a < b ? -1 : a > b ? 1 : 0;
        return order.direction === 'desc' ? -result : result;
      });
    }
    if (this.limitCount !== undefined) entries = entries.slice(0, this.limitCount);
    const docs = entries.map(entry =>
      new FakeSnapshot(new FakeDocumentReference(this.db, entry.path), entry));
    return {
      docs,
      forEach(callback) { docs.forEach(callback); }
    };
  }
}

class FakeCollection extends FakeQuery {
  doc(id) {
    return new FakeDocumentReference(this.db, this.path + '/' + id);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.operations = [];
  }

  get(refOrQuery) {
    return refOrQuery.get();
  }

  set(ref, value, options) {
    this.operations.push({ type: 'set', ref, value: copy(value), options: copy(options) });
    return this;
  }

  update(ref, value) {
    return this.set(ref, value, { merge: true });
  }

  delete(ref) {
    this.operations.push({ type: 'delete', ref });
    return this;
  }

  commit() {
    this.operations.forEach(operation => {
      if (operation.type === 'delete') this.db._delete(operation.ref.path);
      else this.db._write(operation.ref.path, operation.value, operation.options);
    });
  }
}

class FakeFirestore {
  constructor(initial) {
    this.documents = new Map();
    this.version = 0;
    Object.entries(initial || {}).forEach(([collectionName, values]) => {
      Object.entries(values || {}).forEach(([id, value]) =>
        this._write(collectionName + '/' + id, value));
    });
  }

  collection(path) {
    return new FakeCollection(this, path);
  }

  async runTransaction(callback) {
    const transaction = new FakeTransaction(this);
    const result = await callback(transaction);
    transaction.commit();
    return result;
  }

  _entry(path) {
    return this.documents.get(path);
  }

  _snapshot(ref) {
    return new FakeSnapshot(ref, this._entry(ref.path));
  }

  _list(collectionPath) {
    const prefix = collectionPath + '/';
    return Array.from(this.documents.entries())
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, entry]) => ({ path, data: copy(entry.data), updateTime: copy(entry.updateTime) }));
  }

  _write(path, value, options) {
    const current = this._entry(path);
    const data = options && options.merge
      ? Object.assign({}, current ? current.data : {}, copy(value))
      : copy(value);
    this.version += 1;
    this.documents.set(path, {
      data,
      updateTime: { seconds: 2000000000 + this.version, nanoseconds: this.version }
    });
  }

  _delete(path) {
    this.documents.delete(path);
  }

  data(path) {
    const entry = this._entry(path);
    return entry ? copy(entry.data) : undefined;
  }
}

function correctionDb() {
  return new FakeFirestore({
    app: {
      nameMap: { map: { [OLD]: 'Fictional Middle', 'Fictional Other Alias': OTHER } },
      members: { list: [OLD, NEW, OTHER], updatedAt: 'fictional-members-stamp' },
      settings: { schedulerName: OLD, sheetUrl: 'https://example.invalid/fictional-sheet' }
    },
    schedule: {
      'fictional-service': {
        date: '2027-01-10',
        assignments: { Presider: OLD, 'Usher Door': OTHER },
        conflictOk: {
          [OLD]: ['Usher Door'],
          [NEW]: ['Media Booth #1', 'Usher Door']
        },
        notes: 'fictional schedule note',
        confirmed: true
      }
    },
    tokens: {
      'fictional-token': {
        name: OLD,
        token: 'fictional opaque token contents',
        createdAt: 'fictional-token-stamp'
      }
    }
  });
}

function errorCode(error) {
  return error && error.code;
}

test('apply atomically replaces exact fields and stores opaque identity-only backup items', async () => {
  const db = correctionDb();
  const originalSchedule = db.data('schedule/fictional-service');
  const originalToken = db.data('tokens/fictional-token');
  const plan = await identity.planCorrection(db, { [OLD]: NEW });
  const result = await identity.applyCorrection(db, plan, { jobId: 'lnr-fictional-job-001' });

  assert.equal(result.jobId, 'lnr-fictional-job-001');
  assert.equal(result.targetCount, plan.targetCount);
  const changedSchedule = db.data('schedule/fictional-service');
  assert.deepEqual(changedSchedule.assignments, { Presider: NEW, 'Usher Door': OTHER });
  assert.deepEqual(changedSchedule.conflictOk, {
    [NEW]: ['Usher Door', 'Media Booth #1']
  });
  assert.equal(changedSchedule.notes, originalSchedule.notes);
  assert.equal(changedSchedule.confirmed, true);
  assert.deepEqual(db.data('tokens/fictional-token'), {
    ...originalToken,
    name: NEW
  });

  const root = db.data('_adminIdentityCorrections/lnr-fictional-job-001');
  assert.equal(root.schemaVersion, 1);
  assert.equal(root.status, 'applied');
  assert.equal(root.itemCount, plan.targetCount);
  assert.equal(root.scopeProofVersion, 1);
  assert.match(root.scopeProof, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(root.scopeIdentityHashes));
  assert.ok(root.scopeIdentityHashes.every(value => /^[a-f0-9]{64}$/.test(value)));
  const itemPaths = Array.from(db.documents.keys())
    .filter(path => path.startsWith('_adminIdentityCorrections/lnr-fictional-job-001/items/'));
  assert.equal(itemPaths.length, plan.targetCount);
  itemPaths.forEach(path => {
    const item = db.data(path);
    assert.match(path.split('/').at(-1), /^i_[a-f0-9]{40}$/);
    assert.equal(typeof item.collectionKind, 'string');
    assert.equal(item.docId, undefined);
    assert.equal(item.collectionName, undefined);
    assert.equal(item.notes, undefined);
    assert.equal(item.token, undefined);
    assert.ok(item.precondition.beforeHash);
    assert.ok(item.precondition.afterHash);
  });
});

test('rollback restores identity fields and preserves unrelated post-apply changes', async () => {
  const db = correctionDb();
  const plan = await identity.planCorrection(db, { [OLD]: NEW });
  await identity.applyCorrection(db, plan, { jobId: 'lnr-fictional-job-002' });
  const rolledBack = await identity.rollbackCorrection(db, 'lnr-fictional-job-002');
  assert.equal(rolledBack.targetCount, plan.targetCount);
  assert.equal(db.data('_adminIdentityCorrections/lnr-fictional-job-002').status, 'rolledBack');
  assert.equal(db.data('schedule/fictional-service').assignments.Presider, OLD);
  assert.deepEqual(db.data('schedule/fictional-service').conflictOk, {
    [OLD]: ['Usher Door'],
    [NEW]: ['Media Booth #1', 'Usher Door']
  });

  const secondPlan = await identity.planCorrection(db, { [OLD]: NEW });
  await identity.applyCorrection(db, secondPlan, { jobId: 'lnr-fictional-job-003' });
  const changed = db.data('schedule/fictional-service');
  changed.notes = 'fictional subsequent change';
  await db.collection('schedule').doc('fictional-service').set(changed);
  await db.collection('tokens').doc('fictional-unrelated-after-apply').set({
    name: OTHER,
    token: 'fictional unrelated post-apply token'
  });
  await db.collection('requests').doc('fictional-unrelated-after-apply').set({
    name: OTHER,
    status: 'pending',
    note: 'fictional unrelated post-apply request'
  });
  const preserved = await identity.rollbackCorrection(db, 'lnr-fictional-job-003');
  assert.equal(preserved.jobId, 'lnr-fictional-job-003');
  assert.equal(db.data('schedule/fictional-service').assignments.Presider, OLD);
  assert.equal(db.data('schedule/fictional-service').notes, 'fictional subsequent change');
  assert.deepEqual(db.data('tokens/fictional-unrelated-after-apply'), {
    name: OTHER,
    token: 'fictional unrelated post-apply token'
  });
  assert.deepEqual(db.data('requests/fictional-unrelated-after-apply'), {
    name: OTHER,
    status: 'pending',
    note: 'fictional unrelated post-apply request'
  });
  assert.equal(db.data('_adminIdentityCorrections/lnr-fictional-job-003').status, 'rolledBack');
});

test('rollback restores every entry in a multi-entry song history', async () => {
  const db = correctionDb();
  await db.collection('songStats').doc('fictional-song').set({
    history: [
      { by: OLD, date: '2027-01-10', songs: ['Fictional Song One'] },
      { by: OLD, date: '2027-01-03', songs: ['Fictional Song Two'] }
    ],
    count: 2,
    note: 'fictional history note'
  });
  const plan = await identity.planCorrection(db, { [OLD]: NEW });
  await identity.applyCorrection(db, plan, { jobId: 'lnr-fictional-job-010' });
  await identity.rollbackCorrection(db, 'lnr-fictional-job-010');
  assert.deepEqual(db.data('songStats/fictional-song'), {
    history: [
      { by: OLD, date: '2027-01-10', songs: ['Fictional Song One'] },
      { by: OLD, date: '2027-01-03', songs: ['Fictional Song Two'] }
    ],
    count: 2,
    note: 'fictional history note'
  });
});

test('rollback refuses a new identity-bearing document after apply', async () => {
  const db = correctionDb();
  const plan = await identity.planCorrection(db, { [OLD]: NEW });
  await identity.applyCorrection(db, plan, { jobId: 'lnr-fictional-job-008' });
  await db.collection('tokens').doc('fictional-new-token').set({
    name: NEW,
    token: 'fictional new opaque token contents'
  });

  await assert.rejects(
    identity.rollbackCorrection(db, 'lnr-fictional-job-008'),
    error => errorCode(error) === 'ROLLBACK_CONFLICT'
  );
  assert.equal(db.data('schedule/fictional-service').assignments.Presider, NEW);
  assert.equal(db.data('_adminIdentityCorrections/lnr-fictional-job-008').status, 'applied');

  const existingDb = correctionDb();
  await existingDb.collection('tokens').doc('fictional-unaffected-token').set({
    name: OTHER,
    token: 'fictional unaffected opaque token contents'
  });
  const existingPlan = await identity.planCorrection(existingDb, { [OLD]: NEW });
  await identity.applyCorrection(existingDb, existingPlan, { jobId: 'lnr-fictional-job-009' });
  await existingDb.collection('tokens').doc('fictional-unaffected-token').set({
    name: NEW,
    token: 'fictional unaffected opaque token contents'
  });
  await assert.rejects(
    identity.rollbackCorrection(existingDb, 'lnr-fictional-job-009'),
    error => errorCode(error) === 'ROLLBACK_CONFLICT'
  );
  assert.equal(existingDb.data('_adminIdentityCorrections/lnr-fictional-job-009').status, 'applied');
});

test('apply aborts without writes when the scanned scope changes or a new target appears', async () => {
  const db = correctionDb();
  const plan = await identity.planCorrection(db, { [OLD]: NEW });
  const beforeRoot = db.data('_adminIdentityCorrections/lnr-fictional-job-004');
  const changed = db.data('schedule/fictional-service');
  changed.notes = 'fictional concurrent write';
  await db.collection('schedule').doc('fictional-service').set(changed);
  await assert.rejects(
    identity.applyCorrection(db, plan, { jobId: 'lnr-fictional-job-004' }),
    error => errorCode(error) === 'OPTIMISTIC_SCOPE_CONFLICT'
  );
  assert.equal(db.data('_adminIdentityCorrections/lnr-fictional-job-004'), beforeRoot);
  assert.equal(db.data('schedule/fictional-service').assignments.Presider, OLD);

  const raceDb = correctionDb();
  const racePlan = await identity.planCorrection(raceDb, { [OLD]: NEW });
  await raceDb.collection('tokens').doc('fictional-new-target').set({ name: OLD });
  await assert.rejects(
    identity.applyCorrection(raceDb, racePlan, { jobId: 'lnr-fictional-job-005' }),
    error => errorCode(error) === 'OPTIMISTIC_SCOPE_CONFLICT'
  );
  assert.equal(raceDb.data('tokens/fictional-new-target').name, OLD);
  assert.equal(raceDb.data('_adminIdentityCorrections/lnr-fictional-job-005'), undefined);

  const versionDb = correctionDb();
  const versionPlan = await identity.planCorrection(versionDb, { [OLD]: NEW });
  const sameData = versionDb.data('schedule/fictional-service');
  await versionDb.collection('schedule').doc('fictional-service').set(sameData);
  await assert.rejects(
    identity.applyCorrection(versionDb, versionPlan, { jobId: 'lnr-fictional-job-007' }),
    error => errorCode(error) === 'OPTIMISTIC_SCOPE_CONFLICT'
  );
  assert.equal(versionDb.data('schedule/fictional-service').assignments.Presider, OLD);
  assert.equal(versionDb.data('_adminIdentityCorrections/lnr-fictional-job-007'), undefined);
});

class FakeInteractiveInput extends EventEmitter {
  constructor(values) {
    super();
    this.values = values.slice();
    this.isTTY = true;
    this.isRaw = false;
  }

  setRawMode(value) {
    this.isRaw = value;
    if (value) {
      const next = this.values.shift();
      setImmediate(() => this.emit('data', Buffer.from(next + '\n')));
    }
  }

  resume() {}
  pause() {}
}

test('runner defaults to dry-run and reads identities only through hidden stdin', async () => {
  const input = new FakeInteractiveInput([OLD, NEW]);
  let outputText = '';
  const output = { write(value) { outputText += value; } };
  const logs = [];
  const db = correctionDb();
  const result = await runner.runCorrection({
    db,
    io: { input, output },
    output: { log(value) { logs.push(value); } }
  });

  assert.equal(result.mode, 'dry-run');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /"mode":"dry-run"/);
  assert.equal(logs[0].includes(OLD), false);
  assert.equal(logs[0].includes(NEW), false);
  assert.equal(db.data('_adminIdentityCorrections/lnr-fictional-job-006'), undefined);
  assert.match(outputText, /Old identity/);
  assert.match(outputText, /Canonical identity/);
  assert.equal(outputText.includes(OLD), false);
  assert.equal(outputText.includes(NEW), false);
  assert.deepEqual(runner.parseOptions([]), { execute: false });
  assert.deepEqual(runner.parseOptions(['--execute']), { execute: true });
  assert.throws(() => runner.parseOptions(['--unexpected']), /Only --execute and --dry-run/);
  assert.throws(() => runner.parseOptions(['--execute', '--dry-run']), /Choose one correction mode/);
  assert.deepEqual(runner.safeErrorDetails({
    code: 'UNEXPECTED_OCCURRENCES',
    details: { occurrences: [
      { path: 'app/*/<key>/<identity>', count: 2 },
      { path: 'app/*/unsafe/Fictional Old', count: 9 }
    ] }
  }), {
    code: 'UNEXPECTED_OCCURRENCES',
    occurrences: [
      { path: 'app/*/<key>/<identity>', count: 2 },
      { path: '<structural-path>', count: 9 }
    ]
  });

  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'demo-worship-refactor';
  try {
    await assert.rejects(runner.main([]), /refuses emulator or non-production project configuration/);
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }
});
