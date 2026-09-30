/* Puts the app on Firebase Hosting. Nothing else (no functions, no rules).
     node scripts/release.mjs preview                 a private preview link, valid 7 days
     node scripts/release.mjs live                    the live app, https://lv-zion-duties.web.app
     node scripts/release.mjs live --maintenance      the live app showing "being updated"
   The preview uses the real database: whatever you change there is real.
   Firebase runs scripts/build.mjs first (firebase.json predeploy). */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [target, ...flags] = process.argv.slice(2);
if (!['preview', 'live'].includes(target) || flags.some(flag => flag !== '--maintenance')) {
  console.error('Use: node scripts/release.mjs preview | live [--maintenance]');
  process.exit(1);
}
const maintenance = flags.includes('--maintenance');
if (maintenance && target !== 'live') { console.error('--maintenance is for live releases.'); process.exit(1); }

const git = args => spawnSync('git', args, { cwd: repo, encoding: 'utf8' }).stdout.trim();
console.log('Releasing ' + git(['rev-parse', '--abbrev-ref', 'HEAD']) + ' at ' + git(['rev-parse', '--short', 'HEAD']) + ' to ' + target + (maintenance ? ' (maintenance screen on)' : '') + '.');
if (git(['status', '--porcelain', '--', 'index.html', 'app', 'styles', 'sw.js', 'song-lib.js', 'song-seed.js', 'permissions.js'])) {
  console.log('Note: some app files have changes that are not committed; they are included.');
}

const firebase = ['-y', 'firebase-tools@latest'];
const deploy = target === 'preview'
  ? ['hosting:channel:deploy', 'preview', '--expires', '7d']
  : ['deploy', '--only', 'hosting'];
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [...firebase, ...deploy, '--project', 'lv-zion-duties'], {
  cwd: repo,
  stdio: 'inherit',
  env: Object.assign({ npm_config_cache: '/tmp/npm-cache' }, process.env, { WDS_MAINTENANCE: maintenance ? '1' : '0' })
});
process.exit(result.status === null ? 1 : result.status);
