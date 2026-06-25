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
    "CSE - Child Sexual Exploitation",
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

  var api = {
    list: function () { return THREAT_AREAS.slice(); },
    isValid: function (v) { return THREAT_AREAS.indexOf(String(v)) !== -1; }
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryThreatAreas = api; }
})();
