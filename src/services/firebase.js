'use strict';

/* Firebase gateway factory. Firebase SDK objects are supplied by the caller,
   so this file remains buildless and browser-free when required by tests. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const services = app.services || (app.services = {});
    services.firebase = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFirebaseService() {
  function createAuthQueue(initialPromise) {
    let ready = Promise.resolve(initialPromise || undefined);
    return Object.freeze({
      set(promise) {
        ready = Promise.resolve(promise).catch(() => undefined);
        return ready;
      },
      get() {
        return ready;
      },
      wait(task) {
        return ready.then(task);
      }
    });
  }

  function createAdapter(options) {
    const config = options || {};
    const firebase = config.firebase || {};
    const authQueue = config.authQueue || createAuthQueue(config.authReady);
    const getAuthReady = config.getAuthReady || (() => authQueue.get());

    function write(task) {
      return Promise.resolve(getAuthReady()).catch(() => undefined).then(task);
    }

    function ref(collection, id) {
      return firebase.doc(firebase.db, collection, id);
    }

    function writeDocument(collection, id, value, optionsValue) {
      return write(() => firebase.setDoc(ref(collection, id), value, optionsValue));
    }

    function deleteDocument(collection, id) {
      return write(() => firebase.deleteDoc(ref(collection, id)));
    }

    function runBatch(build) {
      return write(() => {
        const batch = firebase.writeBatch(firebase.db);
        build(batch, firebase);
        return batch.commit();
      });
    }

    function runTransaction(callback) {
      return write(() => firebase.runTransaction(firebase.db, callback));
    }

    return Object.freeze({
      firebase,
      authQueue,
      write,
      ref,
      writeDocument,
      deleteDocument,
      runBatch,
      runTransaction
    });
  }

  return { createAuthQueue, createAdapter };
});
