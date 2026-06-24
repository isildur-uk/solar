/* CHART ROOM — collab.test.js
 * Headless tests for slices 1+2: per-record store + folder serialisation
 * (records.js, casefolder.js) and the collaboration spine (collab.js).
 * Run: node tests/collab.test.js   (exit 0 = all pass)
 */
"use strict";
var assert = require("assert");
var path = require("path");
function core(n) { return require(path.join(__dirname, "..", "js", "core", n)); }

var Model = core("model.js");
var R = core("records.js");
var C = core("collab.js");
var CF = core("casefolder.js");

var passed = 0;
function ok(name, fn) { fn(); passed++; console.log("  ✓ " + name); }

console.log("records + ref series");
ok("ref series increments and zero-pads per type", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var e1 = R.add(s, "enquiry", {}, "74125");
  var e2 = R.add(s, "enquiry", {}, "74125");
  var d1 = R.add(s, "disclosure", {}, "74125");
  assert.strictEqual(e1.ref, "E0001");
  assert.strictEqual(e2.ref, "E0002");
  assert.strictEqual(d1.ref, "DC00001");
  assert.strictEqual(s.meta.counters.enquiry, 2);
});
ok("makeRecord defaults: status=initial, version=1, owner=who, audit", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var a = R.add(s, "action", {}, "80331");
  assert.strictEqual(a.status, "Open");
  assert.strictEqual(a.version, 1);
  assert.strictEqual(a.owner, "80331");
  assert.strictEqual(a.audit[0].action, "created");
  assert.strictEqual(a.ref, "AC000001");
});

console.log("status workflow");
ok("legal transition bumps version, stamps audit, returns activity", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var ca = R.add(s, "commsapp", {}, "74125");
  var r = C.transition(ca, "Sent", "74125");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ca.status, "Sent");
  assert.strictEqual(ca.version, 2);
  assert.strictEqual(r.activity.action, "status");
  assert.ok(/Drafted/.test(ca.audit[ca.audit.length - 1].detail));
});
ok("illegal transition rejected, no mutation", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var ca = R.add(s, "commsapp", {}, "74125"); // Drafted
  var r = C.transition(ca, "Closed", "74125"); // not allowed from Drafted
  assert.strictEqual(r.ok, false);
  assert.strictEqual(ca.status, "Drafted");
  assert.strictEqual(ca.version, 1);
});
ok("full comms-app lifecycle Drafted->Sent->Returned->Closed", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var ca = R.add(s, "commsapp", {}, "1");
  assert.ok(C.transition(ca, "Sent", "1").ok);
  assert.ok(C.transition(ca, "Returned", "1").ok);
  assert.ok(C.transition(ca, "Closed", "1").ok);
  assert.strictEqual(ca.status, "Closed");
});

console.log("assignment + ownership");
ok("assign and setOwner stamp audit + activity", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var p = R.add(s, "profile", {}, "74125");
  var act = C.assign(p, "74125", "80331");
  assert.strictEqual(p.assignee, "80331");
  assert.strictEqual(act.action, "assign");
  C.setOwner(p, "74125", "90001");
  assert.strictEqual(p.owner, "90001");
  assert.strictEqual(p.version, 3);
});

console.log("advisory locks");
ok("canAcquire: free, re-entrant, blocked-by-other, steal-when-stale", function () {
  var lock = C.makeLock("rec1", "74125");
  assert.strictEqual(C.canAcquire(null, "80331"), true);             // free
  assert.strictEqual(C.canAcquire(lock, "74125"), true);            // re-entrant
  assert.strictEqual(C.canAcquire(lock, "80331"), false);           // held by other, fresh
  var stale = { recordId: "rec1", who: "74125", ts: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
  assert.strictEqual(C.canAcquire(stale, "80331"), true);           // stale -> stealable
  assert.strictEqual(C.isExpired(stale), true);
});

console.log("conflict detection + diff");
ok("detectConflict flags disk version != base", function () {
  assert.strictEqual(C.detectConflict(2, { version: 2 }).conflict, false);
  assert.strictEqual(C.detectConflict(2, { version: 3 }).conflict, true);
  assert.strictEqual(C.detectConflict(2, null).conflict, false); // new on disk
});
ok("diff reports status + data field changes", function () {
  var a = { status: "Open", owner: "1", assignee: "", data: { result: "x", note: "same" } };
  var b = { status: "Complete", owner: "1", assignee: "2", data: { result: "y", note: "same" } };
  var d = C.diff(a, b);
  var fields = d.map(function (x) { return x.field; }).sort();
  assert.deepStrictEqual(fields, ["assignee", "data.result", "status"]);
});

console.log("filters");
ok("myWork and openItems", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var a = R.add(s, "action", { assignee: "80331" }, "74125");
  var b = R.add(s, "enquiry", {}, "74125");
  C.transition(b, "Cancelled", "74125"); // terminal
  var mine = C.myWork(s, "80331");
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].id, a.id);
  R.add(s, "decision", {}, "74125"); // Logged = terminal, must NOT count as open
  var open = C.openItems(s);
  assert.strictEqual(open.length, 1); // only the action; enquiry Cancelled + decision Logged excluded
  assert.strictEqual(C.isTerminal("Closed"), true);
  assert.strictEqual(C.isTerminal("Logged"), true);
});

