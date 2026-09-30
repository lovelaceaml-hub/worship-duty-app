/* The header every appearance shares: the LV badge (goes home), the name of
   the current screen, the sync status, the Appearance button, and the
   member chip with the account menu (Availability, Settings, Sign out). */
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

export function paintHeader(inApp, online) {
  all('[data-slot="screen"]').forEach(el => { el.textContent = screenName(inApp); });
  all('[data-slot="sync"]').forEach(el => {
    el.textContent = online ? 'Live' : 'Offline';
    el.classList.toggle('is-live', online);
    el.title = online ? 'Changes show up for everyone right away.' : 'Showing the schedule saved on this device.';
  });
  const person = inApp ? nameOf(ui.me) : '';
  all('[data-slot="member"]').forEach(button => {
    button.hidden = !person;
    button.setAttribute('aria-label', person ? 'Account menu for ' + person : 'Account menu');
  });
  all('[data-slot="initials"]').forEach(el => { el.textContent = initials(person); });
  all('[data-slot="person"]').forEach(el => { el.textContent = person; });
  all('[data-act="appearance-open"]').forEach(button => { button.hidden = !inApp; });
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
