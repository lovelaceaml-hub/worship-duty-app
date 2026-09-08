'use strict';

/* Small buildless seam shared by the production shell and optional screen
   modules.  Screen modules register themselves before app.js runs.  Keeping
   this registry on WorshipApp makes a missing staged screen safe: app.js can
   continue with its legacy renderer until the module lands. */
(function expose(root) {
  if (!root || !root.window) return;
  const app = root.window.WorshipApp || (root.window.WorshipApp = {});
  const screens = app.screens || (app.screens = {});
  app.ui = app.ui || {};
  if (!app.ui.screens) {
    app.ui.screens = Object.freeze({
      register(name, module) {
        if (!name || !module || typeof module.create !== 'function') return false;
        screens[name] = module;
        return true;
      },
      get(name) { return screens[name] || null; }
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
