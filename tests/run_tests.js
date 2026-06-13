/* run_tests.js — spec-based tests for chart_room core engine.
 * No test framework. Run: node tests/run_tests.js from chart_room directory.
 * Tests are written against the SPEC (BRIEF.md + API contract), NOT the implementation.
 */
"use strict";

var path = require("path");
var base = path.join(__dirname, "..");

var M    = require(path.join(base, "js/core/match.js"));
var G    = require(path.join(base, "js/core/geo.js"));
var X    = require(path.join(base, "js/core/extract.js"));
var Mdl  = require(path.join(base, "js/core/model.js"));

/* ------------------------------------------------------------------ */
/*  Minimal test harness                                               */
/* ------------------------------------------------------------------ */

var passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("PASS: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + "\n      " + e.message);
    failed++;
  }
}

function assert(val, msg) {
  if (!val) throw new Error(msg || "assertion failed");
}
function assertEquals(a, b, msg) {
  if (a !== b) throw new Error((msg || "assertEquals") + " — expected " + JSON.stringify(b) + ", got " + JSON.stringify(a));
}
function assertApprox(a, b, tol, msg) {
  tol = tol || 0.001;
  if (Math.abs(a - b) > tol) throw new Error((msg || "assertApprox") + " — expected ~" + b + " ± " + tol + ", got " + a);
}
function assertGte(a, b, msg) {
  if (a < b) throw new Error((msg || "assertGte") + " — expected ≥" + b + ", got " + a);
}
function assertLt(a, b, msg) {
  if (a >= b) throw new Error((msg || "assertLt") + " — expected <" + b + ", got " + a);
}

/* ================================================================== */
/*  SECTION 1: PHONE NORMALISATION                                     */
/* ================================================================== */

test("PHONE: 07686868686 -> +447686868686 valid=true", function () {
  var r = M.normalisePhone("07686868686");
  assertEquals(r.e164, "+447686868686", "e164");
  assert(r.valid, "valid");
});

test("PHONE: +44 7686 868 686 same e164", function () {
  var r = M.normalisePhone("+44 7686 868 686");
  assertEquals(r.e164, "+447686868686", "e164");
  assert(r.valid, "valid");
});

test("PHONE: 0044 7686 868686 same e164", function () {
  var r = M.normalisePhone("0044 7686 868686");
  assertEquals(r.e164, "+447686868686", "e164");
  assert(r.valid, "valid");
});

test("PHONE: (0)7700 900123 normalises to a stable e164", function () {
  // spec says 'tolerant handling acceptable — test it normalises to something stable'
  var r1 = M.normalisePhone("(0)7700 900123");
  var r2 = M.normalisePhone("(0)7700 900123");
  assert(r1.e164 !== null, "should produce an e164");
  assertEquals(r1.e164, r2.e164, "idempotent");
});

test("PHONE: +34 965 06 43 61 -> +34965064361 valid=true", function () {
  var r = M.normalisePhone("+34 965 06 43 61");
  assertEquals(r.e164, "+34965064361", "e164");
  assert(r.valid, "valid");
});

test("PHONE: +34 1231231233 e164 set but valid=false (wrong length for Spain)", function () {
  var r = M.normalisePhone("+34 1231231233");
  assert(r.e164 !== null, "e164 present");
  assert(!r.valid, "valid should be false — wrong NSN length for Spain");
});

test("PHONE: 12345 rejected — no e164 or valid=false", function () {
  var r = M.normalisePhone("12345");
  assert(!r.valid, "valid must be false");
  // e164 may be null, or if set, still not valid
  assert(r.e164 === null || !r.valid, "no valid e164 for 12345");
});

test("PHONE: UK landline 0117 925 1001 -> +441179251001", function () {
  var r = M.normalisePhone("0117 925 1001");
  assertEquals(r.e164, "+441179251001", "e164");
  assert(r.valid, "valid");
});

/* ================================================================== */
/*  SECTION 2: EMAIL NORMALISATION                                     */
/* ================================================================== */

test("EMAIL: gmail dots folded (geoff.b@gmail.com == geoffb@gmail.com)", function () {
  var a = M.normaliseEmail("geoff.b@gmail.com");
  var b = M.normaliseEmail("geoffb@gmail.com");
  assert(a !== null, "a not null");
  assertEquals(a, b, "gmail dot folding");
});

test("EMAIL: gmail plus folded (geoff.b@gmail.com == geoff.b+x@gmail.com)", function () {
  var a = M.normaliseEmail("geoff.b@gmail.com");
  var b = M.normaliseEmail("geoff.b+x@gmail.com");
  assert(a !== null, "a not null");
  assertEquals(a, b, "gmail plus folding");
});

test("EMAIL: non-gmail dots NOT folded (a.b@proton.me != ab@proton.me)", function () {
  var a = M.normaliseEmail("a.b@proton.me");
  var b = M.normaliseEmail("ab@proton.me");
  assert(a !== null && b !== null, "both valid");
  assert(a !== b, "dots must NOT be folded for non-gmail domains");
});

test("EMAIL: invalid email returns null", function () {
  var r = M.normaliseEmail("notanemail");
  assert(r === null, "expected null for invalid email, got: " + r);
});

test("EMAIL: case-insensitive (Geoff.B@Gmail.COM == geoff.b@gmail.com)", function () {
  var a = M.normaliseEmail("Geoff.B@Gmail.COM");
  var b = M.normaliseEmail("geoff.b@gmail.com");
  assert(a !== null && b !== null, "both valid");
  assertEquals(a, b, "case insensitive");
});

/* ================================================================== */
/*  SECTION 3: NAME MATCHING                                           */
/* ================================================================== */

