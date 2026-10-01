/* Manage, Services: one duty cell of the month planner, in the grid and in
   the phone list. Changing a duty saves it at once; changing a duty Fill
   proposed changes the proposal, which waits for Save. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, feature, nameOf } from '../../store.js';
import { render as redraw, renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { DUTY_DEFAULTS, departmentOf, dutyName, dutyDefault } from '../../config/duties.js';
import { serviceId, isUpcoming } from '../../lib/services.js';
import { hasDuty } from '../../lib/worship.js';
import { weekdayShort, dayOfMonth } from '../../lib/dates.js';
import { canTake } from '../../lib/availability.js';
import { openDoubleDuties, canAlsoServe, isUsher, prayerOf } from '../../lib/conflicts.js';
import { UNFILLED_REASONS } from '../../lib/fill.js';
import { canEditDuty } from '../../services/access.js';
import { roster, profileOf, departments as departmentState } from '../../services/departments.js';
import { saveChanges, reasonText } from '../../services/planner.js';
import { serviceById } from './scope.js';

const busy = new Set();
const KEEP = '__current';

export const keyOf = (id, duty) => id + '|' + duty;

/* A service's duties with the planner's proposals laid over them. */
export function planned(service) {
  const id = serviceId(service);
  const out = Object.assign({}, service.assignments);
  Object.entries(ui.plan.proposals).forEach(([key, proposal]) => {
    const [serviceKey, duty] = key.split('|');
    if (serviceKey === id) out[duty] = proposal.memberName;
  });
  return out;
}

/* Who may take `duty` at `service`, given the duties already held there:
   members who can take it then and may hold it with what they already do
   (one prayer with one usher duty at most). For an usher duty, anyone
   praying in that service comes first, as in Fill. */
export function choicesFor(service, duty, people, assignments) {
  const choices = people.filter(profile => canAlsoServe(assignments, profile.memberName, duty) && canTake(profile, service, duty));
  if (!isUsher(duty)) return choices;
  const praying = choices.filter(profile => prayerOf(assignments, profile.memberName));
  return praying.concat(choices.filter(profile => !praying.includes(profile)));
}

/* The default member of each duty that has one (Opening Prayer). */
export function dutyDefaults() {
  const out = {};
  Object.keys(DUTY_DEFAULTS).forEach(duty => { const name = dutyDefault(data.settings, duty); if (name) out[duty] = name; });
  return out;
}

/* A member's name in a duty list, with the prayer they also have there, or
   "default" for the default of the duty. */
export function choiceLabel(profile, duty, assignments) {
  const prayer = isUsher(duty) && prayerOf(assignments, profile.memberName);
  const note = prayer ? dutyName(prayer) : (dutyDefaults()[duty] === profile.memberName ? 'default' : '');
  return nameOf(profile.memberName) + (note ? ' (' + note + ')' : '');
}

/* A duty shows at a service that has it, or when someone already holds it. */
export const atService = (service, duty) => hasDuty(service, duty) || !!(service.assignments || {})[duty];

export function cell(service, duty, context) {
  const id = serviceId(service), key = keyOf(id, duty);
  const department = departmentOf(duty).name;
  const current = (service.assignments || {})[duty] || '';
  const proposal = ui.plan.proposals[key];
  const unusual = !context.usual(service).includes(duty);
  const classes = ['plan-cell'];
  if (proposal) classes.push('is-proposed');
  if (unusual && !current && !proposal) classes.push('is-unusual');
  if (!current && !hasDuty(service, duty)) return html`<td class="plan-cell is-none"><span class="sr-only">Not at this service</span></td>`;
  const label = dutyName(duty) + ', ' + weekdayShort(service.date) + ' ' + dayOfMonth(service.date) + ' ' + service.service;
  if (!isUpcoming(service) || !canEditDuty(duty)) {
    return html`<td class="${classes.concat('is-fixed').join(' ')}"><span class="plan-name">${current ? nameOf(current) : ''}</span></td>`;
  }
  const people = roster(department);
  if (!people.length) {
    return html`<td class="${classes.join(' ')}"><span class="plan-name">${current ? nameOf(current) : (departmentState.loading[department] ? '…' : '')}</span></td>`;
  }
  const assignments = planned(service);
  const choices = choicesFor(service, duty, people, assignments);
  // Who the cell shows: the proposal, else whoever holds the duty now. Someone
  // who holds it but could not be given it now stays shown, and flagged.
  const shown = proposal ? proposal.memberName : current;
  const chosen = shown && choices.find(profile => profile.memberName === shown);
  const flagged = !proposal && current && (!chosen ||
    (feature('conflictWarnings') && openDoubleDuties(service).some(item => item.name === current)));
  const unfilled = !shown && ui.plan.unfilled[key];
  if (flagged) classes.push('is-flagged');
  if (unfilled) classes.push('is-unfilled');
  if (busy.has(key)) classes.push('is-busy');
  const count = name => context.counts[name] ? ' · ' + context.counts[name] : '';
  const title = flagged ? nameOf(current) + ' cannot take this duty now, or has another duty in this service.'
    : (unfilled ? UNFILLED_REASONS[unfilled] + '.' : '');
  return html`<td class="${classes.join(' ')}"${title ? html` title="${title}"` : ''}>
    <select data-change="plan-assign" data-service="${id}" data-duty="${duty}" aria-label="${label + (title ? '. ' + title : '')}"${busy.has(key) || ui.plan.busy ? ' disabled' : ''}>
      <option value=""${shown ? '' : ' selected'}></option>
      ${shown && !chosen ? html`<option value="${KEEP}" selected>${nameOf(shown)}</option>` : ''}
      ${choices.map(profile => profile === chosen
        ? html`<option value="${profile.memberUid}" selected>${nameOf(profile.memberName)}</option>`
        : html`<option value="${profile.memberUid}">${choiceLabel(profile, duty, assignments)}${count(profile.memberName)}</option>`)}
    </select></td>`;
}

async function saveCell(service, duty, memberUid) {
  const key = keyOf(serviceId(service), duty);
  busy.add(key);
  renderSoon();
  const result = await saveChanges([{ serviceId: serviceId(service), duty, memberUid, expectedMemberName: (service.assignments || {})[duty] || '' }]);
  busy.delete(key);
  if (result.skipped.length && result.skipped[0].reason !== 'error') notice(dutyName(duty) + ' was not saved: ' + reasonText(result.skipped[0].reason) + '.', true);
  renderSoon();
}

defineActions({
  'plan-assign': {
    allowed: el => canEditDuty(el.dataset.duty),
    run: el => {
      const service = serviceById(el.dataset.service);
      if (!service || el.value === KEEP) return;
      const duty = el.dataset.duty, key = keyOf(el.dataset.service, duty);
      if (ui.plan.proposals[key]) {
        // A proposed duty changes the proposal; nothing is saved until Save.
        if (!el.value) delete ui.plan.proposals[key];
        else {
          const profile = profileOf(departmentOf(duty).name, el.value);
          if (profile) ui.plan.proposals[key] = { memberUid: profile.memberUid, memberName: profile.memberName };
        }
        redraw();
        return;
      }
      saveCell(service, duty, el.value);
    }
  }
});
