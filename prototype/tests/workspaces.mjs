/** Regression checks for the three expanded Aurora workspaces.
 * Called by preview.mjs with its real offline browser context; no new server,
 * mocks or runtime dependencies. Also callable with a render-only local page.
 */
export async function checkWorkspaces({page,check,shot}) {
  const nav = async tab => { await page.locator(`nav.tabs [data-tab="${tab}"]`).click(); await page.waitForTimeout(30); };
  const song = async tab => { await page.locator(`.ns-tabs [data-tab="${tab}"]`).click(); await page.waitForTimeout(30); };
  const manage = async sub => { await page.locator(`.aw-manage-tabs [data-sub="${sub}"]`).click(); };
  const viewports = [320,390,768,1024,1440];
  const layout = async (name, containers) => {
    for (const dark of [false,true]) {
      const isDark = await page.locator('body').evaluate(el => el.classList.contains('dark'));
      if (isDark !== dark) await page.locator('[data-aurora="theme"]').click();
      for (const width of viewports) {
        await page.setViewportSize({width,height:1050});
        check(`Workspace layout: ${name}, ${width}px, ${dark?'dark':'light'}`,await page.evaluate(selectors => {
          if (document.documentElement.scrollWidth > innerWidth) return false;
          return Array.from(document.querySelectorAll(selectors)).every(el => {
            if (!el.getClientRects().length) return true;
            const r = el.getBoundingClientRect();
            return r.width <= innerWidth && r.left >= -1 && r.right <= innerWidth + 1;
          });
        },containers));
      }
    }
    await page.locator('[data-aurora="theme"]').click();
  };
  await page.setViewportSize({width:1440,height:1050});
  await nav('my');
  check('My Duties has a dedicated workspace',await page.locator('[data-aw-workspace="my"] .aw-personal-grid').count(),1);
  check('Personal summary reflects existing duties',await page.locator('.aw-stat strong').allTextContents(),['3','3','0']);
  check('Original reminders and Presider descriptions remain separate',await page.locator('.aw-song-cta [data-aw-presider-note]').innerText().then(t=>!t.includes('notification delivery')));
  await page.locator('[data-act="expand"]').first().click();
  check('Expanded service team retains its assignment rows',await page.locator('.duty-expand .duty-row').count()>0);
  await page.locator('[data-act="req-open"]').first().click();
  await page.locator('[data-chg="req-note"]').fill('Workspace check; cancelled, not submitted');
  check('Change request text remains editable',await page.locator('[data-chg="req-note"]').inputValue(),'Workspace check; cancelled, not submitted');
  await page.locator('[data-act="req-cancel"]').click();
  await page.locator('[data-act="expand"]').first().click();
  await layout('My Duties','.aw-personal-main,.aw-identity,.duty-card');
  await shot('04-my-duties-desktop');
  await page.setViewportSize({width:390,height:1050}); await shot('04-my-duties-mobile');
  await page.locator('#me-select').selectOption('');
  check('Name-unselected empty state and role gate retained',await page.locator('#tab-presider').isHidden() && (await page.locator('#me-select').count())===1);
  await page.locator('#me-select').selectOption('B. Anthony L');
  await page.setViewportSize({width:1440,height:1050});
  await page.locator('.aw-duty-timeline [data-act="open-songs"]').first().click();
  await page.waitForSelector('.aw-setlist-panel');
  check('Library has separate catalog and builder',await page.locator('.aw-catalog-panel,.aw-setlist-panel').count(),2);
  await page.locator('#lib-search').fill('Blessings');
  check('Live song search survives the new layout',await page.locator('.aw-song-open .s-title').allTextContents().then(rows=>rows.length>0 && rows.every(t=>t.toLowerCase().includes('blessings'))));
  check('Live song search retains focus',await page.locator('#lib-search').evaluate(el=>document.activeElement===el));
  await page.locator('#lib-search').fill('');
  await page.locator('[data-song-act="quick-add"]').nth(0).click();
  await page.locator('[data-song-act="quick-add"]').nth(1).click();
  check('Builder still sums song durations',await page.locator('.total-readout').innerText().then(t=>t.includes('4:24')&&t.includes('2 songs')));
  const titles = await page.locator('.set-row .s-title').allTextContents();
  await page.locator('[data-song-act="move-song"][aria-label="Move down"]').first().click();
  check('New setlist controls preserve reordering',await page.locator('.set-row .s-title').allTextContents(),titles.slice().reverse());
  await page.locator('[data-song-act="confirm-songs"]').click();
  check('Setlist confirmation keeps its original workflow',await page.locator('.confirm-box.done').count(),1);
  check('Song rows use separate keyboard-native targets',await page.locator('.song-row .aw-song-open').first().evaluate(el=>el.tagName==='BUTTON'&&!el.querySelector('button')));
  await page.locator('.aw-song-open').first().focus(); await page.keyboard.press('Enter');
  check('Enter expands a song without adding it again',await page.locator('.song-detail').count(),1);
  await page.locator('.aw-song-open').first().click();
  await page.locator('#b-notes').fill('Reference setlist — workspace check');
  await page.locator('#b-notes').blur(); await page.waitForTimeout(700);
  await layout('Presider Library','.aw-catalog-panel,.aw-setlist-panel,.song-list,.set-row');
  await shot('05-presider-library-desktop');
  await page.setViewportSize({width:390,height:1050}); await shot('05-presider-library-mobile');
  await page.setViewportSize({width:1440,height:1050});
  for (const tab of ['home','services','insights']) {
    await song(tab);
    check(`Presider ${tab} has a dedicated layout`,await page.locator(`[data-aw-song-view="${tab}"]`).count(),1);
    await layout(`Presider ${tab}`,'.aw-presider-hero,.aw-home-services,.svc-card,.aw-insight-grid>.card');
    await shot(`presider-${tab}-desktop`);
  }
  check('Insights declares reference history rather than live statistics',await page.locator('.aw-history-note').innerText().then(t=>t.includes('No live')));
  await nav('manage'); await manage('services');
  await page.locator('[data-id="m:2026-07-04_morning"]').click();
  check('Assignment editor retains all eight departments',await page.locator('[data-aw-service="2026-07-04_morning"] .aw-department-card').count(),8);
  check('Assignment editor retains all 27 duty slots',await page.locator('[data-chg="assign"][data-svc="2026-07-04_morning"]').count(),27);
  await page.locator('[data-chg="assign"][data-svc="2026-07-04_morning"][data-duty="Prayer of Thanks"]').selectOption('B. Davidson');
  check('Restyled assignment editor uses original persistence',await page.evaluate(()=>Aurora.inspect().state.services.find(s=>s.date==='2026-07-04'&&s.service==='Morning').assignments['Prayer of Thanks']),'B. Davidson');
  await layout('Manage open assignment editor','.aw-manage-service,.aw-department-card,.aw-create');
  await shot('06-manage-assignments-desktop');
  await page.setViewportSize({width:390,height:1050}); await shot('06-manage-assignments-mobile');
  await page.setViewportSize({width:1440,height:1050});
  await page.locator('[data-id="m:2026-07-04_morning"]').click();
  await shot('06-manage-services-desktop');
  for (const tab of ['planning','requests','people','features','data']) {
    await manage(tab);
    check(`Manage ${tab} has its own restyled section`,await page.locator(`[data-manage-section="${tab}"]`).count(),1);
    await layout(`Manage ${tab}`,'.aw-manage .card,.aw-person-card,.aw-settings-group');
    await shot(`manage-${tab}-desktop`);
  }
  check('Data screen keeps original backup and restore controls',await page.locator('[data-act="export"],[data-chg="import-file"],[data-act="reset"],[data-act="unify-names"]').count(),4);
  check('Data screen correctly describes isolated connections',await page.locator('.aw-connection').innerText().then(t=>t.includes('does not connect to Firebase')));
  await manage('people');
  await page.locator('#aw-people-search').fill('Mercie');
  check('Member search narrows without dropping membership controls',await page.locator('.aw-person-card:not([hidden])').count(),1);
  check('Member department controls all preserved',await page.locator('.aw-person-card:not([hidden]) [data-chg="member-cat"]').count(),8);
  await page.locator('#aw-people-search').fill('No matching member');
  check('Member search has a useful empty state',await page.locator('#aw-people-count').innerText().then(t=>t.includes('No members match')));
  await page.locator('#aw-people-search').fill('');
  check('Clearing member search restores the roster',await page.locator('.aw-person-card:not([hidden])').count(),45);
  await manage('features');
  check('All 13 original feature switches retained',await page.locator('.feature-row input[type="checkbox"]').count(),13);
  const toggle = page.locator('[data-chg="feature"][data-id="songPicker"]');
  await toggle.focus(); await page.keyboard.press('Space');
  check('Feature switch can be operated by keyboard',await page.locator('#tab-presider').isHidden());
  await page.locator('[data-chg="feature"][data-id="songPicker"]').focus(); await page.keyboard.press('Space');
  check('Keyboard restores the Presider role gate',await page.locator('#tab-presider').isVisible());
  await manage('services');
  await page.setViewportSize({width:1440,height:1050});
}
