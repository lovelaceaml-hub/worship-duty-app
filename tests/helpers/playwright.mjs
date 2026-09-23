/** Resolve Playwright without forcing an install in every git worktree.
 * Order: this checkout's node_modules (what CI uses after `npm ci`), then the
 * folder named by WD_PLAYWRIGHT_ROOT, then the main checkout that owns this
 * worktree, then sibling projects on this Mac that already carry Playwright.
 * Nothing is downloaded and no dependency is added to the repository.
 */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function mainCheckout() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    return common ? path.dirname(common) : '';
  } catch { return ''; }
}

function candidates() {
  const projects = path.resolve(root, '..', '..');
  return [
    root,
    process.env.WD_PLAYWRIGHT_ROOT || '',
    mainCheckout(),
    path.join(projects, 'worship-duty-app'),
    path.join(projects, 'season-map')
  ].filter(Boolean);
}

export function resolveFrom(name) {
  const tried = [];
  for (const base of candidates()) {
    try {
      const require = createRequire(path.join(base, 'package.json'));
      return {module: require(name), base};
    } catch { tried.push(base); }
  }
  throw new Error('Could not load "' + name + '". Run `npm ci` in ' + root +
    ' or set WD_PLAYWRIGHT_ROOT to a folder whose node_modules has it. Tried: ' + tried.join(', '));
}

const loaded = resolveFrom('playwright');
export const playwrightRoot = loaded.base;
export const chromium = loaded.module.chromium;
