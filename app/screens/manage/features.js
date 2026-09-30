/* Manage, Features: switches that apply to every member, the site passcode,
   and who hears about new change requests. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, feature, writeText } from '../../store.js';
import { renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { memberOptions } from '../../ui/components.js';
import { FEATURES } from '../../config/features.js';
import { byTitle } from '../../lib/names.js';
import { fb, write, problem } from '../../firebase.js';
import { sha256 } from '../../services/session.js';
import { isAdmin } from '../../services/access.js';

async function saveSettings(fields, done) {
  const before = Object.assign({}, data.settings);
  Object.assign(data.settings, fields);
  renderSoon();
  try {
    await write(() => fb.setDoc(fb.doc(fb.db, 'app', 'settings'), fields, { merge: true }));
    if (done) notice(done);
  } catch (error) {
    data.settings = before;
    notice('That was not saved: ' + problem(error), true);
    renderSoon();
  }
}

export function render() {
  return html`
    <p class="hint">These apply to every member as soon as you change them.</p>
    <section class="card">${FEATURES.map(item => html`<label class="switch-row">
      <span><strong>${item.label}</strong><small>${item.description}</small></span>
      <input type="checkbox" role="switch" data-change="feature" data-id="${item.id}"${feature(item.id) ? ' checked' : ''}>
    </label>`)}</section>
    <section class="card">
      <h3 class="card-subtitle">Site passcode</h3>
      <p class="hint">The 4-digit code a new device needs before the app opens.</p>
      <form class="inline-form" data-act="site-passcode">
        <input type="password" name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="New passcode" aria-label="New site passcode" required>
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
    run: el => saveSettings({ features: Object.assign({}, data.settings.features, { [el.dataset.id]: el.checked }) })
  },
  'site-passcode': {
    allowed: () => isAdmin(),
    run: async form => {
      const code = String(new FormData(form).get('code') || '');
      if (!/^\d{4}$/.test(code)) { notice('Use exactly 4 digits.', true); return; }
      const hash = await sha256(code);
      writeText('wds-site-unlock', hash);
      await saveSettings({ sitePinHash: hash }, 'Site passcode changed. Other devices need the new one the next time the app opens.');
      form.reset();
    }
  },
  scheduler: { allowed: () => isAdmin(), run: el => saveSettings({ schedulerName: el.value }) }
});
