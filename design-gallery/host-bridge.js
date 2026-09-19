/* Compiled into the existing app module. One live state, one Firebase handle,
 * one set of domain handlers, four interchangeable presentations. */
if (window.WorshipDesign) {
  const design = window.WorshipDesign;
  const originals = {renderSchedule,renderMy,renderManage,renderManageServices,renderManagePlanning,
    renderManageRequests,renderManagePeople,renderFeatures,renderManageData,renderSiteLock};

  let prismPaint;
  {
    const aui={month:todayISO().slice(0,7),day:'',service:'',mode:'day',query:'',manual:false};
    /* PRISM_HELPERS */
    function decorate(){
      document.body.dataset.screen=ui.tab;
      document.querySelectorAll('nav.tabs button').forEach(b=>{
        const key=b.dataset.tab,dot=b.querySelector('.dot')?'<span class="dot"></span>':'';
        b.innerHTML=ai(key)+'<span>'+({schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'}[key])+'</span>'+dot;
        if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      });
    }
    /* PRISM_VIEWS */
    /* PRISM_ALL_PAGES */
    prismPaint=decorate;
    function prismJump(id){
      const s=state.services.find(s=>svcId(s)===id);if(!s)return;
      aui.month=s.date.slice(0,7);aui.day=s.date;aui.service=id;aui.manual=true;aui.mode='day';aui.query='';ui.deptFilter='All';
      if(s.date<todayISO())ui.showPast=true;ui.tab='schedule';render();
    }
    document.addEventListener('click',e=>{
      if(!design.isPrism())return;
      const b=e.target.closest('[data-aurora],[data-prism]');if(!b)return;
      const act=b.dataset.aurora||b.dataset.prism;
      if(act==='month'){const d=new Date(aui.month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(b.dataset.step));aui.month=toISO(d).slice(0,7);aui.day='';aui.service='';aui.manual=true;aui.query='';render();}
      if(act==='day'||act==='date'){aui.day=b.dataset.date;aui.service='';aui.manual=true;aui.mode='day';aui.query='';render();}
      if(act==='service'){aui.service=b.dataset.id;aui.manual=true;render();}
      if(act==='mode'){aui.mode=b.dataset.mode;aui.query='';render();}
      if(act==='reference-month'){aui.month=todayISO().slice(0,7);aui.day='';aui.service='';aui.manual=false;aui.query='';render();}
      if(act==='clear-filters'){aui.query='';ui.deptFilter='All';render();}
      if(act==='jump-service')prismJump(b.dataset.id);
      if(act==='edit'&&isVerifiedSession()&&!isForcedSession()&&canManageAnyDepartment()){ui.tab='manage';ui.sub='services';ui.expanded['m:'+b.dataset.id]=true;render();}
    });
    document.addEventListener('change',e=>{
      if(!design.isPrism())return;
      if(e.target.id==='a-department'){ui.deptFilter=e.target.value;try{localStorage.setItem('wds-dept',ui.deptFilter);}catch{}render();}
      if(e.target.id==='a-past'){ui.showPast=e.target.checked;render();}
    });
    document.addEventListener('input',e=>{
      if(!design.isPrism()||e.target.id!=='a-search')return;
      aui.query=e.target.value;const pos=e.target.selectionStart;e.target.blur();render();const n=document.getElementById('a-search');n?.focus();try{if(n&&pos!=null)n.setSelectionRange(pos,pos);}catch{}
    });
    document.addEventListener('keydown',e=>{
      if(!design.isPrism()||e.key!=='/'||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      const el=document.getElementById('a-search');if(el){e.preventDefault();el.focus();}
    });
  }
  const prismVariants={renderSchedule,renderMy,renderManageServices,renderManagePlanning,
    renderManageRequests,renderManagePeople,renderFeatures,renderManageData,renderSiteLock};

  let auroraPaint, auroraVariants;
  {
    const A={storageAvailable:true};
    const aui={month:todayISO().slice(0,7),day:'',service:'',mode:'day',query:'',manual:false};
    let renderSchedule=originals.renderSchedule,renderMy=originals.renderMy,renderManage=originals.renderManage;
    /* AURORA_CORE */
    /* AURORA_DECORATE */
    /* AURORA_WORKSPACES */
    auroraPaint=decorate;
    auroraVariants={renderSchedule,renderMy,renderManage};
    function auroraJump(id){
      const s=state.services.find(s=>svcId(s)===id);if(!s)return;
      aui.month=s.date.slice(0,7);aui.day=s.date;aui.service=id;aui.manual=true;aui.mode='day';aui.query='';ui.deptFilter='All';
      if(s.date<todayISO())ui.showPast=true;ui.tab='schedule';render();
    }
    document.addEventListener('click',e=>{
      if(!design.isAurora())return;
      const b=e.target.closest('[data-aurora]');if(!b)return;
      const act=b.dataset.aurora;
      if(act==='month'){const d=new Date(aui.month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(b.dataset.step));aui.month=toISO(d).slice(0,7);aui.day='';aui.service='';aui.manual=true;aui.query='';render();}
      if(act==='day'){aui.day=b.dataset.date;aui.service='';aui.manual=true;aui.mode='day';aui.query='';render();}
      if(act==='service'){aui.service=b.dataset.id;aui.manual=true;render();}
      if(act==='mode'){aui.mode=b.dataset.mode;aui.query='';render();}
      if(act==='reference-month'){aui.month=todayISO().slice(0,7);aui.day='';aui.service='';aui.manual=false;aui.query='';render();}
      if(act==='clear-filters'){aui.query='';ui.deptFilter='All';render();}
      if(act==='jump-service')auroraJump(b.dataset.id);
      if(act==='edit'&&isVerifiedSession()&&!isForcedSession()&&canManageAnyDepartment()){ui.tab='manage';ui.sub='services';ui.expanded['m:'+b.dataset.id]=true;render();requestAnimationFrame(()=>document.querySelector('[data-id="m:'+b.dataset.id+'"]')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}
    });
    document.addEventListener('change',e=>{
      if(!design.isAurora())return;
      if(e.target.id==='a-department'){ui.deptFilter=e.target.value;try{localStorage.setItem('wds-dept',ui.deptFilter);}catch{}render();}
      if(e.target.id==='a-past'){ui.showPast=e.target.checked;render();}
    });
    document.addEventListener('input',e=>{
      if(!design.isAurora()||e.target.id!=='a-search')return;
      aui.query=e.target.value;const pos=e.target.selectionStart;e.target.blur();render();const n=document.getElementById('a-search');n?.focus();try{if(n&&pos!=null)n.setSelectionRange(pos,pos);}catch{}
    });
    document.addEventListener('keydown',e=>{
      if(!design.isAurora()||e.key!=='/'||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      const el=document.getElementById('a-search');if(el){e.preventDefault();el.focus();}
    });
  }

  /* NAVY_ADAPTER */

  renderSchedule=function(...args){return (design.isPrism()?prismVariants.renderSchedule:design.isAurora()?auroraVariants.renderSchedule:originals.renderSchedule)(...args);};
  renderMy=function(...args){return (design.isPrism()?prismVariants.renderMy:design.isAurora()?auroraVariants.renderMy:originals.renderMy)(...args);};
  renderManage=function(...args){return (design.isAurora()?auroraVariants.renderManage:originals.renderManage)(...args);};
  renderManageServices=function(...args){return (design.isPrism()?prismVariants.renderManageServices:originals.renderManageServices)(...args);};
  renderManagePlanning=function(...args){return (design.isPrism()?prismVariants.renderManagePlanning:originals.renderManagePlanning)(...args);};
  renderManageRequests=function(...args){return (design.isPrism()?prismVariants.renderManageRequests:originals.renderManageRequests)(...args);};
  renderManagePeople=function(...args){return (design.isPrism()?prismVariants.renderManagePeople:originals.renderManagePeople)(...args);};
  renderFeatures=function(...args){return (design.isPrism()?prismVariants.renderFeatures:originals.renderFeatures)(...args);};
  renderManageData=function(...args){return (design.isPrism()?prismVariants.renderManageData:originals.renderManageData)(...args);};
  renderSiteLock=function(...args){return (design.isPrism()?prismVariants.renderSiteLock:originals.renderSiteLock)(...args);};

  const classicRoot=document.querySelector('.wrap');
  const classicClass=document.body.className;
  const parts={view:document.getElementById('view'),banners:document.getElementById('banners'),nav:document.querySelector('nav.tabs'),sync:document.getElementById('sync-pill')};
  const classicSlots={};
  Object.entries(parts).forEach(([key,node])=>{const anchor=document.createElement('span');anchor.dataset.designSlot=key;node.before(anchor);classicSlots[key]=anchor;});
  function makeRoot(markup){const t=document.createElement('template');t.innerHTML=markup.trim();const root=t.content.firstElementChild,slots={};root.querySelectorAll('[data-design-slot]').forEach(n=>slots[n.dataset.designSlot]=n);return {root,slots};}
  const prism=makeRoot(/* PRISM_SHELL */);
  const aurora=makeRoot(/* AURORA_SHELL */);
  const roots={classic:{root:classicRoot,slots:classicSlots},navy:{root:classicRoot,slots:classicSlots},prism,aurora};
  let currentRoot=classicRoot;
  const classicNames={schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'};
  const isAccessible=()=>__designSettingsReady&&(!feat('siteLock')||siteUnlocked())&&isVerifiedSession()&&!isForcedSession();
  let auroraCatalogLoading=null;
  function ensureAuroraCatalog(){
    if(window.SONG_SEED?.songs)return Promise.resolve();
    if(auroraCatalogLoading)return auroraCatalogLoading;
    const script=document.createElement('script');script.src='song-seed.js'+ASSET_V;
    auroraCatalogLoading=loadTag(script).then(()=>{
      if(!window.SONG_SEED?.songs)throw new Error('Aurora song catalog did not load.');
    }).catch(err=>{auroraCatalogLoading=null;throw err;});
    return auroraCatalogLoading;
  }

  function fieldKey(el){return el.id||[el.tagName,el.name,JSON.stringify({...el.dataset})].join('|');}
  function saveFields(){const index=new Map();return [...parts.view.querySelectorAll('input:not([type=file]),textarea,select')].map(el=>{const key=fieldKey(el),n=index.get(key)||0;index.set(key,n+1);return {key,n,value:el.value,checked:el.checked};});}
  function restoreFields(fields){const index=new Map();for(const el of parts.view.querySelectorAll('input:not([type=file]),textarea,select')){const key=fieldKey(el),n=index.get(key)||0;index.set(key,n+1);const match=fields.find(f=>f.key===key&&f.n===n);if(!match)continue;el.value=match.value;if('checked'in el)el.checked=match.checked;}}
  function mount(target){
    const targetRoot=roots[target].root;
    if(currentRoot!==targetRoot){currentRoot.replaceWith(targetRoot);currentRoot=targetRoot;}
    for(const [key,node]of Object.entries(parts)){const slot=roots[target].slots[key];if(slot)slot.after(node);}
  }
  function restoreClassicChrome(){
    document.body.className=classicClass;delete document.body.dataset.screen;delete document.body.dataset.psPage;delete document.body.dataset.awScreen;
    parts.nav.querySelectorAll('button[data-tab]').forEach(b=>{const dot=b.querySelector('.dot')?'<span class="dot"></span>':'';b.innerHTML=(classicNames[b.dataset.tab]||b.textContent)+dot;b.removeAttribute('aria-current');});
  }
  function liveContext(){
    const toView=svc=>({id:svcId(svc),date:svc.date,time:svc.time,service:svc.service,worship:svc.worship,choirSong:svc.choirSong||'',assignments:{...svc.assignments}});
    const up=upcomingServices();let entries=up.concat(feat('pastServices')&&ui.showPast?pastServices().slice().reverse():[]);
    if(ui.deptFilter!=='All')entries=entries.filter(s=>categoryHasAssignments(s,ui.deptFilter));
    const next=ui.me?dutiesFor(ui.me)[0]:null;
    const manageable=ui.tab==='manage'&&isVerifiedSession()&&!isForcedSession()&&canManageAnyDepartment();
    const manageDepartment=manageable?selectedManageDepartment():'';
    const managed=manageable&&manageDepartment&&manageDepartment!=='All'?up.filter(manageServiceVisible):up;
    const roster=manageDepartment&&manageDepartment!=='All'?(state.departments?.[manageDepartment]||[]):[];
    const scopedAssignments=service=>Object.entries(service.assignments||{})
      .filter(([duty,name])=>manageDepartment==='All'||actionableDepartmentForDuty(duty)===manageDepartment||roster.indexOf(name)!==-1)
      .map(([,name])=>name).filter(Boolean);
    const assigned=(manageable?managed:up).flatMap(service=>manageable?scopedAssignments(service):Object.values(service.assignments||{}).filter(Boolean));
    const canEdit=manageable;
    return {ready:isAccessible(),tab:ui.tab,sub:ui.sub,today:todayISO(),member:ui.me,entries:entries.map(toView),canEdit,nextDuty:next?{duty:next.duty,svc:toView(next.svc)}:null,stats:{services:manageable?managed.length:up.length,assignments:assigned.length,people:new Set(assigned).size}};
  }

  /* Dark mode follows the device (prefers-color-scheme) and updates live. Only
   * Prism and Aurora have a reviewed dark variant, so only they receive the
   * `dark` class. Motion follows prefers-reduced-motion inside each stylesheet.
   * The old manual dark and pause buttons are gone; their saved choices are
   * cleared here so nothing can hold a member in a forced mode. */
  const systemDark=window.matchMedia('(prefers-color-scheme: dark)');
  function syncSystemScheme(){
    const themed=design.isPrism()||design.isAurora();
    document.body.classList.toggle('dark',themed&&systemDark.matches);
    document.body.classList.remove('still');
  }
  try{['wds-prism-palette','wds-prism-motion','wds-aurora-palette','wds-aurora-motion'].forEach(key=>localStorage.removeItem(key));}catch{}
  if(systemDark.addEventListener)systemDark.addEventListener('change',syncSystemScheme);else systemDark.addListener?.(syncSystemScheme);

  const coreRender=render;
  render=function(){
    coreRender();
    if(design.isPrism())prismPaint();
    else if(design.isAurora())auroraPaint();
    else if(design.isNavy())NavyDesign.paint(isAccessible()?liveContext():{ready:false,tab:ui.tab,sub:ui.sub});
    design.afterRender();
  };

  design.configure({
    ready:isAccessible,
    async apply(next,old){
      const fields=saveFields();
      if(old==='navy')NavyDesign.leave();
      if(next==='prism'){
        mount('prism');document.body.className=classicClass+' aurora prism';syncSystemScheme();
      } else if(next==='aurora'){
        await ensureAuroraCatalog();
        mount('aurora');document.body.className=classicClass+' aurora';syncSystemScheme();
      } else {
        mount(next==='navy'?'navy':'classic');restoreClassicChrome();
        if(next==='navy'){
          document.documentElement.dataset.ncScheme='light';document.documentElement.dataset.ncMotion='auto';
        } else {delete document.documentElement.dataset.ncScreen;delete document.documentElement.dataset.ncScheme;delete document.documentElement.dataset.ncMotion;}
      }
      render();await new Promise(resolve=>requestAnimationFrame(resolve));restoreFields(fields);
    }
  });
}
