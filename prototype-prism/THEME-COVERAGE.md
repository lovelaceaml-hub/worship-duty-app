# Prism across the whole app

The existing Prism design now extends through every existing route, not only the Schedule and Library.

| Area | Themed views and nested states |
|---|---|
| My Duties | Next-duty summary, timeline, profile/preparation rail, expanded team, change-request form and request history |
| Presider | Home with My Services and All Services, Library and setlist builder, song detail/history, expanded order of worship, runsheet, Insights, backfill form, presider directory, separate song-editor PIN gate |
| Manage | Services and all eight department editors; Planning/conflicts/coverage/workload; Requests/pending/resolved; People and eligibility controls; grouped Features; passcode/scheduler forms; Data & Sync, backup/import, reset and name cleanup |
| Shared | Empty/error/locked states, status badges, light/dark surfaces, keyboard focus, mobile layouts and accessible modal confirmations |

`all-pages.js` rearranges existing host markup without removing action attributes. `song-pages.js` wraps the existing song renderers inside their module. The song PIN remains separate from the schedule editor passcode. `all-pages.css` defines shared surface/control tokens and responsive layouts. The builder performs checked transformations **only on its generated output**; original production and Aurora files are untouched.

Destructive confirmations use an HTML dialog with cancel-first focus, Escape cancellation and focus return. Original authorization and mutation code still runs: generated handlers await the dialog rather than a synchronous browser confirmation. Credentials are not bypassed. Browser-native pickers, permission/alert and the top-level reset prompt remain browser-controlled.

The Data & Sync page explains this offline preview rather than inviting users to connect or overwrite their live Firebase setup. All original local backup/import/reset/cleanup actions remain. Reference data, July 1, 2026 clock, `lv-prism-preview-v1:` isolation, and disabled external connections are unchanged.

## Build and check

```sh
node prototype-prism/build.mjs
node prototype-prism/tests/preview.mjs
node prototype-prism/tests/all-pages.mjs
```

Open `prototype-prism/dist/index.html`. The second test suite supplements the existing 88-check regression suite with every-route light/dark checks at 320/390/768/1024/1440 pixels, nested forms, modal cancellation, roster/feature completeness, song history operations, and passcode flows. The review artifact contains `test-report.json`, `all-pages-report.json` and browser screenshots; these reports are the source of truth for check totals.

`PRISM_CHROMIUM` optionally selects a local executable for the all-pages suite. `PRISM_SET_CONTENT=1` is a local rendering smoke mode that explicitly skips real-HTTP/PIN hashing checks. CI does not set it. This is not a claim of complete cross-browser or accessibility certification.

This update is on the same prototype branch/draft PR. Nothing has been merged into main or deployed to Firebase. Keep the generated HTML and reference-data artifacts private to intended collaborators.
