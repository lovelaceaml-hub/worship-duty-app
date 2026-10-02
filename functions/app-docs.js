'use strict';

/* The shared documents under app/ that several server modules read: the
   settings (Manage, Features and Data), the name map, the member list and
   the leader settings. */
const permissions = require('./permissions.js');
const { canonicalName } = require('./names.js');

const DEFAULT_CONFIG = permissions.DEFAULT_PERMISSION_CONFIG;

async function readApp(db, id) {
  const snapshot = await db.collection('app').doc(id).get();
  return snapshot.exists ? snapshot.data() || {} : {};
}

/* app/settings: the switches in Manage, Features, the Sheet link and more. */
function loadSettings(db) {
  return readApp(db, 'settings');
}

/* A switch in Manage, Features, saved in app/settings.features, with the
   same defaults as app/config/features.js. */
function switchOn(settings, id, fallback = true) {
  const features = (settings && settings.features) || {};
  return Object.prototype.hasOwnProperty.call(features, id) ? features[id] === true : fallback;
}

/* app/nameMap: old spelling -> current spelling. */
async function loadNameMap(db) {
  const data = await readApp(db, 'nameMap');
  return data.map && typeof data.map === 'object' && !Array.isArray(data.map) ? data.map : {};
}

/* The names on app/members, the church's member list, as stored. */
function memberListOf(data) {
  const list = Array.isArray(data && data.list) ? data.list : Array.isArray(data && data.members) ? data.members : [];
  return list.map(name => String(name == null ? '' : name).trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/* The member list in current spellings. */
async function loadMemberNames(db, nameMap) {
  const map = nameMap || await loadNameMap(db);
  return Array.from(new Set(memberListOf(await readApp(db, 'members')).map(name => canonicalName(name, map)).filter(Boolean)));
}

/* The leader settings as Manage, Leaders saves them in app/leaderConfig. The
   administrators and leader managers always come from the built-in config. */
async function runtimePermissionConfig(db) {
  const snapshot = await db.collection('app').doc('leaderConfig').get();
  return snapshot.exists
    ? Object.assign({}, snapshot.data(), { admin: DEFAULT_CONFIG.admin, globalLeaderManager: DEFAULT_CONFIG.globalLeaderManager })
    : DEFAULT_CONFIG;
}

module.exports = { loadSettings, switchOn, loadNameMap, memberListOf, loadMemberNames, runtimePermissionConfig };
