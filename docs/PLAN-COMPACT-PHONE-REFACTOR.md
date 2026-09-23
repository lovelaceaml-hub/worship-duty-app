# Worship Duty: Complete Phone Refactor (HISTORICAL)

> **Retired 2026-09-22 by Anthony: "compact phone refactor is outdated. no longer needed."**
> This retirement is specifically the original integrated new-shell scope, rejected by Anthony on 2026-09-17: its Section 2 (shared runtime foundation) stays unmerged on `claude/compact-runtime` at `a1246a6` and `db8f610`; its Section 3 (server workflows) stays unmerged on `claude/compact-server`. Neither was ever deployed and neither changed production. Do not resume that scope or treat its product decisions (floating bottom bar, compact tabs, role start screens as a new shell) as requirements.
> After the 2026-09-17 rejection, this same plan document was repurposed for a different, successful effort tracked below: keep the live look, add features into the four existing appearances one at a time. That effort (F1 to F14) is complete, live, and its Build log below is the durable record of it. It merged into `main` on 2026-09-23 alongside [PLAN-2026-09-22-APP-JS-SPLIT.md](PLAN-2026-09-22-APP-JS-SPLIT.md), which is the current active plan for anything further.

Status: historical, complete. Was approved for implementation on 2026-09-15; the integrated new-shell preview was rejected on 2026-09-17, after which the live look was kept and features were added into the four existing appearances one at a time, preview channel first, live on Anthony's approval. F1 to F14 shipped and are live as of 2026-09-20 (release marker `gallery1789952310145`); merged into `main` on 2026-09-23. Hosting was from branch `claude/keep-look-f4f5` through that merge; Cloud Functions and Firestore rules remain sourced from branch `claude/compact-integration` (see the Build log).
Mode: Parallel. Runner: one controller, disjoint worktrees, integration last. Since 2026-09-17: one Fable writer per feature lane, each in its own worktree made from `claude/keep-look-f4f5`; records in `docs/runs/keep-look-features/`.
Baseline: `86a476f6d80b5a7bbbb09f8c0e0c8a5721fff427`, clean working tree on `change/actionable-request-counts`.
Integration branch: `codex/compact-phone-refactor` (historical, stops at the pre-F1 commit `1e0b6fd`). Current source of the live app: `claude/keep-look-f4f5`.
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

> Superseded on 2026-09-17: this section describes the rejected new-shell approach (shared information builders feeding four new layout renderers, replacing the gallery compiler). The live app keeps `app.js` plus the design-gallery compiler, and features are added into the existing screens. The "Server interfaces" part below was built and deployed from `claude/compact-integration` on 2026-09-17 and stays live; most of it has no screen yet (see `docs/HANDOFF.md` section 5). Text kept for the record.

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

> Superseded on 2026-09-17: the model table and Sections 0 to 6 below describe how the rejected new-shell build was run. Sections 1, 2, 4, and the Hosting half of 6 produced the rejected shell; Section 3 and the server half of 6 are live. Work now runs as single-writer feature lanes (F1 onward) recorded in the Build log. Text kept for the record.

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

> Superseded on 2026-09-17 in part: "release all roles together after the integrated preview" no longer applies. Each feature is previewed and released on its own through `docs/PLAYBOOK.md` sections 8 and 8a. The limits on testing, the guarded publisher, the dry-run rule for migrations, and the rule never to confuse mocked checks with production evidence all still apply.

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

