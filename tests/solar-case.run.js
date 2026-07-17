/* solar-case.run.js — tests for the shared SolarCase spine. */
"use strict";
var C = require("../js/core/solar-case.js");
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

console.log("SolarCase tests\n");

C._reset();
ok("empty case", C.stats().entities === 0 && C.stats().links === 0 && C.get().schema === "solar.case.v1");

var e1 = C.upsertEntity({ type: "person", label: "June BAILEY" });
ok("entity gets a stable id from identity", e1.id === "E:person|june bailey");
ok("one entity after insert", C.stats().entities === 1);

var e1b = C.upsertEntity({ type: "person", label: "June BAILEY", attrs: { dob: "14/02/1972" } });
ok("same identity does not duplicate (idempotent)", C.stats().entities === 1 && e1b.id === e1.id);
ok("attrs merged on re-upsert", C.entities()[0].attrs.dob === "14/02/1972");

var ph = C.upsertEntity({ type: "phone", label: "07700900111", identity: "447700900222" });
ok("explicit identity used for id (canonicalised to UK national)", ph.id === "E:phone|07700900222");
ok("two distinct entities", C.stats().entities === 2);

var l1 = C.upsertLink({ from: e1.id, to: ph.id, type: "USES" });
ok("link inserted with stable id", l1.id === "L:" + e1.id + "|uses|" + ph.id && C.stats().links === 1);
C.upsertLink({ from: e1.id, to: ph.id, type: "USES" });
ok("duplicate link deduped", C.stats().links === 1);

var fires = 0; var off = C.subscribe(function () { fires++; });
C.upsertEntity({ type: "vehicle", label: "AB12 CDE" });
ok("subscriber fires on mutation", fires >= 1);
off();
var frozen = fires; C.upsertEntity({ type: "location", label: "Rotterdam" });
ok("unsubscribe stops notifications", fires === frozen);

var before = C.stats().entities;
var s = C.merge({ entities: [{ type: "person", label: "June BAILEY", attrs: { role: "principal" } }, { type: "organisation", label: "OAKDALE AUCTIONS" }], links: [{ from: e1.id, to: "E:organisation|oakdale auctions", type: "ASSOCIATE_OF" }] });
ok("merge dedupes existing person, adds new org", s.entities === before + 1);
ok("merge added the link", C.links().some(function (x) { return x.type === "ASSOCIATE_OF"; }));
ok("merge kept merged attr on existing entity", C.entities().filter(function (x) { return x.id === e1.id; })[0].attrs.role === "principal");

C.setName("OP NEPTUNE");
ok("case name persists", C.name() === "OP NEPTUNE");

C.clear();
ok("clear empties the case", C.stats().entities === 0 && C.stats().links === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
