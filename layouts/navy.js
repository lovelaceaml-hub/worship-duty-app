import { createLayout } from './_common.js';
import { esc } from '../shared/components.js';

function fmtDay(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtRange(startISO, endISO) {
  const s = new Date(startISO + 'T00:00:00'), e = new Date(endISO + 'T00:00:00');
  return s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' - ' + e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Navy & Cream: a filled service summary with a date stamp, then paired
   assignment cards. */
function serviceSummary(service, c, options) {
  const opts = options || {};
  const assignments = Object.entries(service.assignments || {}).filter(([, name]) => name);
  return '<div class="wd-service-card' + (opts.current ? ' wd-service-current' : '') + '">' +
    '<div class="wd-navy-stamp">' + esc(fmtDay(service.date)) + '</div>' +
    '<div class="wd-service-title">' + esc(service.worship || '') + ' &middot; ' + esc(service.service || '') + '</div>' +
    (service.time ? '<div class="wd-service-time">' + esc(service.time) + '</div>' : '') +
    '<div class="wd-navy-cards">' + (assignments.length
      ? assignments.map(([duty, name]) => '<div class="wd-navy-card"><span>' + esc(duty) + '</span><strong>' + esc(name) + '</strong></div>').join('')
      : '<div class="wd-assignment-row"><span class="wd-assignment-open">No duties posted yet</span></div>') + '</div>' +
    '</div>';
}

function weekGroup(week, c, summary) {
  const rows = week.days.filter(day => day.services.length).map(day =>
    '<div class="wd-day wd-navy-tile' + (day.inMonth ? '' : ' out-of-month') + '">' +
    '<div class="wd-day-label">' + esc(fmtDay(day.date)) + '</div>' +
    day.services.map(svc => summary(svc, c)).join('') +
    '</div>'
  ).join('');
  if (!rows) return '';
  return '<section class="wd-week-group"><div class="wd-week-range">' + esc(fmtRange(week.start, week.end)) + '</div>' + rows + '</section>';
}

export default createLayout({
  id: 'navy', name: 'Navy & Cream', stylesheet: 'styles/navy.css',
  weekGroup, serviceSummary
});
