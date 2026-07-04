/* si-extract.run.js — the ALIGNMENT adapter: SOLAR chart engine -> registry SI.
 * Proves the database can generate structured intelligence with the SAME engine
 * and quality as the chart, and that the result is a valid registry SI graph. */
"use strict";
var CRExtract=require("../../js/core/extract.js");
var X=require("../core/si-extract.js");
var SI=require("../core/si-model.js");
var pass=0,fail=0; function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }

var body="June BAILEY DOB 14/02/1972 of 32 Jellicoe Road, Luton BE2 4AJ uses phone 07828771234. "
 +"She owns MERCEDES GLA VRM TR68LLA. BAILEY is an associate of David ROBERTS DOB 17/07/1973. "
 +"NAILS BY BAILEY uses SANTANDER account 00989816 sort code 07-33-71. "
 +"QUINN purchased 10kg of cocaine for GBP 15,000 cash.";
var res=CRExtract.extract(body,{dateFormat:"DMY"});
ok(res.entities.length>=6,"engine extracts entities ("+res.entities.length+")");

var si=X.fromExtraction(res,{actor:"engine"});
ok(si.entities.length>=6,"adapter produces SI entities ("+si.entities.length+")");
ok(si.links.length>=3,"adapter produces SI links ("+si.links.length+")");
ok(si.entities.every(function(e){return SI.ENTITY_TYPES[e.type];}),"every SI entity type is a valid registry type");

var persons=si.entities.filter(function(e){return e.type==="person";});
ok(persons.length>=2,"persons extracted ("+persons.length+")");
ok(persons.every(function(e){return SI.ROLES[e.role];}),"persons carry a valid role (default Features In)");
ok(persons.every(function(e){return !e.attrs.dob || /^\d{2}\/\d{2}\/\d{4}$/.test(e.attrs.dob);}),"person DOB normalised to DD/MM/YYYY");

var veh=si.entities.filter(function(e){return e.type==="vehicle";});
ok(veh.length>=1 && veh[0].attrs.vrm,"vehicle carries a VRM attr");
var acct=si.entities.filter(function(e){return e.type==="account";});
ok(acct.length>=1,"account entity extracted");
ok(si.entities.some(function(e){return e.type==="drug";}),"drug entity extracted + mapped");
ok(si.entities.some(function(e){return e.type==="cash";}),"cash entity extracted + mapped");

var ids={}; si.entities.forEach(function(e){ids[e.id]=1;});
ok(si.links.every(function(l){return ids[l.from]&&ids[l.to]&&l.from!==l.to;}),"links reference distinct real entities (no self/dangling)");
ok(si.links.every(function(l){return SI.LINK_TYPES[l.type];}),"every link type is a valid registry type");

var ir={items:[{text:body,sourceEval:"1",intelEval:"A",sourceType:"Intelligence report"}],handling:{code:"P"},
  structuredIntelligence:si,provenance:{text:"assessment",sourceEval:"1",intelEval:"B"}};
ok(SI.validateSI(ir).valid,"generated SI passes validateSI");
ok(si.entities.some(function(e){return e.attrs._auto;}),"engine entities flagged _auto (unconfirmed until analyst confirms)");

console.log("\n"+pass+" passed, "+fail+" failed");
if(fail) process.exit(1);
