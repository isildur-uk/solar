# 015 — Replace the single pulsing dot with a considered panel/seed loader

- **Finding**: [MOTION/STATES] The registry panel loading state is a single pulsing dot (`.loading-state .dot`). One dot fading in and out is the most generic loading cue there is; it does not read as "Solar is fetching/seeding this panel."
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion / States   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
DESIGN.md permits — and on a showcase piece, encourages — tasteful loading motion, provided it is reduced-motion-gated, uses only the brand palette, respects the hairline/4px language, and is one effect per surface. A small equaliser (or SVG arc) in the dim accent reads as active work without shouting, and lifts a generic-looking panel to considered. It is decorative, carries no data, and sits on a transient state — inside the permitted allowance.

## Current state (evidence)
- Source: `registry/styles.css:241-244` — the container, the dot, its keyframe, and the existing reduced-motion guard:
  ```css
  .loading-state{color:var(--faint);font-family:var(--mono);font-size:.9rem;padding:2rem 0;display:flex;align-items:center;gap:.6rem}
  .loading-state .dot{width:.55rem;height:.55rem;border-radius:50%;background:var(--accent-dim);animation:pulse 1.1s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
  @media(prefers-reduced-motion:reduce){.loading-state .dot{animation:none}}
  ```
- Tokens available in `registry/styles.css:23` `:root`: `--accent:#8ea2ff; --accent-dim:#6f7fe0; --accent-soft:rgba(142,162,255,0.14)`.
- Rendered: registry panel, while loading — a mono "loading" line with one dim-periwinkle dot pulsing beside it.

## Target state
Recolour **css-loaders.md #04 "Delta-V"** (equaliser bars) to `--accent-dim`, ~40px footprint, and use it in place of the single dot. The markup lives in the injected HTML — see the escape hatch: if the loader element is generated in JS as a lone `.dot`, you may either (a) change the JS to emit the 5-bar markup, or (b) keep a single element and use the SVG-arc alternative below which needs no extra children.

**Preferred — Delta-V bars** (needs 5 child `<i>` elements):
```css
/* 015 — Delta-V equaliser, recoloured to --accent-dim (--ink) */
.loading-state .ld-bars{ display:flex; gap:6px; align-items:center; height:40px; --ink:var(--accent-dim); }
.loading-state .ld-bars i{
  width:6px; height:100%;
  border-radius:var(--radius);           /* 4px — respects the radius scale */
  background:var(--ink);
  animation:ld-bars 1s ease-in-out infinite;
}
.loading-state .ld-bars i:nth-child(1){animation-delay:0s}
.loading-state .ld-bars i:nth-child(2){animation-delay:.12s}
.loading-state .ld-bars i:nth-child(3){animation-delay:.24s}
.loading-state .ld-bars i:nth-child(4){animation-delay:.36s}
.loading-state .ld-bars i:nth-child(5){animation-delay:.48s}
@keyframes ld-bars{ 0%,100%{transform:scaleY(.3);opacity:.35} 50%{transform:scaleY(1);opacity:1} }
```
Markup: `<div class="ld-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`

**Alternative — Meridian SVG arc (#20)**, if you must keep a single injected element and cannot add child `<i>`s. Recolour `--ink: var(--accent-dim)`, ~40px:
```css
.loading-state .ld-dashring{ width:40px; height:40px; --ink:var(--accent-dim); animation:ld-spin 1.6s linear infinite; }
.loading-state .ld-dashring circle{ fill:none; stroke:var(--ink); stroke-width:4; stroke-linecap:round; animation:ld-dashring 1.4s ease-in-out infinite; }
@keyframes ld-dashring{ 0%{stroke-dasharray:1 150;stroke-dashoffset:0} 50%{stroke-dasharray:90 150;stroke-dashoffset:-35} 100%{stroke-dasharray:90 150;stroke-dashoffset:-124} }
@keyframes ld-spin{ to{transform:rotate(360deg)} }
```
Markup: `<svg class="ld-dashring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/></svg>`

Pick ONE. Reuse the existing reduced-motion guard, retargeted to the new class(es):
```css
@media(prefers-reduced-motion:reduce){
  .loading-state .ld-bars i,
  .loading-state .ld-dashring, .loading-state .ld-dashring circle{ animation:none }
}
```

## Steps (ordered, each independently verifiable)
1. Find where `.loading-state` / `.dot` markup is emitted → run: `rg -n "loading-state\|class=\"dot\"\|'dot'" registry/` → expect: the JS (or template) that builds the loading block. This decides Preferred vs Alternative.
2. Replace the injected `.dot` with either the 5-bar `.ld-bars` markup (Preferred) or the `.ld-dashring` SVG (Alternative). Keep `aria-hidden="true"`.
3. In `registry/styles.css`, replace the `.loading-state .dot` rule + `@keyframes pulse` with the chosen loader CSS above → verify: `rg -n "ld-bars\|ld-dashring" registry/styles.css` → expect: matches for the chosen one only.
4. Update the reduced-motion guard to target the new class(es) → verify: `rg -n "prefers-reduced-motion" registry/styles.css` shows the block disabling the new animation.

## In scope / out of scope
- In: `registry/styles.css` (the `.loading-state .dot` rule, `@keyframes pulse`, the reduced-motion guard) and the one JS/template spot that emits the loader markup (from step 1).
- Out (do not touch): the `.loading-state` container rule itself (keep its layout/`--faint` text); any other loader (OCR spinner is plan 014); the `--accent-dim` token value; result-count elements (plan 016).

## Done criteria (machine-checkable — not "looks better")
- The `@media (prefers-reduced-motion: reduce)` block in `registry/styles.css` disables the NEW keyframe(s) — grep-verifiable (`rg -n "prefers-reduced-motion" -A2 registry/styles.css`).
- The loader paints only `var(--accent-dim)` — `rg -n "ld-bars\|ld-dashring" -A6 registry/styles.css` shows `--ink:var(--accent-dim)` and no second colour.
- No orphaned `@keyframes pulse` remains if nothing else uses it → `rg -n "animation:pulse\|animation: pulse" registry/` → if zero other consumers, the `pulse` keyframe is removed; if other consumers exist, leave it.
- Visual check: trigger a panel load in the registry → screenshot the loader: a ~40px dim-periwinkle equaliser (or arc) animating, 4px-radius bars, beside the mono loading text. With "reduce motion" ON → screenshot: static.

## Escape hatches
- If `.loading-state .dot` does not exist at this commit, or the loader is not injectable markup you can extend, STOP and report — do not restyle a different panel or invent a new loading container.
- If adding child `<i>` elements to the loader is not possible (markup is locked), use the **Meridian SVG-arc alternative**, which needs only one element. Do not stack both.
- If `--accent-dim` is undefined in `registry/styles.css` scope, STOP and report (it is defined at `registry/styles.css:23`) — do not hardcode `#6f7fe0`.

## Maintenance note
One effect per surface — this is the only motion in the loading state. If a future panel needs a longer/streaming load, keep this same loader rather than introducing a second style. Colour tracks `--accent-dim` automatically.
