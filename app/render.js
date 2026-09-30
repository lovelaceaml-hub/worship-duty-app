/* Draws the whole screen from the store. Call render() after a change the
   member made, and renderSoon() after background changes (live data), which
   batches them into one redraw per frame. */
import { data, session, ui, feature } from './store.js';
import { connected } from './firebase.js';
import { paintHeader, accountView } from './ui/header.js';
import { paintTabs } from './ui/tabs.js';
import { paintBanners } from './ui/banners.js';
import { syncFeedbackButton } from './ui/feedback-button.js';
import { siteUnlocked } from './services/session.js';
import { canManageAnyDepartment, canEditSongsFor } from './services/access.js';
import { hasNewDuties } from './services/notifications.js';
import { attentionCounts } from './services/attention.js';
import { countOnce } from './services/usage.js';
import { dutiesOf, isUpcoming, isInProgress } from './lib/services.js';
import { afterRender as appearanceAfterRender } from './appearance/picker.js';
import * as lock from './screens/lock.js';
import * as schedule from './screens/schedule/index.js';
import * as myDuties from './screens/my-duties.js';
import * as account from './screens/account.js';
import * as presider from './screens/presider.js';
import * as manage from './screens/manage/index.js';

let queued = false;

export function renderSoon() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

function isPresider() {
  if (!feature('songPicker') || !ui.me) return false;
  const current = data.services.filter(service => isUpcoming(service) || isInProgress(service));
  return dutiesOf(ui.me, current).some(item => item.duty === 'Presider') || canEditSongsFor({});
}

/* The screen in front of the app, if any: maintenance, site passcode,
   sign-in, or the forced PIN change. */
function gate() {
  if (document.documentElement.dataset.maintenance === 'on') return lock.maintenance;
  if (session.status === 'loading') return lock.opening;
  if (feature('siteLock') && !siteUnlocked()) return lock.sitePasscode;
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
  if (session.status === 'offline' && (ui.tab === 'songs' || ui.tab === 'manage')) ui.tab = 'schedule';
  if (ui.tab === 'songs' && !isPresider()) { ui.tab = 'my'; ui.songService = null; }
  if (ui.tab === 'manage' && !canManageAnyDepartment()) ui.tab = 'schedule';
  if (ui.tab !== 'my') ui.account = '';
}

/* A live update must not wipe what someone is typing. */
function typing(view) {
  const active = document.activeElement;
  if (!active || !view.contains(active)) return false;
  if (active.tagName === 'TEXTAREA') return true;
  return active.tagName === 'INPUT' &&
    ['text', 'search', 'url', 'password', 'number', 'email', 'tel', 'date', 'time'].includes((active.type || 'text').toLowerCase());
}

export function render() {
  const view = document.getElementById('view');
  if (!view) return;
  const front = gate();
  const inApp = !front;
  if (inApp) checkTab();
  const verified = session.status === 'verified';
  paintHeader(inApp, connected() && session.status !== 'offline');
  paintTabs({
    inApp,
    presider: inApp && verified && isPresider(),
    manager: inApp && verified && canManageAnyDepartment(),
    newDuties: inApp && hasNewDuties(),
    attention: inApp && verified && attentionCounts().total > 0
  });
  const current = front || screen();
  document.documentElement.dataset.screen = front ? front.name : (accountView() || ui.tab);
  if (!typing(view)) {
    // The song planner draws itself; the app only asks it to refresh.
    if (current.keep && current.keep(view)) current.refresh(view);
    else {
      view.innerHTML = String(current.render());
      if (current.mounted) current.mounted(view);
      if (inApp) countOnce('tab_' + ui.tab);
    }
  }
  paintBanners(inApp || front === lock.offline);
  syncFeedbackButton(inApp && verified);
  appearanceAfterRender(inApp && verified);
}

/* Moving between screens. */
export function goTo(tab, options = {}) {
  ui.tab = tab;
  ui.account = options.account || '';
  if (tab === 'songs') { ui.songService = options.service || null; ui.songNav = true; }
  window.scrollTo({ top: 0 });
  render();
}
