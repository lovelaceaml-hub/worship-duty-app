/** Live-build integration tests. Firebase SDK module requests are replaced by
 * a deterministic test double; all other external requests are blocked. This
 * exercises ORIGINAL data handlers, never the production database or accounts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stage=path.join(root,'.hosting-live'),out=path.join(root,'live-design-results');
await fs.mkdir(path.join(out,'screenshots'),{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const protectedNames=['app.js','song-app.js','index.html','firebase-config.js','firebase.json','sw.js','seed-data.js','song-seed.js','prototype/aurora.js','prototype-prism/build.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,hash(await fs.readFile(path.join(root,n)))])));
const before=await hashes();
execFileSync(process.execPath,[path.join(root,'live-design/build.mjs')],{stdio:'inherit'});
assert.deepEqual(await hashes(),before,'Neither original runtime nor prototype sources modified');
const seedScope={window:{}};vm.runInNewContext(await fs.readFile(path.join(root,'seed-data.js'),'utf8'),seedScope);
const seed=JSON.parse(JSON.stringify(seedScope.window.SEED_DATA));
const pin=hash(Buffer.from('2468'));
const fixture={services:seed.services,holdSettings:true,docs:{
 'app/settings':{sitePinHash:pin,pinHash:pin,features:{siteLock:true,editorLock:true,sheetSync:false}},
 'app/members':{list:seed.members},'app/departments':{map:{Worship:seed.members,'Usher Sisters':seed.members}},
 'app/nameMap':{map:{'B. Anthony L':'B. Anthony'}},'app/presiders':{names:['B. Anthony']},'app/songSettings':{pinHash:pin}
}};
const report={passed:false,checks:[],errors:[],blockedExternalRequests:[],screenshots:[],scope:'HTTP browser; mocked Firebase SDK, real app handlers; no production writes',sourceHashes:before};
const check=(name,result,expected=true)=>{assert.deepEqual(result,expected,name);report.checks.push({name,passed:true});console.log('PASS',name);};
const browser=await chromium.launch(process.env.PRISM_CHROMIUM?{executablePath:process.env.PRISM_CHROMIUM,args:['--no-sandbox']}:{});
const origin='http://localhost:8123';
const js=body=>({body,contentType:'text/javascript'});
const fsMock=await fs.readFile(path.join(root,'live-design/fixture-firestore.js'),'utf8');
const assets=new Map(await Promise.all((await fs.readdir(stage)).map(async n=>[n,await fs.readFile(path.join(stage,n))])));
async function make({pref=null,brokenCSS=false,disabled=false,blockedPreference=false}={}){
 const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'America/Los_Angeles'});
 await context.addInitScript(({fixture,pref,blockedPreference})=>{
   window.__designFixture=fixture;localStorage.setItem('wds-me','B. Anthony L');localStorage.setItem('UNRELATED','keep');
   if(pref!==null && !localStorage.getItem('test-pref-initialized')){localStorage.setItem('wds-design-choice-v1',pref);localStorage.setItem('test-pref-initialized','1');}
   if(blockedPreference){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='wds-design-choice-v1')throw new DOMException('blocked','SecurityError');return set.call(this,k,v);};}
 },{fixture,pref,blockedPreference});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin){
   const name=url.pathname.slice(1)||'index.html';if(name==='prism-live.css'&&brokenCSS){await route.fulfill({status:503,body:'test failure'});return;}
   let data=assets.get(name);if(!data){await route.fulfill({status:404,body:'not found'});return;}
   if(disabled&&name==='index.html')data=Buffer.from(data.toString().replace('data-prism-rollout="on"','data-prism-rollout="off"'));
   await route.fulfill({body:data,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/json'});return;
  }
  if(url.href.endsWith('/firebase-app.js')){await route.fulfill(js('export const initializeApp=config=>(window.__apps=(window.__apps||0)+1,{config});'));return;}
  if(url.href.endsWith('/firebase-firestore.js')){await route.fulfill(js(fsMock));return;}
  if(url.href.endsWith('/firebase-auth.js')){await route.fulfill(js('export const getAuth=()=>({}); export const signInAnonymously=async()=>{window.__authCount=(window.__authCount||0)+1;};'));return;}
  if(url.href.endsWith('/firebase-messaging.js')){await route.fulfill(js('export const isSupported=async()=>false;'));return;}
  report.blockedExternalRequests.push({url:route.request().url(),method:route.request().method()});
  await route.fulfill({status:503,body:'Intentionally blocked in test harness'});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(String(e)));
 await page.clock.setSystemTime(new Date('2026-07-01T12:00:00-07:00'));
 await page.goto(origin);await page.waitForFunction(()=>!!window.__mockLive);
 return {context,page};
}
async function releaseSettings(page){await page.evaluate(()=>__mockLive.emit('app/settings',__designFixture.docs['app/settings']));await page.waitForTimeout(80);}
async function unlock(page){await page.locator('#site-pin-input').fill('2468');await page.locator('[data-act="site-unlock"] button').click();}
async function choose(page,mode){await page.locator('[data-design-open]:visible').click();await page.locator(`[data-design-select="${mode}"]`).click();await page.waitForFunction(m=>WorshipDesign.getMode()===m,mode);await page.waitForTimeout(120);}
const nav=async(page,t)=>{await page.locator(`nav.tabs [data-tab="${t}"]`).click();await page.waitForTimeout(120);};
const shot=async(page,name)=>{await page.screenshot({path:path.join(out,'screenshots',name+'.png')});report.screenshots.push(name+'.png');};
const changes=page=>page.evaluate(()=>__mockLive.writes.filter(w=>/^(schedule\/|setlists\/|songStats\/|app\/settings$)/.test(w.path)));
let current;
try{
 check('Original sources are unchanged',await hashes(),before);
 check('Existing real Firebase configuration copied unchanged',hash(assets.get('firebase-config.js')),hash(await fs.readFile(path.join(root,'firebase-config.js'))));
 const generated=assets.get('app.js').toString(),song=assets.get('song-app.js').toString();
 check('Real date, original storage and no offline namespace',!generated.includes('Clock extends')&&!generated.includes('preview-v1:')&&!generated.includes('previewSchedule'));
 check('One original Firebase initialization',generated.match(/appMod.initializeApp\(config\)/g)?.length,1);
 check('Original shared song Firebase bridge retained',song.includes('fb = ctx.fb || null;'));
 check('Original authentication and persistence present',generated.includes('await authMod.signInAnonymously')&&generated.includes("fb.doc(fb.db, 'schedule', svcId(svc))"));
 check('Prototype/test files not staged for serving',[...assets.keys()].every(n=>!n.startsWith('prototype')&&!n.startsWith('fixture')&&!n.includes('test')));
 current=await make();const p=current.page;
 await p.waitForTimeout(350);
 check('No invitation before shared access settings arrive',await p.locator('.wd-design-dialog').count(),0);
 check('Design switch hidden before readiness',await p.locator('[data-design-open]').first().isHidden());
 await releaseSettings(p);await p.waitForTimeout(350);
 check('No invitation behind site passcode',await p.locator('.wd-design-dialog').count(),0);
 await p.locator('#site-pin-input').fill('1111');await p.locator('[data-act="site-unlock"] button').click();
 await p.waitForTimeout(100);check('Incorrect passcode cannot expose design choice',await p.locator('.wd-design-dialog').count(),0);
 await unlock(p);await p.waitForSelector('.wd-design-dialog[open]');
 check('Current design is default',await p.evaluate(()=>WorshipDesign.getMode()),'classic');
 check('Popup explains switch-back and same data',await p.locator('#wd-design-description').innerText().then(t=>t.includes('switch back')&&t.includes('same schedules')));
 check('Keep current has initial focus',await p.evaluate(()=>document.activeElement.classList.contains('wd-keep')));
 await shot(p,'01-member-invitation');
 const originalMarkup=await p.locator('#view').innerHTML(),writesBefore=await changes(p);
 await p.locator('[data-design-select="prism"]').click();await p.waitForSelector('.prism-planner');
 check('New design applied on the existing page',await p.evaluate(()=>WorshipDesign.getMode()),'prism');
 check('Choice alone creates no schedule or setlist writes',await changes(p),writesBefore);
 check('Browser preference remembered',await p.evaluate(()=>JSON.parse(localStorage.getItem('wds-design-choice-v1')).mode),'prism');
 check('Same existing member retained',await p.evaluate(()=>localStorage.getItem('wds-me')),'B. Anthony L');
 check('Live status not replaced by demo status',await p.locator('#sync-pill').innerText().then(t=>t.includes('Live sync')));
 check('No sample-data labels in active live UI',await p.locator('body').innerText().then(t=>!t.includes('Local preview')&&!t.includes('reference clock')));
 await shot(p,'02-live-prism');
 await choose(p,'classic');check('Original schedule markup restored exactly',await p.locator('#view').innerHTML(),originalMarkup);
 check('Switching did not create another Firebase instance',await p.evaluate(()=>__apps),1);
 check('Switching did not sign in again',await p.evaluate(()=>__authCount),1);
 await choose(p,'prism');await nav(p,'manage');
 check('Original editor gate retained in Prism',await p.locator('#pin-input').count(),1);
 await choose(p,'classic');check('Original editor gate retained after return',await p.locator('#pin-input').count(),1);
 await p.locator('#pin-input').fill('2468');await p.locator('[data-act="unlock"] button').click();
 await p.locator('[data-id="m:2026-07-04_morning"]').click();
 await p.locator('[data-chg="assign"][data-svc="2026-07-04_morning"][data-duty="Prayer of Thanks"]').selectOption('B. Davidson');
 await p.waitForTimeout(120);
 check('Classic writes through original shared data handler',await p.evaluate(()=>__mockLive.get('schedule/2026-07-04_morning').assignments['Prayer of Thanks']),'B. Davidson');
 await choose(p,'prism');
 check('Prism sees the same edited duty',await p.locator('[data-chg="assign"][data-svc="2026-07-04_morning"][data-duty="Prayer of Thanks"]').inputValue(),'B. Davidson');
 await p.locator('[data-chg="assign"][data-svc="2026-07-04_morning"][data-duty="Prayer of Thanks"]').selectOption('B. Brent');
 await p.waitForTimeout(120);check('Prism writes to the SAME shared service',await p.evaluate(()=>__mockLive.get('schedule/2026-07-04_morning').assignments['Prayer of Thanks']),'B. Brent');
 await p.locator('#svc-label').selectOption('Evening');
 await choose(p,'classic');check('Unsubmitted add-service choice survives switch',await p.locator('#svc-label').inputValue(),'Evening');
 await nav(p,'my');await p.locator('[data-act="req-open"]').first().click();
 await p.locator('[data-chg="req-note"]').fill('Draft survives switching designs');
 await choose(p,'prism');check('Unsubmitted request text retained',await p.locator('[data-chg="req-note"]').inputValue(),'Draft survives switching designs');
 await p.locator('[data-act="req-submit"]').click();
 check('Request submitted through original backend handler',await p.evaluate(()=>__mockLive.writes.some(w=>w.path.startsWith('requests/')&&w.value.note==='Draft survives switching designs')));
 await nav(p,'my');await p.locator('[data-act="open-songs"]').first().click();await p.waitForSelector('.prism-catalog');
 await p.locator('[data-song-act="quick-add"]').first().click();await p.waitForSelector('.set-row');
 const setlist=await p.evaluate(()=>__mockLive.get('setlists/2026-07-11_morning'));
 check('Real Presider service deep link and setlist',setlist?.songs.length,1);
 const listenerCount=await p.evaluate(()=>__mockLive.listeners.length);
 await choose(p,'classic');check('Songs stay selected when switching back',await p.locator('.set-row').count(),1);
 await choose(p,'prism');check('Two-pane studio restored with the SAME songs',await p.locator('.prism-set-panel .set-row').count(),1);
 check('Switching designs never duplicates song listeners',await p.evaluate(()=>__mockLive.listeners.length),listenerCount);
 for(const tab of ['home','library','insights']){await p.locator(`[data-song-act="tab"][data-tab="${tab}"]`).click();check('Presider '+tab+' works in Prism',(await p.locator('#song-root').innerText()).length>120);}
 await shot(p,'03-live-presider');
 await nav(p,'manage');
 for(const t of ['services','planning','requests','people','features','data']){
  await p.locator(`[data-act="sub"][data-sub="${t}"]`).click();
  check('Manage '+t+' remains available', (await p.locator('#view').innerText()).length>100);
 }
 await p.locator('[data-act="sub"][data-sub="features"]').click();
 check('Production sheet-sync control NOT disabled by prototype adapter',await p.locator('[data-chg="feature"][data-id="sheetSync"]').isDisabled(),false);
 for(const tab of ['schedule','my','songs','manage']){
  await nav(p,tab);
  for(const width of [320,390,768,1024,1440]){await p.setViewportSize({width,height:1000});check(tab+' no page overflow '+width,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 }
 await p.setViewportSize({width:390,height:850});await p.locator('[data-design-open]:visible').click();await shot(p,'04-mobile-design-choice');await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>!!window.__mockLive);await releaseSettings(p);await p.waitForSelector('.prism-header');
 check('Returning member resumes preferred design without popup',await p.locator('.wd-design-dialog').count(),0);
 check('Unrelated local data not cleared',await p.evaluate(()=>localStorage.getItem('UNRELATED')),'keep');
 await nav(p,'my');await p.locator('#me-select').selectOption('S. Mercie');
 check('Non-presider access gate unchanged',await p.locator('#tab-presider').isHidden());
 await p.evaluate(()=>__mockLive.emit('app/settings',{...__designFixture.docs['app/settings'],sitePinHash:'new-required-hash'}));await p.waitForTimeout(150);
 check('Live passcode change relocks both navigation and switch',await p.locator('nav.tabs').isHidden()&&await p.locator('[data-design-open]').first().isHidden());
 await current.context.close();
 current=await make();await releaseSettings(current.page);await unlock(current.page);await current.page.waitForSelector('.wd-design-dialog');await current.page.locator('[data-design-select="classic"]').click();
 await current.page.reload();await current.page.waitForFunction(()=>!!window.__mockLive);await releaseSettings(current.page);await current.page.waitForTimeout(500);
 check('Keep current is remembered; no repeated invitation',await current.page.locator('.wd-design-dialog').count(),0);
 check('Keep current never loads a new layout',await current.page.evaluate(()=>WorshipDesign.getMode()),'classic');await current.context.close();
 current=await make({pref:'{"mode":"prism","invited":true}',disabled:true});await releaseSettings(current.page);await unlock(current.page);await current.page.waitForTimeout(400);
 check('Rollout kill switch forces current design despite saved Prism',await current.page.evaluate(()=>WorshipDesign.getMode()),'classic');await current.context.close();
 current=await make({pref:'{"mode":"prism","invited":true}'});await current.page.goto(origin+'/?design=classic');await current.page.waitForFunction(()=>!!window.__mockLive);await releaseSettings(current.page);await unlock(current.page);await current.page.waitForTimeout(400);
 check('Emergency URL restores the current design',await current.page.evaluate(()=>WorshipDesign.getMode()),'classic');await current.context.close();
 current=await make({brokenCSS:true});await releaseSettings(current.page);await unlock(current.page);await current.page.waitForSelector('.wd-design-dialog');await current.page.locator('[data-design-select="prism"]').click();await current.page.waitForTimeout(7600);
 check('Failed theme download leaves the original UI available',await current.page.evaluate(()=>WorshipDesign.getMode()),'classic');
 check('Failed download does not save Prism preference',await current.page.evaluate(()=>WorshipDesign.getPreference().mode||'classic'),'classic');await current.context.close();
 current=await make({blockedPreference:true});await releaseSettings(current.page);await unlock(current.page);await current.page.waitForSelector('.wd-design-dialog');await current.page.locator('[data-design-select="prism"]').click();await current.page.waitForSelector('.prism-planner');
 check('Preference write failure does not break live UI',await current.page.evaluate(()=>WorshipDesign.getMode()),'prism');
 check('Session-only preference is disclosed',await current.page.locator('#wd-design-status').innerText().then(t=>t.includes('cannot save')));
 check('Zero uncaught runtime errors',report.errors,[]);
 check('Original source files still unchanged after tests',await hashes(),before);
 report.passed=true;
}catch(e){report.failure=String(e.stack||e);if(current?.page)await shot(current.page,'failure').catch(()=>{});throw e;}
finally{report.count=report.checks.length;await fs.writeFile(path.join(out,'test-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.count,failure:report.failure},null,2));await browser.close();}
