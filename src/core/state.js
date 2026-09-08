'use strict';

/* Small state holder used by the browser composition root and Node checks.
   It deliberately keeps the current object and readiness flags separate. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const services = app.services || (app.services = {});
    services.state = api;
    app.state = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStateService() {
  const READY_KEYS = Object.freeze(['members', 'departments']);
  const hasOwn = Object.prototype.hasOwnProperty;

  function createStore(initial) {
    let current = initial;
    const readiness = { members: false, departments: false };

    function get() {
      return current;
    }

    function replace(next) {
      current = next;
      return current;
    }

    function setReady(key, value) {
      if (!hasOwn.call(readiness, key)) return false;
      readiness[key] = !!value;
      return readiness[key];
    }

    function areReady(keys) {
      const requested = keys == null
        ? READY_KEYS
        : (Array.isArray(keys) ? keys : [keys]);
      return requested.every(key => hasOwn.call(readiness, key) && readiness[key]);
    }

    return Object.freeze({ get, replace, setReady, areReady });
  }

  return { READY_KEYS, createStore };
});
