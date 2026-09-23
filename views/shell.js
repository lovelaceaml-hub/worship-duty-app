import {feat, memberLabel, siteUnlocked} from '../core/constants.js';
import {esc, fmtDate, fmtTime} from '../core/format.js';
import {authStatus, canonicalMemberName, state, ui} from '../core/state.js';
import {dutiesFor, preferredScheduleService} from '../core/schedule.js';
import {authActor, canManageAnyDepartment, canPermission, isForcedSession, isVerifiedSession} from '../core/auth.js';
import {renderSongs} from './songs.js';
import {actionableCountsForViewer} from './requests.js';

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
export function render() {
  const nav = document.querySelector('nav.tabs');
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

  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === ui.tab);
  });
  const unread = Number(localStorage.getItem('wds-unread-' + ui.me) || 0);
  const tabMy = document.getElementById('tab-my');
  tabMy.innerHTML = 'My Duties' + (unread > 0 && ui.tab !== 'my' ? '<span class="dot"></span>' : '');
  tabManage.innerHTML = 'Manage' + (actionableCountsForViewer().total > 0 && ui.tab !== 'manage' ? '<span class="dot"></span>' : '');

  const view = document.getElementById('view');
  // A background Firestore snapshot calls render(); replacing innerHTML would
  // wipe whatever the editor is typing (service field, member name, sheet URL,
  // change-request note) and drop focus. Skip the view refresh while a text
  // input inside #view is focused, the next render() after they blur catches up.
  if (!viewHasFocusedInput(view)) {
    if (ui.tab === 'schedule') view.innerHTML = renderSchedule();
    else if (ui.tab === 'my') view.innerHTML = renderMy();
    else if (ui.tab === 'songs') renderSongs(view);
    else view.innerHTML = renderManage();
    pulse('tab_' + ui.tab); // counts once per device per day, see pulse()
  }
  renderBanners();
}
export function renderLoading() {
  const view = document.getElementById('view');
  if (view) view.innerHTML = '<div class="empty">Loading schedule…</div>';
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
  const items = [];
  if (canManageAnyDepartment()) {
    const counts = actionableCountsForViewer();
    if (counts.total) {
      items.push('<div class="banner alert"><button class="linkish" data-act="open-manage-queue">' +
        esc(counts.message) + '</button></div>');
    }
  }
  items.push('<div class="banner"><span>Signed in as <b>' + esc(memberLabel(ui.me)) + '</b></span>' +
    '<button class="linkish" data-act="member-logout">Sign out</button></div>');
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
