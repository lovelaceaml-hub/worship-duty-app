/* Start-up: show the schedule this device saw last, connect to Firebase,
   start the live data, and restore the member's sign-in. */
import './actions.js';
import './navigation.js';
import { session, ui, loadCache } from './store.js';
import { connect, fb } from './firebase.js';
import { startSync } from './sync.js';
import { render, renderSoon } from './render.js';
import { onAuthChange, rememberedMember } from './services/session.js';
import { checkReminders } from './services/notifications.js';
import { rememberInvite } from './services/departments.js';
import { applySavedAppearance } from './appearance/picker.js';
import { watchSwipe, watchKeyboard } from './ui/tabs.js';
import { syncSubnav } from './ui/subnav.js';
import { openTab } from './navigation.js';

function goOffline() {
  session.status = 'offline';
  ui.me = rememberedMember();
  render();
}

async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  rememberInvite();
  applySavedAppearance();
  loadCache();
  watchKeyboard();
  watchSwipe(openTab);
  const view = document.getElementById('view');
  new MutationObserver(() => requestAnimationFrame(syncSubnav)).observe(view, { childList: true, subtree: true });
  render();
  if (!window.FIREBASE_CONFIG) { goOffline(); return; }
  try {
    await connect(window.FIREBASE_CONFIG);
  } catch (error) {
    console.warn('Firebase did not load:', error);
    goOffline();
    return;
  }
  startSync();
  fb.onAuthStateChanged(fb.auth, onAuthChange);
  setInterval(checkReminders, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); renderSoon(); } });
}

start();
