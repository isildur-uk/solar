# 009 — Fix two widescreen density nits (empty overlap rail + ragged op-grid)

- **Finding**: [RESPONSIVE] At wide viewports the registry report-detail page reserves a fixed 292px right rail even when there is no cross-report overlap (leaving ~20% blank beside the content), and the operations grid uses `auto-fill` which produces a ragged last row plus a dead right gutter at 1440px.
- **Written against commit**: 951a0c2
- **Dimension**: Responsive / Layout density   **Effort**: M   **Risk**: MED
- **Depends on**: none.

## Why this matters
Reserved empty space and ragged grids are the classic "the layout doesn't respond to its content" tell — the page looks broken at exactly the wide widths analysts use. The craft principle is *space should be earned by content*: a column that holds nothing should not push the main content into 78% of the width, and a card grid should fill its row or centre, not trail off with a dead gutter. Both are wide-viewport-only, so the fixes must be scoped so nothing changes below the existing breakpoints.

## Current state (evidence)

### (a) Overlap rail reserved even when empty
- Source: `registry/styles.css:468-473` — ≥901px the detail page becomes a 2-column grid with a hard 292px second track; the rail is placed in column 2 whether or not it has items:
  ```css
  @media (min-width: 901px) {
    .detail.page { display: grid; grid-template-columns: minmax(0, 1fr) 292px; column-gap: 22px; align-items: start; }
    .detail.page > .detail-head { grid-column: 1 / -1; }
    .detail.page > .overlap-rail { grid-column: 2; grid-row: 2 / span 999; align-self: start; position: sticky; top: 72px; float: none; width: auto; margin: 0; }
    .detail.page > :not(.detail-head):not(.overlap-rail) { grid-column: 1; min-width: 0; }
  }
  ```
- Real content hook (verified): when there is no overlap, the rail's JS (`registry/app.js:1091`) sets its innerHTML to only `<h3>Also appears in</h3><p class="ov-none">…</p>` — i.e. **no `.ov-report` child**. When there ARE overlaps (`app.js:1096`) it emits one or more `.ov-report` children. So "has items" is exactly "contains a `.ov-report`".
- Rendered: report-detail at 1440px with a report that shares no entities — the 292px right track sits empty (just the "No other report shares these entities" line), content pinned to the left ~78%.

### (b) Ragged op-grid at 1440px
- Source: `registry/styles.css:335` — `auto-fill` with a 220px min creates as many columns as fit, so the last row is ragged and the right gutter is dead when the item count doesn't fill the final row:
  ```css
  .op-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem}
  ```
- Rendered: operations index at 1440px — a partial last row leaves a wide empty band to the right; the `.6rem` (~9.6px) gap is also off the 8px grid.

## Target state

### (a) Collapse the rail to full-width content when it has no `.ov-report`
Use `:has()` (supported in the evergreen browsers this app targets — verify in the escape hatch) to switch the grid to a single full-width column when the rail holds no report items:
```css
@media (min-width: 901px) {
  /* when the rail actually has overlap items, keep the 2-col split (unchanged) */
  .detail.page:has(.overlap-rail .ov-report) {
    display: grid; grid-template-columns: minmax(0, 1fr) 292px; column-gap: 22px; align-items: start;
  }
  .detail.page:has(.overlap-rail .ov-report) > .detail-head { grid-column: 1 / -1; }
  .detail.page:has(.overlap-rail .ov-report) > .overlap-rail {
    grid-column: 2; grid-row: 2 / span 999; align-self: start; position: sticky; top: 72px; float: none; width: auto; margin: 0;
  }
  .detail.page:has(.overlap-rail .ov-report) > :not(.detail-head):not(.overlap-rail) { grid-column: 1; min-width: 0; }

  /* no overlaps: single full-width column; hide the empty rail entirely */
  .detail.page:not(:has(.overlap-rail .ov-report)) { display: block; }
  .detail.page:not(:has(.overlap-rail .ov-report)) > .overlap-rail { display: none; }
}
```
(Hiding the empty rail is cleaner than showing the "No other report…" placeholder in a reserved column — the placeholder is redundant when the analyst can see the report simply has no cross-links. If Chart Room prefers to keep the placeholder inline, instead of `display:none` let the rail flow full-width below the content — flag this as a product choice, do not decide silently.)

