# Worship Duty: Complete Phone Refactor

Status: Approved for implementation on 2026-09-15. Prototypes approved. Sections 2, 3, 4, 5A and 5B built, reviewed, and merged on 2026-09-17. Integrated preview approval, the final Opus review, and release approval are all pending. Production is unchanged.
Mode: Parallel. Runner: one controller, disjoint worktrees, integration last.
Baseline: `86a476f6d80b5a7bbbb09f8c0e0c8a5721fff427`, clean working tree on `change/actionable-request-counts`.
Integration branch: `codex/compact-phone-refactor`, merged forward into `claude/compact-integration` for Section 6.
Live: https://lv-zion-duties.web.app

## 1. Goal and delivery agreement

Make every screen compact, predictable, and easy to navigate on a phone. Preserve Original, Prism, Navy & Cream, and Aurora as four distinct layouts, while sharing functionality so future updates reach every appearance consistently. Deliver all roles together.

Prioritize speed, practical improvements, limited review, and minimal architecture changes. Preserve JavaScript/Firebase. Anthony approves this plan, clickable phone prototypes, and the integrated preview. Routine authorized work continues between checkpoints.

Request approval for additional features, provider substitutions, or material departures. Unanswered requests leave that addition pending while authorized work continues. Production migration or deletion requires a concrete dry run and explicit approval.

## 2. Product decisions

### Shared phone experience

- Always-visible floating bottom navigation with labeled main destinations appropriate to the account.
- Compact secondary tabs below workspace headings. Distinct appearance layouts use the same destinations, controls, information, and actions.
- Short headers, concise rows, readable text, comfortable tap targets, and dedicated detail/editing screens.
- Explicit Save changes, visible feedback, and protection against leaving unsaved edits.
- Search and pagination for long lists, ten results per page by default, all records accessible.
- Restore filters, page, selected record, and scroll position when returning; browser/phone Back follows app navigation.
- Keep navigation and Save controls clear of content, safe areas, and keyboard. Preserve Appearance access.
- Approved floating bottom navigation supersedes the older top-navigation requirement.

### Clean startup

Read saved appearance before the first visible screen. Load its styling immediately and retain it through site lock, sign-in, loading, and authenticated screens. Remove the delayed Original-to-selected switch. Show a matching loading state while required assets load. On failure provide recovery controls and explicit Original fallback without overwriting the saved preference. Preserve preference migration and the Original recovery URL.

### Role starting screens

| Role | Start | Workspace |
| --- | --- | --- |
| Member | My next duty | Upcoming duties, full schedule; availability/reminders separately |
| Department leader | Upcoming services | Schedule, Needs attention, Members |
| Administrator | Needs attention | All-department scheduling, members, exceptions, authorized settings |
| Presider | My next service in song planning | My service, Songs, History |

People holding multiple roles retain access to their applicable workspaces.

### Needs attention, availability, and replacements

- Combine requests, unfilled duties, and conflicts with clear categories. Counts and items use the same shared rules. Preserve completed requests in searchable history.
- Resolve a request and save assignment changes atomically. Failed or stale saves leave the request unresolved.
- Member availability defaults to all their departments, with selected-department exceptions. Leaders stay restricted to their departments.
- Becoming unavailable retains existing assignments as Needs replacement until resolved; never silently remove assignments.
- Search eligible, available replacement members. Prioritize those without another duty in the service, then alphabetically. Show existing duties and explain exclusions within the authorized roster.
- Another duty produces an advisory warning before saving, not administrator approval. Eligibility and availability remain enforced.
- No replacement means the duty stays open in Needs attention without creating an administrator help request.

### Membership and invitations

- Replace UID entry with registered-member search by name. Leaders add existing members directly to their department.
- Invite through Share or Copy link. Single-use, revocable, seven-day links can be accepted by any signed-in member. Forwarded-link acceptance is an accepted tradeoff.
- Record acceptance and prevent duplicate use. Missing or ambiguous accounts enter administrator exceptions.
- Invitations do not bypass sign-in, create accounts, or grant leadership. Remove internal IDs/database explanations from ordinary screens.
- Other account administration remains functionally unchanged except compact presentation and required corrections in these workflows.

### Presider songs and history

