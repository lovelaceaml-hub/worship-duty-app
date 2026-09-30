/* Deploys this app's Cloud Functions, each one by name.
     node scripts/deploy-functions.mjs            all of this app's functions
     node scripts/deploy-functions.mjs ics dutyReminders   only these
   The Firebase project also holds another app's functions, so a plain
   `firebase deploy --only functions` would offer to delete them. This script
   never does that: it names every function it deploys. */
import { spawnSync } from 'node:child_process';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = Module.createRequire(path.join(repo, 'functions', 'index.js'));

/* The names functions/index.js exports, read with Firebase Admin stubbed out. */
function exportedNames() {
  const original = Module._load;
  const db = { collection: () => ({ doc: () => ({}) }), runTransaction: () => {}, batch: () => {} };
  Module._load = function load(request, ...rest) {
    if (request === 'firebase-admin/app') return { initializeApp() {} };
    if (request === 'firebase-admin/firestore') return { getFirestore: () => db, FieldValue: { delete() {} } };
    if (request === 'firebase-admin/auth') return { getAuth: () => ({}) };
    if (request === 'firebase-admin/messaging') return { getMessaging: () => ({}) };
    return original.call(this, request, ...rest);
  };
  try { return Object.keys(require('./index.js')).sort(); }
  finally { Module._load = original; }
}

const all = exportedNames();
const wanted = process.argv.slice(2);
const unknown = wanted.filter(name => !all.includes(name));
if (unknown.length) { console.error('Not functions of this app: ' + unknown.join(', ')); process.exit(1); }
const names = wanted.length ? wanted : all;
console.log('Deploying ' + names.length + ' functions: ' + names.join(', '));
const result = spawnSync('npx', ['-y', 'firebase-tools@latest', 'deploy', '--only', names.map(name => 'functions:' + name).join(','), '--project', 'lv-zion-duties'], {
  cwd: repo,
  stdio: 'inherit',
  env: Object.assign({ npm_config_cache: '/tmp/npm-cache' }, process.env)
});
process.exit(result.status === null ? 1 : result.status);
