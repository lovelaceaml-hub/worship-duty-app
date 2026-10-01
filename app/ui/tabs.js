/* The main tabs: Schedule, My Duties, Presider, Manage. On phones they float
   at the bottom of the screen. A swipe left or right on the page moves to the
   next or previous tab. A green dot on My Duties means the member's duties
   changed; a red dot on Manage means a request or double duty needs a look.
   Availability and Settings open inside My Duties, so it stays marked. */
import { ui } from '../store.js';
import { accountView } from './header.js';

const ORDER = ['schedule', 'my', 'songs', 'manage'];
const LABELS = { schedule: 'Schedule', my: 'My Duties', songs: 'Presider', manage: 'Manage' };

export function paintTabs({ inApp, presider, manager, newDuties, attention }) {
  const nav = document.querySelector('nav.tabs');
  if (!nav) return;
  nav.hidden = !inApp;
  nav.querySelectorAll('[data-tab]').forEach(button => {
    const tab = button.dataset.tab;
    if (tab === 'songs') button.hidden = !presider;
    if (tab === 'manage') button.hidden = !manager;
    const active = tab === ui.tab;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', accountView() ? 'true' : 'page'); else button.removeAttribute('aria-current');
    const dot = tab === 'my' ? newDuties && ui.tab !== 'my' : tab === 'manage' ? attention && ui.tab !== 'manage' : false;
    button.querySelector('.tab-dot').hidden = !dot;
    const label = LABELS[tab] + (dot ? (tab === 'my' ? ', duties changed' : ', needs a look') : '');
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  });
}

function visibleTabs() {
  return ORDER.filter(tab => {
    const button = document.querySelector('nav.tabs [data-tab="' + tab + '"]');
    return button && !button.hidden;
  });
}

/* Swipe between tabs. Horizontal scrollers, form fields, dialogs and the
   Presider planner (it swipes between its own sections) are left alone. */
export function watchSwipe(goTo) {
  let start = null;
  const view = document.getElementById('view');
  if (!view) return;
  view.addEventListener('touchstart', event => {
    const target = event.target;
    if (event.touches.length !== 1 || target.closest('input, select, textarea, [data-no-swipe], #song-root, .scroll-x')) {
      start = null;
      return;
    }
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  }, { passive: true });
  view.addEventListener('touchend', event => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y, quick = Date.now() - start.at < 600;
    start = null;
    if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const tabs = visibleTabs();
    const at = tabs.indexOf(accountView() ? 'my' : ui.tab);
    const next = tabs[at + (dx < 0 ? 1 : -1)];
    if (at !== -1 && next) goTo(next);
  }, { passive: true });
}

/* Hide the floating tab bar while the on-screen keyboard is open. */
export function watchKeyboard() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  viewport.addEventListener('resize', () => {
    const open = window.innerHeight - viewport.height * viewport.scale > 150;
    if (open) document.documentElement.dataset.keyboard = 'open';
    else delete document.documentElement.dataset.keyboard;
  });
}
