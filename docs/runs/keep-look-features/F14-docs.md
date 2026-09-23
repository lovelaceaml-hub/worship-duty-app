# F14: documentation pass (2026-09-20)

Lane F14, single writer (Claude, Fable 5.1, assigned by Anthony's coordinator),
worktree `/Users/anthony/Projects/worship-duty-app-worktrees/f14-docs`, branch
`claude/f14-docs`, started from `265309b` (the source of the live app). Lanes
F12 (Navy & Cream double card) and F13 (test suite) ran at the same time; F14
stayed out of their files. Documentation only: no code, style, test, rules, or
config changes. Nothing was deployed and no Firebase command was run.

Anthony's request, verbatim: "update ... all documentation".

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four
distinct layouts." This lane changes only `.md` files and
`docs/FEATURE-MAP.json`. `node design-gallery/build.mjs` and
`node --check app.js` still pass. The goal line holds. The plan's
`## Build log` was not edited (the diff of the plan file touches lines 3, 4, 6,
and three inserted notes above line 172, where the Build log starts).

## What each document now covers

| Document | Now covers |
| --- | --- |
| `AGENTS.md` | Orientation for the keep-the-live-look approach, the two live sources (Hosting from `claude/keep-look-f4f5`, Functions and rules from `claude/compact-integration`), the never-deploy-rules-from-here trap, the classifier limit, verification as it really is (test suite under repair, no agent has held a passcode). Schedule selector rule and Preview fidelity kept. |
| `README.md` | Quick links first (live, preview channel, GitHub, Firebase console, plan, HANDOFF, PLAYBOOK, USER-GUIDE, USER-MANUAL, run records), current status, source table, release in three steps, pointer to AGENTS.md, file list. |
| `docs/HANDOFF.md` | Rewritten. Current state, how to resume, branches and worktrees table, release history F1 to F11 with markers, the ONE open items list (including the table of plan features that exist server-side with no screen), standing warnings, then a verified architecture reference and a short history. |
| `docs/PLAYBOOK.md` | Section numbers unchanged. Current status, section 3 (name search, Reset PIN, availability under the name menu), section 5 (sign-in instead of picking a name, calendar subscription, dots), section 6 (editor passcode switch does nothing), section 7 (reset warning), section 8 (rules-source warning, the three-command release pattern with absolute paths, rules-only and functions notes, rollback), section 8a (kept accurate, dates of use), sections 9 and 10, and a dated note on the July briefs in Part 2. |
| `docs/USER-GUIDE.md` | Rewritten for members, in the order a person meets the app: site lock, sign-in, forced PIN change, header, bottom bar, name menu, dots, Schedule, My Duties, change requests, Availability, Settings, notifications, calendar, Presider, Appearance, feedback. |
| `docs/USER-MANUAL.md` | Rewritten for leaders and administrators: who sees what, Manage and its sections on a phone, Departments (add by name, profile, archive, Reset PIN), Services, double-duty warnings, Planning, Requests, Leader config, Features, Data & Sync, Feedback, Presider notes, notifications. |
| `design-gallery/README.md` | How the four appearances compile now, step by step, verified against `build.mjs`: drift checks, host bridge slots, shared header markup lifted from `index.html`, per-appearance `header.css` and `feedback.css` sections, song planner bridge, staging, release marker. Test suite status and the rules warning. |
| `docs/PLAN-COMPACT-PHONE-REFACTOR.md` | Status lines only, plus three "Superseded on 2026-09-17" notes at the top of sections 3, 4, and 5. No plan text deleted. |
| `docs/FEATURES.md` | The switch list checked against `FEATURES` in `app.js`; editor passcode documented as retired. |
| `docs/CODE-INDEX.md`, `docs/FEATURE-MAP.json` | Updated rather than marked superseded (smaller and still useful): new rows and entries for the shared header and account menu, phone navigation and dots, and feedback; the "planned, not current" wording removed; the compact prototype section marked historical; a warning that server files on this branch are older than live. |
| `docs/USER-JOURNEYS.md` | Sign-in instead of choosing a name; role-based Manage instead of unlocking. |
| `design-gallery/STATUS.md` | Test suite status as of 2026-09-20. |

## Removed or marked historical

Removed from `docs/HANDOFF.md` (kept in Git history): the shared editor
passcode section, the anonymous sign-in "Level 1" section and its deploy order,
"open database rules" as a known limitation, the July operations runbook with
`npx firebase-tools deploy`, the July roadmap, and the 2026-09-15 "earlier
state" paragraph.

Removed from `README.md`: the long dated status paragraphs (now in HANDOFF
history), the "Compact design handoff" and "in progress, not released" sections,
the "Live sync DONE" section claiming open rules, and `bash scripts/deploy.sh`
as the way to publish.

Removed from `docs/USER-GUIDE.md`: "pick your name from the dropdown", the
editor passcode section, the song planner editor PIN step, and the leader
sections (moved to the manual).

Marked historical with one dated line at the top: `docs/IMPLEMENTATION.md`
(also reached as `docs/CREATION-GUIDE.md`, a symlink),
`docs/COMPACT-DESIGN-HANDOFF.md`,
`docs/design/prototype/compact-phone/README.md` and `HANDOFF-MAP.md`,
`docs/PLAN-DEPARTMENT-ROSTER-AVAILABILITY.md`, `live-design/README.md`,
`docs/UI-QUALITY-REPORT.md`. Dated notes (still partly current) on
`prototype/README.md`, `prototype-prism/README.md`, `docs/PRODUCT-BRIEF.md`,
`docs/DESIGN.md`. One run record got a short dated note because it was
actively misleading: `docs/runs/compact-phone-refactor/INDEX.md` (its lane
table says "planned" for work that ran and was rejected). No other run record
was touched.

In every file touched, em dashes and en dashes were replaced (commas, "to").
That includes mechanical replacement inside the historical files above.

Not touched, on purpose: `docs/USAGE-COUNTER.md`, `docs/MERGE-HANDOFF.md`,
`docs/AUTH-DEPARTMENT-UPGRADE-RELEASE.md`,
`docs/DEPARTMENT-ROSTER-AVAILABILITY-RELEASE.md`, `docs/ASSET-SOURCES.md`, the
two completed September 13 plans, all F1 to F13 and RELEASE records, and the
plan's Build log. `docs/SETUP-GUIDE.md` is a symlink to `PLAYBOOK.md`, so it is
current by construction.

## Contradictions found and how they were resolved

Each was settled by reading the code in this worktree, not by picking a
document.

1. "Prototype approval pending" (AGENTS, PLAYBOOK, USER-MANUAL, CODE-INDEX,
   FEATURE-MAP, the Projects index) against "new shell rejected, F1 to F6 live"
   (README, HANDOFF, plan). Resolved to the Build log: rejected 2026-09-17, F1
   to F11 live.
2. How to add a department member: PLAYBOOK section 3 said "enter the exact
   UID"; USER-MANUAL said name search. Code (`renderDepartmentMemberSearch`)
   is name search. PLAYBOOK fixed.
3. How Manage is opened: USER-GUIDE and FEATURES said a shared editor passcode;
   PLAYBOOK and USER-MANUAL said account role. Code: `feat('editorLock')` is
   never called and `renderUnlock()` is never used, but the switch and the
   "Change the editor passcode" card still render on Manage, Features. All docs
   now say role-based, and the leftover controls are listed as an open item.
4. Security description: HANDOFF, README, and FEATURES said rules are open and
   sign-in is anonymous; PLAYBOOK said verified member sessions. Code:
   `signInWithCustomToken`, `fbWrite()` refuses writes without a verified
   session, rules deny by default, with `setlists` and `songStats` still open
   for the Signal ingest service. Docs now say exactly that.
5. My Duties identity: USER-GUIDE and PLAYBOOK section 5 said "pick your name
   from the dropdown"; code shows a sign-in form and no picker. Fixed.
6. Calendar: PLAYBOOK section 5 said the button downloads an `.ics` file;
   HANDOFF and USER-GUIDE said subscription. Code: `subscribe-ics`. Fixed.
7. Choir song import: old HANDOFF said a blank Sheet value never overwrites;
   PLAYBOOK and USER-MANUAL said a blank `Choir Song` cell clears. Code
   (`_sheetChoirSongSeen`, required by `build.mjs`) matches PLAYBOOK. HANDOFF
   fixed.
8. Song planner editor PIN: USER-GUIDE said the app asks for one; `song-app.js`
   `requireEditor()` says the shared editor PIN is retired. Removed.
9. How to release: README said `bash scripts/deploy.sh` "in this folder", old
   HANDOFF said `npx firebase-tools deploy`, PLAYBOOK pointed at
   `/Users/anthony/Projects/worship-duty-app`. That main checkout sits on
   `codex/compact-phone-refactor` at the pre-F1 commit `1e0b6fd`, so releasing
   from it is wrong (the release script would refuse, because the live `app.js`
   is not in that branch's history). All docs now release from the
   `keep-look-f4f5` worktree.
10. Cloud Functions count: README and old HANDOFF said two functions. This
    branch exports 19; the live project has 30 per the 2026-09-17 deploy record.
11. CODE-INDEX and FEATURE-MAP said the bottom bar and secondary tabs were
    "planned, not current". They are live (F4, F8). Fixed.
12. Where availability is edited: PLAYBOOK said My Duties; code (F7) moved it
    to the name menu. Fixed.

## Facts that could not be verified here

- Anything about the live site. No network, deploy, or Firebase command was
  run. The live marker `gallery1789951374910`, the 30 live functions, the rules
  deploys of 2026-09-17 and 2026-09-20, and the two functions belonging to
  another app are taken from the run records
  (`RELEASE-2026-09-20-F7-F11.md`, and `lanes/S6.md` on
  `claude/compact-integration`).
- F3's live date and marker (`gallery1789826356791`, 2026-09-19). They come only
  from the "Before" row of the F4 to F6 release record; F3 has no release record.
- Whether `songHistoryRecorder` has ever run. Its first run was not observed.
  The user manual words this carefully.
- The exact commands Anthony typed for earlier section 8a releases. PLAYBOOK
  section 8 command 2 (a `perl` one-liner that inserts the maintenance line) is
  new. It was tested on a scratch copy of `index.html` only, never in a real
  release. If the pattern does not match, it changes nothing and the publish
  simply goes out without the maintenance message.
- Whether the preview channel link is still active today, and its expiry date.
- Every signed-in screen. Wording in the user documents was checked against the
  strings in `app.js` and `song-app.js`, not against a rendered signed-in
  production screen. Real-phone and screen-reader behavior remain unchecked.
- The state of lanes F12 and F13 beyond "in progress".
- That GitHub repository is private (taken from the Build log).

## Verification run

- Stale phrase grep over every touched file ("top tabs", "dark mode button",
  "pause", "Member UID", "Signed in as", "need your attention", "prototype
  approval pending", `codex/compact-phone-refactor` as the active branch,
  "editor passcode", "pick your name"): remaining hits are negative statements
  ("there is no dark mode button"), the historical branch row, or inside files
  marked historical.
- U+2014 and U+2013: none in any touched file.
- Relative links: 24 touched Markdown files checked by script, 0 broken.
- `node design-gallery/build.mjs`: passed, four appearances, not deployed.
- `node --check app.js`: passed. `docs/FEATURE-MAP.json` parses.
