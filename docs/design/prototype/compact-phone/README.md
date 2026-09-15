# Compact phone direction choice

Status: two candidate structures ready for local comparison. Anthony has not selected or approved a direction. This is the bounded first deliverable of Section 1, not the complete prototype or runtime refactor.

## Run locally

Serve this directory using any static HTTP server. For example:

```sh
python3 -m http.server 4179 --bind 127.0.0.1 --directory /Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone
```

- Comparison: http://127.0.0.1:4179/index.html
- Service Ledger: http://127.0.0.1:4179/ledger.html#schedule
- Weekbook: http://127.0.0.1:4179/weekbook.html#schedule
- Ledger editor: http://127.0.0.1:4179/ledger.html#service/fixture-1
- Weekbook editor: http://127.0.0.1:4179/weekbook.html#service/fixture-1
- Four-appearance scope: either candidate with `#appearance`.

The HTML files can also be opened directly, but local persistence availability depends on the browser. An unavailable local save keeps the draft and offers Retry.

## Design distinction

| Detail | Service Ledger | Weekbook |
| --- | --- | --- |
| Schedule shape | One compact chronological index | Small bounded weekly groups |
| Date treatment | Aligned month and day rail | Week headings and inset weekday tiles |
| Editor composition | Duty labels beside full-width member fields | Two-column labeled assignment fields |
| Service heading | Quiet divided title with small date stamp | Contained filled header with reversed date placement |
| Type voice | Plain compact sans serif | Modest serif workspace and service titles |
| Wide screen | Side orientation rail plus service workspace | Side orientation rail plus grouped service workspace |

Both use a representative Navy & Cream treatment, with shared fixture information, actions, labeled floating main navigation, compact management tabs, and behavior. These are direction studies, not finished appearance translations. The selected structure will be translated into Original, Prism, Navy & Cream, and Aurora as four distinct layouts in the next approval round. The Appearance destination records this scope explicitly without pretending the translations are implemented.

## Working bounded journey

- The floating bottom bar contains only My duties, Schedule, Songs, and Manage. Manage stays selected through this leader flow. Schedule, Needs attention, and Members are compact secondary tabs below the heading. Appearance is a compact top control. The other global destinations explain the bounded preview and provide Return to Manage.
- Each schedule row names the first two assigned fictional members with surname initials, plus a remaining-member count, alongside the service time and assignment status. The editor exposes every full fictional name. The accessible row label includes all assigned names.

- Search dates, services, or assigned fixture members. Use the Open only toggle to filter to open duties. Twenty-four invented services, ten per page. All records remain reachable.
- Open a service, edit four service-team assignments and an optional note, explicitly save, see local saved status, then return.
- Back restores the search, page, filter, selected service highlight, and list scroll within the open page. Browser Back is supported. Unsaved edits prompt before leaving.
- Attention links the eight initial unfilled fixture services to their editors. Its counts recalculate after local saves. Members is a read-only invented roster. These are contextual destinations, not complete expanded workflows.
- Save disables repeated submits, briefly shows Saving, writes a namespaced localStorage fixture, and shows Saved in this browser only after that write succeeds. Failure preserves edits and offers Retry.

## Boundaries

All names and records were invented for this artifact. No external assets, fonts, requests, Firebase configuration, production reads, or production writes. No live role enforcement, availability validation, conflict resolution, invitations, version checks, server acknowledgement, notifications, song journeys, or production save claims. Local storage is isolated per candidate and can be cleared through browser site storage. Search/page state is held for the current page session; saved assignments survive reload when local storage is available.

The comparison embeds true 390 by 844 candidate frames on wide screens. Direct routes target 390 by 844 and 320 width, with deliberate two-area composition above 900 width. Body scrolling is bounded by ten records per page; floating navigation has reserved bottom space, and the editor Save row sits above it. Native selects support keyboard and device pickers. Focus rings, semantic controls, status announcements, and a native modal provide basic accessible interaction.

No test cases or automated test suites were authored or run. This is a reviewable local design artifact, pending controller browser walkthrough, the plan's Gemini review, and Anthony's selection. The plan remains open.

## Files

All artifact files are within `/Users/anthony/Projects/worship-duty-app-worktrees/compact-design/docs/design/prototype/compact-phone/`: `index.html`, `ledger.html`, `weekbook.html`, `styles.css`, `app.js`, and this README.

## Controller fidelity correction

The first controller walkthrough identified a navigation mismatch. The prototype now separates global main destinations from leader management sections, restores top Appearance access, and includes concise assigned-member names directly in service rows. This correction does not represent Gemini review or Anthony approval.
