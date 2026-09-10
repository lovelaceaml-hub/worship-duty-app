/* Prism surface adapters: restructure original markup, never reimplement domain
 * mutations. All existing data-act, data-chg, ids and feature gates survive. */
const PS = window.PrismUI = {
  fragment(html) { const t=document.createElement('template');t.innerHTML=html;return t.content; },
  html(node) { return node?.outerHTML || ''; },
  section(title,description='',tag='WORKSPACE') {
    return '<div class="ps-section-head"><div><span class="overline">'+esc(tag)+'</span><h2>'+esc(title)+'</h2>'+(description?'<p>'+esc(description)+'</p>':'')+'</div><span class="ps-local-label">Local preview</span></div>';
  },
  stats(rows) { return '<div class="ps-stats">'+rows.map(([label,value,note])=>'<div class="ps-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note||'')+'</small></div>').join('')+'</div>'; },
  panel(title,html,icon='manage') { return '<section class="ps-panel"><div class="ps-panel-title">'+ai(icon)+'<h3>'+esc(title)+'</h3></div>'+html+'</section>'; },
  auth(html,kind='editor') {
    const f=this.fragment(html),box=f.querySelector('.lock-box');
    if(box){box.classList.add('ps-auth');box.insertAdjacentHTML('afterbegin','<span class="ps-auth-icon" aria-hidden="true">'+ai('my')+'</span><div class="overline">'+(kind==='site'?'PRIVATE WORKSPACE':'EDITOR ACCESS')+'</div>');}
    const holder=document.createElement('div');holder.append(f);return holder.innerHTML;
  },
  /* Browser dialog handles modal focus/inertness. Cancel is the initial focus;
   * Escape resolves false, double clicks cannot perform two destructive actions. */
  confirm(message) {
    if(this.dialogPending)return Promise.resolve(false);
    this.dialogPending=true;
    return new Promise(resolve=>{
      const trigger=document.activeElement;
      const d=document.createElement('dialog');d.className='ps-dialog';d.setAttribute('aria-labelledby','ps-confirm-title');d.setAttribute('aria-describedby','ps-confirm-message');
      d.innerHTML='<div class="ps-dialog-icon">'+ai('manage')+'</div><span class="overline">PRISM / LOCAL PREVIEW</span><h2 id="ps-confirm-title">Confirm this change</h2><p id="ps-confirm-message"></p><p class="ps-dialog-scope">This changes this prototype only. Your live app is untouched.</p><form method="dialog"><button class="ghost" value="cancel" autofocus>Cancel</button><button class="primary" value="confirm">Confirm change</button></form>';
      d.querySelector('#ps-confirm-message').textContent=String(message);
      const finish=()=>{const ok=d.returnValue==='confirm';d.remove();this.dialogPending=false;if(trigger?.isConnected)trigger.focus({preventScroll:true});resolve(ok);};
      d.addEventListener('close',finish,{once:true});document.body.append(d);d.showModal();
    });
  }
};

const psMyBase=renderMy;
renderMy=function(){
  const frag=PS.fragment(psMyBase()),children=[...frag.children],duties=ui.me?dutiesFor(ui.me):[];
  let side='',timeline='',requests='',other='';
  for(let i=0;i<children.length;i++){
    const el=children[i];
    if(el.matches('.me-picker')) {side+=PS.panel('Your profile',PS.html(el),'my');continue;}
    if(el.matches('.notify-box')){
      const song=!!el.querySelector('[data-act="open-songs"]');let body=PS.html(el);
      if(children[i+1]?.matches('.hint'))body+=PS.html(children[++i]);
      side+=PS.panel(song?'Your next song plan':'Calendar & reminders',body,song?'songs':'schedule');continue;
    }
    if(el.matches('.duty-card')){timeline+=PS.html(el);continue;}
    if(el.matches('.req-card')){requests+=PS.html(el);continue;}
    if(el.matches('.card')){side+=PS.html(el);continue;}
    other+=PS.html(el);
  }
  const next=duties[0],days=new Set(duties.map(d=>d.svc.date)).size,pending=state.requests.filter(r=>r.name===ui.me&&r.status==='pending').length;
  const hero=ui.me?'<section class="ps-personal-hero"><div><span class="overline">NEXT ON YOUR SCHEDULE</span><h2>'+(next?esc(next.duty):'A little room in your schedule.')+'</h2><p>'+(next?esc(fmtDate(next.svc.date))+' · '+fmtTime(next.svc.time)+' · '+esc(next.svc.service):'New assignments will appear here.')+'</p>'+(next?'<button class="ghost" data-aurora="jump-service" data-id="'+svcId(next.svc)+'">View the service '+ai('arrow')+'</button>':'')+'</div><div class="ps-hero-date" aria-hidden="true">'+(next?'<small>'+shortDay(next.svc.date)+'</small><b>'+Number(next.svc.date.slice(8))+'</b>':ai('my'))+'</div></section>':'';
  return '<div class="ps-personal" data-ps-page="my"><div class="ps-personal-main">'+hero+(ui.me?PS.stats([['Upcoming duties',duties.length,'From the reference schedule'],['Service days',days,'Grouped by date'],['Pending requests',pending,'Awaiting coordinator review']]):'')+'<div class="ps-section-head"><div><span class="overline">YOUR ASSIGNMENTS</span><h2>Duty timeline</h2></div></div>'+other+'<div class="ps-duty-timeline">'+timeline+'</div>'+requests+'</div><aside class="ps-personal-side" aria-label="Profile and preparation">'+side+'</aside></div>';
};

const psServicesBase=renderManageServices;
renderManageServices=function(){
 const f=PS.fragment(psServicesBase()),form=f.querySelector('form.add-row');
 let compose='';if(form){compose=PS.panel('Add a service',form.outerHTML,'schedule');form.remove();}
 f.querySelectorAll('.card').forEach(card=>{
  card.classList.add('ps-managed-service');
  const meta=card.querySelector('.edit-grid');
  if(!meta)return;
  meta.classList.add('ps-editor-meta');
  const columns=document.createElement('div');columns.className='ps-editor-columns';
  card.querySelectorAll('.cat-edit-label').forEach(label=>{
    const fields=label.nextElementSibling;if(!fields?.matches('.edit-grid'))return;
    const group=document.createElement('section');group.className='ps-editor-group';group.append(label,fields);columns.append(group);
  });
  meta.after(columns);
 });
 const holder=document.createElement('div');holder.append(f);
 const upcoming=upcomingServices(),count=upcoming.reduce((n,s)=>n+Object.values(s.assignments||{}).filter(Boolean).length,0);
 return '<section data-ps-page="manage-services">'+PS.section('Service planning','Create services and assign every role from one workspace.','MANAGE / SERVICES')+PS.stats([['Upcoming services',upcoming.length,'Visible reference services'],['Assigned duty slots',count,'Across these services'],['People on the roster',state.members.length,'Managed in People']])+compose+'<div class="ps-service-list">'+holder.innerHTML+'</div></section>';
};

const psPlanningBase=renderManagePlanning;
renderManagePlanning=function(){
 const f=PS.fragment(psPlanningBase()),cards=[...f.children].filter(c=>c.matches('.card'));
 return '<section data-ps-page="manage-planning">'+PS.section('Balance the workload','Review conflicts, coverage and the existing roster workload.','MANAGE / PLANNING')+'<div class="ps-planning-grid">'+cards.map((c,i)=>{c.classList.add(i===2?'ps-workload':'ps-planning-card');return c.outerHTML;}).join('')+'</div></section>';
};
const psRequestsBase=renderManageRequests;
renderManageRequests=function(){
 const pending=pendingRequestsCount(),resolved=state.requests.length-pending;
 return '<section data-ps-page="manage-requests">'+PS.section('Requests inbox','Keep each member’s change request connected to the service.','MANAGE / REQUESTS')+PS.stats([['Pending',pending,'Needs review'],['Resolved',resolved,'Approved or declined'],['Total requests',state.requests.length,'Stored in this preview']])+'<div class="ps-requests">'+psRequestsBase()+'</div></section>';
};
const psPeopleBase=renderManagePeople;
renderManagePeople=function(){
 const f=PS.fragment(psPeopleBase()),form=f.querySelector('form'),rows=[...f.querySelectorAll('.list-row')];form?.remove();
 rows.forEach(row=>{
  const input=row.querySelector('[data-chg="member-name"]');row.classList.add('ps-person');
  if(input){input.setAttribute('aria-label','Member name: '+input.value);input.insertAdjacentHTML('beforebegin','<span class="ps-person-avatar" aria-hidden="true">'+esc(selectedInitials(input.value))+'</span>');}
 });
 const hints=[...f.children].filter(el=>!el.matches('.list-row')).map(el=>el.outerHTML).join('');
 return '<section data-ps-page="manage-people">'+PS.section('Your people','Edit names and manage department eligibility in one directory.','MANAGE / PEOPLE')+'<div class="ps-directory-tools">'+PS.stats([['Members',state.members.length,'Original roster + your edits'],['Departments',CATEGORIES.length,'Eligibility used by duty pickers']])+PS.panel('Add someone',PS.html(form),'people')+'</div>'+hints+'<div class="ps-people-grid">'+rows.map(el=>el.outerHTML).join('')+'</div></section>';
};
const psFeaturesBase=renderFeatures;
renderFeatures=function(){
 const f=PS.fragment(psFeaturesBase());
 const groups=[['Access & permissions',['siteLock','editorLock']],['Schedule & preparation',['songPicker','whoElse','choirSong','pastServices','emptyDuties','conflictWarnings']],['Member tools',['notifications','reminders','calendarExport','changeRequests']],['Connections',['sheetSync']]];
 let html='';
 groups.forEach(([title,ids])=>{
  let rows='';ids.forEach(id=>{const c=f.querySelector('[data-id="'+id+'"]')?.closest('.feature-row');if(c){rows+=c.outerHTML;c.remove();}});
  if(rows)html+=PS.panel(title,rows,title==='Connections'?'manage':'my');
 });
 // Any newly added core feature is kept visible even if the grouping map is older.
 const fallback=[...f.querySelectorAll('.feature-row')];if(fallback.length){html+=PS.panel('Additional features',fallback.map(c=>c.outerHTML).join(''));fallback.forEach(c=>c.remove());}
 const settings=[...f.querySelectorAll('.card')].map(c=>c.outerHTML).join('');
 const panels=[...PS.fragment(html).children];
 html='<div class="ps-settings-column">'+panels.filter((_,i)=>i%2===0).map(p=>p.outerHTML).join('')+'</div><div class="ps-settings-column">'+panels.filter((_,i)=>i%2===1).map(p=>p.outerHTML).join('')+'</div>';
 return '<section data-ps-page="manage-features">'+PS.section('Workspace settings','Feature flags affect this preview only; online delivery remains disabled.','MANAGE / FEATURES')+'<p class="hint ps-preview-hint">All edits on this page stay in Prism. They do not change production settings.</p><div class="ps-settings-grid">'+html+'</div><div class="ps-section-head"><div><span class="overline">SECURITY & RESPONSIBILITY</span><h2>Passcodes and scheduler</h2></div></div><div class="ps-security-grid">'+settings+'</div></section>';
};
const psDataBase=renderManageData;
renderManageData=function(){
 const f=PS.fragment(psDataBase()),container=f.querySelector('.data-actions');
 const cards=[...container.children];
 if(!fb&&cards[0])cards[0].innerHTML='<div class="ps-connection-icon">'+ai('manage')+'</div><h3>Isolated by design</h3><p>This prototype stores changes on this device. It does not connect to your live Firebase project, send notifications or refresh the Google Sheet.</p><span class="ps-state-chip">Local storage only</span>';
 const names=['Connection status','Backup & restore','Reset reference data','Member-name cleanup'];
 cards.forEach((c,i)=>{c.classList.add('ps-data-card');if(i===2)c.classList.add('ps-danger-zone');if(i>0)c.insertAdjacentHTML('afterbegin','<div class="overline">'+esc(names[i]||'DATA TOOL')+'</div>');});
 return '<section data-ps-page="manage-data">'+PS.section('Data & connections','Keep a local backup and manage your prototype’s reference data.','MANAGE / DATA & SYNC')+'<div class="ps-data-grid">'+cards.map(c=>c.outerHTML).join('')+'</div></section>';
};
const psLockBase=renderSiteLock,psUnlockBase=renderUnlock,psCreateBase=renderCreatePin;
renderSiteLock=()=>PS.auth(psLockBase(),'site');renderUnlock=()=>PS.auth(psUnlockBase());renderCreatePin=()=>PS.auth(psCreateBase());

const psDecorateBase=decorate;
decorate=function(){
 psDecorateBase();
 document.body.dataset.psPage=ui.tab==='manage'?'manage-'+ui.sub:ui.tab;
 const locked=feat('siteLock')&&!siteUnlocked();
 if(locked){
  document.body.dataset.psPage='site-lock';
  document.getElementById('page-title').textContent='Private workspace';document.getElementById('page-kicker').textContent='LV ZION / SECURE ACCESS';document.getElementById('page-description').textContent='Enter the site passcode to continue.';
  document.getElementById('heading-action').innerHTML='';document.getElementById('rail-person').textContent='Locked';document.getElementById('rail-initials').textContent='LV';
 }
 const root=document.getElementById('view');
 // Meaningful names for core inline labels retained by the render adapters.
 root.querySelectorAll('.edit-grid').forEach(grid=>grid.querySelectorAll('input,select').forEach(field=>{const label=field.previousElementSibling;if(label?.matches('.lab'))field.setAttribute('aria-label',label.textContent.trim());}));
 root.querySelectorAll('[data-act="sub"]').forEach(b=>b.setAttribute('aria-current',b.dataset.sub===ui.sub?'page':'false'));
 if(ui.tab==='manage'&&ui.sub==='features'){
  const sheet=root.querySelector('[data-chg="feature"][data-id="sheetSync"]');if(sheet){sheet.disabled=true;sheet.closest('.feature-row').querySelector('.f-desc').textContent='Disabled in the offline preview. Production synchronization is unchanged.';}
 }
};
