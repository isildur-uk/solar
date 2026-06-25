/* cm-redos.test.js — ReDoS / catastrophic-backtracking guard.
 * Runs every recogniser regex (and the validators) against adversarial inputs
 * and asserts each completes well under a time budget. Run: node cm-redos.test.js */
"use strict";
var R = require("../js/core/cm-recognisers.js");
var S = require("../js/core/cm-standards.js");
var BUDGET_MS = 100, pass = 0, fail = 0;

function timed(fn) { var t0 = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t0) / 1e6; }
function check(name, ms) {
  if (ms <= BUDGET_MS) { pass++; }
  else { fail++; console.log("  SLOW  " + name + "  " + ms.toFixed(1) + "ms (>" + BUDGET_MS + ")"); }
}

// Adversarial input generators aimed at backtracking blow-ups.
var evil = [
  "A1 ".repeat(20000),
  "John SMITH ".repeat(15000),
  "NORTHWARD HAULAGE ".repeat(8000) + "X",            // org run with no suffix
  "GB" + "1".repeat(40000),                            // long IBAN-ish
  ("4 ").repeat(30000),
  "AB12 ".repeat(20000),
  "a".repeat(60000),
  ("9".repeat(14) + " ").repeat(4000),                 // IMEI-ish digit runs
  ("Mr " + "Aa".repeat(50) + " ").repeat(2000),
  "www." + "a.".repeat(20000) + "com",                 // URL-ish
  ("ES" + "0".repeat(30) + " ").repeat(2000)
];

// 1) every recogniser regex against every evil input
R.recognisers.forEach(function (rec) {
  evil.forEach(function (s, i) {
    var re = rec.re;
    var ms = timed(function () { re.lastIndex = 0; var g = 0; while (re.exec(s) !== null && g++ < 100000) { if (rec.re.lastIndex === 0) break; } });
    check("recogniser[" + rec.type + "] vs evil#" + i, ms);
  });
});

// 2) full detectTyped on a large pathological paste
[50000, 100000, 500000, 1000000].forEach(function (n) {
  var big = "On 4 September 1983 John SMITH (DOB 12/03/1985) at AB12 CDE paid GBP 1,500. ".repeat(Math.ceil(n / 75)).slice(0, n);
  var ms = timed(function () { R.detectTyped(big); });
  // Whole-document throughput (legitimately O(n)) gets a generous ceiling; the tight
  // 100ms budget above is for per-regex backtracking. A true ReDoS would blow way past this.
  var docBudget = 1500;
  if (ms <= docBudget) pass++; else { fail++; console.log("  SLOW  detectTyped " + n + " chars  " + ms.toFixed(0) + "ms (>" + docBudget + ")"); }
  if (ms <= BUDGET_MS * 10) console.log("  info  detectTyped " + n + " chars: " + ms.toFixed(0) + "ms");
});

// 3) validators against long inputs
var vals = [["luhn", S.luhn], ["ibanValid", S.identifiers.iban.validate], ["postcodeValid", S.postcodeValid],
  ["vrmFormatValid", S.vrmFormatValid], ["vatChecksum", S.vatChecksum], ["imeiValid", S.imeiValid],
  ["companyNumberValid", S.companyNumberValid], ["looksLikePerson", R.looksLikePerson]];
vals.forEach(function (v) {
  evil.forEach(function (s, i) { check("validator[" + v[0] + "] vs evil#" + i, timed(function () { v[1](s); })); });
});

console.log("\nReDoS guard: PASS " + pass + "  SLOW " + fail + "  (budget " + BUDGET_MS + "ms)");
if (fail > 0) process.exit(1);
