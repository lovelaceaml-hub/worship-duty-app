/* TEST ONLY. Stand-in for Firebase Auth. A custom token from the fake
   verifyMemberPin names the member; the session survives a reload like the
   real SDK's saved sign-in. As in the real SDK, the auth observer hears
   about a sign-in or sign-out only when the signed-in user changes, so
   signing in again as the same member (after a PIN change) is silent. */
const KEY = 'fake-auth-member';
let listener = () => {};

function userFor(name) {
  if (!name) return null;
  return {
    uid: 'member:' + name,
    getIdTokenResult: async () => ({ claims: (window.__fakeAccounts[name] || {}).claims || {} })
  };
}

const auth = { currentUser: userFor(sessionStorage.getItem(KEY)) };

function setUser(user) {
  const changed = (auth.currentUser && auth.currentUser.uid) !== (user && user.uid);
  auth.currentUser = user;
  if (changed) listener(user);
}

export const getAuth = () => auth;
export function onAuthStateChanged(_auth, callback) {
  listener = callback;
  setTimeout(() => callback(auth.currentUser), 0);
  return () => {};
}
export async function signInWithCustomToken(_auth, token) {
  const name = decodeURIComponent(String(token).replace(/^fake-token:/, ''));
  sessionStorage.setItem(KEY, name);
  setUser(userFor(name));
  return { user: auth.currentUser };
}
export async function signOut() {
  sessionStorage.removeItem(KEY);
  setUser(null);
}
