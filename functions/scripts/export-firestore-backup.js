#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function readCollection(collection, output) {
  const snapshot = await collection.get();
  for (const document of snapshot.docs) {
    output[document.ref.path] = document.data();
    const children = await document.ref.listCollections();
    for (const child of children) await readCollection(child, output);
  }
}

async function main() {
  const projectId = argument('--project');
  const outputPath = argument('--output');
  if (!projectId || !outputPath || !path.isAbsolute(outputPath)) {
    throw new Error('Pass --project and an absolute --output path.');
  }
  if (fs.existsSync(outputPath)) throw new Error('The backup output already exists.');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const documents = {};
  const collections = await db.listCollections();
  for (const collection of collections) await readCollection(collection, documents);
  const payload = {
    projectId,
    capturedAt: new Date().toISOString(),
    documentCount: Object.keys(documents).length,
    documents
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), { mode: 0o600, flag: 'wx' });
  process.stdout.write(JSON.stringify({
    projectId,
    capturedAt: payload.capturedAt,
    documentCount: payload.documentCount,
    bytes: fs.statSync(outputPath).size,
    outputPath
  }, null, 2) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error && error.message || error) + '\n');
  process.exitCode = 1;
});
