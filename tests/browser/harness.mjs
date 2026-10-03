/* Shared browser test setup: starts the fake-data server (scripts/serve.mjs
   --fake) on a free port and opens pages signed in as a made-up member.
   Nothing here reaches Firebase. */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../helpers/playwright.mjs';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PASSCODE = '2468';
export const PIN = '1234';
/* A fixed Pacific date and time: Tuesday, before the Tuesday evening service. */
export const TODAY = '2026-07-07';
export const NOW = '2026-07-07T10:00:00-07:00';
export const PHONE = { width: 390, height: 850 };
export const DESKTOP = { width: 1280, height: 900 };

function freePort() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

export async function startServer(root = '.') {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(repo, 'scripts/serve.mjs'), '--fake', '--port', String(port), '--root', root], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('Serving')) resolve(); });
    child.on('exit', code => reject(new Error('Server stopped: ' + code)));
  });
  return { url: 'http://localhost:' + port, stop: () => child.kill() };
}

export async function launch() {
  return chromium.launch();
}

/* A page at `url` with the fake data and a fixed clock. `fixture` adds to
   the fake data (see tests/fake/fixture.js); `hash` is added to the address,
   as an invite link does. */
export async function openPage(browser, url, { viewport = PHONE, dark = false, query = '', now = NOW, hash = '', fixture = null } = {}) {
  const context = await browser.newContext({ viewport, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce', serviceWorkers: 'block', colorScheme: dark ? 'dark' : 'light' });
  await context.addInitScript(({ overrides }) => {
    if (overrides) window.__fixtureOverrides = overrides;
  }, { overrides: fixture });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.setSystemTime(new Date(now));
  await page.goto(url + '/?today=' + TODAY + (query ? '&' + query : '') + hash);
  return { context, page, errors };
}

export async function unlock(page) {
  await page.locator('#site-passcode').fill(PASSCODE);
  await page.locator('form[data-act="site-unlock"] button').click();
  await page.locator('#sign-in-member').waitFor();
}

export async function signIn(page, member) {
  await page.locator('#sign-in-member').selectOption(member);
  await page.locator('#sign-in-pin').fill(PIN);
  await page.locator('form[data-act="sign-in"] button').click();
  await page.waitForFunction(() => !document.querySelector('nav.tabs').hidden || document.querySelector('#new-pin'));
  await page.waitForTimeout(300);
}

export async function tab(page, name) {
  await page.locator(`nav.tabs [data-tab="${name}"]`).click();
  await page.waitForTimeout(300);
}

/* Click a section button whether it shows in the page or in the phone row. */
export async function section(page, action, value) {
  const selector = `[data-act="${action}"][data-section="${value}"]`;
  const inPage = page.locator('#view ' + selector);
  if (await inPage.isVisible()) await inPage.click();
  else {
    const index = await inPage.evaluate(button => [...button.parentElement.querySelectorAll('button')].indexOf(button));
    await page.locator(`.subnav-top button[data-index="${index}"]`).click();
  }
  await page.waitForTimeout(300);
}
