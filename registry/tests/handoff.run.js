/* handoff.run.js — Phase 4: contract + SOLAR-case handoff (dedup by Master). */
"use strict";
var M=require("../core/ir-model.js"), SI=require("../core/si-model.js"), T=require("../core/threat-areas.js"), H=require("../core/handoff.js");
var pass=0,fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
function eq(a,b,m){ ok(a===b, m+"  (got "+JSON.stringify(a)+", want "+JSON.stringify(b)+")"); }

function fullIR(status){
  var ir=M.createIR({title:"T",dateOfCollection:"02/02/2026",submittedBySelf:true,threatArea:T.list()[0],
    confidence:"High",protectiveMarking:"OFFICIAL",handling:{code:"P"},provenance:{text:"p",sourceEval:"1",intelEval:"A"}});
  M.addItem(ir,{sourceType:"PND Log",text:"x",sourceEval:"1",intelEval:"A"});
  if(status) ir.status=status;
  return ir;
}
function john(ir){ return SI.addEntity(ir,{type:"person",label:"John SMITH",role:"POI_ACTIVE",pndShare:"Yes",attrs:{forename:"John",surname:"Smith",dob:"01/01/1990"}}); }

console.log("Phase 4 tests\n");

/* ---- toHandoff: contract, provenance excluded ---- */
var ir=fullIR(); john(ir);
var hd=H.toHandoff(ir);
eq(hd.schema,"system.ir.v1","handoff schema is system.ir.v1");
eq(hd.report.urn,ir.urn,"handoff carries report urn");
ok(!("provenance" in hd),"handoff EXCLUDES provenance (never charted)");
ok(!("provenance" in hd.report),"report block has no provenance");
eq(hd.items[0].grade,"[1AP]","handoff item carries grade");
eq(hd.entities.length,1,"handoff carries SI entities");

/* ---- toSolarCase: SOLAR-openable shape ---- */
var sc=H.toSolarCase(ir);
eq(sc.app,"chart_room","solar case app=chart_room");
eq(sc.version,1,"solar case version 1");
ok(Array.isArray(sc.entities)&&Array.isArray(sc.links)&&Array.isArray(sc.events),"solar case has entities/links/events arrays");
eq(sc.entities[0].type,"person","person maps to SOLAR person");
ok(sc.entities[0].id && sc.entities[0].label==="John SMITH","solar entity has id+label");

/* ---- type mapping ---- */
var ir2=fullIR();
SI.addEntity(ir2,{type:"firearm",label:"Glock 17"});
SI.addEntity(ir2,{type:"official_document",label:"Passport 123"});
SI.addEntity(ir2,{type:"communication",label:"07700900000",attrs:{number:"07700900000"}});
SI.addEntity(ir2,{type:"cyber",label:"1.2.3.4",attrs:{address:"1.2.3.4"}});
SI.addEntity(ir2,{type:"location",label:"1 High St",attrs:{postcode:"M1 1AA",premiseNumber:"1"}});
var types=H.toSolarCase(ir2).entities.map(function(e){return e.type;}).sort();
ok(types.indexOf("weapon")!==-1,"firearm->weapon");
ok(types.indexOf("document")!==-1,"official_document->document");
ok(types.indexOf("phone")!==-1,"communication->phone");
ok(types.indexOf("ip")!==-1,"cyber->ip");
ok(types.indexOf("address")!==-1,"location->address");

/* ---- link mapping + dedup by master across reports ---- */
var irA=fullIR("AUTHORISED"), irB=fullIR("AUTHORISED");
var jA=john(irA); var veh=SI.addEntity(irA,{type:"vehicle",label:"DE20 NTM",attrs:{vrm:"DE20 NTM"}});
SI.addLink(irA,{from:jA.id,to:veh.id,type:"ASSOCIATE"});
var jB=john(irB); SI.addEntity(irB,{type:"organisation",label:"ACME LTD",role:"FEATURES_IN",attrs:{companyNumber:"12345678"}});
var combined=H.toSolarCase([irA,irB]);
eq(combined.entities.length,3,"John (x2) dedupes to ONE master; +vehicle +org = 3 nodes");
var personNode=combined.entities.filter(function(e){return e.type==="person";})[0];
ok((personNode.attrs.registrySourceUrns||"").indexOf(irA.urn)!==-1 && (personNode.attrs.registrySourceUrns||"").indexOf(irB.urn)!==-1,"master node lists both source URNs");
eq(combined.links.length,1,"one link after remap");
eq(combined.links[0].type,"ASSOCIATE_OF","ASSOCIATE -> ASSOCIATE_OF");
ok(combined.links[0].from===personNode.id,"link remapped onto master id");

/* ---- onlyAuthorised filter ---- */
var draft=fullIR("DRAFT"); john(draft);
eq(H.toSolarCase([draft],{onlyAuthorised:true}).entities.length,0,"onlyAuthorised excludes drafts");
eq(H.toSolarCase([draft]).entities.length,1,"without filter, draft included");

/* ---- self-loop guard: two members of same master linked -> skipped ---- */
var irS=fullIR(); var p1=john(irS); var p2=john(irS); // both same master (name+dob)
SI.addLink(irS,{from:p1.id,to:p2.id,type:"ASSOCIATE"});
var scS=H.toSolarCase(irS);
eq(scS.entities.length,1,"two identical persons collapse to one master");
eq(scS.links.length,0,"self-loop after collapse is skipped");

/* re-export id collision guard (per-export nonce) */
var c1=H.toSolarCase(ir), c2=H.toSolarCase(ir);
ok(/^RX/.test(c1.entities[0].id),"entity id carries export nonce");
ok(c1.entities[0].id!==c2.entities[0].id,"separate exports produce different ids (no collision if charted together)");

/* node handling derived from its own contributing report(s) */
var irC=fullIR(); irC.handling.code="C"; irC.handling.instructions="x"; irC.handling.actionCode="A1"; irC.handling.sanitisationCode="S1"; john(irC);
eq(H.toSolarCase(irC).entities[0].provenance.handling,"C","node handling derived from member IR (C)");

/* TYPE_MAP covers every Registry entity type (guard silent note-downgrade) */
var SImod=require("../core/si-model.js");
Object.keys(SImod.ENTITY_TYPES).forEach(function(k){ ok(!!H.TYPE_MAP[k],"TYPE_MAP covers entity type "+k); });

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
