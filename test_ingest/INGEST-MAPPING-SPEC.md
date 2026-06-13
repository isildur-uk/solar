# INGEST MAPPING SPEC — source documents → Chart Room model

For each of the ten source types: the fields it carries, the Chart Room entity/link each should
become, normalisation, suggested confidence, and **what the current `js/core/extract.js` actually
does** (verified 12/06/2026 by running `X.extract()` over the specimens). The catch/miss column is
the honest engineering signal — "miss" items are the parser backlog.

Entity vocabulary (from BRIEF / i2 terms): `person, telephone, email, organisation, vehicle,
account (bank), address, location, cash/money, event, document, note`. Link types are directed and
analyst-confirmable.

Confidence convention: HIGH = unique structured identifier; MED = name/soft match; LOW = inferred.

---

## Cross-cutting normalisation (applies to every source)
- **Phones →** E.164. `07… → +447…`, strip spaces/brackets, `00 → +`. *(works today)*
- **Emails →** lowercase; gmail dot/plus rules only on gmail. *(works today)*
- **Names →** `FORENAME SURNAME` caps convention; Jaro-Winkler + nickname table, type-gated,
  DOB-corroborated, never auto-merge. *(works for inline prose; see PNC miss below)*
- **DOB / dates →** `DD/MM/CCYY`; ambiguous DD/MM flagged not guessed. *(works today)*
- **VRM →** `AA00 AAA`, space-normalised. *(works today)*
- **Identifiers prefixed** (`PNC`, `CRO`, `NINO`, `PPT`, `IMEI`, `AC/SC/CC`) attach to the nearest
  person/account. *(works when the subject is an inline `Forename SURNAME`; misses on field-form
  layouts — see §03/§08)*
- **Grading →** 3×5×2 `[2 A P]` parsed into `{source, assessment, handling}` provenance.

---

## 01 — CM (Atlas 3×5×2 Intelligence Report) · docx · prose
Originating IR: graded, sanitised intelligence narrative.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| IR / URN, unit, officer, date | `document` (source record) + provenance.sourceRef | — | HIGH |
| 3×5×2 grading `[2 A P]` | provenance `{source:2, assessment:A, handling:P}` on every derived entity | — | HIGH |
| Subject `DARREN COLE (DOB…, PNCID…)` | `person` + dob + pnc | — | HIGH |
| `07700 900118`, `07700 900342 (IMEI …)` | `telephone` ×2; IMEI → telephone(kind:IMEI) | person **uses** phone | HIGH |
| `Northgate Logistics Ltd (Co. No. 11428876)` | `organisation` + companyNumber | person **controls** org | HIGH |
| `LD18 KPN`, `VK69 RNZ` | `vehicle` | person **drives/keeper** | HIGH |
| `CG NORTHSIDE (OCG-GM-2291)` | `organisation`(kind:OCG) | members **member-of** | MED |
| "flew … to Málaga … PNR K7T2QL" | `event`(travel) + `location` Málaga + PNR note | person **travelled-to** | MED |
| ANPR convoy M60 04/06 | `event` + `location` | vehicles **co-located** | LOW |

**Engine today:** ✅ phones, IMEI, VRMs, org+companyNumber, locations, dates, money, CG prefix,
travel inference. ⚠️ the grading header `[2 A P]` is **not** parsed from free text yet (provenance
is set in the inspector, not lifted from the doc). ⚠️ kv-table header words ("Originating Unit",
"Protective Marking") can bleed into person labels when docx tables are flattened — ingest should
treat label:value table cells as fields, not prose.

---

## 02 — Discover (Suspicious Activity Report) · docx · form + reason-for-suspicion prose
NCA/UKFIU SAR. Glossary codes prefix `XX`; reason-for-suspicion answers who/what/where/when/why/how.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| SAR ref, route, report type (DAML), reporter institution | `document` + `organisation`(reporter) | — | HIGH |
| Glossary codes `XX-CASH / XX-NEX / XX-INTL` | tags on the document/event | — | HIGH |
| Main subject name/DOB/NINO/address/phone | `person` + ids + `address` | person **resides-at** address | HIGH |
| Personal a/c `s/c 20-00-00 a/c 30021847` | `account`(bank,sortcode) | person **holds** account | HIGH |
| Business a/c `…40918256` + Northgate Ltd | `account` + `organisation` | org **holds** account | HIGH |
| Cash deposits totalling £148,750; €60,000 to ES | `cash`/`money` + `event`(transaction) | account **transfer-to** account/beneficiary | MED |
| Bookkeeper Nadia ANSARI | `person` | **associate-of** subject | MED |

