/* Manage, month plan: Fill. It reads the department lists again, then
   proposes a member for each empty duty the services usually have; the
   leader checks the proposals (they show in blue), then saves or discards
   them together. The bar under the month says how many duties and people,
   which ushers also pray there, and which duties no one is free for. */
import { html, plural } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, nameOf, readText, writeText } from '../../store.js';
import { render as redraw } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { departmentOf, dutyName } from '../../config/duties.js';
import { isUpcoming } from '../../lib/services.js';
import { todayISO, shortDate } from '../../lib/dates.js';
import { isUsher, prayerOf } from '../../lib/conflicts.js';
import { workload } from '../../lib/workload.js';
import { fill, fillDuties, FILL_MODES } from '../../lib/fill.js';
import { reasonNote } from '../../lib/reasons.js';
import { canEditDuty } from '../../services/access.js';
import { roster, refreshRosters } from '../../services/departments.js';
import { propose, proposals, proposalCount, waitingScope, saveProposals, discardProposals } from '../../services/planner.js';
import { departmentsShown, planMonth, currentScope, scopeName, serviceById, setManagedDepartment } from './scope.js';
import { dutyDefaults, planned } from './plan-cell.js';

/* How Fill chooses (Auto, Rotation or Random), remembered on this device. */
const fillMode = () => ui.plan.fillMode || readText('wds-fill-mode', 'auto');
const mode = () => FILL_MODES.find(([value]) => value === fillMode()) || FILL_MODES[0];

export function fillControls() {
  const busy = ui.plan.busy || ui.plan.filling;
  return html`<div class="fill-controls">
    <label class="fill-mode"><span>Fill by</span>
      <select data-change="plan-fill-mode">${FILL_MODES.map(([value, label]) => html`<option value="${value}"${mode()[0] === value ? ' selected' : ''}>${label}</option>`)}</select></label>
    <button type="button" class="primary" data-act="plan-fill"${proposalCount() || busy ? ' disabled' : ''}>${ui.plan.filling ? 'Reading the lists…' : 'Fill empty duties'}</button>
  </div>`;
}

/* One line under the toolbar: what the chosen way does, and what Fill fills. */
export function fillHint() {
  return html`<p class="hint fill-hint">${mode()[2]} Fill fills the empty duties these services usually have, and changes nothing until you save.</p>`;
}

/* The proposals as the bar counts them: duties, people, and ushers who also
   pray in that service. */
function tally() {
  const waiting = proposals();
  const people = new Set(), pairs = new Set();
  Object.entries(waiting).forEach(([key, proposal]) => {
    people.add(proposal.memberName);
    const [id, duty] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
    const service = serviceById(id);
    if (service && isUsher(duty) && prayerOf(planned(service, { proposals: waiting }), proposal.memberName)) pairs.add(key);
  });
  return { duties: Object.keys(waiting).length, people: people.size, pairs: pairs.size };
}

export function fillBar() {
  if (!proposalCount()) return '';
  const scope = waitingScope();
  const here = scope && scope.department === currentScope().department && scope.month === currentScope().month;
  const busy = ui.plan.busy;
  const buttons = html`<div class="button-row">
    ${here ? html`<button type="button" class="primary" data-act="plan-save"${busy ? ' disabled' : ''}>${busy ? 'Saving…' : 'Save'}</button>`
      : html`<button type="button" class="primary" data-act="plan-show">Show them</button>`}
    <button type="button" class="ghost" data-act="plan-discard"${busy ? ' disabled' : ''}>Discard</button>
  </div>`;
  if (!here) {
    return html`<div class="sticky-actions plan-actions" role="status">
      <span>${plural(proposalCount(), 'filled duty is', 'filled duties are')} waiting in ${scopeName(scope)}.</span>${buttons}</div>`;
  }
  const count = tally();
  const unfilled = Object.keys(ui.plan.unfilled).length;
  const notes = [];
  if (count.pairs) notes.push(plural(count.pairs, 'usher also prays', 'ushers also pray') + ' there.');
  if (unfilled) notes.push(plural(unfilled, 'duty has', 'duties have') + ' no one free.');
  return html`<div class="sticky-actions plan-actions" role="status">
    <span><strong>Fill proposed ${plural(count.duties, 'duty', 'duties')} for ${plural(count.people, 'person', 'people')}.</strong>
      ${notes.join(' ')} Check them, then save.</span>${buttons}</div>`;
}

