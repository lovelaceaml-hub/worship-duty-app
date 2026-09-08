# Hosting decision

## Decision

Keep the selected prototype local and loopback only during this review capsule.

## Runtime

- URL: http://127.0.0.1:8099/open-bulletin/index.html
- Server: existing local Python server owned by the controller
- Prototype root: /Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/
- Canonical review sizes: 390 by 844 and 1440 by 1000

## Reason

Anthony asked for a fictional local prototype before production implementation. The page has no Firebase, real member data, spreadsheet connection, external asset, remote font, or publish target. A loopback server keeps the review reversible and keeps fictional state in memory.

## Release boundary

This artifact is not deployed, published, merged, or connected to production. Full prototype approval and the later production implementation decision remain pending.
