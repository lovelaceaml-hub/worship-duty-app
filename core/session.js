import {
  canonicalMemberName, fb, authReady, authUser, verifiedSession, authStatus, ui, requestUnsub, state,
  canonicalizeStateNames, setAuthReady, setAuthUser, setAuthStatus, setRequestUnsub, setVerifiedSessionRef
} from './state.js';
import {authActor, canPermission, canManageAnyDepartment, selectedManageDepartment, authorizedDepartments, isVerifiedSession, isForcedSession} from './auth.js';
import {clearDepartmentRuntime} from './departments.js';
import {renderSoon, notifyOn, registerPush, checkNewDuties, checkReminders} from './notify.js';
// render (views/shell.js, Section 4) and pulse (app.js's own kept tail)
// are not imported: same evaluation-order reasoning as core/notify.js
// and core/sheet-sync.js above. app.js pushes the live references in once.
let render, pulse;
export function setSessionRefs(renderFn, pulseFn) { render = renderFn; pulse = pulseFn; }

export function safeAuthMessage(error) {
  const code = String(error && error.code || '').replace(/^functions\//, '');
  if (code === 'failed-precondition') return 'Change your member PIN before using the app.';
  if (code === 'permission-denied') return 'This member account cannot perform that action.';
  if (code === 'unavailable' || code === 'internal') return 'The member sign-in service is unavailable. Try again.';
  if (code === 'invalid-argument') return 'Enter a member and a 4 to 6 digit PIN.';
  return 'That member name and PIN did not match.';
}
export function sessionFromClaims(claims, user) {
  const source = claims && typeof claims === 'object' ? claims : {};
  const memberName = canonicalMemberName(source.memberName || source.name);
  const memberId = String(source.memberId || memberName || '').trim();
  if (!memberName || !memberId) return null;
  return Object.assign({}, source, {
    uid: user && user.uid,
    memberId,
    memberName,
    name: memberName,
    roles: Array.isArray(source.roles) ? source.roles.slice() : [],
    departments: Array.isArray(source.departments) ? source.departments.slice() : [],
    mustChangePin: source.mustChangePin === true
  });
}
export function setVerifiedSession(session, user) {
  const previousUid = verifiedSession && verifiedSession.uid;
  const previousMemberId = verifiedSession && verifiedSession.memberId;
  if (session && ((previousUid && previousUid !== session.uid) ||
      (previousMemberId && previousMemberId !== session.memberId))) clearDepartmentRuntime();
  setVerifiedSessionRef(session);
  setAuthUser(user || authUser);
  if (!session) {
    setAuthStatus(fb ? 'signedOut' : 'local');
    ui.me = '';
    ui.loginMember = '';
    clearDepartmentRuntime();
    setAuthReady(Promise.resolve(null));
    return;
  }
  setAuthStatus(session.mustChangePin ? 'forced' : 'verified');
  ui.me = session.mustChangePin ? '' : session.memberName;
  ui.loginMember = session.memberName;
  if (session.mustChangePin) {
    localStorage.removeItem('wds-me');
  } else {
    localStorage.setItem('wds-me', session.memberName);
  }
  setAuthReady(Promise.resolve(user || null));
  canonicalizeStateNames();
  selectedManageDepartment();
  if (!canPermission('isAdmin', authActor()) && canManageAnyDepartment() &&
      ['services', 'planning', 'requests', 'people'].indexOf(ui.sub) !== -1) {
    ui.sub = 'departments';
    ui.departmentView = 'list';
    ui.departmentMember = '';
  }
}
export function startRequestListener() {
  if (requestUnsub) {
    requestUnsub();
    setRequestUnsub(null);
  }
  if (!fb || !isVerifiedSession()) return;
  const actor = authActor();
  let source;
  if (canPermission('isAdmin', actor)) {
    source = fb.collection(fb.db, 'requests');
  } else {
    const departments = authorizedDepartments().filter(department => department !== 'All');
    if (canManageAnyDepartment() && departments.length) {
      source = fb.query(fb.collection(fb.db, 'requests'), fb.where('department', 'in', departments.slice(0, 10)));
    } else if (authUser && authUser.uid) {
      source = fb.query(fb.collection(fb.db, 'requests'), fb.where('requesterUid', '==', authUser.uid));
    } else {
      source = fb.query(fb.collection(fb.db, 'requests'), fb.where('name', '==', ui.me));
    }
  }
  setRequestUnsub(fb.onSnapshot(source, snap => {
    state.requests = snap.docs.map(d => d.data());
    canonicalizeStateNames();
    renderSoon();
  }, () => { /* request access is scoped by the signed-in member claims */ }));
}
export async function syncAuthUser(user, forceRefresh) {
  setAuthUser(user || null);
  if (!user) {
    setVerifiedSession(null, null);
    startRequestListener();
    renderSoon();
    return null;
  }
  try {
    const tokenResult = await user.getIdTokenResult(!!forceRefresh);
    const session = sessionFromClaims(tokenResult.claims, user);
    setVerifiedSession(session, user);
    startRequestListener();
    if (session && !session.mustChangePin) pulse('opens');
    renderSoon();
    return session;
  } catch (_error) {
    setVerifiedSession(null, user);
    startRequestListener();
    renderSoon();
    return null;
  }
}
export function authCall(name, payload) {
  if (!fb || typeof fb.callable !== 'function') {
    return Promise.reject(new Error('The member sign-in service is unavailable.'));
  }
  return fb.callable(name)(payload).then(result => result && result.data);
}
export async function memberLogin() {
  if (ui.authBusy) return;
  const memberInput = document.getElementById('member-login');
  const pinInput = document.getElementById('member-pin');
  const name = canonicalMemberName((memberInput && memberInput.value) || ui.loginMember);
  const pin = pinInput ? pinInput.value : '';
  if (!name || !/^\d{4,6}$/.test(pin)) {
    ui.authError = 'Choose your name and enter a 4 to 6 digit PIN.';
    render();
    return;
  }
  ui.loginMember = name;
  ui.authBusy = true;
  ui.authError = '';
  render();
  try {
    if (fb && fb.auth && fb.callable && fb.signInWithCustomToken) {
      const result = await authCall('verifyMemberPin', {
        selectedMemberId: name,
        selectedMemberName: name,
        pin
      });
      if (!result || !result.token) throw new Error('The member sign-in service is unavailable.');
      await fb.signInWithCustomToken(fb.auth, result.token);
      // The member identity is carried by the custom token. Do not force an
      // immediate refresh here, because accounts without a pre-existing Auth
      // user would lose those one-time claims before the session is opened.
      if (fb.auth.currentUser) await syncAuthUser(fb.auth.currentUser, false);
    } else {
      // Local mode still requires a selected member and a PIN. It grants no
      // privileged claims and is only a development fallback when Firebase
      // has not been configured for this copy of the app.
      if (pin !== '2217') throw new Error('Member PIN did not match.');
      setVerifiedSession({
        memberId: name,
        memberName: name,
        role: 'member',
        roles: ['member'],
        departments: [],
        mustChangePin: false
      }, null);
    }
    if (!isVerifiedSession()) throw new Error('The member sign-in service is unavailable.');
    ui.authError = '';
    ui.authBusy = false;
    ui.rebaseline = true;
    render();
    checkNewDuties();
    checkReminders();
    if (notifyOn()) registerPush();
  } catch (error) {
    ui.authBusy = false;
    ui.authError = safeAuthMessage(error);
    setVerifiedSession(null, null);
    render();
  }
}
export async function memberChangePin() {
  if (!isForcedSession() || ui.authBusy) return;
  const first = document.getElementById('member-new-pin');
  const second = document.getElementById('member-new-pin-confirm');
  const newPin = first ? first.value : '';
  const confirmation = second ? second.value : '';
  if (!/^\d{4,6}$/.test(newPin)) {
    ui.authError = 'Use 4 to 6 digits for your new PIN.';
    render();
    return;
  }
  if (newPin !== confirmation) {
    ui.authError = 'The two new PIN entries do not match.';
    render();
    return;
  }
  const name = verifiedSession.memberName;
  ui.authBusy = true;
  ui.authError = '';
  render();
  try {
    if (fb && fb.callable) {
      await authCall('changeMemberPin', { memberId: verifiedSession.memberId, newPin });
      const result = await authCall('verifyMemberPin', {
        selectedMemberId: verifiedSession.memberId,
        selectedMemberName: name,
        pin: newPin
      });
      if (!result || !result.token) throw new Error('The member sign-in service is unavailable.');
      await fb.signInWithCustomToken(fb.auth, result.token);
      if (fb.auth.currentUser) await syncAuthUser(fb.auth.currentUser, false);
    } else {
      setVerifiedSession(Object.assign({}, verifiedSession, { mustChangePin: false }), null);
    }
    if (isForcedSession()) throw new Error('The member PIN still needs to be changed.');
    ui.authBusy = false;
    ui.authError = '';
    ui.rebaseline = true;
    render();
    checkNewDuties();
    checkReminders();
  } catch (error) {
    ui.authBusy = false;
    ui.authError = safeAuthMessage(error);
    render();
  }
}
export async function memberLogout() {
  try {
    if (fb && fb.signOut && fb.auth) await fb.signOut(fb.auth);
  } catch (_error) { /* local state still clears below */ }
  setVerifiedSession(null, null);
  ui.tab = 'schedule';
  ui.sub = 'services';
  ui.departmentView = 'list';
  ui.departmentMember = '';
  ui.songSvc = null;
  ui.songNav = false;
  ui.authError = '';
  render();
}
