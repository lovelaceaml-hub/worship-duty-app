---
lane: LDP
title: Local read-only preview server
state: merged
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/real-preview-server
review: Sol-pass
depends_on: LD
updated: 2026-09-08T16:32Z
---

# Local preview server sublane

Model: executor_luna, max. Native Sol high review.

Exclusive ownership: scripts/real-preview.cjs and tests/real-preview.test.cjs in the named worktree. Separate Design writer owns browser prototype files. Root owns integration, records, server operation and backup.

Implement a loopback-only GET server and allowlisted read-only Firestore adapter, with fictional tests. No member data in source, records, logs, screenshots or review evidence. User authorized local real-data display on 8 September 2026. No production writes or deployments.
