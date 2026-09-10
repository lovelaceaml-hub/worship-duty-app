/* TEST ONLY. Route-injected in the browser; never part of .hosting-live/. */
const fixture=window.__designFixture;
const data=new Map(Object.entries(fixture.docs||{}));
for(const s of fixture.services)data.set('schedule/'+s.date+'_'+s.service.toLowerCase().replace(/ /g,'-'),structuredClone(s));
const listeners=[];
const clone=x=>x===undefined?undefined:structuredClone(x);
const snap=ref=>{
 if(ref.type==='collection'){
  let docs=[...data].filter(([p])=>p.startsWith(ref.path+'/')&&p.split('/').length===ref.path.split('/').length+1).map(([p,d])=>({id:p.split('/').pop(),data:()=>clone(d)}));
  return {empty:!docs.length,size:docs.length,docs,docChanges:()=>docs.map(doc=>({type:'added',doc})),forEach:fn=>docs.forEach(fn)};
 }
 const v=data.get(ref.path);return {id:ref.path.split('/').pop(),exists:()=>v!==undefined,data:()=>clone(v)};
};
window.__mockLive={writes:[],reads:[],listeners,emit(path,value){data.set(path,clone(value));for(const l of listeners)if(l.ref.path===path||path.startsWith(l.ref.path+'/'))l.cb(snap(l.ref));},get:path=>clone(data.get(path))};
export const getFirestore=()=>({test:true});
export const doc=(db,...parts)=>({type:'doc',path:parts.join('/')});
export const collection=(db,...parts)=>({type:'collection',path:parts.join('/')});
export const query=(ref,...filters)=>({...ref,filters});
export const where=(...args)=>args;
export function onSnapshot(ref,cb,error){const listener={ref,cb,error};listeners.push(listener);window.__mockLive.reads.push(ref.path);if(ref.path!=='app/settings'||!fixture.holdSettings)setTimeout(()=>cb(snap(ref)),10);return()=>{const i=listeners.indexOf(listener);if(i>=0)listeners.splice(i,1);};}
export async function setDoc(ref,value,opts){window.__mockLive.writes.push({path:ref.path,op:'set',value:clone(value)});const v=opts?.merge?{...data.get(ref.path),...value}:value;window.__mockLive.emit(ref.path,v);}
export async function updateDoc(ref,value){return setDoc(ref,value,{merge:true});}
export async function deleteDoc(ref){window.__mockLive.writes.push({path:ref.path,op:'delete'});data.delete(ref.path);for(const l of listeners)if(l.ref.path===ref.path||ref.path.startsWith(l.ref.path+'/'))l.cb(snap(l.ref));}
export const getDoc=async ref=>snap(ref);
export const getDocs=async ref=>snap(ref);
export const writeBatch=()=>{const jobs=[];return {set:(...a)=>jobs.push(()=>setDoc(...a)),delete:(...a)=>jobs.push(()=>deleteDoc(...a)),update:(...a)=>jobs.push(()=>updateDoc(...a)),commit:async()=>{for(const fn of jobs)await fn();}};};
export const runTransaction=async(db,fn)=>fn({get:getDoc,set:setDoc,update:updateDoc,delete:deleteDoc});
export const arrayUnion=(...args)=>args;
export const arrayRemove=(...args)=>args;
export const increment=n=>n;
