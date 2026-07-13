# 016 — Smooth count-up on result-count changes (eased, no bounce)

- **Finding**: [MOTION] Result counters (`.result-count strong`, `.sh-count`, `.oc-count`) snap instantly to a new number when a filter or search changes. A brief eased count-up gives the change a sense of *the console re-tallying*, without gamifying it. Also: these three are NOT currently `tabular-nums`, so digits shift as the number changes — that must be fixed first or the count-up will jitter horizontally.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Motion   **Effort**: M   **Risk**: MED
- **Depends on**: none.

## Why this matters
DESIGN.md mandates tabular numerals for all counts/metrics and permits tasteful interaction motion. A **smooth, eased** count-up (kinetics.md #03 stripped of its spring) reads as considered on an intel console; a **springy/bouncy** count reads as gamified and undercuts the defensible tone DESIGN.md demands. This is the explicit tone-down: **ease, do not overshoot.** Tabular numerals are a hard DESIGN.md rule and a prerequisite — without them the animating digits jump sideways.

## Current state (evidence)
- Source: `registry/styles.css:319` — `.result-count strong` (colour only, NO tabular-nums):
  ```css
  .result-count strong{color:var(--text)}
  ```
- Source: `registry/styles.css:697` — `.sh-count` (mono, NO explicit tabular-nums):
  ```css
  .sh-count{font:700 11px var(--mono);color:var(--accent);background:var(--accent-soft);border-radius:10px;padding:2px 9px;margin-right:8px}
  ```
- Source: `registry/styles.css:344` — `.oc-count` (mono, NO tabular-nums):
  ```css
  .op-card .oc-count{font-size:.74rem;color:var(--accent-dim);font-family:var(--mono)}
  ```
- JS that writes these numbers:
  - `.result-count` (with `<strong>` wrapper) built at `registry/app.js:1626`
  - `.sh-count` textContent set at `registry/app.js:685`
  - `.oc-count` textContent set at `registry/app.js:1549`
- Rendered: registry filter results. Change a facet → the count jumps instantly; on `.result-count strong` (proportional numerals) the digits also shift width.

## Target state
Two parts.

**(A) Tabular numerals (DESIGN.md rule, prerequisite).** Add `font-variant-numeric: tabular-nums;` to all three:
```css
.result-count strong{ color:var(--text); font-variant-numeric:tabular-nums; }
.sh-count{ font:700 11px var(--mono); color:var(--accent); background:var(--accent-soft); border-radius:10px; padding:2px 9px; margin-right:8px; font-variant-numeric:tabular-nums; }
.op-card .oc-count{ font-size:.74rem; color:var(--accent-dim); font-family:var(--mono); font-variant-numeric:tabular-nums; }
```

**(B) Eased count-up (kinetics.md #03 "Number Counter" — SPRING REMOVED).** Add a tiny shared helper that animates the displayed integer from its previous value to the new value with an **ease-out** curve and **no scale/overshoot**. This replaces the direct `el.textContent = n` at the three call sites.
```js
/* 016 — eased count-up; ease-out, NO spring/bounce (gamified tone banned on an intel console).
   Respects prefers-reduced-motion: sets the final value instantly. */
function countUp(el, to, ms){
  to = Number(to) || 0;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    el.textContent = String(to); return;
  }
  var from = Number(String(el.textContent).replace(/[^\d-]/g,'')) || 0;
  if (from === to){ el.textContent = String(to); return; }
  var dur = ms || 380, start = performance.now();
  function frame(now){
    var t = Math.min(1, (now - start) / dur);
    var eased = 1 - Math.pow(1 - t, 3);           /* ease-out cubic — no overshoot */
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = String(to);              /* land exactly on the value */
  }
  requestAnimationFrame(frame);
}
```
Then at each site, swap the direct assignment for `countUp(el, newValue)`. **Note:** where the label contains extra text (e.g. `.result-count` shows `"N results"`), animate only the numeric `<strong>` node, and leave the surrounding words static — do not animate a string that mixes words and digits.

**No CSS transform / scale is added** — the kinetics #03 `.bump { transform: scale(1.25)… }` and its spring cubic-bezier are deliberately NOT used here.

## Steps (ordered, each independently verifiable)
1. Add `font-variant-numeric:tabular-nums` to the three rules (`registry/styles.css:319, 344, 697`) → verify: `rg -n "tabular-nums" registry/styles.css` gains three matches on those selectors.
2. Add the `countUp` helper once (e.g. near the top of `registry/app.js`, or wherever shared UI helpers live) → verify: `rg -n "function countUp" registry/app.js` → one match.
3. At `registry/app.js:685` (`.sh-count`) and `:1549` (`.oc-count`), replace `x.textContent = value` with `countUp(x, value)` → verify: `rg -n "countUp(" registry/app.js` → matches at both.
4. At `registry/app.js:1626` (`.result-count`), animate ONLY the `<strong>` numeric node with `countUp(strongEl, count)`; keep the words around it static → verify by reading the built markup: the digits animate, the word "results" does not flicker.
5. Confirm the reduced-motion path: the helper checks `prefers-reduced-motion` and sets the value instantly → verify: with OS reduce-motion ON, the number changes with no interpolation.

## In scope / out of scope
- In: `registry/styles.css` (lines 319, 344, 697 — add tabular-nums only), `registry/app.js` (the helper + the three call sites at 685, 1549, 1626).
- Out (do not touch): the grade value / `.grade-chip` (trust surface — plan 023 forbids animating the grade); any count that already has tabular-nums (`.pager .pg-info` at 322, `.facet-opt .c` at 309); the number formatting/locale logic — only the display animation changes.

## Done criteria (machine-checkable — not "looks better")
- `rg -n "tabular-nums" registry/styles.css` → the three target selectors now include it.
- `rg -n "cubic-bezier(0.34, ?1.56\|scale(1.2" registry/` → **zero** matches introduced by this plan (proof there is no spring/bounce).
- The `countUp` helper returns instantly (sets final text) when `matchMedia('(prefers-reduced-motion: reduce)').matches` — grep-verifiable (`rg -n "prefers-reduced-motion" registry/app.js`).
- Visual check: change a facet so a count changes by a large delta → screen-record the counter; it counts up smoothly and **settles without overshooting** (never displays a number past the target then backs off). The digits do not shift horizontally (tabular-nums). With reduce-motion ON → the number jumps instantly.

## Escape hatches
- If any of `.result-count strong`, `.sh-count`, `.oc-count` does not exist at this commit, apply the plan only to those that do and report the missing one — do not invent a counter.
- If a count-bearing element mixes words and digits in a single text node with no separate numeric child, STOP and report that site — do not animate a mixed word+number string (it would garble the label). Animate only isolated numeric nodes.
- If you find yourself adding a `transform: scale()` or a spring cubic-bezier, STOP — that is the banned gamified treatment; the effect here is ease-out interpolation of the integer only.

## Maintenance note
Any new counter should use `countUp` + tabular-nums for consistency. Never apply this to a grade/confidence value (trust surface). Keep the ease-out curve — if a future dev "improves" it into a spring, that violates the DESIGN.md defensible-tone rule.
