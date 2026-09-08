# Setlist domain extraction

The approved Foundation lane continues with one nonvisual increment while the revised prototype is completed. The planner_sol max critic approved the source-grounded capsule on 8 September 2026.

Models: executor_luna max implements; coordinator_terra high coordinates without edits; root integrates and operates Git and releases; native gpt-5.6-sol high reviews. Production cumulative Opus review remains at full-plan completion.

One writer owns these files in /Users/anthony/Projects/worship-refactor-worktrees/foundation-setlist-state:

- src/domain/setlist.js
- src/domain/member.js
- song-app.js
- index.html
- tests/setlist-domain.test.cjs
- tests/fixture-baseline.mjs
- docs/runs/worship-refactor-20260907/research/foundation/foundation-harness.cjs, ordered module lists only
- docs/runs/worship-refactor-20260907/research/foundation-2/state-subscriptions.test.cjs, ordered module list only
- docs/runs/worship-refactor-20260907/research/foundation-3/actual-source-parity.test.cjs, ordered module list only
- docs/runs/worship-refactor-20260907/lanes/LF4.md and its own timestamped log files

Extract the duplicated pure setlist confirmation and status rules into WorshipApp.domain.setlist with CommonJS support. Expose isConfirmed(setlist), isChanged(setlist), status(setlist), and summary(setlistsById, serviceId). Preserve truthy confirmedAt >= updatedAt and confirmedAt < updatedAt comparisons exactly. Status emits semantic codes sung, empty, confirmed, changed, or picked. Sung wins over timestamps; empty song arrays stay empty. Summary returns the exact existing null or count/confirmed/changed shape, with false flags when count is zero. Preserve malformed/missing input behavior and comparable Firestore timestamp behavior. Do not mutate inputs or normalize timestamps.

Keep member.setlistSummary and member.songStateFor as compatibility delegates. Song-app maps semantic codes to its existing exact labels and CSS. Load the new version-stamped module before member.js and add it to the fixture evaluator's ordered foundation list. Rendered markup, styles and copy are unchanged.

Do not touch app.js, song-lib.js, song-seed.js, Firebase access, subscriptions, storage, notifications, functions, rules, importer interfaces, or records. No worker Git, deployment, network or live-data access.

Acceptance: focused pure-domain cases, exact existing label/class parity, equal/later confirmation timestamps, sung precedence, empty and malformed cases, no mutation; guarded fictional baseline journey, release staging discovers the module, syntax and diff hygiene. Root owns integration, native review and any compatible Hosting release.
