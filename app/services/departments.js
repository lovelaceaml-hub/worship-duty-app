/* Department rosters and member profiles. Profiles live on the server at
   departments/{department}/members/{member}; leaders read a roster one
   department at a time through listDepartmentRoster, and every change goes
   through a Cloud Function that checks the leader's rights. */
import { fb, call, problem } from '../firebase.js';
import { data, session, nameOf, readJSON, writeJSON } from '../store.js';
import { renderSoon } from '../render.js';
import { notice } from '../ui/banners.js';
import { DEPARTMENTS, departmentOf, dutyName } from '../config/duties.js';
import { normalizeProfile, normalizeAvailability, canTake, timeKey } from '../lib/availability.js';
import { serviceId } from '../lib/services.js';
import { canAlsoServe, otherDuties } from '../lib/conflicts.js';

/* Loaded rosters and in-progress edits, cleared when the member changes. */
export const departments = {
  rosters: {},     // department -> [profile]
  loading: {},     // department -> promise
  errors: {},      // department -> message
  own: null,       // [profile] for the signed-in member, once loaded
  ownLoading: null,
  ownError: '',
  drafts: {},      // 'department::uid' -> unsaved patch
  busy: {},        // 'serviceId::duty' or 'default::duty' -> true while it saves
  search: null,    // { department, query, page, members, total, busy, error, adding }
  invites: {}      // department -> [{ token, expiresAt }] made on this device
};

export function resetDepartments() {
  Object.assign(departments, { rosters: {}, loading: {}, errors: {}, own: null, ownLoading: null, ownError: '', drafts: {}, busy: {}, search: null });
  departments.invites = readJSON('wds-invites', {});
}

const key = (department, uid) => department + '::' + uid;

export function roster(department) { return departments.rosters[department] || []; }

/* Whether a department's roster has loaded. A loaded roster can be empty. */
export function rosterLoaded(department) { return Array.isArray(departments.rosters[department]); }

export function profileOf(department, uid) {
  return roster(department).find(profile => profile.memberUid === uid) ||
    (departments.own || []).find(profile => profile.departmentId === department && profile.memberUid === uid) || null;
}

export function profileNamed(department, name) {
  return roster(department).find(profile => profile.memberName === name || nameOf(profile.memberName) === nameOf(name)) || null;
}

/* The profile with any unsaved edits applied. */
export function draftOf(department, uid) {
  const profile = profileOf(department, uid);
  const draft = departments.drafts[key(department, uid)];
  if (!profile || !draft) return profile;
  return Object.assign({}, profile, draft, { availability: normalizeAvailability(draft.availability || profile.availability) });
}

export function hasDraft(department, uid) { return !!departments.drafts[key(department, uid)]; }

export function editDraft(department, uid, patch) {
  const current = departments.drafts[key(department, uid)] || {};
  departments.drafts[key(department, uid)] = Object.assign({}, current, patch);
  renderSoon();
}

export function dropDraft(department, uid) {
  delete departments.drafts[key(department, uid)];
  renderSoon();
}

function store(profile) {
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
  delete departments.drafts[key(clean.departmentId, clean.memberUid)];
  return clean;
}

export function loadRoster(department, force = false) {
  if (!department || department === 'All' || session.status !== 'verified') return Promise.resolve([]);
  if (!force && departments.rosters[department]) return Promise.resolve(departments.rosters[department]);
  if (!force && departments.errors[department]) return Promise.resolve([]);
  if (departments.loading[department]) return departments.loading[department];
  departments.errors[department] = '';
  const request = call('listDepartmentRoster', { departmentId: department }).then(result => {
    if (!result || result.departmentId !== department || !Array.isArray(result.members)) throw new Error('The roster did not load.');
    departments.rosters[department] = result.members.map(profile => normalizeProfile(profile, department)).filter(Boolean)
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
    return departments.rosters[department];
  }).catch(error => {
    departments.errors[department] = problem(error, 'The roster did not load.');
    return [];
  }).finally(() => {
    delete departments.loading[department];
    renderSoon();
  });
  departments.loading[department] = request;
  renderSoon();
  return request;
}

