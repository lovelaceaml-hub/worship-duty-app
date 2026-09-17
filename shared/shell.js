/* startShell(host): the render loop, event delegation, history handling, and
   layout dispatch. app.js owns Firebase, auth, listeners, writes, and every
   domain rule; it builds one `host` object (the same pattern as the existing
   songCtx()) and hands it to startShell(). This module and every other
   shared/layouts module never import app.js and never touch Firebase. */

import * as state from './state.js';
import * as components from './components.js';
import { layouts, LAYOUT_IDS } from '../layouts/index.js';
import { buildNavigation } from './nav.js';
import {
  buildScheduleInfo, buildAppearanceInfo, buildUnavailableInfo, buildDutiesInfo,
  buildAvailabilityInfo, buildRemindersInfo, buildManageScheduleInfo, buildAttentionInfo,
  buildManageMembersInfo, buildManageExceptionsInfo, buildManageSettingsInfo,
  buildSongsMyServiceInfo, buildSongsHistoryInfo, screenForRoute
} from './screens.js';

const SHEET_TIMEOUT_MS = 7000;

let hostRef = null;
let mountEl = null;
let currentLayout = null;
let currentMode = 'classic';
let recoveryMode = false;
let attached = false;
let lastKnownRoute = state.route();
let lastScreenId = '';

function legacyKindFor(route) {
  if (route.indexOf('#manage') === 0) return 'manage';
  if (route.indexOf('#songs') === 0) return 'songs';
  return 'my';
}

function isAuthorized(route, account) {
  if (route.indexOf('#manage') === 0) return !!(account && account.canManage);
  if (route.indexOf('#songs') === 0) return !!(account && (account.isPresider || account.canEditSongs));
  return true;
}

/* An unknown route (a typo, a stale link, anything not in shared/state.js's
   ROUTES) resolves to #unavailable rather than falling through to whichever
   legacy screen `legacyKindFor` would otherwise guess at (ruling section 4).
   An empty hash (a fresh load with nothing after '#') is not "unknown": it
   means the member has not picked a screen yet, so it resolves to their role
   start route instead. */
function resolveRoute(requested, account) {
  if (!requested) return state.startRouteFor(account);
  if (!state.isKnownRoute(requested)) return '#unavailable';
  if (!isAuthorized(requested, account)) return '#unavailable';
  return requested;
}

function stylesheetLink() {
  return document.getElementById('wd-appearance-sheet');
}

function sheetMatchesMode(mode) {
  const link = stylesheetLink();
  return !!link && link.dataset.appearanceMode === mode;
}

function waitForSheet(mode) {
  return new Promise(resolve => {
    let link = stylesheetLink();
    const stamp = (link && link.href.split('?v=')[1]) || 'DEV';
    if (!link || link.dataset.appearanceMode !== mode) {
      const next = document.createElement('link');
      next.id = 'wd-appearance-sheet';
      next.rel = 'stylesheet';
      next.dataset.appearanceMode = mode;
      next.href = (window.WD_APPEARANCE.SHEETS[mode] || 'styles/original.css') + '?v=' + stamp;
      if (link) link.replaceWith(next); else document.head.appendChild(next);
      link = next;
    }
    let done = false;
    let timer = null;
    const finish = ok => { if (done) return; done = true; clearTimeout(timer); resolve(ok); };
    if (link.sheet) { finish(true); return; }
    link.addEventListener('load', () => finish(true), { once: true });
    link.addEventListener('error', () => finish(false), { once: true });
    timer = setTimeout(() => finish(!!link.sheet), SHEET_TIMEOUT_MS);
  });
}

function loadLayout(mode) {
  const sheetReady = waitForSheet(mode);
  const modulePromise = Promise.resolve(layouts[mode]).then(layout => {
    if (!layout) throw new Error('Unknown appearance: ' + mode);
    return layout;
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SHEET_TIMEOUT_MS));
  return Promise.race([Promise.all([sheetReady, modulePromise]), timeout])
    .then(([sheetOk, layout]) => {
      if (!sheetOk) throw new Error('stylesheet failed');
      return layout;
    });
}

function applyMode(mode) {
  return loadLayout(mode).then(layout => {
    currentLayout = layout;
    currentMode = mode;
    recoveryMode = false;
    document.documentElement.setAttribute('data-appearance', mode);
    return true;
  }).catch(() => {
    recoveryMode = true;
    return false;
  });
}

