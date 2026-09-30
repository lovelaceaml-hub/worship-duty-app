/* Manage, Data: a backup file of the shared schedule, and bringing the
   Google Sheet in now instead of waiting for the next import. */
import { call, problem } from '../firebase.js';
import { plural } from '../html.js';
import { data, readJSON, writeJSON } from '../store.js';
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

export const sheet = { busy: false };

export function lastSheetImport() { return readJSON('wds-sheet-import', null); }

/* The server fetches the published sheet and merges it into the schedule,
   the same way its import does every 2 hours. */
export async function importSheetNow() {
  sheet.busy = true;
  renderSoon();
  try {
    const result = await call('syncSheetNow', {});
    writeJSON('wds-sheet-import', Object.assign({ at: Date.now() }, result));
    const changes = [];
    if (result.added) changes.push(plural(result.added, 'service') + ' added');
    if (result.updated) changes.push(plural(result.updated, 'service') + ' updated');
    if (result.newMembers) changes.push(plural(result.newMembers, 'new member'));
    notice(changes.length ? 'Imported from the sheet: ' + changes.join(', ') + '.' : 'The schedule already matches the sheet.');
  } catch (error) {
    notice('The sheet was not imported: ' + problem(error), true);
  }
  sheet.busy = false;
  renderSoon();
}
