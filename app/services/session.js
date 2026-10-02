/* Signing in. A device first enters the site passcode (when that switch is
   on). A member then picks their name and enters their PIN; the server
   checks it and returns a sign-in token whose claims say who they are and
   what they lead. A new or reset PIN must be changed before the app opens. */
import { fb, call, problem } from '../firebase.js';
import { data, session, ui, canonical, readText, writeText, forgetMemberState } from '../store.js';
import { renderSoon, setLeaveGuard } from '../render.js';
import { resetDepartments, acceptPendingInvite } from './departments.js';
import { watchRequests } from './requests.js';
import { afterSignIn, unregisterPush, forgetDutyAlerts } from './notifications.js';
import { countOnce } from './usage.js';
import { notice } from '../ui/banners.js';

/* The site passcode is a light curtain for the device, not a lock: the
   schedule is readable without it, and the hash of a 4-digit code is easy to
   reverse. The passcode is set in Manage, Features; this is used on a device
   that has not loaded app/settings yet. */
const DEFAULT_SITE_HASH = '1dffd68e5364ca2371d1627e59141f261264a7539f81c1746000b7320b5ad65b';

export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function siteHash() { return data.settings.sitePinHash || DEFAULT_SITE_HASH; }

/* A device already in the app stays in when the passcode changes; it asks
   for the new one the next time the app opens, as Manage tells the
   administrator. */
let openedHere = false;
export function siteUnlocked() {
  if (!openedHere) openedHere = readText('wds-site-unlock') === siteHash();
  return openedHere;
}

export async function unlockSite(passcode) {
  const hash = await sha256(passcode);
  if (hash !== siteHash()) return false;
  writeText('wds-site-unlock', hash);
  openedHere = true;
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

const sameMember = (a, b) => !!a && !!b && a.uid === b.uid && a.memberId === b.memberId;

function setMember(member, user) {
  const before = session.member;
  if (!sameMember(before, member)) resetDepartments();
  // Signing out, or another member signing in, leaves nothing of the last
  // member on the screen: drafts, proposals, banners, open cards.
  if (before && !sameMember(before, member)) { forgetMemberState(); setLeaveGuard(null); }
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

/* Firebase tells us when a saved sign-in is restored or ends. A session the
   server revoked (PIN reset, role change, name fix) ends here when Firebase
   next refreshes it, unless a call was refused first: the member is asked
   to sign in again, as after a refused call, and no one is remembered for
   offline viewing. */
let leaving = false; // signOut() is ending the session itself
export async function onAuthChange(user) {
  if (!user) {
    const ended = !!session.member && !leaving;
    writeText('wds-me', null);
    setMember(null, null);
    if (ended) ui.signIn.error = 'Please sign in again.';
    renderSoon();
    return;
  }
  let member = null;
  try {
    const token = await user.getIdTokenResult(false);
    member = memberFromClaims(token.claims || {}, user);
  } catch (_error) {
    member = null;
  }
  // A fresh sign-in reaches here twice (the auth observer, and signInWith),
  // a PIN change once; the work after a sign-in runs once per member.
  const before = session.status === 'verified' ? session.member : null;
  setMember(member, user);
  if (session.status === 'verified' && !sameMember(before, session.member)) {
    countOnce('opens');
    afterSignIn();
    acceptPendingInvite();
  }
  renderSoon();
}

/* Plain words for a failed sign-in or PIN change. A member who is already
   signed in (changing their PIN in Settings) gets the server's own reason. */
function signInProblem(error, { signedIn = false } = {}) {
  const reason = error && error.details && error.details.reason;
  const code = String(error && error.code || '').replace(/^functions\//, '');
  if (reason === 'pin-too-common') return 'That PIN is too easy to guess. Choose a different one.';
  if (reason === 'locked' || code === 'resource-exhausted') return 'Too many tries. Wait 15 minutes, then try again.';
  if (signedIn) return problem(error);
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
  const signedIn = session.status === 'verified';
  ui.signIn = { member: member.memberName, busy: true, error: '' };
  renderSoon();
  try {
    await call('changeMemberPin', { memberId: member.memberId, newPin: first });
    await signInWith(member.memberId, member.memberName, first);
    if (session.status !== 'verified') throw new Error('The PIN still needs to be changed.');
    ui.signIn = { member: member.memberName, busy: false, error: '' };
  } catch (error) {
    ui.signIn = { member: member.memberName, busy: false, error: signInProblem(error, { signedIn }) };
  }
  renderSoon();
}

/* Signing out leaves nothing of the member on the device: this device stops
   getting their alerts (its push token is deleted while the session can
   still do it), their name is no longer remembered for offline viewing, and
   their duty alerts and everything they left on the screen are cleared. */
export async function signOut() {
  // Until the app has connected, the sign-in saved on this device cannot be
  // ended: it would come back as soon as the app connects.
  if (!fb.auth) {
    notice(session.status === 'offline' ? 'You are offline. Connect to do that.' : 'The app is still opening. Try again in a moment.', true);
    renderSoon();
    return;
  }
  const name = (session.member && session.member.memberName) || ui.me;
  leaving = true;
  try {
    await unregisterPush().catch(() => {});
    try { if (fb.auth) await fb.signOut(fb.auth); }
    catch (_error) { /* the local session is cleared below either way */ }
    writeText('wds-me', null);
    forgetDutyAlerts(name);
    if (!session.member) { forgetMemberState(); setLeaveGuard(null); }
    setMember(null, null);
  } finally {
    leaving = false;
  }
  renderSoon();
}

/* The member this device last signed in as, for offline viewing. */
export function rememberedMember() { return readText('wds-me'); }

/* The server ends a member's session after a PIN reset, a role change or a
   name fix: its callables then refuse with reason 'session-ended'. Any call
   refused that way signs the member out, and the sign-in screen asks them to
   sign in again; no other message is shown for it. A name fix is also seen
   in the name map (notifications.js). */
let ending = false;
export async function endSession() {
  if (ending || !session.member) return;
  ending = true;
  try {
    await signOut();
    ui.signIn = { member: '', busy: false, error: 'Please sign in again.' };
    renderSoon();
  } finally {
    ending = false;
  }
}

export function watchSessionEnd() {
  const callable = fb.callable;
  fb.callable = name => {
    const run = callable(name);
    return payload => run(payload).catch(error => {
      if (error && error.details && error.details.reason === 'session-ended') endSession();
      throw error;
    });
  };
}
