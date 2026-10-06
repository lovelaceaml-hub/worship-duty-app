// The backend release guard (.github/scripts/backend-guard.sh, reached through
// deploy-guard.sh and the npx shim): it must accept main as it is, refuse the
// LV Zion sender functions by name, and refuse code a by-name CI deploy
// cannot handle. Each case copies the files the guard reads into a temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guard = path.join(repo, '.github/scripts/deploy-guard.sh');
const SENDERS = ['onVercelScheduleWrite', 'worshipVercelReconcile'];

function copyRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'backend-guard-'));
  mkdirSync(path.join(dir, '.github'), { recursive: true });
  cpSync(path.join(repo, 'firebase.json'), path.join(dir, 'firebase.json'));
  cpSync(path.join(repo, '.github/functions-pinned.txt'), path.join(dir, '.github/functions-pinned.txt'));
  cpSync(path.join(repo, 'functions'), path.join(dir, 'functions'), {
    recursive: true,
    filter: src => !src.includes(path.sep + 'node_modules') && !src.endsWith(path.sep + 'test')
  });
  return dir;
}

function run(args, root, extraEnv = {}) {
  const r = spawnSync('bash', [guard, ...args], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { GUARD_REPO_ROOT: root, GITHUB_STEP_SUMMARY: '' }, extraEnv)
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

function edit(root, file, change) {
  const p = path.join(root, file);
  writeFileSync(p, change(readFileSync(p, 'utf8')));
}

test('main as it is passes the source guard', () => {
  const r = run(['functions-source'], repo);
  assert.equal(r.code, 0, r.out);
});

test('the LV Zion sender functions are refused by name in every mode', () => {
  for (const name of SENDERS) {
    assert.notEqual(run(['functions-scope', name], repo).code, 0, name);
    assert.notEqual(run(['functions-scope', 'checkSheet,' + name], repo).code, 0, name);
    assert.notEqual(run(['command', 'functions', 'npx', '--yes', 'firebase-tools@15', 'deploy', '--only', 'functions:' + name, '--project', 'lv-zion-duties', '--non-interactive'], repo).code, 0, name);
    const root = copyRepo();
    try {
      edit(root, 'functions/index.js', s => s + '\nexports.' + name + ' = 1;\n');
      edit(root, '.github/functions-pinned.txt', s => s + name + '\n');
      const r = run(['functions-source'], root);
      assert.notEqual(r.code, 0, name);
      assert.match(r.out, /never deploy/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('an export missing from the pinned list is refused', () => {
  const root = copyRepo();
  try {
    edit(root, 'functions/index.js', s => s + '\nexports.extraThing = 1;\n');
    assert.notEqual(run(['functions-source'], root).code, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a .env parameter, process.env, any secret, a hook or a .env file is refused', () => {
  for (const line of [
    "const X = require('firebase-functions/params').defineString('X');",
    'const Y = process.env.LV_ZION_WORSHIP_SYNC_URL;',
    "const Z = require('firebase-functions/params').defineSecret('LV_ZION_WORSHIP_SYNC_SECRET');"
  ]) {
    const root = copyRepo();
    try {
      edit(root, 'functions/sheets.js', s => line + '\n' + s);
      assert.notEqual(run(['functions-source'], root).code, 0, line);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  let root = copyRepo();
  try {
    edit(root, 'firebase.json', s => s.replace('"source": "functions"', '"source": "functions", "predeploy": "echo hi"'));
    assert.notEqual(run(['functions-source'], root).code, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
  root = copyRepo();
  try {
    writeFileSync(path.join(root, 'functions/.env.lv-zion-duties'), 'A=1\n');
    assert.notEqual(run(['functions-source'], root).code, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the npx shim runs only the checked backend command', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'npx-shim-'));
  try {
    const fake = path.join(dir, 'npx');
    writeFileSync(fake, '#!/usr/bin/env bash\necho "RAN $*"\n', { mode: 0o755 });
    const shim = path.join(repo, '.github/scripts/npx-guard/npx');
    const go = (mode, args) => spawnSync('bash', [shim, ...args], {
      encoding: 'utf8', env: Object.assign({}, process.env, { REAL_NPX: fake, DEPLOY_GUARD_MODE: mode })
    });
    let r = go('functions', ['--yes', 'firebase-tools@15', 'deploy', '--only', 'functions:checkSheet', '--project', 'lv-zion-duties']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /RAN --yes firebase-tools@15 deploy --only functions:checkSheet --project lv-zion-duties --non-interactive/);
    r = go('functions', ['--yes', 'firebase-tools@15', 'deploy', '--only', 'functions:onVercelScheduleWrite', '--project', 'lv-zion-duties']);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stdout, /RAN/);
    r = go('functions', ['--yes', 'firebase-tools@15', 'deploy', '--only', 'functions', '--project', 'lv-zion-duties']);
    assert.notEqual(r.status, 0);
    r = go('rules', ['--yes', 'firebase-tools@15', 'deploy', '--only', 'firestore:rules', '--project', 'lv-zion-duties']);
    assert.equal(r.status, 0, r.stderr);
    r = go('rules', ['--yes', 'firebase-tools@15', 'deploy', '--only', 'hosting', '--project', 'lv-zion-duties']);
    assert.notEqual(r.status, 0);
    r = go('release', ['--yes', 'firebase-tools@15', 'deploy', '--only', 'functions:checkSheet', '--config', path.join(repo, 'firebase.json'), '--project', 'lv-zion-duties']);
    assert.notEqual(r.status, 0, 'the Hosting release mode still refuses Functions');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the guard self-test passes', () => {
  const r = run(['self-test'], repo);
  assert.equal(r.code, 0, r.out);
});
