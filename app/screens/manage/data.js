/* Manage, Data: the Google Sheet (importing it, and the app writing its
   duty changes into it), a year of regular services, and a backup file.
   Department leaders see only Import now and Check the Sheet. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, feature, nameOf } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { isAdmin, canManageAnyDepartment } from '../../services/access.js';
import { downloadBackup, importSheetNow, lastSheetImport, sheet, checkSheet, addServiceYear, renameMember, saveSettings } from '../../services/data-tools.js';
import { todayISO, shortStamp } from '../../lib/dates.js';
import { dutyName } from '../../config/duties.js';

const when = at => shortStamp(at, { time: true });
// Import now and Check the Sheet: administrators and department leaders.
const canUseSheet = () => isAdmin() || canManageAnyDepartment();

/* When the app last brought in the Sheet, and what it changed. */
function lastImportLine() {
  const last = lastSheetImport();
  if (!last || !last.at) return '';
  const changes = [plural(last.added || 0, 'service') + ' added', (last.updated || 0) + ' updated'];
  if (last.skipped) changes.push(plural(last.skipped, 'row') + ' skipped');
  // Many filled duties blank in the Sheet at once are not cleared by the
  // timed import; Import now clears them.
  const held = last.held ? ' ' + plural(last.held, 'filled duty', 'filled duties') + ' are blank in the Sheet and were kept. Press Import now to clear them.' : '';
  return 'Last import: ' + when(last.at) + ', ' + changes.join(', ') + '.' + held;
}

const importButton = () => html`<button type="button" class="primary" data-act="sheet-import"${sheet.busy || !feature('sheetSync') ? ' disabled' : ''}>${sheet.busy ? 'Importing…' : 'Import now'}</button>`;

/* The top of Manage: the last import and Import now, outside Manage, Data. */
export function sheetBar() {
  if (!canUseSheet() || !feature('sheetSync')) return '';
  const line = lastImportLine();
  return html`<section class="card sheet-bar">
    <p class="hint small">Google Sheet: ${line || 'checked every 10 minutes.'}</p>
    ${importButton()}
  </section>`;
}

function importCard() {
  const line = lastImportLine();
  const fromGrid = feature('sheetWrite') && data.settings.sheetId;
  return html`<section class="card">
    <h3 class="card-subtitle">Google Sheet import</h3>
    <p class="hint">${!feature('sheetSync') ? 'The Google Sheet import is turned off in Features.'
      : fromGrid ? 'Every 10 minutes the app checks the Sheet\'s Entry grid and brings in any changes, this month onward. A blank cell in the Sheet does not clear a duty; clear it here instead.'
        : 'Every 10 minutes the app checks the published Sheet and brings in any changes, this month onward. Duties the Sheet leaves out, and services added here, stay as they are.'}</p>
    ${line ? html`<p class="hint small">${line}</p>` : ''}
    ${importButton()}
    ${fromGrid || !isAdmin() ? '' : html`<label class="field"><span>Published sheet link (File, Share, Publish to web, CSV)</span>
      <input type="url" data-change="sheet-url" value="${data.settings.sheetUrl || ''}" placeholder="Paste the published CSV link"></label>`}
  </section>`;
}

function checkResult() {
  const check = sheet.check;
  if (!check) return '';
  if (check.error) return html`<p class="form-error" role="alert">${check.error}</p>`;
  return html`<div class="sheet-check">
    <p>Read ${plural(check.services, 'service')} from ${check.tabs.join(', ')}.
      ${check.notInApp ? plural(check.notInApp, 'of them is', 'of them are') + ' not in the app yet (the next import adds them). ' : ''}
      ${check.notInSheet ? plural(check.notInSheet, 'upcoming service in the app is', 'upcoming services in the app are') + ' not in the Sheet.' : ''}</p>
    ${check.differenceCount ? html`<p>${plural(check.differenceCount, 'duty differs', 'duties differ')} between the Sheet and the app${check.differenceCount > check.differences.length ? ', for example' : ''}:</p>
      <ul class="plain-list">${check.differences.map(item => html`<li>${item.service} · ${dutyName(item.duty)}: Sheet ${item.sheet ? nameOf(item.sheet) : 'blank'}, app ${item.app ? nameOf(item.app) : 'blank'}</li>`)}</ul>`
      : html`<p>Every duty the Sheet lists matches the app.</p>`}
    ${check.warnings.length ? html`<p class="hint small">${check.warnings.join(' ')}</p>` : ''}
    ${check.account ? html`<p class="hint small">The app reaches the Sheet as ${check.account}.</p>` : ''}
  </div>`;
}

