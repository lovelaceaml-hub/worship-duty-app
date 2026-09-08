import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = process.env.WORSHIP_SOURCE_ROOT || PROJECT_ROOT;
const EVIDENCE_SCOPE = process.env.WORSHIP_EVIDENCE_SCOPE || (process.env.WORSHIP_SOURCE_ROOT ? 'current-integrated-source' : 'current-source');
const EVIDENCE_ROOT = process.env.WORSHIP_EVIDENCE_ROOT || path.join(PROJECT_ROOT, 'docs/runs/worship-refactor-20260907/research/verification/current');
const BASELINE_REFERENCE = '5beec15d9a9299bed2c51a91c33f157fb769cd79';
const SOURCE_DIGEST_METHOD = 'sha256-v2:path-null-byte-and-file-bytes;order=lexicographic-relative-path';
const RUN_SUFFIX = ((process.env.WORSHIP_EMULATOR_RUN_ID || 'fixture-run') + '-' + process.pid + '-' + randomUUID()).replace(/[^A-Za-z0-9_-]/g, '_');
const { Firestore } = createRequire(path.join(PROJECT_ROOT, 'functions/package.json'))('@google-cloud/firestore');
const projectId = process.env.WORSHIP_EMULATOR_PROJECT || '';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';

function fixtureSetlist(overrides = {}) {
  return Object.assign({
    date: '2026-09-12',
    serviceLabel: 'Morning',
    worshipType: 'Fixture Sabbath',
    presider: 'Jordan Fixture',
    songs: ['fixture-song-001', 'fixture-song-002'],
    source: 'fixture',
    status: 'planned'
  }, overrides);
}

