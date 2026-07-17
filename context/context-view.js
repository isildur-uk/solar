/* ============================================================
   SOLAR — Context view (strategic threat-area maps)
   A fourth surface, sibling to Charting / Analyse / Database.
   Renders public-source threat CONTEXT — drug/migration flows,
   hawala & illicit-finance corridors, UK county lines / OCG — as
   toggleable Leaflet layers around a case. Contextual knowledge
   only: NO grading, no case mutation, read-only.

   Data: window.SolarContextData (vendored, offline JS global).
   Basemap: same dark CARTO tiles as the Charting map pane, with the
   same graceful offline degradation. All analyst-facing strings are
   escaped; identifiers render in mono. Namespaced window.SolarContextView.
   ============================================================ */
(function () {
  "use strict";

  var mounted = false;
  var map = null, groupLayers = {}, state = {};
  var UK = [51.5074, -0.1278];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function hue(g) { return "var(" + (g.hue || "--accent") + ")"; }
  // resolve a CSS custom property to a concrete colour (Leaflet needs a real value)
  function resolveHue(g) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(g.hue || "--accent");
      return (v && v.trim()) || "#8ea2ff";
    } catch (e) { return "#8ea2ff"; }
  }
  function reduceMotion() {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  /* ---- map bootstrap (mirrors js/ui/mappane.js: dark CARTO + offline) ---- */
  function buildMap(mapEl, offlineEl) {
    var m = L.map(mapEl, {
      zoomControl: true, attributionControl: true,
      worldCopyJump: true, minZoom: 2
    }).setView([30, 8], 3);

    var tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 19
    });
    tiles.on("tileerror", function () { if (offlineEl) { offlineEl.classList.add("show"); } });
    tiles.on("load", function () { if (offlineEl) { offlineEl.classList.remove("show"); } });
    tiles.addTo(m);

    var labels = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19, opacity: 0.85, className: "ctx-label-tiles"
    });
    labels.addTo(m);

    // a subtle UK anchor pin — every corridor here converges on the UK
    L.circleMarker(UK, { radius: 5, color: "#8ea2ff", weight: 2, fillColor: "#8ea2ff", fillOpacity: 0.9 })
      .bindTooltip("United Kingdom", { direction: "top" }).addTo(m);
    return m;
  }

  function weightFor(inten) { return 1.4 + (Math.max(1, Math.min(5, inten || 3)) - 1) * 0.9; }
  function opacityFor(inten) { return 0.45 + (Math.max(1, Math.min(5, inten || 3)) - 1) * 0.11; }

  /* ---- build one group's Leaflet layer (corridors + nodes) ---- */
  function buildGroupLayer(g) {
    var colour = resolveHue(g);
    var lg = L.layerGroup();
    var animate = !reduceMotion();

    (g.corridors || []).forEach(function (c) {
      if (!c.coords || c.coords.length < 2) { return; }
      var line = L.polyline(c.coords, {
        color: colour, weight: weightFor(c.intensity), opacity: opacityFor(c.intensity),
        lineCap: "round", lineJoin: "round",
        dashArray: animate ? "1 10" : null, className: animate ? "ctx-flow" : ""
      });
      line.bindPopup(corridorPopup(g, c), { className: "ctx-popup", maxWidth: 300 });
      line.bindTooltip(esc(c.name), { sticky: true });
      lg.addLayer(line);
      // directional dot at the destination end (last coord) — flow direction
      var end = c.coords[c.coords.length - 1];
      lg.addLayer(L.circleMarker(end, { radius: 2.5, color: colour, weight: 0, fillColor: colour, fillOpacity: 0.85 }));
    });

    (g.nodes || []).forEach(function (n) {
      if (typeof n.lat !== "number" || typeof n.lon !== "number") { return; }
      var r = n.riskScore ? 4 + Math.round(n.riskScore / 25) : 5;
      var mk = L.circleMarker([n.lat, n.lon], {
        radius: r, color: colour, weight: 1.5, fillColor: colour, fillOpacity: 0.28
      });
      mk.bindPopup(nodePopup(g, n), { className: "ctx-popup", maxWidth: 300 });
      mk.bindTooltip(esc(n.name), { direction: "top" });
      lg.addLayer(mk);
    });
    return lg;
  }

  function metaLine(g) {
    return '<div class="ctx-pop-src">' + esc(g.source || g.name) + "</div>";
  }
  function corridorPopup(g, c) {
    var h = '<div class="ctx-pop">';
    h += '<div class="ctx-pop-h"><span class="ctx-dot" style="background:' + hue(g) + '"></span>' + esc(c.name) + "</div>";
    h += '<div class="ctx-pop-tags"><span class="ctx-chip">' + esc(c.label || "flow") + "</span>";
    h += '<span class="ctx-chip">intensity ' + esc(String(c.intensity || "–")) + "/5</span>";
    if (c.vol) { h += '<span class="ctx-chip mono">' + esc(c.vol) + "</span>"; }
    h += "</div>";
    if (c.note) { h += '<p class="ctx-pop-note">' + esc(c.note) + "</p>"; }
    h += metaLine(g) + "</div>";
    return h;
  }
  function nodePopup(g, n) {
    var h = '<div class="ctx-pop">';
    h += '<div class="ctx-pop-h"><span class="ctx-dot" style="background:' + hue(g) + '"></span>' + esc(n.name) + "</div>";
    h += '<div class="ctx-pop-tags"><span class="ctx-chip">' + esc(n.kind || "node") + "</span>";
    if (n.commodity) { h += '<span class="ctx-chip">' + esc(n.commodity) + "</span>"; }
    if (typeof n.riskScore === "number") { h += '<span class="ctx-chip mono">risk ' + esc(String(n.riskScore)) + "</span>"; }
    h += "</div>";
    if (n.risks && n.risks.length) {
      h += '<div class="ctx-pop-tags">' + n.risks.map(function (r) { return '<span class="ctx-chip soft">' + esc(r) + "</span>"; }).join("") + "</div>";
    }
    if (n.note) { h += '<p class="ctx-pop-note">' + esc(n.note) + "</p>"; }
    h += '<div class="ctx-pop-coord mono">' + esc(n.lat.toFixed(3)) + ", " + esc(n.lon.toFixed(3)) + "</div>";
    h += metaLine(g) + "</div>";
    return h;
  }

  /* ---- the left control panel ---- */
  function buildPanel(host, data) {
    var p = document.createElement("div");
    p.className = "ctx-panel";
    var head = '<div class="ctx-panel-head"><div class="ctx-title">Context</div>' +
      '<div class="ctx-sub">Strategic threat-area maps · public source</div></div>';

    var layers = '<div class="ctx-sec-h">Threat layers</div><div class="ctx-layers">';
    data.groups.forEach(function (g) {
      var on = !!state[g.id];
      layers += '<button class="ctx-layer' + (on ? " on" : "") + '" type="button" data-g="' + esc(g.id) + '" role="switch" aria-checked="' + (on ? "true" : "false") + '">' +
        '<span class="ctx-swatch" style="background:' + hue(g) + '"></span>' +
        '<span class="ctx-layer-name">' + esc(g.name) + "</span>" +
        '<span class="ctx-layer-count mono">' + ((g.corridors || []).length) + "·" + ((g.nodes || []).length) + "</span></button>";
    });
    layers += "</div>";

    var actions = '<div class="ctx-actions">' +
      '<button class="btn" id="ctx-fit" type="button">Fit</button>' +
      '<button class="btn" id="ctx-uk" type="button">UK</button></div>';

    var console = '<div class="ctx-console" id="ctx-console"></div>';

    var note = '<p class="ctx-note">' + esc(data.meta && data.meta.note ? data.meta.note : "") + "</p>" +
      '<p class="ctx-note faint mono">' + esc(data.meta && data.meta.sources ? data.meta.sources : "") + "</p>";

    p.innerHTML = head + layers + actions + console + note;
    host.appendChild(p);
    return p;
  }

  function renderConsole(data) {
    var el = document.getElementById("ctx-console");
    if (!el) { return; }
    var active = data.groups.filter(function (g) { return state[g.id]; });
    if (!active.length) { el.innerHTML = '<div class="ctx-console-empty">Toggle a layer to see its detail here.</div>'; return; }
    var html = "";
    active.forEach(function (g) {
      html += '<div class="ctx-console-g"><span class="ctx-swatch" style="background:' + hue(g) + '"></span>' + esc(g.name) + "</div>";
      if (g.id === "hawala" && g.typologies && g.typologies.length) {
        html += '<div class="ctx-typo-h">Money-laundering typologies</div>';
        g.typologies.forEach(function (t) {
          html += '<div class="ctx-typo"><div class="ctx-typo-name">' + esc(t.name) + "</div>" +
            '<div class="ctx-typo-desc">' + esc(t.desc) + "</div></div>";
        });
      }
    });
    el.innerHTML = html;
  }

  function toggleGroup(g, on, data) {
    state[g.id] = on;
    if (on) {
      if (!groupLayers[g.id]) { groupLayers[g.id] = buildGroupLayer(g); }
      groupLayers[g.id].addTo(map);
    } else if (groupLayers[g.id]) {
      map.removeLayer(groupLayers[g.id]);
    }
    renderConsole(data);
  }

  function fitActive(data) {
    var pts = [];
    data.groups.forEach(function (g) {
      if (!state[g.id]) { return; }
      (g.corridors || []).forEach(function (c) { (c.coords || []).forEach(function (p) { pts.push(p); }); });
      (g.nodes || []).forEach(function (n) { if (typeof n.lat === "number") { pts.push([n.lat, n.lon]); } });
    });
    pts.push(UK);
    if (pts.length > 1) { map.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: false }); }
  }

  /* ---- mount (called once by the router on first activation) ---- */
  function mount(el) {
    if (mounted) { return; }
    mounted = true;
    var data = window.SolarContextData;
    if (!el) { return; }
    if (!window.L || !data) {
      el.innerHTML = '<div class="ctx-fallback">Context data or the map library is unavailable.</div>';
      return;
    }

    // scaffold: panel | map — mount INTO the .context-main flex host (the router
    // passes the whole view element; append to its main so we don't become a sibling).
    var host = el.querySelector(".context-main") || el;
    var wrap = document.createElement("div");
    wrap.className = "ctx-wrap";
    wrap.innerHTML =
      '<div class="ctx-panel-host"></div>' +
      '<div class="ctx-map-host"><div id="ctx-map"></div>' +
      '<div class="ctx-offline" id="ctx-offline">Basemap unreachable — working offline. Corridors and nodes remain accurate; tiles return with the network.</div></div>';
    host.appendChild(wrap);

    // pre-seed the default-on layers so their panel toggles render active AND the
    // layers are on the map (the two Ben named first — hawala + a flow).
    ["hawala", "drug"].forEach(function (id) { state[id] = true; });

    buildPanel(wrap.querySelector(".ctx-panel-host"), data);
    map = buildMap(document.getElementById("ctx-map"), document.getElementById("ctx-offline"));

    data.groups.forEach(function (g) {
      if (state[g.id]) { groupLayers[g.id] = buildGroupLayer(g); groupLayers[g.id].addTo(map); }
    });
    renderConsole(data);

    // wire layer toggles
    wrap.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest(".ctx-layer") : null;
      if (!b) { return; }
      var id = b.getAttribute("data-g");
      var g = data.groups.filter(function (x) { return x.id === id; })[0];
      if (!g) { return; }
      var on = !state[g.id];
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
      toggleGroup(g, on, data);
    });
    var fit = document.getElementById("ctx-fit");
    if (fit) { fit.addEventListener("click", function () { fitActive(data); }); }
    var uk = document.getElementById("ctx-uk");
    if (uk) { uk.addEventListener("click", function () { map.setView([54.5, -3], 5, { animate: true }); }); }

    // the view is display:none until the router activates it — size the map once
    // it becomes visible, and on every switch back to Context.
    function refresh() { if (map) { map.invalidateSize(); fitActive(data); } }
    setTimeout(refresh, 60);
    if (window.SolarRouter && window.SolarRouter.onChange) {
      window.SolarRouter.onChange(function (s) { if (s === "context") { setTimeout(refresh, 40); } });
    }
  }

  window.SolarContextView = { mount: mount };
})();
