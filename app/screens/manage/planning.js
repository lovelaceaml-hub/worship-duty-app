/* Manage, Planning: double duties to sort out (with people who could take
   one of the duties instead), duties that usually get filled but are still
   open in the next four weeks, and how much each member is serving. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, nameOf } from '../../store.js';
import { empty } from '../../ui/components.js';
import { departmentOf, dutyName } from '../../config/duties.js';
import { upcoming, serviceId } from '../../lib/services.js';
import { shortDate, todayISO, addDays } from '../../lib/dates.js';
import { workload, suggestReplacements, usualDuties } from '../../lib/workload.js';
import { byTitle } from '../../lib/names.js';
import { roster, profileOf, loadRoster, assign, legacyRoster } from '../../services/departments.js';
import { openConflicts } from '../../services/attention.js';
import { canEditDuty } from '../../services/access.js';
import { shownFor, departmentsShown, openService } from './services.js';
import { managedDepartment } from './index.js';

function conflicts(stats) {
  const list = openConflicts().filter(item => shownFor(managedDepartment())(item.service));
  if (!list.length) return empty('No double duties to sort out.');
  return list.map(({ service, conflict }) => html`<article class="card">
    <div class="card-title-row"><h3 class="card-subtitle">${nameOf(conflict.name)} · ${conflict.duties.map(dutyName).join(' and ')}</h3></div>
    <p class="hint">${service.worship} ${service.service}, ${shortDate(service.date)}</p>
    ${conflict.duties.filter(canEditDuty).map(duty => {
      const options = suggestReplacements(service, duty, roster(departmentOf(duty).name), stats, { exclude: conflict.name });
      return html`<div class="suggest-row"><span class="suggest-label">${dutyName(duty)} could go to</span>
        ${options.length ? options.map(profile => html`<button type="button" class="ghost small" data-act="planning-assign"
          data-service="${serviceId(service)}" data-duty="${duty}" data-uid="${profile.memberUid}">${nameOf(profile.memberName)}</button>`)
          : html`<span class="hint">no one else is free</span>`}</div>`;
    })}
    <div class="button-row">
      <button type="button" class="ghost small" data-act="planning-open" data-service="${serviceId(service)}">Open service</button>
      <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="true">Mark OK</button>
    </div>
  </article>`);
}

function openDuties(visible) {
  const usual = usualDuties(data.services);
  const horizon = addDays(todayISO(), 28);
  const rows = visible.filter(service => service.date <= horizon).map(service => {
    const assignments = service.assignments || {};
    if (!Object.values(assignments).some(Boolean)) return null; // not planned yet
    const missing = usual(service).filter(duty => !assignments[duty] && departmentsShown().some(department => department.duties.includes(duty)));
    return missing.length ? { service, missing } : null;
  }).filter(Boolean);
  return html`<section class="card">
    <h3 class="card-subtitle">Open duties, next 4 weeks</h3>
    <p class="hint">Duties a service like this usually has filled.</p>
    ${rows.length ? rows.map(({ service, missing }) => html`<p class="suggest-row"><span class="suggest-label">${shortDate(service.date)} · ${service.service}</span>
      <span>${missing.join(', ')}</span></p>`) : html`<p class="hint">Every planned service has its usual duties filled.</p>`}
  </section>`;
}

function workloadTable(stats) {
  const department = managedDepartment();
  const names = Object.keys(stats).filter(name => stats[name].total > 0 || data.members.includes(name))
    .filter(name => department === 'All' || legacyRoster(department).includes(name) ||
      roster(department).some(profile => profile.memberName === name));
  names.sort((a, b) => (stats[b].past8 + stats[b].upcoming) - (stats[a].past8 + stats[a].upcoming) || byTitle(a, b));
  return html`<section class="card">
    <h3 class="card-subtitle">Who is serving how much</h3>
    <p class="hint">Duty counts, busiest first (last 8 weeks plus upcoming).</p>
    <div class="table-wrap scroll-x" tabindex="0" role="region" aria-label="Who is serving how much"><table class="table">
      <thead><tr><th>Member</th><th>4 weeks</th><th>8 weeks</th><th>Upcoming</th><th>This year</th><th>Last served</th><th>Next</th></tr></thead>
      <tbody>${names.map(name => {
        const row = stats[name];
        return html`<tr class="${row.past8 + row.upcoming === 0 ? 'is-idle' : ''}"><td>${nameOf(name)}</td><td>${row.past4}</td><td>${row.past8}</td>
          <td>${row.upcoming}</td><td>${row.total}</td><td>${row.last ? shortDate(row.last) : '-'}</td><td>${row.next ? shortDate(row.next) : '-'}</td></tr>`;
      })}</tbody>
    </table></div>
  </section>`;
}

export function render() {
  departmentsShown().forEach(department => loadRoster(department.name));
  const stats = workload(data.services, data.members, todayISO());
  const visible = upcoming(data.services).filter(shownFor(managedDepartment()));
  return html`<h3 class="section-heading">Double duties</h3>
    ${conflicts(stats)}
    ${openDuties(visible)}
    ${workloadTable(stats)}`;
}

defineActions({
  'planning-assign': {
    allowed: el => canEditDuty(el.dataset.duty),
    run: el => {
      const service = data.services.find(item => serviceId(item) === el.dataset.service);
      const profile = profileOf(departmentOf(el.dataset.duty).name, el.dataset.uid);
      if (service && profile) assign(service, el.dataset.duty, profile);
    }
  },
  'planning-open': el => openService(el.dataset.service)
});
