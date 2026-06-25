/* normalise.js — Atlas-data-standards normalisation at the INGEST seam.
 * Clean to Atlas standards as data enters the System so SOLAR receives
 * standards-compliant intelligence. Reuses SOLAR's cm-standards.js.
 * Dual export: module.exports (Node) + window.RegistryNormalise (browser). */
"use strict";
(function () {
  var CR = (typeof require !== "undefined") ? require("../../js/core/cm-standards.js") : (typeof window !== "undefined" ? window.CRStandards : null);
  var M = (typeof require !== "undefined") ? require("./ir-model.js") : (typeof window !== "undefined" ? window.RegistryModel : null);

  function tidy(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function tidyBlock(s) { return String(s == null ? "" : s).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); }
  function detectForItem(text) {
    var out = { status: [], warnings: [], crypto: [] };
    if (!CR) return out;
    try { if (CR.detectStatus) out.status = CR.detectStatus(text) || []; } catch (e) {}
    try { if (CR.detectWarningSignals) out.warnings = CR.detectWarningSignals(text) || []; } catch (e) {}
    try { if (CR.detectCrypto) out.crypto = CR.detectCrypto(text) || []; } catch (e) {}
    return out;
  }
  function normaliseIR(ir) {
    if (!ir) return ir;
    var out = JSON.parse(JSON.stringify(ir));
    out.title = tidy(out.title);
    if (CR && CR.ddmmyyyy && out.dateOfCollection) { var d = CR.ddmmyyyy(out.dateOfCollection); if (d) out.dateOfCollection = d; }
    out.provenance = M ? M.coerceProvenance(out.provenance) : out.provenance;
    if (out.provenance && typeof out.provenance === "object") out.provenance.text = tidyBlock(out.provenance.text);
    if (out.sensitiveSource) {
      out.sensitiveSource.source = tidy(out.sensitiveSource.source);
      out.sensitiveSource.subtype = tidy(out.sensitiveSource.subtype);
      out.sensitiveSource.reference = tidy(out.sensitiveSource.reference);
    }
    (out.items || []).forEach(function (it) { it.text = tidyBlock(it.text); it.detected = detectForItem(it.text); });
    return out;
  }
  var api = { normaliseIR: normaliseIR, _tidy: tidy };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryNormalise = api; }
})();
