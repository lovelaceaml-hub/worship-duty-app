/* Prism's Schedule: a month calendar beside the chosen day. "All services"
   lists them one after another instead; a search lists the matches. */
import { html, plural } from '../../html.js';
import { ui } from '../../store.js';
import { departmentSelect } from '../../ui/components.js';
import { serviceClock } from '../../lib/services.js';
import { toISO, longDate, monthName } from '../../lib/dates.js';
import {
  selection, serves, monthNav, modeToggle, todayButton, searchBox, pastControl, timeButtons, servicePanel,
  allServicesList, noServices, emptyText
} from './index.js';

function monthGrid(month, services, selected) {
  const first = new Date(month + '-01T12:00:00');
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = [];
  for (let i = 0; i < cells; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    days.push(toISO(date));
  }
  return html`<section class="calendar" aria-label="${monthName(month)}">
    <div class="calendar-weekdays" aria-hidden="true">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => html`<span>${day}</span>`)}</div>
    <div class="calendar-grid">${days.map(iso => {
      const onDay = services.filter(service => service.date === iso);
      const mine = onDay.some(serves);
      const outside = !iso.startsWith(month);
      const label = longDate(iso) + ', ' + plural(onDay.length, 'service') + (mine ? ', you serve' : '');
      return html`<button type="button" class="calendar-day${outside ? ' is-outside' : ''}${iso === selected ? ' is-selected' : ''}${onDay.length ? ' has-services' : ''}"
        data-act="schedule-date" data-date="${iso}" aria-pressed="${iso === selected}" aria-label="${label}">
        <span class="calendar-date">${Number(iso.slice(8))}${mine ? html`<span class="calendar-you">You</span>` : ''}</span>
        <span class="calendar-services">${onDay.map(service => html`<span class="calendar-service is-${service.service.toLowerCase().replace(/\s+/g, '-')}${serves(service) ? ' is-mine' : ''}">${serviceClock(service)}</span>`)}</span>
      </button>`;
    })}</div>
  </section>`;
}

function inspector(date, service, onDate) {
  if (!service) {
    return html`<aside class="day-panel" aria-label="Chosen day">
      ${date ? html`<h2 class="day-panel-title">${longDate(date)}</h2>` : ''}
      ${noServices(ui.departmentFilter === 'All' ? 'No services on this day. Pick a day with a service.' : emptyText('on this day'))}
    </aside>`;
  }
  return html`<aside class="day-panel" aria-label="Chosen service">
    <h2 class="day-panel-title">${longDate(service.date)}</h2>
    ${timeButtons(onDate, service)}
    ${servicePanel(service)}
  </aside>`;
}

export function render() {
  const sel = selection();
  const { month, date, service, onDate, inMonth } = sel;
  const listView = ui.schedule.mode === 'all' || !!ui.schedule.query;
  return html`<div class="schedule-calendar">
    <div class="schedule-toolbar">
      ${monthNav(month)}
      <p class="month-count">${plural(inMonth.length, 'service')}</p>
      ${todayButton()}
      ${modeToggle('Month')}
    </div>
    <div class="schedule-filters">${searchBox()}${departmentSelect()}${pastControl()}</div>
    <div class="schedule-body">
      ${listView ? allServicesList(sel) : html`${monthGrid(month, inMonth, date)}${inspector(date, service, onDate)}`}
    </div>
  </div>`;
}
