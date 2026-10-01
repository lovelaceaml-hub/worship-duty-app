/* Manage, Requests: members asking to be taken off a duty, for the
   department picked. Approving gives the duty to someone else in the same
   step, or leaves it open to fill later; the leader chooses which, and the
   button says what will happen. Declining keeps the member on the duty. The
   member is told either way. A request whose service was moved or deleted
   can only be closed; one whose service has started is past and leaves the
   list. */
import { html } from '../../html.js';
import { defineActions } from '../../actions.js';
import { data, ui, nameOf, canonical } from '../../store.js';
import { render as redraw, renderSoon } from '../../render.js';
import { notice } from '../../ui/banners.js';
import { statusChip, empty } from '../../ui/components.js';
import { departmentOf, dutyName } from '../../config/duties.js';
import { shortDate, shortStamp, todayISO } from '../../lib/dates.js';
import { isOpen, shownStatus, requestService } from '../../lib/requests.js';
import { workload, suggestReplacements } from '../../lib/workload.js';
import { problem } from '../../firebase.js';
import { roster, rosterLoaded, loadRoster, refreshRosters, departments as state } from '../../services/departments.js';
import { answerRequest } from '../../services/requests.js';
import { canResolveRequest } from '../../services/access.js';
import { managedDepartment } from './scope.js';

const OPEN = '__open';
const departmentOfRequest = request => request.department || (departmentOf(request.duty) || {}).name || '';
const choiceKey = id => 'request::' + id;

