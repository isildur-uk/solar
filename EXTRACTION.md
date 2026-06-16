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
  next sentence (postcode-terminated addresses included).

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
