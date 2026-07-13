# 019 — Turn the Physics/Geo controls into real switch toggles

- **Finding**: [INTERACTION/BRAND] The Physics and Geo controls carry state as label text ("Physics: on") plus a periwinkle `.active`/`aria-pressed` border (plan 007). They still *look* like plain buttons, not switches. A real toggle-switch affordance reads the on/off state at a glance and lifts the toolbar to considered.
- **Written against HEAD**: a75f64c  ← executor checks for drift.
- **Dimension**: Interaction / Brand   **Effort**: M   **Risk**: MED
- **Depends on**: 007 (aria-pressed/.active wiring — must be preserved).

## Why this matters
DESIGN.md wants tasteful interaction affordances that stay defensible. A native `<input type=checkbox>` switch communicates on/off in a way a text-labelled button cannot, and — crucially — keeps a real focusable control with a periwinkle `:focus-visible` ring (a keyboard-parity win). `--on: var(--accent)` keeps the single-accent rule. Motion is a near-instant thumb slide under reduced-motion.

## Current state (evidence) — READ THE DISCREPANCY NOTE
The brief described these controls as `<details>/<summary>` + `<select>` styled in `css/enhance.css`. **At HEAD a75f64c that is NOT what these controls are — build against reality:**
- Source (HTML): `index.html:72` and `:83` — they are **buttons**, already wired by plan 007:
  ```html
  <button class="btn active" id="btn-physics" aria-pressed="true" title="Toggle force layout">Physics: on</button>
  …
  <button class="btn active" id="btn-geo" aria-pressed="true" title="Show or hide geographic containment links (city → country)">Geo: on</button>
  ```
- Source (CSS): `css/app.css:742-746` — the active treatment (plan 007):
  ```css
  #btn-legend.active,
  #btn-physics.active, #btn-geo.active,
  #btn-physics[aria-pressed="true"], #btn-geo[aria-pressed="true"] {
    border-color: var(--accent); color: var(--accent);
  }
  ```
- Source (JS): `js/ui/app.js:212, 220, 232` — the click handlers set `aria-pressed` and the label text.
- There is **no `<details>/<summary>` or `<select>`** backing Physics/Geo. (`css/enhance.css` is not the home of these controls.) The `<select>` in the app is the layout dropdown (`#menu-layout` / `.op-switch select`) — a DIFFERENT control that is out of scope here.

Because the real controls are already accessible `aria-pressed` buttons, the highest-value, lowest-risk move is to **restyle them to LOOK like switches** while keeping the exact same button element and the plan-007 state wiring — OR to convert them to a real `<label><input type=checkbox>` switch. Choose per the escape hatch. Both are specified below; **default to the restyle** (preserves 007 wiring with least churn).

## Target state
Recolour **toggles.md #06 "On / Off"** (or #02 "Accent") to the periwinkle accent: `--on: var(--accent)`, keep a periwinkle `:focus-visible` ring, near-instant thumb slide under reduced-motion.

