/* threat-taxonomy.run.js — tests for the structured threat taxonomy.
 * Uses NO fabricated realistic identifiers — only structural/placeholder values. */
"use strict";
var TT = require("../core/threat-taxonomy.js");
var pass = 0, fail = 0;
function ok(c, m){ if(c){pass++;} else {fail++; console.error("  FAIL: " + m);} }
function eq(a, b, m){ ok(a === b, m + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function deepEq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

console.log("Threat taxonomy tests\n");

/* ---- parse ---- */
var p = TT.parse("Money Laundering - High-end money laundering - Band 1");
ok(deepEq(p, { family:"Money Laundering", subtype:"High-end money laundering", band:"Band 1" }), "parse 3-part triple");
ok(deepEq(TT.parse("Fraud"), { family:"Fraud", subtype:"", band:null }), "parse family-only");
ok(deepEq(TT.parse("ENV - Environmental Crime"), { family:"ENV", subtype:"Environmental Crime", band:null }), "parse legacy 2-part");
ok(TT.parse("BC & Sanctions Evasion - Bribery, Corruption & Sanctions Evasion").family === "BC & Sanctions Evasion", "parse family containing ' & '");

/* ---- round-trip: format(parse(str)) === str (byte-for-byte) ---- */
["Money Laundering - High-end money laundering - Band 1",
 "Drugs - Cocaine - Band 1",
 "OIC - Facilitation of illegal immigration - Band 1",
 "CSE - Contact Sexual Abuse of Children - Band 1",
 "Fraud",
 "Cross-Cutting - Criminal use of technology"].forEach(function(s){
  eq(TT.format(TT.parse(s)), s, "round-trip format(parse(x))===x for '" + s + "'");
});

/* ---- round-trip: parse(format(obj)) deep-equals obj ---- */
var obj = { family:"Drugs", subtype:"Cocaine", band:"Band 1" };
ok(deepEq(TT.parse(TT.format(obj)), obj), "round-trip parse(format(obj)) deep-equals obj");

/* ---- isValid ---- */
ok(TT.isValid("Money Laundering - High-end money laundering - Band 1"), "well-formed threat valid");
ok(TT.isValid("Other"), "band-less family-only valid (Other)");
ok(TT.isValid({ family:"Drugs", subtype:"Cocaine", band:"1" }), "object with bare band digit valid");
ok(!TT.isValid("Nonsense"), "unrecognised family rejected");
ok(!TT.isValid("Nonsense - Something - Band 1"), "unrecognised family (typed) rejected");
ok(!TT.isValid({ family:"Drugs", subtype:"Cocaine", band:"Band 9" }), "out-of-range band rejected");

/* ---- band enforcement: a band-required family MUST carry a Band ---- */
ok(!TT.isValid("Drugs - Cocaine"), "band-required family without a Band rejected");
ok(TT.isValid("Drugs - Cocaine - Band 1"), "band-required family with a Band accepted");
ok(TT.isValid("Cross-Cutting - Criminal use of technology"), "genuinely band-less family passes without a Band");
ok(TT.isValid({ family:"Cross-Cutting", subtype:"Border vulnerabilities" }), "band-less family (object form) passes without a Band");

/* every legacy operations family must validate (back-compat). Band-required
   families now need a Band; the legacy operation families ENV/EConC/OAT and
   Cross-Cutting are band-less and validate without one. */
["ENV - Environmental Crime","MODSL - Modern Slavery & Human Trafficking - Band 1","OIC - Organised Immigration Crime - Band 1",
 "Drugs - Drug Trafficking - Band 1","Firearms - Illegal Firearms - Band 1","EConC - Economic Crime / Money Laundering",
 "BC & Sanctions Evasion - Bribery, Corruption & Sanctions Evasion - Band 1","Fraud - Investment fraud - Band 1","Cyber - Cyber Crime - Band 1",
 "OAT - Organised Acquisitive Crime","Cross-Cutting - Criminal use of technology","Cross-Cutting - Border vulnerabilities"
].forEach(function(s){ ok(TT.isValid(s), "legacy operations family valid: '" + s + "'"); });

/* ---- families/subtypes/bands/list ---- */
ok(TT.families().indexOf("Money Laundering") !== -1, "families() includes Money Laundering");
ok(TT.families().indexOf("Other") !== -1, "families() keeps the Other escape hatch");
ok(TT.subtypes("Drugs").indexOf("Cocaine") !== -1, "subtypes(Drugs) includes Cocaine");
eq(TT.bands().length, 4, "four bands");
ok(TT.isBandLess("Cross-Cutting"), "Cross-Cutting is band-less");
ok(Array.isArray(TT.list()) && TT.list().length === TT.families().length, "list() returns one entry per family");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
