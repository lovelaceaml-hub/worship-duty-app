'use strict';

import {
  CATEGORIES, SERVICE_LABELS, WORSHIP_TYPES, DEPARTMENTS_SEED, DATA_KEY, ASSET_V,
  DEFAULT_SITE_HASH, DEFAULT_SHEET_URL, NAME_UNIFY_MAP, sharedNameMap, setSharedNameMap,
  unifiedNameMap, memberLabel, FEATURES, feat, sha256, siteHash, siteUnlocked, sheetUrl,
  setConstantsStateRef
} from './core/constants.js';
import {
  esc, pad, toISO, todayISO, isoDaysAgo, fmtDate, fmtTime, dateBadge, svcId, slugify,
  requestId, svcDateTime, dutyCategory
} from './core/format.js';
import {
  ALL_DUTIES_ORDER, sortDuties, sameDuties, isPrayerDuty, isUsherDuty, hasNonExemptPair,
  conflictsFor, activeConflicts, conflictBadge
} from './core/conflicts.js';
import {weeksAgoISO, workloadStats, suggestSubs, setPlanningRefs} from './core/planning.js';
import {
  parseCSV, validDutySet, SHEET_MONTHS, parseSheetDate, inferYearISO, parseSheetTime,
  sheetRowsToServices
} from './core/sheet-parse.js';
import {
  authReady, authStatus, authUser, canonicalMemberName, canonicalizeStateNames,
  departmentRuntime, departmentsLoaded, fb, fbWrite, loadLocal, membersLoaded,
  persistAll, persistDeleteService, persistDepartmentMembership, persistDepartments,
  persistMembers, persistNameMap, persistRequest, persistService, persistSettings,
  resolveRequest, saveLocal, seedState, state, setState, setFb, setAuthReady,
  setAuthStatus, setDepartmentsLoaded, setMembersLoaded, ui, verifiedSession
} from './core/state.js';
import {
  authActor, authorizedDepartments, canManageAnyDepartment, canManageSelectedDepartment,
  canPermission, isForcedSession, isVerifiedSession, permissionApi, permissionConfig,
  selectedManageDepartment
} from './core/auth.js';
import {
  assignDepartmentDutyForService, departmentDraftProfile, departmentErrorMessage,
  departmentPatch, departmentProfile, departmentProfileAssignable, departmentProfileByName,
  departmentProfileIsLeader, departmentProfiles, departmentRuntimeKey, departmentServiceTimeKey,
  departmentServiceTimeLabel, isOwnDepartmentProfile, loadDepartmentRoster, loadOwnDepartmentProfiles,
  normalizeDepartmentAvailability, ownDepartmentProfiles, replaceDepartmentProfile, saveDepartmentProfile,
  saveOwnDepartmentAvailability, unassignDepartmentDutyForService
} from './core/departments.js';
import {dutiesFor, pastServices, preferredScheduleService, upcomingServices} from './core/schedule.js';
import {
  addBanner, afterDataChange, checkReminders, getJSON, notifyOn, registerPush,
  renderSoon, sysNotify, unregisterPush, setNotifyRenderRefs
} from './core/notify.js';
import {autoSyncOnce, scheduleSyncSoon, syncFromSheet, setSheetSyncRefs} from './core/sheet-sync.js';
import {copyICSLink, downloadICS, subscribeICS} from './core/calendar.js';
import {
  authCall, memberChangePin, memberLogin, memberLogout, safeAuthMessage, syncAuthUser,
  setSessionRefs
} from './core/session.js';
import {
  render as _render, renderSiteLock as _renderSiteLock, renderUnlock, renderCreatePin,
  renderLoading, renderBanners, setShellRenderRefs
} from './views/shell.js';
import {
  renderSchedule as _renderSchedule, renderMy as _renderMy,
  renderServiceCard, categoryHasAssignments, renderCatRows
} from './views/schedule.js';
import {
  renderManage as _renderManage, renderManageServices as _renderManageServices,
  renderManagePlanning as _renderManagePlanning, renderManageRequests as _renderManageRequests,
  renderManagePeople as _renderManagePeople, renderFeatures as _renderFeatures,
  renderManageData as _renderManageData, manageDepartment, manageRequestVisible,
  manageServiceVisible, setManageActiveRenderRefs, setManagePermissionRefs
} from './views/manage.js';
import {
  actionableDepartmentForDuty, actionableCountsForViewer, requestIsActionable
} from './views/requests.js';
import {
  songCtx, loadTag, setSongsRenderRef, setSongsPermissionRefs, setSetlistIndex
} from './views/songs.js';
import {findService, canEditSongService, canManagePresiders, setDispatchRenderRef} from './actions/dispatch.js';

