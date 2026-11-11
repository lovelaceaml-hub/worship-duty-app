/* The roster cache: each department's loaded member profiles, the edits a
   leader has not saved yet, and the reading of both from the server. A
   roster is read again once it is two minutes old, and right before Fill, so
   changes made on other devices (a member's day off, the nightly job,
   another leader) reach an open app. Everything that changes a profile is in
   departments.js. */
import { fb, call, problem } from '../firebase.js';
import { ui, session, readJSON } from '../store.js';
import { renderSoon } from '../render.js';
import { DEPARTMENTS } from '../config/duties.js';
import { normalizeProfile, normalizeAvailability } from '../lib/availability.js';
import { serviceId } from '../lib/services.js';

const FRESH_MS = 2 * 60 * 1000;   // a roster older than this is read again
const RETRY_MS = 20 * 1000;       // a roster that did not load is tried again after this

/* Loaded rosters and in-progress edits, cleared when the member changes. */
export const departments = {
  rosters: {},     // department -> [profile]
  loadedAt: {},    // department -> when it was last read (or tried)
  loading: {},     // department -> promise
  errors: {},      // department -> message, while no roster could be read
  own: null,       // [profile] for the signed-in member, once loaded
  ownLoading: null,
  ownError: '',
  drafts: {},      // 'department::uid' -> unsaved changes (see draftOf)
  busy: {},        // 'default::duty', 'profile::department::uid', 'request::id' -> true while it saves
  search: null,    // { department, query, page, members, total, busy, error, adding }
  invites: {},     // department -> [{ token, expiresAt }] made on this device
  addingAll: false,// "Add all" in a department's "Not on the list yet"
  choices: {}      // 'request::id' or 'replace::serviceId|duty' -> what the leader picked
};

/* A new member (or none) starts with nothing: no rosters, edits, saves in
   flight or planner proposals of the one before. */
export function resetDepartments() {
  Object.assign(departments, { rosters: {}, loadedAt: {}, loading: {}, errors: {}, own: null, ownLoading: null, ownError: '', drafts: {}, busy: {}, search: null, addingAll: false, choices: {} });
  departments.invites = readJSON('wds-invites', {});
  Object.assign(ui.plan, { open: '', proposals: {}, scope: null, unfilled: {}, skipped: {}, saving: {}, busy: false });
}

