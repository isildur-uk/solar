# 007 — Give stateful toolbar toggles a real pressed state (style + ARIA)

- **Finding**: [INTERACTION/A11Y] The Physics and Geo toolbar toggles carry their on/off state ONLY in label text (`Physics: on` / `Geo: on`). No visual pressed styling, no `aria-pressed`. The periwinkle `.active` treatment already used for the Legend button is not applied to them.
- **Written against commit**: 951a0c2
- **Dimension**: Interaction / Accessibility   **Effort**: S   **Risk**: LOW
- **Depends on**: none.

## Why this matters
A toggle that reports its state only through the word "on" or "off" in a label is invisible to assistive technology (screen readers announce it as a plain button, not a pressed/unpressed toggle) and easy to misread visually — nothing on the control looks engaged. The craft principle is *state must be perceivable in more than one channel*: expose it to AT via `aria-pressed`, and show it visually with the accent the design system already uses for an engaged control (the periwinkle `#8ea2ff` border/glow that Legend uses when active). This is a WCAG 4.1.2 (Name, Role, Value) fix as much as a visual one.

## Current state (evidence)
- Source: `index.html:71-83` — the two stateful toggles sit in `#chart-tools` with no `aria-pressed` and no state class:
  ```html
  <button class="btn" id="btn-fit" title="Fit chart to view">Fit</button>
  <button class="btn" id="btn-physics" title="Toggle force layout">Physics: on</button>
  <details class="menu" id="menu-layout">
    ...
  </details>
  <button class="btn" id="btn-legend" title="Legend and filters — hide by type, confidence or source; colour links">Legend</button>
  <button class="btn" id="btn-geo" title="Show or hide geographic containment links (city → country)">Geo: on</button>
  ```
- Source: `css/app.css:742` — the accent "engaged" treatment that ALREADY exists, but is only wired to Legend:
  ```css
  #btn-legend.active { border-color: var(--accent); color: var(--accent); }
  ```
  (`--accent` is the ratified periwinkle `#8ea2ff`.)
- Rendered: workbench toolbar, desktop. With Physics on and Geo on, both buttons look identical to the inert `Fit` button beside them — no border, no colour change signals they are engaged. A screen reader announces "Physics: on, button" with no toggle role.

## Target state
Both toggles reflect their engaged state in two channels: `aria-pressed="true|false"` and a visual `.active` class reusing the existing periwinkle treatment. Keep the existing text label (belt-and-braces; do not remove "on"/"off").

1. Generalise the existing `.active` rule so it covers the toggle buttons too — change `css/app.css:742` from a single-ID selector to a shared list, and add a matching `aria-pressed` selector so the style also lands via ARIA state:
   ```css
   #btn-legend.active,
   #btn-physics.active, #btn-geo.active,
   #btn-physics[aria-pressed="true"], #btn-geo[aria-pressed="true"] {
     border-color: var(--accent); color: var(--accent);
   }
   ```
2. In `index.html`, seed the initial ARIA state on the two toggles (both ship "on"):
   ```html
   <button class="btn active" id="btn-physics" aria-pressed="true" title="Toggle force layout">Physics: on</button>
   ...
   <button class="btn active" id="btn-geo" aria-pressed="true" title="Show or hide geographic containment links (city → country)">Geo: on</button>
   ```
3. In the JS that already flips these toggles (the click handlers that rewrite the `Physics: on/off` and `Geo: on/off` label text), set BOTH `aria-pressed` and the `.active` class in lockstep with the label. Find the handlers first (see step 1 under Steps) — do not guess the file.

## Steps (ordered, each independently verifiable)
1. Locate the existing toggle handlers → run: `rg -n "Physics: |Geo: |btn-physics|btn-geo" js/` → expect: the click handlers that currently set `textContent`/`innerHTML` to `Physics: on`/`Physics: off` (and the same for Geo). These are the only places state changes today.
2. Edit `css/app.css:742` to the generalised selector in Target step 1 → verify: `rg -n "btn-physics\[aria-pressed" css/app.css` → expect: one match.
3. Edit `index.html:72` and `:83` to add `active` class + `aria-pressed="true"` (Target step 2) → verify: `rg -n "aria-pressed" index.html` → expect: two matches on those lines.
4. In each toggle handler (from step 1), when it writes the new label, also do `el.setAttribute('aria-pressed', String(isOn)); el.classList.toggle('active', isOn);` where `isOn` is the same boolean that decides "on" vs "off" → verify: `rg -n "aria-pressed" js/` → expect: at least two matches (physics + geo).
5. Reload the workbench, load the demo case, click Physics off then on, Geo off then on.

## In scope / out of scope
- In: `index.html` (lines 72, 83 only), `css/app.css` (line 742 only), and the physics/geo toggle handler(s) in `js/ui/*.js` located in step 1.
- Out (do not touch): `#btn-fit`, `#btn-legend` (Legend already works — do NOT change its behaviour, only extend the shared selector), `#menu-layout`, and the three glass-button definitions in `css/redesign.css` (that is plan 012's territory).

## Done criteria (machine-checkable — not "looks better")
- `rg -n "aria-pressed" index.html` → two matches (btn-physics, btn-geo).
- `rg -n "aria-pressed" js/` → toggle handlers set it (≥2 matches).
- In DevTools, toggling Physics flips `#btn-physics` between `aria-pressed="true"` and `="false"` AND adds/removes `.active`; same for Geo.
- Accessibility tree (Chrome DevTools → Accessibility pane) shows each toggle with role button and a **pressed** state that changes when clicked. axe reports no 4.1.2 issue on these controls.
- Visual check: screenshot the workbench toolbar at desktop width with Physics/Geo ON — both show the periwinkle `#8ea2ff` border + colour, matching Legend's active look; screenshot with them OFF — border/colour return to the inert `Fit`-button style.

## Escape hatches
- If `--accent` is not the periwinkle `#8ea2ff` at this commit, STOP and report — do not hardcode a hex; the whole point is to reuse the token.
- If the toggle handlers set label text in more than the two expected places, wire ALL of them or STOP and report — a half-wired toggle (label says off, `aria-pressed` still true) is worse than the current state.
- If `#btn-legend`'s `.active` is set by JS you cannot find, do not remove or rename `.active`; only extend the selector list.

## Maintenance note
Any future toggle button should follow the same pattern: text label + `aria-pressed` + `.active`, all driven by one boolean. If a third toggle is added, extend the selector in `css/app.css:742` rather than cloning the rule. Watch in review that label text and `aria-pressed` never drift out of sync.
