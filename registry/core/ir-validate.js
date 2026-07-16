/* ir-validate.js — validation for IntelligenceReport records.
 * Headline rule: action (A1-A3) and sanitisation (S1-S2) codes are conditions
 * of handling code C ONLY — absent under P. Provenance is graded with its own
 * 3x5x2 (source eval + intel eval), like any item.
 * Returns { valid, errors:[{field,message}], warnings:[{field,message}] }.
 * Dual export: module.exports (Node) + window.RegistryValidate (browser). */
"use strict";
(function () {
  var G = (typeof require !== "undefined") ? require("./grading.js") : (typeof window !== "undefined" ? window.RegistryGrading : null);
  var M = (typeof require !== "undefined") ? require("./ir-model.js") : (typeof window !== "undefined" ? window.RegistryModel : null);
  var T = (typeof require !== "undefined") ? require("./threat-areas.js") : (typeof window !== "undefined" ? window.RegistryThreatAreas : null);
  var TT = (typeof require !== "undefined") ? require("./threat-taxonomy.js") : (typeof window !== "undefined" ? window.RegistryThreatTaxonomy : null);
  var IRS = (typeof require !== "undefined") ? require("./ir-standards.js") : (typeof window !== "undefined" ? window.RegistryIRStandards : null);

  function isNonEmpty(s) { return typeof s === "string" && s.trim().length > 0; }

  // Golden Rule 4 heuristic: does any item assert criminality / SOI association?
  // Deliberately tight so plain held-data items ("Address corroborated.") do NOT
  // match — only explicit criminality/association assertions do.
  var CRIMINALITY_RE = /(involved in|member of|criminal associate|associate of|facilitat|launder|traffick|supplie|is assessed to be|conspir|smuggl)/i;
  function assertsCriminality(ir) {
    return (ir.items || []).some(function (it) { return CRIMINALITY_RE.test(String(it.text || "")); });
  }

  function validateIR(ir) {
    var errors = [];
    var warnings = [];
    function err(field, message) { errors.push({ field: field, message: message }); }
    function warn(field, message) { warnings.push({ field: field, message: message }); }
    if (!ir || typeof ir !== "object") { return { valid:false, errors:[{ field:"ir", message:"No report supplied." }], warnings:[] }; }

    if (!isNonEmpty(ir.title)) err("title", "Title is required.");
    if (!isNonEmpty(ir.dateOfCollection)) err("dateOfCollection", "Date of collection is required.");
    else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(ir.dateOfCollection)) err("dateOfCollection", "Date of collection must be DD/MM/YYYY.");
    if (typeof ir.submittedBySelf !== "boolean") err("submittedBySelf", "Submitter flag (are you the submitter?) is required.");

    // Threats: the authoritative structured list must be non-empty and each
    // entry parseable/valid via the threat taxonomy. threatsOf() falls back to
    // the legacy threatArea/threatBand so old callers keep validating.
    var threats = M.threatsOf(ir);
    if (!threats.length) err("threats", "At least one typed threat is required.");
    else threats.forEach(function (t, i) {
      if (TT && !TT.isValid(t)) err("threats[" + i + "]", "Threat '" + (TT ? TT.format(t) : "") + "' is not a recognised family/band.");
    });
    // Legacy guard: a hand-set / stale threatArea string must still resolve to a
    // recognised family (protects against the legacy single-field code path).
    // The band lives in the separate legacy threatBand field, so fold it in
    // before validating — otherwise a band-required family would spuriously fail
    // the band rule purely because the string form never carries its band.
    if (isNonEmpty(ir.threatArea) && TT) {
      var legacyThreat = TT.parse(ir.threatArea);
      if (legacyThreat.band == null && ir.threatBand != null && ir.threatBand !== "") legacyThreat.band = TT.normBand(ir.threatBand);
      if (!TT.isValid(legacyThreat)) err("threatArea", "Threat area is not a recognised value.");
    }

    if (M.CONFIDENCE.indexOf(ir.confidence) === -1) err("confidence", "Confidence level must be High, Medium or Low.");
    if (M.PROTECTIVE_MARKING.indexOf(ir.protectiveMarking) === -1) err("protectiveMarking", "Protective marking must be OFFICIAL or OFFICIAL-SENSITIVE.");
    if (typeof ir.pii !== "boolean") err("pii", "A PII (Public Interest Immunity) Yes/No decision is required.");

    // Sensitive source must carry an SRE / Source Reference No or ISR number.
    var ss = ir.sensitiveSource || {};
    if (isNonEmpty(ss.source)) {
      if (!isNonEmpty(ir.sre) && !isNonEmpty(ir.sourceReferenceNo) && !isNonEmpty(ir.isrNumber) && !isNonEmpty(ss.reference))
        err("sensitiveSource.reference", "A sensitive source requires an SRE / Source Reference No or ISR number.");
    }

    var h = ir.handling || {};
    var code = String(h.code || "").toUpperCase();
    if (code !== "P" && code !== "C") err("handling.code", "Handling code must be P or C.");
    if (code === "C") {
      if (!isNonEmpty(h.instructions)) err("handling.instructions", "Detailed handling instructions are required under code C.");
      if (!M.ACTION_CODES[h.actionCode]) err("handling.actionCode", "An action code (A1, A2 or A3) is required under code C.");
      if (!M.SANITISATION_CODES[h.sanitisationCode]) err("handling.sanitisationCode", "A sanitisation code (S1 or S2) is required under code C.");
    } else if (code === "P") {
      if (h.actionCode) err("handling.actionCode", "Action codes only apply to handling code C; remove it under code P.");
      if (h.sanitisationCode) err("handling.sanitisationCode", "Sanitisation codes only apply to handling code C; remove it under code P.");
    }

    if (!(ir.items || []).length) err("items", "At least one intelligence item is required.");
    (ir.items || []).forEach(function (it, i) {
      var tag = "items[" + i + "]";
      if (!isNonEmpty(it.text)) err(tag + ".text", "Item " + (i + 1) + " text is required.");
      if (!G.isSourceEval(it.sourceEval)) err(tag + ".sourceEval", "Item " + (i + 1) + " source evaluation must be 1, 2 or 3.");
      if (!G.isAssessment(it.intelEval)) err(tag + ".intelEval", "Item " + (i + 1) + " intelligence evaluation must be A-E.");
    });

    var pv = M.coerceProvenance(ir.provenance);
    if (!isNonEmpty(pv.text)) {
      // Golden Rule 4: provenance shows how the intelligence links to the
      // criminality/subjects. Where an item already asserts criminality + SOI
      // association, treat a missing provenance line as a SOFT WARNING (the
      // association itself carries context); otherwise it is a hard error.
      if (assertsCriminality(ir)) warn("provenance.text", "No distinct provenance statement — an item already asserts criminality/association (Golden Rule 4); confirm provenance before authorisation.");
      else err("provenance.text", "A provenance statement is required (and is never charted).");
    } else {
      if (!G.isSourceEval(pv.sourceEval)) err("provenance.sourceEval", "Provenance source evaluation must be 1, 2 or 3.");
      if (!G.isAssessment(pv.intelEval)) err("provenance.intelEval", "Provenance intelligence evaluation must be A-E.");
    }

    if (!M.STATUS[ir.status]) err("status", "Unknown status.");
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }
  function itemGrade(ir, graded) {
    var h = (ir && ir.handling && ir.handling.code) || "P";
    return G.code(graded.sourceEval, graded.intelEval, h);
  }
  function _gradeRank(it){ var s=parseInt(it.sourceEval,10); if(isNaN(s)) s=0; var i="ABCDE".indexOf(String(it.intelEval||"").toUpperCase()); return s*10+(i<0?0:i+1); }
  // The report's overall grade is taken from its LEAST reliable item: worst source
  // evaluation first (3>2>1), tie-broken by worst intelligence evaluation (E>..>A).
  // The item-level isProvenance flag is now a live field (set by ir-model's
  // createItem), so excluding inline assessment/provenance items from the
  // report-grade calculation is meaningful. Fall back to all items if every
  // item happens to be flagged, so the branch is never inert.
  function worstItem(ir){ var all=((ir&&ir.items)||[]); var its=all.filter(function(x){return !x.isProvenance;}); if(!its.length) its=all; if(!its.length) return null; var w=its[0]; for(var k=1;k<its.length;k++){ if(_gradeRank(its[k])>_gradeRank(w)) w=its[k]; } return w; }
  function reportGrade(ir){ var w=worstItem(ir); if(!w) return null; var h=(ir.handling&&ir.handling.code)||"P"; return { sourceEval:w.sourceEval, intelEval:w.intelEval, handling:h, code:G.code(w.sourceEval,w.intelEval,h) }; }
  var api = { validateIR: validateIR, itemGrade: itemGrade, worstItem: worstItem, reportGrade: reportGrade };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryValidate = api; }
})();
