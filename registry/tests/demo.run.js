/* demo.run.js — validates the demo dataset (24 ops x 10 reports) + cross-over. */
"use strict";
var D=require("../core/demo-seed.js"), V=require("../core/ir-validate.js"), SI=require("../core/si-model.js"),
    MX=require("../core/matching.js"), OPS=require("../core/operations.js"), H=require("../core/handoff.js");
var pass=0,fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
function eq(a,b,m){ ok(a===b, m+"  (got "+JSON.stringify(a)+", want "+JSON.stringify(b)+")"); }

console.log("Demo dataset tests\n");
var ds=D.buildDemoDataset();
eq(ds.length, 480, "480 reports (24 ops x 20)");

var byOp={}; ds.forEach(function(ir){ byOp[ir.operation]=(byOp[ir.operation]||0)+1; });
eq(Object.keys(byOp).length, 24, "covers all 24 operations");
ok(Object.keys(byOp).every(function(k){ return byOp[k]===20; }), "exactly 20 reports per operation");
var urns=ds.map(function(ir){return ir.urn;}); eq(new Set(urns).size, 480, "all 480 URNs are unique (no collisions)");
ok(urns.every(function(u){return /^IR\d{6}$/.test(u);}), "every URN is IR + 6 digits");
ok(ds.every(function(ir){return ir.protectiveMarking==="OFFICIAL-SENSITIVE";}), "every demo report is OFFICIAL-SENSITIVE");
ok(ds.every(function(ir){return !/^OP /.test(ir.title);}), "titles do not start with the operation prefix");
ok(ds.filter(function(ir){return / – .* – /.test(ir.title);}).length===0, "no title uses the old 'Name – activity' triple pattern");

var badIR=0,badSI=0,badTA=0,firstIR=null,firstSI=null;
ds.forEach(function(ir){
  if(ir.threatArea!==OPS.threatOf(ir.operation)) badTA++;
  var r=V.validateIR(ir); if(!r.valid){ badIR++; if(!firstIR) firstIR=ir.operation+": "+JSON.stringify(r.errors); }
  var s=SI.validateSI(ir); if(!s.valid){ badSI++; if(!firstSI) firstSI=ir.operation+": "+JSON.stringify(s.errors); }
});
eq(badTA,0,"every report's threatArea matches its operation");
eq(badIR,0,"all 480 reports pass validateIR"+(firstIR?" — "+firstIR:""));
eq(badSI,0,"all 480 reports pass validateSI"+(firstSI?" — "+firstSI:""));

var byStatus=ds.reduce(function(a,r){a[r.status]=(a[r.status]||0)+1;return a;},{});
eq(byStatus.AUTHORISED, 480, "all reports AUTHORISED for demo");

var titlesByOp={}; ds.forEach(function(ir){ (titlesByOp[ir.operation]=titlesByOp[ir.operation]||{})[ir.title]=1; });
ok(Object.keys(titlesByOp).every(function(op){ return Object.keys(titlesByOp[op]).length>=8; }), "each op has >=8 distinct report titles");

var dates={}; ds.forEach(function(ir){ dates[ir.dateOfCollection]=1; });
ok(Object.keys(dates).length>=40, "reports span many distinct dates ("+Object.keys(dates).length+")");

var allEnts=[], entOp={}; ds.forEach(function(ir){ (ir.structuredIntelligence.entities||[]).forEach(function(e){ allEnts.push(e); entOp[e.id]=ir.operation; }); });
var masters=MX.buildMasterIndex(allEnts);
function opsOf(m){ var o={}; m.members.forEach(function(id){ if(entOp[id]) o[entOp[id]]=true; }); return Object.keys(o); }
var maxSpan=masters.reduce(function(mx,m){ return Math.max(mx,opsOf(m).length); },0);
ok(maxSpan>=4, "a bridge entity spans 4+ operations (max span "+maxSpan+")");

var phone=masters.filter(function(m){ return m.label==="07700900123"; })[0];
ok(!!phone, "bridge phone master exists");
ok(phone && opsOf(phone).length>=4, "bridge phone spans 4+ ops ("+(phone?opsOf(phone).length:0)+")");
ok(phone && phone.matchedBy.indexOf("number")!==-1, "bridge phone matched by number");

var intra=masters.filter(function(m){ return m.type==="person" && m.memberCount>=3 && opsOf(m).length===1; });
ok(intra.length>0, "recurring principal forms an intra-op subject timeline ("+intra.length+" cases)");

var authd=ds.filter(function(r){ return r.status==="AUTHORISED"; });
var totalEnts=authd.reduce(function(n,r){ return n+r.structuredIntelligence.entities.length; },0);
var sc=H.toSolarCase(authd,{onlyAuthorised:true});
ok(sc.entities.length<totalEnts, "SOLAR case dedups ("+sc.entities.length+" nodes < "+totalEnts+" entities)");
ok(sc.entities.filter(function(e){ return (e.attrs.registryOperations||"").indexOf(",")!==-1; }).length>0, "SOLAR nodes carry multiple operations");

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
