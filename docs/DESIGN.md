# Design Direction, WATV Service Coordination

> Note added 2026-09-20. This design system describes the Original appearance only. Prism, Navy & Cream, and Aurora have their own styles (see [design-gallery/README.md](../design-gallery/README.md)). The shared header, bottom bar, name menu, and feedback button use these tokens in Original.

## Approved direction

- **Three adjectives:** official, orderly, calm.
- **Visual motif:** a precise WATV-blue rule that anchors clean white service records.
- **Why it supports the audience:** members can immediately distinguish the schedule, their own assignments, and the presider song workspace without decorative UI competing with service information.
- **Reference:** [WATV official website](https://watv.org/home/) and its blue symbol asset, inspected July 18, 2026. The observed symbol blue `#2383C6` was sampled from WATV's published PNG; the rose `#DA0F47` was observed in WATV's current home stylesheet. This app uses the color language only; it does not copy the WATV layout or logo and does not claim official WATV endorsement.

## Directions considered

1. **Official, orderly, calm, Service record.** White records, WATV blue rules, restrained corners, strong information hierarchy. Selected because it feels institutional while remaining easy on a phone.
2. **Warm, editorial, reflective, Weekly bulletin.** Warm paper surfaces, larger serif headings, and section dividers. Not selected because dense editing and song-library screens became less efficient.
3. **Focused, compact, operational, Control board.** Denser tables, dark navy navigation, and dashboard metrics. Not selected because it favored coordinators over ordinary members.

## Hierarchy and content

- **Schedule:** the next service date and assignments are dominant.
- **My Duties:** name selection and the next assigned duty are dominant.
- **Presider:** the service being planned and its song set are dominant.
- **Manage:** the selected management section and safe edit action are dominant.
- **Navigation:** top section tabs on desktop; persistent bottom tabs on phones; swiping remains an optional shortcut.
- **Motion:** one short entrance transition and immediate control feedback; all animation is removed when reduced motion is requested.
- **Imagery:** none. The interface uses no cross, church-building, or religious imagery and no emoji.

## Tokens

| Token group | Decision |
| --- | --- |
| Color | WATV-observed blue `#2383C6`; accessible derived deep blue `#075F96`; derived heading blue `#174A6B`; WATV-site rose `#DA0F47` only for alerts; canvas `#F3F6F8`; white surfaces |
| Typography | Avenir Next when available, then Segoe UI/Roboto/system sans; compact labels and clear service headings |
| Spacing | 4/8/12/16/20/28 rhythm; 44px minimum interactive controls |
| Radius | 14px cards, 7 to 10px controls; no capsule-heavy styling |
| Elevation | subtle cool-blue shadows; borders carry most structure |
| Motion | 220ms entrance; reduced-motion override |

## Components and responsive behavior

- White bordered cards replace translucent glass.
- Blue active rules identify the current tab without relying on color alone; the active panel also changes background and text weight.
- Status labels use text plus color. Alerts use a rose border and pale rose surface.
- Inputs have visible labels, strong borders, and a 3px focus ring.
- Phone navigation stays fixed at the bottom with safe-area spacing; desktop navigation stays at the top.
- The header returns to Schedule by click, Enter, or Space.
- Song controls inherit the same tokens but remain scoped under `#song-root`.
