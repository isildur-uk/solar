/* workflow.js — IR status lifecycle + authoriser/PND-share gating.
 * Lifecycle: DRAFT -submit-> PENDING_AUTH -authorise-> AUTHORISED
 *            PENDING_AUTH -reject-> REJECTED -return-> DRAFT
 *            (any non-suppressed) -suppress-> SUPPRESSED
 * Authorise is gated on: report valid + structured intelligence valid +
 * every entity/link PND-reviewed (authoriserConfirmed).
 * Links follow their endpoint entities for PND (a link is only shareable if
 * both endpoints are shareable). Dual export: module.exports + window.RegistryWorkflow. */
"use strict";
(function () {
  var V  = (typeof require!=="undefined") ? require("./ir-validate.js") : (typeof window!=="undefined"?window.RegistryValidate:null);
  var SI = (typeof require!=="undefined") ? require("./si-model.js")    : (typeof window!=="undefined"?window.RegistrySI:null);
  var M  = (typeof require!=="undefined") ? require("./ir-model.js")    : (typeof window!=="undefined"?window.RegistryModel:null);

  var TRANSITIONS = {
    DRAFT:        { SUBMIT:"PENDING_AUTH", SUPPRESS:"SUPPRESSED" },
    PENDING_AUTH: { AUTHORISE:"AUTHORISED", REJECT:"REJECTED", SUPPRESS:"SUPPRESSED" },
    REJECTED:     { RETURN_TO_DRAFT:"DRAFT", SUPPRESS:"SUPPRESSED" },
    AUTHORISED:   { SUPPRESS:"SUPPRESSED" },
    SUPPRESSED:   {}
  };
  var ACTION_LABELS = {
    SUBMIT:"Submit for authorisation", AUTHORISE:"Authorise charting & PND share",
    REJECT:"Reject", RETURN_TO_DRAFT:"Return to draft", SUPPRESS:"Suppress"
  };

  function si(ir){ return (ir && ir.structuredIntelligence) || { entities:[], links:[] }; }

  function pndReviewComplete(ir){
    var S = si(ir);
    return S.entities.every(function(e){return !!e.authoriserConfirmed;}) &&
           S.links.every(function(l){return !!l.authoriserConfirmed;});
  }

  function validateForAuthorisation(ir){
    var reasons=[];
    var vIR = V.validateIR(ir);
    if(!vIR.valid) reasons.push("Report has "+vIR.errors.length+" validation issue(s).");
    var vSI = SI.validateSI(ir);
    if(!vSI.valid) reasons.push("Structured intelligence has "+vSI.errors.length+" issue(s).");
    if(!pndReviewComplete(ir)) reasons.push("Every entity and link must be PND-reviewed (confirmed).");
    return { ok: reasons.length===0, reasons: reasons, irErrors:vIR.errors, siErrors:vSI.errors };
  }

  function computeEffectivePndShare(ir){
    var S = si(ir), byId={}; S.entities.forEach(function(e){byId[e.id]=e;});
    function entShare(e){ return !!(e && e.pndShare==="Yes" && !e.isAlias); } // alias entities are never PND-shared
    var entities = S.entities.map(function(e){ return { id:e.id, share: entShare(e) }; });
    var links = S.links.map(function(l){
      var want = l.pndShare==="Yes";
      var endpointsOk = entShare(byId[l.from]) && entShare(byId[l.to]);
      var share = want && endpointsOk;
      var blockedReason = (want && !endpointsOk) ? "Link set to share but an endpoint entity is not PND-shared." : "";
      return { id:l.id, share:share, blockedReason:blockedReason };
    });
    return { entities:entities, links:links };
  }

  function canTransition(ir, action){ return !!(TRANSITIONS[ir.status] && TRANSITIONS[ir.status][action]); }

  function transition(ir, action, opts){
    opts = opts || {};
    if(!canTransition(ir, action)) return { ok:false, error:"Cannot "+action+" from status "+ir.status };
    if(action==="AUTHORISE"){
      var va = validateForAuthorisation(ir);
      if(!va.ok) return { ok:false, error:"Not ready to authorise.", reasons:va.reasons };
    }
    if((action==="REJECT"||action==="SUPPRESS") && !(opts.reason && String(opts.reason).trim())){
      return { ok:false, error:(action==="REJECT"?"Rejection":"Suppression")+" reason required." };
    }
    ir.status = TRANSITIONS[ir.status][action];
    if(action==="REJECT") ir.rejectionReason = String(opts.reason).trim();
    if(action==="SUPPRESS") ir.suppressionReason = String(opts.reason).trim();
    if(action==="AUTHORISE") ir.pndShareAuthorisedAt = new Date().toISOString();
    if(M&&M.addAudit) M.addAudit(ir, opts.actor||"user", action.toLowerCase(),
      (ACTION_LABELS[action]||action) + (opts.reason?(": "+opts.reason):""));
    return { ok:true, ir:ir };
  }

  var api = { TRANSITIONS:TRANSITIONS, ACTION_LABELS:ACTION_LABELS, canTransition:canTransition, transition:transition,
    validateForAuthorisation:validateForAuthorisation, pndReviewComplete:pndReviewComplete, computeEffectivePndShare:computeEffectivePndShare };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryWorkflow = api; }
})();
