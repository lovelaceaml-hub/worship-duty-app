# Initial baseline checks

- Source baseline: 885b0bb0ffb80802a5e6428edcea89ad66c428a7.
- Tracked working tree was clean before work started.
- Root Node version: v24.18.0; Python 3.13.12.
- Existing function tests: node --test functions/test/*.test.js, 2 passed, 0 failed.
- Existing browser test reads production-connected configuration and seeded people. It was inspected but not executed; Lane V owns replacing those dependencies with fictional fixtures and network isolation.
- Existing remote visibility: verified private through gh repo view on 2026-09-07; initial plan branch pushed successfully.
- Installed Codex CLI provides native codex review. Its launcher default model is Terra, so review invocations must explicitly select the plan's Sol model and effort. No review has run yet.
- Design tooling correction: local HTML/CSS, no Stitch, per Anthony.

No production data was queried or mutated by these baseline checks.
