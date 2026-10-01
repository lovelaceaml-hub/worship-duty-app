/* Manage, Services: a service's details, opened from its heading in the
   month planner. Date, time, worship and choir song, "needs a replacement"
   flags, double duties, each duty of the departments shown, an
   administrator's override with a reason, and delete. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, feature, nameOf } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { departmentOf, dutyName } from '../../config/duties.js';
import { serviceId } from '../../lib/services.js';
import { hasChoir } from '../../lib/worship.js';
import { longDate, todayISO } from '../../lib/dates.js';
import { openDoubleDuties, doubleDuties, isMarkedOk } from '../../lib/conflicts.js';
import { workload, suggestReplacements } from '../../lib/workload.js';
import { isAdmin, canEditDuty, canEditSongsFor, canAcknowledgeConflict } from '../../services/access.js';
import { roster, profileNamed, profileOf, assign, unassign, departments as departmentState } from '../../services/departments.js';
import { updateService, deleteService, markDoubleDuty } from '../../services/schedule.js';
import { replaceDuty } from '../../services/requests.js';
import { problem } from '../../firebase.js';
import { departmentsShown, serviceById } from './scope.js';
import { choicesFor, choiceLabel, atService } from './plan-cell.js';

function dutySelect(service, duty) {
  const department = departmentOf(duty).name;
  const people = roster(department);
  const current = (service.assignments || {})[duty] || '';
  const currentProfile = profileNamed(department, current);
  const assignments = service.assignments || {};
  const choices = choicesFor(service, duty, people, assignments);
  const flagged = feature('conflictWarnings') && current && openDoubleDuties(service).some(item => item.name === current);
  const busyNow = departmentState.busy[serviceId(service) + '::' + duty];
  let options;
  if (!people.length) options = html`<option value="" selected disabled>${departmentState.loading[department] ? 'Loading…' : 'Roster not loaded'}</option>`;
  else {
    options = html`<option value="">Not filled</option>
      ${current && !choices.some(profile => profile.memberName === current) ? html`<option value="" selected disabled>${nameOf(current)} (cannot take this now)</option>` : ''}
      ${choices.map(profile => html`<option value="${profile.memberUid}"${currentProfile && currentProfile.memberUid === profile.memberUid ? ' selected' : ''}>${choiceLabel(profile, duty, assignments)}</option>`)}`;
  }
  const others = people.filter(profile => !choices.includes(profile));
  return html`<select data-change="assign" data-service="${serviceId(service)}" data-duty="${duty}" aria-label="${dutyName(duty)}"
      class="${flagged ? 'is-flagged' : ''}"${busyNow || !canEditDuty(duty) ? ' disabled' : ''}>${options}</select>
    ${isAdmin() && others.length ? html`<details class="override">
      <summary>Assign someone else</summary>
      <p class="hint">For someone who normally could not take this duty now. Give a reason; it is kept with the change.</p>
      <form class="inline-form" data-act="assign-override" data-service="${serviceId(service)}" data-duty="${duty}">
        <select name="uid" aria-label="Member">${people.map(profile => html`<option value="${profile.memberUid}">${nameOf(profile.memberName)}</option>`)}</select>
        <input type="text" name="reason" maxlength="240" placeholder="Reason" aria-label="Reason" required>
        <button type="submit" class="ghost small">Assign</button>
      </form>
    </details>` : ''}`;
}

function replacementPanel(service) {
  const flags = Object.entries(service.needsReplacement || {})
    .filter(([duty, marker]) => (service.assignments || {})[duty] === (marker && marker.memberName) && canEditDuty(duty));
  if (!flags.length) return '';
  const stats = workload(data.services, data.members, todayISO());
  return html`<div class="replacements">${flags.map(([duty, marker]) => {
    const department = departmentOf(duty).name;
    const suggestions = suggestReplacements(service, duty, roster(department), stats, { exclude: marker.memberName, limit: 5 });
    return html`<form class="card-note is-warning" data-act="replace-duty" data-service="${serviceId(service)}" data-duty="${duty}">
      <p><strong>${nameOf(marker.memberName)}</strong> can no longer make ${dutyName(duty)}.</p>
      <div class="inline-form">
        <select name="uid" aria-label="Replacement for ${dutyName(duty)}"><option value="">Leave ${dutyName(duty)} open</option>
          ${suggestions.map(profile => html`<option value="${profile.memberUid}">${nameOf(profile.memberName)}</option>`)}</select>
        <button type="submit" class="ghost small">Save</button>
      </div>
    </form>`;
  })}</div>`;
}

function doubleDutyNotes(service) {
  if (!feature('conflictWarnings')) return '';
  const acknowledge = conflict => canAcknowledgeConflict(Object.assign({}, conflict, { serviceId: serviceId(service), date: service.date, service: service.service }));
  return doubleDuties(service).filter(acknowledge).map(conflict => isMarkedOk(service, conflict)
    ? html`<p class="card-note">${nameOf(conflict.name)} has ${conflict.duties.map(dutyName).join(' and ')} (marked OK).
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="false">Show the warning again</button></p>`
    : html`<p class="card-note is-warning">${nameOf(conflict.name)} has ${conflict.duties.map(dutyName).join(' and ')} in this service.
        <button type="button" class="link" data-act="double-duty" data-service="${serviceId(service)}" data-name="${conflict.name}" data-ok="true">Mark OK</button></p>`);
}

export function details(service) {
  const id = serviceId(service);
  const admin = isAdmin();
  const field = (label, input) => html`<label class="field"><span>${label}</span>${input}</label>`;
  return html`<div class="service-editor plan-detail" data-service="${id}">
    <div class="card-title-row"><h3 class="card-subtitle">${longDate(service.date)} · ${service.worship || 'Service'} ${service.service}</h3>
      <button type="button" class="link" data-act="plan-close">Close</button></div>
    <div class="field-grid">
      ${field('Date', html`<input type="date" value="${service.date}" data-change="service-field" data-service="${id}" data-field="date"${admin ? '' : ' disabled'}>`)}
      ${field('Time', html`<input type="time" value="${service.time}" data-change="service-field" data-service="${id}" data-field="time"${admin ? '' : ' disabled'}>`)}
      ${field('Worship', html`<input type="text" value="${service.worship}" list="worship-types" data-change="service-field" data-service="${id}" data-field="worship"${admin ? '' : ' disabled'}>`)}
      ${canEditSongsFor(service) && (hasChoir(service.worship || 'Sabbath Day') || service.choirSong) ? field('Choir song', html`<input type="text" value="${service.choirSong || ''}" placeholder="#311 I Repent of My Sin" data-change="service-field" data-service="${id}" data-field="choirSong">`) : ''}
    </div>
    ${replacementPanel(service)}
    ${doubleDutyNotes(service)}
    ${departmentsShown().map(department => html`<div class="duty-group" style="--dept: ${department.color}">
      <h4 class="duty-group-name">${department.name}</h4>
      <div class="field-grid">${department.duties.filter(duty => atService(service, duty)).map(duty => html`<label class="field"><span>${dutyName(duty)}</span>${dutySelect(service, duty)}</label>`)}</div>
    </div>`)}
    ${admin ? html`<div class="right"><button type="button" class="link danger" data-act="service-delete" data-service="${id}">Delete this service</button></div>` : ''}
  </div>`;
}

defineActions({
  'service-field': {
    allowed: el => el.dataset.field === 'choirSong' ? canEditSongsFor(serviceById(el.dataset.service)) : isAdmin(),
    run: el => {
      const service = serviceById(el.dataset.service);
      if (!service) return;
      const value = el.value.trim();
      if (!value && el.dataset.field !== 'choirSong') { redraw(); return; }
      if (el.dataset.field === 'date' || el.dataset.field === 'service') {
        const moved = Object.assign({}, service, { [el.dataset.field]: value });
        Object.assign(ui.plan, { open: serviceId(moved), month: moved.date.slice(0, 7) });
      }
      updateService(service, el.dataset.field, value);
    }
  },
  'service-delete': {
    allowed: () => isAdmin(),
    run: el => {
      const service = serviceById(el.dataset.service);
      if (service && confirm('Delete the ' + service.service + ' service on ' + service.date + '? Its duties are deleted with it.')) {
        ui.plan.open = '';
        deleteService(service);
      }
    }
  },
  assign: {
    allowed: el => canEditDuty(el.dataset.duty),
    run: el => {
      const service = serviceById(el.dataset.service);
      if (!service) return;
      if (!el.value) { unassign(service, el.dataset.duty); return; }
      const profile = profileOf(departmentOf(el.dataset.duty).name, el.value);
      if (profile) assign(service, el.dataset.duty, profile);
    }
  },
  'assign-override': {
    allowed: () => isAdmin(),
    run: form => {
      const service = serviceById(form.dataset.service);
      const values = new FormData(form);
      const profile = service && profileOf(departmentOf(form.dataset.duty).name, values.get('uid'));
      const reason = String(values.get('reason') || '').trim();
      if (!profile || !reason) { notice('Choose a member and give a reason.', true); return; }
      assign(service, form.dataset.duty, profile, { override: true, reason });
    }
  },
  'double-duty': {
    allowed: el => {
      const service = serviceById(el.dataset.service);
      const conflict = service && doubleDuties(service).find(item => item.name === el.dataset.name);
      return !!conflict && canAcknowledgeConflict(Object.assign({}, conflict, { serviceId: el.dataset.service, date: service.date, service: service.service }));
    },
    run: el => {
      const service = serviceById(el.dataset.service);
      if (service) markDoubleDuty(service, el.dataset.name, el.dataset.ok === 'true');
    }
  },
  'replace-duty': {
    allowed: form => canEditDuty(form.dataset.duty),
    run: async form => {
      const service = serviceById(form.dataset.service);
      if (!service) return;
      const uid = String(new FormData(form).get('uid') || '');
      try {
        await replaceDuty(service, form.dataset.duty, uid);
        notice(uid ? 'Replacement saved.' : dutyName(form.dataset.duty) + ' is open now.');
      } catch (error) {
        notice('That was not saved: ' + problem(error), true);
      }
    }
  }
});
