# 006 — Retire the orphan `.detail dl` flat layout; confirm the report-detail layouts before any unification

- **Finding**: [HIERARCHY] The prompt described a flat two-column `.detail dl` "wall" that renders decision-critical facts (Confidence, Status, Handling, Marking) with no lead, coexisting with a richer `.meta-grid`/`.detail-facts` layout. **Verification against commit 951a0c2 found the `.detail dl` rule has NO live consumer in the report-detail render paths** — it is orphan CSS. The trust-critical facts already lead via better layouts. This plan removes the dead rule and documents what actually renders, and it STOPS short of forcing a single layout because the two live render paths legitimately diverge (see escape hatch — which is triggered).
- **Written against commit**: 951a0c2  ← executor: run `git rev-parse --short HEAD`; if it differs, re-verify the grep results below, because the whole premise depends on `.detail dl` having no consumer.
- **Dimension**: Visual hierarchy / dead-code   **Effort**: S   **Risk**: LOW (removing unused CSS) — but see the STOP condition before attempting any layout merge.
- **Depends on**: none.

## Why this matters
The brief's concern — that a flat definition-list buries Confidence/Handling/Marking — is real design guidance (DESIGN.md: trust-critical facts must lead). But the fix the brief imagined ("retire the plain `.detail dl` in favour of the chip strip") is already effectively done in the render code: **no report-detail path emits `<dl class="detail…">`**. What remains is (1) a dead CSS rule to remove so future agents don't resurrect the flat wall, and (2) an honest record that the two *live* layouts differ by design, which is exactly the escape-hatch "STOP and report" condition rather than a silent merge.

## Current state (evidence)

**The `.detail dl` flat-wall rule exists** — `registry/styles.css:175-177`:
```css
.detail dl{display:grid;grid-template-columns:200px 1fr;gap:.5rem .75rem;margin:.5rem 0 1.5rem}
.detail dt{color:var(--faint);font-size:.85rem}
.detail dd{margin:0;color:var(--text)}
```
plus a mobile override at `registry/styles.css:426`:
```css
  .detail dl { grid-template-columns: 1fr; gap: .15rem .75rem; }
  .detail dt { margin-top: .5rem; }
```

**No report-detail render emits `<dl class="detail…">`.** The only `<dl>` anywhere in `registry/app.js` is the explain drawer, which uses its own `.dr-dl` class (not `.detail dl`) — `registry/app.js:577-581`:
```js
      + '<dl class="dr-dl">'
      ...
      + '</dl>'
```
`.dr-dl` is styled separately at `registry/styles.css:630-634` and is unaffected by `.detail dl`.

**The TWO live report-detail layouts (they diverge by design):**
- **Full-page report view** — `registry/app.js:822` onward — uses the NCA "house-format IR document": `.ir-doc` → `.ir-hdr` (`irHdr(...)`) → `.ir-si` (`irSiRow(...)`), e.g. `:833-845`. This is the primary read view and already promotes URN / Operation / Date / Status / Handling / Confidence into structured header cells.
- **Compare panes** (side-by-side, up to 3) — `buildReportReadHTML`, `registry/app.js:996-1032` — uses `.detail-facts` chip strip (`:1016-1021`: URN, op, marking, status) + `.meta-grid` cells (`:1022-1027`: Date, Threat area, Confidence, Handling code). Styled `registry/styles.css:181-186`, `:220-224`.

So the flat `.detail dl` is consumed by **neither** live path. The chip-strip/meta-grid the brief wanted is already the compare layout; the full-page view uses an even richer IR-document layout.

## Target state
1. **Remove the orphan `.detail dl` / `.detail dt` / `.detail dd` rules** (`registry/styles.css:175-177`) and their mobile override (`:425-428` block, the `.detail dl` / `.detail dt` lines) — dead CSS that only invites a future flat-wall regression. (Leave the `.dr-dl` drawer rules alone.)
2. **Do NOT force the full-page IR-document view and the compare `.meta-grid` view into one layout.** They serve different jobs (a single authoritative NCA-format read vs. a compact 3-up comparison) and diverge structurally — per the brief's own escape hatch this is a STOP-and-report, not a silent unify. Record the divergence (below) so it's an intentional decision, not drift.
3. If, after review, a genuine hierarchy weakness remains in a *live* path (e.g. within `.ir-si`, Confidence/Handling not leading), raise it as a **separate** targeted plan against `.ir-si-row`/`.ir-grade` — do not retrofit `.meta-grid` over the IR document.

## Steps (ordered, each independently verifiable)
1. Confirm the premise still holds at the current commit: `grep -n 'class="detail' registry/app.js` and `grep -n '<dl' registry/app.js` → expect the only `<dl>` to be `dr-dl` (`:577`), and NO `<dl class="detail…">`. **If a `.detail dl` consumer now exists, STOP — this plan's premise is void; report it.**
2. Delete `registry/styles.css:175-177` (`.detail dl`, `.detail dt`, `.detail dd`) → verify: `grep -n '\.detail dl' registry/styles.css` → zero hits.
3. Delete the `.detail dl` / `.detail dt` lines in the mobile block at `registry/styles.css:425-428` (keep the surrounding `@media` block and any other rules in it) → verify the media query still parses (no dangling braces).
4. Load a report (full page) and a compare view (2–3 reports) → verify both render exactly as before (nothing depended on `.detail dl`).

## In scope / out of scope
- **In**: `registry/styles.css` — removal of the orphan `.detail dl`/`dt`/`dd` rules (`:175-177`) and their mobile override lines (`:426-427`).
- **Out (do not touch)**: `.dr-dl` drawer rules (`:630-634`) and their `<dl class="dr-dl">` markup (`app.js:577-581`). The full-page IR-document layout (`.ir-doc`/`.ir-hdr`/`.ir-si`, `app.js:822+`, styles `:544-583`). The compare `.detail-facts`/`.meta-grid` layout (`app.js:996-1032`, styles `:181-186`/`:220-224`). Do NOT attempt to merge the two live layouts in this plan.

## Done criteria (machine-checkable — not "looks better")
- `grep -n '\.detail dl' registry/styles.css` → zero hits (rule and mobile override both gone).
- `grep -n '<dl class="detail' registry/app.js` → zero hits (confirms nothing was relying on it).
- The full-page report view and the compare view both render unchanged (visual diff before/after removal shows no change).
- The `.dr-dl` explain drawer still renders correctly (it must be untouched).

## Escape hatches
- **STOP-and-report (explicitly triggered by this finding):** the brief asked to unify the report-detail layout, but the two live render paths (full-page IR document vs. compare `.meta-grid`) diverge *structurally and by intent*. Do not unify them. Report that the flat `.detail dl` was dead CSS (removed) and that unification of the two live layouts is a product decision, not a mechanical fix.
- If step 1 shows a `.detail dl` consumer has appeared since commit 951a0c2, STOP — do not delete the rule; re-scope against the real markup.
- If removing the rule changes any rendered view, STOP — something depended on it that this analysis missed; report the affected view.

## Maintenance note
The report-detail hierarchy now lives entirely in `.ir-*` (full page) and `.detail-facts`/`.meta-grid` (compare). Reviewers should reject any new `<dl class="detail…">` — it would reintroduce the flat wall this plan removed. If the two live layouts ever need to converge, do it as a deliberate design task with its own plan and screenshots, not as a CSS tidy.
