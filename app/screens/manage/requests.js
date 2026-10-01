/* Manage, Requests: members asking to be taken off a duty. Approving can
   give the duty to someone else in the same step, or leave it open to fill
   later. Declining keeps the member on the duty. The member is told either
   way. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, nameOf, canonical } from '../../store.js';
import { renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { statusChip, empty } from '../../ui/components.js';
import { departmentOf, dutyName } from '../../config/duties.js';
import { shortDate, todayISO } from '../../lib/dates.js';
import { isOpen, shownStatus, requestService } from '../../lib/requests.js';
import { workload, suggestReplacements } from '../../lib/workload.js';
import { problem } from '../../firebase.js';
import { roster, loadRoster } from '../../services/departments.js';
import { answerRequest } from '../../services/requests.js';
import { canResolveRequest } from '../../services/access.js';

const busy = new Set();

function openCard(request, stats) {
  const service = requestService(request, data.services);
  const department = request.department || (departmentOf(request.duty) || {}).name;
  if (department) loadRoster(department);
  const choices = service ? suggestReplacements(service, request.duty, roster(department), stats, { exclude: request.name, limit: 8 }) : [];
  const working = busy.has(request.id);
  return html`<article class="card request">
    <div class="card-title-row"><h3 class="card-subtitle">${nameOf(request.name)} · ${dutyName(request.duty)}</h3>${statusChip('pending')}</div>
    <p class="hint">${request.worship} ${request.service}, ${shortDate(request.date)} · asked ${new Date(request.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
    ${request.note ? html`<blockquote class="note">${request.note}</blockquote>` : ''}
    <form class="request-answer" data-act="request-approve" data-id="${request.id}">
      <label class="field"><span>Who takes ${dutyName(request.duty)}?</span>
        <select name="uid"${working ? ' disabled' : ''}>
          <option value="">Leave it open for now</option>
          ${choices.map(profile => html`<option value="${profile.memberUid}">${nameOf(profile.memberName)}</option>`)}
        </select></label>
      <div class="button-row">
        <button type="submit" class="primary"${working ? ' disabled' : ''}>Approve</button>
        <button type="button" class="link danger" data-act="request-decline" data-id="${request.id}"${working ? ' disabled' : ''}>Decline</button>
        ${service ? html`<button type="button" class="ghost small" data-act="planning-open" data-service="${request.svcId}">Open service</button>` : ''}
      </div>
      ${!choices.length && service ? html`<p class="hint small">No one else in ${department} is free for this duty.</p>` : ''}
    </form>
  </article>`;
}

export function render() {
  const visible = data.requests.filter(canResolveRequest).sort((a, b) => b.createdAt - a.createdAt);
  const open = visible.filter(request => isOpen(request, data.services, canonical));
  const done = visible.filter(request => !isOpen(request, data.services, canonical)).slice(0, 10);
  const stats = workload(data.services, data.members, todayISO());
  const showDone = !!ui.expanded['requests-done'];
  return html`
    ${open.length ? open.map(request => openCard(request, stats)) : empty('No requests waiting.')}
    ${done.length ? html`<button type="button" class="link" data-act="expand" data-key="requests-done">${showDone ? 'Hide answered requests' : 'Show answered requests'}</button>
      ${showDone ? done.map(request => html`<div class="list-item">
        <div class="list-item-head"><span>${nameOf(request.name)} · ${dutyName(request.duty)} · ${shortDate(request.date)}</span>${statusChip(shownStatus(request, data.services, canonical))}</div>
        ${request.resolvedAt ? html`<p class="hint small">Answered ${new Date(request.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${request.resolvedByName ? ' by ' + nameOf(request.resolvedByName) : ''}</p>` : ''}
      </div>`) : ''}` : ''}`;
}

async function answer(id, decision, uid) {
  const request = data.requests.find(item => item.id === id);
  if (!request || busy.has(id)) return;
  busy.add(id);
  renderSoon();
  try {
    await answerRequest(request, decision, uid);
    notice(decision === 'declined' ? 'Request declined.' : uid ? 'Approved. The duty has a new person.' : 'Approved. The duty is open now.');
  } catch (error) {
    notice('That was not saved: ' + problem(error), true);
  }
  busy.delete(id);
  renderSoon();
}

defineActions({
  'request-approve': {
    allowed: form => canResolveRequest(data.requests.find(item => item.id === form.dataset.id)),
    run: form => answer(form.dataset.id, 'approved', String(new FormData(form).get('uid') || ''))
  },
  'request-decline': {
    allowed: el => canResolveRequest(data.requests.find(item => item.id === el.dataset.id)),
    run: el => { if (confirm('Decline this request? The member stays on the duty.')) answer(el.dataset.id, 'declined', ''); }
  }
});
