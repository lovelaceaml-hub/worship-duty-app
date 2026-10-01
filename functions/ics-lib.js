'use strict';

/**
 * Pure .ics generation for the per-member subscribable calendar feed.
 * Event format mirrors the app's downloadICS() (app.js "calendar export")
 * so a subscribed feed and a one-off download produce identical events.
 */

const { dutyName, canonicalName } = require('./names');
const { DEFAULT_TIMES } = require('./time');

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/* A UTC timestamp as YYYYMMDDTHHMMSSZ, for DTSTAMP. */
function icsStamp(d) {
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}

/* VTIMEZONE for America/Los_Angeles so times are anchored to Pacific wall-clock
   (matching the push reminders) rather than floating to the subscriber's TZ. */
const LA_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT',
  'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST',
  'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
];

/* MUST match app.js svcId() exactly (non-alphanumeric runs → '-'). */
function svcId(svc) {
  return svc.date + '_' + String(svc.service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/* RFC 5545: a line longer than 75 octets goes on in the next line after a
   space, without splitting a character. */
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const length = Buffer.byteLength(char, 'utf8');
    if (size + length > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74; // the leading space counts
    }
    current += char;
    size += length;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/* A service's start time as HHMM: its own, or its label's usual time. */
function startTime(svc) {
  const own = String(svc.time || '').trim();
  const time = /^\d{1,2}:\d{2}$/.test(own) ? own.padStart(5, '0') : (DEFAULT_TIMES[svc.service] || '12:00');
  return time.replace(':', '');
}

/* All (duty, svc) pairs assigned to `member` (both sides in their current
   spelling, see names.js). */
function dutiesForMember(services, member, nameMap) {
  const me = canonicalName(member, nameMap);
  const out = [];
  services.forEach(svc => {
    const assignments = svc.assignments || {};
    Object.keys(assignments).forEach(duty => {
      if (assignments[duty] && canonicalName(assignments[duty], nameMap) === me) {
        out.push({ duty: duty, svc: svc });
      }
    });
  });
  out.sort((a, b) => a.svc.date.localeCompare(b.svc.date));
  return out;
}

/**
 * Build a VCALENDAR string for one member. Includes reminders at -24h and
 * -2h, matching the in-app download. `services` should already be limited
 * to the window the feed exposes (the function queries date >= today-30d).
 */
function buildIcsForMember(services, member, nameMap) {
  const duties = dutiesForMember(services, member, nameMap);
  const stamp = icsStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LV Zion//Worship Duties//EN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape('LV Zion Duties for ' + canonicalName(member, nameMap)),
    'X-WR-TIMEZONE:America/Los_Angeles',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H'
  ].concat(LA_VTIMEZONE);
  duties.forEach(d => {
    const dt = d.svc.date.replace(/-/g, '') + 'T' + startTime(d.svc) + '00';
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + svcId(d.svc) + '-' + d.duty.replace(/[^a-zA-Z0-9]/g, '') + '@lvzion',
      'DTSTAMP:' + stamp,
      'DTSTART;TZID=America/Los_Angeles:' + dt,
      'DURATION:PT1H30M',
      'SUMMARY:' + icsEscape(dutyName(d.duty) + ' (' + (d.svc.worship || '') + ' ' + d.svc.service + ')'),
      'DESCRIPTION:' + icsEscape('Worship duty: ' + dutyName(d.duty)),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty tomorrow', 'TRIGGER:-PT24H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty soon', 'TRIGGER:-PT2H', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { buildIcsForMember, dutiesForMember };
