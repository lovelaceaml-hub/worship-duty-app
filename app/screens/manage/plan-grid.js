/* Manage, month plan: the month as a grid like the Sheet (duties down the
   side, services across) on a wide screen, or the month's services one under
   another on a phone. Each service's heading opens its details and counts
   what needs the leader: duties not filled, and names to check. Usher
   leaders also see who prays in each service, since an usher may also pray.
   Above the month: what the colors mean, and any department list that is
   loading, did not load or has no one on it yet. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { ui, session, nameOf } from '../../store.js';
import { departmentNamed, dutyName, PRAYER_DUTIES } from '../../config/duties.js';
import { serviceId, isUpcoming, serviceClock } from '../../lib/services.js';
import { monthName, weekdayShort, dayOfMonth } from '../../lib/dates.js';
import { canEditDuty, canManageDepartment, leadersOf } from '../../services/access.js';
import { roster, rosterLoaded, refreshRosters, departments as departmentState } from '../../services/rosters.js';
import { addMember } from '../../services/departments.js';
import { departmentsShown, planMonth } from './scope.js';
import { cell, atService, needsLook, notFilled, showsPrayers, prayers } from './plan-cell.js';
import { details } from './service-details.js';

/* Duties of the departments shown that a service has. */
const dutiesAt = service => departmentsShown().flatMap(department => department.duties).filter(duty => atService(service, duty));

/* What needs the leader at a service: duties not filled that it usually
   has, and names to check. A service that has started needs nothing. */
function countsOf(service, context) {
  if (!isUpcoming(service)) return { filled: 0, empty: 0, look: 0 };
  const duties = dutiesAt(service);
  return {
    filled: duties.filter(duty => (service.assignments || {})[duty]).length,
    empty: duties.filter(duty => notFilled(service, duty, context)).length,
    look: duties.filter(duty => needsLook(service, duty, context)).length
  };
}

function serviceHeading(service, context, { filled = false } = {}) {
  const id = serviceId(service);
  const counts = countsOf(service, context);
  return html`<button type="button" class="plan-service" data-act="plan-open" data-service="${id}" aria-expanded="${ui.plan.open === id}">
    <b>${weekdayShort(service.date)} ${dayOfMonth(service.date)}</b>
    <span>${serviceClock(service)}</span><span>${service.service}</span>
    ${filled && counts.filled ? html`<span class="plan-count">${counts.filled} filled</span>` : ''}
    ${counts.empty ? html`<span class="plan-count is-empty">${counts.empty} not filled</span>` : ''}
    ${counts.look ? html`<span class="plan-count is-look">${counts.look} to check</span>` : ''}
  </button>`;
}

/* ---- above the month ---- */

export function legend() {
  return html`<ul class="plan-legend" aria-label="What the marks mean">
    <li><i class="plan-key is-empty"></i>Not filled</li>
    <li><i class="plan-key is-proposed"></i>Proposed, not saved yet</li>
    <li><i class="plan-key is-flagged"></i>Needs a look</li>
    ${showsPrayers() || departmentsShown().length > 1 ? html`<li><i class="plan-key is-paired"></i>Usher who also prays there</li>` : ''}
    <li><i class="plan-key is-none"></i>Not at this service</li>
  </ul>`;
}

const names = list => list.map(department => department.name);
const joined = list => list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list.join('');

function canAddSelf(department) {
  const member = session.member;
  return department === "Children's Teachers" && member?.uid && canManageDepartment(department) &&
    leadersOf(department).includes(member.memberName) && rosterLoaded(department) &&
    !roster(department).some(profile => profile.memberUid === member.uid || profile.memberName === member.memberName);
}

/* The department lists the planner needs: loading, did not load (with Try
   again), or with no one on them yet. Their duties show names only. */
