# Repository contract

## Orientation

This is the live LV Zion Worship Duty Firebase PWA at https://lv-zion-duties.web.app. Read `README.md`, `docs/HANDOFF.md`, `docs/PLAYBOOK.md`, and the active plan before changing behavior.

## Active plan and Build log

The active plan is `docs/PLAN-2026-09-22-APP-JS-SPLIT.md`: split `app.js` into modules with zero behavior change. Its `## Build log` is the durable record. Mode is Steps, one section per fresh chat.

`docs/PLAN-COMPACT-PHONE-REFACTOR.md` is **historical**: Anthony retired it on 2026-09-22. Its unmerged work is preserved on `claude/compact-runtime` and `claude/compact-server` and no branch is deleted. Do not resume it, and do not treat its floating bottom bar, compact tabs or role start screens as requirements. The department roster plan is also historical.

## Verification

For the active app.js split plan, the safety net in its Section 1 is the verification: the portable source-text assertions, `scripts/check-app-split.mjs`, the existing four-appearance browser suite, and the new pixel parity run. The retired compact-phone plan's no-new-tests directive does not apply to it. Preserve essential functional and department-access checks.

- Run `node --test tests/member-migration.test.mjs` for identity migration changes.
- Run `node design-gallery/test.mjs` outside the macOS sandbox for shared UI and all four appearance modes.
- Run focused permission and department tests named by the active plan.
- Verify the real live member, department leader, and administrator journeys before completion.

## Traps and boundaries

- Production is https://lv-zion-duties.web.app. Do not deploy a feature until its branch has passed the requested completion review.
- The Firebase project is shared. Deploy only explicitly named Hosting, Functions, or Rules targets.
- Always build and release Hosting through `design-gallery/release.mjs` so release stamps and compatibility checks remain intact.
- Never put passcodes, tokens, member PINs, or production records in Git, test fixtures, screenshots, or review packets.
- The Google Sheet is an import source. Runtime schedule data lives in Firestore, and no Firestore-to-Sheet write path is allowed. Canonical identity and department eligibility rules must apply to browser and scheduled imports.
- `song-lib.js` behavior is consumed by the local Signal ingest service. Preserve its public behavior.
- Preserve the site-wide lock unless an explicitly reviewed migration replaces it.
- Preserve the four distinct appearance layouts and Appearance controls exactly as they are live. The retired compact-phone plan's floating bottom bar and compact secondary tabs are **not** a requirement; the live app at https://lv-zion-duties.web.app is the visual authority and the split must come out pixel-identical to it.
- Keep Original, Prism, Navy & Cream, Aurora, and maintenance on one Pacific-time current-or-next Schedule selector. Test a same-day 5:00 AM and 7:30 PM pair at 7:20 PM and 9:06 PM Pacific before any Hosting release. Preserve an explicitly selected past service while advancing the automatic default.
- Do not wipe or reseed the production schedule. Production migrations or record deletion require a dry run and Anthony's explicit approval.

## Preview fidelity

Anthony requires previews and prototypes to use real app data and wording. Reuse existing approved app data sources rather than inventing service patterns, duties, names, or labels. Verify the actual current app source and date coverage before presenting designs. Historical seed data is not an acceptable substitute for current data unless Anthony explicitly requests historical content. Identify historical versus current data accurately. Reference existing source data without copying personal records into new fixtures or review packets. Prototype saves remain isolated from production.
