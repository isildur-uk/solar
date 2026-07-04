/* entity-index.run.js — Master/Lower cross-report resolution + comparison. */
"use strict";
var D=require("../core/demo-seed.js"), EI=require("../core/entity-index.js");
var pass=0,fail=0; function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
var ds=D.buildDemoDataset();
var idx=EI.buildEntityIndex(ds);
ok(idx.entityCount>0,"lower entities collected ("+idx.entityCount+")");
ok(idx.masterCount>0 && idx.masterCount<idx.entityCount,"masters resolve fewer than lower ("+idx.masterCount+" < "+idx.entityCount+")");
var multi=idx.masters.filter(function(m){return m.memberCount>1;});
ok(multi.length>0,"some masters aggregate multiple lower entities ("+multi.length+")");
ok(multi.every(function(m){return m.matchedBy && m.matchedBy.length;}),"multi-member masters cite a match rule");
ok(idx.masters.every(function(m){return m.memberEntities.length===m.memberCount;}),"member context resolved for every master");
ok(idx.masters.every(function(m){return m.memberEntities.every(function(me){return me.urn;});}),"every member cites its report");
var persons=idx.masters.filter(function(m){return m.type==="person";});
ok(persons.length>0,"person masters present ("+persons.length+")");
console.log("\n"+pass+" passed, "+fail+" failed"); if(fail) process.exit(1);
