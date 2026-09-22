import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.UI_BASE_URL || 'http://127.0.0.1:8087';
const evidenceDir = process.env.UI_EVIDENCE_DIR || '/tmp/worship-duty-ui-evidence';
await fs.mkdir(evidenceDir, { recursive: true });
const readModule = async name => { try { return await fs.readFile(path.resolve(name), 'utf8'); } catch { return ''; } };
const manifest = JSON.parse(await fs.readFile(path.resolve('scripts/check-app-split.manifest.json'), 'utf8'));
const appSource = (await Promise.all(manifest.moduleOrder.map(readModule))).join('\n');
const unlockHash = appSource.match(/const DEFAULT_SITE_HASH = '([^']+)'/)?.[1] || '';
if (!unlockHash) throw new Error('Could not find the local preview unlock hash');
console.log('UI QA: launching Chromium');
const browser = await chromium.launch({ headless: true });
const results = [];

async function auditLockScreen() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('#site-pin-input').waitFor({ timeout: 15000 });
  const scan = await new AxeBuilder({ page }).analyze();
  await context.close();
  return scan.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) }));
}

async function audit(name, viewport, isMobile = false) {
  console.log(`UI QA: checking ${name}`);
  const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedResponses = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      url.searchParams.delete('key');
      failedResponses.push(`${response.status()} ${url.toString()}`);
    }
  });
  await page.addInitScript(hash => {
    if (hash) localStorage.setItem('wds-site-unlock', hash);
  }, unlockHash);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#view')?.textContent?.includes('Loading schedule'), null, { timeout: 20000 });
  await page.locator('nav.tabs:not(.hidden), #member-login').first().waitFor();
  if (await page.locator('#member-login').count()) {
    const loginAxe = await new AxeBuilder({ page }).analyze();
    await page.screenshot({ path: path.join(evidenceDir, `${name}-member-login.png`), fullPage: true });
    results.push({
      name, viewport, loginScreen: true,
      scheduleViolations: loginAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
      myDutiesViolations: [], presiderViolations: [], libraryViolations: [],
      servicesViolations: [], insightsViolations: [], manageViolations: [],
      consoleErrors, failedResponses
    });
    await context.close();
    return;
  }
  console.log(`UI QA: ${name} schedule ready`);

  const active = await page.locator('nav.tabs button.active').textContent();
  if (!active?.includes('Schedule')) throw new Error(`${name}: Schedule was not the initial active section`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error(`${name}: page has horizontal overflow`);

  const scheduleAxe = await new AxeBuilder({ page }).analyze();
  await page.screenshot({ path: path.join(evidenceDir, `${name}-schedule.png`), fullPage: true });

  await page.getByRole('button', { name: /My Duties/ }).click();
  const options = await page.locator('#me-select option').evaluateAll(items => items.slice(1).map(item => item.value));
  let presider = '';
  for (const option of options) {
    await page.locator('#me-select').selectOption(option);
    if (await page.locator('#tab-presider:not(.hidden)').count()) { presider = option; break; }
  }
  if (!presider) throw new Error(`${name}: could not find an upcoming presider journey`);
  await page.locator('.duty-card').first().waitFor();
  const myDutiesAxe = await new AxeBuilder({ page }).analyze();
  await page.getByRole('button', { name: 'Presider' }).click();
  await page.locator('#song-root .ns-tabs').waitFor({ timeout: 15000 });
  console.log(`UI QA: ${name} presider ready`);
  const songsAxe = await new AxeBuilder({ page }).analyze();
  await page.screenshot({ path: path.join(evidenceDir, `${name}-presider.png`), fullPage: true });

  await page.getByRole('tab', { name: 'Library' }).click();
  const firstSongRow = page.locator('.song-row[role="button"]').first();
  await firstSongRow.focus();
  await page.keyboard.press('Enter');
  if (await firstSongRow.getAttribute('aria-expanded') !== 'true') throw new Error(`${name}: keyboard could not expand a song row`);
  const nestedButtonHandled = await page.evaluate(() => {
    const row = document.querySelector('.song-row[role="button"]');
    const button = document.createElement('button');
    button.id = 'qa-nested-action';
    button.dataset.songAct = 'quick-add';
    button.dataset.id = 'qa-missing-song';
    button.textContent = 'QA nested action';
    button.addEventListener('click', () => { window.__qaNestedClicks = (window.__qaNestedClicks || 0) + 1; });
    row.appendChild(button);
    button.focus();
    return true;
  });
  if (!nestedButtonHandled) throw new Error(`${name}: could not prepare nested action keyboard test`);
  await page.keyboard.press('Enter');
  if (await page.evaluate(() => window.__qaNestedClicks) !== 1) throw new Error(`${name}: nested song action was intercepted by the row`);
  await page.locator('#qa-nested-action').evaluate(node => node.remove());
  await page.locator('#lib-search').fill('no song should match this phrase');
  await page.getByText('No songs match your search.').waitFor();
  const libraryAxe = await new AxeBuilder({ page }).analyze();
  await page.getByRole('tab', { name: 'Services' }).click();
  const servicesAxe = await new AxeBuilder({ page }).analyze();
  await page.getByRole('tab', { name: 'Insights' }).click();
  const insightsAxe = await new AxeBuilder({ page }).analyze();

  await page.locator('.header-home').focus();
  await page.keyboard.press('Enter');
  const afterHeader = await page.locator('nav.tabs button.active').textContent();
  if (!afterHeader?.includes('Schedule')) throw new Error(`${name}: keyboard header action did not return to Schedule`);
  await page.getByRole('button', { name: /Manage/ }).click();
  await page.locator('.lock-title').filter({ hasText: /Editing is locked|Create the editor passcode/ }).waitFor();
  const manageAxe = await new AxeBuilder({ page }).analyze();

  results.push({
    name,
    viewport,
    presiderFound: !!presider,
    scheduleViolations: scheduleAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
    myDutiesViolations: myDutiesAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
    presiderViolations: songsAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
    libraryViolations: libraryAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
    servicesViolations: servicesAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
    insightsViolations: insightsAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
    manageViolations: manageAxe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(node => node.target.join(' ')) })),
    consoleErrors,
    failedResponses
  });
  await context.close();
}

try {
  const lockViolations = await auditLockScreen();
  if (lockViolations.length) throw new Error(`Lock screen accessibility violations: ${JSON.stringify(lockViolations)}`);
  await audit('desktop', { width: 1440, height: 1000 });
  await audit('phone', { width: 360, height: 800 }, true);
} finally {
  await browser.close();
}

await fs.writeFile(path.join(evidenceDir, 'ui-qa.json'), JSON.stringify(results, null, 2) + '\n');
const violations = results.flatMap(result => [
  ...result.scheduleViolations,
  ...result.myDutiesViolations,
  ...result.presiderViolations,
  ...result.libraryViolations,
  ...result.servicesViolations,
  ...result.insightsViolations,
  ...result.manageViolations
]);
console.log(JSON.stringify(results, null, 2));
if (violations.length) process.exitCode = 1;
