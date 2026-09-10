/* Reversible presentation only. Never changes schedule, authentication, songs or feature settings. */
(function () {
  'use strict';
  const KEY = 'wds-appearance-navy-v1';
  const initial = { design: 'original', scheme: 'light', motion: 'auto', offered: false };
  function clean(v) {
    return { design: v?.design === 'navy' ? 'navy' : 'original', scheme: v?.scheme === 'dark' ? 'dark' : 'light', motion: v?.motion === 'off' ? 'off' : 'auto', offered: v?.offered === true };
  }
  function read() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (_) { return { ...initial }; } }
  let pref = read(), context = null, month = '', selected = '', full = false, menu = null, returnFocus = null, lastRoute = '', timer = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    duties:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-7 9 2 2 5-5"/>',
    songs:'<path d="M9 18V5l12-3v13M9 9l12-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="15" rx="3" ry="2"/>',
    manage:'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h2m4 0h12"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2"/>',
    moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
    left:'<path d="m15 5-7 7 7 7"/>', right:'<path d="m9 5 7 7-7 7"/>',
    palette:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>'
  };
  const icon = name => `<svg class="nc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`;
  const date = (v, opts) => new Date(v + 'T12:00:00').toLocaleDateString('en-US', opts);
  const time = t => { if (!t) return 'Time not set'; const [h,m] = t.split(':'); return `${+h % 12 || 12}:${m} ${+h >= 12 ? 'PM' : 'AM'}`; };
  const btn = (action, content, attrs = '', cls = '') => `<button type="button" class="nc-button ${cls}" data-nc-act="${action}" ${attrs}>${content}</button>`;
  const initials = s => String(s || '').split(/\s+/).map(x => x[0]).slice(0,2).join('');
  function setStyle() {
    root.dataset.zionDesign = pref.design;
    root.dataset.ncScheme = pref.scheme;
    root.dataset.ncMotion = pref.motion;
    const css = document.getElementById('navy-theme-css');
    if (css) css.media = pref.design === 'navy' ? 'all' : 'not all';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.dataset.original ||= meta.content; meta.content = pref.design === 'navy' ? '#253943' : meta.dataset.original; }
  }
  setStyle(); // Saved preference is applied in the head, before the first page paint.
  function save() { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (_) { announce('Appearance will last for this session; this browser is not saving preferences.'); } }
  function announce(text) { const el = document.getElementById('nc-announcement'); if (el) el.textContent = text; }
  function panel(kicker, title, extra = '') { return `<div class="nc-heading"><div><p class="nc-kicker">${escape(kicker)}</p><h2>${escape(title)}</h2></div>${extra}</div>`; }
  function insert(view, html) { const node = document.createElement('section'); node.className = 'nc-generated'; node.innerHTML = html; view.prepend(node); return node; }
  function hero(s, title, kicker) {
    const names = [...new Set(Object.values(s.assignments || {}).filter(Boolean))];
    const count = Object.values(s.assignments || {}).filter(Boolean).length;
    return `<section class="nc-hero" aria-label="${escape(kicker)}"><p class="nc-kicker">${escape(kicker)}</p><div class="nc-hero-main"><div class="nc-date-block"><strong>${date(s.date,{day:'numeric'})}</strong><span>${date(s.date,{month:'short'})}</span></div><div><h3>${escape(title)}</h3><p>${escape(time(s.time))} · ${escape(s.service)} · Pacific time</p></div></div><div class="nc-hero-foot"><span>${icon('people')} ${count} duties assigned · ${names.length} people</span><span class="nc-avatars">${names.slice(0,4).map(n=>`<span title="${escape(n)}">${escape(initials(n))}</span>`).join('')}</span></div></section>`;
  }
  function clearView(view) {
    view.querySelectorAll('.nc-generated').forEach(n => n.remove());
    view.querySelectorAll('[data-nc-hidden]').forEach(n => n.removeAttribute('data-nc-hidden'));
    view.querySelectorAll('[data-nc-selected]').forEach(n => n.removeAttribute('data-nc-selected'));
  }
  function schedule(view, s) {
    // Annotate the native cards without replacing them: their handlers and data stay intact.
    const cards = [...view.children].filter(n => n.classList.contains('card'));
    const entries = s.entries || [];
    const dates = [...new Set(entries.map(x => x.date))].sort();
    if (!month) month = (dates.find(d => d >= s.today) || dates[0] || s.today).slice(0,7);
    const inMonth = entries.filter(x => x.date.startsWith(month));
    if (!inMonth.some(x => x.id === selected)) selected = (inMonth.find(x => x.date >= s.today) || inMonth[0])?.id || '';
    const svc = entries.find(x => x.id === selected);
    const chosenDate = svc?.date;
    const monthDates = dates.filter(d => d.startsWith(month));
    const rail = `<div class="nc-date-rail" role="group" aria-label="Service dates">${monthDates.map(d => btn('date',`<small>${date(d,{weekday:'short'})}</small><strong>${date(d,{day:'numeric'})}</strong><span class="nc-date-dots">${'•'.repeat(Math.min(3,entries.filter(x=>x.date===d).length))}</span>`,`data-date="${d}" aria-pressed="${d===chosenDate}" aria-label="${date(d,{weekday:'long',month:'long',day:'numeric'})}"`)).join('')}</div>`;
    const times = `<div class="nc-times" role="group" aria-label="Service times">${inMonth.filter(x=>x.date===chosenDate).map(x=>btn('service',`${icon(x.time<'18:00'?'sun':'moon')}${escape(time(x.time))}`,`data-id="${escape(x.id)}" aria-pressed="${x.id===selected}"`)).join('')}</div>`;
    let html = panel('Worship schedule', date(month+'-01',{month:'long',year:'numeric'}), `<div class="nc-arrows">${btn('month',icon('left'),'data-delta="-1" aria-label="Previous month"')}${btn('month',icon('right'),'data-delta="1" aria-label="Next month"')}</div>`);
    html += `<div class="nc-view-switch">${btn('day-mode','Day view',`aria-pressed="${!full}"`)}${btn('full-mode','Full schedule',`aria-pressed="${full}"`)}</div>`;
    if (!full) {
      html += rail + times;
      html += svc ? hero(svc, date(svc.date,{weekday:'long',month:'short',day:'numeric'}),svc.worship || 'Selected service') : '<p class="nc-empty">No services match this month and department. Use Full schedule or choose another month.</p>';
      html += svc ? '<div class="nc-section-label">Service team <span>All assigned departments</span></div>' : '';
      // A native list can be empty while awaiting sync. Never invent a service.
      if (cards.length === entries.length) {
        cards.forEach((c,i) => { if (entries[i].id !== selected) c.dataset.ncHidden=''; else c.dataset.ncSelected=''; });
        view.querySelectorAll(':scope > .date-head').forEach(n => { n.dataset.ncHidden=''; });
      }
    }
    insert(view, html);
    if (svc && !full && entries.length > 1) {
      const i = entries.findIndex(x => x.id === selected), next = entries[i+1];
      if (next) { const n=document.createElement('div'); n.className='nc-generated nc-next'; n.innerHTML=btn('service',`<span><small>Next service</small>${date(next.date,{weekday:'short',month:'short',day:'numeric'})} · ${escape(time(next.time))}</span>${icon('right')}`,`data-id="${escape(next.id)}"`); const card = view.querySelector('[data-nc-selected]'); (card || view.lastElementChild).after(n); }
    }
  }
  function decorate() {
    const view = document.getElementById('view');
    if (!context || !view) return;
    clearView(view);
    const enabled = pref.design === 'navy';
    document.querySelectorAll('header.app .eyebrow,header.app .app-title').forEach(el=>{el.dataset.ncOriginal ||= el.textContent; el.textContent=enabled?(el.classList.contains('eyebrow')?'LV ZION · WORSHIP DUTY':'Service Timeline'):el.dataset.ncOriginal;});
    const tabs = {schedule:['calendar','Schedule'],my:['duties','My Duties'],songs:['songs','Presider'],manage:['manage','Manage']};
    document.querySelectorAll('nav.tabs button[data-tab]').forEach(b => {
      const t=tabs[b.dataset.tab]; if (!t) return;
      const dot=b.querySelector('.dot')?.outerHTML || '';
      b.innerHTML=(enabled ? icon(t[0])+`<span>${t[1]}</span>` : t[1])+dot;
      if(b.classList.contains('active')) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    if (!enabled || !context.ready) return;
    root.dataset.ncScreen=context.tab;
    if (context.tab === 'schedule') schedule(view,context);
    if (context.tab === 'my') {
      const member = context.member ? `<span class="nc-member" title="${escape(context.member)}">${escape(initials(context.member))}</span>` : '';
      const n=insert(view,panel('Your service, at a glance','My duties',member));
      if(context.nextDuty) n.insertAdjacentHTML('beforeend',hero(context.nextDuty.svc,context.nextDuty.duty,'Your next duty'));
    }
    if (context.tab === 'manage') {
      const labels={services:['Manage schedule','Assign and coordinate'],planning:['Planning','Balance the work'],requests:['Change requests','Review and respond'],people:['People & departments','Keep your team organized'],features:['Features','Congregation-wide settings'],data:['Data & sync','Keep schedules connected']};
      const [title,kicker]=labels[context.sub] || labels.services;
      let html=panel(kicker,title);
      if (context.canEdit) html+=`<div class="nc-stats"><div><small>Upcoming services</small><strong>${context.stats.services}</strong></div><div><small>Assigned duties</small><strong>${context.stats.assignments}</strong></div><div><small>People serving</small><strong>${context.stats.people}</strong></div></div>`;
      insert(view,html);
    }
    if (context.tab === 'songs') insert(view,panel('Prepare your service','Presider',`<span class="nc-tag">${icon('songs')} Song planner</span>`));
    view.querySelectorAll('.edit-grid input,.edit-grid select').forEach(field=>{ const label=field.previousElementSibling; if(label?.classList.contains('lab') && !field.hasAttribute('aria-label'))field.setAttribute('aria-label',label.textContent.trim()); });
    const rail=view.querySelector('.nc-date-rail [aria-pressed="true"]'); if(rail) rail.parentElement.scrollLeft=Math.max(0,rail.offsetLeft-rail.parentElement.offsetLeft-rail.parentElement.clientWidth/2+rail.clientWidth/2);
  }
  function installChrome() {
    const header=document.querySelector('header.app'); if (!header) return;
    if(!document.getElementById('nc-appearance')) {
      const b=document.createElement('button'); b.type='button'; b.id='nc-appearance'; b.className='nc-appearance'; b.dataset.ncAct='appearance'; b.setAttribute('aria-haspopup','dialog'); b.setAttribute('aria-label','Appearance'); b.innerHTML=icon('palette')+'<span>Appearance</span>'; header.append(b);
      const status=document.createElement('span'); status.id='nc-announcement'; status.className='nc-sr'; status.setAttribute('role','status'); document.body.append(status);
    }
    document.getElementById('nc-appearance').hidden=!context?.ready;
  }
  function choose(design) {
    pref={...pref,design,offered:true}; save(); setStyle(); close(); decorate(); announce(design==='navy'?'Navy & Cream design enabled. Use Appearance to return to Original.':'Original design restored.');
  }
  function close() { if(menu?.open)menu.close(); if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true}); }
  function show(automatic=false) {
    if (!context?.ready || menu?.open) return;
    returnFocus=document.activeElement;
    if(!menu){ menu=document.createElement('dialog'); menu.id='nc-choice'; menu.className='nc-dialog'; menu.setAttribute('aria-labelledby','nc-choice-title'); menu.setAttribute('aria-describedby','nc-choice-description'); menu.addEventListener('cancel',e=>{e.preventDefault();pref.offered=true;save();close();}); document.body.append(menu); }
    menu.innerHTML=`<div class="nc-dialog-heading"><span class="nc-dialog-kicker">LV ZION · APPEARANCE</span>${btn('dismiss',icon('close'),'aria-label="Close appearance dialog"','nc-close')}</div><h2 id="nc-choice-title">${automatic?'A new look. Your choice.':'Make it feel like yours.'}</h2><p id="nc-choice-description">Try the new Navy & Cream design, or keep the original. Your schedule, songs and login stay the same. You can switch back anytime using <b>Appearance</b>.</p><div class="nc-choices">${btn('choose','<span class="nc-swatch nc-swatch-original" aria-hidden="true"><i></i><i></i><i></i></span><strong>Original</strong><span>The familiar design</span>',`data-design="original" aria-pressed="${pref.design==='original'}"`)}${btn('choose','<span class="nc-swatch nc-swatch-navy" aria-hidden="true"><i></i><i></i><i></i></span><strong>Navy & Cream</strong><span>Warm, clear and refined</span>',`data-design="navy" aria-pressed="${pref.design==='navy'}"`)}</div><div class="nc-options"><label>Color mode<select id="nc-scheme"><option value="light"${pref.scheme==='light'?' selected':''}>Warm light</option><option value="dark"${pref.scheme==='dark'?' selected':''}>Deep navy</option></select></label><label>Motion<select id="nc-motion"><option value="auto"${pref.motion==='auto'?' selected':''}>Subtle motion</option><option value="off"${pref.motion==='off'?' selected':''}>Reduced motion</option></select></label></div><p class="nc-dialog-note">Color and motion apply to the new design. Your device’s reduced-motion setting is always respected. This choice is saved only in this browser.</p><div class="nc-dialog-actions">${btn('choose',automatic?'Keep original':'Use Original','data-design="original"')}${btn('choose','Use Navy & Cream','data-design="navy"','nc-primary')}</div>`;
    menu.showModal(); menu.querySelector('.nc-close').focus();
  }
  function offerWhenIdle() {
    clearTimeout(timer);
    if (pref.offered || !context?.ready) return;
    timer=setTimeout(()=>{ const a=document.activeElement; if(document.querySelector('dialog[open]') || (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) { offerWhenIdle(); return; } show(true); },700);
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-nc-act]'); if(!b)return;
    const act=b.dataset.ncAct;
    if(act==='appearance'){show();return;}
    if(act==='choose'){choose(b.dataset.design==='navy'?'navy':'original');return;}
    if(act==='dismiss'){pref.offered=true;save();close();return;}
    if(act==='month'){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(b.dataset.delta));month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
    if(act==='date')selected=context.entries.find(x=>x.date===b.dataset.date)?.id || '';
    if(act==='service'){selected=b.dataset.id;month=(context.entries.find(x=>x.id===selected)?.date || context.today).slice(0,7);}
    if(act==='day-mode')full=false;
    if(act==='full-mode')full=true;
    decorate();
    if(act==='month')document.querySelector(`.nc-arrows [data-delta="${b.dataset.delta}"]`)?.focus({preventScroll:true});
    else document.querySelector('.nc-date-rail [aria-pressed="true"],.nc-view-switch [aria-pressed="true"]')?.focus({preventScroll:true});
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='nc-scheme')pref.scheme=e.target.value==='dark'?'dark':'light';
    else if(e.target.id==='nc-motion')pref.motion=e.target.value==='off'?'off':'auto';
    else return;
    save();setStyle();
  });
  window.addEventListener('storage',e=>{if(e.key===KEY){pref=read();setStyle();decorate();}});
  window.ZionDesign={
    update(s) {
      context=s;installChrome();
      if(!s.ready){clearTimeout(timer);if(menu?.open)menu.close();}
      const focused=document.activeElement;
      // Native input nodes are never replaced here, including while the appearance dialog is open.
      if(!(focused && /INPUT|SELECT|TEXTAREA/.test(focused.tagName) && document.getElementById('view')?.contains(focused)))decorate();
      const route=s.tab+':'+s.sub;
      if(route!==lastRoute && pref.design==='navy' && pref.motion!=='off' && !reduce.matches) {
        document.getElementById('view')?.animate?.([{opacity:.5,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:220,easing:'ease-out'});
      }
      lastRoute=route;offerWhenIdle();
    }
  };
  window.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('navy-theme-css')?.addEventListener('error',()=>{pref.design='original';setStyle();decorate();announce('The new design could not load. The original design is available.');});
  });
})();