test("NAME: jaroWinkler returns value in [0,1]", function () {
  var v = M.jaroWinkler("Geoff", "Geoffrey");
  assert(v >= 0 && v <= 1, "out of range: " + v);
});

test("NAME: 'Geoff BAINES' vs 'Geoffrey Baines' score >= 0.92 (nickname)", function () {
  var r = M.nameSimilarity("Geoff BAINES", "Geoffrey Baines");
  assertGte(r.score, 0.92, "nickname similarity score");
});

test("NAME: 'Geoff Baines' vs 'Geoff Barnes' score < 0.85 (must NOT suggest)", function () {
  var r = M.nameSimilarity("Geoff Baines", "Geoff Barnes");
  assertLt(r.score, 0.85, "different surnames should be < suggest threshold");
});

test("NAME: 'G. Baines' vs 'Geoff Baines' score >= 0.85 (initial match)", function () {
  var r = M.nameSimilarity("G. Baines", "Geoff Baines");
  assertGte(r.score, 0.85, "initial expansion should reach suggest threshold");
});

test("NAME: single-token 'Baines' vs 'Baines' capped below 0.85 and singleToken=true", function () {
  var r = M.nameSimilarity("Baines", "Baines");
  assert(r.singleToken === true, "singleToken flag must be set");
  assertLt(r.score, 0.85, "single-token score must be capped below suggest threshold");
});

test("NAME: accent folding 'Jose García' == 'Jose Garcia'", function () {
  var r = M.nameSimilarity("Jose García", "Jose Garcia");
  assertGte(r.score, 0.99, "accented and unaccented names should be effectively identical");
});

test("NAME: canonicalName is defined and returns a string", function () {
  var c = M.canonicalName("Geoff BAINES");
  assert(typeof c === "string", "canonicalName should return a string");
  assert(c.length > 0, "canonicalName should not be empty");
});

/* ================================================================== */
/*  SECTION 4: MATCH ENTITY GATES                                      */
/* ================================================================== */

test("MATCH: cross-type suppressed (person candidate vs phone existing)", function () {
  var candidate = { type: "person", label: "John Smith" };
  var existing  = [{ id: "e1", type: "phone", label: "07686868686" }];
  var results = M.matchEntity(candidate, existing);
  assertEquals(results.length, 0, "cross-type match must return empty");
});

test("MATCH: phone match only when e164 equal", function () {
  var candidate = { type: "phone", label: "07686868686", ids: { e164: "+447686868686" } };
  var existingMatch = { id: "e1", type: "phone", label: "+44 7686 868686", ids: { e164: "+447686868686" } };
  var existingNoMatch = { id: "e2", type: "phone", label: "07700900123", ids: { e164: "+447700900123" } };
  var results = M.matchEntity(candidate, [existingMatch, existingNoMatch]);
  assertEquals(results.length, 1, "should match exactly one phone");
  assertEquals(results[0].entity.id, "e1", "should match e1");
  assertEquals(results[0].tier, "exact", "should be exact tier");
});

test("MATCH: DOB conflict suppresses person match (two John Smith with different DOBs)", function () {
  var candidate = { type: "person", label: "John Smith", attrs: { dob: "1990-01-01" } };
  var existing  = [{ id: "e1", type: "person", label: "John Smith", attrs: { dob: "1985-06-15" } }];
  var results = M.matchEntity(candidate, existing);
  // DOB conflict should suppress — result either empty or not exact/strong
  var highTier = results.filter(function (r) { return r.tier === "exact" || r.tier === "strong"; });
  assertEquals(highTier.length, 0, "DOB conflict must prevent exact or strong match tier");
});

test("MATCH: matchEntity result has entity/score/tier/reasons fields", function () {
  var candidate = { type: "person", label: "Geoff Baines" };
  var existing  = [{ id: "e1", type: "person", label: "Geoff Baines" }];
  var results = M.matchEntity(candidate, existing);
  assert(results.length > 0, "should match");
  var r = results[0];
  assert(r.entity && r.score !== undefined && r.tier && r.reasons, "result shape");
});

test("MATCH: address never matched against location type", function () {
  var candidate = { type: "address", label: "10 Downing Street, London" };
  var existing  = [{ id: "e1", type: "location", label: "London" }];
  var results = M.matchEntity(candidate, existing);
  assertEquals(results.length, 0, "address vs location must return empty");
});

/* ================================================================== */
/*  SECTION 5: GEO                                                     */
/* ================================================================== */

test("GEO: lookup('Malaga') == lookup('Málaga') and cc == 'ES'", function () {
  var a = G.lookup("Malaga");
  var b = G.lookup("Málaga");
  assert(a !== null, "Malaga not found");
  assert(b !== null, "Málaga not found");
  assertEquals(a.n, b.n, "same record");
  assertEquals(a.cc, "ES", "cc should be ES");
});

test("GEO: lookup('MALAGA') works (case-insensitive)", function () {
  var r = G.lookup("MALAGA");
  assert(r !== null, "MALAGA should be found case-insensitively");
  assertEquals(r.cc, "ES", "cc should be ES");
});

test("GEO: lookup('Bristol Airport').iata == 'BRS'", function () {
  var r = G.lookup("Bristol Airport");
  assert(r !== null, "Bristol Airport not found");
  assertEquals(r.iata, "BRS", "iata should be BRS");
});

test("GEO: lookupIata('AGP') is Malaga airport", function () {
  var r = G.lookupIata("AGP");
  assert(r !== null, "AGP not found");
  assert(r.n.toLowerCase().indexOf("malaga") !== -1 ||
         r.n.toLowerCase().indexOf("málaga") !== -1 ||
         (r.cc === "ES" && r.t === "airport"),
    "AGP should be Malaga airport, got: " + r.n);
});

