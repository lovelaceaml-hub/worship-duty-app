/* View as: an administrator sees the app the way another member does (a
   department leader, a song editor, a plain member) without signing in as
   them. The app swaps in that member's name and roles, from the leader
   configuration, and changes nothing while it lasts: every Firestore write
   and every Cloud Function that changes something is refused here, before
   it leaves the device. The administrator's own sign-in stays underneath,
   so what the server lets the screen read is still theirs.
   Not shown while viewing: the member's own availability and their own
   requests, which belong to their sign-in, not their name. */
import { fb } from '../firebase.js';
import { data, session, ui, forgetMemberState } from '../store.js';
import { resetDepartments } from './rosters.js';
import { watchRequests } from './requests.js';
import { banner, dismiss } from '../ui/banners.js';

/* Cloud Functions that only read, and so still answer while viewing. */
const READS = ['listDepartmentRoster', 'searchDepartmentCandidates', 'checkSheet'];
const WRITES = ['setDoc', 'updateDoc', 'deleteDoc', 'runTransaction', 'writeBatch'];

let held = null; // { real, saved } while viewing: the administrator, and fb's own functions

export const viewingAs = () => (held ? session.member.memberName : '');

/* The member who is really signed in. */
export const realMember = () => (held ? held.real : session.member);

/* Whether the signed-in administrator may use View as (also while viewing). */
export function canViewAs() {
  const member = realMember();
  if (session.status !== 'verified' || !member) return false;
  try { return !!window.WorshipDutyPermissions.isAdmin(member.memberName, config()); }
  catch (_error) { return false; }
}

function config() { return data.leaderConfig || window.WorshipDutyPermissions.DEFAULT_PERMISSION_CONFIG; }

/* What a member's sign-in would say about them, from the leader configuration. */
function memberFor(name, real) {
  const rules = window.WorshipDutyPermissions, settings = config();
  const admin = !!rules.isAdmin(name, settings);
  const departments = admin ? [] : rules.departmentsForLeader(name, settings) || [];
  const songs = !!rules.canEditSongs(name, {}, settings);
  const role = admin ? 'admin' : departments.length ? 'departmentLeader' : songs ? 'songEditor' : 'member';
  return { memberId: name, memberName: name, uid: real.uid, role, roles: [role], departments, admin, mustChangePin: false };
}

/* A plain-words name for a member's role, for the picker and the banner. */
export function roleOf(name) {
  const role = memberFor(name, {}).role;
  return { admin: 'administrator', departmentLeader: 'department leader', songEditor: 'song editor', member: 'member' }[role];
}

function refused() {
  return Promise.reject(Object.assign(new Error('You are viewing as ' + viewingAs() + '. Changes are off. Choose Back to me first.'), { code: 'view-only' }));
}

function lock() {
  const saved = { callable: fb.callable };
  WRITES.forEach(name => { saved[name] = fb[name]; fb[name] = refused; });
  fb.callable = name => (READS.includes(name) ? saved.callable(name) : refused);
  return saved;
}

function unlock(saved) { Object.assign(fb, saved); }

function show() {
  banner('Viewing as ' + viewingAs() + ' (' + roleOf(viewingAs()) + '). Changes are off.',
    { id: 'view-as', close: false, action: { label: 'Back to me', act: 'view-as-stop' } });
  document.documentElement.dataset.viewAs = 'on';
}

/* Start viewing as `name`. Returns false when that cannot be done. */
export function startViewAs(name) {
  if (!canViewAs() || !name || !data.members.includes(name)) return false;
  const real = realMember();
  if (name === real.memberName) { stopViewAs(); return true; }
  if (!held) held = { real, saved: lock() };
  forgetMemberState();
  resetDepartments();
  session.member = memberFor(name, real);
  ui.me = name;
  watchRequests();
  show();
  return true;
}

/* Back to the administrator's own view. */
export function stopViewAs() {
  if (!held) return;
  const { real } = held;
  endViewAs();
  forgetMemberState();
  resetDepartments();
  session.member = real;
  ui.me = real.memberName;
  watchRequests();
}

/* The sign-in changed underneath (signed out, another member, a refreshed
   session): viewing ends without putting anyone back; the caller does.
   Returns whether it was viewing. */
export function endViewAs() {
  if (!held) return false;
  unlock(held.saved);
  held = null;
  dismiss('view-as');
  delete document.documentElement.dataset.viewAs;
  return true;
}
