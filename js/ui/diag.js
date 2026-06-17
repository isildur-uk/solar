/* SOLAR — diag.js  (window.CRDiag)
 * Plain-text diagnostics so issues can be copied straight back for triage.
 *  - fromExtraction({result,cardState,relState,sourceName}) : what THIS text
 *    extracted (entities, attrs, links, confidence, warnings, dedup candidates).
 *  - fromCase(store) : the WHOLE current case (charted entities + links) — best
 *    for inspecting how duplicates merged after loading several reports.
 *  - open(title,text) : copyable popup.
 * Read-only and advisory; never mutates the result or the case. CM stays the
 * authority — this just reports what the pipeline decided.
 */
(function () {
  "use strict";
  var U = (typeof window !== "undefined" && window.CRUtil) || null;

  function attrLine(attrs) {
    if (!attrs) return "";
    var skip = { lat: 1, lon: 1, raw: 0 };
    var keys = Object.keys(attrs).filter(function (k) {
      var v = attrs[k];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return false;
      if (typeof v === "object" && !Array.isArray(v)) return false;
      return true;
    });
    if (typeof attrs.lat === "number") keys.push("coords");
    if (!keys.length) return "";
    return keys.map(function (k) {
      if (k === "coords") return "coords=" + attrs.lat.toFixed(3) + "," + attrs.lon.toFixed(3);
      var v = attrs[k];
      return k + "=" + (Array.isArray(v) ? v.join("/") : String(v));
    }).join("  ");
  }

  function fromExtraction(snap) {
    if (!snap || !snap.result) return "No extraction to report.";
    var r = snap.result, cs = snap.cardState || {}, rs = snap.relState || {};
    var L = [];
    L.push("SOLAR EXTRACTION DIAGNOSTIC");
    L.push("source: " + (snap.sourceName || "(pasted text)"));
    if (r.primary) {
      var pe = r.entities.find(function (e) { return e.ref === r.primary; });
      if (pe) L.push("primary subject: " + pe.label);
    }
    if (r.grading) L.push("document grading: " + [r.grading.source, r.grading.assessment, r.grading.handling].filter(Boolean).join(" "));
    L.push("counts: " + r.entities.length + " entities, " + r.relationships.length + " relationships, " +
           (r.events ? r.events.length : 0) + " timeline events, " +
           (r.ambiguities ? r.ambiguities.length : 0) + " ambiguities");
    L.push("");

    L.push("ENTITIES");
    r.entities.forEach(function (e) {
      var inc = cs[e.ref] ? (cs[e.ref].include ? "on" : "off") : "?";
      L.push("• [" + e.type + "] " + e.label + "  (" + String(e.confidence).toUpperCase() + ", " + inc + ")");
      var a = attrLine(e.attrs);
      if (a) L.push("    attrs: " + a);
      if (e.flags && e.flags.length) L.push("    flags: " + e.flags.join("; "));
      if (e._suggestions && e._suggestions.length) {
        L.push("    dedup candidates: " + e._suggestions.map(function (s) {
          return s.entity.label + " [" + s.tier + ": " + s.reasons.join(", ") + "]";
        }).join(" | "));
      }
      var dec = cs[e.ref] && cs[e.ref].decision;
      if (dec && dec !== "new") L.push("    -> set to MATCH existing id " + dec);
    });
    L.push("");

    L.push("RELATIONSHIPS");
    if (!r.relationships.length) L.push("  (none)");
    r.relationships.forEach(function (rel) {
      var src = r.entities.find(function (e) { return e.ref === rel.sourceRef; });
      var tgt = r.entities.find(function (e) { return e.ref === rel.targetRef; });
      var st = rs[rel.ref] || {};
      var dir = (st.direction || rel.direction) === "<-" ? "<--" : "-->";
      var sName = src ? src.label : "?", tName = tgt ? tgt.label : "?";
      var a = dir === "<--" ? tName : sName, b = dir === "<--" ? sName : tName;
      var tags = [];
      tags.push(String(rel.confidence).toUpperCase());
      if (st.include === false) tags.push("off"); else tags.push("on");
      if (rel.modality === "planned") tags.push("PLANNED");
      if (rel.negated) tags.push("DENIED");
      if (rel.amount) tags.push(rel.amount);
      if (rel.dateISO) tags.push(rel.dateISO);
      L.push("• " + a + "  --" + (st.type || rel.type) + "-->  " + b + "  (" + tags.join(", ") + ")");
      if (rel.sentence) L.push("    \"" + rel.sentence.trim() + "\"");
    });

    if (r.ambiguities && r.ambiguities.length) {
      L.push(""); L.push("AMBIGUITIES");
      r.ambiguities.forEach(function (x) { L.push("⚠ " + x.message); });
    }
    if (r.events && r.events.length) {
      L.push(""); L.push("TIMELINE EVENTS");
      r.events.forEach(function (ev) { L.push("• " + (ev.dateISO || "?") + "  " + ev.label); });
    }
    return L.join("\n");
  }

  function fromCase(store) {
    if (!store) return "No case loaded.";
    var ents = store.entities || [], links = store.links || [];
    var byId = {}; ents.forEach(function (e) { byId[e.id] = e; });
    var L = [];
    L.push("SOLAR CASE DIAGNOSTIC");
    L.push("case: " + ((store.meta && store.meta.name) || "untitled"));
    L.push("counts: " + ents.length + " entities, " + links.length + " links, " +
           ((store.events && store.events.length) || 0) + " events");
    L.push("");
    L.push("ENTITIES (charted)");
    ents.forEach(function (e) {
      var ids = e.ids ? Object.keys(e.ids).filter(function (k) { return e.ids[k]; })
                          .map(function (k) { return k + "=" + e.ids[k]; }).join(" ") : "";
      var g = e.provenance ? [e.provenance.source, e.provenance.assessment || e.provenance.intel, e.provenance.handling].filter(function (x) { return x != null && x !== ""; }).join("") : "";
      L.push("• [" + e.type + "] " + e.label + (g ? "  {" + g + "}" : ""));
      var a = attrLine(e.attrs);
      if (a) L.push("    attrs: " + a);
      if (ids) L.push("    ids: " + ids);
      if (e.attrs && (e.attrs.aka)) L.push("    aka: " + e.attrs.aka);
    });
    L.push("");
    L.push("LINKS");
    if (!links.length) L.push("  (none)");
    links.forEach(function (l) {
      var f = byId[l.from], t = byId[l.to];
      var tags = [String(l.confidence || "").toUpperCase()];
      if (l.modality) tags.push(l.modality);
      if (l.negated) tags.push("DENIED");
      if (l.amount) tags.push(l.amount);
      if (l.dateISO) tags.push(l.dateISO);
      L.push("• " + (f ? f.label : l.from) + "  --" + l.type + "-->  " + (t ? t.label : l.to) +
             "  (" + tags.filter(Boolean).join(", ") + ")");
    });
    return L.join("\n");
  }

  function open(title, text) {
    if (!U) return;
    U.el("diag-title").textContent = title || "Diagnostics";
    var ta = U.el("diag-text");
    ta.value = text || "";
    U.openModal("diag-veil");
    ta.focus(); ta.select();
  }

  function copy() {
    var ta = U && U.el("diag-text");
    if (!ta) return;
    ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(function () {}, function () {});
      ok = true;
    }
    var b = U.el("diag-copy");
    if (b) { var t0 = b.textContent; b.textContent = ok ? "Copied ✓" : "Press Ctrl+C"; setTimeout(function () { b.textContent = t0; }, 1500); }
  }

  if (typeof window !== "undefined") window.CRDiag = { fromExtraction: fromExtraction, fromCase: fromCase, open: open, copy: copy };
  if (typeof module !== "undefined" && module.exports) module.exports = { fromExtraction: fromExtraction, fromCase: fromCase };
})();
