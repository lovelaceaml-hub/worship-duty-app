#!/usr/bin/env node
'use strict';
// Current service metadata and public song catalog. Never export accounts, credentials, or member records.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const adminRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, applicationDefault } = adminRequire('firebase-admin/app');
const { getFirestore } = adminRequire('firebase-admin/firestore');
function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw new Error('Public song catalog has an unfinished quoted field.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
async function publicCatalog() {
  const source = fs.readFileSync(path.resolve(__dirname, '../song-app.js'), 'utf8');
  const url = source.match(/const CATALOG_CSV_URL = '([^']+)'/)?.[1];
  const overrideText = source.match(/const TITLE_OVERRIDES = (\{[^\n]*\});/)?.[1];
  if (!overrideText) throw new Error('Current song title overrides could not be identified.');
  const overrides = JSON.parse(overrideText.replace(/'([^']*)'/g, (_, value) => JSON.stringify(value)));
  if (!url) throw new Error('The current app catalog source could not be identified.');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('The current public song catalog could not be read.');
  const rows = parseCSV(await response.text());
  const headerIndex = rows.findIndex(row => row.includes('Category') && row.includes('Duration'));
  if (headerIndex < 0) throw new Error('Song catalog header is missing.');
  const header = rows[headerIndex];
  const songs = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const value = key => String(row[header.indexOf(key)] || '').trim();
    const raw = value('#'), title = value('New Song');
    const appendix = raw.match(/^Appx\.?\s*(\d+)$/i), number = raw.match(/^\d+$/);
    const duration = value('Duration').match(/^(\d+):([0-5]?\d)$/);
    if ((!appendix && !number) || !title || !duration) continue;
    const id = appendix ? 'appx-' + Number(appendix[1]) : String(Number(raw)).padStart(3, '0');
    songs.push({ id, number: appendix ? 'Appx. ' + Number(appendix[1]) : id,
      title: Object.hasOwn(overrides, id) ? overrides[id] : title, category: value('Category'),
      durationSec: Number(duration[1]) * 60 + Number(duration[2]) });
  }
  if (songs.length < 400 || new Set(songs.map(song => song.id)).size !== songs.length) throw new Error('Public song catalog is incomplete or has duplicate IDs.');
  return songs;
}
async function main() {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output)) throw new Error('Pass an absolute output path outside the repository.');
  const repo = fs.realpathSync(path.resolve(__dirname, '..'));
  const parent = fs.realpathSync(path.dirname(output));
  const target = path.join(parent, path.basename(output));
  if (target === repo || target.startsWith(repo + path.sep)) throw new Error('Preview snapshots must remain outside Git.');
  if (fs.existsSync(target)) throw new Error('Choose a new output file so an existing snapshot is preserved.');
  initializeApp({ credential: applicationDefault(), projectId: 'lv-zion-duties' });
  const snapshot = await getFirestore().collection('schedule').select('date', 'service', 'worship', 'time').get();
  const services = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
  const songs = await publicCatalog();
  const payload = { songs, catalogSource: 'Existing public song catalog used by the live app', catalogCapturedAt: new Date().toISOString(), capturedAt: new Date().toISOString(), source: 'Current Worship Duty service dates and labels', assignmentsIncluded: false, members: [], services };
  fs.writeFileSync(target, 'window.PREVIEW_DATA = ' + JSON.stringify(payload) + ';\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ capturedAt: payload.capturedAt, services: services.length, songs: songs.length, months: [...new Set(services.map(service => String(service.date).slice(0, 7)))] }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
