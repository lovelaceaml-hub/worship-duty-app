# Screen architecture decision

Planner Sol max read-only critique, task WR-UI-ARCH-2, accepted on 7 September 2026. Foundation 3 can start without visual changes. Production UI waits for the approved, committed compact B prototype.

## Shared seam

Keep app.js as the composition root and app-lifetime owner of authoritative state/subscriptions. After prototype approval, one isolated integration writer owns app.js, index.html, src/core/screen-host.js, src/ui/** and shared shell services. Freeze createScreen(deps) returning mount(root, model, meta), update(model, meta), unmount(meta). Inject frozen semantic dispatch/effect/formatter dependencies. Events contain type and primitive-ID payloads, never raw Firebase or DOM nodes. Reasons: navigation, data, action, resume. Presider navigation has a one-shot token so snapshots cannot reopen another workspace.

Cache one instance per screen. Mount only on activation; same-screen snapshots preserve root identity. Unmount removes local listeners/observers but never stops app or song subscriptions. No pagehide teardown. Preserve draft text, caret, focus identity and owned scroll on input; queue background reconciliation while an editable is focused and reconcile on focusout. Do not retain stale service references because snapshots replace objects. Header-to-home may request scroll top; background refreshes preserve scroll.

## Parallel ownership after seam

- Member: src/screens/member/**, src/services/member-actions.js, src/services/member-effects.js. Own Home/Schedule and My Duties.
- Presider: src/screens/presider/**, src/services/song-data.js, song-app.js, song-app.css. Keep export mount(root, context) as compatible adapter.
- Coordinator: src/screens/coordinator/**, src/services/coordinator-actions.js, src/services/sheet-sync.js.
- Integration alone changes shared entrypoints, tokens, registry, shell styles and final test wiring after current owners return them.

Use scoped data-ui-action events to prevent legacy document delegation from double-firing. Scope each screen stylesheet. Actions resolve IDs against the current store before mutation. Host writes keep auth sequencing; raw song writes keep importer-compatible timing, permission fallback, full-record fallback and transaction semantics. Member reminders, Sheet sync and data subscriptions keep app-session lifetime.

## Required proof

1. Snapshots preserve member requests, coordinator edits, song search/notes, caret, focus, root identity and document/container scroll.
2. Repeated navigation emits one action per input, retains drafts and does not duplicate listeners.
3. Reads paint before auth; host writes wait; song write timing/fallback remains compatible.
4. Full schedule permanently owns data after first success, including an empty snapshot; unmount cannot stop it.
5. Presider reopen, create-before-snapshot, advancing-clock confirmation, subsequent changes, failed saves and mark/undo transactions remain compatible.

Keep song-lib.js/song-seed.js importer surfaces, Firebase rules/functions, data IDs/shapes, preferences, calendar URLs and reviewed release machinery unchanged unless a demonstrated contract failure requires a scoped correction. All new JS/CSS must pass release stamping.

## Review and delivery

Foundation 3 runs now. Shared lifecycle seam follows approved prototype, then the three UI lanes run independently. Integrate coherent screens sequentially and retire only their replaced legacy handlers. Accepted lane findings are corrected in integration; cumulative integration review determines completion, per the approved plan. Native Sol reviews and final Opus high through the required isolated launcher remain required. No direct Claude invocation or production UI approval is implied by this architecture decision.
