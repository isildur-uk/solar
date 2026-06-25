/* cm-recognisers.js — typed entity recogniser layer (recognise -> band -> resolve).
 *
 * STATUS: NEW MODULE. Authored 2026-06-23; verified with node --check + the unit
 * gap-runner (Solar/tests/cm-recognisers.test.js). NOT yet wired into extract.js —
 * the wiring + person/org POS rewrite is the /ship build brief
 * (docs/research/SHIP-BRIEF-cm-first-extraction.md).
 *
 * WHAT THIS IS
 *   The "recognise then normalise" recogniser registry validated by the external
 *   research (Microsoft Presidio / Google DLP / Duckling / libphonenumber):
 *     weak regex (LOW)  ->  context/trigger word in window (MED)  ->  checksum/
 *     format validator passes (HIGH), emitting the resolved IM01 SD01 v6 value.
 *   Validator failure either DROPS the span (false-positive kill) or, for strongly
 *   cued identifiers, KEEPS it flagged cmValid:false for analyst confirmation
 *   (never silent auto-correction — e.g. an invalid NINO must surface, not vanish).
 *
 * DESIGN
 *   - Single source of truth for validation/normalisation stays cm-standards.js;
 *     this module CONSUMES it (S.identifiers.*, S.phoneCM, S.ddmmyyyy, ...). The
 *     four checksum/format helpers cm-standards lacks (IBAN mod-97, card Luhn, UK
 *     postcode, DVLA VRM format) live in EXTRAS below and are marked
 *     "FOLD INTO cm-standards.js" for the wiring step (W1).
 *   - Recognition is driven by CONTEXT + FORMAT, never by capitalisation.
 *   - detectTyped(text) mirrors S.detectCrypto's span contract (start/end offsets)
 *     so extract.js can claim spans most-specific-first, exactly as today.
 *   - Confidence is an honest band HIGH|MED|LOW (never a fake percentage).
 *
 * Dual export: window.CRRecognisers (browser) + module.exports (Node).
 * Load order (browser): cm-vocab.js -> cm-standards.js -> cm-recognisers.js.
 */
"use strict";

var S = (typeof require !== "undefined")
  ? require("./cm-standards.js")
  : (typeof window !== "undefined" ? window.CRStandards : {});
S = S || {};

var R = {};
R.VERSION = "2026-06-23";
R.standards = S;

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */
function str(x) { return (x == null) ? "" : String(x); }
function lc(x) { return str(x).toLowerCase(); }
function digits(x) { return str(x).replace(/[^0-9]/g, ""); }
function alnumUpper(x) { return str(x).toUpperCase().replace(/[^0-9A-Z]/g, ""); }

var BAND = { HIGH: "HIGH", MED: "MED", LOW: "LOW" };
var BAND_RANK = { LOW: 0, MED: 1, HIGH: 2 };

/* W3 stop-lists: keep person recognition STRUCTURE-driven (CM surname-caps), not
   capitalisation-driven. A capitalised word in the forename slot that is really a
   cue/rank, or an ALLCAPS token that is really an acronym/identifier, is rejected. */
var PERSON_FORE_STOP = { operation:1, development:1, subject:1, nominal:1, vehicle:1,
  white:1, black:1, silver:1, blue:1, grey:1, gray:1, red:1, green:1, gold:1, dark:1, light:1, navy:1,
  tier:1, grading:1, source:1, intelligence:1, report:1, further:1, the:1, same:1,
  contact:1, status:1, detective:1, sergeant:1, constable:1, inspector:1, chief:1,
  deputy:1, reporting:1, officer:1, principal:1, associate:1, partner:1, sole:1, director:1 };
var PERSON_SUR_STOP = { LTD:1, PLC:1, LIMITED:1, LLP:1, LLC:1, INC:1, CIC:1, CCTV:1,
  ANPR:1, OCG:1, NFA:1, RUI:1, DOB:1, PNC:1, CRO:1, NINO:1, IMEI:1, SAR:1, HMRC:1,
  VRM:1, IBAN:1, VAT:1, ICQ:1, OPERATION:1, DEVELOPMENT:1, TRB:1, TIER:1, NCA:1,
  UK:1, ASIAN:1, WHITE:1, BLACK:1, FORD:1, VAUXHALL:1, AUDI:1, BMW:1 };

/* Context window: does any trigger word appear within `pad` chars of the match? */
function hasContext(text, start, end, words, pad) {
  if (!words || !words.length) return false;
  pad = pad || 80;
  var lo = Math.max(0, start - pad);
  var hi = Math.min(text.length, end + pad);
  var win = lc(text.slice(lo, hi));
  for (var i = 0; i < words.length; i++) {
    var w = lc(words[i]);
    if (!w) continue;
    if (win.indexOf(w) !== -1) return true;
  }
  return false;
}

