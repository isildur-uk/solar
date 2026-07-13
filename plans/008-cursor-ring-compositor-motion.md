# 008 — Drive the cursor ring with transform:scale, not width/height/margin

- **Finding**: [MOTION] `#solar-cursor-ring` animates `width`, `height` and `margin` on hover state (`.hot`). These are layout-triggering properties — each frame forces layout + paint instead of running on the compositor. The effect is already reduced-motion-gated and hidden on coarse pointers (good), but it still animates the wrong properties.
- **Written against commit**: 951a0c2
- **Dimension**: Motion / Performance   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
Animating `width`/`height`/`margin` runs the browser's layout stage on every frame of the transition; the smooth path is to animate `transform` (and `opacity`), which the compositor handles off the main thread. The ring follows the pointer, so any main-thread hitch is directly felt as cursor lag. The craft principle is *animate compositor-only properties (transform/opacity)*. Switching the grow-on-hover from width/height to `transform: scale()` off a fixed base box gives a pixel-identical result with none of the layout cost.

## Current state (evidence)
- Source: `css/motion.css:98-110` — base ring, sized in px with a centring margin, transitioning layout properties:
  ```css
  #solar-cursor-ring {
    width: 38px;
    height: 38px;
    margin: -19px 0 0 -19px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.55);
    mix-blend-mode: difference;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 240ms ease, width 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
                height 260ms cubic-bezier(0.34, 1.56, 0.64, 1), margin 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  ```
- Source: `css/motion.css:118-123` — the hover state grows the ring by re-setting width/height/margin:
  ```css
  #solar-cursor-ring.hot {
    width: 76px;
    height: 76px;
    margin: -38px 0 0 -38px;
    border-color: rgba(255, 255, 255, 0.85);
  }
  ```
- Gating already present (do NOT remove): `css/motion.css:390` hides the ring at the narrow breakpoint, and `:402` `#solar-cursor-dot, #solar-cursor-ring { display: none !important; }` under `prefers-reduced-motion: reduce`. The ring is hero-cover scoped via `body.solar-cursor-on #hero-cover` (`:125-126`).
- Rendered: on the hero cover, moving the pointer over an interactive region grows the ring from 38px to 76px with a springy overshoot. Visual target to preserve exactly: 38px → 76px (a 2× scale), same spring easing, same centring on the pointer, label fades in.

## Target state
Keep the base box a fixed 38px and centre it once with margin; drive size purely with `transform: scale()`. 38→76px is exactly `scale(2)`. Move the border-colour change onto its own (cheap) transition; the spring easing now rides `transform`.

```css
#solar-cursor-ring {
  width: 38px;
  height: 38px;
  margin: -19px 0 0 -19px;          /* fixed centring — never animated now */
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.55);
  mix-blend-mode: difference;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(1);
  transform-origin: center;
  transition: opacity 240ms ease,
              transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
              border-color 200ms ease;
}
#solar-cursor-ring.hot {
  transform: scale(2);              /* 38px → 76px, identical to old width/height */
  border-color: rgba(255, 255, 255, 0.85);
}
```

**Watch the transform-origin / centring**: the base ring is centred on the pointer by `margin: -19px 0 0 -19px` (half of 38px). Because `transform-origin: center` scales about the ring's own centre, the scaled ring stays centred on the pointer — no margin change needed. Confirm this in the visual check.

## Steps (ordered, each independently verifiable)
1. Replace the `#solar-cursor-ring` block (`css/motion.css:98-110`) with the Target base block (add `transform: scale(1)` + `transform-origin: center`; swap the width/height/margin transitions for a single `transform` transition; keep `opacity`; add `border-color`) → verify: `rg -n "transition:.*width" css/motion.css` → expect: NO match inside the cursor-ring rule.
2. Replace the `.hot` block (`css/motion.css:118-123`) with the Target `.hot` (drop width/height/margin; add `transform: scale(2)`; keep the border-color change) → verify: `rg -n "solar-cursor-ring.hot" css/motion.css -A4` → expect: `transform: scale(2)` and NO width/height/margin.
3. Confirm no other rule sets width/height/margin on `.hot` → run: `rg -n "solar-cursor-ring" css/` → expect: only the two edited rules plus the `display:none` gates at :390 and :402.

## In scope / out of scope
- In: `css/motion.css` (the `#solar-cursor-ring` base rule and its `.hot` rule only).
- Out (do not touch): the reduced-motion block (`:394-403`), the breakpoint `display:none` (`:390`), `#solar-cursor-dot`, `.lbl` opacity transition (`:111-124`), and the JS that adds/removes `.hot` (behaviour is unchanged — it still just toggles the class).

## Done criteria (machine-checkable — not "looks better")
- `rg -n "width|height|margin" css/motion.css` shows NO width/height/margin inside the cursor-ring `transition` or inside the `.hot` rule (the base 38px width/height/margin static declarations stay).
- The ring `transition` property contains `transform` and does NOT contain `width`, `height`, or `margin`.
- In Chrome DevTools → Performance, record a hover over the hero cover: the ring grow shows no `Layout` events attributable to the ring (only `Composite`/`Paint`), unlike before.
- Reduced-motion still hides the ring (toggle "Emulate prefers-reduced-motion: reduce" → ring `display:none`).
- Visual check: screenshot the hero cover mid-hover — the ring is the same 76px, same spring overshoot, same centring on the pointer, label visible — indistinguishable from the pre-change screenshot. Verify the ring does NOT drift off the pointer as it grows (transform-origin check).

## Escape hatches
- If the ring visibly shifts off the pointer when growing, the centring assumption is wrong for this markup — STOP and report; do not "fix" it by re-introducing animated margin.
- If `mix-blend-mode: difference` interacts oddly with the transform layer (colour flicker), keep the transform change but report the blend-mode observation rather than removing the blend mode.

## Maintenance note
The ring is now a fixed 38px box scaled at runtime. If the desired hover size changes, adjust only the `scale()` factor (target px ÷ 38), never re-introduce animated width/height. Any new hover size class should also use `transform: scale()`.
