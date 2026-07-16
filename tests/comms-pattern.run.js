/* comms-pattern.run.js — tests for pattern-of-life / cell-site analysis. */
"use strict";
var P = require("../js/core/comms-pattern.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

console.log("Comms-pattern tests\n");

var H = { id: "H", name: "Home LTN", lat: 51.88, lon: -0.42 };
var W = { id: "W", name: "Work Park", lat: 51.90, lon: -0.50 };
var G = { id: "G", name: "Gym", lat: 51.89, lon: -0.45 };
function ev(dt, cell) { return { startDt: dt, startCell: { id: cell.id }, cellName: cell.name, lat: cell.lat, lon: cell.lon }; }
// 02/09/2024 = Monday, 03 = Tuesday, 04 = Wednesday
var events = [
  ev("02/09/2024 23:10", H), ev("03/09/2024 00:30", H), ev("03/09/2024 05:45", H), ev("04/09/2024 22:50", H), // overnight -> H
  ev("02/09/2024 10:15", W), ev("03/09/2024 14:20", W),   // weekday daytime -> W
  ev("02/09/2024 18:30", G)                                // evening -> G
];
var r = P.patternOfLife(events);

ok("total geolocated events", r.total === 7);
ok("three distinct locations", r.topLocations.length === 3);
ok("most-frequented location is H (4)", r.topLocations[0].key === "H" && r.topLocations[0].count === 4);
ok("overnight anchor = H (where they sleep)", r.nightAnchor && r.nightAnchor.key === "H");
ok("daytime anchor = W (weekday base)", r.dayAnchor && r.dayAnchor.key === "W");
ok("overnight band (22:00-02:00) top is H", r.byBand[5].location && r.byBand[5].location.key === "H");
ok("overnight band count is 3 (23:10,00:30,22:50)", r.byBand[5].count === 3);
ok("10:00-14:00 band top is W", r.byBand[2].location && r.byBand[2].location.key === "W");
ok("empty band (06:00-10:00) has no location", r.byBand[1].location === null);
ok("hourly histogram has 24 buckets", r.hourly.length === 24);
ok("hourly bucket 23 counted", r.hourly[23] === 1 && r.hourly[0] === 1 && r.hourly[22] === 1);
ok("day-of-week histogram Monday=3", r.dow[1] === 3 && r.dow[2] === 3 && r.dow[3] === 1);
ok("date range spans first..last", r.dateRange.first instanceof Date && r.dateRange.last instanceof Date && r.dateRange.last > r.dateRange.first);
ok("H first/last seen tracked", r.topLocations[0].first instanceof Date && r.topLocations[0].last instanceof Date);
// events with no location or no time are ignored
ok("locationless / timeless events ignored", P.patternOfLife([{ startDt: "" }, { startCell: {} }]).total === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
