/* Service worker: offline copies of the app files, and push notifications.
   RELEASE is set by scripts/build.mjs. Each release keeps its own cache, and
   files carrying that release's ?v= stamp never change, so they are served
   straight from the cache. Unbuilt source (RELEASE 'DEV') is never cached. */
const RELEASE = 'DEV';
const CACHE = 'wds-' + RELEASE;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
  await self.clients.claim();
})()));

/* Push messages from the server are data-only, so this shows each one once. */
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyAdOJ8cETHUqcyEbBSPbV6FnVn76ASB504',
    authDomain: 'lv-zion-duties.firebaseapp.com',
    projectId: 'lv-zion-duties',
    storageBucket: 'lv-zion-duties.firebasestorage.app',
    messagingSenderId: '246214644879',
    appId: '1:246214644879:web:2e5ee80c532b57872c8cfa'
  });
  firebase.messaging().onBackgroundMessage(payload => {
    const data = (payload && payload.data) || {};
    self.registration.showNotification(data.title || 'Worship duty update', { body: data.body || '', icon: 'icon.svg' });
  });
} catch (_error) {
  // Offline: the cached app still opens.
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(windows => windows.length ? windows[0].focus() : self.clients.openWindow('./')));
});

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function fromNetwork(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (error) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (RELEASE === 'DEV' || request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firebase and the CDN handle their own
  event.respondWith(url.searchParams.get('v') === RELEASE ? fromCache(request) : fromNetwork(request));
});
