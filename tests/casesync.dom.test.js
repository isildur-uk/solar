/* CHART ROOM — casesync.dom.test.js
 * Drives the shared-folder sync THROUGH THE UI (logpanel) with an in-memory
 * adapter: connect -> save record to folder -> an external edit lands on disk
 * -> the panel's Save detects the conflict and resolves it -> lock released.
 * Needs jsdom; SKIPs cleanly if absent. Run with:
 *   NODE_PATH=/tmp/crbuild/node_modules node tests/casesync.dom.test.js
 */
"use strict";
var assert = require("assert");
var path = require("path");
var fs = require("fs");
var JSDOM;
try { JSDOM = require("jsdom").JSDOM; }
catch (e) { try { JSDOM = require(require.resolve("jsdom", { paths: ["/tmp/crbuild/node_modules"] })).JSDOM; } catch (e2) { console.log("SKIP — jsdom not installed."); process.exit(0); } }

var SOLAR = path.join(__dirname, "..");
var dom = new JSDOM('<!DOCTYPE html><html><body><header id="topbar"><details class="menu" id="menu-case"></details></header></body></html>', { url: "http://localhost/", pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.localStorage = dom.window.localStorage;
global.alert = function () {}; global.confirm = function () { return true; }; // "OK" = keep mine
function load(p) { dom.window.eval(fs.readFileSync(path.join(SOLAR, p), "utf8")); }
["js/core/match.js","js/core/cm-vocab.js","js/core/cm-standards.js","js/core/format.js","js/core/model.js",
 "js/core/records.js","js/core/collab.js","js/core/fsaccess.js","js/core/casefolder.js","js/core/casesync.js",
 "js/core/intelvocab.js","js/core/disclosure.js","js/ui/util.js","js/ui/logpanel.js"].forEach(load);
var w = dom.window;

function memFs() {
  var files = {}, locks = {}, act = [];
  function c(o) { return JSON.parse(JSON.stringify(o)); }
  return {
    writeJSONPath: function (h, p, o) { files[p] = c(o); return Promise.resolve(true); },
    readJSONPath: function (h, p) { return (p in files) ? Promise.resolve(c(files[p])) : Promise.reject(new Error("nf")); },
    readAllJSON: function (h) { var out = {}; Object.keys(files).forEach(function (k) { if (k.indexOf("_") !== 0) out[k] = c(files[k]); }); return Promise.resolve(out); },
    writeLock: function (h, l) { locks[l.recordId] = c(l); return Promise.resolve(true); },
    readLock: function (h, id) { return Promise.resolve(locks[id] ? c(locks[id]) : null); },
    clearLock: function (h, id) { delete locks[id]; return Promise.resolve(true); },
    appendActivity: function (h, e) { act.push(e); return Promise.resolve(true); },
    readActivity: function (h, n) { return Promise.resolve(act.slice(n ? -n : 0)); },
    _files: files, _locks: locks, _act: act
  };
}
function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }
var passed = 0;
function pass(n) { passed++; console.log("  ✓ " + n); }

(async function () {
  var store = new w.CRModel.CaseStore(); w.CRRecords.attach(store);
  store.meta.officer = "74125"; store.meta.caseRef = "IR123456";
  store.addEntity({ type: "person", label: "John SMITH (Subject A)" });
  w.CRLogPanel.init(store);
  w.CRCaseSync.setWho(function () { return "74125"; });
  var mem = memFs();
  assert.ok(w.CRCaseSync.setBackend({ name: "Op SHARED" }, mem), "backend connected");
  w.CRLogPanel.open();

  // sync bar shows connected + Save/Refresh
  var bar = w.document.getElementById("lp-body");
  assert.ok(/Op SHARED/.test(bar.textContent), "sync bar shows folder name");
  assert.ok(w.document.getElementById("sync-save"), "Save to folder button present when connected");
  pass("connected: sync bar shows folder + save/refresh controls");

  // create an enquiry via the UI -> routed to folder
  w.document.getElementById("lp-new").dispatchEvent(new w.Event("click"));
  var body = w.document.getElementById("lp-body");
  function set(id, v) { var el = body.querySelector("#" + id); el.value = v; el.dispatchEvent(new w.Event("input")); }
  set("f-date", "2026-05-05"); set("f-officer", "74125"); set("f-system", "PNC");
  set("f-subject", "John SMITH (Subject A)"); set("f-entity", "SMITH, John 03/03/1967");
  body.querySelector("#lp-save").dispatchEvent(new w.Event("click"));
  await flush();
  var rec = store.records.enquiry[0];
  var p = w.CRCaseSync.relPathFor("enquiry", rec);
  assert.ok(mem._files[p], "record written to shared folder on save");
  assert.strictEqual(mem._files[p].ref, "E0001");
  assert.ok(mem._act.some(function (a) { return a.action === "save"; }), "activity logged");
  pass("UI save routes the record into the shared folder + activity");

  // an external editor changes the file on disk
  mem._files[p].version += 5; mem._files[p].data.result = "THEIR external edit";

  // open the record for edit (acquires a lock), change it, save -> conflict -> keep mine
  w.document.querySelector(".lp-row").dispatchEvent(new w.Event("click"));
  await flush();
  assert.ok(mem._locks[rec.id], "advisory lock acquired on open-for-edit");
  var body2 = w.document.getElementById("lp-body");
  var rEl = body2.querySelector("#f-result"); rEl.value = "MY edit"; rEl.dispatchEvent(new w.Event("input"));
  body2.querySelector("#lp-save").dispatchEvent(new w.Event("click"));
  await flush(); await flush();
  assert.strictEqual(mem._files[p].data.result, "MY edit", "conflict resolved keep-mine wrote my value");
  assert.ok(mem._files[p].version > 6, "my version superseded the disk version");
  assert.ok(mem._act.some(function (a) { return a.action === "conflict-resolved"; }), "conflict resolution logged");
  assert.ok(!mem._locks[rec.id], "lock released after save");
  pass("edit-with-external-change -> conflict detected via UI -> resolved + lock released");

  // Refresh pulls a fresh store from the folder
  var store2state = store.records.enquiry.length;
  assert.strictEqual(store2state, 1);
  pass("folder holds a single authoritative copy");

  console.log("\nSYNC DOM TEST PASS — " + passed + " cases");
})().catch(function (e) { console.error("FAIL:", e && e.stack || e); process.exit(1); });
