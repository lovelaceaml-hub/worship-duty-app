# Controller prototype audit, 8 September 2026

Original B layout and text-only refinement remain the visual target. Main phone/desktop pages passed controller local browser checks and the supplied seven journey groups. No production UI is approved yet.

Before freezing the complete prototype, close these previously specified capability gaps:

1. Phone song search is currently a stacked aside after the outline. The approved plan requires an opening/closing phone panel with keyboard focus and return; desktop retains the beside-outline library. Do not restyle Home.
2. Calendar currently generates snapshot text only. The approved plan and existing capability audit require subscription and copy-feed-link actions. Use a non-navigating local fictional subscription preview and copyable reserved example URL; no real feed, request or external calendar launch.
3. Sync does not expose existing name-unification workflow. Simulate a fictional impact preview and confirmed name consolidation consistent with current source.
4. Restore sample and reset changes both invoke resetPrototype immediately. Provide distinct impact and confirmation steps before local mutation, with Cancel preserving state.

5. Sung history must match canonical song-lib.js applySung/applyUndo: one record per song and service, idempotent repeat marking, service-date history, undo scoped to that service with recomputed count/last date. Current duplicate markSung/undoSung declarations increment by occurrence, use today, and share one global sungSnapshot. Keep duplicate occurrence editing in the outline, but use canonical history semantics. Remove shadow duplicate declarations.

Native Sol prototype review is running separately in /Users/anthony/Projects/worship-refactor-worktrees/design-review. These are existing contract gaps, not new product scope. A bounded Luna correction must preserve the original layout and immutable direction/type-refinement evidence.
