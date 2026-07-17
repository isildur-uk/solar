/* cm-standards.js — authoritative ATLAS CM data-standards layer.
 *
 * Single source of truth for how entities/attributes are validated,
 * standardised and labelled to NCA ATLAS CM data standards, and how chart
 * link types map to i2 Analyst's Notebook semantic types + line strengths.
 *
 * Dependency-free except for the sibling data module cm-vocab.js.
 * Dual export: window.CRStandards (browser) + module.exports (Node).
 *
 * Design notes:
 *  - CM only. KB conventions (e.g. the "+" phone prefix) are NOT implemented.
 *  - Validators are regex/structure based and never emit realistic specimen
 *    identifier values.
 *  - Every formatter is idempotent: format(format(x)) === format(x).
 *  - Unknown controlled-vocab values are preserved ("keep raw"), never thrown
 *    away — extraction must degrade gracefully.
 */
"use strict";

var V = (typeof require !== "undefined")
  ? require("./cm-vocab.js")
  : (typeof window !== "undefined" ? window.CRVocab : {});
V = V || {};

var S = {};
S.VERSION = "2026-06-16";
S.vocab = V;

/* ================================================================== */
/*  Low-level helpers                                                   */
/* ================================================================== */
function str(x) { return (x == null) ? "" : String(x); }
function trim(x) { return str(x).replace(/^\s+|\s+$/g, ""); }
function collapseWs(x) { return trim(x).replace(/\s+/g, " "); }
function digitsOnly(x) { return str(x).replace(/[^0-9]/g, ""); }
function alnumUpper(x) { return str(x).toUpperCase().replace(/[^0-9A-Z]/g, ""); }
function lc(x) { return str(x).toLowerCase(); }

S._helpers = { str: str, trim: trim, collapseWs: collapseWs, digitsOnly: digitsOnly, alnumUpper: alnumUpper };

/* Sections appended below. */

/* ================================================================== */
/*  NAMES (CM rules)                                                    */
/* ================================================================== */
/* Title-case a token, honouring Mc/Mac and hyphen/apostrophe compounds. */
function titleCaseToken(t) {
  t = trim(t);
  if (!t) return "";
  function capWord(w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }
  // split on hyphen / apostrophe, keeping the delimiters, capitalise each part
  return t.split(/([-'])/).map(function (part) {
    if (part === "-" || part === "'") return part;
    var w = lc(part);
    if (/^mc[a-z]/.test(w)) return "Mc" + w.charAt(2).toUpperCase() + w.slice(3);
    if (/^mac[a-z]/.test(w)) return "Mac" + w.charAt(3).toUpperCase() + w.slice(4);
    return capWord(w);
  }).join("");
}

/* SURNAME in caps; particles (van, de…) joined and kept as part of surname. */
function surnameCaps(s) {
  s = collapseWs(s);
  if (!s) return "";
  return s.toUpperCase();
}

/* Forename(s) in Title Case (handles Mc/Mac/O'/hyphen). */
function forenameTitle(s) {
  s = collapseWs(s);
  if (!s) return "";
  return s.split(/\s+/).map(titleCaseToken).join(" ");
}

var TITLE_SET = {};
(V.TITLES || []).forEach(function (t) { TITLE_SET[lc(t)] = t; });
var SUFFIX_SET = {};
(V.PERSON_SUFFIXES || []).forEach(function (t) { SUFFIX_SET[lc(t.replace(/\./g, ""))] = t; });
var PARTICLE_SET = {};
(V.NAME_PARTICLES || []).forEach(function (t) { PARTICLE_SET[lc(t)] = true; });

/* Split a free name into { title, forenames, surname, suffix }.
 * Heuristic: leading recognised title; trailing recognised suffix; the LAST
 * non-particle token (plus any preceding particles) is the surname; the rest
 * are forenames. Handles "SURNAME, Forename" comma form too. */
function splitName(raw) {
  var out = { title: "", forenames: "", surname: "", suffix: "" };
  var s = collapseWs(raw);
  if (!s) return out;

  // Comma form: "Surname, Forename Title"
  var comma = s.split(",");
  if (comma.length === 2 && trim(comma[0]) && trim(comma[1])) {
    out.surname = surnameCaps(comma[0]);
    var rest = trim(comma[1]).split(/\s+/);
    if (rest.length && TITLE_SET[lc(rest[0].replace(/\./g, ""))]) { out.title = TITLE_SET[lc(rest[0].replace(/\./g, ""))]; rest.shift(); }
    out.forenames = forenameTitle(rest.join(" "));
    return out;
  }

  var toks = s.split(/\s+/);
  // leading title
  if (toks.length > 1 && TITLE_SET[lc(toks[0].replace(/\./g, ""))]) { out.title = TITLE_SET[lc(toks[0].replace(/\./g, ""))]; toks.shift(); }
  // trailing suffix
  if (toks.length > 1) {
    var last = lc(toks[toks.length - 1].replace(/\./g, ""));
    if (SUFFIX_SET[last]) { out.suffix = SUFFIX_SET[last]; toks.pop(); }
  }
  if (!toks.length) return out;
  if (toks.length === 1) { out.surname = surnameCaps(toks[0]); return out; }

  // surname = trailing particles + last token
  var i = toks.length - 1;
  var surnameParts = [toks[i]];
  i--;
  while (i >= 1 && PARTICLE_SET[lc(toks[i])]) { surnameParts.unshift(toks[i]); i--; }
  out.surname = surnameCaps(surnameParts.join(" "));
  out.forenames = forenameTitle(toks.slice(0, i + 1).join(" "));
  return out;
}

/* CM display label for a person node: "Forename SURNAME" (+ suffix). */
function personLabelCM(raw) {
  var p = (raw && typeof raw === "object" && raw.surname != null) ? raw : splitName(raw);
  var bits = [];
  if (p.forenames) bits.push(p.forenames);
  if (p.surname) bits.push(p.surname);
  var lbl = bits.join(" ");
  if (p.suffix) lbl += " " + p.suffix;
  return collapseWs(lbl);
}

/* ORGANISATION caps rule: company-type words abbreviated & upper-cased. */
var ORG_REPLACE = [
  [/\blimited\b/gi, "LTD"], [/\bltd\.?\b/gi, "LTD"],
  [/\bpublic limited company\b/gi, "PLC"], [/\bplc\.?\b/gi, "PLC"],
  [/\bcompany\b/gi, "CO"], [/\bcorporation\b/gi, "CORP"],
  [/\bincorporated\b/gi, "INC"], [/\binc\.?\b/gi, "INC"],
  [/\bllp\.?\b/gi, "LLP"], [/\bcic\.?\b/gi, "CIC"],
  [/\b&\b/g, "&"]
];
function organisationCaps(s) {
  s = collapseWs(s);
  if (!s) return "";
  s = s.toUpperCase();
  ORG_REPLACE.forEach(function (r) { s = s.replace(r[0], r[1]); });
  return collapseWs(s);
}

S.titleCaseToken = titleCaseToken;
S.surnameCaps = surnameCaps;
S.forenameTitle = forenameTitle;
S.splitName = splitName;
S.personLabelCM = personLabelCM;
S.organisationCaps = organisationCaps;
S.TITLES = V.TITLES || [];
S.PERSON_SUFFIXES = V.PERSON_SUFFIXES || [];

/* ================================================================== */
/*  DATES & TIME (CM: DD/MM/YYYY, DOB DD/MM/CCYY, 24h time)             */
/* ================================================================== */
var MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };

