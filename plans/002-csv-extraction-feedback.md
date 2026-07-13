# 002 — Give the CSV import / text-extract flow real feedback (loading, empty, error, confirmation)

- **Finding**: [STATES/INTERACTION] The core import/extract flow — the product's USP — runs almost silently. No busy state on the button while a large paste/CSV parses synchronously (main thread blocks, UI looks frozen); a zero-result extract opens an empty review modal; a zero-row CSV import reports as success; and a completed review commit shows no confirmation toast.
- **Written against commit**: 951a0c2  ← executor: run `git rev-parse --short HEAD`; if it differs, re-verify the line numbers below.
- **Dimension**: Interaction / feedback states   **Effort**: M   **Risk**: MED (touches the commit path — test the happy path still charts)
- **Depends on**: none. (Independent of 001, but if 001 is done first, reuse `var(--accent)` for any new state styling.)

## Why this matters
Feedback on progress, emptiness, error, and success is the baseline of a trustworthy tool — and DESIGN.md's project rule is that "trust-critical surfaces… must read as defensible to an NCA-literate viewer." A demo where a big paste appears to hang, a zero-hit extract opens a blank modal, and a deliberate approve produces no acknowledgement reads as half-baked — the opposite of the "excellent over half-baked" bar in DESIGN.md.

## Current state (evidence)

**A. "Extract →" runs synchronously off the click, no busy state** — `js/ui/app.js:134-139`:
```js
    U.el("paste-run").addEventListener("click", function () {
      var t = U.el("paste-text").value;
      if (!t.trim()) return;
      U.closeModal("paste-veil");
      window.CRReview.open(t);   // <- synchronous extract, blocks the main thread on large paste
    });
```
`CRReview.open` immediately calls the synchronous extractor — `js/ui/review.js:22-25`:
```js
  function open(text, name) {
    sourceText = text;
    sourceName = name || "";
    result = window.CRExtract.extract(text, { dateFormat: store.meta.dateFormat });
```

**B. Zero-result extract opens an EMPTY review modal.** `review.js:43-56` iterates `result.entities` (possibly empty) then unconditionally `U.openModal("review-veil")`. There is no zero-entity guard. The modal's card area (`#review-cards`, `index.html:209`) renders only a bulk toolbar with non-functional Accept buttons over nothing.

**C. A zero-row CSV import is phrased as success** — `js/ui/importer.js:203-209`:
```js
    store._emit("import");
    U.closeModal("csv-veil");
    parsed = null;
    if (window.CRApp) {
      window.CRApp.afterImport();
      window.CRApp.status(added + " added, " + matched + " matched existing, " + links + " links — run Deconflict to review fuzzy duplicates");
    }
```
When `added===0 && matched===0 && links===0` this still reads as a normal success line.

**D. The text-extract review COMMIT never calls `status()`** — `js/ui/review.js:448-450`:
```js
    U.closeModal("review-veil");
    if (window.CRApp) window.CRApp.afterImport();
  }
```
`afterImport()` (`app.js:436-443`) refits the chart and updates counts but shows **no** toast — a deliberate analyst approval gets no acknowledgement.

**Reusable pieces that already exist:**
- Toast: `CRApp.status(msg)` (`app.js:422-427`) writes `#status-msg`, which has `role="status" aria-live="polite"` (`index.html:142`) — so a `status()` call is announced to screen readers.
- A `.loading-state` with a pulsing `.dot` already exists in `registry/styles.css:240-243` (registry only). The charting app has no equivalent class yet — see escape hatch.
- The CSV "Import →" button is `#csv-commit` (`index.html:255`); "Extract →" is `#paste-run` (`index.html:197`). Both `.btn`. `.btn:disabled` is already styled (`css/app.css:131`, opacity 0.4).

## Target state
1. **Busy state on Extract and Import.** On click, set the triggering button `disabled` and `aria-busy="true"`, show a lightweight "Working…" cue, and **yield one animation frame** (`requestAnimationFrame`, or `setTimeout(fn, 0)`) before running the synchronous parse so the busy paint lands. Clear the busy state when the modal opens (or on error).
2. **Zero-result guard on extract.** If `result.entities.length === 0` (and no relationships/events), do **not** open the review modal empty. Instead show a designed message and keep the paste modal open (or reopen it): e.g. call `CRApp.status("No entities recognised — check the text, or add manually")` and return. Optionally render a one-line empty note in the paste modal body.
3. **Error-style CSV toast.** When `added + matched + links === 0`, branch to an error phrasing, e.g. `CRApp.status("No entities imported — check the column mapping")`. (If a distinct error style is wanted, gate on the existing `#status-msg.ok` class; see escape hatch — do not invent new CSS unless a matching class already exists.)
4. **Confirmation toast on review commit.** At the end of `review.js commit()`, count what was committed and call `CRApp.status(...)`, e.g. `status(nEntities + " entities · " + nLinks + " links added to chart")`.

