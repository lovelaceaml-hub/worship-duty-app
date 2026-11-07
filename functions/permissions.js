'use strict';

/*
 * Pure authorization and duty configuration for the Worship Duty app.
 *
 * This module deliberately has no DOM, Firebase, localStorage, or network
 * dependency.  The browser and Node consumers use the same API and the same
 * default duty map.  Identities are supplied by the caller's authorization
 * config or verified auth claims. Privileged names only appear in the default
 * role configuration, never in permission branches.
 */

const DEPARTMENT_DUTIES = {
  Worship: ['Presider', 'Sermon', 'Prayer of Thanks', 'Closing Prayer'],
  'Usher Sisters': ['Usher Door', 'Usher Front', 'Usher Back'],
  'Usher Brothers': ['Usher #1', 'Usher #2', 'Lobby Security'],
  Lobby: ['Lobby Desk #1', 'Lobby Desk #2'],
  Translation: ['Translation #1', 'Translation #2'],
  Media: ['Media Booth #1', 'Media Booth #2'],
  'Parking Lot': ['Parking #1', 'Parking #2', 'Parking #3', 'Parking #4', 'Parking #5'],
  Offering: ['Offering #1', 'Offering #2', 'Offering #3', 'Offering #4', 'Offering #5', 'Offering #6'],
  "Children's Teachers": ['Small Sanctuary #1', 'Small Sanctuary #2', 'Main Sanctuary #1', 'Main Sanctuary #2']
};

const DEPARTMENTS = Object.freeze(Object.keys(DEPARTMENT_DUTIES));
Object.keys(DEPARTMENT_DUTIES).forEach(department => {
  Object.freeze(DEPARTMENT_DUTIES[department]);
});
Object.freeze(DEPARTMENT_DUTIES);

const DUTY_TO_DEPARTMENT = Object.freeze(Object.keys(DEPARTMENT_DUTIES).reduce((out, department) => {
  DEPARTMENT_DUTIES[department].forEach(duty => { out[duty] = department; });
  return out;
}, {}));

/* One person, one duty per service, with one exception: Thanks Prayer or
   Closing Prayer together with an usher duty (Lobby Security is not an usher
   duty here). Opening Prayer (stored as Sermon) is never paired: whoever
   gives it delivers the sermon and holds no other duty. The app's
   app/lib/conflicts.js has the same rule; a test keeps the two in step. */
const PRAYER_DUTIES = Object.freeze(['Prayer of Thanks', 'Closing Prayer']);
const USHER_DUTIES = Object.freeze(['Usher Door', 'Usher Front', 'Usher Back', 'Usher #1', 'Usher #2']);

/* Two duties a leader marked always OK together (app/settings okPairs),
   for anyone: "Offering #6 + Prayer of Thanks". The key is the two duties in
   name order, so either order finds it. Opening Prayer is never paired. */
function okPairKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join(' + ');
}

function canBeOkPair(a, b) {
  return !!DUTY_TO_DEPARTMENT[a] && !!DUTY_TO_DEPARTMENT[b] && a !== b && a !== 'Sermon' && b !== 'Sermon'
    && !dutiesAllowedTogether([a, b]);
}

/* The always-OK pairs saved in app/settings, as a Set of keys. */
function okPairsOf(settings) {
  const list = settings && Array.isArray(settings.okPairs) ? settings.okPairs : [];
  return new Set(list.filter(key => typeof key === 'string' && key.indexOf(' + ') > 0));
}

/* `okPairs` (a Set or list of okPairKey keys) adds the pairs leaders marked
   always OK to the built-in one. */
function dutiesAllowedTogether(duties, okPairs) {
  const list = Array.isArray(duties) ? duties : [];
  if (list.length < 2) return true;
  if (list.length > 2) return false;
  const prayer = duty => PRAYER_DUTIES.indexOf(duty) !== -1;
  const usher = duty => USHER_DUTIES.indexOf(duty) !== -1;
  if ((prayer(list[0]) && usher(list[1])) || (usher(list[0]) && prayer(list[1]))) return true;
  const pairs = okPairs instanceof Set ? okPairs : new Set(Array.isArray(okPairs) ? okPairs : []);
  return pairs.has(okPairKey(list[0], list[1]));
}

/* Duties with a default member: Fill always gives the duty to its default
   when they can take it, and new services start with them on it. Opening
   Prayer goes to the church overseer unless a Worship leader or an
   administrator chooses someone else, or no one (app/settings dutyDefaults);
   another preacher is put on by hand. app/config/duties.js holds the same. */
const DUTY_DEFAULTS = Object.freeze({ Sermon: 'E. Simon' });

/* The default member for `duty` with these app settings: the saved choice
   ('' when a leader chose none), else the built-in one. */