function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }

/* Parse many human/ISO date forms -> {d,m,y} or null. */
function parseDateParts(raw) {
  var s = collapseWs(raw);
  if (!s) return null;
  var m;
  // ISO yyyy-mm-dd (or yyyy/mm/dd)
  if ((m = s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/))) {
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (CM native order: day first)
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) {
    var yy = +m[3]; if (yy < 100) yy += (yy <= 30 ? 2000 : 1900);
    return { d: +m[1], m: +m[2], y: yy };
  }
  // 12 March 2024  /  12th Mar 24
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s+(\d{2,4})$/))) {
    var mo = MONTHS[lc(m[2])]; if (!mo) return null;
    var y3 = +m[3]; if (y3 < 100) y3 += (y3 <= 30 ? 2000 : 1900);
    return { d: +m[1], m: mo, y: y3 };
  }
  // March 12, 2024
  if ((m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/))) {
    var mo2 = MONTHS[lc(m[1])]; if (!mo2) return null;
    var y4 = +m[3]; if (y4 < 100) y4 += (y4 <= 30 ? 2000 : 1900);
    return { d: +m[2], m: mo2, y: y4 };
  }
  return null;
}

function validDate(p) {
  if (!p) return false;
  if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31 || p.y < 1000) return false;
  var dim = [31, ((p.y%4===0&&p.y%100!==0)||p.y%400===0)?29:28, 31,30,31,30,31,31,30,31,30,31];
  return p.d <= dim[p.m - 1];
}

/* DD/MM/YYYY. Accepts Date, ISO, or human strings. Returns "" if unparseable. */
function ddmmyyyy(raw) {
  if (raw instanceof Date && !isNaN(raw)) return pad2(raw.getDate()) + "/" + pad2(raw.getMonth() + 1) + "/" + raw.getFullYear();
  var p = parseDateParts(raw);
  if (!validDate(p)) return "";
  return pad2(p.d) + "/" + pad2(p.m) + "/" + p.y;
}
var dobCM = ddmmyyyy; // DOB uses the same DD/MM/CCYY shape.
function todayDDMMYYYY() { return ddmmyyyy(new Date()); }
function dateValid(raw) { return ddmmyyyy(raw) !== ""; }

/* 24h time HH:MM[:SS], optional (Local)/(Zulu) qualifier preserved. */
function time24(raw) {
  var s = collapseWs(raw);
  if (!s) return "";
  var qual = "";
  var qm = s.match(/\((local|zulu|utc|bst|gmt)\)/i);
  if (qm) qual = " (" + (qm[1].toUpperCase() === "LOCAL" ? "Local" : qm[1].toUpperCase()) + ")";
  var m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return "";
  var h = +m[1], mins = +m[2], secs = m[3] != null ? +m[3] : null;
  if (m[4]) { var ap = lc(m[4]); if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0; }
  if (h > 23 || mins > 59 || (secs != null && secs > 59)) return "";
  return pad2(h) + ":" + pad2(mins) + (secs != null ? ":" + pad2(secs) : "") + qual;
}

S.ddmmyyyy = ddmmyyyy;
S.dobCM = dobCM;
S.todayDDMMYYYY = todayDDMMYYYY;
S.dateValid = dateValid;
S.parseDateParts = parseDateParts;
S.time24 = time24;

/* ================================================================== */
/*  PHONE (CM: UK national 0…, intl 00CC…, no "+" , no spaces)          */
/* ================================================================== */
/* A phone value is CORRUPT / non-recoverable if it is not purely a phone.
 * The big one: Excel exports large numbers in scientific notation (e.g. a
 * comms result renders 447536935630 as "4.47E+11"), which is LOSSY — the
 * subscriber digits are gone. We must NEVER fabricate a number from it. Any
 * letter (other than a leading "+") — incl. the "E" of sci-notation — or a
 * bare "e"/"E" means this is not a usable phone value. */
