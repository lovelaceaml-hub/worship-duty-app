'use strict';

/* Firestore listener lifecycle. This module does not know about auth,
   persistence, rendering, the DOM, or writes. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const services = app.services || (app.services = {});
    services.subscriptions = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSubscriptionsService() {
  function snapshotExists(snapshot) {
    if (!snapshot) return false;
    return typeof snapshot.exists === 'function' ? snapshot.exists() : !!snapshot.exists;
  }

  function snapshotData(snapshot) {
    if (!snapshot) return {};
    if (typeof snapshot.data === 'function') return snapshot.data() || {};
    return snapshot.data || {};
  }

  function snapshotDocs(snapshot) {
    return snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
  }

  function snapshotEmpty(snapshot) {
    return !!(snapshot && snapshot.empty) || snapshotDocs(snapshot).length === 0;
  }

  function snapshotFromCache(snapshot) {
    return !!(snapshot && snapshot.metadata && snapshot.metadata.fromCache === true);
  }

  function docData(doc) {
    if (!doc) return undefined;
    return typeof doc.data === 'function' ? doc.data() : doc.data;
  }

  function querySince(firebase, db, collectionName, since) {
    const collection = firebase.collection(db, collectionName);
    const value = typeof since === 'function' ? since() : since;
    if (value == null || typeof firebase.query !== 'function' || typeof firebase.where !== 'function') {
      return collection;
    }
    return firebase.query(collection, firebase.where('date', '>=', value));
  }

  function createManager(options) {
    const config = options || {};
    const firebase = config.firebase || config.rawFirebase || config.fb;
    const db = config.db;
    const emit = config.emit;
    if (!firebase || typeof firebase.onSnapshot !== 'function' || typeof emit !== 'function') {
      throw new TypeError('createManager requires Firebase onSnapshot and an emit callback');
    }

    let active = false;
    let generation = 0;
    let entries = [];
    let recentEntry = null;

    function cancel(entry) {
      if (!entry || !entry.active) return;
      entry.active = false;
      const unsubscribe = entry.unsubscribe;
      entry.unsubscribe = null;
      if (typeof unsubscribe === 'function') {
        try { unsubscribe(); } catch (error) { /* teardown is best effort */ }
      }
    }

    function emitEvent(type, payload) {
      const event = Object.assign({ type }, payload || {});
      if (emit.length > 1) emit(type, payload || {});
      else emit(event);
    }

    const manager = {
      start() {
        if (active) return manager;
        active = true;
        const runGeneration = ++generation;
        entries = [];
        recentEntry = null;
        let previewRetired = false;
        let firstFull = true;

        function live(callback) {
          return (...args) => {
            if (!active || generation !== runGeneration) return;
            callback(...args);
          };
        }

        function listen(query, next, error, includeMetadataChanges) {
          const onSnapshot = firebase.onSnapshot;
          if (includeMetadataChanges) {
            return onSnapshot(query, { includeMetadataChanges: true }, next, error);
          }
          return onSnapshot(query, next, error);
        }

        function attach(query, next, error, includeMetadataChanges) {
          const entry = { active: true, unsubscribe: null };
          entries.push(entry);
          try {
            entry.unsubscribe = listen(
              query,
              live(next),
              live(error || (() => {})),
              includeMetadataChanges
            );
          } catch (registrationError) {
            entry.active = false;
            entries = entries.filter(item => item !== entry);
            throw registrationError;
          }
          if (!entry.active && typeof entry.unsubscribe === 'function') {
            const unsubscribe = entry.unsubscribe;
            entry.unsubscribe = null;
            try { unsubscribe(); } catch (teardownError) { /* best effort */ }
          }
          return entry;
        }

        function retirePreview() {
          previewRetired = true;
          cancel(recentEntry);
          recentEntry = null;
        }

        try {
          const recentSlot = { active: true, unsubscribe: null };
          entries.push(recentSlot);
          recentEntry = recentSlot;
          try {
            recentSlot.unsubscribe = listen(
              querySince(firebase, db, 'schedule', config.recentSince),
              live(snapshot => {
                if (previewRetired || snapshotEmpty(snapshot)) return;
                emitEvent('schedule-preview', {
                  services: snapshotDocs(snapshot).map(docData)
                });
              }),
              live(() => {})
            );
          } catch (registrationError) {
            recentSlot.active = false;
            entries = entries.filter(item => item !== recentSlot);
            recentEntry = null;
            throw registrationError;
          }
          if (!recentSlot.active && typeof recentSlot.unsubscribe === 'function') {
            const unsubscribe = recentSlot.unsubscribe;
            recentSlot.unsubscribe = null;
            try { unsubscribe(); } catch (teardownError) { /* best effort */ }
          }

          attach(
            firebase.collection(db, 'schedule'),
            snapshot => {
              retirePreview();
              const services = snapshotDocs(snapshot).map(docData);
              if (firstFull && snapshotEmpty(snapshot) && !snapshotFromCache(snapshot)) {
                firstFull = false;
                emitEvent('schedule-initial-empty', {});
                return;
              }
              if (firstFull && snapshotEmpty(snapshot)) return;
              firstFull = false;
              emitEvent('schedule-authoritative', {
                services,
                knownIds: snapshotDocs(snapshot).map(doc => doc && doc.id)
              });
            },
            error => emitEvent('schedule-error', { error }),
            true
          );

          attach(
            firebase.doc(db, 'app', 'members'),
            snapshot => {
              const exists = snapshotExists(snapshot);
              emitEvent('members', {
                exists,
                list: exists ? (snapshotData(snapshot).list || []) : undefined
              });
            }
          );

          attach(
            firebase.doc(db, 'app', 'settings'),
            snapshot => {
              const exists = snapshotExists(snapshot);
              emitEvent('settings', {
                exists,
                value: exists ? snapshotData(snapshot) : undefined
              });
            }
          );

          attach(
            firebase.doc(db, 'app', 'departments'),
            snapshot => {
              const exists = snapshotExists(snapshot);
              const data = exists ? snapshotData(snapshot) : null;
              emitEvent('departments', {
                exists,
                map: data ? (data.map || {}) : null
              });
            }
          );

          attach(
            firebase.doc(db, 'app', 'nameMap'),
            snapshot => {
              const exists = snapshotExists(snapshot);
              const data = exists ? snapshotData(snapshot) : null;
              emitEvent('name-map', {
                exists,
                map: data ? (data.map || {}) : null
              });
            }
          );

          attach(
            firebase.collection(db, 'requests'),
            snapshot => emitEvent('requests', {
              items: snapshotDocs(snapshot).map(docData)
            })
          );

          attach(
            querySince(firebase, db, 'setlists', config.setlistsSince),
            snapshot => {
              const byId = {};
              snapshotDocs(snapshot).forEach(doc => { byId[doc.id] = docData(doc); });
              emitEvent('setlists', { byId });
            }
          );
        } catch (startupError) {
          active = false;
          generation++;
          entries.slice().forEach(cancel);
          entries = [];
          recentEntry = null;
          throw startupError;
        }

        return manager;
      },

      stop() {
        if (!active) return manager;
        active = false;
        generation++;
        entries.slice().forEach(cancel);
        entries = [];
        recentEntry = null;
        return manager;
      },

      isStarted() {
        return active;
      }
    };

    return Object.freeze(manager);
  }

  return {
    createManager,
    createSubscriptionManager: createManager,
    createSubscriptions: createManager
  };
});
