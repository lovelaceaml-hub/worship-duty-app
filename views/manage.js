import {CATEGORIES, FEATURES, SERVICE_LABELS, WORSHIP_TYPES, feat, memberLabel, sheetUrl} from '../core/constants.js';
import {dutyCategory, esc, fmtDate, fmtTime, slugify, svcId, toISO, todayISO} from '../core/format.js';
import {authActor, authorizedDepartments, canManageAnyDepartment, canPermission, isForcedSession, isVerifiedSession, permissionConfig, selectedManageDepartment} from '../core/auth.js';
import {departmentRuntime, fb, state, ui} from '../core/state.js';
import {departmentProfileAssignable, departmentProfileByName, departmentProfiles, loadDepartmentRoster} from '../core/departments.js';
import {ALL_DUTIES_ORDER, activeConflicts, conflictsFor, sameDuties} from '../core/conflicts.js';
import {suggestSubs, workloadStats} from '../core/planning.js';
import {upcomingServices} from '../core/schedule.js';
import {getJSON} from '../core/notify.js';
import {actionableCountsForViewer, actionableDepartmentForDuty, requestIsActionable, effectiveRequestStatus, statusChip} from './requests.js';
import {renderDepartmentWorkspace} from './departments.js';
import {renderCatRows} from './schedule.js';

// The five appearance-dispatchable renderManage* siblings this module itself
// owns (renderManageServices, renderManagePlanning, renderManageRequests,
// renderFeatures, renderManageData) are renamed at their call site inside
// renderManage() below, for the same reason views/shell.js renames
// renderSiteLock to activeRenderSiteLock: app.js's post-host-bridge-patch
// copy is what renderManage() must dispatch to, and that copy cannot share
// a name with this module's own real implementation. renderManagePeople is
// also monkey-patched by host-bridge.js but nothing in this app currently
// calls it, so it needs no local dispatch alias. canEditSongService
// (actions/dispatch.js, Section 5) does not exist yet at this module's place
// in the moduleOrder and is pushed in the same way as core/session.js does
// for render/pulse.
let activeRenderManageServices, activeRenderManagePlanning, activeRenderManageRequests,
  activeRenderFeatures, activeRenderManageData, canEditSongService;
export function setManageActiveRenderRefs(servicesFn, planningFn, requestsFn, featuresFn, dataFn) {
  activeRenderManageServices = servicesFn;
  activeRenderManagePlanning = planningFn;
  activeRenderManageRequests = requestsFn;
  activeRenderFeatures = featuresFn;
  activeRenderManageData = dataFn;
}
export function setManagePermissionRefs(canEditSongServiceFn) { canEditSongService = canEditSongServiceFn; }

