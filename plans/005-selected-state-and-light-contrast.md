# 005 — Add a non-colour cue to the open report; fix light-theme meta-text contrast

- **Finding**: [A11Y] (a) The open report in the list is signalled *only* by a thin colour change on its left border — colour as the sole cue, which fails for colour-blind/low-vision users. (b) The light theme's `--faint` (`#8b8474`) on the cream `--bg` (`#f2ecdd`) is ~3.1:1, below WCAG AA 4.5:1 for the small meta text it drives.
- **Written against commit**: 951a0c2  ← executor: run `git rev-parse --short HEAD`; if it differs, re-verify line numbers and re-measure contrast.
- **Dimension**: Accessibility (WCAG 1.4.1 use-of-colour, 1.4.3 contrast)   **Effort**: S   **Risk**: LOW
- **Depends on**: **001** (accent settled), and best landed **after 004** (which makes the resting border neutral, so the active cue reads clearly).

## Why this matters
DESIGN.md requires surfaces "defensible to an NCA-literate viewer" and the house rules require WCAG AA. Two AA gaps: (1) WCAG 1.4.1 — "you are here" for the open report is conveyed by colour alone (border-left-colour), invisible to a colour-blind analyst; (2) WCAG 1.4.3 — light-theme metadata text is below 4.5:1, so dates/counts are hard to read in light mode.

## Current state (evidence)

**(a) Active report signalled by colour only** — `registry/styles.css:117`:
```css
.report-item[aria-current="true"]{border-left-color:var(--accent);background:var(--panel-3);box-shadow:inset 0 0 0 1px var(--accent-dim)}
```
There is a faint `--panel-3` background step and an inset accent ring, but the *primary* differentiator is the accent border colour + accent ring — all colour. No text/shape/weight cue marks the open item. (Note: after plan 004 the resting border becomes neutral, which helps, but the active cue is still colour-based.)

**(b) Light-theme `--faint` fails AA.** Light tokens — `registry/styles.css:780`:
```css
  --ink:#211f18; --text:#211f18; --dim:#635d4e; --muted:#635d4e; --faint:#8b8474;
```
and `--bg:#f2ecdd` (`:778`). Measured: `#8b8474` on `#f2ecdd` ≈ **3.1:1** (fails AA 4.5:1 for normal text). `--faint` drives small meta text across the UI, e.g. `.report-item .ri-meta{...color:var(--faint)}` (`:115`), `.field .hint` (`:157`), `.result-count` (`:316`), facet counts, audit lists. `--dim:#635d4e` on `#f2ecdd` ≈ 6.0:1 (passes) — but re-check after any change.

## Target state
**(a) Add a non-colour cue to the active report.** Pick ONE (a filled bar is simplest and robust):
- Preferred: a solid **4px filled left bar** (heavier than the resting hairline) PLUS a small mono "● open" tag, so shape + text carry the state independent of hue. Example:
```css
.report-item[aria-current="true"]{
  border-left-width:4px; border-left-color:var(--accent);
  background:var(--panel-3);
  box-shadow:inset 0 0 0 1px var(--accent-dim);
}
.report-item[aria-current="true"] .ri-urn::after{
  content:" · open"; color:var(--dim); font-weight:600; letter-spacing:.04em;
}
```
The width step (1px→4px) and the "· open" text are both non-colour cues. (If injecting text via CSS `::after` is undesirable for SR, add a real `<span>` marker in the `report-item` render in `registry/app.js` instead — see escape hatch.)

**(b) Darken light-theme `--faint` to ≥4.5:1.** Change `--faint` in the `html[data-theme="light"]` block (`registry/styles.css:780`) to a darker warm grey and verify against `--bg:#f2ecdd`. Target ~`#67624f` or darker (measure — aim ≥4.5:1; `#8b8474`→ needs roughly −20% lightness). Re-check `--dim` stays ≥4.5:1 after the change (it should; leave it unless it regresses).
```css
  --faint:#67624f;   /* was #8b8474 (~3.1:1); ≥4.5:1 on #f2ecdd */
```
Also mirror the same value in `css/app.css` light block if the charting app shares the deficiency — `css/app.css:786` sets `--faint:#8b8474;` in its `html[data-theme="light"]` too. Apply the same darkening there for parity.

## Steps (ordered, each independently verifiable)
1. Add the active-report non-colour cue (width step + "· open" tag or a real span) at `registry/styles.css:117` (or in the `report-item` render) → verify: switch the page to greyscale (DevTools rendering emulation → achromatopsia) and confirm the open report is still distinguishable from the rest.
2. Change light-theme `--faint` at `registry/styles.css:780` to the darker value → measure `--faint` on `--bg` with an axe/contrast tool → expect ≥4.5:1.
3. Apply the same `--faint` darkening at `css/app.css:786` for the charting app's light theme (parity) → measure.
4. Re-check `--dim` (`#635d4e`) on light `--bg` still ≥4.5:1 → expect ~6:1 (unchanged).

## In scope / out of scope
- **In**: `registry/styles.css` (the `[aria-current="true"]` rule `:117`, and light-theme `--faint` `:780`); optionally `registry/app.js` if you add a real `<span>` "open" marker; `css/app.css:786` (light `--faint` parity).
- **Out (do not touch)**: the dark-theme `--faint:#84837b` (`css/app.css:16`, `registry/styles.css:22`) — measure it, but on the dark `#0c0c0b` ground `#84837b` is ~4.9:1 and passes; only change it if your own measurement shows a fail. Semantic colours (ok/warn/bad). The accent value (owned by 001). Plan 004's resting-border change.

## Done criteria (machine-checkable — not "looks better")
- With colour removed (greyscale emulation), the open `report-item` is distinguishable from siblings — a border-width step and/or an "open" text tag is present, not colour alone.
- Light-theme `--faint` measured on `--bg:#f2ecdd` is ≥4.5:1 (axe or a contrast checker; state the ratio in the PR).
- Light-theme `--dim` still ≥4.5:1.
- `registry/styles.css:780` and `css/app.css:786` `--faint` hold the same darker value.
- Visual check: toggle to light theme, open the results list — meta text (dates, counts, hints) is comfortably readable; the open report reads as open in both colour and shape/text.

## Escape hatches
- If a CSS `::after` "· open" tag is not announced acceptably to screen readers (generated content support varies), add a visually-styled real element in the `report-item` render in `registry/app.js` and keep `aria-current="true"` for the SR signal. Do not rely on `::after` alone for the SR cue — `aria-current` already covers SR; the `::after` is the *visual* non-colour cue.
- If darkening `--faint` to ≥4.5:1 makes it visually indistinguishable from `--dim`, nudge one of them so the two tiers stay differentiable while both pass AA; do not collapse the two tokens.
- If measurement shows the dark-theme `--faint` also fails on some panel background it is used over, note it as a follow-up — do not expand this plan to re-tier the whole dark palette.

## Maintenance note
The invariant: state (open/active) must always have a non-colour cue, and every text token must pass AA on the ground it renders on. Add contrast checks to the light-theme review. Pairs with 004 — with resting borders neutral (004) and an explicit open cue (005), the "you are here" signal is unambiguous.