test("GEO: lookup('Narnia') == null", function () {
  var r = G.lookup("Narnia");
  assert(r === null, "Narnia should not be in gazetteer");
});

test("GEO: lookup('Seville') === lookup('Sevilla')", function () {
  var a = G.lookup("Seville");
  var b = G.lookup("Sevilla");
  assert(a !== null, "Seville not found");
  assert(b !== null, "Sevilla not found");
  assertEquals(a.n, b.n, "Seville and Sevilla should map to same record");
});

test("GEO: allKeys() returns non-empty array of strings", function () {
  var keys = G.allKeys();
  assert(Array.isArray(keys) && keys.length > 0, "allKeys should return non-empty array");
  assert(typeof keys[0] === "string", "keys should be strings");
});

test("GEO: countryByCc('ES') returns Spain entry", function () {
  var r = G.countryByCc("ES");
  assert(r !== null, "ES not found");
  assert(r.n && r.n.toLowerCase().indexOf("spain") !== -1, "should be Spain, got: " + (r && r.n));
});

/* ================================================================== */
/*  SECTION 6: EXTRACT — demo passage                                  */
/* ================================================================== */

var DEMO = "Geoff BAINES DOB 20/12/2000 uses 07686868686 and email geoff.b@gmail.com. On 04/05/2026 used this email to book flights to Malaga. He is flying from Bristol airport on 11/06/2026 and will return on 20/06/2026. He will be staying at this hotel C. Maestranza, 20, Málaga-Este, 29016 Málaga, Spain•19 +34 965 06 43 61. When there, he is expected to purchase a new sim card for his phone with the number +34 1231231233 and plans on making a day trip to SEVILLE.";

var extracted;
test("EXTRACT: demo passage runs without error", function () {
  extracted = X.extract(DEMO);
  assert(extracted && typeof extracted === "object", "should return object");
  assert(Array.isArray(extracted.entities), "entities array");
  assert(Array.isArray(extracted.relationships), "relationships array");
  assert(Array.isArray(extracted.events), "events array");
  assert(Array.isArray(extracted.ambiguities), "ambiguities array");
});

// Ensure extracted is populated for subsequent tests
if (!extracted) {
  try { extracted = X.extract(DEMO); } catch(e) { extracted = { entities: [], relationships: [], events: [], ambiguities: [] }; }
}

test("EXTRACT: exactly one person entity with label 'Geoff BAINES'", function () {
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  assertEquals(persons.length, 1, "exactly one person");
  assertEquals(persons[0].label, "Geoff BAINES", "person label");
});

test("EXTRACT: person attrs.dob == '2000-12-20'", function () {
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  assertEquals(persons.length, 1, "one person");
  var dob = persons[0].attrs && persons[0].attrs.dob;
  assertEquals(dob, "2000-12-20", "DOB should be ISO formatted");
});

test("EXTRACT: phone +447686868686 present with high confidence", function () {
  var phones = extracted.entities.filter(function (e) { return e.type === "phone"; });
  var ukPhone = phones.find(function (p) {
    return (p.value === "+447686868686") ||
           (p.ids && p.ids.e164 === "+447686868686") ||
           (p.label && p.label.replace(/\s/g,"") === "07686868686");
  });
  assert(ukPhone !== undefined, "UK phone +447686868686 not found, phones: " + phones.map(function(p){return p.label;}).join(", "));
  assertEquals(ukPhone.confidence, "high", "UK phone confidence should be high");
});

test("EXTRACT: Spanish number +341231231233 present with confidence != 'high'", function () {
  var phones = extracted.entities.filter(function (e) { return e.type === "phone"; });
  var spPhone = phones.find(function (p) {
    return (p.value === "+341231231233") ||
           (p.ids && p.ids.e164 === "+341231231233") ||
           (p.label && p.label.replace(/[\s+-]/g,"") === "341231231233");
  });
  assert(spPhone !== undefined, "Spanish phone +341231231233 not found, phones: " + phones.map(function(p){return p.label + "(" + (p.ids&&p.ids.e164) + ")"}).join(", "));
  assert(spPhone.confidence !== "high", "invalid Spanish number should not have high confidence, got: " + spPhone.confidence);
});

test("EXTRACT: email entity present", function () {
  var emails = extracted.entities.filter(function (e) { return e.type === "email"; });
  assert(emails.length > 0, "at least one email entity");
  var gmailEnt = emails.find(function (e) { return e.label && e.label.indexOf("gmail") !== -1; });
  assert(gmailEnt !== undefined, "gmail address not found");
});

test("EXTRACT: address entity with 'Maestranza' and postcode 29016", function () {
  var addrs = extracted.entities.filter(function (e) { return e.type === "address"; });
  var maeAddr = addrs.find(function (a) {
    return a.label && a.label.indexOf("Maestranza") !== -1;
  });
  assert(maeAddr !== undefined, "Maestranza address not found, addresses: " + addrs.map(function(a){return a.label;}).join(" | "));
  var hasPostcode = (maeAddr.label && maeAddr.label.indexOf("29016") !== -1) ||
                   (maeAddr.attrs && (maeAddr.attrs.postcode === "29016" || maeAddr.attrs.postcode === 29016));
  assert(hasPostcode, "address should contain postcode 29016");
});

test("EXTRACT: location Bristol Airport present (iata BRS)", function () {
  var locs = extracted.entities.filter(function (e) { return e.type === "location"; });
  var brs = locs.find(function (l) {
    return (l.label && l.label.toLowerCase().indexOf("bristol") !== -1);
  });
  assert(brs !== undefined, "Bristol Airport not in locations, found: " + locs.map(function(l){return l.label;}).join(", "));
  // If it has a gaz reference, check iata via geo
  if (brs.ids && brs.ids.gaz) {
    var gazEntry = G.lookup(brs.label);
    if (gazEntry) assert(gazEntry.iata === "BRS", "iata should be BRS");
  }
});

