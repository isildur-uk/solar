/* comms-case.run.js — tests: Analyse results -> shared-case entities + links. */
"use strict";
var SC = require("../js/core/solar-case.js");
var CC = require("../js/core/comms-case.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

console.log("Comms-case tests\n");

var events = [
  { startDt: "01/09/2024 08:00", aParty: "07700900111", bParty: "07700900222", cellName: "LTN-A", lat: 51.87, lon: -0.42, startCell: { id: "LTN-A" } },
  { startDt: "01/09/2024 08:05", aParty: "07700900111", bParty: "07700900999", cellName: "LTN-A", lat: 51.87, lon: -0.42, startCell: { id: "LTN-A" } },
  { startDt: "01/09/2024 09:00", aParty: "07700900111", bParty: "07700900222", cellName: "LTN-B", lat: 51.88, lon: -0.43, startCell: { id: "LTN-B" } },
  { startDt: "01/09/2024 10:00", vrm: "AB12CDE", make: "FORD", colour: "BLUE", cellName: "M1 J10", lat: 51.90, lon: -0.50, startCell: { id: "M1CAM" } }
];
var parts = CC.fromEvents(events, { "Target identity": "07700900111" });
function ent(type, label) { return parts.entities.filter(function (e) { return e.type === type && e.label === label; })[0]; }
function link(type) { return parts.links.filter(function (l) { return l.type === type; }); }

ok("target phone entity", !!ent("phone", "07700900111"));
ok("contact phone entities", !!ent("phone", "07700900222") && !!ent("phone", "07700900999"));
ok("location entities (cells)", !!ent("location", "LTN-A") && !!ent("location", "LTN-B"));
ok("vehicle entity from ANPR", !!ent("vehicle", "AB12CDE"));
ok("vehicle carries make/colour attrs", ent("vehicle", "AB12CDE").attrs.make === "FORD");
ok("COMMUNICATED_WITH link present", link("COMMUNICATED_WITH").length >= 1);
ok("contact 222 link accumulates count 2", (function () { var l = parts.links.filter(function (x) { return x.type === "COMMUNICATED_WITH" && x.to === SC.entityId({ type: "phone", identity: "07700900222" }); })[0]; return l && l.attrs.count === 2; })());
ok("LOCATED_IN links present", link("LOCATED_IN").length >= 2);
ok("location has lat/lon attrs", ent("location", "LTN-A").attrs.lat === 51.87);

/* cross-file -> case */
var cc = { identities: ["07700900111", "07700900222"], shared: [{ contact: "07700900999", targets: ["07700900111", "07700900222"], perTarget: { "07700900111": 1, "07700900222": 1 } }], directLinks: [{ from: "07700900111", to: "07700900222", count: 1 }] };
var co = [{ targetA: "07700900111", targetB: "07700900222", place: "Luton Town Hall" }];
var lp = CC.fromLink(cc, co);
ok("cross-file shared contact entity", lp.entities.some(function (e) { return e.label === "07700900999"; }));
ok("cross-file CO_LOCATED_WITH link", lp.links.some(function (l) { return l.type === "CO_LOCATED_WITH"; }));

/* merge into the shared spine */
SC._reset();
var s = SC.merge(parts);
ok("merge writes entities to SolarCase", s.entities === parts.entities.length);
ok("merge writes links to SolarCase", s.links === parts.links.length);
ok("re-merging is idempotent", (function () { var s2 = SC.merge(parts); return s2.entities === s.entities && s2.links === s.links; })());

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
