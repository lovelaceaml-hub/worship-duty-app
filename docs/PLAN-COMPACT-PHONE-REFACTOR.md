# Worship Duty: Complete Phone Refactor

Status: Approved for implementation on 2026-09-15. Package 0 active; prototype approval pending.
Mode: Parallel. Runner: one controller, disjoint worktrees, integration last.
Baseline: `86a476f6d80b5a7bbbb09f8c0e0c8a5721fff427`, clean working tree on `change/actionable-request-counts`.
Integration branch: `codex/compact-phone-refactor`.
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
