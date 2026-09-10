import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const dir = path.join(root, 'navy-live');
export const out = path.join(dir, 'dist');
export const read = p => fs.readFile(path.join(root,p),'utf8');
export const blobHash = s => createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0`).update(s).digest('hex');
const replaceOnce=(s,a,b)=>{if(s.split(a).length!==2)throw Error(`Upstream changed; review anchor: ${a}`);return s.replace(a,b);};
export async function build() {
  const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
  const index=await read('index.html'), app=await read('app.js');
  const expected={index:'1687f5387c660dc0d5e9e0f0a2913c5c837c3b0f',app:'e2ae10667f9093863162f9174bf469ce2dc47a3f'};
  if(blobHash(index)!==expected.index || blobHash(app)!==expected.app)throw Error('The reviewed app source changed. Rebase and review the presentation bridge before building.');
  await fs.rm(out,{recursive:true,force:true});
  await fs.mkdir(out,{recursive:true});
  // Fixed allowlist: no fixtures, test output, secrets, docs or prototype builds can be deployed.
  const assets=['seed-data.js','firebase-config.js','song-app.js','song-app.css','song-seed.js','song-lib.js','manifest.json','icon.svg'];
  for(const name of assets)await fs.copyFile(path.join(root,name),path.join(out,name));
  for(const [source,target] of [['choice.js','navy-choice.js'],['choice.css','navy-choice.css'],['theme.css','navy-theme.css']])await fs.copyFile(path.join(dir,source),path.join(out,target));
  const shell=replaceOnce(index,'</head>',`<link rel="stylesheet" href="navy-choice.css?v=${stamp}">\n<link rel="stylesheet" id="navy-theme-css" href="navy-theme.css?v=${stamp}" media="not all">\n<script src="navy-choice.js?v=${stamp}"></script>\n</head>`).replaceAll('?v=DEV','?v='+stamp);
  let bridge=await read('navy-live/bridge.js');
  let built=replaceOnce(app,'\ninit();','\n'+bridge+'\ninit();').replaceAll('?v=DEV','?v='+stamp);
  await fs.writeFile(path.join(out,'index.html'),shell);
  await fs.writeFile(path.join(out,'app.js'),built);
  const sw=replaceOnce(await read('sw.js'),"const RELEASE = 'DEV';",`const RELEASE = '${stamp}';`);
  await fs.writeFile(path.join(out,'sw.js'),sw);
  const baseConfig=JSON.parse(await read('firebase.json'));
  if(baseConfig.hosting?.site!=='lv-zion-duties')throw Error('Unexpected hosting target.');
  const hosting={...baseConfig.hosting,public:'dist',ignore:['**/.*'],headers:[...baseConfig.hosting.headers,{source:'navy-*.{js,css}',headers:[{key:'Cache-Control',value:'no-cache'}]},{source:'navy-release.json',headers:[{key:'Cache-Control',value:'no-cache'}]}]};
  await fs.writeFile(path.join(dir,'firebase.release.json'),JSON.stringify({hosting},null,2)+'\n');
  const manifest={design:'navy-cream-opt-in',release:stamp,upstream:expected,project:'lv-zion-duties',defaultDesign:'original',productionData:true,fixtureData:false,hostingOnly:true};
  await fs.writeFile(path.join(out,'navy-release.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Built ${out}\nRelease ${stamp}: original + optional Navy & Cream. Firebase configuration and original handlers preserved.`);
  return manifest;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
