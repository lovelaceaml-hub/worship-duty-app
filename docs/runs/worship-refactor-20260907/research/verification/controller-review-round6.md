# Verification native Sol review, round 6

Result: CHANGES_REQUIRED. Anthony authorized continued correction with "Just move on" on 8 September 2026. Continue fixing accepted findings without re-asking or waiving the gate.

Full review comments:

- [P2] Fail on newly blocked external requests — /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs:773-774
  When the tested source introduces a new external fetch, script, image, or navigation, this route records it only in `blocked` or `fetchGuard`; nothing ever appends to `external.unexpected`. The final zero-unexpected assertion therefore still passes and the evidence falsely reports zero unexpected requests. Explicit fixture traffic should be allowlisted, with every other attempted origin classified as unexpected.

- [P2] Fail the run when browser errors are captured — /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs:780-785
  When application code emits a console error or uncaught page error after the required UI has rendered, these handlers merely append it to evidence and no later assertion rejects it. Such a runtime regression can therefore produce a `passed` result despite captured browser errors.

- [P2] Invalidate prior evidence before starting a rerun — /Users/anthony/Projects/worship-refactor-worktrees/verification/tests/fixture-baseline.mjs:1423-1426
  When an existing `WORSHIP_EVIDENCE_ROOT` is reused and a later assertion fails, screenshots may already have been overwritten while `fixture-baseline.json` and its Markdown receipt remain from the previous successful run because they are written only at completion. This leaves stale green evidence after a failed verification; stage each run separately and replace the evidence atomically, or write an explicit failure receipt.