- My service, Songs, History navigation; next assigned service first, all upcoming services accessible.
- Preserve service and draft when browsing. Show recent sung and upcoming planned use; repeat warnings advisory.
- Save draft and Confirm songs are separate. Editing confirmed songs requires confirmation again.
- Automatically record confirmed lists after the existing three-hour service window. Label automatic history and allow authorized corrections; unconfirmed lists are not recorded automatically.
- Preserve every existing service/song history record; searchable, paginated. Statistics belong with history; administrative tools in authorized settings.
- Reuse history model and distinguish automatic planned-song recording from manually corrected records.

### Reliability

- Shared Unsaved, Saving, Saved, Failed states. Saved requires server acknowledgement. Retain failed edits and offer Retry. Deduplicate Save taps.
- Version-aware assignment, profile, and song saves reject stale edits, retaining the local draft and explaining the concurrent change.
- Notification taps open the relevant duty/request after sign-in. Unavailable or unauthorized destinations show a message and appropriate workspace link.

## 3. Shared implementation structure

Shared data/permissions -> shared screen information and actions -> four explicit layout renderers -> shared controls.

- Each task has one information builder supplying records, counts, permitted actions, loading/error states.
- Reusable assignment rows, member pickers, pagination, warnings, navigation, and Save feedback.
- Layouts arrange the same components without separate business rules, save handlers, or count calculations.
- Shared routes, selections, filters, pages, drafts, and pending saves survive appearance changes.
- Stable named required sections; a feature gets explicit placement in every layout.
- Replace prototype extraction, HTML rearrangement, and source-text rewriting with production modules. Build packages modules/styles, retaining guarded publication and stamps.
- Ordinary JavaScript modules and compatibility wrappers only; no framework migration, generic plugin system, search service, or unrelated infrastructure.

### Server interfaces

Implement authorized member lookup; invite create/revoke/atomic accept; authorized multi-department availability; atomic request/assignment resolution; version-aware saves; idempotent automatic history and correction.

Server-controlled revisions return with accepted records; older records work without destructive reseeding. Automatic history checks current service/list confirmation, skips canceled/missing services, avoids duplicate recording, and corrects usage counts consistently.

Preserve identity/service IDs, department permissions, site lock, calendars, notifications, one-way Sheet imports, and Signal-facing song-library behavior.

### Documentation and indexing

One feature map identifies shared source, actions/components, four-layout placements, owner, and documentation. Documentation worker owns human guidance and supporting MD/YAML/JSON when useful. Indexing worker owns code/document navigation, not in-app search. Remove contradictions and mark superseded plans historical. Do not create redundant documents.

## 4. Execution, ownership, and review

| Responsibility | Model | Effort |
| --- | --- | --- |
| Controller/integration/final corrections | Sol | High; Max for difficult architecture |
| Design/prototypes | Astra | High |
| Implementation | Luna | High |
| Escalated implementation | Luna | Max |
| Peer reviews including escalations | Gemini 3.8 Flash | Low |
| Documentation | Separate Luna | High |
| Code/document indexing | Separate Luna | High |
| Final integrated review | Opus | High, one round |

Explicit model/effort on each launch; record ID, settings, ownership and result. Never describe a Max-pinned executor as High. Verify Gemini route; no silent substitution.

One Gemini review per completed unit. Luna High gets one correction attempt; an unsuccessful correction escalates implementation to Luna Max. Gemini rechecks affected findings. Other independent work continues. Opus reviews the assembled result once; Sol corrects and verifies directly, without a second Opus round or return to Luna. No extra reviewer or hygiene-agent layers. Bounded Gemini plan critique accompanies first implementation unit.

### Section 0: Plan and baseline

Owner: controller. Record approved decisions, clean baseline, interfaces, ownership, Build log. Production code unchanged.

### Section 1: Complete phone prototypes

Setup: Astra High; separate design worktree; Review: Gemini 3.8 Flash Low. Own `docs/design/prototype/compact-phone/` and design artifacts only. Compare two compact directions, get selection, expand selected direction into four distinct layouts and complete journeys, obtain prototype approval before runtime UI changes. No production data or external writes.

### Section 2: Shared runtime foundation

