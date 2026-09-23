
fixture.docs['app/settings'].features.calendarExport = true;
const shots = path.join(root, 'docs/runs/keep-look-features/F7-screens');
await fs.mkdir(shots, {recursive: true});
const names = {classic: 'original', prism: 'prism', navy: 'navy-cream', aurora: 'aurora'};
const results = [];
const note = (name, ok, extra) => { results.push({name, ok, extra}); console.log(ok ? 'PASS' : 'FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); };
const hideToast = page => page.evaluate(() => { const el = document.getElementById('wd-design-status'); if (el) el.hidden = true; });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const chip = page => page.locator('[data-wd-head="member"]:visible');
const menu = page => page.locator('[data-wd-head="menu"]:visible');
async function start(mode, member, opts = {}) {
  globalThis.__mode = mode; globalThis.__scheme = opts.scheme || 'light';
  const s = await make({member, forcedMember: opts.forced ? member : ''});
  if (opts.width) await s.page.setViewportSize({width: opts.width, height: 812});
  await releaseSettings(s.page); await unlockSite(s.page);
  await login(s.page, member, !!opts.forced);
  if (!opts.forced) {
    await s.page.waitForFunction(expected => window.WorshipDesign?.getMode() === expected, mode);
    await s.page.waitForTimeout(500);
  }
  return s;
}
async function menuGeometry(page) {
  return page.evaluate(() => {
    const m = [...document.querySelectorAll('[data-wd-head="menu"]')].find(x => !x.hidden && x.offsetParent !== null);
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const items = [...m.querySelectorAll('[role="menuitem"]')].map(b => { const q = b.getBoundingClientRect(); const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return {text: b.textContent, h: Math.round(q.height), onTop: top === b || b.contains(top)}; });
    return {left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: window.innerWidth, items};
  });
}
for (const mode of (process.env.MODES || 'classic,prism,navy,aurora').split(',')) {
  const n = names[mode];
  const {context, page} = await start(mode, 'S. Lisa');
  const toast = await page.locator('#wd-design-status').innerText().catch(() => '');
  if (mode !== 'classic') note(n + ' toast has no "unchanged" sentence', !/unchanged/.test(toast) && /design enabled\./.test(toast), toast);
  await hideToast(page);
  note(n + ' no signed-in banner', await page.locator('#banners').innerText().then(x => !/Signed in as/.test(x)));
  note(n + ' chip aria', await chip(page).evaluate(b => b.getAttribute('aria-haspopup') === 'menu' && b.getAttribute('aria-expanded') === 'false'));
  await page.screenshot({path: path.join(shots, n + '-1-schedule-menu-closed.png')});
  await chip(page).click();
  await page.waitForTimeout(150);
  const g = await menuGeometry(page);
  note(n + ' menu opens, inside viewport, items 44px and on top', !!g && g.left >= 0 && g.right <= g.vw && g.items.length === 3 && g.items.every(i => i.h >= 44 && i.onTop), g);
  note(n + ' aria-expanded true', await chip(page).getAttribute('aria-expanded') === 'true');
  await page.screenshot({path: path.join(shots, n + '-2-menu-open.png')});
  await page.keyboard.press('ArrowDown');
  note(n + ' arrow moves focus to Settings', await page.evaluate(() => document.activeElement?.textContent) === 'Settings');
  await page.keyboard.press('Escape');
  note(n + ' Escape closes and returns focus to chip', await menu(page).count() === 0 && await page.evaluate(() => document.activeElement?.dataset.wdHead) === 'member');
  await chip(page).click();
  await page.mouse.click(30, 400);
  await page.waitForTimeout(100);
  note(n + ' outside tap closes', await menu(page).count() === 0);
  await chip(page).click();
  await page.locator('nav.tabs [data-tab="my"]').click();
  await page.waitForTimeout(200);
  note(n + ' tab change closes', await menu(page).count() === 0);
  note(n + ' My Duties no longer holds the availability card', await page.locator('.own-availability-card').count() === 0);
  await chip(page).click();
  await menu(page).locator('text=Availability').click();
  await page.waitForSelector('.own-availability-card');
  await page.waitForTimeout(250);
  note(n + ' Availability view', await page.locator('[data-account="availability"] .own-availability-card').count() === 1 && await menu(page).count() === 0);
  note(n + ' header second line says Availability', await page.locator('[data-wd-head="screen"]:visible').innerText().then(x => /availability/i.test(x)));
  await page.screenshot({path: path.join(shots, n + '-3-availability.png')});
  await page.screenshot({path: path.join(shots, n + '-3-availability-full.png'), fullPage: true});
  note(n + ' no bottom tab marked active on an account view', await page.locator('nav.tabs button.active').count() === 0);
  await chip(page).click();
  await menu(page).locator('text=Settings').click();
  await page.waitForSelector('[data-account="settings"]');
  await page.waitForTimeout(250);
  note(n + ' Settings view has notifications, calendar, appearance', await page.evaluate(() => { const v = document.querySelector('[data-account="settings"]'); return !!v.querySelector('[data-act="notify-on"],[data-act="notify-off"]') && !!v.querySelector('[data-act="subscribe-ics"]') && !!v.querySelector('[data-design-open]:not([hidden])'); }));
  await page.screenshot({path: path.join(shots, n + '-4-settings.png')});
  await page.screenshot({path: path.join(shots, n + '-4-settings-full.png'), fullPage: true});
  await chip(page).click();
  await menu(page).locator('text=Availability').click();
  await page.waitForSelector('.own-availability-card');
  await page.locator('.own-availability-card [data-chg="member-availability-recurring"]').first().selectOption('unavailable');
  await page.locator('[data-act="member-availability-save"]').click();
  await page.waitForFunction(() => (window.__profileWrites || []).some(w => w.name === 'updateMemberAvailability'));
  note(n + ' availability still saves from the new view', await page.locator('[data-account="availability"]').count() === 1);
  await chip(page).click();
  await menu(page).locator('text=Settings').click();
  await page.waitForSelector('[data-account="settings"]');
  await page.locator('[data-account="settings"] [data-design-open]').click();
  note(n + ' Settings Appearance opens the chooser', await page.locator('.wd-design-dialog[open]').count() === 1);
  await page.keyboard.press('Escape');
  await page.locator('nav.tabs [data-tab="my"]').click();
  await page.waitForTimeout(200);
  note(n + ' My Duties tab leaves the account view', await page.locator('.account-view').count() === 0);
  note(n + ' no horizontal overflow', await overflow(page) <= 0, await overflow(page));
  await chip(page).click();
  await menu(page).locator('text=Sign out').click();
  await page.waitForSelector('#member-login');
  note(n + ' sign out returns to sign-in, chip hidden', await chip(page).count() === 0 && await menu(page).count() === 0);
  await context.close();
}
for (const mode of ['classic', 'aurora']) {
  const {context, page} = await start(mode, 'S. Lisa', {width: 320});
  await hideToast(page); await chip(page).click(); await page.waitForTimeout(150);
  const g = await menuGeometry(page);
  note(names[mode] + ' 320px menu inside viewport', !!g && g.left >= 0 && g.right <= 320 && g.items.every(i => i.h >= 44 && i.onTop) && await overflow(page) <= 0, g);
  await page.screenshot({path: path.join(shots, names[mode] + '-5-menu-open-320px.png')});
  await context.close();
}
for (const mode of ['prism', 'aurora']) {
  const {context, page} = await start(mode, 'S. Lisa', {scheme: 'dark'});
  await hideToast(page); await chip(page).click(); await page.waitForTimeout(150);
  note(names[mode] + ' dark class applied', await page.evaluate(() => document.body.classList.contains('dark')));
  await page.screenshot({path: path.join(shots, names[mode] + '-6-menu-open-dark.png')});
  await context.close();
}
{
  const {context, page} = await start('classic', 'S. Lisa', {forced: true});
  note('forced PIN change keeps its own Sign out, chip hidden', await page.locator('[data-act="member-logout"]:visible').count() === 1 && await chip(page).count() === 0);
  await page.screenshot({path: path.join(shots, 'original-7-forced-pin-sign-out.png')});
  await page.locator('[data-act="member-logout"]:visible').click();
  await page.waitForSelector('#member-login');
  note('forced PIN sign out works', true);
  await context.close();
}
await browser.close();
note('no page errors', report.errors.length === 0, report.errors);
console.log('blocked', JSON.stringify(report.blockedExternalRequests.map(r => r.url)));
const failed = results.filter(r => !r.ok);
console.log(failed.length ? 'FAILED ' + failed.length : 'ALL PASSED ' + results.length);
process.exit(failed.length ? 1 : 0);
