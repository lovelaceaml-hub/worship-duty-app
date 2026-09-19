/* Navy & Cream presentation adapter. It annotates/moves no live input nodes and
 * never handles domain actions; native app handlers remain authoritative. */
const NavyDesign = (() => {
  let context = null, month = '', selected = '', full = false, manualSelection = false, lastRoute = '';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    duties:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-7 9 2 2 5-5"/>',
    songs:'<path d="M9 18V5l12-3v13M9 9l12-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="15" rx="3" ry="2"/>',
    manage:'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h2m4 0h12"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2"/>',
    moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
    left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>'
  };
  const icon=name=>`<svg class="nc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.calendar}</svg>`;
  const date=(v,o)=>new Date(v+'T12:00:00').toLocaleDateString('en-US',o);
  const time=t=>{if(!t)return 'Time not set';const [h,m]=t.split(':');return `${+h%12||12}:${m} ${+h>=12?'PM':'AM'}`;};
  const btn=(act,content,attrs='',cls='')=>`<button type="button" class="nc-button ${cls}" data-nc-act="${act}" ${attrs}>${content}</button>`;
  const initials=s=>String(s||'').split(/\s+/).map(x=>x[0]).slice(0,2).join('');
  function panel(kicker,title,extra=''){return `<div class="nc-heading"><div><p class="nc-kicker">${escape(kicker)}</p><h2>${escape(title)}</h2></div>${extra}</div>`;}
  function insert(view,html){const n=document.createElement('section');n.className='nc-generated';n.innerHTML=html;view.prepend(n);return n;}
  function hero(s,title,kicker){const names=[...new Set(Object.values(s.assignments||{}).filter(Boolean))],count=Object.values(s.assignments||{}).filter(Boolean).length;return `<section class="nc-hero" aria-label="${escape(kicker)}"><p class="nc-kicker">${escape(kicker)}</p><div class="nc-hero-main"><div class="nc-date-block"><strong>${date(s.date,{day:'numeric'})}</strong><span>${date(s.date,{month:'short'})}</span></div><div><h3>${escape(title)}</h3><p>${escape(time(s.time))} · ${escape(s.service)} · Pacific time</p></div></div><div class="nc-hero-foot"><span>${icon('people')} ${count} duties assigned · ${names.length} people</span><span class="nc-avatars">${names.slice(0,4).map(n=>`<span title="${escape(n)}">${escape(initials(n))}</span>`).join('')}</span></div></section>`;}
  function clear(view){
    view?.querySelectorAll('.nc-generated').forEach(n=>n.remove());
    view?.querySelectorAll('[data-nc-hidden]').forEach(n=>n.removeAttribute('data-nc-hidden'));
    view?.querySelectorAll('[data-nc-selected]').forEach(n=>n.removeAttribute('data-nc-selected'));
  }
  function schedule(view,s){
    const cards=[...view.children].filter(n=>n.classList.contains('card')),entries=s.entries||[],dates=[...new Set(entries.map(x=>x.date))].sort();
    if(!manualSelection||!month)month=(preferredScheduleService(entries)?.date||dates.find(d=>d>=s.today)||dates[0]||s.today).slice(0,7);
    const inMonth=entries.filter(x=>x.date.startsWith(month));
    if(!manualSelection||!inMonth.some(x=>x.id===selected))selected=(preferredScheduleService(inMonth)||inMonth[0])?.id||'';
    const svc=entries.find(x=>x.id===selected),chosenDate=svc?.date,monthDates=dates.filter(d=>d.startsWith(month));
    const rail=`<div class="nc-date-rail" role="group" aria-label="Service dates">${monthDates.map(d=>btn('date',`<small>${date(d,{weekday:'short'})}</small><strong>${date(d,{day:'numeric'})}</strong><span class="nc-date-dots">${'•'.repeat(Math.min(3,entries.filter(x=>x.date===d).length))}</span>`,`data-date="${d}" aria-pressed="${d===chosenDate}" aria-label="${date(d,{weekday:'long',month:'long',day:'numeric'})}"`)).join('')}</div>`;
    const times=`<div class="nc-times" role="group" aria-label="Service times">${inMonth.filter(x=>x.date===chosenDate).map(x=>btn('service',`${icon(x.time<'18:00'?'sun':'moon')}${escape(time(x.time))}`,`data-id="${escape(x.id)}" aria-pressed="${x.id===selected}"`)).join('')}</div>`;
    let html=panel('Worship schedule',date(month+'-01',{month:'long',year:'numeric'}),`<div class="nc-arrows">${btn('month',icon('left'),'data-delta="-1" aria-label="Previous month"')}${btn('month',icon('right'),'data-delta="1" aria-label="Next month"')}</div>`);
    html+=`<div class="nc-view-switch">${btn('day-mode','Day view',`aria-pressed="${!full}"`)}${btn('full-mode','Full schedule',`aria-pressed="${full}"`)}</div>`;
    if(!full){
      html+=rail+times;
      html+=svc?hero(svc,date(svc.date,{weekday:'long',month:'short',day:'numeric'}),svc.worship||'Selected service'):'<p class="nc-empty">No services match this month and department. Use Full schedule or choose another month.</p>';
      html+=svc?'<div class="nc-section-label">Service team <span>All assigned departments</span></div>':'';
      if(cards.length===entries.length){cards.forEach((c,i)=>{if(entries[i].id!==selected)c.dataset.ncHidden='';else c.dataset.ncSelected='';});view.querySelectorAll(':scope > .date-head').forEach(n=>n.dataset.ncHidden='');}
    }
    insert(view,html);
    if(svc&&!full&&entries.length>1){const i=entries.findIndex(x=>x.id===selected),next=entries[i+1];if(next){const n=document.createElement('div');n.className='nc-generated nc-next';n.innerHTML=btn('service',`<span><small>Next service</small>${date(next.date,{weekday:'short',month:'short',day:'numeric'})} · ${escape(time(next.time))}</span>${icon('right')}`,`data-id="${escape(next.id)}"`);const card=view.querySelector('[data-nc-selected]');(card||view.lastElementChild).after(n);}}
  }
  function paint(s){
    context=s;const view=document.getElementById('view');if(!view)return;clear(view);
    document.documentElement.dataset.ncScreen=s.tab;
    const tabs={schedule:['calendar','Schedule'],my:['duties','My Duties'],songs:['songs','Presider'],manage:['manage','Manage']};
    document.querySelectorAll('nav.tabs button[data-tab]').forEach(b=>{const t=tabs[b.dataset.tab];if(!t)return;const dot=b.querySelector('.dot')?.outerHTML||'';b.innerHTML=icon(t[0])+`<span>${t[1]}</span>`+dot;if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(!s.ready)return;
    if(s.tab==='schedule')schedule(view,s);
    if(s.tab==='my'&&s.account)insert(view,panel('Your account',s.account));
    else if(s.tab==='my'){const member=s.member?`<span class="nc-member" title="${escape(s.member)}">${escape(initials(s.member))}</span>`:'';const n=insert(view,panel('Your service, at a glance','My duties',member));if(s.nextDuty)n.insertAdjacentHTML('beforeend',hero(s.nextDuty.svc,s.nextDuty.duty,'Your next duty'));}
    if(s.tab==='manage'){const labels={services:['Manage schedule','Assign and coordinate'],planning:['Planning','Balance the work'],requests:['Change requests','Review and respond'],people:['People & departments','Keep your team organized'],features:['Features','Congregation-wide settings'],data:['Data & sync','Keep schedules connected']};const [title,kicker]=labels[s.sub]||labels.services;let html=panel(kicker,title);if(s.canEdit)html+=`<div class="nc-stats"><div><small>Upcoming services</small><strong>${s.stats.services}</strong></div><div><small>Assigned duties</small><strong>${s.stats.assignments}</strong></div><div><small>People serving</small><strong>${s.stats.people}</strong></div></div>`;insert(view,html);}
    if(s.tab==='songs')insert(view,panel('Prepare your service','Presider',`<span class="nc-tag">${icon('songs')} Song planner</span>`));
    view.querySelectorAll('.edit-grid input,.edit-grid select').forEach(field=>{const label=field.previousElementSibling;if(label?.classList.contains('lab')&&!field.hasAttribute('aria-label'))field.setAttribute('aria-label',label.textContent.trim());});
    const active=view.querySelector('.nc-date-rail [aria-pressed="true"]');if(active)active.parentElement.scrollLeft=Math.max(0,active.offsetLeft-active.parentElement.offsetLeft-active.parentElement.clientWidth/2+active.clientWidth/2);
    const route=s.tab+':'+s.sub;if(route!==lastRoute&&!reduce.matches){view.animate?.([{opacity:.65,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:220,easing:'ease-out'});}lastRoute=route;
  }
  function leave(){const view=document.getElementById('view');clear(view);delete document.documentElement.dataset.ncScreen;}
  document.addEventListener('click',e=>{
    if(!window.WorshipDesign?.isNavy())return;const b=e.target.closest('[data-nc-act]');if(!b||!context)return;const act=b.dataset.ncAct;
    if(act==='month'){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(b.dataset.delta));month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');selected='';manualSelection=true;}
    if(act==='date'){selected=(preferredScheduleService(context.entries.filter(x=>x.date===b.dataset.date))||
      context.entries.find(x=>x.date===b.dataset.date))?.id||'';manualSelection=true;}
    if(act==='service'){selected=b.dataset.id;month=(context.entries.find(x=>x.id===selected)?.date||context.today).slice(0,7);manualSelection=true;}
    if(act==='day-mode')full=false;if(act==='full-mode')full=true;paint(context);
  });
  return {paint,leave};
})();