**Engine today:** ✅ persons (Darren COLE, Nadia ANSARI), NINO attach, email, orgs, locations
(Málaga/Spain), Monzo `a/c 81226740`, money, transaction events, relationships. ❌ the
`s/c 20-00-00  a/c 30021847` form is **missed** — `reAccPre` expects `Barclays a/c <digits>` with the
bank word immediately before `a/c`; here a sort code sits between. **Add** a `sort-code + account`
pair parser (`\b\d{2}-\d{2}-\d{2}\b` adjacent to `a/c \d{8}`). ❌ glossary `XX-…` codes not captured.
⚠️ the SAR reference `SAR-2026-0337841` misfires as a phone (`20260337841`) — ingest should
blacklist digits inside a `<TOKEN>-<digits>` reference pattern.

---

## 03 — PNC (PNC Print) · txt · fixed-field terminal print
Person/nominal antecedent print: warning signals, markers, convictions, linked vehicles, associates.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| `SURNAME / FORENAME(S)` + DOB + POB | `person` + dob | — | HIGH |
| PNCID, CRO, NINO, PASSPORT | person.pnc / .cro / .nino / .passport | — | HIGH |
| ALIAS / AKA (`Daz`, `Darren COLLINS (false)`) | person.aliases (not new people) | — | HIGH |
| Warning signals (VI, DR, WEA, ES, CON) | person.markers (risk flags) | — | HIGH |
| Info markers (OCG NOMINAL, LOCATE/TRACE) | person.markers + `organisation`(OCG) | **member-of** | HIGH |
| Linked vehicles `LD18 KPN / VK69 RNZ` | `vehicle` | person **keeper-of** | HIGH |
| Convictions (date / court / offence / disposal) | `event`(conviction) ×n + `location`(court) | person **convicted-at** | MED |
| Associates (FOSTER, Ryan COLE + PNCIDs) | `person` ×n | **associate-of** / **sibling-of** | MED |

**Engine today:** ✅ phones, VRMs, dates, orgs (NORTHSIDE, Northgate). ❌ **the nominal is not
assembled** — the name is in `SURNAME:`/`FORENAME(S):` field form, so `Darren COLE` is never built
as a `Forename SURNAME` token and therefore **PNCID/CRO/NINO/PASSPORT do not attach** (they have no
person to bind to). ❌ ALL-CAPS field labels (`CONTACT`, `CONVICTION`, `CON- CONCEALS`) misread as
`address`. **This file is the headline case for a dedicated PNC parser:** read the fixed-field
header (SURNAME/FORENAME/DOB/PNCID/CRO/NINO/PPT) into a person; parse the WARNING SIGNALS, MARKERS,
VEHICLES, CONVICTIONS and ASSOCIATES blocks by section. Until then, prose ingest of this file is
noisy. Warning signals and markers have **no entity slot yet** — recommend a `person.markers[]`
attribute rendered as node badges.

---

## 04 — Experian (Consumer Credit Report) · pdf · tabular (CAIS)
Bureau extract: personal details, electoral roll, CAIS accounts, public info, associations, searches.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| Personal details (name/DOB/address/email/mobile) | `person` + `address` + `email` + `telephone` | resides/uses | HIGH |
| Electoral roll (address + period) | `address` ×n with date range | person **resided-at** | HIGH |
| CAIS accounts (lender, masked acc, status, balance) | `account`(bank) ×n + `money` balances | person **holds** account | HIGH |
| Motor finance "Audi Q7" | links account ↔ `vehicle` | **finances** | MED |
| Public info (CCJ, POCA confiscation) | `event`(judgment) + `money` | person **subject-of** | MED |
| Financial associations (ANSARI, Northgate) | `person`/`organisation` | **financially-linked** | HIGH |
| Searches (date / searcher / type) | `event`(search) + `organisation`(searcher) | — | LOW |

