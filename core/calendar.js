import {unifiedNameMap} from './constants.js';
import {svcId} from './format.js';
import {ui} from './state.js';
import {dutiesFor} from './schedule.js';
import {addBanner} from './notify.js';

export function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
export function icsStamp(d) {
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}
export const LA_VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:America/Los_Angeles',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT',
  'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST',
  'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];
export function downloadICS() {
  const duties = dutiesFor(ui.me);
  if (!duties.length) { alert('No upcoming duties to add.'); return; }
  const stamp = icsStamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LV Zion//Worship Duties//EN',
    'X-WR-TIMEZONE:America/Los_Angeles'].concat(LA_VTIMEZONE);
  duties.forEach(d => {
    const dt = d.svc.date.replace(/-/g, '') + 'T' + (d.svc.time || '12:00').replace(':', '') + '00';
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + svcId(d.svc) + '-' + d.duty.replace(/[^a-zA-Z0-9]/g, '') + '@lvzion',
      'DTSTAMP:' + stamp,
      'DTSTART;TZID=America/Los_Angeles:' + dt,
      'DURATION:PT1H30M',
      'SUMMARY:' + icsEscape(d.duty + ' (' + d.svc.worship + ' ' + d.svc.service + ')'),
      'DESCRIPTION:' + icsEscape('Worship duty: ' + d.duty),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty tomorrow', 'TRIGGER:-PT24H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Duty soon', 'TRIGGER:-PT2H', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-worship-duties.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}
export function icsFeedUrl(scheme) {
  const nameMap = unifiedNameMap();
  const who = nameMap[ui.me] || ui.me;
  return scheme + '//' + location.host + '/ics/' + encodeURIComponent(who);
}
export function subscribeICS() {
  if (!ui.me) return;
  // webcal: is what tells iOS and macOS to subscribe rather than download.
  location.href = icsFeedUrl('webcal:');
}
export function copyICSLink() {
  if (!ui.me) return;
  const url = icsFeedUrl('https:');
  const done = () => addBanner('Calendar link copied. In Google Calendar, add it under Other calendars \u2192 From URL.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => addBanner('Your calendar link is: ' + url));
  } else {
    addBanner('Your calendar link is: ' + url);
  }
}
