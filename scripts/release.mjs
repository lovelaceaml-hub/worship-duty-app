import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const { mkdir, mkdtemp, readFile, readdir, lstat, rm, rmdir, stat, writeFile } = fs;

export const HOSTING_SITE = 'lv-zion-duties';
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const SHORT_CACHE_CONTROL = 'max-age=86400';
export const NO_CACHE_CONTROL = 'no-cache';
export const RELEASE_PATTERN = /^\d{14}$/;

/* These are the only top-level files the Hosting artifact may contain. Source
   modules are added below through the explicit src runtime-module allowlist. */
export const BASE_RUNTIME_FILES = Object.freeze([
  'index.html',
  'manifest.json',
  'icon.svg',
  'sw.js',
  'app.js',
  'seed-data.js',
  'firebase-config.js',
  'styles.css',
  'song-app.js',
  'song-app.css',
  'song-seed.js',
  'song-lib.js'
]);

const STAMPABLE_EXTENSIONS = new Set([
  '.js', '.mjs', '.css', '.html', '.json', '.svg', '.webmanifest'
]);
const IMMUTABLE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html']);
const SRC_RUNTIME_EXTENSIONS = new Set(['.js', '.mjs', '.css']);
const PATH_EXTENSIONS = new Set([
  ...STAMPABLE_EXTENSIONS,
  '.ico', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.ttf', '.otf'
]);
const SRC_EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git', 'node_modules', 'test', 'tests', '__tests__', 'fixtures'
]);
const SRC_EXCLUDED_FILE_RE = /(?:\.test|\.spec)\.[^.]+$/i;
const ASSET_VERSION_ASSIGNMENT_RE = /(\b(?:const|let|var)\s+ASSET_V\s*=\s*["'])\?v=[A-Za-z0-9._~-]+(["'])/g;
const IMPORT_RE = /\bimport\s*(?:\(\s*)?(["'])([^"']+)\1/g;
const FROM_RE = /\bfrom\s*(["'])([^"']+)\1/g;
const IMPORT_SCRIPTS_RE = /\bimportScripts\s*\(\s*(["'])([^"']+)\1/g;
const HTML_ATTRIBUTE_RE = /\b(?:src|href)\s*=\s*(["'])([^"']*)\1/gi;
const CSS_URL_RE = /\burl\(\s*(?:(['"])(.*?)\1|([^\s)]+))\s*\)/gi;
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?(["'])([^"']+)\1/g;
const LITERAL_PATH_RE = /(["'`])((?:\.{0,2}\/|\/)?[A-Za-z0-9_@~.-]+(?:\/[A-Za-z0-9_@~.-]+)*\.[A-Za-z0-9_@~.-]+(?:\?[^"'`\s)]*)?(?:#[^"'`]*)?)\1/g;
const RELEASE_ASSIGNMENT_RE = /(\bconst\s+RELEASE\s*=\s*["'])([^"']+)(["'])/g;

export class ReleaseError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReleaseError';
    this.code = code;
    this.details = details;
  }
}

function abortError() {
  const error = new Error('Release staging was aborted.');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function checkAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function nowStamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return [
    now.getUTCFullYear(), pad(now.getUTCMonth() + 1), pad(now.getUTCDate()),
    pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds())
  ].join('');
}

function assertStamp(stamp) {
  if (!RELEASE_PATTERN.test(stamp)) {
    throw new ReleaseError(
      'INVALID_RELEASE_STAMP',
      `Release stamp must be a UTC timestamp in YYYYMMDDHHMMSS form, received ${JSON.stringify(stamp)}.`
    );
  }
}

function isExternalReference(value) {
  const trimmed = value.trim();
  return !trimmed || trimmed.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(trimmed);
}

function splitReference(value) {
  const hashIndex = value.indexOf('#');
  const beforeHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : value.slice(hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex === -1) {
    return { pathname: beforeHash, query: '', hash };
  }
  return {
    pathname: beforeHash.slice(0, queryIndex),
    query: beforeHash.slice(queryIndex + 1),
    hash
  };
}

function extensionFor(relativePath) {
  return path.posix.extname(splitReference(relativePath).pathname).toLowerCase();
}

function isImmutablePath(relativePath) {
  return IMMUTABLE_EXTENSIONS.has(extensionFor(relativePath)) &&
    relativePath !== 'index.html' && relativePath !== 'sw.js';
}

function isWithinRoot(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalizeRelativePath(relativePath) {
  if (!relativePath || relativePath.includes('\\')) return null;
  const normalized = path.posix.normalize(relativePath.replace(/^\/+/, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function resolveRelativeReference(rootDir, fromRelativePath, rawReference) {
  if (isExternalReference(rawReference)) return null;
  const { pathname } = splitReference(rawReference.trim());
  if (!pathname || pathname.endsWith('/')) return null;
  const fromDirectory = path.posix.dirname(fromRelativePath);
  const joined = pathname.startsWith('/')
    ? pathname.slice(1)
    : path.posix.join(fromDirectory, pathname);
  const relativePath = normalizeRelativePath(joined);
  if (!relativePath) {
    throw new ReleaseError(
      'OUTSIDE_RUNTIME_ROOT',
      `Local runtime reference ${JSON.stringify(rawReference)} from ${fromRelativePath} escapes the staging root.`
    );
  }
  const absolutePath = path.resolve(rootDir, ...relativePath.split('/'));
  if (!isWithinRoot(rootDir, absolutePath)) {
    throw new ReleaseError(
      'OUTSIDE_RUNTIME_ROOT',
      `Local runtime reference ${JSON.stringify(rawReference)} from ${fromRelativePath} escapes the staging root.`
    );
  }
  return { relativePath, absolutePath };
}

function isSrcRuntimeModule(relativePath) {
  if (!relativePath.startsWith('src/')) return false;
  const pieces = relativePath.split('/');
  if (pieces.some(piece => SRC_EXCLUDED_DIRECTORY_NAMES.has(piece))) return false;
  if (SRC_EXCLUDED_FILE_RE.test(relativePath)) return false;
  return SRC_RUNTIME_EXTENSIONS.has(extensionFor(relativePath));
}

function isAllowedRuntimePath(relativePath, baseFiles = BASE_RUNTIME_FILES) {
  return baseFiles.includes(relativePath) || isSrcRuntimeModule(relativePath);
}

async function ensureRegularFile(absolutePath, relativePath) {
  let info;
  try {
    info = await lstat(absolutePath);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new ReleaseError(
      'SYMLINK_RUNTIME_FILE',
      `Runtime file ${relativePath} is a symbolic link. Staging refuses links so an allowlisted path cannot escape the project.`
    );
  }
  if (!info.isFile()) {
    throw new ReleaseError('INVALID_RUNTIME_FILE', `Runtime path ${relativePath} is not a regular file.`);
  }
  return true;
}

async function collectSourceModules(rootDir, signal) {
  const modules = [];
  const srcRoot = path.join(rootDir, 'src');
  let srcInfo;
  try {
    srcInfo = await lstat(srcRoot);
  } catch (error) {
    if (error.code === 'ENOENT') return modules;
    throw error;
  }
  if (srcInfo.isSymbolicLink()) {
    throw new ReleaseError('SYMLINK_RUNTIME_FILE', 'The src runtime directory cannot be a symbolic link.');
  }
  if (!srcInfo.isDirectory()) {
    throw new ReleaseError('INVALID_RUNTIME_FILE', 'The src runtime path is not a directory.');
  }

  async function visit(directory, relativeDirectory) {
    checkAborted(signal);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      checkAborted(signal);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(rootDir, ...relativePath.split('/'));
      if (entry.isSymbolicLink()) {
        throw new ReleaseError(
          'SYMLINK_RUNTIME_FILE',
          `Runtime path ${relativePath} is a symbolic link. Staging refuses links.`
        );
      }
      if (entry.isDirectory()) {
        if (!SRC_EXCLUDED_DIRECTORY_NAMES.has(entry.name)) await visit(absolutePath, relativePath);
        continue;
      }
      if (entry.isFile() && isSrcRuntimeModule(relativePath)) modules.push(relativePath);
    }
  }

  await visit(srcRoot, 'src');
  return modules;
}

function descriptorPathExtension(value) {
  return extensionFor(value);
}

function addDescriptor(descriptors, seen, match, value, kind, required, forceStamp, valueIndex = 0) {
  if (isExternalReference(value)) return;
  if (kind === 'js-import' && /\s/.test(value)) return;
  const start = match.index + valueIndex;
  const end = start + value.length;
  const key = `${start}:${end}`;
  if (seen.has(key)) return;
  const extension = descriptorPathExtension(value);
  if (kind === 'runtime-literal' && !PATH_EXTENSIONS.has(extension)) return;
  descriptors.push({
    start,
    end,
    value,
    kind,
    required,
    forceStamp: !!forceStamp,
    extension,
    stampable: !!forceStamp || STAMPABLE_EXTENSIONS.has(extension)
  });
  seen.add(key);
}

function addRegexDescriptors(text, regex, descriptors, seen, kind, required, forceStamp, valueGroup = 2) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text))) {
    const value = match[valueGroup];
    if (typeof value !== 'string') continue;
    const valueIndex = match[0].indexOf(value);
    addDescriptor(descriptors, seen, match, value, kind, required, forceStamp, valueIndex);
  }
  regex.lastIndex = 0;
}

function addCssUrlDescriptors(text, descriptors, seen) {
  CSS_URL_RE.lastIndex = 0;
  let match;
  while ((match = CSS_URL_RE.exec(text))) {
    const value = match[2] ?? match[3];
    if (typeof value !== 'string') continue;
    const valueIndex = match[0].indexOf(value);
    addDescriptor(descriptors, seen, match, value, 'css-url', true, false, valueIndex);
  }
  CSS_URL_RE.lastIndex = 0;
}

function extractRuntimeReferences(text, relativePath, knownSourcePaths = new Set()) {
  const descriptors = [];
  const seen = new Set();
  const extension = extensionFor(relativePath);

  if (extension === '.html') {
    addRegexDescriptors(text, HTML_ATTRIBUTE_RE, descriptors, seen, 'html-attribute', true, false);
    addCssUrlDescriptors(text, descriptors, seen);
    addRegexDescriptors(text, CSS_IMPORT_RE, descriptors, seen, 'css-import', true, false);
  }
  if (extension === '.css') {
    addCssUrlDescriptors(text, descriptors, seen);
    addRegexDescriptors(text, CSS_IMPORT_RE, descriptors, seen, 'css-import', true, false);
  }
  if (extension === '.js' || extension === '.mjs') {
    addRegexDescriptors(text, IMPORT_RE, descriptors, seen, 'js-import', true, true);
    addRegexDescriptors(text, FROM_RE, descriptors, seen, 'js-import', true, true);
    addRegexDescriptors(text, IMPORT_SCRIPTS_RE, descriptors, seen, 'js-import', true, true);
  }

  /* Generic literals cover service-worker registration, notification icons,
     script.src assignments, and manifest icon paths. In JavaScript a generic
     missing filename can be a download name, so only existing files are
     required there. Explicit import and HTML/CSS references remain strict. */
  addRegexDescriptors(text, LITERAL_PATH_RE, descriptors, seen, 'runtime-literal', extension === '.json', false);

  for (const descriptor of descriptors) {
    descriptor.knownSourcePath = knownSourcePaths.has(
      resolveReferencePathWithoutFilesystem(relativePath, descriptor.value)
    );
  }
  return descriptors;
}

function resolveReferencePathWithoutFilesystem(fromRelativePath, rawReference) {
  if (isExternalReference(rawReference)) return null;
  const { pathname } = splitReference(rawReference.trim());
  if (!pathname || pathname.endsWith('/')) return null;
  const joined = pathname.startsWith('/')
    ? pathname.slice(1)
    : path.posix.join(path.posix.dirname(fromRelativePath), pathname);
  return normalizeRelativePath(joined);
}

function queryWithReleaseStamp(query, stamp) {
  const parts = query ? query.split('&') : [];
  let found = false;
  const rewritten = parts.map(part => {
    if (/^v=/i.test(part)) {
      found = true;
      return `v=${stamp}`;
    }
    return part;
  });
  if (!found) rewritten.push(`v=${stamp}`);
  return rewritten.filter(Boolean).join('&');
}

function stampReference(value, stamp) {
  const { pathname, query, hash } = splitReference(value);
  return `${pathname}?${queryWithReleaseStamp(query, stamp)}${hash}`;
}

function removeReleaseQuery(value) {
  const { pathname, query, hash } = splitReference(value);
  const remaining = query.split('&').filter(part => part && !/^v=/i.test(part));
  return `${pathname}${remaining.length ? `?${remaining.join('&')}` : ''}${hash}`;
}

function hasAssetVersionSuffix(text, end) {
  return /^\s*["']?\s*\+\s*ASSET_V\b/.test(text.slice(end));
}

function rewriteRuntimeText(text, descriptors, stamp) {
  const edits = [];
  for (const descriptor of descriptors) {
    if (!descriptor.stampable || descriptor.skipRewrite) continue;
    /* app.js and future buildless modules intentionally concatenate the shared
       ASSET_V value. Leave the path untouched and stamp that value below. */
    if (hasAssetVersionSuffix(text, descriptor.end)) {
      if (!splitReference(descriptor.value).query) continue;
      edits.push({
        start: descriptor.start,
        end: descriptor.end,
        value: removeReleaseQuery(descriptor.value)
      });
      continue;
    }
    edits.push({
      start: descriptor.start,
      end: descriptor.end,
      value: stampReference(descriptor.value, stamp)
    });
  }
  edits.sort((left, right) => left.start - right.start || right.end - left.end);
  let output = '';
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    output += text.slice(cursor, edit.start);
    output += edit.value;
    cursor = edit.end;
  }
  output += text.slice(cursor);

  /* Stamp only the shared ASSET_V declaration. A global query replacement
     would silently alter version parameters on external CDN URLs. */
  output = output.replace(ASSET_VERSION_ASSIGNMENT_RE, `$1?v=${stamp}$2`);
  ASSET_VERSION_ASSIGNMENT_RE.lastIndex = 0;
  return output;
}

function rewriteServiceWorkerRelease(text, stamp) {
  RELEASE_ASSIGNMENT_RE.lastIndex = 0;
  let count = 0;
  const output = text.replace(RELEASE_ASSIGNMENT_RE, (full, prefix, _value, suffix) => {
    count += 1;
    return `${prefix}${stamp}${suffix}`;
  });
  RELEASE_ASSIGNMENT_RE.lastIndex = 0;
  if (count !== 1) {
    throw new ReleaseError(
      'MISSING_RELEASE_TOKEN',
      `sw.js must contain exactly one const RELEASE assignment, found ${count}.`
    );
  }
  return output;
}

function hasIcsRewrite(hosting) {
  return Array.isArray(hosting.rewrites) && hosting.rewrites.some(rewrite =>
    rewrite && rewrite.source === '/ics/**' && rewrite.function === 'ics'
  );
}

function validateSourceHostingConfig(config) {
  const hosting = config?.hosting;
  if (!hosting || Array.isArray(hosting) || typeof hosting !== 'object') {
    throw new ReleaseError('INVALID_FIREBASE_CONFIG', 'firebase.json must contain one Hosting configuration object.');
  }
  if (hosting.site !== HOSTING_SITE) {
    throw new ReleaseError(
      'HOSTING_TARGET_MISMATCH',
      `firebase.json targets ${JSON.stringify(hosting.site)}. Release staging is restricted to ${HOSTING_SITE}.`
    );
  }
  if (!hasIcsRewrite(hosting)) {
    throw new ReleaseError('MISSING_ICS_REWRITE', 'firebase.json must preserve the /ics/** to the ics function rewrite.');
  }
  if (!Array.isArray(hosting.headers)) {
    throw new ReleaseError('MISSING_HOSTING_HEADERS', 'firebase.json must declare Hosting cache headers.');
  }
}

function stagingHostingConfig(sourceConfig) {
  const sourceHosting = sourceConfig.hosting;
  const ignore = [
    'firebase.json',
    '**/.*',
    '**/.*/**',
    'docs/**',
    'functions/**',
    'scripts/**',
    'tests/**',
    'package.json',
    'package-lock.json',
    'firestore.rules'
  ];
  return {
    hosting: {
      ...sourceHosting,
      site: HOSTING_SITE,
      public: '.',
      ignore
    }
  };
}

function globToRegExp(pattern) {
  const normalized = pattern.replace(/^\/+/, '');
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      index += 1;
      if (normalized[index + 1] === '/') {
        index += 1;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '\\?';
    } else {
      source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function matchingHeaderValues(headers, relativePath) {
  const values = [];
  for (const entry of headers) {
    if (!entry || typeof entry.source !== 'string' || !Array.isArray(entry.headers)) continue;
    if (!globToRegExp(entry.source).test(relativePath)) continue;
    for (const header of entry.headers) {
      if (header?.key?.toLowerCase() === 'cache-control' && typeof header.value === 'string') {
        values.push(header.value);
      }
    }
  }
  return values;
}

function validateCacheHeaders(config, runtimePaths) {
  const headers = config.hosting.headers;
  for (const relativePath of runtimePaths) {
    const values = matchingHeaderValues(headers, relativePath);
    const expected = relativePath === 'index.html' || relativePath === 'sw.js'
      ? NO_CACHE_CONTROL
      : relativePath === 'manifest.json' || relativePath === 'icon.svg'
        ? SHORT_CACHE_CONTROL
        : isImmutablePath(relativePath) ? IMMUTABLE_CACHE_CONTROL : null;
    if (!expected) continue;
    if (!values.includes(expected)) {
      const code = expected === IMMUTABLE_CACHE_CONTROL
        ? 'MISSING_IMMUTABLE_HEADER'
        : 'INVALID_CACHE_HEADER';
      throw new ReleaseError(
        code,
        `Hosting cache headers for ${relativePath} must include ${JSON.stringify(expected)}.`,
        { relativePath, values }
      );
    }
    if ((relativePath === 'index.html' || relativePath === 'sw.js') && values.some(value => value === IMMUTABLE_CACHE_CONTROL)) {
      throw new ReleaseError(
        'INVALID_CACHE_HEADER',
        `${relativePath} must remain no-cache and cannot also receive the immutable cache policy.`,
        { relativePath, values }
      );
    }
  }
}

async function resolvePlanReferences(rootDir, sourcePaths, sourceTexts, descriptorsByPath, signal) {
  const sourcePathSet = new Set(sourcePaths);
  for (const relativePath of sourcePaths) {
    checkAborted(signal);
    const text = sourceTexts.get(relativePath);
    const descriptors = extractRuntimeReferences(text, relativePath, sourcePathSet);
    descriptorsByPath.set(relativePath, descriptors);
    for (const descriptor of descriptors) {
      checkAborted(signal);
      const resolved = resolveRelativeReference(rootDir, relativePath, descriptor.value);
      if (!resolved) continue;
      const exists = await ensureRegularFile(resolved.absolutePath, resolved.relativePath);
      const explicit = descriptor.required || descriptor.kind !== 'runtime-literal' || extensionFor(relativePath) === '.json';
      if (!exists) {
        if (explicit) {
          throw new ReleaseError(
            'MISSING_RUNTIME_REFERENCE',
            `Runtime file ${relativePath} references missing local file ${resolved.relativePath}.`,
            { from: relativePath, reference: descriptor.value, target: resolved.relativePath }
          );
        }
        descriptor.skipRewrite = true;
        continue;
      }
      if (!isAllowedRuntimePath(resolved.relativePath, BASE_RUNTIME_FILES)) {
        throw new ReleaseError(
          'RUNTIME_FILE_NOT_ALLOWLISTED',
          `Runtime file ${relativePath} references ${resolved.relativePath}, which is outside the release allowlist.`,
          { from: relativePath, reference: descriptor.value, target: resolved.relativePath }
        );
      }
      if (descriptor.kind === 'runtime-literal' && !descriptor.stampable && !descriptor.knownSourcePath) continue;
    }
  }
}

function releaseQueryValue(value) {
  const { query } = splitReference(value);
  for (const part of query.split('&')) {
    const [key, val] = part.split('=');
    if (key?.toLowerCase() === 'v') return val || '';
  }
  return null;
}

function assetVersionIsStamped(text, stamp) {
  return new RegExp(`\\bASSET_V\\s*=\\s*["']\\?v=${stamp}["']`).test(text);
}

function referenceIsStamped(text, descriptor, stamp) {
  const queryStamp = releaseQueryValue(descriptor.value);
  if (queryStamp === stamp) return true;
  if (queryStamp !== null) return false;
  return hasAssetVersionSuffix(text, descriptor.end) && assetVersionIsStamped(text, stamp);
}

async function validateStagedReferences(stageDir, runtimePaths, stamp, signal) {
  const runtimeSet = new Set(runtimePaths);
  for (const relativePath of runtimePaths) {
    checkAborted(signal);
    const absolutePath = path.join(stageDir, ...relativePath.split('/'));
    const text = await readFile(absolutePath, 'utf8');
    const descriptors = extractRuntimeReferences(text, relativePath, runtimeSet);
    for (const descriptor of descriptors) {
      checkAborted(signal);
      const resolved = resolveRelativeReference(stageDir, relativePath, descriptor.value);
      if (!resolved) continue;
      const targetExists = await ensureRegularFile(resolved.absolutePath, resolved.relativePath);
      const explicit = descriptor.required || descriptor.kind !== 'runtime-literal' || extensionFor(relativePath) === '.json';
      if (!targetExists) {
        if (explicit) {
          throw new ReleaseError(
            'MISSING_RUNTIME_REFERENCE',
            `Staged runtime file ${relativePath} references missing local file ${resolved.relativePath}.`,
            { from: relativePath, target: resolved.relativePath }
          );
        }
        continue;
      }
      if (!runtimeSet.has(resolved.relativePath)) {
        throw new ReleaseError(
          'RUNTIME_FILE_NOT_STAGED',
          `Staged runtime file ${relativePath} references ${resolved.relativePath}, which was not staged.`,
          { from: relativePath, target: resolved.relativePath }
        );
      }
      if (descriptor.stampable && !referenceIsStamped(text, descriptor, stamp)) {
        throw new ReleaseError(
          'UNSTAMPED_RUNTIME_REFERENCE',
          `Staged runtime file ${relativePath} contains an unstamped local runtime reference to ${resolved.relativePath}.`,
          { from: relativePath, target: resolved.relativePath, reference: descriptor.value }
        );
      }
    }
  }
}

function validateReleaseToken(text, stamp) {
  const match = text.match(/\bconst\s+RELEASE\s*=\s*["']([^"']+)["']/);
  if (!match || match[1] !== stamp) {
    throw new ReleaseError('INVALID_RELEASE_TOKEN', `Staged sw.js must set RELEASE to ${stamp}.`);
  }
}

function validateJsonSyntax(text, relativePath) {
  try {
    JSON.parse(text);
  } catch (error) {
    throw new ReleaseError('INVALID_JSON', `Staged JSON file ${relativePath} is invalid.`, { cause: error });
  }
}

function checkJavaScriptSyntax(absolutePath, relativePath) {
  const sourceText = readFileSync(absolutePath, 'utf8');
  const parser = [
    "import vm from 'node:vm';",
    "let source = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', chunk => { source += chunk; });",
    "process.stdin.on('end', () => { new vm.SourceTextModule(source); });"
  ].join(' ');
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--experimental-vm-modules', '--input-type=module', '-e', parser],
    { input: sourceText, encoding: 'utf8' }
  );
  if (result.error) {
    throw new ReleaseError('SYNTAX_CHECK_FAILED', `Could not check JavaScript syntax for ${relativePath}.`, { cause: result.error });
  }
  if (result.status !== 0) {
    const output = `${result.stderr || ''}${result.stdout || ''}`.trim();
    throw new ReleaseError('SYNTAX_ERROR', `JavaScript syntax check failed for ${relativePath}: ${output}`, { relativePath, output });
  }
}

async function validateStagedArtifact(stageDir, runtimePaths, config, stamp, signal) {
  checkAborted(signal);
  const actualFiles = await listFiles(stageDir, signal);
  const expectedFiles = new Set([...runtimePaths, 'firebase.json']);
  for (const relativePath of actualFiles) {
    if (!expectedFiles.has(relativePath)) {
      throw new ReleaseError('UNEXPECTED_STAGED_FILE', `Unexpected file ${relativePath} reached the Hosting staging directory.`);
    }
  }
  for (const relativePath of expectedFiles) {
    if (!actualFiles.includes(relativePath)) {
      throw new ReleaseError('INCOMPLETE_STAGED_ARTIFACT', `Expected staged file ${relativePath} is missing.`);
    }
  }

  const stagedConfigText = await readFile(path.join(stageDir, 'firebase.json'), 'utf8');
  const stagedConfig = JSON.parse(stagedConfigText);
  if (Object.keys(stagedConfig).some(key => key !== 'hosting')) {
    throw new ReleaseError('NON_HOSTING_STAGE_CONFIG', 'The staged Firebase config may contain Hosting only.');
  }
  if (stagedConfig.hosting?.site !== HOSTING_SITE || stagedConfig.hosting?.public !== '.') {
    throw new ReleaseError('HOSTING_TARGET_MISMATCH', `The staged Hosting config must target ${HOSTING_SITE} from public path .`);
  }
  if (!hasIcsRewrite(stagedConfig.hosting)) {
    throw new ReleaseError('MISSING_ICS_REWRITE', 'The staged Hosting config lost the /ics/** rewrite to ics.');
  }
  validateCacheHeaders(stagedConfig, runtimePaths);
  await validateStagedReferences(stageDir, runtimePaths, stamp, signal);

  for (const relativePath of runtimePaths) {
    checkAborted(signal);
    const absolutePath = path.join(stageDir, ...relativePath.split('/'));
    const fileText = await readFile(absolutePath, 'utf8');
    const extension = extensionFor(relativePath);
    if (extension === '.js' || extension === '.mjs') checkJavaScriptSyntax(absolutePath, relativePath);
    if (extension === '.json') validateJsonSyntax(fileText, relativePath);
    if (relativePath === 'sw.js') validateReleaseToken(fileText, stamp);
    if (fileText.includes('?v=DEV')) {
      throw new ReleaseError('UNSTAMPED_RUNTIME_REFERENCE', `${relativePath} still contains the DEV release placeholder.`);
    }
  }
  return { files: actualFiles, config: stagedConfig };
}

async function listFiles(rootDir, signal) {
  const files = [];
  async function visit(directory, relativeDirectory) {
    checkAborted(signal);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      checkAborted(signal);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(rootDir, ...relativePath.split('/'));
      if (entry.isSymbolicLink()) {
        throw new ReleaseError('SYMLINK_STAGED_FILE', `Staged path ${relativePath} is a symbolic link.`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  await visit(rootDir, '');
  return files.filter(Boolean);
}

export async function buildReleasePlan({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  stamp = nowStamp(),
  signal
} = {}) {
  checkAborted(signal);
  assertStamp(stamp);
  rootDir = path.resolve(rootDir);

  const configPath = path.join(rootDir, 'firebase.json');
  const sourceConfigText = await readFile(configPath, 'utf8');
  let sourceConfig;
  try {
    sourceConfig = JSON.parse(sourceConfigText);
  } catch (error) {
    throw new ReleaseError('INVALID_JSON', 'firebase.json is invalid.', { cause: error });
  }
  validateSourceHostingConfig(sourceConfig);

  const sourceModules = await collectSourceModules(rootDir, signal);
  const runtimePaths = [...new Set([...BASE_RUNTIME_FILES, ...sourceModules])].sort();
  const sourceTexts = new Map();
  for (const relativePath of runtimePaths) {
    checkAborted(signal);
    const absolutePath = path.join(rootDir, ...relativePath.split('/'));
    const exists = await ensureRegularFile(absolutePath, relativePath);
    if (!exists) {
      throw new ReleaseError('MISSING_RUNTIME_FILE', `Required runtime file ${relativePath} is missing.`);
    }
    sourceTexts.set(relativePath, await readFile(absolutePath, 'utf8'));
  }
  const descriptorsByPath = new Map();
  await resolvePlanReferences(rootDir, runtimePaths, sourceTexts, descriptorsByPath, signal);

  const stagedTexts = new Map();
  for (const relativePath of runtimePaths) {
    checkAborted(signal);
    let text = rewriteRuntimeText(sourceTexts.get(relativePath), descriptorsByPath.get(relativePath) || [], stamp);
    if (relativePath === 'sw.js') text = rewriteServiceWorkerRelease(text, stamp);
    stagedTexts.set(relativePath, text);
  }

  const stagedConfig = stagingHostingConfig(sourceConfig);
  validateCacheHeaders(stagedConfig, runtimePaths);
  return {
    rootDir,
    stamp,
    runtimePaths,
    stagedTexts,
    stagedConfig,
    sourceConfig,
    descriptorsByPath
  };
}

async function createOutputDirectory(outputDir) {
  if (outputDir) {
    const absoluteOutputDir = path.resolve(outputDir);
    let existed = true;
    try {
      const info = await stat(absoluteOutputDir);
      if (!info.isDirectory()) throw new ReleaseError('INVALID_OUTPUT_DIRECTORY', `${absoluteOutputDir} is not a directory.`);
      const entries = await readdir(absoluteOutputDir);
      if (entries.length) throw new ReleaseError('OUTPUT_DIRECTORY_NOT_EMPTY', `${absoluteOutputDir} must be empty before staging.`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      existed = false;
      await mkdir(absoluteOutputDir, { mode: 0o700 });
    }
    return { directory: absoluteOutputDir, removeOnFailure: !existed };
  }
  return {
    directory: await mkdtemp(path.join(os.tmpdir(), 'worship-release-')),
    removeOnFailure: true
  };
}

async function clearGeneratedOutput(directory, relativePaths) {
  /* A caller supplied output directory is required to be empty before
     staging. Remove only files planned by this attempt, then remove empty
     parent directories. Keep the caller's directory itself for a retry. */
  const generatedPaths = [...relativePaths, 'firebase.json'];
  for (const relativePath of generatedPaths) {
    await rm(path.join(directory, ...relativePath.split('/')), { force: true });
  }

  const generatedDirectories = new Set();
  for (const relativePath of generatedPaths) {
    let relativeDirectory = path.posix.dirname(relativePath);
    while (relativeDirectory !== '.') {
      generatedDirectories.add(relativeDirectory);
      relativeDirectory = path.posix.dirname(relativeDirectory);
    }
  }
  const directories = [...generatedDirectories].sort((left, right) =>
    right.split('/').length - left.split('/').length
  );
  for (const relativeDirectory of directories) {
    try {
      await rmdir(path.join(directory, ...relativeDirectory.split('/')));
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
    }
  }
}

async function writeStageFile(stageDir, relativePath, text, signal) {
  checkAborted(signal);
  const absolutePath = path.join(stageDir, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(absolutePath, text, { encoding: 'utf8', mode: 0o644 });
}

export async function stageRelease(options = {}) {
  const plan = await buildReleasePlan(options);
  const output = await createOutputDirectory(options.outputDir);
  try {
    checkAborted(options.signal);
    for (const relativePath of plan.runtimePaths) {
      await writeStageFile(output.directory, relativePath, plan.stagedTexts.get(relativePath), options.signal);
    }
    await writeStageFile(output.directory, 'firebase.json', `${JSON.stringify(plan.stagedConfig, null, 2)}\n`, options.signal);
    const validation = await validateStagedArtifact(output.directory, plan.runtimePaths, plan.stagedConfig, plan.stamp, options.signal);
    return {
      ...plan,
      stageDir: output.directory,
      validation,
      removeOnSuccess: !options.outputDir
    };
  } catch (error) {
    if (output.removeOnFailure) {
      await rm(output.directory, { recursive: true, force: true });
    } else {
      await clearGeneratedOutput(output.directory, plan.runtimePaths);
    }
    throw error;
  }
}

export async function removeStage(stageDir) {
  if (!stageDir) return;
  await rm(stageDir, { recursive: true, force: true });
}

export function deployArguments(stageDir) {
  return [
    '-y',
    'firebase-tools@latest',
    'deploy',
    '--config', path.join(stageDir, 'firebase.json'),
    '--project', HOSTING_SITE,
    '--only', `hosting:${HOSTING_SITE}`,
    '--non-interactive'
  ];
}

export function deployStaged(stageDir, { signal, spawnCommand = spawn } = {}) {
  checkAborted(signal);
  return new Promise((resolve, reject) => {
    const child = spawnCommand('npx', deployArguments(stageDir), {
      cwd: stageDir,
      env: { ...process.env, npm_config_cache: '/tmp/npm-cache' },
      stdio: 'inherit'
    });
    let settled = false;
    const cleanup = () => signal?.removeEventListener('abort', abortChild);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(value);
    };
    const abortChild = () => {
      child.kill('SIGTERM');
      finish(abortError());
    };
    signal?.addEventListener('abort', abortChild, { once: true });
    child.once('error', error => finish(new ReleaseError('DEPLOY_COMMAND_FAILED', `Could not start Firebase Hosting deploy: ${error.message}`, { cause: error })));
    child.once('exit', (code, signalName) => {
      if (signalName) return finish(new ReleaseError('DEPLOY_ABORTED', `Firebase Hosting deploy ended from ${signalName}.`));
      if (code !== 0) return finish(new ReleaseError('DEPLOY_FAILED', `Firebase Hosting deploy exited with status ${code}.`));
      finish(null, { code: 0 });
    });
  });
}

function requiredArgumentValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new ReleaseError('INVALID_ARGUMENT', `${option} requires a value.`);
  }
  return value;
}

export function parseArguments(argv) {
  const options = { dryRun: false, outputDir: null, stamp: nowStamp() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--stamp') {
      options.stamp = requiredArgumentValue(argv, index, '--stamp');
      index += 1;
    } else if (argument === '--output-dir' || argument === '--stage-dir') {
      options.outputDir = requiredArgumentValue(argv, index, argument);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new ReleaseError('INVALID_ARGUMENT', `Unknown release argument ${argument}.`);
    }
  }
  if (options.help) return options;
  if (!options.stamp) throw new ReleaseError('INVALID_RELEASE_STAMP', '--stamp requires a value.');
  assertStamp(options.stamp);
  return options;
}

function usage() {
  return [
    'Usage: bash scripts/deploy.sh [--dry-run] [--stamp YYYYMMDDHHMMSS] [--output-dir PATH]',
    '',
    'Stages only allowlisted runtime files, validates references and cache headers,',
    'then deploys Hosting site lv-zion-duties unless --dry-run is supplied.'
  ].join('\n');
}

export async function runCli(argv = process.argv.slice(2), {
  stageReleaseFn = stageRelease,
  deployStagedFn = deployStaged,
  removeStageFn = removeStage
} = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    console.error(`Release failed: ${error.message}`);
    return 1;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  let staged;
  try {
    staged = await stageReleaseFn({ stamp: options.stamp, signal: controller.signal, outputDir: options.outputDir });
    console.log(`Release ${staged.stamp} staged at ${staged.stageDir}`);
    console.log(`Hosting target verified: ${HOSTING_SITE}`);
    console.log(`Runtime artifacts: ${staged.runtimePaths.length}`);
    if (options.dryRun) {
      console.log('Dry run passed. No Firebase command was started.');
      return 0;
    }
    await deployStagedFn(staged.stageDir, { signal: controller.signal });
    console.log(`Deployed Hosting site ${HOSTING_SITE} at release ${staged.stamp}.`);
    return 0;
  } catch (error) {
    const message = error?.message || String(error);
    console.error(`Release failed: ${message}`);
    return 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    if (staged && !options.outputDir) await removeStageFn(staged.stageDir);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then(code => { process.exitCode = code; });
}
