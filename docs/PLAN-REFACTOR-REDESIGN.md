# Worship Service: complete refactor and redesign

Approved by Anthony in this task on 2026-09-07. Runner: coordinator. Mode: Parallel.

Current status: local candidate completed and independently reviewed; deployment and live-record correction excluded. See [completion receipt](runs/worship-refactor-20260907/logs/20260908-local-completion.md).

## Result and constraints

Redesign https://lv-zion-duties.web.app for members, presiders, and coordinators. Home puts My next duty above the date-grouped upcoming schedule. Use the requested refined layout and distinguishable themes, top navigation, optional tab swiping, header-to-home, existing passcodes and name selection. Presider has visible Services, Select Songs, Order of Worship, Library, and Insights sections, with compact service context and combined song selection plus library. Manage leads with assignments and pending requests.

Keep lightweight buildless JavaScript and Firebase. Preserve records and IDs, local preference keys, calendar subscription URLs, anonymous-auth write sequencing, notifications and deduplication, full-schedule sync ownership, one-way Sheet upserts, manual duties, and setlist creation transactions. No database migration or rules change. The external song importer depends on song-lib.js and song-seed.js; preserve their paths, exports, and behavior. The separate lv-zion-service preview, preaching, and retired new-song-app are outside scope.

## Delivery authority and design

Finish the full local implementation and release preparation without deploying. Anthony's latest request excludes Hosting, Functions, permission changes and live record corrections. No local design approval gate blocks implementation or verification. The earlier deployed redesign was reverted; old production remains live. A later deployment requires explicit authorization.

## Models and roles

Controller: GPT-6 Astra, high. Sol high may lead multiple teams or resolve architecture decisions. Implementation: Luna with effort selected for the task; Gemini 3.8 Flash is an ordinary capable implementation option. No artificial cap on lane count, agent count, writer count or lane size. Existing pinned workers finish their active work; new workers use flexible model/effort settings. Controller reviews ordinary changes; independent review is used for consequential write/data changes and the single cumulative Opus high completion review. No required reviewer for every slice.

## Parallel ownership and execution envelope

Canonical repository: /Users/anthony/Projects/worship-duty-app. Worktree root: /Users/anthony/Projects/worship-refactor-worktrees. Each lane has a separate worktree. No agent may revert another agent's changes. Writers do not operate Git, deploy, or change shared records. Controller integrates explicit owned changes and owns Git, INDEX, Build log, handoff, shared entrypoints, and board publication. Each agent reads this full plan, docs/HANDOFF.md, and docs/runs/worship-refactor-20260907/INDEX.md in its worktree before editing. Its capsule supplies absolute paths and exact ownership.

Choose Luna or Gemini 3.8 Flash and effort per task. Leads can launch useful independent helpers without an artificial limit. Coordinate file ownership and shared integration. Design exports are authorized by the approved plan and use fictional information. Stitch is not used. Record tree and board contain sanitized engineering progress only. Do not copy production personal data or credentials into fixtures, outputs, reviewer payloads, or new documentation. Verify existing private remote before any push.

### Lane 0: Architecture critique

Setup: planner_sol, max, read-only, review none. Starts with first lanes. Critique invariants, extraction interfaces, caching, test isolation, and ownership; give concrete bounded corrections without changing files.

