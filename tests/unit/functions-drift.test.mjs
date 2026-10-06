// The weekly Functions drift check (.github/scripts/functions-drift.mjs):
// the comparison logic, run on temporary folders. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareTrees, hashTree, parseArgs, isLocalConfig } from '../../.github/scripts/functions-drift.mjs';

function tree(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'drift-test-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

test('identical trees are the same; node_modules is ignored', () => {
  const a = tree({ 'index.js': 'x', 'lib/a.js': 'y', 'node_modules/m/i.js': '1' });
  const b = tree({ 'index.js': 'x', 'lib/a.js': 'y' });
  try {
    assert.equal(compareTrees(hashTree(a), hashTree(b)).same, true);
  } finally { rmSync(a, { recursive: true }); rmSync(b, { recursive: true }); }
});

test('a changed, missing or extra file is reported by name', () => {
  const live = tree({ 'index.js': 'old', 'lib/a.js': 'y', 'extra.js': 'z' });
  const main = tree({ 'index.js': 'new', 'lib/a.js': 'y', 'lib/b.js': 'w' });
  try {
    const r = compareTrees(hashTree(live), hashTree(main));
    assert.equal(r.same, false);
    assert.deepEqual(r.changed, ['index.js']);
    assert.deepEqual(r.onlyLive, ['extra.js']);
    assert.deepEqual(r.onlyMain, ['lib/b.js']);
  } finally { rmSync(live, { recursive: true }); rmSync(main, { recursive: true }); }
});

test('local config files count by name only and never as a difference', () => {
  assert.equal(isLocalConfig('.env.some-project'), true);
  assert.equal(isLocalConfig('lib/a.js'), false);
  const live = tree({ 'index.js': 'x', '.env.some-project': 'A=1' });
  const main = tree({ 'index.js': 'x' });
  try {
    const r = compareTrees(hashTree(live), hashTree(main));
    assert.equal(r.same, true);
    assert.deepEqual(r.localOnlyLive, ['.env.some-project']);
  } finally { rmSync(live, { recursive: true }); rmSync(main, { recursive: true }); }
});

test('arguments are checked', () => {
  assert.equal(parseArgs(['--project', 'lv-zion-duties']).project, 'lv-zion-duties');
  assert.deepEqual(parseArgs(['--project', 'lv-zion-duties', '--not-ours', 'a, b']).notOurs, ['a', 'b']);
  assert.throws(() => parseArgs(['--project', 'Bad Project']));
  assert.throws(() => parseArgs(['--what', 'x']));
});