function phoneLooksCorrupt(raw) {
  var s = trim(raw);
  if (!s) return false;
  return /[a-zA-Z]/.test(s.replace(/^\s*\+/, ""));
}
function phoneCM(raw) {
  var s = trim(raw);
  if (!s) return "";
  if (phoneLooksCorrupt(s)) return "";      // sci-notation / gibberish -> do not fabricate
  var hadPlus = /^\s*\+/.test(s);
  var d = digitsOnly(s);
  if (!d) return "";
  if (hadPlus) {                                   // +CC...
    if (d.indexOf("44") === 0) return "0" + d.slice(2);   // UK -> national
    return "00" + d;                                       // intl -> 00CC...
  }
  if (d.indexOf("00") === 0) {                      // already 00...
    if (d.indexOf("0044") === 0) return "0" + d.slice(4);
    return d;
  }
  if (d.indexOf("44") === 0 && d.length >= 11) return "0" + d.slice(2); // bare 44...
  if (d.indexOf("0") === 0) return d;               // national 0...
  return "0" + d;                                   // bare subscriber -> assume UK
}
/* Loose validity: UK national 10–11 digits, or intl 00 + 7–15 digits. */
function phoneValid(raw) {
  var cm = phoneCM(raw);
  if (!cm) return false;
  if (cm.indexOf("00") === 0) return /^00\d{7,15}$/.test(cm);
  return /^0\d{9,10}$/.test(cm);
}

S.phoneCM = phoneCM;
S.phoneValid = phoneValid;
S.phoneLooksCorrupt = phoneLooksCorrupt;

/* ================================================================== */
/*  CURRENCY (CM: ISO code + amount; minus for negative)               */
/* ================================================================== */
/* Parse a money string -> { code, amount(Number), neg } or null. */
function parseAmount(raw) {
  var s = collapseWs(raw);
  if (!s) return null;
  var neg = /^-|\(\s*[^)]*\)/.test(s) || /\bminus\b/i.test(s);
  // explicit 3-letter code
  var code = null, m;
  if ((m = s.match(/\b([A-Za-z]{3})\b/)) && V.CURRENCY_CODES && V.CURRENCY_CODES[m[1].toUpperCase()]) {
    code = m[1].toUpperCase();
  }
  // symbol
  if (!code) {
    for (var sym in (V.CURRENCY_SYMBOLS || {})) {
      if (s.indexOf(sym) !== -1) { code = V.CURRENCY_SYMBOLS[sym]; break; }
    }
  }
  var numMatch = s.replace(/[A-Za-z]{3}/g, "").match(/[\d.,]+/);
  if (!numMatch) return null;
  var numStr = numMatch[0].replace(/,/g, "");
  var amount = parseFloat(numStr);
  if (isNaN(amount)) return null;
  return { code: code, amount: amount, neg: neg };
}
/* Format to CM string, e.g. "GBP 1500" / "GBP -250.50". Unknown code kept raw. */
function currencyCM(raw) {
  var p = parseAmount(raw);
  // Only reformat when a currency was confidently recognised; otherwise keep
  // the original string verbatim (unknown code / no code -> "keep raw").
  if (!p || p.code == null) return collapseWs(raw);
  var n = p.amount;
  var amtStr = (Math.round(n * 100) % 100 === 0) ? String(Math.round(n)) : n.toFixed(2);
  if (p.neg && amtStr.charAt(0) !== "-") amtStr = "-" + amtStr;
  return p.code ? (p.code + " " + amtStr) : amtStr;
}
function currencyName(code) { var c = (V.CURRENCY_CODES || {})[str(code).toUpperCase()]; return c ? c.name : null; }

S.parseAmount = parseAmount;
S.currencyCM = currencyCM;
S.currencyName = currencyName;
S.CURRENCY_CODES = V.CURRENCY_CODES || {};

/* ================================================================== */
/*  IDENTIFIERS — validate + canonical-format + CM free-text           */
/* ================================================================== */
/* Each identifier definition exposes:
 *   label     human name
 *   validate(raw) -> boolean (structure only; never network/checksum-luhn
 *                    unless noted)
 *   canonical(raw) -> the bare standardised value (no prefix)
 *   freeText(raw)  -> CM free-text rendering (prefix + canonical)
 * Definitions are intentionally regex/structure based — no specimen values. */
var ID = {};

ID.account = {
  label: "Bank Account",
  canonical: function (raw) {
    var d = digitsOnly(raw);
    if (d && d.length <= 8) return ("00000000" + d).slice(-8);   // pad to 8
    return alnumUpper(raw).slice(0, 18);                          // building society
  },
  validate: function (raw) {
    var d = digitsOnly(raw);
    if (d.length >= 1 && d.length <= 8 && d === alnumUpper(raw)) return true;
    return alnumUpper(raw).length >= 1 && alnumUpper(raw).length <= 18;
  },
  freeText: function (raw) { return "AC " + ID.account.canonical(raw); }
};

ID.sortCode = {
  label: "Sort Code",
  canonical: function (raw) { return digitsOnly(raw).slice(0, 6); },
  validate: function (raw) { return /^\d{6}$/.test(digitsOnly(raw)); },
  freeText: function (raw) { return "SC " + ID.sortCode.canonical(raw); }
};

ID.creditCard = {
  label: "Payment Card",
  canonical: function (raw) { return digitsOnly(raw).slice(0, 18); },
  validate: function (raw) { var d = digitsOnly(raw); return d.length >= 12 && d.length <= 18; },
  freeText: function (raw) { return "CC " + ID.creditCard.canonical(raw); }
};

