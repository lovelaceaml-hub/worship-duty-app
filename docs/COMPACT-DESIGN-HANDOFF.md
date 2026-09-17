# Compact phone design handoff (historical)

Status: Historical. Superseded by completion. This document recorded the
mid-flight state of the phone prototype work on 2026-09-15, while Astra was
still building the four appearance translations and role-view coverage. That
work has since finished: the Section 1 lane record
(`docs/runs/compact-phone-refactor/lanes/S1.md`) reports Astra High completed
all four explicit Weekbook appearances and role-screen families, the Gemini
review returned no material findings, and Anthony received the design
handoff. Section 2 (shared runtime foundation) and Section 3 (server
workflows) have since been built and reviewed against that approved design,
each on its own branch, not yet merged or released; see their lane records
(`docs/runs/compact-phone-refactor/lanes/S2.md`, `.../S3.md`) and the binding
interface rulings in `docs/runs/compact-phone-refactor/decisions/`.

The design artifacts themselves are owned by the design lane, not this
document: for the current authoritative design source, see
`docs/design/prototype/compact-phone/` and its `HANDOFF-MAP.md` (paths below
point at the integration repository worktree, not this one). This file is
kept only as a historical record of the mid-flight evidence and reproduction
steps below; do not treat its "still being built" framing as current.

Last updated: 2026-09-15 (superseded 2026-09-17; see status above).

## Approved direction and boundary (as recorded 2026-09-15)

Anthony approved the Weekbook structure and asked this task to finish the
design work and create this handoff. The selected schedule uses a calendar
month grouped into weeks. Month navigation sits below search and above the
service cards. There is no numeric schedule pagination footer.

The finished design work must preserve Original, Prism, Navy & Cream, and
Aurora as four distinct layouts with shared screen data and actions. Main
navigation floats above the bottom edge, workspace sections use compact
secondary tabs, and Appearance plus role workspace access remain available.

This handoff records design evidence only. It does not authorize runtime
implementation, production writes, Hosting release, or a claim that all four
layouts and role views are complete.

## Current data evidence

The first preview used the bundled historical seed, which contains only 74
May to July 2026 services. A read-only query on September 15, 2026 verified
180 current services through December:

| Month | Services |
|---|---:|
| May | 41 |
| June | 17 |
| July | 16 |
| August | 19 |
| September | 42 |
| October | 21 |
| November | 12 |
| December | 12 |

The corrected minimized preview snapshot contains service dates, labels,
worship names, and times only. It is stored outside Git. It contains no member
names or assignments because narrowed September and October assignment
retention is waiting for Anthony's approval. Do not display missing assignment
data as vacancies, zero conflicts, or invented members. Requests, availability,
invitations, song plans, and history are also outside this preview.

Production is unchanged. The seed discrepancy was a preview source error, not
evidence that October records disappeared.

See the [preview source correction](/Users/anthony/Projects/worship-duty-app/docs/runs/compact-phone-refactor/decisions/PREVIEW-DATA-SOURCE.md)
for the read-only evidence and the [approved implementation plan](/Users/anthony/Projects/worship-duty-app/docs/PLAN-COMPACT-PHONE-REFACTOR.md)
for the runtime boundary.

## Design artifacts

The current source artifacts are in the integration repository:

- [Direction comparison](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/index.html)
- [Weekbook schedule](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/weekbook.html#schedule)
- [Weekbook service editor](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/weekbook.html#service/fixture-1)
- [Service Ledger comparison candidate](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/ledger.html#schedule)
- [Prototype README](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/README.md)

Weekbook is the selected structure. Service Ledger remains comparison evidence,
not the selected direction. The current artifacts use representative local
fixtures and a representative Navy & Cream treatment while the four actual
appearance translations are completed. They do not prove live role enforcement,
server acknowledgement, availability validation, invitations, notifications,
song journeys, or production saves.

## Reproduce the metadata-only preview

Run these commands from the integration source. They use the existing local
Firebase credentials to refresh a minimized snapshot and serve only the named
design assets and snapshot on localhost:

```sh
node /Users/anthony/Projects/worship-duty-app/scripts/refresh-compact-preview.cjs /private/tmp/worship-compact-current-refresh.js
python3 /Users/anthony/Projects/worship-duty-app/scripts/serve-compact-designs.py --root /Users/anthony/Projects/worship-duty-app --data /private/tmp/worship-compact-current-refresh.js --port 8099
```

Open [Weekbook schedule](http://127.0.0.1:8099/docs/design/prototype/compact-phone/weekbook.html#schedule)
after the server starts. Stop any existing process on port 8099 before starting
the replacement. The preview server does not expose the repository and does not
write production data. Never place the snapshot in Git or include real member
records in a review packet.

## Why the runtime work was still pending (as of 2026-09-15)

The current production gallery combines prototype extraction, source-text
rewriting, and appearance-specific rendering paths. The approved runtime plan
replaces that structure with shared behavior and explicit layout renderers.
That replacement had not started from this handoff as of the date above, and
the preview artifacts were not runtime code. It has since started: Section 2
(shared runtime foundation) built the shared shell, navigation, save-state
controller, and four explicit layout renderers against the layout interface
ruling, and Section 3 (server workflows) built the version-aware save and
Needs-attention server handlers those renderers call. Both are reviewed on
their own branches and not yet merged into `codex/compact-phone-refactor` or
released; see their lane records for current detail.

## Continuation boundary (as recorded 2026-09-15; see status note above for what has since happened)

- Baseline: `86a476f6d80b5a7bbbb09f8c0e0c8a5721fff427`.
- Integration branch: `codex/compact-phone-refactor`.
- Early checkpoint: `d2cb0b8`, containing the reviewed initial directions,
  baseline documentation and indexing, and the standalone
  `functions/compact-membership.js` module. That module is not exported or
  deployed.
- Astra High must finish Original, Prism, Navy & Cream, and Aurora coverage
  across the required role views before prototype completion can be claimed.
  (Done; see the status note above.)
- Gemini 3.8 Flash Low performs the bounded design review after those artifacts
  exist. Anthony approval remains the gate before runtime UI work.
  (Done; see the status note above.)
- After approval, Luna High owns runtime implementation, Gemini Low reviews
  bounded units, and one Opus High review covers the integrated result. Sol
  applies any required corrections and controls release. (Sections 2 and 3
  ran on Claude/Sonnet 5 rather than Luna; see their lane records for the
  actual model and review used. The integrated Opus review and release are
  still ahead, pending Section 4.)

Read this handoff, the [approved plan](/Users/anthony/Projects/worship-duty-app/docs/PLAN-COMPACT-PHONE-REFACTOR.md),
its Build log, the design placement map, current Git status, and the recorded
Gemini design review before continuing. Resume only the implementation scope
Anthony authorizes. Do not treat this design preview as a completed runtime
refactor or release.
