/* analyse-shell.dom.test.js — headless test for Analyse's shared shell top bar. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
var JSDOM;
try { JSDOM = require("jsdom").JSDOM; } catch (e) { console.log("jsdom unavailable — skipping\n\n1 passed, 0 failed"); process.exit(0); }

console.log("Analyse shell DOM tests\n");
var dom = new JSDOM('<!doctype html><html><head></head><body><div id="marking-banner">OFFICIAL</div><header class="masthead"><span class="masthead-user">Analyse</span></header><main id="analyse-main"></main></body></html>');
global.window = dom.window; global.document = dom.window.document;
dom.window.SolarIdentity = require("../js/ui/identity.js");
dom.window.SolarIdentity._reset();
var SL = require("../analyse/shell-lite.js");
SL.build();

var d = dom.window.document;
ok("#solar-shell built", !!d.getElementById("solar-shell"));
ok("three-surface switcher", d.querySelectorAll("#solar-shell .sh-surf-btn").length === 3);
ok("Analyse is the current surface", (function () { var a = d.querySelector('#solar-shell .sh-surf-btn[aria-current="true"]'); return a && /Analyse/.test(a.textContent); })());
ok("switcher links to Charting + Database", /index\.html/.test(d.querySelector("#solar-shell").innerHTML) && /registry\/index\.html/.test(d.querySelector("#solar-shell").innerHTML));
ok("shared identity chip shown", /G5/.test(d.querySelector("#solar-shell .sh-user").textContent) && /Analyst/.test(d.querySelector("#solar-shell .sh-user").textContent));
ok("plain masthead retired", !d.querySelector("header.masthead"));
ok("marking banner kept, shell placed after it", d.getElementById("marking-banner") && d.getElementById("marking-banner").nextElementSibling === d.getElementById("solar-shell"));
ok("build is idempotent", (function () { SL.build(); return d.querySelectorAll("#solar-shell").length === 1; })());

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
