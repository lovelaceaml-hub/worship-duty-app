/* Dates are ISO strings (YYYY-MM-DD) and times are 24-hour HH:MM, both in
   Pacific time, the church's time zone. */
import { plural } from '../html.js';

const TIME_ZONE = 'America/Los_Angeles';

function pad(n) { return (n < 10 ? '0' : '') + n; }

export function toISO(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function todayISO() { return pacificNow().today; }

export function addDays(iso, days) {
  const date = new Date(iso + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function addMonths(month, count) {
  const date = new Date(month + '-01T12:00:00');
  date.setMonth(date.getMonth() + count);
  return toISO(date).slice(0, 7);
}

function dateOf(iso) { return new Date(iso + 'T12:00:00'); }

/* Building a date format costs far more than using one, and a redraw shows
   hundreds of dates, so each format is built once and each answer kept. */
function formatter(options) {
  let format = null;
  const seen = new Map();
  return iso => {
    let text = seen.get(iso);
    if (text === undefined) {
      const date = dateOf(iso);
      format = format || new Intl.DateTimeFormat('en-US', options);
      text = Number.isNaN(date.getTime()) ? 'Invalid Date' : format.format(date);
      seen.set(iso, text);
    }
    return text;
  };
}

/* "Wednesday, July 1" */
export const longDate = formatter({ weekday: 'long', month: 'long', day: 'numeric' });
/* "Wed, Jul 1" */
export const shortDate = formatter({ weekday: 'short', month: 'short', day: 'numeric' });
const monthLong = formatter({ month: 'long', year: 'numeric' });
/* "July 2026" */
export function monthName(month) { return monthLong(month + '-01'); }
export const weekdayShort = formatter({ weekday: 'short' });
export function dayOfMonth(iso) { return Number(iso.slice(8, 10)); }
export const monthShort = formatter({ month: 'short' });

/* "9:00 AM" */
export function clockTime(time) {
  if (!/^\d{1,2}:\d{2}$/.test(time || '')) return '';
  const [hours, minutes] = time.split(':');
  const h = Number(hours);
  return (h % 12 || 12) + ':' + minutes + ' ' + (h >= 12 ? 'PM' : 'AM');
}

/* "Today" or "Tomorrow", otherwise empty. */
export function dayBadge(iso, today = todayISO()) {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  return '';
}

/* The current Pacific date, and the current Pacific wall-clock time as
   milliseconds on a UTC scale, so it compares directly with wallTime().
   The answer only changes once a minute (Pacific is a whole number of hours
   from UTC), so the last one is kept. */
let pacific = null, lastMinute = NaN, lastNow = null;
export function pacificNow(now = new Date()) {
  const minute = Math.floor(now.getTime() / 60000);
  if (minute === lastMinute) return lastNow;
  pacific = pacific || new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const value = Object.fromEntries(pacific.formatToParts(now).map(item => [item.type, item.value]));
  const today = value.year + '-' + value.month + '-' + value.day;
  lastNow = Object.freeze({ today, wall: Date.parse(today + 'T' + value.hour + ':' + value.minute + ':00Z') });
  lastMinute = minute;
  return lastNow;
}

/* A Pacific date and time on the same UTC-scaled wall clock. */
export function wallTime(iso, time) {
  return Date.parse(iso + 'T' + time + ':00Z');
}

/* Short relative time for song history: "today", "3 weeks ago". */
export function daysSince(iso, today = todayISO()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return Infinity;
  return Math.round((dateOf(today) - dateOf(iso)) / 86400000);
}
/* Days from today until `iso`: 0 today, 1 tomorrow. */
export function daysUntil(iso, today = todayISO()) {
  return -daysSince(iso, today);
}
export function relativeDay(iso, today = todayISO()) {
  const days = daysSince(iso, today);
  if (days === Infinity) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 30) { const weeks = Math.round(days / 7); return plural(weeks, 'week') + ' ago'; }
  const months = Math.round(days / 30);
  return plural(months, 'month') + ' ago';
}

/* "Jul 6" for a moment in milliseconds (when something was asked, answered
   or changed), with the year ("Jul 6, 2026") or the time ("Jul 6, 3:05 PM")
   when asked for. */
export function shortStamp(at, { year = false, time = false } = {}) {
  const parts = Object.assign({ month: 'short', day: 'numeric' }, year ? { year: 'numeric' } : {}, time ? { hour: 'numeric', minute: '2-digit' } : {});
  return new Date(at).toLocaleString('en-US', parts);
}