function legacyHasFocusedInput() {
  const container = document.getElementById('wd-legacy-mount');
  const active = document.activeElement;
  if (!container || !active || !container.contains(active)) return false;
  if (active.tagName === 'TEXTAREA') return true;
  if (active.tagName !== 'INPUT') return false;
  const t = (active.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'search', 'url', 'password', 'number', 'email', 'tel', 'date', 'time'].indexOf(t) !== -1;
}

/* One text search field per screen that has one, each with its own DOM id
   and its own route-memory `query`, so typing in one never clobbers another
   screen's search state. */
const SEARCH_FIELDS = {
  schedule: { id: 'wd-schedule-search', route: '#schedule' },
  manageSchedule: { id: 'wd-manage-schedule-search', route: '#manage/schedule' },
  manageMembers: { id: 'wd-member-search', route: '#manage/members' },
  songsHistory: { id: 'wd-song-history-search', route: '#songs/history' }
};

function focusedSearchState(screenId) {
  const field = SEARCH_FIELDS[screenId];
  const el = field && document.getElementById(field.id);
  if (!el || document.activeElement !== el) return null;
  return { start: el.selectionStart, end: el.selectionEnd };
}

function restoreSearchFocus(saved, screenId) {
  if (!saved) return;
  const field = SEARCH_FIELDS[screenId];
  const el = field && document.getElementById(field.id);
  if (!el) return;
  el.focus();
  try { el.setSelectionRange(saved.start, saved.end); } catch (e) { /* ignore */ }
}

function pickRoute(account) {
  const pending = state.consumePendingDestination();
  const requested = pending || state.route();
  const route = resolveRoute(requested, account);
  if (route !== state.route()) state.go(route, { replace: true });
  return route;
}

function renderPhase(phase) {
  const layout = currentLayout || layouts.classic;
  let html = '';
  const info = {
    siteLockHtml: hostRef.siteLockHtml ? hostRef.siteLockHtml() : '',
    loginHtml: hostRef.loginHtml ? hostRef.loginHtml() : '',
    forcedPinHtml: hostRef.forcedPinHtml ? hostRef.forcedPinHtml() : '',
    maintenanceHtml: hostRef.maintenanceHtml ? hostRef.maintenanceHtml() : ''
  };
  if (phase === 'maintenance') html = layout.phase.maintenance(info, components);
  else if (phase === 'locked') html = layout.phase.locked(info, components);
  else if (phase === 'forcedPin') html = layout.phase.forcedPin(info, components);
  else if (phase === 'signin') html = layout.phase.signin(info, components);
  else html = layout.phase.loading(info, components);
  mountEl.innerHTML = html;
}

function renderRecovery() {
  const layout = currentLayout || layouts.classic;
  mountEl.innerHTML = layout.phase.recovery({}, components);
}

function refreshChrome(nav, route, account) {
  // Only chrome that never overlaps legacy content: header/appearance button,
  // secondary tabs, main nav, save bar, banners. The legacy container itself
  // is left untouched so a focused draft is never wiped mid-render.
  const layout = currentLayout;
  const bannersEl = mountEl.querySelector('.wd-banners');
  if (bannersEl && hostRef.banners) bannersEl.innerHTML = (hostRef.banners() || []).join('');
  const navEl = mountEl.querySelector('[data-section="main-nav"]');
  if (navEl) navEl.outerHTML = components.mainNav(nav, route);
}