function dutyDefault(settings, duty) {
  const saved = settings && settings.dutyDefaults;
  if (saved && typeof saved === 'object' && Object.prototype.hasOwnProperty.call(saved, duty)) return String(saved[duty] || '').trim();
  return DUTY_DEFAULTS[duty] || '';
}

/* The duties `memberName` already holds in a service's `assignments` that
   rule out also taking `duty` there; empty when they may take it. */
function blockingDuties(assignments, memberName, duty, okPairs) {
  const map = assignments && typeof assignments === 'object' ? assignments : {};
  const name = String(memberName || '');
  if (!name) return [];
  const others = Object.keys(map).filter(other => other !== duty && String(map[other] || '') === name);
  return dutiesAllowedTogether(others.concat([duty]), okPairs) ? [] : others;
}

const ROLE_ALIASES = Object.freeze({
  admin: Object.freeze(['admin', 'administrator']),
  globalManager: Object.freeze([
    'globalmanager', 'globalleader', 'globalleadermanager', 'globaladmin',
    'leadermanager', 'manager'
  ]),
  departmentLeader: Object.freeze(['departmentleader', 'deptleader', 'leader']),
  songEditor: Object.freeze(['songeditor', 'songmanager', 'songadmin'])
});

const ROLE_CONFIG_KEYS = Object.freeze({
  admin: Object.freeze(['admin', 'admins', 'adminNames', 'administrators']),
  globalManager: Object.freeze([
    'globalManager', 'globalManagers', 'globalLeader', 'globalLeaders',
    'globalLeaderManager', 'globalLeaderManagers', 'leaderManager',
    'leaderManagers', 'managers'
  ]),
  departmentLeader: Object.freeze([
    'departmentLeader', 'departmentLeaders', 'deptLeader', 'deptLeaders',
    'leadersByDepartment'
  ]),
  songEditor: Object.freeze(['songEditor', 'songEditors', 'songEditorNames', 'songManagers'])
});

const ACTION_CONFIG_KEYS = Object.freeze({
  manageLeaders: Object.freeze(['manageLeaders', 'leaderManagers', 'globalManagers']),
  createService: Object.freeze(['createService', 'createServices', 'serviceCreators']),
  resetPin: Object.freeze(['resetPin', 'resetPins', 'pinResetters']),
  editSongs: Object.freeze(['editSongs', 'songEditors', 'songEditorNames'])
});

const DEFAULT_DEPARTMENT_LEADERS = {
  Worship: ['E. Simon', 'D. Armani', 'B. Brent'],
  'Usher Sisters': ['M. Chloe'],
  'Usher Brothers': ['D. Chris'],
  Lobby: ['S. Anessa'],
  Translation: ['S. Paola'],
  Media: ['D. Aaron', 'D. Armani', 'B. Brent'],
  'Parking Lot': ['D. Aaron'],
  Offering: ['S. Elisa'],
  "Children's Teachers": ['D. Kenya']
};
Object.keys(DEFAULT_DEPARTMENT_LEADERS).forEach(department => {
  Object.freeze(DEFAULT_DEPARTMENT_LEADERS[department]);
});
Object.freeze(DEFAULT_DEPARTMENT_LEADERS);

const DEFAULT_SONG_EDITORS = Object.freeze([
  'D. Danielle', 'B. James', 'D. Aaron', 'D. Armani', 'B. Brent'
]);

/* The production role assignment is data, not a name check in a permission
   branch. Callers may pass a replacement config for tests or another tenant. */
const DEFAULT_PERMISSION_CONFIG = Object.freeze({
  admin: Object.freeze(['B. Anthony']),
  globalLeaderManager: Object.freeze(['B. Anthony', 'E. Simon']),
  departmentLeaders: DEFAULT_DEPARTMENT_LEADERS,
  songEditors: DEFAULT_SONG_EDITORS,
  roles: Object.freeze({
    admin: Object.freeze(['B. Anthony']),
    admins: Object.freeze(['B. Anthony']),
    globalLeaderManager: Object.freeze(['B. Anthony', 'E. Simon']),
    globalLeaderManagers: Object.freeze(['B. Anthony', 'E. Simon']),
    departmentLeaders: DEFAULT_DEPARTMENT_LEADERS,
    departmentLeader: DEFAULT_DEPARTMENT_LEADERS,
    songEditor: DEFAULT_SONG_EDITORS,
    songEditors: DEFAULT_SONG_EDITORS
  }),
  departmentDuties: DEPARTMENT_DUTIES
});