ID.cro = {
  label: "CRO Number",
  canonical: function (raw) {
    var s = alnumUpper(raw).replace(/^(SCRO|CRO)/, "");
    var m = str(raw).toUpperCase().match(/(S?)\s*(\d{1,7})\s*\/\s*(\d{2})\s*([A-Z])/);
    if (m) return (m[1] || "") + m[2] + "/" + m[3] + m[4];
    return s;
  },
  validate: function (raw) { return /^S?\d{1,7}\/\d{2}[A-Z]$/.test(ID.cro.canonical(raw)); },
  freeText: function (raw) { var c = ID.cro.canonical(raw); return (c.charAt(0) === "S" ? "SCRO " : "CRO ") + c; }
};

ID.pnc = {
  label: "PNC ID",
  canonical: function (raw) {
    var m = str(raw).toUpperCase().match(/(\d{2,4})\s*\/\s*(\d{1,7})\s*([A-Z])/);
    if (m) { var yr = m[1].length === 4 ? m[1].slice(-2) : m[1]; return yr + "/" + m[2] + m[3]; }
    return alnumUpper(raw).replace(/^PNC/, "");
  },
  validate: function (raw) { return /^\d{2}\/\d{1,7}[A-Z]$/.test(ID.pnc.canonical(raw)); },
  freeText: function (raw) { return "PNC " + ID.pnc.canonical(raw); }
};

var NINO_BAD_FIRST = { D:1, F:1, I:1, Q:1, U:1, V:1 };
var NINO_BAD_SECOND = { D:1, F:1, I:1, O:1, Q:1, U:1, V:1 };
var NINO_BAD_PREFIX = { BG:1, GB:1, NK:1, KN:1, TN:1, NT:1, ZZ:1 };
ID.nino = {
  label: "National Insurance Number",
  canonical: function (raw) { return alnumUpper(raw).replace(/^NINO/, "").slice(0, 9); },
  validate: function (raw) {
    var c = ID.nino.canonical(raw);
    if (!/^[A-Z]{2}\d{6}[A-D]$/.test(c)) return false;
    if (NINO_BAD_FIRST[c[0]] || NINO_BAD_SECOND[c[1]]) return false;
    if (NINO_BAD_PREFIX[c.slice(0, 2)]) return false;
    return true;
  },
  freeText: function (raw) {
    var c = ID.nino.canonical(raw);
    // CM spaces NINO in pairs for display
    var spaced = c.replace(/^([A-Z]{2})(\d{2})(\d{2})(\d{2})([A-D])$/, "$1 $2 $3 $4 $5");
    return "NINO " + (spaced || c);
  }
};

ID.nib = {
  label: "NIB Number",
  canonical: function (raw) {
    var m = str(raw).toUpperCase().match(/(\d{1,6})\s*\/\s*(\d{2})/);
    return m ? (m[1] + "/" + m[2]) : alnumUpper(raw).replace(/^NIB/, "");
  },
  validate: function (raw) { return /^\d{1,6}\/\d{2}$/.test(ID.nib.canonical(raw)); },
  freeText: function (raw) { return "NIB " + ID.nib.canonical(raw); }
};

ID.passport = {
  label: "Passport",
  canonical: function (raw) {
    // number only: 9 digits (current) or 6 digits + 1 alpha (legacy)
    var s = alnumUpper(raw).replace(/^PPT/, "");
    var m = s.match(/(\d{9}|\d{6}[A-Z])/);
    return m ? m[1] : s;
  },
  validate: function (raw) { return /^(\d{9}|\d{6}[A-Z])$/.test(ID.passport.canonical(raw)); },
  // optional country qualifier preserved; matched against the working list
  freeText: function (raw, country) {
    var num = ID.passport.canonical(raw);
    var c = country ? collapseWs(country) : "";
    if (c) {
      var hit = (V.PASSPORT_COUNTRIES || []).filter(function (n) { return lc(n) === lc(c); })[0];
      if (hit) c = hit;
    }
    return "PPT " + num + (c ? " " + c : "");
  },
  countryKnown: function (country) {
    return (V.PASSPORT_COUNTRIES || []).some(function (n) { return lc(n) === lc(collapseWs(country)); });
  }
};

ID.driverLicence = {
  label: "Driver Licence",
  canonical: function (raw) { return alnumUpper(raw).replace(/^DRV/, "").slice(0, 16); },
  validate: function (raw) {
    var c = ID.driverLicence.canonical(raw);
    // 16 chars: 5 surname, 6 date digits, 2 initials, 1 arbitrary digit, 2 check letters
    if (!/^[A-Z9]{5}\d{6}[A-Z9]{2}\d[A-Z]{2}$/.test(c)) return false;
    var mm = +c.slice(6, 8);                 // month (female: +50)
    var dd = +c.slice(8, 10);                // day
    var monthOk = (mm >= 1 && mm <= 12) || (mm >= 51 && mm <= 62);
    var dayOk = dd >= 1 && dd <= 31;
    return monthOk && dayOk;
  },
  freeText: function (raw) { return "DRV " + ID.driverLicence.canonical(raw); }
};

ID.vat = {
  label: "VAT Number",
  canonical: function (raw) { return digitsOnly(raw).slice(0, 12); },
  validate: function (raw) { var d = digitsOnly(raw); return d.length === 9 || d.length === 12; },
  freeText: function (raw) { return "VAT " + ID.vat.canonical(raw); }
};

