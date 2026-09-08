# Worship Service project contract

Read docs/PLAN-REFACTOR-REDESIGN.md (including Build log), docs/runs/worship-refactor-20260907/INDEX.md, and docs/HANDOFF.md first. Active work is the approved parallel refactor and redesign. Canonical app: https://lv-zion-duties.web.app. Closest technical truth is current source; older handoff sections may be stale.

One writer per isolated worktree. Controller owns Git, integration, release, shared records and completion. Never change another lane's files or revert unrelated edits. No em dash or en dash in new text.

Preserve Firebase collection shapes/IDs, existing passcodes/name selection, one-way Sheet merge semantics, calendar URLs, notifications, local storage keys, and full-snapshot ownership. Do not change firestore.rules. Preserve song-lib.js/song-seed.js paths and behavior because an external importer loads them. Do not read or edit that external repository or other church apps.

Production UI requires Anthony's selected direction and approved committed prototype. Foundation extraction must preserve existing rendered output. Use fictional fixtures; never run current browser QA against production or permit tests to sync/seed production. Do not log names, credentials, passcode hashes, or tokens.

Verification currently includes node --check on changed scripts, node --test functions/test/*.test.js, and the fixture-isolated Playwright suite developed by lane V. Existing tests/ui-qa.mjs is unsafe to run until isolation is in place. Deploy Hosting only through scripts/deploy.sh. Never deploy functions unless deliberately changed, contract-verified, and reviewed; never use a default full Firebase deploy. Worker agents do not deploy.

Source and sanitized docs use the existing private GitHub repository after private visibility is verified. New design artifacts use fictional content only. Never publish source seeds, app configuration records, credentials, or member screenshots in the lane board. Review and backup gates must pass before calling work complete.
