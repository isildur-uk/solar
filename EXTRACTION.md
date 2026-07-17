# Solar — Text Extraction Approach & Roadmap

How Solar turns free-text intelligence into a CM/i2 chart, where it sits against
how extraction systems are generally built, and what's worth adding next.

Solar is browser-only, offline, no-backend, vendored-libs-only. That constraint
rules out anything that needs a server or large model download by default, and it
shapes every choice below.

## The standard information-extraction pipeline

Most "structured data from text" systems are a sequence of stages. Solar
implements a rule/dictionary version of each:

1. **Tokenisation + sentence segmentation** — Solar splits sentences for
   sentence-scoped relationship inference (`extract.js`, section 12).
2. **Named-entity recognition (NER)** — find people, orgs, locations, vehicles,
   money, identifiers, dates. Solar uses regex + gazetteer + cued prose patterns.
3. **Coreference resolution** — tie a bare surname / pronoun back to the full
   person. Solar does a lightweight surname pass (section 11b).
4. **Entity linking / normalisation** — map a mention to a canonical value. Solar
   canonicalises to ATLAS **CM** forms via `cm-standards.js`.
5. **Relation extraction** — decide how two entities connect. Solar uses verb
   cues, an SVO clause parser (`lang.js`), and targeted prose rules.

## The five NER families (and why Solar is where it is)

- **Rule-based (regex/grammars)** — high precision on structured tokens (NINO,
  VRM, sort code), brittle on novel cases. *Solar's identifier layer.*
- **Dictionary / gazetteer** — precise, only as good as the list. *Solar's geo
  gazetteer, titles, particles, recognised-term vocab.*
- **Statistical (HMM/CRF)** — sequence tagging; the pre-deep-learning workhorse.
- **Neural (BiLSTM-CRF, transformers/BERT)** — accuracy leader for trained
  domains; needs a model.
- **Generative LLM** — strong zero/few-shot and for relations needing world
  knowledge, but on plain NER still often below supervised models, and it breaks
  Solar's offline guarantee.

Production systems are almost always **hybrid cascades**: regex for structured
fields → gazetteer/statistical for standard entities → a transformer (e.g.
GLiNER) for novel types → an LLM only where context/relationships demand it.
Results merge by **union** (recall), **intersection** (precision), or
**highest-confidence**. Solar's `high/med/low` tiering is exactly the substrate
that merge strategy needs.

## What Solar does today (rule + dictionary, precision-first)

- **NER:** emails, phones (UK/intl), identifiers (NINO, passport+country, PNC,
  CRO, VRM, VIN, sort code/account, company no., VAT, IP, IMEI, handles), money,
  dates/times, locations (gazetteer), vehicles, orgs, and people — including
  CM-style ALL-CAPS surnames and particle surnames ("van der BERG"), gated by a
  person cue to stay precise.
- **Normalisation:** every value is rendered to its CM form (`cm-standards.js`);
  identifiers are validated, not just matched.
- **Coreference:** bare-surname second mentions are registered as extra mentions
  of the matching person (ambiguous surnames resolve to the document subject), so
  "… communicated with BAINES" links to the right person. Common-noun look-alikes
  ("the WOOD") are excluded.
- **Aliases:** "formerly known as / née / fka" folds into the host person
  (identifiers, status, links move across; the phantom is removed).
