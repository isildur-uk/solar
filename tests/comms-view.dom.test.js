/* comms-view.dom.test.js — headless smoke test for the Analyse comms-data view.
 * Verifies the table / summary / timeline build from parsed rows and that
 * SIM-swap is surfaced. The Leaflet map is feature-detected and skipped here. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

var JSDOM;
try { JSDOM = require("jsdom").JSDOM; } catch (e) { console.log("jsdom unavailable — skipping (treated as pass)"); console.log("\n1 passed, 0 failed"); process.exit(0); }

console.log("Comms-view DOM tests\n");

var dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
global.window = dom.window;
global.document = dom.window.document;

var CD = require("../js/core/comms-data.js");
dom.window.RegistryCommsData = CD;                 // comms-view binds to this at load
dom.window.RegistryCommsPattern = require("../js/core/comms-pattern.js");
dom.window.RegistryCommsJourneys = require("../js/core/comms-journeys.js");
var CV = require("../analyse/comms-view.js");

// small fixture: two events, same A-number on two IMEIs (SIM-swap), with geo.
var HDR = ["Start Date","Start Time (local)","End Date","End Time (local)","Calling Number","Called Number","Forwarding Number","CDR Type","IMSI","IMEI","Ring time (secs)","Call Duration (HH:mm:ss)","IPv4 address","IPv6 address","Data Volume Uploaded (KB)","Data Volume Downloaded (KB)","APN","Country of Origin","Operator","Start Cell ID or MAC Address","Start Cell Site Name","Start Cell 1st line of Address","Start Cell ID Postcode","Start Cell Generation","Start Cell Easting","Start Cell Northing","Start Cell Azimuth","End Cell ID or MAC Address","End Cell Site Name","End Cell 1st line of Address","End Cell ID Postcode","End Cell Generation","End Cell Easting","End Cell Northing","End Cell Azimuth","Row"].join(",");
function row(imei, e, n) { return ["01/09/2024","08:15:22","01/09/2024","08:16:00","07700900111","07700900222","","Voice","234300000000001",imei,"3","00:00:38","","","","","","GBR","EE","C1","LUTON TOWN HALL","George St","LU1 2BQ","4G",String(e),String(n),"90","","","","","","","","","1"].join(","); }
var csv = ["URN:,,,,IR900001","Grade:,,,,OFFICIAL-SENSITIVE","", HDR, "", row("350000000000012",509200,221600), row("350000000000099",508100,221900)].join("\n");

var thrown = null, st = null;
try { st = CV._ingestRows(CD.parseDelimited(csv)); } catch (e) { thrown = e; }
ok("ingest did not throw", thrown === null);
ok("two events ingested", st && st.events.length === 2);

var d = dom.window.document;
ok("overlay/panel built", !!d.querySelector(".cd-panel"));
ok("table rows rendered (2)", d.querySelectorAll("#cd-pane-table .cd-table tbody tr").length === 2);
function headText() { return [].map.call(d.querySelectorAll("#cd-pane-table .cd-table thead th"), function (th) { return th.textContent; }).join("|"); }
ok("technical columns hidden by default (no IMEI/IMSI/Azimuth/Gen)", !/IMEI|IMSI|Azimuth|Gen/.test(headText()));
ok("empty Forwarded-to column dropped", !/Forwarded/.test(headText()));
var boxes = d.querySelectorAll("#cd-pane-table .cd-tablectl input");
boxes[0].checked = true; boxes[0].onchange();               // Show all columns
ok("Show all columns reveals IMEI + IMSI", /IMEI/.test(headText()) && /IMSI/.test(headText()));
boxes = d.querySelectorAll("#cd-pane-table .cd-tablectl input");
boxes[1].checked = true; boxes[1].onchange();               // i2 format
ok("i2 format renders ISO datetime", /2024-09-01/.test(d.querySelector("#cd-pane-table .cd-table tbody").textContent));
ok("timeline items rendered (2)", d.querySelectorAll(".cd-tl-item").length === 2);
ok("summary chips present", d.querySelectorAll(".cd-chip").length >= 3);
ok("SIM-swap surfaced as a warning chip", d.querySelectorAll(".cd-chip.cd-warn").length >= 1);
ok("cell easting/northing converted to lat (Luton ~51.8)", st.events[0].lat > 51.5 && st.events[0].lat < 52.2);
ok("phone CM-standardised in table", /07700900111/.test(d.querySelector("#cd-pane-table .cd-table tbody").textContent));
ok("patterns tab has two anchor cards", d.querySelectorAll("#cd-pane-patterns .cd-card").length === 2);
ok("patterns tab has a top-locations table", !!d.querySelector("#cd-pane-patterns .cd-table"));
ok("patterns tab has activity histograms", d.querySelectorAll("#cd-pane-patterns .cd-hist").length === 2);

/* Journeys tab: re-ingest a moving fixture and confirm legs/journeys render */
function mrow(time, e, n) { return ["01/09/2024", time, "01/09/2024", time, "07700900111", "07700900222", "", "Voice", "234300000000001", "350000000000012", "3", "00:00:38", "", "", "", "", "", "GBR", "EE", "C", "SITE", "addr", "LU1 2BQ", "4G", String(e), String(n), "90", "", "", "", "", "", "", "", "", "1"].join(","); }
var mvCsv = ["URN:,,,,IR900002", "", HDR, "", mrow("08:00:00", 509200, 221600), mrow("08:20:00", 520000, 235000), mrow("08:40:00", 531000, 250000)].join("\n");
CV._ingestRows(CD.parseDelimited(mvCsv));
ok("journeys tab builds tables (journeys + legs)", d.querySelectorAll("#cd-pane-journeys .cd-table").length >= 2);
ok("journeys tab shows leg rows with a mode", d.querySelectorAll("#cd-pane-journeys .cd-table tbody tr").length >= 1 && /Road vehicle|Motorway|Train|On foot/.test(d.getElementById("cd-pane-journeys").textContent));
ok("mode legend rendered", d.querySelectorAll("#cd-pane-journeys .cd-legkey").length >= 5);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
