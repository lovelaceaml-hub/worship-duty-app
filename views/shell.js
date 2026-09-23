import {feat, memberLabel, siteUnlocked} from '../core/constants.js';
import {esc, fmtDate, fmtTime} from '../core/format.js';
import {authStatus, canonicalMemberName, state, ui} from '../core/state.js';
import {dutiesFor, preferredScheduleService} from '../core/schedule.js';
import {authActor, canManageAnyDepartment, canPermission, isForcedSession, isVerifiedSession} from '../core/auth.js';
import {renderSongs} from './songs.js';
import {actionableCountsForViewer} from './requests.js';
import {renderAccount} from './schedule.js';

// pulse (app.js's own kept tail) and the appearance-dispatch targets
// (renderSchedule/renderMy/renderManage from their own modules, renderSiteLock
// from this module) are not imported directly. design-gallery/build.mjs's
// host-bridge.js injection monkey-patches render, renderSchedule, renderMy,
// renderManage, renderManageServices, renderManagePlanning, renderManageRequests,
// renderManagePeople, renderFeatures, renderManageData and renderSiteLock on
// app.js's own top-level scope (it is spliced as literal text right before
// app.js's closing init() call), so app.js keeps its own mutable local copy of
// each of those 11 names and pushes the live (possibly patched) reference in
// once init() runs, after the injection has already executed. renderSiteLock
// is renamed to activeRenderSiteLock here only because this module also owns
// the real renderSiteLock implementation, and the two names would otherwise
// collide.
let pulse, renderSchedule, renderMy, renderManage, activeRenderSiteLock;
export function setShellRenderRefs(pulseFn, scheduleFn, myFn, manageFn, siteLockFn) {
  pulse = pulseFn;
  renderSchedule = scheduleFn;
  renderMy = myFn;
  renderManage = manageFn;
  activeRenderSiteLock = siteLockFn;
}

export function renderMemberLogin() {
  const members = Array.from(new Set((state.members || []).map(canonicalMemberName).filter(Boolean))).sort();
  const options = '<option value="">Choose your name</option>' + members.map(member =>
    '<option value="' + esc(member) + '"' + (member === ui.loginMember ? ' selected' : '') + '>' + esc(memberLabel(member)) + '</option>'
  ).join('');
  const status = authStatus === 'loading'
    ? '<p class="hint">Checking for a verified session...</p>'
    : '<p class="hint">Select your member account and enter its 4 to 6 digit PIN.</p>';
  return '<div class="card lock-box auth-box"><div class="lock-title">Member sign in</div>' + status +
    '<form class="add-row" data-act="member-login">' +
    '<select id="member-login" data-chg="login-member" aria-label="Member name" required>' + options + '</select>' +
    '<input type="password" id="member-pin" aria-label="Member PIN" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="current-password" placeholder="Member PIN" required>' +
    '<button class="primary" type="submit"' + (ui.authBusy ? ' disabled' : '') + '>' + (ui.authBusy ? 'Signing in...' : 'Sign in') + '</button></form>' +
    (ui.authError ? '<p class="pin-error">' + esc(ui.authError) + '</p>' : '') +
    '</div>';
}
export function renderForcedPinChange() {
  return '<div class="card lock-box auth-box"><div class="lock-title">Change your member PIN</div>' +
    '<p class="hint">This account must set a new 4 to 6 digit PIN before the schedule opens.</p>' +
    '<form class="add-row" data-act="member-change-pin">' +
    '<input type="password" id="member-new-pin" aria-label="New member PIN" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" placeholder="New PIN" required>' +
    '<input type="password" id="member-new-pin-confirm" aria-label="Repeat new member PIN" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" autocomplete="new-password" placeholder="Repeat new PIN" required>' +
    '<button class="primary" type="submit"' + (ui.authBusy ? ' disabled' : '') + '>' + (ui.authBusy ? 'Saving...' : 'Save PIN') + '</button></form>' +
    '<button class="ghost" data-act="member-logout">Sign out</button>' +
    (ui.authError ? '<p class="pin-error">' + esc(ui.authError) + '</p>' : '') +
    '</div>';
}
export function renderMaintenanceSchedule() {
  const root = document.getElementById('maintenance-schedule');
  if (!root) return;
  const focus = preferredScheduleService(state.services);
  const services = (state.services || []).filter(service => service && focus &&
    (service.date + (service.time || '') >= focus.date + (focus.time || '')))
    .sort((left, right) => left.date.localeCompare(right.date) || String(left.time || '').localeCompare(String(right.time || '')))
    .slice(0, 8);
  if (!services.length) {
    root.innerHTML = '<p class="hint">No upcoming services are available yet.</p>';
    return;
  }
  root.innerHTML = services.map(service => {
    const duties = Object.entries(service.assignments || {}).filter(([, member]) => member);
    return '<section class="maintenance-service"><div class="maintenance-service-title">' +
      esc(fmtDate(service.date)) + ', ' + esc(service.service || 'Service') + '</div>' +
      '<div class="maintenance-service-time">' + esc(service.worship || '') +
      (service.time ? ' at ' + esc(fmtTime(service.time)) : '') + '</div>' +
      (duties.length ? duties.map(([duty, member]) => '<div class="maintenance-duty"><span>' + esc(duty) +
        '</span><strong>' + esc(memberLabel(member)) + '</strong></div>').join('') : '<p class="hint">Duties have not been posted.</p>') +
      '</section>';
  }).join('');
}
/* Shared header, all four appearances. The second line names the current
   screen from the same source the main tabs use (ui.tab), so it changes as the
   member moves between screens. Before sign-in it reads "Worship Duty". The
   member chip shows who is signed in and opens the account menu. */
