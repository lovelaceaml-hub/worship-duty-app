import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../functions/migrate-member-access.js');
const memberAuth = require('../functions/member-auth.js');
const memberAccess = require('../member-access.js');

const PRIVILEGED_HASH = await memberAuth.hashPin('0000', { salt: 'migration-test-salt' });

function fixture() {
  return {
    app: {
      members: { list: ['D. Chloe', 'B. Anthony L', 'M. Chloe'] },
      departments: { map: { Worship: ['D. Chloe', 'M. Chloe'], 'Usher Sisters': ['D. Chloe'] } },
      settings: { schedulerName: 'D. Chloe', departmentLeaders: ['D. Chloe'], pinHash: PRIVILEGED_HASH },
      nameMap: { map: { 'B. Anthony L': 'B. Anthony', 'D. Chloe': 'D. Chloe' } },
      songSettings: { editorNames: ['D. Chloe'] },
      presiders: { names: ['D. Chloe'] }
    },
    schedule: {
      service1: {
        date: '2026-10-01', service: 'Morning',
        assignments: { Presider: 'D. Chloe', Sermon: 'B. Anthony L' },
        conflictOk: { 'D. Chloe': ['Presider', 'Usher Door'] },
        acknowledgment: { by: 'D. Chloe', acknowledgedFor: 'D. Chloe' }
      }
    },
    requests: {
      request1: { name: 'D. Chloe', requestedBy: 'B. Anthony L', resolvedBy: 'D. Chloe', status: 'pending' }
    },
    tokens: { token1: { name: 'D. Chloe', updatedAt: 1 } },
    notifications: { notification1: { recipientName: 'D. Chloe', senderName: 'B. Anthony L' } },
    accounts: { account1: { displayName: 'D. Chloe', memberName: 'B. Anthony L' } },
    setlists: { service1: { id: 'service1', presider: 'D. Chloe', updatedBy: 'B. Anthony L', confirmedBy: 'D. Chloe', songs: ['song-1'] } },
    songStats: { 'song-1': { songId: 'song-1', history: [{ date: '2026-09-01', service: 'old', by: 'D. Chloe' }] } }
  };
}

function getPath(value, path) {
  return path.split('/').reduce((node, key) => node && node[key], value);
}

test('canonical transformation covers every identity reference and D. Chloe becomes M. Chloe', () => {
  const result = migration.transformDatabase(fixture(), {
    leaderNames: ['D. Chloe'],
    songEditorNames: ['D. Chloe'],
    privilegedPinHash: PRIVILEGED_HASH
  });
  const db = result.database;

  assert.deepEqual(db.app.members.list, ['B. Anthony', 'M. Chloe']);
  assert.deepEqual(db.app.departments.map.Worship, ['M. Chloe']);
  assert.equal(db.app.settings.schedulerName, 'M. Chloe');
  assert.deepEqual(db.app.settings.departmentLeaders, ['M. Chloe']);
  assert.equal(db.schedule.service1.assignments.Presider, 'M. Chloe');
  assert.deepEqual(db.schedule.service1.conflictOk, { 'M. Chloe': ['Presider', 'Usher Door'] });
  assert.deepEqual(db.schedule.service1.acknowledgment, { by: 'M. Chloe', acknowledgedFor: 'M. Chloe' });
  assert.equal(db.requests.request1.name, 'M. Chloe');
  assert.equal(db.requests.request1.requestedBy, 'B. Anthony');
  assert.equal(db.tokens.token1.name, 'M. Chloe');
  assert.equal(db.notifications.notification1.recipientName, 'M. Chloe');
  assert.equal(db.accounts.account1.displayName, 'M. Chloe');
  assert.equal(db.setlists.service1.presider, 'M. Chloe');
  assert.equal(db.setlists.service1.confirmedBy, 'M. Chloe');
  assert.equal(db.songStats['song-1'].history[0].by, 'M. Chloe');
  assert.deepEqual(db.app.presiders.names, ['M. Chloe']);
  assert.deepEqual(db.app.songSettings.editorNames, ['M. Chloe']);
  assert.equal(db.app.songSettings.editorPinHash, PRIVILEGED_HASH);
  assert.equal(db.app.nameMap.map['D. Chloe'], 'M. Chloe');
});

