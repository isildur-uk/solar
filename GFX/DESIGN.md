# SOLAR — Design System (brand / cover surface)

> Cosmic void pierced by a single luminous word.

The SOLAR landing operates in the visual language of deep space: a near-black void where
the product wordmark is the only source of light. Almost entirely monochrome — pure white
emitted onto absolute black — the wordmark behaves like a celestial object that glows.
Typography is whisper-thin (Inter, weight 300) and tightly tracked, trusting negative space
and luminosity rather than weight or decoration. Colour is a rare atmospheric event: a single
amber horizon wash bleeding up from the bottom edge (our brand accent), and a functional blue
reserved strictly for input focus. Tokens live in `css/tokens.css` (namespaced `--sol-*`).

Reference lineage: xAI (`refero.design` "cosmic void"), Dylanbrouwer (oversized tracked display
type), and a restrained chromatic-prism entry animation.

## Tokens — Colour
| Token | Value | Role |
|-------|-------|------|
| `--sol-void` | `#0c0c0b` | Page canvas — the space everything floats on |
| `--sol-void-deep` | `#050506` | Outer radial falloff |
| `--sol-graphite` | `#1f2228` | Hairline borders / ghost-pill outlines |
| `--sol-smoke` | `#474747` | Elevated outlines |
| `--sol-ash` | `#7d8187` | Muted helper / metadata text |
| `--sol-white` | `#ffffff` | Emitted light — wordmark, primary text |
| `--sol-signal` | `#2563eb` | Functional accent — **input focus only** |
| `--sol-amber` | `#e8b34b` | The horizon glow — brand accent / wordmark bloom tint |

## Tokens — Type
- **Display / wordmark:** Inter (`--sol-font-display`), weight **300**, tracking **-0.03em**.
  Hierarchy comes from size + light, never weight. Vendored: `css/fonts/inter-latin-var.woff2`.
- **Metadata / labels:** Geist Mono (`--sol-font-mono`), weight 400, tracking **0.32em**,
  uppercase, enclosed in `[ BRACKETS ]` — reads as technical annotation, not prose.
  Vendored: `css/fonts/geist-mono-latin-var.woff2`.

> **Build-standard note (gate 7 — documented exception).** The Product Build Standard bans Inter *as a lazy default*. SOLAR's use of Inter 300 is the opposite: a deliberate, documented type choice — weight-300 luminosity on a cosmic-void surface, per the xAI reference lineage above, paired with Geist Mono for technical annotation. This is a conscious exception to gate 7, not a default. Keep it as specified; don't "correct" it to satisfy the gate.

## Components
- **Wordmark** — Inter 300, `clamp(3.4rem, 13vw, 9.5rem)`, white `#fff`, layered light bloom
  behind (asymmetric, white→amber→transparent). The typographic hero *is* the visual hero.
- **Enter cue** — Geist Mono `[ ENTER ]`, amber, hover/focus-revealed only (rest = just the name).
- **Sample link-chart** — 1px hairline constellation (subject + orbiting entities) drifting
  faintly beneath the wordmark; iconographic, not decorative noise.
- **Horizon wash** — full-bleed amber gradient bleeding up from the bottom edge; the only
  large-scale colour event.

## Motion
- **Entry (click):** chromatic-prism split (white core → red/blue ghosts) + bloom flare, then a
  circular aperture (iris) opens from centre into the workbench. ~1.2s, easing cubic-bezier(.7,0,.3,1).
- Restrained and slow: opacity fades and gentle parallax over bouncy UI motion.
- All motion has a `prefers-reduced-motion` fallback (static luminous wordmark, plain fade).

## Do / Don't
- **Do** keep `#0c0c0b` as the only canvas; define structure with 1px `#1f2228` hairlines, not fills.
- **Do** keep the wordmark at weight 300 — luminosity, not boldness.
- **Do** reserve `#2563eb` for focus; keep amber as the atmospheric horizon/glow only.
- **Don't** add card fills, heavy shadows, or a second saturated colour.
- **Don't** let the sample chart compete with the wordmark — it stays faint, ≤0.2 effective alpha.
