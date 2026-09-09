'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../identity-lib');

const OLD = 'Fictional Old';
const NEW = 'Fictional New';
const OTHER_ALIAS = 'Fictional Other Alias';
const OTHER = 'Fictional Other';

function record(collectionName, collectionKind, docId, data, exists = true) {
  return { collectionName, collectionKind, docId, data, exists };
}

function entryFor(plan, kind) {
  const entry = plan.entries.find(candidate => candidate.collectionKind === kind);
  assert.ok(entry, `expected a correction entry for ${kind}`);
  return entry;
}

test('identity maps flatten chains, expose canonical equality and reject unsafe links', () => {
  const resolver = identity.createIdentityResolver({
    [OLD]: 'Fictional Middle',
    'Fictional Middle': NEW
  });

  assert.equal(resolver.canonicalize(OLD), NEW);
  assert.equal(resolver.canonicalize('Fictional Middle'), NEW);
  assert.equal(resolver.same(OLD, NEW), true);
  assert.deepEqual(resolver.aliases(NEW), [OLD, 'Fictional Middle']);
  assert.deepEqual(resolver.variants(OLD), [NEW, OLD, 'Fictional Middle']);
  assert.deepEqual(resolver.map, { [OLD]: NEW, 'Fictional Middle': NEW });

  assert.throws(() => identity.normalizeIdentityMap({ [OLD]: OLD }), error =>
    error.code === 'SELF_LINK');
  assert.throws(() => identity.normalizeIdentityMap({ [OLD]: 'Fictional Middle', 'Fictional Middle': OLD }),
    error => error.code === 'CYCLE');
  assert.throws(() => identity.normalizeIdentityMap({ ' ': NEW }), error =>
    error.code === 'BLANK_IDENTITY');
  assert.throws(() => identity.normalizeIdentityMap({ [OLD]: ' ' }), error =>
    error.code === 'BLANK_IDENTITY');
});

test('snapshot versions retain sub-millisecond timestamp precision', () => {
  const first = { seconds: 42, nanoseconds: 100, toMillis: () => 42000 };
  const second = { seconds: 42, nanoseconds: 101, toMillis: () => 42000 };
  assert.equal(identity.snapshotVersion(first), 'timestamp:42:100');
  assert.equal(identity.snapshotVersion(second), 'timestamp:42:101');
  assert.notEqual(identity.snapshotVersion(first), identity.snapshotVersion(second));
});

test('correction resolver scopes an existing name map to the requested identity', () => {
  const resolver = identity.correctionResolver(
    { [OLD]: NEW },
    { [OLD]: 'Fictional Middle', [OTHER_ALIAS]: OTHER }
  );

  assert.equal(resolver.canonicalize(OLD), NEW);
  assert.equal(resolver.canonicalize('Fictional Middle'), 'Fictional Middle');
  assert.equal(resolver.canonicalize(OTHER_ALIAS), OTHER_ALIAS);
  assert.deepEqual(resolver.map, { [OLD]: NEW });
});

