/* Change requests. Members send them from My Duties and may withdraw one
   while it waits; leaders answer them in Manage, Requests. Approving can hand
   the duty to someone else, or leave it open, in the same step (the
   server's resolveDutyAttention function). */
import { fb, call, write, problem } from '../firebase.js';
import { data, session, ui, canonical } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { departmentForDuty } from './access.js';
import { serviceId } from '../lib/services.js';
import { requestId } from '../lib/requests.js';
import { dutyName } from '../config/duties.js';

let stopWatching = [];
let results = [];          // one list of requests per listener
const sending = new Map(); // id -> request written but not yet back from a listener

/* What the sign-in token lets this member read, the same test the
   security rules make: an administrator reads every request, a department
   leader the requests of the departments in their token, and everyone their
   own. Deriving it from anything else (the leader list in app/leaderConfig)
   can ask for a department the rules refuse, and Firestore then refuses the
   whole query. */
function readScope(member) {
  const roles = Array.isArray(member.roles) ? member.roles : [];
  const permissions = Array.isArray(member.permissions) ? member.permissions : [];
  const admin = member.admin === true || member.role === 'admin' || roles.includes('admin');
  const leader = member.departmentLeader === true || member.role === 'departmentLeader' || roles.includes('departmentLeader') ||
    permissions.includes('department.manage') || permissions.includes('schedule.assign');
  const listed = leader ? [].concat(member.departments || [], member.departmentIds || []) : [];
  const map = member.departmentLeaders && typeof member.departmentLeaders === 'object' ? member.departmentLeaders : {};
  const departments = Array.from(new Set(listed.concat(Object.keys(map).filter(name => map[name] === true))))
    .filter(name => typeof name === 'string' && name);
  return { admin, departments };
}

/* Requests from every listener, each once, plus any still being sent. */
function merge() {
  const byId = new Map();
  results.forEach(list => list.forEach(request => byId.set(request.id, request)));
  sending.forEach((request, id) => { if (!byId.has(id)) byId.set(id, request); });
  data.requests = Array.from(byId.values());
}

/* Administrators see every request, leaders their departments' and their
   own in any department, and a member their own. Called at every sign-in
   and token change, so the scope follows the member's roles. */
let watching = ''; // who the listeners are for; '' when there are none
export function watchRequests() {
  // A sign-in reaches here twice (the auth observer and the sign-in itself):
  // listeners already running for this member, session and scope stay.
  const member = session.status === 'verified' && fb.db ? session.member : null;
  const key = member ? JSON.stringify([session.user ? session.user.uid : '', member.memberName, member.roleVersion, readScope(member)]) : '';
  if (key && key === watching) return;
  watching = key;
  stopWatching.forEach(stop => stop());
  stopWatching = [];
  results = [];
  sending.clear();
  data.requests = [];
  if (!fb.db || session.status !== 'verified' || !session.member) return;
  const requests = fb.collection(fb.db, 'requests');
  const scope = readScope(session.member);
  const sources = [];
  if (scope.admin) sources.push({ query: requests, wide: true });
  // An 'in' query takes a limited number of values: ten departments each.
  else for (let from = 0; from < scope.departments.length; from += 10) {
    sources.push({ query: fb.query(requests, fb.where('department', 'in', scope.departments.slice(from, from + 10))), wide: true });
  }
  sources.push({ query: fb.query(requests, fb.where('requesterUid', '==', session.user ? session.user.uid : '')), wide: false });
  sources.forEach((source, index) => {
    results[index] = [];
    stopWatching.push(fb.onSnapshot(source.query, snapshot => {
      results[index] = snapshot.docs.map(doc => {
        const request = Object.assign({ id: doc.id }, doc.data());
        request.name = canonical(request.name);
        return request;
      });
      merge();
      renderSoon();
    }, error => {
      console.warn('Requests are not available:', error);
      watching = ''; // the next sign-in or token change starts them again
      // The member's own requests come from their own listener, which goes on.
      if (source.wide) notice('Change requests for your departments could not be loaded. Open the app again to retry.', true);
    }));
  });
}

/* Stores a new request; true once it is saved. The member stays on the duty
   until a leader answers. */
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
  sending.set(request.id, request);
  merge();
  renderSoon();
  try {
    await write(() => fb.setDoc(fb.doc(fb.db, 'requests', request.id), request));
    notice('Your request was sent to your leader.');
    return true;
  } catch (error) {
    notice('Your request was not sent: ' + problem(error), true);
    return false;
  } finally {
    sending.delete(request.id);
    merge();
    renderSoon();
  }
}

/* The member takes back a request that is still waiting. Leaders keep it in
   their history as withdrawn. */
export async function withdrawRequest(request) {
  if (!request || request.status !== 'pending') return false;
  const updatedAt = Date.now();
  request.status = 'withdrawn';
  renderSoon();
  try {
    await write(() => fb.updateDoc(fb.doc(fb.db, 'requests', request.id), { status: 'withdrawn', updatedAt }));
    notice('Request withdrawn. You stay on ' + dutyName(request.duty) + '.');
    return true;
  } catch (error) {
    request.status = 'pending';
    notice('Your request was not withdrawn: ' + problem(error), true);
    return false;
  } finally {
    renderSoon();
  }
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

/* Fill or open a duty flagged "needs replacement" without a request. The
   name on it as the leader saw it goes along, so the server refuses
   (changed) once someone else has it, instead of replacing them. */
export async function replaceDuty(service, duty, replacementUid, acknowledgeConflict = false) {
  const payload = { departmentId: departmentForDuty(duty), serviceId: serviceId(service), duty,
    expectedMemberName: (service.assignments || {})[duty] || '' };
  if (replacementUid) payload.replacementMemberUid = replacementUid;
  if (acknowledgeConflict) payload.acknowledgeConflict = true;
  return call('resolveDutyAttention', payload);
}
