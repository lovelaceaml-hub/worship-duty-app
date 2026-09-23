import {CATEGORIES, SERVICE_LABELS, memberLabel} from './constants.js';
import {slugify, svcId, dutyCategory} from './format.js';
import {ui, departmentRuntime, authUser, verifiedSession, state, fb} from './state.js';
import {isVerifiedSession} from './auth.js';
import {renderSoon, addBanner, afterDataChange} from './notify.js';
import {authCall, safeAuthMessage} from './session.js';

export function clearDepartmentRuntime() {
  departmentRuntime.rosters = Object.create(null);
  departmentRuntime.ownProfiles = Object.create(null);
  departmentRuntime.ownLoading = false;
  departmentRuntime.ownLoaded = false;
  departmentRuntime.ownError = '';
  departmentRuntime.loading = Object.create(null);
  departmentRuntime.errors = Object.create(null);
  departmentRuntime.drafts = Object.create(null);
  departmentRuntime.assignmentBusy = Object.create(null);
  ui.departmentView = 'list';
  ui.departmentMember = '';
}
export function departmentRuntimeKey(department, memberUid) {
  return String(department || '') + '::' + String(memberUid || '');
}
export function departmentErrorMessage(error, fallback) {
  const code = String(error && error.code || '').replace(/^functions\//, '');
  if (code === 'permission-denied') return 'This account is not authorized for that department action.';
  if (code === 'unauthenticated') return 'Sign in again before changing department data.';
  if (code === 'unavailable' || code === 'internal') return 'The department service is unavailable. Try again.';
  return String(error && error.message || fallback || 'The department action could not be completed.');
}
export function departmentServiceTimeKey(serviceOrLabel) {
  const value = typeof serviceOrLabel === 'object'
    ? (serviceOrLabel && (serviceOrLabel.serviceTime || serviceOrLabel.service || serviceOrLabel.time))
    : serviceOrLabel;
  return slugify(value || '');
}
export function departmentServiceTimeLabel(key) {
  const normalized = String(key || '').trim().toLocaleLowerCase();
  const known = SERVICE_LABELS.find(label => departmentServiceTimeKey(label) === normalized);
  if (known) return known;
  if (normalized === '*') return 'Any service time';
  return String(key || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
export function normalizeDepartmentAvailability(value) {
  const source = value && typeof value === 'object' ? value : {};
  const recurring = source.recurring && typeof source.recurring === 'object' ? source.recurring : {};
  const rawExceptions = source.exceptions || source.dateExceptions;
  const exceptions = rawExceptions && typeof rawExceptions === 'object' ? rawExceptions : {};
  const cleanMap = map => Object.keys(map).reduce((out, key) => {
    const status = String(map[key] || '').trim().toLocaleLowerCase();
    if (status === 'available' || status === 'unavailable') out[String(key).trim().toLocaleLowerCase()] = status;
    return out;
  }, {});
  const cleanExceptions = Object.keys(exceptions).reduce((out, date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !exceptions[date] || typeof exceptions[date] !== 'object') return out;
    out[date] = cleanMap(exceptions[date]);
    return out;
  }, {});
  return { recurring: cleanMap(recurring), exceptions: cleanExceptions };
}
export function normalizeDepartmentProfile(value, department) {
  if (!value || typeof value !== 'object') return null;
  const memberUid = String(value.memberUid || value.uid || '').trim();
  const departmentId = String(value.departmentId || value.department || '').trim();
  if (!memberUid || !departmentId || departmentId !== String(department || '').trim()) return null;
  if (value.memberUid != null && value.uid != null && String(value.memberUid) !== String(value.uid)) return null;
  if (value.departmentId != null && value.department != null && String(value.departmentId) !== String(value.department)) return null;
  const eligibleDuties = Array.isArray(value.eligibleDuties)
    ? value.eligibleDuties
    : (Array.isArray(value.duties) ? value.duties : []);
  const schedulable = value.schedulable == null ? value.isSchedulable : value.schedulable;
  if (typeof schedulable !== 'boolean') return null;
  const status = String(value.status || (value.active === false ? 'inactive' : 'active')).trim().toLocaleLowerCase();
  if (status !== 'active' && status !== 'inactive') return null;
  return Object.assign({}, value, {
    departmentId,
    memberUid,
    memberName: String(value.memberName || value.member || memberUid).trim() || memberUid,
    role: String(value.role || 'member').trim(),
    status,
    eligibleDuties: eligibleDuties.map(duty => String(duty).trim()).filter(Boolean),
    schedulable,
    availability: normalizeDepartmentAvailability(value.availability)
  });
}
export function departmentProfiles(department) {
  return Array.isArray(departmentRuntime.rosters[department]) ? departmentRuntime.rosters[department] : [];
}
export function currentMemberUid() {
  return String((authUser && authUser.uid) || (verifiedSession && verifiedSession.uid) || '').trim();
}
export function ownDepartmentProfiles() {
  return Object.keys(departmentRuntime.ownProfiles).reduce((profiles, department) => {
    const own = departmentRuntime.ownProfiles[department];
    if (Array.isArray(own)) profiles.push.apply(profiles, own);
    return profiles;
  }, []);
}
export function departmentProfile(department, memberUid) {
  const wanted = String(memberUid || '');
  return departmentProfiles(department).find(profile => profile.memberUid === wanted) ||
    (departmentRuntime.ownProfiles[department] || []).find(profile => profile.memberUid === wanted) ||
    null;
}
export function departmentProfileByName(department, name) {
  const wanted = String(name || '').trim();
  return departmentProfiles(department).find(profile => profile.memberName === wanted || memberLabel(profile.memberName) === memberLabel(wanted)) || null;
}
export function departmentProfileIsLeader(profile) {
  return /leader|manager/i.test(String(profile && profile.role || ''));
}
export function departmentAvailability(profile, serviceDate, serviceTime) {
  if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate || ''))) return 'unknown';
  const key = departmentServiceTimeKey(serviceTime);
  if (!key) return 'unknown';
  const exceptions = profile.availability && profile.availability.exceptions || {};
  const recurring = profile.availability && profile.availability.recurring || {};
  const exception = exceptions[serviceDate];
  if (exception && Object.prototype.hasOwnProperty.call(exception, key)) return exception[key];
  if (exception && Object.prototype.hasOwnProperty.call(exception, '*')) return exception['*'];
  return recurring[key] || 'unknown';
}
export function departmentProfileAssignable(profile, svc, duty) {
  if (!profile || profile.status !== 'active' || profile.schedulable !== true) return false;
  if (!Array.isArray(profile.eligibleDuties) || !profile.eligibleDuties.some(item =>
    String(item).trim().toLocaleLowerCase() === String(duty || '').trim().toLocaleLowerCase())) return false;
  return departmentAvailability(profile, svc && svc.date, svc && departmentServiceTimeKey(svc)) === 'available';
}
export function departmentDraftProfile(department, memberUid) {
  const profile = departmentProfile(department, memberUid);
  if (!profile) return null;
  const key = departmentRuntimeKey(department, memberUid);
  const draft = departmentRuntime.drafts[key];
  if (!draft) return profile;
  return Object.assign({}, profile, draft, {
    availability: normalizeDepartmentAvailability(draft.availability || profile.availability)
  });
}
export function replaceDepartmentProfile(profile) {
  if (!profile || !profile.departmentId || !profile.memberUid) return false;
  const normalized = normalizeDepartmentProfile(profile, profile.departmentId);
  if (!normalized) return false;
  const current = departmentProfiles(normalized.departmentId);
  const index = current.findIndex(item => item.memberUid === normalized.memberUid);
  if (index === -1) current.push(normalized);
  else current[index] = normalized;
  current.sort((left, right) => String(left.memberName).localeCompare(String(right.memberName)));
  if (Array.isArray(departmentRuntime.rosters[normalized.departmentId])) {
    departmentRuntime.rosters[normalized.departmentId] = current;
  }
  const own = Array.isArray(departmentRuntime.ownProfiles[normalized.departmentId])
    ? departmentRuntime.ownProfiles[normalized.departmentId]
    : [];
  const ownIndex = own.findIndex(item => item.memberUid === normalized.memberUid);
  if (ownIndex !== -1) own[ownIndex] = normalized;
  else if (isOwnDepartmentProfile(normalized.departmentId, normalized.memberUid)) own.push(normalized);
  if (own.length) departmentRuntime.ownProfiles[normalized.departmentId] = own;
  delete departmentRuntime.drafts[departmentRuntimeKey(normalized.departmentId, normalized.memberUid)];
  return true;
}
export function isOwnDepartmentProfile(department, memberUid) {
  const wanted = String(memberUid || '').trim();
  if (!wanted) return false;
  const uid = currentMemberUid();
  if (uid) return uid === wanted;
  return !fb && !!ui.me && departmentProfile(department, wanted)?.memberName === ui.me;
}
export function departmentRosterError(department, message) {
  departmentRuntime.errors[department] = message || 'The department roster could not be loaded.';
  departmentRuntime.loading[department] = false;
}
export function localDepartmentRoster(department) {
  const names = state.departments && Array.isArray(state.departments[department])
    ? state.departments[department]
    : [];
  const category = CATEGORIES.find(item => item.name === department);
  return names.map(name => normalizeDepartmentProfile({
    memberUid: 'local:' + slugify(department) + ':' + slugify(name),
    departmentId: department,
    memberName: name,
    role: 'member',
    status: 'active',
    eligibleDuties: category ? category.duties : [],
    schedulable: true,
    availability: { recurring: SERVICE_LABELS.reduce((out, label) => {
      out[departmentServiceTimeKey(label)] = 'available';
      return out;
    }, {}), exceptions: {} }
  }, department)).filter(Boolean);
}
export function loadDepartmentRoster(department, options = {}) {
  const selected = String(department || '').trim();
  if (!selected || selected === 'All' || !isVerifiedSession()) return Promise.resolve([]);
  if (!options.force && Array.isArray(departmentRuntime.rosters[selected])) return Promise.resolve(departmentRuntime.rosters[selected]);
  if (!options.force && departmentRuntime.errors[selected]) return Promise.resolve([]);
  if (departmentRuntime.loading[selected]) return departmentRuntime.loading[selected];
  departmentRuntime.errors[selected] = '';
  departmentRuntime.loading[selected] = true;
  renderSoon();
  if (!fb) {
    departmentRuntime.rosters[selected] = localDepartmentRoster(selected);
    departmentRuntime.loading[selected] = false;
    renderSoon();
    return Promise.resolve(departmentRuntime.rosters[selected]);
  }
  const request = authCall('listDepartmentRoster', { departmentId: selected }).then(result => {
    if (!result || result.departmentId !== selected || !Array.isArray(result.members)) {
      throw new Error('The department roster response was not valid.');
    }
    const profiles = result.members.map(profile => normalizeDepartmentProfile(profile, selected)).filter(Boolean);
    departmentRuntime.rosters[selected] = profiles;
    departmentRuntime.loading[selected] = false;
    departmentRuntime.errors[selected] = '';
    renderSoon();
    return profiles;
  }).catch(error => {
    departmentRosterError(selected, departmentErrorMessage(error, 'The department roster could not be loaded.'));
    renderSoon();
    throw error;
  });
  departmentRuntime.loading[selected] = request;
  return request;
}
export function loadOwnDepartmentProfiles() {
  if (!isVerifiedSession()) return Promise.resolve([]);
  if (departmentRuntime.ownLoaded) return Promise.resolve(ownDepartmentProfiles());
  if (departmentRuntime.ownLoading) return departmentRuntime.ownLoading;
  const uid = currentMemberUid();
  departmentRuntime.ownError = '';
  departmentRuntime.ownProfiles = Object.create(null);
  departmentRuntime.ownLoading = true;
  renderSoon();
  if (!fb || !uid || typeof fb.getDoc !== 'function') {
    const localProfiles = CATEGORIES.reduce((profiles, category) => {
      const match = localDepartmentRoster(category.name).find(profile => profile.memberName === ui.me);
      if (match) profiles.push(match);
      return profiles;
    }, []);
    localProfiles.forEach(profile => { departmentRuntime.ownProfiles[profile.departmentId] = [profile]; });
    departmentRuntime.ownLoaded = true;
    departmentRuntime.ownLoading = false;
    renderSoon();
    return Promise.resolve(localProfiles);
  }
  const request = Promise.all(CATEGORIES.map(async category => {
    try {
      const reference = fb.doc(fb.db, 'departments', category.name, 'members', uid);
      const snapshot = await fb.getDoc(reference);
      if (!snapshot || !snapshot.exists()) return null;
      return normalizeDepartmentProfile(snapshot.data(), category.name);
    } catch (_error) {
      return null;
    }
  })).then(profiles => {
    profiles.filter(Boolean).forEach(profile => {
      departmentRuntime.ownProfiles[profile.departmentId] = [profile];
    });
    departmentRuntime.ownLoaded = true;
    departmentRuntime.ownLoading = false;
    renderSoon();
    return ownDepartmentProfiles();
  }).catch(error => {
    departmentRuntime.ownLoaded = false;
    departmentRuntime.ownLoading = false;
    departmentRuntime.ownError = departmentErrorMessage(error, 'Your shared availability could not be loaded.');
    renderSoon();
    throw error;
  });
  departmentRuntime.ownLoading = request;
  return request;
}
export function departmentPatch(department, memberUid, patch) {
  const profile = departmentProfile(department, memberUid);
  if (!profile || !patch || typeof patch !== 'object') return Promise.reject(new Error('The department member is not loaded.'));
  const key = departmentRuntimeKey(department, memberUid);
  departmentRuntime.drafts[key] = Object.assign({}, departmentRuntime.drafts[key] || {}, patch);
  if (patch.availability) departmentRuntime.drafts[key].availability = normalizeDepartmentAvailability(patch.availability);
  renderSoon();
  return Promise.resolve(departmentRuntime.drafts[key]);
}
export function saveDepartmentProfile(department, memberUid) {
  const profile = departmentProfile(department, memberUid);
  const draft = departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  if (!profile || !draft) return Promise.resolve(profile);
  const patch = {};
  ['status', 'eligibleDuties', 'schedulable', 'availability'].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(draft, field)) patch[field] = draft[field];
  });
  if (!Object.keys(patch).length) return Promise.resolve(profile);
  if (!fb) {
    const next = normalizeDepartmentProfile(Object.assign({}, profile, patch), department);
    replaceDepartmentProfile(next);
    renderSoon();
    return Promise.resolve(next);
  }
  const availabilityOnly = Object.keys(patch).length === 1 && Object.prototype.hasOwnProperty.call(patch, 'availability') &&
    isOwnDepartmentProfile(department, memberUid);
  const callable = availabilityOnly ? 'updateMemberAvailability' : 'updateDepartmentProfile';
  return authCall(callable, {
    departmentId: department,
    memberUid,
    patch
  }).then(result => {
    if (!result || result.departmentId !== department || result.memberUid !== memberUid || !result.profile) {
      throw new Error('The department profile response was not valid.');
    }
    if (!replaceDepartmentProfile(result.profile)) throw new Error('The department profile identity was not valid.');
    addBanner('Department member profile saved.');
    renderSoon();
    return result.profile;
  }).catch(error => {
    addBanner('The department member profile was not saved: ' + departmentErrorMessage(error), true);
    renderSoon();
    throw error;
  });
}
export function saveOwnDepartmentAvailability(department, memberUid) {
  const draft = departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  if (!isOwnDepartmentProfile(department, memberUid)) {
    return Promise.reject(new Error('Only the signed-in member may save this availability.'));
  }
  if (!draft || Object.keys(draft).some(field => field !== 'availability')) {
    return Promise.reject(new Error('Only availability changes may be saved from My Duties.'));
  }
  return saveDepartmentProfile(department, memberUid);
}
export function departmentAssignmentPayload(svc, duty, profile, extra = {}) {
  const category = dutyCategory(duty);
  return Object.assign({
    departmentId: category.name,
    memberUid: profile.memberUid,
    memberName: profile.memberName,
    duty,
    serviceId: svcId(svc),
    serviceDate: svc.date,
    serviceTime: departmentServiceTimeKey(svc)
  }, extra);
}
export function applyScheduleAssignment(svc, duty, profile) {
  const name = profile.memberName;
  if (Object.keys(svc.assignments || {}).some(item => item !== duty && svc.assignments[item] === name)) {
    throw new Error(name + ' is already serving in this service, pick a different person.');
  }
  if (!svc.assignments) svc.assignments = {};
  svc.assignments[duty] = name;
  // The authorized callable is the assignment write boundary. This only
  // updates the in-memory schedule projection after the callable succeeds;
  // writing schedule/{id} here would bypass the UID/profile checks.
  afterDataChange();
}
export function assignDepartmentDutyForService(svc, duty, profile, options = {}) {
  if (!svc || !profile) return Promise.reject(new Error('Choose a department member before assigning this duty.'));
  if (options.override !== true && Object.keys(svc.assignments || {}).some(item => item !== duty && svc.assignments[item] === profile.memberName)) {
    return Promise.reject(new Error(profile.memberName + ' is already serving in this service, pick a different person.'));
  }
  const busyKey = svcId(svc) + '::' + duty;
  if (departmentRuntime.assignmentBusy[busyKey]) return Promise.reject(new Error('That assignment is already being saved.'));
  departmentRuntime.assignmentBusy[busyKey] = true;
  const isOverride = options.override === true;
  if (!isOverride && !departmentProfileAssignable(profile, svc, duty)) {
    delete departmentRuntime.assignmentBusy[busyKey];
    return Promise.reject(new Error('Normal assignment requires an active, eligible, schedulable, available member.'));
  }
  const callable = isOverride ? 'overrideDepartmentAssignment' : 'assignDepartmentDuty';
  const payload = departmentAssignmentPayload(svc, duty, profile, isOverride
    ? { override: true, overrideReason: String(options.reason || '').trim() }
    : {});
  if (isOverride && !payload.overrideReason) {
    delete departmentRuntime.assignmentBusy[busyKey];
    return Promise.reject(new Error('An administrator override reason is required.'));
  }
  const save = fb ? authCall(callable, payload) : Promise.resolve({ ok: true, override: isOverride, profileMutated: false });
  return save.then(result => {
    if (isOverride && result && result.profileMutated !== false) throw new Error('The override response did not preserve the member profile.');
    applyScheduleAssignment(svc, duty, profile);
    if (isOverride) addBanner('Administrator override recorded for ' + memberLabel(profile.memberName) + '.');
    return result;
  }).catch(error => {
    addBanner(error.message || safeAuthMessage(error), true);
    renderSoon();
    throw error;
  }).finally(() => { delete departmentRuntime.assignmentBusy[busyKey]; });
}
export function unassignDepartmentDutyForService(svc, duty) {
  if (!svc) return Promise.reject(new Error('Choose a service before clearing this duty.'));
  const category = dutyCategory(duty);
  const payload = {
    departmentId: category.name,
    duty,
    serviceId: svcId(svc),
    serviceDate: svc.date,
    serviceTime: departmentServiceTimeKey(svc)
  };
  const save = fb ? authCall('unassignDepartmentDuty', payload) : Promise.resolve({ ok: true });
  return save.then(result => {
    if (!svc.assignments) svc.assignments = {};
    delete svc.assignments[duty];
    afterDataChange();
    return result;
  }).catch(error => {
    addBanner(error.message || safeAuthMessage(error), true);
    renderSoon();
    throw error;
  });
}
