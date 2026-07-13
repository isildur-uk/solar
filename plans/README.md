# Solar — design-fix backlog

UI/UX audit by `improve-ui` (dual-input: source `Solar/` + rendered `docs/ux-shots/`), 2026-07-13. Plans `001`–`012` written against commit **951a0c2**; the showcase-motion batch `013`–`023` written against HEAD **a75f64c** (after the DESIGN.md showcase-grade revision). Each plan is self-contained for a cheaper executor.

> **Batch 013–023 (showcase motion + cleanup).** Added after DESIGN.md was rewritten to showcase-grade (periwinkle `#8ea2ff` = sole action/selection accent; `--accent-2 #b39dff` = non-semantic decoration only; the "Showcase motion contract": every effect gated behind `prefers-reduced-motion`, trust-critical grade surfaces get motion on ARRIVAL only — never on the persisted confidence value, one effect per surface). Every plan in this batch complies. Three plans carry a flagged surface mismatch the writer found vs. the brief — see the "Surface-mismatch flags" note below; each has a STOP escape hatch.

**Ratified decision (accent):** the shipped **periwinkle `#8ea2ff`** is the accent of record. This is a documentation/cleanup reconcile, *not* a re-theme to chartreuse. See `001`. The binding contract is at
`C:\Users\44752\Documents\Claude\Projects\Intel\Create Charting Software\DESIGN.md` (one level above this git repo).

**Recorded passes (do not re-audit):** XSS-safe rendering is solid (centralised `esc()` on every ingest sink); motion is disciplined and `prefers-reduced-motion` honoured; microcopy is clean and machine-derived text is correctly flagged; the empty chart state is designed. No fail-on-sight slop tells.

## Order of execution (dependency-aware)

**Do first**
1. `001-ratify-periwinkle-accent` — make DESIGN.md + the ~30 "lime" comments + the mislabelled `--sol-amber` token + the orphan `#ebfc72` checkbox all agree on `#8ea2ff`. *Unblocks all colour work (004).*
2. `002-csv-extraction-feedback` — the biggest UX gap: busy/loading state on parse+extract, zero-result guard, error-phrased CSV toast, and a commit confirmation toast on the trust-critical import/extract flow.
3. `003-uk-date-field` — replace the native `type=date` (US MM/DD) range filters with the app's DD/MM text field; keep ISO serialisation at the boundary.

**High leverage**
4. `004-accent-discipline-controls-and-cards` *(dep 001)* — `accent-color` on native radios/checkboxes; make resting card left-rails a neutral hairline, reserve the accent for hover/selected.
5. `005-selected-state-and-light-contrast` — A11y; add a non-colour "open" cue to the active report; darken light-theme `--faint` to ≥4.5:1.