function asArray(value) {
  if (value == null) return [];
  if (typeof Set !== 'undefined' && value instanceof Set) return Array.from(value);
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function key(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function roleKey(value) {
  return key(value).replace(/[^a-z0-9]/g, '');
}

function identityFields() {
  return [
    'name', 'memberName', 'member', 'memberId', 'displayName', 'uid', 'userId',
    'id', 'sub', 'user_id', 'email'
  ];
}

function identityValues(identity, seen) {
  if (identity == null) return [];
  if (typeof identity === 'string' || typeof identity === 'number') {
    const value = text(identity);
    return value ? [value] : [];
  }
  if (typeof identity !== 'object') return [];

  const visited = Array.isArray(seen) ? seen : [];
  if (visited.indexOf(identity) !== -1) return [];
  visited.push(identity);

  const values = [];
  const add = value => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      identityValues(value, visited).forEach(add);
      return;
    }
    const item = text(value);
    if (item && !values.some(existing => key(existing) === key(item))) values.push(item);
  };
  identityFields().forEach(field => add(identity[field]));

  // Firebase adapters commonly pass the verified auth record as { token }
  // or { claims }. Compare its member identity as well as the outer object.
  ['token', 'claims', 'customClaims'].forEach(field => {
    identityValues(identity[field], visited).forEach(add);
  });

  visited.pop();
  return values;
}

function sameIdentity(left, right) {
  const leftValues = identityValues(left).map(key);
  const rightValues = identityValues(right).map(key);
  return leftValues.length > 0 && rightValues.some(value => leftValues.indexOf(value) !== -1);
}

function isIdentityObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [
    ...identityFields(),
    'role', 'roles', 'claims', 'customClaims', 'token', 'isAdmin',
    'department', 'departments', 'managedDepartments', 'memberships',
    'departmentMemberships', 'memberDepartments', 'assignments', 'duty',
    'duties', 'service'
  ].some(field => Object.prototype.hasOwnProperty.call(value, field));
}

function hasStableIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return identityFields().some(field => Object.prototype.hasOwnProperty.call(value, field));
}

function isConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.config || value.authConfig || value.permissionConfig || value.roleConfig || value.departmentConfig) return true;
  if (hasStableIdentity(value)) {
    return Object.prototype.hasOwnProperty.call(value, 'departmentDuties') ||
      Object.prototype.hasOwnProperty.call(value, 'dutyToDepartment');
  }
  const markers = [
    'roles', 'roleMembers', 'roleAssignments', 'users', 'members', 'people',
    'admin', 'admins', 'adminNames', 'globalLeaderManager', 'globalLeaderManagers',
    'globalLeaders', 'globalManagers', 'departmentLeaders', 'departmentLeader',
    'deptLeaders', 'leadersByDepartment',
    'songEditor', 'songEditors', 'songEditorNames', 'departmentDuties',
    'departments', 'dutyDepartments', 'dutyToDepartment', 'dutyMap',
    'permissions', 'access', 'presiders', 'editSongs', 'createService',
    'resetPin', 'serviceCreators', 'pinResetters',
    'roleConfig', 'departmentConfig', 'departmentMembers', 'membersByDepartment',
    'departmentMemberships', 'memberships', 'memberDepartments'
  ];
  if (Object.prototype.hasOwnProperty.call(value, 'roles')) {
    // A roles array is an actor claim. A roles object is a role config.
    if (value.roles && typeof value.roles === 'object' && !Array.isArray(value.roles)) return true;
  }
  if (value.departments && typeof value.departments === 'object' && !Array.isArray(value.departments)) {
    return true;
  }
  return markers.some(marker => marker !== 'departments' && Object.prototype.hasOwnProperty.call(value, marker));
}

function unwrapConfig(value) {
  if (!value || typeof value !== 'object') return {};
  if (value.permissionConfig && typeof value.permissionConfig === 'object') {
    return value.permissionConfig;
  }
  if (value.authConfig && typeof value.authConfig === 'object') return value.authConfig;
  if (value.roleConfig && typeof value.roleConfig === 'object') return value.roleConfig;
  if (value.departmentConfig && typeof value.departmentConfig === 'object') return value.departmentConfig;
  if (value.config && typeof value.config === 'object' && isConfig(value.config)) {
    return value.config;
  }
  return value;
}

function isEmptyConfig(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 0;
}

function contextFor(args, configPositions) {
  const values = Array.prototype.slice.call(args || []);
  let configIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (isConfig(values[i])) {
      configIndex = i;
      break;
    }
  }
  if (configIndex === -1) {
    const positions = Array.isArray(configPositions) ? configPositions : [];
    configIndex = positions.find(index => index >= 0 && index < values.length && isEmptyConfig(values[index]));
    if (configIndex === undefined) configIndex = -1;
  }
  const config = configIndex === -1 ? DEFAULT_PERMISSION_CONFIG : unwrapConfig(values[configIndex]);
  let actorIndex = values.findIndex((value, index) => index !== configIndex && (
    typeof value === 'string' || typeof value === 'number' || isIdentityObject(value)
  ));
  if (actorIndex === -1) actorIndex = configIndex === 0 ? 1 : 0;
  return {
    actor: values[actorIndex],
    config,
    values: values.filter((value, index) => index !== actorIndex && index !== configIndex)
  };
}

