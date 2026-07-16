/* ir-standards.run.js — tests for the authoritative IR structure/format layer,
 * plus the 3x5x2 grading-wording fix it depends on.
 * Uses NO fabricated realistic identifiers — only structural/placeholder values. */
"use strict";
var G   = require("../core/grading.js");
var IRS = require("../core/ir-standards.js");
var M   = require("../core/ir-model.js");
var V   = require("../core/ir-validate.js");
var pass = 0, fail = 0;
function ok(c, m){ if(c){pass++;} else {fail++; console.error("  FAIL: " + m);} }
function eq(a, b, m){ ok(a === b, m + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

console.log("IR standards tests\n");

/* ---- 1. Grading wording: authoritative 3x5x2 (College of Policing) ---- */
eq(G.ASSESSMENT.A, "Known directly", "ASSESSMENT.A wording");
eq(G.ASSESSMENT.B, "Known indirectly but corroborated", "ASSESSMENT.B wording");
eq(G.ASSESSMENT.C, "Known indirectly", "ASSESSMENT.C wording");
eq(G.ASSESSMENT.D, "Not known", "ASSESSMENT.D wording");
eq(G.ASSESSMENT.E, "Suspected to be false", "ASSESSMENT.E wording");
eq(G.SOURCE_EVAL["1"], "Reliable", "SOURCE_EVAL.1 unchanged");
eq(G.SOURCE_EVAL["2"], "Untested", "SOURCE_EVAL.2 unchanged");
eq(G.SOURCE_EVAL["3"], "Not reliable", "SOURCE_EVAL.3 unchanged");
/* legacy 5x5x5 strings must be gone */
ok(JSON.stringify(G.ASSESSMENT).indexOf("Cannot be judged") === -1, "no legacy 'Cannot be judged'");
ok(JSON.stringify(G.ASSESSMENT).indexOf("Known personally") === -1, "no legacy 'Known personally'");

/* ---- helpers: build a well-formed IR ---- */
function wellFormed(over){
  over = over || {};
  var ir = M.createIR({
    title: "Subject of interest — associate network",
    dateOfCollection: "02/02/2026",
    dateOfIntelligence: "01/02/2026",
    dateCreated: "02/02/2026",
    pointOfContact: "PoC-Handle",
    submittedBySelf: true,
    threats: ["Money Laundering - High-end money laundering - Band 1"],
    confidence: "High",
    protectiveMarking: "OFFICIAL-SENSITIVE",
    pii: false,
    handling: over.handling || { code: "P", instructions: "" },
    flags: over.flags || { charted: true },
    provenance: over.provenance || { text: "Subject is assessed to be involved in money laundering.", sourceEval: "1", intelEval: "A" }
  });
  M.addItem(ir, { sourceType:"PND", text:"Subject linked to account activity.", sourceEval:"1", intelEval:"B" });
  M.addItem(ir, { sourceType:"Experian", text:"Address corroborated.", sourceEval:"2", intelEval:"B" });
  if (over.mutate) over.mutate(ir);
  return ir;
}

/* ---- 2. SUPPORTING INFORMATION line — byte-for-byte (multi-threat) ---- */
var irMulti = M.createIR({
  title:"t", dateOfCollection:"02/02/2026", dateOfIntelligence:"01/02/2026", dateCreated:"02/02/2026",
  pointOfContact:"x", submittedBySelf:true, confidence:"High", protectiveMarking:"OFFICIAL", pii:false,
  threats:["Money Laundering - High-end money laundering - Band 1", "Drugs - Cocaine - Band 1"],
  handling:{ code:"C", instructions:"Consult originator.", actionCode:"A1", sanitisationCode:"S2" },
  provenance:{ text:"p", sourceEval:"1", intelEval:"A" }
});
var SAMPLE = "Threats: Money Laundering - High-end money laundering - Band 1, Drugs - Cocaine - Band 1. HANDLING CODE C - Lawful sharing permitted with conditions. CONFIDENCE LEVEL - High";
eq(IRS.supportingInformationLine(irMulti), SAMPLE, "SUPPORTING INFORMATION line matches sample byte-for-byte");

/* ---- 3. handlingBlock: C-only A/S wording ---- */
var pBlock = IRS.handlingBlock(wellFormed());
ok(pBlock.code === "P" && pBlock.action === null && pBlock.sanitisation === null, "handlingBlock under P has no action/sanitisation");
var cBlock = IRS.handlingBlock(irMulti);
ok(cBlock.code === "C" && cBlock.action && cBlock.action.code === "A1", "handlingBlock under C carries action A1");
ok(/Permission needs to be sought from the originator/.test(cBlock.action.wording), "A1 canonical wording present");
ok(/does not permit the sanitisation/.test(cBlock.sanitisation.wording), "S2 canonical wording present");

/* ---- 4. A/S codes allowed ONLY under handling C (ir-validate) ---- */
ok(!V.validateIR(wellFormed({ mutate:function(x){ x.handling.code="P"; x.handling.actionCode="A2"; } })).valid, "action code under P rejected");
ok(V.validateIR(wellFormed({ handling:{ code:"C", instructions:"Consult originator.", actionCode:"A1", sanitisationCode:"S2" } })).valid, "C with all conditions validates");

/* ---- 5. conformanceCheck: passes well-formed, flags Critical on de-graded ---- */
var wfReport = IRS.conformanceCheck(wellFormed());
ok(wfReport.conformant && wfReport.counts.critical === 0, "conformanceCheck passes a well-formed IR");
var deGraded = IRS.conformanceCheck(wellFormed({ mutate:function(x){ x.items[0].sourceEval=""; x.items[0].intelEval=""; } }));
ok(!deGraded.conformant && deGraded.counts.critical >= 1, "conformanceCheck flags Critical on a de-graded IR");
ok(deGraded.findings.some(function(f){ return f.severity==="Critical" && !f.ok && /grade/i.test(f.message); }), "de-graded Critical finding names the grade break");
var noItems = IRS.conformanceCheck(wellFormed({ mutate:function(x){ x.items = []; } }));
ok(!noItems.conformant && noItems.counts.critical >= 1, "conformanceCheck flags Critical when there are no items");

/* ---- 5b. conformanceCheck flags a threat that lacks its required Band ---- */
var missingBand = IRS.conformanceCheck(wellFormed({ mutate:function(x){ x.threats = [{ family:"Drugs", subtype:"Cocaine", band:null }]; } }));
ok(missingBand.findings.some(function(f){ return f.point===6 && !f.ok && /threat/i.test(f.label); }), "conformanceCheck flags a threat that lacks a required Band");

/* ---- 5c. printed 3x5x2 grading-key finding (§7.7) ---- */
var noKey = IRS.conformanceCheck(wellFormed());
ok(noKey.findings.some(function(f){ return f.point===7 && !f.ok && /grading key/i.test(f.label); }), "conformanceCheck raises the printed 3x5x2 grading-key finding when absent");
var withKey = IRS.conformanceCheck(wellFormed({ mutate:function(x){ x.gradingKeyPrinted = true; } }));
ok(withKey.findings.some(function(f){ return f.point===7 && f.ok && /grading key/i.test(f.label); }), "printed 3x5x2 grading-key finding clears when the key is present");

/* ---- 6. readyForAuthorisation blocks when charting flag absent ---- */
var notCharted = IRS.readyForAuthorisation(wellFormed({ flags:{ charted:false } }));
ok(!notCharted.ready && notCharted.blockers.some(function(b){ return /charting/i.test(b); }), "readyForAuthorisation blocks when charting flag absent");
var charted = IRS.readyForAuthorisation(wellFormed({ flags:{ charted:true } }));
ok(charted.ready && charted.blockers.length === 0, "readyForAuthorisation passes a fully-formed, charted IR");

/* ---- 7. static authoritative content present ---- */
eq(IRS.GOLDEN_RULES.length, 5, "five Golden Rules");
ok(/INTELLIGENCE USE ONLY/.test(IRS.DISSEMINATION_CAVEAT), "dissemination caveat present");
ok(IRS.DISSEMINATION_AUTH_LEVELS.some(function(l){ return l.level==="G4"; }), "G4 dissemination level present");
ok(IRS.HEADER_FIELDS.some(function(f){ return f.key==="threats" && f.required; }), "HEADER_FIELDS requires threats");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
