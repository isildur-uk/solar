/* CHART ROOM — mappane.js
 * Leaflet map synced two-way with the chart. Entities with coordinates
 * (locations from the gazetteer; addresses pinned via their parent locality)
 * appear as type-coloured markers. Basemap tiles are the app's only network
 * dependency and degrade to an offline grid if unreachable.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var map = null;
  var layer = null;
  var store = null;
  var markers = {}; // entityId -> marker
  var overlay = null; // analysis drawings (measure/radius) — survives rebuild()
  var selectedId = null;
  var onSelectCb = null;

  var TYPE_COLOUR = {
    location: "#5fc4c0", address: "#9aa5b1", person: "#6ea8d8",
    organisation: "#d8a16e", event: "#e0995e"
  };

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

  function rebuild() {
    if (!map) return;
    layer.clearLayers();
    markers = {};
    var pts = [];
    store.entities.forEach(function (e) {
      var c = coordsFor(e);
      if (!c) return;
      var col = TYPE_COLOUR[e.type] || "#8593a3";
      var mk = L.circleMarker(c, {
        radius: e.id === selectedId ? 9 : 6,
        color: e.id === selectedId ? "#e8b34b" : col,
        weight: 2,
        fillColor: "#0f1620",
        fillOpacity: 0.9
      });
      var kind = e.attrs && e.attrs.kind ? " (" + U.esc(e.attrs.kind) + ")" : "";
      mk.bindPopup("<b>" + U.esc(e.label) + "</b>" + kind +
        (e.attrs && e.attrs.iata ? "<br>IATA " + U.esc(e.attrs.iata) : "") +
        (e.attrs && e.attrs.cc ? "<br>" + U.esc(e.attrs.cc) : ""));
      mk.on("click", function () { if (onSelectCb) onSelectCb(e.id); });
      mk.addTo(layer);
      markers[e.id] = mk;
      pts.push(c);
    });
    return pts;
  }

  function init(elId, caseStore, onSelect) {
    store = caseStore;
    onSelectCb = onSelect;
    map = L.map(elId, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
      center: [45, 0],
      zoom: 3
    });
    var tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 18
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
    layer = L.layerGroup().addTo(map);
    overlay = L.layerGroup().addTo(map);
    store.onChange(function () { rebuild(); });
    rebuild();
  }

  function selectEntity(id) {
    selectedId = id;
    rebuild();
    var mk = markers[id];
    if (mk) {
      map.panTo(mk.getLatLng(), { animate: true });
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
