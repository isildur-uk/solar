/* operations.js — Operation buckets. Each report is assigned to an Operation,
 * which belongs to a threat area. 12 SOLAR/space-themed ops, 1 per threat area.
 * Editable. Dual export: module.exports + window.RegistryOperations. */
"use strict";
(function () {
  var T = (typeof require!=="undefined") ? require("./threat-areas.js") : (typeof window!=="undefined"?window.RegistryThreatAreas:null);
  var CSE="CSE - Child Sexual Exploitation",
      MODSL="MODSL - Modern Slavery & Human Trafficking",
      OIC="OIC - Organised Immigration Crime",
      DRUGS="Drugs - Drug Trafficking",
      FIRE="Firearms - Illegal Firearms",
      ECON="EConC - Economic Crime / Money Laundering",
      BCSE="BC & Sanctions Evasion - Bribery, Corruption & Sanctions Evasion",
      FRAUD="Fraud",
      CYBER="Cyber - Cyber Crime",
      OAT="OAT - Organised Acquisitive Crime",
      XTECH="Cross-Cutting - Criminal use of technology",
      XBORDER="Cross-Cutting - Border vulnerabilities";

  var OPERATIONS = [
    { name:"OP NEPTUNE",   threatArea:CSE },
    { name:"OP COMET",     threatArea:MODSL },
    { name:"OP AURORA",    threatArea:OIC },
    { name:"OP QUASAR",    threatArea:DRUGS },
    { name:"OP ORBIT",     threatArea:FIRE },
    { name:"OP HELIOS",    threatArea:ECON },
    { name:"OP VEGA",      threatArea:BCSE },
    { name:"OP TITAN",     threatArea:FRAUD },
    { name:"OP PHOENIX",   threatArea:CYBER },
    { name:"OP SUPERNOVA", threatArea:OAT },
    { name:"OP EQUINOX",   threatArea:XTECH },
    { name:"OP HORIZON",   threatArea:XBORDER }
  ];

  var api = {
    list: function(){ return OPERATIONS.map(function(o){ return { name:o.name, threatArea:o.threatArea }; }); },
    names: function(){ return OPERATIONS.map(function(o){ return o.name; }); },
    byName: function(n){ var f=OPERATIONS.filter(function(o){return o.name===n;}); return f.length?{name:f[0].name,threatArea:f[0].threatArea}:null; },
    threatOf: function(n){ var o=this.byName(n); return o?o.threatArea:""; },
    isValid: function(n){ return OPERATIONS.some(function(o){return o.name===n;}); }
  };
  // sanity: every threatArea (except "Other") used exactly once
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryOperations = api; }
})();
