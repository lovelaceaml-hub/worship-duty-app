/* Release stamp. scripts/deploy.sh rewrites the 'DEV' token here, in
   index.html and in app.js at release time, so a new release lands in its own
   cache and every stamped file below can be served straight from disk. */
const RELEASE = 'DEV';
const CACHE = 'wds-' + RELEASE;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil((async () => {
  // Drop every previous release's cache. Before this, 'wds-v1' grew forever and
  // was never cleaned out.
  const names = await caches.keys();
  await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
  await self.clients.claim();
})()));

// ---- Firebase Cloud Messaging (background delivery) ----
// Public app config — copied from firebase-config.js (the SW cannot read that
// file's window global). Data-only messages are sent from the server, so this
// handler fully controls the notification and there is no double-display.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyAdOJ8cETHUqcyEbBSPbV6FnVn76ASB504",
    authDomain: "lv-zion-duties.firebaseapp.com",
    projectId: "lv-zion-duties",
    storageBucket: "lv-zion-duties.firebasestorage.app",
    messagingSenderId: "246214644879",
    appId: "1:246214644879:web:2e5ee80c532b57872c8cfa"
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const data = (payload && payload.data) || {};
    const title = data.title || 'Worship duty update';
    self.registration.showNotification(title, { body: data.body || '', icon: 'icon.svg?v=DEV' });
  });
} catch (e) {
  // gstatic unreachable / offline — SW still serves cached content below
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs =>
      cs.length ? cs[0].focus() : self.clients.openWindow('./')
    )
  );
});

/* Serve a request from the cache, refreshing the copy in the background. */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

/* Always try the network, fall back to whatever was cached last. */
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (e) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // Firebase and the CDN manage their own

  // A stamped file (app.js?v=..., song-app.css?v=...) can never change under a
  // given stamp, so it is read straight from disk. A new release changes every
  // stamp and lands in a fresh cache, so nobody can be served a stale mix.
  if (url.searchParams.has('v')) { e.respondWith(cacheFirst(req)); return; }

  // index.html and anything unstamped stays network-first, so a new release is
  // always noticed; the cached copy is the offline fallback.
  e.respondWith(networkFirst(req));
});
