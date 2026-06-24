/* CHART ROOM — disclosure.test.js
 * Golden-oracle tests for the deterministic disclosure engine + intel vocab.
 * Run: node tests/disclosure.test.js
 */
"use strict";
var assert = require("assert");
var path = require("path");
function core(n) { return require(path.join(__dirname, "..", "js", "core", n)); }
var V = core("intelvocab.js");
var D = core("disclosure.js");

var passed = 0;
function ok(name, fn) { fn(); passed++; console.log("  ✓ " + name); }

console.log("date helpers (TZ-safe)");
ok("yyyy-mm-dd parsed as local; both formats correct", function () {
  assert.strictEqual(D.ddmmyyyy("2026-05-05"), "05/05/2026");
  assert.strictEqual(D.yyyymmdd("2026-05-05"), "20260505");
  assert.strictEqual(D.ddmmyyyyDot("2025-11-24"), "24.11.2025");
});

console.log("enquiry disclosure sentence (golden)");
ok("PNC check, no result", function () {
  var s = D.enquirySentence({ system: "PNC", date: "2026-05-05", who: "74125", entity: "SMITH, John 03/03/1967", subject: "John SMITH (Subject A)" });
  assert.strictEqual(s,
    "PNC check completed on 05/05/2026 by officer 74125 on SMITH, John 03/03/1967 in relation to John SMITH (Subject A) to identify any association to criminality, criminal history, warning markers or contact information.");
});
ok("ANPR check, with result appended", function () {
  var s = D.enquirySentence({ system: "ANPR", date: "2026-05-06", who: "74125", entity: "VRM AB12 CDE", subject: "BMW 320d (Subject A vehicle)", result: "Vehicle locates in Bedfordshire, Hertfordshire, Cambridgeshire, Kent and London." });
  assert.strictEqual(s,
    "ANPR check completed on 06/05/2026 by officer 74125 on VRM AB12 CDE in relation to BMW 320d (Subject A vehicle) to identify movement of the vehicle within the relevant date period. Vehicle locates in Bedfordshire, Hertfordshire, Cambridgeshire, Kent and London.");
});
ok("Companies House check uses its purpose phrase", function () {
  var s = D.enquirySentence({ system: "Companies House", date: "2026-05-07", who: "80331", entity: "ACME LIMITED (12345678)", subject: "ACME LIMITED" });
  assert.ok(s.indexOf("to identify company, director or address information.") !== -1, s);
});
ok("custom purpose overrides the vocab default", function () {
  var s = D.enquirySentence({ system: "Open Source", date: "2026-05-08", who: "1", entity: "x", subject: "y", purpose: "a bespoke purpose" });
  assert.ok(s.indexOf("to identify a bespoke purpose.") !== -1, s);
});

console.log("file name (golden)");
ok("standard file-name convention", function () {
  assert.strictEqual(
    D.fileName({ date: "2026-05-05", system: "PNC", caseRef: "IR123456", brief: "Initial PNC check on subject A" }),
    "20260505 - PNC - IR123456 Initial PNC check on subject A");
});
ok("file name without brief", function () {
  assert.strictEqual(D.fileName({ date: "2026-05-09", system: "Section 7 (DPA)", caseRef: "IR123456" }),
    "20260509 - Section 7 (DPA) - IR123456");
});

console.log("disclosure document title + description");
ok("disclosure title (Intel Log 2 style)", function () {
  assert.strictEqual(
    D.disclosureTitle({ system: "PNC", entity: "Joe BLOGGS DOB 21.11.2025", date: "2025-11-24", who: "MW" }),
    "PNC Joe BLOGGS DOB 21.11.2025 24.11.2025 MW");
});
ok("doc description auto-fills SUBJECT/DATE/WHO, leaves [FILL:] prompts", function () {
  var s = D.docDescription("Section 7 Request", { subject: "John SMITH", date: "2026-05-09", who: "74125" });
  assert.ok(s.indexOf("submitted by officer 74125") !== -1, s);
  assert.ok(s.indexOf("on 09/05/2026 in relation to John SMITH") !== -1, s);
  assert.ok(s.indexOf("[FILL: agency]") !== -1, "agency prompt preserved");
  assert.strictEqual(D.hasUnfilled(s), true);
});

console.log("vocab integrity");
ok("every entity type's core checks are valid system names", function () {
  Object.keys(V.CORE_CHECKS_BY_TYPE).forEach(function (t) {
    V.CORE_CHECKS_BY_TYPE[t].forEach(function (sys) {
      assert.ok(V.PURPOSE_BY_SYSTEM.hasOwnProperty(sys), t + " core check '" + sys + "' is not a known system");
    });
  });
});
ok("every doc type has a starter; purposeFor unknown is empty", function () {
  assert.strictEqual(V.DOC_TYPES.length, Object.keys(V.DOC_TYPE_STARTERS).length);
  assert.strictEqual(D.purposeFor("NOT A SYSTEM"), "");
  assert.ok(V.SYSTEMS.length >= 25);
});


console.log("review fixes: date honesty + safe fill");
ok("blank/invalid date stays a visible placeholder (no fabricated today)", function () {
  var s = D.enquirySentence({ system: "PNC", who: "1", entity: "x", subject: "y" });
  assert.ok(s.indexOf("completed on [date] by") !== -1, s);
  var today = D.ddmmyyyy(new Date());
  assert.ok(s.indexOf(today) === -1, "must not stamp today's date");
  assert.strictEqual(D.fileName({ system: "PNC", caseRef: "IR1" }).slice(0, 8), "YYYYMMDD");
});
ok("fill() preserves decimals/IPs and spaced punctuation in analyst text", function () {
  var s = D.enquirySentence({ system: "Open Source", date: "2026-05-08", who: "1", entity: "x", subject: "J. SMITH", result: "Funds of 3.14 moved via 10.0.0.1 noted ." });
  assert.ok(s.indexOf("10.0.0.1") !== -1, "IP intact");
  assert.ok(s.indexOf("3.14") !== -1, "decimal intact");
  assert.ok(s.indexOf("J. SMITH") !== -1, "initials intact");
});

console.log("\nALL PASS — " + passed + " cases");