export const key = (department, uid) => department + '::' + uid;
export const code = error => String(error && error.code || '').replace(/^functions\//, '');

export function roster(department) { return departments.rosters[department] || []; }

/* Whether a department's roster has loaded. A loaded roster can be empty. */
export function rosterLoaded(department) { return Array.isArray(departments.rosters[department]); }

export function profileOf(department, uid) {
  return roster(department).find(profile => profile.memberUid === uid) ||
    (departments.own || []).find(profile => profile.departmentId === department && profile.memberUid === uid) || null;
}

/* Names are matched as stored: two members can share a display name. */
export function profileNamed(department, name) {
  return roster(department).find(profile => profile.memberName === name) || null;
}

/* ---- unsaved edits ---- */

/* An availability edit: { week: key, value }, { day: date, key, status } or
   { remove: date, key }. Kept one by one and laid over the latest profile,
   so a day off the member added meanwhile is not lost. */
function applyEdits(availability, edits) {
  const out = normalizeAvailability(availability);
  (edits || []).forEach(edit => {
    if (edit.week) out.recurring[edit.week] = edit.value;
    else if (edit.day) out.exceptions[edit.day] = Object.assign({}, out.exceptions[edit.day], { [edit.key]: edit.status });
    else if (edit.remove && out.exceptions[edit.remove]) {
      delete out.exceptions[edit.remove][edit.key];
      if (!Object.keys(out.exceptions[edit.remove]).length) delete out.exceptions[edit.remove];
    }
  });
  return out;
}

/* The profile with any unsaved edits applied. */
export function draftOf(department, uid) {
  const profile = profileOf(department, uid);
  const draft = departments.drafts[key(department, uid)];
  if (!profile || !draft) return profile;
  const { edits, ...fields } = draft;
  return Object.assign({}, profile, fields, { availability: applyEdits(profile.availability, edits) });
}

export function hasDraft(department, uid) { return !!departments.drafts[key(department, uid)]; }

/* Change the duties they can take or whether they can be scheduled. */
export function editDraft(department, uid, patch) {
  departments.drafts[key(department, uid)] = Object.assign({}, departments.drafts[key(department, uid)], patch);
  renderSoon();
}

export function editAvailability(department, uid, edit) {
  const draft = departments.drafts[key(department, uid)] || {};
  departments.drafts[key(department, uid)] = Object.assign({}, draft, { edits: (draft.edits || []).concat(edit) });
  renderSoon();
}

export function dropDraft(department, uid) {
  delete departments.drafts[key(department, uid)];
  renderSoon();
}

export function store(profile, { keepDraft = false } = {}) {
  const clean = normalizeProfile(profile, profile && (profile.departmentId || profile.department));
  if (!clean) return null;
  const list = departments.rosters[clean.departmentId];
  if (list) {
    const at = list.findIndex(item => item.memberUid === clean.memberUid);
    if (at === -1) list.push(clean); else list[at] = clean;
    list.sort((a, b) => a.memberName.localeCompare(b.memberName));
  }
  if (departments.own) {
    const at = departments.own.findIndex(item => item.departmentId === clean.departmentId && item.memberUid === clean.memberUid);
    if (at !== -1) departments.own[at] = clean;
  }
  if (!keepDraft) delete departments.drafts[key(clean.departmentId, clean.memberUid)];
  return clean;
}

/* ---- loading ---- */

export function loadRoster(department, force = false) {
  if (!department || department === 'All' || session.status !== 'verified') return Promise.resolve([]);
  if (departments.loading[department]) return departments.loading[department];
  const have = rosterLoaded(department);
  const age = Date.now() - (departments.loadedAt[department] || 0);
  if (!force && have && age < FRESH_MS) return Promise.resolve(departments.rosters[department]);
  if (!force && !have && departments.errors[department] && age < RETRY_MS) return Promise.resolve([]);
  const before = have ? JSON.stringify(departments.rosters[department]) : '';
  const request = call('listDepartmentRoster', { departmentId: department }).then(result => {
    if (!result || result.departmentId !== department || !Array.isArray(result.members)) throw new Error('The roster did not load.');
    departments.rosters[department] = result.members.map(profile => normalizeProfile(profile, department)).filter(Boolean)
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
    departments.errors[department] = '';
    return departments.rosters[department];
  }).catch(error => {
    // A list already on screen stays while a newer copy cannot be read.
    if (!rosterLoaded(department)) departments.errors[department] = problem(error, 'The roster did not load.');
    return roster(department);
  }).finally(() => {
    departments.loadedAt[department] = Date.now();
    delete departments.loading[department];
    if (!have || JSON.stringify(roster(department)) !== before) renderSoon();
  });
  departments.loading[department] = request;
  if (!have) {
    departments.errors[department] = '';
    renderSoon();
  }
  return request;
}

/* Read these departments' rosters now (opening a planner section, Fill). */
export function refreshRosters(names) {
  return Promise.all(names.map(name => loadRoster(name, true)));
}

/* The signed-in member's own profile in each department they belong to.
   The rules refuse to read a profile that does not exist, so a refusal
   means "not in that department"; any other failure (offline, the server)
   is shown with "Try again" and not remembered as "on no roster". */
export function loadOwnProfiles(force = false) {
  if (session.status !== 'verified' || !fb.db) return Promise.resolve([]);
  if (departments.own && !force) return Promise.resolve(departments.own);
  if (departments.ownLoading) return departments.ownLoading;
  if (departments.ownError && !force) return Promise.resolve([]);
  const uid = session.user ? session.user.uid : '';
  departments.ownError = '';
  departments.ownLoading = Promise.all(DEPARTMENTS.map(async department => {
    try {
      const snapshot = await fb.getDoc(fb.doc(fb.db, 'departments', department.name, 'members', uid));
      return snapshot.exists() ? normalizeProfile(snapshot.data(), department.name) : null;
    } catch (error) {
      if (['permission-denied', 'not-found'].includes(code(error))) return null;
      throw error;
    }
  })).then(profiles => {
    departments.own = profiles.filter(Boolean);
    return departments.own;
  }).catch(error => {
    departments.own = null;
    departments.ownError = problem(error, 'Your availability did not load. Check your connection, then try again.');
    return [];
  }).finally(() => {
    departments.ownLoading = null;
    renderSoon();
  });
  renderSoon();
  return departments.ownLoading;
}
