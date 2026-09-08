# Worship Service: complete refactor and redesign

Approved by Anthony in this task on 2026-09-07. Runner: coordinator. Mode: Parallel.

## Result and constraints

Redesign https://lv-zion-duties.web.app for members, presiders, and coordinators. Home puts My next duty above the date-grouped upcoming schedule. Keep clean white and blue, top navigation, optional tab swiping, header-to-home, existing passcodes and name selection. The presider gets one service workspace with a desktop side panel and phone song-search panel. Manage leads with assignments and pending requests.

Keep lightweight buildless JavaScript and Firebase. Preserve records and IDs, local preference keys, calendar subscription URLs, anonymous-auth write sequencing, notifications and deduplication, full-schedule sync ownership, one-way Sheet upserts, manual duties, and setlist creation transactions. No database migration or rules change. The external song importer depends on song-lib.js and song-seed.js; preserve their paths, exports, and behavior. The separate lv-zion-service preview, preaching, and retired new-song-app are outside scope.

## Design approval

Create three distinct local HTML/CSS directions with fictional information and phone/desktop exports. Anthony explicitly chose local work instead of Stitch on 2026-09-07: "no need to use stitch." Anthony explicitly chooses one direction; then create and verify one complete clickable prototype across member, presider, and coordinator flows and empty/loading/error/success states. Anthony approves that prototype before production UI implementation. Freeze references and manifest in a committed milestone; do not change targets to hide mismatches. Anthony selected original direction B, Open Bulletin. His latest clarification rejects layout compaction and asks only for smaller oversized text. Full prototype approval remains pending.

## Models and roles

Requested controller: gpt-5.6-sol, high. Architecture critic: planner_sol, gpt-5.6-sol, max, read-only. Background supervisor: coordinator_terra, gpt-5.6-terra, high, non-editing. All implementation writers: executor_luna, gpt-5.6-luna, max. Sol native review for integrated sections; independent Opus high for cumulative completion. Explicit implementation fallback at a recorded lane boundary: Gemini 3.8 Flash, then Sonnet 5. Actual model substitutions must be recorded, never silently claimed to match. No fallback to Opus implementation.

## Parallel ownership and execution envelope

Canonical repository: /Users/anthony/Projects/worship-duty-app. Worktree root: /Users/anthony/Projects/worship-refactor-worktrees. Each lane has a separate worktree. No agent may revert another agent's changes. Writers do not operate Git, deploy, or change shared records. Controller integrates explicit owned changes and owns Git, INDEX, Build log, handoff, shared entrypoints, and board publication. Each agent reads this full plan, docs/HANDOFF.md, and docs/runs/worship-refactor-20260907/INDEX.md in its worktree before editing. Its capsule supplies absolute paths and exact ownership.

All lanes use Codex/executor_luna/max, controller review, one writer, no helpers unless explicitly named below. Design exports are authorized by the approved plan and use fictional information. Stitch is not used. Record tree and board contain sanitized engineering progress only. Do not copy production personal data or credentials into fixtures, outputs, reviewer payloads, or new documentation. Verify existing private remote before any push.

### Lane 0: Architecture critique

Setup: planner_sol, max, read-only, review none. Starts with first lanes. Critique invariants, extraction interfaces, caching, test isolation, and ownership; give concrete bounded corrections without changing files.

### Lane F: Foundation

