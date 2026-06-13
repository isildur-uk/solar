# SOLAR — link analysis & smart matching
*(formerly Chart Room — a connections map looks like a solar system)*

i2-Analyst's-Notebook-style charting workbench. Single-page app: open `index.html` in a browser
(or host the folder — Vercel/static hosting works as-is). No build step, no backend; all case data
stays in the browser (localStorage + JSON save/load). The only network call is the basemap tile
server, with an offline fallback.

## The USP — smart matching
- **Paste Text** → entities (people, phones, emails, DOBs, dates, addresses, places, vehicle regs,
  money, IPs) and inferred relationships are extracted from free-text passages and presented on a
  split-pane review screen. Nothing reaches the chart unapproved.
- **Import CSV** → column types auto-detected (analyst confirms), rows become entities + links;
  exact identifier matches (same E.164 / canonical email) reuse existing entities.
- **Normalisation**: phones → E.164 (`07… ⇄ +447…`, `00 ⇄ +`), emails canonicalised (gmail dot/plus
  rules, gmail-only), names fuzzy-matched (Jaro-Winkler + nickname table `Geoff ⇄ Geoffrey`,
  type-gated, DOB-corroborated). Matches are **suggested, never auto-merged**.
- **Deconflict** panel: chart-wide duplicate scan with same/distinct decisions, audited merges.
- **Smart geolocation**: offline gazetteer (~280 cities/airports/ports with IATA codes + country
  centroids) pins extracted locations on the synced map; addresses pin via their parent locality.
- Ambiguous DD/MM dates and non-validating phone numbers are **flagged, not guessed**.

## Views
Chart (vis-network) · Map (Leaflet) · Timeline — all three select together. Inspector carries
NCA 3×5×2 provenance grading, source extracts, and a full audit trail per entity/link.

## Exports
Case JSON · chart PNG (with protective marking) · i2 ANX XML (*shape approximated — validate
against a real i2 import before relying on it*).

## Layout
- `js/core/` — engine (match, geo, extract, model). Dependency-free, runs in Node for testing.
- `js/ui/` — graph, mappane, timeline, review, importer, inspector, app shell, util (incl. the
  mandatory `esc()` XSS helper).
- `js/lib/`, `css/lib/` — vendored vis-network 10.x, Leaflet 1.9, PapaParse 5.x. No CDN refs.
- `tests/run_tests.js` + `tests/lang_tests.js` — 127 spec-based tests (engine + language layer).
- Cache-buster convention on script/link tags: `?v=YYYYMMDD<letter>` — bump on every JS/CSS edit.

## Hero cover (UI)
First open (or whenever the case is empty) lands on a cinematic cover: original WebGL aurora
shader in the house palette (CSS fallback if WebGL is unavailable), gradient-sweep headline,
and a working prompt card — typewriter cycles example passages; click to type your own; the
animated send button runs extraction directly. `+` jumps to CSV import; Esc or "Enter the
workbench" dismisses; clicking the CHARTROOM brand reopens it. Honours prefers-reduced-motion.

## Windows executable
Current build: `dist/Solar-v13.exe` — rebuilt with a matching Node v24.13.1 SEA runtime after
`Solar-v12.exe` was found to crash on launch from a Node SEA runtime/blob mismatch. Previous:
`dist/Solar-v9.exe` — workbench visual uplift: typed nodes glow like stars in
their type colour, high-confidence links carry an accent glow, richer accent-aware nebula behind
the chart, glass side panel / timeline / status bar floating over the starfield, accent-lit
inspector sections, glass chart-tool chips, uppercase-mono toolbar identity. Note: the full motion
cover (preloader, scroll scenes, orrery) shows when the case is EMPTY or via clicking the SOLAR
brand — a populated case goes straight to the workbench (a one-time tip now says so). Previous:
`dist/Solar-v8.exe` — the operational stage, built from the `intel_content`
source documents:
- **Corrected 3×5×2 grading** (source 1–3, assessment A–E, handling P/C with A/S conditions),
  written `[2CP]` per the IR convention; legacy cases migrate automatically.
- **ATLAS data-standards layer** (`js/core/format.js`): SURNAME caps, `DOB DD/MM/CCYY`,
  CM/KB phone formats, `VRM` prefix, ORGANISATION LTD caps, currency codes — used by every export.
