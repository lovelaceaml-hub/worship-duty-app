/** Theme coverage + nested workflows. Supplements (does not replace) the
 * original 88-check regression suite. CI uses real HTTP/localStorage. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from '../../tests/helpers/playwright.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'prism-preview-artifacts');
await fs.mkdir(path.join(out,'screenshots','all-pages'),{recursive:true});
execFileSync(process.execPath,[path.join(root,'prototype-prism/build.mjs')]);
const html=await fs.readFile(path.join(root,'prototype-prism/dist/index.html'),'utf8');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(process.env.PRISM_CHROMIUM?{executablePath:process.env.PRISM_CHROMIUM,args:['--no-sandbox']}:{});
const context=await browser.newContext({viewport:{width:1440,height:1080},timezoneId:'America/Los_Angeles',reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(10000);
const report={passed:false,checks:[],pageErrors:[],externalRequests:[],screenshots:[],coverage:[],mode:process.env.PRISM_SET_CONTENT==='1'?'in-memory rendering (local smoke)':'HTTP browser (CI)'};
page.on('pageerror',e=>report.pageErrors.push(String(e)));
page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))report.externalRequests.push(r.url());});
page.on('dialog',d=>d.accept());
const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);report.checks.push({name,passed:true});console.log('PASS',name);};
const nav=async t=>{await page.locator(`nav.tabs [data-tab="${t}"]`).click();await page.waitForTimeout(50);};
const sub=async t=>{await page.locator(`[data-act="sub"][data-sub="${t}"]`).click();};
const song=async t=>{await page.locator(`[data-song-act="tab"][data-tab="${t}"]`).click();};
const state=()=>page.evaluate(()=>Prism.inspect().state);
const measure=async(name,selector,shots=true)=>{
 check(name+' content exists',await page.locator(selector).count()>0);
 for(const dark of [false,true]){
  await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:1080});
   check(name+' / '+(dark?'dark':'light')+' / '+width+' fits',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const token=await page.locator(selector).first().evaluate(el=>getComputedStyle(el).getPropertyValue('--ps-panel').trim());
   check(name+' / '+(dark?'dark':'light')+' / '+width+' shared surface',token,dark?'#1e2a42':'#ffffff');
   if(shots&&!dark&&(width===390||width===1440)){
    await page.evaluate(()=>scrollTo(0,0));
    const file=name+'-'+width+'.png';await page.screenshot({path:path.join(out,'screenshots','all-pages',file)});report.screenshots.push('all-pages/'+file);
   }
  }
 }
 report.coverage.push(name);
 await page.evaluate(()=>document.body.classList.remove('dark'));
 await page.setViewportSize({width:1440,height:1080});
};
try{
 if(process.env.PRISM_SET_CONTENT==='1')await page.setContent(html);else await page.goto(origin);
 await measure('schedule','.prism-planner');
 await nav('my');await measure('my-duties','.ps-personal');
 check('Every visible duty is retained',await page.locator('.ps-duty-timeline .role').count(),3);
 await page.locator('[data-act="req-open"]').first().click();
 await measure('request-form','.req-form',false);
 await page.locator('[data-chg="req-note"]').fill('Theme verification request');
 await page.locator('[data-act="req-submit"]').click();
 check('Themed form still submits request',(await state()).requests.at(-1).note,'Theme verification request');
 await nav('manage');await sub('requests');await measure('requests-pending','[data-ps-page="manage-requests"]');
 await page.locator('[data-act="req-approve"]').click();
 await page.locator('[data-id="req-resolved"]').click();await measure('requests-resolved','.ps-requests',false);
 check('Approval retained original non-reassignment behavior',(await state()).requests.at(-1).status,'approved');
 await sub('services');await measure('manage-services','[data-ps-page="manage-services"]');
 await page.locator('[data-id="m:2026-07-04_morning"]').click();
 await measure('assignment-editor','.ps-editor-columns');
 check('All eight editor departments retained',await page.locator('.ps-editor-group').count(),8);
 await page.locator('[data-chg="assign"][data-duty="Prayer of Thanks"]').selectOption('B. Davidson');
 check('Assignment edit still updates real preview state',(await state()).services.find(s=>s.date==='2026-07-04'&&s.service==='Morning').assignments['Prayer of Thanks'],'B. Davidson');
 const svcCount=(await state()).services.length;
 await page.locator('[data-act="del-service"]').first().click();
 check('Destructive action opens themed dialog',await page.locator('.ps-dialog[open]').count(),1);
 check('Cancel receives initial focus',await page.evaluate(()=>document.activeElement.value),'cancel');
 await measure('confirmation-dialog','.ps-dialog',false);
 await page.keyboard.press('Escape');
 check('Escape makes no destructive change',(await state()).services.length,svcCount);
 check('Cancel restores trigger focus',await page.evaluate(()=>document.activeElement.dataset.act),'del-service');
 await sub('planning');check('Planning workload table preserved',await page.locator('.plan-table tr').count()>45);
 check('Coverage and conflicts preserved',await page.locator('.ps-planning-grid > .card').count(),3);
 await measure('planning','[data-ps-page="manage-planning"]');
 await sub('people');check('Every member remains editable',await page.locator('[data-chg="member-name"]').count(),45);
 check('Every department membership checkbox retained',await page.locator('[data-chg="member-cat"]').count(),45*8);
 await measure('people','[data-ps-page="manage-people"]');
 await page.locator('#member-name').fill('Prototype Test Member');await page.locator('form[data-act="add-member"] button').click();
 check('Member addition',(await state()).members.includes('Prototype Test Member'));
 await page.locator('[data-act="del-member"][data-name="Prototype Test Member"]').click();
 await page.locator('dialog button[value="cancel"]').click();check('Member deletion can be cancelled',(await state()).members.includes('Prototype Test Member'));
 await page.locator('[data-act="del-member"][data-name="Prototype Test Member"]').click();await page.locator('dialog button[value="confirm"]').click();
 check('Confirmed member deletion uses original handler',!(await state()).members.includes('Prototype Test Member'));
 await sub('features');check('All original feature toggles present',await page.locator('[data-chg="feature"]').count(),13);
 check('Sheet sync remains disabled',await page.locator('[data-id="sheetSync"]').isDisabled());
 await measure('features','[data-ps-page="manage-features"]');
 await sub('data');await measure('data-sync','[data-ps-page="manage-data"]');
 check('Preview data page contains no misleading live setup instructions',!(await page.locator('#view').innerText()).includes('Start in test mode'));
 check('Backup export/import and reset controls retained',await page.locator('[data-act="export"],[data-chg="import-file"],[data-act="reset"],[data-act="unify-names"]').count(),4);
 await nav('songs');await song('home');await measure('presider-home','[data-ps-page="songs-home"]');
 await page.locator('[data-song-act="build-for"]').first().click();
 await page.locator('[data-song-act="quick-add"]').first().click();
 await page.locator('[data-song-act="quick-add"]').nth(1).click();
 await page.locator('[data-song-act="confirm-songs"]').first().click();
 await measure('presider-library','.prism-song-layout');
 await page.locator('[data-song-act="toggle-song"]').first().click();
 await measure('song-detail','.song-detail',false);
 await song('services');await measure('presider-services','[data-ps-page="songs-services"]');
 const header=page.locator('.card-head[data-song-act="toggle-service"]').first();await header.focus();await page.keyboard.press('Enter');
 check('Service expansion supports keyboard',await page.locator('.order-list').count()>0);
 await measure('service-order','.order-list',false);
 // Exercise the existing runsheet route for a reference setlist, without
 // fabricating or changing a scheduled date just to make it "today".
 const sid=await header.getAttribute('data-id');
 await page.evaluate(id=>{const b=document.createElement('button');b.dataset.songAct='runsheet';b.dataset.id=id;document.querySelector('#song-root').append(b);b.click();b.remove();},sid);
 await measure('runsheet','.ps-runsheet');
 await page.locator('[data-song-act="exit-runsheet"]').click();
 await song('insights');await measure('presider-insights','[data-ps-page="songs-insights"]');
 check('All six insights tools retained',await page.locator('.ps-insight-card').count(),6);
 await page.locator('[data-song-act="open-backfill"]').click();
 await measure('create-song-editor-pin','.ps-auth',false);
 if(process.env.PRISM_SET_CONTENT!=='1'){
  await page.locator('#ep-new').fill('1357');await page.locator('#ep-confirm').fill('1357');await page.locator('[data-song-act="set-editor-pin"] button').click();await page.waitForSelector('#bf-song');
 await measure('backfill-form','[data-insight="backfill"]',false);
 await page.locator('#bf-song').selectOption({index:1});await page.locator('#bf-date').fill('2026-06-20');
 await page.locator('[data-song-act="save-backfill"]').click();
 check('Backfill updates local song history',await page.locator('[data-ps-page="songs-insights"] .ps-stat').last().innerText().then(s=>s.includes('1')));
 await page.locator('[data-song-act="open-presider-mgr"]').click();await measure('presider-directory','[data-insight="presiders"]',false);
 await page.locator('[data-song-act="close-presider-mgr"]').click();
 await song('services');
 await page.locator('[data-song-act="mark-sung"]').first().click();
 check('Song history action uses themed confirmation',await page.locator('.ps-dialog[open]').count(),1);
 await page.locator('dialog button[value="cancel"]').click();
 check('Cancelling history action leaves planned setlist',await page.evaluate(id=>PrismSongInspect().setlists[id].status,sid),'planned');
 await page.locator('[data-song-act="mark-sung"]').first().click();await page.locator('dialog button[value="confirm"]').click();
 await page.waitForFunction(id=>PrismSongInspect().setlists[id].status==='sung',sid);
 await page.locator('[data-song-act="toggle-past"]').click();await measure('past-setlists','[data-ps-page="songs-services"]',false);
 await page.locator('[data-song-act="undo-sung"]').first().click();await page.locator('dialog button[value="confirm"]').click();
 await page.waitForFunction(id=>PrismSongInspect().setlists[id].status==='planned',sid);
 check('Undo sung retains original history semantics',await page.evaluate(id=>PrismSongInspect().setlists[id].status,sid),'planned');
 }else{await page.locator('[data-song-act="cancel-editor-gate"]').click();}
 // HTTP mode has SubtleCrypto and genuine storage. Local setContent smoke
 // deliberately skips PIN hashing rather than claiming it exercised access.
 if(process.env.PRISM_SET_CONTENT!=='1'){
  await nav('manage');await sub('features');await page.locator('[data-id="editorLock"]').locator('..').click();
  await measure('create-editor-passcode','.ps-auth');
  await page.locator('#pin-new').fill('2468');await page.locator('#pin-confirm').fill('2468');await page.locator('[data-act="set-pin"] button').click();
  await page.waitForSelector('[data-act="lock-now"]');await page.locator('[data-act="lock-now"]').click();
  await measure('unlock-editor','.ps-auth',false);
  await page.locator('#pin-input').fill('wrong');await page.locator('[data-act="unlock"] button').click();
  await page.waitForSelector('.pin-error');await measure('passcode-error','.ps-auth',false);
  await page.locator('#pin-input').fill('2468');await page.locator('[data-act="unlock"] button').click();
  await page.waitForSelector('[data-act="sub"]');await sub('features');
  await page.locator('#site-pin-change').fill('4321');await page.locator('[data-act="change-site-pin"] button').click();
  await page.waitForFunction(()=>!!Prism.inspect().state.settings.sitePinHash);
  await page.locator('[data-id="siteLock"]').locator('..').click();
  // Changing a PIN correctly keeps this device authorized. Simulate a new
  // device by removing only this preview's site-unlock token, then reload.
  await page.evaluate(()=>Prism.storage.removeItem('wds-site-unlock'));
  await page.reload();
  await page.waitForSelector('#site-pin-input');await measure('site-passcode','.ps-auth');
  check('Locked page does not leak next-duty heading',await page.locator('#heading-action').innerHTML(),'');
  check('Locked page hides navigation',await page.locator('nav.tabs').isHidden());
  await page.locator('#site-pin-input').fill('4321');await page.locator('[data-act="site-unlock"] button').click();await page.waitForSelector('nav.tabs:not(.hidden)');
 }
 check('No runtime errors',report.pageErrors,[]);check('No external network requests',report.externalRequests,[]);
 report.passed=true;
}catch(e){report.failure=String(e.stack||e);await page.screenshot({path:path.join(out,'screenshots','all-pages-failure.png')}).catch(()=>{});throw e;}
finally{
 report.count=report.checks.length;await fs.writeFile(path.join(out,'all-pages-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,checks:report.count,views:report.coverage.length,failure:report.failure},null,2));
 await browser.close();await new Promise(r=>server.close(r));
}
