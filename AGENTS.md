# Repository contract

## Orientation

This is the live LV Zion Worship Duty Firebase PWA at https://lv-zion-duties.web.app. Read `README.md`, `docs/HANDOFF.md`, `docs/PLAYBOOK.md`, and the active plan before changing behavior.

## Active plan and Build log

The active plan is `docs/PLAN-DEPARTMENT-ROSTER-AVAILABILITY.md`. Its `## Build log` is the durable record for the department roster, duty eligibility, and availability work.

## Verification

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
- Preserve the four appearance choices and their top navigation and Appearance controls.
- Do not wipe or reseed the production schedule. Production migrations or record deletion require a dry run and Anthony's explicit approval.
