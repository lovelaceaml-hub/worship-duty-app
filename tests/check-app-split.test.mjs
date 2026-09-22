import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runCheck, loadAllowlist} from '../scripts/check-app-split.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(cwd, args) {
  execFileSync('git', args, {cwd, stdio: 'pipe'});
}

function makeFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-app-split-'));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), {recursive: true});
    fs.writeFileSync(full, content);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'baseline']);
  const baselineSha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: dir, encoding: 'utf8'}).trim();
  return {dir, baselineSha};
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return path.join(dir, 'manifest.json');
}

const BASELINE_APP = "'use strict';\n\nfunction foo() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}\n";

test('a moved declaration passes', () => {
  const {dir, baselineSha} = makeFixture({'app.js': BASELINE_APP});
  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\n\nfunction bar() {\n  return 2;\n}\n");
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'foo.js'), 'export function foo() {\n  return 1;\n}\n');
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/foo.js', 'app.js'],
    declarations: {foo: 'core/foo.js', bar: 'app.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: false, allowlist: []});
  assert.deepEqual(failures, []);
  fs.rmSync(dir, {recursive: true, force: true});
});

test('an edited body fails', () => {
  const {dir, baselineSha} = makeFixture({'app.js': BASELINE_APP});
  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\n\nfunction bar() {\n  return 2;\n}\n");
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'foo.js'), 'export function foo() {\n  return 99;\n}\n');
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/foo.js', 'app.js'],
    declarations: {foo: 'core/foo.js', bar: 'app.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: false, allowlist: []});
  assert.ok(failures.some(f => f.startsWith('edited: "foo"')), failures.join('\n'));
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a declaration in the wrong module fails', () => {
  const {dir, baselineSha} = makeFixture({'app.js': BASELINE_APP});
  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\n\nfunction bar() {\n  return 2;\n}\n");
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'foo.js'), '/* foo belongs here but is not present */\n');
  fs.writeFileSync(path.join(dir, 'core', 'other.js'), 'export function foo() {\n  return 1;\n}\n');
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/foo.js', 'core/other.js', 'app.js'],
    declarations: {foo: 'core/foo.js', bar: 'app.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: false, allowlist: []});
  assert.ok(failures.some(f => f.startsWith('wrong module: "foo"')), failures.join('\n'));
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a declaration for a not-yet-created module must still be in app.js', () => {
  const {dir, baselineSha} = makeFixture({'app.js': BASELINE_APP});
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/foo.js', 'core/bar.js', 'app.js'],
    declarations: {foo: 'core/foo.js', bar: 'core/bar.js'}
  });

  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'foo.js'), 'export function foo() {\n  return 1;\n}\n');
  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\n\nfunction bar() {\n  return 2;\n}\n");
  const untouched = runCheck({root: dir, baselineSha, manifestPath, gallery: false, allowlist: []});
  assert.deepEqual(untouched.failures, []);

  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\n");
  fs.writeFileSync(path.join(dir, 'core', 'other-bar.js'), 'export function bar() {\n  return 2;\n}\n');
  const manifestPath2 = writeManifest(dir, {
    moduleOrder: ['core/foo.js', 'core/bar.js', 'core/other-bar.js', 'app.js'],
    declarations: {foo: 'core/foo.js', bar: 'core/bar.js'}
  });
  const premature = runCheck({root: dir, baselineSha, manifestPath: manifestPath2, gallery: false, allowlist: []});
  assert.ok(premature.failures.some(f => f.startsWith('premature move: "bar"')), premature.failures.join('\n'));
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a name missing from the gallery scope contract fails', () => {
  const app = "'use strict';\n\nfunction ghost() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}\n\ninit();\n";
  const {dir, baselineSha} = makeFixture({
    'app.js': app,
    'design-gallery/host-bridge.js': 'ghost();'
  });
  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\n\nfunction bar() {\n  return 2;\n}\n\ninit();\n");
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'ghost.js'), 'export function ghost() {\n  return 1;\n}\n');
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/ghost.js', 'app.js'],
    declarations: {ghost: 'core/ghost.js', bar: 'app.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: true, allowlist: []});
  assert.ok(failures.some(f => f.startsWith('gallery scope: "ghost"')), failures.join('\n'));
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a name present in the gallery scope contract through an import passes', () => {
  const app = "'use strict';\n\nfunction ghost() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}\n\ninit();\n";
  const {dir, baselineSha} = makeFixture({
    'app.js': app,
    'design-gallery/host-bridge.js': 'ghost();'
  });
  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\nimport {ghost} from './core/ghost.js';\n\nfunction bar() {\n  return 2;\n}\n\ninit();\n");
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'ghost.js'), 'export function ghost() {\n  return 1;\n}\n');
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/ghost.js', 'app.js'],
    declarations: {ghost: 'core/ghost.js', bar: 'app.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: true, allowlist: []});
  assert.deepEqual(failures, []);
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a gallery scope name reached through a multi-line import passes', () => {
  const app = "'use strict';\n\nfunction ghost() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}\n";
  const {dir, baselineSha} = makeFixture({
    'app.js': app,
    'design-gallery/host-bridge.js': 'ghost(); bar();'
  });
  fs.writeFileSync(
    path.join(dir, 'app.js'),
    "'use strict';\nimport {\n  ghost,\n  bar\n} from './core/leaf.js';\n"
  );
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'core', 'leaf.js'), 'export function ghost() {\n  return 1;\n}\nexport function bar() {\n  return 2;\n}\n');
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/leaf.js', 'app.js'],
    declarations: {ghost: 'core/leaf.js', bar: 'core/leaf.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: true, allowlist: []});
  assert.deepEqual(failures, []);
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a section banner between two differently-assigned declarations does not fail either one', () => {
  const app = "'use strict';\n\nfunction foo() {\n  return 1;\n}\n\n/* ================= next section ================= */\n\nfunction bar() {\n  return 2;\n}\n";
  const {dir, baselineSha} = makeFixture({'app.js': app});
  fs.writeFileSync(path.join(dir, 'app.js'), "'use strict';\n\nfunction bar() {\n  return 2;\n}\n");
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  // The banner physically sits right before bar() in the baseline, so a naive
  // "body runs to the next declaration" extraction attributes it to foo()'s
  // trailing text; foo() must still match here with none of that banner
  // carried over into its moved body.
  fs.writeFileSync(path.join(dir, 'core', 'foo.js'), 'export function foo() {\n  return 1;\n}\n');
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/foo.js', 'app.js'],
    declarations: {foo: 'core/foo.js', bar: 'app.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: false, allowlist: []});
  assert.deepEqual(failures, []);
  fs.rmSync(dir, {recursive: true, force: true});
});

