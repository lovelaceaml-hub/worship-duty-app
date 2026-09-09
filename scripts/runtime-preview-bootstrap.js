/* Runtime bootstrap for the loopback, read-only preview.
 * It loads the current app source only after a memory-only data snapshot is
 * available. This file intentionally contains no records or credentials.
 */
(function runtimePreviewBootstrap(global) {
  'use strict';

  const windowObject = global && global.window ? global.window : global;
  const documentObject = windowObject && windowObject.document;
  const PREVIEW_MESSAGE = 'Read-only preview: changes are disabled. Your choices stay in memory only.';
  const allowedActions = new Set([
    'home', 'tab', 'sub', 'settings-open', 'settings-close', 'expand', 'toggle-past', 'dept-filter', 'open-songs', 'close-songs',
    'member-calendar-day', 'member-calendar-next', 'member-calendar-prev', 'member-date-toggle',
    'member-department', 'member-department-toggle', 'member-full-team', 'member-open-presider', 'member-service-toggle',
    'manage-panel', 'manage-month-prev', 'manage-month-next', 'req-open-service',
    'close-workspace', 'open-workspace', 'order-workspace', 'view-service', 'exit-runsheet', 'presider-day',
    'presider-month-prev', 'presider-month-next', 'presider-tab', 'set-category', 'close-backfill'
  ]);
  const allowedChanges = new Set([
    'me', 'theme', 'member-department', 'dept-filter', 'manage-department', 'manage-month', 'presider-filter',
    'presider-month', 'presider-day', 'presider-service', 'search', 'sort', 'library-role', 'outline'
  ]);

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function stringValue(value) {
    return value == null ? '' : String(value);
  }

  function serviceIdFor(service) {
    if (!service) return '';
    if (service.id) return stringValue(service.id);
    return stringValue(service.date) + '_' + stringValue(service.service || service.serviceLabel);
  }

  function runtimeService(service) {
    const source = isObject(service) ? service : {};
    const output = {
      id: serviceIdFor(source),
      date: stringValue(source.date),
      service: stringValue(source.service || source.serviceLabel),
      worship: stringValue(source.worship || source.worshipType),
      time: stringValue(source.time || source.time24),
      assignments: isObject(source.assignments) ? clone(source.assignments) : {}
    };
    ['notes', 'choirSong', 'conflictOk', 'status'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) output[key] = clone(source[key]);
    });
    return output;
  }

  function runtimeSetlist(setlist, idHint) {
    const source = isObject(setlist) ? setlist : {};
    const output = {
      id: stringValue(source.id || idHint),
      date: stringValue(source.date),
      service: stringValue(source.service || source.serviceLabel),
      worship: stringValue(source.worship || source.worshipType),
      presider: stringValue(source.presider),
      notes: stringValue(source.notes),
      songs: Array.isArray(source.songs) ? source.songs.map(stringValue).filter(Boolean) : [],
      glorySong: source.glorySong == null ? null : stringValue(source.glorySong),
      thanksSong: source.thanksSong == null ? null : stringValue(source.thanksSong),
      status: stringValue(source.status || 'planned') || 'planned',
      confirmedAt: Object.prototype.hasOwnProperty.call(source, 'confirmedAt') ? source.confirmedAt : null,
      confirmedBy: stringValue(source.confirmedBy),
      updatedAt: Object.prototype.hasOwnProperty.call(source, 'updatedAt') ? source.updatedAt : null,
      sungAt: Object.prototype.hasOwnProperty.call(source, 'sungAt') ? source.sungAt : null
    };
    if (Array.isArray(source.history)) output.history = clone(source.history);
    if (source.time != null) output.time = stringValue(source.time);
    return output;
  }

  function runtimeRequest(request) {
    const source = isObject(request) ? request : {};
    return {
      id: stringValue(source.id),
      name: stringValue(source.name),
      svcId: stringValue(source.svcId || source.serviceId),
      duty: stringValue(source.duty),
      note: stringValue(source.note || source.notes),
      status: stringValue(source.status || 'pending'),
      createdAt: Object.prototype.hasOwnProperty.call(source, 'createdAt') ? source.createdAt : null,
      ...(source.date ? { date: stringValue(source.date) } : {}),
      ...(source.worshipType || source.worship ? { worship: stringValue(source.worship || source.worshipType) } : {}),
      ...(source.serviceLabel || source.service ? { service: stringValue(source.service || source.serviceLabel) } : {})
    };
  }

  function toRuntimeData(payload) {
    const source = isObject(payload) ? payload : {};
    const services = Array.isArray(source.services)
      ? source.services.filter((item) => !(isObject(item) && item.standalone)).map(runtimeService).filter((item) => item.id)
      : [];
    const setlists = {};
    if (isObject(source.setlists)) {
      Object.entries(source.setlists).forEach(([id, value]) => {
        const item = runtimeSetlist(value, id);
        if (item.id) setlists[item.id] = item;
      });
    }
    const features = Object.assign({}, isObject(source.features) ? source.features : {});
    features.siteLock = false;
    features.editorLock = false;
    features.notifications = false;
    features.reminders = false;
    features.sheetSync = false;
    if (!Object.prototype.hasOwnProperty.call(features, 'songPicker')) features.songPicker = true;
    if (!Object.prototype.hasOwnProperty.call(features, 'calendarExport')) features.calendarExport = true;
    const members = Array.isArray(source.members) ? source.members.map(stringValue).filter(Boolean) : [];
    const departments = isObject(source.departments) ? clone(source.departments) : {};
    const requests = Array.isArray(source.requests) ? source.requests.map(runtimeRequest).filter((item) => item.id) : [];
    const songs = Array.isArray(source.songs) ? source.songs.map((song) => {
      const item = isObject(song) ? song : {};
      return {
        id: stringValue(item.id),
        number: stringValue(item.number || item.id),
        category: stringValue(item.category || 'Unknown'),
        title: stringValue(item.title || 'Title unavailable'),
        durationSec: Number.isFinite(Number(item.durationSec)) ? Number(item.durationSec) : 0
      };
    }).filter((song) => song.id) : [];
    const stats = isObject(source.songStats) ? clone(source.songStats) : {};
    return {
      members,
      services,
      departments,
      requests,
      setlists,
      songs,
      stats,
      features,
      nameMap: isObject(source.nameMap) ? clone(source.nameMap) : {},
      today: stringValue(source.today),
      fetchedAt: stringValue(source.fetchedAt),
      readOnly: true,
      source: 'Current Worship Service records'
    };
  }

  function createMemoryStorage() {
    const values = new Map();
    const writes = [];
    return {
      get length() { return values.size; },
      key(index) { return Array.from(values.keys())[index] || null; },
      getItem(key) { const value = values.get(String(key)); return value == null ? null : value; },
      setItem(key, value) {
        const normalizedKey = String(key);
        const normalizedValue = String(value);
        values.set(normalizedKey, normalizedValue);
        writes.push({ key: normalizedKey, value: normalizedValue });
      },
      removeItem(key) { values.delete(String(key)); },
      clear() { values.clear(); },
      _writes: writes,
      _values: values
    };
  }

  function installProperty(target, name, value) {
    if (!target) return false;
    try {
      Object.defineProperty(target, name, { configurable: true, enumerable: true, value });
      return true;
    } catch (error) {
      try { target[name] = value; return target[name] === value; } catch (ignored) { return false; }
    }
  }

  function installMemoryRuntime(runtimeData) {
    const storage = createMemoryStorage();
    const state = {
      members: runtimeData.members,
      services: runtimeData.services,
      settings: { features: runtimeData.features, pinHash: '', sitePinHash: '' },
      departments: runtimeData.departments,
      requests: runtimeData.requests
    };
    const songState = {
      stats: runtimeData.stats,
      setlists: runtimeData.setlists,
      settings: { editorPinHash: '' },
      presiders: runtimeData.members
    };
    storage.setItem('wds-data-v2', JSON.stringify(state));
    storage.setItem('nss-data-v1', JSON.stringify(songState));
    const localStorageInstalled = installProperty(windowObject, 'localStorage', storage);
    const sessionStorageInstalled = installProperty(windowObject, 'sessionStorage', storage);
    if (!localStorageInstalled || !sessionStorageInstalled) throw new Error('Memory-only storage is unavailable.');
    windowObject.FIREBASE_CONFIG = null;
    windowObject.FCM_VAPID_KEY = '';
    windowObject.RECAPTCHA_SITE_KEY = '';
    windowObject.SEED_DATA = clone(state);
    windowObject.SONG_SEED = { songs: clone(runtimeData.songs) };
    windowObject.__WORSHIP_PREVIEW__ = {
      data: runtimeData,
      storage,
      memoryOnly: true,
      readOnly: true,
      externalRequests: [],
      externalWrites: [],
      failure: null
    };
    return storage;
  }

  function installServiceWorkerStub() {
    const stub = {
      register() { return Promise.reject(new Error('Service workers are disabled in preview.')); },
      getRegistration() { return Promise.resolve(null); },
      ready: Promise.resolve(null),
      addEventListener() {},
      removeEventListener() {}
    };
    if (windowObject.navigator) installProperty(windowObject.navigator, 'serviceWorker', stub);
  }

  function installFetchGuard() {
    if (!windowObject.fetch || !windowObject.location) return;
    const nativeFetch = windowObject.fetch.bind(windowObject);
    windowObject.fetch = function guardedFetch(input, init) {
      const candidate = typeof input === 'string' ? input : (input && input.url);
      const url = new URL(candidate || windowObject.location.href, windowObject.location.href);
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (url.origin !== windowObject.location.origin || (method !== 'GET' && method !== 'HEAD')) {
        const preview = windowObject.__WORSHIP_PREVIEW__;
        if (preview) {
          const entry = { origin: url.origin, method };
          if (method === 'GET' || method === 'HEAD') preview.externalRequests.push(entry);
          else preview.externalWrites.push(entry);
        }
        return Promise.reject(new Error('External and non-GET requests are disabled in preview.'));
      }
      return nativeFetch(input, init);
    };
  }

  function closest(target, selector) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest(selector);
  }

  function showReadOnlyMessage() {
    if (!documentObject) return;
    const holder = documentObject.getElementById('banners');
    if (!holder) return;
    holder.innerHTML = '<div class="runtime-preview-message" role="alert">' + PREVIEW_MESSAGE + '</div>';
  }

  function actionAllowed(element) {
    if (!element) return false;
    const token = element.getAttribute('data-act') || element.getAttribute('data-song-act');
    return token ? allowedActions.has(token) : false;
  }

  function changeAllowed(element) {
    if (!element) return false;
    const token = element.getAttribute('data-chg') || element.getAttribute('data-song-chg');
    return token ? allowedChanges.has(token) : false;
  }

  function stopMutation(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showReadOnlyMessage();
  }

  function installReadOnlyGuards() {
    if (!documentObject || typeof documentObject.addEventListener !== 'function') return;
    documentObject.addEventListener('click', (event) => {
      const element = closest(event.target, '[data-act], [data-song-act]');
      if (element && !actionAllowed(element)) stopMutation(event);
    }, true);
    documentObject.addEventListener('submit', stopMutation, true);
    documentObject.addEventListener('change', (event) => {
      const element = closest(event.target, '[data-chg], [data-song-chg]');
      if (element && !changeAllowed(element)) stopMutation(event);
    }, true);
    documentObject.addEventListener('input', (event) => {
      const element = closest(event.target, '[data-chg], [data-song-chg]');
      if (element && !changeAllowed(element)) stopMutation(event);
    }, true);
  }

  function addLabel() {
    if (!documentObject || !documentObject.body || documentObject.getElementById('runtime-preview-label')) return;
    const label = documentObject.createElement('div');
    label.id = 'runtime-preview-label';
    label.className = 'runtime-preview-label';
    label.setAttribute('role', 'status');
    label.textContent = 'Read-only preview. Manager access is simulated for viewing.';
    label.setAttribute('aria-label', 'Read-only preview. Manager access is simulated for viewing and does not reflect production authorization.');
    label.style.cssText = 'color:var(--muted,#4e6782);font:12px/1.4 system-ui,sans-serif;padding:4px 0';
    const footer = documentObject.querySelector('.app-footer');
    if (footer) footer.appendChild(label);
    else documentObject.body.appendChild(label);
  }

  function showFailure(error) {
    const preview = windowObject.__WORSHIP_PREVIEW__;
    if (preview) preview.failure = true;
    if (!documentObject) return;
    const view = documentObject.getElementById('view');
    if (view) view.innerHTML = '<div class="empty runtime-preview-failure" role="alert">Preview data unavailable. No sample data was substituted.</div>';
    const label = documentObject.getElementById('runtime-preview-label');
    if (label) label.textContent = 'Read-only preview unavailable';
    void error;
  }

  async function start() {
    if (!windowObject || !documentObject) return null;
    installServiceWorkerStub();
    installFetchGuard();
    installReadOnlyGuards();
    addLabel();
    const response = await windowObject.fetch('/preview-data.json', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response || !response.ok) throw new Error('Preview data unavailable');
    const payload = await response.json();
    const runtimeData = toRuntimeData(payload);
    installMemoryRuntime(runtimeData);
    windowObject.PREVIEW_RUNTIME_DATA = runtimeData;
    await import('./app.js?v=DEV');
    return runtimeData;
  }

  const api = { PREVIEW_MESSAGE, allowedActions, allowedChanges, createMemoryStorage, runtimeService, runtimeSetlist, runtimeRequest, toRuntimeData, installReadOnlyGuards, installMemoryRuntime, start };
  if (windowObject) windowObject.WorshipRuntimePreview = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (windowObject && documentObject && typeof windowObject.fetch === 'function') start().catch(showFailure);
})(typeof globalThis !== 'undefined' ? globalThis : this);
