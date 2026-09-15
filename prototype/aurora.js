/* Review-only presentation adapter. Injected immediately before the real init().
 * Original action handlers retain assignment, conflict, request, roster and
 * song behavior. build.mjs supplies isolated storage and reference time.
 */
const A = window.Aurora;
const aui = {month:'2026-07',day:'',service:'',mode:'day',query:''};
const originalSeedState = seedState;
seedState = function () {
  const s=originalSeedState();
  s.settings.features={siteLock:false,editorLock:false,sheetSync:false};
  return s;
};
if(!loadLocal()) localStorage.setItem(DATA_KEY,JSON.stringify(seedState()));
ui.me=localStorage.getItem('wds-me')||'B. Anthony L';
localStorage.setItem('wds-me',ui.me);
const originalFeat=feat;
feat=id=>id==='sheetSync'?false:originalFeat(id);
const originalSongCtx=songCtx;
songCtx=function(){return Object.assign(originalSongCtx(),{previewSchedule:state.services});};

const paths={
 schedule:'M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16 M8 15h2 M14 15h2',
 my:'M8 4h12v17H4V4h4 M8 3h8v4H8z M8 12l2 2 5-5 M8 18h8',
 songs:'M9 18V5l11-2v13 M9 9l11-2 M9 18c0 3-6 4-6 1s6-4 6-1 M20 16c0 3-6 4-6 1s6-4 6-1',
 manage:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
 search:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6',
 arrow:'M5 12h14 M13 6l6 6-6 6',
 sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
 moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
 people:'M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 21v-4c0-5 12-5 12 0v4 M16 5c5 0 5 7 0 7 M18 15c3 0 3 3 3 6',
 check:'M5 12l4 4L19 6'
};
function ai(name){return '<svg class="a-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';}
function initials(name){return String(name).replace(/^[BDSM]\.?\s+|^D\.\s+|^E\.\s+/,'').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'LV';}
function selectedInitials(name){return initials(name).length>1?initials(name):String(name).split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();}
function monthTitle(month){return new Date(month+'-01T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});}
function shortDay(date){return new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'});}
function matches(s){
 const q=aui.query.trim().toLowerCase();
 return (!q||[s.date,s.service,s.worship,...Object.entries(s.assignments||{}).flat()].join(' ').toLowerCase().includes(q))&&(ui.deptFilter==='All'||categoryHasAssignments(s,ui.deptFilter));
}
function allInMonth(){return state.services.filter(s=>s.date.startsWith(aui.month)&&(s.date>=todayISO()||(feat('pastServices')&&ui.showPast))).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));}
function ensureSelection(){
 let all=allInMonth();
 if(!aui.manual){
  const preferred=preferredScheduleService(state.services);
  if(preferred){aui.month=preferred.date.slice(0,7);aui.day=preferred.date;aui.service=svcId(preferred);all=allInMonth();}
 }
 if(!all.some(s=>s.date===aui.day))aui.day=(preferredScheduleService(all)||all[0])?.date||'';
 const day=all.filter(s=>s.date===aui.day);
 if(!day.some(s=>svcId(s)===aui.service)){
  const preferred=preferredScheduleService(day)||day[0];
  aui.service=preferred?svcId(preferred):'';
 }
 if(day.some(matches)&&!day.some(s=>svcId(s)===aui.service&&matches(s))){
  const preferred=preferredScheduleService(day.filter(matches))||day.find(matches);
  aui.service=svcId(preferred);
 }
 return {all,day,selected:day.find(s=>svcId(s)===aui.service)};
}
function personBadge(name,large=false){return '<span class="a-avatar'+(large?' large':'')+'">'+esc(selectedInitials(name))+'</span>';}
function renderHero(selected){
 const date=selected?.date,duty=dutiesFor(ui.me)[0];
 const filled=selected?Object.values(selected.assignments||{}).filter(Boolean).length:0;
 return '<section class="day-hero"><div class="hero-orbits" aria-hidden="true"><i></i><i></i><i></i></div><div class="hero-copy"><div class="hero-eyebrow"><span class="hero-dot"></span> '+(date?'SELECTED SERVICE DAY':'SCHEDULE OVERVIEW')+'</div><h2>'+(date?esc(fmtDate(date)):'Make room for a clearer week.')+'</h2><p>'+(selected?esc(selected.worship)+' <span>·</span> '+allInMonth().filter(s=>s.date===date).length+' services <span>·</span> Pacific time':'Choose a month to explore the reference schedule.')+'</p><div class="hero-caption">'+ai('people')+(selected?filled+' assigned duty slots for '+esc(selected.service.toLowerCase())+' service':'All of your worship duties, together.')+'</div></div><div class="hero-person"><div class="hero-eyebrow">YOUR NEXT DUTY</div>'+(duty?'<strong>'+esc(duty.duty)+'</strong><p>'+esc(fmtDate(duty.svc.date))+'<br>'+fmtTime(duty.svc.time)+' · '+esc(duty.svc.service)+'</p><button data-act="tab" data-tab="my">View my duties '+ai('arrow')+'</button>':'<strong>Your schedule,<br>made personal.</strong><button data-act="tab" data-tab="my">Choose your name '+ai('arrow')+'</button>')+'</div></section>';
}
function dateBrowser(all){
 const dates=[...new Set(all.map(s=>s.date))];
 return '<section class="date-browser" aria-label="Service dates"><div class="month-row"><div><span class="overline">BROWSE SCHEDULE</span><h3>'+esc(monthTitle(aui.month))+'</h3></div><div class="month-controls"><button class="icon-button" data-aurora="month" data-step="-1" aria-label="Previous month">‹</button><button class="icon-button" data-aurora="month" data-step="1" aria-label="Next month">›</button></div></div><div class="date-strip">'+(dates.length?dates.map(d=>'<button class="date-tile'+(d===aui.day?' selected':'')+'" data-aurora="day" data-date="'+d+'" aria-pressed="'+(d===aui.day)+'"><span>'+shortDay(d)+'</span><strong>'+Number(d.slice(8))+'</strong><span class="date-dots">'+all.filter(s=>s.date===d).map(s=>'<i class="'+(Object.values(s.assignments||{}).includes(ui.me)?'mine':'')+'"></i>').join('')+'</span></button>').join(''):'<p class="hint">No services in this view. Try July 2026 or include past services.</p>')+'</div><div class="date-key"><span><i></i>Service day</span><span><i class="mine"></i>Your assignment</span></div></section>';
}
function departmentPicker(){return '<label class="a-select"><span class="sr-only">Duty department</span><select data-chg="dept-filter" id="a-department"><option value="All"'+(ui.deptFilter==='All'?' selected':'')+'>All departments</option>'+CATEGORIES.map(c=>'<option'+(ui.deptFilter===c.name?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>';}
function renderTeam(s){
 const relevant=CATEGORIES.filter(c=>ui.deptFilter==='All'||c.name===ui.deptFilter);
 let html='';
 relevant.forEach(c=>{const rows=renderCatRows(s,false,c.name);if(rows)html+='<section class="team-department" style="--category:'+c.color+'">'+rows+'</section>';});
 return html||'<div class="empty">No assignments match this department.</div>';
}
function renderSelectedService(s,day){
 if(!s)return '<div class="card empty">No services in this month.<br><button class="linkish" data-aurora="reference-month">Go to July 2026</button></div>';
 if(!matches(s))return '<div class="card empty">No assignments match this view.<br><button class="linkish" data-aurora="clear-filters">Clear filters</button></div>';
 const me=Object.entries(s.assignments||{}).filter(([d,n])=>n===ui.me);
 return '<div class="service-switch" aria-label="Service time">'+day.map(x=>'<button data-aurora="service" data-id="'+svcId(x)+'" class="'+(svcId(s)===svcId(x)?'selected':'')+'" aria-pressed="'+(svcId(s)===svcId(x))+'">'+ai(x.service==='Evening'?'moon':'sun')+'<span><strong>'+fmtTime(x.time)+'</strong><small>'+esc(x.service)+'</small></span></button>').join('')+'</div><article class="service-detail"><div class="team-heading"><div><span class="overline">'+esc(s.service.toUpperCase())+' SERVICE</span><h3>The service team</h3></div><span class="count-chip">'+Object.values(s.assignments||{}).filter(Boolean).length+' assignments</span></div>'+(me.length?'<div class="your-duty-line">'+ai('check')+'<span>You are serving: <strong>'+me.map(([d])=>esc(d)).join(' + ')+'</strong></span></div>':'')+(feat('choirSong')&&s.choirSong?'<div class="choir-line">'+ai('songs')+' Choir · '+esc(s.choirSong)+'</div>':'')+'<div class="team-grid">'+renderTeam(s)+'</div><div class="team-footer"><span>'+esc(s.worship)+' · '+fmtTime(s.time)+'</span><button class="linkish" data-aurora="edit" data-id="'+svcId(s)+'">View / edit assignments '+ai('arrow')+'</button></div></article>';
}
function contextRail(){
 const duties=dutiesFor(ui.me),grouped=[];
 duties.forEach(d=>{let g=grouped.find(x=>svcId(x.svc)===svcId(d.svc));if(!g){g={svc:d.svc,roles:[]};grouped.push(g);}g.roles.push(d.duty);});
 const presider=duties.find(d=>d.duty==='Presider');
 return '<aside class="context-rail" aria-label="Your overview"><section class="overview-card"><div class="section-caption">YOUR MONTH, AT A GLANCE</div><div class="overview-profile">'+personBadge(ui.me,true)+'<div><strong>'+esc(ui.me||'Select a member')+'</strong><button class="linkish" data-act="tab" data-tab="my">Change member</button></div></div><div class="mini-metrics"><div><strong>'+duties.filter(d=>d.svc.date.startsWith(aui.month)).length+'</strong><span>Duty assignments</span></div><div><strong>'+new Set(duties.filter(d=>d.svc.date.startsWith(aui.month)).map(d=>d.svc.date)).size+'</strong><span>Service days</span></div></div><h3>Coming up for you</h3><div class="upcoming-list">'+grouped.slice(0,3).map(g=>'<button class="upcoming-item" data-aurora="jump-service" data-id="'+svcId(g.svc)+'"><span class="mini-date">'+shortDay(g.svc.date)+'<b>'+Number(g.svc.date.slice(8))+'</b></span><span><strong>'+g.roles.map(esc).join(' + ')+'</strong><small>'+fmtTime(g.svc.time)+' · '+esc(g.svc.service)+'</small></span><span class="upcoming-arrow">›</span></button>').join('')+'</div><button class="overview-link" data-act="tab" data-tab="my">All my duties '+ai('arrow')+'</button></section>'+(presider&&feat('songPicker')?'<section class="song-shortcut"><div class="music-tile">'+ai('songs')+'</div><span class="overline">PRESIDER WORKSPACE</span><h3>Prepare your setlist.</h3><p>Your song library, service plans and history. All in one place.</p><button class="primary" data-act="open-songs" data-svc="'+svcId(presider.svc)+'">Plan songs '+ai('arrow')+'</button><small>'+window.SONG_SEED.songs.length+' songs in the reference catalog</small></section>':'')+'<div class="quiet-note">'+ai('check')+'<span>Real app logic.<br>Local preview changes only.</span></div></aside>';
}
renderSchedule=function(){
 const {all,day,selected}=ensureSelection();
 const filtered=all.filter(matches),isList=aui.mode==='list'||!!aui.query;
 const cards=filtered.map(s=>'<article class="card month-service"><div class="month-service-head"><div><span class="overline">'+esc(fmtDate(s.date))+'</span><h3>'+esc(s.worship)+' <small>· '+esc(s.service)+'</small></h3></div><button class="time-button" data-aurora="jump-service" data-id="'+svcId(s)+'">'+fmtTime(s.time)+' ↗</button></div>'+(feat('choirSong')&&s.choirSong?'<p class="choir-line">Choir · '+esc(s.choirSong)+'</p>':'')+'<div class="team-grid">'+renderTeam(s)+'</div></article>').join('');
 return renderHero(selected)+'<div class="workspace-grid"><section class="schedule-main">'+dateBrowser(all)+'<div class="schedule-toolbar"><div class="view-switch"><button data-aurora="mode" data-mode="day" class="'+(!isList?'active':'')+'" aria-pressed="'+(!isList)+'">Day view</button><button data-aurora="mode" data-mode="list" class="'+(isList?'active':'')+'" aria-pressed="'+isList+'">All services</button></div>'+departmentPicker()+'</div><label class="schedule-search">'+ai('search')+'<span class="sr-only">Search people, duties or services</span><input id="a-search" type="search" placeholder="Find a person, duty or service…" value="'+esc(aui.query)+'" autocomplete="off"><kbd>/</kbd></label>'+(isList?(cards||'<div class="card empty">No services match your search.</div>'):renderSelectedService(selected,day))+(feat('pastServices')?'<label class="past-option"><input type="checkbox" id="a-past"'+(ui.showPast?' checked':'')+'> Include past services <span>May–July reference schedule</span></label>':'')+'</section>'+contextRail()+'</div>';
};

const originalRender=render;
render=function(){originalRender();decorate();};
function decorate(){
 const labels={schedule:['Service schedule','EVERY ROLE. ONE PLACE.','A clear view of who is serving, and when.'],my:['Your duties','YOUR PART IN THE SERVICE','Your assignments, reminders and change requests.'],songs:['Presider workspace','PLAN WITH CONFIDENCE','Build your setlist. Explore the catalog. Keep a thoughtful history.'],manage:['Manage the schedule','THE COORDINATOR WORKSPACE','Assignments, people and planning — without losing the big picture.']};
 const l=labels[ui.tab]||labels.schedule;
 document.body.dataset.screen=ui.tab;
 document.getElementById('page-title').textContent=l[0];
 document.getElementById('page-kicker').textContent=l[1];
 document.getElementById('page-description').textContent=l[2];
 document.getElementById('crumb').textContent={schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'}[ui.tab];
 document.getElementById('rail-person').textContent=ui.me||'Choose your name';
 document.getElementById('rail-initials').textContent=selectedInitials(ui.me);
 document.getElementById('heading-action').innerHTML=ui.tab==='schedule'?'<button class="primary" data-act="tab" data-tab="my">'+ai('my')+' My duties</button>':'';
 document.getElementById('sync-pill').textContent='Local preview · No live sync';
 document.querySelectorAll('nav.tabs button').forEach(b=>{
  const key=b.dataset.tab,dot=b.querySelector('.dot')?'<span class="dot"></span>':'';
  b.innerHTML=ai(key)+'<span>'+({schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'}[key])+'</span>'+dot;
  if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
 });
 if(!A.storageAvailable)document.getElementById('storage-note').textContent=' · Browser storage unavailable; changes last for this tab only';
 if(ui.tab==='my'){
  const calendar=document.querySelector('[data-act="subscribe-ics"]');
  if(calendar)calendar.textContent='Download preview calendar';
  const help=document.querySelector('.notify-box + .hint');
  if(help)help.textContent='Preview only: notification delivery and live calendar subscriptions are disabled. Calendar download exports a snapshot of these reference duties with the original reminders.';
 }
 if(ui.tab==='manage'&&ui.sub==='features'){
  const hint=document.querySelector('#view > .hint');
  if(hint)hint.textContent='These controls affect this local prototype only. Production settings are untouched.';
  const sync=document.querySelector('[data-chg="feature"][data-id="sheetSync"]');
  if(sync){sync.disabled=true;sync.closest('.feature-row').querySelector('.f-desc').textContent='Disabled in the offline preview. Production sync code is unchanged.';}
 }
 // Label original controls without replacing their action handlers.
 document.querySelectorAll('#view input:not([aria-label]),#view select:not([aria-label]),#view textarea:not([aria-label])').forEach(el=>{
  if(el.id&&document.querySelector('label[for="'+el.id+'"]'))return;
  if(el.closest('label'))return;
  const label=el.dataset.duty||el.dataset.field||el.getAttribute('placeholder')||({'svc-date':'Service date','svc-time':'Service time','svc-label':'Service label','a-department':'Duty department'}[el.id])||el.previousElementSibling?.textContent||'Schedule field';
  el.setAttribute('aria-label',String(label).trim());
 });
}
function toast(text){const el=document.getElementById('aurora-toast');el.textContent=text;el.classList.add('shown');clearTimeout(A.toastTimer);A.toastTimer=setTimeout(()=>el.classList.remove('shown'),5000);}
function navigateToService(id){
 const s=state.services.find(s=>svcId(s)===id);if(!s)return;
 aui.month=s.date.slice(0,7);aui.day=s.date;aui.service=id;aui.mode='day';aui.query='';ui.deptFilter='All';
 if(s.date<todayISO())ui.showPast=true;ui.tab='schedule';render();
}
document.addEventListener('click',e=>{
 const special=e.target.closest('[data-aurora]');
 if(special){
  e.preventDefault();
  const act=special.dataset.aurora;
  if(act==='month'){const d=new Date(aui.month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(special.dataset.step));aui.month=toISO(d).slice(0,7);aui.query='';render();}
  if(act==='day'){aui.day=special.dataset.date;aui.mode='day';aui.query='';render();}
  if(act==='service'){aui.service=special.dataset.id;render();}
  if(act==='mode'){aui.mode=special.dataset.mode;aui.query='';render();}
  if(act==='clear-filters'){aui.query='';ui.deptFilter='All';render();}
  if(act==='reference-month'){aui.month='2026-07';aui.query='';render();}
  if(act==='jump-service')navigateToService(special.dataset.id);
  if(act==='edit'){ui.tab='manage';ui.sub='services';ui.expanded['m:'+special.dataset.id]=true;render();requestAnimationFrame(()=>document.querySelector('[data-id="m:'+special.dataset.id+'"]')?.scrollIntoView({block:'center',behavior:'smooth'}));}
  if(act==='theme'){document.body.classList.toggle('dark');localStorage.setItem('theme',document.body.classList.contains('dark')?'dark':'light');}
  if(act==='motion'){document.body.classList.toggle('still');const still=document.body.classList.contains('still');localStorage.setItem('motion',still?'off':'on');special.setAttribute('aria-label',still?'Enable animation':'Pause animation');special.textContent=still?'▷':'Ⅱ';}
  if(act==='reset'&&confirm('Reset only this prototype’s local edits, setlists and preferences? Your live app is not affected.')){localStorage.clear();location.reload();}
  return;
 }
 const el=e.target.closest('[data-act]');if(!el)return;
 const blocked=['notify-on','notify-off','subscribe-ics','copy-ics','sync-sheet','sheet-sync'];
 if(blocked.includes(el.dataset.act)){
  e.preventDefault();e.stopImmediatePropagation();
  if(el.dataset.act==='subscribe-ics'){downloadICS();toast('Preview calendar snapshot exported. This is not a live calendar subscription.');}
  else toast('This online action is disabled in the local preview. No notification, calendar subscription or Google Sheet update was sent.');
 }
},true);
document.addEventListener('change',e=>{
 if(e.target.id==='a-department'){ui.deptFilter=e.target.value;localStorage.setItem('wds-dept',ui.deptFilter);render();}
 if(e.target.id==='a-past'){ui.showPast=e.target.checked;render();}
});
document.addEventListener('input',e=>{
 if(e.target.id!=='a-search')return;
 aui.query=e.target.value;const pos=e.target.selectionStart;
 // Preserve the original focused-editor guard; only this search is ours.
 e.target.blur();render();const next=document.getElementById('a-search');next.focus();
 try{if(pos!=null)next.setSelectionRange(pos,pos);}catch{}
});
document.addEventListener('keydown',e=>{
 if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){const el=document.getElementById('a-search');if(el){e.preventDefault();el.focus();}}
});
if(localStorage.getItem('theme')==='dark')document.body.classList.add('dark');
if(localStorage.getItem('motion')==='off'){document.body.classList.add('still');const b=document.querySelector('[data-aurora="motion"]');b.textContent='▷';b.setAttribute('aria-label','Enable animation');}
A.inspect=()=>({state:JSON.parse(JSON.stringify(state)),ui:JSON.parse(JSON.stringify(ui)),selection:{...aui}});
A.conflictsFor=conflictsFor;
