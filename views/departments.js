import {esc, fmtDate} from '../core/format.js';
import {CATEGORIES, SERVICE_LABELS, memberLabel} from '../core/constants.js';
import {departmentDraftProfile, departmentProfileIsLeader, departmentProfiles, departmentRuntimeKey, departmentServiceTimeKey, departmentServiceTimeLabel, loadOwnDepartmentProfiles, ownDepartmentProfiles} from '../core/departments.js';
import {authorizedDepartments, canManageSelectedDepartment, selectedManageDepartment} from '../core/auth.js';
import {departmentRuntime, state, ui} from '../core/state.js';

export function departmentAttribution(profile) {
  const attribution = profile && profile.attribution || {};
  const by = profile && (profile.updatedBy || attribution.updatedBy || profile.updatedByUid);
  const at = profile && (profile.updatedAt || attribution.updatedAt);
  if (!by && !at) return 'No change attribution returned yet.';
  const when = Number.isFinite(Number(at)) ? new Date(Number(at)).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }) : 'time unavailable';
  return 'Last changed by ' + (by ? esc(by) : 'account unavailable') + ' on ' + esc(when) + '.';
}
export function departmentStatusBadge(profile) {
  const active = profile && profile.status === 'active';
  return '<span class="department-status ' + (active ? 'active' : 'inactive') + '">' + (active ? 'Active' : 'Inactive') + '</span>';
}
export function departmentProfileSummary(profile) {
  const duties = Array.isArray(profile && profile.eligibleDuties) ? profile.eligibleDuties : [];
  const availability = profile && profile.availability || { recurring: {}, exceptions: {} };
  const recurring = Object.keys(availability.recurring || {}).filter(key => availability.recurring[key] === 'available');
  const exceptionCount = Object.keys(availability.exceptions || {}).length;
  return (profile && profile.schedulable ? 'Schedulable' : 'Not schedulable') +
    ' · ' + duties.length + ' eligible dut' + (duties.length === 1 ? 'y' : 'ies') +
    ' · ' + recurring.length + ' recurring time' + (recurring.length === 1 ? '' : 's') +
    (exceptionCount ? ' · ' + exceptionCount + ' date exception' + (exceptionCount === 1 ? '' : 's') : '');
}
export function renderDepartmentProfileRow(profile, options = {}) {
  const memberUid = profile.memberUid;
  const isLeader = departmentProfileIsLeader(profile);
  const canEdit = options.canEdit === true;
  return '<div class="department-member-row ' + (profile.status === 'inactive' ? 'is-inactive' : '') + '">' +
    '<button class="department-member-open" data-act="department-member-open" data-uid="' + esc(memberUid) + '" aria-label="Open ' + esc(memberLabel(profile.memberName)) + ' profile">' +
    '<span class="department-member-name">' + esc(memberLabel(profile.memberName)) + '</span>' +
    (isLeader ? '<span class="department-role">Leader</span>' : '') +
    '</button>' +
    '<span class="department-member-meta">' + departmentStatusBadge(profile) + '<span>' + esc(departmentProfileSummary(profile)) + '</span></span>' +
    (canEdit ? '<button class="ghost mini" data-act="department-status" data-uid="' + esc(memberUid) + '" data-status="' + (profile.status === 'active' ? 'inactive' : 'active') + '">' + (profile.status === 'active' ? 'Archive' : 'Restore') + '</button>' : '') +
    '</div>';
}
export function renderManageDepartments() {
  const departments = authorizedDepartments().filter(department => department !== 'All');
  if (!departments.length) return '<div class="empty">No department leadership scope is attached to this account.</div>';
  let html = '<div class="department-scope card"><div class="department-eyebrow">Leader-scoped workspace</div>' +
    '<h2>Departments</h2><p class="hint">Only departments returned by your verified account are shown. Each card opens a department-scoped roster.</p>' +
    '<p class="department-security-note">Roster profiles are loaded by department and UID. No congregation-wide member list is used here.</p></div>';
  html += '<div class="department-card-grid">' + departments.map(department => {
    const profiles = departmentProfiles(department);
    const leaders = profiles.filter(departmentProfileIsLeader);
    const loaded = Array.isArray(departmentRuntime.rosters[department]);
    const count = loaded ? profiles.length + ' profile' + (profiles.length === 1 ? '' : 's') : 'Roster not loaded';
    const leaderText = loaded
      ? (leaders.length ? leaders.map(profile => memberLabel(profile.memberName)).join(', ') : 'No leader record returned')
      : 'Secure roster loads when opened';
    return '<article class="department-card card" data-department="' + esc(department) + '">' +
      '<div class="department-card-top"><span class="department-dot" aria-hidden="true"></span><span class="department-eyebrow">Department</span></div>' +
      '<h3>' + esc(department) + '</h3><p class="department-card-copy">' + esc(count) + '</p>' +
      '<p class="department-card-leader"><strong>Leaders</strong> ' + esc(leaderText) + '</p>' +
      '<button class="primary" data-act="department-open" data-department="' + esc(department) + '">Open department</button>' +
      '</article>';
  }).join('') + '</div>';
  return html;
}
export function renderDepartmentLoading(department) {
  if (departmentRuntime.loading[department]) {
    return '<div class="card department-loading" role="status"><div class="department-eyebrow">' + esc(department) + '</div><h2>Loading department roster</h2><p class="hint">The secure roster is being requested for this department only.</p><span class="department-spinner" aria-hidden="true"></span></div>';
  }
  const error = departmentRuntime.errors[department];
  if (error) {
    return '<div class="card department-error" role="alert"><h2>Roster unavailable</h2><p class="hint">' + esc(error) + '</p><button class="primary" data-act="department-retry" data-department="' + esc(department) + '">Try again</button></div>';
  }
  return '';
}
export function renderDepartmentRosterGroup(label, profiles, canEdit) {
  if (!profiles.length) return '<section class="department-group"><h3>' + esc(label) + '</h3><p class="department-empty-note">No profiles in this group.</p></section>';
  return '<section class="department-group"><div class="department-group-heading"><h3>' + esc(label) + '</h3><span>' + profiles.length + '</span></div>' +
    profiles.map(profile => renderDepartmentProfileRow(profile, { canEdit })).join('') + '</section>';
}
export function renderManageDepartment() {
  const department = selectedManageDepartment();
  if (!department || department === 'All') return renderManageDepartments();
  const loading = renderDepartmentLoading(department);
  if (loading) return '<button class="linkish department-back" data-act="department-back">Back to departments</button>' + loading;
  const profiles = departmentProfiles(department).slice().sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
    return String(left.memberName).localeCompare(String(right.memberName));
  });
  const leaders = profiles.filter(departmentProfileIsLeader);
  const canEdit = canManageSelectedDepartment(department);
  let html = '<button class="linkish department-back" data-act="department-back">Back to departments</button>' +
    '<section class="department-hero card"><div class="department-eyebrow">Department roster</div><h2>' + esc(department) + '</h2>' +
    '<p class="hint">This page shows the leaders and active or inactive profiles returned for ' + esc(department) + '.</p>' +
    '<div class="department-leader-strip"><strong>Leaders</strong><span>' + (leaders.length ? leaders.map(profile => esc(memberLabel(profile.memberName))).join(', ') : 'No leader record returned by the secure roster') + '</span></div>' +
    '<p class="department-attribution">Roster read is scoped to <code>' + esc(department) + '</code>. Profile changes carry UID and timestamp attribution.</p></section>';
  if (canEdit) {
    html += '<form class="card department-add-form" data-act="department-member-add"><div class="department-eyebrow">Add a department member</div><h3>Add by verified member UID</h3>' +
      '<p class="hint">A UID is the member identity used by the secure callable. Adding a profile does not grant a leadership role.</p>' +
      '<div class="department-form-grid"><label>Member UID<input id="department-member-uid" type="text" required maxlength="128" autocomplete="off" placeholder="Firebase member UID"></label>' +
      '<label>Display name<input id="department-member-name" type="text" required maxlength="160" autocomplete="off" placeholder="Name shown to leaders"></label></div>' +
      '<button class="primary" type="submit">Add member profile</button></form>';
  }
  html += '<div class="department-roster-groups">' +
    renderDepartmentRosterGroup('Active profiles', profiles.filter(profile => profile.status === 'active'), canEdit) +
    renderDepartmentRosterGroup('Inactive profiles', profiles.filter(profile => profile.status !== 'active'), canEdit) +
    '</div>';
  return html;
}
export function departmentTimeOptions(profile, includeAny) {
  const keys = new Set(SERVICE_LABELS.map(departmentServiceTimeKey));
  Object.keys(profile && profile.availability && profile.availability.recurring || {}).forEach(key => keys.add(key));
  Object.keys(profile && profile.availability && profile.availability.exceptions || {}).forEach(date =>
    Object.keys(profile.availability.exceptions[date] || {}).forEach(key => keys.add(key)));
  const ordered = Array.from(keys).filter(Boolean).sort((left, right) => left.localeCompare(right));
  if (includeAny) ordered.unshift('*');
  return ordered.map(key => '<option value="' + esc(key) + '">' + esc(departmentServiceTimeLabel(key)) + '</option>').join('');
}
export function departmentHistoryEntries(profile) {
  const seed = profile && (profile.historySeed || profile.provenance);
  if (seed && Array.isArray(seed.evidence)) return seed.evidence;
  return profile && Array.isArray(profile.history) ? profile.history : [];
}
export function departmentHistoryDate(value) {
  const raw = String(value == null ? '' : value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? fmtDate(raw) : raw;
}
export function renderDepartmentHistory(profile) {
  const evidence = departmentHistoryEntries(profile);
  if (!evidence.length) return '';
  const rows = evidence.map(entry => {
    const duty = String(entry && (entry.duty || entry.role) || 'Historical duty').trim();
    const details = [
      entry && entry.service,
      entry && (entry.serviceTime || entry.time) && departmentServiceTimeLabel(entry.serviceTime || entry.time),
      entry && entry.date && departmentHistoryDate(entry.date),
      entry && entry.result
    ].map(value => String(value == null ? '' : value).trim()).filter(Boolean);
    return '<li><strong>' + esc(duty) + '</strong><span>' + esc(details.join(' · ') || 'Historical assignment') + '</span></li>';
  }).join('');
  return '<section class="card department-history"><div class="department-eyebrow">History and provenance</div><h3>Historical duty suggestions</h3><p class="hint">Past assignments suggest duties for review. They never override a member or leader decision.</p><ul class="department-history-list">' + rows + '</ul></section>';
}
export function renderOwnAvailabilityProfile(profile) {
  const department = profile.departmentId;
  const memberUid = profile.memberUid;
  const draft = departmentDraftProfile(department, memberUid) || profile;
  const recurring = draft.availability && draft.availability.recurring || {};
  const exceptions = draft.availability && draft.availability.exceptions || {};
  const draftExists = !!departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  const fieldAttribution = draft.fieldAttribution && draft.fieldAttribution.availability;
  const recurringControls = SERVICE_LABELS.map(label => {
    const key = departmentServiceTimeKey(label);
    const status = recurring[key] || 'unavailable';
    return '<label class="department-availability-row"><span>' + esc(label) + '</span><select data-chg="member-availability-recurring" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-key="' + esc(key) + '"><option value="available"' + (status === 'available' ? ' selected' : '') + '>Available</option><option value="unavailable"' + (status !== 'available' ? ' selected' : '') + '>Unavailable</option></select></label>';
  }).join('');
  const exceptionRows = Object.keys(exceptions).sort().map(date => Object.keys(exceptions[date] || {}).sort().map(key =>
    '<div class="department-exception-row"><span><strong>' + esc(departmentHistoryDate(date)) + '</strong><small>' + esc(departmentServiceTimeLabel(key)) + '</small></span><span class="department-exception-status ' + (exceptions[date][key] === 'available' ? 'available' : 'unavailable') + '">' + esc(exceptions[date][key]) + '</span><button class="danger-link" data-act="member-availability-exception-remove" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-date="' + esc(date) + '" data-key="' + esc(key) + '">Remove</button></div>'
  ).join('')).join('');
  const attributionProfile = fieldAttribution && !profile.updatedAt
    ? Object.assign({}, profile, { updatedBy: fieldAttribution.by, updatedAt: fieldAttribution.at })
    : profile;
  const attribution = departmentAttribution(attributionProfile);
  return '<section class="card department-editor own-availability-card" data-department="' + esc(department) + '" data-member-uid="' + esc(memberUid) + '"><div class="department-section-heading"><div><div class="department-eyebrow">Shared availability</div><h2>Your availability</h2></div><span class="department-editor-state">' + (draftExists ? 'Unsaved changes' : 'Saved profile') + '</span></div><p class="hint">You can update this shared record. Your department leader can update the same record from Manage. Status, duties, and schedulability stay leader-controlled.</p><p class="department-attribution">' + attribution + '</p><h3>Recurring service times</h3><div class="department-availability-grid">' + recurringControls + '</div><h3 style="margin-top:18px">Date exceptions</h3><p class="hint">A date exception overrides the recurring choice for that service date.</p><div class="department-exceptions">' + (exceptionRows || '<p class="department-empty-note">No date exceptions.</p>') + '</div><form class="department-exception-form" data-act="member-availability-exception-add" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"><input type="date" required aria-label="Exception date"><select aria-label="Exception service time">' + departmentTimeOptions(draft, true) + '</select><select aria-label="Exception availability"><option value="unavailable">Unavailable</option><option value="available">Available</option></select><button class="ghost" type="submit">Add exception</button></form><div class="department-save-bar"><button class="primary" data-act="member-availability-save" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"' + (draftExists ? '' : ' disabled') + '>Save availability</button>' + (draftExists ? '<button class="ghost" data-act="member-availability-reset" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '">Discard changes</button>' : '') + '</div></section>';
}
export function renderOwnAvailability() {
  if (!departmentRuntime.ownLoaded && !departmentRuntime.ownLoading) loadOwnDepartmentProfiles().catch(() => {});
  const profiles = ownDepartmentProfiles();
  if (!profiles.length && departmentRuntime.ownLoading) {
    return '<section class="card department-loading" role="status"><div class="department-eyebrow">Shared availability</div><h2>Loading your availability</h2><p class="hint">Your profile is being requested through the signed-in account.</p></section>';
  }
  if (!profiles.length && departmentRuntime.ownError) {
    return '<section class="card department-error" role="alert"><h2>Availability unavailable</h2><p class="hint">' + esc(departmentRuntime.ownError) + '</p><button class="primary" data-act="member-availability-retry">Try again</button></section>';
  }
  if (!profiles.length) return '';
  return profiles.map(renderOwnAvailabilityProfile).join('');
}
export function renderDepartmentMember() {
  const department = selectedManageDepartment();
  const memberUid = ui.departmentMember;
  const profile = departmentDraftProfile(department, memberUid);
  if (!department || department === 'All' || !profile) return renderManageDepartment();
  const canEdit = canManageSelectedDepartment(department);
  const category = CATEGORIES.find(item => item.name === department);
  const duties = category ? category.duties : [];
  const recurring = profile.availability && profile.availability.recurring || {};
  const exceptions = profile.availability && profile.availability.exceptions || {};
  const fieldAttribution = profile.fieldAttribution && typeof profile.fieldAttribution === 'object' ? profile.fieldAttribution : {};
  const draftExists = !!departmentRuntime.drafts[departmentRuntimeKey(department, memberUid)];
  let html = '<button class="linkish department-back" data-act="department-back-member">Back to ' + esc(department) + '</button>' +
    '<section class="department-profile-hero card"><div class="department-eyebrow">Member profile</div><div class="department-profile-title"><div><h2>' + esc(memberLabel(profile.memberName)) + '</h2><p class="department-uid">UID: ' + esc(profile.memberUid) + '</p></div>' + departmentStatusBadge(profile) + '</div>' +
    '<p class="department-attribution">' + departmentAttribution(profile) + '</p>' +
    '<p class="department-profile-note">Identity and role are immutable here. This editor changes only status, eligible duties, schedulability, and availability.</p>' +
    (canEdit ? '<div class="department-profile-actions"><button class="ghost" data-act="department-status" data-uid="' + esc(memberUid) + '" data-status="' + (profile.status === 'active' ? 'inactive' : 'active') + '">' + (profile.status === 'active' ? 'Move to inactive' : 'Restore to active') + '</button></div>' : '') +
    '</section>';
  html += '<section class="card department-editor"><div class="department-section-heading"><div><div class="department-eyebrow">Scheduling profile</div><h3>Eligible duties</h3></div><span class="department-editor-state">' + (draftExists ? 'Unsaved changes' : 'Saved profile') + '</span></div>' +
    '<p class="hint">Normal assignment requires an active profile, one of these duties, schedulable enabled, and available service time.</p>' +
    '<div class="department-duty-grid">' + duties.map(duty => '<label class="department-check"><input type="checkbox" data-chg="department-eligible" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-duty="' + esc(duty) + '"' + (profile.eligibleDuties.some(item => item.toLocaleLowerCase() === duty.toLocaleLowerCase()) ? ' checked' : '') + (canEdit ? '' : ' disabled') + '><span>' + esc(duty) + '</span></label>').join('') + '</div>' +
    '<label class="department-schedulable"><span><strong>Schedulable</strong><small>Allow this profile to appear in normal assignment choices.</small></span><span class="switch"><input type="checkbox" data-chg="department-schedulable" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"' + (profile.schedulable ? ' checked' : '') + (canEdit ? '' : ' disabled') + '><span class="track"></span></span></label>' +
    '</section>';
  html += '<section class="card department-editor"><div class="department-section-heading"><div><div class="department-eyebrow">Recurring availability</div><h3>Service-time pattern</h3></div></div>' +
    '<p class="hint">Availability is evaluated in the configured service timezone. A date exception wins over the recurring pattern.</p>' +
    '<div class="department-availability-grid">' + SERVICE_LABELS.map(label => {
      const key = departmentServiceTimeKey(label);
      const status = recurring[key] || 'unavailable';
      return '<label class="department-availability-row"><span>' + esc(label) + '</span><select data-chg="department-recurring" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-key="' + esc(key) + '"' + (canEdit ? '' : ' disabled') + '><option value="available"' + (status === 'available' ? ' selected' : '') + '>Available</option><option value="unavailable"' + (status !== 'available' ? ' selected' : '') + '>Unavailable</option></select></label>';
    }).join('') + '</div></section>';
  html += '<section class="card department-editor"><div class="department-section-heading"><div><div class="department-eyebrow">Date exceptions</div><h3>One-day changes</h3></div></div>' +
    '<p class="hint">Use a service time or Any service time. These entries override the recurring pattern only for the chosen date.</p>' +
    '<div class="department-exceptions">' + Object.keys(exceptions).sort().map(date => Object.keys(exceptions[date] || {}).sort().map(key =>
      '<div class="department-exception-row"><span><strong>' + esc(date) + '</strong><small>' + esc(departmentServiceTimeLabel(key)) + '</small></span><span class="department-exception-status ' + (exceptions[date][key] === 'available' ? 'available' : 'unavailable') + '">' + esc(exceptions[date][key]) + '</span>' +
      (canEdit ? '<button class="danger-link" data-act="department-exception-remove" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '" data-date="' + esc(date) + '" data-key="' + esc(key) + '">Remove</button>' : '') + '</div>'
    ).join('')).join('') + (!Object.keys(exceptions).length ? '<p class="department-empty-note">No date exceptions.</p>' : '') + '</div>' +
    (canEdit ? '<form class="department-exception-form" data-act="department-exception-add"><input id="department-exception-date" type="date" required aria-label="Exception date"><select id="department-exception-time" aria-label="Exception service time">' + departmentTimeOptions(profile, true) + '</select><select id="department-exception-status" aria-label="Exception availability"><option value="unavailable">Unavailable</option><option value="available">Available</option></select><button class="ghost" type="submit">Add exception</button></form>' : '') +
    '</section>';
  html += renderDepartmentHistory(profile);
  const fieldRows = ['status', 'eligibleDuties', 'schedulable', 'availability'].filter(field => fieldAttribution[field]).map(field => {
    const decision = fieldAttribution[field];
    return '<li><strong>' + esc(field) + '</strong>: ' + esc(decision.authority || decision.source || 'recorded') + ' by ' + esc(decision.by || 'account') + '</li>';
  }).join('');
  html += '<section class="card department-attribution-card"><div class="department-eyebrow">Change attribution</div><h3>Who changed the profile</h3><p class="department-attribution">' + departmentAttribution(profile) + '</p>' + (fieldRows ? '<ul>' + fieldRows + '</ul>' : '<p class="department-empty-note">Field-level attribution was not included in this roster response.</p>') + '</section>';
  if (canEdit) {
    html += '<div class="department-save-bar"><button class="primary" data-act="department-profile-save" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '"' + (draftExists ? '' : ' disabled') + '>Save profile changes</button>' + (draftExists ? '<button class="ghost" data-act="department-profile-reset" data-dept="' + esc(department) + '" data-uid="' + esc(memberUid) + '">Discard changes</button>' : '') + '</div>';
  }
  return html;
}
export function renderDepartmentWorkspace() {
  if (ui.departmentView === 'member') return renderDepartmentMember();
  if (ui.departmentView === 'department') return renderManageDepartment();
  return renderManageDepartments();
}
