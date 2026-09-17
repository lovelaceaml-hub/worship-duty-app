/* Shared save controller: Unsaved, Saving, Saved, Failed, Stale. Saved is
   shown only after `run()` resolves (server acknowledgement). A second tap
   while Saving is ignored. A rejection keeps the draft and shows Failed with
   Retry, unless the rejection looks like a stale write (code `aborted` or
   `failed-precondition`, or a payload carrying a newer `revision`), in which
   case it shows Stale and keeps the draft instead of discarding it. */

const controllers = Object.create(null);

function isStale(error) {
  if (!error) return false;
  const code = String(error.code || '').replace(/^functions\//, '');
  if (code === 'aborted' || code === 'failed-precondition') return true;
  return !!(error.payload && error.payload.revision != null);
}

/* The server's own rejection message ("This record changed since you loaded
   it...") plus, when the details payload names who changed it
   (updatedBy for a profile/song save, assignedBy or memberName for an
   assignment slot), a short attribution. */
function staleMessage(error) {
  const base = (error && error.message) || 'That change could not be saved.';
  const details = error && error.details;
  const who = details && (details.updatedBy || details.assignedBy || details.memberName);
  return who ? base + ' (changed by ' + who + ')' : base;
}

export function createSave({ key, run, onChange }) {
  const state = { key, status: 'unsaved', error: '', lastRun: null };
  controllers[key] = state;
  const emit = () => { if (typeof onChange === 'function') onChange(state); };

  return {
    key,
    state: () => Object.assign({}, state),
    trigger(...args) {
      if (state.status === 'saving') return Promise.resolve(state); // dedupe a second tap
      state.status = 'saving';
      state.error = '';
      emit();
      return Promise.resolve()
        .then(() => run(...args))
        .then(result => {
          state.status = 'saved';
          state.error = '';
          emit();
          return result;
        })
        .catch(error => {
          const stale = isStale(error);
          state.status = stale ? 'stale' : 'failed';
          state.error = stale ? staleMessage(error) : ((error && error.message) || 'That change could not be saved.');
          emit();
          throw error;
        });
    },
    reset() {
      state.status = 'unsaved';
      state.error = '';
      emit();
    }
  };
}

export function saveLabel(status) {
  switch (status) {
    case 'saving': return 'Saving...';
    case 'saved': return 'Saved';
    case 'failed': return 'Failed';
    case 'stale': return 'Someone else changed this';
    default: return 'Unsaved changes';
  }
}
