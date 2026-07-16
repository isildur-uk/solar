/* comms-link.run.js — tests for cross-file common-contacts + co-location. */
"use strict";
var L = require("../js/core/comms-link.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

console.log("Comms-link tests\n");

/* ---- common contacts + direct links ---- */
var dsCC = [
  { label: "A", identity: "07700900111", events: [
    { aParty: "07700900111", bParty: "07700900222" },
    { aParty: "07700900111", bParty: "07700900333" },
    { aParty: "07700900111", bParty: "07700900999" } ] },
  { label: "B", identity: "07700900222", events: [
    { aParty: "07700900222", bParty: "07700900999" },
    { aParty: "07700900222", bParty: "07700900111" } ] },
  { label: "C", identity: "07700900333", events: [
    { aParty: "07700900333", bParty: "07700900888" } ] }
];
var cc = L.commonContacts(dsCC);
var shared999 = cc.shared.filter(function (s) { return s.contact === "07700900999"; })[0];
ok("shared contact 999 found", !!shared999);
ok("999 shared by 2 targets", shared999 && shared999.targetCount === 2);
ok("999 counts per target A and B", shared999 && shared999.perTarget["A"] === 1 && shared999.perTarget["B"] === 1);
ok("999 is not itself a target", shared999 && shared999.isTargetIdentity === false);
ok("no shared contact has <2 targets", cc.shared.every(function (s) { return s.targetCount >= 2; }));
ok("888 (only C) is not shared", !cc.shared.some(function (s) { return s.contact === "07700900888"; }));
ok("three directed target-to-target links", cc.directLinks.length === 3);
ok("direct link B->A via 111 present", cc.directLinks.some(function (l) { return l.from === "B" && l.to === "A" && l.via === "07700900111"; }));
ok("direct link A->C via 333 present", cc.directLinks.some(function (l) { return l.from === "A" && l.to === "C" && l.via === "07700900333"; }));
// identity inference when not supplied
ok("identity inferred from most-frequent A-party", L.inferIdentity([{ aParty: "07700900111" }, { aParty: "07700900111" }, { aParty: "07700900222" }]) === "07700900111");

/* ---- co-location ---- */
var dsCL = [
  { label: "A", identity: "111", events: [
    { startDt: "01/09/2024 08:00", startCell: { id: "X" }, lat: 51.8790, lon: -0.42, cellName: "Cell X" },
    { startDt: "01/09/2024 10:00", startCell: { id: "Y" }, lat: 51.90, lon: -0.50, cellName: "Cell Y" },
    { startDt: "01/09/2024 09:00", startCell: {}, lat: 51.8790, lon: -0.4200, cellName: "" } ] },
  { label: "B", identity: "222", events: [
    { startDt: "01/09/2024 08:20", startCell: { id: "X" }, lat: 51.8790, lon: -0.42, cellName: "Cell X" },
    { startDt: "01/09/2024 09:10", startCell: {}, lat: 51.88035, lon: -0.4200, cellName: "" } ] },
  { label: "C", identity: "333", events: [
    { startDt: "01/09/2024 12:00", startCell: { id: "Y" }, lat: 51.90, lon: -0.50, cellName: "Cell Y" } ] }
];
var co = L.coLocations(dsCL, { windowMins: 60, radiusM: 250 });
ok("co-locations found (3 A/B matches)", co.length === 3);
ok("every co-location within window", co.every(function (r) { return r.gapMins <= 60; }));
ok("every co-location is cross-target", co.every(function (r) { return r.targetA !== r.targetB; }));
ok("third target C never co-locates (2h apart)", !co.some(function (r) { return r.targetA === "C" || r.targetB === "C"; }));
ok("a same-cell co-location at Cell X exists", co.some(function (r) { return r.place === "Cell X"; }));
// window tightening: only the 10-min geo pair survives at 15 mins
ok("windowMins=15 -> single co-location", L.coLocations(dsCL, { windowMins: 15, radiusM: 250 }).length === 1);
// radius tightening: the ~150 m geo pair drops at 50 m, same-cell/coord remain
ok("radiusM=50 -> two co-locations", L.coLocations(dsCL, { windowMins: 60, radiusM: 50 }).length === 2);

/* ---- haversine sanity ---- */
ok("haversine ~150 m for 0.00135 deg lat", Math.abs(L.haversine(51.8790, -0.42, 51.88035, -0.42) - 150) < 15);

/* ---- cross-modality: an ANPR vehicle co-locates with a phone ------------- */
var CDx = require("../js/core/comms-data.js");
var vRows = [
  ["VRM", "Date/Time", "Camera", "GPS", "Make", "Colour"],
  ["AB12CDE", "01/09/2024 08:00:00", "LUTON CAM 1", "(-0.4200, -51.8790)", "FORD", "BLUE"]
];
var vehicle = { label: "Vehicle AB12CDE", identity: "AB12CDE", events: CDx.cleanFromRows(vRows).events };
var phone = { label: "Phone 07700900111", identity: "07700900111", events: [
  { startDt: "01/09/2024 08:10:00", startCell: { id: "CELL-X" }, lat: 51.8790, lon: -0.4200, cellName: "Cell X", aParty: "07700900111", bParty: "07700900222" } ] };
var mix = L.coLocations([phone, vehicle], { windowMins: 60, radiusM: 250 });
ok("phone and vehicle co-locate (cross-modality)", mix.length === 1);
ok("co-location is phone<->vehicle", mix.length === 1 && mix[0].targetA !== mix[0].targetB);
ok("ANPR vehicle contributes no phone contacts", L.commonContacts([phone, vehicle]).shared.length === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