**Medium / hygiene**
6. `006-unify-detail-layout` — remove the dead orphan `.detail dl` rule (verified: no live consumer; the two real detail layouts diverge by design — do **not** force-merge).
7. `007-toggle-pressed-state` — `aria-pressed` + `.active` treatment on the Physics/Geo toggles.
8. `008-cursor-ring-compositor-motion` — animate the hero cursor-ring with `transform:scale()`, not width/height/margin.
9. `009-widescreen-density` — collapse the empty overlap rail (`:has()` on `.ov-report`); cap/centre the op-grid; 8px gutter.
10. `010-mobile-mono-identifiers` — replace inline `Consolas` with `var(--mono)`; key mobile mono off a shared `.id`/`.mono` class.
11. `011-perf-investigate-workbench` — **investigate first:** capture a live INP/Lighthouse trace; only cut effects (the live cost is block-3's `backdrop-filter:blur(12px)`, not the dead `#liquid-glass` filter) with the numbers in hand.
12. `012-consolidate-glass-button-css` — delete the two dead glass-button blocks in `redesign.css`, keep block 3 (zero runtime cost; loss-free).

**Showcase motion + cleanup (batch 013–023 · HEAD a75f64c) — independent, do in any order; each is one surface**
13. `013-rename-chart-room-to-solar` — replace the remaining user-facing "Chart Room" strings (toasts, auto-draft disclaimer, file-validation reason, READMEs) with "Solar"; code identifiers untouched.
14. `014-ocr-scanning-loader` — swap the `.ocr-spin` border ring for a Korona conic-comet loader (`css/mobile.css`), recoloured `--ink: var(--accent)`; reads as scanning.
15. `015-panel-seed-loader` — replace the single pulsing `.loading-state .dot` with a Delta-V equaliser (or Meridian arc) in `--accent-dim` (`registry/styles.css`).
16. `016-result-count-tick` — add `tabular-nums` (DESIGN.md rule) + an **eased, no-bounce** count-up to `.result-count strong` / `.sh-count` / `.oc-count`.
17. `017-empty-constellation-twinkle` — gently twinkle the `#chart-empty` constellation, opacity ceiling ≤ 0.5 (`css/app.css`).
18. `018-hero-wordmark-sheen` — one slow violet sheen pass across the cover SOLAR wordmark (`css/hero.css`), inside the existing reduced-motion guard. *(flagged surface)*
19. `019-physics-geo-real-toggles` — turn the Physics/Geo `aria-pressed` buttons into switch toggles, `--on: var(--accent)`; preserve plan-007 state wiring. *(flagged surface)*
20. `020-button-press-feedback` — tactile depress (Push Button, **not** ripple) on `.btn.primary` (`css/redesign.css`); keep 4px radius + `--accent-soft`.
21. `021-menu-popover-glide` — swap the `menuIn` popover easing to the glide curve `cubic-bezier(0.16,1,0.3,1)` (`css/redesign.css`); pure easing swap.
22. `022-tab-segment-pill-glide` — gliding accent pill indicator on the mobile view-mode switch (`js/ui/mobileui.js`), 4px radius. *(flagged surface)*
23. `023-grade-chip-tooltips` — accessible `data-tip` tooltip (hover + focus-visible) on `.grade-chip` explaining the grade; grade value never animated (trust surface).

**Surface-mismatch flags (writer found the brief's described surface differs from the source at a75f64c — each plan has a STOP escape hatch):**
- **018** — the wordmark is `#solar-mark .word` in `css/hero.css` (not inline in `hero.html`); the reduced-motion guard is at `css/hero.css:214` (brief said "~322"); the cover uses `--sol-*` tokens, NOT `--accent-2`.
- **019** — Physics/Geo are `<button aria-pressed>` in `index.html:72,83` (already wired by plan 007), NOT `<details>/<summary>` + `<select>` in `css/enhance.css` as the brief described.
- **022** — there is NO existing tab/segment/pill component; the closest real surface is the mobile view-mode `aria-pressed` button group in `js/ui/mobileui.js:93`. Plan targets that; STOP if it is not a horizontal single-select group.

## Status

| # | Plan | Dim | Effort | Depends | Status |
|---|------|-----|--------|---------|--------|
| 001 | ratify-periwinkle-accent | Colour/Contract | S–M | — | DONE |
| 002 | csv-extraction-feedback | States/Int | M | — | DONE |
| 003 | uk-date-field | Content/A11y | M | — | DONE |
| 004 | accent-discipline-controls-and-cards | A11y/Brand | S | 001 | DONE |
| 005 | selected-state-and-light-contrast | A11y | S | — | DONE |
| 006 | unify-detail-layout | Hierarchy | S | — | DONE (dead CSS removed; layouts left divergent by design per escape hatch) |
| 007 | toggle-pressed-state | Int/A11y | S | — | DONE |
| 008 | cursor-ring-compositor-motion | Motion | S | — | DONE |
| 009 | widescreen-density | Responsive | S | — | DONE (op-grid: cap+centre chosen) |
| 010 | mobile-mono-identifiers | Responsive/Type | M | — | DONE (inline Consolas removed; .id on inspector IDs; broad per-cell wrap deferred per escape hatch) |
| 011 | perf-investigate-workbench | Perf | M | — | BLOCKED — needs live perf session (static facts confirmed; no cut) |
| 012 | consolidate-glass-button-css | Cleanup | S | — | DONE |
| 013 | rename-chart-room-to-solar | Content/Brand | S | — | DONE |
| 014 | ocr-scanning-loader | Motion/States | S | — | DONE |
| 015 | panel-seed-loader | Motion/States | S | — | DONE |
| 016 | result-count-tick | Motion | M | — | PARTIAL (Part A tabular-nums DONE on the 3 real selectors; Part B count-up STOPPED per escape hatch — all 3 counts are innerHTML-rebuilt strings with the number fused into word+digit text, no persistent numeric node to animate) |
| 017 | empty-constellation-twinkle | Motion/Empty | S | — | DONE |
| 018 | hero-wordmark-sheen | Motion/Brand | S | — | TODO — STOPPED per escape hatch. The plan targets `#solar-mark .word` in `css/hero.css`, but `css/hero.css` is linked by index.html, NOT hero.html, and NO element has `id="solar-mark"` in any HTML (orphan component). The cover wordmark that actually renders is `<h1 class="wordmark" id="wordmark">` painted by the inline `.wordmark` rule at hero.html:123, whose `background:` is a star-tracking radial light-spot + silver→cream clip gradient. A Chromia `background-image` sheen would overwrite that signature paint (escape-hatch STOP #2). No edits made. |
| 019 | physics-geo-real-toggles | Interaction/Brand | M | 007 | DONE (Option A — restyled the aria-pressed buttons as switches; CSS-only, plan-007 wiring preserved) |
| 020 | button-press-feedback | Motion/Interaction | S | — | TODO |
| 021 | menu-popover-glide | Motion | S | — | TODO |
| 022 | tab-segment-pill-glide | Motion/Interaction | M | — | TODO (flagged surface — see note) |
| 023 | grade-chip-tooltips | A11y/Content/Trust | S | — | TODO |

*Execute with `/improve-ui execute <plan>` or by hand. Re-run `/improve-ui reconcile` after a batch to verify and surface the next tier.*
*Batch 013–023 stamped **Written against HEAD a75f64c**. All comply with the DESIGN.md Showcase motion contract (reduced-motion gate · single periwinkle accent · no blue→purple CTA glow · one effect per surface · trust surfaces never animate the confidence value).*
