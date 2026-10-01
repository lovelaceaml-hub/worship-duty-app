/* The default for Opening Prayer (setDutyDefault): who may change it, and
   that the default must take Opening Prayer in Worship. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { setDutyDefault } = require('../duty-defaults.js');
const permissions = require('../permissions.js');
const { memoryDb } = require('./memory-db.js');

const config = { admin: ['B. Admin'], departmentLeaders: { Worship: ['E. Lead'], Media: ['D. Media'] } };
const actor = name => ({ uid: 'uid-' + name, token: { memberName: name }, memberName: name });
const worship = (name, duties, extra = {}) => ({ memberUid: 'uid-' + name, departmentId: 'Worship', memberName: name, status: 'active', schedulable: true, eligibleDuties: duties, ...extra });

function setup() {
  return memoryDb({
    'app/settings': { features: {} },
    'departments/Worship/members/uid-E. Simon': worship('E. Simon', ['Sermon', 'Presider']),
    'departments/Worship/members/uid-B. Adam': worship('B. Adam', ['Closing Prayer']),
    'departments/Worship/members/uid-D. Old': worship('D. Old', ['Sermon'], { status: 'inactive' })
  });
}

test('a Worship leader or an administrator sets the default, or none', async () => {
  const db = setup();
  const set = (who, memberName) => setDutyDefault({ db, actor: actor(who), config, data: { duty: 'Sermon', memberName } });
  assert.deepEqual(await set('E. Lead', 'E. Simon'), { ok: true, duty: 'Sermon', memberName: 'E. Simon' });
  assert.deepEqual(db.store.get('app/settings').dutyDefaults, { Sermon: 'E. Simon' });
  await set('B. Admin', '');
  assert.deepEqual(db.store.get('app/settings').dutyDefaults, { Sermon: '' }, 'no default');
  assert.deepEqual(db.store.get('app/settings').features, {}, 'other settings stay');
  assert.equal(permissions.dutyDefault(db.store.get('app/settings'), 'Sermon'), '');
});

test('others may not change it, and the default must take Opening Prayer', async () => {
  const db = setup();
  const set = (who, data) => setDutyDefault({ db, actor: actor(who), config, data });
  await assert.rejects(set('D. Media', { duty: 'Sermon', memberName: 'E. Simon' }), { code: 'permission-denied' });
  await assert.rejects(set('S. Member', { duty: 'Sermon', memberName: 'E. Simon' }), { code: 'permission-denied' });
  await assert.rejects(set('E. Lead', { duty: 'Presider', memberName: 'E. Simon' }), { code: 'invalid-argument' }, 'only duties that have a default');
  await assert.rejects(set('E. Lead', { duty: 'Sermon', memberName: 'B. Adam' }), { code: 'failed-precondition' }, 'does not take Opening Prayer');
  await assert.rejects(set('E. Lead', { duty: 'Sermon', memberName: 'D. Old' }), { code: 'failed-precondition' }, 'inactive in Worship');
  await assert.rejects(set('E. Lead', { duty: 'Sermon', memberName: 'S. Nobody' }), { code: 'failed-precondition' });
  assert.equal(db.store.get('app/settings').dutyDefaults, undefined, 'nothing saved');
});

test('the default is the overseer until a leader changes it', () => {
  assert.equal(permissions.dutyDefault({}, 'Sermon'), 'E. Simon');
  assert.equal(permissions.dutyDefault({ dutyDefaults: { Sermon: 'P. Paul' } }, 'Sermon'), 'P. Paul');
  assert.equal(permissions.dutyDefault({ dutyDefaults: {} }, 'Sermon'), 'E. Simon');
  assert.equal(permissions.dutyDefault({}, 'Presider'), '');
});