/* The signed-in member's own profile in each department they belong to. */
export function loadOwnProfiles(force = false) {
  if (session.status !== 'verified' || !fb.db) return Promise.resolve([]);
  if (departments.own && !force) return Promise.resolve(departments.own);
  if (departments.ownLoading) return departments.ownLoading;
  const uid = session.user ? session.user.uid : '';
  departments.ownError = '';
  departments.ownLoading = Promise.all(DEPARTMENTS.map(async department => {
    try {
      const snapshot = await fb.getDoc(fb.doc(fb.db, 'departments', department.name, 'members', uid));
      return snapshot.exists() ? normalizeProfile(snapshot.data(), department.name) : null;
    } catch (_error) {
      return null;
    }
  })).then(profiles => {
    departments.own = profiles.filter(Boolean);
    return departments.own;
  }).catch(error => {
    departments.ownError = problem(error, 'Your availability did not load.');
    return [];
  }).finally(() => {
    departments.ownLoading = null;
    renderSoon();
  });
  renderSoon();
  return departments.ownLoading;
}

/* ---- leader edits ---- */

export async function saveProfile(department, uid) {
  const profile = profileOf(department, uid);
  const draft = departments.drafts[key(department, uid)];
  if (!profile || !draft) return;
  const patch = {};
  ['status', 'eligibleDuties', 'schedulable', 'availability'].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(draft, field)) patch[field] = draft[field];
  });
  try {
    const result = await call('updateDepartmentProfile', { departmentId: department, memberUid: uid, patch });
    if (!result || !store(result.profile)) throw new Error('The saved profile did not come back.');
    notice(nameOf(profile.memberName) + '’s profile was saved.');
  } catch (error) {
    notice('The profile was not saved: ' + problem(error), true);
  }
  renderSoon();
}

export async function setStatus(department, uid, status) {
  editDraft(department, uid, { status });
  await saveProfile(department, uid);
}

export async function addMember(department, member, { eligibleDuties = [], quiet = false } = {}) {
  const search = departments.search;
  if (search) search.adding = true;
  renderSoon();
  let added = false;
  try {
    const result = await call('createDepartmentProfile', {
      departmentId: department, memberUid: member.memberUid, memberName: member.memberName,
      status: 'active', eligibleDuties, schedulable: eligibleDuties.length > 0, availability: { recurring: {}, exceptions: {} }
    });
    if (!result || !store(result.profile)) throw new Error('The new profile did not come back.');
    added = true;
    if (!quiet) notice(nameOf(member.memberName) + ' was added to ' + department + '.');
  } catch (error) {
    notice(nameOf(member.memberName) + ' was not added: ' + problem(error), true);
  }
  if (search) search.adding = false;
  renderSoon();
  return added;
}

/* People who serve in a department's duties (the last six months and
   coming up) or are on its old name list, but have no profile in it, so the
   planner cannot offer them. Each comes with the duties they have held. */
