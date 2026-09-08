#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { URL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/lv-zion-duties/databases/(default)/documents/';
const DEFAULT_PORT = 8100;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 1000;
const LIST_COLLECTIONS = Object.freeze(['schedule', 'setlists', 'songStats', 'requests']);
const APP_DOCUMENTS = Object.freeze({
  members: 'app/members',
  departments: 'app/departments',
  settings: 'app/settings'
});
const ASSET_FILES = Object.freeze({
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/styles.css': 'styles.css',
  '/real-preview.js': 'real-preview.js'
});

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function stringValue(value, fallback) {
  if (typeof value === 'string') return value;
  if (value == null) return fallback == null ? '' : fallback;
  return String(value);
}

function nonEmptyString(value) {
  const text = stringValue(value, '').trim();
  return text || '';
}

function stringOrNull(value) {
  if (value == null || value === '') return null;
  return stringValue(value, '');
}

function finiteNumber(value, fallback) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = finiteNumber(value, fallback);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

/** Decode one Firestore REST Value object without retaining Firestore wrappers. */
function decodeFirestoreValue(value) {
  if (!isObject(value)) return value;
  if (hasOwn(value, 'nullValue')) return null;
  if (hasOwn(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (hasOwn(value, 'integerValue')) {
    const raw = value.integerValue;
    const number = Number(raw);
    return Number.isSafeInteger(number) ? number : String(raw);
  }
  if (hasOwn(value, 'doubleValue')) {
    const raw = value.doubleValue;
    if (raw === 'NaN') return null;
    if (raw === 'Infinity' || raw === '+Infinity') return Infinity;
    if (raw === '-Infinity') return -Infinity;
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }
  if (hasOwn(value, 'timestampValue')) return String(value.timestampValue);
  if (hasOwn(value, 'stringValue')) return String(value.stringValue);
  if (hasOwn(value, 'bytesValue')) return String(value.bytesValue);
  if (hasOwn(value, 'referenceValue')) return String(value.referenceValue);
  if (hasOwn(value, 'geoPointValue')) {
    const point = value.geoPointValue || {};
    return {
      latitude: finiteNumber(point.latitude, null),
      longitude: finiteNumber(point.longitude, null)
    };
  }
  if (hasOwn(value, 'arrayValue')) {
    const values = value.arrayValue && Array.isArray(value.arrayValue.values)
      ? value.arrayValue.values
      : [];
    return values.map(decodeFirestoreValue);
  }
  if (hasOwn(value, 'mapValue')) {
    const fields = value.mapValue && isObject(value.mapValue.fields) ? value.mapValue.fields : {};
    return decodeFirestoreFields(fields);
  }
  return undefined;
}

function decodeFirestoreFields(fields) {
  const result = {};
  if (!isObject(fields)) return result;
  Object.entries(fields).forEach(([key, value]) => {
    const decoded = decodeFirestoreValue(value);
    if (decoded !== undefined) result[key] = decoded;
  });
  return result;
}

function documentId(document) {
  if (!document) return '';
  if (typeof document.id === 'string' && document.id) return document.id;
  const name = typeof document.name === 'string' ? document.name : '';
  if (!name) return '';
  const last = name.split('/').pop() || '';
  try { return decodeURIComponent(last); } catch (error) { return last; }
}

function decodeDocument(document) {
  if (!isObject(document)) return {};
  let fields;
  if (isObject(document.fields)) fields = decodeFirestoreFields(document.fields);
  else if (isObject(document.data)) fields = clone(document.data);
  else fields = clone(document);
  const id = documentId(document);
  if (id) fields.id = id;
  return fields;
}

function recordsFromList(value) {
  if (Array.isArray(value)) return value.map(decodeDocument);
  if (value && Array.isArray(value.documents)) return value.documents.map(decodeDocument);
  return [];
}

function decodeSingleDocument(value) {
  if (!value) return {};
  if (isObject(value.document)) return decodeDocument(value.document);
  return decodeDocument(value);
}

function time24(value) {
  const text = stringValue(value, '').trim();
  if (!text) return '';
  let match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) return pad(hours) + ':' + pad(minutes);
    return '';
  }
  match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])m$/i.exec(text);
  if (!match) return '';
  let hours = Number(match[1]);
  const minutes = Number(match[2] || '00');
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return '';
  const afternoon = match[3].toLowerCase() === 'p';
  if (hours === 12) hours = 0;
  if (afternoon) hours += 12;
  return pad(hours) + ':' + pad(minutes);
}

function timestampNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compareTimestamps(left, right) {
  const a = timestampNumber(left);
  const b = timestampNumber(right);
  if (a == null || b == null) return null;
  return a === b ? 0 : a > b ? 1 : -1;
}

function localDateISO(now) {
  const date = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function safeCatalogSongs(songs) {
  if (!Array.isArray(songs)) return [];
  return songs.reduce((result, song) => {
    if (!isObject(song)) return result;
    const id = nonEmptyString(song.id);
    if (!id) return result;
    result.push({
      id,
      number: nonEmptyString(song.number) || id,
      category: nonEmptyString(song.category) || 'Unknown',
      title: nonEmptyString(song.title) || 'Title unavailable',
      durationSec: nonNegativeInteger(song.durationSec, 0)
    });
    return result;
  }, []);
}

function loadSafeCatalog(repoRoot = REPO_ROOT) {
  const seedPath = path.resolve(repoRoot, 'song-seed.js');
  const source = fs.readFileSync(seedPath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: seedPath });
  return safeCatalogSongs(sandbox.window && sandbox.window.SONG_SEED && sandbox.window.SONG_SEED.songs);
}

function loadConstants(repoRoot = REPO_ROOT) {
  const constants = require(path.resolve(repoRoot, 'src/core/constants.js'));
  return {
    CATEGORIES: Array.isArray(constants.CATEGORIES) ? clone(constants.CATEGORIES) : [],
    FEATURES: Array.isArray(constants.FEATURES) ? clone(constants.FEATURES) : []
  };
}

const DEFAULT_CONSTANTS = loadConstants();
const DEFAULT_CATALOG = loadSafeCatalog();

function safeCategories(categories) {
  if (!Array.isArray(categories)) return [];
  return categories.reduce((result, category) => {
    if (!isObject(category)) return result;
    const name = nonEmptyString(category.name);
    const duties = Array.isArray(category.duties)
      ? category.duties.map(nonEmptyString).filter(Boolean)
      : [];
    if (!name) return result;
    const output = { name, duties };
    if (typeof category.color === 'string' && category.color) output.color = category.color;
    result.push(output);
    return result;
  }, []);
}

function safeFeatures(features, definitions) {
  const result = {};
  (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
    if (isObject(definition) && definition.id) result[definition.id] = Boolean(definition.def);
  });
  if (!isObject(features)) return result;
  (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
    if (!isObject(definition) || !definition.id || !hasOwn(features, definition.id)) return;
    result[definition.id] = Boolean(features[definition.id]);
  });
  return result;
}

function safeMembers(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.reduce((result, value) => {
    const name = nonEmptyString(value);
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
    return result;
  }, []);
}

function safeDepartments(map) {
  if (!isObject(map)) return {};
  const result = {};
  Object.entries(map).forEach(([department, names]) => {
    if (!Array.isArray(names)) return;
    result[department] = safeMembers(names);
  });
  return result;
}

function safeAssignments(assignments) {
  if (!isObject(assignments)) return {};
  const result = {};
  Object.entries(assignments).forEach(([duty, member]) => {
    if (typeof member === 'string') result[duty] = member;
  });
  return result;
}

function safeConflictMap(value) {
  if (!isObject(value)) return {};
  const result = {};
  Object.entries(value).forEach(([member, duties]) => {
    if (!Array.isArray(duties)) return;
    const safeDuties = duties.map(nonEmptyString).filter(Boolean);
    if (safeDuties.length) result[member] = safeDuties;
  });
  return result;
}

