# CASE KEY — OPERATION GANNET (fictitious)

The "answer key" for the corpus. Use it to verify that ingest extracted the right entities and
that smart-matching collapsed the shared identifiers into single nodes across documents.

**Scenario.** Darren COLE heads the *NORTHSIDE* OCG: importation and supply of Class A drugs,
laundering proceeds through the front company **Northgate Logistics Ltd**. Lee FOSTER runs
transport, Nadia ANSARI launders the cash, Ryan COLE fronts a cash valeting business, Sofia
DRAGOMIR is the overseas (Spain/Romania) link.

## Cast

| Subject | DOB | Key IDs | Phones | Role |
|---------|-----|---------|--------|------|
| **Darren Michael COLE** | 14/03/1987 | PNCID 2005/0456231K · CRO 124356/05G · NINO JT 60 12 04 C · PPT 533201984 · UTR 2847109365 | 07700 900118 (clean) · 07700 900342 (graft, IMEI 359872041256683) | Principal / OCG lead |
| **Lee Anthony FOSTER** | 02/11/1991 | PNCID 2010/0782145M | 07700 900467 | Transport / courier |
| **Nadia ANSARI** | 27/06/1994 | NINO SJ 88 41 60 A · UTR 6135092874 | 07700 900591 | Bookkeeper / launderer |
| **Ryan COLE** | 19/08/1990 | PNCID 2008/0339480F | 07700 900205 | Sibling / cash business |
| **Sofia DRAGOMIR** | 05/01/1996 | PPT 521049883 (ROU) | 07700 900733 | Overseas link |

## Organisations
- **NORTHGATE LOGISTICS LTD** — Co. No. 11428876, VAT GB 384 1129 55, dir Darren COLE; base Unit 4,
  Trafford Trade Park, Manchester M17 1WA. Laundering front.
- **AMBERLINE DETAILING LTD** — Co. No. 12993641, Ryan COLE (PSC). Cash valeting.
- **CG NORTHSIDE** — OCG, GMP ref OCG-GM-2291 (ATLAS criminal-group prefix `CG`).

## Identifiers (canonical values)

| Type | Value(s) | Owner |
|------|----------|-------|
| Telephone | 07700 900118 / +447700900118 | Darren COLE (primary) |
| Telephone | 07700 900342 / +447700900342 | Darren COLE (graft handset) |
| IMEI | 359872041256683 | Handset on 07700 900342 |
| IMSI / ICCID | 234300912776541 / 8944300000912776541 | EE SIM, 07700 900342 |
| Email | darren.cole87@gmail.com | Darren COLE (personal) |
| Email | northgate.logistics@outlook.com | Darren COLE / Northgate |
| Email | n.ansari.books@gmail.com | Nadia ANSARI |
| Bank a/c | Barclays 20-00-00 / 30021847 | Darren COLE personal |
| Bank a/c | Barclays 20-32-06 / 40918256 | Northgate Logistics business |
| Bank a/c | Monzo 04-00-04 / 81226740 | Nadia ANSARI |
| Vehicle (VRM) | LD18 KPN | Audi Q7 black — Darren COLE |
| Vehicle (VRM) | VK69 RNZ | Ford Transit white — Foster / Northgate |
| Vehicle (VRM) | MA20 OZB | BMW 3 Series grey — Nadia ANSARI |
| Address | 14 Brackenfield Road, Stockport, SK4 2RH | Darren COLE home |
| Address | Unit 4, Trafford Trade Park, Manchester, M17 1WA | Northgate base |
| Flight PNR | K7T2QL | COLE + DRAGOMIR, MAN↔AGP 12–19/02/2026 |
| Flight PNR | 4RB9XM | DRAGOMIR, MAN→OTP 03/01/2026 |
| Flight PNR | QH22LP | FOSTER, MAN→AMS 28/11/2025 |

## Cross-reference matrix — which identifier appears in which document

A correct ingest + match should converge these to single nodes. `●` = present.

| Identifier | 01 CM | 02 SAR | 03 PNC | 04 Exp | 05 GBIQ | 06 OSINT | 07 PND | 08 Sub | 09 HMRC | 10 NBTC |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Darren COLE | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| 07700 900118 | ● | ● | ● | ● | ● | ● | ● | ● | | ● |
| 07700 900342 | ● | | ● | | ● | | ● | ● | | |
| IMEI …1256683 | ● | | | | | | ● | ● | | |
| Barclays a/c 30021847 | | ● | | ●(masked) | | | | ● | | ●(masked) |
| Northgate Logistics Ltd | ● | ● | ● | ● | ● | ● | ● | ● | ● | |
| Co. No. 11428876 | ● | ● | | | ● | | | | ● | |
| NINO JT 60 12 04 C | | ● | ● | | ● | | ● | | ● | |
| Vehicle LD18 KPN | ● | | ● | | ● | ● | ● | | | |
| Vehicle VK69 RNZ | ● | | ● | | ● | | ● | | | |
| Lee FOSTER | ● | | ● | | ● | | ● | | | ● |
| Nadia ANSARI | ● | ● | | ●(assoc) | ● | ● | ● | | ● | |
| Sofia DRAGOMIR | ● | | | | | ● | | | | ● |
| PNR K7T2QL | ● | | | | | ● | | | | ● |
| Marbella / Málaga (ES) | ● | ● | | | | ● | | | | ● |

## Expected chart (smoke test)
After ingesting all ten: **~7 person nodes, 3 organisations, 3 vehicles, 2+ telephones (one with
IMEI), 3 bank accounts, 2 addresses + several locations, 3 flight events**, with Darren COLE as the
hub. The £148,750 cash (SAR) vs £41,200 declared turnover (HMRC) is the analytical contradiction
the chart should make visible.

## Deliberate "match traps" (to test the deconflict / fuzzy layer)
- **Same person, two phones** — 900118 and 900342 must both link to COLE, not merge with each other.
- **Alias** — PNC lists `Darren COLLINS (false)` and `Daz`; should be aliases of COLE, not new people.
- **Sibling same surname** — Ryan COLE must stay distinct from Darren COLE (different DOB/PNCID).
- **Masked vs full account** — Experian/NBTC show `****1847`; SAR/subscriber show `30021847`. Same
  account; tests whether tail-matching reconciles them.
- **Cross-format phone** — `07700 900118`, `+447700900118` and `07700900118` all appear; E.164
  normalisation should unify them.
