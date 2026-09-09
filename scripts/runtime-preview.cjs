#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const realPreview = require('./real-preview.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE_ROOT = '/Users/anthony/Projects/worship-duty-app';
const DEFAULT_PORT = 8101;
const BOOTSTRAP_FILE = path.resolve(__dirname, 'runtime-preview-bootstrap.js');
const ROOT_RUNTIME_FILES = Object.freeze([
  'index.html', 'app.js', 'styles.css', 'song-app.js', 'song-app.css', 'song-lib.js'
]);
const SYNTHETIC_FILES = Object.freeze([
  '/firebase-config.js', '/seed-data.js', '/song-seed.js', '/runtime-preview-bootstrap.js'
]);
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "worker-src 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeSourceRoot(value) {
  const candidate = path.resolve(value || DEFAULT_SOURCE_ROOT);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
    throw new Error('Source root is unavailable');
  }
  return candidate;
}

function addSourceFile(map, sourceRoot, relative) {
  const normalized = relative.split(path.sep).join('/');
  const absolute = path.resolve(sourceRoot, relative);
  const rootPrefix = sourceRoot.endsWith(path.sep) ? sourceRoot : sourceRoot + path.sep;
  if (absolute !== sourceRoot && !absolute.startsWith(rootPrefix)) return;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return;
  if (!/\.(?:js|css)$/i.test(normalized) && normalized !== 'index.html') return;
  map.set('/' + normalized, absolute);
}

function discoverSourceFiles(sourceRoot) {
  const map = new Map();
  ROOT_RUNTIME_FILES.forEach((file) => addSourceFile(map, sourceRoot, file));
  function visit(relativeDirectory) {
    const directory = path.resolve(sourceRoot, relativeDirectory);
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (error) { return; }
    entries.forEach((entry) => {
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile() && /\.(?:js|css)$/i.test(entry.name)) addSourceFile(map, sourceRoot, relative);
    });
  }
  visit('src');
  return map;
}