function renderReady() {
  const account = hostRef.account();
  if (!account) { renderPhase('signin'); return; }
  const nav = buildNavigation(account);
  const route = pickRoute(account);

  if (legacyHasFocusedInput() && lastScreenId === 'legacy' && screenForRoute(route) === 'legacy') {
    refreshChrome(nav, route, account);
    return;
  }

  const screenId = screenForRoute(route);
  let info;
  if (screenId === 'schedule') info = buildScheduleInfo(hostRef, state.memory('#schedule'));
  else if (screenId === 'duties') info = buildDutiesInfo(hostRef, state.memory('#duties'));
  else if (screenId === 'availability') info = buildAvailabilityInfo(hostRef);
  else if (screenId === 'reminders') info = buildRemindersInfo(hostRef);
  else if (screenId === 'manageSchedule') info = buildManageScheduleInfo(hostRef, state.memory('#manage/schedule'));
  else if (screenId === 'attention') info = buildAttentionInfo(hostRef, state.memory('#manage/attention'));
  else if (screenId === 'manageMembers') info = buildManageMembersInfo(hostRef, state.memory('#manage/members'));
  else if (screenId === 'manageExceptions') info = buildManageExceptionsInfo(hostRef);
  else if (screenId === 'manageSettings') info = buildManageSettingsInfo(hostRef);
  else if (screenId === 'songsMyService') info = buildSongsMyServiceInfo(hostRef, state.memory('#songs/my-service'));
  else if (screenId === 'songsHistory') info = buildSongsHistoryInfo(hostRef, state.memory('#songs/history'));
  else if (screenId === 'appearance') info = Object.assign(buildAppearanceInfo(hostRef), { returnRoute: state.startRouteFor(account) });
  else if (screenId === 'unavailable') info = buildUnavailableInfo(hostRef, route);
  else info = { kind: legacyKindFor(route) };

  const savedSearch = SEARCH_FIELDS[screenId] ? focusedSearchState(screenId) : null;
  const savedScrollY = window.scrollY;
  state.setMemory(lastKnownRoute, { scrollY: savedScrollY });

  const model = {
    account, navigation: nav, route,
    screenHtml: currentLayout.screens[screenId](info, components),
    saveState: null,
    banners: hostRef.banners ? hostRef.banners() : []
  };
  mountEl.innerHTML = currentLayout.shell(model, components);
  lastScreenId = screenId;
  lastKnownRoute = route;

  if (screenId === 'legacy') {
    const container = document.getElementById('wd-legacy-mount');
    if (container) {
      if (info.kind === 'songs' && hostRef.legacy.songs) hostRef.legacy.songs(container);
      else if (info.kind === 'manage') container.innerHTML = hostRef.legacy.manage();
      else container.innerHTML = hostRef.legacy.my();
    }
  } else if (SEARCH_FIELDS[screenId]) {
    restoreSearchFocus(savedSearch, screenId);
  }

  const mem = state.memory(route);
  requestAnimationFrame(() => window.scrollTo(0, mem.scrollY || 0));
  if (hostRef.pulse) hostRef.pulse(screenId === 'legacy' ? info.kind : screenId);
}

function renderNow() {
  if (!hostRef) return;
  const phase = hostRef.phase();
  if (phase !== 'ready') { renderPhase(phase); return; }
  if (recoveryMode) { renderRecovery(); return; }
  renderReady();
}

function stepMonth(dir) {
  const info = buildScheduleInfo(hostRef, state.memory('#schedule'));
  const idx = info.months.indexOf(info.month);
  const next = info.months[idx + dir];
  if (next) state.setMemory('#schedule', { month: next });
  renderNow();
}

function updateKeyboardState() {
  if (!window.visualViewport) return;
  const shrink = window.innerHeight - window.visualViewport.height;
  document.body.classList.toggle('wd-keyboard-open', shrink > 120);
}

