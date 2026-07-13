# 004 — Accent discipline: theme native controls to the accent; stop the permanent accent card-rail

- **Finding**: [A11Y/BRAND] Two accent problems in the Registry. (a) Native radios/selects render OS-blue — a *second* accent on safety-critical fields (submitter, handling code), because `accent-color` is only set on one toggle. (b) The periwinkle accent is used as a permanent decorative left-rail on every card at rest, so the accent stops signalling "selected/active" (accent fatigue). DESIGN.md's non-negotiable is "one UI accent."
- **Written against commit**: 951a0c2  ← executor: run `git rev-parse --short HEAD`; if it differs, re-verify the line numbers.
- **Dimension**: Colour / accessibility / brand   **Effort**: S–M   **Risk**: LOW
- **Depends on**: **001** (the accent of record must be ratified as `#8ea2ff` first — this plan wires controls and card states to `var(--accent)`).

## Why this matters
DESIGN.md non-negotiables: "one UI accent." Two failures undercut it. First, native `<input type=radio>` and `<select>` dropdowns paint their check/tick in the browser's default blue on the exact fields where correctness matters most — "Are you the submitter?" and the P/C handling code — introducing a second accent the design system never sanctioned. Second, when the accent decorates every card's left edge at rest, it no longer *means* anything; the genuinely selected/open card loses its distinction (this is the "reserve the accent for state, not decoration" craft principle, and it directly weakens plan 005's selected-state cue).

## Current state (evidence)

**(a) `accent-color` is set on exactly one place** — `registry/styles.css:445`:
```css
.hl-toggle input { accent-color: var(--accent); }
```
and on the charting review checkboxes (`css/app.css:416`, `:469`) — but **not** on the Registry form's radios/selects. The submitter and handling radios are plain native inputs — `registry/app.js:349-350` and `:372-373`:
```js
              '<label><input type="radio" name="f-self" value="yes"' + (e.submittedBySelf === false ? "" : " checked") + '> Yes</label>' +
              '<label><input type="radio" name="f-self" value="no"' + (e.submittedBySelf === false ? " checked" : "") + '> No</label>' +
```
```js
            '<label><input type="radio" name="f-hcode" value="P"' + (isC ? "" : " checked") + '> P — Lawful sharing permitted</label>' +
            '<label><input type="radio" name="f-hcode" value="C"' + (isC ? " checked" : "") + '> C — Permitted with conditions</label>' +
```
`.radio-row` (`registry/styles.css:163-164`) styles layout only — no `accent-color`, so the radio dot is UA blue.

**(b) The accent is a permanent resting left-rail on cards.** These all paint `var(--accent)` or `var(--accent-dim)` on a border at rest:
- `.op-card` — `registry/styles.css:336`: `...border-left:3px solid var(--accent);...`
- `.report-item` — `registry/styles.css:108`: `...border-left:3px solid var(--accent-dim);...`
- `.item-block` — `registry/styles.css:203`: `.detail .item-block{border-left:3px solid var(--accent-dim);...}`
- `.si-list li` — `registry/styles.css:249`: `...border-left:3px solid var(--accent-dim);...`
- (also `.item-card` `border-top:3px solid var(--accent-dim)` `:169`, `.pnd-panel` `:260` — same pattern, top border.)

The neutral hairline token is `--line` (`registry/styles.css:20`). The active/hover accent already exists for report-item: `.report-item:hover{...border-left-color:var(--accent)}` (`:111`) and `.report-item[aria-current="true"]{border-left-color:var(--accent);...}` (`:117`).

## Target state
1. **Theme all controls to the accent.** Add a broad rule so every checkbox/radio uses the accent:
```css
input[type=radio], input[type=checkbox] { accent-color: var(--accent); }
```
(Place it near the existing `.hl-toggle input` rule so it reads as the control-accent policy. Native `<select>` option-list styling can't be fully themed cross-browser; the accent-color property covers the checkbox/radio controls, which are the safety-critical ones flagged. Do not attempt to restyle the select popup.)
2. **Neutral cards at rest; accent reserved for hover + selected.** Change the *resting* left-border of `.op-card`, `.report-item`, `.item-block`, `.si-list li` from accent/accent-dim to the neutral `var(--line)` hairline. Keep (or add) the accent on `:hover` and on `[aria-current="true"]`/selected only. Do **not** touch semantic warn/bad borders (e.g. `.sensitive-source` `:190`, `.provenance-note`, `.error-summary`, `.pnd-note`) — those colours carry meaning.

Example for `.op-card` (`:336-337`):
```css
.op-card{...;border-left:3px solid var(--line);...}
.op-card:hover{box-shadow:0 0 16px -7px var(--accent);border-left-color:var(--accent)}
.op-card[aria-current="true"]{border-left-color:var(--accent)}   /* if op-cards can be current */
```
For `.report-item` the accent hover/current rules already exist (`:111`, `:117`) — only change the resting `:108` border-left from `var(--accent-dim)` to `var(--line)`.

## Steps (ordered, each independently verifiable)
1. Add `input[type=radio],input[type=checkbox]{accent-color:var(--accent)}` to `registry/styles.css` (near `:445`) → verify in browser: open a report form, the "Are you the submitter?" and handling-code radio dots are periwinkle, not blue.
2. Change resting `border-left` on `.report-item` (`:108`) to `var(--line)`; confirm hover (`:111`) and `[aria-current="true"]` (`:117`) still set the accent → verify: in the report list, unselected items show a neutral hairline; hovering or opening one shows the accent rail.
3. Change resting `border-left` on `.op-card` (`:336`) to `var(--line)`; keep the accent on `:hover` (`:337`) → verify: operation cards are neutral at rest, accent on hover.
4. Change resting `border-left` on `.item-block` (`:203`) and `.si-list li` (`:249`) to `var(--line)` → verify visually.
5. Confirm no semantic (warn/bad) border was altered → `grep -n "var(--warn)\|var(--bad)" registry/styles.css` unchanged from before.

## In scope / out of scope
- **In**: `registry/styles.css` — the control-accent rule and the four resting card borders (`.op-card`, `.report-item`, `.item-block`, `.si-list li`), plus their hover/selected accent rules.
- **Out (do not touch)**: any warn/bad/ok semantic border (`.sensitive-source`, `.provenance-note`, `.error-summary`, `.pnd-note`, grade colours). The charting app's `css/app.css` checkbox `accent-color` (already set, `:416`/`:469`). The `.item-card`/`.pnd-panel` top-borders may stay as-is unless you want parity — if you change them, apply the same rest=neutral/hover=accent rule; do not leave a half-converted set (call it out in the PR). The light-theme accent (olive) inherits `var(--accent)` automatically — no separate edit.

## Done criteria (machine-checkable — not "looks better")
- `registry/styles.css` contains `input[type=radio],input[type=checkbox]{accent-color:var(--accent)}` (or equivalent selector covering both).
- The submitter and handling-code radios render the accent colour, not UA blue (verify visually + via computed style `accent-color`).
- At rest, `.report-item`, `.op-card`, `.item-block`, `.si-list li` have `border-left-color: var(--line)` (computed); on `:hover` and `[aria-current="true"]` the report-item border is `var(--accent)`.
- No `var(--warn)`/`var(--bad)` border rule changed.
- Visual check (the brief's "after-form-1440" surface): open a report form at ~1440px — every radio/checkbox is periwinkle; open the results/home views — cards are quiet at rest and only the hovered/open one shows the accent rail.

## Escape hatches
- If `var(--line)` is not the intended neutral for a resting card border (there is also `--line-2`, slightly lighter), pick whichever already reads as the standard hairline elsewhere; do not introduce a new grey.
- If any card relies on its accent left-border to convey a state that has no other cue (i.e. removing it would erase meaning), STOP and note it — that card needs plan 005's non-colour cue first, not a silent neutralisation.
- Do not try to restyle the native `<select>` dropdown popup to the accent (not reliably themable) — the finding is specifically the radios/checkboxes; report the select-popup limitation rather than hacking it.

## Maintenance note
After this, the accent left-rail *means* "hover or selected." Reviewers should reject new cards that paint the accent at rest. Pairs with plan 005 (which adds a non-colour selected cue) — land 001 → 004 → 005 in that order.
