import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, root, dir, read, blobHash } from './build.mjs';
const args=process.argv.slice(2), allowed=new Set(['--publish','--preview']);
if(args.some(a=>!allowed.has(a)) || args.length>1)throw Error('Use no arguments to build, --preview for a temporary Firebase channel, or --publish for the existing live site.');
const manifest=await build();
if(!args.length){console.log('Not deployed. Run this script with --preview or --publish from an authenticated Firebase environment.');process.exit(0);}
// Do not overwrite an unrelated release from another branch, including the separate Prism design.
if(args.includes('--publish')) {
  const origin='https://lv-zion-duties.web.app';
  const live=await (await fetch(origin+'/?release-check='+Date.now(),{signal:AbortSignal.timeout(20000)})).text();
  const src=live.match(/<script[^>]+src=["']([^"']*app\.js[^"']*)["']/)?.[1];
  if(!src)throw Error('Cannot identify the deployed app. Nothing deployed.');
  const current=await (await fetch(new URL(src,origin),{signal:AbortSignal.timeout(20000)})).text();
  const normalized=current.replace(/\?v=[A-Za-z0-9]+/g,'?v=DEV');
  let compatible=blobHash(normalized)===manifest.upstream.app;
  if(!compatible && current.includes('const navyOriginalRender = render;')) {
    const prior=await fetch(origin+'/navy-release.json?check='+Date.now(),{signal:AbortSignal.timeout(15000)});
    if(prior.ok){const info=await prior.json();compatible=info.design===manifest.design && info.upstream?.app===manifest.upstream.app;}
  }
  if(!compatible)throw Error('The live app differs from the reviewed base. Stop and reconcile the other release before publishing.');
}
const command=process.platform==='win32'?'npx.cmd':'npx';
const firebase=['--yes','firebase-tools'];
const releaseArgs=args.includes('--publish')?['deploy','--only','hosting']:['hosting:channel:deploy','navy-cream-review','--expires','7d'];
console.log('Deploying hosting assets only. No functions, security rules, account settings or schedule records are deployed.');
const result=spawnSync(command,[...firebase,...releaseArgs,'--config',path.join(dir,'firebase.release.json'),'--project','lv-zion-duties'],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)throw Error('Firebase deployment did not succeed. Authenticate with npx firebase-tools login, then rerun.');
if(args.includes('--publish')){
 const check=await fetch('https://lv-zion-duties.web.app/navy-release.json?verify='+Date.now());
 if(!check.ok || (await check.json()).release!==manifest.release)throw Error('CLI completed but the live release could not be verified. Check Firebase before retrying.');
 console.log('Verified live: https://lv-zion-duties.web.app/ — original default, optional Navy & Cream.');
} else console.log('Preview deployed. Its Firebase data is REAL; use read-only review or a separate test project for edit testing.');