ID.hmrc = {
  label: "HMRC Reference",
  canonical: function (raw) { return alnumUpper(raw).replace(/^HMRC/, ""); },
  validate: function (raw) { return ID.hmrc.canonical(raw).length >= 4; },
  freeText: function (raw) { return "HMRC " + ID.hmrc.canonical(raw); }
};

ID.companiesHouse = {
  label: "Companies House Number",
  canonical: function (raw) { return alnumUpper(raw).replace(/^(COMPANIESHOUSE|CH)/, "").slice(0, 8); },
  validate: function (raw) { return /^(\d{8}|[A-Z]{2}\d{6})$/.test(ID.companiesHouse.canonical(raw)); },
  freeText: function (raw) { return "Companies House " + ID.companiesHouse.canonical(raw); }
};

ID.charity = {
  label: "Registered Charity Number",
  canonical: function (raw) { return alnumUpper(raw).replace(/^(REGISTEREDCHARITYNUMBER|CHARITY)/, ""); },
  validate: function (raw) { var c = ID.charity.canonical(raw); return /^\d{6,8}(-\d{1,2})?$/.test(c) || /^SC\d{6}$/.test(c); },
  freeText: function (raw) { return "Registered Charity Number " + ID.charity.canonical(raw); }
};

ID.vrm = {
  label: "Vehicle Registration Mark",
  canonical: function (raw) { return alnumUpper(raw).replace(/^VRM/, ""); }, // caps, no spaces
  validate: function (raw) { var c = ID.vrm.canonical(raw); return c.length >= 2 && c.length <= 8; },
  freeText: function (raw) { return "VRM " + ID.vrm.canonical(raw); }
};

ID.vin = {
  label: "Vehicle Identification Number",
  canonical: function (raw) { return alnumUpper(raw).replace(/^VIN/, "").slice(0, 17); },
  validate: function (raw) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(ID.vin.canonical(raw)); }, // no I,O,Q
  freeText: function (raw) { return "VIN " + ID.vin.canonical(raw); }
};

ID.engine = {
  label: "Engine Number",
  canonical: function (raw) { return alnumUpper(raw).replace(/^ENGINE/, ""); },
  validate: function (raw) { return ID.engine.canonical(raw).length >= 3; },
  freeText: function (raw) { return "Engine " + ID.engine.canonical(raw); }
};

ID.serial = {
  label: "Serial Number",
  canonical: function (raw) { return alnumUpper(raw).replace(/^SERIAL/, ""); },
  validate: function (raw) { return ID.serial.canonical(raw).length >= 3; },
  freeText: function (raw) { return "Serial " + ID.serial.canonical(raw); }
};

function handleCanon(raw, strip) { return collapseWs(str(raw).replace(strip, "")).replace(/\s+/g, ""); }
ID.icq    = { label: "ICQ",     canonical: function (r) { return digitsOnly(r); }, validate: function (r) { return digitsOnly(r).length >= 5; }, freeText: function (r) { return "ICQ " + digitsOnly(r); } };
ID.jabber = { label: "Jabber",  canonical: function (r) { return handleCanon(r, /^jabber/i).toLowerCase(); }, validate: function (r) { return /@/.test(ID.jabber.canonical(r)); }, freeText: function (r) { return "Jabber " + ID.jabber.canonical(r); } };
ID.skype  = { label: "Skype",   canonical: function (r) { return handleCanon(r, /^skype/i); }, validate: function (r) { return ID.skype.canonical(r).length >= 3; }, freeText: function (r) { return "Skype " + ID.skype.canonical(r); } };
ID.twitter = { label: "Twitter / X", canonical: function (r) { return handleCanon(r, /^(twitter|x)\s*/i).replace(/^@/, ""); }, validate: function (r) { return /^[A-Za-z0-9_]{1,15}$/.test(ID.twitter.canonical(r)); }, freeText: function (r) { return "Twitter " + ID.twitter.canonical(r); } };

ID.ip = {
  label: "IP Address",
  canonical: function (raw) { return collapseWs(raw).replace(/^ip\s*address/i, "").replace(/\s+/g, ""); },
  validate: function (raw) {
    var c = ID.ip.canonical(raw);
    var v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(c);
    if (v4) return v4.slice(1).every(function (o) { return +o <= 255; });
    return /^[0-9A-Fa-f:]+$/.test(c) && c.indexOf(":") !== -1; // loose IPv6
  },
  freeText: function (raw) { return "IP Address " + ID.ip.canonical(raw); }
};

S.identifiers = ID;
/* Convenience dispatchers. type = key of ID. */
S.validateId = function (type, raw) { return ID[type] ? ID[type].validate(raw) : false; };
S.canonicalId = function (type, raw) { return ID[type] ? ID[type].canonical(raw) : collapseWs(raw); };
S.freeTextId = function (type, raw, extra) { return ID[type] ? ID[type].freeText(raw, extra) : collapseWs(raw); };

/* ================================================================== */
/*  INTELLIGENCE GRADING (CM 3x5x2, code form [1BP])                    */
/* ================================================================== */
S.SOURCE_EVAL = {
  "1": "Reliable",
  "2": "Untested",
  "3": "Not reliable"
};
/* Intelligence (information) evaluation — the "5" of 3x5x2, using the
 * authoritative College of Policing APP wording ("Completing an intelligence
 * report", 3x5x2 process). This REPLACES the legacy NIM 5x5x5 phrasing.
 * Keys A-E and the API are unchanged; only the human wording is corrected. */
S.ASSESSMENT = {
  "A": "Known directly",
  "B": "Known indirectly but corroborated",
  "C": "Known indirectly",
  "D": "Not known",
  "E": "Suspected to be false"
};
S.HANDLING = {
  "P": "Lawful sharing permitted",
  "C": "Lawful sharing permitted subject to conditions"
};