Setup: Luna High; separate runtime worktree; Review: Gemini 3.8 Flash Low. Depends on prototype approval and settled interfaces. One owner for root browser files, shared browser modules, appearance modules, service worker, and gallery build. Shared navigation/state/components, layout interfaces, clean startup.

### Section 3: Server workflows

Setup: Luna High; separate server worktree; Review: Gemini 3.8 Flash Low. Own server modules and Firestore rules only after interface settlement. May overlap runtime after dependencies exist. No production writes or migrations until approved.

### Section 4: Role screens

Setup: same runtime Luna High owner; Review: Gemini 3.8 Flash Low per bounded unit. Sequential member/leader/admin/presider increments in shared runtime files; no competing writers.

### Section 5A: Documentation

Setup: separate Luna High worker; own human-readable guides in separate worktree. Use verified facts. Exclude plan, Build log, run records, index files and Astra artifacts, which have other owners.

### Section 5B: Indexing

Setup: separate Luna High worker; own feature map and code/document index artifacts in separate worktree. No in-app search infrastructure, runtime changes, or edits to 5A-owned guides. Controller owns README, HANDOFF, AGENTS, plan and shared indexes.

### Section 6: Integration and release

Setup: controller Sol; Review: Opus High once. Merge dependency order, present complete preview, obtain final review, correct directly, verify, deploy named targets, update records/private backup. No fresh unrequested review layers.

Concurrent writers have separate worktrees, disjoint ownership, stable dependency snapshots. Shared interfaces have one sequential owner. Implementation-mode choice is the user's explicit pasted implementation request for this parallel plan.

## 5. Verification, release, completion

No new test cases or automated suites, broad security audit, arbitrary monitoring interval, or repeated full regressions. User-authorized build/syntax checks and brief privacy-safe browser walkthroughs only:

- All layouts expose required functionality/counts and clean startup through sign-in.
- Narrow-phone navigation, tabs, keyboard, Save, Back, pagination and drafts work together.
- Failed/stale saves preserve edits; shared behavior checked once where possible with brief layout checks in all appearances.
- Department scope/invitation role boundaries and atomic request assignment remain intact.
- Song drafts/confirmation/automatic history/corrections and original history remain intact.
- Notification destinations and morning/evening selector boundary remain correct.

Never confuse local/mocked checks with authenticated production evidence. Release all roles together after integrated preview and required review using guarded gallery publisher/named Firebase targets. Preserve schedules/history/site lock/rollback. Production migrations or deletions require dry run and explicit approval. Verify live marker/journeys and complete documentation/indexing/handoff/private backup. Report unverified behavior and deferrals, never declare complete with required work pending.

## Build log

- 2026-09-15: Anthony explicitly requested implementation of this complete plan, including parallel roles and prototype/preview checkpoints. Initial working tree clean at the baseline above. Created integration branch. No runtime changes, production writes, migrations, tests, or releases performed. Data classification: reviewed source/design documentation backup-safe; member records, credentials and production exports excluded from agents, artifacts and Git. Current local files supersede older memory-derived candidate status.

- 2026-09-15: Saved plan checkpoint `c44d021`; launched Astra High design, separate Luna High documentation and indexing in disjoint worktrees. Exact launch records: `docs/runs/compact-phone-refactor/agents.json`. Gemini catalog confirms `gemini-3.8-flash-low`; review execution being verified. Existing origin verified PRIVATE.

- Gemini Low plan critique completed with five observations. Controller dispositions: docs/runs/compact-phone-refactor/reviews/plan-critique.md. No additional features, review layers, or tests added.
- Two fictional leader prototypes pass brief local walkthroughs: floating main navigation, secondary tabs, browser-local save, return to page 2, and no horizontal overflow at 320 pixels. Direction selection and complete four-layout prototype approval remain pending.

- One Gemini Low peer review per completed unit, batched into conversation 4ed3048e-1b4f-47f1-85c4-1a04e18a8409. Final determinations: no material findings in bounded design directions, documentation, indexing, or standalone membership module. Prototype selection remains pending; full role prototype and runtime work have not started. No deploy.

- Anthony selected Weekbook. Replace numeric page controls for its schedule with month navigation below search and above cards; show the selected month grouped into weeks. This is an approved schedule exception to ten-result pagination. Preserve search/month/scroll on return. Other long lists retain the approved pagination unless changed.
- Anthony requires real app data and phrases in previews. The next Weekbook iteration references the existing historical seed source, uses actual Worship duties, and labels its data age. No live records are copied or modified. Complete four-appearance prototype approval is still pending.

