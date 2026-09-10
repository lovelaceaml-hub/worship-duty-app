/** Assemble an alternate design; neither Aurora nor production sources change. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
await import('../prototype/build.mjs');
const base=await fs.readFile(path.join(here,'../prototype/dist/index.html'),'utf8');
const [shell,css,adapter]=await Promise.all(['shell.html','prism.css','prism.js'].map(f=>fs.readFile(path.join(here,f),'utf8')));
const replaceOnce=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Prism adapter source drift: '+a.slice(0,70));return s.replace(a,b);};
const style=base.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if(!style)throw Error('Missing base styles');
let scripts=base.slice(base.indexOf('<script>'),base.lastIndexOf('</body>'));
scripts=replaceOnce(scripts,"const prefix = 'lv-aurora-preview-v1:';","const prefix = 'lv-prism-preview-v1:';");
scripts=replaceOnce(scripts,'\ninit();','\n'+adapter+'\ninit();');
// Same song builder/handlers and DOM targets, arranged as a two-pane studio.
scripts=replaceOnce(scripts,"return renderBuilder() +\n    '<div class=\"lib-controls\">'", "return '<div class=\"prism-song-layout\"><aside class=\"prism-set-panel\" aria-label=\"Your setlist\">' + renderBuilder() + '</aside><section class=\"prism-catalog\" aria-label=\"Song catalog\">' +\n    '<div class=\"lib-controls\">'");
scripts=replaceOnce(scripts,'renderLibMore(pages);\n}\nfunction renderSongRow','renderLibMore(pages) + \'</section></div>\';\n}\nfunction renderSongRow');
const result=shell.replace('<!-- STYLES -->','<style>\n'+style+'\n'+css+'\n</style>').replace('<!-- RUNTIME -->',scripts);
await fs.mkdir(path.join(here,'dist'),{recursive:true});
await fs.writeFile(path.join(here,'dist/index.html'),result);
console.log('Built prototype-prism/dist/index.html — isolated offline preview.');