test('a private non-exported local with the same name as a baseline declaration does not collide', () => {
  const app = "'use strict';\n\nfunction foo() {\n  return 1;\n}\n\nlet shared = null;\nfunction useShared() {\n  return shared;\n}\n";
  const {dir, baselineSha} = makeFixture({'app.js': app});
  fs.writeFileSync(
    path.join(dir, 'app.js'),
    "'use strict';\n\nlet shared = null;\nfunction useShared() {\n  return shared;\n}\n"
  );
  fs.mkdirSync(path.join(dir, 'core'), {recursive: true});
  // A module that needs a value still owned by app.js, but avoids importing
  // it back (an import cycle to the entry module breaks evaluation order),
  // declares its own private placeholder of the SAME name instead. It is
  // never exported, so it must not be treated as a rival home for the real,
  // exported "shared"/"foo" that the manifest tracks.
  fs.writeFileSync(
    path.join(dir, 'core', 'foo.js'),
    "let shared;\nexport function setSharedRef(value) { shared = value; }\nexport function foo() {\n  return 1;\n}\n"
  );
  const manifestPath = writeManifest(dir, {
    moduleOrder: ['core/foo.js', 'app.js'],
    declarations: {foo: 'core/foo.js', shared: 'app.js', useShared: 'app.js'}
  });
  const {failures} = runCheck({root: dir, baselineSha, manifestPath, gallery: false, allowlist: []});
  assert.deepEqual(failures, []);
  fs.rmSync(dir, {recursive: true, force: true});
});

test('the current tree passes with its own real allowlist', () => {
  const manifestPath = path.join(repoRoot, 'scripts', 'check-app-split.manifest.json');
  const {failures} = runCheck({
    root: repoRoot,
    baselineSha: 'main',
    manifestPath,
    gallery: true,
    allowlist: loadAllowlist(repoRoot)
  });
  assert.deepEqual(failures, []);
});
