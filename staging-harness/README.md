# Staging harness (one-time, not a test suite)

This folder is a one-time staging harness for the compact-phone Firebase emulator
checks approved by Anthony on 2026-09-17, per `docs/PLAN-COMPACT-STAGING.md`
section 2. It is **not** part of the project's automated test suite, not a
build/release gate, and not referenced by `AGENTS.md` verification steps. It
exists only so the emulator evidence in
`docs/runs/compact-phone-refactor/reviews/staging-emulator.md` can be re-run if
needed.

Excluded from Hosting via `firebase.json`'s `hosting.ignore`.

Everything here talks only to local Firebase emulators (`demo-lv-zion-duties`
project id, which Firebase guarantees can never reach production). Every
account, member name, and service in the seed data is fictional. No real PIN
or password is used anywhere; sessions are authenticated by minting Auth
emulator custom claims directly through the Admin SDK.

## Files

- `seed.mjs` — wipes and reseeds the Firestore emulator with fictional
  accounts, department profiles, schedule services, and a song catalogue, and
  creates matching Auth emulator users with custom claims.
- `lib.mjs` — shared helpers: emulator connection, actor construction
  (mirrors `functions/index.js`'s `callableActor`), and small assertion
  helpers.
- `checks.mjs` — runs every scripted check against the emulated callables and
  the Firestore emulator's rules engine, and prints a pass/fail report.

## Rerunning

```sh
export JAVA_HOME=/Users/anthony/tools/jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
cd /Users/anthony/Projects/worship-duty-app-worktrees/compact-integration
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest emulators:start \
  --only auth,firestore --project demo-lv-zion-duties &
sleep 8
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  node staging-harness/seed.mjs
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  node staging-harness/checks.mjs
# then stop the emulator process (kill the backgrounded firebase job)
```
