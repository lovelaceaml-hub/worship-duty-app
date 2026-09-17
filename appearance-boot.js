/* Pre-paint appearance selection. Classic script, first thing in <head>, so
   the chosen stylesheet is a normal render-blocking link before any other
   stylesheet or body content. This is the only file allowed to run before
   the shell exists: it never touches schedules, identity, or Firebase.

   Storage key and stored ids are unchanged from the earlier gallery so an
   existing member's saved choice survives this rebuild:
     wds-design-gallery-v1 = { mode: classic|prism|navy|aurora, seen, version }
   Older keys (wds-design-choice-v1, wds-appearance-navy-v1) are migrated the
   first time this file runs against them, then left alone. */
(function () {
  'use strict';
  var KEY = 'wds-design-gallery-v1';
  var LEGACY_PRISM = 'wds-design-choice-v1';
  var LEGACY_NAVY = 'wds-appearance-navy-v1';
  var SESSION_FALLBACK = 'wds-appearance-session-fallback';
  var MODES = ['classic', 'prism', 'navy', 'aurora'];
  var NAMES = { classic: 'Original', prism: 'Prism', navy: 'Navy & Cream', aurora: 'Aurora' };
  var SHEETS = { classic: 'styles/original.css', prism: 'styles/prism.css', navy: 'styles/navy.css', aurora: 'styles/aurora.css' };

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function migrate() {
    var current = readJSON(KEY);
    if (MODES.indexOf(current.mode) !== -1) return { mode: current.mode, seen: current.seen === true, version: 2 };
    var prism = readJSON(LEGACY_PRISM), navy = readJSON(LEGACY_NAVY);
    var legacyMode = 'classic';
    if (prism.mode === 'prism') legacyMode = 'prism';
    else if (navy.design === 'navy') legacyMode = 'navy';
    return { mode: legacyMode, seen: false, version: 2 };
  }

  var forcedClassic = false;
  try { forcedClassic = new URLSearchParams(location.search).get('design') === 'classic'; }
  catch (e) { forcedClassic = false; }

  var sessionFallback = '';
  try { sessionFallback = sessionStorage.getItem(SESSION_FALLBACK) || ''; }
  catch (e) { sessionFallback = ''; }

  var saved = migrate();
  var mode = forcedClassic ? 'classic' : (sessionFallback === 'classic' ? 'classic' : saved.mode);
  if (MODES.indexOf(mode) === -1) mode = 'classic';

  var stamp = (document.currentScript && document.currentScript.src.split('?v=')[1]) || 'DEV';
  var href = SHEETS[mode] + '?v=' + stamp;

  document.documentElement.setAttribute('data-appearance', mode);
  // A normal, render-blocking link: written into the parser stream while this
  // synchronous script executes, before the browser paints anything. Only the
  // chosen sheet is written here; the other three are loaded on demand by
  // shared/shell.js when the member switches appearance.
  document.write('<link id="wd-appearance-sheet" rel="stylesheet" href="' + href + '" data-appearance-mode="' + mode + '">');

  window.WD_APPEARANCE = {
    KEY: KEY, MODES: MODES, NAMES: NAMES, SHEETS: SHEETS,
    mode: mode,
    savedMode: saved.mode,
    seen: saved.seen === true,
    forcedClassic: forcedClassic,
    sessionFallback: sessionFallback === 'classic',
    save: function (next, seen) {
      try {
        var record = { mode: next, seen: seen !== false, version: 2 };
        localStorage.setItem(KEY, JSON.stringify(record));
      } catch (e) { /* private mode / quota: preference just won't persist */ }
    },
    useOriginalForSession: function () {
      try { sessionStorage.setItem(SESSION_FALLBACK, 'classic'); } catch (e) { /* ignore */ }
    }
  };
})();
