/* Local server for the app's source files.
     node scripts/serve.mjs            the app, connected to the real Firebase project
     node scripts/serve.mjs --fake     the app with an in-memory Firebase and made-up
                                       members (tests/fake), for development and tests
     --port 5174 (default)             --root dist to serve a build instead
     --host 0.0.0.0                    let other devices on the network open it (for
                                       phone testing); by default only this computer can
   Fake mode never contacts Firebase: the Firebase SDK addresses are mapped to
   tests/fake/ and firebase-config.js is replaced with a dummy. From the
   repository only the app's own files are served (what scripts/build.mjs
   ships), never .git, functions/ or local settings. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at === -1 ? fallback : args[at + 1]; };
const fake = args.includes('--fake');
const port = Number(option('--port', 5174));
const host = option('--host', '127.0.0.1');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(repo, option('--root', '.'));
const fakes = path.join(repo, 'tests', 'fake');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const FAKES = ['app', 'firestore', 'auth', 'functions', 'messaging'];
/* The app's files in the repository, as scripts/build.mjs lists them. */
const APP_FILES = ['index.html', 'permissions.js', 'firebase-config.js', 'song-lib.js', 'song-seed.js', 'sw.js', 'manifest.json', 'icon.svg'];
const APP_FOLDERS = ['app', 'styles'];

async function page(file) {
  let text = await fs.readFile(file, 'utf8');
  if (!fake) return text;
  const imports = Object.fromEntries(FAKES.map(name => [SDK + 'firebase-' + name + '.js', '/tests/fake/firebase-' + name + '.js']));
  text = text.replace(/<link rel="modulepreload"[^>]*>\n?/g, '');
  text = text.replace('<head>', '<head>\n<script>window.WD_FAKE = true;</script>\n<script type="importmap">' + JSON.stringify({ imports }) + '</script>');
  return text.replace(/(<script src="permissions\.js[^"]*"><\/script>)/, '$1\n<script src="/tests/fake/fixture.js"></script>');
}

/* `file` when it lies inside `folder`, else null. */
function inside(folder, file) {
  const relative = path.relative(folder, file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : null;
}

/* The file a request asks for, or a status code saying why not. */
function resolve(pathname) {
  let wanted;
  try { wanted = decodeURIComponent(pathname); } catch (_error) { return 400; }
  if (wanted.includes('\0')) return 400;
  if (fake && wanted.startsWith('/tests/fake/')) {
    const file = path.join(repo, wanted);
    return inside(fakes, file) ? file : 403;
  }
  const file = path.join(root, wanted === '/' ? 'index.html' : wanted);
  const relative = inside(root, file);
  if (!relative) return 403;
  if (root === repo && !APP_FILES.includes(relative) && !APP_FOLDERS.some(folder => relative.startsWith(folder + path.sep))) return 404;
  return file;
}

http.createServer(async (request, response) => {
  const found = resolve(new URL(request.url, 'http://localhost').pathname);
  if (typeof found === 'number') { response.writeHead(found, { 'Content-Type': 'text/plain' }).end(http.STATUS_CODES[found]); return; }
  let file = found;
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    let body;
    if (fake && path.basename(file) === 'firebase-config.js') body = 'window.FIREBASE_CONFIG = { projectId: "fake" };\n';
    else if (path.extname(file) === '.html') body = await page(file);
    else body = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': type + (type.startsWith('text/') ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (_error) {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, host, () => {
  console.log('Serving ' + (path.relative(repo, root) || '.') + ' at http://' + (host === '127.0.0.1' ? 'localhost' : host) + ':' + port + (fake ? ' with the fake Firebase' : ''));
});
