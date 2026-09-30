/* TEST ONLY. Stand-in for Firebase Auth. A custom token from the fake
   verifyMemberPin names the member; the session survives a reload like the
   real SDK's saved sign-in. */
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

export const getAuth = () => auth;
export function onAuthStateChanged(_auth, callback) {
  listener = callback;
  setTimeout(() => callback(auth.currentUser), 0);
  return () => {};
}
export async function signInWithCustomToken(_auth, token) {
  const name = decodeURIComponent(String(token).replace(/^fake-token:/, ''));
  sessionStorage.setItem(KEY, name);
  auth.currentUser = userFor(name);
  listener(auth.currentUser);
  return { user: auth.currentUser };
}
export async function signOut() {
  sessionStorage.removeItem(KEY);
  auth.currentUser = null;
  listener(null);
}
