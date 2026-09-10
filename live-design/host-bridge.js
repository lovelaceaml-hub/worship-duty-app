/* Compiled into the existing app module. One state, one Firebase handle,
 * original permissions/writes, and two interchangeable presentation layers. */
if (window.WorshipDesign) {
  const design = window.WorshipDesign;
  const originals = {renderSchedule,renderMy,renderManageServices,renderManagePlanning,
    renderManageRequests,renderManagePeople,renderFeatures,renderManageData,
    renderSiteLock,renderUnlock,renderCreatePin};
  let prismPaint;
  {
    const aui={month:todayISO().slice(0,7),day:'',service:'',mode:'day',query:''};
    /* PRISM_HELPERS */
    function decorate(){
      document.body.dataset.screen=ui.tab;
      document.getElementById('rail-person').textContent=ui.me||'Choose your name';
      document.getElementById('rail-initials').textContent=selectedInitials(ui.me);
      document.querySelectorAll('nav.tabs button').forEach(b=>{
        const key=b.dataset.tab,dot=b.querySelector('.dot')?'<span class="dot"></span>':'';
        b.innerHTML=ai(key)+'<span>'+({schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'}[key])+'</span>'+dot;
        if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      });
    }
    /* PRISM_VIEWS */
    /* ALL_PAGES */
    prismPaint=decorate;
    function jump(id){
      const s=state.services.find(s=>svcId(s)===id);if(!s)return;
      aui.month=s.date.slice(0,7);aui.day=s.date;aui.service=id;aui.mode='day';aui.query='';ui.deptFilter='All';
      if(s.date<todayISO())ui.showPast=true;ui.tab='schedule';render();
    }
    document.addEventListener('click',e=>{
      if(!design.isPrism())return;
      const b=e.target.closest('[data-aurora]');if(!b)return;
      const act=b.dataset.aurora;
      if(act==='month'){const d=new Date(aui.month+'-01T12:00:00');d.setMonth(d.getMonth()+Number(b.dataset.step));aui.month=toISO(d).slice(0,7);aui.day='';aui.query='';render();}
      if(act==='service'){aui.service=b.dataset.id;render();}
      if(act==='mode'){aui.mode=b.dataset.mode;aui.query='';render();}
      if(act==='reference-month'){aui.month=todayISO().slice(0,7);aui.day='';aui.service='';aui.query='';render();}
      if(act==='clear-filters'){aui.query='';ui.deptFilter='All';render();}
      if(act==='jump-service')jump(b.dataset.id);
      if(act==='edit'){ui.tab='manage';ui.sub='services';ui.expanded['m:'+b.dataset.id]=true;render();}
      if(act==='theme'){document.body.classList.toggle('dark');try{localStorage.setItem('wds-prism-palette',document.body.classList.contains('dark')?'dark':'light');}catch{}}
      if(act==='motion'){document.body.classList.toggle('still');const off=document.body.classList.contains('still');b.textContent=off?'▷':'Ⅱ';b.setAttribute('aria-label',off?'Enable animation':'Pause animation');try{localStorage.setItem('wds-prism-motion',off?'off':'on');}catch{}}
    });
    document.addEventListener('change',e=>{
      if(!design.isPrism())return;
      if(e.target.id==='a-department'){ui.deptFilter=e.target.value;localStorage.setItem('wds-dept',ui.deptFilter);render();}
      if(e.target.id==='a-past'){ui.showPast=e.target.checked;render();}
    });
    document.addEventListener('input',e=>{
      if(!design.isPrism()||e.target.id!=='a-search')return;
      aui.query=e.target.value;e.target.blur();render();document.getElementById('a-search')?.focus();
    });
  }
  const variants={renderSchedule,renderMy,renderManageServices,renderManagePlanning,
    renderManageRequests,renderManagePeople,renderFeatures,renderManageData,
    renderSiteLock,renderUnlock,renderCreatePin};
  /* SELECT_RENDERERS */
  const classicRoot=document.querySelector('.wrap');
  const classicClass=document.body.className;
  const template=document.createElement('template'); template.innerHTML=/* LIVE_SHELL */;
  const prismRoot=template.content.firstElementChild;
  const parts={view:document.getElementById('view'),banners:document.getElementById('banners'),nav:document.querySelector('nav.tabs'),sync:document.getElementById('sync-pill')};
  const classicSlots={};
  const classicNames={schedule:'Schedule',my:'My Duties',songs:'Presider',manage:'Manage'};
  Object.entries(parts).forEach(([key,node])=>{const anchor=document.createElement('span');anchor.dataset.designSlot=key;node.before(anchor);classicSlots[key]=anchor;});
  let prismSlots={};prismRoot.querySelectorAll('[data-design-slot]').forEach(n=>prismSlots[n.dataset.designSlot]=n);
  const isAccessible=()=>__designSettingsReady && (!feat('siteLock')||siteUnlocked());
  function fieldKey(el){return el.id || [el.tagName,el.name,JSON.stringify({...el.dataset})].join('|');}
  function saveFields(){
    const index=new Map();
    return [...parts.view.querySelectorAll('input:not([type=file]),textarea,select')].map(el=>{
      const key=fieldKey(el),n=index.get(key)||0;index.set(key,n+1);
      return {key,n,value:el.value,checked:el.checked};
    });
  }
  function restoreFields(fields){
    const index=new Map();
    for(const el of parts.view.querySelectorAll('input:not([type=file]),textarea,select')){
      const key=fieldKey(el),n=index.get(key)||0;index.set(key,n+1);
      const match=fields.find(f=>f.key===key&&f.n===n);if(!match)continue;
      el.value=match.value;if('checked' in el)el.checked=match.checked;
    }
  }
  const coreRender=render;
  render=function(){
    coreRender();
    if(design.isPrism())prismPaint();
    design.afterRender();
  };
  design.configure({
    ready:isAccessible,
    async apply(mode){
      const fields=saveFields(),prism=mode==='prism';
      if(prism){
        classicRoot.replaceWith(prismRoot);
        for(const [key,node]of Object.entries(parts))prismSlots[key].after(node);
        document.body.className=classicClass+' aurora prism';
        try{document.body.classList.toggle('dark',localStorage.getItem('wds-prism-palette')==='dark');document.body.classList.toggle('still',localStorage.getItem('wds-prism-motion')==='off');}catch{}
      }else{
        prismRoot.replaceWith(classicRoot);
        for(const [key,node]of Object.entries(parts))classicSlots[key].after(node);
        document.body.className=classicClass;
        delete document.body.dataset.screen;delete document.body.dataset.psPage;
        parts.nav.querySelectorAll('button').forEach(b=>b.textContent=classicNames[b.dataset.tab]||b.textContent);
      }
      document.getElementById('wd-prism-css').media=prism?'all':'not all';
      // A same-document switch keeps the song module, live listeners and pending
      // requests alive. Rerender only the view, then restore unsubmitted fields.
      render(); await new Promise(resolve=>requestAnimationFrame(resolve));
      restoreFields(fields);
    }
  });
}
