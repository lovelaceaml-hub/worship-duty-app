/** Build one deployable live app with four presentation choices:
 * Original + Prism + Navy & Cream + Aurora. The repository's original domain
 * runtime, Firebase config, persistence, rules and functions are not replaced.
 * Only the explicit hosting allowlist is staged to .hosting-gallery.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'design-gallery');
const dest=path.join(root,'.hosting-gallery');
const read=p=>fs.readFile(path.join(root,p),'utf8');
const hash=s=>createHash('sha1').update(s).digest('hex');
const count=(s,needle)=>s.split(needle).length-1;
const requireOne=(s,needle,label)=>{const n=count(s,needle);if(n!==1)throw Error('Design gallery source-interface drift: '+label+' ('+n+')');return needle;};
const requireAtLeastOne=(s,needle,label)=>{const n=count(s,needle);if(n<1)throw Error('Design gallery source-interface drift: '+label+' ('+n+')');return needle;};
const once=(s,a,b,label=a.slice(0,72))=>{requireOne(s,a,label);return s.replace(a,()=>b);};
const between=(s,a,b,label=a+' -> '+b)=>{const na=count(s,a),nb=count(s,b),i=s.indexOf(a),j=s.indexOf(b,i+1);if(na!==1||nb!==1||i<0||j<0||j<=i)throw Error('Design gallery presentation-interface drift: '+label+' ('+na+'/'+nb+')');return s.slice(i,j);};
const regexOnce=(s,re,repl,label)=>{let n=0;const out=s.replace(re,(...args)=>{n++;return typeof repl==='function'?repl(...args):repl;});if(n!==1)throw Error('Design gallery source drift: '+label+' ('+n+')');return out;};
const optionalRegexOnce=(s,re,repl,label)=>{let n=0;const out=s.replace(re,(...args)=>{n++;return typeof repl==='function'?repl(...args):repl;});if(n>1)throw Error('Design gallery source-interface drift: '+label+' ('+n+')');return out;};
const optionalOnce=(s,a,b,label)=>{const n=count(s,a);if(n>1)throw Error('Design gallery source-interface drift: '+label+' ('+n+')');return n?s.replace(a,()=>b):s;};
// vm.Script parses as a classic script, not an ES module, so a real `import`
// or `export` at the top level throws a plain SyntaxError there even though
// it is perfectly valid module code. Strip both (they can wrap multiple
// lines, e.g. the app.js split's `import {\n  a, b,\n} from './core/x.js';`)
// before the syntax check; this is a sanity check for stray generated-code
// drift, not a resolver, so dropping the statements themselves is enough.
const stripModuleSyntax=source=>source
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]*['"];?\s*$/gm,'')
  .replace(/^import\s+[A-Za-z_$][\w$]*\s*(?:,\s*\{[\s\S]*?\})?\s*from\s*['"][^'"]*['"];?\s*$/gm,'')
  .replace(/^import\s*\*\s*as\s+[A-Za-z_$][\w$]*\s*from\s*['"][^'"]*['"];?\s*$/gm,'')
  .replace(/^export\s+(?=async\s+function|function|const|let|var)/gm,'')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm,'');
const assertSyntax=(source,name)=>{const script=stripModuleSyntax(source);try{new Script(script,{filename:name});}catch(error){throw Error('Design gallery generated syntax drift in '+name+': '+error.message);}};
const stamp=process.env.RELEASE_STAMP||('gallery'+Date.now());
if(!/^[a-zA-Z0-9]+$/.test(stamp))throw Error('Invalid release stamp');
await fs.rm(dest,{recursive:true,force:true});await fs.mkdir(dest,{recursive:true});
const baseline=await read('app.js'),baseSongs=await read('song-app.js');
const upstream={app:hash(baseline),songs:hash(baseSongs),index:hash(await read('index.html'))};
let host=await read('design-gallery/host-bridge.js');
// The app.js split (docs/PLAN-2026-09-22-APP-JS-SPLIT.md) moves some of these
// anchors out of app.js into their own module. Each anchor below is checked
// against the file that currently holds it, not always app.js.
const authSrc=await read('core/auth.js').catch(()=>''),sheetSyncSrc=await read('core/sheet-sync.js').catch(()=>'');

/* The gallery is a compiler for the current app, not a second app. Fail
 * before staging when a released host or song interface changes. */
