/* CHART ROOM — logpanel.dom.test.js
 * Headless DOM test for the Enquiry/Disclosure log panel: drives the real
 * click-to-save path (open -> new -> fill -> live preview -> save -> list ->
 * status workflow -> localStorage round-trip). Needs jsdom; if it is not
 * installed the test SKIPS cleanly (exit 0) so the dependency-free suite still
 * runs. To run fully:  npm i jsdom  (or point NODE_PATH at a jsdom install).
 */
"use strict";
var assert = require("assert");
var path = require("path");
var fs = require("fs");

var JSDOM;
try { JSDOM = require("jsdom").JSDOM; }
catch (e) {
  try { JSDOM = require(require.resolve("jsdom", { paths: ["/tmp/crbuild/node_modules"] })).JSDOM; }
  catch (e2) { console.log("SKIP — jsdom not installed (run: npm i jsdom). Logic covered by disclosure.test.js + collab.test.js."); process.exit(0); }
}

var SOLAR = path.join(__dirname, "..");
var dom = new JSDOM('<!DOCTYPE html><html><body><header id="topbar"><details class="menu" id="menu-case"></details></header></body></html>', { url: "http://localhost/", pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.localStorage = dom.window.localStorage;
global.alert = function () {}; global.confirm = function () { return true; };
function load(p) { dom.window.eval(fs.readFileSync(path.join(SOLAR, p), "utf8")); }
["js/core/match.js","js/core/cm-vocab.js","js/core/cm-standards.js","js/core/format.js","js/core/model.js",
 "js/core/records.js","js/core/collab.js","js/core/fsaccess.js","js/core/casefolder.js",
 "js/core/intelvocab.js","js/core/disclosure.js","js/ui/util.js","js/ui/logpanel.js"].forEach(load);

var w = dom.window, passed = 0;
function ok(n, f) { f(); passed++; console.log("  ✓ " + n); }

var store = new w.CRModel.CaseStore(); w.CRRecords.attach(store);
store.meta.officer = "74125"; store.meta.caseRef = "IR123456";
store.addEntity({ type: "person", label: "John SMITH (Subject A)" });

w.CRLogPanel.init(store); w.CRLogPanel.open();
ok("panel opens; button injected; tabs render", function () {
  assert.ok(w.document.getElementById("btn-logs"));
  assert.ok(w.document.querySelector(".modal-veil.open"));
  assert.ok(/Enquiry Log/.test(w.document.getElementById("lp-tabs").textContent));
});

w.document.getElementById("lp-new").dispatchEvent(new w.Event("click"));
var body = w.document.getElementById("lp-body");
function set(id, v) { var el = body.querySelector("#" + id); el.value = v; el.dispatchEvent(new w.Event("input")); }
set("f-date", "2026-05-05"); set("f-officer", "74125"); set("f-system", "PNC");
set("f-subject", "John SMITH (Subject A)"); set("f-entity", "SMITH, John 03/03/1967");
ok("live preview auto-writes sentence + file name", function () {
  var p = body.querySelector("#lp-prev-sentence").textContent;
  assert.ok(/PNC check completed on 05\/05\/2026 by officer 74125/.test(p));
  assert.ok(/any association to criminality/.test(p));
  assert.strictEqual(body.querySelector("#lp-prev-file").textContent, "20260505 - PNC - IR123456");
});

body.querySelector("#lp-save").dispatchEvent(new w.Event("click"));
ok("save creates E0001 with owner/status/sentence; row listed; workflow offered", function () {
  assert.strictEqual(store.records.enquiry.length, 1);
  var r = store.records.enquiry[0];
  assert.strictEqual(r.ref, "E0001"); assert.strictEqual(r.owner, "74125"); assert.strictEqual(r.status, "Requested");
  assert.ok(/PNC check completed/.test(r.data.sentence));
  assert.ok(/E0001/.test(w.document.getElementById("lp-body").textContent));
  var sel = w.document.querySelector(".lp-status");
  assert.ok(Array.prototype.map.call(sel.options, function (o) { return o.value; }).indexOf("Awaiting result") !== -1);
});
ok("persists through localStorage (records included)", function () {
  assert.ok(store.saveLocal());
  assert.strictEqual(JSON.parse(global.localStorage.getItem("chart_room_case_v1")).records.enquiry.length, 1);
});


function clickTab(key){ var b=w.document.querySelector('#lp-tabs button[data-tab="'+key+'"]'); b.dispatchEvent(new w.Event("click")); }
function newForm(){ w.document.getElementById("lp-new").dispatchEvent(new w.Event("click")); return w.document.getElementById("lp-body"); }
function fld(bd,id,v){ var el=bd.querySelector("#"+id); el.value=v; el.dispatchEvent(new w.Event("input")); }
function firstStatus(){ return w.document.querySelector(".lp-status"); }
function setStatus(val){ var sel=firstStatus(); sel.value=val; sel.dispatchEvent(new w.Event("change")); }

ok("comms-app: create CDA0001 then Drafted -> Sent -> Returned", function(){
  clickTab("commsapp");
  var bd=newForm();
  fld(bd,"f-date","2026-05-09"); fld(bd,"f-officer","74125");
  fld(bd,"f-subject","John SMITH (Subject A)"); fld(bd,"f-entity","07700900123");
  fld(bd,"f-purpose","Necessary to identify contact; proportionate, 30 day window."); fld(bd,"f-period","01/04-01/05");
  // preview present for comms-app
  assert.ok(/Comms data application by officer 74125/.test(bd.querySelector("#lp-prev-sentence").textContent));
  bd.querySelector("#lp-save").dispatchEvent(new w.Event("click"));
  assert.strictEqual(store.records.commsapp.length, 1);
  var r=store.records.commsapp[0];
  assert.strictEqual(r.ref,"CDA0001"); assert.strictEqual(r.status,"Drafted"); assert.strictEqual(r.owner,"74125");
  setStatus("Sent"); assert.strictEqual(store.records.commsapp[0].status,"Sent");
  setStatus("Returned"); assert.strictEqual(store.records.commsapp[0].status,"Returned");
});

ok("action: create AC000001 (Open), no auto-preview pane", function(){
  clickTab("action");
  var bd=newForm();
  assert.ok(!bd.querySelector("#lp-prev-sentence"), "no preview pane for actions");
  fld(bd,"f-date","2026-05-10"); fld(bd,"f-officer","80331");
  fld(bd,"f-description","Action ACME directors via Companies House.");
  bd.querySelector("#lp-save").dispatchEvent(new w.Event("click"));
  assert.strictEqual(store.records.action.length,1);
  assert.strictEqual(store.records.action[0].ref,"AC000001");
  assert.strictEqual(store.records.action[0].status,"Open");
});

ok("decision: create L001 (Logged) with rationale", function(){
  clickTab("decision");
  var bd=newForm();
  fld(bd,"f-officer","74125"); fld(bd,"f-entryType","Decision");
  fld(bd,"f-entry","Open enquiries on Subject A only at this stage.");
  fld(bd,"f-rationale","Proportionate; Subject B not yet evidenced.");
  bd.querySelector("#lp-save").dispatchEvent(new w.Event("click"));
  assert.strictEqual(store.records.decision.length,1);
  var r=store.records.decision[0];
  assert.strictEqual(r.ref,"L001"); assert.strictEqual(r.status,"Logged");
  assert.strictEqual(r.data.entryType,"Decision");
});

ok("all five tabs render", function(){
  ["enquiry","disclosure","commsapp","action","decision"].forEach(function(k){
    assert.ok(w.document.querySelector('#lp-tabs button[data-tab="'+k+'"]'), k+" tab present");
  });
});


ok("coverage matrix: RAG reflects enquiry log + click-empty-core prefills enquiry", function(){
  // store already has subject "John SMITH (Subject A)" (Person) and one PNC enquiry on it from earlier cases.
  // add a vehicle entity with zero coverage to show a red row.
  store.addEntity({ type: "vehicle", label: "AB12 CDE" });
  clickTab("coverage");
  var body = w.document.getElementById("lp-body");
  assert.ok(/Selector/.test(body.textContent), "coverage header renders");
  // person row has 1 core check done (PNC) -> amber "1/5"; vehicle row 0/5
  assert.ok(/1\/5/.test(body.textContent), "person core RAG shows partial from PNC enquiry");
  assert.ok(/0\/5/.test(body.textContent), "vehicle core RAG shows none");
  // click an empty core cell -> should switch to enquiry new-form prefilled
  var cell = body.querySelector(".cov-cell");
  assert.ok(cell, "an empty core cell is clickable");
  var ent = cell.getAttribute("data-ent"), sys = cell.getAttribute("data-sys");
  cell.dispatchEvent(new w.Event("click"));
  var f = w.document.getElementById("lp-body");
  assert.ok(f.querySelector("#f-system"), "switched to enquiry new form");
  assert.strictEqual(f.querySelector("#f-system").value, sys, "system prefilled from cell");
  assert.strictEqual(f.querySelector("#f-subject").value, ent, "subject prefilled from cell");
});


ok("profile: create SP0001 (Draft) -> In review -> Published; generate buttons present + guarded", function(){
  clickTab("profile");
  var bd=newForm();
  // generate panel renders
  assert.ok(bd.querySelector("#prof-short") && bd.querySelector("#prof-long") && bd.querySelector("#prof-html"), "generate buttons present");
  fld(bd,"f-officer","74125");
  fld(bd,"f-subject","John SMITH (Subject A)");
  fld(bd,"f-summary","Lead subject; OCG principal.");
  // clicking generate without CRProfiles loaded shows the guard message, no throw
  bd.querySelector("#prof-short").dispatchEvent(new w.Event("click"));
  assert.ok(/unavailable|Pick a subject/.test(bd.querySelector("#prof-msg").textContent), "generate guarded cleanly");
  bd.querySelector("#lp-save").dispatchEvent(new w.Event("click"));
  assert.strictEqual(store.records.profile.length,1);
  var r=store.records.profile[0];
  assert.strictEqual(r.ref,"SP0001"); assert.strictEqual(r.status,"Draft"); assert.strictEqual(r.data.subject,"John SMITH (Subject A)");
  // lifecycle via engine (reviewer = assignee)
  assert.ok(w.CRCollab.assign(r,"74125","80331").action==="assign");
  assert.ok(w.CRCollab.transition(r,"In review","74125").ok);
  assert.ok(w.CRCollab.transition(r,"Published","80331").ok);
  assert.strictEqual(r.status,"Published"); assert.strictEqual(r.assignee,"80331");
});

console.log("\nDOM TEST PASS — " + passed + " cases");
