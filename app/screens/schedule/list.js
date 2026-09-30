/* Original's Schedule: department chips, the next service, then every
   upcoming service by date. Past services open below on request. */
import { html } from '../../html.js';
import { data, ui } from '../../store.js';
import { departmentChips, serviceCard, serviceList } from '../../ui/components.js';
import { nextService, upcoming, past, departmentHasAssignments } from '../../lib/services.js';
import { pastCount } from './index.js';

export function render() {
  const only = ui.departmentFilter;
  const fits = service => only === 'All' || departmentHasAssignments(service, only);
  const coming = upcoming(data.services).filter(fits);
  const next = nextService(data.services);
  const earlier = ui.showPast ? past(data.services).filter(fits) : [];
  const pastTotal = pastCount();
  return html`
    ${departmentChips()}
    ${next && fits(next) ? html`<section class="next-service">
      <h2 class="section-heading">Next service</h2>
      ${serviceCard(next, { only })}
    </section>` : ''}
    <h2 class="section-heading">Full schedule</h2>
    ${coming.length ? serviceList(coming, only) : html`<p class="empty">No upcoming services yet.</p>`}
    ${pastTotal ? html`<div class="center">
      <button type="button" class="link" data-act="toggle-past">${ui.showPast ? 'Hide past services' : 'Show ' + pastTotal + ' past services'}</button>
    </div>` : ''}
    ${earlier.length ? serviceList(earlier, only) : ''}`;
}
