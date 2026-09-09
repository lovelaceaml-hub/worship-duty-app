'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const identity = require('../identity-lib');

const PRODUCTION_PROJECT_ID = 'lv-zion-duties';
const OPAQUE_JOB_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,127}$/;

function invalidJobIdError() {
  const error = new Error('Rollback job ID must be opaque');
  error.code = 'INVALID_JOB_ID';
  return error;
}

function parseOptions(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const rollbackIndex = args.indexOf('--rollback');
  const hasExecute = args.includes('--execute');
  const hasDryRun = args.includes('--dry-run');

  if (rollbackIndex !== -1) {
    if (args.length !== 2 || rollbackIndex !== 0) {
      throw new Error('Choose one correction mode; --rollback requires one opaque job ID');
    }
    if (hasExecute || hasDryRun) {
      throw new Error('Choose one correction mode');
    }
    const jobId = args[1];
    if (typeof jobId !== 'string' || !OPAQUE_JOB_ID.test(jobId)) {
      throw invalidJobIdError();
    }
    return { rollbackJobId: jobId };
  }

  const unknown = args.filter(arg => arg !== '--execute' && arg !== '--dry-run');
  if (unknown.length) {
    throw new Error('Only --execute and --dry-run are supported; --rollback requires one opaque job ID');
  }
  if (hasExecute && hasDryRun) {
    throw new Error('Choose one correction mode');
  }
  return { execute: hasExecute };
}

function validateRollbackJobId(value) {
  if (typeof value !== 'string' || !OPAQUE_JOB_ID.test(value)) {
    throw invalidJobIdError();
  }
  return value;
}

function validateIdentityInput(value) {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('Identity values must be nonblank exact text');
  }
  return value;
}

