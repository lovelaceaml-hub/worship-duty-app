/* Prism's Schedule: a month calendar beside the chosen day. "List" shows the
   month's services one after another instead; a search shows the list too. */
import { html, plural } from '../../html.js';
import { ui } from '../../store.js';
import { serviceCard, serviceList, departmentSelect } from '../../ui/components.js';
import { toISO, clockTime, longDate, monthName } from '../../lib/dates.js';
import { selection, monthNav, modeToggle, searchBox, pastToggle, timeButtons, myDutiesAt, editLink, noServices } from './index.js';

function serves(service) {
  return Object.values(service.assignments || {}).includes(ui.me);
}

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
        <span class="calendar-services">${onDay.map(service => html`<span class="calendar-service is-${service.service.toLowerCase().replace(/\s+/g, '-')}${serves(service) ? ' is-mine' : ''}">${clockTime(service.time)}</span>`)}</span>
      </button>`;
    })}</div>
  </section>`;
}

function inspector(date, service, onDate) {
  if (!service) {
    return html`<aside class="day-panel" aria-label="Chosen day">
      ${date ? html`<h2 class="day-panel-title">${longDate(date)}</h2>` : ''}
      ${noServices('No services on this day. Pick a day with a service.')}
    </aside>`;
  }
  return html`<aside class="day-panel" aria-label="Chosen service">
    <h2 class="day-panel-title">${longDate(service.date)}</h2>
    ${timeButtons(onDate, service)}
    ${myDutiesAt(service)}
    ${serviceCard(service, { only: ui.departmentFilter })}
    ${editLink(service)}
  </aside>`;
}

export function render() {
  const { month, date, service, onDate, inMonth } = selection();
  const listView = ui.schedule.mode === 'all' || !!ui.schedule.query;
  return html`<div class="schedule-calendar">
    <div class="schedule-toolbar">
      ${monthNav(month)}
      <p class="month-count">${plural(inMonth.length, 'service')}</p>
      <button type="button" class="ghost small" data-act="schedule-today">Next service</button>
      ${modeToggle('Month', 'List')}
    </div>
    <div class="schedule-filters">${searchBox()}${departmentSelect()}${pastToggle()}</div>
    <div class="schedule-body">
      ${listView
        ? html`<section class="month-list">${inMonth.length ? serviceList(inMonth, ui.departmentFilter) : noServices('No services match your search this month.')}</section>`
        : html`${monthGrid(month, inMonth, date)}${inspector(date, service, onDate)}`}
    </div>
  </div>`;
}
