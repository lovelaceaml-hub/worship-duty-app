/* Aurora's Schedule: the chosen day at the top, a strip of the month's
   service days to move between them, then that day's service. "All
   services" lists them instead. */
import { html } from '../../html.js';
import { ui } from '../../store.js';
import { serviceCard, serviceList, departmentSelect } from '../../ui/components.js';
import {
  selection, shownServices, monthNav, modeToggle, searchBox, pastToggle, dayButton, datesIn,
  timeButtons, dayHero, myDutiesAt, editLink, noServices
} from './index.js';

export function render() {
  const { month, date, service, onDate, inMonth } = selection();
  const listView = ui.schedule.mode === 'all' || !!ui.schedule.query;
  const days = datesIn(inMonth);
  return html`<div class="schedule-strip">
    ${!listView && service ? dayHero(service) : ''}
    <section class="card strip-card">
      ${monthNav(month)}
      ${days.length
        ? html`<div class="day-strip scroll-x" role="group" aria-label="Service days">${days.map(day => dayButton(day, inMonth.filter(item => item.date === day), date))}</div>`
        : noServices('No services this month.')}
    </section>
    <div class="schedule-filters">${modeToggle('Day', 'All services')}${departmentSelect()}${searchBox()}</div>
    ${listView
      ? html`<section class="month-list">${serviceList(shownServices(), ui.departmentFilter)}</section>`
      : service
        ? html`${timeButtons(onDate, service)}${myDutiesAt(service)}${serviceCard(service, { only: ui.departmentFilter })}${editLink(service)}`
        : noServices('Pick a day above.')}
    ${pastToggle()}
  </div>`;
}
