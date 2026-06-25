/* cm-property.test.js — metamorphic + property tests (CheckList INV/DIR style).
 * Run: node cm-property.test.js */
"use strict";
var S = require("../js/core/cm-standards.js");
var R = require("../js/core/cm-recognisers.js");
var pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) pass++; else { fail++; console.log("  FAIL " + name + (detail ? "  " + detail : "")); } }
function setOf(text) { return R.detectTyped(text).map(function (e) { return e.type + "=" + e.value; }).sort(); }
function eqArr(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

/* 1) IDEMPOTENCE: canonical(canonical(x)) === canonical(x) */
var canon = [
  ["phoneCM", S.phoneCM, ["07700 900441", "+44 7700 900789", "0044 161 4960000"]],
  ["ddmmyyyy", S.ddmmyyyy, ["4 September 1983", "20/12/1990", "2026-06-23"]],
  ["currencyCM", S.currencyCM, ["GBP 12,500", "EUR 8000"]],
  ["postcodeCanonical", S.postcodeCanonical, ["m147qp", "SE11 8QU"]],
  ["surnameCaps", S.surnameCaps, ["preston", "van der berg"]],
  ["organisationCaps", S.organisationCaps, ["northward haulage ltd"]],
  ["nino.canonical", S.identifiers.nino.canonical, ["PR 88 20 13 C", "NINO ab123456c"]],
  ["sortCode.canonical", S.identifiers.sortCode.canonical, ["20-45-67"]],
  ["vrm.canonical", S.identifiers.vrm.canonical, ["AB12 CDE"]]
];
canon.forEach(function (c) {
  c[2].forEach(function (x) {
    var one = c[1](x), two = c[1](one);
    ok("idempotent " + c[0] + " (" + x + ")", one === two, "f(x)=" + JSON.stringify(one) + " f(f(x))=" + JSON.stringify(two));
  });
});

/* 2) INVARIANCE: irrelevant whitespace edits do not change type+value set */
var docs = [
  "Marcus Lee PRESTON DOB 04/09/1983, NINO PR882013C, phone 07700900441, GBP 12,500.",
  "He was born on 4 September 1983 and holds passport number 921004556. Sort code 20-45-67."
];
docs.forEach(function (d, i) {
  var base = setOf(d);
  var ws = setOf(d.replace(/ /g, "  "));
  ok("whitespace-invariant doc#" + i, eqArr(base, ws), "base=" + base.length + " ws=" + ws.length);
});

/* 3) CONCATENATION: every value found in A is still found in A + sep + B */
var A = docs[0], B = docs[1];
var both = setOf(A + "\n\n" + B), onlyA = setOf(A);
ok("concatenation keeps A's entities", onlyA.every(function (v) { return both.indexOf(v) !== -1; }),
  "missing=" + onlyA.filter(function (v) { return both.indexOf(v) === -1; }).join(","));

/* 4) FUZZ: random inputs never throw; spans in-bounds; bands valid; value present */
function rng(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
var rand = rng(42);
var charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ./-:@,'\n£+";
var threw = 0, badSpan = 0, badBand = 0, noVal = 0;
for (var t = 0; t < 3000; t++) {
  var n = Math.floor(rand() * 200), s = "";
  for (var k = 0; k < n; k++) s += charset[Math.floor(rand() * charset.length)];
  try {
    var ents = R.detectTyped(s);
    ents.forEach(function (e) {
      if (!(e.start >= 0 && e.end <= s.length && e.start < e.end)) badSpan++;
      if (["HIGH", "MED", "LOW"].indexOf(e.band) === -1) badBand++;
      if (e.value == null || e.value === "") noVal++;
    });
  } catch (err) { threw++; }
}
ok("fuzz: no throws (3000 inputs)", threw === 0, "threw=" + threw);
ok("fuzz: all spans in-bounds", badSpan === 0, "bad=" + badSpan);
ok("fuzz: all bands valid", badBand === 0, "bad=" + badBand);
ok("fuzz: no empty values", noVal === 0, "empty=" + noVal);

console.log("\nProperty/metamorphic: PASS " + pass + "  FAIL " + fail);
if (fail > 0) process.exit(1);
