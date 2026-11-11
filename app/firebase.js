/* The one connection to Firebase. connect() loads the SDK from Google's CDN
   and fills in `fb`; until then fb.db is null and nothing reads or writes. */
import { session } from './store.js';
import { reasonText } from './lib/reasons.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
let firebaseApp = null, messagingReady = null;

export const fb = {
  db: null, auth: null, messaging: null,
  // Filled by connect(): Firestore, Auth and Messaging functions.
  doc: null, collection: null, query: null, where: null, orderBy: null, limit: null,
  onSnapshot: null, getDoc: null, getDocs: null, setDoc: null, updateDoc: null, deleteDoc: null,
  writeBatch: null, runTransaction: null, arrayUnion: null, arrayRemove: null, increment: null,
  signInWithCustomToken: null, signOut: null, onAuthStateChanged: null,
  getToken: null, deleteToken: null,
  callable: null
};

export async function connect(config) {
  const [appSdk, firestore, auth, functions] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-firestore.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-functions.js')
  ]);
  const app = appSdk.initializeApp(config);
  firebaseApp = app;
  const cloud = functions.getFunctions(app, 'us-central1');
  Object.assign(fb, {
    db: firestore.getFirestore(app),
    auth: auth.getAuth(app),
    doc: firestore.doc, collection: firestore.collection, query: firestore.query,
    where: firestore.where, orderBy: firestore.orderBy, limit: firestore.limit,
    onSnapshot: firestore.onSnapshot, getDoc: firestore.getDoc, getDocs: firestore.getDocs,
    setDoc: firestore.setDoc, updateDoc: firestore.updateDoc, deleteDoc: firestore.deleteDoc,
    writeBatch: firestore.writeBatch, runTransaction: firestore.runTransaction,
    arrayUnion: firestore.arrayUnion, arrayRemove: firestore.arrayRemove, increment: firestore.increment,
    signInWithCustomToken: auth.signInWithCustomToken, signOut: auth.signOut,
    onAuthStateChanged: auth.onAuthStateChanged,
    callable: name => functions.httpsCallable(cloud, name)
  });
}

/* Push is optional and never holds up sign-in or the shared schedule.
   Concurrent callers share initialization; a failed load can be retried. */
export function ensureMessaging() {
  if (!firebaseApp) return Promise.resolve(false);
  if (messagingReady) return messagingReady;
  messagingReady = (async () => {
    const messaging = await import(SDK + 'firebase-messaging.js');
    if (!await messaging.isSupported()) return false;
    fb.messaging = messaging.getMessaging(firebaseApp);
    fb.getToken = messaging.getToken;
    fb.deleteToken = messaging.deleteToken;
    return true;
  })().catch(error => {
    messagingReady = null;
    throw error;
  });
  return messagingReady;
}

export function connected() { return !!fb.db; }

/* Call a Cloud Function and return its data. */
export async function call(name, payload) {
  if (!fb.callable) throw Object.assign(new Error('The app is not connected.'), { code: 'unavailable' });
  const result = await fb.callable(name)(payload);
  return result && result.data;
}

/* Every direct Firestore write goes through here: it needs a signed-in
   member who has already set their own PIN. */
export async function write(run) {
  if (!fb.db) throw Object.assign(new Error('The app is not connected.'), { code: 'unavailable' });
  if (session.status !== 'verified') throw Object.assign(new Error('Sign in first.'), { code: 'unauthenticated' });
  return run(fb);
}

/* Plain words for a failed call or write. A refusal from the server names
   its reason (error.details.reason), which lib/reasons.js turns into words;
   otherwise the error's code decides, and for the rest the server's own
   sentence is shown. Never guessed from words in the message: the server's
   messages say "changed" for things that are not a clash. */
export function problem(error, fallback = 'That did not work. Try again.') {
  const code = String(error && error.code || '').replace(/^functions\//, '');
  const message = String(error && error.message || '');
  // Servers from before details.reason wrote "Department authorization denied: <reason>."
  const reason = (error && error.details && error.details.reason) || (message.match(/authorization denied: ([a-z-]+)/) || [])[1];
  if (reasonText(reason)) return reasonText(reason);
  if (code === 'unauthenticated') return 'Sign in again, then try again.';
  if (code === 'unavailable' || code === 'internal' || code === 'deadline-exceeded') return 'The server could not be reached. Try again.';
  if (code === 'aborted') return 'Someone else changed this at the same time. Look again, then retry.';
  if (code === 'resource-exhausted') return 'Too many tries. Wait a few minutes, then try again.';
  if (code === 'permission-denied') {
    return /role has changed/i.test(message) ? reasonText('role-changed') : 'Your account is not allowed to do that.';
  }
  // An answer without a body (a function not deployed yet: 404) leaves the
  // SDK's message as the code alone, "not-found" or "not-found [404]".
  const bare = message.replace(/\s*\[\d+\]$/, '') === code;
  return message && !bare && code && code !== 'unknown' && code !== 'cancelled' ? message : fallback;
}
