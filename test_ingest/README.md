# Test-Ingest Corpus — OPERATION GANNET

A synthetic, fully fictitious case used to exercise Chart Room / SOLAR ingest across the ten
intelligence source types. One linked case: the same people, phones, accounts, vehicles and
flights recur across all ten documents, so a correct ingest produces a **connected** chart rather
than ten unrelated islands.

> **All data is invented.** Mobile numbers use the Ofcom `07700 900xxx` drama range and landlines
> the `020 7946 0xxx` reserved range (guaranteed never allocated to a real subscriber). Names,
> DOBs, addresses, account numbers, NINOs, passports, company numbers, PNRs and PNC IDs are
> fabricated and follow *format* only. Every file is marked `OFFICIAL-SENSITIVE` and footed
> `FICTITIOUS TEST DATA` purely so the protective-marking banner has something to render — it is
> not real protectively-marked material.

## Contents

| # | Source type | File | Format | Shape |
|---|-------------|------|--------|-------|
| 01 | CM (Atlas 3×5×2 Intel Report) | `01_CM_Atlas_3x5x2_Intel_Report.docx` | docx | Prose IR + grading header |
| 02 | Discover (Suspicious Activity Report) | `02_Discover_SAR.docx` | docx | Form + free-text reason |
| 03 | PNC (PNC Print) | `03_PNC_Print.txt` | txt | Fixed-field terminal print |
| 04 | Experian (Credit Report) | `04_Experian_Report.pdf` | pdf | Tabular bureau extract |
| 05 | GBIQ (GB Connexus Report) | `05_GBIQ_Connexus_Report.pdf` | pdf | Tabular tracing/ID report |
| 06 | Open Source (Social Media / Internet) | `06_OpenSource_OSINT_Report.docx` | docx | Table + findings prose |
| 07 | PND (PND Report) | `07_PND_Report.pdf` | pdf | POLE tables (Person/Object/Location/Event) |
| 08 | Subscriber Details (CyComms) | `08_Subscriber_Details_CyComms.txt` | txt | Fixed-field comms-data return |
| 09 | HMRC (HMRC Reporting) | `09_HMRC_Reporting.pdf` | pdf | Tabular tax/employment disclosure |
| 10 | NBTC (Flight Records) | `10_NBTC_Flight_Records.pdf` | pdf | API + PNR tables |

## How to use

1. **Paste-Text / prose path (works today):** open `01`, `02`, `06` (and paste the `.txt` files),
   send through the extraction → review screen. You should see people, phones, IMEI, emails,
   accounts, vehicles, organisations, locations and dates populate, with relationships inferred.
2. **Structured path (the build target):** `03`–`05`, `07`–`10` are deliberately form/table-shaped.
   The current prose extractor only partially handles these — see `INGEST-MAPPING-SPEC.md` for
   exactly what is caught vs missed, and the per-format parser work each implies.
3. **Cross-source matching:** ingest two or more documents into the same case. The shared
   identifiers (see `CASE-KEY.md`) should drive the smart-match / deconflict flow — e.g. the same
   `07700 900118` arriving from PNC, the subscriber check, the SAR and the OSINT report should
   resolve to **one** Telephone entity linked to Darren COLE.

## Files in this folder
- `README.md` — this file.
- `CASE-KEY.md` — the linked case: full cast, every identifier, and the cross-reference matrix
  (the "answer key" for judging whether matching worked).
- `INGEST-MAPPING-SPEC.md` — per-document field → entity/link mapping, normalisation, confidence,
  and the verified catch/miss behaviour of the current engine with recommended parser work.
- `specimens/` — the ten documents.

*Generated 12/06/2026. Regenerate with `outputs/build_specimens.py`.*
