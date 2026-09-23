#!/usr/bin/env node
/* Motion checker for the app.js split (docs/PLAN-2026-09-22-APP-JS-SPLIT.md).
 * Verifies that every top-level declaration in the baseline app.js still
 * exists exactly once across the current module set, with an identical body
 * after whitespace normalization. --manifest additionally checks each
 * declaration sits in its assigned module (or, if that module does not
 * exist yet, that the declaration is still in app.js). --gallery checks the
 * gallery scope contract: every name the design-gallery injected sources
 * reach must still be in app.js's own top-level scope.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DECL_RE = /^(export\s+)?(?:(async\s+function)\s+([A-Za-z_$][\w$]*)|(function)\s+([A-Za-z_$][\w$]*)|(const)\s+([A-Za-z_$][\w$]*)|(let)\s+([A-Za-z_$][\w$]*)|(var)\s+([A-Za-z_$][\w$]*))\b/;

// Multiline-aware: `[^}]`/`[^'"]` character classes already span newlines, so
// a braced import list wrapped across several lines still matches as one
// statement. These run with the `m` flag against the whole source, not
// line by line, since a real import can and does wrap.
const IMPORT_NAMED_RE = /^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];?/m;
const IMPORT_DEFAULT_RE = /^import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{([^}]*)\})?\s*from\s*['"][^'"]+['"];?/m;
const IMPORT_NAMESPACE_RE = /^import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"][^'"]+['"];?/m;

const GALLERY_SOURCES = [
  'design-gallery/host-bridge.js',
  'design-gallery/navy-adapter.js',
  'prototype-prism/all-pages.js',
  'prototype-prism/prism.js',
  'prototype-prism/song-pages.js',
  'prototype/aurora.js',
  'prototype/workspaces.js',
  'prototype/presider-workspace.js'
];

const BLANK_RE = /^\s*$/;
const LINE_COMMENT_RE = /^\s*\/\/.*$/;
const SELF_CONTAINED_BLOCK_RE = /^\s*\/\*[\s\S]*\*\/\s*$/;
const BLOCK_CLOSE_RE = /\*\/\s*$/;

// A section banner ("/* ===== double-duty conflicts ===== */"), single-line or
// wrapped across two lines, sits between two declarations in the source but
// belongs, by the module map, to whichever declaration comes AFTER it, not the
// one before. Trimming trailing blank/comment lines off a body keeps that
// banner out of the comparison on both sides (baseline and current), so moving
// a declaration next to a differently-assigned neighbor never fails on a
// comment that carries no behavior.
function trimTrailingNoise(lines) {
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1];
    if (BLANK_RE.test(line) || LINE_COMMENT_RE.test(line)) { end--; continue; }
    if (SELF_CONTAINED_BLOCK_RE.test(line)) { end--; continue; }
    if (BLOCK_CLOSE_RE.test(line)) {
      let openIndex = -1;
      for (let i = end - 2; i >= 0; i--) {
        // The opener must start the line (after indentation): every real block
        // comment in this codebase is formatted that way. A bare `.includes('/*')`
        // false-positives on ordinary prose that happens to contain those two
        // characters in sequence, e.g. "firebase.json's /ics/** rewrite)".
        if (/^\s*\/\*/.test(lines[i])) { openIndex = i; break; }
        if (lines[i].includes('*/')) break; // an unrelated, already-closed comment: stop rather than misattribute
      }
      if (openIndex !== -1) { end = openIndex; continue; }
    }
    break;
  }
  return lines.slice(0, end);
}

export function extractDeclarations(source) {
  const lines = source.split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DECL_RE);
    if (!m) continue;
    const name = m[3] || m[5] || m[7] || m[9] || m[11];
    const kind = (m[2] || m[4] || m[6] || m[8] || m[10] || '').trim();
    starts.push({name, kind, line: i + 1, exported: !!m[1]});
  }
  const decls = [];
  for (let i = 0; i < starts.length; i++) {
    const startLine = starts[i].line;
    const endLine = i + 1 < starts.length ? starts[i + 1].line : lines.length + 1;
    const bodyLines = trimTrailingNoise(lines.slice(startLine - 1, endLine - 1));
    const body = bodyLines.join('\n');
    decls.push({name: starts[i].name, kind: starts[i].kind, exported: starts[i].exported, startLine, body});
  }
  return decls;
}

function addNamedBindings(names, namedList) {
  for (const part of namedList.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const alias = token.split(/\s+as\s+/i).pop().trim();
    if (alias) names.add(alias);
  }
}