function safeSongs(value) {
  if (!Array.isArray(value)) return [];
  return value.map(nonEmptyString).filter(Boolean);
}

function safeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.reduce((result, entry) => {
    if (!isObject(entry)) return result;
    const date = nonEmptyString(entry.date);
    const service = nonEmptyString(entry.service);
    if (date || service) result.push({ date, service });
    return result;
  }, []);
}

function maxHistoryDate(history) {
  return history.reduce((latest, entry) => {
    if (!entry.date) return latest;
    return !latest || entry.date > latest ? entry.date : latest;
  }, '');
}

function setlistStatus(record, confirmed, changed) {
  if (String(record.status || '').toLowerCase() === 'sung') return 'sung';
  if (changed) return 'changed';
  if (confirmed) return 'confirmed';
  return 'planned';
}

function normalizeSetlist(record, idOverride) {
  const recordValue = isObject(record) ? record : {};
  const id = nonEmptyString(idOverride || recordValue.id);
  const confirmedAt = hasOwn(recordValue, 'confirmedAt') ? recordValue.confirmedAt : null;
  const updatedAt = hasOwn(recordValue, 'updatedAt') ? recordValue.updatedAt : null;
  const comparison = compareTimestamps(confirmedAt, updatedAt);
  const confirmed = comparison != null && comparison >= 0;
  const changed = comparison != null && comparison < 0;
  const history = safeHistory(recordValue.history);
  const output = {
    id,
    date: nonEmptyString(recordValue.date),
    worshipType: nonEmptyString(recordValue.worshipType || recordValue.worship),
    serviceLabel: nonEmptyString(recordValue.serviceLabel || recordValue.service),
    presider: stringValue(recordValue.presider, ''),
    notes: stringValue(recordValue.notes, ''),
    songs: safeSongs(recordValue.songs),
    glorySong: stringOrNull(recordValue.glorySong),
    thanksSong: stringOrNull(recordValue.thanksSong),
    confirmed,
    status: setlistStatus(recordValue, confirmed, changed),
    updatedAt,
    confirmedAt,
    confirmedBy: stringValue(recordValue.confirmedBy, ''),
    sungAt: hasOwn(recordValue, 'sungAt') ? recordValue.sungAt : null
  };
  if (hasOwn(recordValue, 'time')) output.time = time24(recordValue.time);
  if (typeof recordValue.source === 'string' && recordValue.source) output.source = recordValue.source;
  if (history.length) output.history = history;
  return output;
}

function normalizeSongStat(record, idOverride) {
  const recordValue = isObject(record) ? record : {};
  const id = nonEmptyString(idOverride || recordValue.id || recordValue.songId);
  const history = safeHistory(recordValue.history);
  const rawCount = hasOwn(recordValue, 'timesSung') ? recordValue.timesSung
    : hasOwn(recordValue, 'sungCount') ? recordValue.sungCount
      : history.length;
  const count = nonNegativeInteger(rawCount, history.length);
  const lastSung = stringOrNull(recordValue.lastSung) || stringOrNull(maxHistoryDate(history));
  return {
    songId: id,
    timesSung: count,
    sungCount: count,
    lastSung,
    history
  };
}

function normalizeSchedule(record, idOverride) {
  const recordValue = isObject(record) ? record : {};
  const id = nonEmptyString(idOverride || recordValue.id);
  const output = {
    id,
    date: nonEmptyString(recordValue.date),
    worshipType: nonEmptyString(recordValue.worshipType || recordValue.worship),
    serviceLabel: nonEmptyString(recordValue.serviceLabel || recordValue.service),
    time: time24(hasOwn(recordValue, 'time24') ? recordValue.time24 : recordValue.time),
    notes: stringValue(recordValue.notes, ''),
    assignments: safeAssignments(recordValue.assignments)
  };
  if (hasOwn(recordValue, 'choirSong')) output.choirSong = stringOrNull(recordValue.choirSong);
  if (hasOwn(recordValue, 'conflictOk')) output.conflictOk = safeConflictMap(recordValue.conflictOk);
  if (typeof recordValue.status === 'string' && recordValue.status) output.status = recordValue.status;
  return output;
}

