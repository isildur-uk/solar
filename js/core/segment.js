/* SOLAR — segment.js
 * Sentence segmentation + part-of-speech tags via wink-NLP, with a pure-JS
 * regex fallback so the extractor never depends on the model being present.
 *
 * Why: better sentence boundaries and POS make relation-scoping and coreference
 * less brittle. CM stays the authority — this only decides WHERE sentences break
 * and WHAT each token is, never how anything is formatted, typed, or graded.
 *
 * Offline: wink-NLP is a vendored, zero-network library. Node loads it via
 * require(); the browser uses window.CRWink (a vendored bundle exposing
 * { nlp, its }). If neither is present, everything falls back to regex and the
 * pipeline behaves exactly as before.
 *
 * Browser: window.CRSegment. Node: module.exports.
 *
 * API:
 *   CRSegment.available()        -> boolean (wink loaded?)
 *   CRSegment.sentences(text)    -> [{ start, end }]  (character offsets)
 *   CRSegment.posTags(text)      -> [{ value, pos, start, end }]
 */
(function () {
  "use strict";

  var _nlp = null, _its = null;
  (function init() {
    try {
      if (typeof window !== "undefined" && window.CRWink && window.CRWink.nlp) {
        _nlp = window.CRWink.nlp; _its = window.CRWink.its; return;
      }
      if (typeof require === "function") {
        var winkNLP = require("wink-nlp");
        var model = require("wink-eng-lite-web-model");
        _nlp = winkNLP(model); _its = _nlp.its;
      }
    } catch (e) { _nlp = null; _its = null; }   // any failure -> regex fallback
  })();

  function available() { return !!_nlp; }

  /* Map every wink token to its character [start,end] in the ORIGINAL text by
   * walking a cursor (wink's its.span is token-INDEX based, not char-based). */
  function tokenCharSpans(text, doc) {
    var spans = [], cursor = 0;
    doc.tokens().each(function (t) {
      var v = t.out(_its.value);
      var i = text.indexOf(v, cursor);
      if (i < 0) i = cursor;              // defensive: normalised token not found verbatim
      spans.push([i, i + v.length]);
      cursor = i + v.length;
    });
    return spans;
  }

  /* Regex fallback mirroring the extractor's historical splitter:
   * break on . ! ? or newline, but not on "C.M"-style abbreviations. */
  function regexSentences(text) {
    var bounds = [0], reB = /[.!?\n]/g, m;
    while ((m = reB.exec(text))) {
      var i = m.index;
      if (text[i] === "." && /[A-Z]/.test(text[i + 1] || "")) continue;
      bounds.push(i + 1);
    }
    bounds.push(text.length);
    var out = [];
    for (var k = 0; k < bounds.length - 1; k++) {
      var s = bounds[k], e = bounds[k + 1];
      if (text.slice(s, e).trim().length > 2) out.push({ start: s, end: e });
    }
    return out;
  }

  function sentences(text) {
    text = String(text == null ? "" : text);
    if (!_nlp) return regexSentences(text);
    try {
      var doc = _nlp.readDoc(text);
      var tc = tokenCharSpans(text, doc);
      var out = [];
      doc.sentences().each(function (s) {
        var sp = s.out(_its.span);                 // [firstTokenIdx, lastTokenIdx]
        var a = tc[sp[0]], b = tc[sp[1]];
        if (a && b && b[1] > a[0]) out.push({ start: a[0], end: b[1] });
      });
      return out.length ? out : regexSentences(text);
    } catch (e) { return regexSentences(text); }
  }

  function posTags(text) {
    text = String(text == null ? "" : text);
    if (!_nlp) return [];
    try {
      var doc = _nlp.readDoc(text);
      var tc = tokenCharSpans(text, doc);
      var pos = doc.tokens().out(_its.pos);
      var vals = doc.tokens().out(_its.value);
      var out = [];
      for (var i = 0; i < vals.length; i++) {
        out.push({ value: vals[i], pos: pos[i], start: tc[i][0], end: tc[i][1] });
      }
      return out;
    } catch (e) { return []; }
  }

  // Off by default: wink boundaries are a strict prose improvement but can add
  // redundant location links on entity-dense address lines. Flip to true to use
  // wink segmentation live; posTags() is always available regardless.
  var CRSegment = { enabled: true, available: available, sentences: sentences, posTags: posTags, regexSentences: regexSentences };

  if (typeof module !== "undefined" && module.exports) module.exports = CRSegment;
  if (typeof window !== "undefined") window.CRSegment = CRSegment;
})();
