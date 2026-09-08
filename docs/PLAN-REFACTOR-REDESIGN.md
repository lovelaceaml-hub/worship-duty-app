# Worship Service: complete refactor and redesign

Approved by Anthony in this task on 2026-09-07. Runner: coordinator. Mode: Parallel.

## Result and constraints

Redesign https://lv-zion-duties.web.app for members, presiders, and coordinators. Home puts My next duty above the date-grouped upcoming schedule. Keep clean white and blue, top navigation, optional tab swiping, header-to-home, existing passcodes and name selection. The presider gets one service workspace with a desktop side panel and phone song-search panel. Manage leads with assignments and pending requests.

Keep lightweight buildless JavaScript and Firebase. Preserve records and IDs, local preference keys, calendar subscription URLs, anonymous-auth write sequencing, notifications and deduplication, full-schedule sync ownership, one-way Sheet upserts, manual duties, and setlist creation transactions. No database migration or rules change. The external song importer depends on song-lib.js and song-seed.js; preserve their paths, exports, and behavior. The separate lv-zion-service preview, preaching, and retired new-song-app are outside scope.

## Design approval

Create three distinct local HTML/CSS directions with fictional information and phone/desktop exports. Anthony explicitly chose local work instead of Stitch on 2026-09-07: "no need to use stitch." Anthony explicitly chooses one direction; then create and verify one complete clickable prototype across member, presider, and coordinator flows and empty/loading/error/success states. Anthony approves that prototype before production UI implementation. Freeze references and manifest in a committed milestone; do not change targets to hide mismatches. No selection exists yet.

## Models and roles

Requested controller: gpt-5.6-sol, high. Architecture critic: planner_sol, gpt-5.6-sol, max, read-only. Background supervisor: coordinator_terra, gpt-5.6-terra, high, non-editing. All implementation writers: executor_luna, gpt-5.6-luna, max. Sol native review for integrated sections; independent Opus high for cumulative completion. Explicit implementation fallback at a recorded lane boundary: Gemini 3.8 Flash, then Sonnet 5. Actual model substitutions must be recorded, never silently claimed to match. No fallback to Opus implementation.

## Parallel ownership and execution envelope

Canonical repository: /Users/anthony/Projects/worship-duty-app. Worktree root: /Users/anthony/Projects/worship-refactor-worktrees. Each lane has a separate worktree. No agent may revert another agent's changes. Writers do not operate Git, deploy, or change shared records. Controller integrates explicit owned changes and owns Git, INDEX, Build log, handoff, shared entrypoints, and board publication. Each agent reads this full plan, docs/HANDOFF.md, and docs/runs/worship-refactor-20260907/INDEX.md in its worktree before editing. Its capsule supplies absolute paths and exact ownership.

All lanes use Codex/executor_luna/max, controller review, one writer, no helpers unless explicitly named below. Design exports are authorized by the approved plan; only fictional names and records may go to Stitch. Record tree and board contain sanitized engineering progress only. Do not copy production personal data or credentials into fixtures, outputs, reviewer payloads, or new documentation. Verify existing private remote before any push.

### Lane 0: Architecture critique

Setup: planner_sol, max, read-only, review none. Starts with first lanes. Critique invariants, extraction interfaces, caching, test isolation, and ownership; give concrete bounded corrections without changing files.

### Lane F: Foundation

Setup: executor_luna, max, Codex, controller review. Starts immediately. Own app.js, index.html, src/core/**, src/domain/**, src/services/** in the foundation worktree. Preserve rendered output. Extract pure domain functions and Firebase/storage access using injected dependencies. Keep script loading explicit and compatible with deployment stamping. Define and document stable interfaces for later screen lanes. Test extracted behavior without importing seeded names or real credentials. Do not touch release scripts, functions, rules, song-lib.js, or song-seed.js.

### Lane R: Release machinery

Setup: executor_luna, max, Codex, controller review. Starts immediately as a disjoint Foundation sublane. Own scripts/**, firebase.json, sw.js, tests/release/** in the release worktree. Stage allowlisted runtime files in a temporary owner-only directory, stamp every local JS/CSS/HTML reference and service worker release, validate coverage and syntax, deploy only Hosting explicitly to lv-zion-duties. Provide a dry-run mode. Never mutate source to stage a release, upload docs/tests/credentials, or deploy from the worker. Keep prior URL/calendar rewrites and scoped cache compatibility.

### Lane D: Design

Setup: executor_luna, max, Codex, controller review. Starts immediately. Own docs/design/directions/** and docs/runs/worship-refactor-20260907/research/design/** in design worktree. Produce three original local HTML/CSS directions and export phone/desktop screenshots. Record local provenance; no Stitch needed per Anthony's correction. Direction choice is pending. No production code or selected prototype until Anthony chooses. Controller maintains DESIGN.md and approval record.

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

Pending Anthony's direction selection and prototype approval. Production UI lanes M/P/C may not start.

## Build log

- 2026-09-07: Approved plan recorded. Baseline commit 885b0bb0ffb80802a5e6428edcea89ad66c428a7, clean tracked working tree. Integration branch codex/worship-refactor-redesign. No production changes yet. Existing ignored local files stay untouched. Remote target observed as lovelaceaml-hub/worship-duty-app; private visibility check requires network retry.
- 2026-09-07: Private GitHub visibility verified; initial plan commit 5beec15 pushed to the isolated feature branch. Anthony removed the Stitch requirement; direction artifacts will be local original HTML/CSS and screenshots. Foundation, release, verification and design lanes continue in separate worktrees.
