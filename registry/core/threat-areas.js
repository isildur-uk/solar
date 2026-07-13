/* threat-areas.js — representative threat-area taxonomy for the Registry.
 *
 * PROVISIONAL / REPLACEABLE. This mirrors the *shape* of the Atlas CM "Threat"
 * category list (threat family + optional band) using publicly-describable SOC
 * threat families. Swap the array for the exact operational taxonomy when
 * supplied — nothing else in the codebase hardcodes these values.
 *
 * Dual export: module.exports (Node) + window.RegistryThreatAreas (browser).
 */
"use strict";

(function () {
  var THREAT_AREAS = [
    "ENV - Environmental Crime",
    "MODSL - Modern Slavery & Human Trafficking",
    "OIC - Organised Immigration Crime",
    "Drugs - Drug Trafficking",
    "Firearms - Illegal Firearms",
    "EConC - Economic Crime / Money Laundering",
    "BC & Sanctions Evasion - Bribery, Corruption & Sanctions Evasion",
    "Fraud",
    "Cyber - Cyber Crime",
    "OAT - Organised Acquisitive Crime",
    "Cross-Cutting - Criminal use of technology",
    "Cross-Cutting - Border vulnerabilities",
    "Other"
  ];

  var THREAT_COLOURS = {
    "ENV - Environmental Crime": "#5f9e86",
    "MODSL - Modern Slavery & Human Trafficking": "#d88c6e",
    "OIC - Organised Immigration Crime": "#6ea8d8",
    "Drugs - Drug Trafficking": "#79c98f",
    "Firearms - Illegal Firearms": "#c9c36a",
    "EConC - Economic Crime / Money Laundering": "#a8c97f",
    "BC & Sanctions Evasion - Bribery, Corruption & Sanctions Evasion": "#d8a16e",
    "Fraud": "#c98f8f",
    "Cyber - Cyber Crime": "#5fc4c0",
    "OAT - Organised Acquisitive Crime": "#7fb0c9",
    "Cross-Cutting - Criminal use of technology": "#9aa5b1",
    "Cross-Cutting - Border vulnerabilities": "#8d99ae",
    "Other": "#6b7280"
  };
  /* Official NCA threat-area pictograms (glyph-only PNG, painted through --ta via CSS mask).
     Only the nine mapped families have an icon; the rest fall back to the plain colour swatch. */
  var THREAT_ICONS = {
    "OIC - Organised Immigration Crime": "organised-immigration-crime",
    "MODSL - Modern Slavery & Human Trafficking": "modern-slavery",
    "Drugs - Drug Trafficking": "drug-trafficking",
    "Firearms - Illegal Firearms": "illegal-firearms",
    "EConC - Economic Crime / Money Laundering": "money-laundering",
    "BC & Sanctions Evasion - Bribery, Corruption & Sanctions Evasion": "bribery-corruption-sanctions",
    "Fraud": "fraud",
    "Cyber - Cyber Crime": "cyber-crime",
    "Cross-Cutting - Border vulnerabilities": "border-vulnerabilities"
  };
  var api = {
    list: function () { return THREAT_AREAS.slice(); },
    isValid: function (v) { return THREAT_AREAS.indexOf(String(v)) !== -1; },
    colour: function (v) { return THREAT_COLOURS[String(v)] || "#8d99ae"; },
    icon: function (v) { return THREAT_ICONS[String(v)] || ""; },
    short: function (v) { v = String(v); var i = v.indexOf(" - "); return i > 0 ? v.slice(0, i) : v; }
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryThreatAreas = api; }
})();
