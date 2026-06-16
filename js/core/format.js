/* SOLAR — format.js
 * Thin ATLAS-CM formatting facade. The single source of truth for CM data
 * standards now lives in cm-standards.js (window.CRStandards); this file is
 * kept as a backwards-compatible surface because existing exporters call
 * window.CRFormat.* directly.
 *
 * CM ONLY. The legacy KB phone convention (a leading "+") has been removed:
 * phoneFreeText now emits the CM national/00CC number with no "+".
 *
 * Browser: window.CRFormat. Node: module.exports.
 */
(function () {
  "use strict";

  var S = (typeof require !== "undefined")
    ? require("./cm-standards.js")
    : (typeof window !== "undefined" ? window.CRStandards : {});
  S = S || {};

  /* ---------- names (delegate to CRStandards) ---------- */
  function surnameCaps(s) { return S.surnameCaps(s).slice(0, 35); }
  function forenameTitle(s) { return S.forenameTitle(s).slice(0, 35); }
  function splitName(label) {
    var p = S.splitName(label);
    /* preserve the legacy {forenames, surname} shape; expose title/suffix too */
    return { forenames: p.forenames, surname: p.surname, title: p.title, suffix: p.suffix };
  }
  /** Free-text person string: "Forename SURNAME DOB 01/12/1976" */
  function personFreeText(label, dobISO) {
    var out = S.personLabelCM(label);
    if (dobISO) { var d = S.ddmmyyyy(dobISO); out += " DOB " + (d || String(dobISO)); }
    return out.trim();
  }

  /* ---------- dates (delegate) ---------- */
  function ddmmyyyy(iso) { var r = S.ddmmyyyy(iso); return r || String(iso || ""); }
  function todayDDMMYYYY() { return S.todayDDMMYYYY(); }

  /* ---------- phones (CM only — no "+") ---------- */
  function phoneCM(e164) { return S.phoneCM(e164); }
  /** CM free-text phone: the CM number plus an optional descriptor. No "+". */
  function phoneFreeText(e164, kind) {
    var cm = phoneCM(e164);
    if (!kind) return cm;
    var label = String(kind).charAt(0).toUpperCase() + String(kind).slice(1);
    return cm + " (" + label + ")";
  }

  /* ---------- vehicles / identifiers (delegate) ---------- */
  function vrm(reg) { return S.identifiers.vrm.canonical(reg); }
  function vrmFreeText(reg) { return S.identifiers.vrm.freeText(reg); }
  function organisationCaps(name) { return S.organisationCaps(name).slice(0, 70); }

  /* ---------- grading (3x5x2) — object API preserved ---------- */
  var SOURCE_EVAL = S.SOURCE_EVAL;
  var ASSESSMENT = S.ASSESSMENT;
  var HANDLING = S.HANDLING;

  /** gradeCode takes a provenance OBJECT {source, assessment, handling}. */
  function gradeCode(prov) {
    prov = migrateProvenance(prov);   // defensive: legacy shapes never leak into output
    return S.gradeCode(prov.source, prov.assessment, prov.handling);
  }
  /** Append a grade to a sentence per the IR convention. */
  function gradeSentence(sentence, prov) {
    var s = String(sentence || "").trim();
    if (!/[.!?]$/.test(s)) s += ".";
    return s + "  " + gradeCode(prov);
  }
  /** Migrate the old provenance shape {source:'A'-'C', intel:1-5} to the
   *  standard {source:'1'-'3', assessment:'A'-'E', handling}. */
  function migrateProvenance(p) {
    if (!p) return { source: "2", assessment: "C", handling: "P", sourceRef: "", gradedBy: "" };
    if (p.assessment) return p; // already new shape
    var srcMap = { A: "1", B: "2", C: "3" };
    var assMap = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
    return {
      source: srcMap[p.source] || "2",
      assessment: assMap[p.intel] || "C",
      handling: p.handling === "C" ? "C" : "P",
      conditions: p.conditions || "",
      sourceRef: p.sourceRef || "",
      gradedBy: p.gradedBy || ""
    };
  }

  /* ---------- entity -> ATLAS CM free-text identifier ---------- */
  function entityFreeText(e) {
    var t = e.type, a = e.attrs || {};
    if (t === "person") return personFreeText(e.label, a.dob);
    if (t === "phone") return a.kind === "IMEI"
      ? "IMEI " + String(e.label).replace(/\D/g, "")
      : phoneFreeText((e.ids && e.ids.e164) || e.label, a.context ? "mobile" : "");
    if (t === "email") return "Email " + ((e.ids && e.ids.email) || e.label);
    if (t === "vehicle") return vrmFreeText(e.label);
    if (t === "organisation") return organisationCaps(e.label) +
      (a.companyNumber ? " (Co. No. " + a.companyNumber + ")" : "");
    if (t === "money") return S.currencyCM(e.label);
    if (t === "ip") return "IP Address " + e.label;
    if (t === "address" || t === "location") return e.label;
    return e.label;
  }

  var CRFormat = {
    surnameCaps: surnameCaps, forenameTitle: forenameTitle, splitName: splitName,
    personFreeText: personFreeText, ddmmyyyy: ddmmyyyy, todayDDMMYYYY: todayDDMMYYYY,
    phoneCM: phoneCM, phoneFreeText: phoneFreeText,
    vrm: vrm, vrmFreeText: vrmFreeText, organisationCaps: organisationCaps,
    gradeCode: gradeCode, gradeSentence: gradeSentence, migrateProvenance: migrateProvenance,
    entityFreeText: entityFreeText,
    SOURCE_EVAL: SOURCE_EVAL, ASSESSMENT: ASSESSMENT, HANDLING: HANDLING
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRFormat;
  if (typeof window !== "undefined") window.CRFormat = CRFormat;
})();
