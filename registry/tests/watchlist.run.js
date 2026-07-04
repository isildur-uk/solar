/* watchlist.run.js — Silent Hit List: flag a nominal, scan reports for matches. */
"use strict";
var D=require("../core/demo-seed.js"), W=require("../core/watchlist.js");
var pass=0,fail=0; function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
var ds=D.buildDemoDataset();
// clear any state
W.list().slice().forEach(function(w){ W.remove(w.id); });
ok(W.list().length===0,"watchlist starts empty");
// find a person with identifiers that recurs
var target=null;
ds.forEach(function(r){ (r.structuredIntelligence.entities||[]).forEach(function(e){ if(e.type==="person" && e.attrs.pnc && !target) target=e; }); });
ok(!!target,"found an identified person to watch");
var w=W.add(target,{addedBy:"tester",note:"OCG principal"});
ok(w.id && w.sigs.length>=1,"watch entry has signatures ("+w.sigs.length+")");
ok(W.list().length===1,"entry added");
ok(W.has(target),"has() detects the watched entity");
var scan=W.scan(ds);
ok(scan.length===1,"scan returns one watch result");
ok(scan[0].hitCount>=1,"watched nominal produces silent hits ("+scan[0].hitCount+")");
ok(scan[0].hits.every(function(h){return h.urn && h.matchedBy.length;}),"each hit cites report + match rule");
W.remove(w.id); ok(W.list().length===0,"remove works");
console.log("\n"+pass+" passed, "+fail+" failed"); if(fail) process.exit(1);
