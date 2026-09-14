import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('root Firebase Hosting config blocks an unguarded direct deploy', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.equal(config.hosting.predeploy, 'node scripts/guard-gallery-deploy.mjs');
  const result = spawnSync(process.execPath, ['scripts/guard-gallery-deploy.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, WDS_GALLERY_RELEASE: ''}
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /direct Firebase Hosting deploys can remove the four designs/);
});

test('gallery publisher is the only guarded Hosting release path', () => {
  const result = spawnSync(process.execPath, ['scripts/guard-gallery-deploy.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, WDS_GALLERY_RELEASE: '1'}
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /gallery release guard passed/);
  assert.match(read('design-gallery/release.mjs'), /WDS_GALLERY_RELEASE:'1'/);
  assert.match(read('scripts/deploy.sh'), /exec node design-gallery\/release\.mjs --publish/);
  assert.match(read('design-gallery/build.mjs'), /guard-gallery-deploy\.mjs/);
  assert.match(read('design-gallery/build.mjs'), /'scripts\/\*\*'/);
});
