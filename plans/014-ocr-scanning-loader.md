# 014 — Replace the OCR/extract spinner with a "scanning" cosmic loader

- **Finding**: [MOTION/STATES] The OCR overlay shows a generic top-border rotating ring (`.ocr-spin`). It reads as a boilerplate spinner, not as *the system scanning an image*. On a showcase intel console, the extract step is a moment to signal "Solar is reading this" with brand-appropriate motion.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion / States   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
DESIGN.md's Showcase motion contract explicitly *wants* tasteful kinetic feedback on the extract flow, provided it (1) is gated behind `prefers-reduced-motion: reduce`, (2) uses only the periwinkle/violet/entity palette, (3) respects the 4px radius / hairline language, and (4) is one effect per surface. A conic "comet" ring (or a sweeping radar) reads as *scanning* far better than a plain border-top spinner, and it amplifies the cosmic brand. This is a decorative loader over a transient overlay — it carries no data, so it is squarely inside the "atmospheric decoration permitted" allowance.

## Current state (evidence)
- Source: `css/mobile.css:157-165` — the current ring + its keyframe + the existing reduced-motion guard:
  ```css
  #ocr-overlay .ocr-spin {
    width: 34px; height: 34px; margin: 0 auto 12px;
    border: 3px solid var(--line, #2a2a27); border-top-color: var(--accent, #8ea2ff);
    border-radius: 50%; animation: ocr-spin 0.9s linear infinite;
  }
  @keyframes ocr-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    #ocr-overlay .ocr-spin { animation: none; }
  }
  ```
- Source (JS hook, do not change): `js/ui/ocr.js:31` injects the element:
  ```js
  el.innerHTML = '<div class="ocr-card"><div class="ocr-spin" aria-hidden="true"></div>' + …
  ```
  Keep the class name `ocr-spin` and the `aria-hidden="true"` — only the CSS changes.
- Rendered: OCR overlay, mobile. A thin grey ring with one periwinkle arc rotating — indistinguishable from any framework default spinner.

## Target state
Recolour **css-loaders.md #14 "Korona"** (conic comet ring) to the periwinkle accent and apply it to the existing `.ocr-spin` element — no markup change, no JS change. Keep the ~34px footprint. The comet's tail is a `conic-gradient` masked to a ring, which reads as a sweep/scan.

Apply to the existing selector (do NOT rename the class; the JS injects `ocr-spin`):
```css
/* 014 — Korona comet ring, recoloured to the periwinkle accent (--ink = var(--accent)) */
#ocr-overlay .ocr-spin {
  width: 34px; height: 34px; margin: 0 auto 12px;
  --ink: var(--accent, #8ea2ff);
  border: 0;                 /* drop the old border ring */
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 10%, var(--ink));
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 5px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 5px));
  animation: ocr-korona 1s linear infinite;
}
@keyframes ocr-korona { to { transform: rotate(360deg); } }
```

**Alternative (only if the comet ring is judged too subtle on the mobile overlay):** css-loaders.md **#22 "Radar-X"** (sweeping radar), same recolour `--ink: var(--accent)`, same ~34-40px footprint. Pick ONE — one effect per surface.

Reduced-motion: extend the existing guard to disable the NEW keyframe (the old `ocr-spin` keyframe is gone):
```css
@media (prefers-reduced-motion: reduce) {
  #ocr-overlay .ocr-spin { animation: none; }
}
```

## Steps (ordered, each independently verifiable)
1. In `css/mobile.css`, replace the `#ocr-overlay .ocr-spin` rule (lines ~157-161) with the Korona version above → verify: `rg -n "conic-gradient" css/mobile.css` → expect: one match inside the `.ocr-spin` rule.
2. Replace the `@keyframes ocr-spin` with `@keyframes ocr-korona` (or keep the name `ocr-spin` if you prefer — but then keep the keyframe name consistent everywhere) → verify: the `animation:` line and the `@keyframes` name match exactly (`rg -n "ocr-korona\|ocr-spin" css/mobile.css`).
3. Confirm the reduced-motion guard still targets `#ocr-overlay .ocr-spin` and now disables the new animation → verify: `rg -n "prefers-reduced-motion" css/mobile.css` shows the block, and it contains `#ocr-overlay .ocr-spin { animation: none; }`.
4. Do NOT touch `js/ui/ocr.js` → verify: `git diff --name-only` lists only `css/mobile.css`.

## In scope / out of scope
- In: `css/mobile.css` (the `.ocr-spin` rule, its `@keyframes`, and the existing reduced-motion guard).
- Out (do not touch): `js/ui/ocr.js` (the class name and markup stay); any other loader (`.loading-state .dot` is plan 015's territory); `--accent` token value.

## Done criteria (machine-checkable — not "looks better")
- The `@media (prefers-reduced-motion: reduce)` block in `css/mobile.css` disables the new keyframe on `#ocr-overlay .ocr-spin` — grep-verifiable (`rg -n "prefers-reduced-motion" -A2 css/mobile.css`).
- The loader paints only `var(--accent)` — no hardcoded hex other than the `#8ea2ff` fallback already inside `var(--accent, #8ea2ff)`, and NO second colour → `rg -n "conic-gradient" css/mobile.css` shows only `transparent` + `var(--ink)`.
- axe: no new contrast failures on the OCR overlay (the loader is `aria-hidden`, so it is decorative — confirm axe still passes on the overlay card text).
- Visual check: trigger the OCR overlay on mobile → screenshot the spinner; it shows a periwinkle comet ring sweeping (a bright head fading to a transparent tail), ~34px, on the hairline-bordered `.ocr-card`. With OS "reduce motion" ON → screenshot again: the ring is static.

## Escape hatches
- If the selector `#ocr-overlay .ocr-spin` or the injected class `ocr-spin` does not exist at this commit, STOP and report — do not invent a new element or restyle a different overlay.
- If `var(--accent)` is not defined in scope for `css/mobile.css` (it is defined in `css/app.css:17`; the fallback `#8ea2ff` covers the gap), keep the `var(--accent, #8ea2ff)` fallback form and note it — do not hardcode a bare hex.

## Maintenance note
One effect per surface: this loader is the ONLY motion on the OCR overlay — do not stack a second animation on `.ocr-card`. If the accent token changes, this loader follows it automatically via `var(--accent)`. Keep the reduced-motion guard adjacent to the rule so future edits keep them together.
