'use strict';

/* Assignment persistence. The host supplies Firebase, auth, and local
   persistence so this module can be exercised without a browser or SDK. */
(function expose(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.window) {
    const app = root.window.WorshipApp || (root.window.WorshipApp = {});
    const services = app.services || (app.services = {});
    services.assignments = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAssignmentsService() {
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

  function snapshotExists(snapshot) {
    if (!snapshot) return false;
    return typeof snapshot.exists === 'function' ? snapshot.exists() : !!snapshot.exists;
  }

  function snapshotData(snapshot) {
    if (!snapshot) return {};
    if (typeof snapshot.data === 'function') return snapshot.data() || {};
    return snapshot.data || {};
  }

  function presiderFor(service) {
    return service && service.assignments && service.assignments.Presider;
  }

  function normalizePresider(value) {
    return value == null ? '' : value;
  }

  function isAllowedPresider(value, previous, desired) {
    return value === previous || value === desired;
  }

  function comparableMillis(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
    if (value && typeof value.toMillis === 'function') {
      try {
        const millis = value.toMillis();
        if (Number.isFinite(millis)) return millis;
      } catch (error) { /* keep the value opaque when conversion is unavailable */ }
    }
    if (value && typeof value.valueOf === 'function') {
      try {
        const primitive = value.valueOf();
        if (typeof primitive === 'number' && Number.isFinite(primitive)) return primitive;
      } catch (error) { /* keep the value opaque when conversion is unavailable */ }
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return NaN;
  }

  /* Firestore timestamps are normally epoch numbers in this app. Keep the
     injected value and its type whenever possible, while still guaranteeing
     changed-after-confirmation when clocks repeat or move backwards. */
  function strictlyAfter(candidate, values) {
    const existing = (values || []).filter(value => value != null);
    if (!existing.length || existing.every(value => {
      try { return candidate > value; } catch (error) { return false; }
    })) return candidate;

    const candidateMs = comparableMillis(candidate);
    const existingMs = existing.map(comparableMillis).filter(Number.isFinite);
    if (Number.isFinite(candidateMs) && existingMs.length === existing.length) {
      const nextMs = Math.max(candidateMs, ...existingMs) + 1;
      if (typeof candidate === 'number') return nextMs;
      if (candidate instanceof Date) return new Date(nextMs);
      if (typeof candidate === 'string') return new Date(nextMs).toISOString();
    }

    /* A test or host may supply a Timestamp-like value. Prefer its native
       constructor when it exposes the conventional fromMillis helper. */
    if (Number.isFinite(candidateMs) && candidate && candidate.constructor &&
        typeof candidate.constructor.fromMillis === 'function') {
      return candidate.constructor.fromMillis(Math.max(candidateMs, ...existingMs) + 1);
    }

    /* The app's default clock is numeric. This last branch is for opaque
       comparable values that cannot be advanced without changing their type. */
    return Date.now() + 1;
  }

  function create(options) {
    const config = options || {};
    const getFirebase = config.getFirebase || (() => null);
    const getAuthReady = config.getAuthReady || (() => Promise.resolve());
    const persistService = config.persistService;
    const serviceId = config.serviceId || (service => service && (service.date + '_' + service.service));
    const afterDataChange = config.afterDataChange;
    const getMe = config.getMe || (() => '');
    const now = config.now || (() => Date.now());

    if (typeof persistService !== 'function') {
      throw new TypeError('assignments.create requires persistService');
    }
    if (typeof serviceId !== 'function') {
      throw new TypeError('assignments.create requires serviceId');
    }

    /* Optional local-only bridge. The host owns the song picker state and may
       supply persistLocalSetlist({ serviceId, presider, previousPresider,
       service }). The schedule still goes through persistService, which keeps
       the established wds-data-v2 fallback intact. */
    const persistLocalSetlist = config.persistLocalSetlist ||
      config.persistLocalSongPlan || config.persistLocalPresiderPlan;

    function assignmentSaveError(code) {
      const message = code === 'missing-schedule'
        ? 'This service is no longer available. Refresh the schedule and try again.'
        : 'This assignment changed before it could be saved. Refresh the schedule and try again.';
      const error = new Error(message);
      error.code = code === 'missing-schedule' ? 'ASSIGNMENT_SERVICE_MISSING' : 'ASSIGNMENT_STALE';
      return error;
    }

    function notifyAfterChange() {
      return typeof afterDataChange === 'function' ? afterDataChange() : undefined;
    }

    function passThrough(service) {
      return Promise.resolve().then(() => persistService(service)).then(result => {
        notifyAfterChange();
        return result;
      });
    }

    function localPresiderChange(service, previousPresider, desiredPresider) {
      const id = serviceId(service);
      const bridge = typeof persistLocalSetlist === 'function'
        ? Promise.resolve().then(() => persistLocalSetlist({
          serviceId: id,
          presider: desiredPresider,
          previousPresider,
          service
        }))
        : Promise.resolve();
      return bridge.then(() => persistService(service)).then(result => {
        notifyAfterChange();
        return { status: 'local', changed: true, result };
      });
    }

    function firebasePresiderChange(service, previousPresider, desiredPresider, firebase) {
      const id = serviceId(service);
      const scheduleRef = firebase.doc(firebase.db, 'schedule', id);
      const setlistRef = firebase.doc(firebase.db, 'setlists', id);

      return Promise.resolve().then(() => getAuthReady()).then(() => firebase.runTransaction(firebase.db, async transaction => {
        /* Both reads happen inside the same transaction. This keeps a plan
           and its schedule assignment from being committed for different
           people when another manager edits the service concurrently. */
        const scheduleSnapshot = await transaction.get(scheduleRef);
        const setlistSnapshot = await transaction.get(setlistRef);
        if (!snapshotExists(scheduleSnapshot)) {
          return { status: 'missing-schedule', changed: false };
        }

        const currentService = snapshotData(scheduleSnapshot);
        const storedPresider = normalizePresider(presiderFor(currentService));
        if (!isAllowedPresider(storedPresider, previousPresider, desiredPresider)) {
          return { status: 'stale', changed: false, storedPresider };
        }

        const hasPlan = snapshotExists(setlistSnapshot);
        const currentPlan = hasPlan ? snapshotData(setlistSnapshot) : null;
        const storedPlanPresider = normalizePresider(currentPlan && currentPlan.presider);
        /* A plan belonging to a third person is also stale. A missing legacy
           presider field remains adoptable when the schedule guard passes. */
        if (hasPlan && storedPlanPresider != null &&
            !isAllowedPresider(storedPlanPresider, previousPresider, desiredPresider)) {
          return { status: 'stale', changed: false, storedPresider, storedPlanPresider };
        }

        const scheduleChanged = storedPresider !== desiredPresider;
        const planChanged = hasPlan && storedPlanPresider !== desiredPresider;
        if (scheduleChanged) {
          if (desiredPresider) {
            transaction.update(scheduleRef, { 'assignments.Presider': desiredPresider });
          } else if (typeof firebase.deleteField === 'function') {
            transaction.update(scheduleRef, { 'assignments.Presider': firebase.deleteField() });
          } else {
            const assignments = Object.assign({}, currentService.assignments || {});
            delete assignments.Presider;
            transaction.update(scheduleRef, { assignments });
          }
        }
        if (planChanged) {
          const planPatch = {
            presider: desiredPresider,
            updatedAt: strictlyAfter(now(), [currentPlan.updatedAt, currentPlan.confirmedAt])
          };
          const me = getMe();
          if (me != null && me !== '') planPatch.updatedBy = me;
          transaction.update(setlistRef, planPatch);
        }
        return {
          status: 'saved',
          changed: scheduleChanged || planChanged,
          scheduleChanged,
          planChanged,
          planExists: hasPlan
        };
      })).then(result => {
        if (result && (result.status === 'stale' || result.status === 'missing-schedule')) {
          if (service && service.assignments) {
            if (result.status === 'stale') {
              if (result.storedPresider) service.assignments.Presider = result.storedPresider;
              else delete service.assignments.Presider;
            } else if (previousPresider) {
              service.assignments.Presider = previousPresider;
            } else {
              delete service.assignments.Presider;
            }
          }
          notifyAfterChange();
          throw assignmentSaveError(result.status);
        }
        notifyAfterChange();
        return result;
      });
    }

    function saveService(service, metadata) {
      const desiredPresider = normalizePresider(presiderFor(service));
      const hasPresiderMetadata = metadata && hasOwn(metadata, 'previousPresider');
      const previousPresider = hasPresiderMetadata
        ? normalizePresider(metadata.previousPresider)
        : undefined;

      /* Coordinator calls with metadata only for an actual Presider change.
         Every other write keeps the established whole-service persistence. */
      if (!hasPresiderMetadata || previousPresider === desiredPresider) {
        return passThrough(service);
      }

      const firebase = getFirebase();
      if (!firebase) return localPresiderChange(service, previousPresider, desiredPresider);
      return firebasePresiderChange(service, previousPresider, desiredPresider, firebase);
    }

    return Object.freeze({ saveService });
  }

  return { create };
});
