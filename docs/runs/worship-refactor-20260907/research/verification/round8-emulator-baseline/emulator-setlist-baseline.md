# Firestore emulator setlist baseline

Baseline reference commit: `5beec15d9a9299bed2c51a91c33f157fb769cd79`.

Source root: `/Users/anthony/Projects/worship-refactor-worktrees/verification`. Source digest: `ec7ff363e5e142ad9c64f81c8d09c0ed485a12a5db6ac85a994cf33cdbdeed62` using `sha256-v2:path-null-byte-and-file-bytes;order=lexicographic-relative-path` with `lexicographic relative paths` over `app.js`, `index.html`, `manifest.json`, `song-app.css`, `song-app.js`, `song-lib.js`, `sw.js`. Runtime: `v24.14.1` on `darwin/arm64`.

This check evaluated the actual `createSetlistIfAbsent` function from the selected source root against the explicit fictional emulator project and loopback Firestore host supplied through environment variables. It ran two concurrent bounded runs with unique document suffixes and does not start Functions emulation.

| Scenario | Result | Evidence |
|---|---|---|
| alpha existing setlist transaction | passed | The actual function preserved songs at `setlists/fixture-setlist-fixture-run-94179-f4eb5ca5-c3bb-4b64-aa06-dd11f0537c4c-alpha-existing` and issued no transaction set. |
| alpha missing setlist transaction | passed | The actual function created `setlists/fixture-setlist-fixture-run-94179-f4eb5ca5-c3bb-4b64-aa06-dd11f0537c4c-alpha-created` from latest in-memory songs and cleared its pending promise. |
| beta existing setlist transaction | passed | The actual function preserved songs at `setlists/fixture-setlist-fixture-run-94179-f4eb5ca5-c3bb-4b64-aa06-dd11f0537c4c-beta-existing` and issued no transaction set. |
| beta missing setlist transaction | passed | The actual function created `setlists/fixture-setlist-fixture-run-94179-f4eb5ca5-c3bb-4b64-aa06-dd11f0537c4c-beta-created` from latest in-memory songs and cleared its pending promise. |

Timings are local emulator write and read measurements, not production performance.
