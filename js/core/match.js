/* CHART ROOM — match.js
 * Smart-matching engine: normalisation + fuzzy identity resolution.
 * Dependency-free; runs in browser (window.CRMatch) and Node (module.exports).
 * Design rules (see BRIEF.md):
 *  - Phones match on E.164 canonical form only.
 *  - Emails match on canonical form only; gmail dot/plus rules apply to gmail domains only;
 *    never fuzzy-match local parts across different domains.
 *  - Person names: Jaro-Winkler + token logic + nickname table, type-gated,
 *    suggest threshold 0.85, NEVER auto-merge (callers must treat results as suggestions).
 *  - Addresses never match against city-level locations.
 */
(function () {
  "use strict";

  /* ---------------- Phone normalisation ---------------- */

  // Minimal country dial-plan knowledge for validation confidence.
  var DIAL_PLANS = {
    "44": { name: "UK", nsnLen: [10], mobilePrefix: "7" },     // +44 then 10 digits
    "34": { name: "Spain", nsnLen: [9] },
    "33": { name: "France", nsnLen: [9] },
    "49": { name: "Germany", nsnLen: [10, 11] },
    "31": { name: "Netherlands", nsnLen: [9] },
    "353": { name: "Ireland", nsnLen: [9] },
    "351": { name: "Portugal", nsnLen: [9] },
    "1": { name: "US/Canada", nsnLen: [10] },
    "971": { name: "UAE", nsnLen: [8, 9] },
    "90": { name: "Turkey", nsnLen: [10] },
    "212": { name: "Morocco", nsnLen: [9] },
    "92": { name: "Pakistan", nsnLen: [10] },
    "91": { name: "India", nsnLen: [10] }
  };

  function digitsOnly(s) { return String(s || "").replace(/\D+/g, ""); }

  /**
   * Normalise a raw phone string to E.164-ish canonical form.
   * Returns { input, e164, cc, valid, display, reason }
   *  - valid=true  : matches a known dial plan (HIGH confidence identifier)
   *  - valid=false : normalised but not validated against a plan (treat as MED/LOW)
   */
  function normalisePhone(raw) {
    var input = String(raw || "").trim();
    var s = input.replace(/[\s(). -]+/g, "");
    var out = { input: input, e164: null, cc: null, valid: false, display: input, reason: "" };
    if (!s) { out.reason = "empty"; return out; }

    if (/^00\d+/.test(s)) s = "+" + s.slice(2);          // 00 → +
    if (/^\+/.test(s)) {
      s = "+" + digitsOnly(s);
    } else {
      var d = digitsOnly(s);
      if (/^07\d{9}$/.test(d)) s = "+44" + d.slice(1);        // UK mobile
      else if (/^0[12]\d{8,9}$/.test(d)) s = "+44" + d.slice(1); // UK geographic
      else if (/^08\d{8,9}$/.test(d) || /^09\d{8,9}$/.test(d)) s = "+44" + d.slice(1);
      else if (d.length >= 9 && d.length <= 15) { s = d; }    // bare digits, unknown origin
      else { out.reason = "too short/long"; return out; }
    }

    var dd = digitsOnly(s);
    if (dd.length < 8 || dd.length > 15) { out.reason = "outside E.164 length"; return out; }

    if (s[0] === "+") {
      // find country code (longest match 3→1)
      var cc = null;
      for (var len = 3; len >= 1; len--) {
        var c = dd.slice(0, len);
        if (DIAL_PLANS[c]) { cc = c; break; }
      }
      out.e164 = "+" + dd;
      out.cc = cc;
      if (cc) {
        var nsn = dd.slice(cc.length);
        var plan = DIAL_PLANS[cc];
        out.valid = plan.nsnLen.indexOf(nsn.length) !== -1;
        if (!out.valid) out.reason = "length not valid for +" + cc + " (" + plan.name + ")";
      } else {
        out.reason = "unknown country code";
      }
    } else {
      out.e164 = dd; // canonical but origin-unknown
      out.reason = "no country prefix";
    }
    out.display = out.e164;
    return out;
  }

  /* ---------------- Email normalisation ---------------- */

  var GMAIL_DOMAINS = { "gmail.com": 1, "googlemail.com": 1 };

  /** Canonicalise an email. Gmail-only dot/plus folding. Returns canonical string or null. */
  function normaliseEmail(raw) {
    var s = String(raw || "").trim().toLowerCase();
    var m = s.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
    if (!m) return null;
    var local = m[1], domain = m[2];
    if (GMAIL_DOMAINS[domain]) {
      local = local.split("+")[0].replace(/\./g, "");
      domain = "gmail.com";
    } else {
      local = local.split("+")[0]; // plus-addressing is near-universal; dots are not
    }
    return local + "@" + domain;
  }

  /* ---------------- String similarity ---------------- */

  function jaro(a, b) {
    if (a === b) return 1;
    var la = a.length, lb = b.length;
    if (!la || !lb) return 0;
    var dist = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
    var ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
    var matches = 0;
    for (var i = 0; i < la; i++) {
      var lo = Math.max(0, i - dist), hi = Math.min(lb - 1, i + dist);
      for (var j = lo; j <= hi; j++) {
        if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; matches++; break; }
      }
    }
    if (!matches) return 0;
    var t = 0, k = 0;
    for (i = 0; i < la; i++) {
      if (ma[i]) {
        while (!mb[k]) k++;
        if (a[i] !== b[k]) t++;
        k++;
      }
    }
    t /= 2;
    return (matches / la + matches / lb + (matches - t) / matches) / 3;
  }

  /** Jaro-Winkler similarity, 0..1. */
  function jaroWinkler(a, b) {
    a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase();
    var j = jaro(a, b);
    var p = 0;
    for (var i = 0; i < Math.min(4, a.length, b.length); i++) {
      if (a[i] === b[i]) p++; else break;
    }
    return j + p * 0.1 * (1 - j);
  }

  /* ---------------- Name matching ---------------- */

  var NICKNAMES = [
    ["geoffrey", "geoff", "jeff", "jeffrey"],
    ["michael", "mike", "mick", "micky"],
    ["david", "dave", "davey"],
    ["james", "jim", "jimmy", "jamie"],
    ["william", "will", "bill", "billy", "liam"],
    ["robert", "rob", "bob", "bobby", "robbie"],
    ["richard", "rich", "rick", "ricky", "dick"],
    ["anthony", "tony", "ant"],
    ["stephen", "steven", "steve", "stevie"],
    ["christopher", "chris", "kit"],
    ["catherine", "katherine", "kate", "katie", "cathy", "kathy"],
    ["elizabeth", "liz", "lizzie", "beth", "betty"],
    ["thomas", "tom", "tommy"],
    ["daniel", "dan", "danny"],
    ["matthew", "matt", "matty"],
    ["nicholas", "nick", "nicky"],
    ["andrew", "andy", "drew"],
    ["benjamin", "ben", "benny"],
    ["samuel", "sam", "sammy"],
    ["samantha", "sam"],
    ["joseph", "joe", "joey"],
    ["jonathan", "jon", "john", "johnny", "jack"],
    ["edward", "ed", "eddie", "ted", "teddy"],
    ["henry", "harry", "hal"],
    ["alexander", "alex", "sandy"],
    ["alexandra", "alex", "sandra"],
    ["patrick", "pat", "paddy"],
    ["patricia", "pat", "trish", "tricia"],
    ["susan", "sue", "suzie"],
    ["terence", "terry", "tel"],
    ["kenneth", "ken", "kenny"],
    ["raymond", "ray"],
    ["gary", "gaz", "gazza"],
    ["barry", "baz", "bazza"],
    ["sharon", "shaz"],
    ["charles", "charlie", "chas"],
    ["frederick", "fred", "freddie"],
    ["gerald", "gerry", "ged"],
    ["lawrence", "laurence", "larry", "laz"],
    ["margaret", "maggie", "meg", "peggy"],
    ["jennifer", "jen", "jenny"],
    ["rebecca", "becky", "becca"],
    ["deborah", "debbie", "debs"],
    ["victoria", "vicky", "tori"],
    ["timothy", "tim", "timmy"],
    ["philip", "phillip", "phil"],
    ["gregory", "greg"],
    ["douglas", "doug", "dougie"],
    ["stuart", "stewart", "stu"],
    ["graham", "graeme"],
    ["mohammed", "mohammad", "muhammad", "mo"]
  ];
  var NICK_INDEX = {};
  NICKNAMES.forEach(function (group, gi) {
    group.forEach(function (n) {
      (NICK_INDEX[n] = NICK_INDEX[n] || []).push(gi);
    });
  });

  function sameNickGroup(a, b) {
    var ga = NICK_INDEX[a], gb = NICK_INDEX[b];
    if (!ga || !gb) return false;
    return ga.some(function (g) { return gb.indexOf(g) !== -1; });
  }

  function foldAccents(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  /** Canonical name: accent-folded, lowercase, single-spaced, punctuation stripped. */
  function canonicalName(s) {
    return foldAccents(s).toLowerCase()
      .replace(/[^a-z\s'-]/g, " ")
      .replace(/[\s'-]+/g, " ")
      .trim();
  }

  /**
   * Person-name similarity.
   * Returns { score: 0..1, reasons: [...], singleToken: bool }
   * Logic: surname (last token) carries most weight; forenames may match by
   * equality, nickname group, initial, or fuzzy (JW>=0.92).
   */
  function nameSimilarity(a, b) {
    var ca = canonicalName(a), cb = canonicalName(b);
    var res = { score: 0, reasons: [], singleToken: false };
    if (!ca || !cb) return res;
    var ta = ca.split(" "), tb = cb.split(" ");
    res.singleToken = ta.length === 1 || tb.length === 1;
    if (ca === cb) {
      res.reasons.push("exact");
      if (res.singleToken) {
        res.score = 0.84; // single-name entities are unreliable by design
        res.reasons.push("single-token name: capped");
      } else { res.score = 1; }
      return res;
    }

    var surA = ta[ta.length - 1], surB = tb[tb.length - 1];
    var surJW = jaroWinkler(surA, surB);
    var surScore = surA === surB ? 1 : (surJW >= 0.94 ? surJW * 0.9 : surJW * 0.5);
    if (surA === surB) res.reasons.push("surname exact");
    else if (surJW >= 0.94) res.reasons.push("surname close (" + surJW.toFixed(2) + ")");

    if (res.singleToken) {
      // Surname-only comparison — unreliable by design; cap the score.
      res.score = Math.min(0.84, surScore);
      res.reasons.push("single-token name: capped");
      return res;
    }

    var foreA = ta.slice(0, -1), foreB = tb.slice(0, -1);
    var foreScore = 0;
    for (var i = 0; i < foreA.length; i++) {
      for (var j = 0; j < foreB.length; j++) {
        var fa = foreA[i], fb = foreB[j], s = 0;
        if (fa === fb) { s = 1; }
        else if (sameNickGroup(fa, fb)) { s = 0.97; if (res.reasons.indexOf("nickname") < 0) res.reasons.push("nickname"); }
        else if (fa.length === 1 || fb.length === 1) {
          if (fa[0] === fb[0]) { s = 0.9; if (res.reasons.indexOf("initial") < 0) res.reasons.push("initial"); }
        }
        else {
          var jw = jaroWinkler(fa, fb);
          if (jw >= 0.92) { s = jw * 0.95; res.reasons.push("forename close"); }
        }
        if (s > foreScore) foreScore = s;
      }
    }
    res.score = surScore * 0.62 + foreScore * 0.38;
    return res;
  }

  /* ---------------- Entity matching (type-gated) ---------------- */

  var SUGGEST_THRESHOLD = 0.85;

  function normAddress(s) {
    return canonicalName(String(s || "").replace(/[\d]/g, function (d) { return d; }))
      .replace(/\b(calle|c|av|avda|avenue|ave|road|rd|street|st|lane|ln|close|cl|way|drive|dr)\b/g, "")
      .replace(/\s+/g, " ").trim();
  }

  /**
   * Match a candidate entity against existing entities.
   * candidate: { type, label, ids?: {e164, email, canonical}, attrs? }
   * existing:  array of entities of the same shape (with id).
   * Returns ranked suggestions: [{ entity, score, tier: 'exact'|'strong'|'possible', reasons }]
   * Never merges — suggestions only.
   */
  function matchEntity(candidate, existing) {
    var out = [];
    var type = candidate.type;
    (existing || []).forEach(function (e) {
      if (e.type !== type) return;            // type gate (incl. address vs location)
      var score = 0, reasons = [], tier = null;

      if (type === "phone") {
        var a = (candidate.ids && candidate.ids.e164) || normalisePhone(candidate.label).e164;
        var b = (e.ids && e.ids.e164) || normalisePhone(e.label).e164;
        if (a && b && a === b) { score = 1; tier = "exact"; reasons.push("E.164 identical"); }
      } else if (type === "email") {
        var ea = (candidate.ids && candidate.ids.email) || normaliseEmail(candidate.label);
        var eb = (e.ids && e.ids.email) || normaliseEmail(e.label);
        if (ea && eb && ea === eb) { score = 1; tier = "exact"; reasons.push("canonical email identical"); }
      } else if (type === "person") {
        var ns = nameSimilarity(candidate.label, e.label);
        // aliases count — an alias substitutes for the forename:
        // entity "Gary NEWELL" aka "Tank" should catch candidate "Tank NEWELL"
        function akaVariants(label, akaStr) {
          var outV = [];
          var toks = canonicalName(label).split(" ");
          var surname = toks[toks.length - 1];
          String(akaStr || "").split(";").forEach(function (a) {
            a = a.trim();
            if (!a) return;
            outV.push(a);                      // bare alias
            if (surname) outV.push(a + " " + surname); // alias + surname
          });
          return outV;
        }
        akaVariants(e.label, e.attrs && e.attrs.aka).forEach(function (v) {
          var ns2 = nameSimilarity(candidate.label, v);
          if (ns2.score > ns.score) { ns = ns2; ns.reasons = ns2.reasons.concat(["via alias"]); }
        });
        akaVariants(candidate.label, candidate.attrs && candidate.attrs.aka).forEach(function (v) {
          var ns2 = nameSimilarity(v, e.label);
          if (ns2.score > ns.score) { ns = ns2; ns.reasons = ns2.reasons.concat(["via alias"]); }
        });
        score = ns.score; reasons = ns.reasons;
        // DOB corroboration / contradiction
        var dobA = candidate.attrs && candidate.attrs.dob, dobB = e.attrs && e.attrs.dob;
        if (dobA && dobB) {
          if (dobA === dobB) { score = Math.min(1, score + 0.1); reasons.push("DOB match"); }
          else { score *= 0.45; reasons.push("DOB conflict"); }
        }
        if (score >= 0.999) tier = "exact";
        else if (score >= 0.92) tier = "strong";
        else if (score >= SUGGEST_THRESHOLD) tier = "possible";
        if (ns.singleToken && tier) { tier = "possible"; reasons.push("single-name: unreliable"); }
      } else if (type === "location") {
        var la = canonicalName(candidate.label), lb = canonicalName(e.label);
        var giA = candidate.ids && candidate.ids.gaz, giB = e.ids && e.ids.gaz;
        if (giA && giB && giA === giB) { score = 1; tier = "exact"; reasons.push("gazetteer id"); }
        else if (la === lb) { score = 1; tier = "exact"; reasons.push("name identical"); }
      } else if (type === "address") {
        var aa = normAddress(candidate.label), ab = normAddress(e.label);
        if (aa && ab) {
          if (aa === ab) { score = 1; tier = "exact"; reasons.push("address identical"); }
          else {
            var jw2 = jaroWinkler(aa, ab);
            if (jw2 >= 0.93) { score = jw2; tier = "strong"; reasons.push("address close"); }
          }
        }
      } else {
        // organisation, vehicle, account, etc.: canonical equality or high JW
        var xa = canonicalName(candidate.label), xb = canonicalName(e.label);
        if (xa && xa === xb) { score = 1; tier = "exact"; reasons.push("name identical"); }
        else {
          var jw3 = jaroWinkler(xa, xb);
          if (jw3 >= 0.93) { score = jw3; tier = "strong"; reasons.push("name close"); }
        }
      }

      if (tier) out.push({ entity: e, score: score, tier: tier, reasons: reasons });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  }

  var CRMatch = {
    normalisePhone: normalisePhone,
    normaliseEmail: normaliseEmail,
    jaroWinkler: jaroWinkler,
    canonicalName: canonicalName,
    foldAccents: foldAccents,
    nameSimilarity: nameSimilarity,
    matchEntity: matchEntity,
    SUGGEST_THRESHOLD: SUGGEST_THRESHOLD
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRMatch;
  if (typeof window !== "undefined") window.CRMatch = CRMatch;
})();