/* A leader's view of the Sheet: check it against the app. */
function leaderCheckCard() {
  return html`<section class="card">
    <h3 class="card-subtitle">Check the Sheet</h3>
    <p class="hint">Reads the Sheet and compares it with the app. It changes nothing.</p>
    <button type="button" class="ghost" data-act="sheet-check"${sheet.checking || !data.settings.sheetId ? ' disabled' : ''}>${sheet.checking ? 'Checking…' : 'Check the Sheet'}</button>
    ${data.settings.sheetId ? '' : html`<p class="hint small">An administrator adds the Sheet's link first.</p>`}
    ${checkResult()}
  </section>`;
}

function writeCard() {
  const status = data.settings.sheetStatus;
  const link = data.settings.sheetId ? 'https://docs.google.com/spreadsheets/d/' + data.settings.sheetId + '/edit' : '';
  return html`<section class="card">
    <h3 class="card-subtitle">Writing to the Sheet</h3>
    <p class="hint">${feature('sheetWrite')
      ? 'Duty changes made in the app go into the Sheet\'s Entry grid within seconds, and new services get a row.'
      : 'Off in Features: the app only reads the Sheet. Paste the Sheet\'s link and check it before you turn it on.'}</p>
    <label class="field"><span>The Sheet's link (its address while you edit it)</span>
      <input type="url" data-change="sheet-edit-link" value="${link}" placeholder="Paste the Sheet's address"></label>
    ${status && status.ok === false ? html`<p class="card-note is-warning">The last change did not reach the Sheet (${when(status.at)}): ${status.message}</p>` : ''}
    <button type="button" class="ghost" data-act="sheet-check"${sheet.checking || !data.settings.sheetId ? ' disabled' : ''}>${sheet.checking ? 'Checking…' : 'Check the Sheet'}</button>
    <p class="hint small">Checking reads the Sheet and compares it with the app. It changes nothing.</p>
    ${checkResult()}
  </section>`;
}

function yearCard() {
  const year = Number(todayISO().slice(0, 4));
  return html`<section class="card">
    <h3 class="card-subtitle">A year of services</h3>
    <p class="hint">Adds every Saturday service (Morning, Afternoon, Evening) and every Tuesday evening from December 1 through the next December${feature('sheetWrite') ? ', with a row for each in the Sheet' : ''}. Services already there are kept. This runs by itself every November 1; then add that year's feast services by hand.</p>
    <form class="inline-form" data-act="year-add">
      <select name="year" aria-label="Year">${[year, year + 1].map(value => html`<option value="${value}">December ${value} to December ${value + 1}</option>`)}</select>
      <button type="submit" class="ghost"${sheet.addingYear ? ' disabled' : ''}>${sheet.addingYear ? 'Adding…' : 'Add the services'}</button>
    </form>
  </section>`;
}

/* Names written without a title, such as "Bridgette", come first. */
const untitled = name => !/^[A-Za-z][.,]\s*\S/.test(name) && !/^[A-Za-z]\s+\S/.test(name);

function renameCard() {
  const names = data.members.slice().sort((a, b) => (untitled(b) - untitled(a)) || a.localeCompare(b));
  const missing = names.filter(untitled);
  return html`<section class="card">
    <h3 class="card-subtitle">Fix a member's name</h3>
    <p class="hint">Changes the name everywhere: the member list, every service, departments, song lists and requests. The member keeps their sign-in and PIN, and no one gets a duty alert. If the correct name is already a member, the two become one.
      ${missing.length ? html` ${plural(missing.length, 'name has', 'names have')} no title (B., S., D., M., E., P.) and ${missing.length === 1 ? 'is' : 'are'} listed first.` : ''}</p>
    <form class="inline-form" data-act="member-rename">
      <select name="from" aria-label="Current name" required><option value="">Current name</option>
        ${names.map(name => html`<option value="${name}">${name}${untitled(name) ? ' (no title)' : ''}</option>`)}</select>
      <input type="text" name="to" maxlength="80" placeholder="Correct name, e.g. S. Bridgette" aria-label="Correct name" required>
      <button type="submit" class="primary"${sheet.renaming ? ' disabled' : ''}>${sheet.renaming ? 'Saving…' : 'Fix name'}</button>
    </form>
  </section>`;
}

export function render() {
  if (!isAdmin()) return html`
    ${importCard()}
    ${leaderCheckCard()}`;
  return html`
    ${renameCard()}
    ${importCard()}
    ${writeCard()}
    ${yearCard()}
    <section class="card">
      <h3 class="card-subtitle">Backup</h3>
      <p class="hint">Download the whole schedule as a file to keep somewhere safe.</p>
      <button type="button" class="ghost" data-act="backup-download">Download backup</button>
    </section>`;
}

defineActions({
  'member-rename': {
    allowed: () => isAdmin(),
    run: async form => {
      const values = new FormData(form);
      const from = String(values.get('from') || '');
      const to = String(values.get('to') || '').trim().replace(/\s+/g, ' ');
      if (!from || !to) return;
      const merge = data.members.includes(to);
      if (!confirm(merge ? '"' + to + '" is already a member. Make "' + from + '" and "' + to + '" one member, named "' + to + '"?'
        : 'Change "' + from + '" to "' + to + '" everywhere?')) return;
      if (await renameMember(from, to)) form.reset();
    }
  },
  'sheet-import': { allowed: () => canUseSheet(), run: () => importSheetNow() },
  'sheet-url': {
    allowed: () => isAdmin(),
    run: el => {
      const url = el.value.trim();
      if (url && !/^https:\/\/docs\.google\.com\//.test(url)) { notice('Use the link Google Sheets gives you under Publish to web.', true); return; }
      if (!url && data.settings.sheetUrl && !confirm('Remove the published Sheet link? The import stops until a link is pasted again.')) { redraw(); return; }
      saveSettings({ sheetUrl: url }, url ? 'Sheet link saved.' : 'Sheet link removed.', { optimistic: false });
    }
  },
  'sheet-edit-link': {
    allowed: () => isAdmin(),
    run: el => {
      const value = el.value.trim();
      const match = value.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
      if (value && !match) { notice('Paste the Sheet\'s address from your browser while you edit it (it has /spreadsheets/d/ in it).', true); return; }
      if (!value && data.settings.sheetId && !confirm('Remove the Sheet\'s link?' + (feature('sheetWrite') ? ' The app stops writing duty changes into the Sheet.' : ''))) { redraw(); return; }
      sheet.check = null;
      saveSettings({ sheetId: match ? match[1] : '' }, value ? 'Sheet link saved. Check the Sheet next.' : 'Sheet link removed.', { optimistic: false });
    }
  },
  'sheet-check': { allowed: () => canUseSheet(), run: () => checkSheet() },
  'year-add': {
    allowed: () => isAdmin(),
    run: form => {
      const year = Number(new FormData(form).get('year'));
      if (confirm('Add every Saturday and Tuesday service from December 1, ' + year + ' through December 31, ' + (year + 1) + '? Services already there are kept.')) addServiceYear(year);
    }
  },
  'backup-download': { allowed: () => isAdmin(), run: () => downloadBackup() }
});
