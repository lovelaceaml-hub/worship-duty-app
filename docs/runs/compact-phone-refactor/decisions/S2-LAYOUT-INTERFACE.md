# Shared layout interface ruling (Section 2)

Status: Fable 5.1 architect ruling, 2026-09-16. Binding for Sections 2 and 4. Read-only advice: Fable wrote no runtime code. The Section 2 writer implements this; a conflict with the approved prototype or the plan goes back to the controller, not around this file.

Visual authority: `docs/design/prototype/compact-phone/` (Weekbook, four appearances) and its `HANDOFF-MAP.md`. The prototype is reference only. Runtime never reads, extracts, or rewrites prototype source.

## 1. Flow

`app.js` domain state and permissions -> shared information builders -> one of four explicit layout renderers -> shared components. Layouts arrange; they never compute counts, decide permissions, hold save handlers, or own state.

## 2. Files and ownership

All new browser code is plain ES modules, no bundler, no framework. `app.js` is already `type="module"`.

| Path | Purpose |
| --- | --- |
| `appearance-boot.js` | Classic script, first in `<head>`. Pre-paint appearance selection (section 3). |
| `shared/state.js` | Route store, per-route memory, drafts, pending saves, unsaved guard, pending destination. |
| `shared/nav.js` | `buildNavigation(account)`: main destinations and secondary tabs from capabilities. |
| `shared/save-state.js` | Save controller: Unsaved, Saving, Saved, Failed, Stale. |
| `shared/components.js` | Pure HTML-string components (section 6). |
| `shared/screens.js` | Screen registry: id, route pattern, information builder, required sections. |
| `shared/shell.js` | `startShell(host)`: render loop, event delegation, history, layout dispatch. |
| `layouts/original.js`, `layouts/prism.js`, `layouts/navy.js`, `layouts/aurora.js` | One explicit renderer each. |
| `layouts/index.js` | Registry plus `verifyLayouts()`. |
| `styles/shared.css`, `styles/original.css`, `styles/prism.css`, `styles/navy.css`, `styles/aurora.css` | Shared controls, then one arrangement sheet per appearance. |

`app.js` stays the single owner of Firebase, auth, listeners, writes, and domain rules. It builds one `host` object (same pattern as the existing `songCtx()`) and calls `startShell(host)`. Shared modules never import `app.js` and never touch Firebase directly.

`host` minimum: `phase()` returning `maintenance | locked | signin | forcedPin | loading | ready`; `account()` returning `{ name, uid, canManage, isAdmin, departments, isPresider, canEditSongs }`; `services()`; `counts()` (wraps `actionableCountsForViewer`); `legacy` render functions (section 7); `actions` (existing domain handlers, by name); `onChange(cb)`.

## 3. Clean startup

- Storage key stays `wds-design-gallery-v1`; stored ids stay `classic`, `prism`, `navy`, `aurora`. Display names stay exactly Original, Prism, Navy & Cream, Aurora. Keep the `wds-design-choice-v1` and `wds-appearance-navy-v1` migrations and the session-only `?design=classic` recovery, which must never overwrite the saved preference.
- `appearance-boot.js` runs before any stylesheet link or body content: reads the preference, sets `<html data-appearance="...">`, and writes the chosen appearance stylesheet as a normal render-blocking `<link>`. Only the chosen sheet blocks; the other three load on demand at switch time. No `media="not all"` swap and no Original-then-switch repaint.
- Site lock, sign-in, forced PIN change, and loading are rendered by the active layout from the first frame. Loading shows that layout's skeleton.
- If the chosen stylesheet or layout module fails (error event or 7 second timeout): show a recovery panel with Retry and "Use Original for now". The fallback sets a session flag only. The saved preference is untouched.
- Switching appearance: load sheet, then swap `data-appearance`, then re-render. Route, drafts, filters, pending saves all survive because they live in `shared/state.js`, not in a layout. No document reload, no remount of the Presider module.

## 4. Routes and state

Hash routes, same names as the prototype: `#duties`, `#schedule`, `#service/{id}`, `#edit/{id}`, `#availability`, `#reminders`, `#manage/schedule`, `#manage/attention`, `#manage/members`, `#manage/add-member`, `#manage/profile/{id}`, `#manage/invite`, `#manage/exceptions`, `#manage/settings`, `#songs/my-service`, `#songs/library`, `#songs/song-detail`, `#songs/history`, `#songs/history-detail`, `#appearance`, `#unavailable`. Lock, sign-in, PIN change, loading, and recovery are phases, not routes.

`shared/state.js` API:

- `route()`, `go(route, { replace })`, `back()`. Browser and phone Back follow app navigation through `history` and `hashchange`.
- `memory(routeKey)` returns a mutable bag `{ query, filters, page, month, selected, scrollY }`, restored on return. Schedule uses `month`, not `page` (approved Weekbook exception).
- `draft(key)`, `setDraft(key, value)`, `clearDraft(key)`; `isDirty()`. Navigation away from a dirty editor asks first; `beforeunload` is armed only while dirty.
- `pendingDestination`: a route captured from a notification or deep link before sign-in, consumed once after `ready`. An unknown or unauthorized destination resolves to `#unavailable` with a link to the account's start route.
- Start route by role: member `#duties`, leader `#manage/schedule`, administrator `#manage/attention`, presider `#songs/my-service`. Multi-role accounts start at the highest applicable of administrator, leader, presider, member and keep every workspace in navigation.

## 5. Layout renderer contract

