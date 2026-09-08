#!/bin/bash
# Stage and deploy the Worship Service Hosting artifact.
#
# The release implementation writes to an owner-only temporary directory. It
# never edits source files, even when validation or Firebase fails.
#
#   bash scripts/deploy.sh
#   bash scripts/deploy.sh --dry-run
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/release.mjs" "$@"