test('malformed titles and required last initials normalize consistently', () => {
  const canon = migration.makeCanonicalizer();
  assert.equal(canon('B,James'), 'B. James');
  assert.equal(canon('BJason'), 'B. Jason');
  assert.equal(canon('D,Armani'), 'D. Armani');
  assert.equal(canon('H.Elena'), 'H. Elena');
  assert.equal(canon('S. Melisaa'), 'S. Melissa');
  assert.equal(canon('B. James S'), 'B. James S.');
  assert.equal(canon('S. Monica C'), 'S. Monica C.');
  assert.equal(canon('S. Martha C'), 'S. Martha C.');
});

test('migration is idempotent and preserves exact leader and song editor configuration', () => {
  const options = {
    leaderNames: ['D. Chloe', 'B. Anthony L'],
    songEditorNames: ['D. Chloe'],
    privilegedPinHash: PRIVILEGED_HASH
  };
  const first = migration.transformDatabase(fixture(), options);
  const second = migration.transformDatabase(first.database, options);

  assert.equal(second.writes.length, 0, JSON.stringify(second.writes));
  assert.deepEqual(first.database.app.settings.departmentLeaders, ['B. Anthony', 'M. Chloe']);
  assert.deepEqual(first.database.app.songSettings.editorNames, ['M. Chloe']);
  assert.equal(first.database.app.songSettings.editorPinHash, PRIVILEGED_HASH);
});

test('dry run produces a plan without mutating the store', async () => {
  const source = fixture();
  const writes = [];
  const store = {
    async read() { return structuredClone(source); },
    async write(...args) { writes.push(args); }
  };
  let hashCalls = 0;
  const result = await migration.migrateMemberAccess({
    store,
    dryRun: true,
    leaderNames: ['D. Chloe'],
    songEditorNames: ['D. Chloe'],
    hashPin: async () => { hashCalls++; return PRIVILEGED_HASH; }
  });

  assert.equal(result.dryRun, true);
  assert.ok(result.changed > 0);
  assert.equal(writes.length, 0);
  assert.equal(hashCalls, 1);
  assert.deepEqual(source, fixture());
});

test('injected hash is stored only in the song editor hash field', async () => {
  const writes = [];
  const result = await migration.migrateMemberAccess({
    store: {
      async read() { return { app: { songSettings: {} }, schedule: { keep: { date: '2026-10-01', assignments: {} } } }; },
      async write(path, data) { writes.push({ path, data }); }
    },
    dryRun: false,
    leaderNames: ['B. Anthony'],
    songEditorNames: ['B. Anthony'],
    hashPin: async () => PRIVILEGED_HASH
  });

  const songWrite = writes.find(write => write.path === 'app/songSettings');
  assert.ok(songWrite);
  assert.equal(songWrite.data.editorPinHash, PRIVILEGED_HASH);
  assert.equal(Object.prototype.hasOwnProperty.call(songWrite.data, 'privilegedPin'), false);
  assert.equal(result.privilegedPinHashApplied, true);
});

test('migration has no plaintext PIN and never wipes or reseeds the schedule', () => {
  const result = migration.transformDatabase(fixture(), {
    leaderNames: ['D. Chloe'],
    songEditorNames: ['D. Chloe'],
    privilegedPinHash: PRIVILEGED_HASH
  });
  const scheduleWrites = result.writes.filter(write => write.path.startsWith('schedule/'));
  assert.equal(scheduleWrites.length, 1);
  assert.equal(scheduleWrites.some(write => write.data === undefined), false);
  assert.equal(result.writes.some(write => write.path === 'schedule'), false);
  assert.equal(result.writes.some(write => write.delete === true), false);
  assert.equal(JSON.stringify(result.database).includes('plaintext'), false);
  assert.equal(JSON.stringify(result.database).includes('privilegedPin'), false);
  assert.equal(Object.keys(result.database.schedule).length, 1);
  assert.equal(getPath(result.database, 'schedule/service1').assignments.Presider, 'M. Chloe');
});

