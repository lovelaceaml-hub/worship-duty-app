import {CATEGORIES, DEPARTMENTS_SEED, DATA_KEY, unifiedNameMap} from './constants.js';
import {svcId} from './format.js';
import {isVerifiedSession, isForcedSession} from './auth.js';
import {addBanner, renderSoon} from './notify.js';
import {safeAuthMessage, authCall} from './session.js';

export let state = { members: [], services: [], settings: { features: {}, pinHash: '' }, departments: {}, requests: [] };
// Whole-object reassignment, not just mutation (init(), initFirebase(),
// handleAct() and handleChg() all replace state entirely on data load,
// backup restore or reset to seed). An ES import binding cannot be assigned
// from outside its owning module, so every such site becomes a setState()
// call; each substitution is named in scripts/check-app-split.allow.json.
export function setState(value) { state = value; }
export function setFb(value) { fb = value; }
export function setAuthReady(value) { authReady = value; }
export function setAuthStatus(value) { authStatus = value; }
export function setDepartmentsLoaded(value) { departmentsLoaded = value; }
export function setMembersLoaded(value) { membersLoaded = value; }
export function setAuthUser(value) { authUser = value; }
export function setRequestUnsub(value) { requestUnsub = value; }
// Named distinctly from core/session.js's own higher-level setVerifiedSession
// (which does much more than assign this one binding): this is only the raw
// state.js-owned reassignment core/session.js needs.
export function setVerifiedSessionRef(value) { verifiedSession = value; }
export let fb = null; // { db, auth, functions, setDoc, doc, deleteDoc, writeBatch, collection }
export let authReady = Promise.resolve(null);
export let authUser = null;
export let verifiedSession = null;
export let authStatus = 'loading';
export let requestUnsub = null;
export function fbWrite(fn) {
  if (fb && (!isVerifiedSession() || isForcedSession())) {
    return Promise.reject(new Error('A verified member session is required for this action.'));
  }
  return authReady.then(fn);
}
export let settingsLoaded = false; // true once shared settings arrived (or local mode)
export let departmentsLoaded = false; // true once the departments doc arrived (or local mode)
export let membersLoaded = false; // true once the members doc arrived (or local mode)
export const ui = {
  tab: 'schedule',
  sub: 'services',
  me: '',
  loginMember: '',
  manageDept: 'All',
  departmentView: 'list',
  departmentMember: '',
  departmentSearch: null,
  deptFilter: (function () {
    const v = localStorage.getItem('wds-dept') || 'All';
    return v === 'All' || CATEGORIES.some(c => c.name === v) ? v : 'All';
  })(),
  expanded: {},
  showPast: false,
  banners: [],
  pinError: '',
  sitePinError: '',
  authError: '',
  authBusy: false,
  rebaseline: false,
  syncing: false,
  reqForm: null, // { key, note } - in-progress "request a change" draft, survives re-render
  songSvc: null, // svcId deep-link target for the song picker (ui.tab === 'songs')
  songNav: false // one-shot: this render is an explicit navigation into the song picker (tab or button), not a background re-mount
};
export const departmentRuntime = {
  rosters: Object.create(null),
  ownProfiles: Object.create(null),
  ownLoading: false,
  ownLoaded: false,
  ownError: '',
  loading: Object.create(null),
  errors: Object.create(null),
  drafts: Object.create(null),
  assignmentBusy: Object.create(null)
};
export function seedState() {
  return JSON.parse(JSON.stringify({
    members: window.SEED_DATA.members,
    services: window.SEED_DATA.services,
    settings: { features: {}, pinHash: '' },
    departments: DEPARTMENTS_SEED,
    requests: []
  }));
}
export function saveLocal() { localStorage.setItem(DATA_KEY, JSON.stringify(state)); }
export function loadLocal() {
  try {
    const obj = JSON.parse(localStorage.getItem(DATA_KEY));
    if (obj && Array.isArray(obj.members) && Array.isArray(obj.services)) {
      if (!obj.settings) obj.settings = { features: {}, pinHash: '' };
      if (!obj.departments) obj.departments = {};
      if (!Array.isArray(obj.requests)) obj.requests = [];
      return obj;
    }
  } catch (e) { /* ignore */ }
  return null;
}
export function canonicalMemberName(name) {
  const value = String(name == null ? '' : name).trim();
  return value ? (unifiedNameMap()[value] || value) : '';
}
export function canonicalizeStateNames() {
  const canon = canonicalMemberName;
  const members = [];
  (state.members || []).forEach(member => {
    const name = canon(member);
    if (name && members.indexOf(name) === -1) members.push(name);
  });
  state.members = members.sort();
  (state.services || []).forEach(service => {
    const assignments = service.assignments || {};
    Object.keys(assignments).forEach(duty => { assignments[duty] = canon(assignments[duty]); });
    const conflictOk = service.conflictOk || {};
    const merged = {};
    Object.keys(conflictOk).forEach(name => {
      const key = canon(name);
      merged[key] = (merged[key] || []).concat(conflictOk[name] || []);
    });
    if (Object.keys(merged).length) service.conflictOk = merged;
  });
  Object.keys(state.departments || {}).forEach(department => {
    const seen = {};
    state.departments[department] = (state.departments[department] || [])
      .map(canon).filter(name => name && !seen[name] && (seen[name] = true)).sort();
  });
  (state.requests || []).forEach(request => {
    request.name = canon(request.name);
    request.resolvedBy = canon(request.resolvedBy);
  });
  if (state.settings && state.settings.schedulerName) {
    state.settings.schedulerName = canon(state.settings.schedulerName);
  }
}
export function persistService(svc) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'schedule', svcId(svc)), svc)).catch(error => {
    addBanner('The service change was not saved: ' + safeAuthMessage(error), true);
    renderSoon();
  });
  else saveLocal();
}
export function persistDeleteService(id) {
  if (fb) fbWrite(() => fb.deleteDoc(fb.doc(fb.db, 'schedule', id))).catch(error => {
    addBanner('The service was not deleted: ' + safeAuthMessage(error), true);
    renderSoon();
  });
  else saveLocal();
}
export function persistMembers() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'members'), { list: state.members })).catch(() => {});
  else saveLocal();
}
export function persistSettings() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'settings'), state.settings)).catch(() => {});
  else saveLocal();
}
export function persistDepartments() {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'departments'), { map: state.departments })).catch(() => {});
  else saveLocal();
}
export function persistDepartmentMembership(department, memberName, status) {
  if (!fb) { saveLocal(); return Promise.resolve({ ok: true }); }
  return authCall('updateDepartmentMembership', { department, memberName, status });
}
export function persistNameMap(map) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'app', 'nameMap'), { map: map })).catch(() => {});
}
export function persistRequest(req) {
  if (fb) fbWrite(() => fb.setDoc(fb.doc(fb.db, 'requests', req.id), req)).catch(error => {
    addBanner('The request change was not saved: ' + safeAuthMessage(error), true);
    renderSoon();
  });
  else saveLocal();
}
export function resolveRequest(id, status) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  req.status = status;
  req.resolvedAt = Date.now();
  req.resolvedByUid = (authUser && authUser.uid) || '';
  req.resolvedByName = ui.me || '';
  req.resolvedBy = req.resolvedByUid;
  persistRequest(req);
}
export function persistAll() {
  if (!fb) { saveLocal(); return; }
  // Collect every write as a thunk, then commit in chunks, a full seed or a
  // large import can exceed Firestore's 500-op single-batch cap.
  const ops = [];
  const keep = {};
  state.services.forEach(svc => {
    const id = svcId(svc);
    keep[id] = true;
    ops.push(b => b.set(fb.doc(fb.db, 'schedule', id), svc));
  });
  (fb.knownIds || []).forEach(id => { if (!keep[id]) ops.push(b => b.delete(fb.doc(fb.db, 'schedule', id))); });
  ops.push(b => b.set(fb.doc(fb.db, 'app', 'members'), { list: state.members }));
  ops.push(b => b.set(fb.doc(fb.db, 'app', 'settings'), state.settings));
  ops.push(b => b.set(fb.doc(fb.db, 'app', 'departments'), { map: state.departments }));
  for (let i = 0; i < ops.length; i += 450) {
    const chunk = ops.slice(i, i + 450);
    fbWrite(() => {
      const batch = fb.writeBatch(fb.db);
      chunk.forEach(fn => fn(batch));
      return batch.commit();
    }).catch(() => {});
  }
}
