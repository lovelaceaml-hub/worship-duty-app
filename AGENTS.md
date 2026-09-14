# Repository contract

## Orientation

This is the live LV Zion Worship Duty Firebase PWA at https://lv-zion-duties.web.app. Read `README.md`, `docs/HANDOFF.md`, `docs/PLAYBOOK.md`, and the active plan before changing behavior.

## Active plan and Build log

The active plan is `docs/PLAN-AUTH-DEPARTMENT-NOTIFICATIONS-PRESIDER.md`. Its `## Build log` is the authoritative implementation record.

## Verification

Run the focused Node behavior tests for changed modules, `npm run test:ui`, `npm --prefix functions test`, the design-gallery test when generated UI changes, and one representative phone-size browser smoke check. Keep checks proportional and do not deploy during this plan.

## Traps and boundaries

- Production is https://lv-zion-duties.web.app. Do not deploy until the feature branch has passed the requested completion review.
- Always publish Hosting with `bash scripts/deploy.sh`; deploy functions and Firestore rules only when intentionally changed and reviewed.
- The Google Sheet is an import source. Runtime schedule data lives in Firestore, and no Firestore-to-Sheet write path is allowed.
- `song-lib.js` behavior is consumed by the local Signal ingest service. Preserve its public behavior.
- Never store PINs, credentials, member personal data, or notification tokens in Git, logs, screenshots, or docs.
- Preserve the site-wide lock unless an explicitly reviewed migration replaces it.
- Do not wipe or reseed the production schedule. Production migrations must support dry-run and be idempotent.