- Correction: historical seed selection did not satisfy Anthony's request for real current app data. Read-only Firestore verification found 180 services through December 2026, including September 42 and October 21. Replaced preview source with a minimized current service snapshot outside Git. Assigned names require the pending narrowed preview-data permission; absent assignments must never be displayed as vacancies.
- Anthony approved Weekbook and directed the current task to finish the four designs, then create a handoff. Stop after the design handoff; do not resume runtime implementation, production integration, or release without continuation. Existing standalone membership module remains unwired.

- Four clickable Weekbook appearances and role-screen designs completed with current service metadata (180 services, May-December) and 537 public songs. Browser checks and Gemini Low bounded review passed; see final-design.md. Member-specific records remain unloaded with narrowed permission pending. Source snapshots remain outside Git.
- Design handoff ready at docs/COMPACT-DESIGN-HANDOFF.md. Anthony's requested stop applies now: no further runtime implementation or release in this task. Full refactor remains incomplete.

- 2026-09-16: Design checkpoint committed and pushed as `72b3af6`. Anthony authorized continuation of runtime implementation (Sections 2 to 6) and directed Claude-equivalent models, because the Codex primary pool shows 100% used. Lane switch recorded before work resumes: implementation Luna High becomes Sonnet 5 High; escalated implementation Luna Max becomes Sonnet 5 Max; per-unit peer review Gemini 3.8 Flash Low becomes Haiku 4.5 Low (fresh, read-only, never the writer); documentation and indexing workers become separate Sonnet 5 High; controller, integration and final corrections Sol becomes Opus 5 High; the single final integrated review stays Opus High, run as a fresh read-only instance. All other plan rules are unchanged: one review per unit, one correction attempt, no extra review layers, no production writes or release before the Section 6 approval.
- 2026-09-16: Anthony approved the narrowed September and October assignment retention for preview use. Snapshots containing member names or assignments stay outside Git and out of every review packet.
- 2026-09-16: Anthony named Fable 5.1 advisor and architect for Sections 2 to 6. Fable is consulted, read-only, at three points: settling shared layout and server interfaces before Sections 2 and 3 write against them, any architecture question the controller cannot settle, and conflicts between a writer and a reviewer. Fable gives a short written ruling that the controller saves under `docs/runs/compact-phone-refactor/decisions/`. Fable never writes runtime code, guides, or indexes, never runs fan-out, and is not a review layer. Controller stays Opus 5 High; writers stay Sonnet 5 High. Routine work does not wait on Fable.
- 2026-09-17: Section 2 (shared runtime foundation) complete on branch `claude/compact-runtime`, commits `a1246a6` and `db8f610`, from 515d38e. Fable recorded the layout interface ruling at `docs/runs/compact-phone-refactor/decisions/S2-LAYOUT-INTERFACE.md` and wrote no code; Sonnet 5 High implemented; Haiku 4.5 Low reviewed once with two findings (unknown routes, notification route validation), both corrected on the first attempt and rechecked. Localhost walkthrough of all four layouts at 320 pixels: no overflow, no page errors, Firebase disabled, no production writes. Not merged into the integration branch, not deployed. Open for Anthony: Prism and Aurora dark and motion toggles. Record: `docs/runs/compact-phone-refactor/lanes/S2.md`.
- 2026-09-17: Section 3 (server workflows) complete on branch `claude/compact-server`, commit `1083e4b`, from `codex/compact-phone-refactor@1e0b6fd`. Fable recorded the remaining server-interface ruling (availability, atomic Needs-attention resolution, version-aware saves, automatic/corrected song history) at `docs/runs/compact-phone-refactor/decisions/S3-SERVER-INTERFACE.md` and wrote no code; the membership interface from the earlier ruling was unchanged. Sonnet 5 High implemented: `functions/revision.js`, `functions/song-history.js`, `functions/compact-workflows.js` (new), extended `department-auth.js`/`department-handlers.js`/`index.js` with the revision contract and Needs-replacement self-healing, and added `revision` to two `firestore.rules` key allowlists. Haiku 4.5 Low reviewed once, read-only, specifically hunting for same-document double-writes within one transaction (a class of bug found and fixed twice during development); no material findings, one harmless style note left uncorrected. Existing 56-test suite still passes; smoke-tested every handler against a hand-written in-memory Firestore/transaction fake (no Java on this Mac for the real emulator). No deploys, no production writes, no migrations, no client wiring (that is Section 4). Record: `docs/runs/compact-phone-refactor/lanes/S3.md`.

