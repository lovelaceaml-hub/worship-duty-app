/* The one connection to Firebase. connect() loads the SDK from Google's CDN
   and fills in `fb`; until then fb.db is null and nothing reads or writes. */
import { session } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

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
  // Push delivery is optional; browsers without it simply get no push.
  try {
    const messaging = await import(SDK + 'firebase-messaging.js');
    if (await messaging.isSupported()) {
      fb.messaging = messaging.getMessaging(app);
      fb.getToken = messaging.getToken;
      fb.deleteToken = messaging.deleteToken;
    }
  } catch (error) {
    console.warn('Push messaging is not available:', error);
  }
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

/* Plain words for a failed call or write. */
export function problem(error, fallback = 'That did not work. Try again.') {
  const code = String(error && error.code || '').replace(/^functions\//, '');
  if (code === 'permission-denied') return 'Your account is not allowed to do that.';
  if (code === 'unauthenticated') return 'Sign in again, then try again.';
  if (code === 'failed-precondition' && /PIN/i.test(error.message || '')) return 'Change your PIN first.';
  if (code === 'unavailable' || code === 'internal' || code === 'deadline-exceeded') return 'The server could not be reached. Try again.';
  if (code === 'aborted' || code === 'stale-profile' || /changed/i.test(error && error.message || '')) {
    return 'Someone else changed this at the same time. Look again, then retry.';
  }
  return (error && error.message && code && code !== 'unknown') ? error.message : fallback;
}
