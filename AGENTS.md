# Repository contract

Last reviewed: 2026-09-20.

## Orientation

This is the live LV Zion Worship Duty Firebase PWA at https://lv-zion-duties.web.app. Read `README.md`, `docs/HANDOFF.md`, `docs/PLAYBOOK.md`, and the active plan before changing behavior.

How work is done now (Anthony's decision of 2026-09-17): keep the live look. The integrated new-shell preview was rejected because it replaced the app's look. Features are added into the four existing appearances (Original, Prism, Navy & Cream, Aurora) one at a time. Each feature goes to the private preview channel first, and goes live only on Anthony's approval. Features F1 to F11 are live as of 2026-09-20 (release marker `gallery1789951374910`).

Where the live app comes from:

- Live Hosting source: branch `claude/keep-look-f4f5`, worktree `/Users/anthony/Projects/worship-duty-app-worktrees/keep-look-f4f5`. Start new feature branches from it.
- Live Cloud Functions and live Firestore rules source: branch `claude/compact-integration`, worktree `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration` (deployed 2026-09-17, `feedback` rule added 2026-09-20, commit `a5068d9`). That branch's new-shell UI was rejected and is not the UI source.
- Branch `claude/keep-look-features` stops at F3. The main checkout `/Users/anthony/Projects/worship-duty-app` sits on `codex/compact-phone-refactor` at the pre-F1 commit `1e0b6fd`; do not release from it.

## Active plan and Build log

The active plan is `docs/PLAN-COMPACT-PHONE-REFACTOR.md`. Its goal line still governs: preserve Original, Prism, Navy & Cream, and Aurora as four distinct layouts. Its `## Build log` is the durable record and belongs to the coordinator. Plan sections 3 to 5 describe the rejected new-shell execution and are marked superseded. Per-feature records live in `docs/runs/keep-look-features/`. The department roster plan is historical.

## Verification

For the active plan, Anthony selected no new test cases or automated suites. Use `node --check app.js`, `node design-gallery/build.mjs`, and brief privacy-safe browser walkthroughs of all four appearances at phone width. Preserve essential functional and department-access checks.

- Run `node --test tests/member-migration.test.mjs` for identity migration changes.
- `node design-gallery/test.mjs` (run outside the macOS sandbox) covers shared UI in all four appearance modes. As of 2026-09-20 it is being updated by lane F13, because it still clicks sub-tab buttons that are hidden on phones and expects account ID text that was removed. Check `docs/HANDOFF.md` open items before trusting a failure or a pass.
- No session so far has held the site passcode or a member PIN, so signed-in production screens have not been verified by an agent. Say so plainly in any report; never claim a live signed-in check that did not happen.

## Traps and boundaries

- Production is https://lv-zion-duties.web.app. Nothing goes live without Anthony's explicit approval of that feature on the preview channel.
- NEVER deploy `firestore.rules` from `claude/keep-look-f4f5` or any branch made from it. That file is older than the live rules: it has no `departmentInvitations` match and no `feedback` match, so deploying it would break the feedback button and drop the live rule set. Rules-only deploys run from the `compact-integration` worktree with `firebase-tools deploy --only firestore:rules`. The same applies to `functions/`: the live Functions include nine that exist only on `claude/compact-integration`.
- The Firebase project is shared. Deploy only explicitly named Hosting, Functions, or Rules targets. Two live functions (`onVercelScheduleWrite`, `worshipVercelReconcile`) belong to another app; never run a bare `firebase deploy` or a bare `--only functions`.
- Always build and release Hosting through `design-gallery/release.mjs` (`--preview`, then `--publish`) so release stamps and compatibility checks remain intact. Follow `docs/PLAYBOOK.md` section 8 and the section 8a maintenance line.
- The Claude Code auto mode classifier denies production deploys to Claude. Do not work around it. Give Anthony copy-paste blocks with absolute paths and he runs the release commands himself.
- Never put passcodes, tokens, member PINs, or production records in Git, test fixtures, screenshots, or review packets. No account ID is shown anywhere on screen; keep it that way.
- The Google Sheet is an import source. Runtime schedule data lives in Firestore, and no Firestore-to-Sheet write path is allowed. Canonical identity and department eligibility rules must apply to browser and scheduled imports.
- `song-lib.js` behavior is consumed by the local Signal ingest service. Preserve its public behavior.
- Preserve the site-wide lock unless an explicitly reviewed migration replaces it.
- Preserve the four distinct appearance layouts and the Appearance control. The shared pieces are deliberate and approved by Anthony: one header (markup in `index.html`, styled per appearance in `design-gallery/header.css`), the floating bottom bar on phones, the secondary menu row under the header on phones, and the feedback button. Each appearance keeps its own colors, fonts, and surfaces. There are no dark mode or pause buttons: Prism and Aurora follow the system dark setting.
- The design gallery is a compiler, not a second app. `design-gallery/build.mjs` fails on source drift; when it fails, fix the source interface rather than loosening the check.
- Keep Original, Prism, Navy & Cream, Aurora, and maintenance on one Pacific-time next-service Schedule selector. As soon as a service's start minute arrives, the default advances to the next upcoming service (may be tomorrow); it does not stay "current" for any window. Anthony changed this rule on 2026-09-17, replacing the old three-hour "stays current" window. Test a same-day 5:00 AM and 7:30 PM pair at 7:29 PM (still shows 7:30 PM) and 7:31 PM (advances to the next upcoming service) Pacific, plus a 2:29 PM / 2:31 PM afternoon-to-evening pair, before any Hosting release. Preserve an explicitly selected past service while advancing the automatic default.
- Do not wipe or reseed the production schedule. Production migrations or record deletion require a dry run and Anthony's explicit approval.

## Preview fidelity

Anthony requires previews and prototypes to use real app data and wording. Reuse existing approved app data sources rather than inventing service patterns, duties, names, or labels. Verify the actual current app source and date coverage before presenting designs. Historical seed data is not an acceptable substitute for current data unless Anthony explicitly requests historical content. Identify historical versus current data accurately. Reference existing source data without copying personal records into new fixtures or review packets. Prototype saves remain isolated from production.

The preview channel (`node design-gallery/release.mjs --preview`, https://lv-zion-duties--design-gallery-review-rtm2fa8h.web.app) reads and writes REAL records. Treat it as read-only review unless Anthony is the one tapping.
