/* One appearance preference for Original + three optional designs.
 * Presentation only: never copies or edits schedules, identity, auth, tokens,
 * feature settings, change requests or song plans. */
(function () {
  'use strict';
  const KEY = 'wds-design-gallery-v1';
  const LEGACY_PRISM = 'wds-design-choice-v1';
  const LEGACY_NAVY = 'wds-appearance-navy-v1';
  const MODES = ['classic', 'prism', 'navy', 'aurora'];
  const NAMES = {classic:'Original', prism:'Prism', navy:'Navy & Cream', aurora:'Aurora'};
  const forcedClassic = new URLSearchParams(location.search).get('design') === 'classic';
  let hooks, mode = 'classic', busy = false, initialized = false, queued = false;
  let dialog, previousFocus, volatile = false;

  function parse(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch { volatile = true; return {}; }
  }
  function migrate() {
    const current = parse(KEY);
    if (MODES.includes(current.mode)) return {mode:current.mode, seen:current.seen === true, version:2};
    const prism = parse(LEGACY_PRISM), navy = parse(LEGACY_NAVY);
    let legacyMode = 'classic';
    // Preserve an existing member's selected live appearance. Prism wins if
    // both experimental keys somehow exist because Prism was the first live chooser.
    if (prism.mode === 'prism') legacyMode = 'prism';
    else if (navy.design === 'navy') legacyMode = 'navy';
    return {mode:legacyMode, seen:false, version:2};
  }
  let saved = migrate();
  function persist(next) {
    saved = {...saved, ...next, version:2};
    try { localStorage.setItem(KEY, JSON.stringify(saved)); }
    catch { volatile = true; }
  }
  function ready() { return !!hooks?.ready?.(); }
  function message(text) {
    let el = document.getElementById('wd-design-status');
    if (!el) {
      el = document.createElement('p'); el.id = 'wd-design-status';
      el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
      document.body.append(el);
    }
    el.textContent = text; el.hidden = false;
    clearTimeout(message.timer); message.timer = setTimeout(() => { el.hidden = true; }, 6500);
  }
  function stylesheet(modeName) {
    return document.getElementById({prism:'wd-prism-css',navy:'wd-navy-css',aurora:'wd-aurora-css'}[modeName] || '');
  }
  function sentinel(modeName) { return '.wd-' + modeName + '-sentinel'; }
  function parsed(modeName) {
    if (modeName === 'classic') return true;
    const link = stylesheet(modeName); if (!link) return false;
    try { return [...(link.sheet?.cssRules || [])].some(r => r.selectorText?.split(',').some(s => s.trim() === sentinel(modeName))); }
    catch { return false; }
  }
  function themeReady(modeName) {
    if (modeName === 'classic') return Promise.resolve();
    const link = stylesheet(modeName);
    if (!link) return Promise.reject(Error(NAMES[modeName] + ' stylesheet is missing.'));
    if (parsed(modeName)) { link.media = 'all'; return Promise.resolve(); }
    // Listen BEFORE changing media. A cached or very small stylesheet can finish
    // between assigning media='all' and attaching load handlers. Polling the
    // sentinel as a fallback also covers browsers that do not emit a second load
    // event when a previously non-matching media sheet becomes active.
    return new Promise((resolve,reject) => {
      let done = false, poll = 0;
      const finish = ok => {
        if (done) return; done = true; clearTimeout(timer); clearInterval(poll);
        link.removeEventListener('load', yes); link.removeEventListener('error', no);
        ok ? resolve() : reject(Error(NAMES[modeName] + ' could not be loaded.'));
      };
      const yes = () => finish(parsed(modeName)), no = () => finish(false);
      link.addEventListener('load', yes, {once:true}); link.addEventListener('error', no, {once:true});
      poll = setInterval(() => { if (parsed(modeName)) finish(true); }, 40);
      const timer = setTimeout(no, 7000);
      link.media = 'all'; link.disabled = false;
      queueMicrotask(() => { if (parsed(modeName)) finish(true); });
    });
  }
  function disableUnusedStyles(active) {
    for (const m of ['prism','navy','aurora']) {
      const link = stylesheet(m); if (link) link.media = m === active ? 'all' : 'not all';
    }
  }
  async function change(next, remember = true) {
    if (!MODES.includes(next) || busy || !ready() || (forcedClassic && next !== 'classic')) return false;
    if (next === mode) {
      disableUnusedStyles(mode);
      if (remember) persist({mode:next, seen:true});
      refreshButtons(); return true;
    }
    busy = true; refreshButtons();
    const old = mode;
    try {
      await themeReady(next);
      if (!ready()) return false;
      mode = next;
      try { await hooks.apply(next, old); }
      catch (err) { mode = old; await hooks.apply(old, next); throw err; }
      disableUnusedStyles(mode);
      if (remember) persist({mode:next, seen:true});
      message(NAMES[next] + ' design enabled. Your schedules, duties, permissions and song plans are unchanged.' + (volatile ? ' This browser cannot save the preference.' : ''));
      return true;
    } catch (err) {
      console.warn('Appearance switch could not complete:', err);
      disableUnusedStyles(old);
      message('That design could not load. ' + NAMES[old] + ' is still active. Please try again when connected.');
      return false;
    } finally { busy = false; refreshButtons(); }
  }
  function refreshButtons() {
    document.querySelectorAll('[data-design-open]').forEach(b => {
      b.hidden = !ready(); b.disabled = busy;
      b.setAttribute('aria-label','Appearance. Current design: ' + NAMES[mode]);
      b.title = 'Appearance · ' + NAMES[mode];
      if (b.dataset.designLabel !== 'icon-only') b.textContent = 'Appearance';
    });
  }
  function previewMarkup(kind) {
    return '<span class="wd-mini wd-mini-'+kind+'" aria-hidden="true"><i></i><b></b><span></span><span></span><span></span><em></em></span>';
  }
  function tile(value, title, note, badge='') {
    const selected = mode === value;
    return '<button type="button" class="wd-design-tile" data-design-select="'+value+'" aria-pressed="'+selected+'">'+
      previewMarkup(value)+'<span class="wd-tile-copy"><strong>'+title+(badge?'<em>'+badge+'</em>':'')+'</strong><small>'+note+'</small></span>'+
      '<span class="wd-selected" aria-hidden="true">'+(selected?'✓':'')+'</span></button>';
  }
  function close() { if (dialog?.open) dialog.close(); }
  function open(invitation = false) {
    if (!ready() || dialog || busy) return;
    previousFocus = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'wd-design-dialog';
    dialog.setAttribute('aria-labelledby','wd-design-title'); dialog.setAttribute('aria-describedby','wd-design-description');
    dialog.innerHTML = '<button type="button" class="wd-close" aria-label="Keep current design and close">×</button>'+
      '<span class="wd-kicker">LV ZION · APPEARANCE</span><h2 id="wd-design-title">'+(invitation?'Choose the look you prefer':'Choose your design')+'</h2>'+
      '<p id="wd-design-description">One app, one shared schedule, four ways to view it. Your duties, song plans, login and permissions stay the same. You can switch again anytime using <strong>Appearance</strong>.</p>'+
      '<div class="wd-design-grid">'+
        tile('classic','Original','The familiar interface')+
        tile('prism','Prism','Calendar-first, clear workspace','NEW')+
        tile('navy','Navy & Cream','Warm, refined service timeline','NEW')+
        tile('aurora','Aurora','Spacious, dynamic workspace','NEW')+
      '</div>'+
      '<p class="wd-device-note">Your choice is saved on this browser/device only. It never changes what another member sees.</p>'+
      '<p class="wd-storage-note"'+(volatile?'':' hidden')+'>'+(volatile?'Browser storage is unavailable. Your choice may last only for this session.':'')+'</p>'+
      '<div class="wd-design-actions"><button type="button" class="wd-done">Keep '+NAMES[mode]+'</button></div>';
    dialog.querySelector('.wd-close').onclick = close;
    dialog.querySelector('.wd-done').onclick = close;
    dialog.addEventListener('click', async event => {
      const button = event.target.closest('[data-design-select]'); if (!button) return;
      const openDialog = dialog;
      openDialog.querySelectorAll('button').forEach(b => b.disabled = true);
      const ok = await change(button.dataset.designSelect);
      if (ok) openDialog.close();
      else if (openDialog.isConnected) openDialog.querySelectorAll('button').forEach(b => b.disabled = false);
    });
    dialog.addEventListener('close', () => {
      if (invitation && ready() && !saved.seen) persist({mode, seen:true});
      dialog?.remove(); dialog = undefined;
      if (previousFocus?.isConnected && !previousFocus.hidden) previousFocus.focus({preventScroll:true});
      else document.querySelector('[data-design-open]:not([hidden])')?.focus({preventScroll:true});
    }, {once:true});
    document.body.append(dialog); dialog.showModal(); dialog.querySelector('[aria-pressed="true"]')?.focus();
  }
  function afterRender() {
    refreshButtons();
    if (!ready()) { if (dialog) dialog.close(); return; }
    if (queued || busy || initialized) return;
    queued = true;
    setTimeout(async () => {
      queued = false; if (!ready() || initialized) return;
      initialized = true;
      if (!forcedClassic && saved.mode !== 'classic') await change(saved.mode, false);
      if (!ready()) return;
      if (!saved.seen) setTimeout(() => open(true), 180);
    }, 220);
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-design-open]')) { event.preventDefault(); open(false); }
  });
  window.addEventListener('storage', e => {
    // Never swap another open tab in the middle of an edit. Adopt it on reload.
    if (e.key === KEY) refreshButtons();
  });
  const icons = {
    schedule:'M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16 M8 15h2 M14 15h2',
    my:'M8 4h12v17H4V4h4 M8 3h8v4H8z M8 12l2 2 5-5 M8 18h8',
    songs:'M9 18V5l11-2v13 M9 9l11-2 M9 18c0 3-6 4-6 1s6-4 6-1 M20 16c0 3-6 4-6 1s6-4 6-1',
    manage:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
    search:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6-6 6',
    arrow:'M5 12h14 M13 6l6 6-6 6',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
    moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',people:'M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 21v-4c0-5 12-5 12 0v4 M16 5c5 0 5 7 0 7 M18 15c3 0 3 3 3 6',check:'M5 12l4 4L19 6'
  };
  const icon = name => '<svg class="a-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(icons[name]||icons.schedule)+'"/></svg>';
  window.WorshipDesign = {
    configure(value){ hooks = value; }, afterRender, open, change,
    isPrism:()=>mode==='prism', isNavy:()=>mode==='navy', isAurora:()=>mode==='aurora', isClassic:()=>mode==='classic',
    getPreference:()=>({...saved}), getMode:()=>mode, storageKey:KEY, enabled:true, icon
  };
})();
