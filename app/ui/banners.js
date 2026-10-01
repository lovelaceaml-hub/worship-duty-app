/* Messages to the member.
     notice(text)        a confirmation: a short toast above the tab bar
                         that goes away by itself after a few seconds
     notice(text, true)  a problem: a banner above the screen until dismissed
     banner(text, { id, alert, action, close })
                         news that stays until dismissed, such as a reminder
                         or a new duty. A banner with an id replaces the one
                         before it; `action` adds a button ({ label, act,
                         data }) that also dismisses it; close: false leaves
                         out the close button (a state such as offline).
   Banners live in ui.banners, at most three that can be closed. */
import { html, raw, esc } from '../html.js';
import { ui, onMemberChange } from '../store.js';
import { replaceMarkup } from './replace.js';

const MAX_BANNERS = 3;
const TOASTS = 3;
let count = 0, painted = null;

export function notice(text, alert = false) {
  if (alert) banner(text, { alert: true });
  else toast(text);
}

export function banner(text, { id = '', alert = false, action = null, close = true } = {}) {
  const same = ui.banners.find(item => item.id === id || (!id && item.text === text));
  if (same && same.text === text && same.alert === alert && same.close === close && JSON.stringify(same.action) === JSON.stringify(action)) return;
  const key = id || 'b' + (++count);
  const others = ui.banners.filter(item => item.id !== key && item.text !== text);
  const closable = others.filter(item => item.close !== false);
  const extra = Math.max(0, closable.length + 1 - MAX_BANNERS);
  const kept = others.filter(item => item.close === false || closable.indexOf(item) >= extra);
  ui.banners = kept.concat({ id: key, text, alert, action, close });
  paintBanners();
}

export function dismiss(id) {
  if (!ui.banners.some(item => item.id === id)) return;
  ui.banners = ui.banners.filter(item => item.id !== id);
  paintBanners();
}

/* The dismiss button names its banner, cut short when it is long. */
function closeLabel(text) {
  const words = String(text);
  return 'Dismiss: ' + (words.length > 60 ? words.slice(0, 57).replace(/\s+\S*$/, '') + '…' : words);
}

function actionButton(item) {
  const action = item.action;
  const data = Object.entries(action.data || {}).map(([key, value]) => ' data-' + key + '="' + esc(value) + '"').join('');
  return html`<button type="button" class="link banner-action" data-act="${action.act}"${raw(data)} data-banner-close="${item.id}">${action.label}</button>`;
}

export function paintBanners(show = true) {
  const box = document.getElementById('banners');
  if (!box) return;
  const markup = show ? String(html`${ui.banners.map(item => html`
    <div class="banner${item.alert ? ' is-alert' : ''}" data-banner="${item.id}">
      <span>${item.text}</span>
      ${item.action ? actionButton(item) : ''}
      ${item.close !== false ? html`<button type="button" class="banner-close" data-banner-close="${item.id}" aria-label="${closeLabel(item.text)}">&times;</button>` : ''}
    </div>`)}`) : '';
  // Unchanged banners are left alone, so a screen reader does not hear them again.
  if (markup === painted) return;
  painted = markup;
  replaceMarkup(box, markup);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-banner-close]');
  if (button) dismiss(button.dataset.bannerClose);
});

/* ---- toasts ---- */

function toast(text) {
  const region = document.getElementById('toasts');
  if (!region) return;
  if (Array.from(region.children).some(item => item.textContent === text)) return;
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = text;
  region.appendChild(item);
  while (region.children.length > TOASTS) region.firstElementChild.remove();
  // Long enough to read: about 4 seconds, more for a long message, and it
  // waits while the pointer rests on it. A tap closes it.
  let left = Math.min(10000, Math.max(4000, text.length * 60)), started = Date.now();
  let timer = setTimeout(() => item.remove(), left);
  item.addEventListener('mouseenter', () => { clearTimeout(timer); left -= Date.now() - started; });
  item.addEventListener('mouseleave', () => { started = Date.now(); timer = setTimeout(() => item.remove(), Math.max(1500, left)); });
  item.addEventListener('click', () => item.remove());
}

onMemberChange(() => {
  const region = document.getElementById('toasts');
  if (region) region.textContent = '';
  paintBanners();
});
