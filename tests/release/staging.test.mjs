import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  BASE_RUNTIME_FILES,
  HOSTING_SITE,
  deployArguments,
  runCli,
  parseArguments,
  stageRelease,
  removeStage
} from '../../scripts/release.mjs';

const { mkdir, mkdtemp, readFile, readdir, rm, writeFile } = fs;
const STAMP = '20990102030405';

function sourceConfig() {
  const immutable = value => ({
    source: value,
    headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
  });
  return {
    hosting: {
      site: HOSTING_SITE,
      public: '.',
      ignore: ['firebase.json', '**/.*', 'docs/**', 'functions/**', 'tests/**'],
      headers: [
        { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: '**/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: 'sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: 'manifest.json', headers: [{ key: 'Cache-Control', value: 'max-age=86400' }] },
        { source: 'icon.svg', headers: [{ key: 'Cache-Control', value: 'max-age=86400' }] },
        ...BASE_RUNTIME_FILES
          .filter(file => !['index.html', 'sw.js', 'manifest.json', 'icon.svg'].includes(file))
          .map(immutable),
        immutable('src/**/*.js'),
        immutable('src/**/*.mjs'),
        immutable('src/**/*.css')
      ],
      rewrites: [{ source: '/ics/**', function: 'ics' }]
    }
  };
}

async function writeFixtureFile(rootDir, relativePath, contents) {
  const absolutePath = path.join(rootDir, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, 'utf8');
}

async function makeFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'worship-release-fixture-'));
  const files = {
    'index.html': [
      '<!doctype html><html><head>',
      '<link rel="manifest" href="manifest.json">',
      '<link rel="icon" href="icon.svg">',
      '</head><body>',
      '<script src="seed-data.js?v=DEV"></script>',
      '<script src="firebase-config.js?v=DEV"></script>',
      '<script type="module" src="app.js?v=DEV"></script>',
      '</body></html>'
    ].join(''),
    'manifest.json': JSON.stringify({
      name: 'Fictional Worship Service',
      start_url: '/',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }]
    }),
    'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
    'sw.js': "const RELEASE = 'DEV'; self.registration.showNotification('Fixture', { icon: 'icon.svg' });",
    'app.js': [
      "const ASSET_V = '?v=DEV';",
      "const icon = 'icon.svg';",
      "const external = 'https://cdn.example/lib.js?v=1.2.3';",
      "export async function loadFixture() { return import('./src/core/runtime.js' + ASSET_V); }",
      "navigator.serviceWorker?.register('sw.js');"
    ].join('\n'),
    'seed-data.js': 'window.SEED_DATA = { members: [] };',
    'firebase-config.js': 'window.FIREBASE_CONFIG = { projectId: "fictional" };',
    'song-app.js': 'export function mount() { return null; }',
    'song-app.css': 'body { background-image: url("icon.svg"); }',
    'song-seed.js': 'window.SONG_SEED = [];',
    'song-lib.js': 'window.SongLib = {};',
    'src/core/runtime.js': "import './nested.js'; export const fixtureValue = 1;",
    'src/core/nested.js': 'export const nestedValue = 2;'
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    await writeFixtureFile(rootDir, relativePath, contents);
  }
  await writeFixtureFile(rootDir, 'firebase.json', `${JSON.stringify(sourceConfig(), null, 2)}\n`);
  await writeFixtureFile(rootDir, 'docs/should-not-stage.md', 'fictional documentation');
  await writeFixtureFile(rootDir, 'tests/should-not-stage.js', 'throw new Error("not runtime");');
  await writeFixtureFile(rootDir, '.env', 'FICTIONAL_SECRET=never-stage');
  return rootDir;
}

async function allFiles(rootDir) {
  const result = [];
  async function visit(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(rootDir, ...relativePath.split('/'));
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (entry.isFile()) result.push(relativePath);
    }
  }
  await visit(rootDir, '');
  return result.filter(Boolean);
}

async function snapshot(rootDir) {
  const result = new Map();
  for (const relativePath of await allFiles(rootDir)) {
    const contents = await readFile(path.join(rootDir, ...relativePath.split('/')));
    result.set(relativePath, createHash('sha256').update(contents).digest('hex'));
  }
  return result;
}

