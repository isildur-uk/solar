/* CHART ROOM — mappane.js
 * Leaflet map synced two-way with the chart. Entities with coordinates
 * (locations from the gazetteer; addresses pinned via their parent locality)
 * appear as type-coloured markers. Links whose two endpoints both have
 * coordinates are drawn as curved connection arcs: movement links
 * (TRAVELS_TO / DEPARTS_FROM / JOURNEY_WITH) flow in the direction of travel
 * and fade oldest→newest by date; other spatial links are muted connectors.
 * Basemap tiles are the app's only network dependency and degrade to an
 * offline grid if unreachable; a labels layer fades in when zoomed in.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var map = null;
  var layer = null;        // entity markers
  var arcLayer = null;     // connection / travel arcs (rebuilt with markers)
  var arcRenderer = null;  // dedicated SVG so arcs sit beneath markers
  var labels = null;       // place-label tiles, faded in by zoom
  var overlay = null;      // analysis drawings (measure/radius) — survives rebuild()
  var store = null;
  var markers = {}; // entityId -> marker
  var selectedId = null;
  var onSelectCb = null;
  var arrowDefsDone = false;

  var TYPE_COLOUR = {
    location: "#5fc4c0", address: "#9aa5b1", person: "#6ea8d8",
    organisation: "#d8a16e", event: "#e0995e"
  };

  var MOVE_TYPES = { TRAVELS_TO: 1, DEPARTS_FROM: 1, JOURNEY_WITH: 1 };
  var MOVE_COLOUR = "#8fe0db";  // bright teal for travel
  var ASSOC_COLOUR = "#4d7370"; // muted connector

  function coordsFor(e) {
    if (e.geo && typeof e.geo.lat === "number") return [e.geo.lat, e.geo.lon];
    if (e.attrs && typeof e.attrs.lat === "number") return [e.attrs.lat, e.attrs.lon];
    // address: pin at parent locality if known
    if (e.type === "address" && e.attrs && e.attrs.locality && window.CRGeo) {
      var g = window.CRGeo.lookup(e.attrs.locality);
      if (g) return [g.lat + 0.012, g.lon + 0.012]; // slight offset from city dot
    }
    return null;
  }

  // Quadratic-bezier sample between two [lat,lon] points, bowed perpendicular
  // to the chord so overlapping routes stay legible. Returns [lat,lon] pairs.
  function arcPoints(a, b) {
    var dLat = b[0] - a[0], dLon = b[1] - a[1];
    var dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist < 1e-6) return [a, b];
    var curve = Math.max(0.05, Math.min(dist * 0.15, 8)); // gentle bow, capped
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var c = [mid[0] + (-dLon / dist) * curve, mid[1] + (dLat / dist) * curve];
    var pts = [], N = 24;
    for (var i = 0; i <= N; i++) {
      var t = i / N, u = 1 - t;
      pts.push([
        u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]
      ]);
    }
    return pts;
  }

  // Inject two auto-orienting arrowhead markers into the arc SVG's <defs>, once.
  function ensureArrowDefs(pathEl) {
    if (arrowDefsDone || !pathEl) return;
    var svg = pathEl.ownerSVGElement;
    if (!svg) return;
    var NS = "http://www.w3.org/2000/svg";
    var defs = svg.querySelector("defs");
    if (!defs) { defs = document.createElementNS(NS, "defs"); svg.insertBefore(defs, svg.firstChild); }
    [["cr-arrow-move", MOVE_COLOUR], ["cr-arrow-assoc", ASSOC_COLOUR]].forEach(function (m) {
      var mk = document.createElementNS(NS, "marker");
      mk.setAttribute("id", m[0]);
      mk.setAttribute("viewBox", "0 0 10 10");
      mk.setAttribute("refX", "8"); mk.setAttribute("refY", "5");
      mk.setAttribute("markerWidth", "7"); mk.setAttribute("markerHeight", "7");
      mk.setAttribute("markerUnits", "userSpaceOnUse");
      mk.setAttribute("orient", "auto");
      var tri = document.createElementNS(NS, "path");
      tri.setAttribute("d", "M0,0 L10,5 L0,10 z");
      tri.setAttribute("fill", m[1]);
      mk.appendChild(tri); defs.appendChild(mk);
    });
    arrowDefsDone = true;
  }

  function drawArcs(coords) {
    if (!arcLayer) return;
    arcLayer.clearLayers();
    var links = store.links || [];
    if (!links.length) return;

    // recency scale over dated movement links
    var times = [];
    links.forEach(function (l) { if (l.dateISO) { var t = Date.parse(l.dateISO); if (!isNaN(t)) times.push(t); } });
    var tMin = times.length ? Math.min.apply(null, times) : 0;
    var tMax = times.length ? Math.max.apply(null, times) : 0;
    function recency(l) {
      if (!l.dateISO || tMax === tMin) return 0.62;
      var t = Date.parse(l.dateISO);
      if (isNaN(t)) return 0.62;
      return 0.35 + 0.6 * ((t - tMin) / (tMax - tMin)); // oldest .35 → newest .95
    }

    links.forEach(function (l) {
      var from = coords[l.from], to = coords[l.to];
      if (!from || !to) return;
      var isMove = !!MOVE_TYPES[l.type];
      var dir = l.direction || "->";
      var a = from, b = to;
      if (dir === "<-") { a = to; b = from; } // draw so flow + arrow reach the source
      var line = L.polyline(arcPoints(a, b), {
        renderer: arcRenderer,
        color: isMove ? MOVE_COLOUR : ASSOC_COLOUR,
        weight: isMove ? 2 : 1.5,
        opacity: isMove ? recency(l) : 0.4,
        interactive: false,
        className: isMove ? "cr-arc cr-arc-move" : "cr-arc"
      });
      line.addTo(arcLayer);
      var el = line._path;
      if (el) {
        ensureArrowDefs(el);
        if (dir !== "<>") el.setAttribute("marker-end", "url(#" + (isMove ? "cr-arrow-move" : "cr-arrow-assoc") + ")");
      }
    });
  }

  function rebuild() {
    if (!map) return;
    layer.clearLayers();
    markers = {};
    var pts = [];
    var coords = {}; // entityId -> [lat,lon], for arc endpoints
    store.entities.forEach(function (e) {
      var c = coordsFor(e);
      if (!c) return;
      coords[e.id] = c;
      var col = TYPE_COLOUR[e.type] || "#8593a3";
      var sel = e.id === selectedId;
      var mk = L.circleMarker(c, {
        radius: sel ? 9 : 6,
        color: sel ? "#8ea2ff" : col,
        weight: 2,
        fillColor: "#0f1620",
        fillOpacity: 0.9,
        className: sel ? "cr-marker-sel" : ""
      });
      var kind = e.attrs && e.attrs.kind ? " (" + U.esc(e.attrs.kind) + ")" : "";
      mk.bindPopup("<b>" + U.esc(e.label) + "</b>" + kind +
        (e.attrs && e.attrs.iata ? "<br>IATA " + U.esc(e.attrs.iata) : "") +
        (e.attrs && e.attrs.cc ? "<br>" + U.esc(e.attrs.cc) : ""));
      mk.bindTooltip(U.esc(e.label), { direction: "top", offset: [0, -6], className: "cr-tip", opacity: 1 });
      mk.on("click", function () { if (onSelectCb) onSelectCb(e.id); });
      mk.addTo(layer);
      markers[e.id] = mk;
      pts.push(c);
    });
    drawArcs(coords);
    return pts;
  }

  function init(elId, caseStore, onSelect) {
    store = caseStore;
    onSelectCb = onSelect;
    map = L.map(elId, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 140,
      center: [45, 0],
      zoom: 3
    });
    var tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19
    });
    var failures = 0;
    tiles.on("tileerror", function () {
      failures++;
      if (failures > 6) {
        document.getElementById("map-pane").classList.add("offline");
      }
    });
    tiles.on("tileload", function () {
      failures = 0;
      document.getElementById("map-pane").classList.remove("offline");
    });
    tiles.addTo(map);

    // Place labels: fade in only when zoomed in, so the wide view stays clean.
    labels = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19, opacity: 0, className: "cr-label-tiles"
    }).addTo(map);
    function updateLabels() {
      var z = map.getZoom();
      var o = z < 9 ? 0 : z >= 12 ? 0.85 : ((z - 9) / 3) * 0.85;
      labels.setOpacity(o);
    }
    map.on("zoomend", updateLabels);

    arcRenderer = L.svg().addTo(map);       // arcs render beneath markers
    arcLayer = L.layerGroup().addTo(map);
    layer = L.layerGroup().addTo(map);      // markers on top of arcs
    overlay = L.layerGroup().addTo(map);    // analysis tools on top

    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

    store.onChange(function () { rebuild(); });
    rebuild();
    updateLabels();
  }

  function selectEntity(id) {
    selectedId = id;
    rebuild();
    var mk = markers[id];
    if (mk) {
      map.panTo(mk.getLatLng(), { animate: true }); // pan only — no zoom change
      mk.openPopup();
    }
  }

  function clearSelection() {
    selectedId = null;
    rebuild();
  }

  function fitToData() {
    var pts = [];
    Object.keys(markers).forEach(function (k) { pts.push(markers[k].getLatLng()); });
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25));
  }

  function invalidate() { if (map) setTimeout(function () { map.invalidateSize(); }, 60); }

  function getMap() { return map; }
  function getOverlay() { return overlay; }
  function clearOverlay() { if (overlay) overlay.clearLayers(); }
  function getMarkerLatLng(id) { return markers[id] ? markers[id].getLatLng() : null; }
  function getStore() { return store; }

  window.CRMapPane = {
    init: init, rebuild: rebuild, selectEntity: selectEntity,
    clearSelection: clearSelection, fitToData: fitToData, invalidate: invalidate,
    getMap: getMap, getOverlay: getOverlay, clearOverlay: clearOverlay,
    getMarkerLatLng: getMarkerLatLng, getStore: getStore
  };
})();
