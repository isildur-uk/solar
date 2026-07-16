/* spine-parity.run.js — P6: identifier parity across the shared spine.
 * The SAME real-world identifier must yield the SAME SolarCase id no matter
 * which function contributed it (Analyse comms, Database IRs, Charting), so the
 * entity collapses to ONE node on merge. Guards the canonicalIdentity contract. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }
function eq(n, a, b) { ok(n + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", a === b); }

var SC = require("../js/core/solar-case.js");
global.window = global; global.SolarCase = SC;
var CC = require("../js/core/comms-case.js");
var H  = require("../registry/core/handoff.js");
var SI = require("../registry/core/si-model.js");
var M  = require("../registry/core/ir-model.js");
var T  = require("../registry/core/threat-areas.js");

console.log("Spine identifier-parity tests\n");

/* ---- canonicalIdentity contract ---- */
eq("phone strips spaces", SC.canonicalIdentity("phone", "07700 900111"), "07700900111");
eq("phone strips dashes/parens/dots", SC.canonicalIdentity("phone", "(07700) 900-111"), "07700900111");
eq("vehicle strips spaces", SC.canonicalIdentity("vehicle", "DE20 NTM"), "DE20NTM");
eq("account strips spaces + dashes", SC.canonicalIdentity("account", "20-00-00 12345678"), "20000012345678");
eq("person left to norm()", SC.canonicalIdentity("person", "John SMITH"), "John SMITH");

/* ---- entityId parity for the same phone formatted differently ---- */
eq("entityId phone spaced == unspaced",
   SC.entityId({ type: "phone", identity: "07700 900111" }),
   SC.entityId({ type: "phone", identity: "07700900111" }));
eq("entityId vehicle spaced == unspaced",
   SC.entityId({ type: "vehicle", identity: "DE20 NTM" }),
   SC.entityId({ type: "vehicle", identity: "DE20NTM" }));

function ir() {
  var r = M.createIR({ title: "T", dateOfCollection: "02/02/2026", submittedBySelf: true, threatArea: T.list()[0],
    confidence: "High", protectiveMarking: "OFFICIAL", handling: { code: "P" }, provenance: { text: "p", sourceEval: "1", intelEval: "A" } });
  M.addItem(r, { sourceType: "PND Log", text: "x", sourceEval: "1", intelEval: "A" });
  return r;
}

/* ---- cross-producer: Analyse phone id == Database phone id (spaced label) ---- */
var aPhone = CC.fromLink({ identities: ["07700900111"], sharedContacts: [], directLinks: [] }, []).entities[0].id;
var irP = ir(); SI.addEntity(irP, { type: "communication", label: "07700 900111" });
var dPhone = H.toSpine(irP).entities[0].id;
eq("Analyse phone id == Database phone id", aPhone, dPhone);

/* ---- cross-producer: Analyse VRM (ANPR) id == Database vehicle id ---- */
var aVeh = CC.fromEvents([{ startDt: "01/09/2024 08:00", aParty: "07700900111", vrm: "DE20 NTM",
  startCell: { id: "C1" }, cellName: "X", lat: 51.5, lon: -0.1 }], {}).entities
  .filter(function (e) { return e.type === "vehicle"; })[0];
var irV = ir(); SI.addEntity(irV, { type: "vehicle", label: "DE20 NTM", attrs: { vrm: "DE20 NTM" } });
var dVeh = H.toSpine(irV).entities.filter(function (e) { return e.type === "vehicle"; })[0];
ok("Analyse produced a vehicle entity", !!aVeh);
if (aVeh) eq("Analyse VRM id == Database vehicle id", aVeh.id, dVeh.id);

/* ---- merge really collapses them into one node ---- */
SC._reset();
SC.merge({ entities: [{ id: aPhone, type: "phone", label: "07700900111", identity: "07700900111" }], links: [] });
SC.merge(H.toSpine(irP));
eq("same phone from two functions merges to ONE spine node", SC.stats().entities, 1);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
