/* A daily usage count: pulse/{YYYY-MM-DD} holds plain counters of how many
   devices opened the app and each tab that day. Nothing identifies a person.
   A device counts itself once per event per day, remembered on the device. */
import { fb } from '../firebase.js';
import { session, readText, writeText } from '../store.js';

const sending = new Set();

export function countOnce(event) {
  if (!fb.db || session.status !== 'verified') return;
  const day = new Date().toLocaleDateString('en-CA');
  const key = 'wd-pulse-' + day;
  const counted = readText(key).split(',').filter(Boolean);
  if (counted.includes(event) || sending.has(event)) return;
  sending.add(event);
  fb.setDoc(fb.doc(fb.db, 'pulse', day), { date: day, [event]: fb.increment(1) }, { merge: true }).then(() => {
    const now = readText(key).split(',').filter(Boolean);
    if (!now.includes(event)) writeText(key, now.concat(event).join(','));
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const stored = localStorage.key(i);
        if (stored && stored.startsWith('wd-pulse-') && stored !== key) localStorage.removeItem(stored);
      }
    } catch (_error) { /* storage blocked */ }
  }).catch(() => {
    sending.delete(event); // try again later
  });
}
