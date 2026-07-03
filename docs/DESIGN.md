# Design System — "Warm Glass"

Redesigned 2026-07-03 to a layered-glass, editorial look. Brief: very high
quality, glassy, must not read as a default AI-generated site; minimal and
professional; strictly no cross or church imagery (WMSCOG doctrine) and no
emoji in the UI.

## Concept

A warm bone canvas washed with four soft light sources, with frosted-glass
surfaces floating above it. Editorial serif display type (Fraunces) gives
it a printed-program feel; the sans body keeps it utilitarian. One gradient
accent, used only where attention belongs (Today badge, "You" pill, primary
buttons, toggles).

## Tokens (all in `index.html` `:root`)

| Token | Value | Use |
|---|---|---|
| canvas | `#f4f2ee` + 4 fixed radial washes (indigo `rgba(99,102,241,.20)`, peach `rgba(244,163,96,.17)`, mint `rgba(45,180,140,.13)`, violet `rgba(199,120,221,.10)`) | body background |
| `--ink` | `#211d19` (warm black) | primary text |
| `--muted` | `#837c73` | secondary text |
| `--faint` | `#a8a199` | tertiary/labels |
| `--accent` / `--accent-2` | `#4f46e5` / `#7c3aed` | gradient endpoints |
| `--glass` | linear-gradient white .78 → .42 + `backdrop-filter: blur(18px) saturate(160%)` | cards |
| `--glass-strong` | `rgba(255,255,255,.82)` | pills, inputs, active tab |
| `--shadow` | `0 1px 2px rgba(33,29,25,.04), 0 24px 48px -24px rgba(79,70,229,.18)` | cards (indigo-tinted) |
| radii | 22px cards, 14px small surfaces, 999px pills | |

## Typography

- Display: **Fraunces** (Google Fonts, 500–700, optical sizing) — h1 34px,
  date heads 19px, card titles 17px.
- Body: system sans stack, 15px/1.55.
- Category labels: 10px, 700, letter-spacing 0.14em, uppercase, `--faint`.
- Times: `font-variant-numeric: tabular-nums`.

## Category colors (dots)

Worship `#4338ca` · Usher Sisters `#be185d` · Usher Brothers `#0369a1` ·
Lobby `#b45309` · Translation `#047857` · Media `#6d28d9`.
Dots get a `box-shadow: 0 0 0 3px rgba(255,255,255,.55)` halo on glass.

## Components

- **Tabs:** sticky glass pill track (blur 20px), active = `--glass-strong`
  white pill with small shadow.
- **Cards:** `.card` — glass gradient, 1px `rgba(255,255,255,.72)` border,
  22px radius. Tab content fades/rises in (`@keyframes rise`, 0.35s).
- **Duty cards:** 4px colored edge via `--edge` custom property.
- **"You" pill / Today badge / primary buttons / switch tracks:** the
  accent gradient with tinted drop shadows.
- **Toggles:** 46×27 iOS-style, gradient when on.
- **Lock screen:** centered glass card, serif title.

## Rules

1. No emoji anywhere in the product UI.
2. No cross, church-building, or religious iconography (icon.svg is
   abstract translucent circles on the accent gradient).
3. The accent gradient appears at most ~3 times per screen.
4. Every text-on-glass combination must stay legible over the busiest wash
   region — when in doubt use `--ink`, not `--muted`.
5. New surfaces reuse `--glass`/`--glass-strong`; never invent new whites.
