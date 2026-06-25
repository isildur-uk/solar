/* ir-validate.js — validation for IntelligenceReport records.
 * Headline rule: action (A1-A3) and sanitisation (S1-S2) codes are conditions
 * of handling code C ONLY — absent under P. Provenance is graded with its own
 * 3x5x2 (source eval + intel eval), like any item.
 * Returns { valid, errors:[{field,message}] }.
 * Dual export: module.exports (Node) + window.RegistryValidate (browser). */
"use strict";
(function () {
  var G = (typeof require !== "undefined") ? require("./grading.js") : (typeof window !== "undefined" ? window.RegistryGrading : null);
  var M = (typeof require !== "undefined") ? require("./ir-model.js") : (typeof window !== "undefined" ? window.RegistryModel : null);
  var T = (typeof require !== "undefined") ? require("./threat-areas.js") : (typeof window !== "undefined" ? window.RegistryThreatAreas : null);

  function isNonEmpty(s) { return typeof s === "string" && s.trim().length > 0; }

  function validateIR(ir) {
    var errors = [];
    function err(field, message) { errors.push({ field: field, message: message }); }
    if (!ir || typeof ir !== "object") { return { valid:false, errors:[{ field:"ir", message:"No report supplied." }] }; }

    if (!isNonEmpty(ir.title)) err("title", "Title is required.");
    if (!isNonEmpty(ir.dateOfCollection)) err("dateOfCollection", "Date of collection is required.");
    else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(ir.dateOfCollection)) err("dateOfCollection", "Date of collection must be DD/MM/YYYY.");
    if (typeof ir.submittedBySelf !== "boolean") err("submittedBySelf", "Submitter flag (are you the submitter?) is required.");
    if (!isNonEmpty(ir.threatArea)) err("threatArea", "Threat area is required.");
    else if (T && !T.isValid(ir.threatArea)) err("threatArea", "Threat area is not a recognised value.");
    if (M.CONFIDENCE.indexOf(ir.confidence) === -1) err("confidence", "Confidence level must be High, Medium or Low.");
    if (M.PROTECTIVE_MARKING.indexOf(ir.protectiveMarking) === -1) err("protectiveMarking", "Protective marking must be OFFICIAL or OFFICIAL-SENSITIVE.");

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
    if (!isNonEmpty(pv.text)) err("provenance.text", "A provenance statement is required (and is never charted).");
    if (!G.isSourceEval(pv.sourceEval)) err("provenance.sourceEval", "Provenance source evaluation must be 1, 2 or 3.");
    if (!G.isAssessment(pv.intelEval)) err("provenance.intelEval", "Provenance intelligence evaluation must be A-E.");

    if (!M.STATUS[ir.status]) err("status", "Unknown status.");
    return { valid: errors.length === 0, errors: errors };
  }
  function itemGrade(ir, graded) {
    var h = (ir && ir.handling && ir.handling.code) || "P";
    return G.code(graded.sourceEval, graded.intelEval, h);
  }
  var api = { validateIR: validateIR, itemGrade: itemGrade };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryValidate = api; }
})();
