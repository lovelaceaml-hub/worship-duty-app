#!/usr/bin/env node
/* Read-only "are the live Cloud Functions the code on main?" check.

   node .github/scripts/functions-drift.mjs --project <id> [--pinned .github/functions-pinned.txt]
        [--not-ours name,name] [--summary <file>]

   Needs ACCESS_TOKEN (a short-lived Google token for an identity that holds
   only roles/cloudfunctions.viewer on the project and roles/storage.objectViewer
   on the gcf-v2-sources-<number>-<region> buckets). For each deployed 2nd gen
   function it downloads the source zip the deploy uploaded, unzips it into a
   temporary folder, and compares file names and SHA-256 hashes with functions/
   in this checkout. It writes only names and "same" or "different" to the
   summary: never file contents, never environment values.

   --not-ours lists functions that live in the project but are deployed from
   elsewhere on purpose; they are listed as such and not compared.

   Exit code: 0 when the check ran (differences are reported as warnings),
   1 when it could not run. The workflow turns differences into a "warn" beat. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseArgs(argv) {
  const out = { project: '', pinned: '.github/functions-pinned.txt', notOurs: [], summary: process.env.GITHUB_STEP_SUMMARY || '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--project') { out.project = v; i++; }
    else if (a === '--pinned') { out.pinned = v; i++; }
    else if (a === '--not-ours') { out.notOurs = String(v || '').split(',').map(s => s.trim()).filter(Boolean); i++; }
    else if (a === '--summary') { out.summary = v; i++; }
    else throw new Error('unknown argument ' + a);
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(out.project || '')) throw new Error('--project must be a Google Cloud project id');
  return out;
}

export function readPinned(file) {
  return readFileSync(file, 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
}

/* Files firebase-tools leaves out of a Functions upload, plus local config
   files that are compared by name only (their values are never read here). */
const SKIP_DIRS = new Set(['node_modules', '.git']);
export function isLocalConfig(rel) {
  const base = path.posix.basename(rel);
  return base.startsWith('.env') || base === '.runtimeconfig.json' || base.endsWith('.local') || /^firebase-debug(\..*)?\.log$/.test(base);
}

export function hashTree(root) {
  const files = new Map();
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        files.set(rel, isLocalConfig(rel) ? 'local-config' : createHash('sha256').update(readFileSync(full)).digest('hex'));
      }
    }
  };
  walk(root);
  return files;
}

/* Compare two hash maps; local config files only count by presence. */
export function compareTrees(live, main) {
  const changed = [], onlyLive = [], onlyMain = [], localOnlyLive = [];
  for (const [rel, h] of live) {
    if (!main.has(rel)) { (h === 'local-config' ? localOnlyLive : onlyLive).push(rel); continue; }
    if (h !== main.get(rel)) changed.push(rel);
  }
  for (const rel of main.keys()) if (!live.has(rel) && main.get(rel) !== 'local-config') onlyMain.push(rel);
  const same = !changed.length && !onlyLive.length && !onlyMain.length;
  return { same, changed: changed.sort(), onlyLive: onlyLive.sort(), onlyMain: onlyMain.sort(), localOnlyLive: localOnlyLive.sort() };
}

async function google(url, token, asBuffer = false) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status + ' from ' + new URL(url).host);
    err.status = res.status;
    throw err;
  }
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
}

async function listFunctions(project, token) {
  const all = [];
  let page = '';
  do {
    const url = 'https://cloudfunctions.googleapis.com/v2/projects/' + project + '/locations/-/functions?pageSize=200' + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const j = await google(url, token);
    all.push(...(j.functions || []));
    page = j.nextPageToken || '';
  } while (page);
  return all;
}

function short(list, n = 8) {
  if (!list.length) return '';
  return list.slice(0, n).map(s => '`' + s + '`').join(', ') + (list.length > n ? ' and ' + (list.length - n) + ' more' : '');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = process.env.ACCESS_TOKEN || '';
  if (!token) throw new Error('ACCESS_TOKEN is not set');
  const pinned = readPinned(path.resolve(repo, opts.pinned));
  const mainTree = hashTree(path.join(repo, 'functions'));
  const deployed = await listFunctions(opts.project, token);
  const rows = [];
  let differences = 0;
  const seen = new Set();
  for (const fn of deployed.sort((a, b) => a.name.localeCompare(b.name))) {
    const id = fn.name.split('/').pop();
    const region = fn.name.split('/')[3];
    seen.add(id);
    const updated = (fn.updateTime || '').slice(0, 16).replace('T', ' ');
    if (opts.notOurs.includes(id)) { rows.push([id, region, updated, 'deployed from elsewhere on purpose (not compared)']); continue; }
    if (!pinned.includes(id)) { rows.push([id, region, updated, 'live but not in main (orphan?)']); differences++; continue; }
    const src = ((fn.buildConfig || {}).source || {}).storageSource;
    if (!src || !src.bucket || !src.object) { rows.push([id, region, updated, 'could not find the deployed source (1st gen or missing)']); differences++; continue; }
    const work = mkdtempSync(path.join(tmpdir(), 'drift-'));
    try {
      const url = 'https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(src.bucket) + '/o/' + encodeURIComponent(src.object) + '?alt=media' + (src.generation ? '&generation=' + encodeURIComponent(src.generation) : '');
      let zip;
      try { zip = await google(url, token, true); }
      catch (e) { rows.push([id, region, updated, 'source zip not readable (' + e.message + ')']); differences++; continue; }
      writeFileSync(path.join(work, 'source.zip'), zip);
      execFileSync('unzip', ['-qq', '-o', path.join(work, 'source.zip'), '-d', path.join(work, 'src')], { stdio: 'ignore' });
      const cmp = compareTrees(hashTree(path.join(work, 'src')), mainTree);
      if (cmp.same) {
        rows.push([id, region, updated, 'same' + (cmp.localOnlyLive.length ? ' (plus ' + cmp.localOnlyLive.length + ' local config file(s) by name only)' : '')]);
      } else {
        differences++;
        const parts = [];
        if (cmp.changed.length) parts.push('changed: ' + short(cmp.changed));
        if (cmp.onlyMain.length) parts.push('only on main: ' + short(cmp.onlyMain));
        if (cmp.onlyLive.length) parts.push('only live: ' + short(cmp.onlyLive));
        rows.push([id, region, updated, 'DIFFERENT (' + parts.join('; ') + ')']);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  for (const id of pinned) if (!seen.has(id)) { rows.push([id, '', '', 'in main but NOT deployed']); differences++; }

  const lines = [
    '### Cloud Functions drift check: ' + opts.project,
    '',
    'Compared each deployed function\'s source with `functions/` on main at `' + (process.env.GITHUB_SHA || 'local').slice(0, 7) + '`.',
    '',
    '| Function | Region | Last deployed (UTC) | Result |',
    '|---|---|---|---|',
    ...rows.map(([id, region, updated, result]) => '| `' + id + '` | ' + (region || '-') + ' | ' + (updated || '-') + ' | ' + result + ' |'),
    '',
    differences ? '**' + differences + ' function(s) differ from main.** A backend release of those functions (or a reviewed revert) brings them back in line.' : 'Every function matches main.'
  ];
  const text = lines.join('\n') + '\n';
  if (opts.summary) appendFileSync(opts.summary, text);
  process.stdout.write(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'differences=' + differences + '\n');
  if (differences) console.log('::warning title=Functions drift::' + differences + ' function(s) in ' + opts.project + ' differ from main (see the job summary).');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('::error::The drift check could not run: ' + err.message);
    process.exit(1);
  });
}
