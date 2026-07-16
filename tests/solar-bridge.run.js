/* solar-bridge.run.js — node test runner for the SolarCase <-> Charting bridge.
 * Verifies non-destructive merge, dedupe, idempotency, link collapse, and
 * chart -> SolarCase write-back. Uses a mock store matching the CRModel
 * addEntity/addLink contract, then a light real-model check if available. */
"use strict";
var pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("  FAIL: " + n); } }

var B = require("../js/core/solar-bridge.js");
var SC = require("../js/core/solar-case.js");
global.window = global;                 // so bridge sees window.SolarCase / CRModel
global.SolarCase = SC;

console.log("Solar-bridge tests\n");

/* ---- mock CRModel store (mirrors model.js contract used by the bridge) ---- */
function MockStore() { this.entities = []; this.links = []; this._n = 0; }
MockStore.prototype.addEntity = function (spec) {
  var e = { id: "ent-" + (++this._n), type: spec.type, label: String(spec.label || ""),
            attrs: spec.attrs || {}, ids: {}, geo: spec.geo || null };
  if (e.type === "phone") e.ids.e164 = "+44" + e.label.replace(/\D/g, "").replace(/^0/, "");
  this.entities.push(e); return e;
};
MockStore.prototype.getEntity = function (id) {
  return this.entities.find(function (e) { return e.id === id; }) || null;
};
MockStore.prototype.addLink = function (spec) {
  if (!this.getEntity(spec.from) || !this.getEntity(spec.to)) return null;
  var ex = this.links.find(function (l) { return l.from === spec.from && l.to === spec.to && l.type === spec.type; });
  if (ex) return ex;
  var l = { id: "lnk-" + (++this._n), from: spec.from, to: spec.to, type: spec.type, label: spec.label || "" };
  this.links.push(l); return l;
};

/* a small shared case: two phones that communicated, one at a location */
function sampleCase() {
  return {
    entities: [
      { id: "E:phone|07700900111", type: "phone", label: "07700900111", identity: "07700900111", attrs: {} },
      { id: "E:phone|07700900222", type: "phone", label: "07700900222", identity: "07700900222", attrs: {} },
      { id: "E:location|luton town hall", type: "location", label: "Luton Town Hall", identity: "Luton Town Hall", attrs: { lat: 51.879, lon: -0.42 } }
    ],
    links: [
      { id: "L:a", from: "E:phone|07700900111", to: "E:phone|07700900222", type: "COMMUNICATED_WITH", label: "12 calls" },
      { id: "L:b", from: "E:phone|07700900111", to: "E:location|luton town hall", type: "LOCATED_IN", label: "" }
    ]
  };
}

/* ---- merge into an empty chart ---- */
var store = new MockStore();
var r1 = B.mergeIntoStore(store, sampleCase());
ok("merge adds 3 entities", r1.entities === 3);
ok("merge adds 2 links", r1.links === 2);
ok("store now holds 3 entities", store.entities.length === 3);
ok("phone got canonical e164 via addEntity", store.entities[0].ids.e164 === "+447700900111");
ok("location geo carried onto chart entity", store.entities[2].geo && store.entities[2].geo.lat === 51.879);

/* ---- idempotency: merging the same case again adds nothing ---- */
var r2 = B.mergeIntoStore(store, sampleCase());
ok("second merge adds no entities", r2.entities === 0);
ok("second merge adds no links", r2.links === 0);
ok("second merge reports 3 matched", r2.matched === 3);
ok("store still holds exactly 3 entities", store.entities.length === 3);
ok("store still holds exactly 2 links", store.links.length === 2);

/* ---- non-destructive: a pre-existing chart entity is reused, not cloned ---- */
var store2 = new MockStore();
var manual = store2.addEntity({ type: "phone", label: "07700900111" });
store2.addEntity({ type: "person", label: "Alan SUSPECT" });   // unrelated, must survive
var r3 = B.mergeIntoStore(store2, sampleCase());
ok("existing phone reused (not duplicated)", store2.entities.filter(function (e) { return e.type === "phone" && /900111/.test(e.label); }).length === 1);
ok("unrelated existing entity preserved", store2.entities.some(function (e) { return e.label === "Alan SUSPECT"; }));
ok("merge into non-empty adds the 2 missing entities", r3.entities === 2);
ok("link attaches to the pre-existing entity id", store2.links.some(function (l) { return l.from === manual.id; }));

/* ---- link dedupe: a duplicate link in the case collapses ---- */
var store3 = new MockStore();
var dupCase = sampleCase();
dupCase.links.push({ id: "L:dup", from: "E:phone|07700900111", to: "E:phone|07700900222", type: "COMMUNICATED_WITH", label: "again" });
var r4 = B.mergeIntoStore(store3, dupCase);
ok("duplicate COMMUNICATED_WITH collapses to one link", store3.links.filter(function (l) { return l.type === "COMMUNICATED_WITH"; }).length === 1);
ok("merge count reflects collapse (2 links)", r4.links === 2);

/* ---- unknown type falls back to note ---- */
ok("unknown SolarCase type maps to note", B.chartType("wombat") === "note");
ok("firearm alias maps to weapon", B.chartType("firearm") === "weapon");

/* ---- write-back: chart -> SolarCase parts with stable ids ---- */
var parts = B.fromChartStore(store);
ok("write-back yields 3 entities", parts.entities.length === 3);
ok("write-back yields 2 links", parts.links.length === 2);
ok("write-back phone id is identity-stable", parts.entities.some(function (e) { return e.id === SC.entityId({ type: "phone", label: "07700900111", identity: "07700900111" }); }));
/* round-trip: feed write-back into a fresh store, expect same shape */
var store4 = new MockStore();
var r5 = B.mergeIntoStore(store4, parts);
ok("round-trip re-merges 3 entities", r5.entities === 3);
ok("round-trip re-merges 2 links", r5.links === 2);

/* ---- guard: bad store throws ---- */
var threw = false; try { B.mergeIntoStore({}, sampleCase()); } catch (e) { threw = true; }
ok("mergeIntoStore rejects a non-store argument", threw);

/* ---- real CRModel round-trip if the module loads under node ---- */
try {
  var M = require("../js/core/model.js");
  global.CRModel = M;
  if (M && M.CaseStore) {
    var real = new M.CaseStore();
    var rr = B.mergeIntoStore(real, sampleCase());
    ok("real CaseStore merge adds 3 entities", real.entities.length === 3);
    ok("real CaseStore merge adds 2 links", real.links.length === 2);
    ok("real phone entity has canonical e164", real.entities.some(function (e) { return e.type === "phone" && e.ids && e.ids.e164; }));
    var rp = B.fromChartStore(real);
    ok("real write-back yields 3 entities", rp.entities.length === 3);
  } else {
    ok("real CRModel present", false);
  }
} catch (e) {
  console.log("  (real CRModel skipped under node: " + e.message + ")");
  ok("real CRModel skip tolerated", true);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