setConstantsStateRef(state);
setPlanningRefs(state, departmentProfiles, departmentProfileAssignable);
setSongsPermissionRefs(canEditSongService, canManagePresiders);
setManagePermissionRefs(canEditSongService);
// The 11 names below are each declared as a plain mutable local here, seeded
// from the real implementation each module exports. design-gallery/
// build.mjs splices host-bridge.js as literal text right before this file's
// closing init(); call, and host-bridge.js REASSIGNS every one of these 11
// local bindings in place with a version that also paints the active
// appearance (see its own `originals` capture and its reassignments).
// Capturing the module's real function as a `const` or importing it
// directly (instead of shadowing it with a local `let`) would make this
// reassignment impossible: an ES import binding is read-only from the
// importing module's side. Every OTHER module that needs to call one of
// these 11 by name (so it sees the live, possibly-patched version, exactly
// as it would if this were still one file) receives the current value via a
// setter, called from init() below so the push happens after the injected
// gallery code has already run. renderManagePeople is reassigned the same
// way but never called by name anywhere in this app; it still needs the
// local shadow below so the reassignment itself has somewhere to land.
// renderUnlock, renderCreatePin, renderServiceCard and songCtx are NOT
// monkey-patched, despite each having a same-named reassignment somewhere in
// design-gallery/build.mjs's raw source inputs: build.mjs's own transforms
// strip the renderUnlock/renderCreatePin reassignment out of
// prototype-prism/all-pages.js before splicing (see its
// `retiredPrismAuth`/`optionalOnce` step), the songCtx reassignment in
// prototype/aurora.js sits before the `between('const paths=', ...)` extract
// boundary and is never captured into the spliced text, and
// renderServiceCard's reassignments in prototype-prism/song-pages.js and
// prototype/presider-workspace.js are appended only to song-app.js's own
// separate build output. All four below are ordinary imports.
let render = _render;
let renderSiteLock = _renderSiteLock;
let renderSchedule = _renderSchedule;
let renderMy = _renderMy;
let renderManage = _renderManage;
let renderManageServices = _renderManageServices;
let renderManagePlanning = _renderManagePlanning;
let renderManageRequests = _renderManageRequests;
let renderManagePeople = _renderManagePeople;
let renderFeatures = _renderFeatures;
let renderManageData = _renderManageData;

/* ================= startup ================= */

function setSyncPill(live) {
  const pill = document.getElementById('sync-pill');
  pill.textContent = live ? 'Live sync on' : 'This device only';
  pill.classList.toggle('live', !!live);
}

/* ---- Pulse: the smallest honest answer to "does anyone open this?" ----
   Writes ONE document per day, `pulse/{YYYY-MM-DD}`, holding plain counters.

   It stores no device id, no name, no free text, nothing that identifies a
   person. Each device counts itself at most once per event per day, using a
   localStorage note that never leaves the phone, so the number means
   "devices that did this today", not "taps".

   Why this exists: as of July 2026 not one of the church apps had any
   measurement at all, so "is the worship schedule read by fifty people or by
   nobody?" was unanswerable, a busy app and a dead one looked identical. */
const pulseInFlight = new Set(); // stops a double-count before the write resolves

function pulse(event) {
  if (!fb || !fb.increment) return;
  try {
    const day = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
    const key = 'wd-pulse-' + day;
    const seen = (localStorage.getItem(key) || '').split(',').filter(Boolean);
    if (seen.includes(event) || pulseInFlight.has(event)) return; // counted already
    pulseInFlight.add(event);

    fbWrite(() => fb.setDoc(
      fb.doc(fb.db, 'pulse', day),
      { date: day, [event]: fb.increment(1) },
      { merge: true }
    )).then(() => {
      // Only remember it once the write actually landed. Marking it earlier
      // meant a rejected write (offline, rules not yet deployed, quota) made
      // this device stop counting for the rest of the day, silently.
      const now = (localStorage.getItem(key) || '').split(',').filter(Boolean);
      if (!now.includes(event)) {
        now.push(event);
        localStorage.setItem(key, now.join(','));
      }
      for (let i = localStorage.length - 1; i >= 0; i--) { // keep only today's note
        const k = localStorage.key(i);
        if (k && k.startsWith('wd-pulse-') && k !== key) localStorage.removeItem(k);
      }
    }).catch(() => {
      pulseInFlight.delete(event);                  // let a later attempt retry
    });
  } catch (e) { /* private mode, quota, clock, all non-fatal */ }
}