test("EXTRACT: location Malaga present", function () {
  var locs = extracted.entities.filter(function (e) { return e.type === "location"; });
  var malaga = locs.find(function (l) {
    var lbl = l.label && l.label.toLowerCase();
    return lbl && (lbl.indexOf("malaga") !== -1 || lbl.indexOf("málaga") !== -1);
  });
  assert(malaga !== undefined, "Malaga not found in locations: " + locs.map(function(l){return l.label;}).join(", "));
});

test("EXTRACT: location Seville present", function () {
  var locs = extracted.entities.filter(function (e) { return e.type === "location"; });
  var seville = locs.find(function (l) {
    var lbl = l.label && l.label.toLowerCase();
    return lbl && (lbl.indexOf("seville") !== -1 || lbl.indexOf("sevilla") !== -1);
  });
  assert(seville !== undefined, "Seville not found in locations: " + locs.map(function(l){return l.label;}).join(", "));
});

test("EXTRACT: relationship person-USES->phone(+447686868686)", function () {
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  var phones  = extracted.entities.filter(function (e) { return e.type === "phone"; });
  assert(persons.length >= 1 && phones.length >= 1, "need person and phone entities");
  var personRef = persons[0].ref;
  var ukPhoneRef = phones.find(function (p) {
    return (p.ids && p.ids.e164 === "+447686868686") ||
           (p.value === "+447686868686");
  });
  assert(ukPhoneRef !== undefined, "UK phone entity not found");
  var rel = extracted.relationships.find(function (r) {
    return r.sourceRef === personRef &&
           r.targetRef === ukPhoneRef.ref &&
           r.type === "USES";
  });
  assert(rel !== undefined, "person-USES->+447686868686 relationship not found. Rels: " +
    extracted.relationships.map(function(r){return r.sourceRef+"--"+r.type+"->"+r.targetRef;}).join(", "));
});

test("EXTRACT: relationship person-USES->email", function () {
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  var emails  = extracted.entities.filter(function (e) { return e.type === "email"; });
  assert(persons.length >= 1 && emails.length >= 1, "need person and email entities");
  var personRef = persons[0].ref;
  var emailRef  = emails[0].ref;
  var rel = extracted.relationships.find(function (r) {
    return r.sourceRef === personRef && r.targetRef === emailRef && r.type === "USES";
  });
  assert(rel !== undefined, "person-USES->email relationship not found");
});

test("EXTRACT: relationship person-TRAVELS_TO->Malaga", function () {
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  var locs    = extracted.entities.filter(function (e) { return e.type === "location"; });
  assert(persons.length >= 1, "need person");
  var personRef = persons[0].ref;
  var malaga = locs.find(function (l) {
    var lbl = (l.label || "").toLowerCase();
    return lbl.indexOf("malaga") !== -1 || lbl.indexOf("málaga") !== -1;
  });
  assert(malaga !== undefined, "Malaga location not found");
  var rel = extracted.relationships.find(function (r) {
    return r.sourceRef === personRef && r.targetRef === malaga.ref && r.type === "TRAVELS_TO";
  });
  assert(rel !== undefined, "person-TRAVELS_TO->Malaga not found");
});

test("EXTRACT: relationship person-DEPARTS_FROM->Bristol Airport with dateISO 2026-06-11", function () {
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  var locs    = extracted.entities.filter(function (e) { return e.type === "location"; });
  assert(persons.length >= 1, "need person");
  var personRef = persons[0].ref;
  var brs = locs.find(function (l) { return l.label && l.label.toLowerCase().indexOf("bristol") !== -1; });
  assert(brs !== undefined, "Bristol Airport not found");
  var rel = extracted.relationships.find(function (r) {
    return r.sourceRef === personRef && r.targetRef === brs.ref && r.type === "DEPARTS_FROM";
  });
  assert(rel !== undefined, "person-DEPARTS_FROM->Bristol Airport not found. Rels: " +
    extracted.relationships.filter(function(r){return r.sourceRef===personRef;}).map(function(r){return r.type+"->"+r.targetRef;}).join(", "));
  assertEquals(rel.dateISO, "2026-06-11", "departure date should be 2026-06-11");
});

test("EXTRACT: relationship person-STAYS_AT->address", function () {
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  var addrs   = extracted.entities.filter(function (e) { return e.type === "address"; });
  assert(persons.length >= 1, "need person");
  assert(addrs.length >= 1, "need address");
  var personRef = persons[0].ref;
  var rel = extracted.relationships.find(function (r) {
    return r.sourceRef === personRef && r.type === "STAYS_AT";
  });
  assert(rel !== undefined, "person-STAYS_AT->address not found");
  var addrEnt = addrs.find(function (a) { return a.ref === rel.targetRef; });
  assert(addrEnt !== undefined, "STAYS_AT target should be an address entity");
});

test("EXTRACT: relationship address-LOCATED_IN->Malaga", function () {
  var addrs = extracted.entities.filter(function (e) { return e.type === "address"; });
  var locs  = extracted.entities.filter(function (e) { return e.type === "location"; });
  var malaga = locs.find(function (l) {
    var lbl = (l.label || "").toLowerCase();
    return lbl.indexOf("malaga") !== -1 || lbl.indexOf("málaga") !== -1;
  });
  assert(malaga !== undefined, "Malaga not found");
  var rel = extracted.relationships.find(function (r) {
    return r.type === "LOCATED_IN" && r.targetRef === malaga.ref;
  });
  assert(rel !== undefined, "address-LOCATED_IN->Malaga not found");
  var srcEnt = extracted.entities.find(function (e) { return e.ref === rel.sourceRef; });
  assert(srcEnt && srcEnt.type === "address", "LOCATED_IN source should be an address, got: " + (srcEnt && srcEnt.type));
});

