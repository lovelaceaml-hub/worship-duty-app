/* Markup pieces shared by every screen and appearance. */
import { html } from '../html.js';
import { DEPARTMENTS, dutyName } from '../config/duties.js';
import { ui, feature, nameOf } from '../store.js';
import { longDate, dayBadge } from '../lib/dates.js';
import { doubleDuties, isMarkedOk } from '../lib/conflicts.js';
import { serviceId, serviceClock, isUpcoming, isInProgress } from '../lib/services.js';
import { hasDuty } from '../lib/worship.js';

/* Whether a service is still to come or under way: the Schedule and My
   Duties keep a service until three hours after it starts (isInProgress),
   and call it "Now" meanwhile. */
export function isCurrent(service) {
  return isUpcoming(service) || isInProgress(service);
}

export function nowTag(service) {
  return isInProgress(service) ? html`<span class="service-now">Now</span>` : '';
}

function person(name) {
  const mine = !!ui.me && name === ui.me;
  return html`<span class="person${mine ? ' is-me' : ''}">${nameOf(name)}${mine ? ' (You)' : ''}</span>`;
}

/* A small mark after a name that holds two duties in one service: "!" while
   it needs a look, a check once a leader marked it OK. The words are there
   for screen readers and touch, not only the color. An allowed pair (a
   prayer with an usher duty) is not a double duty and gets no mark. */
function doubleDutyFlag(service, conflicts, name) {
  const conflict = conflicts.find(item => item.name === name);
  if (!conflict) return '';
  return isMarkedOk(service, conflict)
    ? html`<span class="flag is-ok" title="Two duties, marked OK by a leader"><span aria-hidden="true">✓</span><span class="sr-only">Two duties, marked OK by a leader</span></span>`
    : html`<span class="flag" title="Two duties in this service, needs a look"><span aria-hidden="true">!</span><span class="sr-only">Two duties in this service, needs a look</span></span>`;
}

/* Duty rows grouped by department. `only` limits them to one department. */
export function dutyGroups(service, { only = '', showEmpty = feature('emptyDuties') } = {}) {
  const assignments = service.assignments || {};
  const conflicts = feature('conflictWarnings') ? doubleDuties(service) : [];
  return DEPARTMENTS.filter(department => !only || only === 'All' || department.name === only).map(department => {
    const duties = department.duties.filter(duty => assignments[duty] || (showEmpty && hasDuty(service, duty)));
    if (!duties.length) return '';
    return html`<div class="duty-group" style="--dept: ${department.color}">
      <h4 class="duty-group-name">${department.name}</h4>
      ${duties.map(duty => html`<div class="duty-row">
        <span class="duty-name">${dutyName(duty)}</span>
        ${assignments[duty] ? html`${person(assignments[duty])}${doubleDutyFlag(service, conflicts, assignments[duty])}` : html`<span class="person is-empty">Not filled</span>`}
      </div>`)}
    </div>`;
  });
}

function choirLine(service, only = 'All') {
  if (!feature('choirSong') || !service.choirSong || (only !== 'All' && only !== 'Worship')) return '';
  return html`<p class="choir-song">Choir · ${service.choirSong}</p>`;
}

/* `withDate` adds the service's date under its title, for a card shown
   without a date heading above it. */
function serviceHead(service, withDate) {
  const title = html`<h3 class="service-title">${service.worship || 'Service'} <span class="service-label">${service.service}</span>${nowTag(service)}</h3>`;
  const badge = withDate && !isInProgress(service) ? dayBadge(service.date) : '';
  return html`<div class="service-head">
    ${withDate ? html`<div class="service-name">${title}
      <p class="service-date">${longDate(service.date)}${badge ? html` <span class="day-badge">${badge}</span>` : ''}</p></div>` : title}
    <span class="service-time">${serviceClock(service)}</span>
  </div>`;
}

export function serviceCard(service, { only = 'All', withDate = false } = {}) {
  const groups = dutyGroups(service, { only });
  return html`<article class="card service-card" data-service="${serviceId(service)}">
    ${serviceHead(service, withDate)}
    ${choirLine(service, only)}
    ${groups.some(Boolean) ? groups : html`<p class="service-empty">Not planned yet.</p>`}
  </article>`;
}

function dateHeading(iso) {
  const badge = dayBadge(iso);
  return html`<h2 class="date-heading">${longDate(iso)}${badge ? html` <span class="day-badge">${badge}</span>` : ''}</h2>`;
}

/* Services grouped under date headings. */
export function serviceList(services, only = 'All') {
  let lastDate = '';
  return services.map(service => {
    const heading = service.date !== lastDate ? dateHeading(service.date) : '';
    lastDate = service.date;
    return html`${heading}${serviceCard(service, { only })}`;
  });
}

export function departmentChips() {
  const items = [{ name: 'All', color: '' }].concat(DEPARTMENTS);
  return html`<div class="chips scroll-x" role="group" aria-label="Show a department">
    ${items.map(item => html`<button type="button" class="chip${ui.departmentFilter === item.name ? ' is-active' : ''}"
      data-act="department-filter" data-department="${item.name}" aria-pressed="${ui.departmentFilter === item.name}">
      ${item.color ? html`<span class="dot" style="background: ${item.color}"></span>` : ''}${item.name}</button>`)}
  </div>`;
}

export function departmentSelect(id = 'department-filter') {
  return html`<select id="${id}" data-change="department-filter" aria-label="Department">
    <option value="All"${ui.departmentFilter === 'All' ? ' selected' : ''}>All departments</option>
    ${DEPARTMENTS.map(department => html`<option${ui.departmentFilter === department.name ? ' selected' : ''}>${department.name}</option>`)}
  </select>`;
}

/* One word per state, the same for members and leaders: a member who asked
   for a change sees "Asked" on the duty and in their list. */
export function statusChip(status) {
  const labels = { pending: 'Asked', approved: 'Approved', declined: 'Declined', withdrawn: 'Withdrawn', completed: 'Done', past: 'Past', new: 'New', done: 'Done' };
  return html`<span class="status status-${status}">${labels[status] || status}</span>`;
}

export function empty(text) {
  return html`<p class="empty">${text}</p>`;
}

export function memberOptions(names, selected = '', placeholder = 'Choose a member') {
  return html`<option value="">${placeholder}</option>${names.map(name =>
    html`<option value="${name}"${name === selected ? ' selected' : ''}>${nameOf(name)}</option>`)}`;
}
