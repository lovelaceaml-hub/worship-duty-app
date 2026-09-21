
// F12 scenario. PHASE=before|after names the screenshots. Fixture data only.
// Adds one fixture service so 2026-07-02 has two services (09:00 and 20:00).
fixture.services.push({date: '2026-07-02', service: 'Morning', worship: 'Sabbath Day', time: '09:00', choirSong: '',
  assignments: {Presider: 'B. Anthony', 'Usher #1': 'M. Chloe'}});
const phase = process.env.PHASE || 'after';
const shots = path.join(root, 'docs/runs/keep-look-features/F12-screens');
await fs.mkdir(shots, {recursive: true});
const names = {classic: 'original', prism: 'prism', navy: 'navy-cream', aurora: 'aurora'};
const results = [];
const note = (name, ok, extra) => { results.push({name, ok, extra}); console.log(ok ? 'PASS' : 'FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); };
const hideToast = page => page.evaluate(() => { const el = document.getElementById('wd-design-status'); if (el) el.hidden = true; });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function start(mode, member, width) {
  globalThis.__mode = mode;
  const s = await make({member});
  if (width) await s.page.setViewportSize({width, height: 812});
  await releaseSettings(s.page); await unlockSite(s.page); await login(s.page, member);
  await s.page.waitForFunction(expected => window.WorshipDesign?.getMode() === expected, mode);
  await s.page.waitForTimeout(500); await hideToast(s.page);
  return s;
}
// Visible host service cards, as a member sees them: title, time, and where they sit.
const visibleCards = page => page.evaluate(() => [...document.querySelectorAll('#view .card')].filter(c => c.offsetParent !== null && c.querySelector('.svc-title'))
  .map(c => ({title: c.querySelector('.svc-title')?.textContent.trim(), time: c.querySelector('.time')?.textContent.trim(), inFocus: !!c.closest('.schedule-focus')})));
const dup = cards => { const keys = cards.map(c => c.title + '|' + c.time); return keys.length - new Set(keys).size; };
const shot = (page, name) => page.screenshot({path: path.join(shots, `${phase}-${name}.png`), fullPage: true});

for (const width of [375, 1280, 320]) {
  const {context, page} = await start('navy', 'S. Lisa', width);
  const w = width + 'px';
  let cards = await visibleCards(page);
  note(`navy ${w} Day view default (two-service day): one card, no duplicates`, cards.length === 1 && dup(cards) === 0, cards);
  note(`navy ${w} two service-time buttons`, await page.locator('.nc-times .nc-button').count() === 2);
  if (width === 375) await shot(page, 'navy-cream-375px-day-two-services');
  // service-time switching
  await page.locator('.nc-times .nc-button', {hasText: '8:00 PM'}).click(); await page.waitForTimeout(150);
  cards = await visibleCards(page);
  note(`navy ${w} switch to 8:00 PM: one card at 8:00 PM, hero matches`, cards.length === 1 && /8:00 PM/.test(cards[0].time) && /8:00 PM/.test(await page.locator('.nc-hero').innerText()), cards);
  if (width === 375) await shot(page, 'navy-cream-375px-day-two-services-evening-selected');
  // next service
  const nextLabel = await page.locator('.nc-next').innerText();
  await page.locator('.nc-next .nc-button').click(); await page.waitForTimeout(150);
  cards = await visibleCards(page);
  note(`navy ${w} Next service moves to Jul 3, one card`, /Jul 3/.test(nextLabel) && cards.length === 1 && /Jul 3/.test(await page.locator('.nc-hero').innerText()), {nextLabel, cards});
  note(`navy ${w} Service team label present`, await page.locator('.nc-section-label').innerText().then(t => /Service team/.test(t)));
  if (width === 375) await shot(page, 'navy-cream-375px-day-one-service');
  // day tiles
  await page.locator('.nc-date-rail .nc-button[data-date="2026-07-06"]').click(); await page.waitForTimeout(150);
  cards = await visibleCards(page);
  note(`navy ${w} day tile Jul 6: one card at 3:00 PM`, cards.length === 1 && /3:00 PM/.test(cards[0].time), cards);
  await page.locator('.nc-date-rail .nc-button[data-date="2026-07-01"]').click(); await page.waitForTimeout(150);
  cards = await visibleCards(page);
  note(`navy ${w} day tile Jul 1 (not the next service): one card at 9:00 AM`, cards.length === 1 && /9:00 AM/.test(cards[0].time), cards);
  // month arrows
  await page.locator('[data-nc-act="month"][data-delta="1"]').click(); await page.waitForTimeout(150);
  note(`navy ${w} next month shows August 2026 and no service card`, /August 2026/.test(await page.locator('.nc-heading h2').innerText()) && (await visibleCards(page)).length === 0, await visibleCards(page));
  await page.locator('[data-nc-act="month"][data-delta="-1"]').click(); await page.waitForTimeout(150);
  cards = await visibleCards(page);
  note(`navy ${w} previous month returns to July 2026, one card`, /July 2026/.test(await page.locator('.nc-heading h2').innerText()) && cards.length === 1, cards);
  // department chip keeps one card
  await page.locator('[data-act="dept-filter"][data-val="Worship"]').click(); await page.waitForTimeout(150);
  cards = await visibleCards(page);
  note(`navy ${w} department chip: one card`, cards.length === 1, cards);
  await page.locator('[data-act="dept-filter"][data-val="All"]').click(); await page.waitForTimeout(150);
  // Full schedule
  await page.locator('[data-nc-act="full-mode"]').click(); await page.waitForTimeout(150);
  cards = await visibleCards(page);
  note(`navy ${w} Full schedule: five list cards plus the one labelled Next service card`, cards.filter(c => !c.inFocus).length === 5 && cards.filter(c => c.inFocus).length === 1 && await page.locator('.schedule-focus .date-head').innerText().then(t => /Next service/i.test(t)), cards);
  if (width === 375) await shot(page, 'navy-cream-375px-full-schedule');
  await page.locator('[data-nc-act="day-mode"]').click(); await page.waitForTimeout(150);
  note(`navy ${w} back to Day view: one card`, (await visibleCards(page)).length === 1);
  note(`navy ${w} no horizontal overflow`, await overflow(page) <= 0, await overflow(page));
  // other tabs still paint
  await page.locator('nav.tabs [data-tab="my"]').click(); await page.waitForTimeout(200);
  note(`navy ${w} My Duties paints`, await page.locator('.nc-heading h2').innerText() === 'My duties');
  await context.close();
}
// The other three appearances: report only.
for (const mode of ['classic', 'prism', 'aurora']) {
  const {context, page} = await start(mode, 'S. Lisa', 375);
  const cards = await visibleCards(page);
  console.log('INFO', names[mode], 'visible service cards on Schedule', JSON.stringify(cards), 'duplicates', dup(cards));
  await shot(page, names[mode] + '-375px-schedule');
  await context.close();
}
await browser.close();
note('no page errors', report.errors.length === 0, report.errors);
const failed = results.filter(r => !r.ok);
console.log(failed.length ? 'FAILED ' + failed.length : 'ALL PASSED ' + results.length);
process.exit(failed.length ? 1 : 0);