- 2026-09-17: Section 4 (role screens) complete on branch `claude/compact-runtime`, commits `681f2d6` (Member), `16645af` (Department leader, Administrator, Presider) and `3ac7a53` (per-service song-confirm save state correction), plus the documentation-only `b047450` that brought the S2 and S3 rulings into that worktree. Sonnet 5 High implemented; Haiku 4.5 Low reviewed twice, fresh and read-only, with no material findings (the one real gap, a single global song save controller showing stale state across services, was found by the writer and corrected in `3ac7a53` on the single correction attempt). Every role screen is implemented once in the shared `layouts/_common.js` factory, so all four appearances get it with no forked markup, and `verifyLayouts()` now enforces eleven required screens. Verified by `node --check`, `node design-gallery/build.mjs`, and a localhost `?wdPreview=1` walkthrough of all four appearances with no console errors and no horizontal overflow at 375 pixels. Disclosed scope reductions, not silent drops: the songs library (`#songs/library`) and the Features, Leader-config and Data and Sync panels of `#manage/settings` remain on the legacy `song-app.js`/Manage bridge; `#manage/exceptions` is an honest placeholder because the membership ruling defines no persisted exception record and none was invented; no write yet sends `expectedRevision`, so stale-save detection is present in `shared/save-state.js` but unexercised. Increments 2 to 4 landed in one commit rather than three, disclosed with reasons in the lane record. No `functions/`, `firestore.rules`, deploy, or production-write boundary crossed. Record: `docs/runs/compact-phone-refactor/lanes/S4.md`.

- 2026-09-17: Section 5A (documentation) complete on branch `codex/compact-docs`, commits `f1d5918` and `cba2b9d`, from `c44d021`. Sonnet 5 wrote, Haiku 4.5 reviewed once, fresh and read-only, checking specifically for unreleased refactor UI described as already live, broken internal links, and em or en dashes in added lines: no material issues, no correction. Brought `docs/PLAYBOOK.md` and `docs/USER-MANUAL.md` current against what has verifiably shipped, marked `docs/USER-GUIDE.md` historical, and rewrote `docs/COMPACT-DESIGN-HANDOFF.md` as a historical record. Left open for the controller: USER-GUIDE is now redundant with USER-MANUAL, and retiring or folding it touches the controller-owned README quick links. Record: `docs/runs/compact-phone-refactor/lanes/S5A.md`.

- 2026-09-17: Section 5B (indexing) complete on branch `codex/compact-index`, commits `3bf5d2a` and `989d674`, from `c44d021`. Sonnet 5 wrote, Haiku 4.5 reviewed once, fresh and read-only, independently confirming JSON validity, all nineteen Section 2 paths and all eight Section 3 paths present in the real lane worktrees, two spot-checked factual claims, and that Section 4 is never claimed as built: no corrections. Rebuilt `docs/CODE-INDEX.md` and `docs/FEATURE-MAP.json` against the actually built Sections 2 and 3, including a twenty-route four-layout placement table and a `lane_branches` block naming exact branches and commits. The lane verified claims against the lane worktrees' real files rather than trusting the plan's pointers, which did not resolve inside its own worktree. Record: `docs/runs/compact-phone-refactor/lanes/S5B.md`.

