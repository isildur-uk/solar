/* CHART ROOM — casesync.test.js
 * Headless test of the shared-folder orchestration (casesync.js) using an
 * in-memory adapter with the CRFs shape. Exercises the conflict-detection and
 * advisory-lock paths end to end. Run: node tests/casesync.test.js
 */
"use strict";
var assert = require("assert");
var path = require("path");
function core(n) { return require(path.join(__dirname, "..", "js", "core", n)); }
var Model = core("model.js"), R = core("records.js"), C = core("collab.js");
core("casefolder.js");
var Sync = core("casesync.js");

function memFs() {
  var files = {}, locks = {}, activity = [];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  return {
    writeJSONPath: function (h, p, o) { files[p] = clone(o); return Promise.resolve(true); },
    readJSONPath: function (h, p) { return (p in files) ? Promise.resolve(clone(files[p])) : Promise.reject(new Error("nf")); },
    readAllJSON: function (h) { var out = {}; Object.keys(files).forEach(function (k) { if (k.indexOf("_") !== 0) out[k] = clone(files[k]); }); return Promise.resolve(out); },
    writeLock: function (h, l) { locks[l.recordId] = clone(l); return Promise.resolve(true); },
    readLock: function (h, id) { return Promise.resolve(locks[id] ? clone(locks[id]) : null); },
    clearLock: function (h, id) { delete locks[id]; return Promise.resolve(true); },
    appendActivity: function (h, e) { activity.push(e); return Promise.resolve(true); },
    readActivity: function (h, n) { return Promise.resolve(activity.slice(n ? -n : 0)); },
    _files: files, _locks: locks, _activity: activity
  };
}

var passed = 0;
function ok(name, fn) { return Promise.resolve().then(fn).then(function () { passed++; console.log("  ✓ " + name); }); }
function freshStore() { var s = new Model.CaseStore(); R.attach(s); s.meta.caseRef = "IR1"; return s; }

var fsA = memFs();

Promise.resolve()
.then(function () { return ok("connect + saveAll writes per-record files + activity", function () {
  Sync.setWho(function () { return "74125"; });
  var s = freshStore();
  s.addEntity({ type: "person", label: "John SMITH" });
  R.add(s, "enquiry", { data: { system: "PNC", subject: "John SMITH" } }, "74125");
  assert.ok(Sync.setBackend({ name: "shared" }, fsA));
  assert.ok(Sync.isConnected());
  return Sync.saveAll(s).then(function (n) {
    assert.ok(n >= 2);
    assert.ok(Object.keys(fsA._files).some(function (k) { return k.indexOf("enquiries/") === 0; }));
    assert.strictEqual(fsA._activity[fsA._activity.length - 1].action, "save-all");
  });
}); })
.then(function () { return ok("loadAll into a fresh store reconstructs records + marks base versions", function () {
  var s2 = freshStore();
  Sync.setBackend({ name: "shared" }, fsA);
  return Sync.loadAll(s2).then(function () {
    assert.strictEqual(s2.records.enquiry.length, 1);
    assert.strictEqual(s2.entities.length, 1);
    assert.strictEqual(s2.records.enquiry[0]._baseVersion, s2.records.enquiry[0].version);
  });
}); })
.then(function () { return ok("saveRecord clean write + strips transient _baseVersion from canonical file", function () {
  var s = freshStore();
  var rec = R.add(s, "action", { data: { description: "do X" } }, "74125");
  Sync.setBackend({ name: "shared" }, fsA);
  rec._baseVersion = rec.version;
  return Sync.saveRecord(s, "action", rec).then(function (res) {
    assert.strictEqual(res.ok, true);
    var ak = Object.keys(fsA._files).filter(function (k) { return k.indexOf("actions/") === 0; })[0];
    assert.ok(ak, "action file written");
    assert.ok(!("_baseVersion" in fsA._files[ak]), "transient _baseVersion stripped from canonical file");
  });
}); })
.then(function () { return ok("saveRecord DETECTS a conflict when disk changed since base", function () {
  var s = freshStore();
  var rec = R.add(s, "enquiry", { data: { system: "PNC" } }, "74125");
  Sync.setBackend({ name: "shared" }, fsA);
  rec._baseVersion = rec.version;
  return Sync.saveRecord(s, "enquiry", rec).then(function () {
    var p = Sync.relPathFor("enquiry", rec);
    var disk = JSON.parse(JSON.stringify(fsA._files[p]));
    disk.version = (disk.version || 1) + 5; disk.data.result = "THEIR edit";
    fsA._files[p] = disk;
    C.touch(rec, "74125", "MY edit");
    return Sync.saveRecord(s, "enquiry", rec).then(function (res) {
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.conflict, true);
      assert.strictEqual(res.diskRec.data.result, "THEIR edit");
    });
  });
}); })
.then(function () { return ok("resolveConflict 'theirs' adopts disk; 'mine' supersedes", function () {
  var s = freshStore();
  var rec = R.add(s, "enquiry", { data: { system: "ANPR" } }, "74125");
  Sync.setBackend({ name: "shared" }, fsA);
  rec._baseVersion = rec.version;
  return Sync.saveRecord(s, "enquiry", rec).then(function () {
    var p = Sync.relPathFor("enquiry", rec);
    var disk = JSON.parse(JSON.stringify(fsA._files[p])); disk.version += 3; disk.data.result = "THEIRS"; fsA._files[p] = disk;
    return Sync.resolveConflict(s, "enquiry", rec, "theirs");
  }).then(function (r1) {
    assert.ok(r1.adopted);
    assert.strictEqual(s.records.enquiry.find(function (x) { return x.id === rec.id; }).data.result, "THEIRS");
    var rec2 = s.records.enquiry.find(function (x) { return x.id === rec.id; });
    var p = Sync.relPathFor("enquiry", rec2);
    var disk = JSON.parse(JSON.stringify(fsA._files[p])); disk.version += 9; fsA._files[p] = disk;
    rec2.data.result = "MINE"; rec2._baseVersion = 0;
    return Sync.resolveConflict(s, "enquiry", rec2, "mine").then(function (r2) {
      assert.ok(r2.forced);
      assert.strictEqual(fsA._files[p].data.result, "MINE");
      assert.ok(fsA._files[p].version > disk.version);
    });
  });
}); })
.then(function () { return ok("advisory lock: acquire, block other, release", function () {
  var s = freshStore();
  var rec = R.add(s, "disclosure", {}, "74125");
  Sync.setBackend({ name: "shared" }, fsA);
  Sync.setWho(function () { return "74125"; });
  return Sync.acquireLock(rec).then(function (r1) {
    assert.strictEqual(r1.ok, true);
    Sync.setWho(function () { return "80331"; });
    return Sync.acquireLock(rec).then(function (r2) {
      assert.strictEqual(r2.ok, false);
      assert.strictEqual(r2.heldBy, "74125");
      Sync.setWho(function () { return "74125"; });
      return Sync.releaseLock(rec).then(function () {
        Sync.setWho(function () { return "80331"; });
        return Sync.acquireLock(rec).then(function (r3) { assert.strictEqual(r3.ok, true); });
      });
    });
  });
}); })
.then(function () { console.log("\nALL PASS — " + passed + " cases"); })
.catch(function (e) { console.error("FAIL:", e && e.stack || e); process.exit(1); });
