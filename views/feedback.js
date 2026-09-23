import {feat, memberLabel, siteUnlocked} from '../core/constants.js';
import {esc} from '../core/format.js';
import {authActor, canPermission, isForcedSession, isVerifiedSession} from '../core/auth.js';
import {authReady, fb, fbWrite, ui} from '../core/state.js';
import {addBanner, renderSoon} from '../core/notify.js';
import {currentMemberUid} from '../core/departments.js';
import {SCREEN_TITLES} from './shell.js';

/* ================= feedback (F10) =================
   A small round button above the floating bottom bar opens a compact sheet
   where a signed-in member sends feedback, a bug report, or a suggestion. It is
   saved in the Firestore `feedback` collection; only administrators can read it
   (Manage, Feedback). The button and the sheet live on <body>, outside #view,
   so the app's live-sync re-renders never touch the text being typed. */
export const FEEDBACK_KINDS = [['feedback', 'Feedback'], ['bug', 'Report a bug'], ['suggestion', 'Suggest a change']];
export const FEEDBACK_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H9l-4.5 2.5 1.2-4.2A7.5 7.5 0 0 1 12.5 4 7.5 7.5 0 0 1 20 11.5Z"/><path d="M9 10h7M9 13.5h4.5"/></svg>';
export const feedbackUi = { kind: 'feedback', draft: '', sending: false, error: '', list: null, listState: 'idle', listError: '', showDone: false };
export const feedbackLocal = []; // local demo mode only (no Firebase): lets the sheet and the list be tried out

