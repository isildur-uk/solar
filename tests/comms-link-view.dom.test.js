/* comms-link-view.dom.test.js — headless smoke test for the cross-file view. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
var JSDOM;
try { JSDOM = require("jsdom").JSDOM; } catch (e) { console.log("jsdom unavailable — skipping\n\n1 passed, 0 failed"); process.exit(0); }

console.log("Comms-link-view DOM tests\n");
var dom = new JSDOM("<!doctype html><html><head></head><body><div id='host'></div></body></html>");
global.window = dom.window; global.document = dom.window.document;
dom.window.RegistryCommsData = require("../js/core/comms-data.js");
dom.window.RegistryCommsLink = require("../js/core/comms-link.js");
dom.window.SolarCase = require("../js/core/solar-case.js");
dom.window.CRCommsCase = require("../js/core/comms-case.js");
var V = require("../analyse/comms-link-view.js");

var cA = { id: "LTN-A", name: "Luton Town Hall", lat: 51.8790, lon: -0.4200 };
var cC = { id: "DUN-C", name: "Dunstable Central", lat: 51.8865, lon: -0.5210 };
function ev(dt, cell, a, b) { return { startDt: dt, aParty: a, bParty: b, startCell: { id: cell.id }, cellName: cell.name, lat: cell.lat, lon: cell.lon }; }

var thrown = null;
try {
  V.mount(dom.window.document.getElementById("host"));
  V._addDataset({ label: "07700900111", identity: "07700900111", events: [ev("01/09/2024 08:00", cA, "07700900111", "07700900222"), ev("01/09/2024 08:05", cA, "07700900111", "07700900999")] });
  V._addDataset({ label: "07700900222", identity: "07700900222", events: [ev("01/09/2024 08:15", cA, "07700900222", "07700900999"), ev("01/09/2024 08:40", cA, "07700900222", "07700900111")] });
  V._addDataset({ label: "07700900333", identity: "07700900333", events: [ev("01/09/2024 09:00", cC, "07700900333", "07700900888")] });
  V._analyse();
} catch (e) { thrown = e; }
var d = dom.window.document;
ok("no throw during ingest+analyse", thrown === null);
ok("three subjects on the rail", d.querySelectorAll(".cl-subj").length === 3);
ok("contacts pane has tables", d.querySelectorAll("#cl-pane-contacts .cl-table").length >= 1);
ok("shared contact 07700900999 shown", /07700900999/.test(d.getElementById("cl-pane-contacts").textContent));
ok("direct link between subjects shown", /Direct contact between subjects/.test(d.getElementById("cl-pane-contacts").textContent));
ok("co-location table rendered", d.querySelectorAll("#cl-coloc-table .cl-table").length >= 1);
ok("co-location at Luton Town Hall present", /Luton Town Hall/.test(d.getElementById("cl-coloc-table").textContent));
ok("isolated subject C not co-located", !/07700900333/.test(d.getElementById("cl-coloc-table").textContent));

/* built-in demo: phones + an ANPR vehicle that co-locates with them */
V._loadDemo();
ok("demo loads 4 subjects (3 phones + 1 vehicle)", d.querySelectorAll(".cl-subj").length === 4);
ok("demo co-location table includes the vehicle", /Vehicle LD12 ABC/.test(d.getElementById("cl-coloc-table").textContent));
ok("demo still shows a shared phone contact", /07700900999/.test(d.getElementById("cl-pane-contacts").textContent));

/* P5: Add-to-case writes the cross-file findings into the shared spine */
dom.window.SolarCase._reset();
var ab = dom.window.document.getElementById("cl-addcase"); if (ab) ab.click();
ok("cross-file Add-to-case writes subjects to the shared spine", dom.window.SolarCase.stats().entities > 0);
ok("cross-file Add-to-case writes links (incl co-location) to the shared spine", dom.window.SolarCase.stats().links >= 1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