**Engine today:** PDF is not text-ingested by the prose path at all — needs a **table parser**.
Masked accounts (`****1847`) must tail-match the full `30021847` from SAR/subscriber (see CASE-KEY
match trap). Electoral-roll address history → multiple dated `resided-at` links is a new pattern.

---

## 05 — GBIQ (GB Connexus tracing report) · pdf · tabular
Identity/address/associate tracing with match confidence.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| Best-match identity (name/DOB/NINO/phones/email) | `person` + ids | — | HIGH |
| Match confidence % | provenance/quality on the person | — | — |
| Address history (addr / from / to / source) | `address` ×n dated | person **resided-at** | HIGH |
| Linked individuals (name/DOB/basis) | `person` ×n | **associate-of** (basis as link label) | MED |
| Directorships (company / Co.No / role) | `organisation` + companyNumber | person **director-of / PSC-of** | HIGH |
| Vehicles linked (VRM/make/colour/keeper) | `vehicle` | **keeper-of** | HIGH |

**Engine today:** PDF table parser required. Note the report's own "confidence 96%" should map to
node provenance, **not** be confused with the no-fake-percentages rule on the review screen (that
rule governs *our* extraction confidence; a source-supplied score is a recorded attribute).

---

## 06 — Open Source (Social media / internet research) · docx · table + findings prose
OSINT capture: accounts, handles/URLs, attribution, geotag findings; 3×5×2 graded.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| 3×5×2 grading `[2 B P]` | provenance | — | HIGH |
| Account rows (platform / handle / URL / attributed-to) | **`social-account`** (new) or `note` + `person` | person **operates** account | MED |
| Geotag "Puerto Banús, Marbella 14/02/2026" | `location` + `event` | person **located-at** (date) | MED |
| Contact in bio (`WhatsApp 07700 900118`, email) | `telephone` / `email` | person **uses** | HIGH |
| Vehicle in photo `LD18 KPN` | `vehicle` | **depicts** | LOW |

**Engine today:** ✅ email, VRM, org, location, phone. ❌ **social-media handles/URLs not
extracted** — `@d_cole_mcr`, `@colezy87`, `instagram.com/…` have no pattern or entity type.
**Recommend** a `telephone`-style handler for `@handle` + platform-URL → a new `social-account`
entity linked to the person. This is the single highest-value OSINT gap.

---

## 07 — PND (Police National Database report) · pdf · POLE tables
Aggregated multi-force intelligence on the POLE model (Person/Object/Location/Event).

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| Person block (DOB/PNCID/NINO/addresses/phones) | `person` + ids + `address` + `telephone` | — | HIGH |
| Occurrences/intelligence (date/force/type/summary) | `event` ×n + `location` | person **subject-of** | MED |
| Objects (vehicles, handset IMEI) | `vehicle` / `telephone`(IMEI) | linked to events | HIGH |
| Locations (premises, routes) | `location`/`address` | events **occurred-at** | MED |
| Associations (nominal/DOB/relationship) | `person` ×n | **associate-of** (typed) | MED |

**Engine today:** PDF table parser required. PND maps almost 1:1 onto the Chart Room model
(POLE ≈ person/vehicle/location/event) — a good first structured-parser target. Cash seizures
(`£22,000 from VK69 RNZ`) → `cash` + `event` linked to a vehicle.

---

## 08 — Subscriber Details (CyComms comms-data return) · txt · fixed-field
IPA 2016 Part 3 subscriber/installation data for an MSISDN.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| Target MSISDN | `telephone` (E.164) | — | HIGH |
| Subscriber name / DOB / billing address | `person` + dob + `address` | person **subscriber-of** phone | HIGH |
| Contact email, alt number | `email` / `telephone` | person **uses** | HIGH |
| IMEI / IMSI / ICCID | `telephone`(kind:IMEI) + device attrs | phone **on-device** IMEI | HIGH |
| Payment method (Barclays s/c…a/c…) | `account` | **pays-with** | MED |
| CSP / operator (EE) | `organisation` | phone **provided-by** | LOW |