console.log("single-JSON round trip (attach wrapper)");
ok("toJSON/fromJSON carry records + counters", function () {
  var s = new Model.CaseStore(); R.attach(s);
  s.addEntity({ type: "person", label: "John SMITH" });
  R.add(s, "enquiry", { data: { system: "PNC" } }, "74125");
  R.add(s, "enquiry", {}, "74125");
  var json = JSON.parse(JSON.stringify(s.toJSON()));
  assert.strictEqual(json.records.enquiry.length, 2);
  assert.strictEqual(json.meta.counters.enquiry, 2);

  var s2 = new Model.CaseStore(); R.attach(s2);
  s2.fromJSON(json);
  assert.strictEqual(s2.records.enquiry.length, 2);
  assert.strictEqual(s2.records.enquiry[0].data.system, "PNC");
  assert.strictEqual(s2.entities.length, 1);
  // counter continues, no ref collision
  var e3 = R.add(s2, "enquiry", {}, "74125");
  assert.strictEqual(e3.ref, "E0003");
});

console.log("case-folder serialisation round trip");
ok("toFileMap -> fromFileMap -> applyToStore preserves graph + records", function () {
  var s = new Model.CaseStore(); R.attach(s);
  var p = s.addEntity({ type: "person", label: "Jane DOE" });
  var ph = s.addEntity({ type: "phone", label: "07700 900123" });
  s.addLink({ from: p.id, to: ph.id, type: "USES" });
  var d = R.add(s, "disclosure", { data: { docType: "PNC" } }, "74125");
  R.add(s, "action", { assignee: "80331" }, "74125");

  var map = CF.toFileMap(s);
  assert.ok(map["case.json"]);
  assert.ok(Object.keys(map).some(function (k) { return k.indexOf("entities/") === 0; }));
  var discFiles = Object.keys(map).filter(function (k) { return k.indexOf("disclosures/") === 0; });
  assert.strictEqual(discFiles.length, 1);
  assert.ok(discFiles[0].indexOf(d.id) !== -1, "record file named by immutable id, not ref");

  // simulate disk round-trip via JSON
  var onDisk = JSON.parse(JSON.stringify(map));
  var parsed = CF.fromFileMap(onDisk);
  var s2 = new Model.CaseStore(); R.attach(s2);
  CF.applyToStore(s2, parsed);
  assert.strictEqual(s2.entities.length, 2);
  assert.strictEqual(s2.links.length, 1);
  assert.strictEqual(s2.records.disclosure.length, 1);
  assert.strictEqual(s2.records.disclosure[0].data.docType, "PNC");
  assert.strictEqual(s2.records.action[0].assignee, "80331");
});

ok("filenames are filesystem-safe", function () {
  assert.strictEqual(CF.safe("E0001"), "E0001");
  assert.ok(/^a_b_c_d_/.test(CF.safe("a/b c:d")), "sanitised name keeps readable stem + hash");
  assert.strictEqual(CF.safe("a/b c:d"), CF.safe("a/b c:d")); // deterministic
  assert.ok(CF.safe("").length > 0);
});


console.log("review fixes: concurrency + injective filenames");
ok("two analysts adding new records -> SAME display ref but DISTINCT files (no clobber)", function () {
  var A = new Model.CaseStore(); R.attach(A);
  var B = new Model.CaseStore(); R.attach(B);
  var ra = R.add(A, "enquiry", {}, "74125");
  var rb = R.add(B, "enquiry", {}, "80331");
  assert.strictEqual(ra.ref, rb.ref);            // display refs DO collide offline (documented)
  var fa = Object.keys(CF.toFileMap(A)).filter(function (k) { return k.indexOf("enquiries/") === 0; })[0];
  var fb = Object.keys(CF.toFileMap(B)).filter(function (k) { return k.indexOf("enquiries/") === 0; })[0];
  assert.notStrictEqual(fa, fb);                 // but FILES (by id) do not -> no silent overwrite
});
ok("safe() is injective: previously-colliding inputs now differ", function () {
  assert.strictEqual(CF.safe("E0001"), "E0001");          // clean input unchanged (readable)
  assert.notStrictEqual(CF.safe("a/b"), CF.safe("a_b"));  // these collided before the fix
});

console.log("\nALL PASS — " + passed + " assertions/cases");
