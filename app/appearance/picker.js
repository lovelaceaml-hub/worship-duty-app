/* The member's appearance on this device. index.html applies the saved one
   before the first paint; this module switches it and shows the picker. The
   choice is stored on the device only (key kept from earlier versions so
   members keep their choice). ?design=classic in the address always opens
   Original, for helping someone whose appearance will not load. */
import { html } from '../html.js';
import { defineActions } from '../actions.js';
import { readJSON, writeJSON } from '../store.js';
import { render } from '../render.js';
import { notice } from '../ui/banners.js';
import { APPEARANCES, DEFAULT_APPEARANCE, stylesheetFor } from './registry.js';

const KEY = 'wds-design-gallery-v1';
const forcedOriginal = new URLSearchParams(location.search).get('design') === 'classic';

export function currentAppearance() {
  const id = document.documentElement.dataset.appearance;
  return APPEARANCES[id] ? id : DEFAULT_APPEARANCE;
}

export function layoutFor(id) { return (APPEARANCES[id] || APPEARANCES[DEFAULT_APPEARANCE]).schedule; }

function saved() { return readJSON(KEY, {}); }

function loadStylesheet(id) {
  const href = stylesheetFor(id);
  let link = document.getElementById('theme-css');
  if (!href) { if (link) link.remove(); return Promise.resolve(); }
  const url = href + '?v=DEV';
  if (link && link.getAttribute('href') === url) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const next = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url, id: 'theme-css' });
    next.onload = () => { if (link) link.remove(); resolve(); };
    next.onerror = () => { next.remove(); reject(new Error(APPEARANCES[id].name + ' did not load.')); };
    document.head.appendChild(next);
  });
}

function paintMeta(id) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = APPEARANCES[id].color;
}

/* At start-up: finish what index.html began (meta color, a forced Original). */
export function applySavedAppearance() {
  const id = forcedOriginal ? DEFAULT_APPEARANCE : (APPEARANCES[saved().mode] ? saved().mode : DEFAULT_APPEARANCE);
  document.documentElement.dataset.appearance = id;
  paintMeta(id);
  loadStylesheet(id).catch(() => { document.documentElement.dataset.appearance = DEFAULT_APPEARANCE; });
}

async function useAppearance(id) {
  if (!APPEARANCES[id] || forcedOriginal) return;
  try {
    await loadStylesheet(id);
  } catch (error) {
    notice(error.message + ' Check your connection and try again.', true);
    return;
  }
  document.documentElement.dataset.appearance = id;
  paintMeta(id);
  writeJSON(KEY, Object.assign(saved(), { mode: id, seen: true, version: 2 }));
  render();
}

/* ---- the picker ---- */

let dialog = null;

function open(first = false) {
  if (dialog) return;
  const current = currentAppearance();
  dialog = document.createElement('dialog');
  dialog.className = 'appearance-dialog';
  dialog.setAttribute('aria-labelledby', 'appearance-title');
  dialog.innerHTML = String(html`
    <h2 id="appearance-title">${first ? 'Choose how the app looks' : 'Appearance'}</h2>
    <p class="hint">This changes the look on this device only. Your duties, songs and sign-in stay the same, and you can change it any time from Settings.</p>
    <div class="appearance-grid">${Object.entries(APPEARANCES).map(([id, item]) => html`
      <button type="button" class="appearance-choice" data-appearance-choice="${id}" aria-pressed="${id === current}">
        <span class="appearance-swatch is-${id}" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="appearance-name">${item.name}</span>
        <span class="appearance-note">${item.note}</span>
      </button>`)}</div>
    <div class="button-row"><button type="button" class="ghost" data-appearance-close>Keep ${APPEARANCES[current].name}</button></div>`);
  dialog.addEventListener('click', async event => {
    const choice = event.target.closest('[data-appearance-choice]');
    if (choice) {
      dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
      await useAppearance(choice.dataset.appearanceChoice);
      dialog.close();
    } else if (event.target.closest('[data-appearance-close]') || event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (!saved().seen) writeJSON(KEY, Object.assign(saved(), { mode: currentAppearance(), seen: true, version: 2 }));
    dialog.remove();
    dialog = null;
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  const selected = dialog.querySelector('[aria-pressed="true"]');
  if (selected) selected.focus();
}

let invited = false;

/* After the first sign-in on a device, offer the choice once. */
export function afterRender(signedIn) {
  if (!signedIn || invited || forcedOriginal || saved().seen) return;
  invited = true;
  setTimeout(() => { if (!saved().seen) open(true); }, 400);
}

defineActions({
  'appearance-open': { public: true, run: () => open(false) }
});
