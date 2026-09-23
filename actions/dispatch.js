import {
  authUser, canonicalMemberName, departmentRuntime, fb, loadLocal, persistAll,
  persistDeleteService, persistDepartmentMembership, persistDepartments, persistMembers,
  persistRequest, persistService, persistSettings, resolveRequest, seedState, setState,
  state, ui, verifiedSession
} from '../core/state.js';
import {dutyCategory, fmtDate, requestId, svcId} from '../core/format.js';
import {actionableDepartmentForDuty} from '../views/requests.js';
import {
  authActor, authorizedDepartments, canManageAnyDepartment, canManageSelectedDepartment,
  canPermission, isForcedSession, isVerifiedSession, permissionConfig, selectedManageDepartment
} from '../core/auth.js';
import {conflictsFor, sameDuties} from '../core/conflicts.js';
import {
  assignDepartmentDutyForService, departmentDraftProfile, departmentErrorMessage,
  departmentPatch, departmentProfile, departmentRuntimeKey, isOwnDepartmentProfile,
  loadDepartmentRoster, loadOwnDepartmentProfiles, normalizeDepartmentAvailability,
  replaceDepartmentProfile, saveDepartmentProfile, saveOwnDepartmentAvailability,
  unassignDepartmentDutyForService
} from '../core/departments.js';
import {dutiesFor} from '../core/schedule.js';
import {
  addBanner, afterDataChange, getJSON, registerPush, renderSoon, sysNotify, unregisterPush
} from '../core/notify.js';
import {authCall, memberChangePin, memberLogin, memberLogout, safeAuthMessage} from '../core/session.js';
import {renderBanners} from '../views/shell.js';
import {memberLabel, sha256, sheetUrl, siteHash, unifiedNameMap} from '../core/constants.js';
import {syncFromSheet} from '../core/sheet-sync.js';
import {copyICSLink, subscribeICS} from '../core/calendar.js';

// render (views/shell.js) is not imported directly: design-gallery/build.mjs
// splices host-bridge.js right before app.js's closing init(); call, and
// host-bridge.js monkey-patches render in place on app.js's own local. app.js
// pushes the live (possibly patched) reference in once init() runs, after
// that injection has already executed, the same pattern core/notify.js,
// core/sheet-sync.js, core/session.js and views/songs.js already use.
let render;
export function setDispatchRenderRef(renderFn) { render = renderFn; }

