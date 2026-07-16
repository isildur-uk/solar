/* gazetteer.run.js — tests for the dictionary NER + SmartNER composition. */
"use strict";
var G = require("../js/core/gazetteer.js");
var SN = require("../js/core/smartner.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

console.log("Gazetteer tests\n");

ok("inactive before a gazetteer is loaded", G.active() === false && G.match("June BAILEY").length === 0);

var n = G.setGazetteer({ entities: { person: ["June BAILEY", "David ROBERTS"], organisation: ["OAKDALE AUCTIONS"], location: ["Rotterdam"] } });
ok("loaded phrase count", n === 4);
ok("active after load", G.active() === true);

var text = "June BAILEY met David ROBERTS at OAKDALE AUCTIONS in Rotterdam.";
var spans = G.match(text);
ok("four spans matched", spans.length === 4);
ok("person span at correct offset", spans[0].label === "person" && spans[0].text === "June BAILEY" && spans[0].start === 0);
ok("multi-word org is one span", spans.some(function (s) { return s.label === "organisation" && s.text === "OAKDALE AUCTIONS"; }));
ok("location matched", spans.some(function (s) { return s.label === "location" && s.text === "Rotterdam"; }));
ok("case-insensitive", G.match("june bailey called in").length === 1);
ok("word-boundary: no partial match", G.match("Rotterdamer sausage").length === 0);
ok("no plural false-positive", G.match("the BAILEYS live here").length === 0);
ok("SmartNER runtime shape (numeric score)", typeof spans[0].score === "number");

/* compose with SmartNER + mergeInto (rules win on overlap) */
SN.addRuntime(function (t) { return G.match(t); });
ok("SmartNER available after addRuntime", SN.available() === true);
var ruleResult = { entities: [{ ref: "e1", type: "person", label: "David ROBERTS", spans: [[16, 29]] }] };
var merged = SN.mergeInto(ruleResult, G.match(text), { minScore: 0.5 });
ok("mergeInto adds new gazetteer entities", merged.added.some(function (e) { return /June BAILEY/.test(e.label); }));
ok("overlapping gazetteer span discarded (rules win)", !merged.added.some(function (e) { return /David ROBERTS/.test(e.label); }));
ok("rule entity retained", merged.entities.some(function (e) { return e.ref === "e1"; }));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