export const SCREEN_TITLES = { schedule: 'Schedule', my: 'My Duties', songs: 'Presider', manage: 'Manage' };
export const ACCOUNT_TITLES = { availability: 'Availability', settings: 'Settings' };
export const ACCOUNT_NOTES = {
  availability: 'Tell your department when you can serve. Changes save to the shared record your department leader also sees.',
  settings: 'Your personal settings on this device.'
};
export function paintHeader(signedIn) {
  const title = signedIn ? (accountView() ? ACCOUNT_TITLES[accountView()] : (SCREEN_TITLES[ui.tab] || SCREEN_TITLES.schedule)) : 'Worship Duty';
  const person = signedIn ? memberLabel(ui.me) : '';
  const initials = person.split(/\s+/).map(part => part.replace(/[^A-Za-z0-9]/g, '').charAt(0)).filter(Boolean).slice(0, 2).join('').toUpperCase();
  document.querySelectorAll('[data-wd-head="screen"]').forEach(el => { el.textContent = title; });
  document.querySelectorAll('[data-wd-head="person"]').forEach(el => { el.textContent = person; });
  document.querySelectorAll('[data-wd-head="initials"]').forEach(el => { el.textContent = initials; });
  document.querySelectorAll('[data-wd-head="member"]').forEach(el => {
    el.hidden = !person;
    el.title = person;
    el.setAttribute('aria-label', person ? 'Signed in as ' + person + '. Account menu' : 'Account menu');
  });
  document.querySelectorAll('[data-wd-head="who"]').forEach(el => { el.textContent = person; });
  if (!person) setAccountMenu(false);
}

/* Account menu. The member chip opens a small menu: Availability, Settings,
   Sign out. Availability and Settings are two personal views inside My Duties
   (ui.account), so the bottom bar and every appearance keep working as they do
   for My Duties. Sign out is the existing member-logout action. The menu closes
   on any tap outside the chip (which covers choosing an item and changing
   tabs), on Escape, and when focus leaves it. */
