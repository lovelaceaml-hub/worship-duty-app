# F5: calmer notifications area on My Duties

Date: 2026-09-19. Branch: `claude/f5-notifications` (from `58253ee`). Writer: Claude Fable 5.1 (assigned by the coordinator). Status: committed on the branch, not merged, not deployed.

## Goal-line check

Plan goal line: "Preserve Original, Prism, Navy & Cream, and Aurora as four distinct layouts."
Plan phone decision: "Short headers, concise rows, readable text, comfortable tap targets."

Check: no appearance source, appearance stylesheet, adapter, navigation, or gallery compiler file changed. The change is two small blocks in `app.js`, two CSS lines in the shared base styles in `index.html`, and one sentence in `docs/USER-GUIDE.md`. Every appearance keeps its own colors, fonts, card style and classes; the AFTER screenshots show each layout still looks like itself. The new markup keeps the `.notify-box` followed by `.hint` pair that the Prism adapter (`prototype-prism/all-pages.js`) and the Aurora adapter (`prototype/workspaces.js`) pick up and move into their own panels ("Calendar & reminders" and "Stay prepared").

## Anthony's words

"the notifications layout is obnoxious." He did not say which part, so the diagnosis below is mine, from screenshots.

## What I looked at

Surfaces found:

- My Duties controls (`renderMy` in `app.js`): "Turn on notifications" or "Notifications on", "Add my duties to my calendar", "Copy calendar link", plus an always-visible help paragraph.
- In-app banners (`addBanner`, `renderBanners`, `#banners` in `index.html`): reminder banners from `checkReminders`, the "new duties" banner from `checkNewDuties`, and many save or error messages elsewhere.
- "Recent updates" card on My Duties (already has a Clear button and a six item cap).
- The blocked-permission message is a browser `alert()` in the `notify-on` handler.
- There is no iPhone Add to Home Screen instruction block, no reminder timing chooser and no notification status pill in this codebase (searched `app.js` and `index.html`); the only status display is the "Notifications on" button itself.

Rendered with the repo's mocked-Firebase Playwright approach (copied from `design-gallery/test.mjs`, script kept in the session scratchpad, not in the repo) at 375x812, all four appearances, fictional member "S. Example" with two duties tomorrow and one next week, features `notifications`, `reminders` and `calendarExport` on, clock set to 9:30 PM the evening before.

## What was obnoxious, with measurements (BEFORE, 375 wide)

1. One reminder banner per duty, stacked. Two duties tomorrow produced two tall banners directly above a list that already shows the same two duties marked "Tomorrow". Banner stack height (including the signed-in banner): Original 229 px, Prism 246, Navy & Cream 234, Aurora 231. A member with three duties on a Sabbath would get three.
2. A 60 word help paragraph that is always open: 6 to 7 lines, 117 px (Original), 151 (Prism), 126 (Navy & Cream), 151 (Aurora). Most of it is one-time setup advice, and a third of it applies only to Android.
3. Three stacked buttons: 141 to 151 px tall as a group. "Copy calendar link" is only useful on Android yet took a full row for everyone.
4. Result: in Original the first duty card started 755 px down a 812 px screen, so a member opening My Duties saw almost no duties without scrolling.

## What changed

`app.js`, `renderMy` (notification controls only):
- The help paragraph is now a closed disclosure, `<details class="hint notify-help">`, with the summary "How it works and Android steps". This is the same `<details>/<summary>` pattern the app already uses for "Administrator override". The full original wording is inside, unchanged.
- "Copy calendar link" moved inside that disclosure, right under the Android sentence that tells people to tap it. Same `data-act="copy-ics"`, existing `ghost mini` button classes.
- If the calendar feature is off, the summary reads "How it works" and the calendar sentences and button are omitted (before, the calendar text showed even when the calendar button did not).

`app.js`, `checkReminders`:
- Reminders found in one check now produce one banner. One duty: the same text as before. Several: "Reminder: you have N duties in the next 24 hours. See My Duties."
- Unchanged: which duties qualify, the 24 hour window, the `wds-reminded` bookkeeping, the per-duty system notification (`sysNotify`), server push suppression, and the check schedule.

