# Design System — Liquid Glass (iOS)

Restyled 2026-07-03 from the earlier "Warm Glass" editorial look to a full
iPhone / Apple **Liquid Glass** iOS aesthetic, **light theme only**. Brief:
must read as a native iOS app, not a generic white-card web page; strictly no
emoji and no cross / church / religious imagery (WMSCOG doctrine); the accent
tint appears sparingly. This is a pure restyle — `app.js` is untouched; every
style lives in the single `<style>` block in `index.html`.

## Concept

A cool, light canvas washed with four soft blue/cyan/violet radial sources,
with deep frosted-glass surfaces floating above it. Lower fill opacity plus
strong backdrop blur + saturation and a specular top-edge highlight make the
surfaces read as Apple "liquid glass," catching light rather than sitting as
opaque cards. Typography is the full Apple system stack — no web fonts — with
an iOS large-title / body / footnote / section-label rhythm. One system-blue
tint (a blue-leaning indigo) carries attention and appears at most ~3× per
screen. On phones the tab bar becomes a floating glass bottom bar like a
native app; on desktop it stays a sticky top pill bar.

## Tokens (all in `index.html` `:root`)

| Token | Value | Use |
|---|---|---|
| canvas | `#eef1f7` + 4 fixed cool radial washes (blue `rgba(99,126,234,.16)`, steel `rgba(126,158,232,.13)`, cyan `rgba(120,196,214,.11)`, violet `rgba(158,148,224,.09)`) | body background (`background-attachment: fixed`) |
| `--ink` | `#1c1c1e` (iOS label) | primary text |
| `--muted` | `#52525b` | secondary text (≥4.5:1 on glass) |
| `--faint` | `#6b6b73` | tertiary / footnote / section labels |
| `--line` / `--hairline` | `rgba(60,60,67,.18)` / `.12` | separators (iOS-style) |
| `--accent` / `--accent-2` | `#3b5bdb` / `#4f6ef2` | iOS system tint (blue-leaning indigo) |
| `--accent-grad` | `linear-gradient(180deg,#4f6ef2,#3b5bdb)` | filled tint fills |
| `--danger` / `--ok` / `--warn` | `#d1332b` / `#12855f` / `#ad6a12` | semantic |
| `--glass` | `linear-gradient(155deg, #fff .62 → .30)` | card fill (lower opacity than before) |
| `--glass-strong` | `rgba(255,255,255,.68)` | pills, inputs, active tab, list rows |
| `--glass-border` | `rgba(255,255,255,.55)` | light-catching 1px border |
| `--specular` | `inset 0 1px 0 rgba(255,255,255,.60)` | specular top edge on every glass surface |
| `--blur` / `--blur-lite` | `saturate(180%) blur(30px)` / `saturate(160%) blur(18px)` | backdrop filters |
| `--shadow` / `--shadow-soft` / `--shadow-bar` | see `:root` | elevation |
| radii | `--r-lg` 26px cards, `--r-md` 16px small surfaces, 999px capsules | continuous-feel corners |

## Typography

- Font: **Apple system stack only** — `-apple-system, BlinkMacSystemFont,
  "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial,
  sans-serif`. No Google Fonts, no serif. The old Fraunces `<link>` tags and
  `--serif` token were removed.
- **Large-title header:** h1 32px / weight 700 / tracking −0.021em.
- **Body / primary content:** 17px, line-height 1.47 (inputs, banners, duty
  rows, buttons, links).
- **Footnote:** 13px (hints, captions, times, sync status, descriptions).
- **Section labels:** 11px, weight 600, uppercase, letter-spacing 0.06em,
  `--faint` (`.cat-label`, `.cat-edit-label`, header eyebrow).
- Times / counts use `font-variant-numeric: tabular-nums`.

## Category colors (dots)

Worship `#4338ca` · Usher Sisters `#be185d` · Usher Brothers `#0369a1` ·
Lobby `#b45309` · Translation `#047857` · Media `#6d28d9`.
(Values live in seed data; `app.js` sets them inline on `.dot-c` and via
`--edge` on `.duty-card`.) Dots get a `0 0 0 3px rgba(255,255,255,.6)` halo so
they stay crisp on glass.

## Components

- **Tabs — split behavior:**
  - *Desktop (>640px):* sticky glass **top pill bar** (blur 30px + sat 180%,
    specular edge). Active tab = `--glass-strong` capsule, label in accent tint.
  - *Phone (≤640px):* `nav.tabs` becomes `position: fixed` — a **floating
    glass bottom bar** inset from the edges (left/right 16px, bottom
    `12px + env(safe-area-inset-bottom)`), z-index 100, stronger blur. `.wrap`
    gets `padding-bottom: 96px + safe-area` so content never hides behind it.
    The unread `.dot` stays anchored inside the middle button.
  - `nav.tabs.hidden { display:none }` still hides the bar on the passcode lock.
- **Cards:** `.card` — `--glass` fill, 1px light border, 26px radius, specular
  highlight. Tab content fades/rises in (`@keyframes rise`, 0.35s).
- **Grouped-list feel:** `.card-head`, `.duty-expand`, `.alert-item` use
  hairline separators; `.list-row` is a glass row with its own specular edge.
- **Duty cards:** 4px colored edge via the `--edge` custom property.
- **Buttons:** iOS tinted capsules (999px). `primary` = filled accent gradient
  with inner highlight; `ghost` = glass capsule with accent-tinted label;
  `ghost.on` flips to `--ok`.
- **"You" pill / Today badge:** filled accent capsules with a specular inset.
- **Switches:** exact iOS proportions — 51×31 track, 27px knob, 20px travel;
  off = `rgba(120,120,128,.32)`, on = solid `--accent`.
- **Inputs / selects:** glass fill, 13px radius, accent focus ring; restyled
  globally so `.add-row`, `.edit-grid`, `.list-row` and the sheet-sync
  `width:100%` input all inherit.
- **Lock screen:** centered glass card, 22px bold system title.

## Rules

1. No emoji anywhere in the product UI.
2. No cross, church-building, or religious iconography (`icon.svg` is abstract
   translucent circles on the accent gradient).
3. The accent tint appears at most ~3 times per screen.
4. Every text-on-glass combination must stay legible over the busiest wash
   region — `--muted` targets ≥4.5:1; when in doubt use `--ink`.
5. New surfaces reuse `--glass` / `--glass-strong` and the `--specular` edge;
   never invent new whites.