export function accountView() {
  return ui.tab === 'my' && ACCOUNT_TITLES[ui.account] ? ui.account : '';
}
export function accountMenuOpen() {
  return Array.from(document.querySelectorAll('[data-wd-head="menu"]')).some(menu => !menu.hidden);
}
export function setAccountMenu(open, focusTarget) {
  document.querySelectorAll('[data-wd-head="menu"]').forEach(menu => { menu.hidden = !open; });
  document.querySelectorAll('[data-wd-head="member"]').forEach(button => { button.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  if (!focusTarget) return;
  const scope = focusTarget === 'chip' ? '[data-wd-head="member"]' : '[data-wd-head="menu"] [role="menuitem"]';
  const targets = Array.from(document.querySelectorAll(scope)).filter(el => el.offsetParent !== null);
  const target = focusTarget === 'last' ? targets[targets.length - 1] : targets[0];
  if (target) target.focus();
}
document.addEventListener('click', e => {
  const chip = e.target.closest && e.target.closest('[data-wd-head="member"]');
  if (chip) setAccountMenu(!accountMenuOpen(), 'first');
  else if (accountMenuOpen()) setAccountMenu(false);
});
document.addEventListener('keydown', e => {
  const onChip = e.target.closest && e.target.closest('[data-wd-head="member"]');
  if (!accountMenuOpen()) {
    if (onChip && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setAccountMenu(true, e.key === 'ArrowUp' ? 'last' : 'first'); }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); setAccountMenu(false, 'chip'); return; }
  if (e.key === 'Tab') { setAccountMenu(false); return; }
  const items = Array.from(document.querySelectorAll('[data-wd-head="menu"] [role="menuitem"]')).filter(el => el.offsetParent !== null);
  if (!items.length || ['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(e.key) === -1) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
    : e.key === 'ArrowDown' ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1);
  items[next].focus();
});

export function render() {
  const nav = document.querySelector('nav.tabs');
  nav.classList.remove('nav-loading');
  paintHeader(false);
  if (document.documentElement.dataset.maintenance === 'active') {
    nav.classList.toggle('hidden', true);
    document.getElementById('banners').innerHTML = '';
    document.getElementById('view').innerHTML = '';
    renderMaintenanceSchedule();
    return;
  }
  if (feat('siteLock') && !siteUnlocked()) {
    nav.classList.toggle('hidden', true);
    document.getElementById('banners').innerHTML = '';
    document.getElementById('view').innerHTML = activeRenderSiteLock();
    const input = document.getElementById('site-pin-input');
    if (input) input.focus();
    return;
  }
  if (!isVerifiedSession()) {
    nav.classList.toggle('hidden', true);
    document.getElementById('banners').innerHTML = '';
    document.getElementById('view').innerHTML = renderMemberLogin();
    return;
  }
  if (isForcedSession()) {
    nav.classList.toggle('hidden', true);
    document.getElementById('banners').innerHTML = '';
    document.getElementById('view').innerHTML = renderForcedPinChange();
    return;
  }
  nav.classList.toggle('hidden', false);

  // The Presider tab only exists for people with an upcoming Presider duty,
  // same rule as the "Plan songs" button in My Duties. If the viewer stops
  // qualifying while on the songs screen (name switch, schedule edit, feature
  // toggle), kick them back to My Duties.
  const songEditor = canPermission('canEditSongs', authActor(), {});
  const isPresider = feat('songPicker') && !!ui.me &&
    (dutiesFor(ui.me).some(d => d.duty === 'Presider') || songEditor);
  document.getElementById('tab-presider').classList.toggle('hidden', !isPresider);
  if (ui.tab === 'songs' && !isPresider) { ui.tab = 'my'; ui.songSvc = null; ui.songNav = false; }

  const canManage = canManageAnyDepartment();
  const tabManage = document.getElementById('tab-manage');
  tabManage.classList.toggle('hidden', !canManage);
  if (ui.tab === 'manage' && !canManage) ui.tab = 'schedule';
  if (ui.tab !== 'my') ui.account = '';
  paintHeader(true);

  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === ui.tab && !accountView());
  });
  const unread = Number(localStorage.getItem('wds-unread-' + ui.me) || 0);
  const tabMy = document.getElementById('tab-my');
  tabMy.innerHTML = 'My Duties' + (unread > 0 && ui.tab !== 'my' ? '<span class="dot"></span>' : '');
  tabManage.innerHTML = 'Manage' + (actionableCountsForViewer().total > 0 && ui.tab !== 'manage' ? '<span class="dot"></span>' : '');
  // The dots carry no text and the appearance adapters redraw them, so the
  // meaning is announced from the button itself: green on My Duties is a new
  // duty (styled by #tab-my), red on Manage is requests or conflicts.
  [[tabMy, 'My Duties, new duty'], [tabManage, 'Manage, needs attention']].forEach(pair => {
    if (pair[0].querySelector('.dot')) pair[0].setAttribute('aria-label', pair[1]);
    else pair[0].removeAttribute('aria-label');
  });

  const view = document.getElementById('view');
  // A background Firestore snapshot calls render(); replacing innerHTML would
  // wipe whatever the editor is typing (service field, member name, sheet URL,
  // change-request note) and drop focus. Skip the view refresh while a text
  // input inside #view is focused, the next render() after they blur catches up.
  if (!viewHasFocusedInput(view)) {
    if (ui.tab === 'schedule') view.innerHTML = renderSchedule();
    else if (ui.tab === 'my') view.innerHTML = accountView() ? renderAccount() : renderMy();
    else if (ui.tab === 'songs') renderSongs(view);
    else view.innerHTML = renderManage();
    pulse('tab_' + ui.tab); // counts once per device per day, see pulse()
  }
  renderBanners();
}
export function renderLoading() {
  const view = document.getElementById('view');
  if (view) view.innerHTML = '<div class="empty">Loading schedule…</div>';
  // The floating phone tab bar stays out of the way until the first real render().
  const nav = document.querySelector('nav.tabs');
  if (nav) nav.classList.add('nav-loading');
}
export function viewHasFocusedInput(view) {
  const a = document.activeElement;
  if (!a || !view || !view.contains(a)) return false;
  if (a.tagName === 'TEXTAREA') return true;
  if (a.tagName !== 'INPUT') return false;
  const t = (a.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'search', 'url', 'password', 'number', 'email', 'tel', 'date', 'time'].indexOf(t) !== -1;
}
export function renderBanners() {
  if ((feat('siteLock') && !siteUnlocked()) || !isVerifiedSession() || isForcedSession()) {
    document.getElementById('banners').innerHTML = '';
    return;
  }
  // No "needs your attention" banner here: the dot on the Manage tab carries the
  // same actionableCountsForViewer() total (Anthony, 2026-09-19). The counts and
  // the open-manage-queue action stay; only this banner stopped rendering.
  const items = [];
  items.push.apply(items, ui.banners.map((b, i) =>
    '<div class="banner' + (b.alert ? ' alert' : '') + '"><span>' + esc(b.txt) + '</span>' +
    '<button class="x" data-act="dismiss-banner" data-i="' + i + '" aria-label="Dismiss">✕</button></div>'
  ));
  document.getElementById('banners').innerHTML = items.join('');
}
export function renderSiteLock() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">This schedule is private</div>' +
    '<p class="hint">Enter the 4-digit passcode.</p>' +
    '<form class="add-row" data-act="site-unlock">' +
    '<input type="password" id="site-pin-input" aria-label="Site passcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required>' +
    '<button class="primary" type="submit">Enter</button></form>' +
    (ui.sitePinError ? '<p class="pin-error">' + esc(ui.sitePinError) + '</p>' : '') +
    '</div>';
}
export function renderUnlock() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">Editing is locked</div>' +
    '<p class="hint">Enter the editor passcode to manage the schedule. Viewing never needs a passcode.</p>' +
    '<form class="add-row" data-act="unlock">' +
    '<input type="password" id="pin-input" aria-label="Editor passcode" placeholder="Passcode" autocomplete="off" required>' +
    '<button class="primary" type="submit">Unlock</button></form>' +
    (ui.pinError ? '<p class="pin-error">' + esc(ui.pinError) + '</p>' : '') +
    '</div>';
}
/* Floating phone tab bar: hide it while the on-screen keyboard is open so it
   never covers the field being typed in. The keyboard shrinks the visual
   viewport; the stylesheets read html[data-keyboard="open"]. */
