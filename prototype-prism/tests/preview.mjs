/** Run the existing real-runtime regression suite against Prism, with additional
 * calendar, studio layout, mobile navigation and cross-design isolation checks.
 * The shared suite and both designs' source files remain unchanged. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
let suite=await fs.readFile(path.join(root,'prototype/tests/preview.mjs'),'utf8');
const once=(a,b)=>{if(suite.split(a).length!==2)throw Error('Shared QA drift: '+a);suite=suite.replace(a,b);};
suite=suite.replaceAll('prototype/build.mjs','prototype-prism/build.mjs').replaceAll('prototype/dist/index.html','prototype-prism/dist/index.html').replaceAll("'preview-artifacts'","'prism-preview-artifacts'").replaceAll('LV_Zion_Aurora_Prototype.html','LV_Zion_Prism_Prototype.html');
once("'song-lib.js','song-seed.js'];","'song-lib.js','song-seed.js','prototype/build.mjs','prototype/shell.html','prototype/aurora.css','prototype/aurora.js','prototype/tests/preview.mjs'];");
once("check('Empty past month recoverable',await page.locator('[data-aurora=\"reference-month\"]').count(),1);", "check('Empty past month recoverable',await page.locator('[data-aurora=\"reference-month\"]').count()>0);");
once("check('Past reference services available',await page.locator('.date-tile').count()>0);", "check('Past reference services available',await page.locator('.month-cell.has-services').count()>0);");
once("await shot('01-schedule-desktop');", `
 check('Prism uses its own storage namespace',await page.evaluate(()=>Prism.prefix),'lv-prism-preview-v1:');
 await page.evaluate(()=>window.localStorage.setItem('lv-aurora-preview-v1:wds-me','AURORA-SENTINEL'));
 check('Five correctly aligned July weeks',await page.locator('.month-cell').count(),35);
 check('First July date lands on Wednesday',await page.locator('.month-cell').nth(3).getAttribute('data-date'),'2026-07-01');
 await page.locator('[data-prism="date"][data-date="2026-07-02"]').click();
 check('An empty date remains selected',await page.evaluate(()=>Prism.inspect().selection.day),'2026-07-02');
 check('Empty date is not a fabricated service',await page.locator('.prism-inspector').innerText().then(s=>s.includes('No services')));
 await page.locator('[data-prism="date"][data-date="2026-07-31"]').focus();
 await page.keyboard.press('ArrowRight');
 check('Keyboard date navigation crosses month',await page.evaluate(()=>Prism.inspect().selection.day),'2026-08-01');
 check('Keyboard focus follows date',await page.evaluate(()=>document.activeElement.dataset.date),'2026-08-01');
 await page.locator('[data-aurora="reference-month"]').first().click();
 check('Reference month recovers first service',await page.evaluate(()=>Prism.inspect().selection.day),'2026-07-04');
 await page.evaluate(()=>scrollTo(0,0));await shot('01-schedule-desktop');
`);
once("await shot('02-presider-library-desktop');", `
 await page.evaluate(()=>scrollTo(0,0));
 const studio=await page.locator('.prism-song-layout').evaluate(el=>({catalog:el.querySelector('.prism-catalog').getBoundingClientRect().x,setlist:el.querySelector('.prism-set-panel').getBoundingClientRect().x}));
 check('Desktop catalog and setlist are side by side',studio.catalog<studio.setlist);
 await shot('02-presider-library-desktop');
`);
once("if(width===390)await shot(`mobile-${screen}`);", `if(width===390){
   check('Compact bottom navigation: '+screen,await page.locator('nav.tabs').evaluate(el=>el.getBoundingClientRect().height<100));
   check('Bottom navigation stays at viewport edge: '+screen,await page.locator('nav.tabs').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight)<2));
   await shot('mobile-'+screen);
  }`);
once("check('Zero external network requests',report.externalRequests,[]);", "check('Reset preserves Aurora edits',await page.evaluate(()=>window.localStorage.getItem('lv-aurora-preview-v1:wds-me')),'AURORA-SENTINEL');\n check('Zero external network requests',report.externalRequests,[]);");
const generated=path.join(here,'.prism-generated-test.mjs');
try{await fs.writeFile(generated,suite);await import(generated);}finally{await fs.rm(generated,{force:true});}
