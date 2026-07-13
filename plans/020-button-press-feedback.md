# 020 — Tactile depress on primary buttons (press, not ripple)

- **Finding**: [MOTION/INTERACTION] `.btn.primary` has a hover glow and a small `:active` scale, but no tactile *depress*. A physical push gives the primary action a satisfying, considered feel on press. The ripple (Material) alternative is explicitly rejected as generic.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion / Interaction   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
DESIGN.md encourages tasteful press feedback ("on interaction … tasteful kinetic feedback is encouraged"). A tactile depress (kinetics.md #13 "Push Button") reads as considered and physical; a Material ripple (kinetics.md #08) reads as generic framework boilerplate and would clash with the analyst-console tone. This is the explicit tone-down: **use the press, NOT the ripple.** Keep the 4px radius and `--accent-soft`; under reduced-motion keep the instant colour feedback but drop the movement.

## Current state (evidence)
- Source: `css/redesign.css:58-59` — the primary button and its hover glow:
  ```css
  .btn.primary { border-color: var(--accent-dim); color: var(--accent); }
  .btn.primary:hover { background: var(--accent-soft); box-shadow: 0 0 18px -6px var(--accent); }
  ```
- Source: `css/redesign.css:235` — the shared `:active` scale already present:
  ```css
  .btn:active, details.menu>summary:active{ transform:translateY(0) scale(0.985) }
  ```
- Tokens: `--accent-soft: rgba(142,162,255,0.14)`, `--accent-dim:#6f7fe0`, `--accent:#8ea2ff`, `--radius:4px` (all in `css/app.css` `:root`). The base `.btn` uses `--radius` (4px) already.
- Rendered: primary buttons glow softly on hover and nudge slightly on click, but there is no "edge" that collapses — no depth cue.

## Target state
Give `.btn.primary` a solid bottom "edge" (a `box-shadow` acting as a 3D side wall) that collapses on `:active`, so the button physically depresses — **kinetics.md #13 "Push Button"**, recoloured to the accent family and kept at 4px radius. This layers onto (does not replace) the existing hover glow. Because the shared `.btn:active` scale exists, keep it but let the depress dominate the primary button.
```css
/* 020 — Push Button tactile depress on the primary action; 4px radius; --accent-soft kept.
   The bottom box-shadow is the "edge"; :active drops the button onto it. */
.btn.primary {
  border-color: var(--accent-dim); color: var(--accent);
  border-radius: var(--radius);                                  /* 4px */
  box-shadow: 0 3px 0 color-mix(in srgb, var(--accent-dim) 70%, #000);   /* the edge */
  transition: transform .06s ease, box-shadow .06s ease, background .2s ease;
}
.btn.primary:hover {
  background: var(--accent-soft);                                /* keep the soft glow bg */
  box-shadow: 0 3px 0 color-mix(in srgb, var(--accent-dim) 70%, #000),
              0 0 18px -6px var(--accent);                       /* keep the hover glow, add edge */
}
.btn.primary:active {
  transform: translateY(3px);                                   /* drop onto the edge */
  box-shadow: 0 1px 0 color-mix(in srgb, var(--accent-dim) 70%, #000),
              0 0 18px -6px var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .btn.primary { transition: background .2s ease; }             /* keep colour feedback, no movement */
  .btn.primary:active { transform: none; box-shadow: 0 1px 0 color-mix(in srgb, var(--accent-dim) 70%, #000), 0 0 18px -6px var(--accent); }
}
```
**Do NOT add** a ripple element, an overflow-hidden wrapper, or a click-anchored radial (kinetics #08) — that is the rejected treatment.

## Steps (ordered, each independently verifiable)
1. In `css/redesign.css`, extend the `.btn.primary` and `.btn.primary:hover` rules (lines 58-59) and add the `:active` + reduced-motion rules above → verify: `rg -n "btn.primary:active" css/redesign.css` → one match.
2. Confirm the existing shared `.btn:active` scale (css/redesign.css:235) still applies but does not conflict (the primary's `translateY(3px)` is the dominant press cue; the shared `scale(0.985)` may remain) → verify visually the press reads as a depress, not a shrink.
3. Confirm 4px radius and `--accent-soft` are preserved → verify: `rg -n "var(--radius)\|var(--accent-soft)" css/redesign.css` around the `.btn.primary` rules.
4. Confirm NO ripple was added → verify: `rg -n "ripple\|overflow:hidden" css/redesign.css` shows nothing new on `.btn.primary`.

## In scope / out of scope
- In: `css/redesign.css` (`.btn.primary`, `.btn.primary:hover`, new `.btn.primary:active`, new reduced-motion block).
- Out (do not touch): the shared `.btn:active` rule at line 235 (it may stay; do not delete it — other buttons rely on it); `.btn.secondary` / `.btn.danger`; the base `.btn` radius; `--accent-soft` value; `.menu-pop` (plan 021).

## Done criteria (machine-checkable — not "looks better")
- The `@media (prefers-reduced-motion: reduce)` block removes the `translateY` movement while keeping the colour/background feedback — grep-verifiable (`rg -n "prefers-reduced-motion" -A3 css/redesign.css`).
- No ripple: `rg -n "ripple" css/redesign.css` → zero; no new `overflow:hidden` on `.btn.primary`.
- Radius + soft: `.btn.primary` still resolves to `var(--radius)` (4px) and `:hover` still uses `var(--accent-soft)` — grep-verifiable.
- Single accent: the edge shadow is derived from `--accent-dim` (via color-mix with black); no new colour token introduced.
- Visual check: press-and-hold a primary button → screen-record; the button drops ~3px onto its bottom edge and the edge shrinks (a tactile push), then springs back on release; hover still glows. With reduce-motion ON → the button does not move but still shows the colour/edge change on press.

## Escape hatches
- If `.btn.primary` does not exist at this commit, STOP and report — do not apply the depress to `.btn` generally (only the primary action should feel this weighty).
- If adding a bottom `box-shadow` edge collides with an existing elevation shadow on `.btn.primary` and looks doubled, reconcile to a single edge + the hover glow — do not stack three shadows. If unsure, STOP and report.
- If you find yourself adding a `.ripple` span or a JS click handler for a radial, STOP — that is the banned generic treatment.

## Maintenance note
One effect per surface: the depress is the primary button's press feedback — do not also add a ripple or a scale-pop later. The edge colour tracks `--accent-dim`. Keep the reduced-motion branch so the colour cue survives without movement.
