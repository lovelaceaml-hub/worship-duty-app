'use strict';

/**
 * Pure .ics generation for the per-member subscribable calendar feed.
 * Event format mirrors the app's downloadICS() (app.js "calendar export")
 * so a subscribed feed and a one-off download produce identical events.
 */

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function svcId(svc) {
  return svc.date + '_' + String(svc.service || '').toLowerCase().replace(/\s+/g, '-');
}

/* Canonical spelling via the shared app/nameMap doc ({variant: canonical}). */
function canonName(name, nameMap) {
  return (nameMap && nameMap[name]) || name;
}

/* All (duty, svc) pairs assigned to `member` (canonicalized both sides). */
function dutiesForMember(services, member, nameMap) {
  const me = canonName(member, nameMap);
  const out = [];
  services.forEach(svc => {
    const assignments = svc.assignments || {};
    Object.keys(assignments).forEach(duty => {
      if (assignments[duty] && canonName(assignments[duty], nameMap) === me) {
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
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LV Zion//Worship Duties//EN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape('LV Zion Duties — ' + canonName(member, nameMap)),
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H'
  ];
  duties.forEach(d => {
    const dt = d.svc.date.replace(/-/g, '') + 'T' + (d.svc.time || '12:00').replace(':', '') + '00';
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + svcId(d.svc) + '-' + d.duty.replace(/[^a-zA-Z0-9]/g, '') + '@lvzion',
      'DTSTART:' + dt,
      'DURATION:PT1H30M',
      'SUMMARY:' + icsEscape(d.duty + ' (' + (d.svc.worship || '') + ' ' + d.svc.service + ')'),
      'DESCRIPTION:' + icsEscape('Worship duty: ' + d.duty),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty tomorrow', 'TRIGGER:-PT24H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty soon', 'TRIGGER:-PT2H', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildIcsForMember, dutiesForMember, canonName };
