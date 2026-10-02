'use strict';

/* Dates and times in Pacific time, the church's time zone. */

const TIME_ZONE = 'America/Los_Angeles';
// Usual start times since 2026-09-12, as in app/config/duties.js.
const DEFAULT_TIMES = Object.freeze({ 'Early Morning': '05:00', Morning: '10:00', Afternoon: '14:30', Evening: '19:30' });

/* Today's Pacific date (or `date`'s), as YYYY-MM-DD. */
function pacificDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const PACIFIC_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});

/* How far Pacific wall-clock time is from UTC at an instant, in ms. */
function pacificOffset(instant) {
  const parts = {};
  PACIFIC_PARTS.formatToParts(new Date(instant)).forEach(part => { parts[part.type] = part.value; });
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - instant;
}

/* A Pacific date and HH:MM time as epoch milliseconds, daylight saving
   included. The offset is taken at the time itself, not at the same wall
   clock in UTC: on the Sundays the clocks change, an early-morning time is
   on the other side of the change from that UTC instant. */
function pacificTime(dateIso, time) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = wallClock - pacificOffset(wallClock);
  return wallClock - pacificOffset(guess);
}

/* A service's start time as "HH:MM": its own when it is a real clock time,
   else its label's usual time. Reminders, alerts, the calendar feed and the
   public schedule all read it this way, as the app does (app/lib/services.js
   startTime), so "9:30" or "25:00" never means one time here and another
   there. */
function startClock(service) {
  const own = String((service && service.time) || '');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(own) ? own : (DEFAULT_TIMES[service && service.service] || '12:00');
}

/* A service's start, using its label's usual time when it has none. NaN
   without a valid date. */
function serviceStart(service) {
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(service.date || '')) return NaN;
  return pacificTime(service.date, startClock(service));
}

/* Whether a service has started by `now` (epoch milliseconds). A service
   without a valid date has not. */
function hasStarted(service, now = Date.now()) {
  const start = serviceStart(service);
  return Number.isFinite(start) && start <= now;
}

/* "Wednesday, July 1" */
function longDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TIME_ZONE });
}

/* "9:00 AM" */
function clockTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  return (hour % 12 || 12) + ':' + minutes + ' ' + (hour >= 12 ? 'PM' : 'AM');
}

module.exports = { TIME_ZONE, DEFAULT_TIMES, pacificDate, pacificTime, startClock, serviceStart, hasStarted, longDate, clockTime };