for(const [needle,label,source] of [
  ["'use strict';",'app module header',baseline],
  ['function renderMemberLogin()','secure member login renderer',baseline],
  ['function renderForcedPinChange()','forced member PIN renderer',baseline],
  ['function isVerifiedSession()','verified member session guard',authSrc||baseline],
  ['function isForcedSession()','forced PIN session guard',authSrc||baseline],
  ['function canManageAnyDepartment()','department Manage permission guard',authSrc||baseline],
  ['function selectedManageDepartment()','department Manage selector',authSrc||baseline],
  ['function songCtx()','Presider host context',baseline],
  ['data-act="member-login"','member login action',baseline],
  ['data-act="member-change-pin"','forced PIN action',baseline],
  ["choirSong: svc.choirSong || ''",'canonical choir song context',baseline],
  ['const choirSongSeen = sheetSvc._sheetChoirSongSeen === true','canonical choir song merge',sheetSyncSrc||baseline],
  ['data-field="choirSong"','canonical choir song editor',baseline]
])requireOne(source,needle,label);
for(const [needle,label] of [
  ["const TAB_ORDER = ['home', 'library', 'services', 'insights'];",'Presider tracking tab order'],
  ['function renderHomeScopeToggle()','Presider My Services and All Services toggle'],
  ['function homeScope()','Presider Home scope'],
  ['function allUpcomingServices()','Presider all-services Home data'],
  ["case 'services': return renderServices();",'Services tracking route'],
  ['function mount(rootEl, context)','Presider module mount interface'],
  ["choirSong: data.choirSong || ''",'Presider canonical choir song feed']
])requireOne(baseSongs,needle,label);
const choiceSource=await read('design-gallery/choice.js');
requireOne(choiceSource,"const NAMES = {classic:'Original', prism:'Prism', navy:'Navy & Cream', aurora:'Aurora'};",'four exact appearance names');