function getPathObjects(config) {
  const out = [config];
  ['roles', 'roleMembers', 'roleAssignments', 'permissions', 'access'].forEach(path => {
    if (config && config[path] && typeof config[path] === 'object') out.push(config[path]);
  });
  return out;
}

function valueForKey(object, wanted) {
  if (!object || typeof object !== 'object') return undefined;
  const wantedKey = key(wanted);
  const found = Object.keys(object).find(existing => key(existing) === wantedKey);
  return found === undefined ? undefined : object[found];
}

function roleEntries(config, role) {
  const entries = [];
  const aliases = ROLE_CONFIG_KEYS[role] || [];

  getPathObjects(config).forEach(source => {
    aliases.forEach(alias => {
      const value = valueForKey(source, alias);
      if (value !== undefined) entries.push(value);
    });
  });

  // Also accept { userName: ['admin', 'songEditor'] } or
  // { userName: { roles: ['admin'] } } maps.
  ['users', 'members', 'people', 'roleAssignments'].forEach(path => {
    const source = config && config[path];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    Object.keys(source).forEach(identity => {
      const value = source[identity];
      const roles = value && typeof value === 'object' && !Array.isArray(value)
        ? asArray(value.roles || value.role).concat(
          Object.keys(value)
            .filter(field => ROLE_ALIASES[role].indexOf(roleKey(field)) !== -1 && value[field] === true)
            .map(() => role)
        )
        : asArray(value);
      if (roles.some(item => ROLE_ALIASES[role].indexOf(roleKey(item)) !== -1)) {
        entries.push(identity);
        if (value && typeof value === 'object' && !Array.isArray(value)) entries.push(value);
      }
    });
  });

  // A role map is also commonly written as { admin: { user: true } }.
  getPathObjects(config).forEach(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    Object.keys(source).forEach(existingRole => {
      if (ROLE_ALIASES[role].indexOf(roleKey(existingRole)) === -1) return;
      const value = source[existingRole];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.keys(value).forEach(identity => {
          if (value[identity] !== false) entries.push(identity);
        });
      }
    });
  });
  return entries.reduce((out, value) => out.concat(asArray(value)), []);
}

function roleForAlias(value) {
  const normalized = roleKey(value);
  if (!normalized) return '';
  return Object.keys(ROLE_ALIASES).find(role => ROLE_ALIASES[role].indexOf(normalized) !== -1) || '';
}

function actorRoles(actor) {
  const roles = [];
  const add = value => asArray(value).forEach(item => {
    const normalized = roleKey(item);
    if (normalized && roles.indexOf(normalized) === -1) roles.push(normalized);
  });
  const addRoleValue = value => {
    if (value == null) return;
    if (typeof Set !== 'undefined' && value instanceof Set) {
      value.forEach(addRoleValue);
      return;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (Object.prototype.hasOwnProperty.call(value, 'role')) addRoleValue(value.role);
      if (Object.prototype.hasOwnProperty.call(value, 'roles')) addRoleValue(value.roles);
      Object.keys(value).forEach(field => {
        if (value[field] !== true) return;
        const canonical = roleForAlias(field);
        if (canonical) add(canonical);
      });
      return;
    }
    asArray(value).forEach(item => add(item));
  };
  const addClaimSource = (source, seen) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    const visited = Array.isArray(seen) ? seen : [];
    if (visited.indexOf(source) !== -1) return;
    visited.push(source);
    addRoleValue(source.role);
    addRoleValue(source.roles);
    if (source.isAdmin === true) add('admin');
    Object.keys(source).forEach(field => {
      if (source[field] !== true) return;
      const canonical = roleForAlias(field);
      if (canonical) add(canonical);
    });
    ['token', 'claims', 'customClaims'].forEach(field => addClaimSource(source[field], visited));
    visited.pop();
  };
  if (actor && typeof actor === 'object') {
    // Direct role fields are retained for the existing adapter contract.
    addRoleValue(actor.role);
    addRoleValue(actor.roles);
    ['claims', 'customClaims', 'token'].forEach(field => addClaimSource(actor[field]));
  }
  return roles;
}

function hasRole(actor, config, role) {
  const wanted = ROLE_ALIASES[role] || [];
  if (actorRoles(actor).some(item => wanted.indexOf(item) !== -1)) return true;
  return roleEntries(config, role).some(entry => sameIdentity(actor, entry));
}

function hasActionRole(actor, config, action) {
  const aliases = ACTION_CONFIG_KEYS[action] || [];
  const sources = getPathObjects(config);
  for (let i = 0; i < sources.length; i++) {
    for (let j = 0; j < aliases.length; j++) {
      const value = valueForKey(sources[i], aliases[j]);
      if (value === undefined) continue;
      if (asArray(value).some(entry => sameIdentity(actor, entry))) return true;
    }
  }
  return false;
}

