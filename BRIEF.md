# CHART ROOM — Build Brief (v1, 10 June 2026)

**Goal.** A browser-based link-analysis / charting workbench in the i2 Analyst's Notebook family, sibling to Control Room. USP: **smart matching** — entities arrive from CSV *and* from pasted free-text intelligence passages, are extracted, normalised, fuzzy-matched against the existing chart, and added only after analyst review. Smart geolocation places extracted locations on a synced map. Audience: senior NCA-literate viewers; demo credibility is the bar.

**Stack.** Plain HTML/JS/CSS single-page app, no build step, no backend, no framework. Vendored libs only (vis-network, Leaflet, PapaParse in `js/lib` / `css/lib`) — no CDN script/css references. All case data stays in the browser (localStorage + JSON file save/load). Only permitted network call: the Leaflet basemap tile server, with graceful degradation to an offline dark canvas if unreachable. Plain classic scripts sharing global scope via `window.CR*` namespaces (Control Room pattern).

**In scope (all finished to demo standard — excellent over half-baked):**

1. **Link chart** (vis-network): typed entities (person, phone, email, address, location, organisation, vehicle, account, event, document, note), typed + directed links from a controlled vocabulary, confidence rendered as line style, selection, context actions, physics toggle, fit/zoom, PNG export.
2. **Free-text extraction**: regex/heuristic NER for names (FORENAME SURNAME caps convention), DOBs and dates (DD/MM default, ambiguous dates flagged), UK + international phones, emails, street addresses, postcodes, place names/airports (gazetteer), vehicle regs, money, IPs; relationship inference from verb cues (uses, books, flying from/to, staying at, purchases, travels to) with direction defaulting to analyst-confirmable.
3. **Review screen** (trust-critical): split pane — source text with colour-coded highlighted spans ↔ entity cards; HIGH/MED/LOW confidence badges (no fake percentages); match-to-existing vs add-as-new radio with existing entity shown inline; relationship cards (subject→predicate→object, direction swap, unchecked by default); inline edit before commit; bulk actions; final summary count before commit.
4. **Smart matching engine**: E.164 phone normalisation (00→+, UK 07→+447, spaces/brackets stripped); email normalisation (lowercase; gmail dot/plus rules only on gmail domains; never fuzzy across domains); name matching (Jaro-Winkler + token sort + initials + nickname table, type-gated, ≥0.85 suggest threshold, never auto-merge); addresses never matched against city-level locations.
5. **CSV import wizard**: PapaParse; per-column type auto-detection (phone/email/name/date/location/reg); analyst confirms mapping; rows become entities + optional row-wise links; same review/merge flow.
6. **Smart geolocation**: offline gazetteer (curated cities + airports with IATA codes, country flags) → Leaflet map pane synced two-way with chart selection; address entities pin to their parent city when street-level coords unknown.
7. **Timeline**: dated events on a zoomable horizontal axis, two-way linked to chart selection.
8. **Deconfliction panel**: chart-wide duplicate scan, same/distinct/defer, merge preserves attributes + audit trail.
9. **Inspector**: properties, source snippet, NCA 3×5×2 provenance grading (source A–C / intelligence 1–5 / handling P/C), audit trail of changes.
10. **Search & filter** with highlight/dim; classification banner (configurable, default OFFICIAL); save/load JSON; **i2 ANX XML export**; preloaded demo case + the Geoff BAINES sample passage in the paste panel.

**Out of scope (deliberately):** storyboard/narrative mode, vis clustering groups, swimlane gap detection, online geocoding (privacy), multi-user, backend, CSA-related content.

**Definition of done.** Every listed feature works end-to-end with no dead UI; `node --check` clean on all JS; HTML parses; CSS braces balance; no CDN refs; XSS-safe rendering of all imported data (everything analyst-supplied is escaped); WCAG-conscious contrast/keyboard/aria; spec-based tests for extract/match/geo pass; separate reviewer audit completed; consolidated report delivered.

**Design language (anti-generic, deliberate).** Dark analyst console: near-black blue-grey ground (#0c1117), single amber accent (#e8b34b) for action/selection, desaturated type-coded entity hues, hairline borders, dense-but-quiet typography (system grotesque for UI, monospace for identifiers — numbers, emails, regs), square corners, no gradients, no purple, no card grids. Visual kinship with Control Room without copying it.
