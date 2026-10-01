/* Screenshots of every screen in one appearance, on a phone and a desktop,
   with the fake data. For checking how an appearance looks.
     node tests/browser/shoot.mjs --appearance prism --out /tmp/shots [--dark] [--only schedule]
   Files are named <viewport>-<screen>.png. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, launch, openPage, unlock, signIn, tab, section, PHONE, DESKTOP } from './harness.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at === -1 ? fallback : args[at + 1]; };
const appearance = option('--appearance', 'classic');
const out = path.resolve(option('--out', 'screenshots/' + appearance));
const only = option('--only', '');
const dark = args.includes('--dark');
await fs.mkdir(out, { recursive: true });

const server = await startServer(option('--root', '.'));
const browser = await launch();
const problems = [];

async function shoot(page, name) {
  if (only && !name.includes(only)) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
}

for (const [label, viewport] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  const { context, page, errors } = await openPage(browser, server.url, { viewport, appearance, dark });
  await page.locator('#site-passcode').waitFor();
  await shoot(page, label + '-passcode');
  await unlock(page);
  await shoot(page, label + '-sign-in');
  await signIn(page, 'B. Adam');
  await shoot(page, label + '-schedule');
  const allButton = page.locator('[data-act="schedule-mode"][data-mode="all"]');
  if (await allButton.count()) { await allButton.click(); await shoot(page, label + '-schedule-all'); await page.locator('[data-act="schedule-mode"][data-mode="day"]').click(); }
  await tab(page, 'my');
  await shoot(page, label + '-my-duties');
  await page.locator('.duty-card-toggle').first().click();
  await shoot(page, label + '-my-duties-open');
  await page.locator('[data-slot="member"]').click();
  await page.locator('[data-slot="menu"] [data-view="availability"]').click();
  await page.waitForTimeout(400);
  await shoot(page, label + '-availability');
  await page.locator('[data-slot="member"]').click();
  await page.locator('[data-slot="menu"] [data-view="settings"]').click();
  await shoot(page, label + '-settings');
  await tab(page, 'songs');
  await page.locator('#song-root .planner-sections').waitFor({ state: 'attached' });
  await shoot(page, label + '-presider-home');
  for (const name of ['library', 'services', 'history']) {
    await section(page, 'song-section', name);
    await shoot(page, label + '-presider-' + name);
  }
  await tab(page, 'manage');
  for (const name of ['departments', 'services', 'planning', 'requests', 'leaders', 'features', 'data', 'feedback']) {
    await section(page, 'manage-section', name);
    await shoot(page, label + '-manage-' + name);
  }
  await section(page, 'manage-section', 'departments');
  await page.locator('[data-act="department-open"][data-department="Media"]').click();
  await page.waitForTimeout(500);
  await shoot(page, label + '-manage-roster');
  await page.locator('[data-act="department-member"]').first().click();
  await shoot(page, label + '-manage-member');
  await section(page, 'manage-section', 'services');
  await page.locator('#view [data-act="plan-open"]').nth(1).click();
  await shoot(page, label + '-manage-service-open');
  await page.locator('[data-slot="member"]').click();
  await page.locator('[data-slot="menu"] [data-act="appearance-open"]').click();
  await shoot(page, label + '-appearance');
  if (errors.length) problems.push(label + ': ' + errors.join(' | '));
  await context.close();
}

await browser.close();
server.stop();
console.log('Saved screenshots to ' + out);
if (problems.length) { console.error('Page errors:\n' + problems.join('\n')); process.exitCode = 1; }
