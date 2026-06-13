/* CHART ROOM — legend.js
 * Gotham/i2-style legend + filter panel: entity types, link types,
 * confidence tiers and source documents with live counts. Click a row to
 * filter it out of the chart (click again to bring it back). Colour links
 * by confidence (default), by type, or by source document.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var store = null;
  var open = false;
  var hidden = { entityTypes: {}, linkTypes: {}, confidence: {}, sources: {} };
  var colorMode = "confidence";

  function panel() { return U.el("legend-panel"); }

  function srcLabel(s) {
    // "Text extract 2026-06-12 14:11 — 04_Experian_Report.pdf" → the filename end wins
    var m = /—\s*(.+)$/.exec(s);
    return U.truncate(m ? m[1] : s, 30);
  }

  function row(group, key, label, count, swatch) {
    var off = hidden[group][key] ? " off" : "";
    return '<div class="lg-row' + off + '" data-g="' + U.escAttr(group) + '" data-k="' + U.escAttr(key) + '" ' +
      'role="checkbox" aria-checked="' + (!hidden[group][key]) + '" tabindex="0">' +
      (swatch ? '<span class="lg-swatch" style="background:' + swatch + '"></span>' : '') +
      '<span class="lg-label">' + U.esc(label) + '</span>' +
      '<span class="lg-count">' + count + '</span></div>';
  }

  function refresh() {
    var box = panel();
    if (!box || !open || !window.CRGraph) return;
    var f = window.CRGraph.getFacets();
    var ET = window.CRModel.ENTITY_TYPES;
    var html = '<div class="lg-head">Legend &amp; filters' +
      '<button class="btn lg-reset" id="lg-reset" title="Show everything">Reset</button></div>';

    html += '<div class="lg-sec">Colour links by</div><div class="lg-modes">';
    [["confidence", "Confidence"], ["type", "Type"], ["source", "Source"]].forEach(function (m) {
      html += '<button class="btn lg-mode' + (colorMode === m[0] ? " on" : "") + '" data-mode="' + m[0] + '">' + m[1] + '</button>';
    });
    html += '</div>';

    html += '<div class="lg-sec">Entities</div>';
    Object.keys(f.entityTypes).sort().forEach(function (t) {
      var T = ET[t] || { label: t, colour: "#8593a3" };
      html += row("entityTypes", t, T.label, f.entityTypes[t], T.colour);
    });

    html += '<div class="lg-sec">Links</div>';
    Object.keys(f.linkTypes).sort().forEach(function (t) {
      html += row("linkTypes", t, t.replace(/_/g, " ").toLowerCase(), f.linkTypes[t], null);
    });

    html += '<div class="lg-sec">Confidence</div>';
    ["high", "med", "low"].forEach(function (c) {
      if (f.confidence[c]) html += row("confidence", c, c, f.confidence[c], null);
    });

    var srcs = Object.keys(f.sources);
    if (srcs.length > 1 || (srcs.length === 1 && srcs[0] !== "manual")) {
      html += '<div class="lg-sec">Sources</div>';
      srcs.sort().forEach(function (s) {
        html += row("sources", s, srcLabel(s), f.sources[s], null);
      });
    }

    var hiddenEnts = window.CRGraph.hiddenEntities();
    if (hiddenEnts.length) {
      html += '<div class="lg-sec">Hidden entities</div>';
      hiddenEnts.forEach(function (he) {
        html += '<div class="lg-row off lg-unhide" data-id="' + U.escAttr(he.id) + '" role="button" tabindex="0" ' +
          'title="Click to bring back">' +
          '<span class="lg-label">' + U.esc(U.truncate(he.label, 26)) + '</span>' +
          '<span class="lg-count">show</span></div>';
      });
    }

    box.innerHTML = html;

    box.querySelectorAll(".lg-unhide").forEach(function (n) {
      n.addEventListener("click", function () {
        window.CRGraph.unhideEntity(n.getAttribute("data-id"));
      });
    });

    box.querySelectorAll(".lg-row").forEach(function (n) {
      if (!n.getAttribute("data-g")) return;     // unhide rows have their own handler
      function toggle() {
        var g = n.getAttribute("data-g"), k = n.getAttribute("data-k");
        hidden[g][k] = !hidden[g][k];
        if (!hidden[g][k]) delete hidden[g][k];
        window.CRGraph.setFilter(g, k, !!hidden[g][k]);
      }
      n.addEventListener("click", toggle);
      n.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
    box.querySelectorAll(".lg-mode").forEach(function (n) {
      n.addEventListener("click", function () {
        colorMode = n.getAttribute("data-mode");
        window.CRGraph.setColorMode(colorMode);
      });
    });
    var reset = U.el("lg-reset");
    if (reset) reset.addEventListener("click", function () {
      hidden = { entityTypes: {}, linkTypes: {}, confidence: {}, sources: {} };
      window.CRGraph.clearFilters();
    });
  }

  function toggle() {
    open = !open;
    var box = panel();
    if (box) box.classList.toggle("open", open);
    var btn = U.el("btn-legend");
    if (btn) btn.classList.toggle("active", open);
    if (open) refresh();
  }

  function init(caseStore) {
    store = caseStore;
    store.onChange(function () { if (open) refresh(); });
    var btn = U.el("btn-legend");
    if (btn) btn.addEventListener("click", toggle);
  }

  window.CRLegend = { init: init, refresh: refresh, toggle: toggle };
})();
