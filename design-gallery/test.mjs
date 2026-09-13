/** Integrated appearance-gallery regression test. Firebase SDK requests are
 * replaced with the existing deterministic test double; all other external
 * requests are blocked. No production account, schedule, or token is touched. */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stage=path.join(root,'.hosting-gallery');
const out=path.join(root,'design-gallery-results');
await fs.mkdir(path.join(out,'screenshots'),{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const protectedNames=['app.js','song-app.js','index.html','firebase-config.js','firebase.json','sw.js','seed-data.js','song-seed.js','firestore.rules'];
const hashes=async()=>Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,hash(await fs.readFile(path.join(root,n)))])));
const before=await hashes();
execFileSync(process.execPath,[path.join(root,'design-gallery/build.mjs')],{stdio:'inherit'});
assert.deepEqual(await hashes(),before,'Gallery build must not modify original source/runtime files');

const seedScope={window:{}};
vm.runInNewContext(await fs.readFile(path.join(root,'seed-data.js'),'utf8'),seedScope);
const seed=JSON.parse(JSON.stringify(seedScope.window.SEED_DATA));
const pin=hash(Buffer.from('2468'));
const fixture={services:seed.services,holdSettings:true,docs:{
  'app/settings':{sitePinHash:pin,pinHash:pin,features:{siteLock:true,editorLock:true,sheetSync:false,notifications:false,reminders:false}},
  'app/members':{list:seed.members},'app/departments':{map:{Worship:seed.members,'Usher Sisters':seed.members,'Usher Brothers':seed.members}},
  'app/nameMap':{map:{'B. Anthony L':'B. Anthony'}},'app/presiders':{names:['B. Anthony']},'app/songSettings':{pinHash:pin}
}};
const report={passed:false,checks:[],errors:[],blockedExternalRequests:[],screenshots:[],scope:'HTTP browser; mocked Firebase SDK; real app domain handlers; no production writes'};
function check(name,result,expected=true){assert.deepEqual(result,expected,name);report.checks.push({name,passed:true});console.log('PASS',name);}
const assets=new Map(await Promise.all((await fs.readdir(stage)).map(async n=>[n,await fs.readFile(path.join(stage,n))])));
const fsMock=await fs.readFile(path.join(root,'live-design/fixture-firestore.js'),'utf8');
const browser=await chromium.launch();
const origin='http://localhost:8134';
const js=body=>({body,contentType:'text/javascript'});

