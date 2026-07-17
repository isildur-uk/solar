/* comms-attribution.run.js — IMEI<->IMSI attribution + swap timeline. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c){ if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
var A = require("../js/core/comms-attribution.js");
console.log("Comms-attribution tests\n");

var IMEI_A = "350000000000011", IMEI_B = "350000000000022";
var SIM1 = "234300000000001", SIM2 = "234300000000002";
var ev = [];
function push(dt, imei, imsi){ ev.push({ startDt: dt, imei: imei, imsi: imsi, aParty: "07700900111", type: "MOC", durationHms: "00:01:00" }); }
// handset A with SIM1 (days 1-2), then A swaps to SIM2 (day 3) => multi-SIM handset + a swap
push("01/09/2024 08:00:00", IMEI_A, SIM1);
push("02/09/2024 09:00:00", IMEI_A, SIM1);
push("03/09/2024 10:00:00", IMEI_A, SIM2);
// SIM2 then moves into a different handset B (day 4) => adjacent moved-SIM transition
push("04/09/2024 11:00:00", IMEI_B, SIM2);

var r = A.analyse(ev);
ok("pairings enumerated (A-SIM1, A-SIM2, B-SIM1)", r.pairs.length === 3);
ok("top pairing is A+SIM1 (2 events)", r.pairs[0].imei === IMEI_A && r.pairs[0].imsi === SIM1 && r.pairs[0].count === 2);
ok("handset A flagged multi-SIM (ran 2 SIMs)", r.multiSim.some(function(h){ return h.imei === IMEI_A && h.simCount === 2; }));
ok("SIM2 flagged moved (used in 2 handsets)", r.movedSim.some(function(x){ return x.imsi === SIM2 && x.handsetCount === 2; }));
ok("swap timeline is chronological", r.timeline[0].tISO === "2024-09-01");
ok("timeline captures the SIM swap in the same handset", r.timeline.some(function(t){ return /SIM swapped/.test(t.change); }));
ok("timeline captures the SIM moving to a new handset", r.timeline.some(function(t){ return /moved to new handset/.test(t.change); }));
ok("first timeline entry marked first-seen", r.timeline[0].change === "first-seen");
ok("per-pairing first/last set", r.pairs[0].firstISO === "2024-09-01" && r.pairs[0].lastISO === "2024-09-02");

/* clean single-handset case: no flags */
var r2 = A.analyse([{ startDt: "01/09/2024 08:00:00", imei: IMEI_A, imsi: SIM1 }, { startDt: "02/09/2024 08:00:00", imei: IMEI_A, imsi: SIM1 }]);
ok("single handset+SIM raises no multi-SIM/moved flags", r2.multiSim.length === 0 && r2.movedSim.length === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