- **Relation extraction:** USES / COMMUNICATED_WITH / TRANSACTED_WITH /
  TRAVELS_TO / DEPARTS_FROM / STAYS_AT / LOCATED_IN / EMPLOYS / OWNS / FAMILY_OF /
  ASSOCIATE_OF, with i2 semantic type + line strength. Structured-document
  heuristics are gated to genuine field-form input so prose doesn't over-link;
  employment binds to the org the cue immediately precedes; kinship ("his
  brother, X") attaches to the document subject; "associated with" links org↔org.
- **Addresses:** a comma-structured street address after a stay cue is captured
  as an Address entity and linked STAYS_AT, bounded so it doesn't run into the
  next sentence (postcode-terminated addresses included). Foreign addresses
  ending in a known country are also captured (digit + street-start guarded).
- **Comms handles:** labelled Skype/Twitter/Telegram/Signal/etc. handles, and
  `@`-handles, become Text Block (note) nodes (kind `social-account`).
- **Vehicle VIN:** "VIN <17 chars, no I/O/Q>" attaches to the nearest vehicle.
- **Crypto wallets:** BTC (legacy + bech32), ETH, XMR addresses are detected
  (`cm-standards.detectCrypto`, governed by the VIRTUAL_CURRENCY vocab) and
  become account nodes (kind `crypto`), claimed early so numeric passes don't
  eat the hex.

## Optimisation pass (measured against the 5-file acid corpus)

- **Plateless vehicles:** "[colour] MAKE [Model]" and "[colour]/the TYPE" (white
  Audi, silver Mercedes Sprinter, dark BMW, white SEAT Leon, the van) now extract
  with colour/make/model attrs, de-duped against any adjacent number plate.
- **Financial IDs:** "account NNNNNNNN, sort code NN-NN-NN", IBAN (label-anchored),
  and alpha-prefixed passports ("passport P1234567").
- **Precision filters:** a plural "they" no longer inherits a singular carried
  subject; passive "were called" is not a comms link; a reporting verb
  ("X said … Y was arrested") no longer mints COMMUNICATED_WITH to the reported
  subject; STAYS_AT prefers the document subject and a specific stay supersedes a
  bare city/country.
- **Offline POS recall (`smartner-wink.js`):** wink-NLP POS proposes
  person/organisation candidates the rules missed (cue-gated: title/kinship/
  "called"/chat-line; gazetteer places and field labels excluded; orgs must be
  multi-token). Registered as the CRSmartNER runtime so the review screen
  union-merges them (rules win, low confidence, flagged). This lights up smart
  mode **offline** — no model download — recovering chat handles (Tovey, Macca),
  "Mr Vance", "brother Sean", and named institutions (Pennine Mutual Bank).

## Known limits (analyst-clearable)

- Coreference is surname/subject based; full pronoun resolution ("him", "the
  defendant") is not done.
- Address parsing is a targeted rule, not a full parser — non-stay-cued or
  unusually formatted addresses may be missed.
- Relation inference is sentence/cue scoped; long-range or implied relations
  need a human.

These are inherent to a rule/dictionary system and are why the tiering and the
review screen exist — the analyst confirms before anything is charted.

## Smart mode (optional transformer NER) — built, inert until a model is vendored

`js/core/smartner.js` (`window.CRSmartNER`) is the integration layer for an
in-browser transformer NER (e.g. GLiNER via transformers.js/ONNX). It is wired
into the review screen additively and is a **no-op by default** — it does no
network I/O and loads no model on its own, so the offline guarantee is intact.

- `mergeInto(ruleResult, modelSpans, opts)` — the pure, unit-tested core
  (`tests/smartner_tests.js`). It union-merges model spans with the rule
  entities: **rules win** (any model span overlapping a rule entity is dropped),
  unmapped labels are ignored, scores below `minScore` (0.5) are filtered, and
  new spans are added at **low/med** confidence (never high), flagged
  `smart-ner`, so they appear on the review screen for analyst sign-off.
- `review.js` calls it after rule extraction: if `CRSmartNER.available() &&
  CRSmartNER.enabled`, it fetches model spans, merges, and re-renders. Rule
  results show immediately; smart hits pop in when inference resolves.

**To activate it** (no edits to `smartner.js` needed):
1. Vendor a runtime + model locally (e.g. transformers.js + a GLiNER ONNX model
   under `vendor/` and `models/` — no CDN, per the offline rule).
2. Call `CRSmartNER.setRuntime(fn)` where `fn(text, types)` returns a Promise of
   `[{ text, start, end, label, score }]` (label from the GLiNER type set;
   `start`/`end` are character offsets into `text`).
3. Set `CRSmartNER.enabled = true` (wire a toggle in the chrome at that point —
   intentionally not added yet, to avoid shipping a dead control).

Until those steps are done the module stays inert and changes nothing.

## wink-NLP segmentation + POS (wired, on by default)

`js/core/segment.js` (`window.CRSegment`) wraps **wink-NLP** (vendored browser
bundle at `vendor/wink-bundle.js`; `npm` package for Node tests) to provide
character-accurate **sentence segmentation** and **POS tags**, with a pure-JS
regex fallback if wink is absent (the pipeline never hard-depends on it).

`extract.js` uses wink sentence boundaries when available, but **merges any wink
split that falls inside a CM-claimed entity span** back together — wink splits
dotted tokens (emails, URLs, "Co. No."), and the entity layer protects them.
A **STAYS_AT specificity** pass then drops a subject's STAYS_AT links to a bare
city/country when it already has a STAYS_AT to a full address (wink's tighter
sentences exposed that redundancy). Net: corpus 89/89 unchanged, demo clean.

CM stays the authority — wink only decides where sentences break and what each
token is; it never formats, types, validates, or grades. POS (`CRSegment.posTags`)
is available for future relation/coreference work.

## Add from URL (hosted path — needs internet)

The chrome's **Add menu → "Add from URL"** charts a live web article (news,
report) end-to-end. Because a browser can't fetch a third-party news site
directly (CORS), the fetch runs server-side:

1. `functions/api/fetch.js` (Cloudflare Pages Function, route `/api/fetch`) takes `?url=`, validates it's `http(s)`,
   fetches with a UA header + 15s timeout, guards the content-type is HTML,
   caps the body, then runs **Mozilla Readability** (in `jsdom`) to strip nav /
   ads / footers and return `{ title, byline, excerpt, text, url }`.
2. `js/ui/urlimport.js` (`window.CRUrlImport`) calls it, prepends title/byline/
   source to the cleaned text, and feeds it to `CRReview.open(text, title)` —
   the **same review screen** as paste, so the CM/i2 extractor runs unchanged and
   nothing reaches the chart unapproved.

This path is **online-only** by design: it depends on `/api/fetch`, which exists
only on the hosted deploy. On the offline exe / `file://` the call fails cleanly
and the UI tells the analyst to paste the text instead — the air-gapped paste
path is untouched. CM stays the authority; the URL feature only supplies text.

Verified in Node by invoking the real `functions/api/fetch.js` handler with a mocked
`fetch` over synthetic article HTML: Readability stripped chrome, the handler
returned HTTP 200 + clean JSON, and `CRExtract` charted persons, organisation,
vehicle, money and relationships. Error paths return 400 (bad URL), 415
(non-HTML), 502 (upstream failure). The only thing not verifiable in-sandbox is
the live network fetch itself, which exercises on the hosted deploy.

## Roadmap — the next layer, in priority order

1. **Pronoun coreference** (pure JS): extend section 11b with number/gender +
   proximity (Hobbs-style) so "him/his/the subject" resolve. Low risk, offline.
2. **Dedicated address parsing**: a UK-postcode-anchored grammar, or a
   `libpostal`-WASM build for international addresses. Bigger lift; offline-safe.
3. **Optional GLiNER "smart mode"** behind a toggle: run a transformer NER in the
   browser via `transformers.js`/ONNX, **union-merged** with the rule output and
   kept inside the existing confidence tiers. Costs a tens-of-MB model download
   and slower inference, but preserves the offline guarantee and lifts recall on
   entity types the rules don't anticipate. The rule/dictionary layer stays the
   precision backbone.
4. **LLM extraction** only as an explicit, opt-in online mode — most capable for
   messy prose and implied relations, but it breaks the air-gapped posture, so it
   must never be the default.

The throughline: keep the precise rule/dictionary core as the backbone, and add
recall in layers that each respect the offline, analyst-in-the-loop design.