function gradeCode(source, assessment, handling) {
  source = str(source).toUpperCase().slice(0, 1) || "2";
  assessment = str(assessment).toUpperCase().slice(0, 1) || "B";
  handling = str(handling).toUpperCase().slice(0, 1) || "P";
  if (!S.SOURCE_EVAL[source]) source = "2";
  if (!S.ASSESSMENT[assessment]) assessment = "B";
  if (!S.HANDLING[handling]) handling = "P";
  return "[" + source + assessment + handling + "]";
}
function gradeValid(code) { return /^\[[1-3][A-E][PC]\]$/.test(str(code).toUpperCase()); }
function gradeSentence(code) {
  var m = str(code).toUpperCase().match(/^\[?([1-3])([A-E])([PC])\]?$/);
  if (!m) return "";
  return S.SOURCE_EVAL[m[1]] + "; " + S.ASSESSMENT[m[2]] + "; " + S.HANDLING[m[3]] + ".";
}
/* Map an internal confidence to a default CM grade (until graded by hand). */
var CONF_TO_GRADE = { high: ["1", "A", "P"], med: ["2", "B", "P"], low: ["3", "D", "P"] };
function migrateProvenance(conf) {
  var g = CONF_TO_GRADE[lc(conf)] || CONF_TO_GRADE.med;
  return { code: gradeCode(g[0], g[1], g[2]), source: g[0], assessment: g[1], handling: g[2] };
}
S.gradeCode = gradeCode;
S.gradeValid = gradeValid;
S.gradeSentence = gradeSentence;
S.gradeFromConfidence = migrateProvenance; /* confidence -> default CM grade */

/* ================================================================== */
/*  i2 LINE STRENGTH (from confidence)                                  */
/* ================================================================== */
/* i2 Analyst's Notebook renders certainty as line strength:
 *   Confirmed  = solid, Unconfirmed = dashed, Tentative = dotted. */
var LINE_STRENGTH = {
  high: { strength: "Confirmed",   dash: false },
  med:  { strength: "Unconfirmed", dash: [6, 4] },
  low:  { strength: "Tentative",   dash: [2, 4] }
};
function lineStrength(conf) { return LINE_STRENGTH[lc(conf)] || LINE_STRENGTH.med; }
S.lineStrength = lineStrength;
S.LINE_STRENGTH = LINE_STRENGTH;

/* i2 Import Playbook mandate: line strength = SOURCE reliability, not internal
 * confidence. Map the 3x5x2 source evaluation (1 Reliable / 2 Untested /
 * 3 Not reliable) to the same LINE_STRENGTH tokens the ANX writer expects
 * (1 -> Confirmed/solid, 2 -> Unconfirmed/dashed, 3 -> Tentative/dotted).
 * Dependency-free; accepts "1"/"2"/"3" or a leading-graded string. Unknown
 * grades fall back to Unconfirmed (med), matching gradeCode's default. */
