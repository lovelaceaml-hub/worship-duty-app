'use strict';
const direction = document.body.dataset.direction;
document.body.classList.add(`direction-${direction}`);
const title = direction === 'ledger' ? 'Service Ledger' : 'Weekbook';
const people = ['Mara Vellin', 'Theo Selwick', 'Lena Corven', 'Eli Darsen', 'Nora Fenwick', 'Owen Calden'];
const duties = ['Welcome', 'Seating', 'Setup', 'Closing'];
const storeKey = `compact-phone-${direction}-fixture-v1`;
let savedRecords = {};
try { savedRecords = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch (_) { /* Fixtures still work without storage. */ }
const fixtures = Array.from({length:24}, (_,i) => {
  const date = new Date(Date.UTC(2026, 8, 16 + i * 2));
  return { id: `fixture-${i+1}`, date, label: i % 2 ? 'Morning service' : 'Evening service', time: i % 2 ? '9:00 AM' : '7:30 PM', assignments: [people[i%6], i%3===0?'':people[(i+1)%6], people[(i+2)%6], people[(i+3)%6]], notes: '', ...savedRecords[`fixture-${i+1}`] };
});
const state = {search:'', page:1, filter:'upcoming', scroll:0, selected:null};
let route = location.hash || '#schedule';
let draft = null;
let dirty = false;
let saving = false;
let savedLabel = 'No changes';
let pendingLeave = null;
const app = document.querySelector('#app');
const dialog = document.querySelector('#leave-dialog');
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const datePart = (record, options) => record.date.toLocaleDateString('en-US', {...options,timeZone:'UTC'});
const icons = {schedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 4h2"/>',attention:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',members:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0112 0v2m1-15a3 3 0 010 6m2 3a5 5 0 013 5"/>',appearance:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'};
const globalRoutes = ['#my-duties', '#full-schedule', '#songs'];
function nav(){
  const destinations=[['#my-duties','My duties','attention'],['#full-schedule','Schedule','schedule'],['#songs','Songs','songs'],['#schedule','Manage','members']];
  return `<nav class="bottom-nav" aria-label="Main navigation">${destinations.map(([path,label,icon])=>{const active=path==='#schedule'?!globalRoutes.includes(route):route===path;return `<button data-route="${path}" class="${active?'active':''}" ${active?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${icon==='songs'?'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>':icons[icon]}</svg><span>${label}</span></button>`;}).join('')}</nav>`;
}
function managementTabs(){
  if(globalRoutes.includes(route)||route==='#appearance')return '';
  return `<nav class="tabs management-tabs" aria-label="Manage sections">${[['#schedule','Schedule'],['#attention','Needs attention'],['#members','Members']].map(([path,label])=>{const active=route===path||path==='#schedule'&&route.startsWith('#service/');return `<button data-route="${path}" class="${active?'active':''}" ${active?'aria-current="page"':''}>${label}</button>`;}).join('')}</nav>`;
}
function boundedDestination(){const labels={'#my-duties':'My duties','#full-schedule':'Full schedule','#songs':'Songs'};return `<section class="support-panel"><h2>${labels[route]} is outside this preview</h2><p>This direction round covers the leader's Manage workspace, from upcoming services to assignment editing. This main destination will be included when the chosen direction is expanded.</p><button class="primary" data-route="#schedule">Return to Manage</button></section>`;}
function render(){
  const editing=route.startsWith('#service/');
  const labels={'#schedule':'Upcoming services','#attention':'Needs attention','#members':'Members','#appearance':'Appearance','#my-duties':'My duties','#full-schedule':'Schedule','#songs':'Songs'};
  app.innerHTML=`<div class="shell"><header class="header"><div><div class="eyebrow">Service team / Leader</div><h1>${editing?'Service details':labels[route]||'Upcoming services'}</h1></div><div class="header-tools"><button class="appearance-control" data-route="#appearance">Appearance</button><a class="prototype-link" href="index.html" data-chooser>Compare directions</a></div></header><main class="workspace" id="main">${managementTabs()}${editing?editor():globalRoutes.includes(route)?boundedDestination():route==='#appearance'?appearance():route==='#attention'?attention():route==='#members'?members():schedule()}</main><aside class="desktop-aside"><p><strong>${title}</strong></p><p>${direction==='ledger'?'A single service index, ordered by date.':'Small weekly groups, with a date tile for each service.'}</p><p>Direction preview<br>Invented services and members<br>Saves stay in this browser</p></aside></div>${nav()}`;
  bind();
}
function filtered(){return fixtures.filter(r=>`${datePart(r,{month:'short',day:'numeric',weekday:'short'})} ${r.label} ${r.time} ${r.assignments.join(' ')}`.toLowerCase().includes(state.search.toLowerCase())).filter(r=>state.filter!=='open'||r.assignments.some(n=>!n));}
function row(r){
  const open=r.assignments.filter(n=>!n).length;
  const assigned=r.assignments.filter(Boolean);
  const concise=assigned.slice(0,2).map(name=>{const parts=name.split(' ');return `${parts[0]} ${parts[1][0]}.`;}).join(' · ')+(assigned.length>2?` +${assigned.length-2}`:'');
  return `<button class="record ${state.selected===r.id?'selected':''}" data-service="${r.id}" aria-label="Edit ${esc(r.label)}, ${datePart(r,{month:'long',day:'numeric'})}, ${r.time}. Assigned: ${esc(assigned.join(', ')||'Nobody')}. ${open?`${open} open duty`:'All assigned'}"><span class="record-date">${direction==='weekbook'?datePart(r,{weekday:'short'}):datePart(r,{month:'short'})}<strong>${datePart(r,{day:'numeric'})}</strong></span><span class="record-main"><strong>${r.label.replace(' service','')} · ${r.time}</strong><small class="team-summary">${esc(concise||'No members assigned')}</small></span><span class="record-state ${open?'open':''}">${open?`${open} open`:'4 assigned'}</span><span class="chevron" aria-hidden="true">›</span></button>`;
}
function schedule(){
  let results=filtered();const pages=Math.max(1,Math.ceil(results.length/10));state.page=Math.min(state.page,pages);let slice=results.slice((state.page-1)*10,state.page*10);
  let rows='';
  if(direction==='weekbook'){
    const groups=new Map();slice.forEach(r=>{let monday=new Date(r.date);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);let label=monday.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});if(!groups.has(label))groups.set(label,[]);groups.get(label).push(r);});
    rows=[...groups].map(([label,records])=>`<section class="week-block" aria-label="Week of ${label}"><h2 class="week-label">Week of ${label}</h2>${records.map(row).join('')}</section>`).join('');
  }else rows=`<div class="ledger-records">${slice.map(row).join('')}</div>`;
  return `<div class="toolbar"><label class="search"><input id="search" type="search" autocomplete="off" aria-label="Search services by date, service or member" placeholder="Search services or members" value="${esc(state.search)}"></label><button class="filter-toggle ${state.filter==='open'?'active':''}" data-filter="${state.filter==='open'?'upcoming':'open'}" aria-pressed="${state.filter==='open'}">Open only</button></div><div class="summary-line"><span>${results.length?`${(state.page-1)*10+1} to ${Math.min(state.page*10,results.length)} of ${results.length} services`:'No matching services'}</span><span>Pacific time</span></div>${results.length?rows:'<div class="empty"><p>No services match that search.</p><button id="clear-search">Clear search</button></div>'}<div class="pagination" aria-label="Service pages"><button id="prev" ${state.page===1?'disabled':''}>Previous</button><span aria-live="polite">Page ${state.page} of ${pages}</span><button id="next" ${state.page===pages?'disabled':''}>Next</button></div><p class="scope-note">Local direction preview. Fictional records only.</p>`;
}
function editor(){
 const r=fixtures.find(r=>r.id===route.split('/')[1]);if(!r)return '<div class="empty">This fixture service is unavailable.<p><button data-route="#schedule">Back to schedule</button></p></div>';
 if(!draft||draft.id!==r.id){draft={id:r.id,assignments:[...r.assignments],notes:r.notes};dirty=false;savedLabel='No changes';}
 return `<button class="plain back" id="back">‹ <span>Back to services</span></button><section class="service-heading"><div><h1>${r.label}</h1><p>${datePart(r,{weekday:'long',month:'short',day:'numeric'})} · ${r.time} PT</p></div><div class="service-date">${datePart(r,{month:'short'})}<strong>${datePart(r,{day:'numeric'})}</strong></div></section><div class="section-heading"><h2>Service team</h2><span>4 duties</span></div><form id="edit-form"><div class="assignments">${duties.map((duty,i)=>`<label class="assignment"><span>${duty}</span><select data-duty="${i}" aria-label="${duty} assignment"><option value="">Open duty</option>${people.map(p=>`<option ${draft.assignments[i]===p?'selected':''}>${esc(p)}</option>`).join('')}</select></label>`).join('')}</div><label class="notes-label">Service note <span class="small">(optional)</span><textarea id="notes" maxlength="240" rows="2" placeholder="Add a short note for the team">${esc(draft.notes)}</textarea></label><div class="save-bar"><span class="status" role="status" aria-live="polite">${savedLabel}</span><button class="primary" id="save" type="submit" ${!dirty?'disabled':''}>Save changes</button></div></form><p class="scope-note">Prototype save: this browser only. No notifications are sent.</p>`;
}
function appearance(){return `<div class="support-panel"><h2>Four layouts stay in scope</h2><p>This choice is about the service-list and editor structure. Both candidates preview the same Navy &amp; Cream appearance treatment.</p><p>The selected structure will be translated into all four distinct appearance layouts before prototype approval.</p></div>${[['Original','original','Familiar blue, straightforward hierarchy.'],['Prism','prism','Distinct geometric workspace composition.'],['Navy & Cream','','Structured navy and warm paper layout.'],['Aurora','aurora','Distinct soft-color, layered composition.']].map(([n,c,d])=>`<div class="appearance-item"><div class="swatch ${c}" aria-hidden="true"></div><div><strong>${n}</strong><p>${d} Translation pending selection.</p></div></div>`).join('')}<button class="plain" data-route="#schedule">‹ Back to services</button>`;}
function attention(){const open=fixtures.filter(r=>r.assignments.some(n=>!n));return `<p class="small" style="margin-bottom:12px">${open.length} services with open duties. Open a service to assign someone.</p>${open.map(row).join('')}<p class="scope-note">Requests and conflicts are part of the selected-direction expansion.</p>`;}
function members(){return `<p class="small" style="margin:4px 0 16px">Service team / 6 fictional members</p>${people.map((p,i)=>`<div class="appearance-item"><span class="swatch" style="display:grid;place-items:center;background:var(--wash)">${p.split(' ').map(s=>s[0]).join('')}</span><div><strong>${p}</strong><p>Welcome, Seating, Setup, Closing</p></div></div>`).join('')}<p class="scope-note">Member management is outside this direction-choice round.</p>`;}
function requestLeave(action){if(!dirty&&!saving){action();return;}pendingLeave=action;dialog.showModal();document.querySelector('#stay').focus();}
function go(next,replace=false){requestLeave(()=>{if(route==='#schedule')state.scroll=window.scrollY;route=next;draft=null;dirty=false;history[replace?'replaceState':'pushState']({route:next,fromApp:true},'',next);render();window.scrollTo(0,next==='#schedule'?state.scroll:0);});}
function updateDirty(){dirty=true;savedLabel='Unsaved changes';app.querySelector('.status').textContent=savedLabel;app.querySelector('#save').disabled=false;}
function bind(){
 app.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.route)));
 app.querySelector('[data-chooser]').addEventListener('click',e=>{e.preventDefault();requestLeave(()=>location.href='index.html');});
 app.querySelectorAll('[data-service]').forEach(b=>b.addEventListener('click',()=>{state.selected=b.dataset.service;go(`#service/${b.dataset.service}`);}));
 app.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;state.page=1;state.scroll=0;render();}));
 app.querySelector('#search')?.addEventListener('input',e=>{const pos=e.target.selectionStart;state.search=e.target.value;state.page=1;render();const el=app.querySelector('#search');el.focus({preventScroll:true});if(el.type==='search')try{el.setSelectionRange(pos,pos);}catch(_){};});
 app.querySelector('#clear-search')?.addEventListener('click',()=>{state.search='';state.page=1;render();app.querySelector('#search').focus();});
 for(const [id,change] of [['prev',-1],['next',1]])app.querySelector(`#${id}`)?.addEventListener('click',()=>{state.page+=change;state.scroll=0;render();window.scrollTo(0,0);});
 app.querySelector('#back')?.addEventListener('click',()=>requestLeave(()=>{dirty=false;if(history.state?.fromApp)history.back();else go('#schedule',true);}));
 app.querySelectorAll('[data-duty]').forEach(s=>s.addEventListener('change',()=>{draft.assignments[Number(s.dataset.duty)]=s.value;updateDirty();}));
 app.querySelector('#notes')?.addEventListener('input',e=>{draft.notes=e.target.value;updateDirty();});
 app.querySelector('#edit-form')?.addEventListener('submit',async e=>{
   e.preventDefault();if(!dirty||saving)return;saving=true;const save=app.querySelector('#save');save.disabled=true;save.textContent='Saving...';app.querySelector('.status').textContent='Saving to this browser...';app.querySelectorAll('select,textarea').forEach(el=>el.disabled=true);
   await new Promise(resolve=>setTimeout(resolve,350));
   try{const next={...savedRecords,[draft.id]:{assignments:[...draft.assignments],notes:draft.notes}};localStorage.setItem(storeKey,JSON.stringify(next));savedRecords=next;Object.assign(fixtures.find(r=>r.id===draft.id),next[draft.id]);dirty=false;savedLabel='Saved in this browser';}
   catch(_){savedLabel='Save failed. Edits retained. Try again.';}
   saving=false;save.textContent=dirty?'Retry save':'Save changes';save.disabled=!dirty;app.querySelector('.status').textContent=savedLabel;app.querySelectorAll('select,textarea').forEach(el=>el.disabled=false);
 });
}
document.querySelector('#stay').addEventListener('click',()=>{pendingLeave=null;dialog.close();});
document.querySelector('#discard').addEventListener('click',()=>{if(saving)return;dirty=false;draft=null;dialog.close();const action=pendingLeave;pendingLeave=null;action?.();});
dialog.addEventListener('cancel',()=>{pendingLeave=null;});
window.addEventListener('popstate',()=>{const next=location.hash||'#schedule';if(dirty||saving){history.replaceState({route,fromApp:true},'',route);requestLeave(()=>{dirty=false;draft=null;route=next;history.replaceState({route:next},'',next);render();window.scrollTo(0,next==='#schedule'?state.scroll:0);});}else{route=next;draft=null;render();window.scrollTo(0,next==='#schedule'?state.scroll:0);}});
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
if(!location.hash)history.replaceState({route:'#schedule'},'','#schedule');
render();
