# Firestore emulator setlist baseline

This check evaluated the actual `createSetlistIfAbsent` function from the selected source root against the explicit fictional emulator project and loopback Firestore host supplied through environment variables. It does not start Functions emulation.

| Scenario | Result | Evidence |
|---|---|---|
| Existing setlist transaction | passed | The actual function preserved existing songs and issued no transaction set. |
| Missing setlist transaction | passed | The actual function created a missing fictional setlist from the latest in-memory state and cleared its pending promise. |

Timings are local emulator write and read measurements, not production performance.