Each layout module default-exports exactly this shape. Missing keys are a defect, not a fallback.

```js
export default {
  id: 'prism',                 // classic | prism | navy | aurora
  name: 'Prism',
  stylesheet: 'styles/prism.css',
  shell(model, c) {},          // returns full page HTML with the five named sections
  phase: { locked(info, c) {}, signin(info, c) {}, forcedPin(info, c) {},
           loading(info, c) {}, recovery(info, c) {}, maintenance(info, c) {} },
  weekGroup(week, c) {},       // this layout's Weekbook week arrangement
  serviceSummary(service, c) {},
  screens: { schedule(info, c) {}, appearance(info, c) {}, unavailable(info, c) {}, legacy(info, c) {} }
};
```

- `model` is `{ account, navigation, route, screenHtml, saveState, banners }`. `info` comes only from the screen's shared information builder. `c` is `shared/components.js`.
- Every `shell` must emit these sections once each, marked `data-section`: `header`, `secondary-tabs`, `body`, `save-bar`, `main-nav`. `header` always contains exactly one Appearance control.
- A layout returns HTML strings only. It attaches no listeners. All interaction is `data-act` / `data-route` attributes handled by one delegated listener in `shared/shell.js`.
- `layouts/index.js` `verifyLayouts()` checks that all four layouts define every key above and every screen id in `shared/screens.js`. The gallery build runs it and fails on a gap, so a new feature cannot ship with a placement in only some appearances. Section 4 adds a screen by adding one builder plus four placements.

## 6. Shared components and save state

`shared/components.js`: `mainNav`, `secondaryTabs`, `appearanceButton`, `searchField`, `monthNav`, `pager` (ten per page default), `saveBar`, `warning`, `emptyState`, `unknownState`, `skeleton`, `assignmentRow`, `memberPicker`, `dialog`. Each takes data and returns HTML with stable class names prefixed `wd-`. Appearance sheets restyle those classes; they do not fork the markup. Tap targets are at least 44 CSS pixels.

Floating main navigation: always visible when `phase` is `ready`, labeled, positioned with `env(safe-area-inset-bottom)`, and the body reserves matching bottom padding. The save bar sits directly above it. When the on-screen keyboard is open (`visualViewport` height drop), main navigation hides and the save bar stays reachable. Destinations from `buildNavigation`: Schedule and My duties for everyone; Manage when `canManage`; Songs when presider or song editor. Dots and counts come only from `host.counts()`.

`shared/save-state.js`: `createSave({ key, run })`. `run` returns a promise; Saved is shown only after it resolves, which means server acknowledgement. A second tap while Saving is ignored. Rejection keeps the draft and shows Failed with Retry. A rejection whose `code` is `aborted` or `failed-precondition`, or whose payload carries a newer `revision`, shows Stale with the draft kept. Section 3 server handlers must return `{ ok, revision }` on accepted writes so this contract holds.

Missing data is rendered with `unknownState`, never as a vacancy, a zero count, or an invented row.

## 7. What Section 2 delivers, and the legacy bridge

Section 2 delivers the shell, startup, the six phases, and three real screens in all four layouts: `schedule` (read-only Weekbook with search, month navigation, week groups, restored month and scroll), `appearance`, and `unavailable`.

Until Section 4 replaces them, My duties, Manage, and the Presider planner keep working through one `legacy` screen: the shell body hosts the existing `renderMy`, `renderManage`, and `renderSongs` output inside a `.wd-legacy` container, with the existing Original content rules scoped under that class. Existing `data-act` handlers in `app.js` keep working unchanged. This is a compatibility wrapper, the one kind the plan allows. Section 4 removes it screen by screen.

Nothing ships between Sections 2 and 6, so members never see the mixed state.

## 8. Build, release guard, and service worker

- `design-gallery/build.mjs` becomes a packager: copy the allowlisted root files, `appearance-boot.js`, `shared/`, `layouts/`, `styles/`; stamp `?v=DEV` and the service worker `RELEASE`; run `verifyLayouts()` and syntax checks; write `design-gallery-release.json` and `firebase.gallery.json`. It no longer reads `prototype/`, `prototype-prism/`, or `docs/design/`, and contains no `once`, `between`, or regex source rewriting of `app.js` or `song-app.js`. Those prototype folders stay in the repository untouched as history.
- Keep `design-gallery/release.mjs` and `scripts/guard-gallery-deploy.mjs` as the only publication path. Keep the manifest fields `release`, `choices`, `upstream`, `builtAt`; set `design` to `appearance-gallery-v2` and teach the release compatibility check to accept a live `v1` gallery as a known predecessor. Do not run any release or preview channel in Section 2.
- `sw.js`: new module and style files use the same stamped cache and the same cache headers as `app.js`. `notificationclick` passes `data.route` when present by opening or focusing `./#<route>`; the shell stores it as `pendingDestination`. Background message behavior and the FCM config block are otherwise unchanged. `song-lib.js` is not touched.
- `design-gallery/test.mjs` and `live-design/` target the retired compiler. Do not repair or extend them (the plan forbids new suites). Record them as superseded in the lane record for Section 5B.

## 9. Open item for Anthony (does not block Section 2)

The live Prism and Aurora appearances have a light/dark toggle and a motion toggle. The approved Weekbook prototype is the visual authority, and the writer follows it. If the prototype has no dark palette or motion control for an appearance, Section 2 does not invent one, leaves the stored `wds-prism-palette` style keys untouched, and lists the gap under limitations so Anthony can rule on it before Section 6.