test('cached member references are canonicalized without changing unrelated state', () => {
  const cached = {
    members: ['D. Chloe', 'B. Anthony L'],
    departments: { map: { Worship: ['D. Chloe'] } },
    services: [{ assignments: { Presider: 'D. Chloe' }, conflictOk: { 'D. Chloe': ['Presider'] } }],
    requests: [{ name: 'D. Chloe' }],
    stats: { song: { history: [{ by: 'D. Chloe' }] } },
    nameMap: { map: { 'D. Chloe': 'D. Chloe' } },
    unrelated: 'keep'
  };
  const next = migration.migrateCachedMemberState(cached);
  assert.deepEqual(next.members, ['B. Anthony', 'M. Chloe']);
  assert.equal(next.services[0].assignments.Presider, 'M. Chloe');
  assert.deepEqual(next.services[0].conflictOk, { 'M. Chloe': ['Presider'] });
  assert.equal(next.requests[0].name, 'M. Chloe');
  assert.equal(next.stats.song.history[0].by, 'M. Chloe');
  assert.equal(next.nameMap.map['D. Chloe'], 'M. Chloe');
  assert.equal(next.unrelated, 'keep');
});

test('default migration records the requested roles and initializes privileged accounts from the injected hash', () => {
  const result = migration.transformDatabase({ app: {} }, { privilegedPinHash: PRIVILEGED_HASH });
  const settings = result.database.app.settings;

  assert.deepEqual(settings.access.admin, ['B. Anthony']);
  assert.deepEqual(settings.access.globalLeaderManager, ['B. Anthony', 'E. Simon']);
  assert.deepEqual(settings.access.departmentLeaders['Usher Sisters'], ['M. Chloe']);
  assert.deepEqual(settings.access.departmentLeaders.Translation, ['S. Paola']);
  assert.deepEqual(settings.access.departmentLeaders['Parking Lot'], ['D. Aaron']);
  assert.deepEqual(settings.access.songEditors, ['D. Danielle', 'B. James', 'D. Aaron', 'D. Armani', 'B. Brent']);
  assert.deepEqual(settings.departmentLeaders, settings.access.departmentLeaders);
  assert.deepEqual(result.database.app.songSettings.editorNames, settings.access.songEditors);

  const anthony = result.database.accounts['B. Anthony'];
  const chloe = result.database.accounts['M. Chloe'];
  assert.equal(anthony.pinHash, PRIVILEGED_HASH);
  assert.equal(anthony.mustChangePin, true);
  assert.equal(chloe.pinHash, PRIVILEGED_HASH);
  assert.equal(chloe.mustChangePin, true);
  assert.equal(result.database.accounts['D. Chloe'], undefined);
});

test('existing privileged account hash and completed PIN state are preserved', async () => {
  const existingHash = await memberAuth.hashPin('4567', { salt: 'existing-test-salt' });
  const result = migration.transformDatabase({
    app: {},
    accounts: { known: { name: 'D. Chloe', pinHash: existingHash, mustChangePin: false } }
  }, { privilegedPinHash: PRIVILEGED_HASH });

  assert.equal(result.database.accounts.known.name, 'M. Chloe');
  assert.equal(result.database.accounts.known.pinHash, existingHash);
  assert.equal(result.database.accounts.known.mustChangePin, false);
});

test('local cache migration updates identity-bearing keys while preserving token and unrelated values', () => {
  const cache = {
    'wds-me': 'D. Chloe',
    'wds-fcm-name': 'D. Chloe',
    'wds-fcm-token': 'token-placeholder',
    'wds-alerts-D. Chloe': JSON.stringify([{ txt: 'old' }]),
    'wds-alerts-M. Chloe': JSON.stringify([{ txt: 'new' }]),
    'wds-reminded': JSON.stringify({ 'D. Chloe|service-1|Presider': 1 }),
    'wds-data-v2': JSON.stringify({ members: ['D. Chloe'], services: [{ assignments: { Presider: 'D. Chloe' } }] }),
    'nss-data-v1': JSON.stringify({ presiders: ['D. Chloe'], setlists: { service: { presider: 'D. Chloe' } } }),
    unrelated: 'keep'
  };
  const next = migration.migrateLocalStorageSnapshot(cache);

  assert.equal(next['wds-me'], 'M. Chloe');
  assert.equal(next['wds-fcm-name'], 'M. Chloe');
  assert.equal(next['wds-fcm-token'], 'token-placeholder');
  assert.equal(next['wds-alerts-D. Chloe'], undefined);
  assert.ok(next['wds-alerts-M. Chloe'].includes('old'));
  assert.ok(next['wds-alerts-M. Chloe'].includes('new'));
  assert.equal(next['wds-reminded'], JSON.stringify({ 'M. Chloe|service-1|Presider': 1 }));
  assert.equal(JSON.parse(next['wds-data-v2']).services[0].assignments.Presider, 'M. Chloe');
  assert.equal(JSON.parse(next['nss-data-v1']).setlists.service.presider, 'M. Chloe');
  assert.equal(next.unrelated, 'keep');
});

