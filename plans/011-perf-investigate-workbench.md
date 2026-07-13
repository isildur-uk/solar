# 011 — INVESTIGATE workbench at-rest compositor cost before cutting any effect

- **Finding**: [PERF — INVESTIGATE, not a blind cut] The workbench runs several infinite compositor loops at rest plus per-button glass filters and a full-viewport pointer torch. Reduced-motion IS honoured. This plan is an investigation: capture a real INP/Lighthouse trace with the demo loaded, THEN cut only what the trace proves is hot.
- **Written against commit**: 951a0c2
- **Dimension**: Performance   **Effort**: M   **Risk**: MED (measurement first; any cut is conditional)
- **Depends on**: none. (Note: plan 012 consolidates the glass-button CSS; if 012 lands first, the `url(#liquid-glass)` line below no longer exists — see the important correction under Current state.)

## Why this matters
Cutting visual effects without a trace is guesswork that can degrade the look for no measured gain. The discipline is *measure the hot path, then cut only the hot path*. The workbench's identity (Solar) is partly these effects, so the bar to remove one is a measured INP/frame-time win on a real interaction (toolbar click, chart drag), not a hunch. This plan's deliverable is a recorded decision with numbers — not necessarily a code change.

## Current state (evidence)

### At-rest infinite loops (all reduced-motion gated at `css/solar.css:339-341`)
- `css/solar.css:68` — `#chart-wrap::before { … animation: solar-twinkle 7s ease-in-out infinite alternate; }` (starfield behind the chart, workbench-at-rest).
- `css/solar.css:36` — `#topbar::after { … animation: solar-comet 13s linear infinite; }` (comet sweep across the topbar, workbench-at-rest).
- `css/solar.css:76` — `#statusbar span[title] { animation: solar-pulse 3.2s ease-in-out infinite; }` (status-dot pulse, workbench-at-rest).
- `css/solar.css:118-120` — `#hero-orbits .ring.r1/.r2/.r3 { animation: solar-orbit 38s/64s/96s …; }` — **these are on the HERO COVER (`#hero-orbits`), not the workbench at rest.** Include them in the trace only if the hero is on-screen; do not attribute workbench INP to them.

### Per-button glass + pointer torch
- `css/redesign.css:124` — in the FIRST (earliest) glass-button block: `.btn::before { … backdrop-filter: url(#liquid-glass) blur(1px); }`.
  **IMPORTANT correction (verified at this commit):** this first `.btn::before` is entirely **overridden** by the later winning block. The last block redefines `.btn::before` at `css/redesign.css:352-354` with a noise-SVG background and **no** `url(#liquid-glass)`. So `filter:url(#liquid-glass)` is **dead CSS** — it is NOT applied to rendered toolbar buttons. The live per-button cost is the WINNING block's `backdrop-filter: blur(12px) saturate(1.2)` at `css/redesign.css:347`, applied to every `.btn` and every `details.menu > summary`. Trace the live rule, not the dead one.
- `css/app.css:801-804` — `#cursor-torch` is a full-viewport (`100vw × 100vh`) fixed radial-gradient layer following the pointer; already `display:none` under reduced-motion (`:804`).

### Reduced-motion (already honoured — do not remove)
- `css/solar.css:339-341` disables `#topbar::after`, `#chart-wrap::before`, `#hero-orbits .ring`, `#statusbar span[title]`.
- `css/app.css:804` hides `#cursor-torch` under reduced-motion.

## Target state
A **captured INP/Lighthouse trace** of the workbench with the demo case loaded, and a **recorded decision** (numbers attached). Only if the trace shows the toolbar/chart-drag path is genuinely hot do you then apply the conditional cuts below — each independently, re-measuring after each:
- **Conditional cut A** — if per-button `backdrop-filter: blur()` dominates paint during toolbar interaction: reduce or drop `backdrop-filter: blur(12px)` on `.btn` in the WINNING block (`css/redesign.css:347`). The refined glass look (gradient fill + specular `::after` + grain `::before`) survives without the blur. Do NOT touch the dead `:124` line for perf — deleting it is plan 012's cleanup, not a perf win.
- **Conditional cut B** — if `#cursor-torch` shows up as a full-viewport paint each pointer move: gate it (only paint when actually `.on`, shrink the layer, or drop it). It is already reduced-motion-gated; this would extend the gate.
- **Conditional cut C** — if the at-rest loops (`solar-twinkle`/`solar-comet`/`solar-pulse`) keep the compositor awake and cost measurable idle frames: consider pausing them when the tab/section is not the focus, or accept them if cost is negligible.

