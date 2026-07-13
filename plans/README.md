# Chart Room (SOLAR) — design-fix backlog

UI/UX audit by `improve-ui` (dual-input: source `Solar/` + rendered `docs/ux-shots/`), 2026-07-13. Plans written against commit **951a0c2**. Each plan is self-contained for a cheaper executor.

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

## Status

| # | Plan | Dim | Effort | Depends | Status |
|---|------|-----|--------|---------|--------|
| 001 | ratify-periwinkle-accent | Colour/Contract | S–M | — | DONE |
| 002 | csv-extraction-feedback | States/Int | M | — | DONE |
| 003 | uk-date-field | Content/A11y | M | — | DONE |
| 004 | accent-discipline-controls-and-cards | A11y/Brand | S | 001 | DONE |
| 005 | selected-state-and-light-contrast | A11y | S | — | TODO |
| 006 | unify-detail-layout | Hierarchy | S | — | TODO |
| 007 | toggle-pressed-state | Int/A11y | S | — | TODO |
| 008 | cursor-ring-compositor-motion | Motion | S | — | TODO |
| 009 | widescreen-density | Responsive | S | — | TODO |
| 010 | mobile-mono-identifiers | Responsive/Type | M | — | TODO |
| 011 | perf-investigate-workbench | Perf | M | — | TODO |
| 012 | consolidate-glass-button-css | Cleanup | S | — | TODO |

*Execute with `/improve-ui execute <plan>` or by hand. Re-run `/improve-ui reconcile` after a batch to verify and surface the next tier.*