var GRADE_TO_STRENGTH = { "1": "high", "2": "med", "3": "low" };
function lineStrengthFromGrade(sourceEval) {
  var key = GRADE_TO_STRENGTH[str(sourceEval).replace(/^\[/, "").slice(0, 1)];
  return LINE_STRENGTH[key] || LINE_STRENGTH.med;
}
S.lineStrengthFromGrade = lineStrengthFromGrade;

/* ================================================================== */
/*  RECOGNISED-TERM DETECTION (drives chart status/warning badges)      */
/* ================================================================== */
/* Scan free text and return matched controlled-vocab entries. Each match is
 * { code, label }. Used additively by the extractor/inspector — it tags, it
 * never overrides an analyst's explicit value. */
function detectFromCues(text, list) {
  // word-boundary matching only: normalise BOTH text and cue to single-spaced
  // alphanumerics so e.g. cue "gun" never fires inside "Burgundy", while a
  // hyphenated cue ("self-harm") still matches text "self harm".
  var t = " " + lc(text).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ") + " ";
  // word-boundary match of a cue, with simple singular/plural tolerance for
  // single-word cues ("firearm" matches "firearms"; "drugs" matches "drug").
  function hit(core) {
    if (!core) return false;
    if (t.indexOf(" " + core + " ") !== -1) return true;
    if (core.indexOf(" ") === -1) {
      if (t.indexOf(" " + core + "s ") !== -1) return true;
      if (core.charAt(core.length - 1) === "s" && t.indexOf(" " + core.slice(0, -1) + " ") !== -1) return true;
    }
    return false;
  }
  var hits = [];
  (list || []).forEach(function (item) {
    var cues = item.cues || [];
    for (var i = 0; i < cues.length; i++) {
      var core = lc(cues[i]).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
      if (hit(core)) { hits.push({ code: item.code, label: item.label }); break; }
    }
  });
  return hits;
}
function detectStatus(text) { return detectFromCues(text, V.STATUS_OF_SUBJECT); }
function detectWarningSignals(text) { return detectFromCues(text, V.WARNING_SIGNALS); }

/* Vocab lookups by code. */
function byCode(list, code) {
  code = str(code).toUpperCase();
  var hit = (list || []).filter(function (i) { return str(i.code).toUpperCase() === code; })[0];
  return hit || null;
}
S.detectStatus = detectStatus;
S.detectWarningSignals = detectWarningSignals;
S.statusByCode = function (c) { return byCode(V.STATUS_OF_SUBJECT, c); };
S.warningByCode = function (c) { return byCode(V.WARNING_SIGNALS, c); };
S.immigrationByCode = function (c) { return byCode(V.IMMIGRATION_STATUS, c); };

/* Direct exposure of the controlled vocabularies for dropdown editing. */
S.STATUS_OF_SUBJECT = V.STATUS_OF_SUBJECT || [];
S.IMMIGRATION_STATUS = V.IMMIGRATION_STATUS || [];
S.WARNING_SIGNALS = V.WARNING_SIGNALS || [];
S.DISTINGUISHING_MARKS = V.DISTINGUISHING_MARKS || [];
S.VEHICLE_TYPES = V.VEHICLE_TYPES || [];
S.VIRTUAL_CURRENCY = V.VIRTUAL_CURRENCY || [];
S.TIER_TRB = V.TIER_TRB || [];
S.PASSPORT_COUNTRIES = V.PASSPORT_COUNTRIES || [];

/* ================================================================== */
/*  LINK TYPES -> i2 link type + semantic type + default direction      */
/* ================================================================== */
/* Maps Solar's controlled link vocabulary to i2 Analyst's Notebook link
 * types and semantic types, with a sensible default arrow direction
 * ("->" directed, "<>" undirected). Consumed by model.js (stamps each link)
 * and the graph/exporters for i2 fidelity. */
var LINK_META = {
  USES:              { label: "Uses",             i2: "Uses",           sem: "Uses",          dir: "->" },
  ASSOCIATE_OF:      { label: "Associate of",     i2: "Associate",      sem: "Association",   dir: "<>" },
  COMMUNICATED_WITH: { label: "Communicated with", i2: "Communication", sem: "Communication", dir: "<>" },
  TRANSACTED_WITH:   { label: "Transacted with",  i2: "Transaction",    sem: "Transaction",   dir: "->" },
  TRAVELS_TO:        { label: "Travels to",       i2: "Travel",         sem: "Travel",        dir: "->" },
  DEPARTS_FROM:      { label: "Departs from",     i2: "Travel",         sem: "Travel",        dir: "->" },
  STAYS_AT:          { label: "Stays at",         i2: "Resides At",     sem: "Residence",     dir: "->" },
  LOCATED_IN:        { label: "Located in",       i2: "Located At",     sem: "Location",      dir: "->" },
  PHONE_OF:          { label: "Phone of",         i2: "Uses",           sem: "Uses",          dir: "->" },
  OWNS:              { label: "Owns",             i2: "Owns",           sem: "Ownership",     dir: "->" },
  HOLDS:             { label: "Account holder",   i2: "Owns",           sem: "Ownership",     dir: "->" },
  REPRESENTS:        { label: "Acts for",         i2: "Associate",      sem: "Association",   dir: "->" },
  POSSESSES:         { label: "In possession of", i2: "Owns",           sem: "Ownership",     dir: "->" },
  EMPLOYS:           { label: "Employs",          i2: "Employs",        sem: "Employment",    dir: "->" },
  FAMILY_OF:         { label: "Family of",        i2: "Family",         sem: "Family",        dir: "<>" },
  CO_LOCATED_WITH:   { label: "Co-located with",  i2: "Co-location",    sem: "Association",   dir: "<>" },
  JOURNEY_WITH:      { label: "Journey with",     i2: "Travelled With", sem: "Association",   dir: "<>" },
  LINKED_TO:         { label: "Linked to",        i2: "Link",           sem: "Association",   dir: "<>" }
};
function linkMeta(type) { return LINK_META[type] || { label: type || "Linked to", i2: "Link", sem: "Association", dir: "<>" }; }
S.LINK_META = LINK_META;
S.linkMeta = linkMeta;

/* ================================================================== */
/*  CRYPTO WALLET ADDRESSES (structural detection; maps to VIRTUAL_CURRENCY) */
/* ================================================================== */
/* Structural patterns only (no checksum). Returns [{coin, address, start, end}].
 * Ported/extended from CommonRegex's BTC pattern; governed by CRVocab.VIRTUAL_CURRENCY. */
var CRYPTO_PATTERNS = [
  { coin: "ETH", re: /\b0x[a-fA-F0-9]{40}\b/g },
  { coin: "BTC", re: /\bbc1[ac-hj-np-z02-9]{11,71}\b/g },              // bech32
  { coin: "XMR", re: /\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g },        // Monero
  { coin: "BTC", re: /(?<![A-Za-z0-9])[13][a-km-zA-HJ-NP-Z1-9]{25,34}(?![A-Za-z0-9])/g } // legacy base58
];
function detectCrypto(text) {
  var s = str(text), hits = [], seen = {};
  CRYPTO_PATTERNS.forEach(function (p) {
    p.re.lastIndex = 0; var m;
    while ((m = p.re.exec(s)) !== null) {
      var addr = m[0], key = m.index + ":" + addr;
      if (seen[key]) continue; seen[key] = 1;
      hits.push({ coin: p.coin, address: addr, start: m.index, end: m.index + addr.length });
    }
  });
  return hits;
}
function cryptoLabel(coin) { var h = byCode(V.VIRTUAL_CURRENCY, coin); return h ? h.label : coin; }
S.detectCrypto = detectCrypto;
S.cryptoLabel = cryptoLabel;
S.VIRTUAL_CURRENCY = V.VIRTUAL_CURRENCY || [];

/* ================================================================== */
/*  W7 additions (2026-06-23) — checksum/format validators that cut    */
/*  false positives. Additive; existing validate() bodies unchanged.   */
/* ================================================================== */

/* UK VAT 9-digit checksum: valid if mod-97 OR mod-9755 (post-2010).
   weighted sum of first 7 digits (weights 8..2) + the 2 check digits,
   divisible by 97 (mod-9755 adds 55 first). */
S.vatChecksum = function (raw) {
  var d = digitsOnly(raw);
  if (d.length < 9) return false;
  var c = d.slice(0, 9), w = [8, 7, 6, 5, 4, 3, 2], sum = 0, i;
  for (i = 0; i < 7; i++) sum += (c.charCodeAt(i) - 48) * w[i];
  var chk = parseInt(c.slice(7, 9), 10);
  return ((sum + chk) % 97 === 0) || ((sum + chk + 55) % 97 === 0);
};

/* IMEI: 15 digits + Luhn check digit (IMEISV 16-digit has no Luhn). */
S.imeiValid = function (raw) {
  var d = digitsOnly(raw);
  return d.length === 15 && S.luhn(d);
};

/* UK company number: exactly 8 chars — 8 digits, or a known 2-letter
   prefix + 6 digits, or R + 7 digits (NI pre-1922). */
S.COMPANY_PREFIXES = "SC NI OC SO NC FC SF NF GE GS GN IP SP NP RC SR NR AC SA NA SE ES PC CE RS NO NZ IC SI NV LP SL NL".split(" ");
S.companyNumberValid = function (raw) {
  var s = alnumUpper(raw);
  if (s.length !== 8) return false;
  if (/^\d{8}$/.test(s)) return true;
  if (/^R\d{7}$/.test(s)) return true;
  var p = s.slice(0, 2);
  return /^\d{6}$/.test(s.slice(2)) && S.COMPANY_PREFIXES.indexOf(p) !== -1;
};

/* URL / website: require an explicit scheme, www., or a clear TLD to
   avoid matching ordinary dotted text. Returns a normalised value. */
S.URL_TLD = "com co.uk org org.uk net gov.uk ac.uk io info biz me tv online site app dev uk eu de fr es nl ru cn onion".split(" ");
S.urlValid = function (raw) {
  var s = str(raw).trim();
  if (/^(https?|ftp):\/\/\S+\.\S+/i.test(s)) return true;
  if (/^www\.\S+\.\S{2,}/i.test(s)) return true;
  return false;
};
S.urlNormalise = function (raw) {
  var s = str(raw).trim().replace(/[).,;]+$/, "");
  return s;
};

