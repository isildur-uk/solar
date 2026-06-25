/* sqlite.run.js — Phase 5: SqliteRepository against REAL SQLite (node:sqlite),
 * proving repo-interface parity + JSON round-trip + parameterised (injection-safe) SQL. */
"use strict";
var SQL = require("../core/repository-sqlite.js");
var REPO = require("../core/repository.js");
var TAURI = require("../core/sqlite-driver-tauri.js");
var M = require("../core/ir-model.js"), SI = require("../core/si-model.js"), T = require("../core/threat-areas.js");
var pass=0, fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
function eq(a,b,m){ ok(a===b, m+"  (got "+JSON.stringify(a)+", want "+JSON.stringify(b)+")"); }

var sqlite;
try { sqlite = require("node:sqlite"); } catch(e) {}
if(!sqlite){ console.log("node:sqlite unavailable — skipping (cannot verify SQLite here)"); process.exit(0); }
var DatabaseSync = sqlite.DatabaseSync;

function makeDriver(){
  var db = new DatabaseSync(":memory:");
  return {
    _db: db,
    run: function(sql, params){
      if(params && params.length){ var st=db.prepare(sql); st.run.apply(st, params); }
      else { db.exec(sql); }
      return Promise.resolve();
    },
    all: function(sql, params){ var st=db.prepare(sql); return Promise.resolve(st.all.apply(st, params||[])); }
  };
}
function buildIR(title){
  var ir=M.createIR({title:title,dateOfCollection:"02/02/2026",submittedBySelf:true,threatArea:T.list()[0],
    confidence:"High",protectiveMarking:"OFFICIAL-SENSITIVE",handling:{code:"P"},
    provenance:{text:"Derived from PND log enquiry.",sourceEval:"1",intelEval:"A"}});
  M.addItem(ir,{sourceType:"Experian",text:"Address corroborated.",sourceEval:"2",intelEval:"B"});
  SI.addEntity(ir,{type:"person",label:"John SMITH",role:"POI_ACTIVE",attrs:{forename:"John",surname:"Smith",dob:"01/01/1990"}});
  return ir;
}

console.log("Phase 5 tests (SQLite)\n");

var driver = makeDriver();
var repo = SQL.createSqliteRepository(driver);
var a = buildIR("Alpha"), b = buildIR("Bravo");

Promise.resolve()
  .then(function(){ return repo.save(a); })
  .then(function(saved){ ok(saved && saved.urn===a.urn, "save returns the saved IR"); })
  .then(function(){ return repo.save(b); })
  .then(function(){ return repo.get(a.urn); })
  .then(function(got){
    ok(got && got.urn===a.urn, "get returns saved IR");
    ok(got && got.structuredIntelligence && got.structuredIntelligence.entities.length===1, "JSON round-trip preserves structured intelligence");
    ok(got && got.provenance && got.provenance.sourceEval==="1", "JSON round-trip preserves graded provenance");
  })
  .then(function(){ return repo.get("IR-DOES-NOT-EXIST"); })
  .then(function(miss){ eq(miss, null, "get of missing urn -> null"); })
  .then(function(){ return repo.list(); })
  .then(function(all){ eq(all.length, 2, "list returns both IRs"); })
  .then(function(){ return repo.search("Experian"); })
  .then(function(hits){ eq(hits.length, 2, "search matches item sourceType (parity with other repos)"); })
  .then(function(){ return repo.search("PND log enquiry"); })
  .then(function(hits){ eq(hits.length, 2, "search matches provenance text"); })
  .then(function(){ return repo.search("zzz-no-match"); })
  .then(function(hits){ eq(hits.length, 0, "search miss -> none"); })
  .then(function(){ return repo.save(M.touch(Object.assign(a, {title:"Alpha v2"}))); })
  .then(function(){ return repo.get(a.urn); })
  .then(function(got){ eq(got.title, "Alpha v2", "save upserts (update existing urn, no duplicate)"); })
  .then(function(){ return repo.list(); })
  .then(function(all){ eq(all.length, 2, "still two rows after upsert"); })
  .then(function(){ return repo.remove(a.urn); })
  .then(function(had){ eq(had, true, "remove existing -> true"); })
  .then(function(){ return repo.remove(a.urn); })
  .then(function(had){ eq(had, false, "remove again -> false"); })
  .then(function(){ return repo.list(); })
  .then(function(all){ eq(all.length, 1, "one row after remove"); })
  /* injection safety: malicious strings are stored as data, not executed */
  .then(function(){
    var evil = M.createIR({title:"'); DROP TABLE intelligence_reports;--", dateOfCollection:"02/02/2026",
      submittedBySelf:true, threatArea:T.list()[0], confidence:"Low", protectiveMarking:"OFFICIAL",
      handling:{code:"P"}, provenance:{text:"x",sourceEval:"1",intelEval:"A"}});
    evil.urn = "IR-EVIL-\"; DROP TABLE intelligence_reports; --";
    return repo.save(evil).then(function(){ return repo.get(evil.urn); });
  })
  .then(function(got){ ok(got && /DROP TABLE/.test(got.title), "malicious title stored verbatim (parameterised, not executed)"); })
  .then(function(){ return repo.list(); })
  .then(function(all){ ok(all.length===2, "table intact after injection attempt (still queryable)"); })
  /* tauri driver placeholder translation */
  .then(function(){ eq(TAURI._toPositional("INSERT (?,?,?)"), "INSERT ($1,$2,$3)", "tauri driver translates ? -> $n"); })
  /* parity: same contract as InMemory */
  .then(function(){
    var mem = new REPO.InMemoryRepository();
    return mem.save(buildIR("Mem")).then(function(){ return mem.search("Experian"); })
      .then(function(h){ ok(h.length===1, "InMemory parity: same search semantics"); });
  })
  .then(function(){ return repo.clear(); })
  .then(function(){ return repo.list(); })
  .then(function(all){ eq(all.length, 0, "clear() empties the SQLite store"); })
  .then(function(){ return repo.save(buildIR("After clear")); })
  .then(function(){ return repo.list(); })
  .then(function(all){ eq(all.length, 1, "store usable again after clear()"); })
  .then(finish)
  .catch(function(e){ fail++; console.error("  FAIL (async):", e && e.stack || e); finish(); });

function finish(){ console.log("\n"+pass+" passed, "+fail+" failed"); process.exit(fail?1:0); }
