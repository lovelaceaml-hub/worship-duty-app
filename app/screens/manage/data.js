/* Manage, Data: the Google Sheet import and a backup file. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, feature } from '../../store.js';
import { renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { fb, write, problem } from '../../firebase.js';
import { isAdmin } from '../../services/access.js';
import { downloadBackup, importSheetNow, lastSheetImport, sheet } from '../../services/data-tools.js';

export function render() {
  const last = lastSheetImport();
  return html`
    <section class="card">
      <h3 class="card-subtitle">Google Sheet</h3>
      <p class="hint">${feature('sheetSync')
        ? 'The schedule brings in changes from the published sheet every 2 hours. The sheet decides the duties it lists; duties it leaves out (Media, Parking Lot, Offering) and services added here stay as they are.'
        : 'The Google Sheet import is turned off in Features.'}</p>
      ${last ? html`<p class="hint small">Last import from this device: ${new Date(last.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })},
        ${last.added || 0} added, ${last.updated || 0} updated${last.warnings && last.warnings.length ? ', ' + last.warnings.length + ' rows skipped' : ''}.</p>` : ''}
      <button type="button" class="primary" data-act="sheet-import"${sheet.busy || !feature('sheetSync') ? ' disabled' : ''}>${sheet.busy ? 'Importing…' : 'Import now'}</button>
      <label class="field"><span>Published sheet link (File, Share, Publish to web, CSV)</span>
        <input type="url" data-change="sheet-url" value="${data.settings.sheetUrl || ''}" placeholder="https://docs.google.com/spreadsheets/…/pub?output=csv"></label>
    </section>
    <section class="card">
      <h3 class="card-subtitle">Backup</h3>
      <p class="hint">Download the whole schedule as a file to keep somewhere safe.</p>
      <button type="button" class="ghost" data-act="backup-download">Download backup</button>
    </section>`;
}

defineActions({
  'sheet-import': { allowed: () => isAdmin(), run: () => importSheetNow() },
  'sheet-url': {
    allowed: () => isAdmin(),
    run: async el => {
      const url = el.value.trim();
      if (url && !/^https:\/\/docs\.google\.com\//.test(url)) { notice('Use the link Google Sheets gives you under Publish to web.', true); return; }
      try {
        await write(() => fb.setDoc(fb.doc(fb.db, 'app', 'settings'), { sheetUrl: url }, { merge: true }));
        data.settings.sheetUrl = url;
        notice('Sheet link saved.');
      } catch (error) {
        notice('The link was not saved: ' + problem(error), true);
      }
      renderSoon();
    }
  },
  'backup-download': { allowed: () => isAdmin(), run: () => downloadBackup() }
});