Setup: executor_luna, max, Codex, controller review. Starts immediately. Own app.js, index.html, src/core/**, src/domain/**, src/services/** in the foundation worktree. Preserve rendered output. Extract pure domain functions and Firebase/storage access using injected dependencies. Keep script loading explicit and compatible with deployment stamping. Define and document stable interfaces for later screen lanes. Test extracted behavior without importing seeded names or real credentials. Do not touch release scripts, functions, rules, song-lib.js, or song-seed.js.

### Lane R: Release machinery

Setup: executor_luna, max, Codex, controller review. Starts immediately as a disjoint Foundation sublane. Own scripts/**, firebase.json, sw.js, tests/release/** in the release worktree. Stage allowlisted runtime files in a temporary owner-only directory, stamp every local JS/CSS/HTML reference and service worker release, validate coverage and syntax, deploy only Hosting explicitly to lv-zion-duties. Provide a dry-run mode. Never mutate source to stage a release, upload docs/tests/credentials, or deploy from the worker. Keep prior URL/calendar rewrites and scoped cache compatibility.

### Lane D: Design

Setup: executor_luna, max, Codex, controller review. Starts immediately. Own docs/design/directions/** and docs/runs/worship-refactor-20260907/research/design/** in design worktree. Produce three original local HTML/CSS directions and export phone/desktop screenshots. Record local provenance; no Stitch needed per Anthony's correction. Anthony selected original Open Bulletin with a typography-only size correction. The lane now owns the complete prototype and its design documentation under the revised capsule; no production UI changes before prototype approval.

### Lane V: Verification

Setup: executor_luna, max, Codex, controller review. Starts immediately. Own tests/** except tests/release/**, and verification evidence docs under its assigned research folder. Create deterministic fictional fixtures, intercept all Firebase/config/seed endpoints before navigation, deny external network in test contexts, and prevent browser tests from reading/writing production. Capture baseline phone/desktop behavior and startup timings before changing production source. Test song remount, creation-before-snapshot preservation, save failures, confirmation, manual-duty merge semantics, keyboard and axe. Use existing node_modules read-only. No production code edits; request minimal injection seam if needed.

### Lane M: Member experience

Setup: executor_luna, max, Codex, controller review. Depends on foundation interfaces and approved frozen design. Own src/screens/member/**. Home shows next personal duty above schedule; expand nearest upcoming service, collapse later services, retain filters and calendar/change-request capabilities. Preserve existing feature switches. Test phone/desktop journey against frozen targets.

### Lane P: Presider experience

Setup: executor_luna, max, Codex, controller review. Depends on foundation interfaces and approved frozen design. Own src/screens/presider/** and song-app.js/song-app.css when integration assigns transfer. One service workspace with outline, ordered songs, preparation duration, and searchable library. Preserve confirmation, sung history, transaction safety, remount cleanup, and visible save/retry states.

### Lane C: Coordinator experience

Setup: executor_luna, max, Codex, controller review. Depends on foundation interfaces and approved frozen design. Own src/screens/coordinator/**. Assignments and requests lead; retain people, planning, sync, settings, backup and destructive confirmations. Preserve edits across snapshots and validation failures.

### Lane B: Backend

Setup: executor_luna, max, Codex, controller review. Depends on frozen function contracts from critic. Own functions/** in backend worktree. Extract function internals while preserving names, trigger types, schedules, regions, endpoints, parsing behavior, and deduplication. Use injected adapters and fictional Node tests. No live calls, rules change, deployment, or changes to song importer.

### Lane I: Integration and completion

Setup: executor_luna, max for bounded code corrections; controller integrates, operates Git and releases; native Sol review plus independent Opus high at cumulative completion. Own shared entrypoints/configuration only after earlier owners return them. Integrate independent lanes sequentially. Ship usable compatible foundation after safety checks; ship approved interface increments next. Lane reviews run without stopping independent lanes, corrections land before cumulative completion.

## Validation and delivery

Run focused Node checks, fictional Playwright/axe journeys on phone and desktop, emulator writes, staging dry-run, cross-release PWA update/rollback, calendar and push compatibility, design fidelity, and startup performance compared to measured baseline. No production records in browser captures. A passing syntax check alone is not completion. Required reviews retry accepted corrections with a fresh verdict-neutral payload, stopping for Anthony only after five consecutive unsuccessful results or a genuinely new authority/product decision. Complete after immediate production functional checks and cumulative review, without arbitrary soak time.

Required docs: project AGENTS.md, README quick links, HANDOFF.md, USER-MANUAL.md, this plan and Build log, and record tree with INDEX, lanes, research, decisions, logs, board. Update /Users/anthony/Projects/README.md on actual release/status change. Verify private backup and push only explicit safe changes. Keep deployment and review receipts; report pending gates honestly.

## Frozen design targets

Anthony selected original direction B, Open Bulletin, on 7 September 2026. He rejected the compact layout draft and clarified that he only wanted smaller oversized text. Preserve original B layout and spacing. See docs/DESIGN.md for the authoritative clarification. Complete prototype approval remains pending; production UI lanes M/P/C may not start.

## Build log

- 2026-09-07: Approved plan recorded. Baseline commit 885b0bb0ffb80802a5e6428edcea89ad66c428a7, clean tracked working tree. Integration branch codex/worship-refactor-redesign. No production changes yet. Existing ignored local files stay untouched. Remote target observed as lovelaceaml-hub/worship-duty-app; private visibility check requires network retry.
- 2026-09-07: Private GitHub visibility verified; initial plan commit 5beec15 pushed to the isolated feature branch. Anthony removed the Stitch requirement; direction artifacts will be local original HTML/CSS and screenshots. Foundation, release, verification and design lanes continue in separate worktrees.
- 2026-09-07: Architecture critique approved the frozen compatibility contracts. Backend handlers integrated with exact seven registrations and ten passing Node tests. Native Sol high review returned no actionable findings. Function deployment remains pending integration checks.
- 2026-09-07: First Foundation slice and staged release tool integrated. Review corrections restored the explicit app version declaration, kept legacy sensitive constants at their original location, rejected incomplete release options, preserved external URL versions, and cleaned failed staging directories. Combined native Sol high review passed with no actionable regressions. Eight release tests, sixteen-asset dry run, eleven fictional browser scenarios, and real emulator write checks passed. PWA verification remains pending before the first release.
- 2026-09-07: Three original local design directions and all six phone/desktop references were reviewed and presented. Anthony's direction choice is pending. A second bounded Foundation slice for state and subscription lifecycle was approved by the architecture critic after the combined review passed; it preserves all visible screens and runs independently of the design choice.
- 2026-09-07: Hosting release `20260908013701` deployed through staged scripts/deploy.sh. Immediate smoke verified all sixteen runtime hashes against the artifact, HTTP 200 responses, and a keyboard-focusable live passcode screen with Firebase disabled and empty fictional data. Actual service worker update, rollback, and warmed offline recovery tests passed. The prior source baseline also passes the new release staging flow for rollback. Seven changed backend functions are deploying through an explicit function allowlist.
- 2026-09-07: All seven changed backend functions deployed successfully through an explicit function allowlist. Immediate read-only smoke passed for the calendar rewrite using a fictional member and for public schedule schema/projection. No notification or write handler was invoked for the production check. Existing runtime deprecation is recorded as separate maintenance.

- 2026-09-07: Foundation 2 state and subscription extraction passed native Sol high review in round 3 after startup rollback, dependency guard, and metadata corrections. Root passed the Foundation harness, fifteen combined Node/release tests, and fifteen fictional browser scenarios, including focused and unfocused song preservation, request drafts, nonzero scroll, keyboard controls, passcodes, and explicit deferred-auth timing. Compatible Hosting release is next. Design choice and full prototype approval remain pending.

- 2026-09-07: Compatible Foundation 2 Hosting release `20260908022716` deployed through the staging script from source commit `670ddb7`. Immediate smoke verified all eighteen runtime hashes and the locked phone interface without production record reads or writes. Reviewed source is pushed privately. Verification-suite native review is finishing separately; design selection and full prototype approval remain pending.

- 2026-09-07: A final integrated browser test exposed an intermittent confirmation failure. Root reproduced the pre-existing cause in unchanged song-app.js: metadata is stamped twice, so confirmedAt can be earlier than updatedAt immediately after confirmation. A bounded LCF integration correction with actual-source advancing-clock tests is authorized independently of the visual approval gate. Verification round 2 also requires fixed fixture dates, reduced motion for stable accessibility captures, and sorted source digest inputs.

- 2026-09-07: Anthony selected visual direction B and asked for everything to use less vertical space, feel smaller, and be more compact and refined. The original Open Bulletin direction is now the basis for a complete compact phone/desktop prototype. No production UI approval is implied.

- 2026-09-07: Single-timestamp song confirmation fix passed native Sol high review, 5 actual-source advancing-clock tests, Foundation harness, 14 state/staging tests, and actual service worker update/rollback/offline verification. Hosting release `20260908030600` from runtime commit `8acf332` is live; immediate smoke matched all 18 runtime hashes and verified the locked phone view without production writes. Verification-suite round 3 corrections continue independently.

- 2026-09-07: Architecture critic approved Foundation 3 pure member/coordinator selector extraction, preserving all rendered output and data contracts while the compact prototype proceeds. One isolated Luna writer owns the two new domain modules and app.js/index.html wiring. Screen lifecycle extraction waits for prototype approval.

- 2026-09-07: Anthony rejected the compact layout draft: "no. that looks dumb. I just didnt want huge text". Root acknowledged overcorrection and stopped the density redesign. The immediate preview restores original B layout and changes oversized display text only. Full prototype expansion is paused until this correction is delivered. Nonvisual refactor lanes continue.
