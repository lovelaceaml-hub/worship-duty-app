/* Checks the browser modules in app/ without a browser:
   - each file parses as a module;
   - every imported name is exported by the file it comes from, and is used;
   - every export is used by another module or a unit test;
   - every data-act, data-change and data-input in the markup has a handler
     in defineActions(), and every handler is used by some markup.
     node --experimental-vm-modules scripts/check-modules.mjs */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

async function files(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function exportsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    match[1].split(',').map(item => item.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach(name => names.add(name));
  }
  return names;
}

function importsOf(source) {
  const out = [];
  for (const match of source.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm)) {
    match[1].split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
      const [name, local] = item.split(/\s+as\s+/);
      out.push({ name, local: local || name, from: match[2] });
    });
  }
  for (const match of source.matchAll(/^import\s+\*\s+as\s+(\w+)\s+from\s*'([^']+)';/gm)) out.push({ name: '*', local: match[1], from: match[2] });
  return out;
}

const all = await files(path.join(repo, 'app'));
const sources = new Map(await Promise.all(all.map(async file => [file, await fs.readFile(file, 'utf8')])));

for (const [file, source] of sources) {
  const name = path.relative(repo, file);
  try { new vm.SourceTextModule(source, { identifier: name }); }
  catch (error) { problems.push(name + ': ' + error.message); continue; }
  const body = source.replace(/^import[\s\S]*?;$/gm, '');
  for (const item of importsOf(source)) {
    const target = path.resolve(path.dirname(file), item.from);
    if (!sources.has(target)) { problems.push(name + ': imports a missing file ' + item.from); continue; }
    if (item.name !== '*' && !exportsOf(sources.get(target)).has(item.name)) problems.push(name + ': ' + item.from + ' does not export ' + item.name);
    if (!new RegExp('(?<![\\w$.])' + item.local.replace(/\$/g, '\\$') + '(?![\\w$])').test(body)) problems.push(name + ': ' + item.local + ' is imported but not used');
  }
}

/* ---- exports nobody uses ---- */

const used = new Map([...sources.keys()].map(file => [file, new Set()]));
const tests = [];
for (const folder of ['tests/unit']) {
  for (const entry of await fs.readdir(path.join(repo, folder))) {
    if (entry.endsWith('.mjs')) tests.push(path.join(repo, folder, entry));
  }
}
for (const file of [...sources.keys(), ...tests]) {
  const source = sources.get(file) || await fs.readFile(file, 'utf8');
  const body = source.replace(/^import[\s\S]*?;$/gm, '');
  for (const item of importsOf(source)) {
    const target = path.resolve(path.dirname(file), item.from);
    if (!used.has(target)) continue;
    if (item.name !== '*') { used.get(target).add(item.name); continue; }
    // A namespace passed around as a value (a screen) uses its whole interface.
    const whole = new RegExp('(?<![\\w$.])' + item.local + '(?![\\w$.])').test(body);
    for (const name of exportsOf(sources.get(target))) {
      if (whole || new RegExp('\\b' + item.local + '\\.' + name + '\\b').test(body)) used.get(target).add(name);
    }
  }
  // import('./x.js').then(module => module.name(...))
  for (const match of source.matchAll(/import\(\s*'(\.{1,2}\/[^']+)'\s*\)/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    for (const name of exportsOf(sources.get(target) || '')) {
      if (new RegExp('\\.' + name + '\\b').test(body)) used.get(target).add(name);
    }
  }
}
for (const [file, names] of used) {
  if (file.endsWith(path.join('app', 'main.js'))) continue;
  for (const name of exportsOf(sources.get(file))) {
    if (!names.has(name)) problems.push(path.relative(repo, file) + ': exports ' + name + ', which nothing uses');
  }
}

/* ---- actions without handlers, and handlers without actions ---- */

const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const markup = [...sources.values(), await fs.readFile(path.join(repo, 'index.html'), 'utf8')].map(withoutComments).join('\n');
const wanted = new Set([...markup.matchAll(/data-(?:act|change|input)="([^"$]+)"/g)].map(match => match[1]));
const handled = new Map();
for (const [file, source] of sources) {
  for (const block of source.matchAll(/^defineActions\(\{\n([\s\S]*?)^\}\);/gm)) {
    for (const key of block[1].matchAll(/^  '?([A-Za-z][\w-]*)'?\s*:/gm)) handled.set(key[1], path.relative(repo, file));
  }
}
for (const name of wanted) if (!handled.has(name)) problems.push('No handler for data-act/change/input "' + name + '"');
for (const [name, file] of handled) if (!wanted.has(name)) problems.push(file + ': handler "' + name + '" is never used in markup');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Checked ' + sources.size + ' modules and ' + handled.size + ' actions.');