`index.html`: two lines next to the existing `.notify-box` rule: `.notify-help summary { cursor: pointer; font-weight: 700; padding: 8px 0; }` and `.notify-help p { margin: 0 0 8px; }`. These live in the shared base styles, which all four appearances load; color, font and size come from each appearance's existing `.hint` rules. No per-appearance CSS was needed.

`docs/USER-GUIDE.md`: the Android sentence now says where the Copy calendar link button is.

## AFTER measurements (375 wide)

| Appearance | Banner stack | Buttons | Help text | First duty card starts at | Page height |
|---|---|---|---|---|---|
| Original | 229 to 147 | 148 to 96 | 117 to 36 | 755 to 539 | 1227 to 1011 |
| Prism | 246 to 156 | 141 to 90 | 151 to 38 | 1439 to 1185 | 2210 to 1955 |
| Navy & Cream | 234 to 150 | 148 to 96 | 126 to 37 | 1068 to 843 | 1629 to 1404 |
| Aurora | 231 to 147 | 151 to 98 | 151 to 38 | 1210 to 1126 | 2528 to 2278 |

No horizontal overflow and no page errors in any appearance. The disclosure summary is a 36 to 38 px tap row; the buttons keep their existing 39 to 45 px heights.

## Deliberately left alone

- Notification permission flow, FCM token registration, reminder timing, Cloud Functions, rules: untouched.
- Button labels "Turn on notifications" and "Add my duties to my calendar": unchanged, because README, USER-GUIDE, PLAYBOOK and HANDOFF name them.
- Prism and Aurora full-width stacked buttons: that is their own card style, so I kept it.
- The "Signed in as" banner, the "new duties" banner, the Recent updates card, and the browser `alert()` for blocked notifications.
- Banners still stay until dismissed and there is still no gap between the last banner and the first button in Original (both are how live looks today).
- Main navigation and everything lane F4 owns.

## Judgment calls and alternatives

- Combining reminder banners changes banner wording when several duties are due. I judged this layout, not notification behavior, since delivery, timing and system notifications are identical. Alternative considered: hide reminder banners entirely on My Duties (the list already says "Tomorrow"). Rejected as a bigger behavior change.
- Moving "Copy calendar link" one tap deeper costs Android members one extra tap, once, during setup. Alternative considered: shorten the three button labels to fit one row. Rejected because the labels are documented in four places and would still wrap in Original.
- If Anthony meant something else by "obnoxious" (for example the phone's push notifications themselves, or the banners on the Schedule tab), this lane did not address it.

## Verification

- `node --check app.js`: passed.
- `node design-gallery/build.mjs`: passed (four appearance build).
- Screenshots, 375x812 viewport, full page, mock data only (fictional names "S. Example", "B. Sample", "D. Demo"; mocked Firebase; all other network blocked): `docs/runs/keep-look-features/F5-screens/`
  - `before-original.png`, `before-prism.png`, `before-navy-cream.png`, `before-aurora.png` (built from `58253ee` via `git archive` into a scratch folder)
  - `after-original.png`, `after-prism.png`, `after-navy-cream.png`, `after-aurora.png`
  - `after-<appearance>-help-open.png`: the same screens with the disclosure opened.
- Clicked the relocated "Copy calendar link" inside the opened disclosure in Prism: the existing handler ran and showed the calendar link banner. No page errors.

## Unverified

- Real phones (iPhone Safari, Android Chrome) and the installed PWA: not checked. `<details>` is standard and already used in the app.
- The "Notifications on" state and the presider song button state were not screenshotted (headless Chromium cannot grant notification permission); the code path for those buttons is unchanged.
- The Copy calendar link click was exercised in Prism only; the other three share the same click delegation.
- `node design-gallery/test.mjs` was not run (the plan selects no automated suites). It was checked by search that it does not assert on the notification labels or the help text.
- No preview channel, no deploy, no production data touched.