function configuredDepartmentDuties(config) {
  const maps = [];
  getPathObjects(config).forEach(source => {
    ['departmentDuties', 'departments', 'dutiesByDepartment', 'departmentConfig'].forEach(path => {
      const value = source && source[path];
      if (value && typeof value === 'object' && !Array.isArray(value)) maps.push(value);
    });
  });
  return maps;
}

function allDepartments(config) {
  const names = DEPARTMENTS.slice();
  configuredDepartmentDuties(config).forEach(map => {
    Object.keys(map).forEach(department => {
      const value = map[department];
      const duties = Array.isArray(value) ? value : value && value.duties;
      if (Array.isArray(duties) && names.every(existing => key(existing) !== key(department))) {
        names.push(text(department));
      }
    });
  });
  departmentLeaderMaps(config).forEach(map => {
    Object.keys(map).forEach(department => {
      const normalized = normalizeDepartment(department, config);
      if (normalized && names.every(existing => key(existing) !== key(normalized))) names.push(normalized);
    });
  });
  return names;
}

function normalizeDepartment(value, config) {
  const raw = text(value);
  if (!raw) return '';
  const aliases = config && config.departmentAliases;
  if (aliases && typeof aliases === 'object') {
    const mapped = valueForKey(aliases, raw);
    if (mapped) return normalizeDepartment(mapped, Object.assign({}, config, { departmentAliases: null }));
  }
  const match = allKnownDepartments(config).find(department => key(department) === key(raw));
  return match || '';
}

function allKnownDepartments(config) {
  const names = DEPARTMENTS.slice();
  configuredDepartmentDuties(config).forEach(map => {
    Object.keys(map).forEach(department => {
      const value = map[department];
      const duties = Array.isArray(value) ? value : value && value.duties;
      if (Array.isArray(duties) && names.every(existing => key(existing) !== key(department))) {
        names.push(text(department));
      }
    });
  });
  return names;
}

function configuredDutyDepartment(config) {
  const out = {};
  const add = (duty, department) => {
    const dutyName = text(duty);
    const departmentName = normalizeDepartment(department, Object.assign({}, config, { dutyToDepartment: null }));
    if (dutyName && departmentName) out[key(dutyName)] = departmentName;
  };
  ['dutyToDepartment', 'dutyDepartments', 'departmentByDuty', 'dutyMap'].forEach(path => {
    const map = config && config[path];
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    Object.keys(map).forEach(duty => add(duty, map[duty]));
  });
  configuredDepartmentDuties(config).forEach(map => {
    Object.keys(map).forEach(department => {
      const value = map[department];
      const duties = Array.isArray(value) ? value : value && value.duties;
      if (Array.isArray(duties)) duties.forEach(duty => add(duty, department));
    });
  });
  return out;
}

function departmentForDuty(duty, config) {
  const raw = text(duty);
  if (!raw) return '';
  const configured = configuredDutyDepartment(config)[key(raw)];
  if (configured) return configured;
  const found = Object.keys(DUTY_TO_DEPARTMENT).find(existing => key(existing) === key(raw));
  return found ? DUTY_TO_DEPARTMENT[found] : '';
}

function departmentLeaderMaps(config) {
  const maps = [];
  getPathObjects(config).forEach(source => {
    ['departmentLeaders', 'departmentLeader', 'deptLeaders', 'leadersByDepartment'].forEach(path => {
      const map = source && source[path];
      if (map && typeof map === 'object' && !Array.isArray(map)) maps.push(map);
    });
  });
  return maps;
}

function departmentLeaderEntries(config) {
  const out = [];
  departmentLeaderMaps(config).forEach(map => {
    Object.keys(map).forEach(first => {
      const value = map[first];
      const department = normalizeDepartment(first, config);
      if (department) {
        const leaders = value && typeof value === 'object' && !Array.isArray(value)
          ? (value.leaders || value.members || value.names || value.users || [])
          : value;
        out.push({ department, leaders: asArray(leaders) });
      } else {
        // Accept the inverse shape: { memberName: ['Worship', 'Media'] }.
        const departments = value && typeof value === 'object' && !Array.isArray(value)
          ? (value.departments || value.manages || value.areas || [])
          : value;
        const owned = asArray(departments)
          .map(item => normalizeDepartment(item, config))
          .filter(Boolean);
        if (owned.length) out.push({ identity: first, departments: owned });
      }
    });
  });
  return out;
}