export function feedbackReady() {
  return document.documentElement.dataset.maintenance !== 'active' &&
    !(feat('siteLock') && !siteUnlocked()) && isVerifiedSession() && !isForcedSession();
}
export function feedbackSheet() { return document.getElementById('wd-feedback-sheet'); }
export function syncFeedbackButton() {
  const ready = feedbackReady();
  let button = document.getElementById('wd-feedback-open');
  if (!button && ready) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'wd-feedback-open';
    button.className = 'wd-fbk-btn';
    button.dataset.fbk = 'open';
    button.title = 'Send feedback';
    button.setAttribute('aria-label', 'Send feedback');
    button.setAttribute('aria-haspopup', 'dialog');
    button.innerHTML = FEEDBACK_ICON;
    document.body.appendChild(button);
  }
  if (button) button.hidden = !ready;
  if (!ready) {
    const sheet = feedbackSheet();
    if (sheet && sheet.open) sheet.close();
    feedbackUi.list = null;
    feedbackUi.listState = 'idle';
  }
}
export function paintFeedbackSheet() {
  const sheet = feedbackSheet();
  if (!sheet) return;
  const error = sheet.querySelector('.wd-fbk-error');
  error.textContent = feedbackUi.error;
  error.hidden = !feedbackUi.error;
  const send = sheet.querySelector('[data-fbk="send"]');
  send.disabled = feedbackUi.sending;
  send.textContent = feedbackUi.sending ? 'Sending...' : (feedbackUi.error ? 'Retry' : 'Send');
}
export function openFeedbackSheet() {
  if (!feedbackReady()) return;
  let sheet = feedbackSheet();
  if (!sheet) {
    sheet = document.createElement('dialog');
    sheet.id = 'wd-feedback-sheet';
    sheet.className = 'wd-fbk-sheet';
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'wd-fbk-title');
    sheet.innerHTML = '<form class="wd-fbk-form" novalidate>' +
      '<h2 id="wd-fbk-title">Send feedback</h2>' +
      '<p class="wd-fbk-lead">Tell the app administrators what is working, what is not, or what you would change.</p>' +
      '<div class="wd-fbk-kinds" role="radiogroup" aria-label="What kind of note is this?">' +
      FEEDBACK_KINDS.map(kind => '<label><input type="radio" name="wd-fbk-kind" value="' + kind[0] + '"><span>' + kind[1] + '</span></label>').join('') +
      '</div>' +
      '<label class="wd-fbk-label" for="wd-fbk-text">Your message</label>' +
      '<textarea id="wd-fbk-text" rows="5" required maxlength="2000" placeholder="What happened, or what would you like to see? Mention the screen you were on and what you expected."></textarea>' +
      '<div class="wd-fbk-error" role="status" hidden></div>' +
      '<div class="wd-fbk-actions"><button type="submit" class="primary" data-fbk="send">Send</button>' +
      '<button type="button" class="ghost" data-fbk="cancel">Cancel</button></div>' +
      '</form>';
    document.body.appendChild(sheet);
    sheet.querySelector('form').addEventListener('submit', e => { e.preventDefault(); sendFeedback(); });
    sheet.querySelector('textarea').addEventListener('input', e => { feedbackUi.draft = e.target.value; });
    sheet.addEventListener('change', e => { if (e.target.name === 'wd-fbk-kind') feedbackUi.kind = e.target.value; });
    // A tap on the dimmed backdrop lands on the <dialog> itself; the form fills the whole sheet.
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
    sheet.addEventListener('close', () => {
      const button = document.getElementById('wd-feedback-open');
      if (button && !button.hidden) button.focus({ preventScroll: true });
    });
  }
  if (sheet.open) return;
  if (!feedbackUi.sending) feedbackUi.error = '';
  sheet.querySelectorAll('input[name="wd-fbk-kind"]').forEach(input => { input.checked = input.value === feedbackUi.kind; });
  const text = sheet.querySelector('textarea');
  text.value = feedbackUi.draft;
  paintFeedbackSheet();
  if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
  text.focus({ preventScroll: true }); // the sheet is fixed; never let focus scroll the page behind it
}
export function feedbackFailed(message) {
  feedbackUi.sending = false;
  feedbackUi.error = message;
  paintFeedbackSheet();
  const sheet = feedbackSheet();
  if (!sheet || !sheet.open) addBanner('Your feedback was not sent yet. Tap the feedback button to try again; your message is still there.', true);
}
export function sendFeedback() {
  if (feedbackUi.sending || !feedbackReady()) return; // a second tap while sending does nothing
  const message = feedbackUi.draft.trim().slice(0, 2000);
  if (!message) {
    feedbackUi.error = 'Type a message first.';
    paintFeedbackSheet();
    feedbackSheet().querySelector('textarea').focus();
    return;
  }
  const uid = String((fb && fb.auth && fb.auth.currentUser && fb.auth.currentUser.uid) || currentMemberUid());
  const entry = {
    uid,
    name: memberLabel(ui.me) || ui.me || '',
    kind: FEEDBACK_KINDS.some(kind => kind[0] === feedbackUi.kind) ? feedbackUi.kind : 'feedback',
    message,
    screen: ui.tab,
    createdAt: Date.now(),
    status: 'new'
  };
  const appearance = window.WorshipDesign && typeof window.WorshipDesign.getMode === 'function' ? window.WorshipDesign.getMode() : '';
  if (appearance && typeof appearance === 'string') entry.appearance = appearance;
  const id = entry.createdAt.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  feedbackUi.sending = true;
  feedbackUi.error = '';
  paintFeedbackSheet();
  if (fb && navigator.onLine === false) {
    feedbackFailed('You appear to be offline, so this was not sent. Your message is still here.');
    return;
  }
  const write = fb
    ? fbWrite(() => fb.setDoc(fb.doc(fb.db, 'feedback', id), entry))
    : Promise.resolve(feedbackLocal.unshift(Object.assign({ id }, entry)));
  write.then(() => {
    feedbackUi.sending = false;
    feedbackUi.draft = '';
    feedbackUi.kind = 'feedback';
    feedbackUi.list = null;
    feedbackUi.listState = 'idle';
    const sheet = feedbackSheet();
    if (sheet && sheet.open) sheet.close();
    addBanner('Thank you. Your feedback was sent.');
  }).catch(() => {
    feedbackFailed('That did not send. Your message is still here, so you can try again.');
  });
}

/* Administrator list (Manage, Feedback). A one-time read of the latest 100,
   newest first. Never requested for anyone who is not an administrator. */
