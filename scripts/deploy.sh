#!/bin/bash
# Deploy the Worship Service app to Firebase Hosting.
#
# Every local file is served with a one-year immutable cache, which is only safe
# because its address carries a release stamp. This script is the thing that
# writes that stamp, so it can never be forgotten: the source files keep the
# placeholder 'DEV', the stamp exists only in the copy that is uploaded, and the
# working tree is restored afterwards even if the deploy fails.
#
#   bash scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
FILES=(index.html app.js sw.js)
STAMP="$(date -u +%Y%m%d%H%M%S)"

BACKUP="$(mktemp -d)"
restore() {
  for f in "${FILES[@]}"; do
    [ -f "$BACKUP/$(basename "$f")" ] && cp "$BACKUP/$(basename "$f")" "$ROOT/$f"
  done
  rm -rf "$BACKUP"
}
trap restore EXIT

for f in "${FILES[@]}"; do cp "$ROOT/$f" "$BACKUP/$(basename "$f")"; done

echo "Release stamp: $STAMP"
# ?v=DEV -> ?v=<stamp> everywhere it appears in the shell and the app
sed -i '' -E "s/\?v=[A-Za-z0-9]+/?v=$STAMP/g" index.html app.js
# the service worker's cache name
sed -i '' -E "s/^const RELEASE = '[A-Za-z0-9]+';/const RELEASE = '$STAMP';/" sw.js

# Every stamp must have moved off the placeholder, or members get a stale mix.
if grep -q "v=DEV" index.html app.js || grep -q "RELEASE = 'DEV'" sw.js; then
  echo "ERROR: some files still carry the DEV placeholder. Nothing was deployed." >&2
  exit 1
fi

node --check app.js
node --check sw.js

# The npx cache override is required on this Mac (see the anthony-mac-environment notes).
npm_config_cache=/tmp/npm-cache npx -y firebase-tools@latest deploy --only hosting

echo
echo "Deployed release $STAMP to https://lv-zion-duties.web.app"
echo "Working tree restored to the DEV placeholder."
