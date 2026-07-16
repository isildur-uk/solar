/* ir-standards.js — authoritative NCA Intelligence Report STRUCTURE / FORMAT
 * layer for the Registry (sibling to grading.js).
 *
 * This module encodes how a conformant IR is *shaped and printed* — header
 * skeleton (IH03 F01), the fixed dissemination caveat, the 5 Golden Rules, the
 * handling-condition wording (College of Policing APP), the SUPPORTING
 * INFORMATION line, and the §7 conformance / authorisation rubrics.
 *
 * It does NOT redefine the 3x5x2 grading scales — it CONSUMES grading.js
 * (which itself re-exports the authoritative cm-standards.js). It consumes
 * threat-taxonomy.js for typed threats and ir-model.js for the A/S code labels.
 *
 * XSS-safe: this layer NEVER builds HTML. Every function returns plain data /
 * strings; escaping is the render layer's job (escape at render, not in CORE).
 *
 * Sources: docs/design/nca_ir_structure_standard.md;
 *          reference_files/atlas_cm/_processed/IH03 F01 Intelligence Report - Blank.pdf;
 *          reference_files/atlas_cm/_processed/College of Policing - Intel Report Guide.pdf.
 *
 * Load order: cm-vocab -> cm-standards -> grading -> threat-taxonomy -> ir-standards.
 * Dual export: module.exports (Node) + window.RegistryIRStandards (browser).
 */