- 2026-09-17: Section 6 merge checkpoint on branch `claude/compact-integration`, from `codex/compact-phone-refactor@1e0b6fd`, controller Opus 5 High. Four real merges (`--no-ff`) in dependency order: `claude/compact-server` (`67fe1bd`, clean), `claude/compact-runtime` (`b991a56`, clean), `codex/compact-docs` (`7cbf15e`, four documentation conflicts), `codex/compact-index` (`935ed55`, three documentation conflicts). Every conflict was a stale file from the two Codex branches, which had branched from the older `c44d021`; each was resolved by keeping the fuller, more current record, never a stub over real content, and the design handoff kept the completed design-lane body while gaining the newer status note from the 5A side. No code conflict occurred, and a name-status diff after each merge confirmed nothing from Sections 2 to 4 was reverted. Local verification only: `node --check` passed on all 23 changed JavaScript files, `node design-gallery/build.mjs` passed (it runs `verifyLayouts()`), the existing functions suite passed 56 of 56 with a temporary `node_modules` symlink that was removed before committing, `FEATURE-MAP.json` parses, and a localhost `?wdPreview=1` walkthrough of thirteen routes in all four appearances at 375 pixels found zero console errors and zero horizontal overflow. Unverified: every Section 3 callable is still unexercised end to end because the preview runs with Firebase disabled, the scheduled history recorder and the rules changes have never run against any Firestore instance, and stale-save handling is unreachable until a client sends `expectedRevision`. Nothing deployed, nothing pushed, no production reads or writes, no migrations, no new test suites. Still pending, in order: Anthony's preview approval, the single final Opus 5 High integrated review, and release approval. Record: `docs/runs/compact-phone-refactor/lanes/S6.md`.

- 2026-09-17: Final integrated review run once, read-only, on `claude/compact-integration` by Opus 5 High as the plan allows. Verdict BLOCKED: four blocking findings and three follow-up findings. There is no second review round, so the controller corrected all seven directly and verified each itself; every finding was confirmed in the code first and all seven were real. Blocking: profile and availability saves sent their stale-save witness inside `patch`, which the server's `normalizeProfilePatch` rejects, so every such save would have failed (the same root cause had also broken the compact Availability save outright, found and fixed with it); the Availability screen saved through `updateMemberAvailability`, so the Needs-replacement fan-out never ran and now goes through `saveMemberAvailability` with the per-department payload, reporting flagged duties in plain words; `functions/compact-membership.js` was never wired, and its four callables are now exported through `exposeDepartmentCallable` (whose actor checks were confirmed to fit accept's any-signed-in-member rule) with a real `#invite/<token>` link, Share and Copy, and a full accept route across all four layouts; the presider song witness was captured once and went stale on the presider's own song picks, and is now re-captured whenever the displayed setlist moves. Follow-up: Remove is hidden on the last song of a recorded list, with the server rule untouched; `firestore.rules` was deliberately not loosened, and `needsReplacement` and `assignmentRevisions` are instead carried through unchanged on every full-document schedule write so a client can neither forge nor drop them; one unescaped department name wrapped in the escape helper. Verified locally: `node --check` on every changed file, `node design-gallery/build.mjs` including `verifyLayouts()`, the existing functions suite 56 of 56 with a temporary `node_modules` symlink removed before committing, a require-level smoke of the membership factory signature, a `firestore.rules` brace check, and a `?wdPreview=1` walkthrough of fourteen routes in two appearances at 375 pixels with no console errors and no horizontal overflow. Still unverified: nothing authenticated or live was exercised, so the corrected callable payloads are verified by contract and by reading the server's own field handling, not by execution. Nothing deployed, nothing pushed, no production reads or writes, no migrations, no new test suites. Release remains pending Anthony's approval and authenticated checks. Record: `docs/runs/compact-phone-refactor/lanes/S6.md`.
- 2026-09-17: Anthony's rulings after the corrected integration (`432b2ba` on `claude/compact-integration`): hold release and hold authenticated staging for now (no deploy of Hosting, Functions or Rules); hide the Exceptions screen until an exception data model is defined; release without the Prism and Aurora dark and motion toggles and rebuild them as a follow-up lane. Still required before completion: authenticated member, leader and administrator journeys, Anthony's release approval, guarded release, private backup.

