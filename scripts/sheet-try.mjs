/* Tries the app's Sheet writing on a COPY of the duty Sheet, with your own
   Google login, so you can look at the result before the app writes to the
   real Sheet. It never touches the app's data.
     1. In Google Sheets: File, Make a copy (keep the name "Copy of ...").
     2. Once: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/cloud-platform
     3. node scripts/sheet-try.mjs "<the copy's address>"
   It reads the Entry tabs, fills in one empty duty and empties it again,
   adds a made-up service and removes it, and adds next year's regular
   services (a new "<year> Entry" tab). Then open the copy and look. */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSheets, sheetIdFrom } = require('../functions/sheets.js');
const sync = require('../functions/sheet-sync.js');
const { serviceYear } = require('../functions/service-year.js');

const id = sheetIdFrom(process.argv[2]);
if (!id) { console.error('Give the address of a copy of the duty Sheet.'); process.exit(1); }
const sheets = createSheets(id);
const title = await sheets.title();
if (!/^Copy of /i.test(title)) {
  console.error('"' + title + '" does not look like a copy (its name should start with "Copy of"). Nothing was changed.');
  process.exit(1);
}
console.log('Working on "' + title + '".');

const read = await sync.readServices(sheets, {});
console.log('1. Read ' + read.services.length + ' services from ' + read.tabs.join(', ') + (read.warnings.length ? ' (' + read.warnings.length + ' warnings: ' + read.warnings.slice(0, 3).join(' ') + ')' : '') + '.');

const today = new Date().toISOString().slice(0, 10);
const target = read.services.find(service => service.date >= today && !service.assignments['Usher Back']);
if (target) {
  const filled = Object.assign({}, target, { assignments: Object.assign({}, target.assignments, { 'Usher Back': 'S. Test' }) });
  console.log('2. ' + target.date + ' ' + target.service + ', Usher Back: ' + await sync.writeService(sheets, target, filled) + ', then emptied again: ' + await sync.writeService(sheets, filled, target) + '.');
} else console.log('2. No upcoming service with an empty Usher Back; skipped.');

const madeUp = { date: today.slice(0, 7) + '-28', service: 'Commemoration', worship: 'Test service', choirSong: '', assignments: { Presider: 'B. Test' } };
console.log('3. A made-up ' + madeUp.date + ' service: ' + await sync.writeService(sheets, null, madeUp) + ', then ' + await sync.writeService(sheets, madeUp, null) + '.');

const year = Number(today.slice(0, 4));
const added = await sync.addServices(sheets, serviceYear(year));
console.log('4. December ' + year + ' through December ' + (year + 1) + ': ' + added + ' service rows added.');
console.log('Now open the copy: check the December rows in "' + year + ' Entry", the new "' + (year + 1) + ' Entry" tab (look, month banners, dropdowns), and that nothing else changed.');