export function applyNameMap(map) {
  const canon = n => (map[n] || n);
  const membersMerged = state.members.filter(m => map[m]).length;
  const membersChanged = membersMerged > 0;
  if (membersChanged) {
    const seen = {};
    state.members = state.members.map(canon).filter(m => (seen[m] ? false : (seen[m] = true)));
    state.members.sort();
  }
  const touchedServices = [];
  state.services.forEach(svc => {
    let touched = false;
    const assignments = svc.assignments || {};
    Object.keys(assignments).forEach(duty => {
      const old = assignments[duty], now = canon(old);
      if (now !== old) { assignments[duty] = now; touched = true; }
    });
    const ok = svc.conflictOk || {};
    const merged = {};
    Object.keys(ok).forEach(name => {
      const now = canon(name);
      if (now !== name) touched = true;
      const dutyList = merged[now] ? merged[now].concat(ok[name]) : ok[name];
      const seenDuty = {};
      merged[now] = dutyList.filter(d => (seenDuty[d] ? false : (seenDuty[d] = true)));
    });
    if (touched) { svc.conflictOk = merged; touchedServices.push(svc); }
  });
  let departmentsChanged = false;
  Object.keys(state.departments || {}).forEach(cat => {
    const roster = state.departments[cat] || [];
    const seen = {};
    const merged = roster.map(canon).filter(m => (seen[m] ? false : (seen[m] = true)));
    merged.sort();
    if (merged.length !== roster.length || merged.some((m, i) => m !== roster[i])) {
      state.departments[cat] = merged;
      departmentsChanged = true;
    }
  });
  return { membersChanged, membersMerged, touchedServices, departmentsChanged };
}
export function findService(id) { return state.services.find(s => svcId(s) === id); }
export function findRequest(id) { return (state.requests || []).find(request => request.id === id); }
export function requestDepartment(request) {
  if (!request) return '';
  if (request.department) return request.department;
  return actionableDepartmentForDuty(request.duty);
}
export function songServiceForPermission(service) {
  if (!service) return null;
  return Object.assign({}, service, {
    presider: service.presider || (service.assignments && service.assignments.Presider) || ''
  });
}
export function canEditSongService(service) {
  return !!authActor() && canPermission('canEditSongs', authActor(), songServiceForPermission(service));
}
export function canManagePresiders() {
  return !!authActor() && canPermission('canManageLeaders', authActor());
}
export function canRunAction(act, el) {
  const actor = authActor();
  if (act === 'site-unlock' || act === 'login-member') return true;
  if (act === 'member-login') return !isVerifiedSession() && !isForcedSession();
  if (act === 'member-change-pin') return isForcedSession();
  if (act === 'member-logout') return isVerifiedSession();
  if (act === 'home') return true;
  if (!isVerifiedSession() || isForcedSession()) return false;
  if (act === 'tab') {
    if (el.dataset.tab === 'manage') return canManageAnyDepartment();
    if (el.dataset.tab === 'songs') return canEditSongService(findService(ui.songSvc)) ||
      canPermission('canEditSongs', actor, {}) ||
      dutiesFor(ui.me).some(duty => duty.duty === 'Presider');
    return el.dataset.tab === 'schedule' || el.dataset.tab === 'my';
  }
  if (act === 'open-manage-queue') return canManageAnyDepartment();
  if (act === 'sub') {
    if (el.dataset.sub === 'leaders') return canPermission('canManageLeaders', actor);
    if (el.dataset.sub === 'features' || el.dataset.sub === 'data') return canPermission('isAdmin', actor);
    return canManageAnyDepartment();
  }
  if (['department-open', 'department-back', 'department-back-member', 'department-retry', 'department-member-open'].indexOf(act) !== -1) {
    return canManageAnyDepartment();
  }
  if (act === 'department-override-submit') {
    const department = dutyCategory(el.dataset.duty).name;
    return canPermission('isAdmin', actor) && canPermission('canManageDepartment', actor, department);
  }
  if (['department-member-add', 'department-status', 'department-profile-save', 'department-profile-reset',
    'department-exception-add', 'department-exception-remove'].indexOf(act) !== -1) {
    const department = el.dataset.dept || selectedManageDepartment();
    return canManageSelectedDepartment(department);
  }
  if (['member-availability-save', 'member-availability-reset',
    'member-availability-exception-add', 'member-availability-exception-remove'].indexOf(act) !== -1) {
    return isOwnDepartmentProfile(el.dataset.dept, el.dataset.uid);
  }
  if (act === 'member-availability-retry') return isVerifiedSession();
  if (act === 'member-availability-recurring') {
    return isOwnDepartmentProfile(el.dataset.dept, el.dataset.uid);
  }
  if (['department-eligible', 'department-schedulable', 'department-recurring'].indexOf(act) !== -1) {
    return canManageSelectedDepartment(el.dataset.dept || selectedManageDepartment());
  }
  if (act === 'lock-now') return canManageAnyDepartment();
  if (act === 'open-songs') return canEditSongService(findService(el.dataset.svc)) || canPermission('canEditSongs', actor, {});
  if (['close-songs', 'dept-filter', 'dismiss-banner', 'toggle-past', 'clear-alerts',
    'notify-on', 'notify-off', 'subscribe-ics', 'copy-ics', 'expand', 'req-open',
    'req-cancel'].indexOf(act) !== -1) return true;
  if (act === 'req-submit') {
    const service = findService(el.dataset.svc);
    return !!service && service.assignments && service.assignments[el.dataset.duty] === ui.me;
  }
  if (act === 'req-approve' || act === 'req-decline') {
    const request = findRequest(el.dataset.id);
    return !!request && canPermission('canResolveRequest', actor, request);
  }
  if (act === 'req-open-service') return canManageAnyDepartment();
  if (act === 'assign' || act === 'plan-assign') {
    return canPermission('canEditDuty', actor, el.dataset.duty);
  }
  if (act === 'svc-field') {
    const service = findService(el.dataset.svc);
    return el.dataset.field === 'choirSong'
      ? canEditSongService(service)
      : canPermission('isAdmin', actor);
  }
  if (act === 'member-name') return canPermission('isAdmin', actor);
  if (act === 'member-cat') return canPermission('canManageDepartmentMember', actor, el.dataset.cat, { name: el.dataset.name });
  if (['role-config', 'role-config-add', 'role-config-remove'].indexOf(act) !== -1) {
    return canPermission('canManageLeaders', actor);
  }
  if (act === 'manage-dept') return authorizedDepartments().indexOf(el.value) !== -1;
  if (['change-site-pin', 'set-pin', 'unlock', 'change-pin', 'feature', 'scheduler-name',
    'sheet-url', 'import-file', 'export', 'reset', 'unify-names'].indexOf(act) !== -1) {
    return canPermission('isAdmin', actor);
  }
  if (act === 'add-service') return canPermission('canCreateService', actor);
  if (act === 'del-service') return canPermission('isAdmin', actor);
  if (act === 'add-member') {
    const department = selectedManageDepartment();
    return department === 'All'
      ? canPermission('isAdmin', actor)
      : canPermission('canManageDepartmentMember', actor, department, { name: ui.loginMember || '' });
  }
  if (act === 'del-member' || act === 'reset-member-pin') {
    const target = { name: canonicalMemberName(el.dataset.name), departments: [el.dataset.dept || selectedManageDepartment()] };
    if (act === 'reset-member-pin') return canPermission('canResetPin', actor, target);
    const department = el.dataset.dept || selectedManageDepartment();
    return department === 'All'
      ? canPermission('isAdmin', actor)
      : canPermission('canManageDepartmentMember', actor, department, target);
  }
  if (act === 'conflict-ok' || act === 'conflict-unok') {
    const service = findService(el.dataset.svc);
    const conflict = service && conflictsFor(service).find(item => item.name === el.dataset.name);
    return !!conflict && canPermission('canAcknowledgeConflict', actor, Object.assign({}, conflict, {
      serviceId: el.dataset.svc, date: service.date, service: service.service
    }));
  }
  return canManageAnyDepartment();
}
export function saveRoleConfiguration(roleType, department, memberName, enabled) {
  const target = canonicalMemberName(memberName);
  if (!target) return Promise.reject(new Error('Choose a member first.'));
  return authCall('updateRoleConfiguration', {
    roleType,
    department: department || '',
    memberName: target,
    enabled: enabled === true
  }).then(result => {
    if (result && result.config) state.permissionConfig = result.config;
    addBanner(enabled ? 'Role access added.' : 'Role access removed.');
    render();
    return result;
  }).catch(error => {
    addBanner(safeAuthMessage(error), true);
    render();
    throw error;
  });
}
export function handleAct(act, el) {
  if (!canRunAction(act, el)) {
    addBanner('You are not allowed to perform that action.', true);
    return;
  }
  if (act === 'member-login') {
    memberLogin();
  }
  else if (act === 'member-change-pin') {
    memberChangePin();
  }
  else if (act === 'member-logout') {
    memberLogout();
  }
  else if (act === 'open-manage-queue') {
    ui.tab = 'manage';
    ui.sub = 'requests';
    render();
  }
  else if (act === 'home') {
    ui.tab = 'schedule';
    ui.songSvc = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  else if (act === 'tab') {
    ui.tab = el.dataset.tab;
    if (ui.tab === 'my') localStorage.setItem('wds-unread-' + ui.me, '0');
    // The Presider tab always opens the song planner on its Home view,
    // never a setlist left over from an earlier "Pick songs" deep link.
    if (ui.tab === 'songs') { ui.songSvc = null; ui.songNav = true; }
    render();
  }
  else if (act === 'sub') {
    ui.sub = el.dataset.sub;
    if (ui.sub === 'departments' && !ui.departmentView) ui.departmentView = 'list';
    render();
  }
  else if (act === 'role-config-add') {
    const select = el.querySelector('select');
    saveRoleConfiguration(el.dataset.role, el.dataset.dept || '', select && select.value, true).catch(() => {});
  }
  else if (act === 'role-config-remove') {
    saveRoleConfiguration(el.dataset.role, el.dataset.dept || '', el.dataset.name, false).catch(() => {});
  }
  else if (act === 'department-open') {
    const department = el.dataset.department;
    if (!department || authorizedDepartments().indexOf(department) === -1) return;
    ui.manageDept = department;
    ui.sub = 'departments';
    ui.departmentView = 'department';
    ui.departmentMember = '';
    loadDepartmentRoster(department).catch(() => {});
    render();
  }
  else if (act === 'department-member-open') {
    const department = selectedManageDepartment();
    if (!department || department === 'All' || !departmentProfile(department, el.dataset.uid)) return;
    ui.departmentView = 'member';
    ui.departmentMember = el.dataset.uid;
    render();
  }
  else if (act === 'department-back') {
    ui.departmentView = 'list';
    ui.departmentMember = '';
    render();
  }
  else if (act === 'department-back-member') {
    ui.departmentView = 'department';
    ui.departmentMember = '';
    render();
  }
  else if (act === 'department-retry') {
    const department = el.dataset.department || selectedManageDepartment();
    if (department) loadDepartmentRoster(department, { force: true }).catch(() => {});
    render();
  }
  else if (act === 'member-availability-retry') {
    departmentRuntime.ownLoaded = false;
    departmentRuntime.ownError = '';
    loadOwnDepartmentProfiles().catch(() => {});
    render();
  }
  else if (act === 'member-availability-save') {
    saveOwnDepartmentAvailability(el.dataset.dept, el.dataset.uid).catch(error => {
      addBanner('Your availability was not saved: ' + departmentErrorMessage(error), true);
      renderSoon();
    });
  }
  else if (act === 'member-availability-reset') {
    delete departmentRuntime.drafts[departmentRuntimeKey(el.dataset.dept, el.dataset.uid)];
    render();
  }
  else if (act === 'member-availability-exception-add') {
    const department = el.dataset.dept;
    const memberUid = el.dataset.uid;
    if (!isOwnDepartmentProfile(department, memberUid)) return;
    const fields = el.querySelectorAll('input, select');
    const date = String(fields[0] && fields[0].value || '').trim();
    const key = String(fields[1] && fields[1].value || '').trim().toLocaleLowerCase();
    const status = String(fields[2] && fields[2].value || '').trim().toLocaleLowerCase();
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !key || !['available', 'unavailable'].includes(status)) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (!availability.exceptions[date]) availability.exceptions[date] = {};
    availability.exceptions[date][key] = status;
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'member-availability-exception-remove') {
    const department = el.dataset.dept;
    const memberUid = el.dataset.uid;
    if (!isOwnDepartmentProfile(department, memberUid)) return;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (availability.exceptions[el.dataset.date]) {
      delete availability.exceptions[el.dataset.date][el.dataset.key];
      if (!Object.keys(availability.exceptions[el.dataset.date]).length) delete availability.exceptions[el.dataset.date];
    }
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'department-member-add') {
    const department = selectedManageDepartment();
    const uidInput = document.getElementById('department-member-uid');
    const nameInput = document.getElementById('department-member-name');
    const memberUid = String(uidInput && uidInput.value || '').trim();
    const memberName = String(nameInput && nameInput.value || '').trim();
    if (!department || department === 'All' || !memberUid || !memberName) return;
    const data = {
      departmentId: department,
      memberUid,
      memberName,
      status: 'active',
      eligibleDuties: [],
      schedulable: false,
      availability: { recurring: {}, exceptions: {} }
    };
    const save = fb ? authCall('createDepartmentProfile', data) : Promise.resolve({ ok: true, profile: Object.assign({}, data, {
      uid: memberUid, role: 'member', updatedAt: Date.now(), updatedByUid: authActor() && authActor().uid
    }) });
    save.then(result => {
      if (!result || !result.profile || !replaceDepartmentProfile(result.profile)) throw new Error('The new department profile response was not valid.');
      addBanner(memberLabel(memberName) + ' was added to ' + department + '.');
      render();
    }).catch(error => {
      addBanner('The department member was not added: ' + departmentErrorMessage(error), true);
      render();
    });
  }
  else if (act === 'department-status') {
    const department = selectedManageDepartment();
    const memberUid = el.dataset.uid;
    const status = el.dataset.status === 'inactive' ? 'inactive' : 'active';
    if (!department || department === 'All' || !departmentProfile(department, memberUid)) return;
    departmentPatch(department, memberUid, { status }).then(() => saveDepartmentProfile(department, memberUid)).catch(() => {});
  }
  else if (act === 'department-profile-save') {
    saveDepartmentProfile(el.dataset.dept || selectedManageDepartment(), el.dataset.uid).catch(() => {});
  }
  else if (act === 'department-profile-reset') {
    delete departmentRuntime.drafts[departmentRuntimeKey(el.dataset.dept || selectedManageDepartment(), el.dataset.uid)];
    render();
  }
  else if (act === 'department-exception-add') {
    const department = selectedManageDepartment();
    const memberUid = ui.departmentMember;
    const date = String(document.getElementById('department-exception-date')?.value || '').trim();
    const key = String(document.getElementById('department-exception-time')?.value || '').trim().toLocaleLowerCase();
    const status = String(document.getElementById('department-exception-status')?.value || '').trim().toLocaleLowerCase();
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !key || !['available', 'unavailable'].includes(status)) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (!availability.exceptions[date]) availability.exceptions[date] = {};
    availability.exceptions[date][key] = status;
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'department-exception-remove') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid || ui.departmentMember;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    if (availability.exceptions[el.dataset.date]) {
      delete availability.exceptions[el.dataset.date][el.dataset.key];
      if (!Object.keys(availability.exceptions[el.dataset.date]).length) delete availability.exceptions[el.dataset.date];
    }
    departmentPatch(department, memberUid, { availability });
  }
  else if (act === 'department-override-submit') {
    const svc = findService(el.dataset.svc);
    const duty = el.dataset.duty;
    const target = document.getElementById(el.dataset.target);
    const reason = document.getElementById(el.dataset.reason);
    const profile = svc && departmentProfile(dutyCategory(duty).name, target && target.value);
    const textReason = String(reason && reason.value || '').trim();
    if (!svc || !profile || !textReason) {
      addBanner('Choose a member and enter the required administrator override reason.', true);
      render();
      return;
    }
    assignDepartmentDutyForService(svc, duty, profile, { override: true, reason: textReason }).catch(() => {});
  }
  else if (act === 'open-songs') { ui.songSvc = el.dataset.svc || null; ui.songNav = true; ui.tab = 'songs'; render(); }
  else if (act === 'close-songs') { ui.tab = 'my'; ui.songSvc = null; render(); }
  else if (act === 'dept-filter') { ui.deptFilter = el.dataset.val; localStorage.setItem('wds-dept', ui.deptFilter); render(); }
  else if (act === 'dismiss-banner') { ui.banners.splice(Number(el.dataset.i), 1); renderBanners(); }
  else if (act === 'toggle-past') { ui.showPast = !ui.showPast; render(); }
  else if (act === 'clear-alerts') {
    // Clears only this member's "Recent updates" list on this device. Duties,
    // the schedule and change requests are untouched.
    localStorage.removeItem('wds-alerts-' + ui.me);
    localStorage.setItem('wds-unread-' + ui.me, '0');
    render();
  }
  else if (act === 'expand') { ui.expanded[el.dataset.id] = !ui.expanded[el.dataset.id]; render(); }
  else if (act === 'notify-on') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        localStorage.setItem('wds-notify', '1');
        sysNotify('Notifications are on', 'You\'ll hear about new duties and get reminders here.');
        registerPush();
      } else {
        alert('Notifications were blocked. You can allow them in your browser settings.');
      }
      render();
    });
  }
  else if (act === 'notify-off') { localStorage.setItem('wds-notify', '0'); unregisterPush(); render(); }
  else if (act === 'site-unlock') {
    sha256(document.getElementById('site-pin-input').value).then(h => {
      if (h === siteHash()) {
        localStorage.setItem('wds-site-unlock', h);
        ui.sitePinError = '';
      } else {
        ui.sitePinError = 'That passcode is not right.';
      }
      render();
    });
  }
  else if (act === 'change-site-pin') {
    const v = document.getElementById('site-pin-change').value;
    if (!/^\d{4}$/.test(v)) { alert('Use exactly 4 digits.'); return; }
    sha256(v).then(h => {
      state.settings.sitePinHash = h;
      localStorage.setItem('wds-site-unlock', h);
      persistSettings();
      render();
      alert('Site passcode changed. Everyone else will need the new one the next time they open the app.');
    });
  }
  else if (act === 'unlock') {
    sha256(document.getElementById('pin-input').value).then(h => {
      if (h === state.settings.pinHash) {
        localStorage.setItem('wds-unlock', h);
        ui.pinError = '';
      } else {
        ui.pinError = 'That passcode is not right.';
      }
      render();
    });
  }
  else if (act === 'set-pin') {
    const a = document.getElementById('pin-new').value;
    const b = document.getElementById('pin-confirm').value;
    if (a.length < 4) { ui.pinError = 'Use at least 4 characters.'; render(); return; }
    if (a !== b) { ui.pinError = 'The two entries don\'t match.'; render(); return; }
    sha256(a).then(h => {
      state.settings.pinHash = h;
      localStorage.setItem('wds-unlock', h);
      ui.pinError = '';
      persistSettings();
      render();
    });
  }
  else if (act === 'change-pin') {
    const v = document.getElementById('pin-change').value;
    if (v.length < 4) { alert('Use at least 4 characters.'); return; }
    sha256(v).then(h => {
      state.settings.pinHash = h;
      localStorage.setItem('wds-unlock', h);
      persistSettings();
      render();
      alert('Passcode changed. Other editors will need the new one.');
    });
  }
  else if (act === 'lock-now') {
    localStorage.removeItem('wds-unlock');
    render();
  }
  else if (act === 'subscribe-ics') { subscribeICS(); }
  else if (act === 'copy-ics') { copyICSLink(); }
  else if (act === 'add-service') {
    const svc = {
      date: document.getElementById('svc-date').value,
      time: document.getElementById('svc-time').value,
      service: document.getElementById('svc-label').value,
      worship: document.getElementById('svc-worship').value.trim() || 'Sabbath Day',
      choirSong: '',
      assignments: {}
    };
    if (!svc.date || !svc.time) return;
    if (findService(svcId(svc))) { alert('That service already exists on that date.'); return; }
    state.services.push(svc);
    ui.expanded['m:' + svcId(svc)] = true;
    persistService(svc);
    afterDataChange();
  }
  else if (act === 'del-service') {
    const svc = findService(el.dataset.svc);
    if (svc && confirm('Delete "' + svc.worship + ' ' + svc.service + '" on ' + fmtDate(svc.date) + '?')) {
      state.services = state.services.filter(s => s !== svc);
      persistDeleteService(el.dataset.svc);
      afterDataChange();
    }
  }
  else if (act === 'add-member') {
    const input = document.getElementById('member-name');
    const name = canonicalMemberName(input && input.value);
    if (!name) return;
    const department = el.dataset.dept && el.dataset.dept !== 'All' ? el.dataset.dept : '';
    if (department) {
      if (!state.departments) state.departments = {};
      const roster = state.departments[department] || (state.departments[department] = []);
      if (roster.indexOf(name) !== -1) { alert(name + ' is already in this department.'); return; }
      roster.push(name);
      roster.sort();
      persistDepartmentMembership(department, name, 'active').catch(error => {
        state.departments[department] = roster.filter(member => member !== name);
        addBanner(safeAuthMessage(error), true);
        render();
      });
    } else {
      if (state.members.indexOf(name) !== -1) { alert(name + ' is already on the list.'); return; }
      state.members.push(name);
      state.members.sort();
      persistMembers();
    }
    render();
  }
  else if (act === 'del-member') {
    const name = canonicalMemberName(el.dataset.name);
    const department = el.dataset.dept && el.dataset.dept !== 'All' ? el.dataset.dept : '';
    const n = dutiesFor(name).length;
    const question = department
      ? 'Archive ' + name + ' from ' + department + '? Existing assignments stay in history.'
      : 'Remove ' + name + '?' + (n ? ' They will be taken off ' + n + ' upcoming duties.' : '');
    if (confirm(question)) {
      if (department) {
        const roster = (state.departments && state.departments[department]) || [];
        state.departments[department] = roster.filter(member => member !== name);
        persistDepartmentMembership(department, name, 'archived').catch(error => {
          state.departments[department] = roster;
          addBanner(safeAuthMessage(error), true);
          render();
        });
        afterDataChange();
        return;
      }
      state.members = state.members.filter(m => m !== name);
      const touched = [];
      state.services.forEach(svc => {
        Object.keys(svc.assignments || {}).forEach(duty => {
          if (svc.assignments[duty] === name) { delete svc.assignments[duty]; touched.push(svc); }
        });
      });
      let deptsChanged = false;
      Object.keys(state.departments || {}).forEach(cat => {
        const roster = state.departments[cat];
        const idx = roster.indexOf(name);
        if (idx !== -1) { roster.splice(idx, 1); deptsChanged = true; }
      });
      persistMembers();
      touched.forEach(persistService);
      if (deptsChanged) persistDepartments();
      if (ui.me === name) { ui.me = ''; localStorage.removeItem('wds-me'); }
      afterDataChange();
    }
  }
  else if (act === 'reset-member-pin') {
    const name = canonicalMemberName(el.dataset.name);
    if (!name || !confirm('Reset the member PIN for ' + name + '?')) return;
    authCall('resetMemberPin', { memberId: name }).then(() => {
      addBanner('The PIN for ' + name + ' was reset. They must choose a new PIN at sign-in.');
      render();
    }).catch(error => {
      addBanner(safeAuthMessage(error), true);
      render();
    });
  }
  else if (act === 'conflict-ok') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    const c = conflictsFor(svc).find(x => x.name === el.dataset.name);
    if (!c) return;
    if (!svc.conflictOk) svc.conflictOk = {};
    // prune stale entries that no longer match a current conflict, keep documents tidy
    const current = conflictsFor(svc);
    Object.keys(svc.conflictOk).forEach(name => {
      const match = current.find(x => x.name === name);
      if (!match || !sameDuties(svc.conflictOk[name], match.duties)) delete svc.conflictOk[name];
    });
    svc.conflictOk[el.dataset.name] = c.duties;
    persistService(svc);
    afterDataChange();
  }
  else if (act === 'conflict-unok') {
    const svc = findService(el.dataset.svc);
    if (!svc || !svc.conflictOk) return;
    delete svc.conflictOk[el.dataset.name];
    persistService(svc);
    afterDataChange();
  }
  else if (act === 'plan-assign') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    const duty = el.dataset.duty;
    const profile = departmentProfile(dutyCategory(duty).name, el.dataset.uid);
    if (!profile) {
      addBanner('The secure department roster is not loaded for this suggestion.', true);
      render();
      return;
    }
    assignDepartmentDutyForService(svc, duty, profile).catch(() => {});
  }
  else if (act === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'worship-schedule-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  else if (act === 'sheet-sync') { syncFromSheet(true); }
  else if (act === 'reset') {
    if (confirm('Replace ALL current data with the original spreadsheet schedule?')) {
      setState(seedState());
      persistAll();
      afterDataChange();
    }
  }
  else if (act === 'unify-names') {
    if (!confirm('Merge leftover name variants (e.g. "B. Anthony L" → "B. Anthony") across members and all services?')) return;
    const { membersChanged, membersMerged, touchedServices, departmentsChanged } = applyNameMap(unifiedNameMap());
    if (membersChanged) persistMembers();
    touchedServices.forEach(persistService);
    if (departmentsChanged) persistDepartments();
    const canon = unifiedNameMap()[ui.me];
    if (canon) {
      ['wds-alerts-', 'wds-seen-', 'wds-unread-'].forEach(prefix => {
        const oldKey = prefix + ui.me, newKey = prefix + canon;
        if (prefix === 'wds-unread-') {
          const merged = Math.max(Number(localStorage.getItem(oldKey) || 0), Number(localStorage.getItem(newKey) || 0));
          localStorage.setItem(newKey, String(merged));
        } else {
          const oldVal = getJSON(oldKey, []), newVal = getJSON(newKey, []);
          localStorage.setItem(newKey, JSON.stringify(newVal.concat(oldVal)));
        }
        localStorage.removeItem(oldKey);
      });
      ui.me = canon;
      localStorage.setItem('wds-me', canon);
      registerPush();
    }
    alert('Unified names: ' + membersMerged + ' member' + (membersMerged === 1 ? '' : 's') + ' merged, ' +
      touchedServices.length + ' service' + (touchedServices.length === 1 ? '' : 's') + ' updated.');
    afterDataChange();
  }
  else if (act === 'req-open') {
    ui.reqForm = { key: el.dataset.key, note: '' };
    render();
  }
  else if (act === 'req-cancel') {
    ui.reqForm = null;
    render();
  }
  else if (act === 'req-submit') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    const createdAt = Date.now();
    const req = {
      id: requestId(el.dataset.svc, el.dataset.duty, createdAt),
      name: ui.me,
      memberId: verifiedSession.memberId,
      requesterUid: (authUser && authUser.uid) || '',
      svcId: el.dataset.svc,
      date: svc.date,
      service: svc.service,
      worship: svc.worship,
      duty: el.dataset.duty,
      department: actionableDepartmentForDuty(el.dataset.duty),
      note: (ui.reqForm && ui.reqForm.note) || '',
      status: 'pending',
      createdAt
    };
    state.requests.push(req);
    ui.reqForm = null;
    persistRequest(req);
    afterDataChange();
  }
  else if (act === 'req-approve') {
    resolveRequest(el.dataset.id, 'approved');
    afterDataChange();
  }
  else if (act === 'req-decline') {
    resolveRequest(el.dataset.id, 'declined');
    afterDataChange();
  }
  else if (act === 'req-open-service') {
    ui.sub = 'services';
    ui.expanded['m:' + el.dataset.svc] = true;
    render();
  }
}
export function handleChg(chg, el) {
  if (chg === 'login-member') {
    ui.loginMember = canonicalMemberName(el.value);
    ui.authError = '';
    return;
  }
  if (!canRunAction(chg, el)) {
    addBanner('You are not allowed to perform that action.', true);
    return;
  }
  if (chg === 'me') return;
  if (chg === 'member-availability-recurring') {
    const department = el.dataset.dept;
    const memberUid = el.dataset.uid;
    const profile = departmentDraftProfile(department, memberUid);
    if (!isOwnDepartmentProfile(department, memberUid) || !profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    availability.recurring[el.dataset.key] = el.value === 'available' ? 'available' : 'unavailable';
    departmentPatch(department, memberUid, { availability });
    return;
  }
  if (chg === 'manage-dept') {
    ui.manageDept = el.value;
    if (ui.manageDept !== 'All' && authorizedDepartments().indexOf(ui.manageDept) === -1) {
      ui.manageDept = authorizedDepartments()[0] || '';
    }
    ui.departmentView = 'list';
    ui.departmentMember = '';
    render();
  }
  else if (chg === 'assign') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    if (!el.value) {
      unassignDepartmentDutyForService(svc, el.dataset.duty).catch(() => {});
      return;
    }
    const profile = departmentProfile(dutyCategory(el.dataset.duty).name, el.value);
    if (!profile) {
      addBanner('That department member is not in the secure roster. Reload the department and try again.', true);
      render();
      return;
    }
    assignDepartmentDutyForService(svc, el.dataset.duty, profile).catch(() => {});
  }
  else if (chg === 'department-eligible') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const eligible = profile.eligibleDuties.slice();
    const index = eligible.findIndex(duty => duty.toLocaleLowerCase() === String(el.dataset.duty || '').toLocaleLowerCase());
    if (el.checked && index === -1) eligible.push(el.dataset.duty);
    if (!el.checked && index !== -1) eligible.splice(index, 1);
    departmentPatch(department, memberUid, { eligibleDuties: eligible });
  }
  else if (chg === 'department-schedulable') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid;
    if (departmentProfile(department, memberUid)) departmentPatch(department, memberUid, { schedulable: el.checked });
  }
  else if (chg === 'department-recurring') {
    const department = el.dataset.dept || selectedManageDepartment();
    const memberUid = el.dataset.uid;
    const profile = departmentDraftProfile(department, memberUid);
    if (!profile) return;
    const availability = normalizeDepartmentAvailability(profile.availability);
    availability.recurring[el.dataset.key] = el.value === 'available' ? 'available' : 'unavailable';
    departmentPatch(department, memberUid, { availability });
  }
  else if (chg === 'svc-field') {
    const svc = findService(el.dataset.svc);
    if (!svc) return;
    const oldId = svcId(svc);
    if (el.dataset.field === 'choirSong') svc.choirSong = el.value;
    else if (el.value) svc[el.dataset.field] = el.value;
    const newId = svcId(svc);
    if (newId !== oldId) { persistDeleteService(oldId); ui.expanded['m:' + newId] = true; }
    persistService(svc);
    afterDataChange();
  }
  else if (chg === 'member-name') {
    const oldName = el.dataset.old, newName = el.value.trim();
    if (!newName || newName === oldName) return;
    if (state.members.indexOf(newName) !== -1) { alert(newName + ' already exists.'); return; }
    state.members = state.members.map(m => (m === oldName ? newName : m)).sort();
    const touched = [];
    state.services.forEach(svc => {
      Object.keys(svc.assignments || {}).forEach(duty => {
        if (svc.assignments[duty] === oldName) { svc.assignments[duty] = newName; touched.push(svc); }
      });
    });
    let deptsChanged = false;
    Object.keys(state.departments || {}).forEach(cat => {
      const roster = state.departments[cat];
      const idx = roster.indexOf(oldName);
      if (idx === -1) return;
      roster.splice(idx, 1);
      if (roster.indexOf(newName) === -1) roster.push(newName);
      roster.sort();
      deptsChanged = true;
    });
    if (ui.me === oldName) { ui.me = newName; localStorage.setItem('wds-me', newName); }
    persistMembers();
    touched.forEach(persistService);
    if (deptsChanged) persistDepartments();
    afterDataChange();
  }
  else if (chg === 'member-cat') {
    const name = el.dataset.name, cat = el.dataset.cat;
    if (!state.departments) state.departments = {};
    const roster = state.departments[cat] || (state.departments[cat] = []);
    const idx = roster.indexOf(name);
    if (el.checked) { if (idx === -1) roster.push(name); }
    else if (idx !== -1) roster.splice(idx, 1);
    roster.sort();
    persistDepartmentMembership(cat, name, el.checked ? 'active' : 'archived').catch(error => {
      if (el.checked) state.departments[cat] = roster.filter(member => member !== name);
      else state.departments[cat] = roster.concat(name).sort();
      addBanner(safeAuthMessage(error), true);
      render();
    });
    render();
  }
  else if (chg === 'role-config') {
    const roleType = el.dataset.role;
    const department = el.dataset.dept || '';
    const memberName = canonicalMemberName(el.dataset.name);
    authCall('updateRoleConfiguration', {
      roleType, department, memberName, enabled: el.checked
    }).then(result => {
      if (result && result.config) state.permissionConfig = result.config;
      addBanner('Role access updated.');
      render();
    }).catch(error => {
      el.checked = !el.checked;
      addBanner(safeAuthMessage(error), true);
      render();
    });
  }
  else if (chg === 'feature') {
    if (!state.settings.features) state.settings.features = {};
    state.settings.features[el.dataset.id] = el.checked;
    persistSettings();
    render();
  }
  else if (chg === 'req-note') {
    if (ui.reqForm && ui.reqForm.key === el.dataset.key) ui.reqForm.note = el.value;
    // no render(): keeps focus in the textarea while typing; snapshot re-renders
    // elsewhere already restore this value from ui.reqForm.
  }
  else if (chg === 'scheduler-name') {
    state.settings.schedulerName = el.value;
    persistSettings();
    render();
  }
  else if (chg === 'sheet-url') {
    state.settings.sheetUrl = el.value.trim();
    persistSettings();
    render();
  }
  else if (chg === 'import-file') {
    const file = el.files && el.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj && Array.isArray(obj.members) && Array.isArray(obj.services)) {
          // Backfill sections an older/partial backup may omit, so persistAll()
          // never writes { map: undefined } etc. into Firestore (mirrors loadLocal).
          if (!obj.settings) obj.settings = { features: {}, pinHash: '' };
          if (!obj.departments) obj.departments = {};
          if (!Array.isArray(obj.requests)) obj.requests = [];
          setState(obj);
          persistAll();
          afterDataChange();
          alert('Schedule imported.');
        } else alert('That file does not look like a schedule backup.');
      } catch (e) { alert('Could not read that file.'); }
    };
    reader.readAsText(file);
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM') return;
  if (e.target.closest('[data-chg]')) return;
  handleAct(el.dataset.act, el);
});
document.addEventListener('submit', e => {
  if (!e.target.dataset.act) return;
  e.preventDefault();
  handleAct(e.target.dataset.act, e.target);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (el) handleChg(el.dataset.chg, el);
});
/* Live-capture the change-request note as the member types, so a Firestore
   snapshot re-render mid-typing (see afterDataChange) can't lose the draft,
   'change' alone only fires on blur. */
document.addEventListener('input', e => {
  const el = e.target.closest('[data-chg="req-note"]');
  if (el) handleChg('req-note', el);
});