/* ---- export ---- */
/* ================================================================== */
/*  W1 additions (2026-06-23) — checksum/format helpers consumed by    */
/*  the cm-recognisers typed layer. ADDITIVE: existing validate()      */
/*  bodies are left unchanged to protect the golden harness; the       */
/*  recogniser layer calls these for false-positive control.           */
/* ================================================================== */

/* Luhn mod-10 (payment card). Additive; creditCard.validate left as-is. */
S.luhn = function (raw) {
  var d = digitsOnly(raw);
  if (d.length < 12 || d.length > 19) return false;
  var sum = 0, alt = false;
  for (var i = d.length - 1; i >= 0; i--) {
    var n = d.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return (sum % 10) === 0;
};

/* IBAN ISO 13616 mod-97 — valid iff remainder === 1. New identifier. */
S.identifiers.iban = {
  label: "IBAN",
  canonical: function (raw) { return alnumUpper(raw); },
  validate: function (raw) {
    var s = alnumUpper(raw);
    if (s.length < 15 || s.length > 34) return false;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
    var re = s.slice(4) + s.slice(0, 4), expanded = "", i, c;
    for (i = 0; i < re.length; i++) { c = re.charCodeAt(i); expanded += (c >= 65 && c <= 90) ? String(c - 55) : re.charAt(i); }
    var rem = 0;
    for (i = 0; i < expanded.length; i++) { rem = (rem * 10 + (expanded.charCodeAt(i) - 48)) % 97; }
    return rem === 1;
  },
  freeText: function (raw) { return "IBAN " + alnumUpper(raw).replace(/(.{4})/g, "$1 ").trim(); }
};

/* UK postcode — official GOV.UK Bulk Data Transfer regex. Additive. */
S.POSTCODE_RE = /\b(GIR ?0AA|[A-Z][0-9]{1,2}|[A-Z][A-HJ-Y][0-9]{1,2}|[A-Z][0-9][A-Z]|[A-Z][A-HJ-Y][0-9][A-Z]) ?[0-9][A-Z]{2}\b/i;
S.postcodeValid = function (raw) {
  var s = str(raw).toUpperCase().replace(/\s+/g, " ").trim();
  var m = S.POSTCODE_RE.exec(s);
  return !!m && m[0].replace(/\s+/g, "") === s.replace(/\s+/g, "");
};
S.postcodeCanonical = function (raw) {
  var s = str(raw).toUpperCase().replace(/\s+/g, "");
  if (s.length < 5) return s;
  return s.slice(0, s.length - 3) + " " + s.slice(-3);
};

/* DVLA VRM format (tighter than identifiers.vrm.validate's length-only).
   Additive; identifiers.vrm.validate left as-is pending golden review. */
S.vrmFormatValid = function (raw) {
  var s = alnumUpper(raw);
  return /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(s)
      || /^[A-Z][0-9]{1,3}[A-Z]{3}$/.test(s)
      || /^[A-Z]{3}[0-9]{1,3}[A-Z]$/.test(s)
      || /^[A-Z]{1,3}[0-9]{1,4}$/.test(s)
      || /^[0-9]{1,4}[A-Z]{1,3}$/.test(s);
};

if (typeof module !== "undefined" && module.exports) { module.exports = S; }
if (typeof window !== "undefined") { window.CRStandards = S; }
/* 3x5x2 intelligence-evaluation wording aligned to College of Policing APP (ADR 2026-07-15). */
