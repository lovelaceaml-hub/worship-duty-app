#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  dryRunHistorySeed,
  applyProfileWritePlan
} = require('../department-seed.js');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function snapshotData(snapshot) {
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

function documentReference(db, documentPath) {
  const pieces = documentPath.split('/').filter(Boolean);
  if (pieces.length < 2 || pieces.length % 2 !== 0) throw new Error(`Invalid document path: ${documentPath}`);
  let reference = db.collection(pieces[0]).doc(pieces[1]);
  for (let index = 2; index < pieces.length; index += 2) {
    reference = reference.collection(pieces[index]).doc(pieces[index + 1]);
  }
  return reference;
}

async function readProductionState(db) {
  const [scheduleSnapshot, accountsSnapshot] = await Promise.all([
    db.collection('schedule').get(),
    db.collection('accounts').get()
  ]);
  const profiles = [];
  const departments = ['Worship', 'Usher Sisters', 'Usher Brothers', 'Lobby', 'Translation', 'Media', 'Parking Lot', 'Offering'];
  for (const department of departments) {
    const members = await db.collection('departments').doc(department).collection('members').get();
    members.docs.forEach(member => profiles.push({
      id: member.id,
      departmentId: department,
      memberUid: member.id,
      ...member.data()
    }));
  }
  const identities = accountsSnapshot.docs.map(document => {
    const data = document.data() || {};
    return {
      uid: data.authUid || `member:${document.id}`,
      memberName: data.memberName || data.name || document.id,
      aliases: Array.isArray(data.aliases) ? data.aliases : []
    };
  });
  return {
    services: snapshotData(scheduleSnapshot),
    identities,
    profiles
  };
}

function transactionAdapter(db) {
  return {
    runTransaction(callback) {
      return db.runTransaction(transaction => callback({
        get(documentPath) {
          return transaction.get(documentReference(db, documentPath));
        },
        set(documentPath, value) {
          transaction.set(documentReference(db, documentPath), value, { merge: false });
        },
        delete(documentPath) {
          transaction.delete(documentReference(db, documentPath));
        }
      }));
    }
  };
}

async function main() {
  const projectId = argument('--project');
  const outputPath = argument('--output');
  const apply = process.argv.includes('--apply');
  if (!projectId || !outputPath || !path.isAbsolute(outputPath)) {
    throw new Error('Pass --project and an absolute --output path.');
  }
  if (apply && !process.argv.includes('--confirm-production-migration')) {
    throw new Error('Apply mode requires --confirm-production-migration.');
  }
  if (fs.existsSync(outputPath)) throw new Error('The migration output already exists.');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const source = await readProductionState(db);
  const seededAt = Date.now();
  const dryRun = dryRunHistorySeed(source, {
    seededAt,
    seededBy: 'department-profile-production-migration',
    source: 'history-seed'
  });
  let application = { applied: false, mode: 'dry-run', writesAttempted: 0 };
  if (apply) {
    application = await applyProfileWritePlan(dryRun.writePlan, transactionAdapter(db), { execute: true });
  }
  const result = {
    projectId,
    generatedAt: new Date().toISOString(),
    dryRun: !apply,
    sourceCounts: {
      services: source.services.length,
      identities: source.identities.length,
      profiles: source.profiles.length
    },
    skipped: dryRun.seedPlan.skipped,
    counts: dryRun.writePlan.counts,
    paths: dryRun.writePlan.writes.map(write => write.path),
    rollbackPlan: dryRun.rollbackPlan,
    application
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
  process.stdout.write(JSON.stringify({
    projectId,
    dryRun: result.dryRun,
    sourceCounts: result.sourceCounts,
    skipped: result.skipped.length,
    counts: result.counts,
    application: result.application,
    outputPath
  }, null, 2) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error && error.message || error) + '\n');
  process.exitCode = 1;
});
