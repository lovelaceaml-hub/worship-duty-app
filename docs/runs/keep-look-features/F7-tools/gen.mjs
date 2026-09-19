// Builds run.mjs from the setup half of design-gallery/test.mjs plus the F7 scenario.
import fs from 'node:fs/promises';
const root='/Users/anthony/Projects/worship-duty-app-worktrees/f7-account-menu';
const t=await fs.readFile(root+'/design-gallery/test.mjs','utf8');
let slice=t.slice(t.indexOf("const TEST_PIN"),t.indexOf("const domainWrites"));
slice=slice.replace("localStorage.setItem('UNRELATED', 'keep');","localStorage.setItem('UNRELATED', 'keep');if(modeValue)localStorage.setItem('wds-design-gallery-v1',JSON.stringify({mode:modeValue,seen:true,version:2}));");
slice=slice.replace("({fixtureValue, records, memberValue}) =>","({fixtureValue, records, memberValue, modeValue}) =>").replace("memberValue: member});","memberValue: member, modeValue: globalThis.__mode||''});");
slice=slice.replace("viewport: {width: 390, height: 850},","viewport: {width: 375, height: 812}, colorScheme: globalThis.__scheme||'light',");
const head=`import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const {chromium}=createRequire('/Users/anthony/Projects/season-map/')('playwright');
const root='${root}';const stage=path.join(root,'.hosting-gallery');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
`;
const scenario=await fs.readFile(new URL((process.env.SCN||'./scenario.mjs'),import.meta.url),'utf8');
await fs.writeFile(new URL('./run.mjs',import.meta.url),head+slice+scenario);