Record the decision even if the answer is "measured, cost is negligible, change nothing."

## Steps (ordered, each independently verifiable)
1. Serve the app and load the demo case (the workbench must have real nodes/links). Note the exact URL/route used.
2. Chrome DevTools → **Performance**: record ~6s of the workbench AT REST (no interaction). Note whether the compositor is continuously busy (the at-rest loops) and the idle frame cost. Screenshot the flame chart.
3. DevTools → Performance: record while doing the real interactions — click several toolbar buttons, open a `details.menu`, drag a chart node. Read **INP** (Interaction to Next Paint) and look for `Layout`/`Paint`/`Composite` spikes attributable to `backdrop-filter` on `.btn` (`redesign.css:347`) and to `#cursor-torch`.
4. Run **Lighthouse** (Performance) on the loaded workbench; capture the metrics.
5. Write the decision into this file's "Decision log" (below) with the measured numbers: which of A/B/C (if any) to apply, and why. Cite the INP figure and the flame-chart evidence.
6. Only then, if warranted, apply the chosen conditional cut(s) — one at a time — and re-record INP after each to confirm the win.

## In scope / out of scope
- In: measurement (no source change needed to complete this plan); and, ONLY if the trace warrants, `css/redesign.css:347` (winning-block `.btn` backdrop-filter) and/or `css/app.css:801-804` (`#cursor-torch`).
- Out (do not touch): the reduced-motion blocks (`css/solar.css:339-341`, `css/app.css:804`) — they are correct; the dead `css/redesign.css:124` line (leave for plan 012); the hero-cover orbits as a "workbench" cost (they are not on the workbench); the glass look's gradient/specular/grain layers (removing the blur must keep these).

## Done criteria (machine-checkable — not "looks better")
- An INP figure for the workbench interaction path is captured and written into the Decision log below, with a Performance flame-chart screenshot and a Lighthouse Performance score.
- The decision explicitly states, per A/B/C, apply-or-not WITH the measured number that justifies it. "Change nothing" is a valid, recorded outcome.
- If any cut is applied: a second INP capture shows the interaction is no faster-or-equal AND the change is a real improvement (INP down, or paint spikes gone), OR the cut is reverted. No effect is removed without a before/after number.
- Visual check (only if a cut is applied): screenshot the toolbar before/after — the glass buttons still read as glass (gradient + specular + grain intact); the only change is reduced blur.

## Escape hatches
- If you cannot load the demo case (data path broken), STOP and report — a trace of an empty workbench is not evidence; do not cut effects off an empty-state trace.
- If the trace shows the hot path is something else entirely (e.g. the D3/force layout, not CSS effects), record THAT and do not cut the effects — reassign the finding.
- Do NOT delete `css/redesign.css:124` as a perf action — it is dead CSS with zero runtime cost; its removal belongs to plan 012.

## Decision log
(Executor fills this in with the measured numbers before closing the plan.)
- At-rest compositor busy? __  Idle frame cost: __
- Workbench INP (baseline): __ ms.  Lighthouse Performance: __.
- Cut A (`.btn` blur) — apply? __  evidence: __
- Cut B (`#cursor-torch`) — apply? __  evidence: __
- Cut C (at-rest loops) — apply? __  evidence: __
- Post-change INP (if any cut applied): __ ms.

## Maintenance note
Any future "make it snappier" request must attach a trace before removing a Solar effect — this plan sets that precedent. If plan 012 lands, re-verify the winning glass block is the one traced here (line numbers will shift).