export function renderManage() {
  if (!isVerifiedSession() || isForcedSession() || !canManageAnyDepartment()) {
    return '<div class="empty">You do not have access to Manage.</div>';
  }
  const actionableCounts = actionableCountsForViewer();
  const pendingCount = actionableCounts.requests;
  const conflictCount = actionableCounts.conflicts;
  const departments = authorizedDepartments();
  const selectedDepartment = selectedManageDepartment();
  if (selectedDepartment && selectedDepartment !== 'All' && ['departments', 'services', 'planning'].indexOf(ui.sub) !== -1) {
    loadDepartmentRoster(selectedDepartment).catch(() => {});
  } else if (selectedDepartment === 'All' && ['services', 'planning'].indexOf(ui.sub) !== -1 && canPermission('isAdmin', authActor())) {
    CATEGORIES.forEach(category => loadDepartmentRoster(category.name).catch(() => {}));
  }
  const departmentOptions = departments.map(department =>
    '<option value="' + esc(department) + '"' + (selectedDepartment === department ? ' selected' : '') + '>' +
    esc(department === 'All' ? 'All Departments' : department) + '</option>'
  ).join('');
  const isAdministrator = canPermission('isAdmin', authActor());
  const subs = [['departments', 'Departments'], ['services', 'Services'],
    ['planning', 'Planning' + (conflictCount > 0 ? ' (' + conflictCount + ')' : '')],
    ['requests', 'Requests' + (pendingCount > 0 ? ' (' + pendingCount + ')' : '')]];
  if (canPermission('canManageLeaders', authActor())) subs.push(['leaders', 'Leader config']);
  if (isAdministrator) subs.push(['features', 'Features'], ['data', 'Data & Sync']);
  let html = '<div class="me-picker"><label for="manage-dept">Manage department</label>' +
    '<select id="manage-dept" data-chg="manage-dept">' + departmentOptions + '</select></div>' +
    '<div class="subnav">' + subs.map(s =>
    '<button data-act="sub" data-sub="' + s[0] + '"' + (ui.sub === s[0] ? ' class="active"' : '') + '>' + s[1] + '</button>').join('') +
    '<button class="lock-btn" data-act="member-logout">Sign out</button>' +
    '</div>';
  if (ui.sub === 'departments') html += renderDepartmentWorkspace();
  else if (ui.sub === 'services') html += activeRenderManageServices();
  else if (ui.sub === 'planning') html += activeRenderManagePlanning();
  else if (ui.sub === 'requests') html += activeRenderManageRequests();
  else if (ui.sub === 'people') html += renderDepartmentWorkspace();
  else if (ui.sub === 'leaders' && canPermission('canManageLeaders', authActor())) html += renderLeaderConfig();
  else if (ui.sub === 'features' && canPermission('isAdmin', authActor())) html += activeRenderFeatures();
  else if (ui.sub === 'data' && canPermission('isAdmin', authActor())) html += activeRenderManageData();
  else html += activeRenderManageServices();
  return html;
}
export function manageDepartment() {
  const department = selectedManageDepartment();
  return department === 'All' ? '' : department;
}
export function manageCategories() {
  const department = manageDepartment();
  return CATEGORIES.filter(category => !department || category.name === department);
}
export function manageServiceVisible(service) {
  const department = manageDepartment();
  if (!department) return true;
  const assignments = service && service.assignments || {};
  const roster = (state.departments && state.departments[department]) || [];
  return Object.keys(assignments).some(duty => actionableDepartmentForDuty(duty) === department ||
    (assignments[duty] && roster.indexOf(assignments[duty]) !== -1));
}
export function manageRequestVisible(request) {
  return !!request && canPermission('canResolveRequest', authActor(), request);
}
export function manageMemberVisible(name) {
  const department = manageDepartment();
  if (!department) return true;
  return ((state.departments || {})[department] || []).indexOf(name) !== -1;
}
export function renderFeatures() {
  let html = '<p class="hint">Turn features on or off for the whole congregation. Changes apply to everyone instantly.</p>';
  FEATURES.forEach(f => {
    html += '<div class="card feature-row">' +
      '<div><div class="f-label">' + esc(f.label) + '</div><div class="f-desc">' + esc(f.desc) + '</div></div>' +
      '<label class="switch"><input type="checkbox" data-chg="feature" data-id="' + f.id + '"' +
      ' aria-label="' + esc(f.label) + '"' + (feat(f.id) ? ' checked' : '') + '><span class="track"></span></label>' +
      '</div>';
  });
  html += '<div class="card"><div class="f-label">Change the editor passcode</div>' +
    '<form class="add-row" style="margin-top:12px" data-act="change-pin">' +
    '<input type="password" id="pin-change" aria-label="New editor passcode" placeholder="New passcode" autocomplete="off" required>' +
    '<button class="ghost" type="submit">Change</button></form></div>';
  html += '<div class="card"><div class="f-label">Change the site passcode</div>' +
    '<div class="f-desc">The 4-digit code everyone enters to open the app.</div>' +
    '<form class="add-row" style="margin-top:12px" data-act="change-site-pin">' +
    '<input type="password" id="site-pin-change" aria-label="New site passcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="New passcode" autocomplete="off" required>' +
    '<button class="ghost" type="submit">Change</button></form></div>';
  html += '<div class="card"><div class="f-label">Scheduler</div>' +
    '<div class="f-desc">Who receives a notification when a member submits a change request.</div>' +
    '<select data-chg="scheduler-name" style="margin-top:10px">' +
    '<option value="">None</option>' +
    state.members.map(m => '<option value="' + esc(m) + '"' + (m === (state.settings.schedulerName || '') ? ' selected' : '') + '>' + esc(memberLabel(m)) + '</option>').join('') +
    '</select></div>';
  return html;
}
export function renderLeaderConfig() {
  if (!canPermission('canManageLeaders', authActor())) return '<div class="empty">Leader configuration is restricted.</div>';
  const config = permissionConfig();
  const leaders = config.departmentLeaders || {};
  let html = '<div class="card"><div class="f-label">Department leaders</div>' +
    '<p class="hint">Only assigned leaders are listed. Add or remove access without searching through the whole congregation.</p>';
  CATEGORIES.forEach(category => {
    const names = Array.isArray(leaders[category.name]) ? leaders[category.name] : [];
    const available = state.members.filter(member => names.indexOf(member) === -1);
    html += '<section class="list-row" style="display:block"><div style="font-weight:650;margin-bottom:8px">' + esc(category.name) + '</div>' +
      (names.length ? names.map(member => '<div class="role-assignment"><span>' + esc(memberLabel(member)) + '</span>' +
        '<button class="danger-link" data-act="role-config-remove" data-role="departmentLeader" data-dept="' + esc(category.name) + '" data-name="' + esc(member) + '">Remove</button></div>').join('') : '<p class="hint">No leader assigned.</p>') +
      (available.length ? '<form class="add-row role-add" data-act="role-config-add" data-role="departmentLeader" data-dept="' + esc(category.name) + '">' +
        '<select aria-label="Add ' + esc(category.name) + ' leader" required><option value="">Choose a member</option>' +
        available.map(member => '<option value="' + esc(member) + '">' + esc(memberLabel(member)) + '</option>').join('') + '</select>' +
        '<button class="ghost" type="submit">Add leader</button></form>' : '') + '</section>';
  });
  const songEditors = Array.isArray(config.songEditors) ? config.songEditors : [];
  html += '</div><div class="card"><div class="f-label">Choir song editors</div>' +
    '<p class="hint">Song editors can change songs only. They do not receive Worship management access.</p>' +
    (songEditors.length ? songEditors.map(member => '<div class="role-assignment"><span>' + esc(memberLabel(member)) + '</span>' +
      '<button class="danger-link" data-act="role-config-remove" data-role="songEditor" data-name="' + esc(member) + '">Remove</button></div>').join('') : '<p class="hint">No song editor assigned.</p>') +
    '<form class="add-row role-add" data-act="role-config-add" data-role="songEditor">' +
      '<select aria-label="Add choir song editor" required><option value="">Choose a member</option>' +
      state.members.filter(member => songEditors.indexOf(member) === -1).map(member => '<option value="' + esc(member) + '">' + esc(memberLabel(member)) + '</option>').join('') + '</select>' +
      '<button class="ghost" type="submit">Add editor</button></form></div>';
  return html;
}
export function renderManagePlanning() {
  const t = todayISO();
  const stats = workloadStats();
  const upcoming = state.services
    .filter(s => s.date >= t)
    .filter(manageServiceVisible)
    .sort((a, b) => a.date.localeCompare(b.date) || SERVICE_LABELS.indexOf(a.service) - SERVICE_LABELS.indexOf(b.service));

  /* --- conflicts, with suggested subs --- */
  let confHtml = '';
  upcoming.forEach(svc => {
    activeConflicts(svc).filter(c => canPermission('canAcknowledgeConflict', authActor(), Object.assign({}, c, {
      serviceId: svcId(svc), date: svc.date, service: svc.service
    }))).forEach(c => {
      confHtml += '<div class="card plan-conflict"><div class="req-head"><span class="req-when"><b>' + esc(memberLabel(c.name)) + '</b> | ' +
        c.duties.map(esc).join(' + ') + '</span><span class="status-chip pending">Unresolved</span></div>' +
        '<div class="req-note" style="margin-top:2px">' + esc(svc.worship) + ' ' + esc(svc.service) + ', ' + esc(fmtDate(svc.date)) + '</div>';
      c.duties.forEach(duty => {
        const subs = suggestSubs(svc, duty, c.name, stats);
        confHtml += '<div class="plan-suggest"><span class="lab">' + esc(duty) + ' →</span> ' +
          (subs.length
            ? subs.map(profile => '<button class="ghost mini" data-act="plan-assign" data-svc="' + svcId(svc) +
                '" data-duty="' + esc(duty) + '" data-uid="' + esc(profile.memberUid) + '">' + esc(memberLabel(profile.memberName)) + '</button>').join(' ')
            : '<span class="plan-duties">no free member in this department</span>') +
          '</div>';
      });
      confHtml += '<div class="req-actions-row"><button class="ghost" data-act="req-open-service" data-svc="' + esc(svcId(svc)) + '">Open service</button>' +
        '<button class="linkish" data-act="conflict-ok" data-svc="' + esc(svcId(svc)) + '" data-name="' + esc(c.name) + '">Mark as OK</button></div></div>';
    });
  });
  let html = '<div class="f-label">Double-duty conflicts, upcoming</div>' +
    '<div class="f-desc">Review each double, open its service, or tap a suggested substitute. Already-acknowledged doubles are not listed.</div>' +
    (confHtml || '<div class="empty">No unresolved double-bookings. 🎉</div>');

  /* --- unfilled slots, next 28 days --- */
  /* A service only "expects" the duties that comparable services actually
     staff. Expected = duties filled in >=50% of PLANNED services of the same
     worship|service type. This avoids flagging roles a service never uses
     (e.g. Media/Translation on a weekday), which previously marked every
     service "unfilled". Fully-empty (not-yet-planned) services are skipped,
     that's a different signal than a partially-planned service with a gap. */
  const expFilled = {}, expCount = {};
  (state.services || []).forEach(s => {
    const assigned = Object.keys(s.assignments || {}).filter(d => s.assignments[d]);
    if (!assigned.length) return;
    const key = (s.worship || '') + '|' + (s.service || '');
    expCount[key] = (expCount[key] || 0) + 1;
    const f = expFilled[key] || (expFilled[key] = {});
    assigned.forEach(d => { f[d] = (f[d] || 0) + 1; });
  });
  const expectedDuties = svc => {
    const key = (svc.worship || '') + '|' + (svc.service || '');
    const f = expFilled[key] || {}, n = expCount[key] || 0;
    return n ? ALL_DUTIES_ORDER.filter(d => (f[d] || 0) * 2 >= n) : [];
  };
  const horizon = (() => { const d = new Date(); d.setDate(d.getDate() + 28); return toISO(d); })();
  let gapHtml = '';
  upcoming.filter(s => s.date <= horizon).forEach(svc => {
    const a = svc.assignments || {};
    if (!Object.keys(a).some(d => a[d])) return; // not yet planned, different signal
    const missing = expectedDuties(svc).filter(d => !a[d]);
    if (missing.length) {
      gapHtml += '<div class="plan-suggest"><span class="lab">' + esc(fmtDate(svc.date)) + ' · ' + esc(svc.service) + '</span> ' +
        '<span class="plan-duties">' + missing.length + ' unfilled: ' + missing.map(esc).join(', ') + '</span></div>';
    }
  });
  html += '<div class="card"><div class="f-label">Unfilled duties, next 4 weeks</div>' +
    (gapHtml || '<p class="hint" style="margin-top:12px">Every planned service has its usual duties filled.</p>') + '</div>';

  /* --- workload table --- */
  const rows = Object.keys(stats)
    .map(m => ({ m, s: stats[m] }))
    .filter(r => manageMemberVisible(r.m) && (r.s.total > 0 || state.members.indexOf(r.m) !== -1))
    .sort((a, b) => (b.s.past8 + b.s.upcoming) - (a.s.past8 + a.s.upcoming) || a.m.localeCompare(b.m));
  html += '<div class="card"><div class="f-label">Workload, who is carrying what</div>' +
    '<div class="f-desc">Duty counts. Sorted heaviest first (last 8 weeks + upcoming).</div>' +
    '<div class="plan-scroll"><table class="plan-table"><tr>' +
    '<th>Member</th><th>4 wk</th><th>8 wk</th><th>Upcoming</th><th>Year</th><th>Last served</th><th>Next</th></tr>' +
    rows.map(r => {
      const s = r.s;
      const flag = s.upcoming === 0 ? ' <span class="warn-badge" title="Nothing upcoming">·</span>' : '';
      return '<tr' + (s.past8 + s.upcoming === 0 ? ' class="plan-idle"' : '') + '><td>' + esc(r.m) + flag + '</td>' +
        '<td>' + s.past4 + '</td><td>' + s.past8 + '</td><td>' + s.upcoming + '</td><td>' + s.total + '</td>' +
        '<td>' + (s.last ? esc(fmtDate(s.last)) : '-') + '</td>' +
        '<td>' + (s.next ? esc(fmtDate(s.next)) : '-') + '</td></tr>';
    }).join('') +
    '</table></div></div>';
  return html;
}
export function memberSelect(svc, duty) {
  const cur = (svc.assignments || {})[duty] || '';
  const conflicted = feat('conflictWarnings') && cur && activeConflicts(svc).some(c => c.name === cur);
  const cat = dutyCategory(duty);
  const roster = departmentProfiles(cat.name);
  const candidates = roster.filter(profile => departmentProfileAssignable(profile, svc, duty));
  const currentProfile = departmentProfileByName(cat.name, cur);
  const currentIsCandidate = !!(currentProfile && candidates.some(profile => profile.memberUid === currentProfile.memberUid));
  let options = candidates.map(profile => '<option value="' + esc(profile.memberUid) + '"' +
    (currentIsCandidate && currentProfile.memberUid === profile.memberUid ? ' selected' : '') + '>' + esc(memberLabel(profile.memberName)) + '</option>');
  if (cur && !currentIsCandidate) {
    options.unshift('<option value="" selected disabled>Current assignment: ' + esc(memberLabel(cur)) + ' (review required)</option>');
  }
  if (!roster.length) options = ['<option value="" selected disabled>' + (departmentRuntime.loading[cat.name] ? 'Loading secure roster...' : 'Open this department to load the secure roster') + '</option>'];
  const select = '<select data-chg="assign" data-svc="' + svcId(svc) + '" data-duty="' + esc(duty) + '"' +
    (conflicted ? ' class="conflict"' : '') + '>' +
    '<option value="">-</option>' +
    options.join('') + '</select>';
  const canOverride = canPermission('isAdmin', authActor()) && roster.length && roster.some(profile => !candidates.some(candidate => candidate.memberUid === profile.memberUid));
  if (!canOverride) return select;
  const targetId = 'department-override-target-' + slugify(svcId(svc) + '-' + duty);
  const reasonId = 'department-override-reason-' + slugify(svcId(svc) + '-' + duty);
  const overrideOptions = roster.map(profile => '<option value="' + esc(profile.memberUid) + '">' + esc(memberLabel(profile.memberName)) +
    (departmentProfileAssignable(profile, svc, duty) ? ' (normal choice)' : ' (override required)') + '</option>').join('');
  return select + '<details class="department-override"><summary>Administrator override</summary>' +
    '<p class="department-override-warning">Use only when the normal eligibility, schedulability, or availability rules must be overridden. This records an audit event and never changes the member profile.</p>' +
    '<label for="' + targetId + '">Member</label><select id="' + targetId + '">' + overrideOptions + '</select>' +
    '<label for="' + reasonId + '">Reason</label><input id="' + reasonId + '" type="text" maxlength="240" placeholder="Required audit reason">' +
    '<button class="ghost mini" data-act="department-override-submit" data-svc="' + esc(svcId(svc)) + '" data-duty="' + esc(duty) + '" data-target="' + targetId + '" data-reason="' + reasonId + '">Record override and assign</button></details>';
}
export function renderManageConflicts(svc, expanded) {
  if (!feat('conflictWarnings')) return '';
  const id = svcId(svc);
  const ok = svc.conflictOk || {};
  let html = '';
  activeConflicts(svc).filter(c => canPermission('canAcknowledgeConflict', authActor(), Object.assign({}, c, {
    serviceId: id, date: svc.date, service: svc.service
  }))).forEach(c => {
    html += '<div class="conflict-note"><span class="dot-c" style="background:var(--warn)"></span>' +
      esc(memberLabel(c.name)) + ' has ' + c.duties.length + ' duties this service' +
      (expanded ? ' <button class="linkish" data-act="conflict-ok" data-svc="' + id + '" data-name="' + esc(c.name) + '">Mark as OK</button>' : '') +
      '</div>';
  });
  if (expanded) {
    conflictsFor(svc).filter(c => sameDuties(ok[c.name], c.duties) && canPermission('canAcknowledgeConflict', authActor(), Object.assign({}, c, {
      serviceId: id, date: svc.date, service: svc.service
    }))).forEach(c => {
      html += '<div class="conflict-note ok">' + esc(memberLabel(c.name)) + ' has ' + c.duties.length + ' duties (marked OK) ' +
        '<button class="linkish" data-act="conflict-unok" data-svc="' + id + '" data-name="' + esc(c.name) + '">show warning again</button></div>';
    });
  }
  return html;
}
export function reqSubmittedAt(r) {
  return new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function renderManageRequests() {
  const all = state.requests.filter(manageRequestVisible).slice().sort((a, b) => b.createdAt - a.createdAt);
  const pending = all.filter(requestIsActionable);
  const resolved = all.filter(r => !requestIsActionable(r));

  let html = '<p class="hint">Members can request a schedule change from My Duties. Approving here does not edit the schedule, ' +
    'open the service in <b>Services</b> to make the actual change.</p>';

  if (!pending.length) {
    html += '<div class="empty">No pending requests.</div>';
  } else {
    pending.forEach(r => {
      html += '<div class="card">' +
        '<div class="req-head"><span class="req-when">' + esc(memberLabel(r.name)) + ' | ' + esc(r.duty) + '</span>' + statusChip(r.status) + '</div>' +
        '<div class="req-note" style="margin-top:2px">' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) + '</div>' +
        (r.note ? '<div class="req-note">' + esc(r.note) + '</div>' : '') +
        '<div class="req-meta">Submitted ' + esc(reqSubmittedAt(r)) + '</div>' +
        '<div class="req-actions-row">' +
        '<button class="primary" data-act="req-approve" data-id="' + esc(r.id) + '">Approve</button>' +
        '<button class="danger-link" data-act="req-decline" data-id="' + esc(r.id) + '">Decline</button>' +
        '<button class="ghost" data-act="req-open-service" data-svc="' + esc(r.svcId) + '">Open service</button>' +
        '</div></div>';
    });
  }

  if (resolved.length) {
    const open = ui.expanded['req-resolved'];
    html += '<button class="linkish" data-act="expand" data-id="req-resolved">' +
      (open ? 'Hide resolved requests' : 'Show ' + Math.min(resolved.length, 10) + ' resolved request' + (resolved.length > 1 ? 's' : '')) +
      '</button>';
    if (open) {
      resolved.slice(0, 10).forEach(r => {
        const when = r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        html += '<div class="req-item">' +
          '<div class="req-head"><span class="req-when">' + esc(memberLabel(r.name)) + ' | ' + esc(r.duty) + '</span>' + statusChip(effectiveRequestStatus(r)) + '</div>' +
          '<div class="req-meta">' + esc(r.worship) + ' ' + esc(r.service) + ', ' + esc(fmtDate(r.date)) +
          (when ? ' · resolved ' + esc(when) + ((r.resolvedByName || r.resolvedBy) ? ' by ' + esc(r.resolvedByName || r.resolvedBy) : '') : '') + '</div>' +
          '</div>';
      });
    }
  }
  return html;
}
export function renderManageServices() {
  const canCreate = canPermission('canCreateService', authActor());
  let html = canCreate ? '<form class="add-row" data-act="add-service">' +
    '<input type="date" id="svc-date" required value="' + todayISO() + '">' +
    '<input type="time" id="svc-time" required value="09:00">' +
    '<select id="svc-label">' + SERVICE_LABELS.map(l => '<option>' + l + '</option>').join('') + '</select>' +
    '<input type="text" id="svc-worship" list="worship-types" placeholder="Worship (e.g. Sabbath Day)" value="Sabbath Day">' +
    '<datalist id="worship-types">' + WORSHIP_TYPES.map(w => '<option>' + esc(w) + '</option>').join('') + '</datalist>' +
    '<button class="primary" type="submit">Add</button></form>' :
    '<p class="hint">Select a service to edit duties in your authorized department.</p>';

  const up = upcomingServices().filter(manageServiceVisible);
  if (!up.length) html += '<div class="empty">No upcoming services. Add one above.</div>';
  let lastDate = '';
  up.forEach(svc => {
    if (svc.date !== lastDate) {
      lastDate = svc.date;
      html += '<div class="date-head"><span class="day">' + esc(fmtDate(svc.date)) + '</span></div>';
    }
    const id = svcId(svc);
    const open = ui.expanded['m:' + id];
    html += '<div class="card">' +
      '<button type="button" class="card-head" data-act="expand" data-id="m:' + id + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="svc-title">' + esc(svc.worship) + ' <small>· ' + esc(svc.service) + '</small></span>' +
      '<span class="time">' + fmtTime(svc.time) + ' ' + (open ? '▲' : '▼') + '</span></button>';
    if (open) {
        html += '<div class="edit-grid">' +
        '<span class="lab">Date</span><input type="date" value="' + esc(svc.date) + '" data-chg="svc-field" data-svc="' + id + '" data-field="date"' + (canPermission('isAdmin', authActor()) ? '' : ' disabled') + '>' +
        '<span class="lab">Time</span><input type="time" value="' + esc(svc.time) + '" data-chg="svc-field" data-svc="' + id + '" data-field="time"' + (canPermission('isAdmin', authActor()) ? '' : ' disabled') + '>' +
        '<span class="lab">Worship</span><input type="text" value="' + esc(svc.worship) + '" data-chg="svc-field" data-svc="' + id + '" data-field="worship"' + (canPermission('isAdmin', authActor()) ? '' : ' disabled') + '>' +
        (canEditSongService(svc) ? '<span class="lab">Choir song</span><input type="text" value="' + esc(svc.choirSong || '') + '" placeholder="e.g. #311 I Repent of My Sin" data-chg="svc-field" data-svc="' + id + '" data-field="choirSong">' : '') +
        '</div>';
      manageCategories().forEach(cat => {
        html += '<div class="cat-edit-label"><span class="dot-c" style="background:' + cat.color + '"></span>' + esc(cat.name) + '</div>' +
          '<div class="edit-grid">' +
          cat.duties.map(duty => '<span class="lab">' + esc(duty) + '</span>' + memberSelect(svc, duty)).join('') +
          '</div>';
      });
      html += renderManageConflicts(svc, true);
      html += '<div style="text-align:right;margin-top:12px"><button class="danger-link" data-act="del-service" data-svc="' + id + '">Delete this service</button></div>';
    } else {
      html += renderCatRows(svc, false, manageDepartment() || undefined);
    }
    html += '</div>';
  });
  return html;
}
export function renderManagePeople() {
  return renderDepartmentWorkspace();
}
export function renderSheetCard() {
  if (!fb) return ''; // only meaningful when live sync is on
  const res = getJSON('wds-sheet-sync-result', null);
  let status = 'Not synced yet on this device.';
  if (res && res.t) {
    const when = new Date(res.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    let detail;
    if (res.added || res.updated) {
      const parts = [];
      if (res.added) parts.push(res.added + ' added');
      if (res.updated) parts.push(res.updated + ' updated');
      detail = parts.join(', ') + ' service' + ((res.added + res.updated) > 1 ? 's' : '');
    } else {
      detail = 'everything matched';
    }
    status = 'Last checked ' + when + ' | ' + esc(detail);
  }

  let html = '<div class="card">' +
    '<div class="f-label">Google Sheet</div>' +
    '<div class="sync-status">' + esc(status) + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
    '<button class="ghost" data-act="sheet-sync"' + (ui.syncing ? ' disabled' : '') + '>' +
    (ui.syncing ? 'Syncing…' : 'Sync now') + '</button></div>' +
    '<input type="text" data-chg="sheet-url" value="' + esc(sheetUrl()) + '" style="width:100%;margin-top:10px" ' +
    'placeholder="Published-CSV link of the schedule sheet">' +
    '<div class="hint" style="margin:6px 2px 0">Published-CSV link of the schedule sheet (File → Share → Publish to web → CSV).</div>' +
    '<div class="hint" style="margin:8px 2px 0">The sheet is the source of truth for the duties it lists. Media Booth, Parking Lot, Offering, choir songs, and extra services added here are kept.</div>';

  const msgs = (res && res.warningMsgs) || [];
  if (msgs.length) {
    html += '<div class="sync-status" style="margin-top:8px">Skipped from the sheet:</div>' +
      '<ul class="sync-warnings">' +
      msgs.slice(0, 3).map(w => '<li>' + esc(w) + '</li>').join('') +
      (msgs.length > 3 ? '<li>+' + (res.warnings - 3) + ' more</li>' : '') +
      '</ul>';
  }
  html += '</div>';
  return html;
}
export function renderManageData() {
  let syncCard;
  if (fb) {
    syncCard = '<div class="card"><p><b style="color:var(--ok)">Live sync is on.</b> Every member sees schedule changes instantly, on any device.</p></div>';
  } else {
    syncCard = '<div class="card"><p><b>Right now the schedule lives on this device only.</b> To let the whole congregation see it live, connect a free Firebase database (about 10 minutes, one time):</p>' +
      '<p>1. Go to <b>console.firebase.google.com</b> → Add project.<br>' +
      '2. Add a Web app, then create a <b>Firestore database</b> (Start in test mode).<br>' +
      '3. Copy the config it shows you into the file <b>firebase-config.js</b>:</p>' +
      '<code class="cfg">window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", ... };</code>' +
      '<p style="margin-top:10px">4. Put the app folder on any free host (e.g. Netlify Drop) and share the link. This device\'s schedule uploads itself automatically the first time.</p></div>';
  }
  return '<div class="data-actions">' + syncCard + renderSheetCard() +
    '<div class="card"><p>Back up the schedule, or move it between devices by hand.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="ghost" data-act="export">Export backup file</button>' +
    '<label class="ghost" style="display:inline-flex;align-items:center;cursor:pointer">Import backup file' +
    '<input type="file" accept=".json,application/json" data-chg="import-file" style="display:none"></label>' +
    '</div></div>' +
    '<div class="card"><p>Reload the original schedule from the spreadsheet (May to July 2026). This overwrites all current data' + (fb ? ' for everyone' : '') + '.</p>' +
    '<button class="danger-link" data-act="reset">Reset to spreadsheet data</button></div>' +
    '<div class="card"><p>One-time cleanup after the sheet\'s Raw Data tab was tidied up, merges leftover name variants (e.g. "B. Anthony L") into their current spelling everywhere.</p>' +
    '<button class="ghost" data-act="unify-names">Unify member names</button></div>' +
    '</div>';
}