export function extractTopLevelImportedNames(source) {
  const names = new Set();
  for (const re of [IMPORT_NAMED_RE, IMPORT_DEFAULT_RE, IMPORT_NAMESPACE_RE]) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = global.exec(source))) {
      if (re === IMPORT_NAMED_RE) {
        addNamedBindings(names, m[1]);
      } else if (re === IMPORT_DEFAULT_RE) {
        names.add(m[1]);
        if (m[2]) addNamedBindings(names, m[2]);
      } else {
        names.add(m[1]);
      }
    }
  }
  return names;
}

export function stripExportPrefix(text) {
  return text.replace(/^export\s+/, '');
}

export function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeBody(text) {
  return normalizeWhitespace(stripExportPrefix(text));
}

export function applyAllowlist(name, body, allowlist) {
  let out = body;
  for (const entry of allowlist) {
    if (entry.declaration !== name) continue;
    const occurrences = out.split(entry.find).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `allowlist entry for "${name}" expects its find text exactly once, found ${occurrences}`
      );
    }
    out = out.split(entry.find).join(entry.replace);
  }
  return out;
}

// `main` only equals the true pristine baseline until the first section whose
// allowlist substitution actually lands there. From that point on it drifts:
// its app.js already contains earlier sections' setter calls, so re-applying
// the SAME allowlist entries against it (as every later --manifest run does,
// since entries accumulate and are never pruned) double-applies them and
// produces false `edited`/`allowlist` failures. A git blob hash is immune to
// this: it names an exact, content-addressed snapshot that never drifts.
// Accept either: a commit-ish (existing `<ref>:app.js>` form) or a bare
// 40-hex blob hash (the frozen baseline app.js is `git show <blob>` on its
// own, no path suffix). Verify commands should pass the manifest's own
// recorded `baseline.blob`, not "main", once any allowlist entry exists.
export function readBaselineSource(root, baselineSha) {
  if (/^[0-9a-f]{40}$/.test(baselineSha)) {
    const type = execFileSync('git', ['cat-file', '-t', baselineSha], {cwd: root, encoding: 'utf8'}).trim();
    if (type === 'blob') return execFileSync('git', ['show', baselineSha], {cwd: root, encoding: 'utf8'});
  }
  return execFileSync('git', ['show', `${baselineSha}:app.js`], {cwd: root, encoding: 'utf8'});
}

export function loadManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

export function loadAllowlist(root) {
  const allowPath = path.join(root, 'scripts', 'check-app-split.allow.json');
  if (!fs.existsSync(allowPath)) return [];
  return JSON.parse(fs.readFileSync(allowPath, 'utf8'));
}

export function discoverModuleFiles(root, manifest) {
  const candidates = manifest && manifest.moduleOrder ? manifest.moduleOrder : ['app.js'];
  const files = [];
  for (const relPath of candidates) {
    if (relPath === 'app.js' || fs.existsSync(path.join(root, relPath))) files.push(relPath);
  }
  if (!files.includes('app.js')) files.push('app.js');
  return files;
}

export function buildCurrentDeclarationIndex(root, files, manifest) {
  const byName = new Map();
  for (const relPath of files) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8');
    for (const decl of extractDeclarations(source)) {
      // A non-exported declaration inside a split module is private,
      // module-internal infrastructure (for example a local placeholder a
      // module declares to receive a value pushed in through a setter,
      // avoiding an import cycle back to app.js). It is invisible outside
      // its own file, so it cannot be the current home of a moved baseline
      // declaration and must not collide with one that happens to share its
      // name. app.js itself needs no export to be usable, since it is the
      // entry script's own top-level scope, so its declarations always count
      // -- except for a `let` binding whose name the manifest assigns to a
      // module that already exists elsewhere. That is app.js's own mutable
      // local shadow of a moved, appearance-monkey-patchable function
      // (design-gallery/build.mjs's gallery sources reassign these by name
      // right before app.js's own init() call, so app.js keeps its own `let`
      // seeded from the real import and pushes the live value out to
      // whichever module needs to call the current, possibly-patched
      // version). It is infrastructure the same way a private local in
      // another split module is, not a competing home for that name.
      if (relPath !== 'app.js' && !decl.exported) continue;
      if (relPath === 'app.js' && decl.kind === 'let' && manifest &&
          manifest.declarations[decl.name] && manifest.declarations[decl.name] !== 'app.js' &&
          fs.existsSync(path.join(root, manifest.declarations[decl.name]))) continue;
      const list = byName.get(decl.name) || [];
      list.push({file: relPath, body: decl.body});
      byName.set(decl.name, list);
    }
  }
  return byName;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function computeGalleryNameUnion(root, declarationNames, sources = GALLERY_SOURCES) {
  const union = new Set();
  for (const relPath of sources) {
    const filePath = path.join(root, relPath);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const name of declarationNames) {
      if (union.has(name)) continue;
      if (new RegExp('\\b' + escapeRegex(name) + '\\b').test(text)) union.add(name);
    }
  }
  return union;
}

