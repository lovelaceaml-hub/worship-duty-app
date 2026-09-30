/* Navy & Cream's Schedule: a rail of the month's service days, the chosen
   service as a day card, and a button to the service after it. "Full
   schedule" lists every service instead. */
import { html } from '../../html.js';
import { ui } from '../../store.js';
import { serviceCard, serviceList, departmentChips } from '../../ui/components.js';
import { serviceId } from '../../lib/services.js';
import { shortDate, clockTime } from '../../lib/dates.js';
import { selection, shownServices, monthNav, modeToggle, dayButton, datesIn, timeButtons, dayHero, myDutiesAt, editLink, noServices, pastToggle } from './index.js';

export function render() {
  const { all, month, date, service, onDate, inMonth } = selection();
  const days = datesIn(inMonth);
  const full = ui.schedule.mode === 'all';
  const after = service ? all[all.findIndex(item => serviceId(item) === serviceId(service)) + 1] : null;
  return html`<div class="schedule-rail">
    <div class="schedule-toolbar">${monthNav(month)}${modeToggle('Day view', 'Full schedule')}</div>
    ${full
      ? html`${departmentChips()}<section class="month-list">${serviceList(shownServices(), ui.departmentFilter)}</section>${pastToggle()}`
      : html`
        ${days.length
          ? html`<div class="day-rail scroll-x" role="group" aria-label="Service days">${days.map(day => dayButton(day, inMonth.filter(item => item.date === day), date))}</div>`
          : noServices('No services this month.')}
        ${service ? html`
          ${timeButtons(onDate, service)}
          ${dayHero(service)}
          <h2 class="section-heading">Service team</h2>
          ${departmentChips()}
          ${myDutiesAt(service)}
          ${serviceCard(service, { only: ui.departmentFilter })}
          ${editLink(service)}
          ${after ? html`<button type="button" class="next-button" data-act="schedule-service" data-service="${serviceId(after)}">
            <span><small>Next service</small>${shortDate(after.date)} · ${clockTime(after.time)}</span><span aria-hidden="true">›</span>
          </button>` : ''}` : ''}`}
  </div>`;
}
