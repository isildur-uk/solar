/* comms-journeys.run.js — tests for movement / mode-of-transport inference. */
"use strict";
var J = require("../js/core/comms-journeys.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
var M = J.MODE;

console.log("Comms-journeys tests\n");

/* ---- leg classification by speed band ---- */
ok("stationary when < 0.15 km", J.classifyLeg(0, 0.05, null).mode === M.STATIONARY);
ok("on foot < 7 km/h", J.classifyLeg(3, 0.5, null).mode === M.FOOT);
ok("cycle/slow 7-25", J.classifyLeg(18, 3, null).mode === M.CYCLE);
ok("road vehicle 25-100", J.classifyLeg(60, 20, null).mode === M.ROAD);
ok("motorway 100-130", J.classifyLeg(120, 40, null).mode === M.MOTORWAY);
ok("train/air > 130", J.classifyLeg(200, 100, null).mode === M.RAIL_AIR);
ok("implausible > 300", J.classifyLeg(900, 300, null).mode === M.IMPOSSIBLE);
ok("road-confirmed motorway at road speed", (function () { var c = J.classifyLeg(80, 30, { kind: "motorway", road: "M1" }); return c.mode === M.MOTORWAY && c.confidence === "High"; })());

/* ---- road-name hint from ANPR camera site ---- */
ok("roadOf M-road", J.roadOf("M1 J10").road === "M1" && J.roadOf("M1 J10").kind === "motorway");
ok("roadOf A-road", J.roadOf("LUTON A505 NB").road === "A505");
ok("roadOf none", J.roadOf("Bury Park") === null);

/* ---- full analysis: legs, journeys, road hint, grouping ---- */
function ev(dt, lat, lon, name) { return { startDt: dt, lat: lat, lon: lon, cellName: name }; }
var events = [
  ev("01/09/2024 08:00", 52.0000, -1.0, "Start"),
  ev("01/09/2024 08:20", 52.1798, -1.0, "Mid"),        // leg1 ~20km/20min = 60 km/h -> road
  ev("01/09/2024 08:25", 52.1810, -1.0, "Mid stop"),   // leg2 ~0.13km -> stationary (dwell)
  ev("01/09/2024 09:00", 52.5000, -1.0, "M1 J10"),     // leg3 motorway (road-confirmed)
  ev("01/09/2024 09:10", 52.6800, -1.0, "M1 J13")      // leg4 ~20km/10min = 120 km/h motorway
];
var r = J.analyseJourneys(events);
ok("four legs built", r.legs.length === 4);
ok("leg1 ~60 km/h road", r.legs[0].mode === M.ROAD && r.legs[0].speedKmh >= 58 && r.legs[0].speedKmh <= 62);
ok("leg2 stationary (dwell)", r.legs[1].mode === M.STATIONARY);
ok("leg3 road hint M1 + motorway", r.legs[2].roadHint === "M1" && r.legs[2].mode === M.MOTORWAY);
ok("two journeys (dwell splits)", r.journeys.length === 2);
ok("journey 1 is the single road leg", r.journeys[0].legs === 1);
ok("journey 2 is motorway on M1", r.journeys[1].mode === M.MOTORWAY && r.journeys[1].roads.indexOf("M1") !== -1 && r.journeys[1].legs === 2);
ok("no impossible legs here", r.impossible.length === 0);

/* ---- impossible travel ---- */
var imp = J.analyseJourneys([ev("01/09/2024 08:00", 52.0, -1.0, "A"), ev("01/09/2024 08:20", 55.0, -1.0, "B")]); // ~333km/20min ~1000km/h
ok("impossible leg flagged", imp.impossible.length === 1 && imp.legs[0].mode === M.IMPOSSIBLE && imp.legs[0].impossible === true);

/* ---- straightness ---- */
var straight = J.analyseJourneys([
  ev("01/09/2024 08:00", 52.00, -1.0, "s1"),
  ev("01/09/2024 08:20", 52.18, -1.0, "s2"),
  ev("01/09/2024 08:40", 52.36, -1.0, "s3")
]);
ok("collinear journey is near-straight (~1.0)", straight.journeys.length === 1 && straight.journeys[0].straightness >= 0.98);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