export function watchKeyboardForTabBar() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const open = window.innerHeight - vv.height * vv.scale > 150; // scale keeps pinch zoom from counting
    if (open) document.documentElement.dataset.keyboard = 'open';
    else delete document.documentElement.dataset.keyboard;
  };
  vv.addEventListener('resize', update);
}

/* Secondary menus on phones: the Manage sub-tabs and the Presider Home, Library,
   Services, Insights row are mirrored into one compact scrolling row placed
   directly below the shared header. The original rows stay where each
   appearance draws them (wide screens still use them) and keep every handler;
   the stylesheets show one copy or the other. A mirrored button only presses
   its original, so destinations, labels, order and permissions cannot drift. */
export function watchTopSubnav() {
  const view = document.getElementById('view');
  if (!view || !window.MutationObserver) return;
  let slot = null, signature = '', activeKey = '';
  const findSource = () => view.querySelector('#song-root .ns-tabs') || view.querySelector('.subnav:not(.chips)');
  const sync = () => {
    const source = findSource();
    const banners = document.getElementById('banners');
    if (!source || !banners) {
      if (slot) slot.hidden = true;
      signature = '';
      delete document.documentElement.dataset.subnavTop;
      return;
    }
    if (!slot) {
      slot = document.createElement('nav');
      slot.id = 'subnav-top';
      slot.className = 'subnav';
      slot.addEventListener('click', e => {
        const b = e.target.closest('button[data-top-index]');
        const live = b && findSource();
        const original = live && live.querySelectorAll('button')[Number(b.dataset.topIndex)];
        if (original) original.click();
      });
    }
    // Sit above the page heading (Prism, Aurora) or the banners (Original, Navy & Cream).
    const anchor = banners.parentNode.querySelector(':scope > .page-heading') || banners;
    if (slot.nextElementSibling !== anchor) anchor.parentNode.insertBefore(slot, anchor);
    const songs = source.classList.contains('ns-tabs');
    const items = Array.from(source.querySelectorAll('button'));
    const next = (songs ? 'songs' : 'manage') + '|' + items.map(b => b.textContent.trim() + (b.classList.contains('active') ? '*' : '')).join('|');
    slot.hidden = false;
    document.documentElement.dataset.subnavTop = 'on';
    if (next === signature) return;
    signature = next;
    const focused = slot.contains(document.activeElement) ? document.activeElement.dataset.topIndex : '';
    const keep = slot.scrollLeft;
    slot.setAttribute('aria-label', songs ? 'Presider sections' : 'Manage sections');
    slot.textContent = '';
    let active = null;
    items.forEach((b, i) => {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = b.textContent.trim();
      copy.dataset.topIndex = String(i);
      if (b.classList.contains('lock-btn')) copy.classList.add('lock-btn');
      if (b.classList.contains('active')) { copy.classList.add('active'); copy.setAttribute('aria-current', 'page'); active = copy; }
      slot.appendChild(copy);
      if (focused === String(i)) copy.focus({ preventScroll: true });
    });
    slot.scrollLeft = keep;
    // Keep the selected item in view when the row scrolls sideways.
    const key = (songs ? 'songs:' : 'manage:') + (active ? active.dataset.topIndex : '');
    if (active && key !== activeKey) {
      const s = slot.getBoundingClientRect(), a = active.getBoundingClientRect();
      if (a.left < s.left || a.right > s.right) slot.scrollLeft += a.left - s.left - (s.width - a.width) / 2;
    }
    activeKey = key;
  };
  new MutationObserver(sync).observe(view, { childList: true, subtree: true });
  sync();
}

export function renderCreatePin() {
  return '<div class="card lock-box">' +
    '<div class="lock-title">Create the editor passcode</div>' +
    '<p class="hint">No passcode exists yet. Whoever sets it first becomes the editor. Afterwards it is required to open Manage on any device.</p>' +
    '<form class="add-row" data-act="set-pin">' +
    '<input type="password" id="pin-new" aria-label="New editor passcode" placeholder="New passcode" autocomplete="off" required>' +
    '<input type="password" id="pin-confirm" aria-label="Repeat new editor passcode" placeholder="Repeat it" autocomplete="off" required>' +
    '<button class="primary" type="submit">Set passcode</button></form>' +
    (ui.pinError ? '<p class="pin-error">' + esc(ui.pinError) + '</p>' : '') +
    '</div>';
}
