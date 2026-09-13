// Firebase project: LV Zion Duties (lv-zion-duties)
// This config is public app identification, not a secret — it is safe to ship.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAdOJ8cETHUqcyEbBSPbV6FnVn76ASB504",
  authDomain: "lv-zion-duties.firebaseapp.com",
  projectId: "lv-zion-duties",
  storageBucket: "lv-zion-duties.firebasestorage.app",
  messagingSenderId: "246214644879",
  appId: "1:246214644879:web:2e5ee80c532b57872c8cfa"
};

// Web Push certificate key pair from Firebase console → Project settings → Cloud Messaging → Web configuration
window.FCM_VAPID_KEY = 'BNzc9Ma8hhqLex7180RU36gu1-oowMsHQazkDX1oAjgQp99fe9rOURrUR5cDU4RTpi3x4ZxYFgSuPxQcMziPezU';

// App Check reCAPTCHA v3 SITE key — register the web app in Firebase console →
// App Check, then paste the site key here. Public (like the config above), safe
// to ship. Leave '' to keep App Check off (the app still works). Do NOT enable
// Firestore App Check *enforcement* in the console until the song app ships it too.
window.RECAPTCHA_SITE_KEY = '';

// Load the member identity cleanup + department-leader Manage policy after the
// main app has initialized. The fixed release query prevents older cached
// browsers from missing this newly added module.
window.addEventListener('load', () => {
  import('./member-access.js?v=20260913a').catch(error => {
    console.warn('Member access module failed to load:', error);
  });
}, { once: true });
