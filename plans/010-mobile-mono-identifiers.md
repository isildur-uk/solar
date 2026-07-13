# 010 — One mono system for identifiers on mobile; kill inline Consolas

- **Finding**: [RESPONSIVE/TYPE] On phones, `css/mobile.css` force-overrides the whole workbench chrome to Inter with `!important` and re-grants mono only to a hand-listed allowlist (`.num`, `.an-kpi-v`, `.kp-score`, `#status-counts`). Identifier columns (phone numbers, registrations, URNs, emails) fall outside that list and lose their monospace on mobile. Separately, several inline `font: … Consolas,monospace` fallbacks bypass the `--mono` token entirely.
- **Written against commit**: 951a0c2
- **Dimension**: Responsive / Typography   **Effort**: M   **Risk**: MED
- **Depends on**: none.

## Why this matters
Identifiers — phone numbers, vehicle regs, URNs, emails — are scannable only in a monospace face where digits and characters align to a fixed column; a proportional face (Inter) makes them harder to compare and to spot transcription errors, which is exactly the analyst's job. Two separate faults conspire: the mobile override strips mono from identifiers, and inline `Consolas,monospace` declarations sidestep the design token so the "mono" isn't even the project's chosen mono (`--mono` = Geist Mono). The craft principle is *one type system, driven by tokens and semantic classes* — mono should key off what a thing IS (an identifier), not a hand-maintained list of four selectors.

## Current state (evidence)
- Source: `css/mobile.css:210-221` — the phone override forces Inter across the chrome, then re-allows mono only for four selectors:
  ```css
  @media (max-width: 760px) {
    /* ONE UI typeface across the workbench chrome (overrides the mixed
       Consolas / Bahnschrift / Segoe inline fonts that read inconsistently). */
    #topbar, #topbar .btn, #case-name, #search,
    #more-drawer, #more-drawer .btn, select.btn,
    #bottom-nav, #map-tools .btn, #legend-panel, #legend-panel *,
    #chart-empty, #statusbar, #statusbar *, #inspector, #inspector * {
      font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif !important;
      letter-spacing: normal !important;
    }
    /* monospace ONLY where it's actually tabular data */
    .num, .an-kpi-v, .kp-score, #status-counts { font-family: "Geist Mono", ui-monospace, monospace !important; }
  ```
  Note the mono allowlist hardcodes `"Geist Mono", ui-monospace, monospace` rather than `var(--mono)` — a second place the token is bypassed.
- Source: inline `Consolas,monospace` that bypass `--mono` (verified):
  - `index.html:150` — URL-modal help paragraph: `style="font:11px Consolas,monospace;…"`
  - `index.html:157` — URL input: `style="…font:13px Consolas,monospace;…"`
  - `index.html:172` — diagnostics-modal help paragraph: `font:11px Consolas,monospace`
  - `index.html:175` — diagnostics textarea: `font:12px Consolas,monospace`
  (Search the file for others — there may be more in export-modal labels; see step 1.)
- Rendered: on a phone, an inspector showing a phone number / URN renders in Inter (proportional) because the identifier has no `.num`/`.kp-score` etc. class; the URL and diagnostics modals render their monospace as Consolas (Windows-only fallback), not Geist Mono.

## Target state
1. **Replace every inline `Consolas,monospace` with `var(--mono)`.** Because these are inline `font:` shorthands, keep the size/other shorthand parts and swap only the family:
   - `index.html:150` → `style="font:11px var(--mono);color:#a3a299;margin:0 0 8px"`
   - `index.html:157` → `…font:13px var(--mono);padding:8px;…`
   - `index.html:172` → `font:11px var(--mono);…`
   - `index.html:175` → `…font:12px var(--mono);…`
   - plus any others found in step 1 (export-modal labels etc.).
