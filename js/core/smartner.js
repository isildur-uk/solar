/* SOLAR — smartner.js
 * Optional "smart mode" entity recall: a pluggable transformer NER (e.g. GLiNER
 * via transformers.js / ONNX) whose hits are UNION-merged with the rule/dictionary
 * extractor. The rule layer stays the precision backbone — model spans that overlap
 * a rule entity are dropped; only genuinely new spans are added, at low/med
 * confidence and flagged, so they surface on the review screen for an analyst.
 *
 * OFFLINE-SAFE: this module does no network I/O and loads no model on its own.
 * It is INERT until a runtime is injected via setRuntime() (so a vendored model
 * can be wired in without touching this file). With no runtime, extract() returns
 * [] and nothing changes. The pure mergeInto() is always available and tested.
 *
 * Browser: window.CRSmartNER. Node: module.exports.
 */
(function () {
  "use strict";

  /* GLiNER-style label -> Solar entity type. Unmapped labels are ignored. */
  var LABEL_MAP = {
    person: "person", people: "person", per: "person", name: "person",
    organization: "organisation", organisation: "organisation", org: "organisation", company: "organisation",
    location: "location", place: "location", city: "location", country: "location", gpe: "location", address: "address",
    vehicle: "vehicle", car: "vehicle",
    money: "money", amount: "money", currency: "money",
    date: "date", time: "date",
    email: "email", "email address": "email",
    phone: "phone", "phone number": "phone", telephone: "phone",
    ip: "ip", "ip address": "ip"
  };

  var DEFAULT_TYPES = ["person", "organization", "location", "address", "vehicle", "money", "phone", "email", "date", "ip"];

  var _runtime = null;        // injected: function(text, types) -> Promise<[{text,start,end,label,score}]>
  var _added = [];            // additional composed runtimes (e.g. wink, gazetteer)
  var _seq = 0;

  function lc(x) { return String(x == null ? "" : x).toLowerCase().trim(); }

  function overlaps(aS, aE, bS, bE) { return aS < bE && bS < aE; }

  /* PURE: union-merge model spans into a rule-extractor result.
   *   ruleResult : the object returned by CRExtract.extract (has .entities[])
   *   modelSpans : [{text, start, end, label, score}]
   *   opts.minScore (default 0.5)
   * Returns { entities: [...rule, ...added], added: [...] } without mutating input.
   * Rules win: a model span overlapping ANY existing entity span is discarded. */
  function mergeInto(ruleResult, modelSpans, opts) {
    opts = opts || {};
    var minScore = (typeof opts.minScore === "number") ? opts.minScore : 0.5;
    var rule = (ruleResult && ruleResult.entities) ? ruleResult.entities : [];
    var added = [];
    var takenCanon = {};

    (modelSpans || []).forEach(function (sp) {
      if (!sp || sp.text == null || sp.start == null || sp.end == null) return;
      if (typeof sp.score === "number" && sp.score < minScore) return;
      var type = LABEL_MAP[lc(sp.label)];
      if (!type) return;                                   // unmapped label -> ignore
      // rules win: drop if the model span overlaps any existing entity span
      var clash = rule.some(function (e) {
        return (e.spans || []).some(function (s) { return overlaps(sp.start, sp.end, s[0], s[1]); });
      }) || added.some(function (e) {
        return (e.spans || []).some(function (s) { return overlaps(sp.start, sp.end, s[0], s[1]); });
      });
      if (clash) return;
      var canon = type + "|" + lc(sp.text).replace(/[^a-z0-9]/g, "");
      if (takenCanon[canon]) return;                       // de-dupe identical model hits
      takenCanon[canon] = 1;
      var score = (typeof sp.score === "number") ? sp.score : 0.6;
      added.push({
        ref: "m" + (++_seq),
        type: type,
        label: String(sp.text).trim(),
        value: String(sp.text).trim(),
        attrs: { smart: true, score: Math.round(score * 100) / 100 },
        confidence: score >= 0.85 ? "med" : "low",        // never "high": model recall is advisory
        spans: [[sp.start, sp.end]],
        flags: ["smart-ner"]
      });
    });

    return { entities: rule.concat(added), added: added };
  }

  /* Inject the inference backend (so a vendored model can be wired without
   * editing this file). fn(text, types) must resolve to model spans. */
  function setRuntime(fn) { _runtime = (typeof fn === "function") ? fn : null; }
  /* Compose an ADDITIONAL recall source (wink, gazetteer, …). All runtimes run
   * and their spans concatenate before mergeInto (rules still win on overlap). */
  function addRuntime(fn) { if (typeof fn === "function") _added.push(fn); }

  function available() { return !!_runtime || _added.length > 0; }

  function runOne(fn, text, types) {
    try {
      return Promise.resolve(fn(text, types))
        .then(function (spans) { return Array.isArray(spans) ? spans : []; })
        .catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }
  /* Async: run every injected runtime. Returns [] if none or on any error
   * (smart mode must never break the rule pipeline). */
  function extract(text, opts) {
    opts = opts || {};
    var fns = (_runtime ? [_runtime] : []).concat(_added);
    if (!fns.length) return Promise.resolve([]);
    var t = String(text || ""), types = opts.types || DEFAULT_TYPES;
    return Promise.all(fns.map(function (fn) { return runOne(fn, t, types); }))
      .then(function (results) { var out = []; results.forEach(function (r) { out = out.concat(r); }); return out; })
      .catch(function () { return []; });
  }

  var CRSmartNER = {
    VERSION: "2026-06-16",
    enabled: false,            // user preference; review augmentation requires available() && enabled

    LABEL_MAP: LABEL_MAP,
    DEFAULT_TYPES: DEFAULT_TYPES,
    mergeInto: mergeInto,
    setRuntime: setRuntime,
    addRuntime: addRuntime,
    available: available,
    extract: extract
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRSmartNER;
  if (typeof window !== "undefined") window.CRSmartNER = CRSmartNER;
})();