function actorDepartments(actor, config) {
  const out = [];
  const add = value => asArray(value).forEach(item => {
    const department = normalizeDepartment(item, config);
    if (department && out.indexOf(department) === -1) out.push(department);
  });
  const actorSources = [];
  const collectActorSource = (source, seen) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    const visited = Array.isArray(seen) ? seen : [];
    if (visited.indexOf(source) !== -1) return;
    visited.push(source);
    actorSources.push(source);
    ['token', 'claims', 'customClaims'].forEach(field => collectActorSource(source[field], visited));
  };
  collectActorSource(actor);
  actorSources.forEach(source => {
    add(source.departments);
    add(source.department);
    add(source.managedDepartments);
    add(source.manages);
  });
  getPathObjects(config).forEach(source => {
    ['users', 'members', 'people'].forEach(path => {
      const members = source && source[path];
      if (!members || typeof members !== 'object' || Array.isArray(members)) return;
      Object.keys(members).forEach(identity => {
        const value = members[identity];
        if (!sameIdentity(actor, identity) || !value || typeof value !== 'object' || Array.isArray(value)) return;
        add(value.departments || value.managedDepartments || value.manages);
      });
    });
  });
  return out;
}

function departmentsForLeader(actor, config) {
  const context = contextFor(arguments, [0, 1]);
  actor = context.actor;
  config = context.config;
  if (!actor) return [];

  if (hasRole(actor, config, 'admin')) {
    return allDepartments(config);
  }

  const owned = [];
  const add = value => {
    const department = normalizeDepartment(value, config);
    if (department && owned.indexOf(department) === -1) owned.push(department);
  };
  departmentLeaderEntries(config).forEach(entry => {
    if (entry.identity && sameIdentity(actor, entry.identity)) entry.departments.forEach(add);
    if (entry.leaders && entry.leaders.some(leader => sameIdentity(actor, leader))) add(entry.department);
  });
  if (hasRole(actor, config, 'departmentLeader')) actorDepartments(actor, config).forEach(add);

  const order = allDepartments(config);
  return order.filter(department => owned.indexOf(department) !== -1)
    .concat(owned.filter(department => order.indexOf(department) === -1));
}

function isAdmin(actor, config) {
  const context = contextFor(arguments, [0, 1]);
  return !!context.actor && hasRole(context.actor, context.config, 'admin');
}

function isGlobalManager(actor, config) {
  const context = contextFor(arguments, [0, 1]);
  return !!context.actor && hasRole(context.actor, context.config, 'globalManager');
}

function canManageLeaders(actor, config) {
  const context = contextFor(arguments, [0, 1]);
  return !!context.actor && (
    hasRole(context.actor, context.config, 'admin') ||
    isGlobalManager(context.actor, context.config) ||
    hasActionRole(context.actor, context.config, 'manageLeaders')
  );
}

function findDepartment(values, config) {
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (typeof value === 'string') {
      const department = normalizeDepartment(value, config);
      if (department) return department;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const department = value.department || value.departmentName || value.dept || value.category;
      const normalized = normalizeDepartment(department, config);
      if (normalized) return normalized;
    }
  }
  return '';
}

function canManageDepartment(actor, department, config) {
  const context = contextFor(arguments, [0, 2]);
  const targetDepartment = normalizeDepartment(
    findDepartment(context.values.concat([department]), context.config), context.config
  );
  if (!context.actor || !targetDepartment) return false;
  if (isAdmin(context.actor, context.config)) return true;
  return departmentsForLeader(context.actor, context.config).indexOf(targetDepartment) !== -1;
}

function findDuty(values, config) {
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (typeof value === 'string' && departmentForDuty(value, config)) return text(value);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const duty = value.duty || value.dutyName || value.roleName;
      if (duty && departmentForDuty(duty, config)) return text(duty);
    }
  }
  return '';
}

function canEditDuty(actor, duty, config) {
  const context = contextFor(arguments, [0, 2]);
  const dutyName = findDuty(context.values.concat([duty]), context.config);
  const department = departmentForDuty(dutyName, context.config);
  return !!context.actor && !!department && canManageDepartment(context.actor, department, context.config);
}

function canManageDepartmentMember(actor, department, member, config) {
  const context = contextFor(arguments, [0, 3]);
  const targetDepartment = findDepartment(context.values.concat([department, member]), context.config);
  return !!targetDepartment && canManageDepartment(context.actor, targetDepartment, context.config);
}

function departmentsFromRequest(value, config) {
  if (typeof value === 'string') {
    const department = normalizeDepartment(value, config);
    if (department) return [department];
    const duty = departmentForDuty(value, config);
    return duty ? [duty] : [];
  }
  if (!value || typeof value !== 'object') return [];

  const out = [];
  const addDepartment = item => {
    const department = normalizeDepartment(item, config);
    if (department && out.indexOf(department) === -1) out.push(department);
  };
  const addDuty = item => {
    const department = departmentForDuty(item, config);
    if (department && out.indexOf(department) === -1) out.push(department);
  };
  asArray(value.departments || value.department || value.departmentName || value.dept || value.category)
    .forEach(addDepartment);
  asArray(value.duties || value.duty || value.dutyName || value.dutyNames || value.roleName).forEach(addDuty);
  if (value.service && typeof value.service === 'object') {
    departmentsFromRequest(value.service, config).forEach(addDepartment);
  }
  if (value.assignments && typeof value.assignments === 'object') {
    Object.keys(value.assignments).forEach(addDuty);
  }
  return out;
}

