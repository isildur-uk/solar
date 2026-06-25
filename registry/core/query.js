/* query.js — the Registry's search/query engine: how an "elite" database tool
 * organises and serves records. One pure function over an array of IRs that does,
 * in the order a real query planner would:
 *   1. structured FILTERS  (faceted, AND across fields, OR within a field)
 *   2. DATE range
 *   3. full-text MATCH     (AND of terms, substring over a cached haystack)
 *   4. FACET counts        (per field, computed against all OTHER active filters —
 *                           proper faceted search so remaining choices stay visible)
 *   5. SORT
 *   6. PAGINATE
 * Haystacks are cached per (urn,updatedAt) so repeated queries are cheap.
 * Dual export: module.exports (Node) + window.RegistryQuery (browser). */
"use strict";
(function () {
  // Facet dimensions. `get` returns an array of values (multi-valued for sourceType).
  var FACETS = [
    { key: "operation",         label: "Operation",          get: function (ir) { return [ir.operation]; } },
    { key: "threatArea",        label: "Threat area",        get: function (ir) { return [ir.threatArea]; } },
    { key: "status",            label: "Status",             get: function (ir) { return [ir.status]; } },
    { key: "protectiveMarking", label: "Protective marking", get: function (ir) { return [ir.protectiveMarking]; } },
    { key: "confidence",        label: "Confidence",         get: function (ir) { return [ir.confidence]; } },
    { key: "handlingCode",      label: "Handling code",      get: function (ir) { return [(ir.handling && ir.handling.code) || ""]; } },
    { key: "submittedBySelf",   label: "Submitter is author",get: function (ir) { return [ir.submittedBySelf ? "Yes" : "No"]; } },
    { key: "sourceType",        label: "Source / system",    get: function (ir) { return (ir.items || []).map(function (i) { return i.sourceType; }); } }
  ];
  var FACET_BY_KEY = {}; FACETS.forEach(function (f) { FACET_BY_KEY[f.key] = f; });

  function dmyKey(dmy) { var p = String(dmy || "").split("/"); return (p[2] || "") + (p[1] || "") + (p[0] || ""); } // -> YYYYMMDD
  function isoKey(iso) { return String(iso || "").replace(/-/g, ""); }                                            // YYYY-MM-DD -> YYYYMMDD

  function haystack(ir) {
    var pv = (ir.provenance && typeof ir.provenance === "object") ? ir.provenance.text : (typeof ir.provenance === "string" ? ir.provenance : "");
    var ss = ir.sensitiveSource || {};
    var parts = [ir.urn, ir.operation, ir.title, ir.threatArea, ir.status, ir.confidence, ir.protectiveMarking, pv, ss.source, ss.subtype, ss.reference];
    (ir.items || []).forEach(function (i) { parts.push(i.sourceType); parts.push(i.text); });
    var si = ir.structuredIntelligence || {};
    (si.entities || []).forEach(function (e) { parts.push(e.label); });
    return parts.join(" \n ").toLowerCase();
  }
  var _hay = {};
  function hayFor(ir) { var k = ir.urn + "|" + (ir.updatedAt || ""); if (_hay[k] != null) return _hay[k]; var h = haystack(ir); _hay[k] = h; return h; }

  function passText(ir, terms) { if (!terms.length) return true; var h = hayFor(ir); for (var i = 0; i < terms.length; i++) if (h.indexOf(terms[i]) === -1) return false; return true; }
  function passDate(ir, from, to) { if (!from && !to) return true; var k = dmyKey(ir.dateOfCollection); if (from && k < from) return false; if (to && k > to) return false; return true; }
  function passFilters(ir, filters, exceptKey) {
    for (var key in filters) {
      if (!filters.hasOwnProperty(key) || key === exceptKey) continue;
      var sel = filters[key]; if (!sel || !sel.length) continue;
      var f = FACET_BY_KEY[key]; if (!f) continue;
      var vals = f.get(ir), hit = false;
      for (var j = 0; j < vals.length; j++) { if (sel.indexOf(vals[j]) !== -1) { hit = true; break; } }
      if (!hit) return false;
    }
    return true;
  }

  function sortVal(ir, key) {
    if (key === "dateOfCollection") return dmyKey(ir.dateOfCollection);
    if (key === "items") return ("000000" + ((ir.items || []).length)).slice(-6);
    return String(ir[key] == null ? "" : ir[key]).toLowerCase();
  }

  function run(rows, criteria) {
    criteria = criteria || {};
    rows = rows || [];
    var terms = String(criteria.text || "").toLowerCase().split(/\s+/).filter(Boolean);
    var filters = criteria.filters || {};
    var from = isoKey(criteria.dateFrom), to = isoKey(criteria.dateTo);

    function passAll(ir, exceptKey) { return passText(ir, terms) && passDate(ir, from, to) && passFilters(ir, filters, exceptKey); }

    // 1-3: matched set (full predicate) + collect markings for the banner
    var matched = [], mkSet = {};
    rows.forEach(function (ir) { if (passAll(ir, null)) { matched.push(ir); if (ir.protectiveMarking) mkSet[ir.protectiveMarking] = 1; } });

    // 4: facet counts — each facet counted against every OTHER active filter
    var facets = FACETS.map(function (f) {
      var counts = {};
      rows.forEach(function (ir) {
        if (!passAll(ir, f.key)) return;
        var seen = {};
        f.get(ir).forEach(function (v) { if (v == null || v === "" || seen[v]) return; seen[v] = 1; counts[v] = (counts[v] || 0) + 1; });
      });
      var values = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); }).map(function (v) {
        return { value: v, count: counts[v], selected: (filters[f.key] || []).indexOf(v) !== -1 };
      });
      return { key: f.key, label: f.label, values: values };
    });

    // 5: sort
    var sort = criteria.sort || { key: "dateOfCollection", dir: -1 };
    matched.sort(function (a, b) { var av = sortVal(a, sort.key), bv = sortVal(b, sort.key); return av < bv ? -sort.dir : av > bv ? sort.dir : 0; });

    // 6: paginate
    var total = matched.length;
    var pageSize = criteria.pageSize || 50;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    var page = criteria.page || 1; if (page > pages) page = pages; if (page < 1) page = 1;
    var start = (page - 1) * pageSize;
    var pageRows = matched.slice(start, start + pageSize);

    return { rows: pageRows, total: total, page: page, pages: pages, pageSize: pageSize,
             start: total ? start + 1 : 0, end: Math.min(start + pageSize, total),
             facets: facets, markings: Object.keys(mkSet) };
  }

  var api = { FACETS: FACETS, run: run, _haystack: haystack };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryQuery = api; }
})();