async function withFixture(callback) {
  const rootDir = await makeFixture();
  try {
    return await callback(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('stages only runtime files, stamps references, and preserves source bytes', async () => {
  await withFixture(async rootDir => {
    const before = await snapshot(rootDir);
    const staged = await stageRelease({ rootDir, stamp: STAMP });
    try {
      const after = await snapshot(rootDir);
      assert.deepEqual(after, before);
      assert.deepEqual(staged.validation.files, [
        'app.js', 'firebase-config.js', 'firebase.json', 'icon.svg', 'index.html',
        'manifest.json', 'seed-data.js', 'song-app.css', 'song-app.js',
        'song-lib.js', 'song-seed.js', 'src/core/nested.js', 'src/core/runtime.js', 'sw.js'
      ]);
      const stagedIndex = await readFile(path.join(staged.stageDir, 'index.html'), 'utf8');
      const stagedApp = await readFile(path.join(staged.stageDir, 'app.js'), 'utf8');
      const stagedModule = await readFile(path.join(staged.stageDir, 'src/core/runtime.js'), 'utf8');
      const stagedServiceWorker = await readFile(path.join(staged.stageDir, 'sw.js'), 'utf8');
      assert.match(stagedIndex, new RegExp(`app\\.js\\?v=${STAMP}`));
      assert.match(stagedIndex, new RegExp(`manifest\\.json\\?v=${STAMP}`));
      assert.match(stagedApp, new RegExp(`ASSET_V\\s*=\\s*['"]\\?v=${STAMP}`));
      assert.match(stagedApp, /https:\/\/cdn\.example\/lib\.js\?v=1\.2\.3/);
      assert.match(stagedApp, /import\('\.\/src\/core\/runtime\.js' \+ ASSET_V\)/);
      assert.match(stagedModule, new RegExp(`nested\\.js\\?v=${STAMP}`));
      assert.match(stagedServiceWorker, new RegExp(`RELEASE\\s*=\\s*['"]${STAMP}`));
      assert.doesNotMatch(stagedIndex, /\?v=DEV/);
      assert.doesNotMatch(stagedApp, /\?v=DEV/);
      assert.doesNotMatch(stagedServiceWorker, /RELEASE\s*=\s*['"]DEV/);
      assert.equal(staged.validation.config.hosting.site, HOSTING_SITE);
      assert.deepEqual(staged.validation.config.hosting.rewrites, [{ source: '/ics/**', function: 'ics' }]);
      assert.equal(staged.validation.config.hosting.headers.find(entry => entry.source === 'src/**/*.js').headers[0].value, 'public, max-age=31536000, immutable');
      const stagedFiles = await allFiles(staged.stageDir);
      assert.ok(!stagedFiles.some(file => file.startsWith('docs/')));
      assert.ok(!stagedFiles.some(file => file.startsWith('tests/')));
      assert.ok(!stagedFiles.includes('.env'));
    } finally {
      await removeStage(staged.stageDir);
    }
  });
});

test('rejects a missing HTML runtime reference before writing a stage', async () => {
  await withFixture(async rootDir => {
    const indexPath = path.join(rootDir, 'index.html');
    const before = await readFile(indexPath, 'utf8');
    await writeFile(indexPath, before.replace('</body>', '<script src="missing-runtime.js"></script></body>'), 'utf8');
    const changed = await readFile(indexPath, 'utf8');
    await assert.rejects(
      () => stageRelease({ rootDir, stamp: STAMP }),
      error => error.code === 'MISSING_RUNTIME_REFERENCE' && /missing-runtime\.js/.test(error.message)
    );
    assert.equal(await readFile(indexPath, 'utf8'), changed);
  });
});

test('rejects syntax errors in staged JavaScript and leaves the invalid source untouched', async () => {
  await withFixture(async rootDir => {
    const modulePath = path.join(rootDir, 'src/core/nested.js');
    await writeFile(modulePath, 'export const = ;', 'utf8');
    const before = await readFile(modulePath, 'utf8');
    await assert.rejects(
      () => stageRelease({ rootDir, stamp: STAMP }),
      error => error.code === 'SYNTAX_ERROR' && /src\/core\/nested\.js/.test(error.message)
    );
    assert.equal(await readFile(modulePath, 'utf8'), before);
  });
});

test('cleans a caller supplied output root after failure and allows a corrected retry', async () => {
  await withFixture(async rootDir => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'worship-release-output-'));
    const modulePath = path.join(rootDir, 'src/core/nested.js');
    try {
      await writeFile(modulePath, 'export const = ;', 'utf8');
      await assert.rejects(
        () => stageRelease({ rootDir, stamp: STAMP, outputDir }),
        error => error.code === 'SYNTAX_ERROR' && /src\/core\/nested\.js/.test(error.message)
      );
      assert.deepEqual(await readdir(outputDir), []);

      await writeFile(modulePath, 'export const nestedValue = 2;', 'utf8');
      const staged = await stageRelease({ rootDir, stamp: STAMP, outputDir });
      assert.equal(staged.stageDir, outputDir);
      assert.ok((await readdir(path.join(outputDir, 'src/core'))).includes('nested.js'));
      await removeStage(outputDir);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});

test('aborts before staging when the signal is already cancelled', async () => {
  await withFixture(async rootDir => {
    const controller = new AbortController();
    controller.abort();
    const before = await snapshot(rootDir);
    await assert.rejects(
      () => stageRelease({ rootDir, stamp: STAMP, signal: controller.signal }),
      error => error.name === 'AbortError' && error.code === 'ABORT_ERR'
    );
    assert.deepEqual(await snapshot(rootDir), before);
  });
});

test('rejects missing immutable headers for every src module', async () => {
  await withFixture(async rootDir => {
    const configPath = path.join(rootDir, 'firebase.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.hosting.headers = config.hosting.headers.filter(entry => entry.source !== 'src/**/*.js');
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await assert.rejects(
      () => stageRelease({ rootDir, stamp: STAMP }),
      error => error.code === 'MISSING_IMMUTABLE_HEADER' && /src\/core\/nested\.js/.test(error.message)
    );
  });
});

test('builds a Hosting only deploy command for the named site', () => {
  assert.deepEqual(deployArguments('/private/tmp/fictional-stage'), [
    '-y', 'firebase-tools@latest', 'deploy',
    '--config', '/private/tmp/fictional-stage/firebase.json',
    '--project', HOSTING_SITE,
    '--only', `hosting:${HOSTING_SITE}`,
    '--non-interactive'
  ]);
});

test('rejects an option token as a missing output value before staging or deploy', async () => {
  assert.throws(
    () => parseArguments(['--output-dir', '--dry-run']),
    error => error.code === 'INVALID_ARGUMENT' && /--output-dir requires a value/.test(error.message)
  );

  let stageStarted = false;
  let deployStarted = false;
  const exitCode = await runCli(['--output-dir', '--dry-run'], {
    stageReleaseFn: async () => {
      stageStarted = true;
      return { stamp: STAMP, stageDir: '/private/tmp/fictional-stage', runtimePaths: [] };
    },
    deployStagedFn: async () => {
      deployStarted = true;
    }
  });
  assert.equal(exitCode, 1);
  assert.equal(stageStarted, false);
  assert.equal(deployStarted, false);
});