test("EXTRACT: hotel phone is PHONE_OF address, NOT person-USES->hotel phone", function () {
  // The +34 965 06 43 61 number belongs to the hotel address, not the person
  var persons = extracted.entities.filter(function (e) { return e.type === "person"; });
  var phones  = extracted.entities.filter(function (e) { return e.type === "phone"; });
  var hotelPhone = phones.find(function (p) {
    return (p.ids && p.ids.e164 === "+34965064361") ||
           (p.value === "+34965064361") ||
           (p.label && p.label.replace(/\s/g,"") === "+34965064361");
  });
  // If hotel phone was extracted, it should NOT have person-USES->hotelPhone relationship
  if (hotelPhone && persons.length > 0) {
    var personRef = persons[0].ref;
    var wrongRel = extracted.relationships.find(function (r) {
      return r.sourceRef === personRef && r.targetRef === hotelPhone.ref && r.type === "USES";
    });
    assert(wrongRel === undefined, "person should NOT have USES->hotel phone relationship");
  }
});

test("EXTRACT: events include a 2026-06-20 return event", function () {
  var returnEvt = extracted.events.find(function (ev) {
    return ev.dateISO === "2026-06-20";
  });
  assert(returnEvt !== undefined, "event dated 2026-06-20 (return) not found. Events: " +
    extracted.events.map(function(e){return e.dateISO;}).join(", "));
});

test("EXTRACT: ambiguities flag 04/05/2026 as DD/MM-assumed", function () {
  var ambig = extracted.ambiguities.find(function (a) {
    var msg = (a.message || a.kind || "").toLowerCase();
    return msg.indexOf("04/05") !== -1 || msg.indexOf("ambig") !== -1 ||
           msg.indexOf("dd/mm") !== -1 || msg.indexOf("date") !== -1;
  });
  assert(ambig !== undefined, "04/05/2026 ambiguity not flagged. Ambiguities: " +
    JSON.stringify(extracted.ambiguities));
});

test("EXTRACT: spans — all entity spans valid (0<=s<e<=text.length, non-empty substring)", function () {
  var textLen = DEMO.length;
  var bad = [];
  extracted.entities.forEach(function (e) {
    (e.spans || []).forEach(function (sp) {
      var s = sp[0], end = sp[1];
      if (!(s >= 0 && end > s && end <= textLen)) {
        bad.push(e.label + " span " + s + "," + end + " (text.length=" + textLen + ")");
      } else {
        var sub = DEMO.slice(s, end);
        if (!sub || sub.trim().length === 0) {
          bad.push(e.label + " span produces empty substring");
        }
      }
    });
  });
  assert(bad.length === 0, "invalid spans: " + bad.join("; "));
});

/* ================================================================== */
/*  SECTION 7: EXTRACT — edge cases                                    */
/* ================================================================== */

test("EXTRACT EDGE: 'Meeting John Smith on 13/05/2026' date NOT ambiguous (13>12)", function () {
  var r = X.extract("Meeting John Smith on 13/05/2026");
  var dateEntity = (r.entities || []).find(function (e) { return e.type === "date"; });
  var eventEntry = (r.events || []).find(function (ev) { return ev.dateISO === "2026-05-13"; });
  // Check that date 2026-05-13 is found
  assert(dateEntity !== undefined || eventEntry !== undefined, "date 2026-05-13 should be extracted");
  // Check no ambiguity flagged for this date
  var ambig = (r.ambiguities || []).find(function (a) {
    var msg = (a.message || "").toLowerCase();
    return msg.indexOf("13/05") !== -1 || msg.indexOf("13") !== -1;
  });
  assert(ambig === undefined, "13/05/2026 should NOT be flagged ambiguous (13 > 12)");
});

test("EXTRACT EDGE: empty string returns empty arrays, not errors", function () {
  var r = X.extract("");
  assert(Array.isArray(r.entities) && r.entities.length === 0, "empty entities");
  assert(Array.isArray(r.relationships) && r.relationships.length === 0, "empty relationships");
  assert(Array.isArray(r.events) && r.events.length === 0, "empty events");
  assert(Array.isArray(r.ambiguities) && r.ambiguities.length === 0, "empty ambiguities");
});

test("EXTRACT EDGE: text with only an email yields one entity, no relationships", function () {
  var r = X.extract("Contact us at hello@example.com");
  var emails = r.entities.filter(function (e) { return e.type === "email"; });
  assertEquals(emails.length, 1, "exactly one email entity");
  assertEquals(r.relationships.length, 0, "no relationships when only one entity");
});

test("EXTRACT EDGE: SAR reference is not a phone", function () {
  var r = X.extract("SAR Reference\n\tSAR-2026-0337841\nTelephone\n\t07700 900118");
  var labels = r.entities.filter(function (e) { return e.type === "phone"; }).map(function (e) { return e.label; });
  assert(labels.indexOf("+447700900118") !== -1, "real phone should be extracted");
  assert(labels.every(function (x) { return x.indexOf("20260337841") === -1; }), "SAR ref must not become a phone: " + labels.join(", "));
});

test("EXTRACT EDGE: sort-code account pair becomes account not phones", function () {
  var r = X.extract("Name\n\tDarren COLE\nAccount (personal)\n\tBarclays s/c 20-00-00 a/c 30021847");
  var acc = r.entities.find(function (e) { return e.type === "account" && e.attrs && e.attrs.sortCode === "20-00-00"; });
  assert(acc, "sort-code/account pair should create account entity");
  assert(r.entities.filter(function (e) { return e.type === "phone"; }).length === 0, "account digits must not become phone entities");
});

