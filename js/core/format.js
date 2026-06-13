/* SOLAR — format.js
 * ATLAS data-standards formatting layer (NCA IM01 SD01 conventions):
 * names, DOBs, phones, VRMs, organisations, identifiers, currency, grading.
 * Used by every exporter so output drops straight into NCA systems.
 * Browser: window.CRFormat. Node: module.exports.
 */
(function () {
  "use strict";

  /* ---------- names ---------- */

  /** Surname per standard: UPPERCASE, hyphens dropped (no space inserted is
   *  wrong — hyphen becomes nothing keeping single token? Standard: drop the
   *  hyphen, words separated by space), apostrophes dropped, Mc/Mac joined. */
  function surnameCaps(s) {
    return String(s || "")
      .replace(/['’]/g, "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .slice(0, 35);
  }

  function forenameTitle(s) {
    return String(s || "")
      .replace(/['’.]/g, "")
      .trim()
      .replace(/\b\w/g, function (ch) { return ch.toUpperCase(); })
      .slice(0, 35);
  }

  /** Split a display label into forename(s) + surname.
   *  Treats trailing ALLCAPS token(s) as the surname; otherwise last token. */
  function splitName(label) {
    var toks = String(label || "").trim().split(/\s+/);
    if (!toks.length) return { forenames: "", surname: "" };
    var i = toks.length - 1;
    while (i > 0 && /^[A-Z'’-]+$/.test(toks[i - 1]) && /^[A-Z'’-]+$/.test(toks[i])) i--;
    if (!/^[A-Z'’-]+$/.test(toks[toks.length - 1])) i = toks.length - 1;
    return {
      forenames: toks.slice(0, i).join(" "),
      surname: toks.slice(i).join(" ")
    };
  }

  /** Free-text person string: "Forename SURNAME DOB 01/12/1976" */
  function personFreeText(label, dobISO) {
    var p = splitName(label);
    var out = (forenameTitle(p.forenames) + " " + surnameCaps(p.surname)).trim();
    if (dobISO) out += " DOB " + ddmmyyyy(dobISO);
    return out;
  }

  /* ---------- dates ---------- */

  function ddmmyyyy(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso || "");
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  function todayDDMMYYYY() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  /* ---------- phones ---------- */

  /** CM-style UK format: +44/0044 → 0…, international as 00CC… */
  function phoneCM(e164) {
    var d = String(e164 || "").replace(/\D/g, "");
    if (!d) return "";
    if (String(e164).indexOf("+44") === 0 || d.indexOf("44") === 0 && String(e164)[0] === "+") {
      return "0" + d.slice(2);
    }
    if (String(e164)[0] === "+") return "00" + d;
    return d;
  }

  /** KB free-text format: "+<number> (mobile)" */
  function phoneFreeText(e164, kind) {
    var cm = phoneCM(e164);
    return "+" + cm + (kind ? " (" + kind + ")" : "");
  }

  /* ---------- vehicles / identifiers ---------- */

  function vrm(reg) {
    return String(reg || "").replace(/\s+/g, "").toUpperCase();
  }
  function vrmFreeText(reg) { return "VRM " + vrm(reg); }

  function organisationCaps(name) {
    return String(name || "")
      .replace(/[.,']/g, "")
      .replace(/\blimited\b/gi, "LTD")
      .replace(/\bplc\b/gi, "PLC")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .slice(0, 70);
  }

  /* ---------- grading (3×5×2) ---------- */
  /* Source evaluation 1–3, Intelligence assessment A–E, Handling P/C.
   * Written as [1BP] after a full stop and two spaces. */

  var SOURCE_EVAL = { "1": "Reliable", "2": "Untested", "3": "Not reliable" };
  var ASSESSMENT = {
    A: "Known directly to source",
    B: "Known indirectly, corroborated",
    C: "Known indirectly",
    D: "Not known",
    E: "Suspected false"
  };
  var HANDLING = { P: "Lawful sharing permitted", C: "Sharing with conditions" };

  function gradeCode(prov) {
    prov = migrateProvenance(prov);   // defensive: legacy shapes never leak into output
    return "[" + (prov.source || "2") + (prov.assessment || "C") + (prov.handling || "P") + "]";
  }

  /** Append a grade to a sentence per the IR convention. */
  function gradeSentence(sentence, prov) {
    var s = String(sentence || "").trim();
    if (!/[.!?]$/.test(s)) s += ".";
    return s + "  " + gradeCode(prov);
  }

  /** Migrate the old (incorrect) provenance shape {source:'A'-'C', intel:1-5}
   *  to the standard {source:'1'-'3', assessment:'A'-'E', handling}. */
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

  /* ---------- entity → ATLAS free-text identifier ---------- */

  function entityFreeText(e) {
    var t = e.type, a = e.attrs || {};
    if (t === "person") return personFreeText(e.label, a.dob);
    if (t === "phone") return a.kind === "IMEI" ? "IMEI " + String(e.label).replace(/\D/g, "")
      : phoneFreeText((e.ids && e.ids.e164) || e.label, a.context ? "mobile" : "");
    if (t === "email") return "Email " + ((e.ids && e.ids.email) || e.label);
    if (t === "vehicle") return vrmFreeText(e.label);
    if (t === "organisation") return organisationCaps(e.label) +
      (a.companyNumber ? " (Co. No. " + a.companyNumber + ")" : "");
    if (t === "money") return String(e.label).replace(/£\s?/, "GBP ").replace(/€\s?/, "EUR ").replace(/\$\s?/, "USD ");
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
