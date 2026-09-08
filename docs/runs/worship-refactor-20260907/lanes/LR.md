---
lane: LR
title: Release machinery
state: deployed
model: gpt-5.6-luna
runner: Codex
worktree: /Users/anthony/Projects/worship-refactor-worktrees/release
review: Sol-pass
depends_on: none
updated: 2026-09-08T01:47Z
---

# LR: Release machinery

## Work order

Stage an allowlisted Hosting artifact without mutating source files. Stamp all
local runtime references and the service worker release value, validate syntax,
JSON, immutable cache coverage, the ICS rewrite, and the lv-zion-duties target.
Provide dry-run behavior and tests for source preservation, missing references,
syntax errors, aborts, and src module coverage. Do not deploy or mutate Git.

## Result

Implementation is ready for controller review. `scripts/release.mjs` stages
only the fixed top-level runtime allowlist plus src JS, MJS, and CSS modules in
an owner-only temporary directory. It rewrites local references in staged text,
stamps the service worker release token, validates syntax and JSON, enforces
immutable cache headers, preserves the ICS rewrite, and restricts deployment
arguments to Hosting site lv-zion-duties. `scripts/deploy.sh` is a thin wrapper.

The release path now rejects missing option values before staging, leaves
external URL query versions unchanged, and clears generated children from a
caller supplied empty output directory after a failed attempt so a corrected
retry can reuse that directory. The source tree remains unchanged during
successful, dry-run, aborted, and failed staging.

## Verification

- `node --test tests/release/**`: 8 passed, 0 failed.
- `bash -n scripts/deploy.sh && node --check scripts/release.mjs && node --check sw.js && node --check tests/release/staging.test.mjs`: passed.
- `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8')); console.log('firebase.json valid')"`: passed.
- `bash scripts/deploy.sh --dry-run --stamp 20990102030407 --output-dir "$stage_dir"` with an isolated `/private/tmp/worship-release-dry-run-final.XXXXXX` directory: passed, 11 runtime artifacts, Hosting target verified, no Firebase command started.
- The same isolated dry-run with source hashes captured before and after: hashes unchanged.

## Review

Sol review round 1 identified three findings. All three are addressed in the
current diff and the focused suite passes. Controller review is pending. No
deploy, publish, merge, or Git mutation was performed.

## Cross-lane interface

The staged validator intentionally accepts an ASSET_V suffix only when the
same runtime file contains the exact ASSET_V declaration that is rewritten to
the release stamp. The Foundation composition root must retain that literal
declaration until integration. Every src runtime module requires matching
immutable cache coverage in firebase.json. Test and harness files remain
excluded from the staged artifact.