- **Watertight extraction**: PNC/CRO/NINO/passport attach to the person; IMEI, AC/SC/CC and
  "Barclays a/c ending …" become Bank Account entities; `CG` criminal groups; Companies House
  numbers captured from "(Co. No. 12345678)".
- **Photos on entities**: inspector gallery (downscaled, persisted, audited); the chosen face
  becomes the chart node (i2-style circular image) and lands in profile exports.
- **External checks (analyst-initiated)**: organisations deep-link to Companies House (direct via
  company number, else search); vehicles open DVLA vehicle enquiry / MOT history with the VRM
  copied to the clipboard.
- **Export hub** (toolbar → Export): Logging Tool v1 Subjects+Log CSVs and Intel Log 2 Enquiry CSV
  with exact workbook headers; Intelligence Report draft per the APP structure; auto-populated
  **Short and Long subject-profile .docx** (templates filled offline via a built-in zip surgeon,
  node-face photo swapped in) plus a print HTML profile; i2 ANB import pack (entities + links CSV
  + wizard README) and upgraded ANX (Identity vs Label, semantic types, Confirmed/Unconfirmed/
  Tentative line strengths).
- **i2 ANB 10 terminology** across the UI: Person, Telephone, Email Address, Organization,
  Vehicle, Bank Account, Location, Address, Cash, Event, Document, Text Block.
Tests: 81 + 46 engine, 22 boot + 21 intel jsdom assertions (`tests/ui_*_tests.js`, need `npm i jsdom`),
docx round-trips verified with python-docx. Previous: `dist/Solar-v7.exe` — the motion-site landing: eclipse preloader (SOLAR letter
stagger + counter + circular wipe, once per session, click/Esc skips), custom cursor (dot + lerped
ring with action labels, cover only, fine pointers), four scroll scenes — display headline with
word-mask reveals over the scroll-reactive sun shader; THE SYSTEM: a canvas orrery of the BAINES
demo case (particles assemble → links draw → plane tilts open, captions keyed to scroll); glowing
feature cards; stat counters + giant magnetic ENTER — plus film grain, velocity-skew marquee, and
upgraded bloom petals. Verified by a 22-assertion jsdom boot test (tests/ + /tmp harness) and a
second design review. Previous: `dist/Solar-v6.exe` — the Solar design pass: sun/corona/starfield WebGL hero with
orbit rings, liquid-glass bloom colour picker in the topbar (8 petals; sets a live accent across
the UI and the shader, persisted), glowing feature cards (gradient-border + blur-glow technique
from `guides/`), constellation backdrop behind the chart, comet topbar sweep, modal/press
micro-interactions — all reduced-motion safe. Previous: `dist/ChartRoom-v5.exe` — adds the linguistic engine (`js/core/lang.js`):
clause-level subject-verb-object parsing with a ~70-verb semantic lexicon, tense/modality
(planned vs occurred), negation & denial flagging, passive-voice reversal, object lists,
pronoun/surname coreference; plus alias capture feeding the matcher, relative-date resolution
against a reference date, vehicle colour/make and transaction amounts on links. Older builds
(`ChartRoom.exe`, `-v2`..`-v4`) — delete it (and `ChartRoom.exe.new`, a copy artefact) and optionally
rename v2; the session sandbox cannot delete files on this folder. 80MB, win-x64, no install — double-click to run. It starts a local
server bound to 127.0.0.1 only and opens the app in an Edge app-window (falls back to the default
browser). Keep the console window open while working; close it to quit. Case autosave persists per
machine. Unsigned binary, so expect a SmartScreen "unrecognised app" prompt on first run —
More info → Run anyway. Built from node.exe v24.13.1 with the app embedded via Node SEA;
rebuild notes in dist/BUILD.md.

## Demo
First visit opens the paste panel pre-loaded with the Geoff BAINES passage — hit **Extract →**,
review, **Add to chart**, then watch chart + map + timeline populate. `demo_contacts.csv`
exercises the CSV path (smart-matches against the extracted entities).

## Mobile (iOS / Android)
This folder is the **single source of truth**. The Capacitor mobile build lives in
`../solar_mobile/` and is generated from here — run `solar_mobile/sync-from-desktop.cmd`
(or `.sh`) after editing, then `npx cap sync`. See `solar_mobile/MOBILE-BUILD.md`.
Build the desktop exe with `node exe_build\build.js dist\Solar-v17.exe` (build.js now
bundles the OCR `.wasm`/`.gz` assets too).
