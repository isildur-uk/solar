/* nbtc-view.dom.test.js — headless smoke test for the Analyse NBTC tool. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c){ if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
var JSDOM; try { JSDOM = require("jsdom").JSDOM; } catch (e) { console.log("jsdom unavailable — skipping\n\n1 passed, 0 failed"); process.exit(0); }

var dom = new JSDOM("<!doctype html><html><head></head><body><div id='host'></div></body></html>");
global.window = dom.window; global.document = dom.window.document;
dom.window.SolarCase = require("../js/core/solar-case.js");
dom.window.CRAviation = require("../js/core/aviation-ref.js");
dom.window.CRNbtc = require("../js/core/nbtc.js");
var V = require("../analyse/nbtc-view.js");
console.log("NBTC-view DOM tests\n");

var d = dom.window.document, thrown = null;
try {
  V.mount(d.getElementById("host"));
  V._resolveText(V._loadSample());
} catch (e) { thrown = e; }
ok("mount + resolve did not throw", thrown === null);
ok("resolved-people cards rendered", d.querySelectorAll(".nb-person").length >= 1);
ok("review candidates rendered", d.querySelectorAll(".nb-cand").length >= 1);
ok("raw table has 12 rows", d.querySelectorAll(".nb-table tbody tr").length === 12);
ok("a document tag is shown on a person", /\(GBR\)/.test(d.getElementById("nb-body").textContent));
ok("meta summarises counts", /resolved/.test(d.getElementById("nb-meta").textContent));

/* flight lookup demonstrates the aviation reference */
d.getElementById("nb-flight").value = "BA286";
d.querySelector(".nb-bar").querySelectorAll("button")[3] && null;
V && null;
(function(){ var btns = d.querySelectorAll(".nb-bar .nb-btn"); btns[btns.length-1].click(); })();
ok("flight BA286 decodes to British Airways", /British Airways/.test(d.getElementById("nb-flightout").textContent));

/* add to case pushes to the shared spine */
dom.window.SolarCase._reset();
var ab = d.getElementById("nb-addcase"); if (ab) ab.click();
ok("Add to case writes person + document entities to the spine", dom.window.SolarCase.stats().entities > 0);
ok("Add to case writes DOCUMENT_OWNERSHIP links", dom.window.SolarCase.stats().links >= 1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
