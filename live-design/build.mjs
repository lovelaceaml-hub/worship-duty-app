/** Build a deployable, opt-in UI around the ORIGINAL live runtime.
 * No call to either offline prototype build; no backend/data conversion.
 * Source files stay untouched. Only the explicit staged public allowlist ships.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dest=path.join(root,'.hosting-live');
const read=p=>fs.readFile(path.join(root,p),'utf8');
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Live design source drift: '+a.slice(0,80));return s.replace(a,()=>b);};
const between=(s,a,b)=>{if(!s.includes(a)||!s.includes(b))throw Error('Missing presentation anchor');return s.slice(s.indexOf(a),s.indexOf(b));};
const stamp=process.env.RELEASE_STAMP||('prism'+Date.now());
if(!/^[a-zA-Z0-9]+$/.test(stamp))throw Error('Invalid release stamp');
await fs.rm(dest,{recursive:true,force:true});await fs.mkdir(dest,{recursive:true});
const baseline=await read('app.js'),baseSongs=await read('song-app.js');
let host=await read('live-design/host-bridge.js');
let aurora=await read('prototype/aurora.js');
let helpers=between(aurora,'const paths=','function renderHero');
helpers+=between(aurora,'function departmentPicker','function renderSelectedService');
// Respect the original global empty-duty feature instead of hardcoding false.
helpers=helpers.replace('renderCatRows(s,false,c.name)','renderCatRows(s,feat(\'emptyDuties\'),c.name)');
let views=await read('prototype-prism/prism.js');
views=once(views,'window.Prism=A;','');
views=views.replace(/^\/\*[\s\S]*?\*\//,'/* Live Prism presentation. Original data and permissions stay authoritative. */');
// Event delegation and keyboard calendar navigation only run in Prism.
views=views.replaceAll("document.addEventListener('click',e=>{","document.addEventListener('click',e=>{ if(!window.WorshipDesign?.isPrism())return;")
 .replaceAll("document.addEventListener('keydown',e=>{","document.addEventListener('keydown',e=>{ if(!window.WorshipDesign?.isPrism())return;");
views=views.replaceAll('No visible reference assignments','No visible assignments').replaceAll('no visible reference assignments','no visible assignments')
 .replaceAll('Go to July 2026','Go to this month').replaceAll('Reference month','This month');
let pages=await read('prototype-prism/all-pages.js');
pages=once(pages,` if(ui.tab==='manage'&&ui.sub==='features'){
  const sheet=root.querySelector('[data-chg="feature"][data-id="sheetSync"]');if(sheet){sheet.disabled=true;sheet.closest('.feature-row').querySelector('.f-desc').textContent='Disabled in the offline preview. Production synchronization is unchanged.';}
 }`,'');
pages=once(pages," if(!fb&&cards[0])cards[0].innerHTML=", " if(false&&cards[0])cards[0].innerHTML="); // removed below, never masks actual live/fallback status
pages=pages.replace(/^ if\(false&&cards\[0\]\).*\n/m,'');
const wording=[
 ['<span class="ps-local-label">Local preview</span>',''],
 ['PRISM / LOCAL PREVIEW','LV ZION / WORKSPACE'],
 ['This changes this prototype only. Your live app is untouched.','This changes the shared app data. Switching designs does not undo data changes.'],
 ['From the reference schedule','From your schedule'],['Visible reference services','Scheduled services'],
 ['Stored in this preview','In the shared workspace'],
 ['Feature flags affect this preview only; online delivery remains disabled.','These settings control the shared app for all members.'],
 ['All edits on this page stay in Prism. They do not change production settings.','Design choice is personal to this browser. Feature and passcode changes on this page affect everyone.'],
 ['Keep a local backup and manage your prototype’s reference data.','Back up the schedule and manage the shared connection.'],
 ['Reset reference data','Reset schedule data']
];
for(const [a,b]of wording)pages=pages.replaceAll(a,b);
// Live mode has a Google Sheet card which the offline demo omitted. Identify
// sections by their actions rather than the demo's positional card indexes.
pages=once(pages,"const names=['Connection status','Backup & restore','Reset schedule data','Member-name cleanup'];", "const names=[];");
pages=once(pages,"cards.forEach((c,i)=>{c.classList.add('ps-data-card');if(i===2)c.classList.add('ps-danger-zone');if(i>0)c.insertAdjacentHTML('afterbegin','<div class=\"overline\">'+esc(names[i]||'DATA TOOL')+'</div>');});", "cards.forEach((c,i)=>{c.classList.add('ps-data-card');if(c.querySelector('[data-act=reset]'))c.classList.add('ps-danger-zone');});");
let shell=await read('prototype-prism/shell.html');
shell=shell.slice(shell.indexOf('<header'),shell.indexOf('<span id="crumb"'));
shell=once(shell, shell.match(/<nav class="tabs"[\s\S]*?<\/nav>/)[0],'<span data-design-slot="nav"></span>');
shell=once(shell,'<div id="banners" aria-live="polite"></div><main id="view" tabindex="-1"></main>','<span data-design-slot="banners"></span><span data-design-slot="view"></span>');
shell=once(shell,'<span id="sync-pill">Local preview</span>','<span data-design-slot="sync"></span>');
shell=shell.replace('DESIGN 02','NEW LOOK').replace('<span class="preview-tag">LOCAL PREVIEW</span>','<button class="wd-design-button" data-design-open>Design</button>')
 .replace('<button class="reset-button" data-aurora="reset">Reset</button>','')
 .replace('Repository reference data · July 1, 2026 preview clock · Not the live schedule','One shared schedule · Your choice of design');
