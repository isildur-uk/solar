/* run.js — Registry core tests (Node).  node registry/tests/run.js */
"use strict";
var M = require("../core/ir-model.js");
var V = require("../core/ir-validate.js");
var G = require("../core/grading.js");
var R = require("../core/repository.js");
var N = require("../core/normalise.js");
var T = require("../core/threat-areas.js");

var pass = 0, fail = 0;
function ok(c, m){ if(c){pass++;} else {fail++; console.error("  FAIL: " + m);} }
function eq(a, b, m){ ok(a === b, m + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

function validIR(over){
  over = over || {};
  var ir = M.createIR({
    title: "Subject of interest — associate network",
    dateOfCollection: "02/02/2026",
    submittedBySelf: true,
    threatArea: T.list()[0],
    confidence: "High",
    protectiveMarking: "OFFICIAL-SENSITIVE",
    handling: { code: "P", instructions: "" },
    provenance: { text: "Derived from PND log and credit-reference enquiries.", sourceEval: "1", intelEval: "A" }
  });
  M.addItem(ir, { sourceType:"PND Log", text:"Subject linked to vehicle.", sourceEval:"1", intelEval:"A" });
  M.addItem(ir, { sourceType:"Experian", text:"Address corroborated.", sourceEval:"2", intelEval:"B" });
  if (over.mutate) over.mutate(ir);
  return ir;
}

console.log("Registry core tests\n");

ok(G.valid("[1BP]") === true, "grading reuses cm-standards: [1BP] valid");
ok(G.valid("[9ZZ]") === false, "grading rejects bad code");
eq(G.code("1","A","P"), "[1AP]", "grading code builds [1AP]");

var ir = validIR();
ok(/^IR\d{6}$/.test(ir.urn), "urn is IR + 6 digits");
eq(ir.items.length, 2, "two items added");
eq(ir.status, M.STATUS.DRAFT, "default status DRAFT");

var r = V.validateIR(validIR());
ok(r.valid, "baseline IR validates" + (r.valid?"":": "+JSON.stringify(r.errors)));

/* C-only rule */
ok(!V.validateIR(validIR({mutate:function(x){x.handling.code="P";x.handling.actionCode="A2";}})).valid, "action code under P rejected");
var rC0 = V.validateIR(validIR({mutate:function(x){x.handling.code="C";}}));
ok(!rC0.valid &&
   rC0.errors.some(function(e){return e.field==="handling.actionCode";}) &&
   rC0.errors.some(function(e){return e.field==="handling.sanitisationCode";}) &&
   rC0.errors.some(function(e){return e.field==="handling.instructions";}),
   "C requires instructions + action + sanitisation");
ok(V.validateIR(validIR({mutate:function(x){x.handling.code="C";x.handling.instructions="No action without consent.";x.handling.actionCode="A1";x.handling.sanitisationCode="S2";}})).valid, "C with all conditions validates");

/* required fields & domains */
ok(!V.validateIR(validIR({mutate:function(x){x.title="";}})).valid, "missing title rejected");
ok(!V.validateIR(validIR({mutate:function(x){x.dateOfCollection="2026-02-02";}})).valid, "ISO date rejected");
ok(!V.validateIR(validIR({mutate:function(x){x.confidence="Maybe";}})).valid, "bad confidence rejected");
ok(!V.validateIR(validIR({mutate:function(x){x.protectiveMarking="TOP SECRET";}})).valid, "bad marking rejected");
ok(!V.validateIR(validIR({mutate:function(x){x.threatArea="Nonsense";}})).valid, "unknown threat area rejected");
ok(!V.validateIR(validIR({mutate:function(x){x.items[0].sourceEval="4";}})).valid, "bad source eval rejected");
ok(!V.validateIR(validIR({mutate:function(x){x.items[0].intelEval="Z";}})).valid, "bad intel eval rejected");

/* provenance is graded (the new capability) */
var rpT = V.validateIR(validIR({mutate:function(x){x.provenance.text="";}}));
ok(!rpT.valid && rpT.errors.some(function(e){return e.field==="provenance.text";}), "missing provenance text rejected");
var rpS = V.validateIR(validIR({mutate:function(x){x.provenance.sourceEval="";}}));
ok(!rpS.valid && rpS.errors.some(function(e){return e.field==="provenance.sourceEval";}), "missing provenance source eval rejected");
var rpI = V.validateIR(validIR({mutate:function(x){x.provenance.intelEval="9";}}));
ok(!rpI.valid && rpI.errors.some(function(e){return e.field==="provenance.intelEval";}), "bad provenance intel eval rejected");
eq(V.itemGrade(validIR(), validIR().provenance), "[1AP]", "provenance grade computes [1AP]");
eq(V.itemGrade(validIR({mutate:function(x){x.handling.code="C";x.handling.instructions="z";x.handling.actionCode="A1";x.handling.sanitisationCode="S1";}}), {sourceEval:"2",intelEval:"B"}), "[2BC]", "grade under C -> [2BC]");

/* backward-compat: legacy string provenance coerces */
var legacy = M.coerceProvenance("old style string");
eq(legacy.text, "old style string", "string provenance coerces to object");
eq(legacy.sourceEval, "", "coerced provenance has empty eval");

/* provenance never charted */
eq(M.chartableItems(validIR()).length, 2, "chartable = items only (provenance excluded)");

/* itemGrade for items */
eq(V.itemGrade(validIR(), {sourceEval:"1",intelEval:"A"}), "[1AP]", "item grade [1AP] under P");

/* normalise */
var nn = N.normaliseIR(validIR({mutate:function(x){x.title="  spaced   title  ";}}));
eq(nn.title, "spaced title", "normalise tidies title");
ok(nn.provenance && typeof nn.provenance === "object" && nn.provenance.sourceEval === "1", "normalise keeps provenance grading");
ok(nn.items[0].detected && Array.isArray(nn.items[0].detected.status), "normalise attaches detected tags");

/* repository (in-memory) */
var repo = new R.InMemoryRepository();
var a = validIR(), b = validIR();
Promise.resolve()
  .then(function(){ return repo.save(a); })
  .then(function(){ return repo.save(b); })
  .then(function(){ return repo.get(a.urn); })
  .then(function(got){ ok(got && got.urn === a.urn, "repo get returns saved IR"); })
  .then(function(){ return repo.list(); })
  .then(function(all){ eq(all.length, 2, "repo lists two IRs"); })
  .then(function(){ return repo.search("Experian"); })
  .then(function(hits){ eq(hits.length, 2, "repo search matches item sourceType"); })
  .then(function(){ return repo.search("credit-reference"); })
  .then(function(hits){ eq(hits.length, 2, "repo search matches provenance text"); })
  .then(function(){ return repo.remove(a.urn); })
  .then(function(had){ ok(had === true, "repo remove reports deletion"); })
  .then(function(){ return repo.list(); })
  .then(function(all){ eq(all.length, 1, "repo has one IR after remove"); })
  .then(function(){
    var rr = new R.ResilientRepository();
    rr.idb = { save:function(){return Promise.reject(new Error("no idb"));}, get:function(){return Promise.reject(new Error("x"));},
               list:function(){return Promise.reject(new Error("x"));}, search:function(){return Promise.reject(new Error("x"));},
               remove:function(){return Promise.reject(new Error("x"));} };
    return rr.save(validIR()).then(function(){ return rr.list(); }).then(function(all){
      ok(all.length===1 && rr.fellBack===true, "ResilientRepository falls back to in-memory when IndexedDB fails");
    });
  })
  .then(function(){
    var rp = R.createRepository();
    return rp.save(validIR()).then(function(){ return rp.list(); }).then(function(a){ ok(a.length===1,"repo has 1 before clear"); return rp.clear(); })
      .then(function(){ return rp.list(); }).then(function(a){ eq(a.length,0,"repo.clear() empties the store"); });
  })
  .then(finish)
  .catch(function(e){ fail++; console.error("  FAIL (async):", e && e.message); finish(); });

function finish(){ console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail?1:0); }