/* "Usher Door on Sat, Jul 18 Morning (S. Leah: not available then)" for each
   duty the save skipped, at most four. */
function skippedList(skipped) {
  const words = skipped.slice(0, 4).map(item => {
    const service = serviceById(item.serviceId);
    const where = service ? shortDate(service.date) + ' ' + service.service : item.serviceId;
    const why = item.reason === 'already-serving' && Array.isArray(item.duties) && item.duties.length
      ? 'already ' + item.duties.map(dutyName).join(' and ') + ' there' : reasonNote(item.reason);
    return dutyName(item.duty) + ' on ' + where + ' (' + (item.memberName ? nameOf(item.memberName) + ': ' : '') + why + ')';
  });
  if (skipped.length > 4) words.push('and ' + plural(skipped.length - 4, 'more'));
  return words.join('; ');
}

defineActions({
  'plan-fill-mode': el => { ui.plan.fillMode = el.value; writeText('wds-fill-mode', el.value); redraw(); },
  'plan-fill': {
    allowed: () => departmentsShown().some(department => department.duties.some(canEditDuty)),
    run: async () => {
      if (proposalCount() || ui.plan.filling) return;
      const scope = currentScope();
      const departments = departmentsShown().filter(department => department.duties.some(canEditDuty));
      // The lists as they are now: a member may have marked a day off since.
      ui.plan.filling = true;
      redraw();
      await refreshRosters(departments.map(department => department.name));
      ui.plan.filling = false;
      const now = currentScope();
      if (now.department !== scope.department || now.month !== scope.month) { redraw(); return; }
      const ready = departments.filter(department => roster(department.name).length);
      const left = departments.filter(department => !roster(department.name).length).map(department => department.name);
      const leftNote = left.length ? ' Fill skipped ' + left.join(', ') + ': no one is on ' + (left.length === 1 ? 'its list' : 'their lists') + ' yet, or ' + (left.length === 1 ? 'it' : 'they') + ' did not load.' : '';
      if (!ready.length) { notice('Fill needs people on the department list.' + leftNote, true); redraw(); return; }
      const editable = ready.flatMap(department => department.duties).filter(canEditDuty);
      const dutiesOf = fillDuties(data.services, todayISO());
      const services = data.services.filter(service => service.date.startsWith(planMonth()) && isUpcoming(service));
      const stats = workload(data.services, data.members, todayISO());
      const result = fill(services, service => dutiesOf(service).filter(duty => editable.includes(duty)), duty => roster(departmentOf(duty).name), stats,
        { mode: fillMode(), history: data.services, defaults: dutyDefaults() });
      propose(result, scope);
      if (result.proposals.length) ui.plan.scrollTo = 'proposal';
      if (!result.proposals.length) notice((result.unfilled.length ? 'No one is free for the empty duties this month. They are marked in amber with the reason.' : 'The usual duties this month are all filled.') + leftNote, !!left.length);
      else if (leftNote) notice(leftNote.trim(), true);
      redraw();
    }
  },
  'plan-save': async () => {
    const result = await saveProposals();
    if (!result) return;
    // Redraw now, so the month shows what was saved before the message says so.
    redraw();
    const total = result.saved.length + result.skipped.length;
    const skipped = result.skipped.filter(item => item.reason !== 'error');
    const failed = result.failed.map(item => item.departmentId + ' was not saved: ' + item.message + ' Its filled duties are still here; press Save to try again.');
    if (!result.skipped.length) notice('Saved ' + plural(result.saved.length, 'duty', 'duties') + '.');
    else notice((result.saved.length ? 'Saved ' + result.saved.length + ' of ' + plural(total, 'duty', 'duties') + '.' : 'Nothing was saved.') +
      (skipped.length ? ' Not saved: ' + skippedList(skipped) + '.' : '') + (failed.length ? ' ' + failed.join(' ') : ''), true);
  },
  'plan-discard': () => {
    const count = proposalCount();
    if (count > 3 && !confirm('Discard the ' + plural(count, 'filled duty', 'filled duties') + '? Nothing was saved yet.')) return;
    discardProposals();
    redraw();
  },
  'plan-show': () => {
    const scope = waitingScope();
    if (!scope) return;
    ui.plan.month = scope.month;
    if (scope.department !== currentScope().department) setManagedDepartment(scope.department);
    ui.manage = 'services';
    redraw();
  }
});
