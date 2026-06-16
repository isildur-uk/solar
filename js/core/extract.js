/* CHART ROOM — extract.js
 * Free-text entity & relationship extraction (the smart-matching front end).
 * Browser: window.CRExtract (requires CRMatch + CRGeo loaded first).
 * Node: module.exports (requires ./match.js, ./geo.js).
 *
 * Output contract — extract(text, opts) returns:
 * {
 *   entities: [{ ref, type, label, value, attrs, confidence:'high'|'med'|'low',
 *                spans:[[start,end],...], flags:[...] }],
 *   relationships: [{ ref, sourceRef, targetRef, type, direction:'->',
 *                     dateISO?, confidence, sentence, cue }],
 *   events: [{ ref, dateISO, label, entityRefs:[...] }],
 *   ambiguities: [{ ref?, kind, message }]
 * }
 * Confidence is tiered, never a fake percentage. Ambiguous DD/MM vs MM/DD dates
 * are flagged, not silently resolved (opts.dateFormat defaults to 'DMY').
 */
(function () {
  "use strict";

  var M = (typeof window !== "undefined" && window.CRMatch) ||
          (typeof require === "function" ? require("./match.js") : null);
  var G = (typeof window !== "undefined" && window.CRGeo) ||
          (typeof require === "function" ? require("./geo.js") : null);
  var L = (typeof window !== "undefined" && window.CRLang) ||
          (typeof require === "function" ? require("./lang.js") : null);
  var St = (typeof window !== "undefined" && window.CRStandards) ||
          (typeof require === "function" ? require("./cm-standards.js") : null);

  var MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12
  };

  // Words that look like Forename SURNAME but aren't people.
  var NAME_STOPWORDS = {
    "DOB": 1, "NHS": 1, "NCA": 1, "HMRC": 1, "DVLA": 1, "OCG": 1, "SIM": 1,
    "CSV": 1, "GPS": 1, "VAT": 1, "IBAN": 1, "BIC": 1, "PNC": 1, "ANPR": 1,
    "UK": 1, "USA": 1, "EU": 1, "ID": 1, "IP": 1,
    // pure acronyms / codes — never a real surname
    "SAR": 1, "DAML": 1, "API": 1, "PNR": 1, "NINO": 1, "PAYE": 1, "CRCA": 1,
    "NBTC": 1, "GBP": 1, "EUR": 1, "USD": 1, "IMEI": 1, "IMSI": 1, "ICCID": 1,
    "MSISDN": 1, "CG": 1, "IR": 1, "CM": 1, "CRO": 1, "PPT": 1, "UTR": 1,
    "CCJ": 1, "IVA": 1, "POCA": 1, "OFFICIAL": 1, "CAIS": 1, "AGP": 1, "AMS": 1,
    "OTP": 1, "BRS": 1, "TIA": 1, "GMP": 1, "MLRO": 1, "DSU": 1, "SPoC": 1,
    "URN": 1, "VRM": 1, "ANB": 1, "GBG": 1, "GBIQ": 1, "CNX": 1, "CSP": 1,
    "RTI": 1, "SIC": 1, "ETH": 1, "POB": 1, "AKA": 1, "XX": 1,
    // test-corpus footer/banner words (not real surnames; appear after place names)
    "FICTITIOUS": 1, "GANNET": 1, "SEABREEZE": 1, "OPERATION": 1, "DATA": 1,
    "TEST": 1, "SENSITIVE": 1, "POLICE": 1, "RECORD": 1, "NORTHSIDE": 1, "AVONSIDE": 1
    // NB: colour / make / descriptor words (WHITE, BLACK, BROWN, FORD, SILVER,
    // MEDIUM, MALE...) are deliberately NOT here — they are real surnames. Colour
    // /vehicle noise is suppressed on the FORENAME side via FIELD_LABELS instead.
  };
  // Report-structure / label words that are never a person's forename — used to
  // reject "Label VALUE" pairs (e.g. "Subject API", "Type DAML", "Tax NORTHGATE").
  var FIELD_LABELS = {
    Reference:1, Report:1, Route:1, Type:1, Submission:1, Subject:1, Payment:1,
    Itinerary:1, Operator:1, Field:1, Status:1, Role:1, Since:1, Active:1,
    Default:1, Employer:1, Tax:1, Unit:1, Marking:1, Originating:1, Sanitised:1,
    Travel:1, Record:1, Nominal:1, Relationship:1, Amount:1, Source:1, Current:1,
    Glossary:1, Handling:1, Disclosure:1, Requesting:1, Movements:1, Booking:1,
    Baggage:1, Passengers:1, Frequent:1, Confidence:1, Linked:1, Directorships:1,
    Company:1, Personal:1, Provided:1, Seat:1, Keeper:1, Lender:1, Balance:1,
    Opened:1, Searcher:1, Electoral:1, Subscriber:1, Billing:1, Connection:1,
    Contract:1, Handset:1, Requirement:1, Necessity:1, Proportionality:1,
    Authorising:1, Applicant:1, Enquiry:1, Force:1, Reason:1, Make:1, Model:1,
    Colour:1, Best:1, Note:1, Public:1, Financial:1, Individual:1, Codes:1,
    Document:1, Print:1, Vehicles:1, Objects:1, Locations:1, Associations:1,
    Occurrences:1, Name:1, Date:1, Email:1, Phone:1, Mobile:1, Address:1,
    Telephone:1, Account:1, Search:1, Searches:1, Self:1, Dir:1, Limit:1,
    Nationality:1, Height:1, Build:1, Hair:1, Eyes:1, Surname:1, Forename:1,
    Shared:1, Sibling:1, Given:1, Joint:1, Separate:1, Value:1, Associated:1,
    Individuals:1, Black:1, White:1, Silver:1, Grey:1, Gray:1, Blue:1, Red:1,
    Green:1, Gold:1, Brown:1, Beige:1, Navy:1, From:1, Best:1, Make:1, Model:1,
    Lender:1, Status:1, Role:1, Basis:1, Other:1, Co:1, Number:1, Issue:1,
    Reporter:1, Crime:1, Financial:1, Officer:1, Nominated:1, Beneficiary:1,
    Counterparty:1, Institution:1, Branch:1, Transfer:1, Cash:1, Intl:1,
    Operation:1, Disclosure:1, Movements:1, Itinerary:1, Booking:1
  };
  function labelForename(s1) {
    var toks = String(s1).split(/\s+/);
    return !!(FIELD_LABELS[toks[0]] || FIELD_LABELS[toks[toks.length - 1]]);
  }

  var ORG_SUFFIX = /\b(ltd|limited|plc|llp|llc|inc|corp|gmbh|sl|sa|bv|sarl|holdings|logistics|transport|trading|imports|exports)\.?$/i;

  /* Deterministic jitter from a label so several addresses in one town don't
   * stack on the exact same map pin. ±scale/2 degrees. */
  function geoJitter(seed, scale) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * scale;
  }

  /* Give an address its own map position: parent locality first, UK postcode
   * area as fallback. Always flagged approximate — never pretend street-level. */
  function applyAddressGeo(attrs, label, parentGaz, ukPostcode) {
    if (typeof attrs.lat === "number") return;
    if (parentGaz) {
      attrs.lat = parentGaz.lat + geoJitter(label, 0.02);
      attrs.lon = parentGaz.lon + geoJitter(label + "|x", 0.03);
      attrs.geoApprox = "locality";
      return;
    }
    if (ukPostcode && G && G.postcodeArea) {
      var pa = G.postcodeArea(ukPostcode);
      if (pa) {
        attrs.lat = pa.lat + geoJitter(label, 0.02);
        attrs.lon = pa.lon + geoJitter(label + "|x", 0.03);
        attrs.geoApprox = "postcode-area";
        attrs.cc = attrs.cc || "GB";
      }
    }
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function toISO(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  /* ---------------- span bookkeeping ---------------- */

  function Spans() { this.taken = []; }
  Spans.prototype.overlaps = function (s, e) {
    return this.taken.some(function (t) { return s < t[1] && e > t[0]; });
  };
  Spans.prototype.claim = function (s, e) { this.taken.push([s, e]); };

  /* ---------------- main ---------------- */

  function extract(text, opts) {
    opts = opts || {};
    var dateFormat = opts.dateFormat || "DMY"; // UK default
    text = String(text || "");

    var refSeq = 0;
    function ref(prefix) { return prefix + ":" + (++refSeq); }

    var entities = [];
    var relationships = [];
    var events = [];
    var ambiguities = [];
    var cues = [];          // highlighted trigger words (DOB, verbs) for the review screen
    var spans = new Spans();

    function addEntity(type, label, value, attrs, confidence, start, end, flags) {
      // Reuse an existing extracted entity if it canonicalises identically.
      var canon = canonicalValue(type, value || label);
      for (var i = 0; i < entities.length; i++) {
        var e = entities[i];
        if (e.type === type && e._canon === canon) {
          e.spans.push([start, end]);
          if (attrs) Object.keys(attrs).forEach(function (k) {
            if (e.attrs[k] === undefined) e.attrs[k] = attrs[k];
          });
          return e;
        }
      }
      var ent = {
        ref: ref("e"), type: type, label: label, value: value || label,
        attrs: attrs || {}, confidence: confidence,
        spans: [[start, end]], flags: flags || [], _canon: canon
      };
      cmEnrich(ent, start, end);
      entities.push(ent);
      return ent;
    }

    // CM enrichment: standardise/validate into attrs + tag recognised terms.
    // Additive only — never alters label/value/_canon (matching + dedup safe).
    function cmEnrich(ent, start, end) {
      if (!St) return;
      var a = ent.attrs || (ent.attrs = {});
      try {
        if (ent.type === "person") {
          var ctx = text.slice(Math.max(0, (start || 0) - 140), Math.min(text.length, (end || 0) + 140));
          if (ctx) {
            var st = St.detectStatus(ctx).map(function (x) { return x.code; });
            var wn = St.detectWarningSignals(ctx).map(function (x) { return x.code; });
            if (st.length && !a.cmStatus) a.cmStatus = st;
            if (wn.length && !a.cmWarnings) a.cmWarnings = wn;
          }
        } else if (ent.type === "phone") {
          if (a.kind !== "IMEI") a.cm = St.phoneCM(ent.value || ent.label);
        } else if (ent.type === "vehicle") {
          var vv = ent.value || ent.label;
          a.cm = St.identifiers.vrm.freeText(vv); a.cmValid = St.identifiers.vrm.validate(vv);
        } else if (ent.type === "money") {
          a.cm = St.currencyCM(ent.label);
        } else if (ent.type === "ip") {
          a.cm = St.identifiers.ip.freeText(ent.label); a.cmValid = St.identifiers.ip.validate(ent.label);
        } else if (ent.type === "account") {
          a.cm = St.identifiers.account.freeText(ent.value || ent.label);
        } else if (ent.type === "date") {
          if (a.iso) a.cmDate = St.ddmmyyyy(a.iso);
        }
      } catch (e) { /* enrichment must never break extraction */ }
    }

    function canonicalValue(type, v) {
      if (type === "phone") { var p = M.normalisePhone(v); return p.e164 || M.canonicalName(v); }
      if (type === "email") return M.normaliseEmail(v) || String(v).toLowerCase();
      // digits matter (accounts, VRMs, IMEIs) — fold to lowercase alphanumerics
      return M.foldAccents(String(v)).toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function titleWord(w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }

    function looksLikeReferenceNumber(start, end, raw) {
      var before = text.slice(Math.max(0, start - 28), start);
      var after = text.slice(end, Math.min(text.length, end + 16));
      // document IDs that are not phones — checked on a slightly wider window so
      // "passport ... number 503842156" / NINO / NHS / licence are not mis-read as phones.
      if (/\b(?:passport|national\s+insurance|NINO|NHS\s+(?:no\.?|number)|driving\s+licen[cs]e)\b[^0-9\n]{0,44}$/i.test(text.slice(Math.max(0, start - 48), start))) return true;
      var joined = before + raw + after;
      if (/(?:SAR|CD|CNX|HMRC|PND|NBTC|IR|URN|REF|REFERENCE|DISCLOSURE|CASE|REQ)[\s/:#-]*$/i.test(before)) return true;
      if (/[A-Z]{2,}[-/][0-9]{4}[-/A-Z0-9]*$/i.test(before + raw)) return true;
      if (/\b(?:UTR|VAT|PAYE|Co\.?\s*No\.?|Company\s+No\.?|PNR|PNCID|CRO|PPT|IMSI|ICCID|IMEI)[^0-9\n]{0,40}$/i.test(before)) return true;
      if (/\b(?:UTR|VAT|PAYE|VAT\s+number|Company\s+number|Disclosure\s+ref)\b[^\n]*\n\s*(?:GB\s*)?$/i.test(before)) return true;
      if (/\b(?:ref|reference|case|disclosure|requirement)\b/i.test(joined) && /[-/]/.test(joined)) return true;
      return false;
    }

    /* ---- 1. Emails (most specific, claim first) ---- */
    var reEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    var m;
    while ((m = reEmail.exec(text))) {
      var canonE = M.normaliseEmail(m[0]);
      spans.claim(m.index, m.index + m[0].length);
      addEntity("email", m[0], canonE || m[0],
        { canonical: canonE }, canonE ? "high" : "med",
        m.index, m.index + m[0].length);
    }

    /* ---- 2. Dates (claim before phones so digits aren't eaten) ---- */
    // 2a. dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
    var dateHits = []; // {start,end,iso,ambiguous,raw}
    var reSlash = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/g;
    while ((m = reSlash.exec(text))) {
      var a = parseInt(m[1], 10), b = parseInt(m[2], 10), y = parseInt(m[3], 10);
      var d, mo, ambiguous = false;
      if (dateFormat === "MDY") { d = b; mo = a; } else { d = a; mo = b; }
      if (mo > 12 && d <= 12) { var tmp = d; d = mo; mo = tmp; } // self-correcting
      else if (d <= 12 && b !== a && mo <= 12) { ambiguous = true; }
      var iso = toISO(y, mo, d);
      if (!iso) continue;
      spans.claim(m.index, m.index + m[0].length);
      dateHits.push({ start: m.index, end: m.index + m[0].length, iso: iso, ambiguous: ambiguous, raw: m[0] });
    }
    // 2b. ISO yyyy-mm-dd
    var reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = reIso.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      var iso2 = toISO(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (!iso2) continue;
      spans.claim(m.index, m.index + m[0].length);
      dateHits.push({ start: m.index, end: m.index + m[0].length, iso: iso2, ambiguous: false, raw: m[0] });
    }
    // 2c. "20 December 2000" / "December 20, 2000"
    var reWordDate = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})|([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?)\s+(\d{4})\b/g;
    while ((m = reWordDate.exec(text))) {
      var dd = m[1] || m[4], mon = (m[2] || m[3] || "").toLowerCase(), yy = m[5];
      if (!MONTHS[mon]) continue;
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      var iso3 = toISO(parseInt(yy, 10), MONTHS[mon], parseInt(dd, 10));
      if (!iso3) continue;
      spans.claim(m.index, m.index + m[0].length);
      dateHits.push({ start: m.index, end: m.index + m[0].length, iso: iso3, ambiguous: false, raw: m[0] });
    }

    // 2d. relative dates ("yesterday", "last Tuesday") resolved against
    // opts.refDate (defaults to today) — always flagged for confirmation.
    var refDate = opts.refDate ? new Date(opts.refDate) : new Date();
    var WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    var reRel = /\b(today|yesterday|tomorrow|last\s+night|this\s+(?:morning|afternoon|evening)|(?:last|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(?:last|next)\s+(week|month))\b/gi;
    while ((m = reRel.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      var phrase = m[0].toLowerCase();
      var rd = new Date(refDate.getTime());
      var resolved = true;
      if (phrase === "today" || phrase.indexOf("this") === 0) { /* same day */ }
      else if (phrase === "yesterday" || phrase === "last night") rd.setDate(rd.getDate() - 1);
      else if (phrase === "tomorrow") rd.setDate(rd.getDate() + 1);
      else if (m[2]) {
        var want = WEEKDAYS[m[2].toLowerCase()];
        var dir = phrase.indexOf("last") === 0 ? -1 : 1;
        do { rd.setDate(rd.getDate() + dir); } while (rd.getDay() !== want);
      } else if (m[3]) {
        var dir2 = phrase.indexOf("last") === 0 ? -1 : 1;
        rd.setDate(rd.getDate() + dir2 * (m[3].toLowerCase() === "week" ? 7 : 30));
      } else resolved = false;
      if (!resolved) continue;
      var isoR = rd.getFullYear() + "-" + pad2(rd.getMonth() + 1) + "-" + pad2(rd.getDate());
      spans.claim(m.index, m.index + m[0].length);
      dateHits.push({ start: m.index, end: m.index + m[0].length, iso: isoR, ambiguous: false, raw: m[0], relative: true });
      ambiguities.push({ kind: "date", message: "\u201C" + m[0] + "\u201D resolved to " + isoR + " against reference date " + refDate.toISOString().slice(0, 10) + ". Confirm." });
    }

    /* ---- 2d2. Document tags & grading (3×5×2) ---- */
    var tags = [];
    var reXx = /\bXX-[A-Z]{2,6}\b/g;
    while ((m = reXx.exec(text))) {
      if (tags.indexOf(m[0]) === -1) tags.push(m[0]);
    }
    var grading = null;
    var gm = /\[\s*([1-3])\s*[·.\s]*([A-E])\s*[·.\s]*([PC])\s*\]/.exec(text);
    if (gm) grading = { source: gm[1], assessment: gm[2], handling: gm[3] };

    /* ---- 2d3. PNR / booking locators (claim before the postcode pass —
       "K7T2QL" is postcode-shaped and was misfiring) ---- */
    var rePnr = /\b(?:PNRs?|Locators?|LOCATORS?|locators?|Booking\s+[Rr]ef(?:erence)?s?|booking\s+ref(?:erence)?s?)[\s.:]*\(?([A-Z0-9]{6})\b/g;
    while ((m = rePnr.exec(text))) {
      var pnrCode = m[1];
      if (!/\d/.test(pnrCode) || !/[A-Z]/.test(pnrCode)) continue; // real locators mix both
      var ps = m.index + m[0].lastIndexOf(pnrCode), pe = ps + pnrCode.length;
      if (spans.overlaps(ps, pe)) continue;
      spans.claim(ps, pe);
      addEntity("note", "PNR " + pnrCode, pnrCode, { kind: "pnr" }, "high", ps, pe);
    }

    /* ---- 2e. Prefixed identifiers (claim before phones eat the digits) ---- */
    var personIdHits = []; // {key, value, start, end} → attached after people exist
    // IMEI: 15 digits, prefixed (allow internal spaces, e.g. "35 680705 824133 2")
    var reImeiPre = /\bIMEI[\s.:]*((?:[0-9][ ]?){15})\b/gi;
    while ((m = reImeiPre.exec(text))) {
      var imeiDigits = m[1].replace(/\D+/g, "");
      if (imeiDigits.length !== 15) continue;
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      addEntity("phone", "IMEI " + imeiDigits, imeiDigits, { kind: "IMEI" }, "high", m.index, m.index + m[0].length);
    }
    // Passport: PPT 123456789 [Country]
    var rePptPre = /\bPPT[\s.:]*([0-9]{6,9})(?:\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?))?/g;
    while ((m = rePptPre.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      personIdHits.push({ key: "passport", value: m[1] + (m[2] ? " " + m[2] : ""), start: m.index, end: m.index + m[0].length });
    }
    // CRO / SCRO + PNC ID
    var reCroPre = /\b(S?CRO)[\s.:]*([0-9]{1,6}\/[0-9]{2}[A-Z]?)\b/g;
    while ((m = reCroPre.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      personIdHits.push({ key: "cro", value: m[2], start: m.index, end: m.index + m[0].length });
    }
    var rePncPre = /\bPNC(?:\s?ID)?[\s.:]*([0-9]{2,4}\/[0-9]{1,7}[A-Z])\b/g;
    while ((m = rePncPre.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      personIdHits.push({ key: "pnc", value: m[1], start: m.index, end: m.index + m[0].length });
    }
    // NINO — labelled first, then the distinctive bare shape (GBIQ tables
    // print "JT 60 12 04 C" with no label at all)
    var reNinoPre = /\bNINO[\s.:]*([A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D])\b/g;
    while ((m = reNinoPre.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      personIdHits.push({ key: "nino", value: m[1].replace(/\s+/g, ""), start: m.index, end: m.index + m[0].length });
    }
    var reNinoBare = /\b([A-CEGHJ-PR-TW-Z]{2}\s\d{2}\s\d{2}\s\d{2}\s[A-D])\b/g;
    while ((m = reNinoBare.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      personIdHits.push({ key: "nino", value: m[1].replace(/\s+/g, ""), start: m.index, end: m.index + m[0].length });
    }
    // Company numbers — standalone "Co. No. 12345678" / "Companies House 12345678"
    var orgIdHits = []; // attached to the nearest organisation once orgs exist
    var reCoNo = /\b(?:Co(?:mpany)?\.?\s*(?:No|Number)\.?|Companies\s+House(?:\s+No\.?)?)[\s.:]*\(?(\d{8})\)?/gi;
    while ((m = reCoNo.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      orgIdHits.push({ value: m[1], start: m.index, end: m.index + m[0].length });
    }
    // Financial: AC / SC / CC
    var reFinPre = /\b(AC|SC|CC)[\s.:]+([0-9A-Z]{6,18})\b/g;
    while ((m = reFinPre.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      if (m[1] === "SC" && !/^\d{6}$/.test(m[2])) continue;
      spans.claim(m.index, m.index + m[0].length);
      var finKind = m[1] === "AC" ? "account" : (m[1] === "SC" ? "sort code" : "card");
      addEntity("account", m[1] + " " + m[2], m[2], { kind: finKind }, "high", m.index, m.index + m[0].length);
    }
    var reScAcc = /\b(?:s\/c|sort\s*code)\s*([0-9]{2}-[0-9]{2}-[0-9]{2})\s+a\/c\s*([0-9]{4,8})\b/gi;
    while ((m = reScAcc.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      var ctxBank = text.slice(Math.max(0, m.index - 48), m.index).match(/\b([A-Z][A-Za-z&'’.-]+(?:\s+[A-Z][A-Za-z&'’.-]+){0,3})\s*$/);
      var bank = ctxBank ? ctxBank[1].replace(/\s+/g, " ").trim() : "";
      addEntity("account", (bank ? bank + " " : "") + m[1] + " / " + m[2],
        m[1].replace(/\D/g, "") + m[2], { sortCode: m[1], account: m[2], bank: bank, kind: "account" },
        "high", m.index, m.index + m[0].length);
    }
    // "Barclays a/c ending 4421"
    var reAccPre = /\b([A-Z][a-z]+)\s+a\/c\s+(?:ending\s+)?([0-9]{4,8})\b/g;
    while ((m = reAccPre.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      addEntity("account", m[1] + " a/c " + m[2], m[1] + m[2], { bank: m[1], kind: "account" }, "med", m.index, m.index + m[0].length);
    }
    var reOtherId = /\b(UTR|VAT|PAYE|IMSI|ICCID|VAT\s+number)[^0-9\n]{0,40}([A-Z]{0,2}\s*[0-9][0-9A-Z\s\/-]{5,20})\b/gi;
    while ((m = reOtherId.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      var key = m[1].toLowerCase();
      var val = m[2].replace(/\s+/g, " ").trim();
      spans.claim(m.index, m.index + m[0].length);
      if (key === "imsi" || key === "iccid") {
        addEntity("phone", key.toUpperCase() + " " + val.replace(/\D/g, ""), val.replace(/\D/g, ""),
          { kind: key.toUpperCase() }, "high", m.index, m.index + m[0].length);
      } else {
        personIdHits.push({ key: key, value: val, start: m.index, end: m.index + m[0].length });
      }
    }

    /* ---- 3. Phones ---- */
    var rePhone = /(?:\+|00)?[\d][\d\s().-]{7,18}\d/g;
    while ((m = rePhone.exec(text))) {
      var s = m.index, e = m.index + m[0].length;
      if (spans.overlaps(s, e)) continue;
      if (looksLikeReferenceNumber(s, e, m[0])) continue;
      var digits = m[0].replace(/\D+/g, "");
      if (digits.length < 9 || digits.length > 15) continue;
      var norm = M.normalisePhone(m[0]);
      if (!norm.e164) continue;
      spans.claim(s, e);
      var conf = norm.valid ? "high" : "med";
      var flags = [];
      if (!norm.valid && norm.reason) flags.push(norm.reason);
      addEntity("phone", norm.e164, norm.e164,
        { raw: m[0].trim(), cc: norm.cc || "", valid: norm.valid }, conf, s, e, flags);
      if (!norm.valid) {
        ambiguities.push({ kind: "phone", message: "Phone " + m[0].trim() + " — " + (norm.reason || "could not validate") });
      }
    }

    /* ---- 4. Addresses (before generic locations) ---- */
    var reAddr = /\b(?:[Cc][\/.]\s?[A-ZÁÉÍÓÚÑ][\wáéíóúñü.-]+|Calle\s+\w+|Avda\.?\s+\w+|Av\.?\s+\w+|\d{1,4}\s+[A-Z][a-z]+\s+(?:Road|Rd|Street|St|Lane|Ln|Close|Avenue|Ave|Way|Drive|Dr|Place|Pl|Court|Crescent|Gardens|Terrace)|[A-Z][a-z]+\s+(?:Road|Rd|Street|St|Lane|Ln|Close|Avenue|Ave|Way|Drive|Dr|Place|Pl|Court|Crescent|Gardens|Terrace))\b[^.\n•]{0,90}/g;
    while ((m = reAddr.exec(text))) {
      var sA = m.index, raw = m[0];
      raw = raw.split(/\s+(?:and|who|which|but|where|while)\s+/)[0];
      raw = raw.replace(/[\s,;]+$/, "");
      var eA = sA + raw.length;
      if (spans.overlaps(sA, eA)) continue;

      // Parent locality: scan address text for gazetteer hits
      var parent = null, ccA = "";
      raw.split(/[,\s]+/).forEach(function (tok) {
        var g = G.lookup(tok);
        if (g && (g.t === "city" || g.t === "port")) { parent = g; ccA = g.cc; }
      });
      var pcUK = raw.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/);
      var pcES = raw.match(/\b(0[1-9]|[1-4]\d|5[0-2])\d{3}\b/);
      // ATLAS addresses carry a building number and/or postcode (IM01 SD01). A bare
      // street-suffix phrase with no number, postcode or locality ("Crown Court",
      // "County Court", "Amount Court") is table/prose noise — drop it.
      var hasEvidence = /^[1-9]/.test(raw) || pcUK || pcES || parent;
      // a street suffix followed by a comma + locality ("Acacia Avenue, Smalltown")
      // is a plausible address even with no number/postcode -> keep, but only at LOW.
      var streetLocality = /,\s*[A-Z][a-z]+/.test(raw);
      if (!hasEvidence && !streetLocality) continue;     // pure suffix noise -> drop
      spans.claim(sA, eA);
      var attrsA = {};
      if (pcUK) { attrsA.postcode = pcUK[0]; ccA = ccA || "GB"; }
      else if (pcES && parent && parent.cc === "ES") attrsA.postcode = pcES[0];
      if (parent) { attrsA.locality = parent.n; attrsA.cc = parent.cc; }
      applyAddressGeo(attrsA, raw, parent, pcUK ? pcUK[0] : null);
      // An address that carries a postcode ends AT the postcode — trim any
      // sentence continuation the matcher over-ran into ("...M14 7QP, having relocated").
      // UK postcodes END an address, so trim any sentence run-on after them. Non-UK
      // postcodes (e.g. Spanish "29016 Málaga, Spain") PRECEDE the locality — do not
      // trim there or the city/country is lost.
      if (pcUK) {
        var _pcEnd = raw.indexOf(pcUK[0]);
        if (_pcEnd !== -1) { _pcEnd += pcUK[0].length; if (_pcEnd < raw.length) raw = raw.slice(0, _pcEnd).trim(); }
      }
      var entA = addEntity("address", raw, raw, attrsA,
        (pcUK || pcES || parent) ? "high" : (hasEvidence ? "med" : "low"), sA, eA);
      entA._parentGaz = parent || null;
    }

    // 4b. Postcode-anchored addresses — catches ALL-CAPS / form-layout addresses the
    // mixed-case street regex misses (e.g. PNC "14 BRACKENFIELD ROAD, STOCKPORT, SK4 2RH").
    // The UK postcode is the reliable anchor (ATLAS IM01 SD01 address standard).
    var rePostAnchor = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g;
    while ((m = rePostAnchor.exec(text))) {
      var pcEnd = m.index + m[0].length;
      if (spans.overlaps(m.index, pcEnd)) continue;              // already inside an address
      var ls = text.lastIndexOf("\n", m.index); ls = ls < 0 ? 0 : ls + 1;
      var seg = text.slice(ls, pcEnd);
      var lead = seg.match(/^[^:]*:\s*/);                       // drop a "LABEL ...: " prefix
      var segStart = ls + (lead ? lead[0].length : 0);
      var addr = text.slice(segStart, pcEnd).replace(/^[\s,;]+/, "");
      // trim any prose lead-in: start at the first house number / premises word
      var cut = addr.search(/\b(\d{1,4}[a-z]?\s+[A-Za-z]|Unit|Flat|Apartment)\b/i);
      if (cut > 0) addr = addr.slice(cut);
      var aStart = pcEnd - addr.length;
      if (addr.length < 8 || addr.length > 120) continue;
      if (spans.overlaps(aStart, pcEnd)) continue;
      // must look like an address: a house number, a comma, or a street/premises word
      if (!/^\d{1,4}[a-z]?\s|\b\d{1,4}[a-z]?\s+[A-Za-z]|\b(ROAD|RD|STREET|LANE|CLOSE|AVENUE|AVE|WAY|DRIVE|COURT|CRESCENT|GARDENS|TERRACE|PARK|HOUSE|UNIT|FLAT|ESTATE|HEIGHTS|BUILDINGS?)\b/i.test(addr)) continue;
      spans.claim(aStart, pcEnd);
      var apc = m[0];
      var aParent = null;
      addr.split(/[,\s]+/).forEach(function (tok) {
        var g = G.lookup(tok); if (g && (g.t === "city" || g.t === "port")) aParent = g;
      });
      var aAttrs = { postcode: apc };
      if (aParent) { aAttrs.locality = aParent.n; aAttrs.cc = aParent.cc; }
      applyAddressGeo(aAttrs, addr, aParent, apc);
      var pEnt = addEntity("address", addr, addr, aAttrs, "high", aStart, pcEnd);
      pEnt._parentGaz = aParent || null;
    }

    /* ---- 5. Locations via gazetteer + "X airport" + ALLCAPS ---- */
    // 5a. explicit "<Name> airport"
    var reAirport = /\b([A-Z][A-Za-zÁÉÍÓÚáéíóúñü-]+(?:\s[A-Z][A-Za-z-]+)?)\s+[Aa]irport\b/g;
    while ((m = reAirport.exec(text))) {
      var sL = m.index, eL = m.index + m[0].length;
      if (spans.overlaps(sL, eL)) continue;
      var gA = G.lookup(m[0]) || G.lookup(m[1] + " Airport") || G.lookup(m[1]);
      spans.claim(sL, eL);
      if (gA) {
        var _an = (gA.t === "airport" ? gA.n : m[1] + " Airport");
        var _alabel = gA.iata ? (_an + " (" + gA.iata + ")") : _an;
        addEntity("location", _alabel,
          gA.n, { lat: gA.lat, lon: gA.lon, cc: gA.cc, kind: "airport", iata: gA.iata || "", gaz: gA.id },
          "high", sL, eL);
      } else {
        addEntity("location", m[0], m[0], { kind: "airport" }, "med", sL, eL,
          ["not in gazetteer"]);
      }
    }
    // 5b. gazetteer scan over remaining text (longest names first)
    var keys = G.allKeys().slice().sort(function (a, b) { return b.length - a.length; });
    var foldedText = G.fold(text);
    keys.forEach(function (key) {
      if (key.length < 4) return; // avoid "us", "uk" false hits mid-word
      var idx = 0;
      while ((idx = foldedText.indexOf(key, idx)) !== -1) {
        var endI = idx + key.length;
        var beforeOk = idx === 0 || !/[a-z0-9]/.test(foldedText[idx - 1]);
        var afterOk = endI >= foldedText.length || !/[a-z0-9]/.test(foldedText[endI]);
        if (beforeOk && afterOk && !spans.overlaps(idx, endI)) {
          var origTok = text.slice(idx, endI);
          var precede = text.slice(Math.max(0, idx - 26), idx);
          var follow = text.slice(endI, Math.min(text.length, endI + 28));
          // lowercase original = handle/url/email fragment ("@sofia.drag96"),
          // never a proper-noun place
          if (!/^[A-Z]/.test(origTok)) { idx = endI; continue; }
          // inside a handle / domain / path
          if (/[@\/.]$/.test(text.slice(Math.max(0, idx - 1), idx))) { idx = endI; continue; }
          // ALLCAPS token straight after a Forename is a surname, not a place
          if (/^[A-Z'\u2019-]+$/.test(origTok) && /[A-Z][a-z]+\s+$/.test(precede)) { idx = endI; continue; }
          // A gazetteer forename followed by an ALLCAPS surname is a person, e.g. Sofia DRAGOMIR.
          if (/^[A-Z][a-z\u00c0-\u017f'-]+$/.test(origTok) && /^\s+[A-Z][A-Z'\u2019-]{2,}\b/.test(follow)) { idx = endI; continue; }
          // Surname-comma-forename table rows, e.g. DRAGOMIR, Sofia.
          if (/^[A-Z][a-z\u00c0-\u017f'-]+$/.test(origTok) && /[A-Z][A-Z'\u2019-]{2,},\s+$/.test(precede)) { idx = endI; continue; }
          var g = G.lookup(key);
          if (g) {
            // "<City> (XXX)" where XXX is an airport IATA -> record the AIRPORT, not the city
            var apM = follow.match(/^\s*\(([A-Za-z]{3})\)/);
            if (apM && G.lookupIata) {
              var ap = G.lookupIata(apM[1].toUpperCase());
              if (ap && ap.t === "airport") { g = ap; endI += apM[0].length; }
            }
            spans.claim(idx, endI);
            var attrs2 = { lat: g.lat, lon: g.lon, cc: g.cc, kind: g.t, gaz: g.id };
            if (g.iata) attrs2.iata = g.iata;
            var _glabel = (g.t === "airport" && g.iata) ? (g.n + " (" + g.iata + ")") : g.n;
            addEntity("location", _glabel, g.n, attrs2, "high", idx, endI);
          }
        }
        idx = endI;
      }
    });

    /* ---- 6. Vehicle registrations (UK current format) ---- */
    var reReg = /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/g;
    while ((m = reReg.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      var vAttrs = { regFormat: "UK" };
      var back = text.slice(Math.max(0, m.index - 44), m.index);
      var colM = back.match(/\b(black|white|silver|grey|gray|blue|red|green|gold|brown|orange|yellow|beige|maroon|dark|navy)\b/gi);
      if (colM) vAttrs.colour = colM[colM.length - 1].toLowerCase();
      var makeM = back.match(/\b(BMW|Audi|Mercedes(?:-Benz)?|VW|Volkswagen|Ford|Vauxhall|Toyota|Honda|Nissan|Range Rover|Land Rover|Jaguar|Kia|Hyundai|Peugeot|Renault|Citroen|Skoda|Seat|Volvo|Lexus|Porsche|Tesla|Mini|Fiat|Mazda|Suzuki|Transit|Sprinter)\b/gi);
      if (makeM) vAttrs.make = makeM[makeM.length - 1];
      addEntity("vehicle", m[0].replace(/\s+/, " "), m[0].replace(/\s+/g, ""),
        vAttrs, "high", m.index, m.index + m[0].length);
    }

    /* ---- 7. Money ---- */
    // Currency must sit on the same line as the number (PDF/table text breaks
    // columns with newlines — "4,980\nGBP" is a balance column, not money).
    var reMoney = /(?:£|€|\$)[ \t]?\d[\d,]*(?:\.\d{1,2})?(?:[ \t]?(?:k|m|million|thousand))?|\b\d[\d,]*(?:\.\d{1,2})?[ \t](?:GBP|EUR|USD)\b|\b(?:GBP|EUR|USD)[ \t]\d[\d,]*(?:\.\d{1,2})?\b/g;
    while ((m = reMoney.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      // bare "NNNN GBP" / "GBP NNNN" guards: years and tiny table integers
      // are column noise, not cash
      var bareNum = m[0].match(/^(\d{1,4})[ \t](?:GBP|EUR|USD)$/i) ||
                    m[0].match(/^(?:GBP|EUR|USD)[ \t](\d{1,4})$/i);
      if (bareNum) {
        if (/^(19|20)\d{2}$/.test(bareNum[1])) continue;   // year + currency column
        if (bareNum[1].replace(/\D/g, "").length < 3) continue; // "0 GBP", "GBP 24"
      }
      spans.claim(m.index, m.index + m[0].length);
      addEntity("money", m[0].trim(), m[0].trim(), {}, "high", m.index, m.index + m[0].length);
    }

    /* ---- 8. IP addresses ---- */
    var reIp = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    while ((m = reIp.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      var ok = m[0].split(".").every(function (o) { return parseInt(o, 10) <= 255; });
      if (!ok) continue;
      spans.claim(m.index, m.index + m[0].length);
      addEntity("ip", m[0], m[0], {}, "high", m.index, m.index + m[0].length);
    }

    /* ---- 8b. Criminal groups (ATLAS CG prefix) ---- */
    var reCg = /\bCG\s+([A-Z][A-Z ]{2,40}[A-Z])\b/g;
    while ((m = reCg.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      addEntity("organisation", m[1].trim(), m[1].trim(), { kind: "criminal group" }, "high", m.index, m.index + m[0].length);
    }

    /* ---- 9. People & organisations ---- */
    // Names written on an "ALIAS / AKA / nickname / streetname" line (PNC/CM
    // convention, IM01 SD01) are aliases of the preceding nominal, not new people.
    function foldAlias(idx, endIdx, label) {
      var line = text.slice(Math.max(0, idx - 140), idx).split(/\n/).pop();
      var km = /\b(ALIAS|AKA|A\.K\.A\.|also known as|street ?name|nickname)\b[\s:.]*/i.exec(line);
      if (!km) return false;
      // Everything between the keyword and the name must be an alias list: separators
      // plus uppercase-initial name tokens. A lowercase sentence word ("is", "and",
      // "seen") means this is prose, not an alias line -> do NOT fold (keeps real,
      // separate people who merely share a line with the word "nickname"/"alias").
      var gap = line.slice(km.index + km[0].length);
      var toks = gap.split(/\s+/);
      for (var ti = 0; ti < toks.length; ti++) {
        var t = toks[ti].replace(/^[^A-Za-z0-9]+/, "");
        if (t && /^[a-z]/.test(t)) return false;
      }
      var owner = nearestEntityBefore("person", idx);
      if (!owner) return false;
      var ownEnd = (owner.spans && owner.spans.length) ? owner.spans[owner.spans.length - 1][1] : 0;
      // A label-led "ALIAS / AKA ...:" line is field-form (PNC print): the
      // nominal header sits many lines above, so allow a wider bind window.
      var fieldForm = km.index < 4;
      if (idx - ownEnd > (fieldForm ? 1000 : 300)) return false; // don't bind across unrelated records
      owner.attrs.aka = owner.attrs.aka ? owner.attrs.aka + " / " + label : label;
      owner.spans.push([idx, endIdx]);
      spans.claim(idx, endIdx);
      return true;
    }
    // 9a-pre. Field-form nominal: "SURNAME: X" + "FORENAME(S): Y" (PNC/PND header),
    //   or "(SUBSCRIBER) NAME: <CAPS NAME>" (comms-data returns). Assembled FIRST so the
    //   nearby PNCID/CRO/NINO/DOB/PPT bind to it.
    (function () {
      var sm = /\bSURNAME[\s.]*:\s*([A-Z][A-Z'\u2019-]{1,})\b/.exec(text);
      var fm = /\bFORENAME(?:\(S\))?[\s.]*:\s*([A-Z][A-Z'\u2019 -]+?)\s+(?:SEX|DOB|SELF|NATION|HEIGHT|POB|$)/.exec(text);
      if (sm && fm) {
        var lbl = fm[1].trim().split(/\s+/).map(titleWord).join(" ") + " " + sm[1].toUpperCase();
        var at = Math.min(sm.index, fm.index);
        if (!spans.overlaps(at, at + 1))
          addEntity("person", lbl, lbl, {}, "high", at, at + sm[0].length, ["field-form nominal"]);
      } else {
        var nm = /\b(?:SUBSCRIBER\s+)?NAME[\s.]*:\s*(?:MR|MRS|MS|MISS|DR)?\s*([A-Z][A-Z'\u2019-]+(?:\s+[A-Z][A-Z'\u2019-]+){1,2})\b/.exec(text);
        if (nm) {
          var toks = nm[1].trim().split(/\s+/);
          while (toks.length > 2 && (FIELD_LABELS[titleWord(toks[toks.length - 1])] || NAME_STOPWORDS[toks[toks.length - 1]])) toks.pop();
          var lbl2 = toks.map(function (w, i) { return i === toks.length - 1 ? w.toUpperCase() : titleWord(w); }).join(" ");
          if (!spans.overlaps(nm.index, nm.index + 1))
            addEntity("person", lbl2, lbl2, {}, "high", nm.index, nm.index + nm[0].length, ["field-form name"]);
        }
      }
      var reCapsDob = /\b([A-Z][A-Z'\u2019-]+(?:\s+[A-Z][A-Z'\u2019-]+){1,3}),?\s+DOB\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})\b/g;
      var dm;
      while ((dm = reCapsDob.exec(text))) {
        var toks2 = dm[1].trim().split(/\s+/).filter(function (w) {
          return !FIELD_LABELS[titleWord(w)] && !NAME_STOPWORDS[w];
        });
        if (toks2.length < 2) continue;
        var label2 = toks2.map(function (w, i) { return i === toks2.length - 1 ? w.toUpperCase() : titleWord(w); }).join(" ");
        var dobParts = dm[2].split(/[\/.\-]/);
        var dobIso = toISO(parseInt(dobParts[2], 10), parseInt(dobParts[1], 10), parseInt(dobParts[0], 10));
        var ent = addEntity("person", label2, label2, dobIso ? { dob: dobIso } : {}, "high",
          dm.index, dm.index + dm[1].length, ["field-form name/dob"]);
        ent.spans.push([dm.index + dm[0].lastIndexOf(dm[2]), dm.index + dm[0].lastIndexOf(dm[2]) + dm[2].length]);
      }
    })();
    // 9a0. Forename 'Nickname' SURNAME — quoted alias inside the name
    var reNick = /\b([A-Z][a-z]+)\s+["'\u2018\u2019\u201C\u201D]([A-Z][\w-]{1,20})["'\u2018\u2019\u201C\u201D]\s+([A-Z][A-Z'\u2019-]{2,})\b/g;
    while ((m = reNick.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      if (NAME_STOPWORDS[m[3]] || G.lookup(m[3])) continue;
      spans.claim(m.index, m.index + m[0].length);
      var nkLabel = m[1] + " " + m[3];
      addEntity("person", nkLabel, nkLabel, { aka: m[2] }, "high", m.index, m.index + m[0].length);
    }
    // 9a. Forename SURNAME (caps convention — high confidence)
    var rePerson = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+([A-Z][A-Z'’-]{2,})\b/g;
    while ((m = rePerson.exec(text))) {
      var sP = m.index, eP = m.index + m[0].length;
      if (spans.overlaps(sP, eP)) continue;
      if (NAME_STOPWORDS[m[2]]) continue;
      if (/^(?:The|This|That|These|Those|A|An|And|But|Or|Our|Their|His|Her|Its|My|Your|No|All|Some|Any|Each|Every|If|As|At|In|On|Of|To|By)$/.test(m[1].split(/\s+/)[0])) continue; // function word, not a forename
      if (ORG_SUFFIX.test(m[0])) continue;
      if (labelForename(m[1])) continue;
      var label = m[1] + " " + m[2];
      if (foldAlias(sP, eP, label)) continue;          // ALIAS/AKA line -> nominal aka
      spans.claim(sP, eP);
      addEntity("person", label, label, {}, "high", sP, eP);
    }
    // 9a1. SURNAME, Forename(s) — common in PNC/PND/credit/HMRC/flight tables
    var reSurComma = /\b([A-Z][A-Z'\u2019-]{2,}),\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
    while ((m = reSurComma.exec(text))) {
      var sSC = m.index, eSC = m.index + m[0].length;
      if (spans.overlaps(sSC, eSC)) continue;
      if (NAME_STOPWORDS[m[1]] || G.lookup(m[1])) continue;
      var fnToks = m[2].split(/\s+/);
      while (fnToks.length > 1 && FIELD_LABELS[fnToks[fnToks.length - 1]]) fnToks.pop();
      while (fnToks.length > 1 && FIELD_LABELS[fnToks[0]]) fnToks.shift();
      if (!fnToks.length || FIELD_LABELS[fnToks[0]]) continue;
      var scLabel = fnToks.join(" ") + " " + m[1];   // -> "Forename SURNAME"
      if (foldAlias(sSC, eSC, scLabel)) continue;     // on an ALIAS/AKA line -> nominal aka
      spans.claim(sSC, eSC);
      addEntity("person", scLabel, scLabel, {}, "high", sSC, eSC);
    }

    // 9b. Organisations by suffix
    var reOrg = /\b([A-Z][\w&'’-]*(?:\s+[A-Z][\w&'’-]*){0,3}\s+(?:Ltd|LTD|Limited|LIMITED|PLC|Plc|LLP|LLC|Inc|INC|Corp|CORP|GmbH|SL|SA|BV|Holdings|HOLDINGS|Logistics|LOGISTICS|Transport|TRANSPORT|Trading|TRADING)\.?)\b/g;
    while ((m = reOrg.exec(text))) {
      if (spans.overlaps(m.index, m.index + m[0].length)) continue;
      spans.claim(m.index, m.index + m[0].length);
      var orgLabel = m[0].split(/\r?\n/).pop().replace(/\s+/g, " ").trim();
      var orgLead = orgLabel.split(/\s+/)[0];
      if (FIELD_LABELS[orgLead]) {
        orgLabel = orgLabel.split(/\s+/).slice(1).join(" ").trim();
        if (!ORG_SUFFIX.test(orgLabel)) continue;
      }
      var orgEnt = addEntity("organisation", orgLabel, orgLabel, {}, "high", m.index, m.index + m[0].length);
      // Companies House number nearby: "(Co. No. 12345678)" or "(12345678)"
      var tail = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
      var cn = tail.match(/^\s*\((?:Co\.?\s*No\.?\s*)?(\d{8}|[A-Z]{2}\d{6})\)/);
      if (cn) orgEnt.attrs.companyNumber = cn[1];
    }
    // 9b1. attach standalone "Co. No. NNNNNNNN" hits to the nearest organisation
    orgIdHits.forEach(function (hit) {
      var bestOrg = null, bestDist = Infinity;
      entities.forEach(function (e) {
        if (e.type !== "organisation") return;
        e.spans.forEach(function (sp) {
          var dist = hit.start >= sp[1] ? hit.start - sp[1] : sp[0] - hit.end;
          if (dist >= 0 && dist < bestDist) { bestDist = dist; bestOrg = e; }
        });
      });
      if (bestOrg && bestDist < 220 && !bestOrg.attrs.companyNumber) {
        bestOrg.attrs.companyNumber = hit.value;
        bestOrg.spans.push([hit.start, hit.end]);
      }
    });
    // 9b2. table rows — "<ORG LTD> 11428876 Director": bare 8 digits straight
    // after the org name (GBIQ directorship tables)
    entities.forEach(function (e) {
      if (e.type !== "organisation" || e.attrs.companyNumber) return;
      var osp = e.spans[0];
      var lookahead = text.slice(osp[1], Math.min(text.length, osp[1] + 60));
      var cm2 = lookahead.match(/^[^\d]{0,16}(\d{8})\b/);
      if (cm2) e.attrs.companyNumber = cm2[1];
    });
    // 9c. General Title-Case personal names (news / OSINT prose).
    // SOLAR's other person rules assume report style — SURNAME in caps, or a cue
    // word (aka / DOB / Mr). Real-world prose ("Gavin Robinson", "Jane Gull") has
    // neither, so this pass recognises Title-Case name runs directly. Precision is
    // held by a stop-word list + org/place + gazetteer + quoted-title guards;
    // anything borderline is emitted at MED so the analyst clears it in review.
    var NAME_PARTICLE = { de:1, del:1, della:1, van:1, von:1, der:1, den:1, da:1,
      di:1, dí:1, la:1, le:1, du:1, dos:1, das:1, bin:1, al:1, ibn:1, "ter":1, "ten":1 };
    var NAME_STOP = {
      // sentence-initial / function words that are routinely capitalised
      The:1,This:1,That:1,These:1,Those:1,There:1,Then:1,They:1,Their:1,Them:1,
      He:1,She:1,It:1,Its:1,His:1,Her:1,Hers:1,We:1,Us:1,You:1,Your:1,Our:1,My:1,
      A:1,An:1,And:1,But:1,Or:1,Nor:1,For:1,Yet:1,So:1,If:1,As:1,At:1,In:1,On:1,
      Of:1,To:1,By:1,Up:1,Out:1,Off:1,Per:1,Via:1,With:1,From:1,Into:1,Onto:1,
      Over:1,Under:1,When:1,While:1,Where:1,Which:1,Who:1,Whom:1,Whose:1,Why:1,
      How:1,What:1,After:1,Before:1,During:1,Since:1,Until:1,Because:1,Although:1,
      Though:1,However:1,Meanwhile:1,Moreover:1,Therefore:1,Thus:1,Also:1,
      Following:1,According:1,Despite:1,Amid:1,Among:1,Amongst:1,Between:1,Both:1,
      Each:1,Every:1,All:1,Some:1,Any:1,No:1,Not:1,Now:1,Here:1,Today:1,
      Yesterday:1,Tomorrow:1,Last:1,Next:1,
      // numbers as words
      One:1,Two:1,Three:1,Four:1,Five:1,Six:1,Seven:1,Eight:1,Nine:1,Ten:1,
      Eleven:1,Twelve:1,Thirteen:1,Fourteen:1,Fifteen:1,Sixteen:1,Twenty:1,
      Thirty:1,Forty:1,Fifty:1,Sixty:1,Hundred:1,Thousand:1,Million:1,
      // days / months
      Monday:1,Tuesday:1,Wednesday:1,Thursday:1,Friday:1,Saturday:1,Sunday:1,
      January:1,February:1,March:1,April:1,May:1,June:1,July:1,August:1,
      September:1,October:1,November:1,December:1,
      // direction / geographic qualifiers
      North:1,South:1,East:1,West:1,Northern:1,Southern:1,Eastern:1,Western:1,
      Central:1,Upper:1,Lower:1,Greater:1,Mount:1,Saint:1,Fort:1,Lake:1,Port:1,
      Cape:1,Isle:1,
      // nationalities / demonyms (adjectival, not names)
      British:1,English:1,Scottish:1,Welsh:1,Irish:1,American:1,Canadian:1,
      Australian:1,French:1,German:1,Spanish:1,Italian:1,Dutch:1,Belgian:1,
      Portuguese:1,Swiss:1,Austrian:1,Danish:1,Swedish:1,Norwegian:1,Finnish:1,
      European:1,African:1,Asian:1,Russian:1,Ukrainian:1,Polish:1,Czech:1,
      Romanian:1,Bulgarian:1,Hungarian:1,Greek:1,Turkish:1,Chinese:1,Japanese:1,
      Korean:1,Vietnamese:1,Thai:1,Indian:1,Pakistani:1,Bangladeshi:1,Afghan:1,
      Iranian:1,Iraqi:1,Syrian:1,Lebanese:1,Sudanese:1,Somali:1,Ethiopian:1,
      Nigerian:1,Ghanaian:1,Kenyan:1,Egyptian:1,Moroccan:1,Algerian:1,Mexican:1,
      Brazilian:1,Argentine:1,Colombian:1,Albanian:1,Kosovan:1,Serbian:1,
      Croatian:1,Kurdish:1,Arab:1,Arabic:1,Jewish:1,Muslim:1,Islamic:1,
      Christian:1,Catholic:1,Protestant:1,Hindu:1,Sikh:1,Roma:1,
      // institution / org / place common nouns
      Party:1,Company:1,Theatre:1,Theater:1,Group:1,Service:1,Services:1,
      Department:1,Police:1,Hospital:1,University:1,College:1,School:1,Academy:1,
      Club:1,Airport:1,Council:1,Court:1,Committee:1,Commission:1,Association:1,
      Trust:1,Bank:1,Force:1,Office:1,Ministry:1,Agency:1,Authority:1,Board:1,
      Centre:1,Center:1,Institute:1,Foundation:1,Society:1,Union:1,League:1,
      Federation:1,Corporation:1,Enterprise:1,Enterprises:1,Executive:1,
      Road:1,Street:1,Avenue:1,Lane:1,Drive:1,Close:1,Square:1,Place:1,Way:1,
      Park:1,Gardens:1,Estate:1,House:1,Hall:1,Tower:1,Bridge:1,Station:1,
      Prison:1,Mosque:1,Church:1,Cathedral:1,Chapel:1,Temple:1,Synagogue:1,
      Stadium:1,Arena:1,Market:1,Centre:1,
      Democratic:1,Republican:1,Unionist:1,Nationalist:1,Conservative:1,Labour:1,
      Liberal:1,Government:1,Parliament:1,Assembly:1,Congress:1,Senate:1,
      Kingdom:1,Republic:1,State:1,States:1,County:1,City:1,Town:1,Village:1,
      Borough:1,District:1,Region:1,Province:1,
      Syndrome:1,Disease:1,Disorder:1,Virus:1,Mode:1,Reading:1,Limited:1,
      Holdings:1,Operation:1,Project:1,Programme:1,Program:1,
      National:1,Insurance:1,Computer:1,Crime:1,Revenue:1,Customs:1,Border:1,Immigration:1,Welfare:1,Benefit:1,Tax:1,Number:1,Record:1,System:1,Register:1,Registry:1,Database:1,
      // titles / ranks / roles (also handled as prefixes below)
      Mr:1,Mrs:1,Ms:1,Miss:1,Mx:1,Dr:1,Prof:1,Professor:1,Sir:1,Dame:1,Lord:1,
      Lady:1,Rev:1,Reverend:1,Fr:1,Imam:1,Rabbi:1,Sheikh:1,
      Constable:1,Sergeant:1,Detective:1,Inspector:1,Superintendent:1,Officer:1,
      Commissioner:1,Commander:1,President:1,Vice:1,Minister:1,Chancellor:1,
      Secretary:1,Senator:1,Governor:1,Mayor:1,Councillor:1,Judge:1,Justice:1,
      Captain:1,Colonel:1,Major:1,Lieutenant:1,General:1,Admiral:1,Brigadier:1,
      Chief:1,Assistant:1,Deputy:1,Acting:1,Interim:1,Leader:1,Spokesman:1,
      Spokeswoman:1,Spokesperson:1
    };
    var ORG_TRAIL = /^\s*(?:Party|Company|Theatre|Theater|Group|Services?|Department|Police|Hospital|University|College|School|Academy|Club|Airport|Council|Court|Committee|Commission|Association|Trust|Bank|Force|Office|Ministry|Agency|Authority|Board|Centre|Center|Institute|Foundation|Society|Union|League|Federation|Corporation|Limited|Ltd|Holdings|Syndrome|Estate)\b/;
    // A Title-Case run that NAMES an organisation/venue (ends with an org word)
    // or a bank/hotel/etc. (starts with one) — type it as organisation, not person.
    var ORG_END = /\b(?:Gazette|Times|Herald|Post|Tribune|Chronicle|Courier|Mail|News|Journal|Observer|Express|Telegraph|Guardian|Bank|Trust|Holdings|Freight|Logistics|Imports|Exports|Trading|Theatre|Theater|Company|Club|Society|Association|Federation|Foundation|Institute|Academy|College|University|Hospital|Clinic|Church|Cathedral|Mosque|Temple|Synagogue|Group|Partners|Partnership|Chambers|Solicitors|Services|Systems|Solutions|Industries|Enterprises|Ventures|Investments|Insurance|Press|Media|Studios|Records|Brewery|Distillery|Mills|Works|Depot|Warehouse|Market|Exchange|Council|Authority|Agency|Bureau|Ministry|Commission|Committee|Board|Union|League|Centre|Center|Corporation)$/;
    var ORG_START = /^(?:Hotel|Motel|Inn|Lodge|Resort|Hostel|Banca|Banco|Banque|Bank|Caf[e\u00e9]|Bar|Restaurant|Bistro|Brasserie|Cinema|Theatre|Theater|Museum|Gallery|University|College|Hospital|Church|Mosque|Temple|Synagogue)\b/;
    var STREET_START = /^(?:Avenida|Avenue|Ave|Calle|Rua|Rue|Stra(?:ss|\u00df)e|Via|Piazza|Plaza|Pra[c\u00e7]a|Street|Road|Lane|Drive|Close|Court|Way|Place|Square|Terrace|Crescent|Walk|Row|Gardens|Boulevard|Highway|Parade|Wharf|Quay)\b/;
    var NAME_TITLE = /(?:^|[^A-Za-z])(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Sir|Dame|Lord|Lady|Rev|Reverend|Fr|Imam|Rabbi|Sheikh|Sgt|Sergeant|Det|Detective|Insp|Inspector|Supt|Superintendent|Constable|Officer|Cmsr|Commissioner|Cmdr|Commander|Cllr|Councillor|President|Minister|Chancellor|Secretary|Senator|Governor|Mayor|Judge|Justice|Capt|Captain|Col|Colonel|Maj|Major|Lt|Lieutenant|Gen|General|Brig|Brigadier|PC|DC|DS|DI|DCI|DSI|DCS|ACC|CC)\.?\s+$/;
    var PERSON_VERB = /^(?:\s*,?\s*(?:\d[\d,]*\s*,)?\s*)(?:said|says|told|added|asked|stated|confirmed|denied|claimed|argued|warned|admitted|insisted|noted|wrote|met|visited|travelled|traveled|flew|drove|called|phoned|emailed|texted|messaged|contacted|attacked|assaulted|stabbed|killed|murdered|injured|arrested|charged|detained|sentenced|jailed|named|appeared|pleaded|attended|joined|led|owns|owned|runs|ran|founded|works|worked|lives|lived|was|is|had|has|who|whose)\b/i;
    var PERSON_PREVERB = /\b(?:said|told|met|with|by|arrested|charged|named|victim|suspect|attacker|witness|driver|owner|father|mother|brother|sister|son|daughter|wife|husband|partner|friend|associate|colleague|neighbour|neighbor|leader|director|chief|boss|founder|head|chairman|spokesman|spokeswoman|spokesperson|officer)\s+$/i;
    function nameDropLead(w) {
      return NAME_STOP[w] || /^[A-Z][A-Z'’.]{1,}$/.test(w); // stop-word or ALLCAPS acronym
    }
    var reCapTok = /[A-Z][A-Za-z\u00c0-\u017f]*(?:['\u2019-][A-Za-z\u00c0-\u017f]+)*/g, capm, capToks = [];
    while ((capm = reCapTok.exec(text))) capToks.push({ w: capm[0], s: capm.index, e: capm.index + capm[0].length });
    var ti = 0;
    while (ti < capToks.length) {
      var run = [capToks[ti]];
      var jn = ti + 1;
      while (jn < capToks.length) {
        var between = text.slice(run[run.length - 1].e, capToks[jn].s);
        if (/^\s+$/.test(between)) { run.push(capToks[jn]); jn++; continue; }
        var pmn = between.match(/^\s+([a-zÀ-ſ]+)\s+$/);
        if (pmn && NAME_PARTICLE[pmn[1]]) { run.push(capToks[jn]); jn++; continue; }
        break;
      }
      ti = jn;
      var origS = run[0].s, origE = run[run.length - 1].e;
      // quoted run -> film/operation/title, not a person (aliases handled in 9c/9d)
      var qB = text.slice(Math.max(0, origS - 1), origS), qA = text.slice(origE, origE + 1);
      if (/['"‘’“”]/.test(qB) && /['"‘’“”]/.test(qA)) continue;
      // trim leading titles / acronyms / stop words
      while (run.length && nameDropLead(run[0].w)) run.shift();
      // organisation / venue / street? (decide BEFORE trailing-stop trim removes the
      // very keyword — Trust, Centre, Bank — that identifies it). Need >= 2 tokens
      // so a bare second-mention ("the Gazette", "the Bank") is not a new entity.
      if (run.length >= 2) {
        var orS = run[0].s, orE = run[run.length - 1].e;
        if (!spans.overlaps(orS, orE)) {
          var orTxt = text.slice(orS, orE).replace(/\s+/g, " ");
          if ((ORG_END.test(orTxt) || ORG_START.test(orTxt)) && !G.lookup(orTxt)) {
            spans.claim(orS, orE);
            addEntity("organisation", orTxt, orTxt, {}, "med", orS, orE, ["prose org"]);
            continue;
          }
          if (STREET_START.test(orTxt) && !G.lookup(orTxt)) {
            spans.claim(orS, orE);
            addEntity("location", orTxt, orTxt, { kind: "address" }, "med", orS, orE, ["prose address"]);
            continue;
          }
        }
      }
      // trailing-stop trim (persons only from here)
      while (run.length && (NAME_STOP[run[run.length - 1].w] || /^[A-Z][A-Z'’.]{1,}$/.test(run[run.length - 1].w))) run.pop();
      if (run.length < 2) continue;                         // need >= 2 name tokens
      if (run.some(function (t) { return NAME_STOP[t.w]; })) continue; // internal stop word
      var sN = run[0].s, eN = run[run.length - 1].e;
      if (spans.overlaps(sN, eN)) continue;                 // already claimed (person/place/etc.)
      var lblN = text.slice(sN, eN).replace(/\s+/g, " ");
      var VEHICLE_MAKE = /^(?:BMW|Audi|Mercedes|VW|Volkswagen|Ford|Vauxhall|Toyota|Honda|Nissan|Range|Land|Jaguar|Kia|Hyundai|Peugeot|Renault|Citroen|Citro\u00ebn|Skoda|Seat|Volvo|Lexus|Porsche|Tesla|Mini|Fiat|Mazda|Suzuki|Bentley|Rolls)$/;
      if (run.length === 2 && VEHICLE_MAKE.test(run[0].w)) continue; // "Ford Transit" / "Range Rover" -> vehicle
      if (G.lookup(lblN)) continue;                         // gazetteer place name
      if (ORG_TRAIL.test(text.slice(eN, eN + 24))) continue;// "<X> Company/Party/..." -> org/place
      if (labelForename(lblN)) continue;
      var preN = text.slice(Math.max(0, sN - 24), sN);
      var postN = text.slice(eN, eN + 30);
      var strongN = NAME_TITLE.test(preN) || PERSON_PREVERB.test(preN) || PERSON_VERB.test(postN);
      spans.claim(sN, eN);
      addEntity("person", lblN, lblN, {}, strongN ? "high" : "med", sN, eN,
        strongN ? ["prose name"] : ["prose name", "title-case heuristic"]);
    }

    // 9d0. attach stashed prefixed identifiers (PNC/CRO/NINO/PPT) to people
    personIdHits.forEach(function (hit) {
      var owner = nearestEntityBefore("person", hit.start);
      if (!owner) owner = entities.find(function (e) { return e.type === "person"; });
      if (owner) {
        owner.attrs[hit.key] = hit.value;
        owner.spans.push([hit.start, hit.end]);
      }
    });

    // 9d. alias phrases: "aka / also known as / alias 'X'"
    var reAka = /\b(aka|a\.k\.a\.|also known as|known as|alias|street name)\s+["'\u2018\u2019\u201C\u201D]?([A-Z][\w'\u2019-]{1,24})["'\u2018\u2019\u201C\u201D]?/g;
    while ((m = reAka.exec(text))) {
      var akaPerson = nearestEntityBefore("person", m.index);
      if (!akaPerson) continue;
      var aliasTxt = m[2].replace(/['\u2019"\u201D]+$/, "");
      akaPerson.attrs.aka = akaPerson.attrs.aka ? akaPerson.attrs.aka + "; " + aliasTxt : aliasTxt;
      var aS = m.index + m[0].lastIndexOf(aliasTxt);
      akaPerson.spans.push([aS, aS + aliasTxt.length]);
      cues.push({ span: [m.index, m.index + m[1].length], label: "alias" });
    }

    /* ---- 9b. Place of birth: "born in <Place>" -> person.attrs.pob ---- */
    (function () {
      var pobRe = /\bborn\s+in\s+([A-Z][A-Za-z'\u2019.\- ]{2,40}?)(?=[,.;\n]|\s+(?:and|on|in)\b|$)/g, pm;
      while ((pm = pobRe.exec(text))) {
        var who = nearestEntityBefore("person", pm.index);
        if (who && !who.attrs.pob) who.attrs.pob = pm[1].trim();
      }
    })();

    /* ---- 9c. Alias-only persons: "a male known only as 'Decka'" / "a Spanish
       national known only as 'Mateo'" — a NEW person whose sole name is the alias.
       (An alias attached to a named subject is handled separately as aka.) ---- */
    (function () {
      var reAliasOnly = /\b(?:an?|the)\s+(?:[A-Za-z]+\s+){0,3}?(?:national|male|female|man|woman|individual|associate|figure|nominal|subject|beneficiary|recipient|payee|customer|client|contact|person|lad|guy|bloke|fella|youth|juvenile|teenager|boy|girl)\s+(?:(?:known|referred\s+to|going|recorded|listed|identified)\s+(?:only\s+)?(?:as|by)|called)\s+["'\u2018\u2019]\s*([A-Z][A-Za-z]{1,20})\s*["'\u2018\u2019]/g, am;
      while ((am = reAliasOnly.exec(text))) {
        var nm = am[1];
        var ni = am.index + am[0].lastIndexOf(nm);
        if (spans.overlaps(ni, ni + nm.length)) continue;
        var exists = entities.some(function (e) { return e.type === "person" && e.label.toUpperCase() === nm.toUpperCase(); });
        if (exists) continue;
        spans.claim(ni, ni + nm.length);
        addEntity("person", nm, nm, {}, "med", ni, ni + nm.length, ["alias-only nominal"]);
      }
    })();

    /* ---- 10. DOB attachment ---- */
    dateHits.forEach(function (dh) {
      var before = text.slice(Math.max(0, dh.start - 24), dh.start);
      var widerBefore = text.slice(Math.max(0, dh.start - 80), dh.start);
      var isDob = /\b(dob|d\.o\.b|born|date of birth)\b(?:\s+on)?[\s:.]*$/i.test(before) ||
        /\bDOB\b[^\n]*\n\s*$/i.test(widerBefore);
      var person = nearestEntityBefore("person", dh.start);
      if (isDob && person) {
        if (person.attrs.dob && person.attrs.dob !== dh.iso) return;
        person.attrs.dob = dh.iso;
        person.spans.push([dh.start, dh.end]);  // DOB date highlights as person evidence
        var kw = before.match(/\b(dob|d\.o\.b|born|date of birth)\b/i);
        if (kw) {
          var ks = Math.max(0, dh.start - 24) + kw.index;
          cues.push({ span: [ks, ks + kw[0].length], label: "DOB" });
        }
        dh.used = "dob";
        if (dh.ambiguous) {
          ambiguities.push({ kind: "date", message: "DOB " + dh.raw + " read as " + dh.iso + " (DD/MM). Confirm format." });
        }
      }
    });

    function nearestEntityBefore(type, pos) {
      var best = null, bestEnd = -1;
      entities.forEach(function (e) {
        if (e.type !== type) return;
        e.spans.forEach(function (sp) {
          if (sp[1] <= pos && sp[1] > bestEnd) { best = e; bestEnd = sp[1]; }
        });
      });
      return best;
    }
    function entitiesInRange(s, e, type) {
      var out = [];
      entities.forEach(function (ent) {
        if (type && ent.type !== type) return;
        var hit = ent.spans.some(function (sp) { return sp[0] >= s && sp[1] <= e; });
        if (hit) out.push(ent);
      });
      return out;
    }

    /* ---- 11. Remaining dates become date entities ---- */
    dateHits.forEach(function (dh) {
      if (dh.used) return;
      var ent = addEntity("date", dh.raw, dh.iso, { iso: dh.iso },
        dh.ambiguous ? "med" : "high", dh.start, dh.end,
        dh.ambiguous ? ["DD/MM assumed — ambiguous"] : []);
      dh.entity = ent;
      if (dh.ambiguous) {
        ambiguities.push({ kind: "date", message: dh.raw + " read as " + dh.iso + " (DD/MM assumed). Confirm format." });
      }
    });

    /* ---- 12. Relationship inference (sentence-scoped verb cues) ---- */
    // Sentence boundaries: . ! ? or newline — but never inside a claimed entity
    // span (emails and addresses contain dots).
    var sentences = [];
    (function () {
      var bounds = [0];
      var reB = /[.!?\n]/g;
      var bm;
      while ((bm = reB.exec(text))) {
        var i = bm.index;
        if (spans.overlaps(i, i + 1)) continue;          // dot inside an entity
        if (text[i] === "." && /[A-Z]/.test(text[i + 1] || "")) continue; // "C.M"
        bounds.push(i + 1);
      }
      bounds.push(text.length);
      for (var k = 0; k < bounds.length - 1; k++) {
        var s = bounds[k], e = bounds[k + 1];
        if (text.slice(s, e).trim().length > 2) sentences.push({ text: text.slice(s, e), start: s, end: e });
      }
    })();

    var lastPerson = null;
    var lastSubject = null;            // last person seen in SUBJECT position (discourse salience)
    var principalPerson = mainPerson(); // the document's principal nominal — the sticky default subject

    function hasRelBetween(a, b) {
      return relationships.some(function (r) {
        return (r.sourceRef === a.ref && r.targetRef === b.ref) ||
               (r.sourceRef === b.ref && r.targetRef === a.ref);
      });
    }

    function firstEntity(type, pred) {
      for (var i = 0; i < entities.length; i++) {
        if (entities[i].type === type && (!pred || pred(entities[i]))) return entities[i];
      }
      return null;
    }

    function mainPerson() {
      return firstEntity("person", function (e) { return e.attrs.pnc || e.attrs.nino || e.attrs.passport; }) ||
        firstEntity("person", function (e) { return e.flags && e.flags.some(function (f) { return /field-form/.test(f); }); }) ||
        firstEntity("person", function (e) { return e.attrs.dob; }) ||
        firstEntity("person");
    }

    function findEntity(type, labelRe) {
      return firstEntity(type, function (e) { return labelRe.test(e.label); });
    }

    function addRel(srcEnt, tgtEnt, type, conf, sentence, cue, dateISO, cueSpan) {
      if (!srcEnt || !tgtEnt || srcEnt === tgtEnt) return null;
      var dup = relationships.some(function (r) {
        return r.sourceRef === srcEnt.ref && r.targetRef === tgtEnt.ref && r.type === type;
      });
      if (dup) return null;
      var rel = {
        ref: ref("r"), sourceRef: srcEnt.ref, targetRef: tgtEnt.ref,
        type: type, direction: "->", dateISO: dateISO || null,
        confidence: conf, sentence: sentence.trim().slice(0, 160), cue: cue,
        cueSpan: cueSpan || null
      };
      relationships.push(rel);
      return rel;
    }

    sentences.forEach(function (sent) {
      var sTxt = sent.text, s0 = sent.start, s1 = sent.end;

      // First match of a cue regex in this sentence → absolute [start,end] span.
      function cueSpan(re) {
        var mm = re.exec(sTxt);
        return mm ? [s0 + mm.index, s0 + mm.index + mm[0].length] : null;
      }
      // Nearest cue match BEFORE a position (for "from X ... to Y" sentences).
      function cueSpanBefore(re, absPos, window) {
        var g = new RegExp(re.source, re.flags.indexOf("g") === -1 ? re.flags + "g" : re.flags);
        var best = null, mm;
        while ((mm = g.exec(sTxt))) {
          var as = s0 + mm.index, ae = as + mm[0].length;
          if (ae <= absPos && absPos - ae <= (window || 46)) best = [as, ae];
          if (as >= absPos) break;
        }
        return best;
      }

      var persons = entitiesInRange(s0, s1, "person");
      var subject = persons[0] || null;
      var carried = false;
      // A person is the discourse SUBJECT only if it opens the sentence (subject
      // position), not if it merely appears (e.g. an object "...frequented by WALSH").
      if (subject && subject.spans && subject.spans.length &&
          (subject.spans[subject.spans.length - 1][0] - s0) <= 32) {
        lastSubject = subject;
      }
      // The sticky carry target: the salient subject, else the document principal —
      // never just the most-recently-NAMED person (that caused identifiers to land
      // on the wrong nominal).
      var carrySubject = lastSubject || principalPerson || lastPerson;
      // Bare ALL-CAPS surname mention ("BAINES retains his UK number…") —
      // resolve against people already extracted: full confidence, not a carry.
      if (!subject) {
        var sm2, reSur = /\b([A-Z][A-Z'’-]{2,})\b/g;
        while (!subject && (sm2 = reSur.exec(sTxt))) {
          if (NAME_STOPWORDS[sm2[1]]) continue;
          for (var pi2 = 0; pi2 < entities.length; pi2++) {
            var pent = entities[pi2];
            if (pent.type !== "person") continue;
            var ptoks = pent.label.toUpperCase().split(/\s+/);
            if (ptoks[ptoks.length - 1] === sm2[1]) { subject = pent; break; }
          }
        }
      }
      if (!subject && /\b(he|she|they)\b/i.test(sTxt)) { subject = carrySubject; carried = true; }
      // Verb-led continuation ("On 04/05/2026 used this email to...") — carry the
      // last-mentioned person forward, at reduced confidence.
      if (!subject && carrySubject && /\b(used|uses|book(ed|s)?|stay(ed|s)?|travel(led|s)?|fl(ew|ies)|purchas(ed|es)?|return(ed|s)?|retain(ed|s)?|keeps?|kept|liaison\s+with)\b/i.test(sTxt)) {
        subject = carrySubject; carried = true;
      }
      if (persons.length) lastPerson = persons[persons.length - 1];
      // Hedged / speculative reporting must not be asserted at full strength.
      var speculative = /\b(?:suspected|alleged(?:ly)?|believed|reportedly|thought\s+to|appears?\s+to|possibly|unconfirmed|may\s+have|might\s+have|is\s+assessed\s+to|purport(?:s|ed|edly)?)\b/i.test(sTxt);
      function demote(c) {
        var step = { high: "med", med: "low", low: "low" };
        if (carried) c = step[c] || c;
        if (speculative) c = step[c] || c;
        return c;
      }

      var phones = entitiesInRange(s0, s1, "phone");
      var emails = entitiesInRange(s0, s1, "email");
      var locs = entitiesInRange(s0, s1, "location");
      var addrs = entitiesInRange(s0, s1, "address");
      var vehicles = entitiesInRange(s0, s1, "vehicle");
      var datesInSent = dateHits.filter(function (dh) { return dh.start >= s0 && dh.end <= s1 && !dh.usedRel && !dh.used; });
      var firstDate = datesInSent.length ? datesInSent[0].iso : null;

      // Hotel/venue phone: phone immediately follows an address span → PHONE_OF address
      phones.forEach(function (ph) {
        var phStart = ph.spans[ph.spans.length - 1][0];
        var prior = text.slice(Math.max(0, phStart - 12), phStart);
        var addrJustBefore = addrs.find(function (ad) {
          return ad.spans.some(function (sp) { return phStart - sp[1] >= 0 && phStart - sp[1] < 12; });
        });
        if (addrJustBefore && /[•|,\-\s]*$/.test(prior)) {
          addRel(ph, addrJustBefore, "PHONE_OF", "med", sTxt, "adjacency");
          ph._claimedByAddress = true;
        }
      });

      /* ---- linguistic pass: clause-level subject–verb–object ---- */
      if (L) {
        var entRanges = [];
        entities.forEach(function (ent) {
          ent.spans.forEach(function (sp) {
            if (sp[0] >= s0 && sp[1] <= s1) {
              entRanges.push({ start: sp[0] - s0, end: sp[1] - s0, type: ent.type, _ent: ent });
            }
          });
        });
        entRanges.sort(function (a, b) { return a.start - b.start; });
        var clauses = L.analyse(sTxt, entRanges.map(function (r) {
          return { start: r.start, end: r.end, type: r.type };
        }));

        clauses.forEach(function (cl) {
          // resolve the clause subject to a person entity
          var subjEnt = null;
          if (cl.subject && cl.subject.kind === "entity") {
            var rg = entRanges[cl.subject.entityIdx];
            if (rg && rg._ent.type === "person") subjEnt = rg._ent;
          } else if (cl.subject && cl.subject.kind === "name") {
            // surname fragment — resolve against people already extracted
            var frag = M.canonicalName(cl.subject.text);
            for (var pe = 0; pe < entities.length; pe++) {
              if (entities[pe].type !== "person") continue;
              if ((" " + M.canonicalName(entities[pe].label) + " ").indexOf(" " + frag + " ") !== -1) {
                subjEnt = entities[pe];
                break;
              }
            }
            if (!subjEnt) subjEnt = carrySubject;
          } else if (cl.subject) {
            subjEnt = carrySubject;        // pronoun / "the subject" -> salient subject / principal
          } else {
            subjEnt = carrySubject;        // inherited/elided subject -> salient subject / principal
          }
          if (subjEnt) lastPerson = subjEnt;
          var vAbs = [s0 + cl.verb.start, s0 + cl.verb.end];

          // "return" verbs are timeline events, not links
          if (cl.verb.group === "returnVerb") {
            if (subjEnt && datesInSent.length) {
              var rD = datesInSent[datesInSent.length - 1];
              if (!rD.usedRel) {
                events.push({
                  ref: ref("v"), dateISO: rD.iso,
                  label: (cl.verb.planned ? "Planned return — " : "Return — ") + subjEnt.label,
                  entityRefs: [subjEnt.ref]
                });
                rD.usedRel = true;
                cues.push({ span: vAbs, label: "return" });
              }
            }
            return;
          }
          if (!subjEnt) return;

          cl.objects.forEach(function (ob) {
            if (ob.kind !== "entity") return;
            var rg2 = entRanges[ob.entityIdx];
            if (!rg2) return;
            var target = rg2._ent;
            if (target === subjEnt || target._claimedByAddress) return;
            if (target.type === "date") return;   // dates belong to the timeline
            var rf = L.relFor(cl.verb.group, ob.prep, target.type);
            if (!rf || rf.type === "_RETURN_EVENT") return;
            // A bare "LINKED_TO" between a person and a place is noise — real
            // location ties come from the travel/stay/containment logic.
            if (rf.type === "LINKED_TO" &&
                (target.type === "location" || target.type === "address" ||
                 subjEnt.type === "location" || subjEnt.type === "address")) return;
            var conf = cl.verb.negated ? "low" : (cl.verb.planned ? "med" : demote("high"));
            var src = rf.reverse ? target : subjEnt;
            var tgt = rf.reverse ? subjEnt : target;
            var rel = addRel(src, tgt, rf.type, conf, sTxt, "svo:" + cl.verb.lemma, null, vAbs);
            if (!rel) return;
            rel.modality = cl.verb.planned ? "planned" : (cl.verb.tense === "past" ? "occurred" : "reported");
            if (cl.verb.negated) rel.negated = true;
            if (firstDate && !cl.verb.negated &&
                ["TRAVELS_TO", "DEPARTS_FROM", "STAYS_AT", "TRANSACTED_WITH", "COMMUNICATED_WITH"].indexOf(rf.type) !== -1) {
              rel.dateISO = firstDate;
              markDateUsed(datesInSent, rel);
            }
            // money rider on transactions: amount travels on the link
            if (rf.type === "TRANSACTED_WITH") {
              cl.objects.forEach(function (o2) {
                if (o2.kind !== "entity") return;
                var r3 = entRanges[o2.entityIdx];
                if (r3 && r3._ent.type === "money") rel.amount = r3._ent.label;
              });
            }
          });
        });
      }

      // A bare identifier (phone/email) with no named owner in this sentence defaults
      // to the principal — in a subject profile, unattributed contact details belong
      // to the principal, not to whoever happened to be named last.
      if (!subject && !persons.length && principalPerson && (phones.length || emails.length)) {
        subject = principalPerson; carried = true;
      }

      if (subject) {
        var useRe   = /\b(use[sd]?|using|retain(?:s|ed)?|keeps?|kept|contact(?:ed|able)?\s+(?:on|via|at)|reachable\s+(?:on|at)|registered\s+to|(?:with\s+the\s+)?number)\b/i;
        var purchRe = /\b(purchas(?:e[sd]?|ing)|bought|buy(?:s|ing)?|acquir(?:e[sd]?|ing)|obtain(?:s|ed|ing)?)\b/i;
        var simRe   = /\b((?:new\s+)?sim(?:\s?card)?|handset|burner|new\s+(?:phone|number))\b/i;
        var useSpan = cueSpan(useRe), purchSpan = cueSpan(purchRe), simSpan = cueSpan(simRe);

        phones.forEach(function (ph) {
          if (ph._claimedByAddress || hasRelBetween(subject, ph)) return;
          var conf = useSpan ? "high" : (purchSpan || simSpan ? "med" : "low");
          var cueName = useSpan ? "use cue" : (purchSpan ? "purchase cue" : (simSpan ? "sim cue" : "co-occurrence"));
          if (simSpan && ph.attrs.context === undefined) {
            ph.attrs.context = text.slice(simSpan[0], simSpan[1]); // e.g. "new sim card"
          }
          addRel(subject, ph, "USES", demote(conf), sTxt, cueName,
            null, useSpan || purchSpan || simSpan);
        });
        // cues shadowed by a stronger one still deserve a highlight
        if (phones.length) {
          if (useSpan && purchSpan) cues.push({ span: purchSpan, label: "purchase" });
          if ((useSpan || purchSpan) && simSpan) cues.push({ span: simSpan, label: "context" });
        }

        var emailRe = /\b(used\s+this\s+email|email(?:ed)?|e-?mail)\b/i;
        var emSpan = cueSpan(emailRe);
        emails.forEach(function (em) {
          if (hasRelBetween(subject, em)) return;
          addRel(subject, em, "USES", demote(useSpan || emSpan ? "high" : "low"), sTxt,
            "email cue", null, emSpan || useSpan);
        });

        var travelTo   = /\b(?:book(?:ed|ing|s)?\s+(?:a\s+)?flights?\s+to|fl(?:y|ies|ying|ew)\s+to|flights?\s+to|travel(?:s|led|ling)?\s+to|(?:day\s+)?trip\s+to|visit(?:s|ed|ing)?|heading\s+to|en\s?route\s+to|via)\b/i;
        var departFrom = /\b(?:fl(?:y|ies|ying|ew)(?:ing)?\s+from|is\s+flying\s+from|depart(?:s|ed|ing)?(?:\s+from)?|leav(?:es|ing)\s+from|out\s+of)\b/i;
        var stayRe     = /\b(?:stay(?:s|ed|ing)?\s+at|will\s+be\s+staying|resid(?:es|ing)\s+at|lives?\s+at|based\s+at|address(?:ed)?\s+(?:at|is))\b/i;
        var returnRe   = /\b(?:will\s+)?(?:return(?:s|ed|ing)?(?:\s+on)?|back\s+on|comes?\s+back)\b/i;

        locs.forEach(function (lc) {
          if (hasRelBetween(subject, lc)) return;
          var lcStart = lc.spans[lc.spans.length - 1][0];
          var dep = cueSpanBefore(departFrom, lcStart);
          var trv = cueSpanBefore(travelTo, lcStart);
          if (dep && (!trv || dep[0] > trv[0])) {
            var rel = addRel(subject, lc, "DEPARTS_FROM", demote("high"), sTxt, "depart cue", firstDate, dep);
            if (rel && firstDate) markDateUsed(datesInSent, rel);
          } else if (trv) {
            var _cueTxt = text.slice(trv[0], trv[1]);
            // "book/booked flights to X" — the sentence date is when it was BOOKED,
            // not when travel happens. Keep the destination link but not that date.
            var _isBooking = /book/i.test(_cueTxt);
            // air-travel cue + a city with a known airport -> define the AIRPORT
            // (name + IATA) as the destination; the city node stays for any stay.
            var _isAir = /fl(?:y|ies|ight|ights|ew|ying)|\bair\b/i.test(_cueTxt);
            var _target = lc;
            if (_isAir && lc.attrs && lc.attrs.kind === "city" && G.airportForCity) {
              var _apr = G.airportForCity(lc.value || lc.label);
              if (_apr) {
                var _aplab = _apr.iata ? (_apr.n + " (" + _apr.iata + ")") : _apr.n;
                _target = entities.find(function (e) { return e.type === "location" && e.value === _apr.n; }) ||
                  addEntity("location", _aplab, _apr.n,
                    { lat: _apr.lat, lon: _apr.lon, cc: _apr.cc, kind: "airport", iata: _apr.iata || "", gaz: _apr.id, inferred: true },
                    "med", lc.spans[lc.spans.length - 1][0], lc.spans[lc.spans.length - 1][1], ["inferred airport"]);
              }
            }
            if (hasRelBetween(subject, _target)) return;
            var _tdate = _isBooking ? null : firstDate;
            var rel2 = addRel(subject, _target, "TRAVELS_TO", demote("high"), sTxt, _isBooking ? "booking cue" : "travel cue", _tdate, trv);
            if (rel2 && _tdate) markDateUsed(datesInSent, rel2);
          }
        });

        var staySpan = cueSpan(stayRe);
        addrs.forEach(function (ad) {
          if (hasRelBetween(subject, ad)) return;
          if (staySpan) {
            addRel(subject, ad, "STAYS_AT", demote("high"), sTxt, "stay cue", firstDate, staySpan);
          }
        });

        var vehRe = /\b(driv\w*|registered|owns?|keeper)\b/i;
        var vehSpan = cueSpan(vehRe);
        vehicles.forEach(function (v) {
          if (hasRelBetween(subject, v)) return;
          if (vehSpan) addRel(subject, v, "USES", "high", sTxt, "vehicle cue", null, vehSpan);
        });

        // Return date → event only (cue still highlighted)
        var retSpan = cueSpan(returnRe);
        if (retSpan && datesInSent.length) {
          var rDate = datesInSent[datesInSent.length - 1];
          if (!rDate.usedRel) {
            events.push({
              ref: ref("v"), dateISO: rDate.iso,
              label: "Return — " + subject.label, entityRefs: [subject.ref]
            });
            rDate.usedRel = true;
            cues.push({ span: retSpan, label: "return" });
          }
        }

        // Person ↔ person in same sentence
        var meetRe = /\b(met|meets?|meeting|contacted|called|messaged|associates?\s+(?:of|with)|linked\s+to|brother|sister|wife|husband|partner)\b/i;
        var commRe = /\b(liaison\s+with|liais(?:e|ing)\s+with|messag(?:ing|ed)|encrypted\s+messaging|whatsapp(?:ed)?|texted|in\s+contact\s+with)\b/i;
        var meetSpan = cueSpan(meetRe);
        var commSpan = cueSpan(commRe);
        for (var i = 1; i < persons.length; i++) {
          if (hasRelBetween(persons[0], persons[i])) continue;
          if (commSpan) {
            addRel(persons[0], persons[i], "COMMUNICATED_WITH", demote("med"), sTxt, "comms cue", firstDate, commSpan);
          } else if (meetSpan) {
            addRel(persons[0], persons[i], "ASSOCIATE_OF", "med", sTxt, "association cue", null, meetSpan);
          }
        }
        // comms cue with a carried subject and one named person in the sentence
        // ("Liaison with the supplier Diego MORENO … by encrypted messaging")
        if (commSpan && persons.length === 1 && subject && subject !== persons[0] &&
            !hasRelBetween(subject, persons[0])) {
          addRel(subject, persons[0], "COMMUNICATED_WITH", demote("med"), sTxt, "comms cue", firstDate, commSpan);
        }
      }
    });

    /* ---- 12b. Field/form records: attach obvious identifiers to the main subject ---- */
    (function () {
      if (!/\b(?:MAIN SUBJECT|SUBSCRIBER NAME|SURNAME|FORENAME|MSISDN|PNCID|NINO|Account \(personal\)|Telephone)\b/i.test(text)) return;
      var mainIdx = text.search(/\bMAIN SUBJECT\b/i);
      var mainEnd = mainIdx >= 0 ? text.slice(mainIdx).search(/\b(?:ASSOCIATED SUBJECTS|REASON FOR SUSPICION|FICTITIOUS TEST DATA)\b/i) : -1;
      if (mainIdx >= 0 && mainEnd >= 0) mainEnd += mainIdx;
      else mainEnd = text.length;
      var mainPeople = mainIdx >= 0 ? entities.filter(function (e) {
        return e.type === "person" && e.spans.some(function (sp) { return sp[0] >= mainIdx && sp[0] <= mainEnd; });
      }) : [];
      var primary = mainPeople.find(function (e) { return e.attrs.pnc || e.attrs.nino || e.attrs.passport || e.attrs.dob; }) ||
        mainPeople[0] || entities.find(function (e) {
        return e.type === "person" && (e.attrs.pnc || e.attrs.nino || e.attrs.passport);
      }) || entities.find(function (e) {
        return e.type === "person" && e.flags && e.flags.some(function (f) { return /field-form/.test(f); });
      }) || entities.find(function (e) {
        return e.type === "person" && (e.attrs.pnc || e.attrs.nino || e.attrs.passport || e.attrs.dob);
      }) || entities.find(function (e) { return e.type === "person"; });
      if (!primary) return;
      var attachStart = mainIdx >= 0 ? mainIdx : Math.max(0, primary.spans[0][0] - 80);
      var attachEnd = mainIdx >= 0 ? mainEnd : text.length;

      entities.forEach(function (e) {
        if (e === primary || hasRelBetween(primary, e)) return;
        var inAttachBlock = e.spans.some(function (sp) { return sp[0] >= attachStart && sp[0] <= attachEnd; });
        if (!inAttachBlock && mainIdx >= 0) return;
        if (e.type === "phone") {
          if (e.attrs && (e.attrs.kind === "IMEI" || e.attrs.kind === "IMSI" || e.attrs.kind === "ICCID")) {
            // device/SIM identifiers belong to the subject too — honest MED link
            addRel(primary, e, "USES", "med", "field-form device identifier", "field-form");
            return;
          }
          if (e.attrs && e.attrs.valid === false) return;
          addRel(primary, e, "USES", "high", "field-form identifier", "field-form");
        } else if (e.type === "email") {
          addRel(primary, e, "USES", "high", "field-form identifier", "field-form");
        } else if (e.type === "account") {
          addRel(primary, e, "OWNS", "med", "field-form account", "field-form");
        } else if (e.type === "address") {
          addRel(primary, e, "STAYS_AT", "med", "field-form address", "field-form");
        }
      });
    })();

    /* ---- 12c. Structured table/document relationships ---- */
    (function () {
      var primary = mainPerson();
      if (!primary) return;

      function relationBetween(a, b) {
        return relationships.find(function (r) {
          return (r.sourceRef === a.ref && r.targetRef === b.ref) || (r.sourceRef === b.ref && r.targetRef === a.ref);
        });
      }
      function link(type, target, conf, why, dateISO) {
        if (!target || target === primary) return null;
        var existing = relationBetween(primary, target);
        if (existing) {
          if (existing.sourceRef === primary.ref && existing.targetRef === target.ref &&
              /^(USES|STAYS_AT|OWNS)$/.test(type) && existing.type !== type) {
            existing.type = type;
            existing.confidence = conf || existing.confidence || "med";
            existing.sentence = why || existing.sentence || "structured document";
            existing.cue = "structured";
            if (dateISO) existing.dateISO = dateISO;
          }
          return existing;
        }
        return addRel(primary, target, type, conf || "med", why || "structured document", "structured", dateISO || null);
      }
      function linkFrom(source, type, target, conf, why, dateISO) {
        if (!source || !target || source === target || relationBetween(source, target)) return null;
        return addRel(source, target, type, conf || "med", why || "structured document", "structured", dateISO || null);
      }

      // Personal-detail tables: connect clear identifiers even when labels are on separate lines.
      if (/\b(?:Personal Details|Best Match|Person\s+Field\s+Value|Individual -|Subject API|Current address|Mobile on file|Telephone \(matched\)|Phones)\b/i.test(text)) {
        entities.forEach(function (e) {
          if (e === primary) return;
          if (e.type === "phone" && !(e.attrs && /^(IMEI|IMSI|ICCID)$/.test(e.attrs.kind || "")) && !(e.attrs && e.attrs.valid === false)) link("USES", e, "high", "structured contact");
          else if (e.type === "email") link("USES", e, "high", "structured contact");
          else if (e.type === "address") link("STAYS_AT", e, "med", "structured address");
        });
      }

      // Accounts and masked account tails in bureau/PNR/SAR style tables.
      entities.filter(function (e) { return e.type === "account"; }).forEach(function (e) {
        link("OWNS", e, e.attrs && e.attrs.sortCode ? "high" : "med", "structured account");
      });
      var reMasked = /\*{2,}(\d{4})/g, mm;
      while ((mm = reMasked.exec(text))) {
        if (spans.overlaps(mm.index, mm.index + mm[0].length)) continue;
        var acc = addEntity("account", "Account ending " + mm[1], mm[1], { kind: "account", tail: mm[1], masked: true }, "med", mm.index, mm.index + mm[0].length);
        link("OWNS", acc, "med", "masked account");
      }

      // Employment/directorship: link an organisation to the subject only when
      // ITS OWN row/context says employer/director — never by document-wide
      // section words (which dragged lenders and banks in as employers).
      entities.filter(function (e) { return e.type === "organisation"; }).forEach(function (org) {
        if (hasRelBetween(primary, org)) return;
        var osp = org.spans[0];
        var ols = text.lastIndexOf("\n", osp[0]);
        // constrain to the organisation's OWN sentence/row so a trigger word in the
        // next sentence is not mis-attributed (prose bleed across "." or blank line).
        var _sS = Math.max(text.lastIndexOf("\n", osp[0] - 1), text.lastIndexOf(".", osp[0] - 1)) + 1;
        var _dE = text.indexOf(".", osp[1]); var _nE = text.indexOf("\n", osp[1]);
        var _sE = Math.min(_dE < 0 ? text.length : _dE, _nE < 0 ? text.length : _nE);
        var octx = text.slice(Math.max(0, _sS), _sE);
        var orow = text.slice(ols < 0 ? 0 : ols + 1, Math.min(text.length, osp[1] + 90));
        var _own = /\b(?:director(?:ship)?s?|PSC|owner|proprietor|sole\s+trader|founder)\b/i.test(octx);
        var _emp = /\b(?:employer|employment|payroll|PAYE\s*ref|employed\s+by|works?\s+for)\b/i.test(octx);
        if ((_own || _emp) && !/\b(?:lender|loan|credit\s+agreement|bank\s+statement)\b/i.test(orow)) {
          if (_own) addRelDirect(primary, org, "OWNS", "med", octx.trim().slice(0, 140) || "directorship", "directorship");
          else linkFrom(org, "EMPLOYS", primary, "med", orow.trim().slice(0, 140) || "structured employment");
        }
      });

      // Associations sections: link people that appear at/after the header to
      // the subject — typed FAMILY_OF when their row says so.
      var assocRe = /\b(?:ASSOCIATED\s+SUBJECTS|ASSOCIATES?\b|ASSOCIATIONS?\b|Associated\s+name|Linked\s*\/\s*Associated\s+Individuals|Co-Travellers?\b|Passengers\s+on\s+PNR)/i;
      var assocIdx = text.search(assocRe);
      if (assocIdx !== -1) {
        entities.filter(function (e) { return e.type === "person" && e !== primary; }).forEach(function (p) {
          if (hasRelBetween(primary, p)) return;
          var sp0 = null;
          for (var si = 0; si < p.spans.length; si++) {
            if (p.spans[si][0] > assocIdx) { sp0 = p.spans[si]; break; }
          }
          if (!sp0) return;                               // never appears after the header
          // row context = this row only: PDF tables flatten one cell per line,
          // so take at most 3 lines from the name — never bleed into the next
          // nominal's row (that mistyped ANSARI as family via Ryan's "Sibling").
          var rls = text.lastIndexOf("\n", sp0[0]);
          var row = text.slice(rls < 0 ? 0 : rls + 1, Math.min(text.length, sp0[1] + 120))
            .split(/\n/).slice(0, 3).join(" ");
          var typ = /\b(?:sibling|brother|sister|mother|father|son|daughter|cousin|wife|husband|spouse)\b/i.test(row)
            ? "FAMILY_OF" : "ASSOCIATE_OF";
          addRel(primary, p, typ, "med", row.replace(/\s+/g, " ").trim().slice(0, 160) || "structured association", "structured");
        });
      }

      // Table-row PNRs with no label prefix ("Other PNRs" columns): a 6-char
      // letters+digits code in a doc that talks about PNRs belongs to the
      // person named in the rows just above it.
      if (/\bPNRs?\b/.test(text)) {
        var reLoc6 = /\b([A-Z0-9]{6})\b/g, lm;
        while ((lm = reLoc6.exec(text))) {
          var code6 = lm[1];
          if ((code6.match(/\d/g) || []).length < 2 || (code6.match(/[A-Z]/g) || []).length < 2) continue;
          if (spans.overlaps(lm.index, lm.index + 6)) continue;
          spans.claim(lm.index, lm.index + 6);
          var pnEnt = addEntity("note", "PNR " + code6, code6, { kind: "pnr" }, "med", lm.index, lm.index + 6);
          // owner: the person whose span sits within the previous ~3 lines
          var lookback = text.slice(Math.max(0, lm.index - 200), lm.index);
          var owner6 = null;
          entities.forEach(function (p) {
            if (p.type !== "person" || owner6) return;
            var ptoks = p.label.toUpperCase().split(/\s+/);
            if (lookback.toUpperCase().indexOf(ptoks[ptoks.length - 1]) !== -1) owner6 = p;
          });
          var ownPn = owner6 || primary;
          if (ownPn && !hasRelBetween(ownPn, pnEnt)) {
            addRel(ownPn, pnEnt, "LINKED_TO", "med", "booking locator (row)", "structured");
          }
        }
      }

      // PNR / booking locators tie to the subject (cross-document key).
      entities.filter(function (e) { return e.type === "note" && e.attrs && e.attrs.kind === "pnr"; })
        .forEach(function (pn) {
          if (!hasRelBetween(primary, pn)) {
            addRel(primary, pn, "LINKED_TO", "med", "booking locator", "structured");
          }
        });

      // PNC warning signals / information markers → person.markers
      var wsIdx = text.search(/WARNING\s+SIGNALS|INFORMATION\s+MARKERS/i);
      if (wsIdx !== -1) {
        var wsBlock = text.slice(wsIdx, Math.min(text.length, wsIdx + 700));
        var markers = [], mk;
        var reMk = /^\s{0,8}([A-Z]{2,3})\s?-+\s?([^\n]{3,70})$/gm;
        while ((mk = reMk.exec(wsBlock))) markers.push(mk[1] + " - " + mk[2].trim());
        var reInfo = /^\s{0,8}(OCG NOMINAL|LOCATE\/TRACE|FIREARMS|DRUGS)\b[^\n]{0,80}$/gm;
        while ((mk = reInfo.exec(wsBlock))) {
          if (markers.every(function (x) { return x.indexOf(mk[1]) !== 0; })) markers.push(mk[0].trim());
        }
        if (markers.length) {
          primary.attrs.markers = primary.attrs.markers || markers.join("; ");
        }
      }

      // Vehicles in vehicle/object sections.
      if (/\b(?:Vehicles Linked|Objects \(Vehicles|ANPR)\b|VRM\s*:/i.test(text)) {
        entities.filter(function (e) { return e.type === "vehicle"; }).forEach(function (v) {
          link("OWNS", v, "med", "structured vehicle");
        });
      }

      // IATA airport codes and flight movements in NBTC-style records.
      var iataByCode = {};
      var reIata = /\b([A-Z]{3})\b/g, im;
      while ((im = reIata.exec(text))) {
        var code = im[1];
        var around = text.slice(Math.max(0, im.index - 24), Math.min(text.length, im.index + 24));
        // generic flight context: travel keywords or a XXX - XXX route pattern
        if (!/\b(?:Route|Itinerary|Flight|PNR|Carrier|Sector)\b/i.test(around) &&
            !/\b[A-Z]{3}\s*-\s*[A-Z]{3}\b/.test(around)) continue;
        var g = G.lookupIata && G.lookupIata(code);
        if (!g) continue;
        var loc = addEntity("location", g.n, g.n, { lat: g.lat, lon: g.lon, cc: g.cc, kind: g.t, gaz: g.id, iata: g.iata }, "high", im.index, im.index + im[0].length);
        iataByCode[code] = loc;
      }
      var reMove = /\b(\d{2}\/\d{2}\/\d{4})\s+[A-Z0-9]{2,3}[^\n]*\n(?:[A-Z0-9]+\n)?([A-Z]{3})\s*-\s*([A-Z]{3})\s*\n(OUT|IN)\b/g;
      while ((im = reMove.exec(text))) {
        var parts = im[1].split("/");
        var isoM = toISO(parseInt(parts[2], 10), parseInt(parts[1], 10), parseInt(parts[0], 10));
        var from = iataByCode[im[2]] || (G.lookupIata && G.lookupIata(im[2]) && addEntity("location", G.lookupIata(im[2]).n, G.lookupIata(im[2]).n, G.lookupIata(im[2]), "high", im.index, im.index + im[2].length));
        var to = iataByCode[im[3]] || (G.lookupIata && G.lookupIata(im[3]) && addEntity("location", G.lookupIata(im[3]).n, G.lookupIata(im[3]).n, G.lookupIata(im[3]), "high", im.index, im.index + im[3].length));
        var depRel = link("DEPARTS_FROM", from, "high", "flight movement", isoM);
        var toRel = link("TRAVELS_TO", to, "high", "flight movement", isoM);
        events.push({ ref: ref("v"), dateISO: isoM, label: "Flight " + im[2] + " -> " + im[3] + " - " + primary.label, entityRefs: [primary.ref].concat(from ? [from.ref] : []).concat(to ? [to.ref] : []) });
        if (depRel) depRel.modality = "occurred";
        if (toRel) toRel.modality = "occurred";
      }

      // OSINT/social handles as Text Block nodes, linked to attributed users where visible.
      var reHandle = /\b(?:Instagram|TikTok|Facebook)?\s*(@[A-Za-z0-9_.-]{3,}|(?:instagram|facebook|tiktok)\.com\/[A-Za-z0-9_.-]+)/gi, hm;
      while ((hm = reHandle.exec(text))) {
        var label = (hm[1] || hm[0].trim()).replace(/[).,;:]+$/, "");
        if (!/^@|(?:instagram|facebook|tiktok)\.com/i.test(label)) continue;
        if (label.charAt(0) === "@" && /[A-Za-z0-9_.+-]$/.test(text.slice(0, hm.index))) continue;
        if (label.charAt(0) === "@" && /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i.test(label.slice(1))) continue;
        var note = addEntity("note", label, label, { kind: "social-account" }, "med", hm.index, hm.index + hm[0].length);
        var rowStart = text.lastIndexOf("\n", hm.index);
        var rowEnd = text.indexOf("\n", hm.index);
        var row = text.slice(rowStart < 0 ? 0 : rowStart + 1, rowEnd < 0 ? Math.min(text.length, hm.index + 180) : rowEnd).replace(/\s+/g, " ");
        var owner = null;
        entities.filter(function (e) { return e.type === "person"; }).forEach(function (p) {
          if (owner) return;
          var bits = p.label.replace(/\s+/g, " ").split(" ").filter(function (x) {
            return x && !/^(Mr|Mrs|Ms|Miss|Dr|Identified|Accounts?)$/i.test(x);
          });
          var compact = bits.slice(Math.max(0, bits.length - 2)).join(" ");
          if (compact && row.indexOf(compact) !== -1) owner = p;
        });
        if (!owner) owner = primary;
        if (owner && !hasRelBetween(owner, note)) addRel(owner, note, "USES", "med", "social account", "structured");
      }
    })();

    function markDateUsed(list, rel) {
      for (var i = 0; i < list.length; i++) {
        if (!list[i].usedRel) {
          list[i].usedRel = true;
          rel.dateISO = list[i].iso;
          return;
        }
      }
    }

    /* ---- 13. Address → parent location containment ---- */
    entities.filter(function (e) { return e.type === "address" && e._parentGaz; })
      .forEach(function (ad) {
        var g = ad._parentGaz;
        var locEnt = entities.find(function (e) {
          return e.type === "location" && e.attrs && e.attrs.gaz === g.id;
        });
        if (!locEnt) {
          locEnt = addEntity("location", g.n, g.n,
            { lat: g.lat, lon: g.lon, cc: g.cc, kind: g.t, gaz: g.id }, "high",
            ad.spans[0][0], ad.spans[0][1]);
        }
        addRelDirect(ad, locEnt, "LOCATED_IN", "high", "address parent", "containment");
      });

    /* ---- 13b. Location -> country containment (infer the parent state even
       when not explicit: Marbella -> Spain, Leeds -> United Kingdom) ---- */
    if (G && G.countryByCc) {
      entities.filter(function (e) {
        return e.type === "location" && e.attrs && e.attrs.cc && e.attrs.kind !== "country";
      }).forEach(function (loc) {
        var c = G.countryByCc(loc.attrs.cc);
        if (!c) return;
        var gazId = "country:" + c.cc;
        var cEnt = entities.find(function (e) {
          return e.type === "location" && e.attrs &&
            (e.attrs.gaz === gazId || (e.attrs.kind === "country" && e.attrs.cc === c.cc));
        });
        if (!cEnt) {
          cEnt = addEntity("location", c.n, c.n,
            { lat: c.lat, lon: c.lon, cc: c.cc, kind: "country", gaz: gazId }, "high",
            loc.spans[0][0], loc.spans[0][1]);
        }
        if (cEnt.ref !== loc.ref) {
          addRelDirect(loc, cEnt, "LOCATED_IN", "high", "country", "containment");
        }
      });
    }

    /* ---- 13c. Vehicle "registered to X" -> X OWNS the vehicle (the registered
       keeper, never the subject who may merely use or deny it) ---- */
    (function () {
      var rre = /registered\s+to\s+([A-Z][\w'\u2019.\-]*(?:\s+[A-Z][\w'\u2019.\-]*){0,4})/g, rm;
      while ((rm = rre.exec(text))) {
        var cue = rm.index;
        var nameStart = rm.index + rm[0].length - (rm[1] || "").length; // start of the captured owner name
        var after = nameStart;
        var nameToks = (rm[1] || "").toUpperCase().split(/\s+/)
          .map(function (w) { return w.replace(/[^A-Z0-9]/g, ""); })   // drop trailing "." etc.
          .filter(function (w) {
            return w.length > 1 && w !== "THE" && w !== "AND" && w !== "LTD" && w !== "LIMITED";
          });
        var veh = entities.filter(function (e) {
          return e.type === "vehicle" && e.spans && e.spans.length &&
            e.spans[0][0] < cue && (cue - e.spans[e.spans.length - 1][1]) < 200;
        }).sort(function (a, b) { return b.spans[0][0] - a.spans[0][0]; })[0];
        if (!veh) continue;
        // owner: positional (entity right after the cue), else match the captured
        // name against an existing person/org label (e.g. "WALSH" -> Karen WALSH).
        var owner = entities.filter(function (e) {
          return (e.type === "organisation" || e.type === "person") && e.spans && e.spans.length &&
            e.spans[0][0] >= after - 2 && (e.spans[0][0] - after) < 60;
        }).sort(function (a, b) { return a.spans[0][0] - b.spans[0][0]; })[0];
        if (!owner && nameToks.length) {
          owner = entities.find(function (e) {
            if (e.type !== "organisation" && e.type !== "person") return false;
            var lab = String(e.label || "").toUpperCase();
            return nameToks.some(function (tok) { return lab.indexOf(tok) !== -1; });
          });
        }
        if (owner && owner.ref !== veh.ref) {
          addRelDirect(owner, veh, "OWNS", "high", "registered keeper", "containment");
        }
      }
    })();

    /* ---- 13d. Journey grouping: a subject's travel points (TRAVELS_TO /
       DEPARTS_FROM) within the same paragraph form one itinerary -> link the
       places to each other (origin + transit/return airports connected). ---- */
    (function () {
      function paraOf(pos) { return (text.slice(0, pos).match(/\n\s*\n/g) || []).length; }
      var byPara = {};
      relationships.forEach(function (r) {
        if (r.type !== "TRAVELS_TO" && r.type !== "DEPARTS_FROM") return;
        var loc = entities.find(function (e) { return e.ref === r.targetRef && e.type === "location"; });
        if (!loc || !loc.spans || !loc.spans.length) return;
        var pi = paraOf(loc.spans[0][0]);
        byPara[pi] = byPara[pi] || [];
        if (byPara[pi].indexOf(loc) === -1) byPara[pi].push(loc);
      });
      Object.keys(byPara).forEach(function (pi) {
        var ls = byPara[pi];
        for (var a = 0; a < ls.length; a++)
          for (var b = a + 1; b < ls.length; b++)
            addRelDirect(ls[a], ls[b], "JOURNEY_WITH", "med", "same journey", "journey");
      });
      // A dated departure dates the flight: copy a DEPARTS_FROM date onto a dateless
      // TRAVELS_TO whose destination is an AIRPORT in the same journey/paragraph.
      relationships.forEach(function (dr) {
        if (dr.type !== "DEPARTS_FROM" || !dr.dateISO) return;
        var dl = entities.find(function (e) { return e.ref === dr.targetRef; });
        if (!dl || !dl.spans || !dl.spans.length) return;
        var dpi = paraOf(dl.spans[0][0]);
        relationships.forEach(function (tr) {
          if (tr.type !== "TRAVELS_TO" || tr.dateISO || tr.sourceRef !== dr.sourceRef) return;
          var tl = entities.find(function (e) { return e.ref === tr.targetRef; });
          if (!tl || !tl.attrs || tl.attrs.kind !== "airport" || !tl.spans || !tl.spans.length) return;
          if (paraOf(tl.spans[0][0]) === dpi) tr.dateISO = dr.dateISO;
        });
      });
    })();

    /* ---- 13e. Money transfers: "transfer/payment of <money> ... to <person>"
       -> subject TRANSACTED_WITH recipient, amount on the edge. ---- */
    (function () {
      function nearestMoney(lo, hi) {
        return entities.find(function (e) {
          return e.type === "money" && e.spans && e.spans.length &&
            e.spans[0][0] >= lo && e.spans[0][0] <= hi;
        });
      }
      function firstEntityIn(types, lo, hi) {
        return entities.filter(function (e) {
          return types.indexOf(e.type) !== -1 && e.spans && e.spans.length &&
            e.spans[0][0] >= lo && e.spans[0][0] <= hi;
        }).sort(function (a, b) { return a.spans[0][0] - b.spans[0][0]; })[0];
      }
      // Flatten single newlines (positions preserved) so a sentence wrapped across
      // lines — as in real PDFs/emails — still matches as one segment.
      var flat = text.replace(/[\r\n]/g, " ");
      // OUTGOING: "transfer/payment/paid/sent/wired of <money> ... to <person/org>"
      var reTo = /\b(?:transfer(?:red|s|ed)?|payment|paid|sent|wired|remitted)\b[^.]{0,90}?\bto\b[^.]{0,140}/gi, xm;
      while ((xm = reTo.exec(flat))) {
        var segStart = xm.index, segEnd = xm.index + xm[0].length;
        var _ps = flat.lastIndexOf(".", segStart - 1) + 1;      // don't cross into the previous sentence
        var money = nearestMoney(Math.max(_ps, segStart - 60), segEnd);
        if (!money) continue;                                   // a transaction needs an amount
        var toRel = xm[0].toLowerCase().lastIndexOf(" to ");
        var toPos = segStart + (toRel >= 0 ? toRel + 4 : 0);
        var recip = firstEntityIn(["person", "organisation"], toPos, segEnd + 40);
        if (recip && principalPerson && recip.ref !== principalPerson.ref) {
          var rl = addRelDirect(principalPerson, recip, "TRANSACTED_WITH", "med", xm[0].trim().slice(0, 140), "transaction");
          if (rl) rl.amount = money.label;
        }
      }
      // INCOMING: "received/credit/deposit of <money> ... from <person/org>"
      var reFrom = /\b(?:receiv(?:e|ed|es)|credit(?:s|ed)?|deposit(?:s|ed)?|incoming|funds)\b[^.]{0,90}?\bfrom\b[^.]{0,120}/gi, fm;
      while ((fm = reFrom.exec(flat))) {
        var fStart = fm.index, fEnd = fm.index + fm[0].length;
        var money2 = nearestMoney(fStart - 60, fEnd);
        if (!money2) continue;
        var frRel = fm[0].toLowerCase().lastIndexOf(" from ");
        var frPos = fStart + (frRel >= 0 ? frRel + 6 : 0);
        var sender = firstEntityIn(["person", "organisation"], frPos, fEnd + 40);
        if (sender && principalPerson && sender.ref !== principalPerson.ref) {
          var rl2 = addRelDirect(sender, principalPerson, "TRANSACTED_WITH", "med", fm[0].trim().slice(0, 140), "transaction");
          if (rl2) rl2.amount = money2.label;
        }
      }
    })();

    /* ---- 13f. Ownership in prose: "<Person> runs/owns/founded/director of <Org>"
       -> Person OWNS Org (sentence-scoped; links the person in that clause). ---- */
    (function () {
      var OWN_CUE = /\b(?:runs?|owns?|owned|founded|co-founded|heads?|controls?|operates?|manages?|director\s+of|owner\s+of|proprietor\s+of|chief\s+executive\s+of|ceo\s+of|managing\s+director\s+of|boss\s+of)\b/i;
      var flatO = text.replace(/[\r\n]/g, " ");
      // sentence bounds that span single line-wraps (stop at . ! ? or a blank line)
      function sbounds(p0, p1) {
        var a = p0; while (a > 0 && !/[.!?]/.test(text[a - 1]) && !(text[a - 1] === "\n" && text[a - 2] === "\n")) a--;
        var b = p1; while (b < text.length && !/[.!?]/.test(text[b]) && !(text[b] === "\n" && text[b + 1] === "\n")) b++;
        return [a, b];
      }
      entities.filter(function (e) { return e.type === "organisation"; }).forEach(function (org) {
        if (!org.spans || !org.spans.length) return;
        var osp = org.spans[0];
        var bb = sbounds(osp[0], osp[1]), sS = bb[0], sE = bb[1];
        var sent = flatO.slice(sS, sE);
        if (!OWN_CUE.test(sent)) return;
        var inSent = entities.filter(function (e) {
          return e.type === "person" && e.spans && e.spans.length &&
            e.spans[0][0] >= sS && e.spans[0][0] < sE;
        }).sort(function (a, b) { return a.spans[0][0] - b.spans[0][0]; });
        var who = null;
        if (inSent.length) {
          var before = inSent.filter(function (pp) { return pp.spans[0][0] < osp[0]; });
          who = before.length ? before[before.length - 1] : inSent[0];
        } else {
          // coreference: a bare surname in this sentence referring to a known person
          // (e.g. "Daniel Okoro ... Okoro, who runs <Org>")
          for (var pi = 0; pi < entities.length && !who; pi++) {
            var pe = entities[pi];
            if (pe.type !== "person") continue;
            var ln = pe.label.split(/\s+/).pop().replace(/[^A-Za-z]/g, "");
            if (ln.length >= 3 && new RegExp("\\b" + ln + "\\b").test(sent)) who = pe;
          }
        }
        if (who && !hasRelBetween(who, org)) {
          addRelDirect(who, org, "OWNS", "high", sent.trim().slice(0, 140), "ownership");
        }
      });
    })();

    function addRelDirect(srcEnt, tgtEnt, type, conf, sentence, cue) {
      var dup = relationships.some(function (r) {
        return r.sourceRef === srcEnt.ref && r.targetRef === tgtEnt.ref && r.type === type;
      });
      if (dup) return null;
      var rel = {
        ref: ref("r"), sourceRef: srcEnt.ref, targetRef: tgtEnt.ref, type: type,
        direction: "->", dateISO: null, confidence: conf, sentence: sentence, cue: cue
      };
      relationships.push(rel);
      return rel;
    }

    /* ---- 14. Travel relationships → timeline events ---- */
    relationships.forEach(function (r) {
      if (!r.dateISO) return;
      if (["TRAVELS_TO", "DEPARTS_FROM", "STAYS_AT"].indexOf(r.type) === -1) return;
      var src = entities.find(function (e) { return e.ref === r.sourceRef; });
      var tgt = entities.find(function (e) { return e.ref === r.targetRef; });
      if (!src || !tgt) return;
      events.push({
        ref: ref("v"), dateISO: r.dateISO,
        label: r.type.replace(/_/g, " ").toLowerCase() + " — " + src.label + " → " + tgt.label,
        entityRefs: [src.ref, tgt.ref]
      });
    });

    // Booking-style: "On <date> used this email to book flights to X"
    dateHits.forEach(function (dh) {
      if (dh.used || dh.usedRel || !dh.entity) return;
      var after = text.slice(dh.end, dh.end + 80).toLowerCase();
      if (/\b(book(ed|ing)?|purchas(ed|ing)?|paid|transfer(red)?)\b/.test(after)) {
        var person = nearestEntityBefore("person", dh.start) || lastPerson;
        if (person) {
          events.push({
            ref: ref("v"), dateISO: dh.iso,
            label: "Transaction/booking — " + person.label, entityRefs: [person.ref]
          });
          dh.usedRel = true;
        }
      }
    });

    /* ---- 15. Merge duplicate people ----
     * "Darren COLE" + "Darren Michael COLE" are one nominal: same first and
     * last name token, and one label's tokens are a subset of the other's.
     * The richer label wins; spans/attrs merge; relationships re-point. */
    (function mergeDupPersons() {
      var people = entities.filter(function (e) { return e.type === "person"; });
      for (var i = 0; i < people.length; i++) {
        for (var j = i + 1; j < people.length; j++) {
          var a = people[i], b = people[j];
          if (a._merged || b._merged) continue;
          var ta = a.label.toUpperCase().split(/\s+/);
          var tb = b.label.toUpperCase().split(/\s+/);
          if (ta[0] !== tb[0] || ta[ta.length - 1] !== tb[tb.length - 1]) continue;
          var small = ta.length <= tb.length ? a : b;
          var big = small === a ? b : a;
          var bigSet = {};
          big.label.toUpperCase().split(/\s+/).forEach(function (t) { bigSet[t] = 1; });
          var subset = small.label.toUpperCase().split(/\s+/).every(function (t) { return bigSet[t]; });
          if (!subset) continue;
          small.spans.forEach(function (sp) { big.spans.push(sp); });
          Object.keys(small.attrs).forEach(function (k) {
            if (big.attrs[k] === undefined) big.attrs[k] = small.attrs[k];
          });
          relationships.forEach(function (r) {
            if (r.sourceRef === small.ref) r.sourceRef = big.ref;
            if (r.targetRef === small.ref) r.targetRef = big.ref;
          });
          events.forEach(function (ev) {
            ev.entityRefs = (ev.entityRefs || []).map(function (rf) { return rf === small.ref ? big.ref : rf; });
          });
          small._merged = true;
        }
      }
      for (var k = entities.length - 1; k >= 0; k--) {
        if (entities[k]._merged) entities.splice(k, 1);
      }
      // merging can create self-links and duplicates — drop them
      for (var r2 = relationships.length - 1; r2 >= 0; r2--) {
        var rel = relationships[r2];
        if (rel.sourceRef === rel.targetRef) { relationships.splice(r2, 1); continue; }
        for (var q = 0; q < r2; q++) {
          var o = relationships[q];
          if (o.sourceRef === rel.sourceRef && o.targetRef === rel.targetRef && o.type === rel.type) {
            relationships.splice(r2, 1);
            break;
          }
        }
      }
    })();

    // strip internal fields
    entities.forEach(function (e) { delete e._canon; delete e._parentGaz; delete e._claimedByAddress; delete e._merged; });

    // The document's primary subject — review/import should hub on this,
    // never on "first person extracted".
    var primaryEnt = mainPerson();

    return { entities: entities, relationships: relationships, events: events,
             ambiguities: ambiguities, cues: cues,
             primary: primaryEnt ? primaryEnt.ref : null,
             grading: grading,        // 3×5×2 lifted from the document, e.g. {source:"2",assessment:"A",handling:"P"}
             tags: tags };            // glossary codes (XX-CASH …)
  }

  /* ---------------- CSV column type detection ---------------- */

  /**
   * detectColumnType(values) — given sampled cell strings, return
   * { type, confidence } where type is one of:
   * phone | email | date | person | location | vehicle | ip | money | text
   */
  function detectColumnType(values) {
    var sample = (values || []).filter(function (v) { return v && String(v).trim(); }).slice(0, 50);
    if (!sample.length) return { type: "text", confidence: "low" };
    var counts = { phone: 0, email: 0, date: 0, person: 0, location: 0, vehicle: 0, ip: 0, money: 0 };
    sample.forEach(function (v) {
      v = String(v).trim();
      if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)) { counts.email++; return; }
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) { counts.ip++; return; }
      if (/^[A-Z]{2}\d{2}\s?[A-Z]{3}$/.test(v)) { counts.vehicle++; return; }
      if (/^(?:£|€|\$)\s?\d[\d,]*(?:\.\d{1,2})?$/.test(v)) { counts.money++; return; }
      if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) { counts.date++; return; }
      var pn = M.normalisePhone(v);
      if (pn.e164 && v.replace(/\D/g, "").length >= 9 && /^[+\d\s().-]+$/.test(v)) { counts.phone++; return; }
      if (G.lookup(v)) { counts.location++; return; }
      if (/^[A-Z][a-z]+\s+[A-Z][A-Za-z'’-]+$/.test(v) || /^[A-Z][A-Z'’-]+,?\s+[A-Z][a-z]+$/.test(v)) { counts.person++; return; }
    });
    var best = "text", bestN = 0;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) { best = k; bestN = counts[k]; }
    });
    var ratio = bestN / sample.length;
    if (ratio >= 0.8) return { type: best, confidence: "high" };
    if (ratio >= 0.5) return { type: best, confidence: "med" };
    return { type: "text", confidence: "low" };
  }

  var CRExtract = { extract: extract, detectColumnType: detectColumnType };

  if (typeof module !== "undefined" && module.exports) module.exports = CRExtract;
  if (typeof window !== "undefined") window.CRExtract = CRExtract;
})();
