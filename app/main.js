/* Start-up: show the schedule this device saw last, connect to Firebase,
   start the live data, and restore the member's sign-in. */
import './actions.js';
import './navigation.js';
import { session, ui, loadCache, saveCache } from './store.js';
import { connect, fb } from './firebase.js';
import { startSync } from './sync.js';
import { render, renderSoon } from './render.js';
import { onAuthChange, rememberedMember, watchSessionEnd } from './services/session.js';
import { checkReminders } from './services/notifications.js';
import { rememberInvite } from './services/departments.js';
import { banner } from './ui/banners.js';
import { newerRelease } from './release.js';
import { watchSwipe, watchKeyboard } from './ui/tabs.js';
import { syncSubnav } from './ui/subnav.js';
import { openTab } from './navigation.js';

/* How long start-up waits for Firebase before showing the saved schedule
   as offline. If it connects later, the app carries on as usual. */
const CONNECT_WAIT = 8000;

function goOffline() {
  session.status = 'offline';
  ui.me = rememberedMember();
  render();
}

/* The service worker keeps the app's files for offline use. When a new
   release takes over an open page of an older one, the page offers to
   reload, and it looks for a new release whenever it comes back into view.
   The first open after a release already loads the new page from the
   network before the new worker takes over; that page needs no reload. */
function watchReleases() {
  if (!('serviceWorker' in navigator)) return;
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (hadWorker && await newerRelease()) banner('The app was updated. Reload to use the new version.', { id: 'release', action: { label: 'Reload', act: 'reload' } });
  });
  let checked = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || Date.now() - checked < 10 * 60 * 1000) return;
    checked = Date.now();
    navigator.serviceWorker.getRegistration().then(registration => registration && registration.update()).catch(() => {});
  });
}

async function start() {
  watchReleases();
  rememberInvite();
  // The saved schedule and member show at once, read-only, while the app connects.
  if (loadCache()) ui.me = rememberedMember();
  window.addEventListener('pagehide', () => saveCache({ now: true }));
  watchKeyboard();
  watchSwipe(openTab);
  const view = document.getElementById('view');
  new MutationObserver(() => requestAnimationFrame(syncSubnav)).observe(view, { childList: true, subtree: true });
  render();
  if (!window.FIREBASE_CONFIG) { goOffline(); return; }
  let late = false;
  const slow = setTimeout(() => { late = true; goOffline(); }, CONNECT_WAIT);
  try {
    await connect(window.FIREBASE_CONFIG);
  } catch (error) {
    clearTimeout(slow);
    console.warn('Firebase did not load:', error);
    if (!late) goOffline();
    return;
  }
  clearTimeout(slow);
  if (late) { session.status = 'loading'; renderSoon(); }
  watchSessionEnd();
  startSync();
  fb.onAuthStateChanged(fb.auth, onAuthChange);
  setInterval(checkReminders, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); renderSoon(); } });
}

start();
