/* Manage, Data and Features: app/settings (the switches, links and notes
   every member's app follows), a backup file of the shared schedule,
   bringing the Google Sheet in now instead of waiting for the next import,
   checking the Sheet the app writes to, adding a year of regular services
   and fixing a member's name. */
import { fb, call, write, problem } from '../firebase.js';
import { plural } from '../html.js';
import { data, onMemberChange } from '../store.js';
import { todayISO } from '../lib/dates.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';

export function downloadBackup() {
  const backup = {
    savedAt: new Date().toISOString(),
    members: data.members,
    services: data.services,
    settings: Object.assign({}, data.settings, { sitePinHash: undefined, pinHash: undefined }),
    departments: data.rosters,
    requests: data.requests
  };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  link.download = 'worship-schedule-backup-' + todayISO() + '.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

/* Change fields of app/settings. They show at once (`optimistic`), or only
   once saved; a save that fails puts the old values back. Resolves to
   whether it was saved. */
export async function saveSettings(fields, done, { optimistic = true } = {}) {
  const before = {};
  Object.keys(fields).forEach(key => { before[key] = data.settings[key]; });
  if (optimistic) { Object.assign(data.settings, fields); renderSoon(); }
  try {
    await write(() => fb.setDoc(fb.doc(fb.db, 'app', 'settings'), fields, { merge: true }));
    Object.assign(data.settings, fields);
    if (done) notice(done);
    return true;
  } catch (error) {
    Object.assign(data.settings, before);
    notice('That was not saved: ' + problem(error), true);
    return false;
  } finally {
    renderSoon();
  }
}

/* The Sheet tools' state; `check` is the last "Check the Sheet" result. */
export const sheet = { busy: false, checking: false, check: null, addingYear: false, renaming: false };
// A Sheet check is the member's who ran it; it is not shown to the next member.
onMemberChange(() => { sheet.check = null; });

/* When the app last brought in the Sheet, by the timed check or Import now
   (the server keeps it in app/settings). */
export function lastSheetImport() { return data.settings.sheetImport || null; }

/* Fix a member's name everywhere (functions renameMember). */
export async function renameMember(from, to) {
  sheet.renaming = true;
  renderSoon();
  try {
    const result = await call('renameMember', { from, to });
    notice((result.merged ? from + ' and ' + to + ' are now one member, ' + to : from + ' is now ' + to + ' everywhere') + ' (' + plural(result.services || 0, 'service') + ' updated).');
    sheet.renaming = false;
    renderSoon();
    return true;
  } catch (error) {
    notice('The name was not changed: ' + problem(error), true);
    sheet.renaming = false;
    renderSoon();
    return false;
  }
}

/* The server reads the Sheet and merges it into the schedule, the same way
   its check every 10 minutes does, even when the Sheet looks unchanged. */
export async function importSheetNow() {
  sheet.busy = true;
  renderSoon();
  try {
    const result = await call('syncSheetNow', {});
    const changes = [];
    if (result.added) changes.push(plural(result.added, 'service') + ' added');
    if (result.updated) changes.push(plural(result.updated, 'service') + ' updated');
    if (result.newMembers) changes.push(plural(result.newMembers, 'new member'));
    // Services still waiting to be written to the Sheet keep the app's duties.
    const waiting = result.waiting ? ' ' + plural(result.waiting, 'service was', 'services were') + ' left as they are, because their changes are still on the way to the Sheet.' : '';
    if (result.failed) notice('Part of the import was not saved (' + plural(result.failed, 'change') + '). Import again.' + waiting, true);
    else notice((changes.length ? 'Imported from the Sheet: ' + changes.join(', ') + '.' : 'The schedule already matches the Sheet.') + waiting);
  } catch (error) {
    notice('The sheet was not imported: ' + problem(error), true);
  }
  sheet.busy = false;
  renderSoon();
}

/* Reads the Sheet's Entry grid and compares it with the app. Changes nothing. */
export async function checkSheet() {
  sheet.checking = true;
  sheet.check = null;
  renderSoon();
  try {
    sheet.check = await call('checkSheet', {});
  } catch (error) {
    sheet.check = { error: problem(error) };
  }
  sheet.checking = false;
  renderSoon();
}

/* Every Saturday and Tuesday service from December 1 of `year` through the
   next December. Services already there are kept. */
export async function addServiceYear(year) {
  sheet.addingYear = true;
  renderSoon();
  try {
    const result = await call('addServiceYear', { year });
    notice((result.added ? 'Added ' + plural(result.added, 'service') + (result.sheetRows ? ', and ' + plural(result.sheetRows, 'row') + ' in the Sheet' : '') + '.'
      : 'Every regular service from December ' + year + ' through December ' + (year + 1) + ' was already there.') +
      (result.sheetProblem ? ' Their rows were not added to the Sheet: ' + result.sheetProblem : ''), !!result.sheetProblem);
  } catch (error) {
    notice('The services were not added: ' + problem(error), true);
  }
  sheet.addingYear = false;
  renderSoon();
}
