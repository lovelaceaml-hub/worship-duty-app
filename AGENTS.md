# Repository contract

Last reviewed: 2026-09-23.

## Orientation

This is the live LV Zion Worship Duty Firebase PWA at https://lv-zion-duties.web.app. Read `README.md`, `docs/HANDOFF.md`, `docs/PLAYBOOK.md`, and the active plan before changing behavior.

How work is done now (Anthony's decision of 2026-09-17): keep the live look. The integrated new-shell preview was rejected because it replaced the app's look. Features are added into the four existing appearances (Original, Prism, Navy & Cream, Aurora) one at a time. Each feature goes to the private preview channel first, and goes live only on Anthony's approval. Features F1 to F14 shipped on the `claude/keep-look-f4f5` line; the app.js split (below) is a separate, source-organization-only plan merged into the same trunk on 2026-09-23.

Where the live app comes from:

- Live Hosting source: `main`, since the 2026-09-23 merge of `claude/keep-look-f4f5`'s F1-F14 work into the app.js split. Start new feature branches from `main`.
- Live Cloud Functions and live Firestore rules source: branch `claude/compact-integration`, worktree `/Users/anthony/Projects/worship-duty-app-worktrees/compact-integration` (deployed 2026-09-17, `feedback` rule added 2026-09-20, commit `a5068d9`). That branch's new-shell UI was rejected and is not the UI source. **`main`'s `firestore.rules` and `functions/` must never be deployed**: they predate the live rules (no `departmentInvitations` match, no `feedback` match) and the live Functions (nine exist only on `compact-integration`). Rules/Functions-only deploys still run from the `compact-integration` worktree.
- `claude/keep-look-f4f5` remains the historical record of F1-F14's own development (screenshots, per-feature run docs); it is superseded by `main` as the Hosting source but is not deleted.

## Active plan and Build log

The active plan is `docs/PLAN-2026-09-22-APP-JS-SPLIT.md`: split `app.js` into modules with zero behavior change, then (2026-09-23) merge in F1-F14's feature work from `claude/keep-look-f4f5`, ported into the same module structure. Its `## Build log` is the durable record. Mode is Steps, one section per fresh chat.

`docs/PLAN-COMPACT-PHONE-REFACTOR.md` is **historical**: Anthony retired it on 2026-09-22. Its unmerged work is preserved on `claude/compact-runtime` and `claude/compact-server` and no branch is deleted. Do not resume it, and do not treat its floating bottom bar, compact tabs or role start screens as requirements; the floating bottom bar, unified header, secondary top subnav and feedback button now live regardless, shipped through F1-F14 instead. The department roster plan is also historical.

## Verification

For the active app.js split plan, the safety net in its Section 1 is the verification: the portable source-text assertions, `scripts/check-app-split.mjs`, the existing four-appearance browser suite, and the pixel parity run. `node design-gallery/test.mjs` (run outside the macOS sandbox) covers shared UI in all four appearance modes and should pass on the live source before any release that touches shared UI. Preserve essential functional and department-access checks.

- Run `node --test tests/member-migration.test.mjs` for identity migration changes.
- No session so far has held the site passcode or a member PIN, so signed-in production screens have not been verified by an agent. Say so plainly in any report; never claim a live signed-in check that did not happen.

## Traps and boundaries

- Production is https://lv-zion-duties.web.app. Nothing goes live without Anthony's explicit approval of that feature on the preview channel.
- **NEVER deploy `firestore.rules` or `functions/` from `main` or any branch made from it.** See "Where the live app comes from" above. Rules/Functions-only deploys run from the `compact-integration` worktree with `firebase-tools deploy --only firestore:rules` (or `--only functions`).
- The Firebase project is shared. Deploy only explicitly named Hosting, Functions, or Rules targets. Two live functions (`onVercelScheduleWrite`, `worshipVercelReconcile`) belong to another app; never run a bare `firebase deploy` or a bare `--only functions`.
- Always build and release Hosting through `design-gallery/release.mjs` (`--preview`, then `--publish`) so release stamps and compatibility checks remain intact. Follow `docs/PLAYBOOK.md` section 8 and the section 8a maintenance line.
- **The Claude Code auto mode classifier denies production deploys to Claude. Do not work around it.** Give Anthony copy-paste blocks with absolute paths and he runs the release commands himself.
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
