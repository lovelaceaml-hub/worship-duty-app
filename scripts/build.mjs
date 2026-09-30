/* Builds the Hosting files into dist/.
     node scripts/build.mjs                 a normal build
     WDS_MAINTENANCE=1 node scripts/build.mjs   shows the "being updated" screen
     node scripts/build.mjs --out <folder>  builds somewhere else (the tests do)
   Every file reference gets this build's ?v= stamp (asset links and the
   modules' own imports), so a phone never mixes files from two releases.
   firebase.json runs this before every Hosting deploy. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outAt = process.argv.indexOf('--out');
const dist = outAt === -1 ? path.join(repo, 'dist') : path.resolve(process.argv[outAt + 1]);
const stamp = process.env.RELEASE_STAMP || 'r' + Date.now();
const maintenance = process.env.WDS_MAINTENANCE === '1';
if (!/^[A-Za-z0-9]+$/.test(stamp)) throw new Error('The release stamp may use letters and digits only.');

const FILES = ['index.html', 'permissions.js', 'firebase-config.js', 'song-lib.js', 'song-seed.js', 'sw.js', 'manifest.json', 'icon.svg'];
const FOLDERS = ['app', 'styles'];

async function listFiles(folder) {
  const out = [];
  for (const entry of await fs.readdir(path.join(repo, folder), { withFileTypes: true })) {
    const relative = path.join(folder, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(relative));
    else if (entry.name !== 'package.json') out.push(relative);
  }
  return out;
}

/* Stamp relative module imports: from './x.js', import './x.js', import('../x.js'). */
const IMPORT = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g;
function stampImports(text) {
  return text.replace(IMPORT, (_all, lead, quote, file) => lead + quote + file + '?v=' + stamp + quote);
}

await fs.rm(dist, { recursive: true, force: true });
const files = FILES.concat(...await Promise.all(FOLDERS.map(listFiles)));
for (const file of files) {
  const target = path.join(dist, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!/\.(js|css|html|json)$/.test(file)) { await fs.copyFile(path.join(repo, file), target); continue; }
  let text = (await fs.readFile(path.join(repo, file), 'utf8')).replaceAll('?v=DEV', '?v=' + stamp);
  if (file.startsWith('app' + path.sep)) text = stampImports(text);
  if (file === 'sw.js') text = text.replace("const RELEASE = 'DEV';", "const RELEASE = '" + stamp + "';");
  if (file === 'index.html' && maintenance) text = text.replace('<html lang="en">', '<html lang="en" data-maintenance="on">');
  if (text.includes('?v=DEV') || text.includes("RELEASE = 'DEV'")) throw new Error(file + ' still has an unstamped reference.');
  if (file.startsWith('app' + path.sep) && /(\bfrom\s*|\bimport\s*\(?\s*)['"]\.{1,2}\/[^'"?]+\.js['"]/.test(text)) throw new Error(file + ' has an unstamped import.');
  await fs.writeFile(target, text);
}

let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(); } catch (_error) { /* not a git checkout */ }
await fs.writeFile(path.join(dist, 'release.json'), JSON.stringify({ release: stamp, commit, maintenance, builtAt: new Date().toISOString() }, null, 2));
console.log('Built ' + (path.relative(repo, dist) || '.') + ' (' + files.length + ' files, release ' + stamp + (commit ? ', commit ' + commit : '') + (maintenance ? ', maintenance screen on' : '') + ').');