function normalizeRequest(record, idOverride) {
  const recordValue = isObject(record) ? record : {};
  return {
    id: nonEmptyString(idOverride || recordValue.id),
    name: stringValue(recordValue.name, ''),
    serviceId: nonEmptyString(recordValue.serviceId || recordValue.svcId),
    duty: stringValue(recordValue.duty, ''),
    note: stringValue(hasOwn(recordValue, 'note') ? recordValue.note : recordValue.notes, ''),
    status: stringValue(recordValue.status, 'pending'),
    createdAt: hasOwn(recordValue, 'createdAt') ? recordValue.createdAt : null
  };
}

function isPendingRequest(record) {
  if (!isObject(record) || !hasOwn(record, 'status') || record.status == null || record.status === '') return true;
  return nonEmptyString(record.status).toLowerCase() === 'pending';
}

function appendRequestOptionalFields(output, record) {
  if (hasOwn(record, 'resolvedAt')) output.resolvedAt = record.resolvedAt;
  if (hasOwn(record, 'date')) output.date = nonEmptyString(record.date);
  if (hasOwn(record, 'worshipType') || hasOwn(record, 'worship')) {
    output.worshipType = nonEmptyString(record.worshipType || record.worship);
  }
  if (hasOwn(record, 'serviceLabel') || hasOwn(record, 'service')) {
    output.serviceLabel = nonEmptyString(record.serviceLabel || record.service);
  }
  return output;
}

function listById(records, normalizer) {
  const result = {};
  records.forEach((record) => {
    const id = nonEmptyString(record && record.id);
    if (!id) return;
    result[id] = normalizer(record, id);
  });
  return result;
}

function serviceMatchKey(service) {
  if (!service) return '';
  return [service.date, service.worshipType, service.serviceLabel].map((part) => String(part || '').trim().toLowerCase()).join('|');
}

function addStandaloneSetlists(services, setlists) {
  const existingIds = new Set(services.map((service) => service.id));
  Object.values(setlists).forEach((setlist) => {
    if (!setlist || !setlist.id) return;
    if (existingIds.has(setlist.id)) return;
    services.push({
      id: setlist.id,
      date: setlist.date,
      worshipType: setlist.worshipType,
      serviceLabel: setlist.serviceLabel,
      time: hasOwn(setlist, 'time') ? setlist.time : '',
      presider: setlist.presider,
      assignments: {},
      standalone: true
    });
    existingIds.add(setlist.id);
  });
  return services;
}

function appendUnknownDutyCategory(categories, services) {
  const result = safeCategories(categories);
  const known = new Set(result.flatMap((category) => category.duties));
  const unknown = new Set();
  services.forEach((service) => {
    Object.keys(service.assignments || {}).forEach((duty) => {
      if (duty && !known.has(duty)) unknown.add(duty);
    });
  });
  if (unknown.size) result.push({ name: 'Other duties', duties: Array.from(unknown).sort() });
  return result;
}

function addUnknownSongs(catalog, setlists, stats) {
  const result = safeCatalogSongs(catalog);
  const known = new Set(result.map((song) => song.id));
  const ids = new Set();
  Object.values(setlists).forEach((setlist) => {
    safeSongs(setlist && setlist.songs).forEach((id) => ids.add(id));
    if (setlist && setlist.glorySong) ids.add(setlist.glorySong);
    if (setlist && setlist.thanksSong) ids.add(setlist.thanksSong);
  });
  Object.keys(stats || {}).forEach((id) => ids.add(id));
  ids.forEach((id) => {
    if (!known.has(id)) {
      result.push({ id, number: id, category: 'Unknown', title: 'Title unavailable', durationSec: 0 });
      known.add(id);
    }
  });
  return result;
}

