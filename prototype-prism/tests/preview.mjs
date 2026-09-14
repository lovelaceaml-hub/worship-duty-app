import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const protectedFiles = ['index.html', 'app.js', 'seed-data.js', 'song-app.js', 'song-app.css'];

async function hashes() {
  return Object.fromEntries(await Promise.all(protectedFiles.map(async file => [
    file,
    createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex')
  ])));
}

const before = await hashes();
execFileSync(process.execPath, [path.join(root, 'prototype-prism/build.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--test', path.join(root, 'prototype-prism/tests/calendar-navigation.mjs')], { stdio: 'inherit' });
assert.deepEqual(await hashes(), before, 'Prism preview build must not edit production source files');
const output = await fs.readFile(path.join(root, 'prototype-prism/dist/index.html'), 'utf8');
assert.match(output, /lv-prism-preview-v1:/, 'Prism preview must use an isolated storage namespace');
assert.match(output, /Content-Security-Policy/, 'Prism preview must retain its offline policy');
console.log('PASS Prism preview build and current calendar behavior');