function onDocClick(e) {
  const routeEl = e.target.closest('[data-route]');
  if (routeEl) {
    e.preventDefault();
    if (state.isDirty() && !window.confirm('Leave without saving your changes?')) return;
    state.go(routeEl.getAttribute('data-route'));
    return;
  }
  const actEl = e.target.closest('[data-act]');
  if (!actEl) return;
  const act = actEl.dataset.act;
  if (act === 'wd-month-prev') stepMonth(-1);
  else if (act === 'wd-month-next') stepMonth(1);
  else if (act === 'wd-appearance-select') selectAppearance(actEl.dataset.mode);
  else if (act === 'wd-appearance-retry') { applyMode(currentMode || 'classic').then(renderNow); }
  else if (act === 'wd-appearance-use-original') {
    window.WD_APPEARANCE.useOriginalForSession();
    applyMode('classic').then(renderNow);
  }
  else if (act === 'wd-request-open') { state.setMemory('#duties', { reqKey: actEl.dataset.key }); renderNow(); }
  else if (act === 'wd-request-cancel') { state.setMemory('#duties', { reqKey: null }); renderNow(); }
  else if (act === 'wd-request-submit') {
    const note = (document.getElementById('wd-request-note') || {}).value || '';
    if (!hostRef.actions || typeof hostRef.actions.requestChange !== 'function') return;
    hostRef.actions.requestChange(actEl.dataset.svc, actEl.dataset.duty, note)
      .then(() => { state.setMemory('#duties', { reqKey: null }); renderNow(); })
      .catch(() => { renderNow(); });
  }
  else if (act === 'wd-availability-toggle') {
    const d = actEl.dataset;
    if (hostRef.actions && hostRef.actions.toggleAvailability) hostRef.actions.toggleAvailability(d.dept, d.uid, d.key);
  }
  else if (act === 'wd-availability-exception-remove') {
    const d = actEl.dataset;
    if (hostRef.actions && hostRef.actions.removeAvailabilityException) hostRef.actions.removeAvailabilityException(d.dept, d.uid, d.date, d.key);
  }
  else if (act === 'wd-availability-exception-add') {
    const card = actEl.closest('[data-dept]');
    const form = actEl.closest('.wd-exception-form');
    if (!card || !form) return;
    const dateInput = form.querySelector('input[type="date"]');
    const keySelect = form.querySelector('select[data-role="key"]');
    const statusSelect = form.querySelector('select[data-role="status"]');
    if (!dateInput || !keySelect || !statusSelect) return;
    if (hostRef.actions && hostRef.actions.addAvailabilityException) {
      hostRef.actions.addAvailabilityException(card.dataset.dept, card.dataset.uid, dateInput.value, keySelect.value, statusSelect.value);
    }
  }
  else if (act === 'wd-availability-save') {
    const d = actEl.dataset;
    if (hostRef.actions && hostRef.actions.saveAvailability) hostRef.actions.saveAvailability(d.dept, d.uid).catch(() => {});
  }
  else if (act === 'wd-availability-reset') {
    const d = actEl.dataset;
    if (hostRef.actions && hostRef.actions.resetAvailability) hostRef.actions.resetAvailability(d.dept, d.uid);
  }
  else if (act === 'wd-availability-retry') {
    if (hostRef.actions && hostRef.actions.retryAvailabilityLoad) hostRef.actions.retryAvailabilityLoad();
  }
  else if (act === 'wd-save-retry') {
    // Generic retry for any per-card save bar: the nearest ancestor carrying
    // data-dept/data-uid identifies which save controller to re-trigger.
    const card = actEl.closest('[data-dept][data-uid]');
    if (card && hostRef.actions && hostRef.actions.retrySave) hostRef.actions.retrySave(card.dataset.dept, card.dataset.uid);
  }
  else if (act === 'wd-reminder-notify-on') {
    if (hostRef.actions && hostRef.actions.notifyOn) hostRef.actions.notifyOn().then(renderNow);
  }
  else if (act === 'wd-reminder-notify-off') {
    if (hostRef.actions && hostRef.actions.notifyOff) hostRef.actions.notifyOff();
    renderNow();
  }
  else if (act === 'wd-reminder-subscribe-ics') { if (hostRef.actions && hostRef.actions.subscribeIcs) hostRef.actions.subscribeIcs(); }
  else if (act === 'wd-reminder-copy-ics') { if (hostRef.actions && hostRef.actions.copyIcs) hostRef.actions.copyIcs(); }
  else if (act === 'wd-reminder-clear-alerts') {
    if (hostRef.actions && hostRef.actions.clearAlerts) hostRef.actions.clearAlerts();
    renderNow();
  }
  else if (act === 'wd-page-prev' || act === 'wd-page-next') {
    const r = state.route();
    const mem = state.memory(r);
    const next = (mem.page || 1) + (act === 'wd-page-next' ? 1 : -1);
    state.setMemory(r, { page: Math.max(1, next) });
    renderNow();
  }
  else if (act === 'wd-attention-expand') {
    const r = state.route();
    const mem = state.memory(r);
    const expanded = Object.assign({}, mem.expanded);
    expanded[actEl.dataset.id] = !expanded[actEl.dataset.id];
    state.setMemory(r, { expanded });
    renderNow();
  }
  else if (act === 'wd-attention-approve' || act === 'wd-attention-decline') {
    if (hostRef.actions && hostRef.actions.resolveAttention) {
      hostRef.actions.resolveAttention(actEl.dataset.id, { decision: act === 'wd-attention-approve' ? 'approved' : 'declined' }).then(renderNow).catch(renderNow);
    }
  }
  else if (act === 'wd-attention-assign' || act === 'wd-attention-assign-anyway') {
    const card = actEl.closest('.wd-attention-card');
    const select = card && card.querySelector('select[data-role="replacement"]');
    const uid = select ? select.value : '';
    if (!uid && act === 'wd-attention-assign') return;
    if (hostRef.actions && hostRef.actions.resolveAttention) {
      hostRef.actions.resolveAttention(actEl.dataset.id, {
        replacementMemberUid: uid || undefined,
        acknowledgeConflict: act === 'wd-attention-assign-anyway'
      }).then(renderNow).catch(renderNow);
    }
  }
  else if (act === 'wd-attention-open') {
    if (hostRef.actions && hostRef.actions.resolveAttention) {
      hostRef.actions.resolveAttention(actEl.dataset.id, { replacementMemberUid: null }).then(renderNow).catch(renderNow);
    }
  }
  else if (act === 'wd-attention-conflict-ok') {
    if (hostRef.actions && hostRef.actions.acknowledgeConflict) hostRef.actions.acknowledgeConflict(actEl.dataset.id);
    renderNow();
  }
  else if (act === 'wd-members-department') {
    state.setMemory('#manage/members', { department: actEl.dataset.dept, query: '' });
    renderNow();
  }
  else if (act === 'wd-member-add') {
    if (hostRef.actions && hostRef.actions.addMember) {
      hostRef.actions.addMember(actEl.dataset.dept, actEl.dataset.uid, actEl.dataset.name).then(() => {
        state.setMemory('#manage/members', { query: '' });
        renderNow();
      }).catch(renderNow);
    }
  }
  else if (act === 'wd-member-invite') {
    if (hostRef.actions && hostRef.actions.createInvite) hostRef.actions.createInvite(actEl.dataset.dept).then(renderNow).catch(renderNow);
  }
  else if (act === 'wd-song-confirm') {
    if (hostRef.actions && hostRef.actions.confirmSongs) hostRef.actions.confirmSongs(actEl.dataset.svc).then(renderNow).catch(renderNow);
  }
  else if (act === 'wd-history-remove-song') {
    if (hostRef.actions && hostRef.actions.removeHistorySong) hostRef.actions.removeHistorySong(actEl.dataset.svc, actEl.dataset.song).then(renderNow).catch(renderNow);
  }
  else if (act === 'wd-history-retry') {
    if (hostRef.actions && hostRef.actions.retrySongHistory) hostRef.actions.retrySongHistory();
  }
}