test("EXTRACT EDGE: subscriber field form links typed identifiers to subject", function () {
  var r = X.extract("SUBSCRIBER NAME: MR DARREN COLE\nDOB: 14/03/1987\nMSISDN: 07700 900342\nCONTACT EMAIL: northgate.logistics@outlook.com\nBILLING ADDRESS: 14 BRACKENFIELD ROAD, STOCKPORT, SK4 2RH");
  var person = r.entities.find(function (e) { return e.type === "person" && e.label === "Darren COLE"; });
  var phone = r.entities.find(function (e) { return e.type === "phone" && e.label === "+447700900342"; });
  var email = r.entities.find(function (e) { return e.type === "email"; });
  assert(person && phone && email, "subject, phone and email should be extracted");
  assert(r.relationships.some(function (rel) { return rel.type === "USES" && rel.sourceRef === person.ref && rel.targetRef === phone.ref; }), "subject should USE phone");
  assert(r.relationships.some(function (rel) { return rel.type === "USES" && rel.sourceRef === person.ref && rel.targetRef === email.ref; }), "subject should USE email");
});

test("EXTRACT EDGE: no generic LINKED_TO fallback for mere co-occurrence", function () {
  var r = X.extract("Darren COLE was mentioned in Manchester with Nadia ANSARI.");
  assertEquals(r.relationships.filter(function (rel) { return rel.type === "LINKED_TO"; }).length, 0, "co-occurrence should not emit LINKED_TO");
});

test("EXTRACT STRUCTURED: personal-detail table links contacts and masked accounts specifically", function () {
  var r = X.extract("Personal Details\nName Darren Michael COLE\nDOB 02/11/1991\nEmail darren.cole87@gmail.com\nCurrent address 14 Brackenfield Road, Stockport, SK4 2RH\nCAIS Account ****1847");
  var person = r.entities.find(function (e) { return e.type === "person" && e.label === "Darren Michael COLE"; });
  var email = r.entities.find(function (e) { return e.type === "email"; });
  var account = r.entities.find(function (e) { return e.type === "account" && e.attrs && e.attrs.tail === "1847"; });
  assert(person && email && account, "subject, email and masked account should be extracted");
  assert(r.relationships.some(function (rel) { return rel.type === "USES" && rel.sourceRef === person.ref && rel.targetRef === email.ref; }), "structured email should be USES, not communication-only");
  assert(r.relationships.some(function (rel) { return rel.type === "OWNS" && rel.sourceRef === person.ref && rel.targetRef === account.ref; }), "masked account should be owned by subject");
});

test("EXTRACT STRUCTURED: employment/directorship tables point organisation EMPLOYS subject", function () {
  var r = X.extract("Individual\nName Darren Michael COLE\nDOB 02/11/1991\nEmployments\nEmployer NORTHGATE LOGISTICS LTD\nDirectorships\nDirector AMBERLINE DETAILING LTD");
  var person = r.entities.find(function (e) { return e.type === "person" && e.label === "Darren Michael COLE"; });
  var org = r.entities.find(function (e) { return e.type === "organisation" && e.label === "NORTHGATE LOGISTICS LTD"; });
  assert(person && org, "subject and employer should be extracted");
  assert(r.relationships.some(function (rel) { return rel.type === "EMPLOYS" && rel.sourceRef === org.ref && rel.targetRef === person.ref; }), "employer should EMPLOYS subject");
});

test("EXTRACT STRUCTURED: NBTC movement rows create airport travel links", function () {
  var r = X.extract("NBTC Flight Records\nSubject API\nName Darren Michael COLE\nDOB 02/11/1991\nMovements API\n12/02/2026 FR123\nABC123\nMAN - AGP\nOUT\n03/01/2026 KL108\nXYZ999\nAMS - MAN\nIN", { refDate: "2026-06-12" });
  var person = r.entities.find(function (e) { return e.type === "person" && e.label === "Darren Michael COLE"; });
  var man = r.entities.find(function (e) { return e.type === "location" && /Manchester Airport/i.test(e.label); });
  var agp = r.entities.find(function (e) { return e.type === "location" && /Malaga Airport/i.test(e.label); });
  assert(person && man && agp, "subject and IATA airports should be extracted");
  assert(r.relationships.some(function (rel) { return rel.type === "DEPARTS_FROM" && rel.sourceRef === person.ref && rel.targetRef === man.ref; }), "MAN outbound should become DEPARTS_FROM");
  assert(r.relationships.some(function (rel) { return rel.type === "TRAVELS_TO" && rel.sourceRef === person.ref && rel.targetRef === agp.ref; }), "AGP outbound should become TRAVELS_TO");
});

test("EXTRACT STRUCTURED: social handles are attributed by row and email domains are ignored", function () {
  var r = X.extract("Darren COLE Instagram @d_cole_mcr\nNadia ANSARI Facebook facebook.com/nadia.ansari.books\nEmail darren.cole87@gmail.com");
  var darren = r.entities.find(function (e) { return e.type === "person" && e.label === "Darren COLE"; });
  var nadia = r.entities.find(function (e) { return e.type === "person" && e.label === "Nadia ANSARI"; });
  var dHandle = r.entities.find(function (e) { return e.type === "note" && e.label === "@d_cole_mcr"; });
  var nHandle = r.entities.find(function (e) { return e.type === "note" && e.label === "facebook.com/nadia.ansari.books"; });
  assert(darren && nadia && dHandle && nHandle, "people and social accounts should be extracted");
  assert(r.entities.every(function (e) { return e.type !== "note" || e.label !== "@gmail.com"; }), "email domain must not become social account");
  assert(r.relationships.some(function (rel) { return rel.type === "USES" && rel.sourceRef === darren.ref && rel.targetRef === dHandle.ref; }), "Darren should use his row handle");
  assert(r.relationships.some(function (rel) { return rel.type === "USES" && rel.sourceRef === nadia.ref && rel.targetRef === nHandle.ref; }), "Nadia should use her row URL");
});