test('plan rewrites only the approved identity fields and preserves unrelated data', () => {
  const records = [
    record('app', 'app/nameMap', 'nameMap', {
      map: {
        [OLD]: 'Fictional Middle',
        [OTHER_ALIAS]: 'Fictional Other Middle',
        'Fictional Other Middle': OTHER
      },
      unrelatedMetadata: { [OTHER_ALIAS]: 'preserve this fictional value' }
    }),
    record('app', 'app/members', 'members', {
      list: [OLD, NEW, OTHER],
      listUpdatedAt: 'fictional-members-stamp'
    }),
    record('app', 'app/departments', 'departments', {
      map: { Choir: [OLD, NEW, OTHER], Welcome: ['Fictional Welcome'] },
      notes: 'fictional department note'
    }),
    record('app', 'app/presiders', 'presiders', {
      names: [OLD, NEW, OTHER],
      ordering: ['first', 'second']
    }),
    record('app', 'app/settings', 'settings', {
      schedulerName: OLD,
      sheetUrl: 'https://example.invalid/fictional-sheet',
      secretLikeField: 'leave this unchanged'
    }),
    record('schedule', 'schedule', 'fictional-service', {
      date: '2027-01-10',
      assignments: { Presider: OLD, 'Usher Door': OTHER },
      conflictOk: {
        [OLD]: ['Usher Door'],
        [NEW]: ['Media Booth #1', 'Usher Door'],
        [OTHER]: ['Parking #1']
      },
      notes: 'fictional schedule note',
      confirmed: true
    }),
    record('setlists', 'setlists', 'fictional-service', {
      presider: OLD,
      confirmedBy: OLD,
      updatedBy: OTHER,
      songs: ['Fictional Song One'],
      notes: 'fictional setlist note'
    }),
    record('songStats', 'songStats', 'fictional-song', {
      history: [
        { by: OLD, date: '2027-01-10', songs: ['Fictional Song One'] },
        { by: OTHER, date: '2027-01-03', songs: ['Fictional Song Two'] }
      ],
      count: 2,
      unrelated: 'preserve this fictional statistic'
    }),
    record('requests', 'requests', 'fictional-request', {
      name: OLD,
      resolvedBy: OLD,
      status: 'approved',
      note: 'fictional request note'
    }),
    record('tokens', 'tokens', 'fictional-token', {
      name: OLD,
      token: 'fictional opaque token contents stay in the target document',
      createdAt: 'fictional-token-stamp'
    }),
    record('tokens', 'tokens', 'fictional-unrelated-token', {
      name: OTHER_ALIAS,
      token: 'fictional unrelated opaque token contents'
    })
  ];

  const plan = identity.buildCorrectionPlan(records, { [OLD]: NEW }, {
    existingNameMap: {
      [OLD]: 'Fictional Middle',
      [OTHER_ALIAS]: 'Fictional Other Middle',
      'Fictional Other Middle': OTHER
    }
  });

  assert.equal(plan.targetCount, records.length - 1);
  assert.equal(plan.mapping[OLD], NEW);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.entries[0]));
  assert.ok(Array.isArray(plan.scope));

  assert.deepEqual(entryFor(plan, 'app/nameMap').after, {
    map: {
      [OLD]: NEW,
      [OTHER_ALIAS]: OTHER,
      'Fictional Other Middle': OTHER
    },
    unrelatedMetadata: { [OTHER_ALIAS]: 'preserve this fictional value' }
  });
  assert.deepEqual(entryFor(plan, 'app/members').after.list, [NEW, OTHER]);
  assert.deepEqual(entryFor(plan, 'app/departments').after.map, {
    Choir: [NEW, OTHER],
    Welcome: ['Fictional Welcome']
  });
  assert.deepEqual(entryFor(plan, 'app/presiders').after.names, [NEW, OTHER]);
  assert.equal(entryFor(plan, 'app/settings').after.schedulerName, NEW);

  const schedule = entryFor(plan, 'schedule').after;
  assert.deepEqual(schedule.assignments, { Presider: NEW, 'Usher Door': OTHER });
  assert.deepEqual(schedule.conflictOk, {
    [NEW]: ['Usher Door', 'Media Booth #1'],
    [OTHER]: ['Parking #1']
  });
  assert.equal(schedule.notes, 'fictional schedule note');
  assert.equal(schedule.confirmed, true);

  const setlist = entryFor(plan, 'setlists').after;
  assert.deepEqual(setlist, {
    presider: NEW,
    confirmedBy: NEW,
    updatedBy: OTHER,
    songs: ['Fictional Song One'],
    notes: 'fictional setlist note'
  });

  const stats = entryFor(plan, 'songStats').after;
  assert.deepEqual(stats.history, [
    { by: NEW, date: '2027-01-10', songs: ['Fictional Song One'] },
    { by: OTHER, date: '2027-01-03', songs: ['Fictional Song Two'] }
  ]);
  assert.equal(stats.count, 2);
  assert.equal(stats.unrelated, 'preserve this fictional statistic');

  assert.deepEqual(entryFor(plan, 'requests').after, {
    name: NEW,
    resolvedBy: NEW,
    status: 'approved',
    note: 'fictional request note'
  });
  assert.deepEqual(entryFor(plan, 'tokens').after, {
    name: NEW,
    token: 'fictional opaque token contents stay in the target document',
    createdAt: 'fictional-token-stamp'
  });
  assert.equal(plan.entries.some(entry => entry.docId === 'fictional-unrelated-token'), false);
});