/* ---------- Prism presentation: same reviewed adapters as the live Prism branch ---------- */
let auroraSource=await read('prototype/aurora.js');
let prismHelpers=between(auroraSource,'const paths=','function renderHero','Prism icon/helper interface');
prismHelpers+=between(auroraSource,'function departmentPicker','function renderSelectedService');
prismHelpers=once(prismHelpers,'renderCatRows(s,false,c.name)',"renderCatRows(s,feat('emptyDuties'),c.name)",'Prism empty-duty helper');
let prismViews=await read('prototype-prism/prism.js');
prismViews=once(prismViews,'window.Prism=A;','','Prism global export');
prismViews=prismViews.replace(/^\/\*[\s\S]*?\*\//,'/* Live Prism presentation. Original data and permissions stay authoritative. */');
// Host bridge owns live event delegation; remove prototype listeners from the compiled views.
const prismClickAnchor="document.addEventListener('click'";
requireAtLeastOne(prismViews,prismClickAnchor,'Prism host event boundary');
prismViews=prismViews.slice(0,prismViews.indexOf(prismClickAnchor));
prismViews=prismViews.replaceAll('No visible reference assignments','No visible assignments').replaceAll('no visible reference assignments','no visible assignments')
 .replaceAll('Go to July 2026','Go to this month').replaceAll('Reference month','This month');
let prismPages=await read('prototype-prism/all-pages.js');
prismPages=once(prismPages,` if(ui.tab==='manage'&&ui.sub==='features'){
  const sheet=root.querySelector('[data-chg="feature"][data-id="sheetSync"]');if(sheet){sheet.disabled=true;sheet.closest('.feature-row').querySelector('.f-desc').textContent='Disabled in the offline preview. Production synchronization is unchanged.';}
 }`,'','Prism preview-only feature lock');
prismPages=once(prismPages," if(!fb&&cards[0])cards[0].innerHTML=", " if(false&&cards[0])cards[0].innerHTML=",'Prism preview data status');
prismPages=prismPages.replace(/^ if\(false&&cards\[0\]\).*\n/m,'');
for(const [a,b] of [
 ['<span class="ps-local-label">Local preview</span>',''],['PRISM / LOCAL PREVIEW','LV ZION / WORKSPACE'],
 ['This changes this prototype only. Your live app is untouched.','This changes the shared app data. Switching designs does not undo data changes.'],
 ['From the reference schedule','From your schedule'],['Visible reference services','Scheduled services'],['Stored in this preview','Saved in the shared app'],
 ['Feature flags affect this preview only; online delivery remains disabled.','These settings control the shared app for all members.'],
 ['All edits on this page stay in Prism. They do not change production settings.','Design choice is personal to this browser. Feature and passcode changes on this page affect everyone.'],
 ['Keep a local backup and manage your prototype’s reference data.','Back up the schedule and manage the shared connection.'],['Reset reference data','Reset schedule data']
])prismPages=prismPages.replaceAll(a,b);
prismPages=once(prismPages,"const names=['Connection status','Backup & restore','Reset schedule data','Member-name cleanup'];","const names=[];",'Prism data labels');
prismPages=once(prismPages,"cards.forEach((c,i)=>{c.classList.add('ps-data-card');if(i===2)c.classList.add('ps-danger-zone');if(i>0)c.insertAdjacentHTML('afterbegin','<div class=\"overline\">'+esc(names[i]||'DATA TOOL')+'</div>');});","cards.forEach((c,i)=>{c.classList.add('ps-data-card');if(c.querySelector('[data-act=reset]'))c.classList.add('ps-danger-zone');});",'Prism live data cards');
const retiredUnlockRenderer='render'+'Unlock',retiredCreateRenderer='render'+'Create'+'Pin';
const retiredPrismAuth="const psLockBase=renderSiteLock,psUnlockBase="+retiredUnlockRenderer+",psCreateBase="+retiredCreateRenderer+";\nrenderSiteLock=()=>PS.auth(psLockBase(),'site');"+retiredUnlockRenderer+"=()=>PS.auth(psUnlockBase());"+retiredCreateRenderer+"=()=>PS.auth(psCreateBase());";
prismPages=optionalOnce(prismPages,retiredPrismAuth,"const psLockBase=renderSiteLock;\nrenderSiteLock=()=>PS.auth(psLockBase(),'site');",'retired Prism editor lock adapter');
host=host.replace('/* PRISM_HELPERS */',prismHelpers).replace('/* PRISM_VIEWS */',prismViews).replace('/* PRISM_ALL_PAGES */',prismPages);

/* ---------- Aurora 02 presentation: reuse latest reviewed workspace layout, live wording ---------- */
let auroraCore=between(auroraSource,'const paths=','const originalRender=render;','Aurora workspace interface');
auroraCore=once(auroraCore,"renderCatRows(s,false,c.name)","renderCatRows(s,feat('emptyDuties'),c.name)",'Aurora empty-duty helper')
 .replaceAll('reference schedule','schedule').replaceAll('reference catalog','catalog')
 .replaceAll('Try July 2026','Try another month').replaceAll('Go to July 2026','Go to this month')
 .replaceAll('May'+String.fromCodePoint(0x2013)+'July reference schedule','Earlier services')
 .replaceAll('Real app logic.<br>Local preview changes only.','One shared schedule.<br>Your appearance choice only.');
const auroraDecorate=`function decorate(){
 const labels={schedule:['Service schedule','EVERY ROLE. ONE PLACE.','A clear view of who is serving, and when.'],my:['Your duties','YOUR PART IN THE SERVICE','Your assignments, reminders and change requests.'],songs:['Presider workspace','PLAN WITH CONFIDENCE','Build your setlist. Explore the catalog. Keep a thoughtful history.'],manage:['Manage the schedule','THE COORDINATOR WORKSPACE','Assignments, people and planning, without losing the big picture.']};
 const l=labels[ui.tab]||labels.schedule;
 document.body.dataset.screen=ui.tab;
 document.getElementById('page-title').textContent=l[0];document.getElementById('page-kicker').textContent=l[1];document.getElementById('page-description').textContent=l[2];
 document.getElementById('crumb').textContent={schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'}[ui.tab];
 document.getElementById('rail-person').textContent=ui.me||'Choose your name';document.getElementById('rail-initials').textContent=selectedInitials(ui.me);
 document.getElementById('heading-action').innerHTML=ui.tab==='schedule'?'<button class="primary" data-act="tab" data-tab="my">'+ai('my')+' My duties</button>':'';
 document.querySelectorAll('nav.tabs button').forEach(b=>{const key=b.dataset.tab,dot=b.querySelector('.dot')?'<span class="dot"></span>':'';b.innerHTML=ai(key)+'<span>'+({schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'}[key])+'</span>'+dot;if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 document.querySelectorAll('#view input:not([aria-label]),#view select:not([aria-label]),#view textarea:not([aria-label])').forEach(el=>{if(el.id&&document.querySelector('label[for="'+el.id+'"]'))return;if(el.closest('label'))return;const label=el.dataset.duty||el.dataset.field||el.getAttribute('placeholder')||({'svc-date':'Service date','svc-time':'Service time','svc-label':'Service label','a-department':'Duty department'}[el.id])||el.previousElementSibling?.textContent||'Schedule field';el.setAttribute('aria-label',String(label).trim());});
}`;
let workspaceJS=await read('prototype/workspaces.js');
workspaceJS=workspaceJS.replaceAll('Local preview','Live schedule').replaceAll('Editing locally','Editing service')
 .replaceAll('All switches here affect the local prototype only.','These switches control the shared app for all members.')
 .replaceAll('Keep a backup, restore reference data and review local-only connections.','Keep a backup and review the shared connection.')
 .replaceAll('Passcodes and scheduler preferences below are local to this preview.','Passcodes and scheduler preferences below affect the shared app.')
 .replaceAll('counts reflect your reference assignments and local song plans','counts reflect your assignments and saved song plans');
workspaceJS=regexOnce(workspaceJS,/  else if \(ui\.sub === 'data'\) \{[\s\S]*?\n    body = dom\.innerHTML;\n  \} else body =/,
  "  else if (ui.sub === 'data') body = dom.innerHTML;\n  else body =",'Aurora preview-only Data & Sync replacement');
workspaceJS=regexOnce(workspaceJS,/  const calendarHint = document\.querySelector\('\.aw-reminders \.notify-box \+ \.hint'\);[\s\S]*?\n  const hint = document\.querySelector\('\.aw-account-settings > \.hint'\);/,
  "  const hint = document.querySelector('.aw-account-settings > .hint');",'Aurora preview calendar hint');
let auroraPresider=await read('prototype/presider-workspace.js');
auroraPresider=auroraPresider.replaceAll('window.Aurora.icon','window.WorshipDesign.icon')
 .replaceAll('Local song plans','Saved song plans').replaceAll('reference assignments and local song plans','your assignments and saved song plans')
 .replaceAll('original songs, with categories, durations and your local history','songs, with categories, durations and recorded history')
 .replaceAll('Review least-sung songs and category coverage. No live song history is loaded in this preview.','Review least-sung songs, category coverage and the service history recorded in this app.')
 .replaceAll('Local preview history only. No live congregation history or usage statistics are loaded.','Insights use the service history recorded in this app.');
auroraPresider=optionalRegexOnce(auroraPresider,/const awOriginalSongServices = renderServices;[\s\S]*?\n};\n(?=const awOriginalInsights = renderInsights;)/,'','retired Aurora Services destination adapter');
host=host.replace('/* AURORA_CORE */',auroraCore).replace('/* AURORA_DECORATE */',auroraDecorate).replace('/* AURORA_WORKSPACES */',workspaceJS).replace('/* NAVY_ADAPTER */',await read('design-gallery/navy-adapter.js'));

