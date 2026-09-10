/** Use from an environment already authorized for this Firebase project.
 * Default is build only. Neither tests nor CI call --publish. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options=process.argv.slice(2);
for(const flag of options)if(!['--publish','--disable-prism'].includes(flag))throw Error('Unknown release flag: '+flag);
execFileSync(process.execPath,[path.join(root,'live-design/build.mjs'),...options.filter(x=>x==='--disable-prism')],{stdio:'inherit'});
for(const file of ['app.js','song-app.js','sw.js','design-choice.js'])execFileSync(process.execPath,['--check',path.join(root,'.hosting-live',file)],{stdio:'inherit'});
if(!options.includes('--publish')){
 console.log('Build only. Nothing deployed. To publish the opt-in version: node live-design/release.mjs --publish');
}else{
 console.log('Publishing hosting only to lv-zion-duties. Shared database, rules and functions are not deployed.');
 execFileSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','firebase-tools@latest','deploy','--only','hosting','--project','lv-zion-duties'],{cwd:path.join(root,'.hosting-live'),stdio:'inherit'});
 console.log('Hosting release completed. Current design remains the default; Prism is opt-in.');
}
