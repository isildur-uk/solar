# 023 — Accessible tooltips on grade chips explaining the 3×5×2 grade

- **Finding**: [A11Y/CONTENT/TRUST] `.grade-chip` shows a provenance grade (the 3×5×2 admiralty-style code) but nothing explains what it means. An analyst hovering a chip gets no legend. A CSS `data-tip` tooltip, revealed on hover AND keyboard focus, explains the grade — without ever animating the grade value itself (a trust surface).
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Accessibility / Content / Trust   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
DESIGN.md, Trust-critical surfaces: provenance grading "must read as defensible to an NCA-literate viewer". A grade code with no explanation is opaque; a concise tooltip legend makes it defensible and self-documenting. Crucially, the tooltip is opacity-only reveal — the **grade value itself is never animated** (animating a confidence/grade would undercut trust). Revealing on `:hover` AND `:focus-visible` gives keyboard parity (WCAG). Under reduced-motion the reveal is instant.

## Current state (evidence)
- Source: `registry/styles.css:616-618` — the grade chip (already has `cursor:pointer`, no tooltip):
  ```css
  .grade-chip{font:700 12px/1 var(--mono);color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:3px;padding:3px 8px;cursor:pointer}
  .grade-chip:hover{background:rgba(142,162,255,.22)}
  .grade-chip{font-size:14px;padding:4px 11px;display:inline-flex;align-items:center}
  ```
- Source (JS): `registry/app.js:818` builds `.grade-chip`. It has a click handler (opens an explanation modal) but NO `data-tip` attribute and NO inline tooltip.
- Tokens in `registry/styles.css` `:root`: `--accent:#8ea2ff`, `--accent-soft:rgba(142,162,255,0.14)`, `--panel:#131311`, `--line:#2a2a27`. **`--accent-2` is NOT defined in `registry/styles.css`** — do not reference it here.
- Rendered: a periwinkle grade chip; hovering brightens the background but explains nothing.

## Target state
Apply **tooltips.md #01 "Top"** as a pure-CSS `data-tip` tooltip on `.grade-chip`, revealed on `:hover` AND `:focus-visible`, opacity-only, `--tip-bg = var(--panel)`. The tooltip text explains the 3×5×2 grade (source reliability × info credibility × handling, or the app's actual grade legend — read the modal copy at `registry/app.js:818` to reuse the CORRECT wording; do not invent a legend).

