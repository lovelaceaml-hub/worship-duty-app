/** Build one deployable app with four appearances: Original, Prism, Navy &
 * Cream, Aurora. Unlike the retired gallery compiler, this is a plain
 * packager: it copies the allowlisted browser files as-is (only the ?v=DEV
 * stamp is rewritten, plus the service worker RELEASE constant), verifies
 * the four layout modules satisfy the shared renderer contract, and syntax
 * checks every staged script. It never reads docs/design/, prototype/, or
 * prototype-prism/, and it never rewrites app.js or song-app.js source text
 * beyond that one stamp substitution.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, '.hosting-gallery');
const read = p => fs.readFile(path.join(root, p), 'utf8');
const hash = s => createHash('sha1').update(s).digest('hex');

const stamp = process.env.RELEASE_STAMP || ('gallery' + Date.now());
if (!/^[a-zA-Z0-9]+$/.test(stamp)) throw new Error('Invalid release stamp');

const ROOT_FILES = [
  'index.html', 'app.js', 'sw.js', 'appearance-boot.js',
  'seed-data.js', 'permissions.js', 'firebase-config.js',
  'song-app.js', 'song-app.css', 'song-seed.js', 'song-lib.js',
  'icon.svg', 'manifest.json'
];
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.svg']);
const DIRS = ['shared', 'layouts', 'styles'];

async function copyDir(relDir) {
  const srcDir = path.join(root, relDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  const staged = [];
  for (const entry of entries) {
    if (entry.isDirectory()) { staged.push(...await copyDir(path.join(relDir, entry.name))); continue; }
    const relPath = path.join(relDir, entry.name);
    const ext = path.extname(entry.name);
    const destPath = path.join(dest, relPath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    if (TEXT_EXTENSIONS.has(ext)) {
      const text = await fs.readFile(path.join(root, relPath), 'utf8');
      await fs.writeFile(destPath, text.replaceAll('?v=DEV', '?v=' + stamp));
    } else {
      await fs.copyFile(path.join(root, relPath), destPath);
    }
    staged.push(relPath);
  }
  return staged;
}

await fs.rm(dest, { recursive: true, force: true });
await fs.mkdir(dest, { recursive: true });

const upstream = {
  app: hash(await read('app.js')),
  songs: hash(await read('song-app.js')),
  index: hash(await read('index.html'))
};

const staged = [];
for (const name of ROOT_FILES) {
  const ext = path.extname(name);
  const destPath = path.join(dest, name);
  if (name === 'sw.js') {
    let sw = await read('sw.js');
    const before = sw;
    sw = sw.replace("const RELEASE = 'DEV';", `const RELEASE = '${stamp}';`);
    if (sw === before) throw new Error('Design gallery source drift: service-worker RELEASE stamp not found');
    await fs.writeFile(destPath, sw);
  } else if (TEXT_EXTENSIONS.has(ext)) {
    const text = await read(name);
    await fs.writeFile(destPath, text.replaceAll('?v=DEV', '?v=' + stamp));
  } else {
    await fs.copyFile(path.join(root, name), destPath);
  }
  staged.push(name);
}
for (const dir of DIRS) staged.push(...await copyDir(dir));

/* Verify the staged four-layout contract before anything is ever previewed
   or published: a new feature cannot ship with a placement in only some
   appearances. Imported from the STAGED copy, not the source tree, so this
   checks exactly what would be deployed. */
const { verifyLayouts } = await import(path.join(dest, 'layouts', 'index.js') + '?check=' + stamp);
verifyLayouts();

/* Syntax check every staged script. Modules and classic scripts both parse
   fine under --check; app.js and song-app.js are the two files most likely
   to have been hand-edited alongside this build. */
const jsFiles = staged.filter(p => p.endsWith('.js'));
for (const rel of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(dest, rel)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Syntax check failed for ' + rel + ':\n' + result.stderr);
}

await fs.mkdir(path.join(dest, 'scripts'), { recursive: true });
await fs.copyFile(path.join(root, 'scripts', 'guard-gallery-deploy.mjs'), path.join(dest, 'scripts', 'guard-gallery-deploy.mjs'));

const config = JSON.parse(await read('firebase.json'));
config.hosting.public = '.';
config.hosting.ignore = ['firebase.gallery.json', 'scripts/**'];
for (const source of ['appearance-boot.js', 'shared/**', 'layouts/**', 'styles/**']) {
  config.hosting.headers.push({ source, headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] });
}
await fs.writeFile(path.join(dest, 'firebase.gallery.json'), JSON.stringify(config, null, 2));

const manifest = {
  release: stamp,
  design: 'appearance-gallery-v2',
  choices: ['classic', 'prism', 'navy', 'aurora'],
  upstream,
  builtAt: new Date().toISOString()
};
await fs.writeFile(path.join(dest, 'design-gallery-release.json'), JSON.stringify(manifest, null, 2));

console.log('Built ' + path.relative(root, dest) + ' for Original + Prism + Navy & Cream + Aurora. Not deployed.');
console.log(JSON.stringify(manifest, null, 2));

export { manifest, root, dest, hash };
