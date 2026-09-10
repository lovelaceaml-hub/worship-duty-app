/* Design preference only. Never copies or edits schedules, member identity,
 * authentication, notification tokens or song plans. */
(function () {
  'use strict';
  const KEY = 'wds-design-choice-v1';
  const rescue = new URLSearchParams(location.search).get('design') === 'classic';
  const enabled = document.documentElement.dataset.prismRollout !== 'off';
  let hooks, mode = 'classic', busy = false, initialized = false, queued = false;
  let dialog, previousFocus, saved = {}, volatile = false;
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { volatile = true; }
  if (saved.mode !== 'prism' && saved.mode !== 'classic') saved = {};
  function persist(next) {
    saved = {...saved, ...next};
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { volatile = true; }
  }
  function message(text) {
    let el = document.getElementById('wd-design-status');
    if (!el) { el = document.createElement('p'); el.id = 'wd-design-status'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = text; el.hidden = false;
    clearTimeout(message.timer); message.timer = setTimeout(() => { el.hidden = true; }, 6500);
  }
  function ready() { return !!hooks?.ready(); }
  function themeReady() {
    const link = document.getElementById('wd-prism-css');
    if (!link) return Promise.reject(Error('New design stylesheet is missing.'));
    if (link.sheet) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = ok => { clearTimeout(timer); link.removeEventListener('load', yes); link.removeEventListener('error', no); ok ? resolve() : reject(Error('New design could not be loaded.')); };
      const yes = () => done(true), no = () => done(false);
      const timer = setTimeout(no, 7000);
      link.addEventListener('load', yes, {once:true}); link.addEventListener('error', no, {once:true});
      if (link.sheet) done(true);
    });
  }
  async function change(next, remember = true) {
    if (busy || !ready() || (next === 'prism' && (!enabled || rescue))) return false;
    if (next === mode) { if (remember) persist({mode:next, invited:true}); return true; }
    busy = true;
    try {
      if (next === 'prism') await themeReady();
      if (!ready()) return false; // a live passcode/settings change can arrive while loading
      const old = mode; mode = next;
      try { await hooks.apply(next); } catch (err) {
        mode = old; await hooks.apply(old); throw err;
      }
      if (remember) persist({mode:next, invited:true});
      message((next === 'prism' ? 'New design enabled.' : 'Current design restored.') + ' Your schedules and song plans have not changed.' + (volatile ? ' This browser cannot save the preference.' : ''));
      return true;
    } catch (err) {
      console.warn('Design switch could not complete:', err);
      message('The new design could not load. The current design is still available. Please try again when connected.');
      return false;
    } finally { busy = false; refreshButtons(); }
  }
  function refreshButtons() {
    document.querySelectorAll('[data-design-open]').forEach(b => {
      b.hidden = !ready(); b.disabled = busy;
      b.title = mode === 'prism' ? 'Switch back to the current design' : 'Choose the new Prism design';
    });
  }
  function open(invitation = false) {
    if (!ready() || dialog || busy) return;
    previousFocus = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'wd-design-dialog';
    dialog.setAttribute('aria-labelledby', 'wd-design-title'); dialog.setAttribute('aria-describedby', 'wd-design-description');
    dialog.innerHTML = '<button type="button" class="wd-close" aria-label="Keep my design and close">×</button><span class="wd-kicker">LV ZION · WORSHIP DUTY</span><h2 id="wd-design-title">'+(invitation?'Would you like to try our new design?':'Choose your design')+'</h2><p id="wd-design-description">The same schedules, duties and song plans—with a new look. You can switch back at any time using the <strong>Design</strong> button.</p><div class="wd-design-options"><div class="wd-design-tile"><div class="wd-mini wd-mini-classic" aria-hidden="true"><i></i><b></b><span></span><span></span><span></span></div><strong>Current design</strong><small>The layout you already know</small></div><div class="wd-design-tile wd-new"><div class="wd-mini wd-mini-prism" aria-hidden="true"><i></i><b></b><span></span><span></span><span></span></div><strong>Prism <em>NEW</em></strong><small>Calendar view & a clearer workspace</small></div></div><p class="wd-device-note">Your choice is saved on this browser/device. Switching designs does not change your data or permissions.</p><p class="wd-storage-note" hidden></p><div class="wd-design-actions"><button type="button" class="wd-keep" data-design-select="classic" autofocus>'+(mode==='prism'?'Use the current design':'Keep current design')+'</button><button type="button" class="wd-try" data-design-select="prism">'+(mode==='prism'?'Keep the new design':'Try the new design')+'</button></div>';
    const note=dialog.querySelector('.wd-storage-note'); if(volatile){note.hidden=false;note.textContent='Browser storage is unavailable. This choice may not survive closing the app.';}
    dialog.querySelector('[data-design-select="prism"]').disabled = !enabled || rescue;
    dialog.querySelector('.wd-close').onclick = () => dialog?.close();
    dialog.addEventListener('click', async event => {
      const button=event.target.closest('[data-design-select]'); if(!button)return;
      const next=button.dataset.designSelect;
      const openDialog=dialog; openDialog.querySelectorAll('button').forEach(b=>b.disabled=true);
      const done=await change(next);
      if(done) openDialog.close(); else if(openDialog.isConnected) openDialog.querySelectorAll('button').forEach(b=>b.disabled=false);
    });
    dialog.addEventListener('close', () => {
      if(invitation && ready() && !saved.invited) persist({mode,invited:true});
      dialog?.remove(); dialog=undefined;
      if(previousFocus?.isConnected && !previousFocus.hidden) previousFocus.focus({preventScroll:true});
      else document.querySelector('[data-design-open]:not([hidden])')?.focus({preventScroll:true});
    }, {once:true});
    document.body.append(dialog); dialog.showModal();
  }
  function afterRender() {
    refreshButtons();
    if(!ready()){ if(dialog)dialog.close(); return; }
    if(queued || busy || initialized)return;
    queued=true;
    setTimeout(async()=>{
      queued=false;if(!ready() || initialized)return;
      initialized=true;
      if(enabled && !rescue && saved.mode==='prism')await change('prism',false);
      else if(enabled && !rescue && !saved.invited && !saved.mode)open(true);
    },250);
  }
  document.addEventListener('click',event=>{ if(event.target.closest('[data-design-open]')) {event.preventDefault();open(false);} });
  // Changes in another tab never switch the current screen mid-edit. The saved
  // preference is adopted next time that tab opens the application.
  window.WorshipDesign = {configure(value){hooks=value;}, afterRender, open, isPrism:()=>mode==='prism', change,
    getPreference:()=>({...saved}), getMode:()=>mode, storageKey:KEY, enabled};
})();