Illustrative shape for A/B (adapt to house style — plain ES5, no new deps, this codebase uses IIFE + `var`):
```js
// app.js paste-run handler
U.el("paste-run").addEventListener("click", function () {
  var t = U.el("paste-text").value;
  if (!t.trim()) return;
  var btn = U.el("paste-run");
  btn.disabled = true; btn.setAttribute("aria-busy", "true");
  requestAnimationFrame(function () {
    U.closeModal("paste-veil");
    window.CRReview.open(t);           // open() now guards zero-result internally
    btn.disabled = false; btn.removeAttribute("aria-busy");
  });
});
```
```js
// review.js open(), right after extract:
result = window.CRExtract.extract(text, { dateFormat: store.meta.dateFormat });
if (!result.entities.length && !result.relationships.length && !(result.events||[]).length) {
  if (window.CRApp) window.CRApp.status("No entities recognised — check the text, or add manually");
  U.openModal("paste-veil");          // let the analyst edit and retry
  return;
}
```

## Steps (ordered, each independently verifiable)
1. Wrap the `paste-run` handler (`app.js:134-139`) to set `disabled`+`aria-busy`, yield a frame, then open review and clear busy → verify in browser: paste ~50KB of text, click Extract → the button shows a disabled/busy state before the modal appears (no frozen-with-no-feedback gap).
2. Add the zero-result guard at the top of `review.js open()` after the `extract` call → verify: paste gibberish with no entities, click Extract → a "No entities recognised…" toast shows and NO empty review modal opens.
3. Do the same busy treatment on `#csv-commit` in `importer.js commit()` (or its click wiring at `app.js:178`) → verify: import a large CSV → the Import button shows busy before the modal closes.
4. Branch the CSV toast on zero result in `importer.js:206-209` → verify: import a CSV whose columns are all set to `skip` → the toast reads as an error/no-op, not "0 added…" success.
5. Add a confirmation `status()` at the end of `review.js commit()` (`review.js:448-450`), counting committed entities and links → verify: run Demo 1, Extract, Accept all HIGH, Add to chart → a toast reads e.g. "N entities · M links added to chart".

## In scope / out of scope
- **In**: `js/ui/app.js` (paste-run handler + optionally csv-commit wiring), `js/ui/review.js` (`open()` zero-guard, `commit()` toast), `js/ui/importer.js` (`commit()` zero-branch + busy). New CSS only if you reuse an existing class.
- **Out (do not touch)**: the extraction logic itself (`js/core/extract.js`), the matching/normalisation (`js/core/match.js`), `updateSummary()`'s live per-card counter (`review.js:323-351`) — that is a different surface. Do not change what counts as an entity.

## Done criteria (machine-checkable — not "looks better")
- Extract on a large paste shows a disabled/`aria-busy` button before the review modal opens (verify in DevTools: the button carries `disabled` and `aria-busy="true"` during the yielded frame).
- Pasting entity-free text does **not** open `#review-veil`; `#status-msg` (`role="status"`) receives "No entities recognised…" text.
- A CSV import that produces 0 added/0 matched/0 links writes an error-phrased line to `#status-msg`, not the standard success line.
- After a text-extract commit, `#status-msg` is non-empty and names the count added.
- Happy path regression: Demo 1 → Extract → Accept all HIGH → Add to chart still populates the chart (entities appear in `#chart`), and `#status-counts` updates.

## Escape hatches
- If there is **no** existing error/success style class for `#status-msg` in the charting app (there is `.ok` set on the element in `index.html:142`; check `css/app.css`/`redesign.css` for an error variant), do NOT invent a new colour system — just change the message wording and, at most, toggle an existing class. Report that a dedicated error toast style is a follow-up.
- The `.loading-state` dot class lives in `registry/styles.css` and is NOT available to `index.html`. Do not import registry CSS into the charting app. Use `disabled`+`aria-busy`+text ("Working…") for the busy cue instead, unless you add a small equivalent to `css/app.css` (keep it to the existing token palette).
- If yielding a frame before `extract()` breaks any existing test or the drag-drop ingest path (`js/ui/dragdrop.js` also calls `CRReview.open`), STOP and report rather than restructuring the extractor to be async.

## Maintenance note
`CRReview.open` is called from at least two entry points (paste-run in `app.js`, and drag-drop/file ingest). The zero-result guard lives inside `open()` so every caller benefits — keep it there rather than duplicating at each call site. Watch that the busy-clear runs even if `open()` throws (consider try/finally).
