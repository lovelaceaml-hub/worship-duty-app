/* Runs inside the original song module closure. Original rendering and action
 * handlers remain authoritative; these wrappers only arrange their output. */
const psSongUi=()=>window.PrismUI;
function psSongStamp(html,date){
 const f=psSongUi().fragment(html),card=f.querySelector('.svc-card');
 if(card&&date){
  const d=new Date(date+'T12:00:00');
  card.classList.add('ps-song-service');
  card.insertAdjacentHTML('afterbegin','<div class="ps-service-stamp" aria-hidden="true"><span>'+esc(d.toLocaleDateString('en-US',{month:'short'}))+'</span><strong>'+d.getDate()+'</strong><small>'+esc(d.toLocaleDateString('en-US',{weekday:'short'}))+'</small></div>');
 }
 return card?.outerHTML||html;
}
const psScheduleCardBase=renderScheduleCard,psServiceCardBase=renderServiceCard;
renderScheduleCard=entry=>psSongStamp(psScheduleCardBase(entry),entry.date);
renderServiceCard=(sl,opts)=>psSongStamp(psServiceCardBase(sl,opts),sl.date);
const psSongHomeBase=renderHome;
renderHome=function(){
 const mine=myUpcomingSchedule(),planned=mine.filter(s=>(state.setlists[serviceIdFor(s.date,s.service)]?.songs||[]).length>0).length;
 const confirmed=mine.filter(s=>{const sl=state.setlists[serviceIdFor(s.date,s.service)];return sl&&isConfirmed(sl);}).length;
 const stats=psSongUi().stats([['Your upcoming services',mine.length,'From the reference duty roster'],['With songs selected',planned,'Continue in the Library'],['Confirmed setlists',confirmed,'Based on local song plans']]);
 return '<section data-ps-page="songs-home">'+psSongUi().section('Prepare for your next service','Your assigned services, song plans and readiness in one view.','PRESIDER / HOME')+stats+'<div class="ps-song-card-grid">'+psSongHomeBase()+'</div></section>';
};
const psInsightsBase=renderInsights;
renderInsights=function(){
 const f=psSongUi().fragment(psInsightsBase()),cards=[...f.children];
 cards.forEach((c,i)=>{c.classList.add('ps-insight-card');c.dataset.insight=['least','overdue','coverage','export','backfill','presiders'][i]||'other';});
 const sung=state.songs.filter(s=>statFor(s.id).timesSung>0).length,entries=state.songs.reduce((n,s)=>n+(statFor(s.id).history||[]).length,0);
 return '<section data-ps-page="songs-insights">'+psSongUi().section('A more thoughtful rotation','Song usage is based on this preview’s local history, not live congregation activity.','PRESIDER / INSIGHTS')+psSongUi().stats([['Songs in the library',state.songs.length,'Original repository catalog'],['Songs with sung history',sung,'Unique songs recorded'],['History entries',entries,'Including local backfills']])+'<div class="ps-insights-grid">'+cards.map(c=>c.outerHTML).join('')+'</div></section>';
};
const psRunsheetBase=renderRunsheet;
renderRunsheet=()=>'<section data-ps-page="songs-runsheet" class="ps-runsheet">'+psRunsheetBase()+'</section>';
const psSongGateBase=renderEditorGate;
renderEditorGate=()=>psSongUi().auth(psSongGateBase());
const psSongRenderBase=render;
render=function(){
 psSongRenderBase();if(!root)return;
 root.dataset.psPage=state.ui.editorGate?'songs-editor':state.ui.runsheet?'songs-runsheet':'songs-'+state.ui.tab;
 root.querySelectorAll('.card-head[data-song-act="toggle-service"]').forEach(el=>{
  el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-expanded',String(state.ui.expandedService===el.dataset.id));
 });
 const names={'ep-new':'New editor PIN','ep-confirm':'Repeat editor PIN','ep-input':'Editor PIN','bf-song':'Backfill song','bf-date':'Backfill date','new-presider-name':'New presider name'};
 Object.entries(names).forEach(([id,label])=>{const el=root.querySelector('#'+id);if(el)el.setAttribute('aria-label',label);});
};
// The underlying expanded service header was mouse-only; reuse its existing
// click handler for keyboard activation rather than implementing a second path.
document.addEventListener('keydown',e=>{
 const el=e.target.closest?.('#song-root .card-head[data-song-act="toggle-service"]');
 if(el&&e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();el.click();}
});
window.PrismSongInspect=()=>({tab:state.ui.tab,gate:state.ui.editorGate,runsheet:state.ui.runsheet,setlists:JSON.parse(JSON.stringify(state.setlists)),presiders:[...state.presiders]});
