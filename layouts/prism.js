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

/* Prism pairs each duty and name in a two-column cell with a top rule,
   instead of Original's flat baseline row. */
function serviceSummary(service, c, options) {
  const opts = options || {};
  const assignments = Object.entries(service.assignments || {}).filter(([, name]) => name);
  const cells = assignments.length
    ? '<div class="wd-prism-cells">' + assignments.map(([duty, name]) =>
        '<div class="wd-prism-cell"><span>' + esc(duty) + '</span><strong>' + esc(name) + '</strong></div>').join('') + '</div>'
    : '<div class="wd-assignment-row"><span class="wd-assignment-open">No duties posted yet</span></div>';
  return '<div class="wd-service-card' + (opts.current ? ' wd-service-current' : '') + '">' +
    '<div class="wd-service-title">' + esc(service.worship || '') + ' &middot; ' + esc(service.service || '') + '</div>' +
    '<div class="wd-service-time">' + esc(fmtDay(service.date)) + (service.time ? ' at ' + esc(service.time) : '') + '</div>' +
    cells + '</div>';
}

function weekGroup(week, c, summary) {
  const rows = week.days.filter(day => day.services.length).map(day =>
    '<div class="wd-day wd-prism-day' + (day.inMonth ? '' : ' out-of-month') + '">' +
    '<div class="wd-day-label wd-prism-spine">' + esc(fmtDay(day.date)) + '</div>' +
    day.services.map(svc => summary(svc, c)).join('') +
    '</div>'
  ).join('');
  if (!rows) return '';
  return '<section class="wd-week-group"><div class="wd-week-range">' + esc(fmtRange(week.start, week.end)) + '</div>' + rows + '</section>';
}

export default createLayout({
  id: 'prism', name: 'Prism', stylesheet: 'styles/prism.css',
  weekGroup, serviceSummary
});