shell='<div id="wd-prism-root">'+shell+'<span id="crumb" hidden></span></div>';
host=host.replace('/* PRISM_HELPERS */',helpers).replace('/* PRISM_VIEWS */',views).replace('/* ALL_PAGES */',pages).replace('/* LIVE_SHELL */',JSON.stringify(shell));
const names=['renderSchedule','renderMy','renderManageServices','renderManagePlanning','renderManageRequests','renderManagePeople','renderFeatures','renderManageData','renderSiteLock','renderUnlock','renderCreatePin'];
host=host.replace('/* SELECT_RENDERERS */',names.map(n=>`${n}=function(...args){return (design.isPrism()?variants.${n}:originals.${n})(...args);};`).join('\n'));
let app=once(baseline,"'use strict';","'use strict';\nlet __designSettingsReady=!window.FIREBASE_CONFIG;");
app=once(app,"fsMod.onSnapshot(fsMod.doc(db, 'app', 'settings'), snap => {","fsMod.onSnapshot(fsMod.doc(db, 'app', 'settings'), snap => {\n    __designSettingsReady=true; renderSoon();");
app=once(app,'\ninit();','\n'+host+'\ninit();');
let songViews=await read('prototype-prism/song-pages.js');
songViews=songViews.replaceAll('From the reference duty roster','From the shared duty roster').replaceAll('Based on local song plans','Based on saved song plans').replaceAll('Stored in this preview','Saved song plans').replaceAll('Song usage is based on this preview’s local history, not live congregation activity.','Song usage is based on recorded service history.').replaceAll('Including local backfills','Including entered history');
songViews=songViews.slice(0,songViews.indexOf('window.PrismSongInspect='));
const songNames=['renderHome','renderServices','renderInsights','renderRunsheet','renderEditorGate','renderScheduleCard','renderServiceCard','render'];
const library=between(baseSongs,'function renderLibrary()','function renderSongRow');
let prismLibrary=once(library,"return renderBuilder() +\n    '<div class=\"lib-controls\">'", "return '<div class=\"prism-song-layout\"><aside class=\"prism-set-panel\" aria-label=\"Your setlist\">'+renderBuilder()+'</aside><section class=\"prism-catalog\" aria-label=\"Song catalog\">'+\n    '<div class=\"lib-controls\">'");
prismLibrary=once(prismLibrary,'renderLibMore(pages);','renderLibMore(pages)+\'</section></div>\';');
prismLibrary=prismLibrary.replace('function renderLibrary()','function renderPrismLibrary()');
const songBridge=`\nif(window.WorshipDesign){\nconst old={${songNames.join(',')},renderLibrary};\n{\n${songViews}\n}\nconst themed={${songNames.join(',')}};\n${songNames.map(n=>`${n}=function(...args){return (window.WorshipDesign.isPrism()?themed.${n}:old.${n})(...args);};`).join('\n')}\n${prismLibrary}\nrenderLibrary=function(){return window.WorshipDesign.isPrism()?renderPrismLibrary():old.renderLibrary();};\n}\n`;
const songs=baseSongs+songBridge;
let index=await read('index.html');
index=once(index,'<html lang="en">','<html lang="en" data-prism-rollout="'+(process.argv.includes('--disable-prism')?'off':'on')+'">');
index=once(index,'</head>','<link rel="stylesheet" href="design-choice.css?v=DEV">\n<link id="wd-prism-css" rel="stylesheet" href="prism-live.css?v=DEV" media="not all">\n<script defer src="design-choice.js?v=DEV"></script>\n</head>');
index=once(index,'  <nav class="tabs">','  <div class="wd-classic-choice"><button class="wd-design-button" data-design-open hidden>Design</button></div>\n  <nav class="tabs">');
const css=(await Promise.all(['prototype/aurora.css','prototype-prism/prism.css','prototype-prism/all-pages.css','prototype-prism/safety.css'].map(read))).join('\n');
for(const [name,text]of Object.entries({'app.js':app,'song-app.js':songs,'index.html':index,'design-choice.js':await read('live-design/choice.js'),'design-choice.css':await read('live-design/choice.css'),'prism-live.css':css})){
 await fs.writeFile(path.join(dest,name),text.replaceAll('?v=DEV','?v='+stamp));
}
const assets=['seed-data.js','firebase-config.js','song-seed.js','song-lib.js','song-app.css','icon.svg','manifest.json'];
for(const a of assets)await fs.copyFile(path.join(root,a),path.join(dest,a));
let sw=await read('sw.js');sw=once(sw,"const RELEASE = 'DEV';",`const RELEASE = '${stamp}';`);await fs.writeFile(path.join(dest,'sw.js'),sw);
const config=JSON.parse(await read('firebase.json'));config.hosting.public='.';config.hosting.ignore=['firebase.json','release-manifest.json'];
for(const name of ['design-choice.js','design-choice.css','prism-live.css'])config.hosting.headers.push({source:name,headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]});
await fs.writeFile(path.join(dest,'firebase.json'),JSON.stringify({hosting:config.hosting},null,2));
const sha=s=>createHash('sha256').update(s).digest('hex');
await fs.writeFile(path.join(dest,'release-manifest.json'),JSON.stringify({stamp,rollout:!process.argv.includes('--disable-prism'),baseAppSha256:sha(baseline),baseSongSha256:sha(baseSongs),builtAt:new Date().toISOString()},null,2));
// Fail closed if prototype isolation leaks into the live host or song runtime.
for(const [name,text]of Object.entries({app,songs,index}))for(const token of ['lv-prism-preview-v1:','lv-aurora-preview-v1:','Aurora.Clock','previewSchedule','LOCAL PREVIEW','Reference month','July 1, 2026'])if(text.includes(token))throw Error(`Offline residue in ${name}: ${token}`);
console.log('Built .hosting-live/ with both designs. No deployment performed. Release '+stamp);