export function rosterNotes() {
  const editable = departmentsShown().filter(department => department.duties.some(canEditDuty));
  const failed = editable.filter(department => !rosterLoaded(department.name) && departmentState.errors[department.name]);
  const loading = editable.filter(department => !rosterLoaded(department.name) && !departmentState.errors[department.name]);
  const empty = editable.filter(department => rosterLoaded(department.name) && !roster(department.name).length);
  return html`${loading.length ? html`<p class="hint plan-status" role="status">Loading ${loading.length === 1 ? 'the ' + loading[0].name + ' list' : 'the lists of ' + plural(loading.length, 'department')}…</p>` : ''}
    ${failed.length ? html`<div class="card-note is-warning plan-status" role="alert">
      <p>${failed.length === 1 ? 'The ' + failed[0].name + ' list did not load: ' + departmentState.errors[failed[0].name]
        : 'These lists did not load: ' + joined(names(failed)) + '.'} Its duties can be changed once it loads.</p>
      <button type="button" class="ghost small" data-act="plan-roster-retry" data-departments="${names(failed).join('|')}">Try again</button></div>` : ''}
    ${editable.filter(department => canAddSelf(department.name)).map(department => html`
      <p class="card-note plan-status">Add yourself to ${department.name} to choose your name for a duty.
        <button type="button" class="ghost small" data-act="plan-add-self" data-department="${department.name}">Add myself to the roster</button>
      </p>`)}
    ${empty.length ? html`<p class="card-note plan-status">No one is on the ${joined(names(empty))} ${empty.length === 1 ? 'list' : 'lists'} yet, so ${empty.length === 1 ? 'its' : 'their'} duties cannot be filled here.
      <button type="button" class="link" data-act="plan-roster-open" data-department="${empty[0].name}">Add members in Departments</button></p>` : ''}`;
}

/* ---- the month ---- */

export function grid(services, context) {
  const departments = departmentsShown();
  const all = departments.length > 1;
  const prayerRows = showsPrayers() ? PRAYER_DUTIES.filter(duty => services.some(service => atService(service, duty))) : [];
  return html`<div class="plan-scroll scroll-x" role="region" aria-label="${monthName(planMonth())} duties" tabindex="0">
    <table class="plan-grid">
      <thead><tr><th scope="col" class="plan-corner">Duty</th>
        ${services.map(service => html`<th scope="col" class="plan-head${isUpcoming(service) ? '' : ' is-past'}">${serviceHeading(service, context)}</th>`)}</tr></thead>
      <tbody>
        ${prayerRows.length ? html`<tr class="plan-group is-context"><th scope="rowgroup" colspan="${services.length + 1}"><span>Praying (Worship)</span></th></tr>
          ${prayerRows.map(duty => html`<tr class="plan-context"><th scope="row">${dutyName(duty)}</th>${services.map(service => atService(service, duty)
            ? html`<td class="plan-cell is-context"><span class="plan-name"><span class="plan-value">${(service.assignments || {})[duty] ? nameOf(service.assignments[duty]) : 'Not filled'}</span></span></td>`
            : html`<td class="plan-cell is-none"><span class="sr-only">Not at this service</span></td>`)}</tr>`)}` : ''}
        ${departments.map(department => html`
        ${all || prayerRows.length ? html`<tr class="plan-group" style="--dept: ${department.color}"><th scope="rowgroup" colspan="${services.length + 1}"><span>${department.name}</span></th></tr>` : ''}
        ${department.duties.filter(duty => services.some(service => atService(service, duty))).map(duty => html`<tr><th scope="row">${dutyName(duty)}</th>${services.map(service => cell(service, duty, context))}</tr>`)}`)}
      </tbody>
    </table>
  </div>`;
}

export function list(services, context) {
  const departments = departmentsShown();
  // With every department, each service is its heading and counts until it
  // is opened; one department shows its duties right away.
  const collapsed = departments.length > 1;
  return html`<div class="plan-days">${services.map(service => {
    const id = serviceId(service), open = ui.plan.open === id;
    const praying = showsPrayers() && prayers(service);
    return html`<section class="card plan-day${isUpcoming(service) ? '' : ' is-past'}${collapsed && !open ? ' is-collapsed' : ''}">
      ${serviceHeading(service, context, { filled: collapsed })}
      ${praying ? html`<p class="plan-praying">Praying: ${praying}</p>` : ''}
      ${open ? details(service, context) : collapsed ? '' : html`<table class="plan-lines"><tbody>${departments.map(department => html`
        ${department.duties.filter(duty => atService(service, duty)).map(duty => html`<tr><th scope="row">${dutyName(duty)}</th>${cell(service, duty, context)}</tr>`)}`)}
      </tbody></table>`}
    </section>`;
  })}</div>`;
}

defineActions({
  'plan-add-self': {
    allowed: el => canAddSelf(el.dataset.department),
    run: async el => {
      const department = el.dataset.department;
      const { uid, memberName } = session.member;
      el.disabled = true;
      try {
        await addMember(department, { memberUid: uid, memberName }, { eligibleDuties: departmentNamed(department).duties });
      } finally {
        el.disabled = false;
      }
    }
  },
  'plan-roster-retry': el => { refreshRosters(el.dataset.departments.split('|')); }
});