function firstScopeValue(values, config) {
  return values.find(value => {
    if (value && typeof value === 'object') return true;
    return typeof value === 'string' && (
      !!normalizeDepartment(value, config) || !!departmentForDuty(value, config)
    );
  });
}

function canResolveRequest(actor, request, config) {
  const context = contextFor(arguments, [0, 2]);
  const source = firstScopeValue(context.values.concat([request]), context.config);
  const departments = departmentsFromRequest(source, context.config);
  if (!context.actor || !departments.length) return false;
  if (isAdmin(context.actor, context.config)) return true;
  return departments.every(department => canManageDepartment(context.actor, department, context.config));
}

function conflictDepartments(value, config) {
  if (typeof value === 'string') {
    const department = normalizeDepartment(value, config);
    return department ? [department] : [];
  }
  if (!value || typeof value !== 'object') return [];
  const out = [];
  const add = department => {
    const normalized = normalizeDepartment(department, config);
    if (normalized && out.indexOf(normalized) === -1) out.push(normalized);
  };
  asArray(value.departments || value.department || value.departmentName || value.dept || value.category).forEach(add);
  asArray(value.duties || value.duty || value.dutyName || value.dutyNames).forEach(duty => {
    const department = departmentForDuty(duty, config);
    if (department) add(department);
  });
  if (value.service && typeof value.service === 'object') {
    conflictDepartments(value.service, config).forEach(add);
  }
  if (value.assignments && typeof value.assignments === 'object') {
    const byMember = {};
    Object.keys(value.assignments).forEach(duty => {
      const member = text(value.assignments[duty]);
      if (!member) return;
      (byMember[member] || (byMember[member] = [])).push(duty);
    });
    Object.keys(byMember).forEach(member => {
      if (byMember[member].length < 2) return;
      byMember[member].forEach(duty => {
        const department = departmentForDuty(duty, config);
        if (department) add(department);
      });
    });
  }
  return out;
}

function canAcknowledgeConflict(actor, conflict, config) {
  const context = contextFor(arguments, [0, 2]);
  const source = firstScopeValue(context.values.concat([conflict]), context.config);
  const departments = conflictDepartments(source, context.config);
  if (!context.actor || !departments.length) return false;
  if (isAdmin(context.actor, context.config)) return true;
  // A conflict is a shared item. Any leader for an affected department may
  // acknowledge it, after which the shared record is visible to all leaders.
  return departments.some(department => canManageDepartment(context.actor, department, context.config));
}

function serviceForSongs(values) {
  return values.find(value => value && typeof value === 'object' && !Array.isArray(value));
}

function canEditSongs(actor, service, config) {
  const context = contextFor(arguments, [0, 2]);
  const songService = serviceForSongs(context.values.concat([service]));
  if (!context.actor) return false;
  if (
    isAdmin(context.actor, context.config) ||
    hasRole(context.actor, context.config, 'songEditor') ||
    hasActionRole(context.actor, context.config, 'editSongs')
  ) return true;

  // A presider may edit songs only for a service they are assigned to. This
  // is data-driven and does not grant the role to any hard-coded name.
  if (!songService) return false;
  const presider = songService.presider || songService.presiderName ||
    (songService.assignments && songService.assignments.Presider);
  return !!presider && sameIdentity(context.actor, presider);
}

function canCreateService(actor, config) {
  const context = contextFor(arguments, [0, 1]);
  return !!context.actor && (
    isAdmin(context.actor, context.config) ||
    hasActionRole(context.actor, context.config, 'createService')
  );
}

function departmentsForPinTarget(values, config) {
  const out = [];
  const addDepartment = value => {
    const department = normalizeDepartment(value, config);
    if (department && out.indexOf(department) === -1) out.push(department);
  };
  const addMembershipMap = map => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    Object.keys(map).forEach(departmentName => {
      const department = normalizeDepartment(departmentName, config);
      const value = map[departmentName];
      if (department) {
        const members = value && typeof value === 'object' && !Array.isArray(value)
          ? (value.members || value.names || value.active || value.membersList || [])
          : value;
        if (values.some(item => asArray(members).some(member => sameIdentity(item, member)))) {
          addDepartment(department);
        }
        return;
      }

      // Also accept the inverse shape: { memberName: ['Translation'] }.
      const departments = value && typeof value === 'object' && !Array.isArray(value)
        ? (value.departments || value.manages || value.areas || [])
        : value;
      if (values.some(item => sameIdentity(item, departmentName))) {
        asArray(departments).forEach(addDepartment);
      }
    });
  };

  values.forEach(value => {
    if (typeof value === 'string') addDepartment(value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const directDepartments = value.departments;
    if (directDepartments && typeof directDepartments === 'object' && !Array.isArray(directDepartments)) {
      addMembershipMap(directDepartments);
    } else {
      asArray(directDepartments || value.department || value.departmentName || value.dept)
        .forEach(addDepartment);
    }
    const memberships = value.memberships || value.departmentMemberships || value.memberDepartments;
    if (memberships && typeof memberships === 'object') {
      if (Array.isArray(memberships)) memberships.forEach(item => addDepartment(item && (item.department || item.name)));
      else addMembershipMap(memberships);
    }
  });

  getPathObjects(config).forEach(source => {
    [
      'departmentMembers', 'membersByDepartment', 'departmentMemberships',
      'memberships', 'memberDepartments', 'departments'
    ].forEach(path => {
      addMembershipMap(source && source[path]);
    });
  });
  return out;
}

