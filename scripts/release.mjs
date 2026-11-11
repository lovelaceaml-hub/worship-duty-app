/* Puts the app on Firebase Hosting. Nothing else (no functions, no rules).
     node scripts/release.mjs preview                 the approval preview link, valid 7 days
     node scripts/release.mjs preview --channel <id>  a preview on its own channel (GitHub makes one per branch)
     node scripts/release.mjs live                    the live app, https://lv-zion-duties.web.app
     node scripts/release.mjs live --maintenance      the live app showing "being updated"
   Previews use the real database: whatever you change there is real.
   Firebase runs scripts/build.mjs first (firebase.json predeploy).
   WDS_FIREBASE_TOOLS pins the Firebase CLI (GitHub uses firebase-tools@15).
   GitHub's release workflows check the exact command this builds
   (.github/scripts/deploy-guard.sh); change the two together. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fail = message => { console.error(message + ' Nothing deployed.'); process.exit(1); };

const target = args.shift();
if (!['preview', 'live'].includes(target)) fail('Use: node scripts/release.mjs preview [--channel <id>] | live [--maintenance].');
// The approval preview keeps the channel (and so the link) it has always had.
let previewChannel = 'design-gallery-review';
let maintenance = false;
while (args.length) {
  const flag = args.shift();
  if (flag === '--maintenance' && target === 'live') maintenance = true;
  else if (flag === '--channel' && target === 'preview') {
    previewChannel = String(args.shift() || '');
    if (!/^[a-z0-9](?:[a-z0-9-]{0,34}[a-z0-9])?$/.test(previewChannel) || ['live', 'design-gallery-review'].includes(previewChannel)) {
      fail('--channel needs a lowercase preview channel id (letters, digits and hyphens, at most 36 characters) other than "live" and "design-gallery-review".');
    }
  } else fail('Unknown option ' + flag + ' (--channel goes with preview, --maintenance with live).');
}
const firebaseTools = process.env.WDS_FIREBASE_TOOLS || 'firebase-tools@latest';
if (!/^firebase-tools(@(latest|\d+(\.\d+){0,2}))?$/.test(firebaseTools)) fail('WDS_FIREBASE_TOOLS must be firebase-tools or firebase-tools@<version>.');

const git = gitArgs => spawnSync('git', gitArgs, { cwd: repo, encoding: 'utf8' }).stdout.trim();
console.log('Releasing ' + git(['rev-parse', '--abbrev-ref', 'HEAD']) + ' at ' + git(['rev-parse', '--short', 'HEAD']) + ' to ' +
  (target === 'live' ? 'the live site' : 'preview channel ' + previewChannel) + (maintenance ? ' (maintenance screen on)' : '') + '.');
if (git(['status', '--porcelain', '--', 'index.html', 'app', 'styles', 'sw.js', 'song-lib.js', 'song-seed.js', 'permissions-data.js', 'permissions.js'])) {
  console.log('Note: some app files have changes that are not committed; they are included.');
}
console.log('Deploying Hosting only. No functions, rules or schedule records are deployed.');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const firebase = ['--yes', firebaseTools];
const releaseArgs = target === 'live' ? ['deploy', '--only', 'hosting'] : ['hosting:channel:deploy', previewChannel, '--expires', '7d'];
const result = spawnSync(command, [...firebase, ...releaseArgs, '--config', path.join(repo, 'firebase.json'), '--project', 'lv-zion-duties'], {
  cwd: repo,
  stdio: 'inherit',
  env: Object.assign({ npm_config_cache: '/tmp/npm-cache' }, process.env, { WDS_MAINTENANCE: maintenance ? '1' : '0' })
});
process.exit(result.status === null ? 1 : result.status);
