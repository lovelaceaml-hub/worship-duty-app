/* Feedback notes. Any signed-in member can send one with the round feedback
   button; administrators read them in Manage, Feedback. Stored in the
   feedback collection. */
import { fb, write } from '../firebase.js';
import { session, ui, nameOf } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { currentAppearance } from '../appearance/picker.js';

export const KINDS = [['feedback', 'Feedback'], ['bug', 'Report a problem'], ['suggestion', 'Suggest a change']];

export const feedback = { list: null, state: 'idle', error: '', showDone: false };

export async function sendFeedback(kind, message) {
  const text = String(message || '').trim().slice(0, 2000);
  if (!text) throw new Error('Type a message first.');
  if (navigator.onLine === false) throw new Error('You are offline, so this was not sent. Your message is still here.');
  const entry = {
    uid: session.user ? session.user.uid : '',
    name: nameOf(ui.me),
    kind: KINDS.some(item => item[0] === kind) ? kind : 'feedback',
    message: text,
    screen: ui.tab,
    appearance: currentAppearance(),
    createdAt: Date.now(),
    status: 'new'
  };
  const id = entry.createdAt.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  await write(() => fb.setDoc(fb.doc(fb.db, 'feedback', id), entry));
  feedback.state = 'idle';
}

export async function loadFeedback(force = false) {
  if (feedback.state === 'loading' || (feedback.state === 'ready' && !force)) return;
  feedback.state = 'loading';
  try {
    const snapshot = await fb.getDocs(fb.query(fb.collection(fb.db, 'feedback'), fb.orderBy('createdAt', 'desc'), fb.limit(100)));
    feedback.list = snapshot.docs.map(doc => Object.assign({}, doc.data(), { id: doc.id }));
    feedback.state = 'ready';
  } catch (_error) {
    feedback.list = null;
    feedback.state = 'error';
    feedback.error = 'The feedback did not load. Check your connection and try again.';
  }
  renderSoon();
}

export async function markDone(id) {
  try {
    await write(() => fb.updateDoc(fb.doc(fb.db, 'feedback', id), { status: 'done' }));
    const entry = (feedback.list || []).find(item => item.id === id);
    if (entry) entry.status = 'done';
    // The server sends the member a notification (functions onFeedbackDone).
    notice('Marked done. ' + (entry && entry.name ? nameOf(entry.name) : 'The sender') + ' gets a notification if their alerts are on.');
  } catch (_error) {
    notice('That change was not saved. Try again.', true);
  }
  renderSoon();
}

export async function deleteFeedback(id) {
  try {
    await write(() => fb.deleteDoc(fb.doc(fb.db, 'feedback', id)));
    feedback.list = (feedback.list || []).filter(entry => entry.id !== id);
  } catch (_error) {
    notice('That note was not deleted. Try again.', true);
  }
  renderSoon();
}