/**
 * Pure projection from decoded Firestore records to the prototype contract.
 * The optional constants and catalog arguments make fictional tests independent
 * of the repository's real catalog while production defaults stay local and safe.
 */
function normalizePreviewData(raw, options = {}) {
  const source = isObject(raw) ? raw : {};
  const constants = options.constants || DEFAULT_CONSTANTS;
  const membersDoc = decodeSingleDocument(source.members);
  const departmentsDoc = decodeSingleDocument(source.departments);
  const settingsDoc = decodeSingleDocument(source.settings);
  const scheduleRows = recordsFromList(source.schedule).map((record) => normalizeSchedule(record));
  const setlistRows = recordsFromList(source.setlists).map((record) => normalizeSetlist(record));
  const setlists = listById(setlistRows, (record) => record);
  const services = addStandaloneSetlists(scheduleRows, setlists);
  const statsRows = recordsFromList(source.songStats).map((record) => normalizeSongStat(record));
  const songStats = {};
  statsRows.forEach((record) => {
    const id = nonEmptyString(record && (record.id || record.songId));
    if (id) songStats[id] = normalizeSongStat(record, id);
  });
  const requestRows = recordsFromList(source.requests)
    .filter(isPendingRequest)
    .map((record) => appendRequestOptionalFields(normalizeRequest(record), record));
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const today = options.today || localDateISO(options.now);
  return {
    members: safeMembers(membersDoc.list),
    categories: appendUnknownDutyCategory(constants.CATEGORIES, services),
    services,
    songs: addUnknownSongs(options.songs || DEFAULT_CATALOG, setlists, songStats),
    setlists,
    requests: requestRows,
    departments: safeDepartments(departmentsDoc.map),
    songStats,
    features: safeFeatures(settingsDoc.features, constants.FEATURES),
    nameMap: {},
    passcodes: { editor: '', site: '' },
    today,
    readOnly: true,
    fetchedAt,
    source: 'Current Worship Service records'
  };
}

function assertAllowedCollection(collection) {
  if (!LIST_COLLECTIONS.includes(collection)) throw new Error('Collection is not allowlisted');
}

function assertAllowedDocument(documentPath) {
  if (!Object.values(APP_DOCUMENTS).includes(documentPath)) throw new Error('Document is not allowlisted');
}

function responseIsOk(response) {
  return response && (response.ok === undefined ? Number(response.status || 200) >= 200 && Number(response.status || 200) < 300 : response.ok);
}

function createFirestoreLoader(optionsOrFetch) {
  const options = typeof optionsOrFetch === 'function' ? { fetchImpl: optionsOrFetch } : (optionsOrFetch || {});
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  const baseUrl = options.baseUrl || FIRESTORE_BASE;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const pageSize = Number.isInteger(options.pageSize) && options.pageSize > 0 ? options.pageSize : DEFAULT_PAGE_SIZE;

  async function request(url) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const requestOptions = {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json' }
      };
      if (controller) requestOptions.signal = controller.signal;
      const response = await fetchImpl(url, requestOptions);
      if (!responseIsOk(response)) {
        const error = new Error('Firestore preview request failed');
        error.status = Number(response && response.status) || 0;
        throw error;
      }
      if (!response || typeof response.json !== 'function') throw new Error('Firestore preview response was invalid');
      return response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function urlFor(relativePath, query) {
    const url = new URL(relativePath, baseUrl);
    if (query) Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    return url.toString();
  }

  async function getDocument(documentPath, optionsValue = {}) {
    assertAllowedDocument(documentPath);
    const query = {};
    const masks = Array.isArray(optionsValue.mask) ? optionsValue.mask : [];
    if (masks.length) query['mask.fieldPaths'] = masks[0];
    try {
      return await request(urlFor(documentPath, query));
    } catch (error) {
      if (error && error.status === 404) return null;
      throw error;
    }
  }

  async function listCollection(collection) {
    assertAllowedCollection(collection);
    const documents = [];
    let pageToken = '';
    const seenTokens = new Set();
    while (true) {
      const query = { pageSize };
      if (pageToken) query.pageToken = pageToken;
      const payload = await request(urlFor(collection, query));
      if (payload && Array.isArray(payload.documents)) documents.push(...payload.documents);
      const next = payload && typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
      if (!next || seenTokens.has(next)) break;
      seenTokens.add(next);
      pageToken = next;
    }
    return documents;
  }

  return Object.freeze({ get: getDocument, list: listCollection });
}