/* ---------- Shells ---------- */
function prismShell(){
 let shell='';
 return read('prototype-prism/shell.html').then(s=>{
   shell=between(s,'<header','<span id="crumb"','Prism shell body');
   shell=once(shell,shell.match(/<nav class="tabs"[\s\S]*?<\/nav>/)[0],'<span data-design-slot="nav"></span>','Prism nav slot');
   shell=once(shell,'<div id="banners" aria-live="polite"></div><main id="view" tabindex="-1"></main>','<span data-design-slot="banners"></span><span data-design-slot="view"></span>','Prism view slots');
   shell=once(shell,'<span id="sync-pill">Local preview</span>','<span data-design-slot="sync"></span>','Prism sync slot');
   shell=shell.replace('DESIGN 02','PRISM').replace('<span class="preview-tag">LOCAL PREVIEW</span>','<button class="wd-design-button" data-design-open>Appearance</button>').replace('<button class="reset-button" data-aurora="reset">Reset</button>','').replace('Repository reference data · July 1, 2026 preview clock · Not the live schedule','One shared schedule · Prism is your personal appearance choice');
   return '<div id="wd-prism-root">'+shell+'<span id="crumb" hidden></span></div>';
 });
}
function auroraShell(){
 return read('prototype/shell.html').then(s=>{
   let body=between(s,'<a class="skip-link"','<!-- RUNTIME -->','Aurora shell body');
   const nav=body.match(/<nav class="tabs"[\s\S]*?<\/nav>/)?.[0];if(!nav)throw Error('Aurora shell nav missing');
   body=once(body,nav,'<span data-design-slot="nav"></span>','Aurora nav slot');
   body=once(body,'<div id="banners" aria-live="polite"></div>','<span data-design-slot="banners"></span>','Aurora banners slot');
   body=once(body,'<main id="view" tabindex="-1"></main>','<span data-design-slot="view"></span>','Aurora view slot');
   body=once(body,'<span id="sync-pill" class="sync-pill">Local preview</span>','<span data-design-slot="sync"></span>','Aurora sync slot');
   body=body.replace('<span class="preview-tag">LOCAL PROTOTYPE</span>','<button class="wd-design-button" data-design-open>Appearance</button>').replace('<button class="reset-button" data-aurora="reset">Reset preview</button>','')
    .replace('<div class="sandbox-note"><span class="sandbox-dot"></span> A space to try things<p>Changes stay in this preview.<br>Your live schedule is untouched.</p></div>','<div class="sandbox-note"><span class="sandbox-dot"></span> Aurora workspace<p>Same shared schedule.<br>Your view can change anytime.</p></div>')
    .replace('AURORA <span>DESIGN PROTOTYPE / 01</span>','AURORA <span>LIVE APPEARANCE</span>')
    .replace('<div class="preview-disclosure" role="note">Repository reference data · Preview date July 1, 2026 · Not the live schedule<span id="storage-note"></span></div>','<div class="preview-disclosure" role="note">One shared schedule · Aurora is your personal appearance choice</div>');
   return '<div id="wd-aurora-root">'+body+'</div>';
 });
}
host=host.replace('/* PRISM_SHELL */',JSON.stringify(await prismShell())).replace('/* AURORA_SHELL */',JSON.stringify(await auroraShell()));