class MutableFictionalValue {
  constructor(value) {
    this.value = value;
  }
}

test('mutable plan values are cloned and altered after-patches are rejected', async () => {
  const sourceValue = new MutableFictionalValue('source value');
  const sourceDate = new Date(0);
  const sourceBytes = Buffer.from([1, 2, 3]);
  const plan = identity.buildCorrectionPlan([
    record('tokens', 'tokens', 'fictional-mutable-token', {
      name: OLD,
      sourceValue,
      sourceDate,
      sourceBytes
    })
  ], { [OLD]: NEW });
  const entry = entryFor(plan, 'tokens');

  sourceValue.value = 'changed source value';
  sourceDate.setTime(1000);
  sourceBytes[0] = 9;
  assert.equal(entry.after.sourceValue.value, 'source value');
  assert.equal(entry.after.sourceDate.getTime(), 0);
  assert.deepEqual(Array.from(entry.after.sourceBytes), [1, 2, 3]);

  entry.after.sourceValue.value = 'changed plan value';
  entry.after.sourceDate.setTime(2000);
  entry.after.sourceBytes[1] = 8;
  await assert.rejects(
    identity.applyCorrection({ runTransaction() { throw new Error('must not run'); } }, plan),
    error => error.code === 'OPTIMISTIC_CONFLICT'
  );
});

test('unexpected occurrences abort with sanitized structural diagnostics', () => {
  assert.throws(() => identity.buildCorrectionPlan([
    record('app', 'app', 'fictional-unknown', {
      metadata: { [OLD]: OLD },
      unrelated: 'fictional value'
    })
  ], { [OLD]: NEW }), error => {
    assert.equal(error.code, 'UNEXPECTED_OCCURRENCES');
    assert.ok(Array.isArray(error.details.occurrences));
    assert.ok(error.details.occurrences.every(item =>
      !item.path.includes(OLD) && !item.path.includes(NEW) && !item.path.includes('metadata')));
    assert.ok(error.details.occurrences.every(item => Number.isInteger(item.count)));
    return true;
  });
});

test('the hard correction cap cannot be raised and lower caps fail closed', () => {
  assert.throws(() => identity.buildCorrectionPlan([], { [OLD]: NEW }, {
    maxTargets: identity.MAX_TARGET_DOCUMENTS + 1
  }), error => error.code === 'INVALID_CAP');

  const records = [
    record('tokens', 'tokens', 'fictional-token-one', { name: OLD }),
    record('tokens', 'tokens', 'fictional-token-two', { name: OLD })
  ];
  assert.throws(() => identity.buildCorrectionPlan(records, { [OLD]: NEW }, { maxTargets: 1 }),
    error => error.code === 'TARGET_CAP');

  const many = Array.from({ length: identity.MAX_TARGET_DOCUMENTS + 1 }, (_value, index) =>
    record('tokens', 'tokens', 'fictional-token-' + index, { name: OLD }));
  assert.throws(() => identity.buildCorrectionPlan(many, { [OLD]: NEW }),
    error => error.code === 'TARGET_CAP');
});

test('empty plans describe no writes and missing name maps get a synthetic target', () => {
  const empty = identity.buildCorrectionPlan([
    record('tokens', 'tokens', 'fictional-token', { name: OTHER })
  ], {});
  assert.deepEqual(identity.describePlan(empty), {
    targetCount: 0,
    collectionKinds: [],
    maxTargets: identity.MAX_TARGET_DOCUMENTS
  });

  const missingMap = identity.buildCorrectionPlan([
    record('tokens', 'tokens', 'fictional-token', { name: OLD })
  ], { [OLD]: NEW });
  assert.equal(missingMap.targetCount, 2);
  assert.ok(missingMap.entries.some(entry => entry.collectionKind === 'app/nameMap' &&
    entry.beforeExists === false));
});
