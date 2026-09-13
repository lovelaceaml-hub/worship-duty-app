/** Assemble an alternate design; neither Aurora nor production sources change. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
await import('../prototype/build.mjs');
const base=await fs.readFile(path.join(here,'../prototype/dist/index.html'),'utf8');
const [shell,css,adapter,safety,pagesCSS,pagesJS,songPages]=await Promise.all(['shell.html','prism.css','prism.js','safety.css','all-pages.css','all-pages.js','song-pages.js'].map(f=>fs.readFile(path.join(here,f),'utf8')));
const replaceOnce=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Prism adapter source drift: '+a.slice(0,70));return s.replace(a,b);};
const style=base.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if(!style)throw Error('Missing base styles');
let scripts=base.slice(base.indexOf('<script>'),base.lastIndexOf('</body>'));
scripts=replaceOnce(scripts,"const prefix = 'lv-aurora-preview-v1:';","const prefix = 'lv-prism-preview-v1:';");
scripts=replaceOnce(scripts,'\ninit();','\n'+adapter+'\n'+pagesJS+'\ninit();');
// Same song builder/handlers and DOM targets, arranged as a two-pane studio.
scripts=replaceOnce(scripts,"return renderBuilder() +\n    '<div class=\"lib-controls\">'", "return '<div class=\"prism-song-layout\"><aside class=\"prism-set-panel\" aria-label=\"Your setlist\">' + renderBuilder() + '</aside><section class=\"prism-catalog\" aria-label=\"Song catalog\">' +\n    '<div class=\"lib-controls\">'");
scripts=replaceOnce(scripts,'renderLibMore(pages);\n}\nfunction renderSongRow','renderLibMore(pages) + \'</section></div>\';\n}\nfunction renderSongRow');
scripts=replaceOnce(scripts,'window.AuroraSongModule={mount};',songPages+'\nwindow.AuroraSongModule={mount};');
// Async themed confirmations preserve original authorization and mutations.
// Only handleAct functions become async; permission checks still execute first.
if(scripts.split('function handleAct(act, el) {').length!==3)throw Error('Prism handler source drift');
scripts=scripts.replaceAll('function handleAct(act, el) {','async function handleAct(act, el) {');
for(const [needle,replacement] of [
  ["if (svc && confirm('Delete \"'","if (svc && await window.PrismUI.confirm('Delete \"'"],
  ["if (confirm(question))","if (await window.PrismUI.confirm(question))"],
  ["if (confirm('Replace ALL current data","if (await window.PrismUI.confirm('Replace ALL current data"],
  ["if (!confirm('Merge leftover name variants","if (!await window.PrismUI.confirm('Merge leftover name variants"]
])scripts=replaceOnce(scripts,needle,replacement);
if(scripts.split('requireEditor(() => { if (confirm(').length!==6)throw Error('Prism song confirmations drift');
scripts=scripts.replaceAll('requireEditor(() => { if (confirm(', 'requireEditor(async () => { if (await window.PrismUI.confirm(');
const result=shell.replace('<!-- STYLES -->','<style>\n'+style+'\n'+css+'\n'+pagesCSS+'\n'+safety+'\n</style>').replace('<!-- RUNTIME -->',scripts);
await fs.mkdir(path.join(here,'dist'),{recursive:true});
await fs.writeFile(path.join(here,'dist/index.html'),result);
console.log('Built prototype-prism/dist/index.html — isolated offline preview.');
