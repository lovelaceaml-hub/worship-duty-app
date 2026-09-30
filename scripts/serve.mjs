/* Local server for the app's source files.
     node scripts/serve.mjs            the app, connected to the real Firebase project
     node scripts/serve.mjs --fake     the app with an in-memory Firebase and made-up
                                       members (tests/fake), for development and tests
     --port 5174 (default)             --root dist to serve a build instead
   Fake mode never contacts Firebase: the Firebase SDK addresses are mapped to
   tests/fake/ and firebase-config.js is replaced with a dummy. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at === -1 ? fallback : args[at + 1]; };
const fake = args.includes('--fake');
const port = Number(option('--port', 5174));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(repo, option('--root', '.'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const FAKES = ['app', 'firestore', 'auth', 'functions', 'messaging'];

async function page(file) {
  let text = await fs.readFile(file, 'utf8');
  if (!fake) return text;
  const imports = Object.fromEntries(FAKES.map(name => [SDK + 'firebase-' + name + '.js', '/tests/fake/firebase-' + name + '.js']));
  text = text.replace(/<link rel="modulepreload"[^>]*>\n?/g, '');
  text = text.replace('<head>', '<head>\n<script type="importmap">' + JSON.stringify({ imports }) + '</script>');
  return text.replace(/(<script src="permissions\.js[^"]*"><\/script>)/, '$1\n<script src="/tests/fake/fixture.js"></script>');
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname.startsWith('/tests/fake/')) file = path.join(repo, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) && !file.startsWith(path.join(repo, 'tests', 'fake'))) { response.writeHead(403).end(); return; }
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
}).listen(port, () => {
  console.log('Serving ' + path.relative(repo, root || '.') + ' at http://localhost:' + port + (fake ? ' with the fake Firebase' : ''));
});