async function loadProductionData(options = {}) {
  const loader = options.loader || createFirestoreLoader(options);
  const [schedule, setlists, songStats, requests, members, departments, settings] = await Promise.all([
    loader.list('schedule'),
    loader.list('setlists'),
    loader.list('songStats'),
    loader.list('requests'),
    loader.get(APP_DOCUMENTS.members, { mask: ['list'] }),
    loader.get(APP_DOCUMENTS.departments, { mask: ['map'] }),
    loader.get(APP_DOCUMENTS.settings, { mask: ['features'] })
  ]);
  return normalizePreviewData({ schedule, setlists, songStats, requests, members, departments, settings }, {
    constants: options.constants || DEFAULT_CONSTANTS,
    songs: options.songs || DEFAULT_CATALOG,
    now: options.now,
    today: options.today,
    fetchedAt: options.fetchedAt || new Date().toISOString()
  });
}

function safePrototypeRoot(value) {
  const root = path.resolve(value || path.join(REPO_ROOT, 'docs/design/prototype/open-bulletin'));
  return root;
}

function logicalAssetPath(requestPath) {
  if (Object.prototype.hasOwnProperty.call(ASSET_FILES, requestPath)) return requestPath;
  if (requestPath === '/open-bulletin' || requestPath === '/open-bulletin/') return '/';
  if (requestPath.startsWith('/open-bulletin/')) {
    const suffix = requestPath.slice('/open-bulletin'.length);
    if (Object.prototype.hasOwnProperty.call(ASSET_FILES, suffix)) return suffix;
  }
  return null;
}

function transformHtml(html) {
  let output = String(html);
  output = output.replace(/<script\s+src=(['"])\.?\/?fixtures\.js\1\s*><\/script>/i, '<script src="real-preview.js"></script>');
  return output;
}

function expectedHosts(port) {
  return new Set(['127.0.0.1:' + port, 'localhost:' + port]);
}

function requestIsLocal(req, port) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!expectedHosts(port).has(host)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== 'http://127.0.0.1:' + port && parsed.origin !== 'http://localhost:' + port) return false;
    } catch (error) {
      return false;
    }
  }
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite.split(',').map((part) => part.trim()).includes('cross-site')) return false;
  return true;
}

function commonHeaders(contentType) {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  };
}

function sendResponse(res, status, contentType, body, headOnly) {
  const payload = Buffer.from(String(body == null ? '' : body));
  const headers = commonHeaders(contentType);
  headers['Content-Length'] = String(headOnly ? 0 : payload.length);
  res.writeHead(status, headers);
  if (headOnly) res.end();
  else res.end(payload);
}