async function initFirebase(config) {
  // Fetched together, not one after the other: these are two separate
  // downloads from Google's CDN and the second does not depend on the first.
  const [appMod, fsMod, authMod, functionsMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js')
  ]);
  const app = appMod.initializeApp(config);

  // App Check, attests requests come from the real app. Activates only once a
  // reCAPTCHA v3 site key is configured (window.RECAPTCHA_SITE_KEY); until then
  // it's a no-op so the app keeps working during rollout. Must run right after
  // initializeApp, before any other Firebase service makes a request. NOTE: do
  // NOT turn on Firestore App Check *enforcement* in the console until the song
  // app (shared project) also ships this, enforcement is project-wide.
  if (window.RECAPTCHA_SITE_KEY) {
    try {
      const acMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js');
      acMod.initializeAppCheck(app, {
        provider: new acMod.ReCaptchaV3Provider(window.RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) { console.warn('App Check init failed:', e); }
  }

  const db = fsMod.getFirestore(app);
  const auth = authMod.getAuth(app);
  const functions = functionsMod.getFunctions(app, 'us-central1');
  setFb({
    db,
    auth,
    functions,
    callable: name => functionsMod.httpsCallable(functions, name),
    signInWithCustomToken: authMod.signInWithCustomToken,
    signOut: authMod.signOut,
    doc: fsMod.doc,
    setDoc: fsMod.setDoc,
    deleteDoc: fsMod.deleteDoc,
    writeBatch: fsMod.writeBatch,
    // Extras for the song module (song-app.js), it shares this app's single
    // Firebase instance and anonymous auth instead of initializing its own.
    collection: fsMod.collection,
    query: fsMod.query,
    where: fsMod.where,
    onSnapshot: fsMod.onSnapshot,
    getDoc: fsMod.getDoc,
    getDocs: fsMod.getDocs,
    updateDoc: fsMod.updateDoc,
    runTransaction: fsMod.runTransaction,
    arrayUnion: fsMod.arrayUnion,
    arrayRemove: fsMod.arrayRemove,
    increment: fsMod.increment,
    knownIds: []
  });
  setAuthStatus('loading');
  setAuthReady(Promise.resolve(null));
  authMod.onAuthStateChanged(auth, user => { syncAuthUser(user, false); });
  // Cloud Messaging, best-effort; unsupported browsers just leave messaging null.
  try {
    const msgMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
    if (await msgMod.isSupported()) {
      fb.messaging = msgMod.getMessaging(app);
      fb.getToken = msgMod.getToken;
      fb.deleteToken = msgMod.deleteToken;
    }
  } catch (e) { console.warn('FCM unavailable:', e); }
  // Fast first paint. The last 30 days plus everything ahead is a small slice of
  // the collection and is all any member ever looks at, so it is fetched as its
  // own query in parallel with the full one below and painted the moment it
  // lands. The full listener still owns the data: Manage edits past services and
  // the sheet sync compares against every service, so history must be complete
  // before either runs. This one only ever paints, never seeds, syncs or alerts.
  let historyLoaded = false;
  let unsubRecent = fsMod.onSnapshot(
    fsMod.query(fsMod.collection(db, 'schedule'), fsMod.where('date', '>=', isoDaysAgo(30))),
    snap => {
      if (historyLoaded || snap.empty) return;
      state.services = snap.docs.map(d => d.data());
      canonicalizeStateNames();
      setSyncPill(true);
      renderSoon();
    },
    () => { /* the full listener below is what reports connection errors */ }
  );
  const takeOverFromRecent = () => {
    historyLoaded = true;
    if (unsubRecent) { unsubRecent(); unsubRecent = null; }
  };

  let firstSnapshot = true;
  fsMod.onSnapshot(fsMod.collection(db, 'schedule'), snap => {
    takeOverFromRecent();
    if (firstSnapshot && snap.empty) {
      firstSnapshot = false;
      // brand-new database: upload the spreadsheet schedule once
      setState(loadLocal() || seedState());
      persistAll();
      setSyncPill(true); // data is now flowing, safe to claim "Live sync on"
      afterDataChange();
      scheduleSyncSoon();
      return;
    }
    firstSnapshot = false;
      state.services = snap.docs.map(d => d.data());
      canonicalizeStateNames();
    fb.knownIds = snap.docs.map(d => d.id);
    setSyncPill(true); // data has landed, flip the pill to live now, not before
    afterDataChange();
    scheduleSyncSoon(); // auto-pull from the sheet once, shortly after real data lands
  }, err => {
    addBanner('Could not connect to the shared database (' + err.code + '). Showing this device\'s copy.', true);
    if (!state.services.length) { setState(loadLocal() || seedState()); render(); }
    setSyncPill(false);
  });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'members'), snap => {
    if (snap.exists()) state.members = (snap.data().list || []).map(canonicalMemberName);
    canonicalizeStateNames();
    setMembersLoaded(true);
    renderSoon();
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'settings'), snap => {
    if (snap.exists()) {
      state.settings = Object.assign({ features: {}, pinHash: '' }, snap.data());
      renderSoon();
    }
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'departments'), snap => {
    const map = snap.exists() ? (snap.data().map || {}) : null;
    if (!map || !Object.keys(map).length) {
      state.departments = JSON.parse(JSON.stringify(DEPARTMENTS_SEED));
      if (isVerifiedSession() && canPermission('isAdmin', authActor())) persistDepartments();
    } else {
      state.departments = map;
    }
    canonicalizeStateNames();
    setDepartmentsLoaded(true);
    renderSoon();
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'leaderConfig'), snap => {
    if (snap.exists()) state.permissionConfig = snap.data();
    renderSoon();
  }, () => { /* built-in role configuration remains the safe fallback */ });
  fsMod.onSnapshot(fsMod.doc(db, 'app', 'nameMap'), snap => {
    const map = snap.exists() ? (snap.data().map || {}) : null;
    if (!map || !Object.keys(map).length) {
      // brand-new doc: seed it once from the built-in map
      setSharedNameMap(NAME_UNIFY_MAP);
      persistNameMap(NAME_UNIFY_MAP);
    } else {
      setSharedNameMap(map);
    }
  }, () => { /* connection errors are surfaced by the schedule listener */ });
  // Upcoming setlists only: enough for the My Duties song indicator without
  // pulling down every setlist the church has ever planned.
  fsMod.onSnapshot(
    fsMod.query(fsMod.collection(db, 'setlists'), fsMod.where('date', '>=', todayISO())),
    snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setSetlistIndex(map);
      renderSoon();
    },
    () => { /* the indicator just stays quiet; errors surface on the schedule listener */ });
}

