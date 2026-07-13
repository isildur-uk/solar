# 021 — Swap the menu/popover open easing for a spring-glide curve

- **Finding**: [MOTION] Menus/popovers (`.menu-pop`, `#ct-pop`) open with the `menuIn` keyframe on a plain `ease` timing function. A glide curve (`cubic-bezier(0.16,1,0.3,1)`) makes the open feel like it settles into place rather than linearly easing — a small but noticeable polish.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
DESIGN.md encourages tasteful transition motion on panel/menu open. Swapping the linear-ish `ease` for the glide curve from kinetics.md #06 (Accordion Spring easing, `cubic-bezier(0.16,1,0.3,1)`) gives popovers a considered "arrive and settle" feel. This is a **pure easing swap** — no new elements, no new colour, no geometry change. It is already inside the popovers' existing motion, which is covered by the app's reduced-motion handling.

## Current state (evidence)
- Source: `css/redesign.css:116-127` — `.menu-pop` and its keyframe:
  ```css
  .menu-pop {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 60;
    …
    border-radius: var(--radius);
    box-shadow: var(--shadow-2);
    animation: menuIn .14s ease;
  }
  @keyframes menuIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  ```
- Source: `css/redesign.css:139-144` — `#ct-pop` shares the popover styling (background/border/radius/shadow) but its rule as shown does NOT set `animation` — confirm whether `#ct-pop` also uses `menuIn` (it may inherit via a shared class, or it may be static). Check before assuming.
- Rendered: menus/popovers fade + nudge down over 140ms on a plain `ease` — fine, but a touch flat.

## Target state
Change ONLY the timing function of the popover open animation from `ease` to the glide curve. Keep the 140ms duration (or nudge to ~180ms for a touch more settle — reviewer's call; duration change is optional, curve change is the point):
```css
.menu-pop {
  …
  animation: menuIn .14s cubic-bezier(0.16, 1, 0.3, 1);   /* glide easing (kinetics #06) */
}
```
If `#ct-pop` also animates on open with `menuIn` (confirm in Step 1), apply the same curve there:
```css
#ct-pop { …; animation: menuIn .14s cubic-bezier(0.16, 1, 0.3, 1); }
```
Do NOT change the `menuIn` keyframe's from/to values (geometry stays: `translateY(-4px)` → `none`, opacity 0 → 1). No new elements.

Reduced-motion: this is already inside the popovers' existing coverage. Confirm the app has a global reduced-motion rule that neutralises such animations; if a popover-specific guard is expected but missing, add:
```css
@media (prefers-reduced-motion: reduce) {
  .menu-pop, #ct-pop { animation-duration: .01s; }
}
```

## Steps (ordered, each independently verifiable)
1. Confirm which popovers use `menuIn` → run: `rg -n "menuIn\|animation:" css/redesign.css` → expect: `.menu-pop` uses it; determine whether `#ct-pop` (or a shared class on it) also does.
2. Replace `ease` with `cubic-bezier(0.16, 1, 0.3, 1)` in the `.menu-pop` animation (and `#ct-pop` if it animates) → verify: `rg -n "cubic-bezier(0.16, ?1, ?0.3, ?1)" css/redesign.css` → match(es) on the popover rule(s).
3. Confirm the `menuIn` keyframe body is unchanged → verify: `git diff css/redesign.css` shows only the timing-function token changed on the `animation:` line(s).
4. Confirm reduced-motion coverage (global rule or the small guard above) neutralises the popover open → verify: `rg -n "prefers-reduced-motion" css/redesign.css css/app.css` and confirm popovers are covered.

## In scope / out of scope
- In: `css/redesign.css` — the `animation:` timing function on `.menu-pop` (and `#ct-pop` if it animates), plus a reduced-motion guard only if one is not already covering them.
- Out (do not touch): the `menuIn` keyframe from/to values; the popover geometry, background, border, `--radius`, `box-shadow`/`--shadow-2`; any JS that opens/closes menus; `.btn.primary` (plan 020).

## Done criteria (machine-checkable — not "looks better")
- `rg -n "menuIn .14s ease" css/redesign.css` → **zero** (the plain `ease` is gone from the popover open).
- `rg -n "cubic-bezier(0.16, ?1, ?0.3, ?1)" css/redesign.css` → matches the popover animation rule(s).
- The `menuIn` keyframe is unchanged (`git diff` shows no edit to `@keyframes menuIn`).
- Reduced-motion: popovers open near-instantly under `prefers-reduced-motion: reduce` — grep-verifiable via the global rule or the added guard.
- Visual check: open a chart-tool menu and the `#ct-pop` popover → screen-record; the open now glides and settles (slightly decelerated arrival) rather than a flat ease. With reduce-motion ON → the popover appears with effectively no animation.

## Escape hatches
- If `.menu-pop` or the `menuIn` keyframe does not exist at this commit, STOP and report — do not invent a popover animation.
- If `#ct-pop` does NOT animate on open (no `menuIn`), leave it static — do not add an animation to it just to match; the plan is a curve swap on whatever already animates.
- If changing the curve makes the popover visibly overshoot/wobble (the glide curve should not, but if the keyframe geometry interacts oddly), keep the curve and reduce the duration — do not switch to a springy overshoot curve; popovers should settle, not bounce.

## Maintenance note
Pure easing swap — no elements or colours touched. If more popovers are added later, give them the same `menuIn` + glide curve for consistency. Keep them inside reduced-motion coverage.