- 2026-09-17: Section 6 production server deploy executed under Anthony's same-day approvals (deploy the new server code and rules to production now; the automatic song-history recorder records from release day forward only). Before any deploy, `functions/compact-workflows.js` gained `SONG_HISTORY_FLOOR_DATE = '2026-09-17'`, applied in `recordSongHistory`'s candidate filter and again inside the per-setlist transaction as an in-memory Pacific service-date string compare, so no Firestore inequality and no composite index is involved and a missing date fails closed; the pre-release back catalogue can never be auto-recorded. The committed staging harness gained absolute, floor-anchored fixtures and a fixed recorder clock, proving a confirmed past-window setlist dated before the floor is not recorded, one dated on the floor is, and a second run records nothing: 29/29 harness checks passed against the `demo-lv-zion-duties` emulators and the functions suite passed 56/56 (commit `e43e1fb`). Deployed by explicit named targets only, never a bare `firebase deploy` or bare `--only functions`: `firestore:rules` (20:44:58Z to 20:45:19Z UTC), then fifteen named functions (20:45:38Z to 20:47:34Z UTC, eight created and seven updated, `onScheduleWrite` among them), then `songHistoryRecorder` on its own once Step 1 had passed (20:48:59Z to 20:50:20Z UTC). The two functions in this shared project that belong to another app, `onVercelScheduleWrite` and `worshipVercelReconcile`, were left untouched and nothing was deleted; the post-deploy list is the original 21 plus the 9 new. Smoke checks with no credential: live site HTTP 200 with its release marker `gallery1789446013699` unchanged (Hosting deliberately not published), `/ics/B.%20Anthony` HTTP 200 with a valid calendar body, `publicSchedule` HTTP 200 with 70 services, unauthenticated calls to four new callables all refused HTTP 401 `UNAUTHENTICATED`, and function logs clean of errors. No rollback was needed; rollback points, exact commands and the saved copy of the live rules from `1e0b6fd` are in the lane record. No Hosting publish, no `release.mjs`, no migration, no data deletion, no direct production Firestore read or write. Record: `docs/runs/compact-phone-refactor/lanes/S6.md`.
- 2026-09-17: Anthony's rule change to the Schedule default selector, given directly in chat: "when a service time starts, it should then start to show the next service." This supersedes the earlier three-hour "stays current" Schedule default recorded in AGENTS.md and exercised (read-only, no code change) in `docs/runs/compact-phone-refactor/reviews/pacific-selector.md`. Implemented on `claude/compact-integration`: `preferredScheduleService` in `app.js` now returns the first service whose start is strictly after Pacific now, or falls back to the most recent one; the three-hour active window was removed. One shared selector still serves Original, Prism, Navy & Cream, Aurora and maintenance. `hostManageServices()` (the Manage schedule list, app.js) now filters on a new Pacific-based `pacificTodayISO()` helper instead of the device-local `todayISO()`, fixing the related date-boundary defect the earlier review recorded; every other `todayISO()` caller is unchanged. Member-facing "Current or next service" wording changed to "Next service" in `app.js` and `layouts/_common.js`, and `docs/USER-MANUAL.md` updated to match. `AGENTS.md`'s trap line rewritten with the new same-day 5:00 AM/7:30 PM and 2:29/2:31 PM test times. The presider song planner's three-hour window (`song-app.js`, `SERVICE_ACTIVE_WINDOW_MS`) and the server song-history recorder's three-hour window (`functions/compact-workflows.js`, `functions/index.js`) were left unchanged, out of scope for this Schedule-default rule. Verified: Node pure-function cases under TZ=UTC, TZ=Asia/Tokyo and TZ=America/Los_Angeles (2:29/2:30/2:31 PM, 7:29/7:31/7:45 PM Pacific, a last-service-of-day rollover to the next day, a no-upcoming-service fallback to the most recent service, and a DST-adjacent date), all matching across all three timezones; `node design-gallery/build.mjs` passed; `node --check` on `app.js` and `layouts/_common.js`; a localhost `?wdPreview=1` walkthrough with a `Date` override at 14:59 and 15:01 Pacific across Original, Prism, Navy & Cream, Aurora and maintenance, all advancing correctly at the boundary minute with no console errors; an explicit past-month browse (July to May) confirmed to leave the automatic "Next service" banner untouched. A fresh, read-only Haiku Explore review of the diff ran focused on boundary minutes, timezone handling, and leftover old-rule callers: verdict PASS, no bug found, no correction needed. Full case table, method, and review outcome: `docs/runs/compact-phone-refactor/reviews/pacific-selector.md`. No deploy, no `design-gallery/release.mjs`, no push, no production access, no `functions/` or `firestore.rules` changes.
