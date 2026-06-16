/* smartner_tests.js — spec tests for the smart-mode merge logic.
 * Run: node tests/smartner_tests.js from the Solar directory. */
"use strict";
var path = require("path");
var S = require(path.join(__dirname, "..", "js/core/smartner.js"));

var passed = 0, failed = 0;
function test(n, f) { try { f(); console.log("PASS: " + n); passed++; } catch (e) { console.log("FAIL: " + n + "\n      " + e.message); failed++; } }
function ok(v, m) { if (!v) throw new Error(m || "expected truthy"); }
function eq(a, b, m) { if (a !== b) throw new Error((m || "eq") + " — expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

var rule = { entities: [
  { ref: "e1", type: "person", label: "Geoffrey BAINES", spans: [[0, 15]] },
  { ref: "e2", type: "phone",  label: "07700900000",     spans: [[30, 41]] }
] };

test("adds a genuinely new model entity, flagged + advisory confidence", function () {
  var r = S.mergeInto(rule, [{ text: "Diego MORENO", start: 60, end: 72, label: "person", score: 0.9 }]);
  eq(r.added.length, 1, "one added");
  var a = r.added[0];
  eq(a.type, "person"); eq(a.label, "Diego MORENO");
  eq(a.confidence, "med", "0.9 -> med"); ok(a.flags.indexOf("smart-ner") !== -1, "flagged");
  ok(a.attrs.smart === true, "smart attr");
  eq(r.entities.length, 3, "rule + added");
});

test("rules win: model span overlapping a rule entity is dropped", function () {
  var r = S.mergeInto(rule, [{ text: "BAINES", start: 9, end: 15, label: "person", score: 0.99 }]);
  eq(r.added.length, 0, "overlap dropped");
});

test("unmapped label is ignored", function () {
  var r = S.mergeInto(rule, [{ text: "Operation Tiger", start: 80, end: 95, label: "operation", score: 0.9 }]);
  eq(r.added.length, 0);
});

test("low score filtered by minScore", function () {
  var r = S.mergeInto(rule, [{ text: "Sam HILL", start: 100, end: 108, label: "person", score: 0.3 }]);
  eq(r.added.length, 0, "0.3 < 0.5 default");
  var r2 = S.mergeInto(rule, [{ text: "Sam HILL", start: 100, end: 108, label: "person", score: 0.3 }], { minScore: 0.2 });
  eq(r2.added.length, 1, "passes with lower threshold");
});

test("label mapping: organization/company/gpe -> solar types", function () {
  var r = S.mergeInto({ entities: [] }, [
    { text: "Acme", start: 0, end: 4, label: "ORGANIZATION", score: 0.8 },
    { text: "Berlin", start: 10, end: 16, label: "GPE", score: 0.8 }
  ]);
  eq(r.added.length, 2);
  eq(r.added[0].type, "organisation"); eq(r.added[1].type, "location");
});

test("low score (<0.85) -> low confidence", function () {
  var r = S.mergeInto({ entities: [] }, [{ text: "Jo LANE", start: 0, end: 7, label: "person", score: 0.6 }]);
  eq(r.added[0].confidence, "low");
});

test("de-dupes identical model hits", function () {
  var r = S.mergeInto({ entities: [] }, [
    { text: "Diego MORENO", start: 0, end: 12, label: "person", score: 0.9 },
    { text: "Diego  MORENO", start: 40, end: 53, label: "person", score: 0.9 }
  ]);
  eq(r.added.length, 1, "second identical hit de-duped");
});

test("does not mutate the input rule result", function () {
  var input = { entities: [{ ref: "x", type: "person", label: "A", spans: [[0, 1]] }] };
  S.mergeInto(input, [{ text: "B", start: 5, end: 6, label: "person", score: 0.9 }]);
  eq(input.entities.length, 1, "input untouched");
});

test("inert without a runtime: available() false, extract() -> []", function () {
  eq(S.available(), false);
  return S.extract("anything").then(function (sp) { eq(sp.length, 0); });
});

test("setRuntime wires inference; extract() returns its spans", function () {
  S.setRuntime(function (text, types) { return Promise.resolve([{ text: "X", start: 0, end: 1, label: "person", score: 0.7 }]); });
  ok(S.available(), "available after setRuntime");
  return S.extract("x").then(function (sp) { eq(sp.length, 1); S.setRuntime(null); });
});

test("extract() swallows runtime errors -> []", function () {
  S.setRuntime(function () { throw new Error("boom"); });
  return S.extract("x").then(function (sp) { eq(sp.length, 0); S.setRuntime(null); });
});

/* allow async tests to settle */
setTimeout(function () {
  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failed) process.exit(1);
}, 50);