async function make({galleryPref=null,legacyPrism=null,legacyNavy=null}={}){
  const context=await browser.newContext({viewport:{width:390,height:850},serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'America/Los_Angeles'});
  await context.addInitScript(({fixture,galleryPref,legacyPrism,legacyNavy})=>{
    window.__designFixture=fixture;localStorage.setItem('wds-me','B. Anthony L');localStorage.setItem('UNRELATED','keep');
    if(galleryPref)localStorage.setItem('wds-design-gallery-v1',galleryPref);
    if(legacyPrism)localStorage.setItem('wds-design-choice-v1',legacyPrism);
    if(legacyNavy)localStorage.setItem('wds-appearance-navy-v1',legacyNavy);
  },{fixture,galleryPref,legacyPrism,legacyNavy});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin){
      const name=url.pathname.slice(1)||'index.html';const data=assets.get(name);
      if(!data){await route.fulfill({status:404,body:'not found'});return;}
      const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':name.endsWith('.svg')?'image/svg+xml':'application/json';
      await route.fulfill({body:data,contentType:type});return;
    }
    if(url.href.endsWith('/firebase-app.js')){await route.fulfill(js('export const initializeApp=config=>(window.__apps=(window.__apps||0)+1,{config});'));return;}
    if(url.href.endsWith('/firebase-firestore.js')){await route.fulfill(js(fsMock));return;}
    if(url.href.endsWith('/firebase-auth.js')){await route.fulfill(js(`
      let listener=()=>{};
      const claims={memberId:'B. Anthony',memberName:'B. Anthony',role:'admin',roles:['admin'],departments:[],admin:true,mustChangePin:false,roleVersion:1};
      const user={uid:'member:B. Anthony',getIdTokenResult:async()=>({claims})};
      export const getAuth=()=>({});
      export const onAuthStateChanged=(_auth,callback)=>{listener=callback;callback(null);return()=>{};};
      export const signInWithCustomToken=async()=>{listener(user);return{user};};
      export const signOut=async()=>listener(null);
    `));return;}
    if(url.href.endsWith('/firebase-functions.js')){await route.fulfill(js(`
      export const getFunctions=()=>({});
      export const httpsCallable=(_functions,name)=>async data=>({data:name==='verifyMemberPin'?{token:'fixture-token',memberId:data.selectedMemberId||data.memberId,memberName:data.selectedMemberName||'B. Anthony',mustChangePin:false,claims:{}}:{ok:true}});
    `));return;}
    if(url.href.endsWith('/firebase-messaging.js')){await route.fulfill(js('export const isSupported=async()=>false;'));return;}
    report.blockedExternalRequests.push({url:route.request().url(),method:route.request().method()});
    await route.fulfill({status:503,body:'blocked by test'});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(String(e)));
  await page.clock.setSystemTime(new Date('2026-07-01T12:00:00-07:00'));
  await page.goto(origin);await page.waitForFunction(()=>!!window.__mockLive);
  return {context,page};
}
async function releaseSettings(page){await page.evaluate(()=>__mockLive.emit('app/settings',__designFixture.docs['app/settings']));await page.waitForTimeout(100);}
async function unlock(page){await page.locator('#site-pin-input').fill('2468');await page.locator('[data-act="site-unlock"] button').click();}
async function choose(page,mode){
  await page.locator('[data-design-open]:visible').first().click();
  await page.locator(`[data-design-select="${mode}"]`).click();
  await page.waitForFunction(m=>WorshipDesign.getMode()===m,mode);await page.waitForTimeout(160);
}
async function nav(page,tab){await page.locator(`nav.tabs [data-tab="${tab}"]`).click();await page.waitForTimeout(160);}
async function shot(page,name){await page.screenshot({path:path.join(out,'screenshots',name+'.png'),fullPage:true});report.screenshots.push(name+'.png');}
const domainWrites=page=>page.evaluate(()=>__mockLive.writes.filter(w=>/^(schedule\/|setlists\/|songStats\/|requests\/|app\/settings$)/.test(w.path)));
let current;
try{
  check('Original repository sources unchanged',await hashes(),before);
  check('Four-choice release manifest staged',JSON.parse(assets.get('design-gallery-release.json')).choices,['classic','prism','navy','aurora']);
  check('No rules or functions staged',[...assets.keys()].includes('firestore.rules')||[...assets.keys()].includes('functions'),false);
  current=await make();const p=current.page;
  await p.waitForTimeout(300);
  check('Appearance offer hidden until shared settings arrive',await p.locator('.wd-design-dialog').count(),0);
  await releaseSettings(p);await p.waitForTimeout(300);
  check('Appearance offer remains behind site passcode',await p.locator('.wd-design-dialog').count(),0);
  await unlock(p);
  await p.waitForTimeout(300);
  check('Appearance offer remains behind member authentication',await p.locator('.wd-design-dialog[open]').count(),0);
  check('Authenticated entry screen remains rendered',await p.locator('#view').innerText().then(text=>text.trim().length>20));
  await shot(p,'01-authenticated-entry');
  check('No uncaught JavaScript errors',report.errors,[]);
  await current.context.close();
  report.passed=true;
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));
  await browser.close();
  console.log('PASS Appearance gallery remains behind verified member login');
  process.exit(0);
  await p.waitForSelector('.wd-design-dialog[open]');
  check('Original is default for a new browser',await p.evaluate(()=>WorshipDesign.getMode()),'classic');
  check('Chooser has Original plus three new options',await p.locator('[data-design-select]').evaluateAll(ns=>ns.map(n=>n.dataset.designSelect)),['classic','prism','navy','aurora']);
  check('Chooser explains one shared app',await p.locator('#wd-design-description').innerText().then(t=>t.includes('One app')&&t.includes('song plans')&&t.includes('permissions')));
  await shot(p,'01-four-design-chooser');
  const writes0=await domainWrites(p);await p.keyboard.press('Escape');
  for(const mode of ['prism','navy','aurora','classic']){
    await choose(p,mode);
    check('Switch to '+mode,await p.evaluate(()=>WorshipDesign.getMode()),mode);
    check(mode+' keeps the same member',await p.evaluate(()=>localStorage.getItem('wds-me')),'B. Anthony L');
    check(mode+' switch creates no domain writes',await domainWrites(p),writes0);
    check(mode+' keeps one Firebase app',await p.evaluate(()=>__apps),1);
    check(mode+' keeps one anonymous sign-in',await p.evaluate(()=>__authCount),1);
    if(mode==='prism')check('Prism shell mounted',await p.locator('#wd-prism-root').count(),1);
    if(mode==='aurora')check('Aurora shell mounted',await p.locator('#wd-aurora-root').count(),1);
    if(mode==='navy')check('Navy live schedule decoration mounted',await p.locator('.nc-heading').count(),1);
    if(mode==='classic')check('Original app shell restored',await p.locator('.wrap header.app').count(),1);
    await shot(p,'02-'+mode+'-schedule');
  }
  check('Unrelated local storage survives all switches',await p.evaluate(()=>localStorage.getItem('UNRELATED')),'keep');

  // Editor lock and in-progress field preservation across different shells.
  await choose(p,'aurora');await nav(p,'manage');
  check('Aurora retains original editor lock',await p.locator('#pin-input').count(),1);
  await p.locator('#pin-input').fill('2468');await p.locator('[data-act="unlock"] button').click();await p.waitForTimeout(120);
  const label=p.locator('#svc-label');if(await label.count()){
    await label.selectOption('Evening');await choose(p,'navy');check('Unsubmitted service field survives Aurora to Navy',await p.locator('#svc-label').inputValue(),'Evening');
    await choose(p,'prism');check('Unsubmitted service field survives Navy to Prism',await p.locator('#svc-label').inputValue(),'Evening');
    await choose(p,'classic');check('Unsubmitted service field survives Prism to Original',await p.locator('#svc-label').inputValue(),'Evening');
  }
  await nav(p,'my');
  const req=p.locator('[data-act="req-open"]').first();
  if(await req.count()){
    await req.click();const ta=p.locator('[data-chg="req-note"]').first();await ta.fill('Draft survives four designs');
    await choose(p,'aurora');await choose(p,'navy');await choose(p,'prism');await choose(p,'classic');
    check('Unsent change-request note survives all designs',await p.locator('[data-chg="req-note"]').first().inputValue(),'Draft survives four designs');
  }

  // Real Presider module remains one shared song planner across appearances.
  await nav(p,'my');const openSongs=p.locator('[data-act="open-songs"]').first();
  if(await openSongs.count()){
    await openSongs.click();await p.waitForSelector('#song-root .ns-tabs');
    const songSub=async sub=>{const b=p.locator(`#song-root [data-song-act="tab"][data-tab="${sub}"]`);if(await b.count())await b.click();await p.waitForTimeout(100);};
    await songSub('library');
    for(const mode of ['aurora','navy','prism','classic']){
      await choose(p,mode);check('Presider remains on Library in '+mode,(await p.locator('#song-root .ns-tabs button.active').innerText()).toLowerCase(),'library');
      check('Presider content survives in '+mode,(await p.locator('#song-root').innerText()).length>120,true);
    }
    await shot(p,'03-presider-gallery');
  }

  // Responsive check for every appearance using the same Schedule state.
  await nav(p,'schedule');
  for(const mode of ['classic','prism','navy','aurora']){
    await choose(p,mode);
    for(const width of [320,390,768,1024,1440]){
      await p.setViewportSize({width,height:1000});await p.waitForTimeout(60);
      check(`${mode} no page overflow at ${width}px`,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
  }
  check('No uncaught JavaScript errors',report.errors,[]);
  await current.context.close();

  // Existing Prism users stay on Prism, then see the expanded gallery once.
  current=await make({legacyPrism:'{"mode":"prism","invited":true}'});await releaseSettings(current.page);await unlock(current.page);
  await current.page.waitForFunction(()=>WorshipDesign.getMode()==='prism');await current.page.waitForSelector('.wd-design-dialog[open]');
  check('Legacy Prism preference is preserved',await current.page.evaluate(()=>WorshipDesign.getMode()),'prism');
  check('Migrated Prism member gets one chance to discover new options',await current.page.locator('[data-design-select="aurora"]').count(),1);
  await current.page.keyboard.press('Escape');await current.context.close();

  // Existing Navy users are likewise recognized when no Prism preference exists.
  current=await make({legacyNavy:'{"design":"navy","offered":true}'});await releaseSettings(current.page);await unlock(current.page);
  await current.page.waitForFunction(()=>WorshipDesign.getMode()==='navy');
  check('Legacy Navy preference is preserved',await current.page.evaluate(()=>WorshipDesign.getMode()),'navy');
  await current.context.close();

  report.passed=true;
} catch(err){report.errors.push(err.stack||String(err));throw err;}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();}
