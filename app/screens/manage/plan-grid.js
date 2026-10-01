/* Manage, Services: the month as a grid like the Sheet (duties down the
   side, services across) on a wide screen, or the month's services one under
   another on a phone. */
import { html, plural } from '../../html.js';
import { ui, feature } from '../../store.js';
import { dutyName } from '../../config/duties.js';
import { serviceId, isUpcoming } from '../../lib/services.js';
import { clockTime, monthName, weekdayShort, dayOfMonth } from '../../lib/dates.js';
import { openDoubleDuties } from '../../lib/conflicts.js';
import { departmentsShown, planMonth } from './scope.js';
import { cell, atService } from './plan-cell.js';
import { details } from './service-details.js';

/* What needs a look in a service, for the departments shown: duties flagged
   "needs a replacement", and double duties. Past services need nothing. */
function flagsOf(service) {
  if (!isUpcoming(service)) return 0;
  const shown = new Set(departmentsShown().flatMap(department => department.duties));
  const assignments = service.assignments || {};
  const replacements = Object.entries(service.needsReplacement || {})
    .filter(([duty, marker]) => shown.has(duty) && marker && assignments[duty] === marker.memberName).length;
  const doubles = feature('conflictWarnings') ? openDoubleDuties(service).filter(item => item.duties.some(duty => shown.has(duty))).length : 0;
  return replacements + doubles;
}

function serviceHeading(service) {
  const id = serviceId(service);
  const flags = flagsOf(service);
  return html`<button type="button" class="plan-service" data-act="plan-open" data-service="${id}" aria-expanded="${ui.plan.open === id}">
    <b>${weekdayShort(service.date)} ${dayOfMonth(service.date)}</b>
    <span>${clockTime(service.time)}</span><span>${service.service}</span>
    ${flags ? html`<span class="plan-flag">${plural(flags, 'thing', 'things')} to check</span>` : ''}
  </button>`;
}

export function grid(services, context) {
  const departments = departmentsShown();
  const all = departments.length > 1;
  return html`<div class="plan-scroll scroll-x" role="region" aria-label="${monthName(planMonth())} duties" tabindex="0">
    <table class="plan-grid">
      <thead><tr><th scope="col" class="plan-corner">Duty</th>
        ${services.map(service => html`<th scope="col" class="plan-head${isUpcoming(service) ? '' : ' is-past'}">${serviceHeading(service)}</th>`)}</tr></thead>
      <tbody>${departments.map(department => html`
        ${all ? html`<tr class="plan-group" style="--dept: ${department.color}"><th scope="rowgroup" colspan="${services.length + 1}"><span>${department.name}</span></th></tr>` : ''}
        ${department.duties.filter(duty => services.some(service => atService(service, duty))).map(duty => html`<tr><th scope="row">${dutyName(duty)}</th>${services.map(service => cell(service, duty, context))}</tr>`)}`)}
      </tbody>
    </table>
  </div>`;
}

export function list(services, context) {
  const departments = departmentsShown();
  return html`<div class="plan-days">${services.map(service => {
    const id = serviceId(service), open = ui.plan.open === id;
    return html`<section class="card plan-day${isUpcoming(service) ? '' : ' is-past'}">
      ${serviceHeading(service)}
      ${open ? details(service) : html`<table class="plan-lines"><tbody>${departments.map(department => html`
        ${departments.length > 1 ? html`<tr class="plan-group" style="--dept: ${department.color}"><th scope="rowgroup" colspan="2"><span>${department.name}</span></th></tr>` : ''}
        ${department.duties.filter(duty => atService(service, duty)).map(duty => html`<tr><th scope="row">${dutyName(duty)}</th>${cell(service, duty, context)}</tr>`)}`)}
      </tbody></table>`}
    </section>`;
  })}</div>`;
}