2. **Introduce one shared identifier class** (`.id`) that means "this is a monospace identifier", and add it to the identifier-bearing elements the inspector/tables render. On mobile, key mono off that class (plus the existing tabular ones) instead of the four-item allowlist, and use `var(--mono)`:
   ```css
   /* was: .num, .an-kpi-v, .kp-score, #status-counts { font-family: "Geist Mono", …; } */
   .num, .an-kpi-v, .kp-score, #status-counts, .id, .mono {
     font-family: var(--mono) !important;
   }
   ```
   Add `.id` in the JS that renders identifier values (phones, regs, URNs, emails) in the inspector and any table cell — find these in step 2; do not guess. If the app already has a per-type class on identifier cells (e.g. a `hl-phone`/`hl-email` family), you may key mono off those instead of adding `.id` — prefer reusing an existing semantic class over inventing one.

## Steps (ordered, each independently verifiable)
1. Find ALL inline Consolas usages → run: `rg -n "Consolas" index.html registry/index.html css/` → expect: at least the four `index.html` lines above; replace each `Consolas,monospace` with `var(--mono)` (keep the numeric size). Verify after: `rg -n "Consolas" index.html registry/` → expect: NO matches.
2. Find where identifier values are rendered → run: `rg -n "phone|reg|urn|email|renderInspector|inspector" js/ui/inspector.js js/ui/*.js` → expect: the inspector/table render functions that output phone numbers, regs, URNs, emails. Decide: reuse an existing per-identifier class if one exists, else add `class="id"` to those value elements.
3. Edit `css/mobile.css:221` to the shared-class selector using `var(--mono)` (Target step 2) → verify: `rg -n "\.id, \.mono|var\(--mono\)" css/mobile.css` → expect: the rule now includes `.id`/`.mono` and uses `var(--mono)`.
4. Reload on a 375px viewport (DevTools device mode), load the demo case, open the inspector on an entity that has a phone/URN, and open the URL + diagnostics modals.

## In scope / out of scope
- In: `index.html` (the inline-Consolas `style` attributes only), `css/mobile.css` (the mono allowlist rule at :221 only), and the identifier-render function(s) in `js/ui/*.js` to add the shared class.
- Out (do not touch): the Inter override list at `css/mobile.css:213-219` (keep forcing Inter on chrome — the fix is to make identifiers opt back into mono via class, not to remove the chrome override), `--mono`'s definition in tokens, and desktop typography (this is a `max-width:760px` change plus token cleanup that is neutral on desktop).

## Done criteria (machine-checkable — not "looks better")
- `rg -n "Consolas" index.html registry/` → NO matches (all replaced with `var(--mono)`).
- The mobile mono rule references `var(--mono)`, not a hardcoded `"Geist Mono", ui-monospace, monospace`.
- On a 375px viewport with the demo loaded: the inspector's phone number / URN / email / reg renders in Geist Mono (computed `font-family` resolves to the `--mono` stack), not Inter — verify each identifier type in DevTools computed styles.
- The URL-modal help text, URL input, diagnostics help text and diagnostics textarea all compute `font-family` to the `--mono` stack (Geist Mono), not Consolas.
- Desktop (≥761px) is visually unchanged: screenshot the inspector at 1440px before/after — identical.
- Visual check: 375px screenshot of the inspector showing a phone/URN in aligned monospace; 375px screenshot of the diagnostics modal in Geist Mono.

## Escape hatches
- If `--mono` does not resolve to Geist Mono at this commit (check tokens), STOP and report — do not hardcode Geist Mono inline; the whole point is to route through the token.
- If identifier values are rendered as plain text with no wrapping element to receive a class, STOP and report the location — wrapping them is a JS change that needs to be minimal and reviewed, not a broad refactor.
- If an existing per-type identifier class already carries mono on desktop, reuse it in the mobile rule instead of adding `.id`, and note that in the done report — do not add a parallel class system.

## Maintenance note
Any new identifier type added to the inspector/tables must carry the shared `.id`/`.mono` (or the reused semantic) class so it stays monospace on mobile — never re-add a hand-listed selector. Never re-introduce inline `Consolas`; route through `var(--mono)`. Watch in review for new inline `font:` shorthands that name a family directly.
