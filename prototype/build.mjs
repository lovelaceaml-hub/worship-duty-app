/** Build a review-only, offline app from the repository's real runtime.
 * Run from the repository root: node prototype/build.mjs
 * No source application files are modified; no Firebase configuration is loaded.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = name => fs.readFile(path.join(root, name), 'utf8');
const replaceOnce = (text, needle, replacement, label) => {
  if (text.split(needle).length !== 2) throw new Error(`Prototype adapter drift: ${label}`);
  return text.replace(needle, replacement);
};
const [shell, css, adapter, originalHTML, hostSource, songSource, seed, songSeed, songLib, songCSS] = await Promise.all([
  read('prototype/shell.html'), read('prototype/aurora.css'), read('prototype/aurora.js'),
  read('index.html'), read('app.js'), read('song-app.js'), read('seed-data.js'),
  read('song-seed.js'), read('song-lib.js'), read('song-app.css')
]);
const baseCSS = originalHTML.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!baseCSS) throw new Error('Prototype adapter drift: original stylesheet missing');
let host = replaceOnce(hostSource,
  "if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});",
  '/* Review sandbox: never register the production service worker. */', 'service worker');
host = replaceOnce(host, 'songAppLoading = loadSongAssets()', 'songAppLoading = Promise.resolve()', 'lazy assets');
host = replaceOnce(host, ".then(() => import('./song-app.js' + ASSET_V))", '.then(() => window.AuroraSongModule)', 'song import');
host = replaceOnce(host, '\ninit();', '\n' + adapter + '\ninit();', 'initialization');
let songs = replaceOnce(songSource, 'export function mount(rootEl, context)', 'function mount(rootEl, context)', 'song export');
songs = replaceOnce(songs, '  ctx = context || {};',
  '  ctx = context || {};\n  state.schedule = ctx.previewSchedule || [];', 'local schedule bridge');
songs = songs.replace(/const (SHEET_SYNC_URL|CATALOG_CSV_URL) = '[^']*';/g, "const $1 = ''; // Offline preview");
if (!songs.includes("const SHEET_SYNC_URL = '';" ) || !songs.includes("const CATALOG_CSV_URL = '';")) throw new Error('Prototype adapter drift: song network endpoints');
const boot = `
window.Aurora = (() => {
  const prefix = 'lv-aurora-preview-v1:';
  const memory = new Map();
  let storageAvailable = true;
  try { window.localStorage.setItem(prefix+'probe','1'); window.localStorage.removeItem(prefix+'probe'); } catch { storageAvailable = false; }
  const storage = {
    getItem(key) { try { return storageAvailable ? window.localStorage.getItem(prefix+key) : (memory.get(key) ?? null); } catch { return memory.get(key) ?? null; } },
    setItem(key,value) { memory.set(key,String(value)); try { if(storageAvailable) window.localStorage.setItem(prefix+key,String(value)); } catch { storageAvailable=false; } },
    removeItem(key) { memory.delete(key); try { if(storageAvailable) window.localStorage.removeItem(prefix+key); } catch {} },
    clear() { memory.clear(); try { Object.keys(window.localStorage).filter(k=>k.startsWith(prefix)).forEach(k=>window.localStorage.removeItem(k)); } catch {} }
  };
  const started = Date.now();
  const anchor = new Date('2026-07-01T12:00:00').getTime();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [anchor + Date.now() - started])); } static now() { return anchor + Date.now() - started; } }
  return {storage, Clock, prefix, storageAvailable};
})();
`;
const script = text => '<script>\n' + text.replace(/<\/script/gi, '<\\/script') + '\n</script>';
const scripts = [boot,seed,songSeed,songLib,
  '(function(){ const localStorage=window.Aurora.storage; const Date=window.Aurora.Clock;\n'+songs+'\nwindow.AuroraSongModule={mount};\n})();',
  '(function(){ const localStorage=window.Aurora.storage; const Date=window.Aurora.Clock;\n'+host+'\n})();'
].map(script).join('\n');
const result = shell.replace('<!-- STYLES -->', '<style>\n'+baseCSS+'\n'+songCSS+'\n'+css+'\n</style>').replace('<!-- RUNTIME -->', scripts);
const out = path.join(here, 'dist');
await fs.mkdir(out, {recursive:true});
await fs.writeFile(path.join(out, 'index.html'), result);
console.log(`Built ${path.relative(root,path.join(out,'index.html'))} (${Buffer.byteLength(result)} bytes). Offline only.`);