/* ---------- Original live app + presentation bridge ---------- */
let app=once(baseline,"'use strict';","'use strict';\nlet __designSettingsReady=!window.FIREBASE_CONFIG;",'settings-ready seed');
app=once(app,"fsMod.onSnapshot(fsMod.doc(db, 'app', 'settings'), snap => {","fsMod.onSnapshot(fsMod.doc(db, 'app', 'settings'), snap => {\n    __designSettingsReady=true; renderSoon();",'settings snapshot');
app=once(app,'\ninit();','\n'+host+'\ninit();','host initialization');

/* ---------- Song planner variants ---------- */
let prismSongViews=await read('prototype-prism/song-pages.js');
prismSongViews=prismSongViews.replaceAll('From the reference duty roster','From the shared duty roster').replaceAll('Based on local song plans','Based on saved song plans').replaceAll('Stored in this preview','Saved song plans').replaceAll('Song usage is based on this preview’s local history, not live congregation activity.','Song usage is based on recorded service history.').replaceAll('Including local backfills','Including entered history');
requireOne(prismSongViews,'window.PrismSongInspect=','Prism Presider inspection boundary');
prismSongViews=optionalRegexOnce(prismSongViews,/const psSongServicesBase=renderServices;[\s\S]*?\n};\n(?=const psInsightsBase=renderInsights;)/,'','retired Prism Services destination adapter');
prismSongViews=prismSongViews.slice(0,prismSongViews.indexOf('window.PrismSongInspect='));
prismSongViews=prismSongViews.replace("document.addEventListener('keydown',e=>{","document.addEventListener('keydown',e=>{if(!window.WorshipDesign?.isPrism())return;");
const library=between(baseSongs,'function renderLibrary()','function renderSongRow');
let prismLibrary=once(library,"return renderBuilder() +\n    '<div class=\"lib-controls\">'","return '<div class=\"prism-song-layout\"><aside class=\"prism-set-panel\" aria-label=\"Your setlist\">'+renderBuilder()+'</aside><section class=\"prism-catalog\" aria-label=\"Song catalog\">'+\n    '<div class=\"lib-controls\">'",'Prism library layout');
prismLibrary=once(prismLibrary,"renderLibMore(pages);","renderLibMore(pages)+'</section></div>';",'Prism library close').replace('function renderLibrary()','function renderPrismLibrary()');
const songBridge=`\nif(window.WorshipDesign){\nconst old={renderHeader,renderSongRow,renderHome,renderServices,renderInsights,renderRunsheet,renderEditorGate,renderScheduleCard,renderServiceCard,renderLibrary,render};\nlet prismSong;{\nlet renderHome=old.renderHome,renderServices=old.renderServices,renderInsights=old.renderInsights,renderRunsheet=old.renderRunsheet,renderEditorGate=old.renderEditorGate,renderScheduleCard=old.renderScheduleCard,renderServiceCard=old.renderServiceCard,render=old.render;\n${prismSongViews}\n${prismLibrary}\nprismSong={renderHome,renderServices,renderInsights,renderRunsheet,renderEditorGate,renderScheduleCard,renderServiceCard,renderLibrary:renderPrismLibrary,render};}\nlet auroraSong;{\nlet renderHeader=old.renderHeader,renderSongRow=old.renderSongRow,renderServiceCard=old.renderServiceCard,renderLibrary=old.renderLibrary,renderHome=old.renderHome,renderServices=old.renderServices,renderInsights=old.renderInsights,render=old.render;\n${auroraPresider}\nauroraSong={renderHeader,renderSongRow,renderServiceCard,renderLibrary,renderHome,renderServices,renderInsights,render};}\nconst pick=(name,...args)=>{const m=window.WorshipDesign.getMode();const group=m==='prism'?prismSong:m==='aurora'?auroraSong:null;return (group?.[name]||old[name])(...args);};\nrenderHeader=(...a)=>pick('renderHeader',...a);renderSongRow=(...a)=>pick('renderSongRow',...a);renderHome=(...a)=>pick('renderHome',...a);renderServices=(...a)=>pick('renderServices',...a);renderInsights=(...a)=>pick('renderInsights',...a);renderRunsheet=(...a)=>pick('renderRunsheet',...a);renderEditorGate=(...a)=>pick('renderEditorGate',...a);renderScheduleCard=(...a)=>pick('renderScheduleCard',...a);renderServiceCard=(...a)=>pick('renderServiceCard',...a);renderLibrary=(...a)=>pick('renderLibrary',...a);render=(...a)=>pick('render',...a);\n}\n`;
const songs=baseSongs+songBridge;