export function missingMembers(department, today) {
  const own = (DEPARTMENTS.find(item => item.name === department) || { duties: [] }).duties;
  const since = new Date(new Date(today + 'T12:00:00').getTime() - 182 * 864e5).toISOString().slice(0, 10);
  const held = {};
  legacyRoster(department).forEach(name => { held[name] = held[name] || new Set(); });
  data.services.filter(service => service.date >= since).forEach(service => own.forEach(duty => {
    const name = (service.assignments || {})[duty];
    if (name) (held[name] = held[name] || new Set()).add(duty);
  }));
  return Object.keys(held).filter(name => name && !profileNamed(department, name))
    .map(name => ({ name, duties: own.filter(duty => held[name].has(duty)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* Add someone by name: find their account (or their place on the member
   list) with the member search, then add them able to take `duties`, or
   every duty of the department when they have held none yet. */
export async function addByName(department, name, duties, options = {}) {
  let found = null;
  try {
    const result = await call('searchDepartmentCandidates', { departmentId: department, query: name.slice(0, 160), page: 1 });
    found = ((result && result.members) || []).find(member => member.memberName === name) || null;
  } catch (_error) { /* reported below */ }
  if (!found) { notice(nameOf(name) + ' is not on the member list, so they were not added.', true); return false; }
  const own = (DEPARTMENTS.find(item => item.name === department) || { duties: [] }).duties;
  return addMember(department, found, Object.assign({ eligibleDuties: duties.length ? duties : own }, options));
}

export async function searchMembers(department, query, page = 1) {
  const search = departments.search = { department, query, page, members: [], total: 0, busy: true, error: '', done: false };
  renderSoon();
  try {
    const result = await call('searchDepartmentCandidates', { departmentId: department, query, page });
    if (departments.search !== search) return;
    search.members = (result && Array.isArray(result.members) ? result.members : []).filter(member => member.memberUid && member.memberName);
    search.total = Number(result && result.total) || search.members.length;
  } catch (error) {
    if (departments.search !== search) return;
    search.error = problem(error, 'The search did not finish.');
  }
  search.busy = false;
  search.done = true;
  renderSoon();
}

export async function resetPin(name) {
  try {
    await call('resetMemberPin', { memberId: name });
    notice(nameOf(name) + '’s PIN was reset. They will choose a new one when they sign in.');
  } catch (error) {
    notice('The PIN was not reset: ' + problem(error), true);
  }
  renderSoon();
}

/* ---- invite links ---- */

export async function createInvite(department) {
  try {
    const result = await call('createDepartmentInvitation', { departmentId: department });
    const list = (departments.invites[department] || []).filter(invite => invite.expiresAt > Date.now());
    list.unshift({ token: result.token, expiresAt: result.expiresAt, by: session.member.memberId });
    departments.invites[department] = list.slice(0, 10);
    writeJSON('wds-invites', departments.invites);
  } catch (error) {
    notice('The invite link was not made: ' + problem(error), true);
  }
  renderSoon();
}

export async function cancelInvite(department, token) {
  try {
    await call('revokeDepartmentInvitation', { token });
    notice('That invite link no longer works.');
  } catch (error) {
    notice('The link was not cancelled: ' + problem(error), true);
    return;
  }
  departments.invites[department] = (departments.invites[department] || []).filter(invite => invite.token !== token);
  writeJSON('wds-invites', departments.invites);
  renderSoon();
}

/* Links this leader made on this device that still work. The server keeps
   only a fingerprint of each link, so a link can be copied only here. */
export function activeInvites(department) {
  const me = session.member && session.member.memberId;
  return (departments.invites[department] || []).filter(invite => invite.expiresAt > Date.now() && invite.by === me);
}

export function inviteLink(token) {
  return location.origin + location.pathname + '#join=' + token;
}

/* An invite link is the app address plus #join=<token>. The token is kept
   for this visit and taken out of the address bar, then used once the member
   is signed in. */
export function rememberInvite() {
  const match = location.hash.match(/^#join=([A-Za-z0-9_-]{43})$/);
  if (!match) return;
  try { sessionStorage.setItem('wds-join', match[1]); } catch (_error) { /* storage blocked */ }
  history.replaceState(null, '', location.pathname + location.search);
}

export function pendingInvite() {
  try { return sessionStorage.getItem('wds-join') || ''; } catch (_error) { return ''; }
}

export function acceptPendingInvite() {
  const token = pendingInvite();
  if (!token) return;
  try { sessionStorage.removeItem('wds-join'); } catch (_error) { /* storage blocked */ }
  acceptInvite(token);
}

async function acceptInvite(token) {
  try {
    const result = await call('acceptDepartmentInvitation', { token });
    notice(result.alreadyMember ? 'You are already in ' + result.departmentId + '.' : 'You joined ' + result.departmentId + '.');
    departments.own = null;
    loadOwnProfiles(true);
  } catch (error) {
    const code = String(error && error.code || '').replace(/^functions\//, '');
    notice(code === 'already-exists' ? 'That invite link was already used.'
      : code === 'failed-precondition' ? 'That invite link has expired or was cancelled. Ask your leader for a new one.'
        : 'The invite link did not work: ' + problem(error), true);
  }
  renderSoon();
}

/* ---- the member's own availability, one editor for every department ---- */

export async function saveOwnAvailability(availability) {
  const own = departments.own || [];
  if (!own.length) return false;
  try {
    const result = await call('saveMemberAvailability', {
      memberUid: own[0].memberUid,
      departments: own.map(profile => ({
        departmentId: profile.departmentId,
        availability,
        expectedRevision: profile.revision,
        expectedUpdatedAt: profile.updatedAt
      }))
    });
    (result.departments || []).forEach(item => store(item.profile));
    const flagged = (result.replacements && result.replacements.marked || []).length;
    notice(flagged
      ? 'Saved. ' + flagged + (flagged === 1 ? ' duty you can no longer make was' : ' duties you can no longer make were') + ' flagged for your leader.'
      : 'Your availability was saved.');
    return true;
  } catch (error) {
    notice('Your availability was not saved: ' + problem(error), true);
    return false;
  } finally {
    renderSoon();
  }
}

/* ---- assignments ---- */

function assignmentPayload(service, duty, extra) {
  return Object.assign({
    departmentId: departmentOf(duty).name,
    duty,
    serviceId: serviceId(service),
    serviceDate: service.date,
    serviceTime: timeKey(service)
  }, extra);
}

/* A normal assignment needs an eligible, available member (see canTake).
   An administrator override needs a reason, which the server records. */
export async function assign(service, duty, profile, { override = false, reason = '' } = {}) {
  const busyKey = serviceId(service) + '::' + duty;
  if (departments.busy[busyKey]) return;
  if (!override && !canTake(profile, service, duty)) {
    notice(nameOf(profile.memberName) + ' cannot take ' + dutyName(duty) + ' at this service.', true);
    return;
  }
  const others = otherDuties(service.assignments, profile.memberName, duty);
  if (!override && !canAlsoServe(service.assignments, profile.memberName, duty)) {
    notice(nameOf(profile.memberName) + ' is already serving as ' + others.map(dutyName).join(' and ') + ' at this service.', true);
    return;
  }
  departments.busy[busyKey] = true;
  try {
    const payload = assignmentPayload(service, duty, { memberUid: profile.memberUid, memberName: profile.memberName });
    if (override) Object.assign(payload, { override: true, overrideReason: reason });
    await call(override ? 'overrideDepartmentAssignment' : 'assignDepartmentDuty', payload);
    service.assignments = Object.assign({}, service.assignments, { [duty]: profile.memberName });
    if (override) notice('Override recorded: ' + nameOf(profile.memberName) + ' is on ' + dutyName(duty) + '.');
  } catch (error) {
    notice('The assignment was not saved: ' + problem(error), true);
  }
  delete departments.busy[busyKey];
  renderSoon();
}

export async function unassign(service, duty) {
  try {
    await call('unassignDepartmentDuty', assignmentPayload(service, duty, {}));
    const assignments = Object.assign({}, service.assignments);
    delete assignments[duty];
    service.assignments = assignments;
  } catch (error) {
    notice('The duty was not cleared: ' + problem(error), true);
  }
  renderSoon();
}

/* The default member for a duty that has one (Opening Prayer), or '' for
   none. The server checks the leader's rights and that the member takes the
   duty; app/settings then carries the choice to every device. */
export async function saveDutyDefault(duty, memberName) {
  if (departments.busy['default::' + duty]) return;
  departments.busy['default::' + duty] = true;
  renderSoon();
  try {
    await call('setDutyDefault', { duty, memberName });
    data.settings.dutyDefaults = Object.assign({}, data.settings.dutyDefaults, { [duty]: memberName });
    notice(memberName ? nameOf(memberName) + ' is the default for ' + dutyName(duty) + '.' : dutyName(duty) + ' has no default now.');
  } catch (error) {
    notice('The default was not saved: ' + problem(error), true);
  }
  delete departments.busy['default::' + duty];
  renderSoon();
}

/* The older name lists in app/departments. Manage uses them to show a
   leader the services where their people serve in other departments. */
export function legacyRoster(department) { return data.rosters[department] || []; }