function createPreviewServer(options = {}) {
  const configuredPort = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
  const prototypeRoot = safePrototypeRoot(options.prototypeRoot);
  const loadData = typeof options.loadData === 'function'
    ? options.loadData
    : () => loadProductionData(options);

  const server = http.createServer(async (req, res) => {
    const activePort = server.address() && typeof server.address().port === 'number'
      ? server.address().port
      : configuredPort;
    if (!requestIsLocal(req, activePort)) {
      sendResponse(res, 403, 'text/plain; charset=utf-8', 'Forbidden', false);
      return;
    }
    const method = String(req.method || '').toUpperCase();
    let parsed;
    try {
      const rawPath = String(req.url || '/').split('?')[0];
      if (/%2e|%5c/i.test(rawPath) || rawPath.includes('\\')) throw new Error('Unsafe path');
      parsed = new URL(req.url || '/', 'http://' + req.headers.host);
    } catch (error) {
      sendResponse(res, 400, 'text/plain; charset=utf-8', 'Bad request', false);
      return;
    }
    const requestPath = parsed.pathname;
    if (requestPath === '/preview-data.json') {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        sendResponse(res, 405, 'text/plain; charset=utf-8', 'Method not allowed', false);
        return;
      }
      try {
        const payload = await loadData();
        sendResponse(res, 200, 'application/json; charset=utf-8', JSON.stringify(payload), false);
      } catch (error) {
        sendResponse(res, 503, 'application/json; charset=utf-8', JSON.stringify({ error: 'Preview data unavailable.' }), false);
      }
      return;
    }
    const logical = logicalAssetPath(requestPath);
    if (!logical) {
      sendResponse(res, 404, 'text/plain; charset=utf-8', 'Not found', false);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendResponse(res, 405, 'text/plain; charset=utf-8', 'Method not allowed', false);
      return;
    }
    const assetPath = path.resolve(prototypeRoot, ASSET_FILES[logical]);
    const rootWithSeparator = prototypeRoot.endsWith(path.sep) ? prototypeRoot : prototypeRoot + path.sep;
    if (assetPath !== prototypeRoot && !assetPath.startsWith(rootWithSeparator)) {
      sendResponse(res, 404, 'text/plain; charset=utf-8', 'Not found', false);
      return;
    }
    try {
      let body = fs.readFileSync(assetPath);
      if (logical === '/' || logical === '/index.html') body = Buffer.from(transformHtml(body.toString('utf8')));
      const contentType = logical.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : logical.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : 'text/html; charset=utf-8';
      sendResponse(res, 200, contentType, body, method === 'HEAD');
    } catch (error) {
      sendResponse(res, 503, 'text/plain; charset=utf-8', 'Preview asset unavailable', false);
    }
  });

  server.previewConfig = Object.freeze({ port: configuredPort, prototypeRoot });
  return server;
}

function parseArgs(argv) {
  const result = { prototypeRoot: undefined, port: DEFAULT_PORT };
  const args = Array.isArray(argv) ? argv.slice() : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--prototype-root') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) throw new Error('--prototype-root needs a path');
      result.prototypeRoot = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--port') {
      const next = Number(args[index + 1]);
      if (!Number.isInteger(next) || next < 1 || next > 65535) throw new Error('--port must be a valid TCP port');
      result.port = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else {
      throw new Error('Unknown argument');
    }
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const config = parseArgs(argv);
  if (config.help) {
    process.stdout.write('Usage: node scripts/real-preview.cjs [--prototype-root PATH] [--port PORT]\n');
    return null;
  }
  const server = createPreviewServer(config);
  server.listen(config.port, '127.0.0.1', () => {
    process.stdout.write('Local real-data preview listening on http://127.0.0.1:' + config.port + '/\n');
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return server;
}

module.exports = {
  APP_DOCUMENTS,
  CONTENT_SECURITY_POLICY,
  DEFAULT_PORT,
  FIRESTORE_BASE,
  LIST_COLLECTIONS,
  addStandaloneSetlists,
  createFirestoreLoader,
  createPreviewServer,
  decodeFirestoreFields,
  decodeFirestoreValue,
  loadConstants,
  loadProductionData,
  loadSafeCatalog,
  localDateISO,
  normalizePreviewData,
  normalizeRequest,
  normalizeSchedule,
  normalizeSetlist,
  normalizeSongStat,
  parseArgs,
  safeCatalogSongs,
  time24,
  transformHtml
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write('Local preview could not start.\n');
    process.exitCode = 1;
  }
}
