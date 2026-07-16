/* SOLAR — chartbar.js
 * A small, always-visible layout switcher pinned to the chart canvas, so the
 * common "arrange" options aren't buried in the Tools menu. Segmented control:
 * Force · Grid · Circle · Grouped · Tree. Drives CRGraph.applyLayout and
 * reflects the active preset. Sits only on the charting surface (its host,
 * #chart-wrap, exists nowhere else).
 */
(function () {
  "use strict";
  var LAYOUTS = [
    { k: "organic",   label: "Force",   tip: "Live force layout — nodes self-arrange by attraction/repulsion" },
    { k: "grid",      label: "Grid",    tip: "Snap onto a regular grid; dragged nodes snap to it" },
    { k: "circle",    label: "Circle",  tip: "Arrange all nodes evenly around a circle" },
    { k: "grouped",   label: "Grouped", tip: "Cluster nodes by entity type" },
    { k: "hierarchy", label: "Tree",    tip: "Top-down tidy tree (org-chart) with square, chessboard connectors" }
  ];

  function setActive(k) {
    var bar = document.getElementById("chart-layoutbar");
    if (!bar) return;
    Array.prototype.slice.call(bar.querySelectorAll(".clb-btn")).forEach(function (b) {
      var on = b.getAttribute("data-layout") === k;
      b.classList.toggle("clb-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function init() {
    var wrap = document.getElementById("chart-wrap");
    if (!wrap || document.getElementById("chart-layoutbar")) return;

    var bar = document.createElement("div");
    bar.id = "chart-layoutbar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "chart layout");

    var lead = document.createElement("span");
    lead.className = "clb-lead";
    lead.textContent = "Layout";
    bar.appendChild(lead);

    LAYOUTS.forEach(function (L) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "clb-btn";
      b.textContent = L.label;
      b.title = L.tip;
      b.setAttribute("data-layout", L.k);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        var g = window.CRGraph;
        if (g && g.applyLayout) { g.applyLayout(L.k); }
        setActive(L.k);
      });
      bar.appendChild(b);
    });

    wrap.appendChild(bar);
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); }
  else { init(); }
})();
