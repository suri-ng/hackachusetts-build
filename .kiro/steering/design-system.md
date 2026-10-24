---
inclusion: always
---

# Sprout — Design System & Visual Identity

Apply this to ALL UI work for the Sprout webapp. Sprout is a mobile-first, highly
animated consumer rewards app (Fetch/Duolingo energy), NOT a corporate dashboard.
The funded progress bar is the visual centerpiece and its animation is the hero moment.

## Color palette

Source colors provided by the team. Roles assigned below — use the role, not the raw hex,
when reasoning about a component.

### Lights
| Token | Hex | Role |
|-------|-----|------|
| `--color-surface`      | `#ffffff` | App background, cards, primary surfaces |
| `--color-muted`        | `#cacfcb` | Borders, dividers, disabled states, unfilled progress track |
| `--color-brand`        | `#84a258` | Sprout green — PRIMARY brand + success/verified accent (logo color) |

### Darks
| Token | Hex | Role |
|-------|-----|------|
| `--color-ink`          | `#332923` | Primary text, headings (near-black warm brown) |
| `--color-ink-soft`     | `#44472f` | Secondary text, dark surfaces, dark-mode background |
| `--color-earth`        | `#7d5f49` | Warm accent — sponsor/earth elements, secondary buttons, coupon card |

## Semantic colors (derived — the palette has no dedicated status colors)

The provided palette has no explicit success/error/warning. Because the Verify screen must
clearly show pass vs. reject and the funded bar needs a confident "unlocked" state, use:

- **Success / verified / pass / bar-fill:** `--color-brand` (`#84a258`). This is on-brand and
  semantically "growing/verified."
- **Reject / error:** a warm red that harmonizes with the earthy palette — use `#b3482f`
  (derived, not from the source list). Do NOT use a cold pure-red (#ff0000) — it clashes.
- **Warning / "almost there":** `--color-earth` (`#7d5f49`) or a muted amber `#c8852f` if more
  contrast is needed.

> DECISION FLAG: semantic red/amber are derived, not team-provided. Revisit once the logo
> and any brand guidance arrive. Keep them in CSS variables so they're trivial to swap.

## Usage rules

- **Primary actions** ("Verify a cleanup", "Submit"): `--color-brand` background, `--color-surface` text.
- **Secondary actions:** `--color-earth` or outlined with `--color-muted`.
- **Funded progress bar:** unfilled track = `--color-muted`; fill = `--color-brand`; the
  "unlocked $" / milestone-hit celebration may pulse `--color-brand`. This bar gets the polish budget.
- **Coupon card:** `--color-earth` family (warm, tangible, "reward" feel), distinct from the green bar.
- **Text:** `--color-ink` for primary, `--color-ink-soft` for secondary. Maintain WCAG AA contrast
  (4.5:1 for body text) — verify `--color-ink` on `--color-surface` and `--color-surface` on `--color-brand`.
- **Dark surfaces / optional dark mode:** `--color-ink-soft` background, `--color-surface` text,
  `--color-brand` accents.

## Implementation

- Define all colors as CSS custom properties (`:root`) OR Tailwind theme tokens — one source of truth,
  no hardcoded hex in components, so the derived semantics can be swapped after the logo lands.
- Mobile-first: design at phone width first, enhance up.
- Animation: favor Framer Motion for the funded-bar fill, the coupon pop, and the verdict reveal.
  Keep motion purposeful; the bar climb (e.g. 37 -> 38) is the emotional beat.
- Respect `prefers-reduced-motion`: provide non-animated fallbacks for the bar and coupon reveal.

## Logo

The team will provide the Sprout logo during the build phase. Until then, use a text/placeholder
wordmark in `--color-brand`. When the logo arrives, place it on `--color-surface` (light) headers;
on dark surfaces use a light/knockout variant.