function canResetPin(actor, target, config) {
  const context = contextFor(arguments, [0, 2]);
  if (!context.actor) return false;
  if (
    isAdmin(context.actor, context.config) ||
    isGlobalManager(context.actor, context.config) ||
    hasActionRole(context.actor, context.config, 'resetPin')
  ) return true;

  const targetValues = context.values.concat([target]).filter(value => value !== undefined);
  const targetDepartments = departmentsForPinTarget(targetValues, context.config);
  if (!targetDepartments.length) return false;
  const managed = departmentsForLeader(context.actor, context.config);
  // A member may belong to several departments. One applicable leader scope
  // is enough to reset that member's PIN.
  return targetDepartments.some(department => managed.indexOf(department) !== -1);
}

const PERMISSION_METHODS = [
  'isAdmin', 'canManageLeaders', 'departmentsForLeader', 'canManageDepartment',
  'canEditDuty', 'canManageDepartmentMember', 'canResolveRequest',
  'canAcknowledgeConflict', 'canEditSongs', 'canCreateService', 'canResetPin'
];

/* Bind one explicit authorization document for callers that do not want to
   thread the config through every helper call. */
function createPermissions(config) {
  const resolved = config === undefined ? DEFAULT_PERMISSION_CONFIG : unwrapConfig(config);
  const bound = {
    config: resolved,
    DEPARTMENT_DUTIES,
    DUTIES_BY_DEPARTMENT: DEPARTMENT_DUTIES,
    DEPARTMENTS,
    DUTY_TO_DEPARTMENT,
    DUTY_DEPARTMENTS: DUTY_TO_DEPARTMENT,
    DEPARTMENT_BY_DUTY: DUTY_TO_DEPARTMENT,
    DUTY_DEPARTMENT_MAP: DUTY_TO_DEPARTMENT
  };
  PERMISSION_METHODS.forEach(name => {
    bound[name] = function boundPermission() {
      return API[name].apply(null, Array.prototype.slice.call(arguments).concat([resolved]));
    };
  });
  return Object.freeze(bound);
}

const API = {
  DEPARTMENT_DUTIES,
  DUTIES_BY_DEPARTMENT: DEPARTMENT_DUTIES,
  DEPARTMENTS,
  DUTY_TO_DEPARTMENT,
  DUTY_DEPARTMENTS: DUTY_TO_DEPARTMENT,
  DEPARTMENT_BY_DUTY: DUTY_TO_DEPARTMENT,
  DUTY_DEPARTMENT_MAP: DUTY_TO_DEPARTMENT,
  PRAYER_DUTIES,
  USHER_DUTIES,
  dutiesAllowedTogether,
  blockingDuties,
  okPairKey,
  okPairsOf,
  canBeOkPair,
  DUTY_DEFAULTS,
  dutyDefault,
  DEFAULT_PERMISSION_CONFIG,
  DEFAULT_AUTH_CONFIG: DEFAULT_PERMISSION_CONFIG,
  AUTH_CONFIG: DEFAULT_PERMISSION_CONFIG,
  PERMISSION_CONFIG: DEFAULT_PERMISSION_CONFIG,
  CONFIG: DEFAULT_PERMISSION_CONFIG,
  config: DEFAULT_PERMISSION_CONFIG,
  ROLES: DEFAULT_PERMISSION_CONFIG.roles,
  normalizeDepartment,
  departmentForDuty,
  isGlobalManager,
  isAdmin,
  canManageLeaders,
  departmentsForLeader,
  canManageDepartment,
  canEditDuty,
  canManageDepartmentMember,
  canResolveRequest,
  canAcknowledgeConflict,
  canEditSongs,
  canCreateService,
  canResetPin,
  createPermissions,
  createAuthorization: createPermissions,
  createPermissionChecker: createPermissions
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') {
  window.WorshipDutyPermissions = API;
  window.WDS_PERMISSIONS = API;
  window.Permissions = API;
}