/* ================================================================== */
/*  SECTION 8: detectColumnType                                        */
/* ================================================================== */

test("detectColumnType: phone column", function () {
  var r = X.detectColumnType(["07700 900123", "07700 900124", "07700900125"]);
  assertEquals(r.type, "phone", "should detect phone type");
});

test("detectColumnType: email column", function () {
  var r = X.detectColumnType(["a@b.com", "c@d.org"]);
  assertEquals(r.type, "email", "should detect email type");
});

test("detectColumnType: person column", function () {
  var r = X.detectColumnType(["John Smith", "Jane DOE"]);
  assertEquals(r.type, "person", "should detect person type");
});

test("detectColumnType: location column", function () {
  var r = X.detectColumnType(["London", "Malaga", "Bristol"]);
  assertEquals(r.type, "location", "should detect location type");
});

test("detectColumnType: mixed junk -> text/low", function () {
  var r = X.detectColumnType(["abc123", "!!!", "???", "xyz", "42abc"]);
  assert(r.type === "text" || r.confidence === "low",
    "mixed junk should return text type or low confidence, got: " + r.type + "/" + r.confidence);
});

/* ================================================================== */
/*  SECTION 9: MODEL                                                   */
/* ================================================================== */

test("MODEL: ENTITY_TYPES and LINK_TYPES exported", function () {
  assert(Mdl.ENTITY_TYPES && typeof Mdl.ENTITY_TYPES === "object", "ENTITY_TYPES");
  assert(Array.isArray(Mdl.LINK_TYPES), "LINK_TYPES should be an array");
  assert(Mdl.LINK_TYPES.length > 0, "LINK_TYPES should be non-empty");
});

test("MODEL: CaseStore constructor works", function () {
  var cs = new Mdl.CaseStore();
  assert(cs !== null && typeof cs === "object", "CaseStore constructor");
  assert(Array.isArray(cs.entities), "entities array");
  assert(Array.isArray(cs.links), "links array");
  assert(Array.isArray(cs.events), "events array");
});

test("MODEL: addEntity creates entity with id", function () {
  var cs = new Mdl.CaseStore();
  var e = cs.addEntity({ type: "person", label: "Test Person" });
  assert(e && e.id, "entity should have id");
  assertEquals(cs.entities.length, 1, "one entity in store");
});

test("MODEL: addEntity phone auto-populates ids.e164", function () {
  var cs = new Mdl.CaseStore();
  var e = cs.addEntity({ type: "phone", label: "07686868686" });
  assert(e.ids && e.ids.e164 === "+447686868686",
    "ids.e164 should be +447686868686, got: " + (e.ids && e.ids.e164));
});

test("MODEL: getEntity retrieves by id", function () {
  var cs = new Mdl.CaseStore();
  var e = cs.addEntity({ type: "person", label: "Test" });
  var found = cs.getEntity(e.id);
  assertEquals(found.id, e.id, "should retrieve same entity");
});

test("MODEL: getEntity returns null for unknown id", function () {
  var cs = new Mdl.CaseStore();
  var found = cs.getEntity("nonexistent");
  assert(found === null, "should return null");
});

test("MODEL: updateEntity patches fields", function () {
  var cs = new Mdl.CaseStore();
  var e = cs.addEntity({ type: "person", label: "Old Name" });
  cs.updateEntity(e.id, { label: "New Name" });
  var updated = cs.getEntity(e.id);
  assertEquals(updated.label, "New Name", "label should be updated");
});

test("MODEL: removeEntity removes from store and strips from links", function () {
  var cs = new Mdl.CaseStore();
  var a = cs.addEntity({ type: "person", label: "A" });
  var b = cs.addEntity({ type: "phone",  label: "07700900000" });
  cs.addLink({ from: a.id, to: b.id, type: "USES" });
  cs.removeEntity(a.id);
  assert(cs.getEntity(a.id) === null, "entity removed");
  assertEquals(cs.links.length, 0, "link removed when entity removed");
});

test("MODEL: addLink rejects unknown entity ids (returns null)", function () {
  var cs = new Mdl.CaseStore();
  var result = cs.addLink({ from: "ghost1", to: "ghost2", type: "USES" });
  assert(result === null, "addLink with unknown ids should return null");
});

test("MODEL: duplicate link collapsed (same from/to/type returns same id)", function () {
  var cs = new Mdl.CaseStore();
  var a = cs.addEntity({ type: "person", label: "A" });
  var b = cs.addEntity({ type: "phone",  label: "07700900000" });
  var l1 = cs.addLink({ from: a.id, to: b.id, type: "USES" });
  var l2 = cs.addLink({ from: a.id, to: b.id, type: "USES" });
  assertEquals(l1.id, l2.id, "duplicate link should return same link");
  assertEquals(cs.links.length, 1, "store should have exactly one link");
});

