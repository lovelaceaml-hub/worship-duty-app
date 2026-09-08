# Firestore emulator setlist baseline

Baseline reference commit: `5beec15d9a9299bed2c51a91c33f157fb769cd79`.

Source root: `/Users/anthony/Projects/worship-duty-app`. Source digest: `37af96cb1f58d3b5e061f255910269bb0ff4a896873b204703ca52215de3f7f5` using `sha256-v2:path-null-byte-and-file-bytes;order=lexicographic-relative-path` with `lexicographic relative paths` over `app.js`, `index.html`, `manifest.json`, `song-app.css`, `song-app.js`, `song-lib.js`, `src/core/constants.js`, `src/core/state.js`, `src/domain/coordinator.js`, `src/domain/member.js`, `src/domain/schedule.js`, `src/domain/sheet.js`, `src/services/firebase.js`, `src/services/storage.js`, `src/services/subscriptions.js`, `sw.js`. Runtime: `v24.14.1` on `darwin/arm64`.

This check evaluated the actual `createSetlistIfAbsent` function from the selected source root against the explicit fictional emulator project and loopback Firestore host supplied through environment variables. It ran two concurrent bounded runs with unique document suffixes and does not start Functions emulation.

| Scenario | Result | Evidence |
|---|---|---|
| alpha existing setlist transaction | passed | The actual function preserved songs at `setlists/fixture-setlist-fixture-run-93924-af47f546-a72b-4c55-a228-b694aeeb2564-alpha-existing` and issued no transaction set. |
| alpha missing setlist transaction | passed | The actual function created `setlists/fixture-setlist-fixture-run-93924-af47f546-a72b-4c55-a228-b694aeeb2564-alpha-created` from latest in-memory songs and cleared its pending promise. |
| beta existing setlist transaction | passed | The actual function preserved songs at `setlists/fixture-setlist-fixture-run-93924-af47f546-a72b-4c55-a228-b694aeeb2564-beta-existing` and issued no transaction set. |
| beta missing setlist transaction | passed | The actual function created `setlists/fixture-setlist-fixture-run-93924-af47f546-a72b-4c55-a228-b694aeeb2564-beta-created` from latest in-memory songs and cleared its pending promise. |

Timings are local emulator write and read measurements, not production performance.
