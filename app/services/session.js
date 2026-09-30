/* Signing in. A device first enters the site passcode (when that switch is
   on). A member then picks their name and enters their PIN; the server
   checks it and returns a sign-in token whose claims say who they are and
   what they lead. A new or reset PIN must be changed before the app opens. */
import { fb, call } from '../firebase.js';
import { data, session, ui, canonical, readText, writeText } from '../store.js';
import { renderSoon } from '../render.js';
import { resetDepartments, acceptPendingInvite } from './departments.js';
import { watchRequests } from './requests.js';
import { afterSignIn } from './notifications.js';
import { countOnce } from './usage.js';

/* Used on a device that has not loaded app/settings yet. The passcode itself
   is set in Manage, Features and is not written down anywhere. */
const DEFAULT_SITE_HASH = '1dffd68e5364ca2371d1627e59141f261264a7539f81c1746000b7320b5ad65b';

export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function siteHash() { return data.settings.sitePinHash || DEFAULT_SITE_HASH; }
export function siteUnlocked() { return readText('wds-site-unlock') === siteHash(); }

export async function unlockSite(passcode) {
  const hash = await sha256(passcode);
  if (hash !== siteHash()) return false;
  writeText('wds-site-unlock', hash);
  return true;
}

/* ---- member session ---- */

function memberFromClaims(claims, user) {
  const memberName = canonical(claims.memberName || claims.name);
  const memberId = String(claims.memberId || memberName || '').trim();
  if (!memberName || !memberId) return null;
  return Object.assign({}, claims, {
    uid: user && user.uid,
    memberId,
    memberName,
    roles: Array.isArray(claims.roles) ? claims.roles.slice() : [],
    departments: Array.isArray(claims.departments) ? claims.departments.slice() : [],
    mustChangePin: claims.mustChangePin === true
  });
}

function setMember(member, user) {
  const before = session.member;
  if (!member || !before || before.uid !== member.uid || before.memberId !== member.memberId) resetDepartments();
  session.member = member;
  session.user = user || null;
  if (!member) {
    session.status = 'signedOut';
    ui.me = '';
  } else {
    session.status = member.mustChangePin ? 'forced' : 'verified';
    ui.me = member.mustChangePin ? '' : member.memberName;
    writeText('wds-me', member.mustChangePin ? null : member.memberName);
  }
  watchRequests();
}

/* Firebase tells us when a saved sign-in is restored or ends. */
export async function onAuthChange(user) {
  if (!user) {
    setMember(null, null);
    renderSoon();
    return;
  }
  try {
    const token = await user.getIdTokenResult(false);
    setMember(memberFromClaims(token.claims || {}, user), user);
  } catch (_error) {
    setMember(null, user);
  }
  if (session.status === 'verified') {
    countOnce('opens');
    afterSignIn();
    acceptPendingInvite();
  }
  renderSoon();
}

function signInProblem(error) {
  const code = String(error && error.code || '').replace(/^functions\//, '');
  if (code === 'invalid-argument') return 'Choose your name and enter a 4 to 6 digit PIN.';
  if (code === 'unavailable' || code === 'internal') return 'Sign-in is not available right now. Try again.';
  if (code === 'failed-precondition') return 'Change your PIN first.';
  return 'That name and PIN do not match.';
}

async function signInWith(memberId, memberName, pin) {
  const result = await call('verifyMemberPin', { selectedMemberId: memberId, selectedMemberName: memberName, pin });
  if (!result || !result.token) throw Object.assign(new Error('No sign-in token.'), { code: 'unavailable' });
  await fb.signInWithCustomToken(fb.auth, result.token);
  // The token already carries the member's claims; do not force a refresh.
  if (fb.auth.currentUser) await onAuthChange(fb.auth.currentUser);
}

export async function signIn(name, pin) {
  const member = canonical(name);
  if (!member || !/^\d{4,6}$/.test(pin)) {
    ui.signIn.error = 'Choose your name and enter a 4 to 6 digit PIN.';
    return;
  }
  ui.signIn = { member, busy: true, error: '' };
  renderSoon();
  try {
    await signInWith(member, member, pin);
    if (session.status !== 'verified' && session.status !== 'forced') throw new Error('Not signed in.');
    ui.signIn = { member, busy: false, error: '' };
  } catch (error) {
    ui.signIn = { member, busy: false, error: signInProblem(error) };
    setMember(null, null);
  }
  renderSoon();
}

export async function changePin(first, second) {
  if (!/^\d{4,6}$/.test(first)) { ui.signIn.error = 'Use 4 to 6 digits for your new PIN.'; renderSoon(); return; }
  if (first !== second) { ui.signIn.error = 'The two PINs do not match.'; renderSoon(); return; }
  const member = session.member;
  ui.signIn = { member: member.memberName, busy: true, error: '' };
  renderSoon();
  try {
    await call('changeMemberPin', { memberId: member.memberId, newPin: first });
    await signInWith(member.memberId, member.memberName, first);
    if (session.status !== 'verified') throw new Error('The PIN still needs to be changed.');
    ui.signIn = { member: member.memberName, busy: false, error: '' };
  } catch (error) {
    ui.signIn = { member: member.memberName, busy: false, error: signInProblem(error) };
  }
  renderSoon();
}

export async function signOut() {
  try { if (fb.auth) await fb.signOut(fb.auth); }
  catch (_error) { /* the local session is cleared below either way */ }
  setMember(null, null);
  Object.assign(ui, { tab: 'schedule', account: '', manage: 'departments', songService: null, songNav: false });
  ui.signIn = { member: '', busy: false, error: '' };
  renderSoon();
}

/* The member this device last signed in as, for offline viewing. */
export function rememberedMember() { return readText('wds-me'); }
