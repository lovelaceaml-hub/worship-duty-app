/* Layout-only alternative. Shared offline safeguards and original domain
 * handlers come from Aurora. Prism gets a separate storage namespace. */
window.Prism=A;
ensureSelection=function(){
 let all=allInMonth();
 if(!aui.day){
  const next=nextUpcomingService();
  if(next){aui.month=next.date.slice(0,7);aui.day=next.date;aui.service=svcId(next);all=allInMonth();}
 }
 if(!aui.day.startsWith(aui.month))aui.day=all[0]?.date||aui.month+'-01';
 const day=all.filter(s=>s.date===aui.day);
 if(!day.some(s=>svcId(s)===aui.service)){
  const next=day.find(s=>serviceStartMs(s)>=Date.now());
  aui.service=next?svcId(next):(day[0]?svcId(day[0]):'');
 }
 if(day.some(matches)&&!day.some(s=>svcId(s)===aui.service&&matches(s)))aui.service=svcId(day.find(matches));
 return {all,day,selected:day.find(s=>svcId(s)===aui.service)};
};
function prismCount(all){return '<span>'+all.length+' services</span><i></i><span>'+new Set(all.map(s=>s.date)).size+' service days</span>';}
function prismCalendar(all){
 const first=new Date(aui.month+'-01T12:00:00');
 const days=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
 const count=Math.ceil((first.getDay()+days)/7)*7;
 const start=new Date(first);start.setDate(1-first.getDay());
 let cells='';
 for(let i=0;i<count;i++){
  const date=new Date(start);date.setDate(start.getDate()+i);const iso=toISO(date);
  const outside=!iso.startsWith(aui.month),list=all.filter(s=>s.date===iso),mine=list.some(s=>Object.values(s.assignments||{}).includes(ui.me));
  const chosen=iso===aui.day,label=date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})+', '+list.length+' services'+(mine?', you are assigned':'');
  cells+='<button class="month-cell date-tile'+(outside?' outside':'')+(chosen?' selected':'')+(list.length?' has-services':'')+'" data-prism="date" data-date="'+iso+'" aria-label="'+esc(label)+'" aria-pressed="'+chosen+'"><span class="cell-top"><b>'+date.getDate()+'</b>'+(mine?'<span class="cell-you">You</span>':'')+'</span><span class="cell-services">'+list.map(s=>'<span class="calendar-service '+s.service.toLowerCase()+(Object.values(s.assignments||{}).includes(ui.me)?' is-mine':'')+'"><i></i>'+esc(fmtTime(s.time))+'</span>').join('')+'</span><span class="mobile-dots">'+list.map(s=>'<i class="'+(Object.values(s.assignments||{}).includes(ui.me)?'mine':'')+'"></i>').join('')+'</span></button>';
 }
 return '<section class="calendar-panel" aria-label="'+esc(monthTitle(aui.month))+' service calendar"><div class="calendar-weekdays" aria-hidden="true">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="calendar-grid">'+cells+'</div><div class="calendar-legend"><span><i class="legend-morning"></i>Morning</span><span><i class="legend-afternoon"></i>Afternoon</span><span><i class="legend-evening"></i>Evening</span><span class="legend-you">● Your assignment</span></div></section>';
}
function prismInspector(selected,day){
 const d=new Date(aui.day+'T12:00:00'),weekday=d.toLocaleDateString('en-US',{weekday:'long'}),month=d.toLocaleDateString('en-US',{month:'long'});
 const header='<div class="inspector-heading"><div><span class="overline">'+esc(weekday)+'</span><h2>'+esc(month)+' <b>'+d.getDate()+'</b></h2><span class="inspector-sub">'+(selected?esc(selected.worship):'Service details')+' · Pacific time</span></div><span class="inspector-date" aria-hidden="true">'+String(d.getDate()).padStart(2,'0')+'</span></div>';
 if(!selected)return '<aside class="prism-inspector" aria-label="Selected day">'+header+'<div class="prism-empty">'+ai('schedule')+'<h3>No services in this view.</h3><p>This date has no visible reference assignments. Choose a highlighted day or include past services.</p><button class="ghost" data-aurora="reference-month">Go to July 2026</button></div></aside>';
 const mine=Object.entries(selected.assignments||{}).filter(([_,n])=>n===ui.me),filtered=matches(selected);
 return '<aside class="prism-inspector" aria-label="Selected service">'+header+'<div class="prism-service-times" aria-label="Service time">'+day.map(s=>'<button data-aurora="service" data-id="'+svcId(s)+'" aria-pressed="'+(svcId(selected)===svcId(s))+'" class="'+(svcId(selected)===svcId(s)?'selected':'')+'">'+ai(s.service==='Evening'?'moon':'sun')+'<strong>'+fmtTime(s.time)+'</strong><small>'+esc(s.service)+'</small></button>').join('')+'</div>'+(mine.length?'<div class="prism-yours">'+ai('check')+'<span>Your duty: <b>'+mine.map(([r])=>esc(r)).join(' + ')+'</b></span></div>':'')+'<div class="inspector-team-heading"><h3>Service team</h3><span>'+Object.values(selected.assignments||{}).filter(Boolean).length+' assigned</span></div><div class="inspector-scroll service-detail" tabindex="0" aria-label="All service assignments">'+(filtered?((feat('choirSong')&&selected.choirSong?'<div class="choir-line">'+ai('songs')+'Choir · '+esc(selected.choirSong)+'</div>':'')+'<div class="team-grid">'+renderTeam(selected)+'</div>'):'<div class="prism-empty"><p>No assignments match the department filter.</p><button class="linkish" data-aurora="clear-filters">Clear filters</button></div>')+'</div><div class="inspector-actions"><button class="primary" data-aurora="edit" data-id="'+svcId(selected)+'">View / edit assignments '+ai('arrow')+'</button></div></aside>';
}
function prismUpcoming(){
 const grouped=[];dutiesFor(ui.me).forEach(d=>{let g=grouped.find(x=>svcId(x.svc)===svcId(d.svc));if(!g){g={svc:d.svc,roles:[]};grouped.push(g);}g.roles.push(d.duty);});
 return '<section class="prism-upcoming"><div class="prism-section-title"><div><span class="overline">YOUR PART IN THE MONTH</span><h3>Coming up for you</h3></div><button class="linkish" data-act="tab" data-tab="my">My duties '+ai('arrow')+'</button></div><div class="upcoming-strip">'+(grouped.length?grouped.slice(0,3).map((g,i)=>'<button class="prism-duty-ticket" data-aurora="jump-service" data-id="'+svcId(g.svc)+'"><span class="ticket-date">'+shortDay(g.svc.date)+'<b>'+g.svc.date.slice(8)+'</b><small>'+new Date(g.svc.date+'T12:00:00').toLocaleDateString('en-US',{month:'short'})+'</small></span><span class="ticket-body"><small>'+esc(g.svc.service)+' · '+fmtTime(g.svc.time)+'</small><strong>'+g.roles.map(esc).join(' + ')+'</strong><span>View service <b>↗</b></span></span></button>').join(''):'<div class="hint">No upcoming duties for this member. Choose your name in My Duties.</div>')+'</div></section>';
}
function prismAgenda(all){
 const filtered=all.filter(matches);
 return '<section class="prism-agenda" aria-label="All services">'+(filtered.map(s=>'<article class="month-service"><div class="agenda-date"><span>'+shortDay(s.date)+'</span><strong>'+Number(s.date.slice(8))+'</strong><small>'+new Date(s.date+'T12:00:00').toLocaleDateString('en-US',{month:'short'})+'</small></div><div class="agenda-body"><div class="agenda-head"><div><span class="overline">'+esc(s.worship)+'</span><h3>'+fmtTime(s.time)+' <small>· '+esc(s.service)+'</small></h3></div><button class="icon-button" data-aurora="jump-service" data-id="'+svcId(s)+'" aria-label="Open '+esc(s.date+' '+s.service)+' service">↗</button></div>'+(feat('choirSong')&&s.choirSong?'<div class="choir-line">'+ai('songs')+' Choir · '+esc(s.choirSong)+'</div>':'')+'<div class="team-grid">'+renderTeam(s)+'</div></div></article>').join('')||'<div class="prism-empty"><h3>No services match your search.</h3><button class="linkish" data-aurora="clear-filters">Clear filters</button></div>')+'</section>';
}
renderSchedule=function(){
 const {all,day,selected}=ensureSelection(),agenda=aui.mode==='list'||!!aui.query;
 const next=dutiesFor(ui.me).find(d=>d.duty==='Presider');
 return '<div class="prism-planner-toolbar"><div class="prism-month"><h2>'+esc(monthTitle(aui.month))+'</h2><div class="prism-month-count">'+prismCount(all)+'</div></div><div class="prism-month-controls"><button class="icon-button" data-aurora="month" data-step="-1" aria-label="Previous month">‹</button><button class="icon-button" data-aurora="month" data-step="1" aria-label="Next month">›</button><button class="ghost reference-month" data-aurora="reference-month">Reference month</button></div><div class="view-switch"><button data-aurora="mode" data-mode="day" class="'+(!agenda?'active':'')+'" aria-pressed="'+(!agenda)+'">Month</button><button data-aurora="mode" data-mode="list" class="'+(agenda?'active':'')+'" aria-pressed="'+agenda+'">Agenda</button></div></div><div class="prism-filter-row"><label class="schedule-search">'+ai('search')+'<span class="sr-only">Search people, duties or services</span><input id="a-search" type="search" placeholder="Search people, duties, services…" value="'+esc(aui.query)+'" autocomplete="off"><kbd>/</kbd></label>'+departmentPicker()+(feat('pastServices')?'<label class="past-option"><input id="a-past" type="checkbox"'+(ui.showPast?' checked':'')+'>Past services</label>':'')+'</div><div class="prism-planner"><div class="prism-calendar-column">'+(agenda?prismAgenda(all):prismCalendar(all))+prismUpcoming()+(next&&feat('songPicker')?'<section class="prism-song-invite"><div class="record-art" aria-hidden="true"><i></i></div><div><span class="overline">NEXT TIME YOU PRESIDE</span><h3>Your service. Your setlist.</h3><p>'+esc(fmtDate(next.svc.date))+' · '+esc(next.svc.service)+'</p></div><button class="primary" data-act="open-songs" data-svc="'+svcId(next.svc)+'">Plan songs '+ai('arrow')+'</button></section>':'')+'</div>'+prismInspector(selected,day)+'</div>';
};
const baseDecorate=decorate;
decorate=function(){
 baseDecorate();
 const titles={schedule:['Service calendar','THE MONTH, TOGETHER.','Your people. Your duties. A clearer month.'],my:['Your next moments','PERSONAL DUTY PLANNER','See where you are serving. Prepare for what is next.'],songs:['The music workspace','PRESIDER / SONG PLANNING','Explore the library. Build your setlist. See the whole service.'],manage:['A place for every role','COORDINATOR / SCHEDULE MANAGEMENT','Plan assignments, balance duties and keep everyone in view.']};
 const t=titles[ui.tab]||titles.schedule;
 document.getElementById('page-title').textContent=t[0];document.getElementById('page-kicker').textContent=t[1];document.getElementById('page-description').textContent=t[2];
 const next=dutiesFor(ui.me)[0];
 document.getElementById('heading-action').innerHTML=ui.tab==='schedule'&&next?'<button class="prism-next" data-aurora="jump-service" data-id="'+svcId(next.svc)+'"><span class="next-icon">'+ai('my')+'</span><span><small>YOUR NEXT DUTY</small><strong>'+esc(next.duty)+'</strong><span>'+esc(fmtDate(next.svc.date))+' · '+fmtTime(next.svc.time)+'</span></span><b>↗</b></button>':'';
};
document.addEventListener('click',e=>{
 if(e.target.closest('[data-aurora="reference-month"]')){aui.day='';aui.service='';render();return;}
 const b=e.target.closest('[data-prism="date"]');if(!b)return;
 aui.month=b.dataset.date.slice(0,7);aui.day=b.dataset.date;aui.service='';aui.query='';aui.mode='day';render();
});
// A calendar is navigable without a pointer. Focus follows the actual date,
// including adjacent months; Enter/Space still use the native button behavior.
document.addEventListener('keydown',e=>{
 const b=e.target.closest?.('[data-prism="date"]');if(!b)return;
 const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(delta===undefined)return;
 e.preventDefault();const d=new Date(b.dataset.date+'T12:00:00');d.setDate(d.getDate()+delta);
 aui.day=toISO(d);aui.month=aui.day.slice(0,7);aui.service='';render();
 document.querySelector('[data-prism="date"][data-date="'+aui.day+'"]')?.focus();
});