function transformIndex(html) {
  let output = String(html);
  output = output.replace(/<link\s+[^>]*(?:preconnect|modulepreload)[^>]*>/gi, '');
  output = output.replace(/<link\s+[^>]*rel=["'](?:manifest|icon)["'][^>]*>/gi, '');
  output = output.replace(/\s*<script\s+src=["'](?:\.?\/)?(?:seed-data|firebase-config)\.js(?:\?[^"']*)?["']\s*><\/script>/gi, '');
  output = output.replace(/\s*<script\s+type=["']module["']\s+src=["'](?:\.?\/)?app\.js(?:\?[^"']*)?["']\s*><\/script>/gi, '');
  output = output.replace(/<\/body>/i, '<script type="module" src="/runtime-preview-bootstrap.js"></script>\n</body>');
  return output;
}

function safeSongs(payload) {
  const source = payload && Array.isArray(payload.songs) ? payload.songs : [];
  return source.reduce((result, song) => {
    if (!song || typeof song !== 'object') return result;
    const id = String(song.id || '').trim();
    if (!id) return result;
    result.push({
      id,
      number: String(song.number || id),
      category: String(song.category || 'Unknown'),
      title: String(song.title || 'Title unavailable'),
      durationSec: Number.isFinite(Number(song.durationSec)) ? Number(song.durationSec) : 0
    });
    return result;
  }, []);
}

function syntheticScript(name, payload) {
  if (name === '/firebase-config.js') return 'window.FIREBASE_CONFIG = {};\n';
  if (name === '/seed-data.js') return 'window.SEED_DATA = {};\n';
  if (name === '/song-seed.js') return 'window.SONG_SEED = ' + JSON.stringify({ songs: safeSongs(payload) }) + ';\n';
  return fs.readFileSync(BOOTSTRAP_FILE, 'utf8');
}

function expectedOrigin(host, port) {
  return new Set(['http://127.0.0.1:' + port, 'http://localhost:' + port]);
}

function requestIsLocal(request, port) {
  const host = String(request.headers.host || '').toLowerCase();
  if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) return false;
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (!expectedOrigin(host, port).has(new URL(origin).origin)) return false;
    } catch (error) {
      return false;
    }
  }
  const fetchSite = String(request.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite.split(',').map((item) => item.trim()).includes('cross-site')) return false;
  return true;
}

function headers(contentType) {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
}

function send(response, status, contentType, body, headOnly) {
  const bytes = Buffer.from(String(body == null ? '' : body));
  const outputHeaders = headers(contentType);
  outputHeaders['Content-Length'] = String(headOnly ? 0 : bytes.length);
  response.writeHead(status, outputHeaders);
  if (headOnly) response.end();
  else response.end(bytes);
}

function createRuntimePreviewServer(options = {}) {
  const sourceRoot = safeSourceRoot(options.sourceRoot || DEFAULT_SOURCE_ROOT);
  const sourceFiles = discoverSourceFiles(sourceRoot);
  const configuredPort = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
  const loadData = typeof options.loadData === 'function'
    ? options.loadData
    : () => realPreview.loadProductionData({
      constants: realPreview.loadConstants(sourceRoot),
      songs: realPreview.loadSafeCatalog(sourceRoot)
    });
  let latestPayload = null;

  const server = http.createServer(async (request, response) => {
    const activeAddress = server.address();
    const activePort = activeAddress && typeof activeAddress.port === 'number' ? activeAddress.port : configuredPort;
    if (!requestIsLocal(request, activePort)) {
      send(response, 403, 'text/plain; charset=utf-8', 'Forbidden', false);
      return;
    }
    const method = String(request.method || '').toUpperCase();
    let parsed;
    try {
      const rawPath = String(request.url || '/').split('?')[0];
      if (/%2e|%5c|%2f/i.test(rawPath) || rawPath.includes('\\') || rawPath.includes('..')) throw new Error('Unsafe path');
      parsed = new URL(request.url || '/', 'http://' + request.headers.host);
    } catch (error) {
      send(response, 400, 'text/plain; charset=utf-8', 'Bad request', false);
      return;
    }
    const requestPath = parsed.pathname;
    if (method !== 'GET' && method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      send(response, 405, 'text/plain; charset=utf-8', 'Method not allowed', false);
      return;
    }
    if (requestPath === '/preview-data.json') {
      try {
        latestPayload = clone(await loadData());
        send(response, 200, 'application/json; charset=utf-8', JSON.stringify(latestPayload), method === 'HEAD');
      } catch (error) {
        latestPayload = null;
        send(response, 503, 'application/json; charset=utf-8', JSON.stringify({ error: 'Preview data unavailable.' }), method === 'HEAD');
      }
      return;
    }
    if (SYNTHETIC_FILES.includes(requestPath)) {
      try {
        if (requestPath === '/song-seed.js' && !latestPayload) latestPayload = clone(await loadData());
        send(response, 200, 'text/javascript; charset=utf-8', syntheticScript(requestPath, latestPayload), method === 'HEAD');
      } catch (error) {
        send(response, 503, 'text/plain; charset=utf-8', 'Preview asset unavailable', method === 'HEAD');
      }
      return;
    }
    const logicalPath = requestPath === '/' ? '/index.html' : requestPath;
    const assetPath = sourceFiles.get(logicalPath);
    if (!assetPath) {
      send(response, 404, 'text/plain; charset=utf-8', 'Not found', false);
      return;
    }
    try {
      let body = fs.readFileSync(assetPath);
      if (logicalPath === '/index.html') body = Buffer.from(transformIndex(body.toString('utf8')));
      const contentType = logicalPath.endsWith('.css') ? 'text/css; charset=utf-8'
        : logicalPath.endsWith('.js') ? 'text/javascript; charset=utf-8'
          : 'text/html; charset=utf-8';
      send(response, 200, contentType, body, method === 'HEAD');
    } catch (error) {
      send(response, 503, 'text/plain; charset=utf-8', 'Preview asset unavailable', method === 'HEAD');
    }
  });
  server.previewConfig = Object.freeze({ port: configuredPort, sourceRoot, sourceFiles: Object.freeze(Array.from(sourceFiles.keys())) });
  return server;
}

function parseArgs(argv) {
  const result = { sourceRoot: DEFAULT_SOURCE_ROOT, port: DEFAULT_PORT };
  const args = Array.isArray(argv) ? argv.slice() : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--source-root') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) throw new Error('--source-root needs a path');
      result.sourceRoot = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--port') {
      const next = Number(args[index + 1]);
      if (!Number.isInteger(next) || next < 0 || next > 65535) throw new Error('--port must be a valid TCP port');
      result.port = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else {
      throw new Error('Unknown argument');
    }
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const config = parseArgs(argv);
  if (config.help) {
    process.stdout.write('Usage: node scripts/runtime-preview.cjs [--source-root PATH] [--port PORT]\n');
    return null;
  }
  const server = createRuntimePreviewServer(config);
  server.listen(config.port, '127.0.0.1', () => {
    const address = server.address();
    process.stdout.write('Read-only runtime preview listening on http://127.0.0.1:' + address.port + '/\n');
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return server;
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  DEFAULT_PORT,
  DEFAULT_SOURCE_ROOT,
  ROOT_RUNTIME_FILES,
  SYNTHETIC_FILES,
  createRuntimePreviewServer,
  discoverSourceFiles,
  parseArgs,
  safeSongs,
  transformIndex
};

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write('Read-only runtime preview could not start.\n');
    process.exitCode = 1;
  }
}
