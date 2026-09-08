'use strict';

/* Persistence gateway. It receives storage, Firebase, and auth dependencies
   from app.js so tests can exercise writes with fictional adapters. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const services = app.services || (app.services = {});
    services.storage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStorageService() {
  function normalizeState(value) {
    if (!value || !Array.isArray(value.members) || !Array.isArray(value.services)) return null;
    const normalized = Object.assign({}, value);
    if (!normalized.settings) normalized.settings = { features: {}, pinHash: '' };
    if (!normalized.departments) normalized.departments = {};
    if (!Array.isArray(normalized.requests)) normalized.requests = [];
    return normalized;
  }

  function createAdapter(options) {
    const config = options || {};
    const storage = config.storage;
    const dataKey = config.dataKey;
    const getState = config.getState || (() => null);
    const getFirebase = config.getFirebase || (() => null);
    const getAuthReady = config.getAuthReady || (() => Promise.resolve());
    const serviceId = config.serviceId || (service => service.date + '_' + service.service);

    function saveLocal(value) {
      if (!storage || typeof storage.setItem !== 'function') return;
      storage.setItem(dataKey, JSON.stringify(value == null ? getState() : value));
    }

    function loadLocal() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      try {
        return normalizeState(JSON.parse(storage.getItem(dataKey)));
      } catch (error) {
        return null;
      }
    }

    function write(task) {
      return Promise.resolve(getAuthReady()).then(task);
    }

    function docRef(firebase, collection, id) {
      return firebase.doc(firebase.db, collection, id);
    }

    function persistService(service) {
      const firebase = getFirebase();
      if (!firebase) {
        saveLocal();
        return Promise.resolve();
      }
      return write(() => firebase.setDoc(docRef(firebase, 'schedule', serviceId(service)), service));
    }

    function persistDeleteService(id) {
      const firebase = getFirebase();
      if (!firebase) {
        saveLocal();
        return Promise.resolve();
      }
      return write(() => firebase.deleteDoc(docRef(firebase, 'schedule', id)));
    }

    function persistMembers() {
      const firebase = getFirebase();
      const state = getState();
      if (!firebase) {
        saveLocal(state);
        return Promise.resolve();
      }
      return write(() => firebase.setDoc(docRef(firebase, 'app', 'members'), { list: state.members }));
    }

    function persistSettings() {
      const firebase = getFirebase();
      const state = getState();
      if (!firebase) {
        saveLocal(state);
        return Promise.resolve();
      }
      return write(() => firebase.setDoc(docRef(firebase, 'app', 'settings'), state.settings));
    }

    function persistDepartments() {
      const firebase = getFirebase();
      const state = getState();
      if (!firebase) {
        saveLocal(state);
        return Promise.resolve();
      }
      return write(() => firebase.setDoc(docRef(firebase, 'app', 'departments'), { map: state.departments }));
    }

    function persistNameMap(map) {
      const firebase = getFirebase();
      if (!firebase) return Promise.resolve();
      return write(() => firebase.setDoc(docRef(firebase, 'app', 'nameMap'), { map }));
    }

    function persistRequest(request) {
      const firebase = getFirebase();
      if (!firebase) {
        saveLocal();
        return Promise.resolve();
      }
      return write(() => firebase.setDoc(docRef(firebase, 'requests', request.id), request));
    }

    function persistAll() {
      const firebase = getFirebase();
      const state = getState();
      if (!firebase) {
        saveLocal(state);
        return Promise.resolve();
      }
      const operations = [];
      const keep = {};
      (state.services || []).forEach(service => {
        const id = serviceId(service);
        keep[id] = true;
        operations.push(batch => batch.set(docRef(firebase, 'schedule', id), service));
      });
      (firebase.knownIds || []).forEach(id => {
        if (!keep[id]) operations.push(batch => batch.delete(docRef(firebase, 'schedule', id)));
      });
      operations.push(batch => batch.set(docRef(firebase, 'app', 'members'), { list: state.members }));
      operations.push(batch => batch.set(docRef(firebase, 'app', 'settings'), state.settings));
      operations.push(batch => batch.set(docRef(firebase, 'app', 'departments'), { map: state.departments }));

      const writes = [];
      for (let index = 0; index < operations.length; index += 450) {
        const chunk = operations.slice(index, index + 450);
        writes.push(write(() => {
          const batch = firebase.writeBatch(firebase.db);
          chunk.forEach(operation => operation(batch));
          return batch.commit();
        }));
      }
      return Promise.all(writes);
    }

    return Object.freeze({
      saveLocal,
      loadLocal,
      write,
      persistService,
      persistDeleteService,
      persistMembers,
      persistSettings,
      persistDepartments,
      persistNameMap,
      persistRequest,
      persistAll
    });
  }

  return { normalizeState, createAdapter };
});