### (b) Cap / centre the op-grid and snap the gutter to 8px
Two acceptable fixes — pick one and record which:
- **Preferred (cap columns + centre):** cap the column count so the grid centres rather than trailing a dead gutter:
  ```css
  .op-grid{
    display:grid;
    grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
    gap:8px;                 /* was .6rem — snapped to the 8px grid */
    max-width:calc(4 * 220px + 3 * 8px);   /* cap at 4 columns */
    margin-inline:auto;
  }
  ```
- **Alternative (fill the row):** swap `auto-fill` → `auto-fit` so columns stretch to fill the row (no dead gutter, but very wide cards at 1440px):
  ```css
  .op-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
  ```
Prefer the cap+centre unless cards look too narrow; record the choice in a one-line decision comment above the rule.

## Steps (ordered, each independently verifiable)
1. Confirm the content hook is real → run: `rg -n "ov-report|ov-none" registry/app.js` → expect: `.ov-none` emitted when list is empty (app.js:1089,1091), `.ov-report` emitted per overlap (app.js:1096).
2. Replace the `@media (min-width: 901px)` block (`registry/styles.css:468-473`) with the Target (a) `:has()`-gated version → verify: `rg -n ":has\(.overlap-rail .ov-report\)" registry/styles.css` → expect: ≥3 matches.
3. Edit `registry/styles.css:335` to the chosen op-grid Target (b) with `gap:8px` → verify: `rg -n "op-grid" registry/styles.css` → expect: `gap:8px` present, no `.6rem`.
4. Load registry report-detail for a report with NO overlaps at 1440px; then one WITH overlaps at 1440px; then the operations index at 1440px.

## In scope / out of scope
- In: `registry/styles.css` (line 335, and the `@media (min-width: 901px)` block at 468-473 only).
- Out (do not touch): the `≤900px` mobile stacking rule (`registry/styles.css:465` `@media (max-width: 900px)`), `registry/app.js` (the rail-population logic is correct; only its output classes are used as a hook — do not change them), `.overlap-rail` base styling (`:456-464`), `.op-card` (`:336-341`).

## Done criteria (machine-checkable — not "looks better")
- On a no-overlap report at 1440px: the `.overlap-rail` is `display:none` (or flows full-width per the recorded product choice) and the main content spans the full container — no empty reserved 292px track (confirm in DevTools: `.detail.page` computed `grid-template-columns` is a single track, or `display:block`).
- On a report WITH overlaps at 1440px: layout is unchanged from before (2-col, 292px rail, sticky) — verify identical to the pre-change screenshot.
- `.op-grid` computed `gap` is `8px` (not `9.6px`); at 1440px there is no dead right gutter wider than one grid gap (grid is capped-and-centred, or fully filled).
- Below 901px both fixes are inert: registry stacks exactly as before (screenshot at 375px unchanged).
- Visual check: three screenshots at 1440px (no-overlap detail, with-overlap detail, ops index) plus one at 375px — first shows full-width content, second unchanged, third has no ragged dead gutter, fourth stacks unchanged.

## Escape hatches
- If `:has()` is unsupported in a target browser (check the project's browser support statement / `README.md`), STOP and report — do NOT fall back to a JS class toggle without confirming that's wanted; a class hook on `.detail.page` set by `renderOverlaps` in `registry/app.js` is the sanctioned fallback, but that touches out-of-scope JS so it needs sign-off.
- If hiding the empty rail removes information Chart Room wants kept, use the "flow full-width below content" variant instead and record it — do not silently drop the placeholder.
- If `--radius`/tokens referenced by adjacent rules differ from expectation, do not touch them; only the two rules named here change.

## Maintenance note
The rail's visibility now depends on it emitting `.ov-report` children — if `registry/app.js` ever changes that class name, this CSS silently stops collapsing. Leave a comment on the `:has()` rule pointing at `registry/app.js`'s `renderOverlaps`. If a 5th op-card column is ever wanted, raise the `max-width` cap; don't remove it.
