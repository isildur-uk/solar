/* si.run.js — Phase 2 tests: structured intelligence + Master/Lower matching. */
"use strict";
var SI = require("../core/si-model.js");
var MX = require("../core/matching.js");
var pass=0, fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
function eq(a,b,m){ ok(a===b, m+"  (got "+JSON.stringify(a)+", want "+JSON.stringify(b)+")"); }
function irShell(){ return { structuredIntelligence:{entities:[],links:[]} }; }

console.log("Phase 2 tests\n");

/* ---- validateSI ---- */
var ir = irShell();
var p1 = SI.addEntity(ir, { type:"person", label:"John SMITH" });           // no role
var r = SI.validateSI(ir);
ok(!r.valid && r.errors.some(function(e){return /role/i.test(e.message);}), "person without role rejected");

ir = irShell();
SI.addEntity(ir, { type:"person", label:"John SMITH", role:"POI_ACTIVE" });
ok(SI.validateSI(ir).valid, "person with role validates");

ir = irShell();
var a = SI.addEntity(ir, { type:"person", label:"A", role:"FEATURES_IN" });
SI.addLink(ir, { from:a.id, to:"ENT-nope", type:"ASSOCIATE" });
ok(!SI.validateSI(ir).valid, "link to unknown entity rejected");

ir = irShell();
var al1 = SI.addEntity(ir, { type:"person", label:"Alias One", role:"FEATURES_IN", isAlias:true });
var al2 = SI.addEntity(ir, { type:"person", label:"Alias Two", role:"FEATURES_IN", isAlias:true });
SI.addLink(ir, { from:al1.id, to:al2.id, type:"ALIAS" });
ok(!SI.validateSI(ir).valid, "alias linked to alias by identity rejected");

ir = irShell();
var alias = SI.addEntity(ir, { type:"person", label:"Mask", role:"FEATURES_IN", isAlias:true });
var t1 = SI.addEntity(ir, { type:"person", label:"True One", role:"POI_ACTIVE" });
var t2 = SI.addEntity(ir, { type:"person", label:"True Two", role:"POI_ACTIVE" });
SI.addLink(ir, { from:alias.id, to:t1.id, type:"ALIAS" });
SI.addLink(ir, { from:alias.id, to:t2.id, type:"USES_IDENTITY_OF" });
ok(!SI.validateSI(ir).valid, "alias with two identity links rejected");

/* ---- matching: helpers ---- */
function P(over){ return SI.createEntity(Object.assign({type:"person",label:"John SMITH",role:"POI_ACTIVE",attrs:{forename:"John",surname:"Smith",dob:"01/01/1990"}}, over)); }
function find(masters,type,minCount){ return masters.filter(function(m){return m.type===type && m.memberCount>=minCount;}); }

// same name+dob -> one master of 2
var ms = MX.buildMasterIndex([ P(), P() ]);
var two = find(ms,"person",2);
eq(two.length, 1, "same name+dob -> single person master");
ok(two[0].matchedBy.indexOf("name+dob")!==-1, "matchedBy includes name+dob");

// same name different dob -> two masters
ms = MX.buildMasterIndex([ P(), P({attrs:{forename:"John",surname:"Smith",dob:"02/02/1992"}}) ]);
eq(ms.filter(function(m){return m.type==="person";}).length, 2, "different dob -> two person masters");

// cro+dob merges despite different names
ms = MX.buildMasterIndex([
  P({attrs:{forename:"John",surname:"Smith",dob:"01/01/1990",cro:"153410/89E"}}),
  P({label:"Jonathan SMITHE",attrs:{forename:"Jonathan",surname:"Smithe",dob:"01/01/1990",cro:"153410/89E"}})
]);
ok(find(ms,"person",2).length===1 && find(ms,"person",2)[0].matchedBy.indexOf("cro+dob")!==-1, "cro+dob merges different names");

// pnc merges
ms = MX.buildMasterIndex([
  P({attrs:{forename:"John",surname:"Smith",dob:"01/01/1990",pnc:"95/468019L"}}),
  P({label:"J S",attrs:{forename:"Jon",surname:"Smyth",dob:"09/09/1991",pnc:"95/468019L"}})
]);
ok(find(ms,"person",2).length===1, "pnc merges");

// vehicle vrm case/space-insensitive
ms = MX.buildMasterIndex([
  SI.createEntity({type:"vehicle",label:"DE20 NTM",attrs:{vrm:"DE20 NTM"}}),
  SI.createEntity({type:"vehicle",label:"de20ntm",attrs:{vrm:"de20ntm"}})
]);
eq(find(ms,"vehicle",2).length, 1, "vehicle VRM merges ignoring case/space");

// organisation companyNumber merges despite name variants
ms = MX.buildMasterIndex([
  SI.createEntity({type:"organisation",label:"ACME LTD",role:"FEATURES_IN",attrs:{companyNumber:"12345678"}}),
  SI.createEntity({type:"organisation",label:"ACME LIMITED",role:"FEATURES_IN",attrs:{companyNumber:"12345678"}})
]);
ok(find(ms,"organisation",2).length===1, "organisation merges by company number");

// different types same label do NOT merge
ms = MX.buildMasterIndex([
  SI.createEntity({type:"person",label:"ACME",role:"FEATURES_IN"}),
  SI.createEntity({type:"organisation",label:"ACME",role:"FEATURES_IN"})
]);
eq(ms.length, 2, "different types with same label stay separate");

// singleton -> one master of 1
ms = MX.buildMasterIndex([ P() ]);
eq(ms.length, 1, "singleton yields a master"); eq(ms[0].memberCount, 1, "singleton master has one member");

// evaluateMatch
ok(MX.evaluateMatch(P(), P()).indexOf("name+dob")!==-1, "evaluateMatch returns name+dob");
eq(MX.evaluateMatch(P(), SI.createEntity({type:"vehicle",label:"x",attrs:{vrm:"x"}})).length, 0, "evaluateMatch across types empty");

// M1: persons sharing a name but no DoB/identifiers must NOT merge
ms = MX.buildMasterIndex([ SI.createEntity({type:"person",label:"John SMITH",role:"FEATURES_IN"}), SI.createEntity({type:"person",label:"John SMITH",role:"FEATURES_IN"}) ]);
eq(ms.filter(function(m){return m.type==="person";}).length, 2, "name-only persons do NOT over-merge (M1)");
// org name-only still merges (legitimate Atlas org-name matching)
ms = MX.buildMasterIndex([ SI.createEntity({type:"organisation",label:"ACME LTD",role:"FEATURES_IN"}), SI.createEntity({type:"organisation",label:"ACME LTD",role:"FEATURES_IN"}) ]);
eq(ms.filter(function(m){return m.type==="organisation";}).length, 1, "org name-only still merges");

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
