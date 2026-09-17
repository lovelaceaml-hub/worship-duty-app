import path from 'node:path';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {manifest,root,dest,hash} from './build.mjs';
import {applyStagedAppFixes} from './app-fixes.mjs';

await applyStagedAppFixes(dest);

const args=process.argv.slice(2),allowed=new Set(['--publish','--preview']);
if(args.some(a=>!allowed.has(a))||args.length>1)throw Error('Use no argument to build, --preview for a temporary Firebase channel, or --publish for the existing live site.');
if(!args.length){console.log('Built with choir date/service sync fix. Not deployed. Re-run with --preview or --publish from an authenticated Firebase environment.');process.exit(0);}
const origin='https://lv-zion-duties.web.app';
const normalizeApp=s=>String(s).replace(/\?v=[A-Za-z0-9]+/g,'?v=DEV');
const sha256=s=>createHash('sha256').update(s).digest('hex');
const currentBase=await fs.readFile(path.join(root,'app.js'),'utf8');
const currentBaseSha256=sha256(currentBase);

function git(args){
  const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});
  if(r.status!==0)return '';
  return r.stdout || '';
}

function findAncestorAppMatch(liveApp){
  const liveHash=hash(normalizeApp(liveApp));
  const commits=git(['rev-list','HEAD','--','app.js']).trim().split(/\s+/).filter(Boolean);
  for(const commit of commits){
    const source=git(['show',commit+':app.js']);
    if(source && hash(normalizeApp(source))===liveHash)return commit;
  }
  return '';
}

function sourceHashExistsInHistory(file,digest){
  if(!digest)return false;
  const commits=git(['rev-list','HEAD','--',file]).trim().split(/\s+/).filter(Boolean);
  return commits.some(commit=>{
    const source=git(['show',commit+':'+file]);
    return source&&hash(source)===digest;
  });
}

async function matchesUnmarkedLegacyPrism(liveApp){
  // The first Prism publisher intentionally excluded release-manifest.json from
  // Hosting, so a valid Prism deployment may have no marker at all. Rebuild
  // that exact legacy candidate from the reviewed source and compare generated
  // app.js byte-for-byte after normalizing only the release stamp.
  const build=spawnSync(process.execPath,[path.join(root,'live-design/build.mjs')],{
    cwd:root,
    encoding:'utf8',
    env:{...process.env,RELEASE_STAMP:'LEGACYPRISMCHECK'}
  });
  if(build.status!==0)return false;
  try{
    const legacy=await fs.readFile(path.join(root,'.hosting-live','app.js'),'utf8');
    return hash(normalizeApp(legacy))===hash(normalizeApp(liveApp));
  }catch{return false;}
}

async function matchesUnmarkedGallery(liveApp){
  // Gallery releases before the manifest was included in Hosting are safe to
  // replace only when their normalized compiled app exactly matches the
  // current reviewed source and adapters.
  const build=spawnSync(process.execPath,[path.join(root,'design-gallery/build.mjs')],{
    cwd:root,
    encoding:'utf8',
    env:{...process.env,RELEASE_STAMP:'GALLERYCHECK'}
  });
  if(build.status!==0)return false;
  let matches=false;
  try{
    await applyStagedAppFixes(path.join(root,'.hosting-gallery'));
    const gallery=await fs.readFile(path.join(root,'.hosting-gallery','app.js'),'utf8');
    matches=hash(normalizeApp(gallery))===hash(normalizeApp(liveApp));
  }catch{return false;}
  finally{
    const restore=spawnSync(process.execPath,[path.join(root,'design-gallery/build.mjs')],{
      cwd:root,
      encoding:'utf8',
      env:{...process.env,RELEASE_STAMP:manifest.release}
    });
    if(restore.status===0)await applyStagedAppFixes(path.join(root,'.hosting-gallery'));
  }
  return matches;
}

