/* wf.run.js — Phase 3 tests: workflow lifecycle, PND review, governed deletion. */
"use strict";
var M  = require("../core/ir-model.js");
var SI = require("../core/si-model.js");
var T  = require("../core/threat-areas.js");
var W  = require("../core/workflow.js");
var D  = require("../core/deletion.js");
var pass=0, fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
function eq(a,b,m){ ok(a===b, m+"  (got "+JSON.stringify(a)+", want "+JSON.stringify(b)+")"); }

function fullIR(){
  var ir=M.createIR({title:"T",dateOfCollection:"02/02/2026",submittedBySelf:true,threatArea:T.list()[0],
    confidence:"High",protectiveMarking:"OFFICIAL",handling:{code:"P"},
    provenance:{text:"p",sourceEval:"1",intelEval:"A"}});
  M.addItem(ir,{sourceType:"PND Log",text:"x",sourceEval:"1",intelEval:"A"});
  return ir;
}

console.log("Phase 3 tests\n");

/* lifecycle */
var ir=fullIR();
eq(ir.status,"DRAFT","starts DRAFT");
ok(W.transition(ir,"SUBMIT",{actor:"o"}).ok && ir.status==="PENDING_AUTH","submit -> PENDING_AUTH");
ok(!W.canTransition(fullIR(),"AUTHORISE"),"cannot authorise straight from DRAFT");

/* authorise gating: unconfirmed entity blocks */
ir=fullIR(); W.transition(ir,"SUBMIT",{});
SI.addEntity(ir,{type:"person",label:"John SMITH",role:"POI_ACTIVE",pndShare:"Yes"}); // authoriserConfirmed false
var aBlocked=W.transition(ir,"AUTHORISE",{});
ok(!aBlocked.ok && aBlocked.reasons.some(function(r){return /PND-reviewed/.test(r);}),"authorise blocked until entities confirmed");

/* authorise gating: invalid SI (no role) blocks even if confirmed */
ir=fullIR(); W.transition(ir,"SUBMIT",{});
SI.addEntity(ir,{type:"person",label:"No Role",pndShare:"No",authoriserConfirmed:true});
ok(!W.transition(ir,"AUTHORISE",{}).ok,"authorise blocked when SI invalid (missing role)");

/* happy path authorise */
ir=fullIR(); W.transition(ir,"SUBMIT",{});
SI.addEntity(ir,{type:"person",label:"John SMITH",role:"POI_ACTIVE",pndShare:"Yes",authoriserConfirmed:true});
var aOk=W.transition(ir,"AUTHORISE",{actor:"sup"});
ok(aOk.ok && ir.status==="AUTHORISED","authorise succeeds when valid + confirmed");
ok(!!ir.pndShareAuthorisedAt,"authorise stamps pndShareAuthorisedAt");

/* reject + return */
ir=fullIR(); W.transition(ir,"SUBMIT",{});
ok(!W.transition(ir,"REJECT",{}).ok,"reject requires reason");
ok(W.transition(ir,"REJECT",{reason:"data standards"}).ok && ir.status==="REJECTED","reject -> REJECTED");
eq(ir.rejectionReason,"data standards","rejection reason stored");
ok(W.transition(ir,"RETURN_TO_DRAFT",{}).ok && ir.status==="DRAFT","return -> DRAFT");

/* suppress */
ir=fullIR();
ok(!W.transition(ir,"SUPPRESS",{}).ok,"suppress requires reason");
ok(W.transition(ir,"SUPPRESS",{reason:"incorrect"}).ok && ir.status==="SUPPRESSED","suppress -> SUPPRESSED");
ok(Object.keys(W.TRANSITIONS.SUPPRESSED).length===0,"no transitions out of SUPPRESSED");

/* PND review completeness */
ir=fullIR();
var e1=SI.addEntity(ir,{type:"person",label:"A",role:"POI_ACTIVE",pndShare:"Yes"});
ok(!W.pndReviewComplete(ir),"review incomplete before confirm");
e1.authoriserConfirmed=true;
ok(W.pndReviewComplete(ir),"review complete after confirm");

/* effective PND share: link governed by endpoints */
ir=fullIR();
var A=SI.addEntity(ir,{type:"person",label:"A",role:"POI_ACTIVE",pndShare:"Yes"});
var B=SI.addEntity(ir,{type:"person",label:"B",role:"POI_ACTIVE",pndShare:"No"});
var L=SI.addLink(ir,{from:A.id,to:B.id,type:"ASSOCIATE",pndShare:"Yes"});
var eff=W.computeEffectivePndShare(ir);
ok(eff.entities.filter(function(x){return x.id===A.id;})[0].share===true,"entity A shared");
ok(eff.entities.filter(function(x){return x.id===B.id;})[0].share===false,"entity B not shared");
var lr=eff.links[0];
ok(lr.share===false && /endpoint/.test(lr.blockedReason),"link blocked when an endpoint not shared");
B.pndShare="Yes";
ok(W.computeEffectivePndShare(ir).links[0].share===true,"link shares when both endpoints shared");

/* alias entities are never PND-shared */
ir=fullIR();
var aliasE=SI.addEntity(ir,{type:"person",label:"Mask",role:"FEATURES_IN",pndShare:"Yes",isAlias:true});
ok(W.computeEffectivePndShare(ir).entities.filter(function(x){return x.id===aliasE.id;})[0].share===false,"alias entity never PND-shared even if set Yes");

/* governed deletion: delete vs detach */
var irA=fullIR(), irB=fullIR();
var pA=SI.addEntity(irA,{type:"person",label:"John SMITH",role:"POI_ACTIVE",attrs:{forename:"John",surname:"Smith",dob:"01/01/1990"}});
var solo=SI.addEntity(irA,{type:"vehicle",label:"DE20 NTM",attrs:{vrm:"DE20 NTM"}});
SI.addLink(irA,{from:pA.id,to:solo.id,type:"USES"});
SI.addEntity(irB,{type:"person",label:"John SMITH",role:"POI_ACTIVE",attrs:{forename:"John",surname:"Smith",dob:"01/01/1990"}});
var impSolo=D.deletionImpact(irA,[irA,irB],"entity",solo.id);
eq(impSolo.action,"delete","entity only on this IR -> delete");
ok(impSolo.cascadeLinks.length===1,"delete cascades its link");
var impShared=D.deletionImpact(irA,[irA,irB],"entity",pA.id);
eq(impShared.action,"detach","entity matching another IR -> detach");
ok(impShared.elsewhere.indexOf(irB.urn)!==-1,"detach lists the other IR");
D.applyDeletion(irA,"entity",solo.id);
ok(irA.structuredIntelligence.entities.filter(function(e){return e.id===solo.id;}).length===0,"applyDeletion removes entity");
ok(irA.structuredIntelligence.links.length===0,"applyDeletion removed cascade link");

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
