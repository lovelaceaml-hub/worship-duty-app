import {ASSET_V, unifiedNameMap} from '../core/constants.js';
import {svcId} from '../core/format.js';
import {fb, state, ui, verifiedSession} from '../core/state.js';
import {isForcedSession, isVerifiedSession} from '../core/auth.js';

// render (views/shell.js) is not imported directly: same host-bridge
// evaluation-order reasoning as core/session.js. canEditSongService and
// canManagePresiders (actions/dispatch.js, Section 5) do not exist yet at
// this module's own place in the moduleOrder, and are pushed in the same way.
let render, canEditSongService, canManagePresiders;
export function setSongsRenderRef(renderFn) { render = renderFn; }
export function setSongsPermissionRefs(canEditSongServiceFn, canManagePresidersFn) {
  canEditSongService = canEditSongServiceFn;
  canManagePresiders = canManagePresidersFn;
}
export function setSetlistIndex(map) { setlistIndex = map; }

// songCtx is also monkey-patched by design-gallery/build.mjs's gallery
// sources (prototype/aurora.js reassigns it). app.js keeps its own live copy
// and pushes it back in here under a different local name, so this module's
// own internal caller (renderSongs) sees the current, possibly-patched
// version instead of shadowing app.js's copy with the real implementation.
let activeSongCtx;
export function setSongsActiveRenderRefs(songCtxFn) { activeSongCtx = songCtxFn; }

export let songApp = null;      // the imported module, once loaded
export let songAppLoading = null; // in-flight import promise
export let songAssetsLoading = null; // in-flight <link>/<script> loads
export function loadTag(el) {
  return new Promise((resolve, reject) => {
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('could not load ' + (el.src || el.href)));
    document.head.appendChild(el);
  });
}
export function loadSongAssets() {
  if (songAssetsLoading) return songAssetsLoading;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'song-app.css' + ASSET_V;
  const seed = document.createElement('script');
  seed.src = 'song-seed.js' + ASSET_V;
  const lib = document.createElement('script');
  lib.src = 'song-lib.js' + ASSET_V;
  songAssetsLoading = Promise.all([loadTag(css), loadTag(seed), loadTag(lib)])
    .catch(e => { songAssetsLoading = null; throw e; });
  return songAssetsLoading;
}
export function loadSongApp() {
  if (songApp) return Promise.resolve(songApp);
  if (!songAppLoading) {
    songAppLoading = loadSongAssets()
      .then(() => import('../song-app.js' + ASSET_V))
      .then(m => { songApp = m; return m; })
      .catch(e => { songAppLoading = null; throw e; });
  }
  return songAppLoading;
}
export function songCtx() {
  const nameMap = unifiedNameMap();
  const svc = ui.songSvc ? state.services.find(s => svcId(s) === ui.songSvc) : null;
  // Consume the one-shot navigation flag: only the render triggered by the
  // Presider tab / "Pick songs" tap navigates the planner; background
  // re-mounts (live sync) must not yank the presider off whatever view
  // they're using.
  const nav = ui.songNav;
  ui.songNav = false;
  return {
    fb,
    me: nameMap[ui.me] || ui.me,
    permissions: verifiedSession || {},
    nameMap,
    nav,
    // Deep-link hint: the service whose Presider button was tapped (if any).
    service: svc ? {
      date: svc.date, worship: svc.worship, service: svc.service, time: svc.time,
      choirSong: svc.choirSong || '',
      assignments: Object.assign({}, svc.assignments || {}),
      presider: (svc.assignments || {}).Presider || ''
    } : null,
    canEditSongService: service => isVerifiedSession() && !isForcedSession() && canEditSongService(service),
    canManagePresiders: () => isVerifiedSession() && !isForcedSession() && canManagePresiders(),
    onBack: () => { ui.tab = 'my'; ui.songSvc = null; render(); }
  };
}
export function renderSongs(view) {
  if (!document.getElementById('song-root')) {
    view.innerHTML =
      '<div class="song-head"><button class="ghost" data-act="close-songs">← My Duties</button></div>' +
      '<div id="song-root"><div class="empty">Loading the song planner…</div></div>';
  }
  loadSongApp().then(m => {
    const root = document.getElementById('song-root');
    if (root && ui.tab === 'songs') m.mount(root, activeSongCtx());
  }).catch(e => {
    console.warn('song-app failed to load:', e);
    const root = document.getElementById('song-root');
    if (root) root.innerHTML = '<div class="empty">The song planner could not load. Check your connection and try again.</div>';
  });
}
export let setlistIndex = {};
export function songStateFor(id) {
  const sl = setlistIndex[id];
  if (!sl) return null;
  const count = (sl.songs || []).length;
  const confirmedAt = sl.confirmedAt || 0;
  return {
    count: count,
    confirmed: !!(count && confirmedAt && confirmedAt >= (sl.updatedAt || 0)),
    changed: !!(count && confirmedAt && confirmedAt < (sl.updatedAt || 0))
  };
}
export function songStateTag(id) {
  const st = songStateFor(id);
  if (!st || !st.count) return '';
  if (st.confirmed) return '<span class="song-tag done">Songs confirmed</span>';
  const n = st.count + ' song' + (st.count === 1 ? '' : 's');
  return '<span class="song-tag">' + (st.changed ? n + ', confirm again' : n + ', not confirmed') + '</span>';
}