function init() {
  setNotifyRenderRefs(render, renderBanners);
  setSheetSyncRefs(findService, render);
  setSessionRefs(render, pulse);
  setSongsRenderRef(render);
  setDispatchRenderRef(render);
  setShellRenderRefs(pulse, renderSchedule, renderMy, renderManage, renderSiteLock);
  setManageActiveRenderRefs(renderManageServices, renderManagePlanning, renderManageRequests, renderFeatures, renderManageData);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (window.FIREBASE_CONFIG) {
    // Paint the schedule this device saw last, right now, instead of a
    // "Loading…" placeholder. The live snapshot overwrites it moments later.
    // membersLoaded / departmentsLoaded stay false on purpose: they gate the
    // sheet sync, which must not run against a cached roster.
    const cached = loadLocal();
    if (cached && cached.services && cached.services.length) {
      setState(cached);
      render();
    } else {
      renderLoading();
    }
    initFirebase(window.FIREBASE_CONFIG).catch(() => {
      addBanner('Firebase config is invalid - running on this device only.', true);
      setState(loadLocal() || seedState());
      setDepartmentsLoaded(true);
      setMembersLoaded(true);
      setAuthStatus('local');
      setSyncPill(false);
      afterDataChange();
    });
  } else {
    setState(loadLocal() || seedState());
    setDepartmentsLoaded(true);
    setMembersLoaded(true);
    setAuthStatus('local');
    saveLocal();
    setSyncPill(false);
    afterDataChange();
    autoSyncOnce();
  }
  setInterval(checkReminders, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
}

init();
