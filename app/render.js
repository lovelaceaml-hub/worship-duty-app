/* Draws the whole screen from the store. Call render() after something the
   member did, and renderSoon() after background changes (live data, the
   clock), which batches them into one redraw per frame. Every redraw keeps
   the member's place (ui/replace.js). A background redraw also waits while
   the member types in a field or chooses from a list, and runs when they
   leave it, so a live update never closes a list or the keyboard. */
import { data, session, ui, feature, loaded } from './store.js';
import { connected } from './firebase.js';
import { paintHeader, accountView } from './ui/header.js';
import { paintTabs } from './ui/tabs.js';
import { paintBanners, banner, dismiss } from './ui/banners.js';
import { replaceMarkup } from './ui/replace.js';
import { syncFeedbackButton } from './ui/feedback-button.js';
import { siteUnlocked } from './services/session.js';
import { canManageAnyDepartment, canEditSongsFor } from './services/access.js';
import { hasNewDuties } from './services/notifications.js';
import { attentionCounts } from './services/attention.js';
import { countOnce } from './services/usage.js';
import { dutiesOf, isUpcoming, isInProgress, nextChange } from './lib/services.js';
import { pacificNow } from './lib/dates.js';
import * as lock from './screens/lock.js';
import * as schedule from './screens/schedule/index.js';
import * as myDuties from './screens/my-duties.js';
import * as account from './screens/account.js';
import * as presider from './screens/presider.js';
import * as manage from './screens/manage/index.js';

let frame = 0, waiting = false, shown = '', clock = null;

export function renderSoon() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; render({ live: true }); });
}

function isPresider() {
  if (!feature('songPicker') || !ui.me) return false;
  const now = pacificNow().wall;
  const current = data.services.filter(service => isUpcoming(service, now) || isInProgress(service, now));
  return dutiesOf(ui.me, current).some(item => item.duty === 'Presider') || canEditSongsFor({});
}

/* The screen in front of the app, if any: maintenance, site passcode,
   sign-in, or the forced PIN change. While the app connects, a device that
   has a saved schedule and member shows it read-only instead of waiting. */
function gate() {
  if (document.documentElement.dataset.maintenance === 'on') return lock.maintenance;
  if (session.status === 'loading' && !(ui.me && data.services.length)) return lock.opening;
  if (feature('siteLock') && !siteUnlocked()) {
    // The passcode is checked against the settings: wait for them while the
    // app is online, unless this device has them saved.
    if (!loaded.settings && !data.settings.sitePinHash && session.status !== 'offline') return lock.opening;
    return lock.sitePasscode;
  }
  if (session.status === 'loading') return null;
  if (session.status === 'offline') return ui.me ? null : lock.offline;
  if (session.status === 'signedOut') return lock.signIn;
  if (session.status === 'forced') return lock.changePin;
  return null;
}

function screen() {
  if (ui.tab === 'songs') return presider;
  if (ui.tab === 'manage') return manage;
  if (ui.tab === 'my') return accountView() ? account : myDuties;
  return schedule;
}

/* Keep the tab the member is on only while they may see it. */
function checkTab() {
  if (session.status !== 'verified' && (ui.tab === 'songs' || ui.tab === 'manage')) ui.tab = 'schedule';
  if (ui.tab === 'songs' && !isPresider()) { ui.tab = 'my'; ui.songService = null; }
  if (ui.tab === 'manage' && !canManageAnyDepartment()) ui.tab = 'schedule';
  if (ui.tab !== 'my') ui.account = '';
}

/* How long a list the member just pressed may still be open. */
const LIST_OPEN_MS = 8000;
let pressed = { el: null, at: 0 };
['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, event => {
  if (event.target && event.target.tagName === 'SELECT') pressed = { el: event.target, at: Date.now() };
}, true));

/* The member is typing in a field, or has just opened a list, on the
   screen. A list that only has focus (Tab passed onto it) does not count, so
   the screen does not wait on it. */
const TEXT_TYPES = ['text', 'search', 'url', 'password', 'number', 'email', 'tel', 'date', 'time'];
function busyIn(view) {
  const active = document.activeElement;
  if (!active || !view.contains(active)) return false;
  if (active.tagName === 'SELECT') {
    const left = pressed.el === active ? LIST_OPEN_MS - (Date.now() - pressed.at) : 0;
    if (left > 0) setTimeout(renderSoon, left + 50);
    return left > 0;
  }
  if (active.tagName === 'TEXTAREA') return true;
  return active.tagName === 'INPUT' && TEXT_TYPES.includes((active.type || 'text').toLowerCase());
}
document.addEventListener('focusout', () => {
  if (waiting) { waiting = false; renderSoon(); }
});

/* Live, connecting, or offline (the saved schedule). */
function linkState() {
  if (session.status === 'loading') return 'connecting';
  if (session.status === 'offline' || !connected() || navigator.onLine === false) return 'offline';
  return 'live';
}
window.addEventListener('online', () => renderSoon());
window.addEventListener('offline', () => renderSoon());

/* The open page moves on by itself when a service starts, when a service's
   time in progress ends, and at midnight. */
function armClock() {
  clearTimeout(clock);
  const now = pacificNow();
  const wait = nextChange(data.services, now.wall) - now.wall - (Date.now() % 60000);
  clock = setTimeout(renderSoon, Math.min(Math.max(wait + 50, 1000), 3600000));
}

export function render({ live = false } = {}) {
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
  const view = document.getElementById('view');
  if (!view) return;
  const front = gate();
  const inApp = !front;
  if (inApp) checkTab();
  const verified = session.status === 'verified';
  const link = linkState();
  paintHeader(inApp, link);
  paintTabs({
    inApp,
    presider: inApp && verified && isPresider(),
    manager: inApp && verified && canManageAnyDepartment(),
    newDuties: inApp && hasNewDuties(),
    attention: inApp && verified && attentionCounts().total > 0
  });
  const current = front || screen();
  const name = front ? front.name : (accountView() || ui.tab);
  document.documentElement.dataset.screen = name;
  const same = name === shown;
  if (live && same && busyIn(view)) waiting = true;
  else {
    waiting = false;
    shown = name;
    // The song planner draws itself; the app only asks it to refresh.
    if (current.keep && current.keep(view)) current.refresh(view);
    else {
      replaceMarkup(view, String(current.render()), { keep: same });
      if (current.mounted) current.mounted(view);
      if (inApp) countOnce('tab_' + ui.tab);
    }
  }
  if (inApp && link === 'offline') banner('You are offline. This is the schedule saved on this device.', { id: 'offline', close: false });
  else dismiss('offline');
  paintBanners(inApp || front === lock.offline);
  syncFeedbackButton(inApp && verified);
  armClock();
}

/* A screen with unsaved changes can ask before the member leaves it
   (Availability): the guard gets the tab being opened and returns false to
   stay. Tabs, swipes, the account menu and links between screens all ask.
   `var`, not `let`: screens register their guard while they load, which is
   before this module's own lines run (it imports the screens). */
var leaveGuard;
export function setLeaveGuard(guard) { leaveGuard = typeof guard === 'function' ? guard : null; }
export function mayLeave(tab, options = {}) {
  return !leaveGuard || leaveGuard(tab, options) !== false;
}

/* Moving between screens. Returns false when the member chose to stay. */
export function goTo(tab, options = {}) {
  if (!options.asked && !mayLeave(tab, options)) return false;
  ui.tab = tab;
  ui.account = options.account || '';
  if (tab === 'songs') { ui.songService = options.service || null; ui.songNav = true; }
  window.scrollTo({ top: 0 });
  render();
  return true;
}