/* ================================================================== */
/*  EXTRAS — checksum/format validators cm-standards.js does not have. */
/*  FOLD INTO cm-standards.js (S.identifiers / S.*) during W1 so the    */
/*  single-source rule holds; kept here only to ship the recogniser     */
/*  engine without editing the 705-line core file.                      */
/* ================================================================== */
var EXTRAS = {};

/* Luhn mod-10 — payment card check (Presidio's exact card validator). */
EXTRAS.luhn = function (raw) {
  var d = digits(raw);
  if (d.length < 12 || d.length > 19) return false;
  var sum = 0, alt = false;
  for (var i = d.length - 1; i >= 0; i--) {
    var n = d.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return (sum % 10) === 0;
};

/* IBAN ISO 13616 mod-97 — valid iff remainder === 1. */
EXTRAS.ibanValid = function (raw) {
  var s = alnumUpper(raw);
  if (s.length < 15 || s.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  var re = s.slice(4) + s.slice(0, 4);
  var expanded = "";
  for (var i = 0; i < re.length; i++) {
    var c = re.charCodeAt(i);
    expanded += (c >= 65 && c <= 90) ? String(c - 55) : re.charAt(i);
  }
  var rem = 0;
  for (var j = 0; j < expanded.length; j++) {
    rem = (rem * 10 + (expanded.charCodeAt(j) - 48)) % 97;
  }
  return rem === 1;
};
EXTRAS.ibanCanonical = function (raw) {
  return alnumUpper(raw).replace(/(.{4})/g, "$1 ").trim();
};

/* UK postcode — official GOV.UK Bulk Data Transfer regex. */
EXTRAS.POSTCODE_RE = /\b(GIR ?0AA|[A-Z][0-9]{1,2}|[A-Z][A-HJ-Y][0-9]{1,2}|[A-Z][0-9][A-Z]|[A-Z][A-HJ-Y][0-9][A-Z]) ?[0-9][A-Z]{2}\b/gi;
EXTRAS.postcodeValid = function (raw) {
  var s = str(raw).toUpperCase().trim();
  EXTRAS.POSTCODE_RE.lastIndex = 0;
  var m = EXTRAS.POSTCODE_RE.exec(s);
  return !!m && m[0].replace(/\s+/g, "") === s.replace(/\s+/g, "");
};
EXTRAS.postcodeCanonical = function (raw) {
  var s = str(raw).toUpperCase().replace(/\s+/g, "");
  if (s.length < 5) return s;
  return s.slice(0, s.length - 3) + " " + s.slice(-3);
};

/* DVLA VRM format (current AA00 AAA + common prefix/suffix/dateless forms). */
EXTRAS.vrmFormatValid = function (raw) {
  var s = alnumUpper(raw);
  return /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(s)   // current 2001+: AA00AAA
      || /^[A-Z][0-9]{1,3}[A-Z]{3}$/.test(s)    // prefix:  A123ABC
      || /^[A-Z]{3}[0-9]{1,3}[A-Z]$/.test(s)    // suffix:  ABC123A
      || /^[A-Z]{1,3}[0-9]{1,4}$/.test(s)       // dateless: ABC1234
      || /^[0-9]{1,4}[A-Z]{1,3}$/.test(s);      // dateless reversed
};

R.extras = EXTRAS;

/* Single-source delegation (W1): prefer cm-standards.js implementations when
   present; the local EXTRAS bodies above remain only as a standalone fallback.
   POSTCODE_RE is NOT delegated (recogniser needs the /g global variant). */
if (typeof S.luhn === "function") EXTRAS.luhn = S.luhn;
if (typeof S.postcodeValid === "function") EXTRAS.postcodeValid = S.postcodeValid;
if (typeof S.postcodeCanonical === "function") EXTRAS.postcodeCanonical = S.postcodeCanonical;
if (typeof S.vrmFormatValid === "function") EXTRAS.vrmFormatValid = S.vrmFormatValid;
if (S.identifiers && S.identifiers.iban) {
  EXTRAS.ibanValid = function (raw) { return S.identifiers.iban.validate(raw); };
  EXTRAS.ibanCanonical = function (raw) { return S.identifiers.iban.freeText(raw).replace(/^IBAN\s+/, ""); };
}

/* ================================================================== */
/*  Resolved-value helpers (Duckling-style: return the canonical form) */
/* ================================================================== */
var MONTHS = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12 };

function writtenDateToDDMMYYYY(s) {
  // "4 September 1983" / "20 December 1979"
  var m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?\s+(\d{4})\b/.exec(s);
  if (m && MONTHS[lc(m[2])]) {
    var d = ("0" + m[1]).slice(-2), mo = ("0" + MONTHS[lc(m[2])]).slice(-2);
    return d + "/" + mo + "/" + m[3];
  }
  return "";
}

var CUR_SYMBOL = { "£": "GBP", "$": "USD", "€": "EUR" };
function moneyCanonical(symbolOrCode, amountStr) {
  var code = CUR_SYMBOL[symbolOrCode] || str(symbolOrCode).toUpperCase();
  var raw = lc(amountStr).replace(/,/g, "");
  var mult = 1;
  if (/k$/.test(raw)) { mult = 1000; raw = raw.replace(/k$/, ""); }
  else if (/m$/.test(raw)) { mult = 1000000; raw = raw.replace(/m$/, ""); }
  var n = parseFloat(raw);
  if (isNaN(n)) return "";
  n = Math.round(n * mult);
  return code + " " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function passportCountry(text, end) {
  var after = text.slice(end, end + 40);
  if (/\bbritish\b|\buk\b|\bunited kingdom\b/i.test(after) || /\bbritish\b/i.test(text.slice(Math.max(0, end - 60), end))) {
    return "United Kingdom";
  }
  var countries = (S.PASSPORT_COUNTRIES || []);
  for (var i = 0; i < countries.length; i++) {
    var c = countries[i];
    if (after.toLowerCase().indexOf(String(c).toLowerCase()) !== -1) return c;
  }
  return "";
}

/* ================================================================== */
/*  RECOGNISERS                                                        */
/*  Each: {type, re (global), base, context[], requireValid, flagInvalid,
   resolve(m, text, mStart, mEnd) -> {value, freeText, valid, ...} }    */
/* ================================================================== */
function idOK(idKey, raw) { return S.identifiers && S.identifiers[idKey] && S.identifiers[idKey].validate(raw); }
function idFree(idKey, raw, extra) { return (S.identifiers && S.identifiers[idKey]) ? S.identifiers[idKey].freeText(raw, extra) : raw; }
function idCanon(idKey, raw) { return (S.identifiers && S.identifiers[idKey]) ? S.identifiers[idKey].canonical(raw) : raw; }

var RECOGNISERS = [
  /* ---- DOB ------------------------------------------------------- */
  {
    type: "dob",
    re: /\b(?:dob|d\.o\.b\.?|date\s+of\s+birth|born(?:\s+on)?)\b[:\s]*([0-3]?\d[\/.\-][01]?\d[\/.\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\.?\s+\d{4})/gi,
    base: BAND.MED,
    context: [],
    resolve: function (m) {
      var raw = m[1];
      var ddmm = /\d{1,2}\s+[A-Za-z]/.test(raw) ? writtenDateToDDMMYYYY(raw) : (S.ddmmyyyy ? S.ddmmyyyy(raw) : raw);
      var valid = !!ddmm && (S.dateValid ? S.dateValid(ddmm) : true);
      return { value: ddmm, freeText: "DOB " + ddmm, valid: valid };
    }
  },
  /* ---- NINO (flag invalid, never drop a strongly-cued NINO) ------ */
  {
    type: "nino",
    re: /\b(?:nino\s*)?([A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D])\b/gi,
    base: BAND.LOW,
    context: ["national insurance", "nino", "ni number"],
    flagInvalid: true,
    resolve: function (m) {
      var raw = m[1];
      var valid = idOK("nino", raw);
      return { value: idCanon("nino", raw), freeText: idFree("nino", raw), valid: valid };
    }
  },
  /* ---- Passport -------------------------------------------------- */
  {
    type: "passport",
    re: /\b(?:ppt\s*)?(\d{9}|\d{6}[A-Z])\b/gi,
    base: BAND.LOW,
    context: ["passport", "ppt"],
    requireValid: true,
    resolve: function (m, text, mStart, mEnd) {
      var raw = m[1];
      var country = passportCountry(text, mEnd);
      return { value: idCanon("passport", raw), freeText: idFree("passport", raw, country), valid: idOK("passport", raw), country: country };
    }
  },
  /* ---- Sort code ------------------------------------------------- */
  {
    type: "sortCode",
    re: /\b(?:sort[\s-]{0,3}code|s\/c|sc)\b[:#\s]*(\d{2}[\s-]?\d{2}[\s-]?\d{2})\b/gi,
    base: BAND.LOW,
    context: ["sort code", "sort-code", "s/c", "sc "],
    requireValid: true,
    resolve: function (m) {
      var raw = m[1];
      return { value: idCanon("sortCode", raw), freeText: idFree("sortCode", raw), valid: idOK("sortCode", raw) };
    }
  },
  /* ---- IBAN (extra; not in cm-standards yet) --------------------- */
  {
    type: "iban",
    re: /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/g,
    base: BAND.LOW,
    context: ["iban"],
    requireValid: true,
    resolve: function (m) {
      var raw = m[1];
      var valid = EXTRAS.ibanValid(raw);
      return { value: alnumUpper(raw), freeText: "IBAN " + EXTRAS.ibanCanonical(raw), valid: valid };
    }
  },
  /* ---- Payment card (Luhn) --------------------------------------- */
  {
    type: "creditCard",
    re: /\b(?:cc\s*)?((?:\d[ -]?){12,19})\b/gi,
    base: BAND.LOW,
    context: ["card", "credit card", "debit", "visa", "mastercard", "cc "],
    requireValid: true,
    resolve: function (m) {
      var raw = m[1];
      return { value: idCanon("creditCard", raw), freeText: idFree("creditCard", raw), valid: EXTRAS.luhn(raw) };
    }
  },
  /* ---- CRO / PNC ------------------------------------------------- */
  {
    type: "cro",
    re: /\b(?:cro\s*)?(S?\d{1,7}\/\d{2}[A-Z])\b/gi,
    base: BAND.LOW,
    context: ["cro", "criminal records office"],
    requireValid: true,
    resolve: function (m) { var raw = m[1]; return { value: idCanon("cro", raw), freeText: idFree("cro", raw), valid: idOK("cro", raw) }; }
  },
  {
    type: "pnc",
    re: /\b(?:pnc\s*)?(\d{2}\/\d{1,7}[A-Z])\b/gi,
    base: BAND.LOW,
    context: ["pnc", "police national computer"],
    requireValid: true,
    resolve: function (m) { var raw = m[1]; return { value: idCanon("pnc", raw), freeText: idFree("pnc", raw), valid: idOK("pnc", raw) }; }
  },
  /* ---- Companies House ------------------------------------------- */
  {
    type: "companiesHouse",
    re: /\b(?:company(?: number| no\.?)?|companies house|co\.? ?no\.?)\b[:\s]*((?:\d{8}|[A-Z]{2}\d{6}))\b/gi,
    base: BAND.MED,
    resolve: function (m) { var raw = m[1]; return { value: idCanon("companiesHouse", raw), freeText: idFree("companiesHouse", raw), valid: idOK("companiesHouse", raw) }; }
  },
  /* ---- VAT ------------------------------------------------------- */
  {
    type: "vat",
    re: /\bvat(?:\s*(?:reg(?:istration)?|no\.?|number))?\b[:\s]*((?:GB)?\d[\d\s]{7,13})\b/gi,
    base: BAND.MED,
    resolve: function (m) { var raw = m[1]; var vv = (S.vatChecksum ? S.vatChecksum(raw) : idOK("vat", raw)); return { value: idCanon("vat", raw), freeText: idFree("vat", raw), valid: vv }; }
  },
  /* ---- VRM (DVLA format + context) ------------------------------- */
  {
    type: "vrm",
    re: /\b(?:vrm\s*|reg(?:istration)?\s*(?:number|no\.?|mark)?\s*)?([A-Z]{2}\d{2}\s?[A-Z]{3}|[A-Z]\d{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?\d{1,3}[A-Z])\b/gi,
    base: BAND.LOW,
    context: ["reg", "registration", "vrm", "plate", "vehicle", "car", "van", "drives", "registered"],
    requireValid: true,
    resolve: function (m, text, mStart, mEnd) {
      var raw = m[1], s = alnumUpper(raw);
      var win = lc(text.slice(Math.max(0, mStart - 40), mEnd + 25));
      if (/\blot\b|not a vehicle/.test(win)) return { value: raw, freeText: raw, valid: false };
      var current = /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(s);
      var ctx = hasContext(text, mStart, mEnd, ["reg", "registration", "vrm", "plate", "vehicle", "car", "van", "drives", "registered"]);
      var ok = EXTRAS.vrmFormatValid(raw) && (current || ctx);
      return { value: idCanon("vrm", raw), freeText: idFree("vrm", raw), valid: ok };
    }
  },
  /* ---- Phone ----------------------------------------------------- */
  {
    type: "phone",
    re: /(?:\+|00)?(?:\d[\d\s().-]{8,16}\d)/g,
    base: BAND.LOW,
    context: ["phone", "mobile", "tel", "call", "number", "landline", "handset", "contact", "+44", "0044"],
    requireValid: true,
    resolve: function (m) {
      var cm = S.phoneCM ? S.phoneCM(m[0]) : digits(m[0]);
      var valid = S.phoneValid ? S.phoneValid(cm) : /^0\d{9,10}$/.test(cm);
      return { value: cm, freeText: cm, valid: valid };
    }
  },
  /* ---- Email ----------------------------------------------------- */
  {
    type: "email",
    re: /\b[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,24}\b/g,
    base: BAND.HIGH,
    resolve: function (m) { return { value: lc(m[0]), freeText: m[0], valid: true }; }
  },
  /* ---- IP -------------------------------------------------------- */
  {
    type: "ip",
    re: /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g,
    base: BAND.MED,
    resolve: function (m) { var raw = m[1]; return { value: idCanon("ip", raw), freeText: idFree("ip", raw), valid: idOK("ip", raw) }; }
  },
  /* ---- Money ----------------------------------------------------- */
  {
    type: "money",
    re: /(£|\$|€|\b(?:GBP|USD|EUR)\b)\s{0,4}(\d[\d,]*(?:\.\d+)?\s{0,2}[km]?)/gi,
    base: BAND.HIGH,
    resolve: function (m) {
      var canon = moneyCanonical(m[1], m[2]);
      return { value: canon, freeText: canon, valid: !!canon };
    }
  },
  /* ---- UK postcode (extra) --------------------------------------- */
  {
    type: "postcode",
    re: EXTRAS.POSTCODE_RE,
    base: BAND.MED,
    resolve: function (m) {
      var valid = EXTRAS.postcodeValid(m[0]);
      return { value: EXTRAS.postcodeCanonical(m[0]), freeText: EXTRAS.postcodeCanonical(m[0]), valid: valid };
    }
  },
  /* ---- Operation / Development name ------------------------------ */
  {
    type: "operation",
    re: /\b(?:operation|development)\s+([A-Za-z][A-Za-z0-9]+(?:\s+[A-Za-z][A-Za-z0-9]+)?)\b/gi,
    base: BAND.MED,
    resolve: function (m) {
      var name = m[1].toUpperCase();
      return { value: name, freeText: "OPERATION " + name, valid: true };
    }
  },
  /* ---- TIER / TRB ------------------------------------------------ */
  {
    type: "tiertrb",
    re: /\bTIER\s?([123])\s?\/?\s?TRB\s?\/?\s?([A-Z]+)\b/gi,
    base: BAND.HIGH,
    resolve: function (m) {
      var v = "TIER" + m[1] + "/TRB/" + m[2].toUpperCase();
      return { value: v, freeText: v, valid: true };
    }
  },
  /* ---- 3x5x2 grading --------------------------------------------- */
  {
    type: "grading",
    re: /\[?\s*([1-3])\s*([A-E])\s*\/?\s*([PC])\s*\]?/g,
    base: BAND.MED,
    context: ["grading", "evaluation", "5x5x5", "3x5x2", "source", "intelligence"],
    resolve: function (m) {
      var code = "[" + m[1] + m[2] + m[3] + "]";
      return { value: code, freeText: code, valid: S.gradeValid ? S.gradeValid(code) : true };
    }
  },
  /* ---- Alias / AKA / nickname / online identity ------------------ */
  {
    type: "alias",
    re: /\b(?:aka|also (?:known as|uses the name)|known (?:to [a-z ]+ )?as|on the street as|nickname|street ?name|called)\b[:\s]*["'“]?([A-Za-z][\w'’ \-]{1,28}?)["'”]?(?=[\.,;)]|\s+(?:and|by|is|was|on)\b|$)/gi,
    base: BAND.MED,
    resolve: function (m, text, mStart, mEnd) {
      var name = m[1].trim();
      var win = lc(text.slice(Math.max(0, mStart - 5), mEnd + 25));
      var kind = "alias";
      if (/online|snapchat|insta|twitter|handle|@/.test(win) || /_\d/.test(name)) kind = "online identity";
      else if (/street/.test(win)) kind = "streetname";
      else if (/nickname|known to|called/.test(win)) kind = "nickname";
      return { value: name, freeText: "AKA " + name + " (" + kind + ")", valid: true, kind: kind };
    }
  },
  /* ---- Criminal group -------------------------------------------- */
  {
    type: "criminalGroup",
    re: /\b(?:[Cc][Gg]\s+|(?:organised )?crime group (?:known as |called )?(?:the )?)([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/g,
    base: BAND.MED,
    resolve: function (m) {
      var name = m[1].toUpperCase();
      return { value: name, freeText: "CG " + name, valid: true };
    }
  },
  /* ---- Criminal group: appositive "X (an organised crime group)" ---- */
  {
    type: "criminalGroup",
    re: /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s*\((?:an?\s+)?(?:organised\s+)?(?:crime group|OCG|gang)\b/g,
    base: BAND.MED,
    resolve: function (m) { var name = m[1].toUpperCase(); return { value: name, freeText: "CG " + name, valid: true }; }
  },
  /* ---- Criminal group: CREW/GANG/MOB/etc. suffix on a capitalised name ---- */
  {
    type: "criminalGroup",
    re: /\b((?:[A-Z][A-Za-z]+\s+){1,3}(?:CREW|GANG|MOB|CARTEL|SYNDICATE|FIRM|BROTHERS|FAMILY))\b/g,
    base: BAND.MED,
    resolve: function (m) { var name = m[1].toUpperCase().replace(/\s+/g, " ").trim(); return { value: name, freeText: "CG " + name, valid: true }; }
  },
  /* ---- Person: Forename(s) + ALLCAPS surname (CM surname-caps convention) ---- */
  {
    type: "person",
    re: /\b((?:[A-Z][a-z]+\s+){1,3})([A-Z][A-Z]+(?:[-'][A-Z]+)?)\b/g,
    base: BAND.MED,
    resolve: function (m) {
      var fore = m[1].trim(), sur = m[2];
      if (PERSON_FORE_STOP[fore.split(/\s+/)[0].toLowerCase()]) return { valid: false };
      if (PERSON_SUR_STOP[sur]) return { valid: false };
      var label = S.personLabelCM ? S.personLabelCM(fore + " " + sur) : (fore + " " + sur);
      return { value: label, freeText: label, valid: true, kind: "person", partial: true };
    }
  },
  /* ---- Person: SURNAME, Forename ---- */
  {
    type: "person",
    re: /\b([A-Z][A-Z]+(?:[-'][A-Z]+)?),\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
    base: BAND.MED,
    resolve: function (m) {
      var sur = m[1], fore = m[2];
      if (PERSON_SUR_STOP[sur]) return { valid: false };
      var label = S.personLabelCM ? S.personLabelCM(fore + " " + sur) : (fore + " " + sur);
      return { value: label, freeText: label, valid: true, kind: "structured-person", partial: true };
    }
  },
  /* ---- Person: Title/rank + Name ---- */
  {
    type: "person",
    re: /\b(Mr|Mrs|Miss|Ms|Mx|Dr|Prof|Rev|Sir|Dame|Lord|Lady|DC|DS|DI|DCI|DCS|PC|PS|PCSO)\.?\s+((?:[A-Z][a-z]+\s+){0,2}[A-Z][A-Za-z'\-]+)\b/g,
    base: BAND.MED,
    resolve: function (m) {
      var label = S.personLabelCM ? S.personLabelCM(m[2]) : m[2];
      return { value: label, freeText: label, valid: true, kind: "person", partial: true };
    }
  },
  /* ---- Organisation: suffix-anchored (LTD/PLC/...) ---- */
  {
    type: "organisation",
    re: /\b([A-Z][A-Za-z0-9&'.\-]*(?:\s+[A-Z][A-Za-z0-9&'.\-]*){0,6}\s+(?:LTD|LIMITED|PLC|LLP|LLC|INC|CIC))\b/g,
    base: BAND.MED,
    resolve: function (m) {
      var label = S.organisationCaps ? S.organisationCaps(m[1]) : m[1].toUpperCase();
      return { value: label, freeText: label, valid: true };
    }
  },
  /* ---- IMEI (cue + 15 digits + Luhn) ---- */
  {
    type: "imei",
    re: /\bimei[:#\s]*(\d[\d\s]{13,17}\d)\b/gi,
    base: BAND.MED,
    requireValid: true,
    resolve: function (m) {
      var raw = digits(m[1]);
      return { value: raw, freeText: "IMEI " + raw, valid: (S.imeiValid ? S.imeiValid(raw) : raw.length === 15) };
    }
  },
  /* ---- Driver licence (cue + 16-char DVLA structure validated) ---- */
  {
    type: "driverLicence",
    re: /\b(?:driv(?:ing|er'?s?)\s+licen[cs]e(?:\s+(?:number|no\.?))?|dvla|drv)[:#\s]*([A-Za-z0-9]{16})\b/gi,
    base: BAND.MED,
    requireValid: true,
    resolve: function (m) {
      var raw = alnumUpper(m[1]);
      var valid = (S.identifiers && S.identifiers.driverLicence) ? S.identifiers.driverLicence.validate(raw) : (raw.length === 16);
      return { value: raw, freeText: "DRV " + raw, valid: valid };
    }
  },
  /* ---- Website / URL (scheme or www. required) ---- */
  {
    type: "website",
    re: /\b((?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"')]+)/gi,
    base: BAND.HIGH,
    resolve: function (m) {
      var raw = (S.urlNormalise ? S.urlNormalise(m[1]) : m[1]);
      return { value: raw, freeText: raw, valid: (S.urlValid ? S.urlValid(raw) : true) };
    }
  },
  /* ---- Online identities (cue-gated; comms attribution) ---- */
  {
    type: "skype",
    re: /\bskype[:\s]*([A-Za-z][A-Za-z0-9_.\-]{5,31})\b/gi,
    base: BAND.MED,
    resolve: function (m) { var v = m[1]; return { value: v, freeText: "SKYPE " + v, valid: true, kind: "online identity" }; }
  },
  {
    type: "twitter",
    re: /\btwitter[:\s]*@?([A-Za-z0-9_]{2,15})\b/gi,
    base: BAND.MED,
    resolve: function (m) { var v = m[1]; return { value: v, freeText: "TWITTER " + v, valid: true, kind: "online identity" }; }
  },
  {
    type: "icq",
    re: /\bicq[:#\s]*([1-9]\d{4,9})\b/gi,
    base: BAND.MED,
    resolve: function (m) { var v = m[1]; return { value: v, freeText: "ICQ " + v, valid: true, kind: "online identity" }; }
  },
  {
    type: "jabber",
    re: /\b(?:jabber|xmpp)[:\s]*([A-Za-z0-9._\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,24})\b/gi,
    base: BAND.MED,
    resolve: function (m) { var v = m[1]; return { value: lc(v), freeText: "JABBER " + v, valid: true, kind: "online identity" }; }
  },
  /* ---- Field-form person (SURNAME:/NAME:) ------------------------ */
  {
    type: "person",
    re: /\b(?:surname|name)\s*[:\-]\s*([A-Z][A-Za-z'’\-]+)\b/gi,
    base: BAND.MED,
    resolve: function (m) {
      var sur = S.surnameCaps ? S.surnameCaps(m[1]) : m[1].toUpperCase();
      return { value: sur, freeText: sur, valid: true, partial: true };
    }
  }
];

R.recognisers = RECOGNISERS;

/* ================================================================== */
/*  SCANNER — detectTyped(text) -> sorted, non-overlapping spans       */
/* ================================================================== */
function bandFor(rec, hit, text, start, end) {
  var band = rec.base || BAND.LOW;
  if (rec.context && rec.context.length && hasContext(text, start, end, rec.context)) {
    if (BAND_RANK[band] < BAND_RANK[BAND.MED]) band = BAND.MED;
  }
  if (hit.valid) band = BAND.HIGH;
  return band;
}

R.detectTyped = function (text) {
  text = str(text);
  var cands = [];
  for (var r = 0; r < RECOGNISERS.length; r++) {
    var rec = RECOGNISERS[r];
    var re = rec.re;
    re.lastIndex = 0;
    var m;
    var guard = 0;
    while ((m = re.exec(text)) !== null && guard++ < 50000) {
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
      var whole = m[0];
      var capt = (m[1] != null) ? m[1] : whole;
      // Claim the WHOLE match span (prefix + value) so extract.js does not
      // re-extract cue words; `raw` keeps the captured value for display.
      var start = m.index;
      var end = m.index + whole.length;

      var resolved;
      try { resolved = rec.resolve(m, text, m.index, m.index + whole.length) || {}; }
      catch (e) { resolved = { value: capt, freeText: capt, valid: false }; }

      var valid = resolved.valid !== false;
      if (resolved.value == null || resolved.value === "") continue; // drop valueless (e.g. stop-listed person)
      if (rec.requireValid && !valid) continue;        // false-positive kill
      var band = bandFor(rec, { valid: valid && !!resolved.value }, text, start, end);

      cands.push({
        type: rec.type,
        start: start,
        end: end,
        raw: capt,
        value: resolved.value,
        freeText: resolved.freeText,
        band: band,
        cmValid: valid,
        needsConfirm: (band !== BAND.HIGH) || (rec.flagInvalid && !valid),
        kind: resolved.kind || null,
        country: resolved.country || null,
        rationale: buildRationale(rec, band, valid, text, start, end)
      });
    }
  }
  return resolveOverlaps(cands);
};

function buildRationale(rec, band, valid, text, start, end) {
  var bits = [];
  if (valid) bits.push("validator passed");
  if (rec.context && rec.context.length && hasContext(text, start, end, rec.context)) bits.push("context cue in window");
  bits.push("format match (" + rec.type + ")");
  return bits.join("; ") + " -> " + band;
}

/* spaCy EntityRuler semantics: longest match wins; earliest wins on tie. */
function resolveOverlaps(cands) {
  // Longest-at-same-start wins; O(n log n) single sweep (sorted by start asc, length
  // desc). A candidate overlaps an accepted one iff its start < the running max end.
  cands.sort(function (a, b) {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });
  var out = [], lastEnd = -1;
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    if (c.start >= lastEnd) { out.push(c); lastEnd = c.end; }
  }
  return out;
}

R.BAND = BAND;

/* ================================================================== */
/*  Person precision gate — looksLikePerson(label)                     */
/*  Accepts a CM person (title prefix, OR an ALLCAPS surname token per  */
/*  the surname-caps convention, OR a Title-Case name that is not a     */
/*  place/object phrase). Rejects capitalisation-only descriptors/      */
/*  places/objects ("Medium WHITE", "War Memorial", "New Conference     */
/*  Suite"). Used by extract.js to prune the pre-existing heuristic     */
/*  person false positives after its passes run.                        */
/* ================================================================== */
var PLACE_OBJECT_NOUN = { desk:1, suite:1, floor:1, memorial:1, hub:1, holdall:1,
  rucksack:1, roundabout:1, junction:1, concourse:1, terminal:1, depot:1, premises:1,
  headquarters:1, precinct:1, forecourt:1, warehouse:1, stadium:1, arena:1, cinema:1,
  museum:1, supermarket:1, pharmacy:1, surgery:1, hospital:1, cathedral:1, mosque:1,
  conference:1, committee:1, department:1, division:1,
  standards:1, intelligence:1, report:1, profile:1, summary:1, version:1, material:1,
  fictitious:1, official:1, confidential:1, appendix:1, figure:1, schedule:1,
  document:1, example:1, paragraph:1, dossier:1, memorandum:1, briefing:1, data:1, sample:1 };
var PERSON_TITLES2 = { Mr:1, Mrs:1, Miss:1, Ms:1, Mx:1, Dr:1, Prof:1, Rev:1, Sir:1,
  Dame:1, Lord:1, Lady:1, DC:1, DS:1, DI:1, DCI:1, DCS:1, PC:1, PS:1, PCSO:1 };
R.looksLikePerson = function (label) {
  var s = str(label).replace(/\s+/g, " ").trim();
  if (!s) return false;
  var toks = s.split(" "), i, t;
  for (i = 0; i < toks.length; i++) {
    t = toks[i].replace(/[^A-Za-z]/g, "");
    if (t.length >= 2 && t === t.toUpperCase() && PERSON_SUR_STOP[t]) return false; // WHITE/ASIAN/NFA...
  }
  if (PERSON_TITLES2[toks[0].replace(/[^A-Za-z]/g, "")]) return true;
  for (i = 0; i < toks.length; i++) {
    t = toks[i].replace(/[^A-Za-z]/g, "");
    if (t.length >= 2 && t === t.toUpperCase() && /[A-Z]/.test(t) && !PERSON_SUR_STOP[t]) return true; // ALLCAPS surname
  }
  for (i = 0; i < toks.length; i++) {
    if (PLACE_OBJECT_NOUN[lc(toks[i]).replace(/[^a-z]/g, "")]) return false; // place/object phrase
  }
  return true; // Title-Case name with no place noun (e.g. "Ronald McDonald Jr")
};

/* Prototype-safety (W7): text-keyed lookup tables must not return inherited
   Object.prototype members (e.g. a "constructor"/"toString" token). Null their
   prototypes so unknown keys resolve to undefined, not an inherited value. */
[PERSON_FORE_STOP, PERSON_SUR_STOP, MONTHS, CUR_SYMBOL, PLACE_OBJECT_NOUN, PERSON_TITLES2]
  .forEach(function (d) { if (d && typeof d === "object") { try { Object.setPrototypeOf(d, null); } catch (e) {} } });

/* ---- export ---- */
if (typeof module !== "undefined" && module.exports) { module.exports = R; }
if (typeof window !== "undefined") { window.CRRecognisers = R; }
