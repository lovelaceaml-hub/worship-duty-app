---
lane: S5A
title: Documentation
state: reviewed
model: Sonnet 5 (writer), Haiku 4.5 (review, Explore agent, read-only)
runner: Claude
worktree: /Users/anthony/Projects/worship-duty-app-worktrees/compact-docs (branch codex/compact-docs)
review: Haiku 4.5, fresh, read-only, one round, no material findings
depends_on: S1 (design approval), S2 (shared runtime lane record), S3 (server workflows lane record)
updated: 2026-09-17
---

# S5A: Documentation

## Work order

Bring the human-facing documentation current and accurate against what has
verifiably shipped for the compact-phone refactor plan (Sections 2 and 3,
reviewed but not merged/released) versus what is still planned (Section 4,
not yet built). Update docs/PLAYBOOK.md and docs/USER-MANUAL.md to describe
the live app's actual current behavior while accurately noting the refactor's
in-progress status. Resolve docs/COMPACT-DESIGN-HANDOFF.md. Exclude
docs/PLAN-COMPACT-PHONE-REFACTOR.md, its Build log, docs/runs/**, index files
(docs/FEATURE-MAP.json, docs/CODE-INDEX.md, owned by Section 5B), and Astra's
design artifacts under docs/design/**. No deploys, no code changes, no new
tests.

## What was found already in the worktree

Real uncommitted prior work from an earlier session (~2026-09-15): edits to
docs/PLAYBOOK.md and docs/USER-MANUAL.md, and a new untracked
docs/COMPACT-DESIGN-HANDOFF.md. That prior work correctly converted
docs/USER-MANUAL.md from a symlink alias of docs/USER-GUIDE.md into a real,
independent document describing the live member-account-PIN authentication
and department-roster system (verified accurate against the current
`app.js` and `firestore.rules` in this worktree: `signInWithCustomToken`,
`mustChangePin`, `sitePinHash` vs. per-account PIN, `createDepartmentProfile`,
`departmentProfileKeysSafe`, etc.). That prior work predated Sections 2 and 3
of the plan landing, so its "Current status" notes in PLAYBOOK.md and
USER-MANUAL.md said prototype approval and the integrated preview were "still
pending" without distinguishing that Section 1 (design) had since been
approved and Sections 2/3 (runtime, server) had since been built and
reviewed, just not merged or released.

The lane records for S1/S2/S3 and the S2/S3 interface rulings were not
present with real content in this worktree (only empty `state: planned`
templates from the coordinator's initial scaffold). Found the actual, current
records with real content by checking sibling worktrees:
`compact-server-claude` (branch `claude/compact-server`) has the true,
current S1/S2/S3 lane records and all three interface-ruling decision files;
`compact-runtime` also carries the true S1/S2 records. The stale
`/root/compact_server`-style S3 record mentioned in the task briefing was
found in the main checkout and in `compact-runtime`'s copy; disregarded per
instructions and cross-checked against `compact-server-claude`'s
up-to-date version instead.

## Result

Commit `f1d5918` on `codex/compact-docs`:

- **docs/PLAYBOOK.md**: updated "Last updated" date and rewrote the "Current
  status" note to accurately state Section 1 is finished/approved, Sections 2
  and 3 are built and reviewed on separate branches but not merged or
  deployed, Section 4 is still being built, and production is unchanged. Left
  the rest of the prior session's PLAYBOOK.md edits in place after spot-
  verifying several factual claims (PIN auth flow, department roster
  add-by-UID, sheet-sync blank-cell-clears-duty semantics) against the actual
  `app.js` source; all checked out accurate for the live app.
- **docs/USER-MANUAL.md**: rewrote the "Appearance and current refactor"
  section with the same accurate Section 1/2/3/4 status distinction, and
  named the planned bottom-navigation/compact-tabs behavior explicitly as not
  live yet.
- **docs/COMPACT-DESIGN-HANDOFF.md**: marked historical/superseded. Added a
  status block explaining it recorded the 2026-09-15 mid-flight design state
  before Astra's prototype work finished, pointed readers to the current S1
  lane record and to `docs/design/prototype/compact-phone/` (Astra-owned,
  not edited) as the current design source, and annotated the
  "why runtime work is still pending" / "continuation boundary" sections to
  note Sections 2 and 3 have since happened, running on Claude/Sonnet 5
  rather than the originally planned Luna, per their actual lane records.
  Kept the original evidence/reproduction content intact as historical
  record per the plan's "mark superseded plans historical, do not create
  redundant documents" instruction, rather than deleting it or writing a new
  document.
- **docs/USER-GUIDE.md** (not explicitly named in the work order, but in
  scope as human-facing documentation): added a historical/superseded banner.
  This file still described the retired single-site-passcode/editor-passcode
  model with no member accounts, which directly contradicts the live
  member-PIN authentication documented in USER-MANUAL.md and confirmed live
  in `app.js`. Left the rest of its body untouched as a historical record and
  pointed readers to USER-MANUAL.md.
- Did not touch README.md or docs/HANDOFF.md: per the plan (Section 4 table),
  the controller owns README, HANDOFF, AGENTS, the plan, and shared indexes,
  and the work order's exclusion list did not name them for this lane either.
- Followed the no-em-dash style rule throughout; verified no em/en dashes
  were introduced in any added lines (checked by the review agent, see
  below).

## Review

Haiku 4.5, fresh, read-only, Explore agent, one round. Asked it to check the
full diff at commit `f1d5918` for: (1) any claim describing unreleased
compact-phone-refactor UI as already live, (2) broken internal markdown
links, (3) leftover em/en dashes in newly added lines. Result: no material
issues found in any of the three categories. No correction needed.

## Open questions left for Anthony

- The Prism/Aurora dark-mode and motion-toggle question remains open per the
  S2-LAYOUT-INTERFACE.md ruling (section 9): the approved Weekbook prototype
  has no dark palette or motion control for those appearances, so Section 2
  did not invent one. Documentation was not the place to resolve this; noted
  here only so it stays visible.
- docs/USER-GUIDE.md is now redundant with docs/USER-MANUAL.md. This lane
  marked it historical rather than deleting it or updating README's quick
  links (README is controller-owned). The controller may want to either
  retire the README link to USER-GUIDE.md or fold its still-useful "for the
  scheduler" walkthroughs into USER-MANUAL.md in a later pass.
