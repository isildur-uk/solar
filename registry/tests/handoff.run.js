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


/* ---- toSpine: shared-spine parts for SolarCase.merge (P4b: Database -> spine) ---- */
var spA=fullIR("AUTHORISED"), spB=fullIR("AUTHORISED");
var spJA=john(spA); var spVeh=SI.addEntity(spA,{type:"vehicle",label:"DE20 NTM",attrs:{vrm:"DE20 NTM"}});
SI.addLink(spA,{from:spJA.id,to:spVeh.id,type:"ASSOCIATE"});
john(spB); SI.addEntity(spB,{type:"organisation",label:"ACME LTD",attrs:{companyNumber:"12345678"}});
var sp=H.toSpine([spA,spB]);
ok(Array.isArray(sp.entities)&&Array.isArray(sp.links),"toSpine returns entities+links arrays");
eq(sp.entities.length,3,"toSpine dedupes John (x2) across reports -> 3 spine entities");
ok(sp.entities.every(function(e){return /^E:/.test(e.id);}),"spine entity ids use SolarCase E: scheme");
ok(sp.entities.every(function(e){return e.source==="registry";}),"spine entities tagged source=registry");
ok(!sp.entities.some(function(e){return "provenance" in e;}),"spine entities carry NO provenance");
var spPerson=sp.entities.filter(function(e){return e.type==="person";})[0];
eq(spPerson.id,"E:person|john smith","person spine id follows type|identity scheme");
eq(sp.links.length,1,"one spine link after dedup");
eq(sp.links[0].type,"ASSOCIATE_OF","ASSOCIATE -> ASSOCIATE_OF on spine link");
ok(/^L:/.test(sp.links[0].id),"spine link id uses L: scheme");
eq(sp.links[0].from,spPerson.id,"spine link remapped onto person spine id");

/* spine types stay generic (location, NOT address) so they dedupe with Analyse */
var spT=fullIR();
SI.addEntity(spT,{type:"location",label:"1 High St",attrs:{postcode:"M1 1AA"}});
SI.addEntity(spT,{type:"firearm",label:"Glock 17"});
SI.addEntity(spT,{type:"communication",label:"07700900000",attrs:{number:"07700900000"}});
SI.addEntity(spT,{type:"cyber",label:"1.2.3.4"});
var spTypes=H.toSpine(spT).entities.map(function(e){return e.type;});
ok(spTypes.indexOf("location")!==-1,"spine keeps location generic (not address)");
ok(spTypes.indexOf("weapon")!==-1,"firearm->weapon on spine");
ok(spTypes.indexOf("phone")!==-1,"communication->phone on spine");
ok(spTypes.indexOf("ip")!==-1,"cyber->ip on spine");

/* ids are stable across calls (no per-export nonce) so merges are idempotent */
var spI1=H.toSpine(spA), spI2=H.toSpine(spA);
eq(spI1.entities[0].id,spI2.entities[0].id,"spine ids stable across calls (idempotent merge)");

/* onlyAuthorised filter honoured */
var spDraft=fullIR("DRAFT"); john(spDraft);
eq(H.toSpine([spDraft],{onlyAuthorised:true}).entities.length,0,"toSpine onlyAuthorised excludes drafts");

/* SPINE_TYPE covers every Registry entity type (guard silent note-downgrade) */
Object.keys(SImod.ENTITY_TYPES).forEach(function(k){ ok(!!H.SPINE_TYPE[k],"SPINE_TYPE covers entity type "+k); });
console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
