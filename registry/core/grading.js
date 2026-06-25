/* grading.js — 3x5x2 grading adapter for the Registry.
 *
 * Single-source-of-truth: this module does NOT redefine the grading scales.
 * It reuses SOLAR's authoritative cm-standards.js (SOURCE_EVAL / ASSESSMENT /
 * HANDLING + gradeCode/gradeValid/gradeSentence) so the two systems can never
 * drift apart.
 *
 * Dual environment:
 *   - Node:    require("../../js/core/cm-standards.js")
 *   - Browser: window.CRStandards (host page must load cm-standards.js first)
 *
 * Dual export: module.exports (Node) + window.RegistryGrading (browser).
 */
"use strict";

(function () {
  var CR = (typeof require !== "undefined")
    ? require("../../js/core/cm-standards.js")
    : (typeof window !== "undefined" ? window.CRStandards : null);

  if (!CR) {
    throw new Error(
      "grading.js: cm-standards.js not available. In the browser, load " +
      "Solar/js/core/cm-vocab.js then cm-standards.js before this module."
    );
  }

  var api = {
    // Re-exported scales (read-only views of the authoritative source).
    SOURCE_EVAL: CR.SOURCE_EVAL,   // { "1": "Reliable", "2": "Untested", "3": "Not reliable" }
    ASSESSMENT: CR.ASSESSMENT,     // { A..E }
    HANDLING: CR.HANDLING,         // { P, C }

    sourceEvalCodes: function () { return Object.keys(CR.SOURCE_EVAL); },
    assessmentCodes: function () { return Object.keys(CR.ASSESSMENT); },
    handlingCodes: function () { return Object.keys(CR.HANDLING); },

    // Build/validate a bracketed grade like "[1BP]".
    code: function (source, assessment, handling) {
      return CR.gradeCode(source, assessment, handling);
    },
    valid: function (code) { return CR.gradeValid(code); },
    sentence: function (code) { return CR.gradeSentence(code); },

    isSourceEval: function (v) { return Object.prototype.hasOwnProperty.call(CR.SOURCE_EVAL, String(v)); },
    isAssessment: function (v) { return Object.prototype.hasOwnProperty.call(CR.ASSESSMENT, String(v).toUpperCase()); },
    isHandling: function (v) { return Object.prototype.hasOwnProperty.call(CR.HANDLING, String(v).toUpperCase()); }
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryGrading = api; }
})();
