/* Manage, Checks: double duties to sort out (with people who could take one
   of the duties instead), duties the services of the next four weeks
   usually have that are still empty, and how much each member is serving. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, nameOf } from '../../store.js';
import { empty } from '../../ui/components.js';
import { notice } from '../../ui/banners.js';
import { departmentOf, dutyName } from '../../config/duties.js';
import { upcoming, serviceId } from '../../lib/services.js';
import { shortDate, todayISO, addDays } from '../../lib/dates.js';
import { workload, suggestReplacements, recentLoad } from '../../lib/workload.js';
import { fillDuties } from '../../lib/fill.js';
import { byTitle } from '../../lib/names.js';
import { roster, profileOf, loadRoster, refreshRosters, legacyRoster } from '../../services/departments.js';
import { saveDuty } from '../../services/planner.js';
import { openConflicts } from '../../services/attention.js';
import { canEditDuty } from '../../services/access.js';
import { managedDepartment, shownFor, departmentsShown, serviceById } from './scope.js';

function conflicts(stats) {
  const list = openConflicts().filter(item => shownFor(managedDepartment())(item.service));
  if (!list.length) return empty('No double duties to sort out.');
  return html`<div class="card conflict-list">${list.map(({ service, conflict }) => html`<article class="conflict">
    <div class="conflict-head">
      <h3 class="conflict-who">${nameOf(conflict.name)} <span>${conflict.duties.map(dutyName).join(' + ')}</span></h3>
      <button type="button" class="link small" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="true">Mark OK</button>
    </div>
    <button type="button" class="link small conflict-when" data-act="planning-open" data-service="${serviceId(service)}">${shortDate(service.date)} · ${service.worship} ${service.service}</button>
    ${conflict.duties.filter(canEditDuty).map(duty => {
      const options = suggestReplacements(service, duty, roster(departmentOf(duty).name), stats, { exclude: conflict.name, limit: 2 });
      return html`<div class="conflict-swap"><span class="conflict-duty">Give ${dutyName(duty)} to</span>
        ${options.length ? options.map(profile => html`<button type="button" class="chip" data-act="planning-assign"
          data-service="${serviceId(service)}" data-duty="${duty}" data-uid="${profile.memberUid}">${nameOf(profile.memberName)}</button>`)
          : html`<span class="hint">no one else can take it then</span>`}</div>`;
    })}
  </article>`)}</div>`;
}

/* Empty duties of the next four weeks that services like these usually
   have (the duties Fill fills), services not planned yet included. */
function openDuties(visible) {
  const usual = fillDuties(data.services, todayISO());
  const horizon = addDays(todayISO(), 28);
  const own = new Set(departmentsShown().flatMap(department => department.duties));
  const rows = visible.filter(service => service.date <= horizon).map(service => {
    const assignments = service.assignments || {};
    const missing = usual(service).filter(duty => own.has(duty) && !assignments[duty]);
    return missing.length ? { service, missing } : null;
  }).filter(Boolean);
  return html`<section class="card">
    <h3 class="card-subtitle">Not filled, next 4 weeks</h3>
    <p class="hint">Duties services like these usually have. Fill them in the month plan.</p>
    ${rows.length ? rows.map(({ service, missing }) => html`<p class="open-duty"><button type="button" class="link open-duty-when" data-act="planning-open" data-service="${serviceId(service)}">${shortDate(service.date)} · ${service.service}</button>
      <span>${missing.map(dutyName).join(', ')}</span></p>`) : html`<p class="hint">Every service in the next 4 weeks has its usual duties filled.</p>`}
  </section>`;
}

function workloadTable(stats) {
  const department = managedDepartment();
  const year = todayISO().slice(0, 4);
  const thisYear = {};
  data.services.forEach(service => {
    if (!service.date.startsWith(year) || service.date >= todayISO()) return;
    Object.values(service.assignments || {}).forEach(name => { if (name) thisYear[name] = (thisYear[name] || 0) + 1; });
  });
  const names = Object.keys(stats).filter(name => stats[name].total > 0 || data.members.includes(name))
    .filter(name => department === 'All' || legacyRoster(department).includes(name) ||
      roster(department).some(profile => profile.memberName === name));
  names.sort((a, b) => recentLoad(stats, b) - recentLoad(stats, a) || byTitle(a, b));
  return html`<section class="card">
    <h3 class="card-subtitle">Who is serving how much</h3>
    <p class="hint">Duties each member has, busiest first (the last 8 weeks plus the ones coming up).</p>
    <div class="table-wrap scroll-x" tabindex="0" role="region" aria-label="Who is serving how much"><table class="table">
      <thead><tr><th>Member</th><th>4 weeks</th><th>8 weeks</th><th>Coming up</th><th>So far in ${year}</th><th>Last served</th><th>Next</th></tr></thead>
      <tbody>${names.map(name => {
        const row = stats[name];
        return html`<tr class="${recentLoad(stats, name) === 0 ? 'is-idle' : ''}"><td>${nameOf(name)}</td><td>${row.past4}</td><td>${row.past8}</td>
          <td>${row.upcoming}</td><td>${thisYear[name] || 0}</td><td>${row.last ? shortDate(row.last) : '-'}</td><td>${row.next ? shortDate(row.next) : '-'}</td></tr>`;
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

/* Opening Checks reads the department lists again. */
export function opened() { refreshRosters(departmentsShown().map(department => department.name)); }

defineActions({
  'planning-assign': {
    allowed: el => canEditDuty(el.dataset.duty),
    run: el => {
      const service = serviceById(el.dataset.service);
      const profile = profileOf(departmentOf(el.dataset.duty).name, el.dataset.uid);
      if (!service || !profile) return;
      const holder = (service.assignments || {})[el.dataset.duty] || '';
      if (!confirm('Give ' + dutyName(el.dataset.duty) + ' on ' + shortDate(service.date) + ' ' + service.service + ' to ' + nameOf(profile.memberName) + '?' +
        (holder ? ' ' + nameOf(holder) + ' comes off it.' : ''))) return;
      saveDuty(service, el.dataset.duty, profile).then(saved => {
        if (saved) notice(nameOf(profile.memberName) + ' has ' + dutyName(el.dataset.duty) + ' on ' + shortDate(service.date) + ' now.');
      });
    }
  }
});
