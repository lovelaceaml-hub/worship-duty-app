/* Department rosters and member profiles. Profiles live on the server at
   departments/{department}/members/{member}; leaders read a roster one
   department at a time through listDepartmentRoster, and every change goes
   through a Cloud Function that checks the leader's rights. A roster is read
   again once it is two minutes old, and right before Fill, so changes made
   on other devices (a member's day off, the nightly job, another leader)
   reach an open app. */
import { fb, call, problem } from '../firebase.js';
import { data, ui, session, nameOf, readJSON, writeJSON } from '../store.js';
import { plural } from '../html.js';
import { renderSoon } from '../render.js';
import { notice, banner } from '../ui/banners.js';
import { DEPARTMENTS, departmentNamed, dutyName } from '../config/duties.js';
import { normalizeProfile, normalizeAvailability, availabilityOn, timeKey, dutiesFor, statusFor } from '../lib/availability.js';
import { serviceId, upcoming } from '../lib/services.js';
import { addDays, shortDate } from '../lib/dates.js';

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

const key = (department, uid) => department + '::' + uid;
const code = error => String(error && error.code || '').replace(/^functions\//, '');

export function roster(department) { return departments.rosters[department] || []; }

/* Whether a department's roster has loaded. A loaded roster can be empty. */
export function rosterLoaded(department) { return Array.isArray(departments.rosters[department]); }

export function profileOf(department, uid) {
  return roster(department).find(profile => profile.memberUid === uid) ||
    (departments.own || []).find(profile => profile.departmentId === department && profile.memberUid === uid) || null;
}

/* Names are matched as stored: two members can share a display name. */
function profileNamed(department, name) {
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

function store(profile, { keepDraft = false } = {}) {
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

/* ---- leader edits ---- */

/* The profile's revision and last change, so the server refuses a save made
   over a newer one. Sent only when the profile has them. */
function freshness(profile) {
  const out = {};
  if (Number.isSafeInteger(profile.revision) && profile.revision >= 0) out.expectedRevision = profile.revision;
  if (typeof profile.updatedAt === 'number') out.expectedUpdatedAt = profile.updatedAt;
  return out;
}

/* Upcoming duties `profile` holds in its department on days it is marked
   not available: [{ service, duty }]. */
function dutiesOnDaysOff(profile) {
  const own = (departmentNamed(profile.departmentId) || { duties: [] }).duties;
  return upcoming(data.services).flatMap(service => own
    .filter(duty => (service.assignments || {})[duty] === profile.memberName)
    .filter(() => availabilityOn(profile, service.date, timeKey(service)) === 'unavailable')
    .map(duty => ({ service, duty })));
}

/* "Usher Door on Sat, Jul 18 Morning and Usher Front on Tue, Jul 21 Evening",
   for at most three, then "and 2 more". */
function dutyList(items) {
  const words = items.slice(0, 3).map(({ service, duty }) => dutyName(duty) + ' on ' + shortDate(service.date) + ' ' + service.service);
  if (items.length > 3) words.push(plural(items.length - 3, 'more', 'more'));
  return words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : words.join('');
}

/* Send a change to one profile. A clash with a newer change reloads the
   roster and keeps the leader's edits, laid over the newer profile. */
async function updateProfile(department, profile, patch, { keepDraft = false } = {}) {
  const busyKey = 'profile::' + key(department, profile.memberUid);
  if (departments.busy[busyKey]) return null;
  departments.busy[busyKey] = true;
  renderSoon();
  try {
    const result = await call('updateDepartmentProfile', Object.assign({ departmentId: department, memberUid: profile.memberUid, patch }, freshness(profile)));
    const saved = result && store(result.profile, { keepDraft });
    if (!saved) throw new Error('The saved profile did not come back.');
    return Object.assign({}, result, { profile: saved });
  } catch (error) {
    if (code(error) === 'aborted') {
      loadRoster(department, true);
      notice(nameOf(profile.memberName) + '’s profile changed while you were editing it. Your changes are still here, on top of the newer profile. Look again, then save.', true);
    } else {
      notice(nameOf(profile.memberName) + '’s profile was not saved: ' + problem(error), true);
    }
    return null;
  } finally {
    delete departments.busy[busyKey];
    renderSoon();
  }
}

export function profileSaving(department, uid) { return !!departments.busy['profile::' + key(department, uid)]; }

export async function saveProfile(department, uid) {
  const profile = profileOf(department, uid);
  const draft = departments.drafts[key(department, uid)];
  if (!profile || !draft) return;
  const next = draftOf(department, uid);
  const patch = {};
  if ('eligibleDuties' in draft) patch.eligibleDuties = next.eligibleDuties;
  if ('schedulable' in draft) patch.schedulable = next.schedulable;
  if ((draft.edits || []).length) patch.availability = next.availability;
  const result = await updateProfile(department, profile, patch);
  if (!result) return;
  const name = nameOf(profile.memberName);
  // The server flags the duties on days now not available (older servers
  // did not, so the app looks for them itself).
  const marked = result.replacements && Array.isArray(result.replacements.marked) ? result.replacements.marked : null;
  const clashes = marked ? marked.map(atService) : (patch.availability ? dutiesOnDaysOff(result.profile) : []);
  if (clashes.length) notice(name + '’s profile was saved. ' + name + ' can no longer make ' + dutyList(clashes) + '. Find someone else in the month plan.', true);
  else notice(name + '’s profile was saved.');
}

/* Make a member inactive, or active again. Only the status is sent; other
   unsaved edits to the profile stay unsaved. */
export async function setStatus(department, uid, status) {
  const profile = profileOf(department, uid);
  if (!profile) return;
  const result = await updateProfile(department, profile, { status }, { keepDraft: true });
  if (!result) return;
  const name = nameOf(profile.memberName);
  const own = (departmentNamed(department) || { duties: [] }).duties;
  const held = upcoming(data.services).flatMap(service => own.filter(duty => (service.assignments || {})[duty] === profile.memberName).map(duty => ({ service, duty })));
  if (status === 'active') notice(name + ' is active again.');
  else notice(name + ' is inactive now, so Fill and the planner no longer offer them.' +
    (held.length ? ' They still have ' + dutyList(held) + '. Find someone else in the month plan.' : ''), held.length > 0);
}

/* ---- adding members ---- */

export async function addMember(department, member, { eligibleDuties = [], status = 'active', quiet = false } = {}) {
  const search = departments.search;
  if (search) search.adding = true;
  renderSoon();
  let added = null;
  try {
    const result = await call('createDepartmentProfile', {
      departmentId: department, memberUid: member.memberUid, memberName: member.memberName,
      status, eligibleDuties, schedulable: eligibleDuties.length > 0, availability: { recurring: {}, exceptions: {} }
    });
    added = result && store(result.profile);
    if (!added) throw new Error('The new profile did not come back.');
    if (!quiet) {
      notice(nameOf(member.memberName) + ' was added to ' + department + (eligibleDuties.length
        ? ', able to take ' + (eligibleDuties.length === (departmentNamed(department) || { duties: [] }).duties.length ? 'any ' + department + ' duty' : eligibleDuties.map(dutyName).join(' and ')) + '. Check their duties and when they are available.'
        : '. Choose the duties they can take, then turn on Can be scheduled.'));
    }
  } catch (error) {
    notice(nameOf(member.memberName) + ' was not added: ' + problem(error), true);
  }
  if (search) search.adding = false;
  renderSoon();
  return added;
}

/* The duties `name` has held in `department`, from the schedule. */
export function servedDuties(department, name) {
  const own = (departmentNamed(department) || { duties: [] }).duties;
  return own.filter(duty => data.services.some(service => (service.assignments || {})[duty] === name));
}

/* People who serve in a department's duties (the last six months and
   coming up) or are on its old name list, but have no profile in it, so the
   planner cannot offer them. Each comes with the duties and status Add gives
   them (see dutiesFor and statusFor); someone only on the old list is
   active. */
export function missingMembers(department, today) {
  const own = (departmentNamed(department) || { duties: [] }).duties;
  const since = addDays(today, -182);
  const held = {};
  const record = name => held[name] || (held[name] = { duties: new Set(), last: '' });
  legacyRoster(department).forEach(record);
  data.services.filter(service => service.date >= since).forEach(service => own.forEach(duty => {
    const name = (service.assignments || {})[duty];
    if (!name) return;
    record(name).duties.add(duty);
    if (service.date > held[name].last) held[name].last = service.date;
  }));
  return Object.keys(held).filter(name => name && !profileNamed(department, name))
    .map(name => ({ name, duties: dutiesFor(department, Array.from(held[name].duties)), status: held[name].last ? statusFor(held[name].last, today) : 'active' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* Add someone by name (an entry from missingMembers): find their account,
   or their place on the member list, with the member search. */
export async function addByName(department, item, options = {}) {
  let found = null;
  try {
    const result = await call('searchDepartmentCandidates', { departmentId: department, query: item.name.slice(0, 160), page: 1 });
    found = ((result && result.members) || []).find(member => member.memberName === item.name) || null;
  } catch (_error) { /* reported below */ }
  if (!found) { notice(nameOf(item.name) + ' is not on the member list, so they were not added.', true); return null; }
  return addMember(department, found, Object.assign({ eligibleDuties: item.duties, status: item.status }, options));
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

/* The PIN a reset gives (functions/member-auth.js), which the member
   replaces at their next sign-in. */
export const TEMPORARY_PIN = '0000';

export async function resetPin(name) {
  try {
    await call('resetMemberPin', { memberId: name });
    notice(nameOf(name) + '’s PIN was reset. Tell them to sign in with ' + TEMPORARY_PIN + ' and choose a new PIN.');
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
    notice(result.inactive ? 'You are already in ' + result.departmentId + ', but inactive. Ask your leader to make you active.'
      : result.alreadyMember ? 'You are already in ' + result.departmentId + '.' : 'You joined ' + result.departmentId + '.', !!result.inactive);
    departments.own = null;
    loadOwnProfiles(true);
  } catch (error) {
    const reason = code(error);
    notice(reason === 'already-exists' ? 'That invite link was already used.'
      : reason === 'failed-precondition' ? 'That invite link has expired or was cancelled. Ask your leader for a new one.'
        : 'The invite link did not work: ' + problem(error), true);
  }
  renderSoon();
}

/* ---- the member's own availability, one editor for every department ---- */

/* A duty the server flagged ({ serviceId, duty, date, service }) as
   { service, duty }, finding the service when the server named only its id. */
function atService(item) {
  const known = data.services.find(service => serviceId(service) === item.serviceId);
  const service = item.date ? { date: item.date, service: item.service || '' } : known ||
    { date: String(item.serviceId).slice(0, 10), service: String(item.serviceId).slice(11).replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) };
  return { service, duty: item.duty };
}

const flaggedList = marked => dutyList(marked.map(atService));

export async function saveOwnAvailability(availability) {
  const own = departments.own || [];
  if (!own.length) return false;
  try {
    const result = await call('saveMemberAvailability', {
      memberUid: own[0].memberUid,
      departments: own.map(profile => Object.assign({ departmentId: profile.departmentId, availability }, freshness(profile)))
    });
    (result.departments || []).forEach(item => store(item.profile));
    const marked = (result.replacements && result.replacements.marked) || [];
    // The duties a leader was told about stay on screen to read; a plain save
    // is a short confirmation.
    if (marked.length) banner('Saved. Your leader was told you cannot make ' + flaggedList(marked) + '.');
    else notice('Your availability was saved.');
    return true;
  } catch (error) {
    if (code(error) === 'aborted') {
      // Saved meanwhile on another device, or by a leader: load the newer
      // record; the changes on screen stay, ready to save again.
      loadOwnProfiles(true);
      notice('Your availability changed on another device, or your leader changed it. Your changes are still here: look again, then save.', true);
    } else {
      notice('Your availability was not saved: ' + problem(error), true);
    }
    return false;
  } finally {
    renderSoon();
  }
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