async function compatibleLive(){
  const live=await (await fetch(origin+'/?gallery-check='+Date.now(),{signal:AbortSignal.timeout(20000)})).text();
  const src=live.match(/<script[^>]+src=["']([^"']*app\.js[^"']*)["']/)?.[1];
  if(!src)throw Error('Cannot identify the deployed app. Nothing deployed.');
  const current=await (await fetch(new URL(src,origin),{signal:AbortSignal.timeout(20000)})).text();
  const normalized=normalizeApp(current);
  if(hash(normalized)===manifest.upstream.app)return {kind:'original-current'};

  // Known release markers from previous opt-in designs. Prism used baseAppSha256;
  // later Gallery/Navy releases record upstream.app. Accept either only when the
  // marker proves it was built from the exact reviewed base.
  for(const [file,kind] of [['design-gallery-release.json','gallery'],['release-manifest.json','prism'],['navy-release.json','navy']]){
    try{
      const r=await fetch(origin+'/'+file+'?gallery-check='+Date.now(),{signal:AbortSignal.timeout(12000)});if(!r.ok)continue;
      const info=await r.json();
      if(info?.upstream?.app===manifest.upstream.app || info?.baseAppSha256===currentBaseSha256)return {kind,info};
      // A live v1 gallery (the retired prototype-extraction compiler) is a
      // known, accepted predecessor of this v2 packager-built gallery: the
      // architecture changed intentionally in the compact-phone refactor, so
      // its manifest marker alone is enough, no source-hash reconstruction.
      if(kind==='gallery'&&info?.design==='appearance-gallery-v1')return {kind:'gallery-v1-predecessor',info};
    }catch{}
  }

  // Exact reconstruction of the earlier Prism Hosting candidate, for releases
  // that were deployed before the marker was included in Hosting.
  if(await matchesUnmarkedLegacyPrism(current))return {kind:'prism-unmarked-exact'};

  if(await matchesUnmarkedGallery(current))return {kind:'gallery-unmarked-exact'};

  // Older Original production releases can also predate release markers.
  const ancestor=findAncestorAppMatch(current);
  if(ancestor)return {kind:'original-history',commit:ancestor};

  throw Error('The live app does not exactly match the current reviewed base, a known design release, the reconstructed legacy Prism release, or any app.js version in this main-branch history. Nothing deployed.');
}
if(args.includes('--publish')){
  const c=await compatibleLive();
  console.log('Compatible current live release:',c.kind+(c.commit?' @ '+c.commit.slice(0,12):''));
}
const command=process.platform==='win32'?'npx.cmd':'npx';
const firebase=['--yes','firebase-tools'];
const releaseArgs=args.includes('--publish')?['deploy','--only','hosting']:['hosting:channel:deploy','design-gallery-review','--expires','7d'];
console.log('Deploying hosting assets only. No functions, security rules, account settings or schedule records are deployed.');
const result=spawnSync(command,[...firebase,...releaseArgs,'--config',path.join(dest,'firebase.gallery.json'),'--project','lv-zion-duties'],{
  cwd:root,
  stdio:'inherit',
  env:{...process.env,WDS_GALLERY_RELEASE:'1'}
});
if(result.error)throw result.error;if(result.status!==0)throw Error('Firebase deployment did not succeed. Authenticate with npx firebase-tools login, then rerun.');
if(args.includes('--publish')){
  let verified=false;
  for(let attempt=0;attempt<5&&!verified;attempt+=1){
    if(attempt)await new Promise(resolve=>setTimeout(resolve,1000));
    const check=await fetch(origin+'/design-gallery-release.json?verify='+Date.now());
    verified=check.ok&&(await check.json()).release===manifest.release;
  }
  if(!verified)throw Error('CLI completed but the live gallery release could not be verified.');
  console.log('Verified live: '+origin+'/ Original + Prism + Navy & Cream + Aurora.');
}else console.log('Preview deployed. It reads REAL Firebase records; use read-only review for production data.');
