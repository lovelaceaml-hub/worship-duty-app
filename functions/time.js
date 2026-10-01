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

/* A Pacific date and HH:MM time as epoch milliseconds, daylight saving
   included. */
function pacificTime(dateIso, time) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(asUtc)).forEach(part => { parts[part.type] = part.value; });
  const asPacific = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - (asPacific - asUtc);
}

/* A service's start, using its label's usual time when it has none. NaN
   without a valid date. */
function serviceStart(service) {
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(service.date || '')) return NaN;
  const time = /^\d{2}:\d{2}$/.test(service.time || '') ? service.time : (DEFAULT_TIMES[service.service] || '12:00');
  return pacificTime(service.date, time);
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

module.exports = { TIME_ZONE, pacificDate, pacificTime, serviceStart, hasStarted, longDate, clockTime };
