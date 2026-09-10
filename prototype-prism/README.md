# PRISM — a second working design direction

Prism is an alternate design review, not an update that overwrites Aurora. It is on `prototype/prism-calendar` and adds files in `prototype-prism/` only, plus a non-deploying QA workflow. The existing Aurora prototype and production app remain intact.

## Run

```sh
node prototype-prism/build.mjs
```

Open `prototype-prism/dist/index.html`. The output is self-contained and offline. No server or package installation is needed to try it. For automated browser checks, use the repository's existing development dependencies:

```sh
npm ci
npx playwright install chromium
node prototype-prism/tests/preview.mjs
```

## A different structure, not just different colors

- **Horizontal navigation**, bright white surfaces and royal-blue selection instead of a dark navigation rail.
- **A true full-month calendar**: all dates align to weekdays, services show at a glance, personal duties are marked, keyboard arrows move between dates and months. Selecting a date opens its service team in the adjacent inspector. An empty date stays empty rather than silently selecting another service.
- **Service inspector**: choose morning, afternoon or evening and read all original assigned names, duty categories and choir details. Desktop has a scrollable team panel; mobile expands it below the compact calendar.
- **Month / Agenda**: full assignment-detail list, people/duty search, department filtering, past services and month navigation remain available.
- **Song studio**: the real Presider library and its original setlist builder are visible side by side on desktop. The original Home, Library, Services, Insights, song search/sort/categories, Glory/Thanks slots, order/duration totals, confirmation and history controls still work. There is no invented cue-order workflow.
- **My Duties / Manage** retain the original actions and data, restyled to match. Light/dark, reduced-motion/manual pause, keyboard focus and local reset are included.

## Data and boundaries

This inherits the tested offline runtime assembly from `prototype/`. The Prism build appends its own presentation adapter and uses exact, uniqueness-checked anchors for the two-column song layout. Shared source files are not rewritten. The build fails on unexpected source drift.

Prism uses **`lv-prism-preview-v1:`** storage, separate from both Aurora's namespace and the production app. Reset affects only Prism. No live Firebase configuration loads, service worker registers, Google Sheet sync runs, or messages/notifications are sent. The existing CSP blocks external connections. Calendar download is an explicitly labeled reference snapshot, not a live subscription. Blocked local storage falls back to memory with a visible notice.

The repository's **74 services, 45 members and 509-song catalog** are retained. Their real reference schedule is May–July 2026; the internal preview clock is **July 1, 2026**. This is not the current live schedule. Production authorization, synchronization and deployment remain a separate integration task after design approval.

## Verification

`tests/preview.mjs` reuses the existing real-runtime regression suite without editing it, adapts its assertions to the month calendar, and adds calendar alignment/empty dates/keyboard rollover, compact mobile navigation, two-pane studio and cross-design storage isolation checks. It also hashes both production and Aurora source files before/after building. Results and screenshots are emitted to `prism-preview-artifacts/` and packaged by the review workflow. This is not a claim of complete cross-browser or accessibility certification.

Keep the generated bundle private: it embeds the repository's member names and song catalog. The review artifact is retained for seven days. Nothing in this branch deploys the application or merges either prototype into main.
