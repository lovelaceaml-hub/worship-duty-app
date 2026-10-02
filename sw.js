/* Service worker: offline copies of the app files, and push notifications.
   RELEASE is set by scripts/build.mjs. Each release keeps its own cache, and
   files carrying that release's ?v= stamp never change, so they are served
   straight from the cache. Unbuilt source (RELEASE 'DEV') is never cached.
   A new release is stored whole before it takes over: the worker follows
   every ?v= stamped address from index.html through the styles and modules
   (the build stamps each one), so even the first visit, and the first open
   after a release, leave a complete offline copy. The old release's copy is
   deleted only after that. */
const RELEASE = 'DEV';
const CACHE = 'wds-' + RELEASE;
const SHELL = new URL('./', self.location).href;

/* Addresses this release's files name: "styles/base.css?v=r1",
   "./store.js?v=r1", "../presider/index.js?v=r1". Those starting with ./ or
   ../ are module imports, relative to the file; the rest are relative to the
   app. */
function stampedIn(text, base) {
  const out = new Set();
  const pattern = new RegExp('[\\w./-]+\\?v=' + RELEASE + '\\b', 'g');
  for (const match of text.matchAll(pattern)) {
    const address = match[0];
    out.add(new URL(address, /^\.\.?\//.test(address) ? base : SHELL).href);
  }
  return out;
}

async function storeRelease() {
  const cache = await caches.open(CACHE);
  const queue = [SHELL].concat(['manifest.json', 'icon.svg'].map(file => new URL(file, SHELL).href));
  const seen = new Set(queue);
  while (queue.length) {
    const url = queue.shift();
    const response = await fetch(url, { cache: 'no-cache' }).catch(() => null);
    // All of the release or nothing: a partial copy must never take over.
    if (!response || !response.ok) throw new Error('A file of the release did not load: ' + url);
    if (/\.(js|css)\?|\/$|\.html$/.test(url)) {
      const text = await response.clone().text();
      const named = stampedIn(text, url);
      // A deploy between this worker and its page serves the next release's page.
      if (url === SHELL && !named.size) throw new Error('The app page belongs to another release.');
      named.forEach(next => { if (!seen.has(next)) { seen.add(next); queue.push(next); } });
    }
    await cache.put(url, response);
  }
}

self.addEventListener('install', event => {
  if (RELEASE === 'DEV') { self.skipWaiting(); return; }
  // A failed copy leaves the last release in charge, with its own copy; the
  // half-stored one is dropped, and the next visit tries again.
  event.waitUntil(storeRelease().then(() => self.skipWaiting(), async error => {
    await caches.delete(CACHE);
    throw error;
  }));
});

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

/* The network first, then this release's copy. Any address of the app's
   page (with ?today= or a #link) opens the stored page offline. */
async function fromNetwork(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (error) {
    const hit = await caches.match(request) || (request.mode === 'navigate' && await caches.match(SHELL));
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
