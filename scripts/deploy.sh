#!/bin/bash
# Compatibility entry point. All Hosting releases must compile and verify the
# four-design gallery before Firebase receives any files.
set -euo pipefail

cd "$(dirname "$0")/.."
exec node design-gallery/release.mjs --publish