function onDocSearchInput(e) {
  const match = Object.keys(SEARCH_FIELDS).find(id => e.target.closest('#' + SEARCH_FIELDS[id].id));
  if (!match) return;
  const field = SEARCH_FIELDS[match];
  const el = document.getElementById(field.id);
  state.setMemory(field.route, { query: el.value, page: 1 });
  renderNow();
}

function selectAppearance(mode) {
  if (!LAYOUT_IDS.includes(mode)) return;
  applyMode(mode).then(ok => {
    if (ok) window.WD_APPEARANCE.save(mode, true);
    else if (hostRef.addBanner) hostRef.addBanner('That design could not load. Staying on the current appearance.', true);
    renderNow();
  });
}

function attachListeners() {
  if (attached) return;
  attached = true;
  document.addEventListener('click', onDocClick);
  document.addEventListener('input', onDocSearchInput);
  window.addEventListener('scroll', () => {
    state.setMemory(lastKnownRoute, { scrollY: window.scrollY });
  }, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateKeyboardState);
  window.addEventListener('storage', e => {
    if (e.key === window.WD_APPEARANCE.KEY) { /* another tab changed appearance; adopt on next visit */ }
  });
}

export function startShell(host) {
  hostRef = host;
  mountEl = document.getElementById('wd-app');
  attachListeners();
  const initialMode = (window.WD_APPEARANCE && LAYOUT_IDS.includes(window.WD_APPEARANCE.mode)) ? window.WD_APPEARANCE.mode : 'classic';
  // The layout module for the chosen appearance is already in this module
  // graph (see layouts/index.js), so the very first paint can use its own
  // loading skeleton immediately, no Original-then-switch repaint while the
  // stylesheet finishes verifying.
  currentLayout = layouts[initialMode];
  currentMode = initialMode;
  mountEl.innerHTML = currentLayout.phase.loading({}, components);
  state.onRouteChange(renderNow);
  host.onChange(renderNow);
  applyMode(initialMode).then(renderNow);
}
