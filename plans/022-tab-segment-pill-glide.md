# 022 — Gliding indicator on the view/segment switch

- **Finding**: [MOTION/INTERACTION] Where the UI switches between chart-tool / view modes, the active mode changes with no moving indicator. A pill that measures the target and glides to it (kinetics.md #05) makes the switch feel physical and shows *where you are* — a considered touch on the console.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion / Interaction   **Effort**: M   **Risk**: MED
- **Depends on**: none.

## Why this matters
DESIGN.md encourages tasteful interaction motion. A gliding pill indicator, in `var(--accent)` at 4px radius, is the canonical "considered segmented control" affordance and reads the current selection at a glance. Under reduced-motion the indicator jumps instantly (no glide).

## Current state (evidence) — READ THE DISCREPANCY NOTE
The brief named "chart-tool/view switch tabs". **At HEAD a75f64c there is NO dedicated tab/segment/pill component** — verified by searching for `.tab`, `.seg`, `.switch`, `.view-tab` class names (none found as a segmented control). What exists:
- **Chart tools** are button-triggered dropdowns (`.menu` + `.menu-pop`, see plan 021) — NOT a segmented tab bar.
- **Mobile view switching** uses `aria-pressed` buttons emitted in `js/ui/mobileui.js:93` (e.g. a set of view-mode buttons that toggle `aria-pressed="false"/"true"`), but there is **no indicator/pill element** and no `.tab`/`.seg` container.
- The registry has an `.op-switch select` (a `<select>` dropdown), not a tab bar.

**Therefore this plan targets the mobile view-mode button group in `js/ui/mobileui.js` as the segmented control** — that is the closest real surface to "view switch tabs". If that group renders as a horizontal row of mode buttons with `aria-pressed` state, it is a genuine segmented control and the pill-glide fits. **Confirm this in Step 1 before building; if it is not a horizontal single-select group, STOP (see escape hatch).**

## Target state
Add a single absolutely-positioned pill indicator inside the view-mode button group; on selection, read the active button's `offsetLeft`/`offsetWidth` and glide the pill to match — **kinetics.md #05 "Tab Pill Glide"**, in `var(--accent)`, 4px radius.

CSS (recoloured to the accent, 4px radius):
```css
/* 022 — Tab Pill Glide indicator; var(--accent), 4px radius */
.view-switch { position: relative; }                     /* the button-group container (confirm real class) */
.view-switch .seg-pill {
  position: absolute; top: 3px; bottom: 3px; left: 0; width: 0;
  border-radius: var(--radius);                          /* 4px */
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  box-shadow: inset 0 0 0 1px var(--accent);
  transition: left .4s cubic-bezier(0.65, 0, 0.35, 1), width .4s cubic-bezier(0.65, 0, 0.35, 1);
  pointer-events: none; z-index: 0;
}
.view-switch button { position: relative; z-index: 1; background: transparent; }
.view-switch button[aria-pressed="true"] { color: var(--accent); }
@media (prefers-reduced-motion: reduce) {
  .view-switch .seg-pill { transition: none; }           /* indicator jumps instantly */
}
```
JS (extend the existing view-switch handler in `js/ui/mobileui.js`): after a mode becomes active, position the pill.
```js
/* 022 — measure the active view button and glide the pill to it */
function positionSegPill(group){
  var pill = group.querySelector('.seg-pill');
  var active = group.querySelector('button[aria-pressed="true"]');
  if (!pill || !active) return;
  pill.style.left = active.offsetLeft + 'px';
  pill.style.width = active.offsetWidth + 'px';
}
```
Call `positionSegPill(group)` (a) once after the group is built and (b) inside the existing click handler right after `aria-pressed` is updated. Inject one `<span class="seg-pill" aria-hidden="true"></span>` as the group's first child when building it.

## Steps (ordered, each independently verifiable)
1. Inspect `js/ui/mobileui.js:93` and around it → confirm the view-mode buttons render as a **horizontal, single-select** group (exactly one `aria-pressed="true"` at a time) inside one container. Record the real container class/id and the handler that flips `aria-pressed`. If it is NOT single-select horizontal, STOP (escape hatch).
2. Add the `<span class="seg-pill" aria-hidden="true">` as the group's first child when the group is built.
3. Add the CSS above, substituting the REAL container class for `.view-switch` → verify: `rg -n "seg-pill" css/` → matches.
4. Add `positionSegPill` and call it after build and after each selection → verify: `rg -n "positionSegPill" js/ui/mobileui.js` → ≥2 calls.
5. Confirm the reduced-motion rule disables the glide → verify: `rg -n "prefers-reduced-motion" css/` covers `.seg-pill`.

## In scope / out of scope
- In: `js/ui/mobileui.js` (inject the pill span + measure/position it) and one CSS file (the `.seg-pill` + container rules — put it where mobile UI CSS lives, e.g. `css/mobile.css`).
- Out (do not touch): the chart-tool dropdown menus (`.menu`/`.menu-pop` — plan 021); the registry `.op-switch select`; the desktop toolbar buttons; the Physics/Geo toggles (plan 019); `--accent`.

## Done criteria (machine-checkable — not "looks better")
- Exactly ONE pill element exists per group and it is `aria-hidden` (decorative) → `rg -n "seg-pill" js/ui/mobileui.js`.
- The `@media (prefers-reduced-motion: reduce)` rule sets the pill `transition: none` so it jumps instantly — grep-verifiable.
- Indicator colour is `var(--accent)` at `var(--radius)` (4px) — grep-verifiable; no second colour.
- The pill's `left`/`width` are measured from the active button (`offsetLeft`/`offsetWidth`), not hardcoded → `rg -n "offsetLeft\|offsetWidth" js/ui/mobileui.js`.
- Visual check: on mobile, switch view modes → screen-record; the periwinkle pill glides to sit behind the newly-selected mode, 4px corners. With reduce-motion ON → the pill jumps instantly to the new mode. On resize/orientation change, the pill re-measures and still aligns (call `positionSegPill` on resize if the group is persistent).

## Escape hatches
- **The described "chart-tool/view switch tabs" do not exist as a tab/segment bar at this commit.** If the mobile view-mode group in `js/ui/mobileui.js` is NOT a horizontal single-select `aria-pressed` group (e.g. it is a dropdown, a vertical list, or multi-select), STOP and report — do not invent a segmented control or bolt a pill onto an unrelated button row.
- If there is genuinely no single-select mode switch anywhere in the app, STOP and report that this plan has no valid surface at this commit — do not fabricate one.
- If measuring `offsetLeft/offsetWidth` returns 0 (group is `display:none` when built), position the pill on first show/`IntersectionObserver`, or STOP and report — do not hardcode pixel positions.

## Maintenance note
The pill must always re-measure from the DOM (never hardcode positions), so it survives label/width changes and localisation. One accent, 4px radius. If a real desktop segmented control is added later, reuse this exact pattern. Keep it `aria-hidden` — state lives in `aria-pressed`, not the pill.
