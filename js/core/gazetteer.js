/* gazetteer.js — dictionary NER that carries a model's mined knowledge into the
 * lightweight, offline extractor (online AND desktop) without shipping weights.
 *
 * A GLiNER (or any NER) teacher is run OFFLINE over a corpus (see
 * tools/mine-gazetteer.js) to distil what it knows into a compact gazetteer
 * JSON: { entities: { person:[…], organisation:[…], location:[…], … } }. This
 * module loads that JSON and matches its phrases in free text, emitting spans in
 * the SmartNER runtime shape so they union-merge with the rule extractor
 * (rules still win on overlap). Tiny, deterministic and auditable — the model's
 * "theory" as data, runnable anywhere with no ML runtime.
 *
 * Browser: window.CRGazetteer (auto-loads window.CR_GAZETTEER if present and
 * registers with window.CRSmartNER). Node: module.exports.
 */
(function () {
  "use strict";

  var _index = null;      // { map: {normPhrase -> {label, display}}, maxWords, score }
  var _registered = false;

  function str(x) { return (x == null) ? "" : String(x); }
  function norm(s) { return str(s).toLowerCase().replace(/\s+/g, " ").replace(/^ | $/g, ""); }

  /* Build the matcher from a gazetteer object. Returns the phrase count. */
  function setGazetteer(obj) {
    obj = obj || {};
    var ents = obj.entities || {};
    var minLen = (typeof obj.minLen === "number") ? obj.minLen : 2;
    var score = (typeof obj.score === "number") ? obj.score : 0.6;
    var map = {}, maxWords = 1;
    Object.keys(ents).forEach(function (label) {
      (ents[label] || []).forEach(function (raw) {
        var ph = str(raw).replace(/\s+/g, " ").replace(/^ | $/g, "");
        if (!ph || ph.length < minLen) return;
        var n = norm(ph);
        if (!map[n]) map[n] = { label: label, display: ph };
        var wc = n.split(" ").length;
        if (wc > maxWords) maxWords = wc;
      });
    });
    _index = { map: map, maxWords: maxWords, score: score };
    return Object.keys(map).length;
  }

  /* Tokenise into word tokens with character offsets. */
  function tokens(text) {
    var re = /[A-Za-z0-9']+/g, m, out = [];
    while ((m = re.exec(text)) !== null) out.push({ w: m[0], s: m.index, e: m.index + m[0].length });
    return out;
  }

  /* match(text) -> [{ text, start, end, label, score }] (longest, non-overlapping). */
  function match(text) {
    if (!_index) return [];
    text = str(text);
    var toks = tokens(text), out = [], i = 0;
    while (i < toks.length) {
      var matched = false;
      var maxL = Math.min(_index.maxWords, toks.length - i);
      for (var len = maxL; len >= 1; len--) {
        var phrase = "";
        for (var k = 0; k < len; k++) phrase += (k ? " " : "") + toks[i + k].w.toLowerCase();
        var hit = _index.map[phrase];
        if (hit) {
          var s = toks[i].s, e = toks[i + len - 1].e;
          out.push({ text: text.slice(s, e), start: s, end: e, label: hit.label, score: _index.score });
          i += len; matched = true; break;
        }
      }
      if (!matched) i++;
    }
    return out;
  }

  /* Register as a composed SmartNER recall source (rules still win on overlap). */
  function register() {
    if (_registered) return true;
    if (typeof window !== "undefined" && window.CRSmartNER && typeof window.CRSmartNER.addRuntime === "function") {
      window.CRSmartNER.addRuntime(function (t) { return match(t); });
      _registered = true;
      return true;
    }
    return false;
  }

  var api = {
    setGazetteer: setGazetteer,
    match: match,
    candidates: match,           // SmartNER runtime alias
    register: register,
    size: function () { return _index ? Object.keys(_index.map).length : 0; },
    active: function () { return !!_index && Object.keys(_index.map).length > 0; }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.CRGazetteer = api;
    // Auto-activate a vendored gazetteer if one was loaded as a global.
    try { if (window.CR_GAZETTEER) { setGazetteer(window.CR_GAZETTEER); register(); } } catch (e) {}
  }
})();
