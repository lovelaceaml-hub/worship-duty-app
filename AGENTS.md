# LV Zion Worship Duty

## Direct approvals (2026-11-25)

Treat user-configured procedures below as defaults. Anthony's direct request or simple approval covers the action and its normal steps, including any clear exception. Carry it across turns and handoffs without asking again or requiring a particular phrase or approval page. Prefer focused tests. A direct request or simple approval for a full suite covers that run. Use the actual approval scope and report any tool or access limit that remains.

Live app: https://lv-zion-duties.web.app. Plain browser JavaScript modules
with Firebase Hosting, Firestore and Cloud Functions.

Read `README.md` and `docs/HANDOFF.md` first. The latest bounded performance
review is `docs/PERFORMANCE-REVIEW.md`; its `## Build log` records the change.
There is no active multi-section plan.

## Verification

- `npm run check`: module imports, exports and actions.
- `npm test`: client logic, permissions and source-rules checks.
- `npm run test:browser`: real-browser flows against fake Firebase.
- `npm run build`: stamped Hosting files.
- For backend changes, run `npm run test:functions` and
  `npm_config_cache=/tmp/npm-cache npm run test:rules` as applicable.
- Use fake data for agent walkthroughs. Production member sign-ins and
  changes to real records need Anthony's approval.

## Boundaries

- Keep changes on a feature branch. Merging and production release need
  Anthony's approval. Pushing a code branch automatically publishes a
  temporary Hosting preview, which uses real data: look, do not tap.
- Never run bare `firebase deploy` or `--only functions`. Another app has
  Functions in this project. Follow the README's pinned release commands.
- The Google Sheet is the schedule master. Only the documented server
  write-back path edits it.
- Preserve `song-lib.js` and `song-seed.js` behavior: the external Signal
  ingest depends on them.
- Keep credentials in provider secret stores, never code, logs or docs.
- Member sign-in (Anthony, 2026-11-25): use one shared setup PIN for first
  sign-in. Require each member to choose a personal PIN before using their
  account. Keep the shared value in Firebase Secret Manager.
- Preserve unrelated edits. Data deletion, account changes and deployment
  require explicit approval.