test('full remapper covers tokens, accounts, memberships, requestedBy, and nested acknowledgments', () => {
  const result = migration.transformDatabase({
    app: {},
    tokens: { token1: { name: 'D. Chloe', metadata: { requestedBy: 'D. Chloe' } } },
    accounts: {
      'D. Chloe': { name: 'D. Chloe', aliasOnly: true },
      'M. Chloe': { name: 'M. Chloe', canonicalOnly: true }
    },
    memberships: {
      'D. Chloe': { memberName: 'D. Chloe', departments: ['Worship'] },
      'M. Chloe': { memberName: 'M. Chloe', departments: ['Media'] }
    },
    requests: {
      request1: {
        requestedBy: 'D. Chloe',
        audit: { acknowledgment: { acknowledgedBy: 'D. Chloe', acknowledgedFor: 'D. Chloe' } }
      }
    }
  });

  assert.equal(result.database.tokens.token1.name, 'M. Chloe');
  assert.equal(result.database.tokens.token1.metadata.requestedBy, 'M. Chloe');
  assert.equal(result.database.requests.request1.requestedBy, 'M. Chloe');
  assert.equal(result.database.requests.request1.audit.acknowledgment.acknowledgedBy, 'M. Chloe');
  assert.equal(result.database.requests.request1.audit.acknowledgment.acknowledgedFor, 'M. Chloe');
  assert.deepEqual(result.database.accounts['M. Chloe'], {
    name: 'M. Chloe', aliasOnly: true, canonicalOnly: true, active: true, roleVersion: 1
  });
  assert.deepEqual(result.database.memberships['M. Chloe'].departments, ['Media', 'Worship']);
  assert.equal(result.database.accounts['D. Chloe'], undefined);
  assert.equal(result.database.memberships['D. Chloe'], undefined);
  assert.ok(result.writes.some(write => write.path === 'accounts/D. Chloe' && write.delete));
  assert.ok(result.writes.some(write => write.path === 'memberships/D. Chloe' && write.delete));
  assert.equal(migration.transformDatabase(result.database).writes.length, 0);
});

test('browser cleanup remapper merges identity maps and nested acknowledgment references', () => {
  const canon = memberAccess.makeCanonicalizer();
  const next = memberAccess.remapNamedDocument({
    requestedBy: 'D. Chloe',
    acknowledgment: { acknowledgedBy: 'D. Chloe' },
    memberships: {
      'D. Chloe': { legacyOnly: true, roles: ['legacy'] },
      'M. Chloe': { canonicalOnly: true, roles: ['canonical'] }
    }
  }, canon);

  assert.equal(next.requestedBy, 'M. Chloe');
  assert.equal(next.acknowledgment.acknowledgedBy, 'M. Chloe');
  assert.deepEqual(next.memberships['M. Chloe'], {
    legacyOnly: true,
    roles: ['canonical', 'legacy'],
    canonicalOnly: true
  });
  assert.equal(next.memberships['D. Chloe'], undefined);
});

test('browser collection cleanup coalesces alias account records', () => {
  const canon = memberAccess.makeCanonicalizer();
  const remember = value => canon(value);
  const docs = [
    { id: 'D. Chloe', ref: { id: 'alias' }, data: () => ({ name: 'D. Chloe', aliasOnly: true }) },
    { id: 'M. Chloe', ref: { id: 'canonical' }, data: () => ({ name: 'M. Chloe', canonicalOnly: true }) }
  ];
  const result = memberAccess.remapFirestoreCollection(
    'accounts',
    { forEach(callback) { docs.forEach(callback); } },
    remember,
    { doc(_db, collection, id) { return { collection, id }; } },
    {}
  );

  const write = result.writes.find(item => item.ref.id === 'canonical');
  assert.deepEqual(write.data, { name: 'M. Chloe', aliasOnly: true, canonicalOnly: true });
  assert.ok(result.writes.some(item => item.delete && item.ref.id === 'alias'));
});

