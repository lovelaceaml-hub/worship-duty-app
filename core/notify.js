import {feat} from './constants.js';
import {fmtDate, fmtTime, svcId, svcDateTime} from './format.js';
import {fb, authReady, ui} from './state.js';
import {dutiesFor} from './schedule.js';
// render/renderBanners are not imported: they live in app.js until
// Section 4 creates views/shell.js, and a real import back to app.js
// would create the same evaluation-order risk Section 2 hit (see
// core/planning.js's history in the Build log). app.js pushes the
// live references in once, through this setter.
let render, renderBanners;
export function setNotifyRenderRefs(renderFn, renderBannersFn) { render = renderFn; renderBanners = renderBannersFn; }

export function notifyGranted() { return 'Notification' in window && Notification.permission === 'granted'; }
export function notifyOn() { return notifyGranted() && localStorage.getItem('wds-notify') === '1'; }
export function serverPushActive() {
  return !!(fb && fb.messaging && localStorage.getItem('wds-fcm-token'));
}
export async function sysNotify(title, body) {
  if (!notifyOn()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) { reg.showNotification(title, { body, icon: 'icon.svg' }); return; }
  } catch (e) { /* fall through */ }
  try { new Notification(title, { body }); } catch (e) { /* unsupported */ }
}
export async function registerPush() {
  try {
    if (!fb || !fb.messaging || !fb.getToken) return;
    await authReady;                                 // token docs are a write
    if (!window.FCM_VAPID_KEY) return;              // owner has not pasted the key yet
    if (!notifyOn() || !ui.me) return;
    const reg = (await navigator.serviceWorker.ready) ||
      (await navigator.serviceWorker.getRegistration());
    if (!reg) return;
    const token = await fb.getToken(fb.messaging, {
      vapidKey: window.FCM_VAPID_KEY,
      serviceWorkerRegistration: reg
    });
    if (!token) return;
    const prevToken = localStorage.getItem('wds-fcm-token');
    const prevName = localStorage.getItem('wds-fcm-name');
    if (prevToken && prevToken !== token) {
      // token rotated, drop the stale doc
      try { await fb.deleteDoc(fb.doc(fb.db, 'tokens', prevToken)); } catch (e) { /* ignore */ }
    }
    if (prevToken !== token || prevName !== ui.me) {
      await fb.setDoc(fb.doc(fb.db, 'tokens', token), { name: ui.me, updatedAt: Date.now() });
      localStorage.setItem('wds-fcm-token', token);
      localStorage.setItem('wds-fcm-name', ui.me);
    }
  } catch (e) { console.warn('registerPush failed:', e); }
}
export async function unregisterPush() {
  try {
    await authReady;                                 // deleting a token doc is a write
    const token = localStorage.getItem('wds-fcm-token');
    if (fb && fb.deleteToken && fb.messaging) {
      try { await fb.deleteToken(fb.messaging); } catch (e) { /* ignore */ }
    }
    if (fb && token) {
      try { await fb.deleteDoc(fb.doc(fb.db, 'tokens', token)); } catch (e) { /* ignore */ }
    }
    localStorage.removeItem('wds-fcm-token');
    localStorage.removeItem('wds-fcm-name');
  } catch (e) { console.warn('unregisterPush failed:', e); }
}
export function getJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
export function dutyLabel(d) {
  return d.duty + ' | ' + d.svc.worship + ' ' + d.svc.service + ', ' + fmtDate(d.svc.date) + ' at ' + fmtTime(d.svc.time);
}
export function checkNewDuties() {
  if (!ui.me) return;
  const seenKey = 'wds-seen-' + ui.me;
  const duties = dutiesFor(ui.me);
  const current = {};
  duties.forEach(d => { current[svcId(d.svc) + '|' + d.duty] = d; });
  const prev = getJSON(seenKey, null);
  if (prev === null || ui.rebaseline || !feat('notifications')) {
    // baseline without alerting: first visit, a name switch, or alerts turned off
    ui.rebaseline = false;
    localStorage.setItem(seenKey, JSON.stringify(Object.keys(current)));
    return;
  }
  const prevSet = {};
  prev.forEach(k => { prevSet[k] = true; });
  const fresh = Object.keys(current).filter(k => !prevSet[k]);
  if (fresh.length) {
    const alerts = getJSON('wds-alerts-' + ui.me, []);
    fresh.forEach(k => {
      const d = current[k];
      alerts.unshift({ t: Date.now(), txt: 'New duty: ' + dutyLabel(d) });
      if (!serverPushActive()) sysNotify('New duty assigned to you', dutyLabel(d));
    });
    localStorage.setItem('wds-alerts-' + ui.me, JSON.stringify(alerts.slice(0, 30)));
    if (ui.tab !== 'my') {
      localStorage.setItem('wds-unread-' + ui.me, String(fresh.length + Number(localStorage.getItem('wds-unread-' + ui.me) || 0)));
      addBanner('You have ' + fresh.length + ' new dut' + (fresh.length > 1 ? 'ies' : 'y') + ' | see My Duties.', true);
    }
    render();
  }
  localStorage.setItem(seenKey, JSON.stringify(Object.keys(current)));
}
export function checkReminders() {
  if (!ui.me || !feat('reminders')) return;
  const now = Date.now();
  const reminded = getJSON('wds-reminded', {});
  let changed = false;
  const due = [];
  dutiesFor(ui.me).forEach(d => {
    const when = svcDateTime(d.svc).getTime();
    const key = ui.me + '|' + svcId(d.svc) + '|' + d.duty;
    if (when > now && when - now < 24 * 3600 * 1000 && !reminded[key]) {
      reminded[key] = now;
      changed = true;
      if (!serverPushActive()) sysNotify('Duty reminder', dutyLabel(d));
      due.push(d);
    }
  });
  // One in-app banner per check, not one per duty: several duties on the same day
  // used to stack a banner each above My Duties, which already lists them.
  if (due.length === 1) addBanner('Reminder: ' + dutyLabel(due[0]), false);
  else if (due.length > 1) addBanner('Reminder: you have ' + due.length + ' duties in the next 24 hours. See My Duties.', false);
  if (changed) {
    Object.keys(reminded).forEach(k => { if (now - reminded[k] > 7 * 24 * 3600 * 1000) delete reminded[k]; });
    localStorage.setItem('wds-reminded', JSON.stringify(reminded));
  }
}
export function addBanner(txt, alert) {
  if (ui.banners.some(b => b.txt === txt)) return;
  ui.banners.push({ txt, alert });
  renderBanners();
}
export let renderQueued = false;
export function renderSoon() {
  if (renderQueued) return;
  renderQueued = true;
  const run = () => { renderQueued = false; render(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}
export function afterDataChange() {
  render();
  checkNewDuties();
  checkReminders();
}