**Option A (default — restyle the existing buttons as switch-shaped, keep the button + 007 wiring).** Add a pseudo-element track+thumb to `#btn-physics` / `#btn-geo` driven by `[aria-pressed="true"]` (the state 007 already toggles):
```css
/* 019 — switch affordance on the existing aria-pressed toggle buttons; --on = var(--accent) */
#btn-physics, #btn-geo { position: relative; padding-left: 44px; }   /* room for the track */
#btn-physics::before, #btn-geo::before {          /* track */
  content:""; position:absolute; left:10px; top:50%; transform:translateY(-50%);
  width:26px; height:15px; border-radius:9999px;
  background: color-mix(in srgb, var(--accent) 22%, var(--panel-2));
  transition: background .3s ease;
}
#btn-physics::after, #btn-geo::after {            /* thumb */
  content:""; position:absolute; left:12px; top:50%; transform:translate(0,-50%);
  width:11px; height:11px; border-radius:50%; background:var(--text);
  transition: transform .3s cubic-bezier(0.22,1,0.36,1);
}
#btn-physics[aria-pressed="true"]::before, #btn-geo[aria-pressed="true"]::before { background: var(--accent); }   /* --on */
#btn-physics[aria-pressed="true"]::after,  #btn-geo[aria-pressed="true"]::after  { transform: translate(11px,-50%); }
#btn-physics:focus-visible, #btn-geo:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce){
  #btn-physics::before, #btn-geo::before, #btn-physics::after, #btn-geo::after { transition-duration: .01s; }
}
```
Keep the existing plan-007 `.active`/`aria-pressed` border rule (css/app.css:742) — the switch and the border can coexist, or trim the border to avoid double-signalling (reviewer's call; if trimmed, keep the border for `#btn-legend`).

**Option B (full conversion to a native switch).** Replace each button with the toggles.md #06 markup:
```html
<label class="switch sw-6" title="Toggle force layout">
  <input type="checkbox" id="btn-physics" checked aria-label="Physics force layout">
  <span class="track"><span class="thumb"></span></span>
</label>
```
Recolour the base `.switch` tokens: `--on: var(--accent); --primary: var(--accent); --surface: var(--panel-2); --secondary: var(--text);` and keep the `:focus-visible` periwinkle ring from the base CSS. **If you choose B, you MUST rewire the JS** (`js/ui/app.js:212,220,232`): the handlers currently read/write a button + `aria-pressed` + label text; a checkbox exposes state via `.checked` and the `change` event. Preserve the exact same on/off effect. Do NOT leave the label text logic pointing at a now-missing button.

## Steps (ordered, each independently verifiable)
1. Confirm the controls are the two `aria-pressed` buttons at `index.html:72,83` and that `js/ui/app.js:212,220,232` toggle them → run: `rg -n "btn-physics\|btn-geo\|aria-pressed" index.html js/ui/app.js`.
2. Choose Option A (default) or B (only with JS rewire budget).
3. **Option A:** add the switch-affordance CSS (above) to `css/app.css` near the plan-007 rule → verify: `rg -n "btn-physics\[aria-pressed=\"true\"\]::after" css/app.css` → one match. No HTML/JS change.
4. **Option B:** swap the markup at `index.html:72,83`, recolour `.switch` tokens, and rewire the three handlers to use `.checked`/`change` while preserving the on/off behaviour → verify: toggling still turns physics/geo on and off in the chart.
5. Confirm the `:focus-visible` ring is periwinkle and keyboard-reachable (Tab to it, Space toggles) → verify by keyboard.

## In scope / out of scope
- In: `css/app.css` (switch affordance) and — Option B only — `index.html:72,83` + `js/ui/app.js:212,220,232`.
- Out (do not touch): `#btn-legend` (keep its `.active` border), `#menu-layout` / the layout `<select>` (a different control), `#btn-fit`; any other button in `#chart-tools`. Do NOT remove the plan-007 `aria-pressed` wiring — it is the state source of truth.

## Done criteria (machine-checkable — not "looks better")
- The `@media (prefers-reduced-motion: reduce)` block makes the thumb slide near-instant (transition-duration ≤ .01s) — grep-verifiable.
- `--on` maps to the accent: the ON track colour is `var(--accent)` and no second accent/colour is introduced → `rg -n "var(--accent)" css/app.css` around the new rule; zero new hardcoded hexes.
- Plan-007 state preserved: toggling still flips `aria-pressed` (Option A) or `.checked` (Option B), and the chart's physics/geo actually turn on/off.
- `:focus-visible` shows a periwinkle ring; the control is reachable by Tab and toggles with Space/Enter. axe: no new 4.1.2 (Name/Role/Value) issue.
- Visual check: screenshot the toolbar with Physics ON and Geo OFF → each reads as a switch (thumb at the ON side is periwinkle; OFF side is neutral). With reduce-motion ON → the thumb jumps with no glide.

## Escape hatches
- The brief described `<details>/<summary>` + `<select>` in `css/enhance.css`. That surface does NOT back Physics/Geo at this commit — if you cannot find the two `aria-pressed` buttons at `index.html:72,83`, STOP and report; do not restyle the layout `<select>` or invent a `<details>` control.
- If you pick Option B and cannot cleanly rewire all three handlers so the on/off effect is preserved, STOP and fall back to Option A — a half-converted toggle (switch shows ON but physics is off) is worse than the current button.
- If restyling would break the plan-007 `.active`/`aria-pressed` selector shared with `#btn-legend`, STOP — extend, never remove, that shared rule.

## Maintenance note
Whichever option ships, the state source of truth stays single (plan 007's `aria-pressed`, or Option B's `.checked`) — never let the switch visual and the real state drift. One accent only: the ON colour is `var(--accent)`. Any third toggle added later should reuse this switch treatment.
