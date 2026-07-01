# SOLAR — link analysis & smart matching
*(formerly Chart Room — a connections map looks like a solar system)*

i2-Analyst's-Notebook-style charting workbench. Single-page app: the cinematic cover `hero.html` is the one front door — served at `/` on Vercel, by the LAN server (`serve-lan.js`) and by the `.exe` — and its ENTER leads into the workbench `index.html`
(or host the folder — Vercel/static hosting works as-is). There is no frontend build step;
normal case data stays in the browser (localStorage + JSON save/load). The hosted
**Add from URL** feature uses the Vercel function in `api/fetch.js`; basemap tiles and
analyst-initiated external checks are the other online surfaces. Core extraction and case
storage continue to work offline.

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

## Development verification
Run from this folder:

    npm install
    npm test

`npm test` is the single verification entry point. It checks authored JavaScript syntax,
the extraction/matching/CM suites, demo corpus, collaboration and disclosure tests, and
the jsdom UI/drag-and-drop tests. Smaller commands are available as `test:core`,
`test:demo`, `test:dom`, `test:ui`, and `check:js`.

Historical jsdom boot probes for the retired in-app hero live in `tests/legacy/`. They are
kept as design-history fixtures but are deliberately outside the current verification gate;
the standalone `hero.html` is now the only supported cover.

## Hero cover (the single front door)
`hero.html` is the ONE landing experience across every launch path — a cinematic starfield cover
with the SOLAR wordmark; ENTER blooms an iris into the workbench (`index.html`). Honours
prefers-reduced-motion, and on touch/small screens it redirects straight to the workbench.

How each path reaches it (kept in sync — change all of these together, never just one):
- Vercel (the tested deployment): `vercel.json` redirects `/` -> `/hero.html` (redirects run before
  the filesystem, so this beats the default `index.html`).
- LAN server: `serve-lan.js` serves `/` -> `hero.html`.
- Desktop `.exe`: `exe_build/server.js` serves `/` -> `hero.html` (falls back to `index.html`).
- `1-Launch-SOLAR.cmd`: syncs to GitHub, then opens the live Vercel URL — the same front door.

The legacy in-app cover (`js/ui/hero.js`) is retired: it builds hidden and an empty case boots
straight into the workbench, so the hero never shows twice. `hero.html` is the only cover to edit.

## Windows executable

### Running it
80 MB, win-x64, no install — double-click to run. It starts a local server bound to 127.0.0.1
only and opens the app in an Edge app-window (falls back to the default browser). Keep the console
window open while working; close it to quit. Case autosave persists per machine. The binary is
unsigned, so expect a SmartScreen "unrecognised app" prompt on first run — More info → Run anyway.
Built from `node.exe` v24.13.1 with the app embedded via Node SEA; rebuild notes in `dist/BUILD.md`.

> **Build the current exe** with `node exe_build\build.js dist\Solar-v17.exe` (build.js bundles the
> OCR `.wasm`/`.gz` assets too). The `dist/` filename is bumped per build — pick the next `vN`.
> The exact "latest exe" version drifts as builds are cut; treat the highest `dist/Solar-vN.exe` as
> current rather than a number hardcoded here.

### Build history (most recent first)
- **v12 → v13** — rebuilt with a matching Node v24.13.1 SEA runtime after v12 crashed on launch
  from a SEA runtime/blob mismatch.
- **v9** — workbench visual uplift: typed nodes glow like stars in their type colour,
  high-confidence links carry an accent glow, accent-aware nebula behind the chart, glass side
  panel / timeline / status bar over the starfield, accent-lit inspector sections, glass chart-tool
  chips, uppercase-mono toolbar identity. The full motion cover (preloader, scroll scenes, orrery)
  shows only when the case is empty or via the SOLAR brand; a populated case goes straight to the
  workbench (a one-time tip says so).
- **v8** — the operational stage, built from the `intel_content` source documents:
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
  - Tests: 81 + 46 engine, 22 boot + 21 intel jsdom assertions (`tests/ui_*_tests.js`, need
    `npm i jsdom`); docx round-trips verified with python-docx.
- **v7** — the motion-site landing: eclipse preloader (SOLAR letter stagger + counter + circular
  wipe, once per session, click/Esc skips), custom cursor (dot + lerped ring with action labels,
  cover only, fine pointers), four scroll scenes — display headline with word-mask reveals over the
  scroll-reactive sun shader; THE SYSTEM, a canvas orrery of the BAINES demo case (particles
  assemble → links draw → plane tilts open, captions keyed to scroll); glowing feature cards; stat
  counters + a magnetic ENTER; film grain, velocity-skew marquee, upgraded bloom petals. Verified by
  a 22-assertion jsdom boot test and a second design review.
- **v6** — the Solar design pass: sun/corona/starfield WebGL hero with orbit rings, liquid-glass
  bloom colour picker in the topbar (8 petals; sets a live accent across the UI and the shader,
  persisted), glowing feature cards (gradient-border + blur-glow technique from `guides/`),
  constellation backdrop behind the chart, comet topbar sweep, modal/press micro-interactions — all
  reduced-motion safe.
- **v5 (ChartRoom-v5)** — the linguistic engine (`js/core/lang.js`): clause-level
  subject-verb-object parsing with a ~70-verb semantic lexicon, tense/modality (planned vs
  occurred), negation & denial flagging, passive-voice reversal, object lists, pronoun/surname
  coreference; plus alias capture feeding the matcher, relative-date resolution against a reference
  date, and vehicle colour/make + transaction amounts on links.

> Older builds (`ChartRoom.exe`, `-v2`..`-v4`, and the `ChartRoom.exe.new` copy artefact) are
> superseded — delete them from Windows. The session sandbox cannot delete files on this folder.

## Demo
First visit opens the paste panel pre-loaded with the Geoff BAINES passage — hit **Extract →**,
review, **Add to chart**, then watch chart + map + timeline populate. `demo_contacts.csv`
exercises the CSV path (smart-matches against the extracted entities).

## Mobile (iOS / Android)
This folder is the **single source of truth**. The Capacitor mobile build lives in
`../solar_mobile/` and is generated from here — run `solar_mobile/sync-from-desktop.cmd`
(or `.sh`) after editing, then `npx cap sync`. See `solar_mobile/MOBILE-BUILD.md`.
Rebuild the desktop exe as in **Windows executable** above.
