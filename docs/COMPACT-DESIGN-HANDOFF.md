# Compact phone design handoff

Status: Four clickable Weekbook appearances and role-screen designs are complete. Gemini Low review returned no material findings. Brief phone walkthroughs passed. Runtime implementation and release remain stopped at the handoff boundary. Data-dependent limitations below remain explicit.

Last updated: 2026-09-15. Status update added 2026-09-17 (see below).

## Status update, 2026-09-17

The handoff boundary described below has since been lifted by Anthony. The
design work this document records is unchanged and still authoritative, but
the "runtime implementation has not started" framing further down is
historical. Since 2026-09-15: Section 2 (shared runtime foundation), Section 3
(server workflows), Section 4 (role screens), Section 5A (documentation) and
Section 5B (indexing) were each built and reviewed on their own branches and
merged into the integration branch `claude/compact-integration`. Nothing has
been deployed, and production still runs its unchanged live behavior. For the
current state see `docs/PLAN-COMPACT-PHONE-REFACTOR.md` and its Build log, the
lane records in `docs/runs/compact-phone-refactor/lanes/`, and the binding
interface rulings in `docs/runs/compact-phone-refactor/decisions/`. The design
artifacts themselves remain owned by the design lane in
`docs/design/prototype/compact-phone/` and its `HANDOFF-MAP.md`.

## Approved direction and boundary

Anthony approved the Weekbook structure and asked this task to finish the
design work and create this handoff. The selected schedule uses a calendar
month grouped into weeks. Month navigation sits below search and above the
service cards. There is no numeric schedule pagination footer.

The finished design work must preserve Original, Prism, Navy & Cream, and
Aurora as four distinct layouts with shared screen data and actions. Main
navigation floats above the bottom edge, workspace sections use compact
secondary tabs, and Appearance plus role workspace access remain available.

This handoff records design evidence only. It does not authorize runtime
implementation, production writes, Hosting release, or a claim that production role workflows are complete.

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
worship names, times, and 537 entries from the same public song catalog used by the app. It is stored outside Git. It contains no member
names or assignments because narrowed September and October assignment
retention is waiting for Anthony's approval. Do not display missing assignment
data as vacancies, zero conflicts, or invented members. Current request, availability, invitation, song-plan, and history records are not loaded; their screen designs must label that limit.

Production is unchanged. The seed discrepancy was a preview source error, not
evidence that October records disappeared.

See the [preview source correction](/Users/anthony/Projects/worship-duty-app/docs/runs/compact-phone-refactor/decisions/PREVIEW-DATA-SOURCE.md)
for the read-only evidence and the [approved implementation plan](/Users/anthony/Projects/worship-duty-app/docs/PLAN-COMPACT-PHONE-REFACTOR.md)
for the runtime boundary.

## Design artifacts

The current source artifacts are in the integration repository:

- [Direction comparison](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/index.html)
- [Weekbook schedule](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/weekbook.html#schedule)
- Service editor: select an actual service from the schedule.
- [Service Ledger comparison candidate](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/ledger.html#schedule)
- [Prototype README](/Users/anthony/Projects/worship-duty-app/docs/design/prototype/compact-phone/README.md)

Weekbook is the selected structure. Service Ledger remains comparison evidence,
not the selected direction. The current preview reads the minimized current schedule snapshot; it has no
fictional member or assignment fixtures. All four appearance translations and role screen routes are present. They do not prove live role enforcement,
server acknowledgement, availability validation, invitations, notifications,
song journeys, or production saves.

## Reproduce the current-data preview

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
write production data. It holds one consistent asset/data revision until restarted. Use a new output filename for each refresh; existing snapshots are not overwritten. Never place the snapshot in Git or include real member
records in a review packet.

## Why the runtime work is still pending

The current production gallery combines prototype extraction, source-text
rewriting, and appearance-specific rendering paths. The approved runtime plan
replaces that structure with shared behavior and explicit layout renderers.
That replacement has not started from this handoff, and the preview artifacts
are not runtime code.

## Continuation boundary

- Baseline: `86a476f6d80b5a7bbbb09f8c0e0c8a5721fff427`.
- Integration branch: `codex/compact-phone-refactor`.
- Early checkpoint: `d2cb0b8`, containing the reviewed initial directions,
  baseline documentation and indexing, and the standalone
  `functions/compact-membership.js` module. That module is not exported or
  deployed.
- Astra High completed Original, Prism, Navy & Cream, and Aurora with shared current data and role-screen routes. See the [screen placement map](design/prototype/compact-phone/HANDOFF-MAP.md).
- Gemini 3.8 Flash Low completed the bounded design review with no material findings. Further runtime work requires Anthony's continuation after this handoff.
- After approval, Luna High owns runtime implementation, Gemini Low reviews
  bounded units, and one Opus High review covers the integrated result. Sol
  applies any required corrections and controls release.

Read this handoff, the [approved plan](/Users/anthony/Projects/worship-duty-app/docs/PLAN-COMPACT-PHONE-REFACTOR.md),
its Build log, the design placement map, current Git status, and the recorded
Gemini design review before continuing. Resume only the implementation scope
Anthony authorizes. Do not treat this design preview as a completed runtime
refactor or release.

## Final verification and review

- All four layouts: September 42 services, October 21, month preserved after browser Back, and no horizontal overflow at 320 pixels.
- Member, administrator and presider starting routes match the approved roles. Seventeen shared screen routes rendered without page errors during the brief walkthrough.
- Public song list shows ten rows per page. A song stayed in the local draft through an appearance change; browser-local save and confirmation worked, and editing required confirmation again.
- Current source capture: September 15, 2026 at 20:21:25 UTC, 180 services and 537 public songs. No member names or assignments in the snapshot.
- [Final bounded design review](runs/compact-phone-refactor/reviews/final-design.md) and [handoff support review](runs/compact-phone-refactor/reviews/design-support.md). No test cases or automated suites were created. These checks do not prove authenticated production behavior.

## Immediate credit-limit stop

Anthony requested an immediate handoff to conserve credits. All workers have finished. The latest design, helper and handoff changes are saved locally but are not yet committed or pushed; the prior private backup is d2cb0b8. Do not repeat completed reviews. Begin the next task by inspecting Git status and preserving these changes, then commit/back up this design checkpoint. Production is unchanged. The current narrow preview runs on port8099 using /private/tmp/worship-compact-reviewed-data.js; no member names or assignments are included. Further implementation requires Anthony's continuation.
