/* CHART ROOM — disclosure.js
 * Deterministic disclosure-grade text generation for the enquiry/disclosure
 * logs: the CPS-style sentence, the standardised file name, the disclosure
 * document title, and document-description starters. Pure string functions
 * (no DOM, no network) so they are fully golden-oracle testable. The UI is
 * responsible for HTML-escaping these strings on render.
 * Browser: window.CRDisclosure. Node: module.exports.
 */
(function () {
  "use strict";

  var V = (typeof window !== "undefined" && window.CRIntelVocab) ||
          (typeof require === "function" ? require("./intelvocab.js") : null);

  var CAVEAT = "Auto-drafted by Chart Room — verify before dissemination.";

  /* Strict parse: returns a Date for a real value, or null for empty/invalid.
   * We never fabricate "today" inside disclosure text — an unknown date stays a
   * visible placeholder (provenance honesty). */
  function _parse(d) {
    if (!d) return null;
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
    var s = String(d), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]); // yyyy-mm-dd as LOCAL (TZ-safe)
    var x = new Date(s);
    return isNaN(x.getTime()) ? null : x;
  }
  function _p2(n) { return (n < 10 ? "0" : "") + n; }
  function ddmmyyyy(d) { d = _parse(d); return d ? _p2(d.getDate()) + "/" + _p2(d.getMonth() + 1) + "/" + d.getFullYear() : "[date]"; }
  function ddmmyyyyDot(d) { d = _parse(d); return d ? _p2(d.getDate()) + "." + _p2(d.getMonth() + 1) + "." + d.getFullYear() : "[date]"; }
  function yyyymmdd(d) { d = _parse(d); return d ? "" + d.getFullYear() + _p2(d.getMonth() + 1) + _p2(d.getDate()) : "YYYYMMDD"; }

  /* token-safe fill: replaces [KEY] with map[KEY] (no regex specials). */
  function fill(tpl, map) {
    var out = String(tpl || "");
    Object.keys(map).forEach(function (k) { out = out.split("[" + k + "]").join(map[k] == null ? "" : String(map[k])); });
    return out.replace(/[ \t]+/g, " ").trim();
  }

  function purposeFor(system) { return (V && V.PURPOSE_BY_SYSTEM[system]) || ""; }

  /* Enquiry/check disclosure sentence. o: {system,date,who,entity,subject,purpose?,result?} */
  function enquirySentence(o) {
    o = o || {};
    return fill(V ? V.ENQUIRY_TEMPLATE : "[SYSTEM] check completed on [DATE] by officer [WHO] on [ENTITY] in relation to [SUBJECT] to identify [PURPOSE]. [RESULT]", {
      SYSTEM: o.system || "[system]",
      DATE: ddmmyyyy(o.date),
      WHO: o.who || "[staff no.]",
      ENTITY: o.entity || "[entity]",
      SUBJECT: o.subject || "[subject]",
      PURPOSE: o.purpose || purposeFor(o.system) || "any relevant information",
      RESULT: o.result || ""
    });
  }

  /* Standardised file name: "YYYYMMDD - SYSTEM - CASEREF Brief Description". */
  function fileName(o) {
    o = o || {};
    var bits = [yyyymmdd(o.date), o.system || "SYSTEM", o.caseRef || "CASEREF"];
    var head = bits.join(" - ");
    var brief = (o.brief || "").trim();
    return brief ? head + " " + brief : head;
  }

  /* Disclosure document title (Intel Log 2 style): "SYSTEM ENTITY DD.MM.YYYY WHO". */
  function disclosureTitle(o) {
    o = o || {};
    return [o.system || "", o.entity || "", ddmmyyyyDot(o.date), o.who || ""]
      .filter(function (x) { return String(x).trim() !== ""; }).join(" ").trim();
  }

  /* Document description starter with [SUBJECT]/[DATE]/[WHO]/[ENTITY]/[SYSTEM]
   * auto-filled; [FILL: ...] prompts are deliberately left for the analyst. */
  function docDescription(docType, f) {
    f = f || {};
    var tpl = (V && V.DOC_TYPE_STARTERS[docType]) || "[FILL: document type] dated [DATE], produced by officer [WHO], relating to [SUBJECT].";
    var out = tpl
      .split("[SUBJECT]").join(f.subject || "[SUBJECT]")
      .split("[DATE]").join(f.date ? ddmmyyyy(f.date) : "[DATE]")
      .split("[WHO]").join(f.who || "[WHO]")
      .split("[ENTITY]").join(f.entity || "[ENTITY]")
      .split("[SYSTEM]").join(f.system || "[SYSTEM]");
    return out;
  }

  /* true if any [FILL: ...] prompts remain unfilled (UI can warn before commit). */
  function hasUnfilled(s) { return /\[FILL:/.test(String(s || "")); }

  var CRDisclosure = {
    CAVEAT: CAVEAT,
    ddmmyyyy: ddmmyyyy, ddmmyyyyDot: ddmmyyyyDot, yyyymmdd: yyyymmdd, fill: fill,
    purposeFor: purposeFor, enquirySentence: enquirySentence, fileName: fileName,
    disclosureTitle: disclosureTitle, docDescription: docDescription, hasUnfilled: hasUnfilled
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRDisclosure;
  if (typeof window !== "undefined") window.CRDisclosure = CRDisclosure;
})();
