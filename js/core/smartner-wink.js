/* SOLAR — smartner-wink.js
 * OFFLINE smart-mode runtime powered by wink-NLP POS (no model download).
 * Proposes person / organisation candidates from proper-noun (PROPN) runs the
 * rule extractor missed, and registers with CRSmartNER so the review screen
 * union-merges them (rules win, low confidence, flagged for the analyst).
 *
 * Recall-only and advisory: candidates are low confidence, never override a CM
 * rule entity, and run only in the review augmentation — the core extractor and
 * corpus are untouched. CM stays the authority.
 *
 * Browser: auto-registers if window.CRSmartNER + window.CRSegment exist.
 * Node: module.exports = { candidates, register } for testing.
 */
(function () {
  "use strict";

  var Seg = (typeof window !== "undefined" && window.CRSegment) ||
            (typeof require === "function" ? require("./segment.js") : null);
  var G = (typeof window !== "undefined" && window.CRGeo) ||
          (typeof require === "function" ? require("./geo.js") : null);

  var TITLE = /^(mr|mrs|ms|miss|mx|dr|prof|rev|sir|dame|lord|lady|capt|major|col|sgt|cpl|lt|cmdr|det|detective|sergeant|constable|pc|dc|ds|di|councillor|cllr)$/i;
  var STOP = /^(the|a|an|on|in|at|of|to|by|and|but|or|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|north|south|east|west)$/i;
  var ORGW = /\b(ltd|limited|plc|llp|llc|inc|trust|police|bank|council|university|hospital|ministry|agency|holdings|freight|logistics|trading|imports|exports|partners|associates|group|services|solutions|gazette)\b/i;
  var PARTICLE = /^(van|von|der|den|de|del|della|di|da|du|dos|das|bin|al|ibn|ter|ten|la|le)$/i;
  var FIELD = /^(name|occurrence|subject|date|time|ref|reference|submitting|sar|booking|flight|hotel|unit|account|sort|company|director|nationality|passport|dob|address|status|remarks|note|notes|occupation|institution|extract|statement|material|witness)$/i;
  var PERSON_CUE = /\b(mr|mrs|ms|miss|mx|dr|prof|rev|sir|dame|lord|lady|capt|major|col|sgt|cpl|lt|cmdr|det|detective|sergeant|constable|pc|dc|ds|di|councillor|cllr|brother|sister|mother|father|son|daughter|wife|husband|partner|spouse|cousin|nephew|niece|uncle|aunt|associate|accomplice|companion|colleague|friend|neighbour|neighbor|called|named|nicknamed|aka|alias|tell|told|met)\s+$/i;

  function candidates(text) {
    if (!Seg || !Seg.available || !Seg.available()) return [];
    var toks = Seg.posTags(text);
    if (!toks.length) return [];
    var out = [], i = 0;
    while (i < toks.length) {
      if (toks[i].pos !== "PROPN") { i++; continue; }
      var parts = [toks[i]], j = i + 1;
      while (j < toks.length &&
             (toks[j].pos === "PROPN" || (parts.length && PARTICLE.test(toks[j].value)))) {
        parts.push(toks[j]); j++;
      }
      while (parts.length && PARTICLE.test(parts[parts.length - 1].value)) parts.pop();
      while (parts.length && TITLE.test(parts[0].value)) parts.shift();
      if (parts.length) {
        var start = parts[0].start, end = parts[parts.length - 1].end;
        var txt = text.slice(start, end).trim();
        var first = parts[0].value;
        var ok = txt.length >= 2 && !STOP.test(first) && /[A-Za-z]/.test(txt) &&
                 !(txt === txt.toUpperCase() && /\s/.test(txt));
        if (ok) {
          if (ORGW.test(txt)) {
            if (txt.split(/\s+/).length >= 2)   // skip bare org-suffix fragments ("Gazette", "Ltd")
              out.push({ text: txt, start: start, end: end, label: "organisation", score: 0.55 });
          } else {
            var before = text.slice(Math.max(0, start - 22), start);
            var lineHead = /(?:^|\n)\s*(?:\[[^\]\n]{0,12}\]\s*|\d{1,2}:\d{2}\s*)?$/.test(before);
            var chatName = lineHead && /^\s*:/.test(text.slice(end, end + 2));
            var isPlace = G && G.lookup && G.lookup(txt);
            if ((PERSON_CUE.test(before) || chatName) && !FIELD.test(txt) && !isPlace) {
              out.push({ text: txt, start: start, end: end, label: "person", score: 0.55 });
            }
          }
        }
      }
      i = j;
    }
    return out;
  }

  function register() {
    if (typeof window !== "undefined" && window.CRSmartNER && window.CRSegment &&
        window.CRSegment.available && window.CRSegment.available()) {
      window.CRSmartNER.setRuntime(function (text) { return candidates(text); });
      window.CRSmartNER.enabled = true;
    }
  }
  register();

  if (typeof module !== "undefined" && module.exports) module.exports = { candidates: candidates, register: register };
  if (typeof window !== "undefined") window.CRSmartNERWink = { candidates: candidates, register: register };
})();
