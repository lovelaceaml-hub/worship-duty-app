/* Change requests. Members send them from My Duties; leaders answer them in
   Manage, Requests. Approving can hand the duty to someone else, or leave it
   open, in the same step (the server's resolveDutyAttention function). */
import { fb, call, write, problem } from '../firebase.js';
import { data, session, ui, canonical } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { isAdmin, managedDepartments, departmentForDuty } from './access.js';
import { serviceId } from '../lib/services.js';
import { requestId } from '../lib/requests.js';

let stopWatching = null;

/* Administrators see every request, leaders see their departments', and a
   member sees their own. */
export function watchRequests() {
  if (stopWatching) { stopWatching(); stopWatching = null; }
  data.requests = [];
  if (!fb.db || session.status !== 'verified') return;
  const requests = fb.collection(fb.db, 'requests');
  let source;
  if (isAdmin()) source = requests;
  else {
    const departments = managedDepartments().filter(department => department !== 'All');
    source = departments.length
      ? fb.query(requests, fb.where('department', 'in', departments.slice(0, 10)))
      : fb.query(requests, fb.where('requesterUid', '==', session.user ? session.user.uid : ''));
  }
  stopWatching = fb.onSnapshot(source, snapshot => {
    data.requests = snapshot.docs.map(doc => {
      const request = doc.data();
      request.name = canonical(request.name);
      return request;
    });
    renderSoon();
  }, error => console.warn('Requests are not available:', error));
}

export async function sendRequest(service, duty, note) {
  const createdAt = Date.now();
  const id = serviceId(service);
  const request = {
    id: requestId(id, duty, createdAt),
    name: ui.me,
    memberId: session.member.memberId,
    requesterUid: session.user ? session.user.uid : '',
    svcId: id,
    date: service.date,
    service: service.service,
    worship: service.worship || '',
    duty,
    department: departmentForDuty(duty),
    note: String(note || '').trim().slice(0, 500),
    status: 'pending',
    createdAt
  };
  data.requests.push(request);
  renderSoon();
  try {
    await write(() => fb.setDoc(fb.doc(fb.db, 'requests', request.id), request));
    notice('Your request was sent to your leader.');
  } catch (error) {
    data.requests = data.requests.filter(item => item !== request);
    notice('Your request was not sent: ' + problem(error), true);
  }
  renderSoon();
}

/* decision: 'approved' or 'declined'. For an approval, replacementUid picks
   who takes the duty; leave it empty to leave the duty open. */
export async function answerRequest(request, decision, replacementUid, acknowledgeConflict = false) {
  const payload = {
    departmentId: request.department || departmentForDuty(request.duty),
    serviceId: request.svcId,
    duty: request.duty,
    requestId: request.id,
    decision
  };
  if (decision === 'approved' && replacementUid) payload.replacementMemberUid = replacementUid;
  if (acknowledgeConflict) payload.acknowledgeConflict = true;
  return call('resolveDutyAttention', payload);
}

/* Fill or open a duty flagged "needs replacement" without a request. */
export async function replaceDuty(service, duty, replacementUid, acknowledgeConflict = false) {
  const payload = { departmentId: departmentForDuty(duty), serviceId: serviceId(service), duty };
  if (replacementUid) payload.replacementMemberUid = replacementUid;
  if (acknowledgeConflict) payload.acknowledgeConflict = true;
  return call('resolveDutyAttention', payload);
}
