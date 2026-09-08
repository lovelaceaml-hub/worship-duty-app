# Firestore emulator setlist baseline

Baseline reference commit: `5beec15d9a9299bed2c51a91c33f157fb769cd79`.

Source root: `/Users/anthony/Projects/worship-refactor-worktrees/verification`. Source digest: `a3e51cf1a53229248a7bc13a1b3d1343ed63ac7d6aba031c01fa43eb0366e0ee` over `index.html`, `app.js`, `song-app.js`, `song-app.css`, `song-lib.js`, `sw.js`, `manifest.json`. Runtime: `v24.14.1` on `darwin/arm64`.

This check evaluated the actual `createSetlistIfAbsent` function from the selected source root against the explicit fictional emulator project and loopback Firestore host supplied through environment variables. It does not start Functions emulation.

| Scenario | Result | Evidence |
|---|---|---|
| Existing setlist transaction | passed | The actual function preserved existing songs and issued no transaction set. |
| Missing setlist transaction | passed | The actual function created a missing fictional setlist from the latest in-memory state and cleared its pending promise. |

Timings are local emulator write and read measurements, not production performance.
