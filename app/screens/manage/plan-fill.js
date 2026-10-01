/* Manage, Services: Fill. It proposes a member for each empty duty the
   service usually has; the leader checks the proposals, then saves or
   discards them together. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, readText, writeText } from '../../store.js';
import { render as redraw, renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { departmentOf } from '../../config/duties.js';
import { isUpcoming } from '../../lib/services.js';
import { todayISO } from '../../lib/dates.js';
import { workload } from '../../lib/workload.js';
import { fill, fillDuties, FILL_MODES } from '../../lib/fill.js';
import { canEditDuty } from '../../services/access.js';
import { roster, rosterLoaded, loadRoster } from '../../services/departments.js';
import { saveChanges, reasonText } from '../../services/planner.js';
import { departmentsShown, planMonth } from './scope.js';
import { keyOf, dutyDefaults } from './plan-cell.js';

/* How Fill chooses (Auto, Rotation or Random), remembered on this device. */
const fillMode = () => ui.plan.fillMode || readText('wds-fill-mode', 'auto');
export const proposalCount = () => Object.keys(ui.plan.proposals).length;

export function fillControls() {
  return html`<div class="fill-controls">
    <select data-change="plan-fill-mode" aria-label="How to fill">${FILL_MODES.map(([value, label]) => html`<option value="${value}"${fillMode() === value ? ' selected' : ''}>${label}</option>`)}</select>
    <button type="button" class="primary" data-act="plan-fill"${proposalCount() || ui.plan.busy ? ' disabled' : ''}>Fill empty duties</button></div>`;
}

export function fillBar() {
  const proposals = proposalCount();
  if (!proposals) return '';
  const unfilled = Object.keys(ui.plan.unfilled).length;
  return html`<div class="sticky-actions plan-actions" role="status">
    <span>Fill picked ${plural(proposals, 'member')}${unfilled ? '; ' + plural(unfilled, 'duty has', 'duties have') + ' no one free (outlined)' : ''}. Change any of them, then save.</span>
    <div class="button-row">
      <button type="button" class="primary" data-act="plan-save"${ui.plan.busy ? ' disabled' : ''}>${ui.plan.busy ? 'Saving…' : 'Save'}</button>
      <button type="button" class="ghost" data-act="plan-discard"${ui.plan.busy ? ' disabled' : ''}>Discard</button>
    </div>
  </div>`;
}

defineActions({
  'plan-fill-mode': el => { ui.plan.fillMode = el.value; writeText('wds-fill-mode', el.value); },
  'plan-fill': {
    allowed: () => departmentsShown().some(department => department.duties.some(canEditDuty)),
    run: () => {
      const departments = departmentsShown();
      const waiting = departments.filter(department => !rosterLoaded(department.name));
      if (waiting.length) {
        waiting.forEach(department => loadRoster(department.name, true));
        notice('The department lists are still loading. Try again in a moment.', true);
        return;
      }
      const editable = departments.flatMap(department => department.duties).filter(canEditDuty);
      const dutiesOf = fillDuties(data.services, todayISO());
      const services = data.services.filter(service => service.date.startsWith(planMonth()) && isUpcoming(service));
      const stats = workload(data.services, data.members, todayISO());
      const result = fill(services, service => dutiesOf(service).filter(duty => editable.includes(duty)), duty => roster(departmentOf(duty).name), stats,
        { mode: fillMode(), history: data.services, defaults: dutyDefaults() });
      ui.plan.proposals = {};
      result.proposals.forEach(item => { ui.plan.proposals[keyOf(item.serviceId, item.duty)] = { memberUid: item.memberUid, memberName: item.memberName }; });
      ui.plan.unfilled = {};
      result.unfilled.forEach(item => { ui.plan.unfilled[keyOf(item.serviceId, item.duty)] = item.reason; });
      if (!result.proposals.length) notice(result.unfilled.length ? 'No one is free for the empty duties this month. They are outlined.' : 'The usual duties this month are all filled.');
      redraw();
    }
  },
  'plan-save': async () => {
    const changes = Object.entries(ui.plan.proposals).map(([key, proposal]) => {
      const [id, duty] = key.split('|');
      return { serviceId: id, duty, memberUid: proposal.memberUid, expectedMemberName: '' };
    });
    if (!changes.length) return;
    ui.plan.busy = true;
    redraw();
    const result = await saveChanges(changes);
    ui.plan.busy = false;
    ui.plan.proposals = {};
    ui.plan.unfilled = {};
    const firstReason = result.skipped.find(item => item.reason !== 'error');
    const left = result.skipped.length === 1 ? '1 was' : result.skipped.length + ' were';
    notice('Saved ' + plural(result.saved, 'duty', 'duties') + '.' +
      (firstReason ? ' ' + left + ' not saved, for example because ' + reasonText(firstReason.reason) + '.' : ''), !!result.skipped.length);
    renderSoon();
  },
  'plan-discard': () => { ui.plan.proposals = {}; ui.plan.unfilled = {}; redraw(); }
});
