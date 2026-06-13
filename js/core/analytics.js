/* SOLAR — analytics.js
 * Case-level aggregations for the Analytics view. Dependency-free, Node-testable.
 * Pure data only — rendering (NYT-discipline SVG) lives in js/ui/analytics.js.
 */
(function () {
  "use strict";

  function getTypes() {
    return (typeof window !== "undefined" && window.CRModel && window.CRModel.ENTITY_TYPES) ||
           (typeof require === "function" ? require("./model.js").ENTITY_TYPES : {});
  }

  // Entity count by type, descending. Carries the type's label + colour.
  function entityTypeMix(store) {
    var T = getTypes(), counts = {};
    (store.entities || []).forEach(function (e) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return Object.keys(counts).map(function (t) {
      var def = T[t] || {};
      return { type: t, label: def.label || t, colour: def.colour || "#8593a3", count: counts[t] };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  // Link count by relationship type, descending.
  function linkTypeMix(store) {
    var counts = {};
    (store.links || []).forEach(function (l) {
      counts[l.type] = (counts[l.type] || 0) + 1;
    });
    return Object.keys(counts).map(function (t) {
      return { type: t, count: counts[t] };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  // Month string YYYY-MM from an ISO-ish date, else null.
  function monthOf(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})/);
    return m ? (m[1] + "-" + m[2]) : null;
  }

  // Activity over time: dated links + dated events, bucketed by month, gap-filled
  // so the time axis is continuous (no phantom compression between sparse months).
  function activityOverTime(store) {
    var buckets = {};
    (store.links || []).forEach(function (l) {
      var mth = monthOf(l.dateISO);
      if (mth) buckets[mth] = (buckets[mth] || 0) + 1;
    });
    (store.events || []).forEach(function (ev) {
      var mth = monthOf(ev.dateISO || ev.date);
      if (mth) buckets[mth] = (buckets[mth] || 0) + 1;
    });
    var months = Object.keys(buckets).sort();
    if (!months.length) return [];
    var out = [], cur = months[0], end = months[months.length - 1], guard = 0;
    while (cur <= end && guard++ < 1200) {
      out.push({ month: cur, count: buckets[cur] || 0 });
      cur = nextMonth(cur);
    }
    return out;
  }

  function nextMonth(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    if (m === 12) return (y + 1) + "-01";
    return y + "-" + String(m + 1).padStart(2, "0");
  }

  // Top brokers by betweenness (needs netanalysis). Labels resolved from store.
  function topBrokers(store, n) {
    var N = (typeof window !== "undefined" && window.CRNet) ||
            (typeof require === "function" ? require("./netanalysis.js") : null);
    if (!N) return [];
    return N.betweenness(store).filter(function (b) { return b.score > 0; })
      .slice(0, n || 8)
      .map(function (b) {
        var e = store.getEntity ? store.getEntity(b.id) : null;
        return { id: b.id, label: e ? e.label : b.id, score: b.score };
      });
  }

  function summary(store) {
    var located = 0, dated = 0;
    (store.entities || []).forEach(function (e) {
      if (e.geo && typeof e.geo.lat === "number") located++;
    });
    (store.links || []).forEach(function (l) { if (l.dateISO) dated++; });
    return {
      entities: (store.entities || []).length,
      links: (store.links || []).length,
      events: (store.events || []).length,
      located: located,
      datedLinks: dated
    };
  }

  // Index of the peak month for in-place annotation (NYT discipline).
  function peakIndex(series) {
    var idx = -1, max = -1;
    series.forEach(function (p, i) { if (p.count > max) { max = p.count; idx = i; } });
    return idx;
  }

  var CRAnalytics = {
    entityTypeMix: entityTypeMix,
    linkTypeMix: linkTypeMix,
    activityOverTime: activityOverTime,
    topBrokers: topBrokers,
    summary: summary,
    peakIndex: peakIndex
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRAnalytics;
  if (typeof window !== "undefined") window.CRAnalytics = CRAnalytics;
})();
