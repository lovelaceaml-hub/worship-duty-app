import {CATEGORIES} from './constants.js';

/* ================= helpers ================= */

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function pad(n) { return (n < 10 ? '0' : '') + n; }
export function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function todayISO() { return toISO(new Date()); }
export function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); }
export function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
export function fmtTime(t) {
  if (!t) return '';
  const [hs, m] = t.split(':');
  let h = parseInt(hs, 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + m + ' ' + ap;
}
export function dateBadge(iso) {
  const t = new Date();
  if (iso === toISO(t)) return 'Today';
  t.setDate(t.getDate() + 1);
  if (iso === toISO(t)) return 'Tomorrow';
  return '';
}
export function svcId(svc) {
  return svc.date + '_' + svc.service.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
export function slugify(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function requestId(svcIdVal, duty, createdAt) {
  return svcIdVal + '_' + slugify(duty) + '_' + createdAt;
}
export function svcDateTime(svc) {
  return new Date(svc.date + 'T' + (svc.time || '12:00') + ':00');
}
export function dutyCategory(duty) {
  return CATEGORIES.find(c => c.duties.indexOf(duty) !== -1) || CATEGORIES[0];
}

