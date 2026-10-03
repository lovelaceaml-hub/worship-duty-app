/* The header: the LV badge (goes home), the name of the current screen, the
   sync status, and the member chip with the account menu (Availability,
   Settings, Feedback about the app, Sign out). Text is only written when it changes, so a screen reader does not
   hear it again on every redraw. */
import { ui, nameOf } from '../store.js';
import { initials } from '../lib/names.js';

export const SCREEN_NAMES = { schedule: 'Schedule', my: 'My Duties', songs: 'Presider', manage: 'Manage' };
export const ACCOUNT_VIEWS = { availability: 'Availability', settings: 'Settings' };

export function accountView() {
  return ui.tab === 'my' && ACCOUNT_VIEWS[ui.account] ? ui.account : '';
}

function screenName(inApp) {
  if (!inApp) return 'Worship Duty';
  return ACCOUNT_VIEWS[accountView()] || SCREEN_NAMES[ui.tab] || SCREEN_NAMES.schedule;
}

const all = selector => document.querySelectorAll(selector);

const SYNC = {
  live: ['Live', 'Changes show up for everyone right away.'],
  connecting: ['Connecting…', 'Showing the schedule saved on this device while the app connects.'],
  offline: ['Offline', 'Showing the schedule saved on this device.']
};

function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

/* `link` is 'live', 'connecting' or 'offline'. */
export function paintHeader(inApp, link) {
  all('[data-slot="screen"]').forEach(el => setText(el, screenName(inApp)));
  const [label, title] = SYNC[link] || SYNC.offline;
  all('[data-slot="sync"]').forEach(el => {
    setText(el, label);
    el.classList.toggle('is-live', link === 'live');
    el.dataset.link = link;
    el.title = title;
  });
  const person = inApp ? nameOf(ui.me) : '';
  all('[data-slot="member"]').forEach(button => {
    button.hidden = !person;
    button.setAttribute('aria-label', person ? 'Account menu for ' + person : 'Account menu');
  });
  all('[data-slot="initials"]').forEach(el => setText(el, initials(person)));
  all('[data-slot="person"]').forEach(el => setText(el, person));
  if (!person) setMenu(false);
}

/* ---- account menu ---- */

function menuOpen() { return Array.from(all('[data-slot="menu"]')).some(menu => !menu.hidden); }

function setMenu(open, focus) {
  all('[data-slot="menu"]').forEach(menu => { menu.hidden = !open; });
  all('[data-slot="member"]').forEach(button => button.setAttribute('aria-expanded', open ? 'true' : 'false'));
  if (!focus) return;
  const items = Array.from(all(focus === 'chip' ? '[data-slot="member"]' : '[data-slot="menu"] [role="menuitem"]'))
    .filter(el => el.offsetParent !== null);
  const target = focus === 'last' ? items[items.length - 1] : items[0];
  if (target) target.focus();
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-slot="member"]')) setMenu(!menuOpen(), 'first');
  else if (menuOpen()) setMenu(false);
});

document.addEventListener('keydown', event => {
  const onChip = event.target.closest && event.target.closest('[data-slot="member"]');
  if (!menuOpen()) {
    if (onChip && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setMenu(true, event.key === 'ArrowUp' ? 'last' : 'first');
    }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); setMenu(false, 'chip'); return; }
  if (event.key === 'Tab') { setMenu(false); return; }
  const items = Array.from(all('[data-slot="menu"] [role="menuitem"]')).filter(el => el.offsetParent !== null);
  if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const at = items.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : event.key === 'ArrowDown' ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1);
  items[next].focus();
});