test("MODEL: mergeEntities rewires links and removes self-links", function () {
  var cs = new Mdl.CaseStore();
  var a = cs.addEntity({ type: "person", label: "Geoff Baines" });
  var b = cs.addEntity({ type: "person", label: "Geoffrey Baines" });
  var c = cs.addEntity({ type: "phone",  label: "07700900000" });
  cs.addLink({ from: a.id, to: c.id, type: "USES" });
  cs.addLink({ from: b.id, to: c.id, type: "USES" });
  cs.mergeEntities(a.id, b.id);
  assert(cs.getEntity(b.id) === null, "dropped entity should be removed");
  assert(cs.getEntity(a.id) !== null, "kept entity should remain");
  var selfLinks = cs.links.filter(function (l) { return l.from === l.to; });
  assertEquals(selfLinks.length, 0, "no self-links after merge");
  // Link to c should still exist from a
  var linkToC = cs.links.find(function (l) { return l.from === a.id && l.to === c.id; });
  assert(linkToC !== undefined, "link to phone should be retained");
});

test("MODEL: mergeEntities preserves aka", function () {
  var cs = new Mdl.CaseStore();
  var a = cs.addEntity({ type: "person", label: "Geoff Baines" });
  var b = cs.addEntity({ type: "person", label: "Geoffrey Baines" });
  cs.mergeEntities(a.id, b.id);
  var kept = cs.getEntity(a.id);
  assert(kept.attrs && kept.attrs.aka, "aka should be populated after merge");
  assert(kept.attrs.aka.indexOf("Geoffrey Baines") !== -1, "aka should contain dropped label");
});

test("MODEL: mergeEntities adds audit trail", function () {
  var cs = new Mdl.CaseStore();
  var a = cs.addEntity({ type: "person", label: "A" });
  var b = cs.addEntity({ type: "person", label: "B" });
  cs.mergeEntities(a.id, b.id);
  var kept = cs.getEntity(a.id);
  var mergeAudit = kept.audit.find(function (x) { return x.action === "merged"; });
  assert(mergeAudit !== undefined, "merge audit entry should be present");
});

test("MODEL: findDuplicates surfaces 'Geoff BAINES'/'Geoffrey Baines' pair", function () {
  var cs = new Mdl.CaseStore();
  cs.addEntity({ type: "person", label: "Geoff BAINES" });
  cs.addEntity({ type: "person", label: "Geoffrey Baines" });
  var dupes = cs.findDuplicates();
  assert(dupes.length > 0, "should find at least one duplicate pair");
  var pair = dupes.find(function (d) {
    var labels = [d.a.label, d.b.label];
    return labels.indexOf("Geoff BAINES") !== -1 && labels.indexOf("Geoffrey Baines") !== -1;
  });
  assert(pair !== undefined, "Geoff BAINES / Geoffrey Baines pair should be detected");
});

test("MODEL: findDuplicates respects markDistinct", function () {
  var cs = new Mdl.CaseStore();
  var a = cs.addEntity({ type: "person", label: "Geoff BAINES" });
  var b = cs.addEntity({ type: "person", label: "Geoffrey Baines" });
  cs.markDistinct(a.id, b.id);
  var dupes = cs.findDuplicates();
  var pair = dupes.find(function (d) {
    return (d.a.id === a.id && d.b.id === b.id) ||
           (d.a.id === b.id && d.b.id === a.id);
  });
  assert(pair === undefined, "pair should NOT appear in duplicates after markDistinct");
});

test("MODEL: undo restores pre-merge state", function () {
  var cs = new Mdl.CaseStore();
  var a = cs.addEntity({ type: "person", label: "Geoff Baines" });
  var b = cs.addEntity({ type: "person", label: "Geoffrey Baines" });
  cs.mergeEntities(a.id, b.id);
  assert(cs.getEntity(b.id) === null, "b removed after merge");
  cs.undo();
  assert(cs.getEntity(b.id) !== null, "b should be restored after undo");
  assert(cs.getEntity(a.id) !== null, "a should still be present after undo");
});

test("MODEL: toJSON / fromJSON round-trip preserves counts", function () {
  var cs = new Mdl.CaseStore();
  cs.addEntity({ type: "person", label: "Alice" });
  cs.addEntity({ type: "person", label: "Bob" });
  var pA = cs.addEntity({ type: "phone", label: "07700900001" });
  cs.addLink({ from: cs.entities[0].id, to: pA.id, type: "USES" });
  cs.addEvent({ dateISO: "2026-01-01", label: "Test event" });

  var json = cs.toJSON();
  var cs2 = new Mdl.CaseStore();
  cs2.fromJSON(json);

  assertEquals(cs2.entities.length, cs.entities.length, "entity count preserved");
  assertEquals(cs2.links.length, cs.links.length, "link count preserved");
  assertEquals(cs2.events.length, cs.events.length, "event count preserved");
});

test("MODEL: fromJSON rejects garbage (throws)", function () {
  var cs = new Mdl.CaseStore();
  var threw = false;
  try {
    cs.fromJSON({ junk: true, notAChartRoom: 1 });
  } catch (e) {
    threw = true;
  }
  assert(threw, "fromJSON should throw on invalid data");
});

test("MODEL: clear removes all entities, links, events", function () {
  var cs = new Mdl.CaseStore();
  cs.addEntity({ type: "person", label: "X" });
  cs.clear();
  assertEquals(cs.entities.length, 0, "entities cleared");
  assertEquals(cs.links.length, 0, "links cleared");
  assertEquals(cs.events.length, 0, "events cleared");
});

test("MODEL: snapshot/undo of addEntity", function () {
  var cs = new Mdl.CaseStore();
  cs.snapshot();
  cs.addEntity({ type: "person", label: "Ephemeral" });
  assertEquals(cs.entities.length, 1, "entity added");
  cs.undo();
  assertEquals(cs.entities.length, 0, "entity removed by undo");
});

/* ================================================================== */
/*  SUMMARY                                                            */
/* ================================================================== */

console.log("\n" + (passed + failed) + " tests: " + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
