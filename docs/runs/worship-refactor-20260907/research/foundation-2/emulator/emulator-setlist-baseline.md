# Firestore emulator setlist baseline

Baseline reference commit: `5beec15d9a9299bed2c51a91c33f157fb769cd79`.

Source root: `/Users/anthony/Projects/worship-duty-app`. Source digest: `1c84ad4097fc0b4e1bab408b767bfba97ab58c312b51ac0dcee2953f2cf93072` over `index.html`, `app.js`, `song-app.js`, `song-app.css`, `song-lib.js`, `sw.js`, `manifest.json`. Runtime: `v24.14.1` on `darwin/arm64`.

This check evaluated the actual `createSetlistIfAbsent` function from the selected source root against the explicit fictional emulator project and loopback Firestore host supplied through environment variables. It does not start Functions emulation.

| Scenario | Result | Evidence |
|---|---|---|
| Existing setlist transaction | passed | The actual function preserved existing songs and issued no transaction set. |
| Missing setlist transaction | passed | The actual function created a missing fictional setlist from the latest in-memory state and cleared its pending promise. |

Timings are local emulator write and read measurements, not production performance.
