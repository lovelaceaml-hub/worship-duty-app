/* Navy & Cream's Schedule: the tools and a rail of the month's service days,
   the chosen service as a day card, and a button to the service after it.
   "All services" lists them instead; a search lists the matches. The tools
   sit in the toolbar, which stays in the left column on wide screens. */
import { html } from '../../html.js';
import { ui } from '../../store.js';
import { departmentChips } from '../../ui/components.js';
import { serviceId, serviceClock } from '../../lib/services.js';
import { shortDate } from '../../lib/dates.js';
import {
  selection, monthNav, modeToggle, todayButton, searchBox, pastControl, dayScroller, timeButtons, dayHero,
  servicePanel, allServicesList, noServices, emptyText
} from './index.js';

export function render() {
  const sel = selection();
  const { all, month, date, service, onDate } = sel;
  const full = ui.schedule.mode === 'all' || !!ui.schedule.query;
  const after = service ? all[all.findIndex(item => serviceId(item) === serviceId(service)) + 1] : null;
  return html`<div class="schedule-rail">
    <div class="schedule-toolbar">
      ${monthNav(month)}${modeToggle('Day')}${todayButton()}
      <div class="schedule-filters">${searchBox()}${pastControl()}</div>
      ${departmentChips()}
    </div>
    ${full
      ? allServicesList(sel)
      : html`
        ${dayScroller(sel, 'day-rail')}
        ${service ? html`
          ${timeButtons(onDate, service)}
          ${dayHero(service)}
          <h2 class="section-heading">Service team</h2>
          ${servicePanel(service)}
          ${after ? html`<button type="button" class="next-button" data-act="schedule-service" data-service="${serviceId(after)}">
            <span><small>After this</small>${shortDate(after.date)} · ${serviceClock(after)}</span><span aria-hidden="true">›</span>
          </button>` : ''}`
          : date && sel.inMonth.length ? noServices(emptyText('on this day')) : ''}`}
  </div>`;
}