/* ---------- index and styles ---------- */
let index=await read('index.html');
index=once(index,'<html lang="en">','<html lang="en" data-design-gallery="on">','gallery marker');
index=once(index,'</head>','<link rel="stylesheet" href="design-choice.css?v=DEV">\n<link id="wd-prism-css" rel="stylesheet" href="prism-live.css?v=DEV" media="not all">\n<link id="wd-navy-css" rel="stylesheet" href="navy-live.css?v=DEV" media="not all">\n<link id="wd-aurora-css" rel="stylesheet" href="aurora-live.css?v=DEV" media="not all">\n<script defer src="design-choice.js?v=DEV"></script>\n</head>','gallery assets');
index=once(index,'    <div class="sub"><span id="sync-pill" class="sync-pill">This device only</span></div>','    <div class="sub"><button class="wd-design-button nc-appearance" data-design-open hidden>Appearance</button><span id="sync-pill" class="sync-pill">This device only</span></div>','Navy Appearance button');
index=once(index,'  <nav class="tabs">','  <div class="wd-classic-choice"><button class="wd-design-button" data-design-open hidden>Appearance</button></div>\n  <nav class="tabs">','classic Appearance button');
const prismCSS=(await Promise.all(['prototype/aurora.css','prototype-prism/prism.css','prototype-prism/all-pages.css','prototype-prism/safety.css'].map(read))).join('\n')+'\n.wd-prism-sentinel{--ready:1}\n';
const navyCSS=(await read('design-gallery/navy.css'))+'\n.wd-navy-sentinel{--ready:1}\n';
const auroraCSS=(await Promise.all(['prototype/aurora.css','prototype/workspaces.css'].map(read))).join('\n')+'\n.wd-aurora-sentinel{--ready:1}\n';
const files={'app.js':app,'song-app.js':songs,'index.html':index,'design-choice.js':choiceSource,'design-choice.css':await read('design-gallery/choice.css'),'prism-live.css':prismCSS,'navy-live.css':navyCSS,'aurora-live.css':auroraCSS};
for(const [token,label] of [['/* PRISM_HELPERS */','Prism helper slot'],['/* PRISM_VIEWS */','Prism view slot'],['/* PRISM_ALL_PAGES */','Prism page slot'],['/* AURORA_CORE */','Aurora core slot'],['/* AURORA_DECORATE */','Aurora decorator slot'],['/* AURORA_WORKSPACES */','Aurora workspace slot'],['/* NAVY_ADAPTER */','Navy adapter slot'],['/* PRISM_SHELL */','Prism shell slot'],['/* AURORA_SHELL */','Aurora shell slot']])if(host.includes(token))throw Error('Design gallery source-interface drift: unresolved '+label);
assertSyntax(app,'gallery-app.js');
assertSyntax(songs,'gallery-song-app.js');
for(const [name,text] of Object.entries(files))await fs.writeFile(path.join(dest,name),text.replaceAll('?v=DEV','?v='+stamp));
for(const a of ['seed-data.js','permissions.js','firebase-config.js','song-seed.js','song-lib.js','song-app.css','icon.svg','manifest.json'])await fs.copyFile(path.join(root,a),path.join(dest,a));
// The app.js split (docs/PLAN-2026-09-22-APP-JS-SPLIT.md) turns app.js into a
// real ES module graph with relative imports (e.g. './core/constants.js').
// Mirror whichever of its module directories exist yet, so the staged app.js
// can resolve them; a section that hasn't created its directory is skipped.
for(const moduleDir of ['core','views','actions']){
  let entries;
  try{entries=await fs.readdir(path.join(root,moduleDir));}
  catch(error){if(error.code==='ENOENT')continue;throw error;}
  await fs.mkdir(path.join(dest,moduleDir),{recursive:true});
  for(const entry of entries){
    if(!entry.endsWith('.js'))continue;
    await fs.copyFile(path.join(root,moduleDir,entry),path.join(dest,moduleDir,entry));
  }
}
await fs.mkdir(path.join(dest,'scripts'),{recursive:true});
await fs.copyFile(path.join(root,'scripts','guard-gallery-deploy.mjs'),path.join(dest,'scripts','guard-gallery-deploy.mjs'));
let sw=await read('sw.js');sw=once(sw,"const RELEASE = 'DEV';",`const RELEASE = '${stamp}';`,'service-worker stamp');await fs.writeFile(path.join(dest,'sw.js'),sw);
const config=JSON.parse(await read('firebase.json'));config.hosting.public='.';config.hosting.ignore=['firebase.gallery.json','scripts/**'];
for(const name of ['design-choice.js','design-choice.css','prism-live.css','navy-live.css','aurora-live.css'])config.hosting.headers.push({source:name,headers:[{key:'Cache-Control',value:'no-cache'}]});
await fs.writeFile(path.join(dest,'firebase.gallery.json'),JSON.stringify(config,null,2));
const manifest={release:stamp,design:'appearance-gallery-v1',choices:['classic','prism','navy','aurora'],upstream,builtAt:new Date().toISOString()};
await fs.writeFile(path.join(dest,'design-gallery-release.json'),JSON.stringify(manifest,null,2));
console.log('Built '+path.relative(root,dest)+' for Original + Prism + Navy & Cream + Aurora. Not deployed.');
console.log(JSON.stringify(manifest,null,2));
export {manifest,root,dir,dest,hash};
