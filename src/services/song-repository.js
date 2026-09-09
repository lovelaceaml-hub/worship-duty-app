'use strict';

/* Buildless persistence boundary for the presider song picker. */
(function expose(root, factory) {
  const api = Object.freeze({ createSongRepository: factory });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const services = app.services || (app.services = {});
    services.songRepository = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSongRepository(options) {
  const config = options || {};
  const gateway = config.gateway || null;
  const firebase = gateway && gateway.firebase ? gateway.firebase : null;
  const storage = config.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const key = config.key || 'nss-data-v1';

  function isRemote() { return !!(gateway && firebase); }

  function loadLocal() {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveLocal(value) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(key, JSON.stringify(value));
  }

  function docRef(collection, id) {
    if (gateway && typeof gateway.ref === 'function') return gateway.ref(collection, id);
    if (!firebase || typeof firebase.doc !== 'function') throw new Error('Firebase document API unavailable');
    return firebase.doc(firebase.db, collection, id);
  }

  function collectionRef(collection) {
    if (!firebase || typeof firebase.collection !== 'function') throw new Error('Firebase collection API unavailable');
    return firebase.collection(firebase.db, collection);
  }

  async function getDocument(collection, id) {
    if (!isRemote()) return null;
    const snap = await firebase.getDoc(docRef(collection, id));
    return snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
  }

  function setDocument(collection, id, value, writeOptions) {
    if (!isRemote()) return Promise.resolve(value);
    if (gateway && typeof gateway.writeDocument === 'function') {
      return gateway.writeDocument(collection, id, value, writeOptions);
    }
    return gateway.write(() => firebase.setDoc(docRef(collection, id), value, writeOptions));
  }

  function updateOrCreate(collection, id, patch, fallback) {
    if (!isRemote()) return Promise.resolve(fallback || patch);
    return gateway.write(async () => {
      try {
        return await firebase.updateDoc(docRef(collection, id), patch);
      } catch (error) {
        const value = typeof fallback === 'function' ? fallback(error) : fallback;
        return firebase.setDoc(docRef(collection, id), value || patch);
      }
    });
  }

  function deleteDocument(collection, id) {
    if (!isRemote()) return Promise.resolve();
    if (gateway && typeof gateway.deleteDocument === 'function') return gateway.deleteDocument(collection, id);
    return gateway.write(() => firebase.deleteDoc(docRef(collection, id)));
  }

  function runTransaction(callback) {
    if (!isRemote()) return Promise.resolve(callback(null));
    if (gateway && typeof gateway.runTransaction === 'function') return gateway.runTransaction(callback);
    return gateway.write(() => firebase.runTransaction(firebase.db, callback));
  }

  function addArrayValue(collection, id, field, value) {
    if (!isRemote()) return Promise.resolve();
    const token = firebase.arrayUnion(value);
    return setDocument(collection, id, { [field]: token }, { merge: true });
  }

  function removeArrayValue(collection, id, field, value) {
    if (!isRemote()) return Promise.resolve();
    const token = firebase.arrayRemove(value);
    return setDocument(collection, id, { [field]: token }, { merge: true });
  }

  function normalizeSetlists(snapshot) {
    const map = {};
    (snapshot.docs || []).forEach(doc => { map[doc.id] = doc.data(); });
    return map;
  }

  function normalizeStats(snapshot) {
    const map = {};
    (snapshot.docs || []).forEach(doc => { map[doc.id] = doc.data(); });
    return map;
  }

  function normalizeSettings(snapshot) {
    return snapshot && typeof snapshot.exists === 'function' && snapshot.exists() ? snapshot.data() : {};
  }

  function normalizePresiders(snapshot) {
    const data = normalizeSettings(snapshot);
    return Array.isArray(data.names) ? data.names.slice().sort() : [];
  }

  function normalizeNameMap(snapshot) {
    const data = normalizeSettings(snapshot);
    return data.map && typeof data.map === 'object' ? Object.assign({}, data.map) : {};
  }

  function normalizeSchedule(snapshot) {
    return (snapshot.docs || []).map(doc => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        date: data.date,
        service: data.service,
        worship: data.worship,
        time: data.time || data.time24 || '',
        time24: data.time24 || data.time || '',
        assignments: data.assignments || {},
        choirSong: data.choirSong || ''
      };
    });
  }

  function normalizedChanges(snapshot) {
    if (!snapshot || typeof snapshot.docChanges !== 'function') return [];
    return snapshot.docChanges().map(change => ({
      type: change.type,
      id: change.doc && change.doc.id,
      data: change.doc && typeof change.doc.data === 'function' ? change.doc.data() : undefined
    }));
  }

  function startSubscriptions(handlers) {
    const target = handlers || {};
    if (!isRemote() || typeof firebase.onSnapshot !== 'function') return function stop() {};
    const unsubs = [];
    let stopped = false;
    function stop() {
      if (stopped) return;
      stopped = true;
      unsubs.splice(0).forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
    }
    function listen(ref, name, normalize) {
      const callback = snapshot => {
        if (!stopped && typeof target[name] === 'function') target[name](normalize(snapshot), normalizedChanges(snapshot));
      };
      const onError = error => {
        if (!stopped && typeof target.error === 'function') target.error(error);
      };
      unsubs.push(firebase.onSnapshot(ref, callback, onError));
    }
    try {
      listen(collectionRef('setlists'), 'setlists', normalizeSetlists);
      listen(collectionRef('songStats'), 'stats', normalizeStats);
      listen(docRef('app', 'songSettings'), 'settings', normalizeSettings);
      listen(docRef('app', 'presiders'), 'presiders', normalizePresiders);
      listen(docRef('app', 'nameMap'), 'nameMap', normalizeNameMap);
      listen(collectionRef('schedule'), 'schedule', normalizeSchedule);
    } catch (error) {
      stop();
      if (typeof target.error === 'function') target.error(error);
    }
    return stop;
  }

  return Object.freeze({
    isRemote,
    loadLocal,
    saveLocal,
    getDocument,
    setDocument,
    updateOrCreate,
    deleteDocument,
    runTransaction,
    addArrayValue,
    removeArrayValue,
    startSubscriptions
  });
});
