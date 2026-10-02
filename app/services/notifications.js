/* Alerts about a member's own duties.
   - Duty changes: when the schedule gains a duty for this member since they
     last looked, or a duty they held goes to someone else, it is added to
     "Recent updates" on My Duties and the My Duties tab gets a dot.
   - Reminder: once, in the 24 hours before each duty.
   With notifications turned on, both also show as phone notifications. When
   the server can reach the phone by push, it sends them instead, so they are
   not shown twice. */
import { fb } from '../firebase.js';
import { data, ui, feature, canonical, readJSON, writeJSON, readText, writeText } from '../store.js';
import { endSession } from './session.js';
import { renderSoon } from '../render.js';
import { notice, banner, dismiss } from '../ui/banners.js';
import { dutiesOf, upcoming, serviceId, startsAt, serviceClock, isUpcoming } from '../lib/services.js';
import { shortDate, pacificNow } from '../lib/dates.js';
import { dutyName } from '../config/duties.js';

let baselineNext = false;

function notificationsAllowed() { return 'Notification' in window && Notification.permission === 'granted'; }
export function notificationsOn() { return notificationsAllowed() && readText('wds-notify') === '1'; }
function pushActive() { return !!(fb.messaging && readText('wds-fcm-token')); }

function describe(duty, service) {
  return dutyName(duty) + ' · ' + [service.worship, service.service].filter(Boolean).join(' ') + ' · ' +
    shortDate(service.date) + ', ' + serviceClock(service);
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
export function markDutiesSeen() {
  writeText('wds-unread-' + ui.me, '0');
  dismiss('duties');
}

/* What a member who signs out leaves on the device about their duties. */
export function forgetDutyAlerts(name) {
  if (!name) return;
  ['wds-alerts-', 'wds-unread-', 'wds-seen-'].forEach(prefix => writeText(prefix + name, null));
  const reminded = readJSON('wds-reminded', {});
  Object.keys(reminded).forEach(id => { if (id.startsWith(name + '|')) delete reminded[id]; });
  writeJSON('wds-reminded', reminded);
}

function dutiesChangedText(added, removed) {
  if (added && removed) return 'Your duties changed.';
  if (added) return added === 1 ? 'You have a new duty.' : 'You have ' + added + ' new duties.';
  return removed === 1 ? 'You are no longer on one of your duties.' : 'You are no longer on ' + removed + ' of your duties.';
}

function checkNewDuties() {
  if (!ui.me) return;
  // The member's name was fixed while they were signed in: their duties now
  // carry the new spelling, so none of this is news, and the server has
  // ended the session. They sign in again under the new name.
  if (canonical(ui.me) !== ui.me) { endSession(); return; }
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
  // A duty that left the list because its service started is not news; one
  // that went to someone else in a service still ahead is.
  const services = new Map(data.services.map(service => [serviceId(service), service]));
  const gone = seen.filter(id => {
    if (current[id]) return false;
    const [svc, duty] = id.split('|');
    const service = services.get(svc);
    return !!service && isUpcoming(service) && (service.assignments || {})[duty] !== ui.me;
  });
  writeJSON(seenKey, Object.keys(current));
  if (!fresh.length && !gone.length) return;
  const updates = recentUpdates();
  fresh.forEach(id => {
    const text = describe(current[id].duty, current[id].service);
    updates.unshift({ t: Date.now(), txt: 'New duty: ' + text });
    if (!pushActive()) showNotification('New duty for you', text);
  });
  gone.forEach(id => {
    const [svc, duty] = id.split('|');
    updates.unshift({ t: Date.now(), txt: 'No longer on: ' + describe(duty, services.get(svc)) });
  });
  writeJSON('wds-alerts-' + ui.me, updates.slice(0, 30));
  if (ui.tab !== 'my') {
    writeText('wds-unread-' + ui.me, String(Number(readText('wds-unread-' + ui.me, '0')) + fresh.length + gone.length));
    banner(dutiesChangedText(fresh.length, gone.length), { id: 'duties', action: { label: 'Open My Duties', act: 'tab', data: { tab: 'my' } } });
  }
  renderSoon();
}

export function checkReminders() {
  if (!ui.me || !feature('reminders')) return;
  const now = pacificNow().wall;
  const reminded = readJSON('wds-reminded', {});
  const due = dutiesOf(ui.me, upcoming(data.services, now)).filter(item => {
    const id = ui.me + '|' + serviceId(item.service) + '|' + item.duty;
    const start = startsAt(item.service);
    if (reminded[id] || !(start > now && start - now < 24 * 3600 * 1000)) return false;
    reminded[id] = Date.now();
    return true;
  });
  if (!due.length) return;
  due.forEach(item => { if (!pushActive()) showNotification('Duty reminder', describe(item.duty, item.service)); });
  banner(due.length === 1 ? 'Reminder: ' + describe(due[0].duty, due[0].service) : 'Reminder: you have ' + due.length + ' duties in the next 24 hours.', { id: 'reminder' });
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
  if (!await registerPush()) {
    notice('Alerts show while the app is open. This device could not be set up to get them while the app is closed.', true);
  }
  renderSoon();
}

export async function turnOff() {
  writeText('wds-notify', '0');
  await unregisterPush();
  renderSoon();
}

/* True when this device can get alerts while the app is closed. The token
   document is written at every start (lastSeenAt), so one the server
   removed after a delivery problem comes back while the token still works. */
async function registerPush() {
  try {
    if (!fb.messaging || !window.FCM_VAPID_KEY || !notificationsOn() || !ui.me) return false;
    const registration = await navigator.serviceWorker.ready;
    const token = await fb.getToken(fb.messaging, { vapidKey: window.FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return false;
    const previous = readText('wds-fcm-token');
    if (previous && previous !== token) await fb.deleteDoc(fb.doc(fb.db, 'tokens', previous)).catch(() => {});
    const now = Date.now();
    await fb.setDoc(fb.doc(fb.db, 'tokens', token), { name: ui.me, updatedAt: now, lastSeenAt: now });
    writeText('wds-fcm-token', token);
    return true;
  } catch (error) {
    console.warn('Push registration failed:', error);
    return false;
  }
}

/* This device stops getting the member's alerts: on turning them off, and
   on sign-out (while the session can still delete the token). Failures are
   ignored. */
export async function unregisterPush() {
  const token = readText('wds-fcm-token');
  try {
    if (fb.messaging && fb.deleteToken) await fb.deleteToken(fb.messaging).catch(() => {});
    if (token && fb.db) await fb.deleteDoc(fb.doc(fb.db, 'tokens', token)).catch(() => {});
  } finally {
    writeText('wds-fcm-token', null);
    writeText('wds-fcm-name', null); // kept by earlier versions
  }
}
