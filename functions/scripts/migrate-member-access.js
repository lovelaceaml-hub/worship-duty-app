'use strict';

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { hashPin, DEFAULT_PIN } = require('../member-auth');
const { createFirestoreStore, migrateMemberAccess } = require('../migrate-member-access');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function main() {
  const projectId = argument('--project');
  const apply = process.argv.includes('--apply');
  if (!projectId) throw new Error('Pass --project with the Firebase project id.');
  if (apply && !process.argv.includes('--confirm-production-migration')) {
    throw new Error('Apply mode requires --confirm-production-migration.');
  }
  initializeApp({ credential: applicationDefault(), projectId });
  const privilegedPinHash = await hashPin(DEFAULT_PIN);
  const result = await migrateMemberAccess({
    store: createFirestoreStore(getFirestore()),
    privilegedPinHash,
    dryRun: !apply
  });
  process.stdout.write(JSON.stringify({
    migrationId: result.migrationId,
    dryRun: result.dryRun,
    changed: result.changed,
    counts: result.counts,
    paths: result.writes.map(write => write.path)
  }, null, 2) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error && error.message || error) + '\n');
  process.exitCode = 1;
});