**Engine today:** ✅ IMEI (→ telephone), both phones, email, org (EE LIMITED). ⚠️ the disclosure
ref `CD/2026/GMP/004812` misfires as a phone (`2026004812`); ⚠️ **IMSI (15 digits) collides with the
IMEI 15-digit rule** — only the `IMEI`-prefixed value should become a device; an `IMSI:`/`ICCID:`
line needs its own handler or a guard. ❌ fixed-field subscriber form means the **person isn't
assembled from `SUBSCRIBER NAME: MR DARREN COLE`** — same field-form problem as PNC. Recommend a
small comms-data parser keyed on the `MSISDN/SUBSCRIBER NAME/IMEI/IMSI/ICCID` labels.

---

## 09 — HMRC (HMRC reporting) · pdf · tabular disclosure
Employment (RTI/PAYE), Self-Assessment, VAT/CT disclosure under the CRCA gateway.

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| Individual (NINO/UTR/DOB/address) | `person` + ids | — | HIGH |
| Employments/directorships (employer/PAYE ref/role/pay) | `organisation` + `event`(employment) + `money` | person **employed-by / director-of** | HIGH |
| Self-assessment (year/income/tax) | `event`(filing) + `money` | person **declared** | MED |
| Company VAT/CT (Co.No/VAT no/turnover) | `organisation` + companyNumber + VAT | — | HIGH |
| Analyst note: £41,200 declared vs £148,750 SAR cash | `note`/flag on org | contradiction marker | — |
| Associated party ANSARI (NINO/UTR/income) | `person` + ids | **associate-of** | MED |

**Engine today:** PDF table parser required. UTR and PAYE-ref are **new identifier types** (add to
the prefixed-identifier set: `UTR \d{10}`, `PAYE \d{3}/[A-Z0-9]+`, `VAT GB \d{9}`). The
turnover-vs-cash contradiction is the analytical payoff — worth surfacing as a node flag.

---

## 10 — NBTC (Flight records) · pdf · API + PNR tables
Border travel record: API (from document) + PNR (booking).

| Field | → Entity / attribute | Link | Conf |
|-------|----------------------|------|------|
| Subject API (surname/given/DOB/nat/passport) | `person` + passport | — | HIGH |
| Movements (date/carrier/flight/route/dir/seat/PNR) | `event`(flight) ×n + `location`(airports) | person **travelled** MAN→AGP | HIGH |
| Airports (MAN/AGP/AMS/OTP) | `location` (IATA) | flight **from/to** | HIGH |
| PNR detail (booking/contact/payment) | `note` + `telephone`/`email` + `account` | person **booked-with** | MED |
| Passengers on PNR (COLE + DRAGOMIR) | `person` ×n | **co-travelled-with** | HIGH |
| Co-traveller cross-ref (other PNRs) | `person` + `event` | **co-travelled-with** | MED |

**Engine today:** the IATA gazetteer already geolocates MAN/AGP/AMS/OTP on the map. PDF table
parser required to lift the rows. Flight events + co-traveller links are a strong demo of
"one document, many entities + a network". PNR locator (`K7T2QL`) is a useful cross-doc key
(also appears in CM and OSINT).

---

## Recommended ingest backlog (most-severe-first)
1. **Field-form person assembly** — read `SURNAME:/FORENAME:` and `SUBSCRIBER NAME:` labels into a
   person so prefixed IDs (PNC/CRO/NINO/PPT) attach. Fixes §03 and §08. *(highest value, smallest fix)*
2. **PDF table ingest** — §04, §05, §07, §09, §10 are all table-shaped; a table → row-as-record
   importer (reuse the CSV review/merge flow) unlocks five of the ten sources.
3. **Reference-number guard** — stop `XXX-YYYY-NNNNN` / `XX/YYYY/…/NNNN` references misfiring as
   phones (§02, §08).
4. **New identifier patterns** — UTR, PAYE ref, VAT no (§09); IMSI/ICCID with a guard vs IMEI (§08);
   sort-code + account pair (§02).
5. **Social-account entity** — `@handle` + platform URL → `social-account` linked to person (§06).
6. **Markers / warning signals** — `person.markers[]` rendered as node badges (§03, §07).
7. **Grading lift** — parse `[2 A P]` from document text into provenance (§01, §06).

Items marked here as engine behaviour were verified against `js/core/extract.js` on 12/06/2026;
treat the PDF parser items as design notes (no PDF text path exists in the prose extractor yet).
