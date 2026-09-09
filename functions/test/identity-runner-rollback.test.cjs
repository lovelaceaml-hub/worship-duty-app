'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const runner = require('../scripts/correct-member-identity.cjs');

const JOB_ID = 'job-fictional-rollback-001';

function fictionalDb() {
  return {
    collection(name) {
      return { name };
    }
  };
}

test('rollback option dispatch is explicit and mutually exclusive', () => {
  assert.deepEqual(runner.parseOptions(['--rollback', JOB_ID]), {
    rollbackJobId: JOB_ID
  });
  assert.throws(() => runner.parseOptions(['--rollback']), /opaque job ID/);
  assert.throws(() => runner.parseOptions(['--rollback', 'short']), /opaque/);
  assert.throws(() => runner.parseOptions(['--rollback', JOB_ID, '--execute']), /correction mode/);
  assert.throws(() => runner.parseOptions(['--rollback', JOB_ID, '--dry-run']), /correction mode/);
  assert.throws(() => runner.parseOptions(['--rollback', JOB_ID, JOB_ID]), /opaque job ID/);
});

test('rollback dispatch uses the injected library, has no identity prompt, and logs aggregate output', async () => {
  const calls = [];
  const logs = [];
  const input = {
    get setRawMode() {
      throw new Error('rollback must not read identity input');
    }
  };
  const identity = {
    async rollbackCorrection(db, jobId) {
      calls.push({ db, jobId });
      return {
        jobId,
        targetCount: 3,
        collectionKinds: ['tokens', 'schedule', 'unsafe-kind'],
        secret: 'fictional-identity-must-not-be-logged'
      };
    }
  };

  const result = await runner.main(['--rollback', JOB_ID], {
    db: fictionalDb(),
    identity,
    io: { input, output: { write() {} } },
    output: { log(value) { logs.push(value); } }
  });

  assert.equal(result.mode, 'rollback');
  assert.deepEqual(calls.map(call => call.jobId), [JOB_ID]);
  assert.deepEqual(result.summary, {
    jobId: JOB_ID,
    targetCount: 3,
    collectionKinds: ['schedule', 'tokens']
  });
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), {
    mode: 'rollback',
    jobId: JOB_ID,
    targetCount: 3,
    collectionKinds: ['schedule', 'tokens']
  });
  assert.equal(logs[0].includes('secret'), false);
});

test('malformed rollback is rejected before Firebase initialization and injected run is supported', async () => {
  let initialized = false;
  await assert.rejects(
    runner.main(['--rollback', 'bad'], {
      initializeApp() {
        initialized = true;
        throw new Error('must not initialize');
      }
    }),
    /opaque/
  );
  assert.equal(initialized, false);

  let received;
  const result = await runner.main(['--rollback', JOB_ID], {
    run(options) {
      received = options;
      return Promise.resolve({ injected: true });
    }
  });
  assert.deepEqual(received, { rollbackJobId: JOB_ID });
  assert.deepEqual(result, { injected: true });
});

test('error details expose only the allowlisted code and structural counts', () => {
  assert.deepEqual(runner.safeErrorDetails({
    code: 'BACKUP_NOT_FOUND',
    message: 'fictional identity and readable path'
  }), { code: 'BACKUP_NOT_FOUND' });
  assert.deepEqual(runner.safeErrorDetails({
    code: 'UNEXPECTED_OCCURRENCES',
    details: {
      occurrences: [
        { path: 'schedule/*/assignments/<identity>', count: 2 },
        { path: 'schedule/*/readable-id', count: 8 }
      ]
    }
  }), {
    code: 'UNEXPECTED_OCCURRENCES',
    occurrences: [
      { path: 'schedule/*/assignments/<identity>', count: 2 },
      { path: '<structural-path>', count: 8 }
    ]
  });
  assert.deepEqual(runner.safeErrorDetails({
    code: 'INVALID_JOB_ID',
    details: { value: 'fictional readable value' }
  }), { code: 'INVALID_JOB_ID' });
  assert.deepEqual(runner.safeErrorDetails({
    code: 'UNTRUSTED_CODE',
    details: { identity: 'fictional identity' }
  }), { code: 'ERROR' });
});