### Lane F: Foundation

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Starts immediately. Own app.js, index.html, src/core/**, src/domain/**, src/services/** in the foundation worktree. Preserve rendered output. Extract pure domain functions and Firebase/storage access using injected dependencies. Keep script loading explicit and compatible with deployment stamping. Define and document stable interfaces for later screen lanes. Test extracted behavior without importing seeded names or real credentials. Do not touch release scripts, functions, rules, song-lib.js, or song-seed.js.

### Lane R: Release machinery

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Starts immediately as a disjoint Foundation sublane. Own scripts/**, firebase.json, sw.js, tests/release/** in the release worktree. Stage allowlisted runtime files in a temporary owner-only directory, stamp every local JS/CSS/HTML reference and service worker release, validate coverage and syntax, deploy only Hosting explicitly to lv-zion-duties. Provide a dry-run mode. Never mutate source to stage a release, upload docs/tests/credentials, or deploy from the worker. Keep prior URL/calendar rewrites and scoped cache compatibility.

### Lane D: Design

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Starts immediately. Own docs/design/directions/** and docs/runs/worship-refactor-20260907/research/design/** in design worktree. Produce three original local HTML/CSS directions and export phone/desktop screenshots. Record local provenance; no Stitch needed per Anthony's correction. Anthony selected original Open Bulletin with a typography-only size correction. The lane now owns the complete prototype and its design documentation under the revised capsule; production UI implementation starts immediately alongside remaining design work.

### Lane V: Verification

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Starts immediately. Own tests/** except tests/release/**, and verification evidence docs under its assigned research folder. Create deterministic fictional fixtures, intercept all Firebase/config/seed endpoints before navigation, deny external network in test contexts, and prevent browser tests from reading/writing production. Capture baseline phone/desktop behavior and startup timings before changing production source. Test song remount, creation-before-snapshot preservation, save failures, confirmation, manual-duty merge semantics, keyboard and axe. Use existing node_modules read-only. No production code edits; request minimal injection seam if needed.

### Lane M: Member experience

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Starts immediately using agreed foundation interfaces and the latest owner requirements. Own src/screens/member/**. Home shows next personal duty above schedule; expand dates and services by default until 30 minutes after their start, retain filters and calendar/change-request capabilities. Preserve existing feature switches. Test phone/desktop journey against frozen targets.

### Lane P: Presider experience

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Starts immediately using agreed foundation interfaces and the latest owner requirements. Own src/screens/presider/** and song-app.js/song-app.css when integration assigns transfer. One service workspace with outline, ordered songs, preparation duration, and searchable library. Preserve confirmation, sung history, transaction safety, remount cleanup, and visible save/retry states.

### Lane C: Coordinator experience

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Starts immediately using agreed foundation interfaces and the latest owner requirements. Own src/screens/coordinator/**. Assignments and requests lead; retain people, planning, sync, settings, backup and destructive confirmations. Preserve edits across snapshots and validation failures.

### Lane B: Backend

Setup: Luna or Gemini 3.8 Flash, task-appropriate effort, proportional controller verification. Depends on frozen function contracts from critic. Own functions/** in backend worktree. Extract function internals while preserving names, trigger types, schedules, regions, endpoints, parsing behavior, and deduplication. Use injected adapters and fictional Node tests. No live calls, rules change, deployment, or changes to song importer.

### Lane I: Integration and completion

Setup: Astra controls integration, Git and releases; implementation effort follows task complexity; use necessary affected checks and one independent Opus high review at cumulative completion. Own shared entrypoints/configuration only after earlier owners return them. Integrate independent lanes sequentially. Ship usable compatible foundation after safety checks; ship working interface increments as they land. Lane reviews run without stopping independent lanes, corrections land before cumulative completion.

## Validation and delivery

Run focused Node checks, fictional Playwright/axe journeys on phone and desktop, emulator writes, staging dry-run, cross-release PWA update/rollback, calendar and push compatibility, design fidelity, and startup performance compared to measured baseline. No production records in browser captures. A passing syntax check alone is not completion. Correct actionable findings and rerun only affected checks. Do not create routine approval or review loops; ask only for an actual unresolved product decision or unavailable external authority. Complete after immediate production functional checks and cumulative review, without arbitrary soak time.

Required docs: project AGENTS.md, README quick links, HANDOFF.md, USER-MANUAL.md, this plan and Build log, and record tree with INDEX, lanes, research, decisions, logs, board. Update /Users/anthony/Projects/README.md on actual release/status change. Verify private backup and push only explicit safe changes. Keep deployment and review receipts; report pending gates honestly.

## Current design targets

Anthony's latest detailed layouts and corrections are authoritative. The actual runtime local preview is the current candidate. Complete and verify local behavior now; keep production unchanged.

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

- 2026-09-07: Original B typography-only correction is committed and privately backed up. Foundation 3 passed native Sol high review after retaining single-source schedule policies. Root passed 18 focused checks, the Foundation harness and 19 fictional scenarios on both viewports. Compatible Hosting release `20260908041730` from runtime commit `9247f75` is live; immediate smoke matched all 20 runtime hashes and the locked phone view. No functions or production UI redesign were deployed. Complete original-B prototype and Verification-suite round 5 review continue independently.

- 2026-09-08: Anthony replied "Just move on" to the fifth-review decision. The bounded four test corrections and subsequent review resume under the existing authorization. No review waiver is inferred. The completed original-B prototype enters controller verification in parallel; production UI approval remains pending.

- 2026-09-08: Full original-B prototype passed initial controller phone/desktop rendering and seven journey groups. Root identified five remaining existing-contract gaps: phone search panel, calendar subscription preview, name unification, reset confirmations and canonical sung-history semantics. A replacement executor_luna/max owns only the prototype and its correction evidence in the original design worktree. A frozen copy is under native Sol/high review in a separate read-only design-review worktree. Original directions and typography-only evidence remain immutable.

- 2026-09-08: Verification round6 closed the four earlier gaps but native review found missing failure enforcement for unexpected requests/browser errors and stale success artifacts after failed reruns. The same writer continues a bounded round7 correction under Anthony's instruction to move on. The prototype correction lane continues independently. No final verification approval is claimed.

- 2026-09-08: Corrected original-B prototype passed nine targeted journeys and the controller's 19 phone/desktop views with zero Axe violations, overflow or browser errors after fixing the phone panel semantics. Native Sol review2 is running. Verification review7 requested immutable emulator source, screenshot invalidation, and explicit blank-member clearing; bounded round8 corrections continue under Anthony's existing authority. No production interface deployment or prototype approval is inferred.

- 2026-09-08: Verification lane passed native Sol high review8. Root independently passed 19 fictional scenarios, 17 Axe views, and actual baseline/canonical emulator transactions with unique overlapping runs. Frozen tests and historical/current evidence are integrated. Prototype candidate507090d is committed; native review2 requested three sung-history/import edge cases, now in correction3. The contract runner also needs its stale Home action selector corrected. Full-prototype approval and production UI work remain pending.

- 2026-09-08: Full Open Bulletin candidate completed all accepted prototype corrections and passed native Sol high review4. Root passed the history/import and empty-state journeys, empty-state Axe, and committed phone/desktop interaction contract. Original B layout and typography anchors are unchanged. The complete candidate has been presented for Anthony's required approval; no answer is inferred. Production member/presider/coordinator lanes and shared screen-host seam remain queued behind that decision. The Verification lane is already reviewed, integrated, and privately backed up.

- 2026-09-08: Anthony identified repeated team rows and requested real information and data. The design lane resumes to correct duplication and add a loopback-only read-only preview of current records. This bounded authorization permits local real-data display; Git, screenshots, boards and reviewer fixtures remain free of real records. Full prototype approval and production UI changes remain pending.

- 2026-09-08: Split the local real-data preview into disjoint browser and server/test sublanes for delivery speed. Existing Design writer owns only prototype browser files; LDP executor_luna/max owns the GET-only server and fictional tests in its own worktree. Root integrates and performs native Sol review.

- 2026-09-08: Local real-data preview is available on loopback port 8100. Actual source comparison matched assignments and song order; phone/desktop smoke and fictional accessibility, empty, failed-load and fidelity edge cases passed. Native review1 produced seven accepted corrections, review2 left one request-status normalization edge case, and review3 is running after its fix. The separate final browser delta passed native Sol review. No production UI approval, deployment or data write occurred.

- 2026-09-08: The local real-data preview correction passed native Sol review3 and the separate final browser delta review. All accepted findings are fixed. Controller passed six server checks, eight fictional Axe views, state and data-fidelity edge cases, and real phone/desktop read-only smoke without record capture. Source commit 2c4c24b was pushed to the verified private repository. The final loopback server uses the canonical source. Full prototype approval and production interface lanes remain pending.

- 2026-09-08: Anthony authorized a broader local redesign: shared month calendars, prominent header name selection, department distinction, grouped personal duties and a simpler Presider workspace. LDU and LVC run in isolated worktrees. Real-data display remains read-only; production UI approval is pending.

- 2026-09-08: Revised calendar/workspace prototype is available in the local real-data preview. Native source review1 returned three accepted display/focus findings; all were corrected. Fully enabled fictional acceptance then exposed two accessibility issues, corrected before root passed the complete suite with zero failures or skips. Final delta/new-test review2 and canonical smoke are in progress. Production UI approval remains pending.

- 2026-09-08: Calendar/workspace local redesign passed final native Sol high review2 with no actionable regressions. Root passed the fully enabled canonical journey suite, eight final fictional Axe captures and actual read-only aggregate phone/desktop smoke. The source and fictional references are frozen; LDU/LVC writers and their coordinator are terminal. Both local previews use the revised source. Full revised-prototype approval and production interface lanes remain pending. Private backup is the final closing operation.

- 2026-09-08: Previous verified calendar candidate committed as 02cd552. Anthony requested revised date disclosures, weekday colors, compact duty rows, a month-list Presider view, a dedicated song editor, department management and selectable themes. Local revision 2 starts with isolated UI and fictional verification writers; manager policy questions are pending. Production UI approval remains pending.

- 2026-09-08: Anthony answered all six policy questions and resumed the interrupted revision with instructions to complete everything. Existing passcodes/names remain; auto assignment is proposed before explicit save; historical title correction is authorized; disclosure completion is 30 minutes after scheduled start; custom choir titles are service-only. Isolated LSU and LST resume from saved work. Root owns actual-name handling and production compatibility.

- 2026-09-08: Sol critic approved LF4 pure setlist status extraction, preserving all rendered output and interfaces. LF4 starts in an isolated worktree alongside LSU/LST and LNR. Root verified the deployed Firestore rules exactly match local bytes and passed eight emulator denial checks for the proposed provider-only correction backup path. No live correction has run.

- 2026-09-08: In response to Anthony's workflow audit question, root verified session metadata: actual controller gpt-6-astra high, differing from the plan's requested gpt-5.6-sol high. This mismatch was explicitly disclosed. Active implementation remains executor_luna max under coordinator_terra high; native review runs were verified as gpt-5.6-sol high. No fallback or Opus run has occurred.

- 2026-09-08: Anthony removed prototype, six-stage and routine approval gates, authorized immediate production implementation, selected Astra controller, optional Sol team leads, task-appropriate Luna effort and Gemini 3.8 Flash implementation. No artificial cap on parallel lanes, agents, writers or lane size. Necessary affected checks replace review-per-slice and repeated broad suites. See decisions/20260908-speed-delivery.md. Earlier approval-gate entries above are historical and superseded.

- 2026-09-08: Five production lanes launched concurrently at b44bec7: Member Luna medium; Presider, Manage and shell Luna high; themes Gemini3.8Flash medium. Sol leads interface coordination under Astra. Foundation4 integrated with seven focused passes. Historical correction passed two real emulator tests, and its single necessary independent review is running. No production-start approval remains.

- 2026-09-08: Anthony explicitly instructed uninterrupted completion and task escalation after three Luna failures to Terra, then after two Terra failures to Sol. Preserve work and record substantive failures per task.

- 2026-09-08: First production redesign ec31551 deployed as Hosting 20260908232700. All 28 staged runtime hashes and the immediate phone passcode smoke passed, with no production record writes. Exact department manager configuration was applied and verified with provider backup. Final repository/lifecycle, secondary panel, journeys, historical correction and cumulative review continue.

- 2026-09-08: Anthony rejected the production layout and clarified that the new design must be shown as a test for approval before release. Root restores old Hosting source 9247f75, preserves data and new source, and continues a flatter local preview. The latest design-preview-required decision supersedes the earlier blanket design approval waiver. No more redesign or provider changes before this preview is approved.

- 2026-09-08: Old design restoration completed from source 9247f75 with Hosting stamp20260908235000. All20runtime hashes and immediate phone passcode smoke passed. Current records were preserved. FL flattened the local UI; after two Terra verification failures, Sol owns the narrow remaining runsheet contrast correction. RP actual-runtime read-only preview passes five fictional tests and aggregate current-record checks across eight phone/desktop views, with no browser external requests or persistent records. Explicit preview approval is required before any further design deployment.

- 2026-09-08: Flat actual-runtime local test is ready at http://127.0.0.1:8101/. Final canonical fictional journeys passed with source digest af4a6d5591bd544efea576985aa3ad9ba4df452bf083e0eef08b710434a08999; native preview review2, five focused preview tests and eight aggregate current-record views passed. Source and sanitized evidence will be backed up to the existing private feature branch. Old production remains unchanged. Next product step is owner review of this local test, not another deployment.

- 2026-09-08: Anthony requested full-width layouts, a name-only header, appearance in settings, centered navigation, explicit Presider/Manage subtabs, a single month schedule with multi-department dropdown, and a compact service-aware song workspace based on the restored live layout. WS3 and HM3 use Luna high; PS3 uses Sol high after earlier escalation. Work remains local pending explicit approval.

- 2026-09-08 full-width local revision: WS3/HM3/PS3 integrated. One outer gutter, member-only header, Settings appearance, centered tabs, Home multiselect and connected month, month-scoped duty tables, Manage sections and compact Presider tabs. No deploy or provider write. Native Sol review interrupted by usage limit, pending. User test approval and full-plan completion remain open.

- 2026-09-08 owner correction: remove choir song details from Home only. Presider and choir management remain unchanged. Local preview only.

- 2026-09-08 completion request: finish everything except deploying. Astra runs integration, parallel Luna high audits identify concrete remaining UI/refactor and backend/release gaps, and the cumulative isolated Opus high review covers the final candidate. All production actions and historical record correction execution stay excluded.

- Local completion audit: UI findings were limited to song snapshot pending/error visibility and expanded Choir outline, now corrected. Backend contracts are unchanged; rollback CLI and sanitized runbook fill the operational gap. The emulator harness now loads the extracted song repository from its immutable source snapshot. Cumulative Opus high review covers the complete local candidate and interrupted narrow UI review scope. No deployment or live-record correction.

- Local completion closed: all accepted cumulative findings corrected, final correction review NO_MATERIAL_FINDINGS, final guarded phone/desktop journeys and focused contracts pass, exact runtime staging verified, documentation complete. Private backup follows. No deployment or live data correction.
