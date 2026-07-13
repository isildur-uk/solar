# 003 — Make the Registry date-filter fields UK DD/MM, consistent with the rest of the app

- **Finding**: [CONTENT/A11Y] The Registry's "Date of collection" faceted-filter inputs are native `<input type="date">`, which renders US MM/DD/YYYY in most locales — while the app's own report fields and generated text are UK DD/MM/YYYY. The filter UI contradicts the app's stated UK date default (DESIGN.md: "UK date defaults (DD/MM, ambiguous dates flagged)").
- **Written against commit**: 951a0c2  ← executor: run `git rev-parse --short HEAD`; if it differs, re-verify the line numbers and the serialisation behaviour below before editing.
- **Dimension**: Content / i18n / accessibility   **Effort**: M   **Risk**: MED (the filter's stored value format feeds the query layer — see escape hatch, this is the crux)
- **Depends on**: none.

## Why this matters
DESIGN.md, project rules: "British English; UK date defaults (DD/MM, ambiguous dates flagged)." Every authored date field in the Registry form is already a DD/MM text input with a "Format DD/MM/YYYY" hint. The two native `type=date` filter inputs are the outliers — they display MM/DD/YYYY (browser-locale dependent), so an analyst filtering "from 06/03/2026" may mean 6 March but the widget means 3 June. Consistency of date presentation is both a correctness and a trust issue on an NCA-facing tool.

## Current state (evidence)

**The native `type=date` filter inputs** — `registry/app.js:1606-1608`:
```js
    var dateHtml = '<details class="facet"' + ((filterState.dateFrom || filterState.dateTo) ? " open" : "") + '><summary>Date of collection</summary><div class="facet-opts daterange">' +
      '<label>From <input type="date" id="f-date-from" value="' + esc(filterState.dateFrom) + '"></label>' +
      '<label>To <input type="date" id="f-date-to" value="' + esc(filterState.dateTo) + '"></label></div></details>';
```
Their change handlers store the raw widget value (ISO `yyyy-mm-dd`) into `filterState` — `registry/app.js:1659-1660`:
```js
    var dF = document.getElementById("f-date-from"); if (dF) dF.addEventListener("change", function () { filterState.dateFrom = dF.value; filterState.page = 1; showResults(); });
    var dT = document.getElementById("f-date-to"); if (dT) dT.addEventListener("change", function () { filterState.dateTo = dT.value; filterState.page = 1; showResults(); });
```

**The pattern the rest of the form already uses** (DD/MM text field + hint) — `registry/app.js:344-346`:
```js
          '<div class="field"><label for="f-date">Date of collection</label>' +
            '<p class="hint" id="f-date-hint">Format DD/MM/YYYY</p>' +
            '<input id="f-date" type="text" inputmode="numeric" placeholder="DD/MM/YYYY" aria-describedby="f-date-hint" value="' + esc(e.dateOfCollection) + '"></div>' +
```

**The serialisation crux — the filter value is compared as an ISO key.** `registry/core/query.js:68` and `:44`:
```js
    var from = isoKey(criteria.dateFrom), to = isoKey(criteria.dateTo);
```
```js
  function passDate(ir, from, to) { if (!from && !to) return true; var k = dmyKey(ir.dateOfCollection); if (from && k < from) return false; if (to && k > to) return false; return true; }
```
So today the pipeline is: native widget → ISO string in `filterState.dateFrom/To` → `isoKey()` → compared against `dmyKey(report.dateOfCollection)`. The report field is DD/MM; the filter carries ISO. If you switch the filter input to a DD/MM text field, **the value stored in `filterState.dateFrom/To` becomes DD/MM, not ISO** — so `isoKey()` (which expects `yyyy-mm-dd`) will mis-handle it unless you convert. There is a DD/MM→Date parser precedent in `registry/core/demo-seed.js:30` (`parseDMY`). The query tests assume ISO criteria (`registry/tests/query.run.js:45`: `{ dateFrom: "2025-02-01", dateTo: "2025-03-31" }`).

## Target state
Replace the two native `type=date` filter inputs with the app's DD/MM text-field idiom (matching `registry/app.js:344-346`): `type="text" inputmode="numeric" placeholder="DD/MM/YYYY"` with a validator and ambiguous-date flag, **while preserving the value format that the query layer consumes**.

The safe design: keep `filterState.dateFrom/To` in **ISO** (so `query.js` `isoKey`/`passDate` and `tests/query.run.js` are untouched), and convert DD/MM ⇄ ISO at the input boundary only:
```js
// on change: parse the DD/MM the analyst typed → ISO for filterState
function dmyToISO(s){ var m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s||"").trim()); return m ? m[3]+"-"+m[2]+"-"+m[1] : ""; }
// on render: show the stored ISO back as DD/MM in the text box
function isoToDMY(s){ var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||"")); return m ? m[3]+"/"+m[2]+"/"+m[1] : ""; }
```
- Render: `value="' + esc(isoToDMY(filterState.dateFrom)) + '"`.
- On change: `filterState.dateFrom = dmyToISO(dF.value);` — empty/invalid input clears the filter (and, if partially typed and ambiguous/invalid, flag with the same `.field-error`/`invalid` treatment the form uses, `registry/styles.css:165-166`).
- Ambiguous-date flag: if both day and month are ≤ 12 the value is unambiguous as typed (DD/MM is explicit), but flag genuinely invalid entries (e.g. 32/01, 13/13) inline rather than silently ignoring.

## Steps (ordered, each independently verifiable)
1. Confirm the current serialisation: in the running Registry, open the Date-of-collection facet, pick a From date, and log `filterState.dateFrom` — expect an ISO `yyyy-mm-dd` string. **This is the format you must preserve.**
2. Replace the two `type="date"` inputs at `registry/app.js:1607-1608` with DD/MM text inputs (mirror `:344-346`: `inputmode="numeric"`, `placeholder="DD/MM/YYYY"`, `aria-describedby` a hint), rendering the stored ISO back through `isoToDMY()`.
3. Update the change handlers at `registry/app.js:1659-1660` to run the typed value through `dmyToISO()` before assigning to `filterState`, and to add the `invalid` class + a `.field-error` message on an unparseable non-empty value.
4. Verify no query change is needed: `filterState.dateFrom/To` still hold ISO, so `query.js` and `registry/tests/query.run.js` pass unchanged. Run the registry tests → expect green.
5. Visual check: the filter now shows DD/MM, matching the "Date of collection" form field and the results table's Date column.

## In scope / out of scope
- **In**: `registry/app.js` — the facet date inputs (`:1606-1608`), their change handlers (`:1659-1660`), and a small local DD/MM⇄ISO helper pair.
- **Out (do not touch)**: `registry/core/query.js` (leave `passDate`/`isoKey`/`dmyKey` as-is — the whole point is to keep the criteria ISO). The form's Date-of-collection / Date-of-Intelligence / Date-Created fields (`registry/app.js:344-359`) are already DD/MM — do not rework them. `filterState` shape/keys. The chip labels at `:1511-1512` (they show `filterState.dateFrom` — if it stays ISO they will show ISO; if that reads oddly, convert *display only* via `isoToDMY`, but do not change the stored value).

## Done criteria (machine-checkable — not "looks better")
- The Date-of-collection facet renders `input[type=text]` with `placeholder="DD/MM/YYYY"` — no `input[type=date]` remains in `registry/app.js` (`grep -n 'type="date"' registry/app.js` → zero hits).
- `filterState.dateFrom`/`dateTo` still hold ISO `yyyy-mm-dd` after a filter is applied (confirm in DevTools).
- `registry/tests/query.run.js` passes unchanged (run the registry test runner).
- Typing `13/13/2026` into the From box surfaces an inline invalid state, not a silently-ignored filter.
- Visual check: the filter's displayed date and the results-table Date column both read DD/MM/YYYY for the same report.

## Escape hatches
- **STOP-and-report condition (the escape hatch from the brief):** if step 1 shows the filter's stored value is NOT ISO — i.e. the query layer already consumes DD/MM, or serialisation differs from what this plan assumes — do NOT proceed with the ISO-boundary conversion. Report the actual stored format so the conversion can be re-specified. Keyboard entry and value serialisation must be preserved exactly.
- If a shared DD/MM parser/validator already exists in the registry core (search `registry/core/` for `parseDMY`/date validation — `demo-seed.js:30` has one but it is module-local), prefer reusing it over hand-rolling; if none is exported, keep the helper local to `app.js` rather than adding a new module.

## Maintenance note
The invariant to defend in review: `filterState.dateFrom/To` are ISO; DD/MM lives only at the input surface. Anyone adding a new date filter should follow the same boundary-conversion pattern, not re-introduce `type=date`.
