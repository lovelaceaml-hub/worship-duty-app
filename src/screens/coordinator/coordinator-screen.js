'use strict';

/*
 * Production Manage screen.
 *
 * This module is intentionally buildless.  The shell owns authentication,
 * subscriptions, and the legacy Manage panels.  This screen owns the
 * department workspace and receives all persistence through `commands`.
 */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const screens = app.screens || (app.screens = {});
    screens.coordinator = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCoordinatorScreenApi() {
  function create(deps) {
    const d = deps || {};
    const screen = {
      department: '',
      panel: 'department',
      month: '',
      rosterMember: '',
      proposals: null,
      songQuery: '',
      notice: '',
      noticeKind: 'success'
    };

    const own = Object.prototype.hasOwnProperty;

    function readState() {
      return typeof d.getState === 'function' ? (d.getState() || {}) : {};
    }

    function readUi() {
      return typeof d.getUi === 'function' ? (d.getUi() || {}) : {};
    }

    function core() {
      return d.core || {};
    }

    function categories(state) {
      const list = core().CATEGORIES || state.categories || [];
      return Array.isArray(list) ? list : [];
    }

    function esc(value) {
      if (d.fmt && typeof d.fmt.esc === 'function') return d.fmt.esc(value);
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function serviceId(service) {
      if (d.fmt && typeof d.fmt.serviceId === 'function') return d.fmt.serviceId(service);
      return service && (service.id || ((service.date || '') + '_' + (service.service || '')));
    }

    function today() {
      const value = d.fmt && d.fmt.today;
      if (typeof value === 'function') return value();
      if (value) return String(value);
      return new Date().toISOString().slice(0, 10);
    }

    function dateText(iso) {
      if (d.fmt && typeof d.fmt.date === 'function') return d.fmt.date(iso);
      if (!iso) return '';
      return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric'
      });
    }

    function timeText(value) {
      if (d.fmt && typeof d.fmt.time === 'function') return d.fmt.time(value);
      if (!value) return '';
      const pieces = String(value).split(':');
      let hour = Number(pieces[0]);
      const minutes = pieces[1] || '00';
      const suffix = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      return hour + ':' + minutes + ' ' + suffix;
    }

    function feature(id, state) {
      if (typeof d.feature === 'function') return !!d.feature(id);
      const values = state.settings && state.settings.features || {};
      if (own.call(values, id)) return !!values[id];
      const definition = (core().FEATURES || []).find(item => item.id === id);
      return definition ? !!definition.def : true;
    }

    function setNotice(text, kind) {
      screen.notice = text || '';
      screen.noticeKind = kind || 'success';
    }

    function refresh() {
      if (typeof d.requestRender === 'function') d.requestRender();
    }

    function addBanner(text, alert) {
      if (typeof d.addBanner === 'function') d.addBanner(text, !!alert);
      else setNotice(text, alert ? 'error' : 'success');
    }

    function confirmAction(message) {
      if (typeof d.confirm === 'function') return d.confirm(message);
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') return window.confirm(message);
      return true;
    }

    function command(name) {
      const args = Array.prototype.slice.call(arguments, 1);
      const commands = d.commands || {};
      const fn = commands[name];
      if (typeof fn !== 'function') {
        setNotice('This action is unavailable until the shell adapter is connected.', 'error');
        refresh();
        return Promise.reject(new Error('Missing command: ' + name));
      }
      try {
        return Promise.resolve(fn.apply(commands, args));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    function write(name) {
      const args = Array.prototype.slice.call(arguments, 1);
      return command.apply(null, [name].concat(args)).catch(error => {
        setNotice('Could not save that change. Try again.', 'error');
        addBanner('Could not save the Manage change.', true);
        return Promise.reject(error);
      });
    }

    function saveService(service, metadata) {
      const commands = d.commands || {};
      const commandName = typeof commands.saveService === 'function' ? 'saveService' : 'persistService';
      return metadata ? write(commandName, service, metadata) : write(commandName, service);
    }

    function notifySaved(text) {
      setNotice(text || 'Saved.', 'success');
      refresh();
    }

    function configuredManagers(state) {
      const map = state.settings && state.settings.departmentManagers;
      return map && typeof map === 'object' && Object.keys(map).length ? map : null;
    }

    function currentName(state) {
      const appUi = readUi();
      return appUi.me || appUi.selectedName || state.selectedName || '';
    }

    function allDepartmentNames(state) {
      const names = categories(state).map(item => item.name);
      const map = configuredManagers(state);
      if (map) Object.keys(map).forEach(name => { if (name !== 'Admin') names.push(name); });
      names.push('Choir');
      return Array.from(new Set(names));
    }

    function allowedDepartments(state) {
      const names = allDepartmentNames(state);
      const map = configuredManagers(state);
      if (!map) return names;
      const me = currentName(state);
      const admins = Array.isArray(map.Admin) ? map.Admin : [];
      if (admins.indexOf(me) !== -1) return names;
      return names.filter(name => Array.isArray(map[name]) && map[name].indexOf(me) !== -1);
    }

    function canManageDepartment(department, state) {
      const map = configuredManagers(state);
      if (!map) return true;
      const me = currentName(state);
      const admins = Array.isArray(map.Admin) ? map.Admin : [];
      if (admins.indexOf(me) !== -1) return true;
      return Array.isArray(map[department]) && map[department].indexOf(me) !== -1;
    }

    function isAdmin(state) {
      const map = configuredManagers(state);
      return !!(map && Array.isArray(map.Admin) && map.Admin.indexOf(currentName(state)) !== -1);
    }

    function selectedDepartment(state) {
      const allowed = allowedDepartments(state);
      const appUi = readUi();
      const remembered = screen.department || appUi.manageDepartment || appUi.departmentChoice ||
        (state.settings && state.settings.manageDepartment) || '';
      if (allowed.indexOf(remembered) !== -1) return remembered;
      return allowed[0] || '';
    }

    function selectDepartment(value, state) {
      const allowed = allowedDepartments(state);
      const next = allowed.indexOf(value) !== -1 ? value : (allowed[0] || '');
      screen.department = next;
      const appUi = readUi();
      if (appUi && typeof appUi === 'object') {
        try {
          appUi.manageDepartment = next;
          appUi.departmentChoice = next;
        } catch (error) { /* read-only UI snapshots are valid adapters */ }
      }
      return next;
    }

    function monthValue(state) {
      if (/^\d{4}-\d{2}$/.test(screen.month)) return screen.month;
      const appUi = readUi();
      if (/^\d{4}-\d{2}$/.test(appUi.manageMonth)) return appUi.manageMonth;
      const list = Array.isArray(state.services) ? state.services.slice() : [];
      const upcoming = list.filter(item => item && item.date >= today()).sort((a, b) =>
        String(a.date).localeCompare(String(b.date)));
      const source = upcoming[0] || list.sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
      return source && /^\d{4}-\d{2}/.test(source.date) ? source.date.slice(0, 7) : today().slice(0, 7);
    }

    function setMonth(value) {
      if (!/^\d{4}-\d{2}$/.test(value)) return monthValue(readState());
      screen.month = value;
      const appUi = readUi();
      if (appUi && typeof appUi === 'object') {
        try { appUi.manageMonth = value; } catch (error) { /* read-only UI snapshots are valid adapters */ }
      }
      return value;
    }

    function shiftMonth(value, delta) {
      const parts = String(value || monthValue(readState())).split('-').map(Number);
      const date = new Date(parts[0] || 1970, (parts[1] || 1) - 1 + delta, 1);
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    }

    function departmentDuties(department, state) {
      if (department === 'Choir') return ['Choir'];
      const category = categories(state).find(item => item.name === department);
      return category && Array.isArray(category.duties) ? category.duties.slice() : [];
    }

    function departmentColor(department, state) {
      const category = categories(state).find(item => item.name === department);
      return category && category.color || 'var(--brand-blue)';
    }

    function rosterFor(department, state) {
      const map = state.departments || {};
      return Array.isArray(map[department]) ? map[department].slice().sort((a, b) => String(a).localeCompare(String(b))) : [];
    }

    function rulesFor(department, member, state) {
      const all = state.settings && state.settings.departmentRosterRules || {};
      const dept = all[department] || {};
      const value = dept[member];
      return value && typeof value === 'object' ? value : {};
    }

    function rosterRules(state) {
      if (!state.settings || !state.settings.departmentRosterRules ||
          typeof state.settings.departmentRosterRules !== 'object') {
        if (!state.settings) state.settings = {};
        state.settings.departmentRosterRules = {};
      }
      return state.settings.departmentRosterRules;
    }

    function parseList(value) {
      return Array.from(new Set(String(value || '').split(/[\n,]+/).map(item => item.trim()).filter(Boolean)));
    }

    function printList(value) {
      return Array.isArray(value) ? value.join(', ') : '';
    }

    function departmentForDuty(duty, state) {
      if (duty === 'Choir') return 'Choir';
      const category = categories(state).find(item => Array.isArray(item.duties) && item.duties.indexOf(duty) !== -1);
      return category ? category.name : '';
    }

    function validAssignmentTarget(department, duty, state) {
      return !!department && departmentForDuty(duty, state) === department;
    }

    function serviceIsUnavailable(department, member, service, duty, state) {
      const rule = rulesFor(department, member, state);
      const duties = Array.isArray(rule.duties) ? rule.duties : [];
      const dates = Array.isArray(rule.unavailableDates) ? rule.unavailableDates : [];
      const services = Array.isArray(rule.unavailableServiceIds) ? rule.unavailableServiceIds : [];
      if (duties.length && duties.indexOf(duty) === -1) return 'not qualified for this duty';
      if (dates.indexOf(service.date) !== -1) return 'unavailable on this date';
      if (services.indexOf(serviceId(service)) !== -1) return 'unavailable for this service';
      return '';
    }

    function assignmentValues(service) {
      return Object.keys(service && service.assignments || {}).map(key => service.assignments[key]).filter(Boolean);
    }

    function serviceDateSort(a, b) {
      return String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || '')) || String(a.service || '').localeCompare(String(b.service || ''));
    }

    function servicesForMonth(state, month) {
      return (Array.isArray(state.services) ? state.services : [])
        .filter(service => service && String(service.date || '').slice(0, 7) === month)
        .slice().sort(serviceDateSort);
    }

    function serviceForId(id, state) {
      return (state.services || []).find(service => String(serviceId(service)) === String(id));
    }

    function eligibleMembers(department, service, duty, state, includeCurrent) {
      const roster = rosterFor(department, state);
      const current = service && service.assignments && service.assignments[duty];
      const list = roster.slice();
      if (includeCurrent && current && list.indexOf(current) === -1) list.unshift(current);
      return list;
    }

    function songLibrary(state) {
      let source = [];
      if (typeof d.getSongLibrary === 'function') source = d.getSongLibrary() || [];
      if (!source.length && Array.isArray(state.songs)) source = state.songs;
      if (!source.length && d.getSetlists) {
        const setlists = typeof d.getSetlists === 'function' ? d.getSetlists() : d.getSetlists;
        if (Array.isArray(setlists)) source = setlists;
        else if (setlists && Array.isArray(setlists.songs)) source = setlists.songs;
      }
      return Array.isArray(source) ? source : [];
    }

    function songLabel(song) {
      if (!song) return '';
      const number = song.number || song.id || '';
      const title = song.title || song.name || '';
      return (number && title) ? number + ' ' + title : (title || number);
    }

    function matchingSongs(query, state) {
      const term = String(query || '').trim().toLowerCase();
      return songLibrary(state).filter(song => !term || songLabel(song).toLowerCase().indexOf(term) !== -1)
        .slice(0, 8);
    }

    function balancedCount(department, state) {
      const counts = {};
      rosterFor(department, state).forEach(member => { counts[member] = 0; });
      const horizon = today();
      (state.services || []).forEach(service => {
        if (!service || service.date < horizon) return;
        const duties = departmentDuties(department, state);
        duties.forEach(duty => {
          const member = service.assignments && service.assignments[duty];
          if (member && own.call(counts, member)) counts[member] += 1;
        });
      });
      return counts;
    }

    function proposeAssignments(department, month, state) {
      const services = servicesForMonth(state, month);
      const counts = balancedCount(department, state);
      const items = [];
      const unresolved = [];
      services.forEach(service => {
        const busy = {};
        assignmentValues(service).forEach(member => { busy[member] = true; });
        departmentDuties(department, state).forEach(duty => {
          const assignments = service.assignments || {};
          if (assignments[duty]) return;
          const roster = rosterFor(department, state);
          if (!roster.length) {
            unresolved.push({ service, duty, reason: 'No roster members are available.' });
            return;
          }
          const candidates = roster.filter(member => !busy[member] && !serviceIsUnavailable(department, member, service, duty, state));
          if (!candidates.length) {
            const qualified = roster.filter(member => !serviceIsUnavailable(department, member, service, duty, state));
            unresolved.push({ service, duty, reason: qualified.length ? 'Every qualified member has a conflict in this service.' : 'No qualified and available member is listed.' });
            return;
          }
          candidates.sort((a, b) => (counts[a] || 0) - (counts[b] || 0) || a.localeCompare(b));
          const chosen = candidates[0];
          items.push({ serviceId: serviceId(service), duty, member: chosen });
          counts[chosen] = (counts[chosen] || 0) + 1;
          busy[chosen] = true;
        });
      });
      return { month, department, items, unresolved };
    }

    function isStaleProposal(item, department, state) {
      const service = serviceForId(item.serviceId, state);
      if (!service || service.date.slice(0, 7) !== item.month || !canManageDepartment(department, state)) return 'The service or permission changed.';
      if (service.assignments && service.assignments[item.duty]) return 'The slot is already assigned.';
      if (rosterFor(department, state).indexOf(item.member) === -1) return 'The proposed member left the roster.';
      if (!validAssignmentTarget(department, item.duty, state)) return 'The duty does not belong to this department.';
      const unavailable = serviceIsUnavailable(department, item.member, service, item.duty, state);
      if (unavailable) return unavailable + '.';
      if (assignmentValues(service).indexOf(item.member) !== -1) return 'The proposed member now has another duty in this service.';
      return '';
    }

    function panelTabs(state) {
      const pending = (state.requests || []).filter(item => item.status === 'pending').length;
      return [
        ['department', 'Department'],
        ['planning', 'Planning'],
        ['requests', 'Requests' + (pending ? ' (' + pending + ')' : '')],
        ['services', 'Services'],
        ['people', 'People'],
        ['features', 'Features'],
        ['data', 'Data & Sync']
      ];
    }

    function renderNotice() {
      return screen.notice ? '<div class="manage-notice ' + (screen.noticeKind === 'error' ? 'is-error' : '') + '" role="status">' + esc(screen.notice) + '</div>' : '';
    }

    function renderDepartmentChoice(state) {
      const allowed = allowedDepartments(state);
      const selected = selectDepartment(selectedDepartment(state), state);
      const map = configuredManagers(state);
      if (!allowed.length) {
        return '<div class="manage-department-first" data-manage-department-first><div><p class="ws-kicker">Manage</p><h2>No department access</h2><p class="ws-muted">Choose an authorized selected name before opening a department.</p></div></div>';
      }
      const role = map ? (isAdmin(state) ? 'Admin access' : 'Department manager access') : 'Editor access';
      return '<div class="manage-department-first" data-manage-department-first>' +
        '<div><p class="ws-kicker">Manage</p><h2>Department workspace</h2><p class="ws-muted">' + esc(role) + '. Choose a department to edit its roster and monthly duties.</p></div>' +
        '<label for="manage-department-choice">Department<select id="manage-department-choice" data-chg="manage-department" aria-label="Manage department">' +
        allowed.map(name => '<option value="' + esc(name) + '"' + (name === selected ? ' selected' : '') + '>' + esc(name) + '</option>').join('') +
        '</select></label></div>';
    }

    function renderRoster(state, department) {
      const roster = rosterFor(department, state);
      const duties = departmentDuties(department, state);
      const members = Array.isArray(state.members) ? state.members.slice().sort((a, b) => String(a).localeCompare(String(b))) : [];
      const available = members.filter(member => roster.indexOf(member) === -1);
      let html = '<section class="ws-card manage-card" aria-labelledby="manage-roster-title"><div class="manage-section-heading"><div><p class="ws-kicker">Roster</p><h2 id="manage-roster-title">' + esc(department) + ' department roster</h2></div><span class="ws-badge" style="--badge-color:' + esc(departmentColor(department, state)) + '">' + roster.length + ' member' + (roster.length === 1 ? '' : 's') + '</span></div>';
      html += '<form class="manage-roster-add" data-act="manage-roster-add"><label for="manage-roster-member">Add a member<select id="manage-roster-member" name="member"' + (!available.length ? ' disabled' : '') + '><option value="">Choose a member</option>' + available.map(member => '<option value="' + esc(member) + '"' + (screen.rosterMember === member ? ' selected' : '') + '>' + esc(member) + '</option>').join('') + '</select></label><button class="ws-button ws-button-primary" type="submit"' + (!available.length ? ' disabled' : '') + '>Add to roster</button></form>';
      if (!roster.length) html += '<p class="ws-empty">No one is listed in this department yet.</p>';
      roster.forEach(member => {
        const rule = rulesFor(department, member, state);
        const selectedDuties = Array.isArray(rule.duties) ? rule.duties : [];
        html += '<article class="manage-roster-row" data-roster-member="' + esc(member) + '"><div class="manage-roster-row-head"><div><h3>' + esc(member) + '</h3><p class="ws-muted">Edit qualifications and availability for this department.</p></div><button type="button" class="ws-button ws-button-danger" data-act="manage-roster-remove" data-department="' + esc(department) + '" data-member="' + esc(member) + '">Remove</button></div>';
        html += '<fieldset class="manage-qualifications"><legend>Qualified duties</legend><div class="manage-duty-checks">' + duties.map(duty => '<label><input type="checkbox" data-chg="manage-roster-duty" data-department="' + esc(department) + '" data-member="' + esc(member) + '" data-duty="' + esc(duty) + '"' + (selectedDuties.indexOf(duty) !== -1 ? ' checked' : '') + '><span>' + esc(duty) + '</span></label>').join('') + '</div><p class="ws-help">Leave every duty unchecked to keep the existing roster behavior and allow this member for all duties.</p></fieldset>';
        html += '<div class="manage-availability-grid"><label>Unavailable dates<input type="text" value="' + esc(printList(rule.unavailableDates)) + '" placeholder="YYYY-MM-DD, YYYY-MM-DD" data-chg="manage-roster-availability" data-field="unavailableDates" data-department="' + esc(department) + '" data-member="' + esc(member) + '"></label><label>Unavailable service IDs<input type="text" value="' + esc(printList(rule.unavailableServiceIds)) + '" placeholder="date_service" data-chg="manage-roster-availability" data-field="unavailableServiceIds" data-department="' + esc(department) + '" data-member="' + esc(member) + '"></label></div></article>';
      });
      html += '</section>';
      return html;
    }

    function memberOptions(department, service, duty, state) {
      const current = service.assignments && service.assignments[duty] || '';
      const options = eligibleMembers(department, service, duty, state, true);
      return '<option value="">Unassigned</option>' + options.map(member => {
        const reason = serviceIsUnavailable(department, member, service, duty, state);
        const label = reason ? member + ' (' + reason + ')' : member;
        return '<option value="' + esc(member) + '"' + (member === current ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('');
    }

    function renderAssignmentRows(state, department, month) {
      const services = servicesForMonth(state, month);
      const duties = departmentDuties(department, state);
      if (!services.length) return '<div class="ws-empty" data-manage-assignment-empty>No services are scheduled in ' + esc(month) + '.</div>';
      let html = '<div class="ws-table-scroll"><table class="ws-table manage-assignment-table" aria-label="Monthly assignments"><thead><tr class="manage-assignment-head"><th scope="col">Date</th><th scope="col">Service</th><th scope="col">Time</th><th scope="col">Department</th><th scope="col">Duty</th><th scope="col">Assigned</th><th scope="col">Remove</th></tr></thead>';
      services.forEach(service => {
        const id = serviceId(service);
        html += '<tbody class="manage-service-group" data-service-id="' + esc(id) + '"><tr class="manage-service-heading"><th colspan="7" scope="rowgroup"><strong>' + esc(dateText(service.date)) + '</strong><span>' + esc(service.worship || 'Service') + ' · ' + esc(service.service || 'Service') + '</span><time datetime="' + esc(service.date + 'T' + (service.time || '')) + '">' + esc(timeText(service.time)) + '</time></th></tr>';
        duties.forEach(duty => {
          const assigned = service.assignments && service.assignments[duty] || '';
          html += '<tr class="assignment-edit-row" data-department-row="' + esc(department) + '" data-service-id="' + esc(id) + '"><td class="assignment-date">' + esc(dateText(service.date)) + '</td><td class="assignment-service">' + esc(service.service || 'Service') + '</td><td class="assignment-time">' + esc(timeText(service.time)) + '</td><td class="assignment-department">' + esc(department) + '</td><th scope="row" class="assignment-duty">' + esc(duty) + '</th><td><select data-chg="manage-assignment" data-department="' + esc(department) + '" data-service="' + esc(id) + '" data-duty="' + esc(duty) + '" aria-label="' + esc(department + ' ' + duty + ' for ' + dateText(service.date)) + '">' + memberOptions(department, service, duty, state) + '</select></td><td><button type="button" class="ws-icon-button" data-act="manage-assignment-remove" data-department="' + esc(department) + '" data-service="' + esc(id) + '" data-duty="' + esc(duty) + '"' + (!assigned ? ' disabled' : '') + ' aria-label="Remove ' + esc(duty) + ' assignment">Remove</button></td></tr>';
        });
        html += '</tbody>';
      });
      html += '</table></div>';
      return html;
    }

    function renderChoirSongs(state, month) {
      const services = servicesForMonth(state, month);
      let html = '<section class="ws-card manage-card" aria-labelledby="manage-choir-title"><div class="manage-section-heading"><div><p class="ws-kicker">Choir</p><h2 id="manage-choir-title">Service song titles</h2></div><span class="ws-badge">Schedule only</span></div><p class="ws-muted">Choose a library suggestion or type a title. Custom text is saved on the service only and never added to the song library.</p>';
      if (!services.length) return html + '<p class="ws-empty">No services are scheduled in this month.</p></section>';
      services.forEach(service => {
        const id = serviceId(service);
        const current = service.choirSong || '';
        const suggestions = matchingSongs(current || screen.songQuery, state);
        html += '<div class="manage-choir-service" data-service-id="' + esc(id) + '"><div><strong>' + esc(dateText(service.date)) + '</strong><span>' + esc(service.worship || 'Service') + ' · ' + esc(service.service || 'Service') + ' · ' + esc(timeText(service.time)) + '</span></div><label>Choir song title<input type="text" value="' + esc(current) + '" placeholder="Type a song title" data-chg="manage-choir-song" data-service="' + esc(id) + '" list="manage-song-suggestions-' + esc(id) + '"></label>';
        if (suggestions.length) {
          html += '<div class="manage-song-suggestions" aria-label="Library suggestions"><span>Library suggestions</span>' + suggestions.map(song => '<button type="button" class="ws-button ws-button-quiet" data-act="manage-choir-suggest" data-service="' + esc(id) + '" data-song="' + esc(songLabel(song)) + '">' + esc(songLabel(song)) + '</button>').join('') + '</div>';
        } else if (!songLibrary(state).length) {
          html += '<p class="ws-help">Library suggestions are unavailable in this shell. Manual titles still save to this service.</p>';
        }
        html += '</div>';
      });
      return html + '</section>';
    }

    function renderAutoAssignment(state, department, month) {
      const proposal = screen.proposals && screen.proposals.department === department && screen.proposals.month === month ? screen.proposals : null;
      let html = '<section class="ws-card manage-card" aria-labelledby="manage-auto-title"><div class="manage-section-heading"><div><p class="ws-kicker">Planning aid</p><h2 id="manage-auto-title">Auto propose empty slots</h2></div><span class="ws-badge">Review then save</span></div><p class="ws-muted">Suggestions balance the current upcoming load and respect qualifications, availability, and same-service conflicts. Existing assignments are never replaced.</p><button type="button" class="ws-button ws-button-secondary" data-act="manage-auto-propose">Generate proposals</button>';
      if (proposal) {
        html += '<div class="manage-proposal-summary" aria-live="polite"><strong>' + proposal.items.length + ' proposed</strong><span>' + proposal.unresolved.length + ' unresolved</span></div>';
        if (proposal.items.length) {
          html += '<div class="manage-proposal-list">' + proposal.items.map(item => {
            const service = serviceForId(item.serviceId, state);
            return '<div class="manage-proposal-row"><span>' + esc(service ? dateText(service.date) + ' · ' + (service.service || 'Service') : item.serviceId) + '</span><strong>' + esc(item.duty) + '</strong><span>' + esc(item.member) + '</span></div>';
          }).join('') + '</div><button type="button" class="ws-button ws-button-primary" data-act="manage-auto-save"' + (!proposal.items.length ? ' disabled' : '') + '>Save proposals</button>';
        }
        if (proposal.unresolved.length) {
          html += '<div class="manage-unresolved"><h3>Unresolved slots</h3>' + proposal.unresolved.map(item => '<div><span>' + esc(dateText(item.service.date) + ' · ' + (item.service.service || 'Service')) + '</span><strong>' + esc(item.duty) + '</strong><p>' + esc(item.reason) + '</p></div>').join('') + '</div>';
        }
      }
      return html + '</section>';
    }

    function renderDepartment(state) {
      const department = selectDepartment(selectedDepartment(state), state);
      if (!department) return '<div class="ws-card manage-card"><p class="ws-empty">Choose your name to see the departments you can manage.</p></div>';
      const month = setMonth(monthValue(state));
      let html = '<div class="manage-department-toolbar"><div><p class="ws-kicker">Department first</p><h2>' + esc(department) + ' management</h2></div><div class="manage-month-control"><button type="button" class="ws-button ws-button-quiet" data-act="manage-month-prev" aria-label="Previous month">Previous</button><label for="manage-month">Month<input id="manage-month" type="month" value="' + esc(month) + '" data-chg="manage-month"></label><button type="button" class="ws-button ws-button-quiet" data-act="manage-month-next" aria-label="Next month">Next</button></div></div>';
      html += renderRoster(state, department);
      html += '<section class="ws-card manage-card" aria-labelledby="manage-assignments-title"><div class="manage-section-heading"><div><p class="ws-kicker">Monthly assignments</p><h2 id="manage-assignments-title">' + esc(department) + ' duty slots</h2></div><span class="ws-muted">' + esc(month) + '</span></div>' + renderAssignmentRows(state, department, month) + '</section>';
      html += renderAutoAssignment(state, department, month);
      if (department === 'Choir') html += renderChoirSongs(state, month);
      return html;
    }

    function callLegacy(panel, state) {
      const helper = d.legacy && d.legacy.renderSecondaryPanel ||
        d.renderLegacyManage || d.legacyRenderManage || d.renderLegacy ||
        (d.commands && d.commands.renderLegacyManage);
      if (typeof helper !== 'function') return '';
      try {
        const output = helper(panel, { state, deps: d, screen });
        return typeof output === 'string' ? output : '';
      } catch (error) {
        addBanner('The existing Manage panel could not be opened.', true);
        return '';
      }
    }

    function renderSecondary(panel, state) {
      const legacy = callLegacy(panel, state);
      if (legacy) return '<section class="manage-legacy-panel" data-manage-legacy="' + esc(panel) + '">' + legacy + '</section>';
      const labels = { planning: 'Planning', requests: 'Requests', services: 'Services', people: 'People', features: 'Features', data: 'Data & Sync' };
      return '<section class="ws-card manage-card manage-legacy-missing"><p class="ws-kicker">' + esc(labels[panel] || panel) + '</p><h2>Existing panel adapter pending</h2><p class="ws-muted">The shell should inject the current ' + esc(labels[panel] || panel) + ' renderer here so its existing persistence and confirmation behavior stays available.</p></section>';
    }

    function render() {
      const state = readState();
      const allowed = allowedDepartments(state);
      const current = selectedDepartment(state);
      if (allowed.indexOf(current) === -1 && current) selectDepartment(current, state);
      const tabs = panelTabs(state);
      let html = '<section class="manage-page" data-screen="manage" aria-labelledby="manage-page-title">' +
        '<div class="manage-page-heading"><div><p class="ws-kicker">Coordinator workspace</p><h1 id="manage-page-title">Manage the schedule</h1><p class="ws-muted">Start with a department, then review people and assignments together.</p></div></div>' +
        renderNotice() + renderDepartmentChoice(state) +
        '<nav class="manage-tabs" aria-label="Manage sections">' + tabs.map(tab => '<button type="button" class="' + (screen.panel === tab[0] ? 'is-active' : '') + '" data-act="manage-panel" data-panel="' + esc(tab[0]) + '" aria-current="' + (screen.panel === tab[0] ? 'page' : 'false') + '">' + esc(tab[1]) + '</button>').join('') + '</nav>';
      html += screen.panel === 'department' ? renderDepartment(state) : renderSecondary(screen.panel, state);
      return html + '</section>';
    }

    function updateRosterRule(department, member, updater, state) {
      if (!canManageDepartment(department, state)) {
        setNotice('You cannot edit this department.', 'error');
        refresh();
        return Promise.resolve(false);
      }
      const all = rosterRules(state);
      const dept = all[department] || (all[department] = {});
      const rule = Object.assign({ duties: [], unavailableDates: [], unavailableServiceIds: [] }, dept[member] || {});
      updater(rule);
      rule.duties = parseList(rule.duties).filter(duty => departmentDuties(department, state).indexOf(duty) !== -1);
      rule.unavailableDates = parseList(rule.unavailableDates);
      rule.unavailableServiceIds = parseList(rule.unavailableServiceIds);
      if (!rule.duties.length && !rule.unavailableDates.length && !rule.unavailableServiceIds.length) delete dept[member];
      else dept[member] = rule;
      return write('persistSettings', state.settings).then(() => notifySaved('Roster rules saved.')).catch(() => false);
    }

    function mutateDepartmentRoster(department, member, add, state) {
      if (!canManageDepartment(department, state)) {
        setNotice('You cannot edit this department.', 'error');
        refresh();
        return Promise.resolve(false);
      }
      if (!Array.isArray(state.departments)) {
        if (!state.departments || typeof state.departments !== 'object') state.departments = {};
        if (!Array.isArray(state.departments[department])) state.departments[department] = [];
      }
      const list = state.departments[department] || (state.departments[department] = []);
      const index = list.indexOf(member);
      if (add && index === -1) list.push(member);
      if (!add && index !== -1) list.splice(index, 1);
      list.sort();
      let rulesChanged = false;
      if (!add && state.settings && state.settings.departmentRosterRules && state.settings.departmentRosterRules[department]) {
        rulesChanged = own.call(state.settings.departmentRosterRules[department], member);
        delete state.settings.departmentRosterRules[department][member];
      }
      const settingsWrite = rulesChanged ? write('persistSettings', state.settings) : Promise.resolve();
      return Promise.all([write('persistDepartments', state.departments), settingsWrite])
        .then(() => notifySaved(add ? 'Member added to the roster.' : 'Member removed from the roster.')).catch(() => false);
    }

    function handleAction(token, element) {
      const state = readState();
      if (token === 'manage-panel') {
        const panel = element && element.dataset && element.dataset.panel;
        if (!panel) return false;
        screen.panel = panel;
        setNotice('');
        refresh();
        return true;
      }
      if (token === 'manage-month-prev' || token === 'manage-month-next') {
        const delta = token === 'manage-month-prev' ? -1 : 1;
        setMonth(shiftMonth(monthValue(state), delta));
        screen.proposals = null;
        refresh();
        return true;
      }
      if (token === 'manage-roster-remove') {
        const department = element.dataset.department;
        const member = element.dataset.member;
        if (!department || !member || !canManageDepartment(department, state)) {
          setNotice('You cannot edit this department.', 'error');
          refresh();
          return true;
        }
        const answer = confirmAction('Remove this member from the department roster? Existing assignments stay until changed.');
        if (answer && typeof answer.then === 'function') return answer.then(ok => ok ? mutateDepartmentRoster(department, member, false, state) : false).then(() => true);
        if (answer) mutateDepartmentRoster(department, member, false, state);
        return true;
      }
      if (token === 'manage-assignment-remove') {
        const department = element.dataset.department;
        const service = serviceForId(element.dataset.service, state);
        const duty = element.dataset.duty;
        if (!service || !duty || !validAssignmentTarget(department, duty, state) || !canManageDepartment(department, state)) {
          setNotice('You cannot edit this assignment.', 'error');
          refresh();
          return true;
        }
        const previous = service.assignments && service.assignments[duty] || '';
        if (service.assignments) delete service.assignments[duty];
        const metadata = duty === 'Presider' && previous ? { previousPresider: previous } : null;
        saveService(service, metadata).then(() => notifySaved('Assignment removed.')).catch(() => {});
        return true;
      }
      if (token === 'manage-auto-propose') {
        const department = selectedDepartment(state);
        if (!department || !canManageDepartment(department, state)) {
          setNotice('You cannot generate proposals for this department.', 'error');
          refresh();
          return true;
        }
        screen.proposals = proposeAssignments(department, setMonth(monthValue(state)), state);
        setNotice(screen.proposals.items.length ? 'Review the proposed assignments, then save them.' : 'No empty slots could be proposed.', screen.proposals.items.length ? 'success' : 'error');
        refresh();
        return true;
      }
      if (token === 'manage-auto-save') {
        const proposal = screen.proposals;
        const department = selectedDepartment(state);
        if (!proposal || proposal.department !== department || !canManageDepartment(department, state)) {
          setNotice('These proposals are no longer available.', 'error');
          refresh();
          return true;
        }
        const applied = [];
        const metadataByService = {};
        const unresolved = proposal.unresolved.slice();
        proposal.items.forEach(item => {
          const reason = isStaleProposal(Object.assign({ month: proposal.month }, item), department, state);
          const service = serviceForId(item.serviceId, state);
          if (reason || !service) {
            unresolved.push({ service: service || { date: '', service: '' }, duty: item.duty, reason: reason || 'Service no longer exists.' });
            return;
          }
          if (!service.assignments) service.assignments = {};
          const previous = service.assignments[item.duty] || '';
          service.assignments[item.duty] = item.member;
          if (item.duty === 'Presider' && previous !== item.member) {
            metadataByService[serviceId(service)] = { previousPresider: previous };
          }
          if (applied.indexOf(service) === -1) applied.push(service);
        });
        screen.proposals = { month: proposal.month, department, items: [], unresolved };
        return Promise.all(applied.map(service => saveService(service, metadataByService[serviceId(service)]))).then(() => {
          setNotice(applied.length ? 'Proposals saved. Existing assignments were preserved.' : 'No proposals could be saved.', applied.length ? 'success' : 'error');
          refresh();
          return true;
        }).catch(() => true);
      }
      if (token === 'manage-choir-suggest') {
        const service = serviceForId(element.dataset.service, state);
        if (!service || !canManageDepartment('Choir', state)) {
          setNotice('You cannot edit Choir titles.', 'error');
          refresh();
          return true;
        }
        service.choirSong = element.dataset.song || '';
        saveService(service).then(() => notifySaved('Choir title saved on this service.')).catch(() => {});
        return true;
      }
      return false;
    }

    function handleChange(token, element, eventKind) {
      const state = readState();
      if (token === 'manage-department') {
        selectDepartment(element.value, state);
        screen.proposals = null;
        setNotice('');
        refresh();
        return true;
      }
      if (token === 'manage-month') {
        setMonth(element.value);
        screen.proposals = null;
        refresh();
        return true;
      }
      if (token === 'manage-roster-member') {
        screen.rosterMember = element.value;
        return true;
      }
      if (token === 'manage-roster-duty') {
        const department = element.dataset.department;
        const member = element.dataset.member;
        const duty = element.dataset.duty;
        return updateRosterRule(department, member, rule => {
          const duties = parseList(rule.duties);
          if (element.checked && duties.indexOf(duty) === -1) duties.push(duty);
          if (!element.checked) {
            const index = duties.indexOf(duty);
            if (index !== -1) duties.splice(index, 1);
          }
          rule.duties = duties;
        }, state).then(() => true).catch(() => true);
      }
      if (token === 'manage-roster-availability') {
        if (eventKind === 'input') return true;
        const department = element.dataset.department;
        const member = element.dataset.member;
        const field = element.dataset.field;
        return updateRosterRule(department, member, rule => { rule[field] = parseList(element.value); }, state).then(() => true).catch(() => true);
      }
      if (token === 'manage-assignment') {
        const department = element.dataset.department;
        const service = serviceForId(element.dataset.service, state);
        const duty = element.dataset.duty;
        if (!service || !duty || !validAssignmentTarget(department, duty, state) || !canManageDepartment(department, state)) {
          setNotice('You cannot edit this assignment.', 'error');
          refresh();
          return true;
        }
        const current = service.assignments && service.assignments[duty] || '';
        if (element.value && element.value !== current) {
          if (rosterFor(department, state).indexOf(element.value) === -1 ||
              serviceIsUnavailable(department, element.value, service, duty, state)) {
            setNotice('Choose a qualified and available member from this department.', 'error');
            refresh();
            return true;
          }
        }
        if (!service.assignments) service.assignments = {};
        if (element.value) service.assignments[duty] = element.value;
        else delete service.assignments[duty];
        const metadata = duty === 'Presider' && current !== (element.value || '')
          ? { previousPresider: current } : null;
        saveService(service, metadata).then(() => notifySaved('Assignment saved.')).catch(() => {});
        return true;
      }
      if (token === 'manage-choir-song') {
        if (eventKind === 'input') return true;
        const service = serviceForId(element.dataset.service, state);
        if (!service || !canManageDepartment('Choir', state)) {
          setNotice('You cannot edit Choir titles.', 'error');
          refresh();
          return true;
        }
        service.choirSong = String(element.value || '');
        screen.songQuery = service.choirSong;
        saveService(service).then(() => notifySaved('Choir title saved on this service.')).catch(() => {});
        return true;
      }
      return false;
    }

    function handle(kind, token, element) {
      const eventKind = kind || '';
      const target = element || {};
      const value = token || (target.dataset && (target.dataset.act || target.dataset.chg)) || '';
      if (eventKind === 'act' || eventKind === 'submit' || eventKind === 'click' || (!eventKind && value)) {
        const actionResult = handleAction(value, target);
        if (actionResult) return actionResult;
      }
      if (eventKind === 'chg' || eventKind === 'input' || eventKind === 'change' || (!eventKind && value)) {
        const changeResult = handleChange(value, target, eventKind);
        if (changeResult) return changeResult;
      }
      const rosterAddSubmit = eventKind === 'submit' &&
        (value === 'manage-roster-add' || (target.dataset && target.dataset.act === 'manage-roster-add'));
      if (rosterAddSubmit) {
        const state = readState();
        const department = selectedDepartment(state);
        const member = (target.querySelector && target.querySelector('[name="member"]') || {}).value || screen.rosterMember;
        if (!department || !member || !canManageDepartment(department, state)) {
          setNotice('Choose a member and an authorized department.', 'error');
          refresh();
          return true;
        }
        screen.rosterMember = '';
        return mutateDepartmentRoster(department, member, true, state).then(() => true);
      }
      return false;
    }

    function afterRender() {
      /* The screen uses delegated shell events and has no listeners to attach. */
    }

    function destroy() {
      screen.proposals = null;
      screen.notice = '';
    }

    return Object.freeze({ render, handle, afterRender, destroy });
  }

  return { create };
});