export function loadFeedbackList(force) {
  if (!canPermission('isAdmin', authActor())) return;
  if (feedbackUi.listState === 'loading' || (feedbackUi.listState === 'ready' && !force)) return;
  feedbackUi.listState = 'loading';
  const read = fb
    ? authReady.then(() => fb.getDocs(fb.query(fb.collection(fb.db, 'feedback'), fb.orderBy('createdAt', 'desc'), fb.limit(100))))
      .then(snapshot => snapshot.docs.map(item => Object.assign({}, item.data(), { id: item.id })))
    : Promise.resolve(feedbackLocal.slice());
  read.then(list => {
    feedbackUi.list = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 100);
    feedbackUi.listState = 'ready';
    renderSoon();
  }).catch(error => {
    feedbackUi.list = null;
    feedbackUi.listState = 'error';
    feedbackUi.listError = String(error && error.code || '').indexOf('permission-denied') !== -1
      ? 'The feedback list is not available yet.'
      : 'The feedback list could not be loaded. Check your connection and try again.';
    renderSoon();
  });
}
export function renderFeedbackEntry(entry) {
  const kind = (FEEDBACK_KINDS.find(item => item[0] === entry.kind) || FEEDBACK_KINDS[0])[1];
  const done = entry.status === 'done';
  const when = entry.createdAt ? new Date(entry.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const appearance = { classic: 'Original', prism: 'Prism', navy: 'Navy & Cream', aurora: 'Aurora' }[entry.appearance] || '';
  const meta = [when ? 'Sent ' + when : '', SCREEN_TITLES[entry.screen] ? SCREEN_TITLES[entry.screen] + ' screen' : '', appearance].filter(Boolean).join(' · ');
  return '<div class="card wd-fbk-entry"><div class="req-item">' +
    '<div class="req-head"><span class="req-when">' + esc(memberLabel(entry.name) || 'Member') + ' | ' + esc(kind) + '</span>' +
    '<span class="status-chip ' + (done ? 'approved' : 'pending') + '">' + (done ? 'Done' : 'New') + '</span></div>' +
    '<div class="wd-fbk-message">' + esc(entry.message || '') + '</div>' +
    '<div class="req-meta">' + esc(meta) + '</div>' +
    '<div class="req-actions-row">' +
    (done ? '' : '<button class="primary" data-fbk="done" data-id="' + esc(entry.id) + '">Mark done</button>') +
    '<button class="danger-link" data-fbk="delete" data-id="' + esc(entry.id) + '">Delete</button>' +
    '</div></div></div>';
}
export function renderManageFeedback() {
  if (!canPermission('isAdmin', authActor())) return '<div class="empty">You do not have access to Feedback.</div>';
  let html = '<p class="hint">Notes members send with the round feedback button. Only administrators can see this list. It shows the latest 100.</p>';
  if (feedbackUi.listState === 'idle') loadFeedbackList(false);
  if (feedbackUi.listState === 'loading') return html + '<div class="empty">Loading feedback...</div>';
  if (feedbackUi.listState === 'error') {
    return html + '<div class="empty">' + esc(feedbackUi.listError) + '</div>' +
      '<div class="req-actions-row"><button class="ghost" data-fbk="refresh">Try again</button></div>';
  }
  const list = feedbackUi.list || [];
  if (!list.length) return html + '<div class="empty">No feedback yet.</div>';
  const fresh = list.filter(entry => entry.status !== 'done');
  const done = list.filter(entry => entry.status === 'done');
  html += '<div class="req-actions-row"><button class="ghost" data-fbk="refresh">Refresh</button></div>';
  html += '<h3 class="wd-fbk-group">New (' + fresh.length + ')</h3>';
  html += fresh.length ? fresh.map(renderFeedbackEntry).join('') : '<div class="empty">Nothing new. Every note is marked done.</div>';
  if (done.length) {
    html += '<button class="linkish" data-fbk="toggle-done" aria-expanded="' + (feedbackUi.showDone ? 'true' : 'false') + '">' +
      (feedbackUi.showDone ? 'Hide done' : 'Show done (' + done.length + ')') + '</button>';
    if (feedbackUi.showDone) html += done.map(renderFeedbackEntry).join('');
  }
  return html;
}
export function changeFeedbackEntry(id, remove) {
  if (!id || !canPermission('isAdmin', authActor())) return;
  if (remove && !confirm('Delete this feedback? This cannot be undone.')) return;
  const apply = () => {
    const local = feedbackLocal.findIndex(entry => entry.id === id);
    if (local !== -1) { if (remove) feedbackLocal.splice(local, 1); else feedbackLocal[local].status = 'done'; }
    if (!feedbackUi.list) return;
    if (remove) feedbackUi.list = feedbackUi.list.filter(entry => entry.id !== id);
    else feedbackUi.list.forEach(entry => { if (entry.id === id) entry.status = 'done'; });
  };
  const write = !fb ? Promise.resolve()
    : fbWrite(() => remove ? fb.deleteDoc(fb.doc(fb.db, 'feedback', id)) : fb.updateDoc(fb.doc(fb.db, 'feedback', id), { status: 'done' }));
  write.then(() => { apply(); renderSoon(); }).catch(() => {
    addBanner('That feedback change was not saved. Try again.', true);
  });
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-fbk]');
  if (!el) return;
  const act = el.dataset.fbk;
  if (act === 'open') openFeedbackSheet();
  else if (act === 'cancel') { const sheet = feedbackSheet(); if (sheet) sheet.close(); }
  else if (act === 'refresh') { loadFeedbackList(true); renderSoon(); }
  else if (act === 'toggle-done') { feedbackUi.showDone = !feedbackUi.showDone; renderSoon(); }
  else if (act === 'done') changeFeedbackEntry(el.dataset.id, false);
  else if (act === 'delete') changeFeedbackEntry(el.dataset.id, true);
});
