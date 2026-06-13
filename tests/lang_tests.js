/* lang_tests.js — SPEC-based tests for extract.js (and lang.js/match.js) relationship fields.
 * Tests written against the SPEC, not the implementation.
 * Run: node tests/lang_tests.js  (from chart_room directory)
 *
 * Contract assertions for: type, confidence, modality, negated, amount,
 * cueSpan, dateISO on relationships, plus entity attrs (aka, colour, make),
 * relative date resolution, and canonical regressions.
 */
"use strict";

var path = require("path");
var base = path.join(__dirname, "..");
var X = require(path.join(base, "js/core/extract.js"));
var M = require(path.join(base, "js/core/match.js"));

/* ------------------------------------------------------------------ */
/*  Minimal harness                                                    */
/* ------------------------------------------------------------------ */

var passed = 0, failed = 0;
var failures = [];

function test(name, fn) {
  try {
    fn();
    console.log("PASS: " + name);
    passed++;
  } catch (e) {
    var msg = "FAIL: " + name + "\n      " + e.message;
    console.log(msg);
    failures.push(msg);
    failed++;
  }
}

function assert(val, msg) {
  if (!val) throw new Error(msg || "assertion failed");
}
function assertEquals(a, b, msg) {
  if (a !== b) throw new Error((msg || "assertEquals") + " — expected " + JSON.stringify(b) + ", got " + JSON.stringify(a));
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findRel(rels, type) {
  return rels.find(function (r) { return r.type === type; }) || null;
}
function findRelBetween(rels, entities, srcLabel, tgtLabel, type) {
  var src = entities.find(function (e) { return e.label === srcLabel; });
  var tgt = entities.find(function (e) { return e.label === tgtLabel; });
  if (!src || !tgt) return null;
  return rels.find(function (r) {
    return r.sourceRef === src.ref && r.targetRef === tgt.ref && r.type === type;
  }) || null;
}
function entityByLabel(entities, label) {
  return entities.find(function (e) { return e.label === label; }) || null;
}

/* ================================================================== */
/*  TEST 1 — "flew to Malaga on 11/06/2026"                          */
/*  rel: TRAVELS_TO, modality "occurred", dateISO "2026-06-11",       */
/*  cueSpan text contains "flew"                                       */
/* ================================================================== */

var TEXT1 = "Geoff BAINES flew to Malaga on 11/06/2026";
var R1 = X.extract(TEXT1, { refDate: "2026-06-10" });

test("T1a: TRAVELS_TO relationship exists for Malaga", function () {
  var rel = findRel(R1.relationships, "TRAVELS_TO");
  assert(rel !== null, "No TRAVELS_TO relationship found. Rels: " +
    R1.relationships.map(function (r) { return r.type; }).join(", "));
});

test("T1b: TRAVELS_TO modality is 'occurred'", function () {
  var rel = findRel(R1.relationships, "TRAVELS_TO");
  assert(rel !== null, "No TRAVELS_TO relationship");
  assertEquals(rel.modality, "occurred", "TRAVELS_TO modality");
});

test("T1c: TRAVELS_TO dateISO is '2026-06-11'", function () {
  var rel = findRel(R1.relationships, "TRAVELS_TO");
  assert(rel !== null, "No TRAVELS_TO relationship");
  assertEquals(rel.dateISO, "2026-06-11", "TRAVELS_TO dateISO");
});

test("T1d: TRAVELS_TO cueSpan text contains 'flew'", function () {
  var rel = findRel(R1.relationships, "TRAVELS_TO");
  assert(rel !== null, "No TRAVELS_TO relationship");
  assert(rel.cueSpan !== null && rel.cueSpan !== undefined, "cueSpan must be non-null");
  assert(Array.isArray(rel.cueSpan) && rel.cueSpan.length === 2, "cueSpan must be [s,e]");
  var cueText = TEXT1.slice(rel.cueSpan[0], rel.cueSpan[1]);
  assert(cueText.indexOf("flew") !== -1,
    "cueSpan text must contain 'flew', got: '" + cueText + "' at " + JSON.stringify(rel.cueSpan));
});

/* ================================================================== */
/*  TEST 2 — "Karen WALSH was contacted by Geoff BAINES"             */
/*  COMMUNICATED_WITH source=BAINES, target=WALSH, modality occurred  */
/* ================================================================== */

var TEXT2 = "Karen WALSH was contacted by Geoff BAINES";
var R2 = X.extract(TEXT2, { refDate: "2026-06-10" });

test("T2a: COMMUNICATED_WITH relationship exists", function () {
  var rel = findRel(R2.relationships, "COMMUNICATED_WITH");
  assert(rel !== null, "No COMMUNICATED_WITH relationship. Rels: " +
    R2.relationships.map(function (r) { return r.type; }).join(", "));
});

test("T2b: passive reversal — source is BAINES, target is WALSH", function () {
  var rel = findRel(R2.relationships, "COMMUNICATED_WITH");
  assert(rel !== null, "No COMMUNICATED_WITH relationship");
  var baines = entityByLabel(R2.entities, "Geoff BAINES");
  var walsh = entityByLabel(R2.entities, "Karen WALSH");
  assert(baines !== null, "Geoff BAINES entity not found");
  assert(walsh !== null, "Karen WALSH entity not found");
  assertEquals(rel.sourceRef, baines.ref,
    "Source should be BAINES (passive reversal), got sourceRef=" + rel.sourceRef + " vs BAINES.ref=" + baines.ref);
  assertEquals(rel.targetRef, walsh.ref,
    "Target should be WALSH (passive reversal), got targetRef=" + rel.targetRef + " vs WALSH.ref=" + walsh.ref);
});

test("T2c: COMMUNICATED_WITH modality is 'occurred'", function () {
  var rel = findRel(R2.relationships, "COMMUNICATED_WITH");
  assert(rel !== null, "No COMMUNICATED_WITH relationship");
  assertEquals(rel.modality, "occurred", "COMMUNICATED_WITH modality");
});

/* ================================================================== */
/*  TEST 3 — "Geoff BAINES denies meeting Dean HOLLAND"              */
/*  ASSOCIATE_OF negated===true, confidence "low"                     */
/* ================================================================== */

var TEXT3 = "Geoff BAINES denies meeting Dean HOLLAND";
var R3 = X.extract(TEXT3, { refDate: "2026-06-10" });

test("T3a: ASSOCIATE_OF relationship exists (denial)", function () {
  var rel = findRel(R3.relationships, "ASSOCIATE_OF");
  assert(rel !== null, "No ASSOCIATE_OF relationship found. Rels: " +
    R3.relationships.map(function (r) { return r.type; }).join(", "));
});

test("T3b: ASSOCIATE_OF negated===true", function () {
  var rel = findRel(R3.relationships, "ASSOCIATE_OF");
  assert(rel !== null, "No ASSOCIATE_OF relationship");
  assert(rel.negated === true,
    "ASSOCIATE_OF should have negated===true, got: " + rel.negated);
});

test("T3c: ASSOCIATE_OF confidence is 'low'", function () {
  var rel = findRel(R3.relationships, "ASSOCIATE_OF");
  assert(rel !== null, "No ASSOCIATE_OF relationship");
  assertEquals(rel.confidence, "low", "ASSOCIATE_OF confidence should be 'low' when negated");
});

/* ================================================================== */
/*  TEST 4 — "Dean HOLLAND did not travel to Seville"                */
/*  TRAVELS_TO negated===true                                          */
/* ================================================================== */

var TEXT4 = "Dean HOLLAND did not travel to Seville";
var R4 = X.extract(TEXT4, { refDate: "2026-06-10" });

test("T4a: TRAVELS_TO exists for Seville", function () {
  var rel = findRel(R4.relationships, "TRAVELS_TO");
  assert(rel !== null, "No TRAVELS_TO relationship. Rels: " +
    R4.relationships.map(function (r) { return r.type; }).join(", "));
});

test("T4b: TRAVELS_TO negated===true", function () {
  var rel = findRel(R4.relationships, "TRAVELS_TO");
  assert(rel !== null, "No TRAVELS_TO relationship");
  assert(rel.negated === true,
    "TRAVELS_TO should have negated===true for 'did not travel', got: " + rel.negated);
});

/* ================================================================== */
/*  TEST 5 — "Dean HOLLAND transferred £5,000 to Marta RUIZ"         */
/*  TRANSACTED_WITH HOLLAND→RUIZ, amount "£5,000"                     */
/* ================================================================== */

var TEXT5 = "Dean HOLLAND transferred £5,000 to Marta RUIZ";
var R5 = X.extract(TEXT5, { refDate: "2026-06-10" });

test("T5a: TRANSACTED_WITH HOLLAND→RUIZ relationship exists", function () {
  var rel = findRelBetween(R5.relationships, R5.entities, "Dean HOLLAND", "Marta RUIZ", "TRANSACTED_WITH");
  assert(rel !== null, "No TRANSACTED_WITH HOLLAND→RUIZ. Rels: " +
    R5.relationships.map(function (r) {
      var src = R5.entities.find(function (e) { return e.ref === r.sourceRef; });
      var tgt = R5.entities.find(function (e) { return e.ref === r.targetRef; });
      return r.type + ":" + (src && src.label) + "->" + (tgt && tgt.label);
    }).join(", "));
});

test("T5b: TRANSACTED_WITH carries amount '£5,000'", function () {
  var rel = findRelBetween(R5.relationships, R5.entities, "Dean HOLLAND", "Marta RUIZ", "TRANSACTED_WITH");
  assert(rel !== null, "No TRANSACTED_WITH HOLLAND→RUIZ");
  assertEquals(rel.amount, "£5,000", "TRANSACTED_WITH amount should be '£5,000'");
});

/* ================================================================== */
/*  TEST 6 — sim card purchase, planned modality on +34 number        */
/*  "He is expected to purchase a new sim card with the number +34..."  */
/* ================================================================== */

var TEXT6 = "Geoff BAINES uses 07686868686. He is expected to purchase a new sim card with the number +34 1231231233";
var R6 = X.extract(TEXT6, { refDate: "2026-06-10" });

test("T6a: USES rel to +34 1231231233 phone exists", function () {
  var spPhone = R6.entities.find(function (e) {
    return e.type === "phone" && e.value && e.value.indexOf("341231231233") !== -1;
  });
  assert(spPhone !== null && spPhone !== undefined,
    "Spanish +34 phone entity not found. Phones: " +
    R6.entities.filter(function (e) { return e.type === "phone"; }).map(function (e) { return e.value; }).join(", "));
  var rel = R6.relationships.find(function (r) {
    return r.targetRef === spPhone.ref && r.type === "USES";
  });
  assert(rel !== null && rel !== undefined,
    "No USES rel to the +34 sim phone");
});

test("T6b: USES rel to +34 sim phone has modality 'planned'", function () {
  var spPhone = R6.entities.find(function (e) {
    return e.type === "phone" && e.value && e.value.indexOf("341231231233") !== -1;
  });
  assert(spPhone !== null && spPhone !== undefined, "Spanish +34 phone entity not found");
  var rel = R6.relationships.find(function (r) {
    return r.targetRef === spPhone.ref && r.type === "USES";
  });
  assert(rel !== null && rel !== undefined, "No USES rel to the +34 sim phone");
  assertEquals(rel.modality, "planned",
    "USES rel to sim phone should have modality 'planned', got: " + rel.modality);
});

/* ================================================================== */
/*  TEST 7 — Tony BAXTER org/address/vehicle                          */
/*  EMPLOYS: source=org, target=BAXTER; STAYS_AT BAXTER→address;     */
/*  address label NOT containing "drives"; vehicle colour/make; USES   */
/* ================================================================== */

var TEXT7 = "Tony BAXTER, who works for Baines Logistics Ltd, lives at 14 Mill Road, Bristol and drives a black BMW VK21 ABC";
var R7 = X.extract(TEXT7, { refDate: "2026-06-10" });

test("T7a: EMPLOYS exists with source=Baines Logistics Ltd, target=Tony BAXTER", function () {
  var rel = findRel(R7.relationships, "EMPLOYS");
  assert(rel !== null, "No EMPLOYS relationship. Rels: " +
    R7.relationships.map(function (r) { return r.type; }).join(", "));
  var org = R7.entities.find(function (e) { return e.type === "organisation"; });
  var baxter = entityByLabel(R7.entities, "Tony BAXTER");
  assert(org !== null && org !== undefined, "Organisation entity not found");
  assert(baxter !== null && baxter !== undefined, "Tony BAXTER entity not found");
  assertEquals(rel.sourceRef, org.ref,
    "EMPLOYS source should be the organisation, got src=" + rel.sourceRef + " org=" + org.ref);
  assertEquals(rel.targetRef, baxter.ref,
    "EMPLOYS target should be Tony BAXTER, got tgt=" + rel.targetRef + " baxter=" + baxter.ref);
});

test("T7b: STAYS_AT relationship from Tony BAXTER to address", function () {
  var baxter = entityByLabel(R7.entities, "Tony BAXTER");
  assert(baxter !== null && baxter !== undefined, "Tony BAXTER entity not found");
  var rel = R7.relationships.find(function (r) {
    return r.sourceRef === baxter.ref && r.type === "STAYS_AT";
  });
  assert(rel !== null && rel !== undefined,
    "No STAYS_AT from Tony BAXTER. Rels from BAXTER: " +
    R7.relationships.filter(function (r) { return r.sourceRef === baxter.ref; }).map(function (r) { return r.type; }).join(", "));
  var addr = R7.entities.find(function (e) { return e.ref === rel.targetRef; });
  assert(addr !== null && addr !== undefined && addr.type === "address",
    "STAYS_AT target should be an address, got: " + (addr && addr.type));
});

test("T7c: address label does NOT contain 'drives'", function () {
  var addrs = R7.entities.filter(function (e) { return e.type === "address"; });
  assert(addrs.length > 0, "No address entity found");
  addrs.forEach(function (a) {
    assert(a.label.indexOf("drives") === -1,
      "Address label should not contain 'drives', got: '" + a.label + "'");
  });
});

test("T7d: vehicle entity exists with attrs.colour 'black'", function () {
  var veh = R7.entities.find(function (e) { return e.type === "vehicle"; });
  assert(veh !== null && veh !== undefined, "No vehicle entity found");
  assertEquals(veh.attrs.colour, "black", "Vehicle colour should be 'black'");
});

test("T7e: vehicle entity has attrs.make 'BMW'", function () {
  var veh = R7.entities.find(function (e) { return e.type === "vehicle"; });
  assert(veh !== null && veh !== undefined, "No vehicle entity found");
  assert(veh.attrs.make && veh.attrs.make.toUpperCase() === "BMW",
    "Vehicle make should be 'BMW', got: " + (veh.attrs && veh.attrs.make));
});

test("T7f: USES relationship from Tony BAXTER to vehicle exists", function () {
  var baxter = entityByLabel(R7.entities, "Tony BAXTER");
  var veh = R7.entities.find(function (e) { return e.type === "vehicle"; });
  assert(baxter !== null && baxter !== undefined, "Tony BAXTER not found");
  assert(veh !== null && veh !== undefined, "Vehicle not found");
  var rel = R7.relationships.find(function (r) {
    return r.sourceRef === baxter.ref && r.targetRef === veh.ref && r.type === "USES";
  });
  assert(rel !== null && rel !== undefined,
    "No USES from Tony BAXTER to vehicle. Rels: " +
    R7.relationships.map(function (r) { return r.type + ":" + r.sourceRef + "->" + r.targetRef; }).join(", "));
});

/* ================================================================== */
/*  TEST 8 — Gary 'Gaz' NEWELL, also known as 'Tank'                 */
/*  person label "Gary NEWELL"; aka contains "Gaz" and "Tank" (no     */
/*  trailing quote); COMMUNICATED_WITH phone dateISO 2026-06-09;      */
/*  matchEntity returns suggestion for "Tank NEWELL"                   */
/* ================================================================== */

var TEXT8 = "Gary 'Gaz' NEWELL, also known as 'Tank', called 07700 900456 last Tuesday.";
var R8 = X.extract(TEXT8, { refDate: "2026-06-10" });

test("T8a: person label is 'Gary NEWELL'", function () {
  var person = entityByLabel(R8.entities, "Gary NEWELL");
  assert(person !== null && person !== undefined,
    "Person 'Gary NEWELL' not found. Persons: " +
    R8.entities.filter(function (e) { return e.type === "person"; }).map(function (e) { return e.label; }).join(", "));
});

test("T8b: person attrs.aka contains 'Gaz' (no trailing quote)", function () {
  var person = entityByLabel(R8.entities, "Gary NEWELL");
  assert(person !== null && person !== undefined, "Gary NEWELL not found");
  var aka = (person.attrs && person.attrs.aka) || "";
  assert(aka.indexOf("Gaz") !== -1,
    "attrs.aka should contain 'Gaz', got: '" + aka + "'");
  assert(aka.indexOf("Gaz'") === -1 && aka.indexOf('Gaz"') === -1,
    "attrs.aka should NOT have trailing quote after Gaz, got: '" + aka + "'");
});

test("T8c: person attrs.aka contains 'Tank' (no trailing quote)", function () {
  var person = entityByLabel(R8.entities, "Gary NEWELL");
  assert(person !== null && person !== undefined, "Gary NEWELL not found");
  var aka = (person.attrs && person.attrs.aka) || "";
  assert(aka.indexOf("Tank") !== -1,
    "attrs.aka should contain 'Tank', got: '" + aka + "'");
  assert(aka.indexOf("Tank'") === -1 && aka.indexOf('Tank"') === -1,
    "attrs.aka should NOT have trailing quote after Tank, got: '" + aka + "'");
});

test("T8d: COMMUNICATED_WITH phone dateISO is '2026-06-09' (last Tuesday from Wednesday 2026-06-10)", function () {
  var rel = findRel(R8.relationships, "COMMUNICATED_WITH");
  assert(rel !== null, "No COMMUNICATED_WITH relationship. Rels: " +
    R8.relationships.map(function (r) { return r.type + ":" + r.dateISO; }).join(", "));
  assertEquals(rel.dateISO, "2026-06-09", "dateISO should be 2026-06-09 (last Tuesday)");
});

test("T8e: matchEntity({type:'person',label:'Tank NEWELL'}, existing) returns suggestion", function () {
  var existingEntity = {
    type: "person", label: "Gary NEWELL", ids: {}, attrs: { aka: "Gaz; Tank" }
  };
  var candidate = { type: "person", label: "Tank NEWELL" };
  var suggestions = M.matchEntity(candidate, [existingEntity]);
  assert(suggestions.length > 0,
    "matchEntity should return at least one suggestion for 'Tank NEWELL' vs 'Gary NEWELL' (aka: Gaz; Tank)");
  var good = suggestions.find(function (s) {
    return s.tier === "exact" || s.tier === "strong";
  });
  assert(good !== null && good !== undefined,
    "Suggestion tier should be 'exact' or 'strong', got tiers: " +
    suggestions.map(function (s) { return s.tier; }).join(", "));
});

/* ================================================================== */
/*  TEST 9 — pronoun "She" + 2 phones + email = 3 USES rels          */
/*  Preceding sentence "Karen WALSH is a nominal."                    */
/* ================================================================== */

var TEXT9 = "Karen WALSH is a nominal. She uses 07700 900123, 07700 900124 and email k.w@gmail.com";
var R9 = X.extract(TEXT9, { refDate: "2026-06-10" });

test("T9a: 3 USES relationships exist (2 phones + email)", function () {
  var usesRels = R9.relationships.filter(function (r) { return r.type === "USES"; });
  assert(usesRels.length >= 3,
    "Should have at least 3 USES rels (2 phones + email), got " + usesRels.length +
    ". Rels: " + R9.relationships.map(function (r) { return r.type; }).join(", "));
});

test("T9b: USES rel to first phone +447700900123 exists", function () {
  var phone = R9.entities.find(function (e) {
    return e.type === "phone" && e.value === "+447700900123";
  });
  assert(phone !== null && phone !== undefined,
    "Phone +447700900123 not found. Phones: " +
    R9.entities.filter(function (e) { return e.type === "phone"; }).map(function (e) { return e.value; }).join(", "));
  var rel = R9.relationships.find(function (r) {
    return r.targetRef === phone.ref && r.type === "USES";
  });
  assert(rel !== null && rel !== undefined, "No USES rel to +447700900123");
});

test("T9c: USES rel to second phone +447700900124 exists", function () {
  var phone = R9.entities.find(function (e) {
    return e.type === "phone" && e.value === "+447700900124";
  });
  assert(phone !== null && phone !== undefined,
    "Phone +447700900124 not found. Phones: " +
    R9.entities.filter(function (e) { return e.type === "phone"; }).map(function (e) { return e.value; }).join(", "));
  var rel = R9.relationships.find(function (r) {
    return r.targetRef === phone.ref && r.type === "USES";
  });
  assert(rel !== null && rel !== undefined, "No USES rel to +447700900124");
});

test("T9d: USES rel to email k.w@gmail.com exists", function () {
  var email = R9.entities.find(function (e) {
    return e.type === "email" && e.label && e.label.indexOf("k.w@gmail") !== -1;
  });
  assert(email !== null && email !== undefined,
    "Email k.w@gmail.com not found. Emails: " +
    R9.entities.filter(function (e) { return e.type === "email"; }).map(function (e) { return e.label; }).join(", "));
  var rel = R9.relationships.find(function (r) {
    return r.targetRef === email.ref && r.type === "USES";
  });
  assert(rel !== null && rel !== undefined, "No USES rel to k.w@gmail.com email");
});

/* ================================================================== */
/*  TEST 10 — relative date "yesterday" + refDate 2026-06-10          */
/*  dateHit resolves to 2026-06-09 (entity or rel dateISO);           */
/*  ambiguities entry mentioning "resolved"                            */
/* ================================================================== */

var TEXT10 = "Geoff BAINES met Karen WALSH yesterday.";
var R10 = X.extract(TEXT10, { refDate: "2026-06-10" });

test("T10a: date entity or rel dateISO 2026-06-09 appears for 'yesterday'", function () {
  var dateEnt = R10.entities.find(function (e) {
    return e.type === "date" && e.attrs && e.attrs.iso === "2026-06-09";
  });
  var relHit = R10.relationships.find(function (r) { return r.dateISO === "2026-06-09"; });
  assert(dateEnt !== null && dateEnt !== undefined || relHit !== null && relHit !== undefined,
    "No date entity or rel with dateISO 2026-06-09 found for 'yesterday'. " +
    "Date entities: " + R10.entities.filter(function (e) { return e.type === "date"; }).map(function (e) { return e.label + ":" + (e.attrs && e.attrs.iso); }).join(", "));
});

test("T10b: ambiguities entry mentions 'resolved' for relative date", function () {
  var ambig = R10.ambiguities.find(function (a) {
    return (a.message || "").indexOf("resolved") !== -1;
  });
  assert(ambig !== null && ambig !== undefined,
    "No ambiguities entry mentioning 'resolved'. Ambiguities: " +
    JSON.stringify(R10.ambiguities));
});

/* ================================================================== */
/*  TEST 11 — invariants: no source===target, cueSpan 0<=s<e<=len     */
/* ================================================================== */

var TEXTS_11 = [
  "Geoff BAINES flew to Malaga on 11/06/2026",
  "Karen WALSH was contacted by Geoff BAINES",
  "Dean HOLLAND transferred £5,000 to Marta RUIZ",
  "Tony BAXTER, who works for Baines Logistics Ltd, lives at 14 Mill Road, Bristol and drives a black BMW VK21 ABC",
  "Karen WALSH is a nominal. She uses 07700 900123, 07700 900124 and email k.w@gmail.com"
];

TEXTS_11.forEach(function (txt, idx) {
  test("T11a-" + (idx + 1) + ": no self-relationship (source===target) in: '" + txt.slice(0, 40) + "...'", function () {
    var r = X.extract(txt, { refDate: "2026-06-10" });
    var selfRels = r.relationships.filter(function (rel) {
      return rel.sourceRef === rel.targetRef;
    });
    assert(selfRels.length === 0,
      "Found " + selfRels.length + " self-relationship(s): " +
      selfRels.map(function (rel) { return rel.type + " (" + rel.sourceRef + "=>" + rel.targetRef + ")"; }).join(", "));
  });

  test("T11b-" + (idx + 1) + ": all cueSpans satisfy 0<=s<e<=text.length in: '" + txt.slice(0, 40) + "...'", function () {
    var r = X.extract(txt, { refDate: "2026-06-10" });
    var bad = [];
    r.relationships.forEach(function (rel) {
      if (!rel.cueSpan) return; // null is allowed
      var s = rel.cueSpan[0], e = rel.cueSpan[1];
      if (!(s >= 0 && e > s && e <= txt.length)) {
        bad.push(rel.type + " cueSpan=[" + s + "," + e + "] textLen=" + txt.length);
      }
    });
    assert(bad.length === 0, "Invalid cueSpan(s): " + bad.join("; "));
  });
});

/* ================================================================== */
/*  TEST 12 — canonical regression: BAINES Malaga passage            */
/*  a) No rel has dateISO "2000-12-20" (DOB must not leak)           */
/*  b) No TRANSACTED_WITH targeting Seville                           */
/*  c) "will be staying" STAYS_AT has modality "planned"             */
/* ================================================================== */

var DEMO = "Geoff BAINES DOB 20/12/2000 uses 07686868686 and email geoff.b@gmail.com. On 04/05/2026 used this email to book flights to Malaga. He is flying from Bristol airport on 11/06/2026 and will return on 20/06/2026. He will be staying at this hotel C. Maestranza, 20, Málaga-Este, 29016 Málaga, Spain•19 +34 965 06 43 61. When there, he is expected to purchase a new sim card for his phone with the number +34 1231231233 and plans on making a day trip to SEVILLE.";
var R12 = X.extract(DEMO, { refDate: "2026-06-10" });

test("T12a: DOB date 2000-12-20 does NOT appear as dateISO on any relationship", function () {
  var leaked = R12.relationships.filter(function (r) { return r.dateISO === "2000-12-20"; });
  assert(leaked.length === 0,
    "DOB leaked into " + leaked.length + " relationship(s): " +
    leaked.map(function (r) { return r.type; }).join(", "));
});

test("T12b: no TRANSACTED_WITH relationship targeting Seville", function () {
  var seville = R12.entities.find(function (e) {
    var lbl = (e.label || "").toLowerCase();
    return lbl.indexOf("seville") !== -1 || lbl.indexOf("sevilla") !== -1;
  });
  if (!seville) return; // if Seville not even extracted, trivially passes
  var badRels = R12.relationships.filter(function (r) {
    return r.type === "TRANSACTED_WITH" && r.targetRef === seville.ref;
  });
  assert(badRels.length === 0,
    "Found TRANSACTED_WITH targeting Seville (" + badRels.length + " rel(s)). Seville should receive TRAVELS_TO, not TRANSACTED_WITH.");
});

test("T12c: 'will be staying' STAYS_AT relationship has modality 'planned'", function () {
  var staysAt = R12.relationships.find(function (r) { return r.type === "STAYS_AT"; });
  assert(staysAt !== null && staysAt !== undefined,
    "No STAYS_AT relationship found. Rels: " +
    R12.relationships.map(function (r) { return r.type; }).join(", "));
  assertEquals(staysAt.modality, "planned",
    "'will be staying' STAYS_AT should have modality 'planned', got: " + staysAt.modality);
});

/* ================================================================== */
/*  SUMMARY                                                            */
/* ================================================================== */

console.log("\n" + (passed + failed) + " tests: " + passed + " passed, " + failed + " failed");
if (failures.length > 0) {
  console.log("\n--- Failing assertions ---");
  failures.forEach(function (f) { console.log(f); });
}
if (failed > 0) process.exit(1);
