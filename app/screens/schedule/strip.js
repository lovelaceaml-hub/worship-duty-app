/* Aurora's Schedule: the chosen day at the top, a strip of the month's
   service days to move between them, the tools, then that day's service.
   "All services" lists them instead; a search lists the matches. */
import { html } from '../../html.js';
import { ui } from '../../store.js';
import { departmentSelect } from '../../ui/components.js';
import {
  selection, monthNav, modeToggle, todayButton, searchBox, pastControl, dayScroller, timeButtons, dayHero,
  servicePanel, allServicesList, noServices, emptyText
} from './index.js';

export function render() {
  const sel = selection();
  const { month, date, service, onDate } = sel;
  const listView = ui.schedule.mode === 'all' || !!ui.schedule.query;
  return html`<div class="schedule-strip">
    ${!listView && service ? dayHero(service) : ''}
    <section class="card strip-card">
      ${monthNav(month)}
      ${dayScroller(sel, 'day-strip')}
    </section>
    <div class="schedule-filters">${modeToggle('Day')}${departmentSelect()}${searchBox()}${todayButton()}${pastControl()}</div>
    ${listView
      ? allServicesList(sel)
      : service
        ? html`${timeButtons(onDate, service)}${servicePanel(service)}`
        : noServices(date ? emptyText('on this day') : 'Pick a day above.')}
  </div>`;
}
