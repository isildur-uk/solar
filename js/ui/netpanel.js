/* SOLAR — netpanel.js
 * Analyst tools layered on the existing views via public APIs (no edits to
 * graph.js): Find the connection (shortest path), Key players (centrality),
 * and Map measure + radius proximity. Engine maths live in core/netanalysis.js;
 * this file is wiring + DOM only. All analyst text rendered via CRUtil.esc().
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  function N() { return window.CRNet; }
  function store() {
    return (window.CRGraph && window.CRGraph.getStore && window.CRGraph.getStore()) ||
           (window.CRMapPane && window.CRMapPane.getStore && window.CRMapPane.getStore()) || null;
  }
  function status(m) { if (window.CRApp && window.CRApp.status) window.CRApp.status(m); }
  function labelOf(id) { var s = store(), e = s && s.getEntity(id); return e ? e.label : id; }

  function clearAnalysis() {
    if (window.CRGraph && window.CRGraph.highlight) window.CRGraph.highlight(null);
    if (window.CRMapPane && window.CRMapPane.clearOverlay) window.CRMapPane.clearOverlay();
  }

  /* ---------------- Find the connection ---------------- */
  var pickMode = false, pendingFrom = null, selectHooked = false;

  function hookSelect() {
    if (selectHooked || !window.CRGraph || !window.CRGraph.getNetwork) return;
    var net = window.CRGraph.getNetwork();
    if (!net) return;
    net.on("selectNode", function (p) {
      if (!pickMode || !p.nodes || !p.nodes.length) return;
      var node = p.nodes[0];
      if (!pendingFrom) {
        pendingFrom = node;
        status("Path: first = " + truncate(labelOf(node)) + " — now tap the second entity");
      } else {
        var path = N().shortestPath(store(), pendingFrom, node);
        if (!path) {
          status("No connection found between " + truncate(labelOf(pendingFrom)) + " and " + truncate(labelOf(node)));
        } else {
          window.CRGraph.highlight(path);
          status("Path (" + (path.length - 1) + " hop" + (path.length === 2 ? "" : "s") + "): " +
                 path.map(function (i) { return labelOf(i); }).join("  →  "));
        }
        pickMode = false; pendingFrom = null;
        setActive("btn-path", false);
      }
    });
    selectHooked = true;
  }

  function truncate(s) { s = String(s); return s.length > 22 ? s.slice(0, 21) + "…" : s; }

  function startPath() {
    if (pickMode) { pickMode = false; pendingFrom = null; setActive("btn-path", false); status("Path picker off"); return; }
    clearAnalysis();
    hookSelect();
    if (!selectHooked) { status("Chart not ready"); return; }
    pickMode = true; pendingFrom = null;
    setActive("btn-path", true);
    status("Find the connection: tap the first entity, then the second");
  }

  /* ---------------- Key players ---------------- */

  function openPlayers() {
    var s = store();
    if (!s || !s.entities.length) { status("No entities to analyse"); return; }
    var deg = N().degreeCentrality(s).slice(0, 10);
    var bet = N().betweenness(s).slice(0, 10);
    var veil = ensurePlayersModal();
    function col(title, rows, fmt) {
      var h = '<div class="kp-col"><div class="kp-h">' + U.esc(title) + '</div>';
      rows.forEach(function (r, i) {
        if (r.score <= 0 && i > 0) return;
        h += '<button type="button" class="kp-row" data-id="' + U.escAttr(r.id) + '">' +
             '<span class="kp-rank">' + (i + 1) + '</span>' +
             '<span class="kp-lbl">' + U.esc(labelOf(r.id)) + '</span>' +
             '<span class="kp-score">' + fmt(r.score) + '</span></button>';
      });
      return h + '</div>';
    }
    veil.querySelector("#kp-body").innerHTML =
      col("By connections (degree)", deg, function (v) { return String(v); }) +
      col("By brokerage (betweenness)", bet, function (v) { return v.toFixed(1); });
    veil.querySelectorAll(".kp-row").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id");
        U.closeModal("players-veil");
        if (window.CRApp && window.CRApp.selectEntity) window.CRApp.selectEntity(id);
        else if (window.CRGraph) { if (window.CRGraph.select) window.CRGraph.select(id); if (window.CRGraph.focus) window.CRGraph.focus(id); }
      });
    });
    U.openModal("players-veil");
    // glow the top 5 brokers on the chart behind the modal
    if (window.CRGraph && window.CRGraph.highlight) {
      var brokers = bet.slice(0, 5).filter(function (r) { return r.score > 0; }).map(function (r) { return r.id; });
      window.CRGraph.highlight(brokers.length ? brokers : null);
    }
  }

  function ensurePlayersModal() {
    var v = document.getElementById("players-veil");
    if (v) return v;
    v = document.createElement("div");
    v.className = "modal-veil"; v.id = "players-veil";
    v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); v.setAttribute("aria-label", "key players");
    v.innerHTML =
      '<div class="modal narrow"><div class="modal-head"><h2>Key players</h2>' +
      '<button class="btn x" id="kp-close" aria-label="close">✕</button></div>' +
      '<div class="modal-body"><p class="kp-note">Most central entities in the network. ' +
      '<b>Degree</b> = number of direct connections. <b>Betweenness</b> = how often an entity sits on the ' +
      'shortest path between others (a broker / cut-out). Tap to focus on the chart.</p>' +
      '<div id="kp-body" class="kp-grid"></div></div>' +
      '<div class="modal-foot"><span class="note">Top brokers are glowing on the chart.</span>' +
      '<div class="right"><button class="btn" id="kp-clear">Clear highlight</button></div></div></div>';
    document.body.appendChild(v);
    v.querySelector("#kp-close").addEventListener("click", function () { U.closeModal("players-veil"); });
    v.querySelector("#kp-clear").addEventListener("click", function () { clearAnalysis(); U.closeModal("players-veil"); status("Highlight cleared"); });
    return v;
  }

  /* ---------------- Map: measure + radius ---------------- */
  var measureMode = false, measureA = null, mapClickHooked = false, mapHandler = null;

  function startMeasure() {
    var map = window.CRMapPane && window.CRMapPane.getMap && window.CRMapPane.getMap();
    if (!map) { status("Map not ready"); return; }
    measureMode = !measureMode;
    setActive("btn-measure", measureMode);
    if (!measureMode) { measureA = null; status("Measure off"); return; }
    window.CRMapPane.clearOverlay();
    measureA = null;
    status("Measure: tap two points on the map");
    if (!mapClickHooked) {
      mapHandler = function (e) {
        if (!measureMode) return;
        var ov = window.CRMapPane.getOverlay();
        L.circleMarker(e.latlng, { radius: 4, color: "#e8b34b", weight: 2, fillColor: "#0f1620", fillOpacity: 1 }).addTo(ov);
        if (!measureA) { measureA = e.latlng; return; }
        var b = e.latlng;
        var km = N().haversineKm(measureA.lat, measureA.lng, b.lat, b.lng);
        var brg = N().bearingDeg(measureA.lat, measureA.lng, b.lat, b.lng);
        L.polyline([measureA, b], { color: "#e8b34b", weight: 2, dashArray: "5,5" }).addTo(ov);
        var mid = L.latLng((measureA.lat + b.lat) / 2, (measureA.lng + b.lng) / 2);
        L.popup({ closeButton: false, autoClose: false })
          .setLatLng(mid)
          .setContent(km.toFixed(2) + " km · " + Math.round(brg) + "° " + N().compass(brg))
          .openOn(window.CRMapPane.getMap());
        status("Distance " + km.toFixed(2) + " km, bearing " + Math.round(brg) + "° " + N().compass(brg));
        measureA = null;
      };
      window.CRMapPane.getMap().on("click", mapHandler);
      mapClickHooked = true;
    }
  }

  function startRadius() {
    var s = store(), map = window.CRMapPane && window.CRMapPane.getMap && window.CRMapPane.getMap();
    if (!s || !map) { status("Map not ready"); return; }
    var centre = null, centreLabel = "map centre";
    var selId = window.CRApp && window.CRApp.getSelectedEntityId && window.CRApp.getSelectedEntityId();
    if (selId) {
      var c = N().coordsOf(s.getEntity(selId) || {});
      if (c) { centre = c; centreLabel = labelOf(selId); }
    }
    if (!centre) { var ctr = map.getCenter(); centre = [ctr.lat, ctr.lng]; }
    var ans = window.prompt("Radius in km around " + centreLabel + ":", "5");
    if (ans == null) return;
    var km = parseFloat(ans);
    if (!(km > 0)) { status("Enter a positive radius"); return; }
    window.CRMapPane.clearOverlay();
    var ov = window.CRMapPane.getOverlay();
    L.circle(centre, { radius: km * 1000, color: "#e8b34b", weight: 1.5, fillColor: "#e8b34b", fillOpacity: 0.06 }).addTo(ov);
    var hits = N().entitiesWithin(s, centre[0], centre[1], km);
    if (window.CRGraph && window.CRGraph.highlight) window.CRGraph.highlight(hits.length ? hits.map(function (h) { return h.id; }) : null);
    map.setView(centre, map.getZoom());
    status(hits.length + " entit" + (hits.length === 1 ? "y" : "ies") + " within " + km + " km of " + centreLabel);
  }

  /* ---------------- chrome ---------------- */

  function setActive(id, on) { var b = document.getElementById(id); if (b) b.classList.toggle("active", !!on); }

  function mkBtn(id, label, title, fn) {
    var b = document.createElement("button");
    b.className = "btn"; b.id = id; b.type = "button"; b.textContent = label; b.title = title;
    b.addEventListener("click", fn);
    return b;
  }

  function init() {
    var tools = document.getElementById("chart-tools");
    if (tools) {
      tools.appendChild(mkBtn("btn-path", "Path", "Find the shortest connection between two entities", startPath));
      tools.appendChild(mkBtn("btn-players", "Key players", "Rank the most central / broker entities", openPlayers));
    }
    var mapPane = document.getElementById("map-pane");
    if (mapPane) {
      var box = document.createElement("div");
      box.id = "map-tools";
      box.appendChild(mkBtn("btn-measure", "Measure", "Tap two points to measure distance & bearing", startMeasure));
      box.appendChild(mkBtn("btn-radius", "Radius", "Find entities within N km of a point", startRadius));
      mapPane.appendChild(box);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && (pickMode || measureMode)) {
        pickMode = false; pendingFrom = null; measureMode = false; measureA = null;
        setActive("btn-path", false); setActive("btn-measure", false);
        clearAnalysis(); status("Analysis cleared");
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.CRNetPanel = { startPath: startPath, openPlayers: openPlayers, startMeasure: startMeasure, startRadius: startRadius, clear: clearAnalysis };
})();