test('plaintext PIN input is rejected unless it is explicitly hashed through the injected function', async () => {
  await assert.rejects(
    migration.migrateMemberAccess({ snapshot: { app: {} }, privilegedPin: 'fixture-plaintext-value' }),
    /plaintext PIN input is not accepted/
  );

  await assert.rejects(
    migration.migrateMemberAccess({
      snapshot: { app: {} },
      privilegedPin: 'fixture-plaintext-value',
      privilegedPinHash: PRIVILEGED_HASH,
      hashPin: async () => PRIVILEGED_HASH
    }),
    /provide a PIN hash or plaintext PIN/
  );

  assert.throws(
    () => migration.transformDatabase({ app: { settings: { privilegedPin: 'fixture-plaintext-value' } } }, {
      privilegedPinHash: PRIVILEGED_HASH
    }),
    /plaintext PIN field/
  );

  let received;
  const converted = await migration.migrateMemberAccess({
    snapshot: { app: {} },
    privilegedPin: 'fixture-plaintext-value',
    hashPin: async value => { received = value; return PRIVILEGED_HASH; }
  });
  assert.equal(received, 'fixture-plaintext-value');
  assert.equal(converted.privilegedPinHashApplied, true);
  assert.equal(JSON.stringify(converted.database).includes('fixture-plaintext-value'), false);
});

test('invalid existing privileged hashes are replaced and require a PIN change', () => {
  const result = migration.transformDatabase({
    app: {},
    accounts: { account1: { name: 'B. Anthony', pinHash: 'not-a-hash', mustChangePin: false } },
    songSettings: { editorPinHash: 'also-not-a-hash' }
  }, { privilegedPinHash: PRIVILEGED_HASH });

  assert.equal(result.database.accounts.account1.pinHash, PRIVILEGED_HASH);
  assert.equal(result.database.accounts.account1.mustChangePin, true);
  assert.equal(result.database.app.songSettings.editorPinHash, PRIVILEGED_HASH);
});

test('invalid existing settings hash is rejected unless a replacement hash is supplied', () => {
  assert.throws(
    () => migration.transformDatabase({ app: { settings: { pinHash: 'not-a-hash' } } }),
    /app\/settings\.pinHash must be/
  );

  const result = migration.transformDatabase({ app: { settings: { pinHash: 'not-a-hash' } } }, {
    settingsPinHash: PRIVILEGED_HASH
  });
  assert.equal(result.database.app.settings.pinHash, PRIVILEGED_HASH);
});

test('local unread cache collisions preserve the larger count', () => {
  const next = migration.migrateLocalStorageSnapshot({
    'wds-unread-D. Chloe': '7',
    'wds-unread-M. Chloe': '2'
  });
  assert.equal(next['wds-unread-D. Chloe'], undefined);
  assert.equal(next['wds-unread-M. Chloe'], '7');
  assert.equal(memberAccess.mergeCachedValues('7', '2'), '7');
  assert.equal(memberAccess.mergeCachedValues('2', '7'), '7');
});

test('non-dry collision writes the merged canonical record and removes the alias record', async () => {
  const calls = [];
  const source = {
    app: {},
    memberships: {
      'D. Chloe': { memberName: 'D. Chloe', legacyOnly: true },
      'M. Chloe': { memberName: 'M. Chloe', canonicalOnly: true }
    }
  };
  const result = await migration.migrateMemberAccess({
    store: {
      async read() { return structuredClone(source); },
      async write(path, data, options) { calls.push({ path, data, options }); }
    },
    dryRun: false
  });

  assert.equal(result.dryRun, false);
  assert.deepEqual(calls.find(call => call.path === 'memberships/M. Chloe').data, {
    memberName: 'M. Chloe', legacyOnly: true, canonicalOnly: true
  });
  assert.equal(calls.find(call => call.path === 'memberships/D. Chloe').data, undefined);
  assert.equal(calls.find(call => call.path === 'memberships/D. Chloe').options.delete, true);
});
