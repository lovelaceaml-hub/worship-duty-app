/* Manage, Features: switches that apply to every member, the site passcode,
   and who hears about new change requests. Switches that lock people out,
   stop requests or start writing into the church's Google Sheet ask first. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, feature, readText, writeText } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { memberOptions } from '../../ui/components.js';
import { FEATURES } from '../../config/features.js';
import { byTitle } from '../../lib/names.js';
import { sha256 } from '../../services/session.js';
import { saveSettings, sheet } from '../../services/data-tools.js';
import { isAdmin } from '../../services/access.js';

/* What a switch does to everyone, asked before it happens. */
const ASK = {
  siteLock: { off: 'Turn off the site passcode? Anyone with the app\'s address can then open it on a new device.' },
  changeRequests: { off: 'Turn off change requests? Members can no longer ask for a change in the app. Requests already sent stay.' },
  sheetWrite: {
    on: 'Start writing duty changes into the Google Sheet? From now on every change made in the app goes into the Sheet\'s Entry grid within seconds.',
    off: 'Stop writing duty changes into the Google Sheet? The Sheet becomes the main copy again, and its import puts its names back.'
  }
};

export function render() {
  return html`
    <p class="hint">These apply to every member as soon as you change them.</p>
    <section class="card">${FEATURES.map(item => html`<label class="switch-row">
      <span><strong>${item.label}</strong><small>${item.description}</small></span>
      <input type="checkbox" role="switch" data-change="feature" data-id="${item.id}"${feature(item.id) ? ' checked' : ''}>
    </label>`)}</section>
    <section class="card">
      <h3 class="card-subtitle">Site passcode</h3>
      <p class="hint">The 4-digit code a new device needs before the app opens. Every other device asks for the new code as soon as it is changed.</p>
      <form class="inline-form" data-act="site-passcode">
        <input type="password" name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="New passcode" aria-label="New site passcode" required>
        <input type="password" name="again" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="The same again" aria-label="New site passcode again" required>
        <button type="submit" class="ghost">Change</button>
      </form>
    </section>
    <section class="card">
      <h3 class="card-subtitle">Scheduler</h3>
      <p class="hint">Gets a phone notification for every new change request, along with that department's leaders.</p>
      <select data-change="scheduler" aria-label="Scheduler">${memberOptions(data.members.slice().sort(byTitle), data.settings.schedulerName || '', 'No one')}</select>
    </section>`;
}

defineActions({
  feature: {
    allowed: () => isAdmin(),
    run: el => {
      const id = el.dataset.id, on = el.checked;
      // Writing to the Sheet needs a Sheet that was checked in Manage, Data.
      if (id === 'sheetWrite' && on && !(data.settings.sheetId && sheet.check && !sheet.check.error)) {
        notice('Paste the Sheet\'s link in Manage, Data and press "Check the Sheet" first. Then turn this on.', true);
        redraw();
        return;
      }
      const question = (ASK[id] || {})[on ? 'on' : 'off'];
      if (question && !confirm(question)) { redraw(); return; }
      saveSettings({ features: Object.assign({}, data.settings.features, { [id]: on }) });
    }
  },
  'site-passcode': {
    allowed: () => isAdmin(),
    run: async form => {
      const values = new FormData(form);
      const code = String(values.get('code') || '');
      if (!/^\d{4}$/.test(code)) { notice('Use exactly 4 digits.', true); return; }
      if (code !== String(values.get('again') || '')) { notice('The two passcodes do not match. Type them again.', true); return; }
      if (!confirm('Change the site passcode to ' + code + '? Every other device asks for it right away.')) return;
      const hash = await sha256(code);
      // This device stays open with the new code; if the save fails it keeps the old one.
      const before = readText('wds-site-unlock', '');
      writeText('wds-site-unlock', hash);
      if (await saveSettings({ sitePinHash: hash }, 'Site passcode changed. Other devices ask for the new one now.', { optimistic: false })) form.reset();
      else writeText('wds-site-unlock', before || null);
    }
  },
  scheduler: { allowed: () => isAdmin(), run: el => saveSettings({ schedulerName: el.value }) }
});