"use strict";
(function () {
  var G  = (typeof require !== "undefined") ? require("./grading.js")         : (typeof window !== "undefined" ? window.RegistryGrading : null);
  var TT = (typeof require !== "undefined") ? require("./threat-taxonomy.js") : (typeof window !== "undefined" ? window.RegistryThreatTaxonomy : null);
  var M  = (typeof require !== "undefined") ? require("./ir-model.js")         : (typeof window !== "undefined" ? window.RegistryModel : null);

  function str(x) { return (x == null) ? "" : String(x); }
  function nonEmpty(s) { return typeof s === "string" && s.replace(/^\s+|\s+$/g, "").length > 0; }

  /* ---- Fixed dissemination caveat (verbatim; standard §2 block 3). ---- */
  var DISSEMINATION_CAVEAT =
    "THIS REPORT IS STRICTLY FOR INTELLIGENCE USE ONLY. IT MUST NOT BE " +
    "DISCLOSED IN CRIMINAL PROCEEDINGS UNLESS AUTHORISED BY THE ORIGINATOR.";

  /* ---- The 5 Golden Rules (verbatim; IH03 F01, pp.2-3). ---- */
  var GOLDEN_RULES = [
    "Don't reveal the source of Intelligence – the body of the report should give no indication of the nature of the source or whether it is overt or covert",
    "Don't reveal Tactics – No reference to Law Enforcement tactics/ capabilities, methods or operational names",
    "One intelligence report per Sensitive Source – (for an indication of what would be deemed as Sensitive Source Material refer to MG6D schedule for sensitive material). If information has been obtained from another sensitive source then this material should be recorded on a separate Intelligence Report.",
    "Each submission should stand alone and contain provenance and context where required – The information must be of value and understood without the need to refer to other sources. Provenance shows how the intelligence is linked to the criminality and the subjects.",
    "Intelligence should contain the Who, What, Why, Where, When and How (5WH)"
  ];

  /* ---- Risk & considerations checklist (verbatim list; IH03 F01 p.6). ---- */
  var RISK_CONSIDERATIONS = [
    "De-confliction against NCA basic checks",
    "Sanitisation",
    "Form of Words (FOWs)",
    "Intelligence Source Register (ISR)",
    "Handling Codes (3x5x2) / Action & Sanitisation Codes",
    "Risk Assessment (RA) is mandatory",
    "Public Interest Immunity (PII)",
    "Indoctrination/Closed Records",
    "Authorised permission for Dissemination",
    "The Principles (see Operating Procedure links)",
    "Need to Know Vs Need to share"
  ];

  /* ---- Dissemination authorisation levels (IH03 F01 p.6). ---- */
  var DISSEMINATION_AUTH_LEVELS = [
    { level: "G4", scope: "UK and EEA law enforcement agencies and the private sector — authorised by a G4 or above in the department originating the dissemination." },
    { level: "G3", scope: "Any non-EEA disseminations — authorised by a G3 or above." },
    { level: "ICT", scope: "Overseas disseminations — apply the International Principles policy; liaise with the International Compliance Team (ICT)." }
  ];

  /* ---- Handling-condition wording (verbatim; College of Policing APP). ----
   * Reuses the A/S code SHORT labels from ir-model.js; the full canonical
   * sentences live here. C-only — never emitted under handling code P. */
  var ACTION_WORDING = {
    A1: "Intelligence may be combined or corroborated with other intelligence, but action cannot be taken directly. Permission needs to be sought from the originator before action is taken on any derived intelligence.",
    A2: "Covert action may be taken on this intelligence. However, the source, technique and any wider investigative effectiveness needs to be protected. This intelligence should not be used in isolation as evidence, in judicial proceedings or to support arrest.",
    A3: "Overt action is permitted on this intelligence. This information can be used as specified by the source intelligence owner."
  };
  var SANITISATION_WORDING = {
    S1: "The originator of the intelligence permits the unsupervised sanitisation of the material to allow dissemination to a wider audience.",
    S2: "The originator of the intelligence does not permit the sanitisation of the material for wider dissemination without consultation being sought."
  };
  // Printed handling label as it appears on the IR paper (College of Policing).
  var HANDLING_PRINT = { P: "Lawful sharing permitted", C: "Lawful sharing permitted with conditions" };

  /* ---- Ordered header skeleton mirroring IH03 F01 + standard §2. ---- */
  var HEADER_FIELDS = [
    { key: "protectiveMarking", label: "Protective marking", required: true, note: "OFFICIAL / OFFICIAL-SENSITIVE banner, top and bottom of every page. Default OFFICIAL." },
    { key: "originator", label: "Originator + INTELLIGENCE REPORT", required: true, note: "NATIONAL CRIME AGENCY / INTELLIGENCE REPORT doc-type label." },
    { key: "disseminationCaveat", label: "Dissemination caveat", required: true, note: DISSEMINATION_CAVEAT },
    { key: "urn", label: "URN", required: true, note: "IRnnnnnn — generated by the receiving intelligence unit." },
    { key: "dateOfIntelligence", label: "Date of Intelligence", required: true, note: "DD/MM/YYYY. Distinct from Date Created." },
    { key: "dateCreated", label: "Date Created", required: true, note: "DD/MM/YYYY." },
    { key: "pointOfContact", label: "Point of Contact", required: true, note: "Reporting handle / officer identifier." },
    { key: "submittedBySelf", label: "Submitter", required: false, note: "Whether the submitter is the reporting officer." },
    { key: "threats", label: "Threats", required: true, note: "One or more typed threats: Family - Sub-type - Band N." },
    { key: "handling", label: "Handling code + conditions", required: true, note: "HANDLING CODE P or C (+ Action/Sanitisation codes under C)." },
    { key: "confidence", label: "Intelligence Confidence Level", required: true, note: "High / Medium / Low." },
    { key: "gsc", label: "Government Security Classification (GSC)", required: false, note: "GSC marking where distinct from the protective marking." },
    { key: "sre", label: "SRE / Source Reference No", required: false, note: "Required where a sensitive source is used." },
    { key: "isrNumber", label: "ISR number", required: false, note: "Intelligence Source Register reference for a sensitive source." },
    { key: "pii", label: "Public Interest Immunity (PII)", required: true, note: "Yes / No decision." },
    { key: "title", label: "Title", required: true, note: "One-line summary of the report's thrust." },
    { key: "subject", label: "Person / DOB / PNC subject", required: false, note: "Subject of Interest — SURNAME Forename, DOB, PNC ID." }
  ];

  /* ================================================================== */
  /*  Rendering helpers (return strings/data; never HTML).               */
  /* ================================================================== */

  // "Threats: <t1>, <t2>. HANDLING CODE X - <label>. CONFIDENCE LEVEL - <Y>"
  function supportingInformationLine(ir) {
    ir = ir || {};
    var threats = (M ? M.threatsOf(ir) : (ir.threats || [])).map(function (t) { return TT ? TT.format(t) : str(t); })
      .filter(function (s) { return nonEmpty(s); });
    var code = str(ir.handling && ir.handling.code).toUpperCase();
    var hLabel = HANDLING_PRINT[code] || "";
    var out = "Threats: " + threats.join(", ") + ".";
    out += " HANDLING CODE " + (code || "—") + (hLabel ? " - " + hLabel : "") + ".";
    out += " CONFIDENCE LEVEL - " + (nonEmpty(ir.confidence) ? ir.confidence : "—");
    return out;
  }

  // Canonical handling block. Under P: no action/sanitisation. Under C: the
  // A/S codes with their SHORT labels (ir-model) + full canonical wording.
  function handlingBlock(ir) {
    ir = ir || {};
    var h = ir.handling || {};
    var code = str(h.code).toUpperCase();
    if (code !== "C") {
      return { code: code || "P", condition: HANDLING_PRINT.P, action: null, sanitisation: null };
    }
    var ac = str(h.actionCode).toUpperCase();
    var sc = str(h.sanitisationCode).toUpperCase();
    var actionLabels = (M && M.ACTION_CODES) || {};
    var sanLabels = (M && M.SANITISATION_CODES) || {};
    return {
      code: "C",
      condition: HANDLING_PRINT.C,
      instructions: str(h.instructions),
      action: ac ? { code: ac, label: actionLabels[ac] || "", wording: ACTION_WORDING[ac] || "" } : null,
      sanitisation: sc ? { code: sc, label: sanLabels[sc] || "", wording: SANITISATION_WORDING[sc] || "" } : null
    };
  }

  /* ================================================================== */
  /*  §7 conformance audit rubric — returns findings (data only).        */
  /*  Severity: Critical = grading integrity broken; High = missing      */
  /*  marking/handling/threat typing; Medium = caveat/dates/POC/prose;   */
  /*  Low = cosmetic.                                                     */
  /* ================================================================== */
  function itemGraded(it) {
    return G ? (G.isSourceEval(it.sourceEval) && G.isAssessment(it.intelEval))
             : (/^[1-3]$/.test(str(it.sourceEval)) && /^[A-E]$/.test(str(it.intelEval).toUpperCase()));
  }
  function hasPercentage(v) { return /%/.test(str(v)); }
  // Does the record carry any representation of the printed 3x5x2 grading key /
  // legend (the scales printed on every IR)? CORE stays data-only — the render
  // layer prints it; here we only check that a representation exists.
  function hasPrintedGradingKey(ir) {
    if (ir.gradingKeyPrinted === true) return true;
    var gk = ir.gradingKey;
    if (gk == null) return false;
    if (typeof gk === "boolean") return gk;
    if (typeof gk === "object") return Object.keys(gk).length > 0;
    return nonEmpty(String(gk));
  }

  function conformanceCheck(ir) {
    ir = ir || {};
    var findings = [];
    function add(point, label, severity, ok, message) {
      findings.push({ point: point, label: label, severity: severity, ok: !!ok, message: ok ? "" : message });
    }
    var items = ir.items || [];
    var pv = (M && M.coerceProvenance) ? M.coerceProvenance(ir.provenance) : (ir.provenance || {});
    var threats = M ? M.threatsOf(ir) : (ir.threats || []);
    var code = str(ir.handling && ir.handling.code).toUpperCase();

    // 1. Protective marking.
    add(1, "Protective marking", "High",
      ir.protectiveMarking === "OFFICIAL" || ir.protectiveMarking === "OFFICIAL-SENSITIVE",
      "Protective marking must be OFFICIAL or OFFICIAL-SENSITIVE.");

    // 2. Originator + doc-type label (render/label — Low).
    add(2, "Originator + INTELLIGENCE REPORT label", "Low",
      ir.originator == null ? true : nonEmpty(ir.originator),
      "Originator / INTELLIGENCE REPORT doc-type label absent.");

    // 3. Dissemination caveat (Medium; omission must be deliberate).
    add(3, "Dissemination caveat", "Medium",
      ir.omitCaveat !== true,
      "Dissemination caveat omitted without a documented reason.");

    // 4. URN + both dates + Point of Contact.
    add(4, "URN", "Medium", /^IR\d{6}$/.test(str(ir.urn)), "URN must be IRnnnnnn.");
    add(4, "Date of Intelligence + Date Created", "Medium",
      nonEmpty(ir.dateOfIntelligence) && nonEmpty(ir.dateCreated),
      "Both Date of Intelligence and Date Created are required.");
    add(4, "Point of Contact", "Medium", nonEmpty(ir.pointOfContact), "Point of Contact is required.");

    // 5. Title.
    add(5, "Title", "Medium", nonEmpty(ir.title), "A title line is required.");

    // 6. Supporting information: typed threats + band, handling, confidence.
    add(6, "Typed threats + band", "High",
      threats.length >= 1 && threats.every(function (t) { return TT ? TT.isValid(t) : true; }),
      "At least one typed, recognised threat (Family - Sub-type - Band) is required.");
    add(6, "Handling code (P/C, + A/S under C)", "High",
      (code === "P") || (code === "C" && nonEmpty(ir.handling.actionCode) && nonEmpty(ir.handling.sanitisationCode)),
      "Handling code must be P or C; under C an Action and a Sanitisation code are required.");
    add(6, "Confidence level", "Medium",
      M && M.CONFIDENCE ? M.CONFIDENCE.indexOf(ir.confidence) !== -1 : nonEmpty(ir.confidence),
      "Confidence level must be High, Medium or Low.");

    // 7. Grading integrity — 3x5x2 present, categorical (no percentages). CRITICAL.
    var anyPercent = items.some(function (it) { return hasPercentage(it.sourceEval) || hasPercentage(it.intelEval); })
      || hasPercentage(pv.sourceEval) || hasPercentage(pv.intelEval);
    add(7, "3x5x2 grading is categorical (no percentages)", "Critical", !anyPercent,
      "Grades must be categorical 3x5x2 (S 1-3 / I A-E), never percentages.");

    // 7.7 Printed 3x5x2 grading key/legend must exist on the record so a reader
    // can decode the per-item grades (§7.7). Medium — the grades themselves are
    // checked above; this is the printed decode-key.
    add(7, "Printed 3x5x2 grading key present", "Medium", hasPrintedGradingKey(ir),
      "Printed 3x5x2 grading key not present (§7.7).");

    // 8. Numbered items, each S/I graded. CRITICAL.
    add(8, "Numbered items present", "Critical", items.length >= 1,
      "The IR must be a container of numbered items, not a single prose block.");
    add(8, "Every item individually 3x5x2 graded", "Critical",
      items.length >= 1 && items.every(itemGraded),
      "Every intelligence item must carry its own S (1-3) / I (A-E) grade.");

    // 9. Distinct provenance / assessment item, separately graded.
    if (!nonEmpty(pv.text)) {
      add(9, "Distinct provenance / assessment line", "High", false,
        "A distinct provenance/assessment statement is expected (Golden Rule 4).");
    } else {
      add(9, "Provenance is separately graded", "Critical", itemGraded(pv),
        "The provenance/assessment statement must carry its own 3x5x2 grade.");
    }

    // 10. Page footer (Page X of Y) — cosmetic. Low.
    add(10, "Page X of Y footer", "Low",
      ir.pageFooter == null ? true : ir.pageFooter !== false,
      "Per-page footer (Page X of Y) not applied.");

    // 11. Entities in extractable CM form — Low (structural, checked elsewhere).
    add(11, "Entities in extractable CM form", "Low", true, "");

    var counts = { critical: 0, high: 0, medium: 0, low: 0 };
    findings.forEach(function (f) { if (!f.ok) { var k = f.severity.toLowerCase(); if (counts[k] != null) counts[k]++; } });
    return { findings: findings, counts: counts, conformant: counts.critical === 0 };
  }

  /* ================================================================== */
  /*  Ready-for-authorisation checklist (SOI process p.57).              */
  /* ================================================================== */
  function readyForAuthorisation(ir) {
    ir = ir || {};
    var blockers = [];
    var items = ir.items || [];
    var pv = (M && M.coerceProvenance) ? M.coerceProvenance(ir.provenance) : (ir.provenance || {});
    var threats = M ? M.threatsOf(ir) : (ir.threats || []);

    if (!nonEmpty(ir.title)) blockers.push("Title is required.");
    if (!nonEmpty(ir.dateOfIntelligence) || !nonEmpty(ir.dateCreated)) blockers.push("Both Date of Intelligence and Date Created are required.");
    if (!(threats.length >= 1 && threats.every(function (t) { return TT ? TT.isValid(t) : true; }))) blockers.push("At least one typed threat is required.");
    if (!(items.length >= 1 && items.every(itemGraded))) blockers.push("Every item must be 3x5x2 graded.");
    // Provenance present, or an explicit justification for its absence (Golden Rule 4).
    if (!nonEmpty(pv.text) && ir.provenanceJustified !== true) blockers.push("Provenance statement present, or its absence justified, is required.");
    else if (nonEmpty(pv.text) && !itemGraded(pv)) blockers.push("Provenance must be 3x5x2 graded.");
    if (!(ir.protectiveMarking === "OFFICIAL" || ir.protectiveMarking === "OFFICIAL-SENSITIVE")) blockers.push("Protective marking is required.");
    // Charting flag — structured intelligence signed off for charting.
    if (!(ir.flags && ir.flags.charted)) blockers.push("Charting flag not set (structured intelligence not signed off for charting).");

    return { ready: blockers.length === 0, blockers: blockers };
  }

  var api = {
    DISSEMINATION_CAVEAT: DISSEMINATION_CAVEAT,
    GOLDEN_RULES: GOLDEN_RULES,
    RISK_CONSIDERATIONS: RISK_CONSIDERATIONS,
    DISSEMINATION_AUTH_LEVELS: DISSEMINATION_AUTH_LEVELS,
    ACTION_WORDING: ACTION_WORDING,
    SANITISATION_WORDING: SANITISATION_WORDING,
    HANDLING_PRINT: HANDLING_PRINT,
    HEADER_FIELDS: HEADER_FIELDS,
    supportingInformationLine: supportingInformationLine,
    handlingBlock: handlingBlock,
    conformanceCheck: conformanceCheck,
    readyForAuthorisation: readyForAuthorisation
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryIRStandards = api; }
})();
