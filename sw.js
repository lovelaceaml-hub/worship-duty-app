self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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
    self.registration.showNotification(title, { body: data.body || '', icon: 'icon.svg' });
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

// network-first so the schedule is always fresh; cached copy as offline fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open('wds-v1').then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