- 2026-09-17: Anthony reviewed the integrated new-shell preview on branch `claude/compact-integration` and rejected it: it replaced the live app's look with a plain new shell instead of preserving the four existing appearances (Original, Prism, Navy & Cream, Aurora), which the approved plan always required. Decision: keep the live app's current look exactly, drop the new shell, and add the working features into the existing screens one at a time, each shown to Anthony on a private preview link first. Branch `claude/compact-integration` is kept for reference and for the server work already live; it is not merged or deployed as-is. New work happens on branch `claude/keep-look-features`, starting from commit `1e0b6fd` (the live app's actual source: existing `app.js`, the four existing appearances, and the existing design-gallery compiler and guarded release script). F1 is the first feature: the Schedule default-service rule. See `docs/runs/keep-look-features/F1-schedule-default.md`.

- 2026-09-17: F1 (the Schedule default rule) is LIVE at https://lv-zion-duties.web.app, on Anthony's explicit approval. Goal-line check first: `git diff 1e0b6fd..HEAD --stat` touches only `AGENTS.md`, `app.js`, this plan, `docs/USER-GUIDE.md`, `docs/USER-MANUAL.md`, and the F1 run record, so "Preserve Original, Prism, Navy & Cream, and Aurora as four distinct layouts" is intact, with no styles, markup structure, appearance sources, or navigation changed. Members saw the app's read-only "Schedule maintenance in progress" page during the change. That page is not a Firestore flag, contrary to an earlier note in the F1 record: it is one `index.html` line, `<script>document.documentElement.dataset.maintenance = 'active';</script>`, published through the same guarded Hosting release, exactly as commits `54fee56` and `c057c3e` did on 2026-09-14. Two hosting-only releases through `node design-gallery/release.mjs --publish`: marker `gallery1789446013699` before, `gallery1789697104384` with maintenance on, `gallery1789697177680` after the maintenance line was removed and the full app restored. No Firestore write, no functions, no rules, no bare `firebase deploy`. Verified: HTTP 200 throughout, maintenance page rendered at 375 pixels with a clean console, F1 code confirmed in the served `app.js`, the same four appearance stylesheets (`design-choice.css`, `prism-live.css`, `navy-live.css`, `aurora-live.css`) served before and after, and the normal app shell back after the second release. Rollback and maintenance commands: `docs/runs/keep-look-features/F1-schedule-default.md`.

- 2026-09-17: F2 (Reset PIN button) is LIVE at https://lv-zion-duties.web.app, on Anthony's explicit approval. The existing `reset-member-pin` handler and `canResetPin` permission gate in `app.js` had no button rendering it; the `del-member` control the task named as a placement anchor turned out to be dead code with no current renderer, so the button was placed beside the roster row's actual live control instead, the "Archive"/"Restore" button in `renderDepartmentProfileRow` (`app.js`), reusing its `class="ghost mini"` markup and the same `canPermission('canResetPin', ...)` gate the handler already required. `renderDepartmentRosterGroup` and its call sites in `renderManageDepartment` now thread the department name through for the permission target. `git diff --stat` touches only `app.js` (7 insertions, 4 deletions) plus docs, so the goal line is intact; all four appearances share this render path through the design-gallery compiler. `node --check app.js` and `node design-gallery/build.mjs` both passed. The `?wdPreview=1` Firebase-disabled preview flag named in the task does not exist in this codebase, so the signed-in admin roster view was not visually confirmed in a browser this session; Anthony should confirm the button on the live site. Two hosting-only releases through `node design-gallery/release.mjs --publish` with the maintenance message shown during the change, following PLAYBOOK section 8a exactly as F1 did: marker `gallery1789697177680` before, `gallery1789701029336` with maintenance on, `gallery1789701070255` after the maintenance line was removed and the full app restored. No Firestore write, no functions, no rules, no bare `firebase deploy`. Verified: HTTP 200 throughout, maintenance line present then absent in the served `index.html`, the same four appearance stylesheets served before and after, and the served `app.js` contains `reset-member-pin`. Full record, including the unverified visual walkthrough and rollback commands: `docs/runs/keep-look-features/F2-reset-pin-button.md`.

- 2026-09-18: F3 (add a department member by name search) is on the preview channel https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app, awaiting Anthony's approval; live is unchanged. Anthony assigned each lane to Fable for this session, so Fable wrote it. The UID form in the department roster is replaced by a name search that calls the live `searchDepartmentCandidates` callable and then the existing `createDepartmentProfile`; on Anthony's instruction ("no UID is needed. that shouldnt exist") the visible UID text is removed. Goal-line check: only `app.js` and docs changed, existing classes reused, no stylesheet or appearance source touched. `node --check app.js` and the four-appearance build passed. Signed-in screen not visually verified here. Record: `docs/runs/keep-look-features/F3-member-search-by-name.md`.

- 2026-09-19: Anthony approved F3 for live, but the Claude Code auto mode classifier denied the production release command, and then denied further steps after Claude added (on Anthony's click) the allow rule `Bash(node design-gallery/release.mjs --publish)` to `/Users/anthony/Projects/.claude/settings.local.json`. No workaround attempted; Anthony was given the two PLAYBOOK 8a commands to run himself from the `keep-look-features` worktree, which stays F3-only for that reason. F3 is NOT live as of this entry.
- 2026-09-19: Anthony asked for multi-lane Fable work. Lane F4 (floating bottom bar, branch `claude/f4-bottom-bar`, commit `9cebc4f`) and lane F5 (calmer notifications area on My Duties, branch `claude/f5-notifications`, commit `c478d10`) ran in parallel, one Fable writer per worktree, no deploys. Coordinator reviewed both diffs and the mock-data screenshots, merged them without conflict into `claude/keep-look-f4f5` (worktree `/Users/anthony/Projects/worship-duty-app-worktrees/keep-look-f4f5`), `node --check app.js` and the four-appearance build passed, and published the combined F3+F4+F5 preview to https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app. Goal-line check: F4 moves the existing `nav.tabs` to a floating phone bar using each appearance's own tokens (reversing the 2026-09-13 top-tabs override `1a674f3`); F5 touches only `renderMy`, `checkReminders`, and two CSS lines. Awaiting Anthony's side-by-side approval. Open: README line 15 and HANDOFF still say top tabs; real-phone keyboard and safe-area behavior unverified. Records: `docs/runs/keep-look-features/F4-floating-bottom-bar.md`, `F5-notifications-layout.md`.

- 2026-09-19: Anthony approved the F4 bottom bar direction, asked for it to stand out more, and named a header change: one header for all four appearances, a hybrid of Prism's and Aurora's (Prism's layout, second line shows the current screen like Aurora), pause and dark mode buttons removed, dark mode by system setting, Appearance button smaller and discreet; he confirmed all four appearances. Two parallel Fable lanes, one writer per worktree, no deploys: F4b (branch `claude/f4b-bar-standout`, commit `b8ecf02`, bar styling only, Anthony approved the look from `F4b-screens/bars-close-up.png`) and F6 (branch `claude/f6-unified-header`, commit `8af739b`, shared header markup in `index.html`, `paintHeader()` and `SCREEN_TITLES` in `app.js`, per-appearance sections in new `design-gallery/header.css`, dark by `prefers-color-scheme` for Prism and Aurora only, saved manual dark and pause choices cleared). Coordinator reviewed screenshots, merged both into `claude/keep-look-f4f5` without conflict, and added one fix: the rose attention banner was unreadable in dark mode now that dark is automatic (`body.dark .banner.alert` in the Prism and Aurora sections of `header.css`; not yet screenshotted). `node --check app.js` and the four-appearance build passed. Combined F4+F4b+F5+F6 preview: https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app. Live is unchanged (F1 to F3). Goal-line note: the header change is a departure from the live look that Anthony named explicitly; each appearance keeps its own colors, fonts and surfaces. Open: README line 15 and HANDOFF still describe top tabs and the old toggles; Prism's utility row now holds only its label; real-phone dark switching, keyboard hide and safe area unverified. Records: `docs/runs/keep-look-features/F4b-bar-standout.md`, `F6-unified-header.md`.

- 2026-09-19: Anthony approved F4, F4b, F5 and F6 for live, with two tweaks done first as F6b (commit `82cc4e4`, same Fable writer, now sole writer of `claude/keep-look-f4f5`): Prism's leftover "PRISM" utility row removed, and "Live sync on" in Original and Navy & Cream becomes a small status dot in the main header row on phones (text kept for screen readers, `title` and `aria-label` set in `setSyncPill()`). Dark attention banner verified by screenshot: Aurora 7.18 to 1 with the coordinator fix; Prism already had its own dark banner (4.17 to 1, just under AA for normal text, unchanged from before, follow-up candidate), so the unused Prism copy of the rule was dropped. `node --check app.js` and the four-appearance build passed; preview refreshed. Live release pending: Anthony runs the two PLAYBOOK 8a commands from the `keep-look-f4f5` worktree because the classifier denies production deploys to Claude.

- 2026-09-19: F4, F4b, F5, F6 and F6b are LIVE at https://lv-zion-duties.web.app on Anthony's approval, released by Anthony from the `keep-look-f4f5` worktree (commit `fb7146b`) with the PLAYBOOK 8a maintenance message. Markers: `gallery1789833426376` with maintenance on, `gallery1789833476547` after restore. Hosting only. Verified: HTTP 200, maintenance on then off, live files carry the shared header, the My Duties change, the name search and the Aurora dark banner fix, four appearance stylesheets 200, working tree clean. Unverified: real phone, screen reader, signed-in production screens. Follow-ups and rollback: `docs/runs/keep-look-features/RELEASE-2026-09-19-F4-F5-F6.md`. Branch `claude/keep-look-f4f5` is now the source of the live app; `claude/keep-look-features` stops at F3.

- 2026-09-19: Anthony named a second batch of changes and asked for multi-lane Fable work with no reviews and maximum speed. Four parallel Fable lanes, one writer per worktree, no deploys, all merged into `claude/keep-look-f4f5` (one doc conflict in `docs/USER-GUIDE.md`, resolved keeping both passages): F7 `4a2a811` (member name opens a menu with Availability, Settings, Sign out; "Signed in as" card and the pink attention card removed; appearance toast shortened; availability editor moved from My Duties to its own view), F8 `97d7922` (My Duties new-duty dot turns green and reuses the existing `checkNewDuties` seen/unread bookkeeping; Manage dot unchanged; Presider and Manage secondary menus mirrored into one scrolling row under the header on phones via `watchTopSubnav()`), F9 `f51cdcb` (Prism dark banner link contrast 4.17 to 5.82 to 1; attribution never shows a raw ID; README, HANDOFF and the plan Status line brought up to date), F10 `f7d4fa2` (floating feedback button above the bottom bar, feedback sheet, administrator Feedback list under Manage, `design-gallery/feedback.css`). Coordinator also removed the now redundant Sign out button from the Manage menu row (`ae4ff16`). Server: F10 writes to a new Firestore collection `feedback`; the matching rule was added on `claude/compact-integration` (commit `a5068d9`), because the LIVE rules were deployed from that branch on 2026-09-17 and this branch's `firestore.rules` is older (it lacks `departmentInvitations`), so rules must never be deployed from `keep-look-f4f5`. Document shape written by the client was checked against the rule's allowed keys. `node --check app.js` and the four-appearance build passed after every merge. Preview: https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app. Live unchanged (F1 to F6). Unverified: real phone, screen reader, the real feedback rule and list query, production screens. Follow-ups: `design-gallery/test.mjs` clicks sub-tab buttons now hidden on phones and expects UID text; Navy & Cream month arrows render as an empty square in the mock fixture (origin unchecked). Records: `docs/runs/keep-look-features/F7-account-menu.md`, `F8-dots-and-subnav.md`, `F9-cleanup.md`, `F10-feedback.md`.

- 2026-09-20: F11 (Navy & Cream month arrows, commit `d4c4c8e`): the chevron icons never had a base size in `design-gallery/navy.css` (unchanged since `b497a58`, 2026-09-10), so they collapsed to nothing; the bug predated F4 to F10 and was live. Two CSS rules fix it and the oversized next-service chevron.
- 2026-09-20: F7, F8, F9, F10 and F11 are LIVE at https://lv-zion-duties.web.app on Anthony's approval (availability stays behind the name menu only). Anthony ran three commands: Firestore rules only from `claude/compact-integration` (`a5068d9`, adds the `feedback` collection rule), then the two PLAYBOOK 8a Hosting releases from `keep-look-f4f5`. Markers: `gallery1789951350427` with maintenance on, `gallery1789951374910` after restore. Verified: HTTP 200, maintenance on then off, live files carry the feedback, top-menu and account-menu code and the arrow fix, the attention banner is no longer rendered, four appearance stylesheets 200, working tree clean. Unverified: real phone, screen reader, a real feedback send and list read. Standing warning: live rules come from `claude/compact-integration`; never deploy `firestore.rules` from `keep-look-f4f5`. Record: `docs/runs/keep-look-features/RELEASE-2026-09-20-F7-F11.md`.

- 2026-09-20: Anthony confirmed a real feedback note sent from the live app arrived under Manage, Feedback, so the `feedback` rule and the administrator list work in production. He then asked for the test suite and all documentation to be updated and confirmed Navy & Cream showed a service card twice. Three parallel Fable lanes, one writer per worktree, no deploys: F12 (double card), F13 (test suite, in progress), F14 (documentation, in progress).
- 2026-09-20: F12 (commit `e1143c9`) is LIVE at https://lv-zion-duties.web.app on Anthony's approval. Cause: commit `8c987d1` (2026-09-14) made the host `renderSchedule()` add a "Next service" card inside `.schedule-focus`; the Navy adapter hid only direct `.card` and `.date-head` children, so Day view showed the service twice. Fix: one selector in `design-gallery/navy-adapter.js` hides `.schedule-focus` in Day view; Full schedule keeps the labelled card as Original does. Anthony ran the two PLAYBOOK 8a Hosting commands: `gallery1789952292424` with maintenance on, `gallery1789952310145` after restore. Hosting only. Verified: HTTP 200, maintenance on then off, fix present in live `app.js`, four appearance stylesheets 200, working tree clean. Unverified: real phone. Record: `docs/runs/keep-look-features/F12-navy-double-card.md`.

- 2026-09-20: F14 (documentation, commit `99121d8`) and F13 (test suite, commit `830741a`) merged into `claude/keep-look-f4f5`; no release needed. F14 rewrote USER-GUIDE, USER-MANUAL and HANDOFF, updated README, PLAYBOOK, AGENTS, design-gallery/README, FEATURES, FEATURE-MAP and CODE-INDEX, marked twelve superseded documents historical, settled twelve contradictions against the code, and put the rules-source warning in AGENTS, HANDOFF and PLAYBOOK. Coordinator then marked F12 live in those documents, replaced the playbook's untried perl maintenance command with the sed command Anthony has actually run, and updated the Worship Duty row of `/Users/anthony/Projects/README.md`. F13 updated `design-gallery/test.mjs`, `tests/schedule-default.test.mjs` and a Playwright resolver helper without touching app code. Coordinator ran both on the merged source after F12: `WD_STRICT=1 node design-gallery/test.mjs` 278 pass, 0 fail, exit 0; `node --test tests/*.test.mjs` 116 tests, 115 pass, 1 skipped (emulator). Findings left open for Anthony: the dead "Editor passcode" switch and card under Manage, Features; the unlabelled `songHistoryRecorder` running server-side since 2026-09-17; Prism calendar arrow keys snap back to the default service (keyboard only); three legacy standalone preview suites still fail (retire or repair). Records: `docs/runs/keep-look-features/F13-test-suite.md`, `F14-docs.md`.
