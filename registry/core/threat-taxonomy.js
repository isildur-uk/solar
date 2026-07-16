/* threat-taxonomy.js — authoritative NCA/Atlas CM threat taxonomy for the Registry.
 *
 * Models a threat as a structured triple: { family, subtype, band|null }, e.g.
 * "Money Laundering - High-end money laundering - Band 1". This is the
 * authoritative shape the IR model now carries (see ir-model.js `threats[]`);
 * the legacy single-string threat-areas.js remains only for operation colour /
 * icon / masthead lookups and is NOT the source of truth for typing.
 *
 * Seeded from the Atlas CM "Threat" dropdown families described in the SME gap
 * analysis (docs/design/sample_ir_conformance_audit.md) and the exact
 * strings confirmed in the standard (docs/design/nca_ir_structure_standard.md
 * §6a). EXTENSIBLE: add families / subtypes below without touching call sites.
 * Legacy operation families (ENV, EConC, OAT) are also recognised so existing
 * demo-seed / operations data validates unchanged.
 *
 * Dependency-free. British English.
 * Load order: cm-vocab -> cm-standards -> grading -> threat-taxonomy -> ir-standards.
 * Dual export: module.exports (Node) + window.RegistryThreatTaxonomy (browser).
 */
"use strict";
(function () {

  // Band axis. Some families (Cross-Cutting, Other) are frequently band-less.
  var BANDS = ["Band 1", "Band 2", "Band 3", "Band 4"];

  // family -> { subtypes:[...], bandLess:boolean }. Subtypes are representative,
  // not exhaustive — a free subtype is accepted as long as the family is known.
  var FAMILIES = {
    "Money Laundering": {
      subtypes: ["High-end money laundering", "Cash-based money laundering", "Trade-based money laundering"],
      bandLess: false
    },
    "Drugs": {
      subtypes: ["Cocaine", "Heroin", "Cannabis", "Synthetic drugs", "Drug Trafficking"],
      bandLess: false
    },
    "OIC": {
      subtypes: ["Facilitation of illegal immigration", "Clandestine entry", "Small boats", "Organised Immigration Crime"],
      bandLess: false
    },
    "CSE": {
      subtypes: ["Contact Sexual Abuse of Children", "Online Child Sexual Abuse and Exploitation"],
      bandLess: false
    },
    "Firearms": {
      subtypes: ["Illegal Firearms", "Firearms trafficking", "Conversion / reactivation"],
      bandLess: false
    },
    "Fraud": {
      subtypes: ["Courier fraud", "Investment fraud", "Cyber-enabled fraud"],
      bandLess: false
    },
    "Cyber": {
      subtypes: ["Cyber Crime", "Ransomware", "Network intrusion"],
      bandLess: false
    },
    "BC & Sanctions Evasion": {
      subtypes: ["Bribery, Corruption & Sanctions Evasion", "Sanctions evasion", "Bribery & corruption"],
      bandLess: false
    },
    "MODSL": {
      subtypes: ["Modern Slavery & Human Trafficking", "Labour exploitation", "Sexual exploitation", "Criminal exploitation"],
      bandLess: false
    },
    "Cross-Cutting": {
      subtypes: ["Criminal use of technology", "Border vulnerabilities", "Money laundering enabler"],
      bandLess: true
    },
    // Legacy operation families (threat-areas.js / operations.js) — recognised
    // for back-compatibility so existing reports validate unchanged. These are
    // operation-level areas that predate MoRiLE banding, so they are band-less:
    // a Band may be supplied but is not required for them to validate.
    "ENV": { subtypes: ["Environmental Crime", "Waste crime"], bandLess: true },
    "EConC": { subtypes: ["Economic Crime / Money Laundering", "Economic Crime"], bandLess: true },
    "OAT": { subtypes: ["Organised Acquisitive Crime"], bandLess: true },
    // Escape hatch — always available.
    "Other": { subtypes: [], bandLess: true }
  };

  function str(x) { return (x == null) ? "" : String(x); }
  function trim(x) { return str(x).replace(/^\s+|\s+$/g, ""); }

  // Normalise a band token: "1" | 1 | "Band 1" | "band1" -> "Band 1"; else null.
  function normBand(b) {
    if (b == null || b === "") return null;
    var m = str(b).match(/([1-4])/);
    return m ? ("Band " + m[1]) : null;
  }

  // Case-insensitive family lookup returning the canonical family key or null.
  function canonFamily(f) {
    f = trim(f);
    if (!f) return null;
    if (FAMILIES[f]) return f;
    var lf = f.toLowerCase();
    var keys = Object.keys(FAMILIES);
    for (var i = 0; i < keys.length; i++) { if (keys[i].toLowerCase() === lf) return keys[i]; }
    return null;
  }

  // parse("Money Laundering - High-end money laundering - Band 1")
  //   -> { family:"Money Laundering", subtype:"High-end money laundering", band:"Band 1" }
  // Tolerates 1-part (family only) and 2-part (family + subtype) legacy strings.
  function parse(input) {
    if (input && typeof input === "object") {
      return { family: trim(input.family), subtype: trim(input.subtype), band: normBand(input.band) };
    }
    var s = trim(input);
    if (!s) return { family: "", subtype: "", band: null };
    var parts = s.split(" - ");
    var band = null;
    if (parts.length > 1 && /^band\s*[1-4]$/i.test(trim(parts[parts.length - 1]))) {
      band = normBand(parts.pop());
    }
    var family = trim(parts.shift());
    var subtype = trim(parts.join(" - "));
    return { family: family, subtype: subtype, band: band };
  }

  // format({family,subtype,band}) -> "Family - Subtype - Band N" (omitting empties).
  function format(obj) {
    obj = obj || {};
    var bits = [];
    if (trim(obj.family)) bits.push(trim(obj.family));
    if (trim(obj.subtype)) bits.push(trim(obj.subtype));
    var b = normBand(obj.band);
    if (b) bits.push(b);
    return bits.join(" - ");
  }

  // A threat is valid when its family is recognised AND either a real Band is
  // present OR the family is band-less (Cross-Cutting, Other, legacy operation
  // families). A band-required family with no Band therefore FAILS — this is
  // what discriminates a fully-typed threat from a half-typed one, and free
  // text ("Nonsense" has an unrecognised family and fails). Subtype is optional.
  function isValid(obj) {
    var t = parse(obj);
    var cf = canonFamily(t.family);
    if (!cf) return false;
    // An explicitly-provided band (object form) must be a recognised band —
    // a junk band like "Band 9" is rejected, not silently dropped.
    if (obj && typeof obj === "object" && obj.band != null && trim(obj.band) !== "" && normBand(obj.band) == null) return false;
    if (t.band != null && BANDS.indexOf(t.band) === -1) return false;
    // Band enforcement: a band-required family MUST carry a Band.
    if (t.band == null && !isBandLess(cf)) return false;
    return true;
  }

  function families() { return Object.keys(FAMILIES); }
  function subtypes(family) {
    var cf = canonFamily(family);
    return cf ? FAMILIES[cf].subtypes.slice() : [];
  }
  function bands() { return BANDS.slice(); }
  function isBandLess(family) {
    var cf = canonFamily(family);
    return cf ? !!FAMILIES[cf].bandLess : false;
  }
  // list() -> full authoritative dump: one entry per family with its subtypes.
  function list() {
    return Object.keys(FAMILIES).map(function (f) {
      return { family: f, subtypes: FAMILIES[f].subtypes.slice(), bandLess: !!FAMILIES[f].bandLess };
    });
  }

  var api = {
    BANDS: BANDS,
    families: families,
    subtypes: subtypes,
    bands: bands,
    isBandLess: isBandLess,
    parse: parse,
    format: format,
    isValid: isValid,
    canonFamily: canonFamily,
    normBand: normBand,
    list: list
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryThreatTaxonomy = api; }
})();