export function computeAppTopLevelScope(root) {
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const declared = extractDeclarations(appSource).map(decl => decl.name);
  const imported = extractTopLevelImportedNames(appSource);
  return new Set([...declared, ...imported]);
}

export function runCheck({root, baselineSha, manifestPath, gallery, allowlist}) {
  const failures = [];
  const baselineSource = readBaselineSource(root, baselineSha);
  const baselineDecls = extractDeclarations(baselineSource);

  const manifest = manifestPath ? loadManifest(manifestPath) : null;
  const files = discoverModuleFiles(root, manifest);
  const currentIndex = buildCurrentDeclarationIndex(root, files, manifest);
  const resolvedAllowlist = allowlist || [];

  for (const decl of baselineDecls) {
    const matches = currentIndex.get(decl.name) || [];
    if (matches.length === 0) {
      failures.push(`missing: "${decl.name}" is not present in any current file`);
      continue;
    }
    if (matches.length > 1) {
      failures.push(
        `duplicate: "${decl.name}" appears in ${matches.map(m => m.file).join(', ')}`
      );
      continue;
    }
    const match = matches[0];
    let expectedBody;
    try {
      expectedBody = applyAllowlist(decl.name, decl.body, resolvedAllowlist);
    } catch (error) {
      failures.push(`allowlist: ${error.message}`);
      continue;
    }
    if (normalizeBody(expectedBody) !== normalizeBody(match.body)) {
      failures.push(`edited: "${decl.name}" in ${match.file} does not match its baseline body`);
      continue;
    }
    if (manifest) {
      const assignedModule = manifest.declarations[decl.name];
      if (!assignedModule) {
        failures.push(`manifest: "${decl.name}" has no assigned module in the manifest`);
        continue;
      }
      const assignedModuleExists = assignedModule === 'app.js' || fs.existsSync(path.join(root, assignedModule));
      if (assignedModuleExists) {
        if (match.file !== assignedModule) {
          failures.push(
            `wrong module: "${decl.name}" found in ${match.file}, manifest assigns ${assignedModule}`
          );
        }
      } else if (match.file !== 'app.js') {
        failures.push(
          `premature move: "${decl.name}" found in ${match.file}, but its assigned module ${assignedModule} does not exist yet, so it must still be in app.js`
        );
      }
    }
  }

  if (gallery) {
    const declarationNames = baselineDecls.map(decl => decl.name);
    const galleryNames = computeGalleryNameUnion(root, declarationNames);
    const topLevelScope = computeAppTopLevelScope(root);
    for (const name of [...galleryNames].sort()) {
      if (!topLevelScope.has(name)) {
        failures.push(`gallery scope: "${name}" is referenced by the injected gallery sources but missing from app.js's top-level scope`);
      }
    }
  }

  return {failures, baselineDeclarationCount: baselineDecls.length};
}

function parseArgs(argv) {
  const args = {baselineSha: null, manifestPath: null, gallery: false};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--manifest') {
      args.manifestPath = argv[++i];
    } else if (arg === '--gallery') {
      args.gallery = true;
    } else {
      rest.push(arg);
    }
  }
  args.baselineSha = rest[0];
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baselineSha) {
    console.error('Usage: node scripts/check-app-split.mjs <baseline-sha> [--manifest <path>] [--gallery]');
    process.exitCode = 1;
    return;
  }
  const allowlist = loadAllowlist(root);
  const manifestPath = args.manifestPath ? path.resolve(root, args.manifestPath) : null;
  const {failures, baselineDeclarationCount} = runCheck({
    root,
    baselineSha: args.baselineSha,
    manifestPath,
    gallery: args.gallery,
    allowlist
  });
  console.log(`check-app-split: ${baselineDeclarationCount} baseline declarations checked`);
  if (failures.length) {
    console.error(`check-app-split: ${failures.length} failure(s)`);
    for (const failure of failures) console.error('  - ' + failure);
    process.exitCode = 1;
    return;
  }
  console.log('check-app-split: PASS');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