function readHidden(question, io) {
  const input = (io && io.input) || process.stdin;
  const output = (io && io.output) || process.stderr;
  if (typeof input.setRawMode !== 'function' || !input.isTTY) {
    return Promise.reject(new Error('Interactive non-echo input is required'));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    let settled = false;
    const wasRaw = !!input.isRaw;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      input.removeListener('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(result);
    };
    const onData = chunk => {
      const text = Buffer.from(chunk).toString('utf8');
      for (const character of text) {
        const code = character.charCodeAt(0);
        if (code === 3) {
          finish(new Error('Interactive input cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish(null, value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    output.write(question + ': ');
    input.on('data', onData);
    input.setRawMode(true);
    input.resume();
  });
}

async function promptIdentities(io) {
  const from = validateIdentityInput(await readHidden('Old identity', io));
  const to = validateIdentityInput(await readHidden('Canonical identity', io));
  if (from === to) throw new Error('Identity correction cannot link an identity to itself');
  return { from, to };
}

function safeErrorDetails(error) {
  const allowedCodes = new Set([
    'ERROR', 'BLANK_IDENTITY', 'SELF_LINK', 'CYCLE', 'INVALID_MAP', 'INVALID_DB',
    'INVALID_CAP', 'TARGET_CAP', 'UNEXPECTED_OCCURRENCES', 'TRANSACTION_REQUIRED', 'INVALID_PLAN', 'JOB_EXISTS',
    'OPTIMISTIC_SCOPE_CONFLICT', 'OPTIMISTIC_CONFLICT', 'BACKUP_NOT_FOUND',
    'BACKUP_NOT_ACTIVE', 'BACKUP_INCOMPLETE', 'BACKUP_TARGET_MISSING', 'ROLLBACK_CONFLICT',
    'INVALID_JOB_ID'
  ]);
  const requestedCode = error && error.code ? String(error.code) : 'ERROR';
  const code = allowedCodes.has(requestedCode) ? requestedCode : 'ERROR';
  if (code === 'UNEXPECTED_OCCURRENCES') {
    const safePath = /^(?:app(?:\/(?:nameMap|members|departments|presiders|settings))?|schedule|setlists|songStats|requests|tokens)\/\*\/(?:map|list|names|schedulerName|assignments|conflictOk|presider|confirmedBy|updatedBy|history|by|name|resolvedBy|\[\]|<identity>|<key>)(?:\/(?:map|list|names|schedulerName|assignments|conflictOk|presider|confirmedBy|updatedBy|history|by|name|resolvedBy|\[\]|<identity>|<key>))*$/;
    const occurrences = error.details && Array.isArray(error.details.occurrences)
      ? error.details.occurrences.map(item => ({
        path: typeof item.path === 'string' && safePath.test(item.path)
          ? item.path : '<structural-path>',
        count: Number.isSafeInteger(item.count) && item.count >= 0 ? item.count : 0
      }))
      : [];
    return { code, occurrences };
  }
  if (code === 'TARGET_CAP' || code === 'OPTIMISTIC_SCOPE_CONFLICT' || code === 'OPTIMISTIC_CONFLICT') {
    return { code };
  }
  return { code };
}

async function runCorrection(options) {
  const opts = options || {};
  if (!opts.db || typeof opts.db.collection !== 'function') throw new Error('Firestore adapter is required');
  const lib = opts.identity || identity;
  const identities = await promptIdentities(opts.io);
  const from = validateIdentityInput(identities.from);
  const to = validateIdentityInput(identities.to);
  if (from === to) throw new Error('Identity correction cannot link an identity to itself');

  const plan = await lib.planCorrection(opts.db, { [from]: to }, {
    existingNameMap: opts.existingNameMap
  });
  const summary = lib.describePlan(plan);
  const output = opts.output || console;
  if (!opts.execute) {
    output.log(JSON.stringify({ mode: 'dry-run', ...summary }));
    return { mode: 'dry-run', plan, summary };
  }

  const result = await lib.applyCorrection(opts.db, plan, { jobId: opts.jobId });
  output.log(JSON.stringify({ mode: 'execute', ...result }));
  return { mode: 'execute', plan, summary: result };
}

function sanitizedRollbackResult(result, jobId) {
  const source = result && typeof result === 'object' ? result : {};
  const targetCount = Number.isSafeInteger(source.targetCount) && source.targetCount >= 0
    ? source.targetCount : 0;
  const allowedKinds = new Set([
    'app/nameMap', 'app/members', 'app/departments', 'app/presiders', 'app/settings',
    'schedule', 'setlists', 'songStats', 'requests', 'tokens'
  ]);
  const collectionKinds = Array.isArray(source.collectionKinds)
    ? Array.from(new Set(source.collectionKinds
      .filter(kind => typeof kind === 'string' && allowedKinds.has(kind)))).sort()
    : [];
  return { jobId, targetCount, collectionKinds };
}

async function runRollback(options) {
  const opts = options || {};
  const jobId = validateRollbackJobId(opts.rollbackJobId);
  if (!opts.db || typeof opts.db.collection !== 'function') throw new Error('Firestore adapter is required');
  const lib = opts.identity || identity;
  const result = await lib.rollbackCorrection(opts.db, jobId);
  const summary = sanitizedRollbackResult(result, jobId);
  const output = opts.output || console;
  output.log(JSON.stringify({ mode: 'rollback', ...summary }));
  return { mode: 'rollback', summary };
}

async function run(options) {
  const opts = options || {};
  if (opts.rollbackJobId !== undefined) return runRollback(opts);
  return runCorrection(opts);
}

async function main(argv, dependencies) {
  const options = parseOptions(argv == null ? process.argv.slice(2) : argv);
  const injected = dependencies || {};
  if (typeof injected.run === 'function') return injected.run(options);
  if (injected.db) {
    return run(Object.assign({}, injected, options));
  }
  const configuredProjects = [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT]
    .filter(Boolean);
  if (process.env.FIRESTORE_EMULATOR_HOST ||
      configuredProjects.some(project => project !== PRODUCTION_PROJECT_ID)) {
    throw new Error('Direct correction runner refuses emulator or non-production project configuration');
  }
  const app = (injected.initializeApp || initializeApp)({ projectId: PRODUCTION_PROJECT_ID });
  const db = (injected.getFirestore || getFirestore)(app);
  return run(Object.assign({}, options, {
    db,
    identity: injected.identity,
    io: injected.io,
    output: injected.output
  }));
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ error: safeErrorDetails(error) }));
    process.exitCode = 1;
  });
}

module.exports = {
  parseOptions,
  validateIdentityInput,
  validateRollbackJobId,
  readHidden,
  promptIdentities,
  safeErrorDetails,
  runCorrection,
  runRollback,
  run,
  main,
  PRODUCTION_PROJECT_ID
};