/* The requests this leader answers, for the department picked. */
function visible() {
  const department = managedDepartment();
  return data.requests.filter(canResolveRequest)
    .filter(request => department === 'All' || departmentOfRequest(request) === department)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/* What Approve does with the choice made. */
function approveLabel(choice, people) {
  if (choice === OPEN) return 'Approve, leave it open';
  const profile = people.find(item => item.memberUid === choice);
  return profile ? 'Approve, give it to ' + nameOf(profile.memberName) : 'Approve';
}

/* A request whose service is gone: the leader can only close it. */
function goneCard(request, working) {
  return html`<article class="card request">
    <div class="card-title-row"><h3 class="card-subtitle">${nameOf(request.name)} · ${dutyName(request.duty)}</h3>${statusChip('pending')}</div>
    <p class="hint">${request.worship} ${request.service}, ${shortDate(request.date)} · asked ${shortStamp(request.createdAt)}</p>
    ${request.note ? html`<blockquote class="note">${request.note}</blockquote>` : ''}
    <p class="card-note is-warning">This service was moved or deleted, so the request cannot be approved. Close it to tell ${nameOf(request.name)} it is answered.</p>
    <div class="button-row"><button type="button" class="ghost" data-act="request-close" data-id="${request.id}"${working ? ' disabled' : ''}>Close request</button></div>
  </article>`;
}

function openCard(request, stats) {
  const service = requestService(request, data.services);
  const working = state.busy[choiceKey(request.id)];
  if (!service) return goneCard(request, working);
  const department = departmentOfRequest(request);
  loadRoster(department);
  const loaded = rosterLoaded(department);
  const people = roster(department);
  const ranked = loaded ? suggestReplacements(service, request.duty, people, stats, { exclude: request.name, limit: Infinity }) : [];
  const choice = state.choices[choiceKey(request.id)] || '';
  const option = profile => html`<option value="${profile.memberUid}"${choice === profile.memberUid ? ' selected' : ''}>${nameOf(profile.memberName)}</option>`;
  return html`<article class="card request">
    <div class="card-title-row"><h3 class="card-subtitle">${nameOf(request.name)} · ${dutyName(request.duty)}</h3>${statusChip('pending')}</div>
    <p class="hint">${request.worship} ${request.service}, ${shortDate(request.date)} · asked ${shortStamp(request.createdAt)}</p>
    ${request.note ? html`<blockquote class="note">${request.note}</blockquote>` : ''}
    <form class="request-answer" data-act="request-approve" data-id="${request.id}">
      <label class="field"><span>Who takes ${dutyName(request.duty)}?</span>
        <select name="uid" data-change="request-choice" data-id="${request.id}"${working || !loaded ? ' disabled' : ''}>
          <option value=""${choice ? '' : ' selected'} disabled>${loaded ? 'Choose…' : 'Loading the ' + department + ' list…'}</option>
          <option value="${OPEN}"${choice === OPEN ? ' selected' : ''}>Leave it open for now</option>
          ${ranked.length ? html`<optgroup label="Suggested">${ranked.slice(0, 3).map(option)}</optgroup>` : ''}
          ${ranked.length > 3 ? html`<optgroup label="Others who can take it">${ranked.slice(3).map(option)}</optgroup>` : ''}
        </select></label>
      ${loaded && !ranked.length ? html`<p class="hint small">No one else in ${department} can take this duty then.</p>` : ''}
      <div class="button-row">
        <button type="submit" class="primary"${working || !choice ? ' disabled' : ''}>${working ? 'Saving…' : approveLabel(choice, people)}</button>
        <button type="button" class="link danger" data-act="request-decline" data-id="${request.id}"${working ? ' disabled' : ''}>Decline</button>
        <button type="button" class="ghost small" data-act="planning-open" data-service="${request.svcId}">Open service</button>
      </div>
    </form>
  </article>`;
}

export function render() {
  const list = visible();
  const open = list.filter(request => isOpen(request, data.services, canonical));
  const done = list.filter(request => !isOpen(request, data.services, canonical)).slice(0, 10);
  const stats = workload(data.services, data.members, todayISO());
  const showDone = !!ui.expanded['requests-done'];
  return html`
    ${open.length ? open.map(request => openCard(request, stats)) : empty('No requests waiting.')}
    ${done.length ? html`<button type="button" class="link" data-act="expand" data-key="requests-done">${showDone ? 'Hide answered and past requests' : 'Show answered and past requests'}</button>
      ${showDone ? done.map(request => html`<div class="list-item">
        <div class="list-item-head"><span>${nameOf(request.name)} · ${dutyName(request.duty)} · ${shortDate(request.date)}</span>${statusChip(shownStatus(request, data.services, canonical))}</div>
        ${request.resolvedAt ? html`<p class="hint small">Answered ${shortStamp(request.resolvedAt)}${request.resolvedByName ? ' by ' + nameOf(request.resolvedByName) : ''}</p>` : ''}
      </div>`) : ''}` : ''}`;
}

/* Opening Requests reads the lists of the departments with requests waiting. */
export function opened() {
  refreshRosters(Array.from(new Set(visible().filter(request => isOpen(request, data.services, canonical)).map(departmentOfRequest).filter(Boolean))));
}

async function answer(id, decision, choice, { closing = false } = {}) {
  const request = data.requests.find(item => item.id === id);
  if (!request || state.busy[choiceKey(id)]) return;
  const uid = choice && choice !== OPEN ? choice : '';
  const profile = uid && roster(departmentOfRequest(request)).find(item => item.memberUid === uid);
  state.busy[choiceKey(id)] = true;
  renderSoon();
  try {
    await answerRequest(request, decision, uid);
    delete state.choices[choiceKey(id)];
    notice(closing ? 'Request closed.' : decision === 'declined' ? 'Request declined. ' + nameOf(request.name) + ' stays on ' + dutyName(request.duty) + '.'
      : profile ? 'Approved. ' + nameOf(profile.memberName) + ' has ' + dutyName(request.duty) + ' now.'
        : 'Approved. ' + dutyName(request.duty) + ' is open now; fill it in the month plan.');
  } catch (error) {
    notice('That was not saved: ' + problem(error), true);
  }
  delete state.busy[choiceKey(id)];
  renderSoon();
}

const resolvable = el => canResolveRequest(data.requests.find(item => item.id === el.dataset.id));

defineActions({
  'request-choice': el => { state.choices[choiceKey(el.dataset.id)] = el.value; redraw(); },
  'request-approve': {
    allowed: resolvable,
    run: form => {
      const choice = state.choices[choiceKey(form.dataset.id)];
      if (choice) answer(form.dataset.id, 'approved', choice);
    }
  },
  'request-decline': {
    allowed: resolvable,
    run: el => { if (confirm('Decline this request? The member stays on the duty.')) answer(el.dataset.id, 'declined', ''); }
  },
  'request-close': {
    allowed: resolvable,
    run: el => { if (confirm('Close this request? The member is told it was answered.')) answer(el.dataset.id, 'declined', '', { closing: true }); }
  }
});
