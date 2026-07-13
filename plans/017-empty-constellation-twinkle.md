# 017 — Gently twinkle the empty-state constellation

- **Finding**: [MOTION/EMPTY-STATE] The empty chart state (`#chart-empty`) shows a static periwinkle constellation SVG. DESIGN.md explicitly names "a gently twinkling empty-state constellation" as *wanted* brand-atmospheric decoration. It is currently inert.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion / Empty state   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
DESIGN.md, Imagery: "Brand-atmospheric decoration IS permitted where it carries no data… a gently twinkling empty-state constellation… Ceiling: decorative opacity ≤ 0.5; must not sit over live data." The empty state is the one place with no data to compete with, so a very gentle opacity/scale micro-oscillation is on-brief and lifts a dead screen to considered. There is already a `solar-twinkle` keyframe in the tree — reuse it, don't invent a new one (one effect per surface; no new colour).

## Current state (evidence)
- Source (HTML): `index.html:98-104`:
  ```html
  <div id="chart-empty">
    <svg class="constellation" viewBox="0 0 220 120" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1">
        <path d="M30 92 82 34 138 66 196 22" opacity=".5"/>
        <path d="M82 34 110 96 138 66" opacity=".35"/>
      …
  ```
- Source (CSS): `css/app.css:155`:
  ```css
  #chart-empty .constellation { width: 190px; color: var(--accent); opacity: 0.45; }
  ```
  `var(--accent)` = periwinkle `#8ea2ff`; base opacity `0.45` (already ≤ 0.5 ceiling).
- Source (existing keyframe): `css/solar.css:68-73`:
  ```css
  animation: solar-twinkle 7s ease-in-out infinite alternate;
  …
  @keyframes solar-twinkle {
    from { opacity: 0.55; }
    to   { opacity: 1; }
  }
  ```
  NOTE: the existing keyframe animates opacity `0.55 → 1`, which would exceed the ≤0.5 empty-state ceiling if applied verbatim to the constellation. Do NOT reuse it verbatim for `#chart-empty`; instead add a dedicated, ceiling-safe keyframe (below) OR wrap the constellation's opacity in a scale so the base stays at 0.45. See Target.
- Rendered: chart pane, empty (no case loaded) — a static faint periwinkle constellation.

## Target state
A gentle, slow micro-oscillation on `#chart-empty .constellation` that keeps the **opacity ceiling ≤ 0.5** and never competes with data (there is none in this state). Because the in-tree `solar-twinkle` peaks at opacity 1 (too bright for this surface), use a dedicated ceiling-safe keyframe that oscillates within 0.32–0.48 and adds a barely-perceptible scale:
```css
/* 017 — empty-state constellation twinkle; opacity ceiling ≤ 0.5 per DESIGN.md */
#chart-empty .constellation {
  width: 190px; color: var(--accent); opacity: 0.45;
  transform-origin: center;
  animation: chart-empty-twinkle 7s ease-in-out infinite alternate;
}
@keyframes chart-empty-twinkle {
  from { opacity: 0.32; transform: scale(0.992); }
  to   { opacity: 0.48; transform: scale(1.008); }
}
@media (prefers-reduced-motion: reduce) {
  #chart-empty .constellation { animation: none; opacity: 0.45; }
}
```
This is a gentle opacity/scale oscillation in the spirit of `solar-twinkle` but ceiling-safe. If a reviewer prefers literally reusing the `solar-twinkle` name, it may be reused ONLY if its peak opacity is ≤ 0.5 — which today it is not, so a dedicated keyframe is the compliant choice.

## Steps (ordered, each independently verifiable)
1. In `css/app.css`, extend the `#chart-empty .constellation` rule (line 155) with `transform-origin`, `animation`, add the `@keyframes chart-empty-twinkle`, and add the reduced-motion guard → verify: `rg -n "chart-empty-twinkle" css/app.css` → two matches (rule + keyframe).
2. Confirm the animation's opacity range never exceeds 0.5 → verify: `rg -n "chart-empty-twinkle" -A4 css/app.css` shows `from{opacity:0.32…}` `to{opacity:0.48…}`.
3. Add/confirm the reduced-motion guard disables the animation and restores base opacity 0.45 → verify: `rg -n "prefers-reduced-motion" css/app.css` includes a block for `#chart-empty .constellation`.
4. Do NOT edit `index.html` (the SVG markup and `aria-hidden` stay) → verify: `git diff --name-only` lists only `css/app.css`.

## In scope / out of scope
- In: `css/app.css` (the `#chart-empty .constellation` rule + one new keyframe + reduced-motion guard).
- Out (do not touch): `index.html` (SVG markup); `css/solar.css` (the existing `solar-twinkle` keyframe belongs to another surface — do not repoint or edit it); the constellation `stroke`/`opacity` on individual `<path>`s inside the SVG; `--accent`.

## Done criteria (machine-checkable — not "looks better")
- The `@media (prefers-reduced-motion: reduce)` block disables the new keyframe on `#chart-empty .constellation` — grep-verifiable.
- The animation's opacity stays ≤ 0.5 at all keyframes — grep-verifiable (`rg -n "opacity:0.4\|opacity: 0.4\|opacity:0.3" -A0 css/app.css` around the keyframe; no value > 0.5 appears in `chart-empty-twinkle`).
- Colour is unchanged: the rule still uses `color: var(--accent)`; no second colour introduced.
- axe: no new issues (SVG is `aria-hidden`, decorative).
- Visual check: open the app with no case loaded → screen-record the empty state; the constellation breathes very gently (barely perceptible brightening + micro-scale), never brighter than ~0.5 opacity. With reduce-motion ON → static at 0.45.

## Escape hatches
- If `#chart-empty` or `.constellation` does not exist at this commit, STOP and report — do not attach the twinkle to a different element.
- If reusing the exact in-tree `solar-twinkle` keyframe is mandated by a reviewer, first confirm its peak opacity is ≤ 0.5; if it still peaks at 1 (as at this commit), STOP and use the dedicated ceiling-safe keyframe instead — do NOT let the empty-state constellation exceed opacity 0.5.

## Maintenance note
This is the only motion on the empty state (one effect per surface). The opacity ≤ 0.5 ceiling is a hard DESIGN.md rule for decorative surfaces over the workbench — if anyone raises the peak in review, reject it. Keep the effect slow (7s) so it never draws the eye away from the "load a case" call to action.
