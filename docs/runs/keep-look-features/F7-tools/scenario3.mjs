
const shots = path.join(root, 'docs/runs/keep-look-features/F7-screens');
const names = {classic: 'original', prism: 'prism', navy: 'navy-cream', aurora: 'aurora'};
let bad = 0;
for (const mode of ['classic','prism','navy','aurora']) {
  globalThis.__mode = mode;
  const s = await make({member: 'E. Simon'});
  await releaseSettings(s.page); await unlockSite(s.page); await login(s.page, 'E. Simon');
  await s.page.waitForFunction(expected => window.WorshipDesign?.getMode() === expected, mode);
  await s.page.waitForTimeout(500);
  await s.page.evaluate(() => { const el = document.getElementById('wd-design-status'); if (el) el.hidden = true; });
  const info = await s.page.evaluate(() => { const b = document.getElementById('banners'); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); const prev = b.previousElementSibling, next = b.nextElementSibling; return {html: b.innerHTML, height: r.height, display: cs.display, padding: cs.padding, margin: cs.margin, dot: !!document.querySelector('#tab-manage .dot'), manageVisible: !document.getElementById('tab-manage').classList.contains('hidden')}; });
  const ok = info.html === '' && (info.height === 0 || info.display === 'none') && info.dot && info.manageVisible;
  if (!ok) bad++;
  console.log(ok ? 'PASS' : 'FAIL', names[mode], 'leader with pending items: no attention banner, container collapsed, Manage dot present', JSON.stringify(info));
  await s.page.screenshot({path: path.join(shots, names[mode] + '-8-leader-no-attention-banner.png')});
  // a normal banner still renders
  await s.page.locator('nav.tabs [data-tab="my"]').click();
  await s.context.close();
}
await browser.close();
console.log('errors', JSON.stringify(report.errors), bad ? 'FAILED' : 'ALL PASSED');
