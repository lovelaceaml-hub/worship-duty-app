import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('browser runtime loads authorization before the app and removes passive identity loading', () => {
  const html = read('index.html');
  const config = read('firebase-config.js');
  assert.ok(html.indexOf('<script src="permissions.js') < html.indexOf('<script type="module" src="app.js'));
  assert.doesNotMatch(config, /member-access\.js/);
  assert.doesNotMatch(config, /wds-me/);
});

test('browser runtime requires verified member auth and gates mutations', () => {
  const app = read('app.js');
  assert.match(app, /verifyMemberPin/);
  assert.match(app, /signInWithCustomToken/);
  assert.match(app, /changeMemberPin/);
  assert.match(app, /mustChangePin/);
  assert.match(app, /if \(fb && \(!isVerifiedSession\(\)/);
  assert.match(app, /canPermission\('canResolveRequest'/);
  assert.match(app, /canPermission\('canAcknowledgeConflict'/);
  assert.match(app, /canPermission\('canEditSongs'/);
  assert.match(app, /_sheetChoirSongSeen/);
  assert.doesNotMatch(app, /data-chg="me"/);
  assert.match(app, /D\. Chloe.*M\. Chloe/);
});

test('Cloud Functions expose the three member PIN callables', () => {
  const functions = read(path.join('functions', 'index.js'));
  assert.match(functions, /exports\.verifyMemberPin\s*=/);
  assert.match(functions, /exports\.changeMemberPin\s*=/);
  assert.match(functions, /exports\.resetMemberPin\s*=/);
  assert.doesNotMatch(functions, /logger\.(info|warn|error).*\bpin\b/i);
});