CSS (recoloured: `--tip-bg: var(--panel)`, hairline border, opacity-only). Scope the base `.tip` rules to `.grade-chip` so they don't leak:
```css
/* 023 — Top tooltip on grade chips; opacity-only; --tip-bg = var(--panel); hover + focus-visible */
.grade-chip { position: relative; --tip-bg: var(--panel); --tip-fg: var(--text); --tip-radius: var(--radius); --tip-gap: 8px; }
.grade-chip::after {                     /* bubble */
  content: attr(data-tip);
  position: absolute; z-index: 20;
  left: 50%; bottom: calc(100% + var(--tip-gap)); transform: translateX(-50%);
  padding: 6px 10px; border-radius: var(--tip-radius);
  background: var(--tip-bg); color: var(--tip-fg);
  border: 1px solid var(--line);         /* hairline, per the border language */
  font: 600 11px/1.3 var(--mono); letter-spacing:.02em; text-transform:none;
  max-width: 240px; white-space: normal;
  pointer-events: none; opacity: 0;
  transition: opacity .2s ease;          /* opacity-only reveal — NO transform/scale on reveal */
}
.grade-chip::before {                    /* arrow */
  content:""; position:absolute; z-index:20;
  left:50%; bottom:100%; transform:translateX(-50%);
  border:6px solid transparent; border-top-color: var(--tip-bg);
  pointer-events:none; opacity:0; transition:opacity .2s ease;
}
.grade-chip:hover::after, .grade-chip:focus-visible::after,
.grade-chip:hover::before, .grade-chip:focus-visible::before { opacity: 1; }
.grade-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }   /* keyboard reachable */
@media (prefers-reduced-motion: reduce) {
  .grade-chip::after, .grade-chip::before { transition-duration: .01s; }   /* instant reveal */
}
```
JS: at `registry/app.js:818`, add `data-tip="…"` to each grade chip with the correct legend text (reuse the modal's explanation copy), and ensure the chip is keyboard-focusable (`tabindex="0"` if it is a non-button element, or make it a `<button>`). Do NOT animate the grade value — the chip's inner text (the grade) stays static; only the tooltip fades.

## Steps (ordered, each independently verifiable)
1. Read the grade-explanation copy the modal already uses (near `registry/app.js:818`) → reuse it (condensed) as the `data-tip` text. Do NOT write a new legend from scratch.
2. In `registry/app.js:818`, add `data-tip="<legend>"` to the grade chip and make it focusable (`tabindex="0"` if not a button) → verify: `rg -n "data-tip" registry/app.js` → match on the grade chip.
3. Add the tooltip CSS above to `registry/styles.css` near the `.grade-chip` rules → verify: `rg -n "grade-chip::after" registry/styles.css` → one match.
4. Confirm the reveal is opacity-only (no transform on the reveal state) and the grade value is NOT animated → verify: `rg -n "grade-chip" -A2 registry/styles.css` shows `transition: opacity` only, and no keyframe/transform touches the chip text.
5. Confirm hover AND focus-visible both reveal → keyboard-Tab to a chip; the tooltip appears.

## In scope / out of scope
- In: `registry/styles.css` (the `.grade-chip` tooltip rules + reduced-motion guard) and `registry/app.js:818` (add `data-tip` + focusability).
- Out (do not touch): the grade VALUE text/format; the click-to-open-modal behaviour (keep it — the tooltip is additive, not a replacement); `--accent-2` (not defined here); other chips/badges (`.sh-count`, `.oc-count` — plan 016); the modal copy itself.

## Done criteria (machine-checkable — not "looks better")
- The tooltip reveals on BOTH `:hover` and `:focus-visible` — grep-verifiable (`rg -n "grade-chip:focus-visible::after" registry/styles.css`).
- `--tip-bg` resolves to `var(--panel)`; the bubble has a `var(--line)` hairline border — grep-verifiable.
- The reveal is opacity-only: `rg -n "grade-chip::after" -A6 registry/styles.css` shows `transition: opacity …` and NO `transform`/`scale` in the reveal; the grade value has no animation anywhere.
- The `@media (prefers-reduced-motion: reduce)` block makes the reveal instant — grep-verifiable.
- Keyboard: Tab reaches the chip (focus ring is periwinkle `var(--accent)`) and the tooltip shows on focus. axe: no new contrast failure — verify the tooltip text (`--text` on `--panel`) meets ≥4.5:1.
- Visual check: hover a grade chip → the legend bubble fades in above it with a hairline border on the `--panel` background; the grade code itself does not move or animate. Tab to the chip → same bubble appears. With reduce-motion ON → the bubble appears instantly.

## Escape hatches
- If `.grade-chip` does not exist at this commit, STOP and report — do not attach the tooltip to a different badge.
- If you cannot find the grade-explanation copy the modal uses, STOP and report — do NOT invent a grade legend; the wording must be the app's real, defensible definition (this is a trust surface).
- If the grade chip's text ever gets an animation as part of this work, STOP — the grade VALUE must never animate (DESIGN.md trust rule). Only the tooltip fades.
- If the tooltip text fails ≥4.5:1 contrast on `--panel`, adjust `--tip-fg` to a token that passes (e.g. `--text`) — do not ship a low-contrast tooltip; do not introduce a new colour.

## Maintenance note
The tooltip is a legend, not a control — keep the click-to-modal for the full explanation. Never animate the grade value. If the grade scheme changes, update the `data-tip` copy from the single source (the modal legend), not by hand in two places. One accent, hairline border, opacity-only.