async function discoverRuntimeFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await discoverRuntimeFiles(path.join(directory, entry.name), relative));
    else if (/\.(?:cjs|css|html|js|json|mjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

async function readSourceSnapshot(sourceRoot = SOURCE_ROOT) {
  const rootRuntimeFiles = ['index.html', 'app.js', 'song-app.js', 'song-app.css', 'song-lib.js', 'sw.js', 'manifest.json'];
  const srcRuntimeFiles = await discoverRuntimeFiles(path.join(sourceRoot, 'src'), 'src');
  const files = Array.from(new Set(rootRuntimeFiles.concat(srcRuntimeFiles))).sort();
  const bytes = new Map();
  for (const relative of files) {
    try {
      bytes.set(relative, await readFile(path.join(sourceRoot, relative)));
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return { sourceRoot, bytes, files: files.filter(relative => bytes.has(relative)) };
}

function sourceMetadata(snapshot) {
  assert.ok(snapshot && snapshot.bytes instanceof Map, 'source metadata requires one immutable source snapshot');
  const digest = createHash('sha256');
  const included = [];
  for (const relative of snapshot.files.slice().sort()) {
    const source = snapshot.bytes.get(relative);
    if (!source) continue;
    digest.update(relative + '\0');
    digest.update(source);
    included.push(relative);
  }
  return { digest: digest.digest('hex'), files: included, digestMethod: SOURCE_DIGEST_METHOD, fileOrder: 'lexicographic relative paths', runtime: { node: process.version, platform: process.platform, arch: process.arch } };
}

function requireExplicitEmulator() {
  assert.equal(projectId, 'demo-worship-refactor', 'set WORSHIP_EMULATOR_PROJECT to the fictional emulator project');
  assert.match(emulatorHost, /^127\.0\.0\.1:\d+$/, 'the test accepts loopback Firestore only');
}

function extractFunction(source, functionName) {
  const marker = 'function ' + functionName + '(';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'source must contain ' + functionName);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, functionName + ' must have a body');
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index++; continue; }
    if (char === '/' && next === '*') { blockComment = true; index++; continue; }
    if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(functionName + ' body did not close');
}

async function loadCreateSetlist(sourceSnapshot, adapter, state, pendingSetlists, setlistCreates, alerts, warnings) {
  const source = sourceSnapshot.bytes.get('song-app.js')?.toString('utf8');
  assert.ok(source, 'setlist evaluator must use song-app.js from the immutable source snapshot');
  const functionSource = extractFunction(source, 'createSetlistIfAbsent');
  const sandbox = {
    __QA_FB: adapter,
    __QA_STATE: state,
    __QA_PENDING: pendingSetlists,
    __QA_CREATES: setlistCreates,
    __QA_ALERTS: alerts,
    __QA_WARNINGS: warnings,
    console: { warn: (...args) => warnings.push(args.map(String).join(' ')) },
    alert: message => alerts.push(String(message)),
    Promise, setTimeout, clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext([
    'const fb = globalThis.__QA_FB;',
    'const state = globalThis.__QA_STATE;',
    'const pendingSetlists = globalThis.__QA_PENDING;',
    'const setlistCreates = globalThis.__QA_CREATES;',
    'const alert = globalThis.alert;',
    functionSource,
    'globalThis.__QA_CREATE_SETLIST_IF_ABSENT = createSetlistIfAbsent;'
  ].join('\n'), sandbox, { filename: 'song-app.js.emulator-evaluator' });
  return sandbox;
}

async function writeEvidence(evidence) {
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  const jsonPath = path.join(EVIDENCE_ROOT, 'emulator-setlist-baseline.json');
  const markdownPath = path.join(EVIDENCE_ROOT, 'emulator-setlist-baseline.md');
  await writeFile(jsonPath, JSON.stringify(evidence, null, 2) + '\n');
  const rows = evidence.runs.flatMap(run => [
    '| ' + run.label + ' existing setlist transaction | passed | The actual function preserved songs at `' + run.existingSetlistTransaction.path + '` and issued no transaction set. |',
    '| ' + run.label + ' missing setlist transaction | passed | The actual function created `' + run.missingSetlistTransaction.path + '` from latest in-memory songs and cleared its pending promise. |'
  ]).join('\n');
  const markdown = [
    '# Firestore emulator setlist baseline', '',
    'Baseline reference commit: `' + evidence.baselineReference + '`.', '',
    'Source root: `' + evidence.sourceRoot + '`. Source digest: `' + evidence.sourceRevision.digest + '` using `' + evidence.sourceRevision.method + '` with `' + evidence.sourceRevision.fileOrder + '` over `' + evidence.sourceRevision.files.join('`, `') + '`. Runtime: `' + evidence.runtime.node + '` on `' + evidence.runtime.platform + '/' + evidence.runtime.arch + '`.', '',
    'This check evaluated the actual `createSetlistIfAbsent` function from the selected source root against the explicit fictional emulator project and loopback Firestore host supplied through environment variables. It ran two concurrent bounded runs with unique document suffixes and does not start Functions emulation.', '',
    '| Scenario | Result | Evidence |', '|---|---|---|',
    rows, '',
    'Timings are local emulator write and read measurements, not production performance.', ''
  ].join('\n');
  await writeFile(markdownPath, markdown + '\n');
  return { jsonPath, markdownPath };
}

async function runScenario(sourceSnapshot, label) {
  const runStartedAt = performance.now();
  const db = new Firestore({ projectId });
  const transactionMetrics = { reads: 0, sets: 0 };
  const adapter = {
    db,
    doc(database, collection, id) { return database.collection(collection).doc(id); },
    runTransaction(database, callback) {
      return database.runTransaction(async nativeTransaction => callback({
        async get(ref) {
          transactionMetrics.reads += 1;
          const snapshot = await nativeTransaction.get(ref);
          return { exists: () => snapshot.exists, data: () => snapshot.data(), id: snapshot.id };
        },
        set(ref, value, options) {
          transactionMetrics.sets += 1;
          return nativeTransaction.set(ref, value, options);
        }
      }));
    }
  };
  const runId = RUN_SUFFIX + '-' + label;
  const existingId = 'fixture-setlist-' + runId + '-existing';
  const missingId = 'fixture-setlist-' + runId + '-created';
  const existingRef = db.collection('setlists').doc(existingId);
  const missingRef = db.collection('setlists').doc(missingId);
  const existingServer = fixtureSetlist({ songs: ['fixture-song-001'], notes: 'fixture server note' });
  const existingLocal = fixtureSetlist({ songs: ['fixture-song-004'], notes: 'fixture local note' });
  const latestLocal = fixtureSetlist({ songs: ['fixture-song-003'], notes: 'fixture latest state' });
  const alerts = [];
  const warnings = [];
  const pendingSetlists = {};
  const setlistCreates = {};
  const state = { setlists: {
    [existingId]: existingLocal,
    [missingId]: latestLocal
  } };
  let sandbox;

  try {
    await existingRef.set(existingServer);
    sandbox = await loadCreateSetlist(sourceSnapshot, adapter, state, pendingSetlists, setlistCreates, alerts, warnings);

    const existingStarted = performance.now();
    await sandbox.__QA_CREATE_SETLIST_IF_ABSENT({ id: existingId, date: existingServer.date, service: existingServer.serviceLabel });
    await new Promise(resolve => setImmediate(resolve));
    const existingMs = Math.round((performance.now() - existingStarted) * 100) / 100;
    const existingAfter = await existingRef.get();
    assert.deepEqual(existingAfter.data().songs, existingServer.songs, 'the actual function must not overwrite an existing setlist');
    assert.equal(transactionMetrics.sets, 0, 'an existing setlist must not receive a transaction set');
    assert.equal(setlistCreates[existingId], undefined, 'the existing setlist promise must clear after completion');
    const existingEvidence = {
      status: 'passed',
      path: 'setlists/' + existingId,
      transactionReads: transactionMetrics.reads,
      transactionSets: transactionMetrics.sets,
      songs: existingAfter.data().songs,
      elapsedMs: existingMs
    };

    const readsBeforeMissing = transactionMetrics.reads;
    const setsBeforeMissing = transactionMetrics.sets;
    const missingStarted = performance.now();
    const missingPromise = sandbox.__QA_CREATE_SETLIST_IF_ABSENT({ id: missingId, date: latestLocal.date, service: latestLocal.serviceLabel });
    assert.equal(typeof missingPromise.then, 'function', 'actual function must return its create promise');
    await missingPromise;
    await new Promise(resolve => setImmediate(resolve));
    const missingMs = Math.round((performance.now() - missingStarted) * 100) / 100;
    const missingAfter = await missingRef.get();
    assert.equal(missingAfter.exists, true, 'the actual function must create the missing setlist');
    assert.deepEqual(missingAfter.data().songs, latestLocal.songs, 'the actual function must use latest in-memory songs when creating');
    assert.equal(missingAfter.data().notes, latestLocal.notes, 'the actual function must use latest in-memory fields when creating');
    assert.equal(transactionMetrics.reads, readsBeforeMissing + 1, 'the missing path must read inside a transaction');
    assert.equal(transactionMetrics.sets, setsBeforeMissing + 1, 'the missing path must set inside a transaction');
    assert.equal(setlistCreates[missingId], undefined, 'the missing setlist pending promise must clear after completion');
    assert.deepEqual(alerts, [], 'successful setlist creation must not alert');
    assert.deepEqual(warnings, [], 'successful setlist creation must not warn');
    const missingEvidence = {
      status: 'passed',
      path: 'setlists/' + missingId,
      transactionReads: transactionMetrics.reads,
      transactionSets: transactionMetrics.sets,
      songs: missingAfter.data().songs,
      elapsedMs: missingMs
    };
    return {
      label,
      runId,
      startedAt: runStartedAt,
      finishedAt: performance.now(),
      existingSetlistTransaction: existingEvidence,
      missingSetlistTransaction: missingEvidence
    };
  } finally {
    await Promise.all([existingRef, missingRef].map(ref => ref.delete().catch(() => {})));
    await db.terminate();
  }
}

async function main() {
  requireExplicitEmulator();
  const sourceSnapshot = await readSourceSnapshot();
  const metadata = sourceMetadata(sourceSnapshot);
  const runs = await Promise.all(['alpha', 'beta'].map(label => runScenario(sourceSnapshot, label)));
  const documentPaths = runs.flatMap(run => [run.existingSetlistTransaction.path, run.missingSetlistTransaction.path]);
  assert.equal(new Set(documentPaths).size, documentPaths.length, 'concurrent emulator runs must use unique fictional document paths');
  assert.ok(runs[0].startedAt < runs[1].finishedAt && runs[1].startedAt < runs[0].finishedAt, 'concurrent emulator runs must overlap in execution');
  const evidence = {
    taskId: 'WORSHIP-V-20260907',
    mode: 'firestore-emulator-only',
    baselineReference: BASELINE_REFERENCE,
    sourceRoot: SOURCE_ROOT,
    evidenceScope: EVIDENCE_SCOPE,
    sourceRevision: { kind: 'sha256', method: metadata.digestMethod, fileOrder: metadata.fileOrder, digest: metadata.digest, files: metadata.files },
    runtime: metadata.runtime,
    projectId,
    emulatorHost,
    functionsEmulation: false,
    functionUnderTest: 'createSetlistIfAbsent',
    concurrency: { runCount: runs.length, uniqueDocumentPaths: new Set(documentPaths).size === documentPaths.length, overlapping: true },
    scenarios: {
      existingSetlistTransaction: { status: 'passed', runs: runs.map(run => run.existingSetlistTransaction) },
      missingSetlistTransaction: { status: 'passed', runs: runs.map(run => run.missingSetlistTransaction) }
    },
    runs
  };
  const paths = await writeEvidence(evidence);
  console.log(JSON.stringify({ status: 'passed', evidence: paths, projectId, emulatorHost, functionsEmulation: false, functionUnderTest: 'createSetlistIfAbsent', concurrency: evidence.concurrency, runs: runs.map(run => ({ label: run.label, existingMs: run.existingSetlistTransaction.elapsedMs, missingMs: run.missingSetlistTransaction.elapsedMs })) }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
