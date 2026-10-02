/* Original's Schedule: the tools, then the service under way or the next
   one with its date, then every service from the chosen month on, a page
   at a time. A search lists the matches instead. */
import { html } from '../../html.js';
import { ui } from '../../store.js';
import { departmentChips } from '../../ui/components.js';
import { isNow } from '../../lib/services.js';
import { selection, nowOrNext, monthNav, searchBox, pastControl, servicePanel, allServicesList } from './index.js';

export function render() {
  const sel = selection();
  const searching = !!ui.schedule.query;
  const next = searching ? null : nowOrNext(sel.all);
  return html`<div class="schedule-list">
    <div class="schedule-filters">${searchBox()}${pastControl()}</div>
    ${departmentChips()}
    ${next ? html`<section class="next-service">
      <h2 class="section-heading">${isNow(next) ? 'Now' : 'Next service'}</h2>
      ${servicePanel(next, { withDate: true })}
    </section>` : ''}
    <section class="schedule-all">
      <h2 class="section-heading">${searching ? 'Search results' : 'All services'}</h2>
      ${searching ? '' : monthNav(sel.month)}
      ${allServicesList(sel, { skip: next })}
    </section>
  </div>`;
}
