import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {manifest,root,dest,hash} from './build.mjs';
import {applyStagedAppFixes} from './app-fixes.mjs';

await applyStagedAppFixes(dest);

const args=process.argv.slice(2),allowed=new Set(['--publish','--preview']);
if(args.some(a=>!allowed.has(a))||args.length>1)throw Error('Use no argument to build, --preview for a temporary Firebase channel, or --publish for the existing live site.');
if(!args.length){console.log('Built with choir date/service sync fix. Not deployed. Re-run with --preview or --publish from an authenticated Firebase environment.');process.exit(0);}
const origin='https://lv-zion-duties.web.app';
async function compatibleLive(){
  const live=await (await fetch(origin+'/?gallery-check='+Date.now(),{signal:AbortSignal.timeout(20000)})).text();
  const src=live.match(/<script[^>]+src=["']([^"']*app\.js[^"']*)["']/)?.[1];
  if(!src)throw Error('Cannot identify the deployed app. Nothing deployed.');
  const current=await (await fetch(new URL(src,origin),{signal:AbortSignal.timeout(20000)})).text();
  const normalized=current.replace(/\?v=[A-Za-z0-9]+/g,'?v=DEV');
  if(hash(normalized)===manifest.upstream.app)return {kind:'original'};
  for(const [file,kind] of [['design-gallery-release.json','gallery'],['release-manifest.json','prism'],['navy-release.json','navy']]){
    try{
      const r=await fetch(origin+'/'+file+'?gallery-check='+Date.now(),{signal:AbortSignal.timeout(12000)});if(!r.ok)continue;
      const info=await r.json();if(info?.upstream?.app===manifest.upstream.app)return {kind,info};
    }catch{}
  }
  throw Error('The live app differs from Original/Prism/Navy/Gallery built from the reviewed base. Stop and reconcile before publishing.');
}
if(args.includes('--publish')){const c=await compatibleLive();console.log('Compatible current live release:',c.kind);}
const command=process.platform==='win32'?'npx.cmd':'npx';
const firebase=['--yes','firebase-tools'];
const releaseArgs=args.includes('--publish')?['deploy','--only','hosting']:['hosting:channel:deploy','design-gallery-review','--expires','7d'];
console.log('Deploying hosting assets only. No functions, security rules, account settings or schedule records are deployed.');
const result=spawnSync(command,[...firebase,...releaseArgs,'--config',path.join(dest,'firebase.gallery.json'),'--project','lv-zion-duties'],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;if(result.status!==0)throw Error('Firebase deployment did not succeed. Authenticate with npx firebase-tools login, then rerun.');
if(args.includes('--publish')){
  const check=await fetch(origin+'/design-gallery-release.json?verify='+Date.now());
  if(!check.ok||(await check.json()).release!==manifest.release)throw Error('CLI completed but the live gallery release could not be verified.');
  console.log('Verified live: '+origin+'/ — Original + Prism + Navy & Cream + Aurora.');
}else console.log('Preview deployed. It reads REAL Firebase records; use read-only review for production data.');
