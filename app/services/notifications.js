/* Alerts about a member's own duties.
   - New duty: when the schedule gains a duty for this member since they last
     looked, it is added to "Recent updates" on My Duties and the My Duties
     tab gets a dot.
   - Reminder: once, in the 24 hours before each duty.
   With notifications turned on, both also show as phone notifications. When
   the server can reach the phone by push, it sends them instead, so they are
   not shown twice. */
import { fb } from '../firebase.js';
import { data, ui, feature, readJSON, writeJSON, readText, writeText } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { dutiesOf, upcoming, serviceId, startsAt } from '../lib/services.js';
import { shortDate, clockTime, pacificNow } from '../lib/dates.js';

let baselineNext = false;

function notificationsAllowed() { return 'Notification' in window && Notification.permission === 'granted'; }
export function notificationsOn() { return notificationsAllowed() && readText('wds-notify') === '1'; }
function pushActive() { return !!(fb.messaging && readText('wds-fcm-token')); }

function describe(item) {
  const service = item.service;
  return item.duty + ' · ' + [service.worship, service.service].filter(Boolean).join(' ') + ' · ' +
    shortDate(service.date) + ', ' + clockTime(service.time);
}

async function showNotification(title, body) {
  if (!notificationsOn()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) { registration.showNotification(title, { body, icon: 'icon.svg' }); return; }
  } catch (_error) { /* fall back to a page notification */ }
  try { new Notification(title, { body }); } catch (_error) { /* not supported */ }
}

export function recentUpdates() { return readJSON('wds-alerts-' + ui.me, []); }
export function clearRecentUpdates() {
  writeText('wds-alerts-' + ui.me, null);
  writeText('wds-unread-' + ui.me, '0');
}
export function hasNewDuties() { return Number(readText('wds-unread-' + ui.me, '0')) > 0; }
export function markDutiesSeen() { writeText('wds-unread-' + ui.me, '0'); }

function checkNewDuties() {
  if (!ui.me) return;
  const seenKey = 'wds-seen-' + ui.me;
  const current = {};
  dutiesOf(ui.me, upcoming(data.services)).forEach(item => { current[serviceId(item.service) + '|' + item.duty] = item; });
  const seen = readJSON(seenKey, null);
  if (seen === null || baselineNext || !feature('notifications')) {
    // First look on this device, a fresh sign-in, or alerts turned off:
    // remember what is there now without announcing it.
    baselineNext = false;
    writeJSON(seenKey, Object.keys(current));
    return;
  }
  const fresh = Object.keys(current).filter(id => !seen.includes(id));
  writeJSON(seenKey, Object.keys(current));
  if (!fresh.length) return;
  const updates = recentUpdates();
  fresh.forEach(id => {
    updates.unshift({ t: Date.now(), txt: 'New duty: ' + describe(current[id]) });
    if (!pushActive()) showNotification('New duty for you', describe(current[id]));
  });
  writeJSON('wds-alerts-' + ui.me, updates.slice(0, 30));
  if (ui.tab !== 'my') {
    writeText('wds-unread-' + ui.me, String(Number(readText('wds-unread-' + ui.me, '0')) + fresh.length));
    notice(fresh.length === 1 ? 'You have a new duty. See My Duties.' : 'You have ' + fresh.length + ' new duties. See My Duties.', true);
  }
  renderSoon();
}

export function checkReminders() {
  if (!ui.me || !feature('reminders')) return;
  const now = pacificNow().wall;
  const reminded = readJSON('wds-reminded', {});
  const due = dutiesOf(ui.me, upcoming(data.services)).filter(item => {
    const id = ui.me + '|' + serviceId(item.service) + '|' + item.duty;
    const start = startsAt(item.service);
    if (reminded[id] || !(start > now && start - now < 24 * 3600 * 1000)) return false;
    reminded[id] = Date.now();
    return true;
  });
  if (!due.length) return;
  due.forEach(item => { if (!pushActive()) showNotification('Duty reminder', describe(item)); });
  notice(due.length === 1 ? 'Reminder: ' + describe(due[0]) : 'Reminder: you have ' + due.length + ' duties in the next 24 hours.');
  Object.keys(reminded).forEach(id => { if (Date.now() - reminded[id] > 7 * 24 * 3600 * 1000) delete reminded[id]; });
  writeJSON('wds-reminded', reminded);
}

export function afterSignIn() {
  baselineNext = true;
  checkNewDuties();
  checkReminders();
  if (notificationsOn()) registerPush();
}

export function afterScheduleChange() {
  checkNewDuties();
  checkReminders();
}

/* ---- phone push (Firebase Cloud Messaging) ---- */

export async function turnOn() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    notice('Notifications are blocked for this site. Allow them in your browser settings, then try again.', true);
    renderSoon();
    return;
  }
  writeText('wds-notify', '1');
  showNotification('Notifications are on', 'You will hear about new duties and get reminders.');
  await registerPush();
  renderSoon();
}

export async function turnOff() {
  writeText('wds-notify', '0');
  await unregisterPush();
  renderSoon();
}

async function registerPush() {
  try {
    if (!fb.messaging || !window.FCM_VAPID_KEY || !notificationsOn() || !ui.me) return;
    const registration = await navigator.serviceWorker.ready;
    const token = await fb.getToken(fb.messaging, { vapidKey: window.FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return;
    const previous = readText('wds-fcm-token');
    if (previous && previous !== token) await fb.deleteDoc(fb.doc(fb.db, 'tokens', previous)).catch(() => {});
    if (previous !== token || readText('wds-fcm-name') !== ui.me) {
      await fb.setDoc(fb.doc(fb.db, 'tokens', token), { name: ui.me, updatedAt: Date.now() });
      writeText('wds-fcm-token', token);
      writeText('wds-fcm-name', ui.me);
    }
  } catch (error) {
    console.warn('Push registration failed:', error);
  }
}

async function unregisterPush() {
  const token = readText('wds-fcm-token');
  try {
    if (fb.messaging && fb.deleteToken) await fb.deleteToken(fb.messaging).catch(() => {});
    if (token && fb.db) await fb.deleteDoc(fb.doc(fb.db, 'tokens', token)).catch(() => {});
  } finally {
    writeText('wds-fcm-token', null);
    writeText('wds-fcm-name', null);
  }
}
