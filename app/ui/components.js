/* Markup pieces shared by every screen and appearance. */
import { html } from '../html.js';
import { DEPARTMENTS, dutyName } from '../config/duties.js';
import { ui, feature, nameOf } from '../store.js';
import { clockTime, longDate, dayBadge } from '../lib/dates.js';
import { doubleDuties, isMarkedOk } from '../lib/conflicts.js';
import { serviceId } from '../lib/services.js';

function person(name) {
  const mine = !!ui.me && name === ui.me;
  return html`<span class="person${mine ? ' is-me' : ''}">${nameOf(name)}${mine ? ' (You)' : ''}</span>`;
}

/* A small "!" after a name that holds two duties in one service: red while
   it needs a look, amber once a leader marked it OK. */
function doubleDutyFlag(service, name) {
  if (!feature('conflictWarnings') || !name) return '';
  const conflict = doubleDuties(service).find(item => item.name === name);
  if (!conflict) return '';
  return isMarkedOk(service, conflict)
    ? html`<span class="flag is-ok" title="Two duties, marked OK by a leader">!</span>`
    : html`<span class="flag" title="Two duties in this service">!</span>`;
}

/* Duty rows grouped by department. `only` limits them to one department. */
export function dutyGroups(service, { only = '', showEmpty = feature('emptyDuties') } = {}) {
  const assignments = service.assignments || {};
  return DEPARTMENTS.filter(department => !only || only === 'All' || department.name === only).map(department => {
    const duties = department.duties.filter(duty => showEmpty || assignments[duty]);
    if (!duties.length) return '';
    return html`<div class="duty-group" style="--dept: ${department.color}">
      <h4 class="duty-group-name">${department.name}</h4>
      ${duties.map(duty => html`<div class="duty-row">
        <span class="duty-name">${dutyName(duty)}</span>
        ${assignments[duty] ? html`${person(assignments[duty])}${doubleDutyFlag(service, assignments[duty])}` : html`<span class="person is-empty">Not filled</span>`}
      </div>`)}
    </div>`;
  });
}

function choirLine(service, only = 'All') {
  if (!feature('choirSong') || !service.choirSong || (only !== 'All' && only !== 'Worship')) return '';
  return html`<p class="choir-song">Choir · ${service.choirSong}</p>`;
}

function serviceHead(service) {
  return html`<div class="service-head">
    <h3 class="service-title">${service.worship || 'Service'} <span class="service-label">${service.service}</span></h3>
    <span class="service-time">${clockTime(service.time)}</span>
  </div>`;
}

export function serviceCard(service, { only = 'All' } = {}) {
  return html`<article class="card service-card" data-service="${serviceId(service)}">
    ${serviceHead(service)}
    ${choirLine(service, only)}
    ${dutyGroups(service, { only })}
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

export function statusChip(status) {
  const labels = { pending: 'Waiting', approved: 'Approved', declined: 'Declined', completed: 'Done', new: 'New', done: 'Done' };
  return html`<span class="status status-${status}">${labels[status] || status}</span>`;
}

export function empty(text) {
  return html`<p class="empty">${text}</p>`;
}

export function memberOptions(names, selected = '', placeholder = 'Choose a member') {
  return html`<option value="">${placeholder}</option>${names.map(name =>
    html`<option value="${name}"${name === selected ? ' selected' : ''}>${nameOf(name)}</option>`)}`;
}
