# Foundation 3 architecture decision

Planner Sol max approved a nonvisual extraction of member and coordinator pure selectors into two classic modules. Existing app.js wrappers preserve renderer inputs and app-lifetime ownership. The screen host and mount/update lifecycle are deferred until prototype approval because changing them now poses the highest focus, scroll, and remount risk.

See lanes/LF3.md for exact ownership, calculations, and validation contract. Root integrates shared entrypoints sequentially.
