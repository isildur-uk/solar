/* comms-view.js — Registry "Comms Data" view: drop a CDR return (raw Call Data
 * CSV or ADM Telephony XLSX) and get a cleaned table, a cell-site map (with
 * azimuth sectors + movement path) and a synced timeline.
 *
 * Self-contained overlay opened from the database masthead. Uses the vendored
 * SheetJS (XLSX) and Leaflet (map) and the RegistryCommsData CORE for parsing /
 * de-bloating / offline BNG->WGS84. Feature-detects every dependency so it
 * degrades gracefully (and stays load-safe under jsdom / Node tests).
 *
 * XSS-safe: all data is written via textContent / DOM nodes, never innerHTML.
 * British English. No CDN except the Leaflet basemap tiles (graceful dark
 * fallback if unavailable). window.RegistryCommsView.
 */
"use strict";
(function () {
  var CD = (typeof window !== "undefined") ? window.RegistryCommsData : (typeof require !== "undefined" ? require("../js/core/comms-data.js") : null);
  var PAT = (typeof window !== "undefined") ? window.RegistryCommsPattern : (typeof require !== "undefined" ? require("../js/core/comms-pattern.js") : null);
  var JRN = (typeof window !== "undefined") ? window.RegistryCommsJourneys : (typeof require !== "undefined" ? require("../js/core/comms-journeys.js") : null);
  var doc = (typeof document !== "undefined") ? document : null;

  var state = { res: null, events: [], summary: null, sorted: [], map: null, mapLayers: null, filterN: null, built: false, tab: "table", showAllCols: false, i2Format: false };
  // Technical columns hidden by default even when populated (analyst can reveal).
  var DEFAULT_HIDDEN = { imei: 1, imsi: 1, cellGeneration: 1, cellAzimuth: 1 };
  // Column -> entity type, so identifiers paint with the same hue scheme as Charting/Database.
  var ENT_COL = { aParty: "phone", bParty: "phone", cellName: "location", cellPostcode: "location" };

  /* ---- tiny DOM helpers (safe) ---- */
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* ---- date parsing for timeline ordering ---- */
  function parseDt(s) {
    s = (s == null ? "" : String(s)).trim(); if (!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/); // DD/MM/YYYY
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, (+m[2]) - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    var i = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/); // ISO
    if (i) return new Date(+i[1], (+i[2]) - 1, +i[3], +(i[4] || 0), +(i[5] || 0), +(i[6] || 0));
    var d = new Date(s); return isNaN(d) ? null : d;
  }

  /* ================= overlay construction ================= */
  function ensureBuilt(host) {
    if (state.built) return;
    injectStyle();
    var panel = el("div", host ? "cd-panel cd-inline" : "cd-panel");
    var head = el("div", "cd-head");
    head.appendChild(el("span", "cd-title", "Comms Data — CDR analysis"));
    var meta = el("span", "cd-meta"); meta.id = "cd-meta"; head.appendChild(meta);
    var spacer = el("span", "cd-spacer"); head.appendChild(spacer);
    if (!host) { var btnClose = el("button", "cd-btn", "Close"); btnClose.type = "button"; btnClose.onclick = close; head.appendChild(btnClose); }
    panel.appendChild(head);

    // drop / load bar
    var bar = el("div", "cd-bar");
    var drop = el("label", "cd-drop"); drop.id = "cd-drop";
    drop.appendChild(el("span", "cd-drop-txt", "Drop a Call Data CSV or ADM Telephony XLSX here, or click to choose"));
    var input = el("input"); input.type = "file"; input.accept = ".csv,.xlsx,.xls"; input.id = "cd-file"; input.className = "cd-file";
    input.onchange = function () { if (input.files && input.files[0]) onFile(input.files[0]); };
    drop.appendChild(input);
    bar.appendChild(drop);
    var demo = el("button", "cd-btn", "Load demo data"); demo.type = "button"; demo.onclick = loadDemo; bar.appendChild(demo);
    var exp = el("button", "cd-btn", "Export tidy CSV"); exp.type = "button"; exp.id = "cd-export"; exp.onclick = exportCsv; exp.disabled = true; bar.appendChild(exp);
    var addb = el("button", "cd-btn", "Add to case"); addb.type = "button"; addb.id = "cd-addcase"; addb.title = "Add these subjects, contacts and locations to the shared SOLAR case"; addb.disabled = true; addb.onclick = addToCase; bar.appendChild(addb);
    panel.appendChild(bar);

    // DnD
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("cd-drag"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("cd-drag"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("cd-drag"); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });

    // summary strip
    var sum = el("div", "cd-summary"); sum.id = "cd-summary"; panel.appendChild(sum);

    // tabs
    var tabs = el("div", "cd-tabs");
    [["table", "Cleaned table"], ["map", "Map"], ["timeline", "Timeline"], ["patterns", "Patterns"], ["journeys", "Journeys"]].forEach(function (t) {
      var b = el("button", "cd-tab", t[1]);
      b.type = "button"; b.dataset.tab = t[0]; b.onclick = function () { showTab(t[0]); };
      if (t[0] === "table") b.classList.add("cd-tab-on");
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var body = el("div", "cd-body");
    body.appendChild(mk("cd-pane-table"));
    var mp = mk("cd-pane-map"); mp.setAttribute("hidden", ""); mp.appendChild(mkId("div", "cd-map")); body.appendChild(mp);
    var tl = mk("cd-pane-timeline"); tl.setAttribute("hidden", ""); body.appendChild(tl);
    var pp = mk("cd-pane-patterns"); pp.setAttribute("hidden", ""); body.appendChild(pp);
    var jj = mk("cd-pane-journeys"); jj.setAttribute("hidden", ""); body.appendChild(jj);
    panel.appendChild(body);

    if (host) { host.appendChild(panel); }
    else { var ov = el("div", "cd-overlay"); ov.id = "cd-overlay"; ov.setAttribute("hidden", ""); ov.appendChild(panel); doc.body.appendChild(ov); }
    state.built = true;
    function mk(id) { var d = el("div", "cd-pane"); d.id = id; return d; }
    function mkId(tag, id) { var d = el(tag, null); d.id = id; return d; }
  }

  function showTab(t) {
    state.tab = t;
    ["table", "map", "timeline", "patterns", "journeys"].forEach(function (x) {
      var pane = doc.getElementById("cd-pane-" + x); if (pane) { if (x === t) pane.removeAttribute("hidden"); else pane.setAttribute("hidden", ""); }
    });
    var tabsEl = doc.querySelectorAll(".cd-tab");
    for (var i = 0; i < tabsEl.length; i++) tabsEl[i].classList.toggle("cd-tab-on", tabsEl[i].dataset.tab === t);
    if (t === "map") renderMap();
    if (t === "patterns") renderPatterns();
    if (t === "journeys") renderJourneys();
  }

  function open() { ensureBuilt(); doc.getElementById("cd-overlay").removeAttribute("hidden"); }
  function close() { if (doc.getElementById("cd-overlay")) doc.getElementById("cd-overlay").setAttribute("hidden", ""); }
  function mount(host) { ensureBuilt(host); }

  /* ================= file ingest ================= */
  function onFile(file) {
    var name = (file.name || "").toLowerCase();
    var reader = new FileReader();
    if (/\.(xlsx|xls)$/.test(name)) {
      reader.onload = function () { try { ingestXlsx(reader.result); } catch (e) { flash("Could not read workbook: " + e.message); } };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = function () { try { ingestRows(CD.parseDelimited(reader.result)); } catch (e) { flash("Could not read CSV: " + e.message); } };
      reader.readAsText(file);
    }
  }

  function ingestXlsx(buf) {
    if (typeof XLSX === "undefined") { flash("XLSX library not loaded."); return; }
    var wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    var sheet = chooseSheet(wb);
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: true, defval: "" });
    ingestRows(rows);
  }
  function chooseSheet(wb) {
    var prefer = ["ADM Summary", "Events List", "Location List", "Call Data"];
    for (var p = 0; p < prefer.length; p++) if (wb.SheetNames.indexOf(prefer[p]) !== -1) return prefer[p];
    // else the sheet with the most columns that isn't a cover/reference sheet
    var best = wb.SheetNames[0], bestW = -1;
    wb.SheetNames.forEach(function (n) {
      if (/cover|glossary|formatting|reference|simple view/i.test(n)) return;
      var ref = wb.Sheets[n]["!ref"]; if (!ref) return;
      var w = XLSX.utils.decode_range(ref).e.c;
      if (w > bestW) { bestW = w; best = n; }
    });
    return best;
  }

  function ingestRows(rows) {
    if (!CD) { flash("Comms-data core not loaded."); return; }
    var res = CD.cleanFromRows(rows);
    state.res = res; state.events = res.events;
    state.target = String((res.meta && res.meta["Target identity"]) || "").replace(/\D/g, ""); // subject number, digits only
    state.summary = CD.summarise(res.events);
    state.sorted = res.events.slice().sort(function (a, b) { var da = parseDt(a.startDt), db = parseDt(b.startDt); return (da ? da.getTime() : 0) - (db ? db.getTime() : 0); });
    state.filterN = state.sorted.length;
    var exp = doc.getElementById("cd-export"); if (exp) exp.disabled = res.events.length === 0;
    var addb = doc.getElementById("cd-addcase"); if (addb) addb.disabled = res.events.length === 0;
    renderMeta(res); renderSummary(); renderTable(); renderTimeline(); renderPatterns(); renderJourneys();
    if (state.map) { state.map.remove(); state.map = null; }  // force map rebuild for new data
    if (state.tab === "map") renderMap();
    flash(res.events.length + " events parsed (" + res.format.toUpperCase() + ").");
  }
  // exposed for headless tests
  function _ingestRows(rows) { ensureBuilt(); ingestRows(rows); return state; }

  /* ================= renders ================= */
  function renderMeta(res) {
    var m = doc.getElementById("cd-meta"); if (!m) return; clear(m);
    var bits = [];
    if (res.meta && res.meta.URN) bits.push("URN " + res.meta.URN);
    if (res.meta && res.meta["Target identity"]) bits.push("Target " + res.meta["Target identity"]);
    m.appendChild(doc.createTextNode(bits.join("  ·  ")));
    // Classification as a marking pill (same treatment as the Database's .pill.mk-*).
    if (res.meta && res.meta.Grade) { if (bits.length) m.appendChild(doc.createTextNode("  ")); m.appendChild(gradePill(res.meta.Grade)); }
  }
  function gradePill(g) {
    var p = el("span", "cd-grade", g), s = String(g).toUpperCase();
    p.setAttribute("data-mk", /SECRET/.test(s) ? "bad" : /SENSITIVE/.test(s) ? "warn" : "ok");
    return p;
  }
  function renderSummary() {
    var s = doc.getElementById("cd-summary"); if (!s) return; clear(s);
    var d = state.summary; if (!d) return;
    function chip(label, val) { var c = el("span", "cd-chip"); c.appendChild(el("b", null, String(val))); c.appendChild(doc.createTextNode(" " + label)); return c; }
    s.appendChild(chip("events", d.eventCount));
    s.appendChild(chip("geolocated", d.geolocated));
    if (d.firstEvent) s.appendChild(chip("first", d.firstEvent));
    if (d.lastEvent) s.appendChild(chip("last", d.lastEvent));
    var swaps = (d.handsetCombos || []).length;
    var uniqNums = (d.topNumbers || []).length;
    if (swaps > uniqNums) { var w = chip("handset combos (possible SIM-swap)", swaps); w.classList.add("cd-warn"); s.appendChild(w); }
    else s.appendChild(chip("handset combos", swaps));
  }

  // Columns actually shown: drop entirely-empty columns and hide the technical
  // set by default; "Show all columns" reveals everything.
  function visibleColumns() {
    var cols = (state.res && state.res.columns) || CD.CLEAN_COLUMNS;
    if (state.showAllCols) return cols;
    return cols.filter(function (c) {
      if (DEFAULT_HIDDEN[c.key]) return false;
      return state.sorted.some(function (ev) { var v = ev[c.key]; return v != null && String(v).trim() !== ""; });
    });
  }
  function cellText(key, v) { if (v == null) v = ""; return state.i2Format ? CD.i2Cell(key, v) : String(v); }
  function chk(label, checked, onchange) {
    var l = el("label", "cd-chk"); var i = el("input"); i.type = "checkbox"; i.checked = !!checked;
    i.onchange = function () { onchange(i.checked); }; l.appendChild(i); l.appendChild(doc.createTextNode(" " + label)); return l;
  }
  function renderTable() {
    var pane = doc.getElementById("cd-pane-table"); if (!pane) return; clear(pane);
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events — drop a return or load the demo.")); return; }
    var ctl = el("div", "cd-tablectl");
    ctl.appendChild(chk("Show all columns", state.showAllCols, function (on) { state.showAllCols = on; renderTable(); }));
    ctl.appendChild(chk("i2 format (ISO dates, hyphen-safe)", state.i2Format, function (on) { state.i2Format = on; renderTable(); }));
    pane.appendChild(ctl);
    var cols = visibleColumns();
    var wrap = el("div", "cd-tablewrap"), tbl = el("table", "cd-table"), thead = el("thead"), htr = el("tr");
    cols.forEach(function (c) { htr.appendChild(el("th", null, c.label)); });
    thead.appendChild(htr); tbl.appendChild(thead);
    var tb = el("tbody");
    state.sorted.forEach(function (ev) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var cls = (c.key === "lat" || c.key === "lon") ? "cd-num" : "";
        var et = ENT_COL[c.key];
        if (et === "phone" && state.target && String(ev[c.key] == null ? "" : ev[c.key]).replace(/\D/g, "") === state.target) cls += " cd-subject";
        else if (et) cls += " cd-ent-" + et;
        tr.appendChild(el("td", cls.trim() || null, cellText(c.key, ev[c.key])));
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); pane.appendChild(wrap);
  }

  function renderTimeline() {
    var pane = doc.getElementById("cd-pane-timeline"); if (!pane) return; clear(pane);
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events.")); return; }
    var ctrl = el("div", "cd-tl-ctrl");
    ctrl.appendChild(el("span", null, "Show first "));
    var out = el("b", null, String(state.filterN));
    var slider = el("input"); slider.type = "range"; slider.min = "1"; slider.max = String(state.sorted.length); slider.value = String(state.filterN); slider.className = "cd-slider";
    slider.oninput = function () { state.filterN = +slider.value; out.textContent = slider.value; drawTlList(); if (state.tab === "map") renderMap(); };
    ctrl.appendChild(slider); ctrl.appendChild(out); ctrl.appendChild(doc.createTextNode(" of " + state.sorted.length + " events"));
    pane.appendChild(ctrl);
    var list = el("ol", "cd-tl"); list.id = "cd-tl-list"; pane.appendChild(list);
    drawTlList();
  }
  function drawTlList() {
    var list = doc.getElementById("cd-tl-list"); if (!list) return; clear(list);
    state.sorted.slice(0, state.filterN).forEach(function (ev) {
      var li = el("li", "cd-tl-item");
      li.appendChild(el("span", "cd-tl-time", ev.startDt || "—"));
      var party = [ev.aParty, ev.bParty].filter(Boolean).join(" → ");
      li.appendChild(el("span", "cd-tl-type", (ev.type || "event") + (party ? "  " + party : "")));
      var loc = ev.cellName || ev.cellPostcode || ((ev.lat != null) ? (ev.lat + ", " + ev.lon) : "");
      if (loc) li.appendChild(el("span", "cd-tl-loc", loc));
      if (ev.lat != null && ev.lon != null) { li.classList.add("cd-tl-geo"); li.onclick = function () { showTab("map"); focusPoint(ev); }; }
      list.appendChild(li);
    });
  }

  /* ---- map (Leaflet) ---- */
  function geoEvents() { return state.sorted.slice(0, state.filterN).filter(function (e) { return e.lat != null && e.lon != null; }); }
  function renderMap() {
    var host = doc.getElementById("cd-map"); if (!host) return;
    if (typeof L === "undefined") { host.textContent = "Map library unavailable."; return; }
    var pts = geoEvents();
    if (!state.map) {
      state.map = L.map(host, { zoomControl: true, attributionControl: true }).setView([54, -2], 6);
      var tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: "© OpenStreetMap © CARTO" });
      tiles.on("tileerror", function () { host.classList.add("cd-map-offline"); }); // graceful dark fallback
      tiles.addTo(state.map);
    }
    if (state.mapLayers) state.mapLayers.forEach(function (l) { state.map.removeLayer(l); });
    state.mapLayers = [];
    var latlngs = [];
    pts.forEach(function (e, idx) {
      var ll = [e.lat, e.lon]; latlngs.push(ll);
      var mk = L.circleMarker(ll, { radius: 6, color: "#8ea2ff", weight: 2, fillColor: "#8ea2ff", fillOpacity: 0.7 });
      mk.bindPopup(popupHtml(e, idx + 1));
      mk.addTo(state.map); state.mapLayers.push(mk);
      if (e.cellAzimuth != null && isFinite(e.cellAzimuth)) {
        var sec = sector(e.lat, e.lon, e.cellAzimuth, 60, 0.35);
        var poly = L.polygon(sec, { color: "#8ea2ff", weight: 1, fillColor: "#8ea2ff", fillOpacity: 0.12 });
        poly.addTo(state.map); state.mapLayers.push(poly);
      }
    });
    if (latlngs.length > 1 && JRN) {
      JRN.analyseJourneys(pts).legs.forEach(function (lg) {
        var seg = L.polyline([[lg.fromLat, lg.fromLon], [lg.toLat, lg.toLon]], { color: JRN.MODE_COLOUR[lg.mode] || "#8ea2ff", weight: lg.impossible ? 3 : 2.5, opacity: 0.85, dashArray: lg.impossible ? "4,4" : null });
        seg.bindTooltip(lg.mode + (lg.speedKmh != null ? " · " + lg.speedKmh + " km/h" : "") + (lg.roadHint ? " · " + lg.roadHint : ""));
        seg.addTo(state.map); state.mapLayers.push(seg);
      });
    } else if (latlngs.length > 1) {
      var line = L.polyline(latlngs, { color: "#8ea2ff", weight: 2, opacity: 0.7, dashArray: "5,5" }); line.addTo(state.map); state.mapLayers.push(line);
    }
    if (latlngs.length) state.map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
    setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 50);
  }
  function focusPoint(e) { if (state.map && e.lat != null) { state.map.setView([e.lat, e.lon], 14); } }
  function popupHtml(e, n) {
    // Leaflet popups take a string; build via a detached node to stay escaped.
    var d = el("div", "cd-pop");
    d.appendChild(el("div", "cd-pop-t", "#" + n + "  " + (e.type || "event")));
    if (e.startDt) d.appendChild(el("div", null, e.startDt));
    var party = [e.aParty, e.bParty].filter(Boolean).join(" → "); if (party) d.appendChild(el("div", null, party));
    if (e.cellName) d.appendChild(el("div", null, e.cellName));
    if (e.cellPostcode) d.appendChild(el("div", null, e.cellPostcode));
    if (e.cellAzimuth != null) d.appendChild(el("div", null, "Azimuth " + e.cellAzimuth + "°"));
    return d;
  }
  // wedge polygon: centre + arc across [az-span/2, az+span/2], radius in km
  function sector(lat, lon, az, span, radiusKm) {
    var pts = [[lat, lon]]; var steps = 12;
    for (var i = 0; i <= steps; i++) {
      var b = (az - span / 2) + (span * i / steps);
      pts.push(destPoint(lat, lon, b, radiusKm));
    }
    pts.push([lat, lon]); return pts;
  }
  function destPoint(lat, lon, bearingDeg, distKm) {
    var R = 6371, br = bearingDeg * Math.PI / 180, la1 = lat * Math.PI / 180, lo1 = lon * Math.PI / 180, dr = distKm / R;
    var la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
    var lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2));
    return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
  }

  /* ---- add findings to the shared SOLAR case (spine for Charting/Database) ---- */
  function addToCase() {
    if (typeof window === "undefined" || !window.SolarCase || !window.CRCommsCase) { flash("Shared case spine unavailable."); return; }
    var parts = window.CRCommsCase.fromEvents(state.sorted, (state.res && state.res.meta) || {});
    var s = window.SolarCase.merge(parts);
    flash("Added " + parts.entities.length + " entities + " + parts.links.length + " links to the shared case (" + s.entities + " total).");
  }

  /* ---- export tidy CSV ---- */
  function exportCsv() {
    var cols = visibleColumns();
    var lines = [cols.map(function (c) { return c.label; }).join(",")];
    state.sorted.forEach(function (ev) {
      lines.push(cols.map(function (c) { var v = cellText(c.key, ev[c.key]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","));
    });
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
    var a = doc.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "comms-data-tidy.csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function flash(msg) { if (typeof window !== "undefined" && window.SolarStatus && window.SolarStatus.show) { window.SolarStatus.show(msg); return; } var m = doc && doc.getElementById("cd-meta"); if (m && !m.textContent) m.textContent = msg; }

  /* ---- demo data (fictitious; Luton/Dunstable area) ---- */
  function loadDemo() { ingestRows(CD.parseDelimited(DEMO_CSV())); }
  function DEMO_CSV() {
    var H = ["Start Date","Start Time (local)","End Date","End Time (local)","Calling Number","Called Number","Forwarding Number","CDR Type","IMSI","IMEI","Ring time (secs)","Call Duration (HH:mm:ss)","IPv4 address","IPv6 address","Data Volume Uploaded (KB)","Data Volume Downloaded (KB)","APN","Country of Origin","Operator","Start Cell ID or MAC Address","Start Cell Site Name","Start Cell 1st line of Address","Start Cell ID Postcode","Start Cell Generation","Start Cell Easting","Start Cell Northing","Start Cell Azimuth","End Cell ID or MAC Address","End Cell Site Name","End Cell 1st line of Address","End Cell ID Postcode","End Cell Generation","End Cell Easting","End Cell Northing","End Cell Azimuth","Row"];
    // fictitious cell sites around Luton (OS grid, TL)
    var cells = [
      ["LTN-A","LUTON TOWN HALL","George St","LU1 2BQ","4G",509200,221600,90],
      ["LTN-B","BURY PARK","Dunstable Rd","LU1 1HW","4G",508100,221900,150],
      ["DUN-C","DUNSTABLE CENTRAL","High St North","LU6 1LF","4G",502100,221900,270],
      ["LTN-D","LUTON AIRPORT","Airport Way","LU2 9LY","5G",512700,220900,45],
      ["LEA-E","LEAGRAVE","Compton Ave","LU4 9AB","4G",506200,224400,200]
    ];
    // Three weekdays (Mon-Wed): overnight at LEA-E (home, idx 4), weekday
    // daytime at LTN-A (base, idx 0) — gives a clear pattern-of-life.
    var evs = [
      ["02/09/2024","06:50:11","Data","07700900111","","","00:00:00",4],
      ["02/09/2024","08:40:02","Voice","07700900111","07700900222","3","00:01:12",0],
      ["02/09/2024","13:15:33","Voice","07700900111","07700900333","3","00:00:47",0],
      ["02/09/2024","18:30:07","Voice","07700900111","07700900222","3","00:00:31",1],
      ["02/09/2024","23:20:44","SMS-MO","07700900111","07700900444","","00:00:00",4],
      ["03/09/2024","00:45:19","Data","07700900111","","","00:00:00",4],
      ["03/09/2024","08:55:40","Voice","07700900111","07700900222","3","00:02:05",0],
      ["03/09/2024","12:40:50","SMS-MT","07700900555","07700900111","","00:00:00",2],
      ["03/09/2024","22:50:26","Voice","07700900111","07700900444","3","00:01:58",4],
      ["04/09/2024","05:30:00","Data","07700900111","","","00:00:00",4],
      ["04/09/2024","09:10:15","Voice","07700900111","07700900333","3","00:00:52",0],
      ["04/09/2024","15:20:33","Voice","07700900111","07700900222","3","00:01:20",3],
      ["04/09/2024","23:05:12","SMS-MO","07700900111","07700900222","","00:00:00",4]
    ];
    var lines = ["URN:,,,,IR774120","Grade:,,,,OFFICIAL-SENSITIVE","Target identity:,,,,07700900111","Operator:,,,,EE","", H.join(","), ""];
    evs.forEach(function (e, i) {
      var c = cells[e[7]]; var imei = (i === 7) ? "350000000000099" : "350000000000012"; // one SIM-swap
      var row = [e[0], e[1], e[0], e[1], e[3], e[4], "", e[2], "234300000000001", imei, e[5], e[6], "", "", "", "", "", "GBR", "EE", c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], "", "", "", "", "", "", "", "", String(i + 1)];
      lines.push(row.map(function (v) { v = String(v); return /[",]/.test(v) ? '"' + v + '"' : v; }).join(","));
    });
    return lines.join("\n");
  }

  /* ---- patterns (pattern-of-life) ---- */
  function fmtDate(d) { if (!(d instanceof Date) || isNaN(d)) return ""; function p(n) { n = String(n); return n.length < 2 ? "0" + n : n; } return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function anchorCard(title, sub, loc) {
    var c = el("div", "cd-card");
    c.appendChild(el("div", "cd-card-t", title));
    c.appendChild(el("div", "cd-card-sub", sub));
    if (loc) {
      var v = el("div", "cd-card-v");
      if (window.SolarEntityStyle) v.appendChild(window.SolarEntityStyle.icon("location", 16)); // same location glyph as Charting
      v.appendChild(doc.createTextNode(loc.name || loc.key));
      c.appendChild(v);
      var m = []; if (loc.postcode) m.push(loc.postcode); m.push(loc.count + " events");
      c.appendChild(el("div", "cd-card-m", m.join("  ·  ")));
      if (loc.lat != null) { c.classList.add("cd-tl-geo"); c.onclick = function () { showTab("map"); if (state.map) state.map.setView([loc.lat, loc.lon], 14); }; }
    } else c.appendChild(el("div", "cd-card-v", "insufficient data"));
    return c;
  }
  function histogram(counts, labelFn) {
    var max = Math.max.apply(null, counts.concat([1]));
    var h = el("div", "cd-hist");
    counts.forEach(function (v, i) {
      var col = el("div", "cd-hist-col");
      var bar = el("div", "cd-hist-bar"); bar.style.height = (v ? Math.max(4, Math.round(v / max * 100)) : 0) + "%"; bar.title = v + " events";
      col.appendChild(bar); col.appendChild(el("div", "cd-hist-lab", labelFn(i)));
      h.appendChild(col);
    });
    return h;
  }
  function renderPatterns() {
    var pane = doc.getElementById("cd-pane-patterns"); if (!pane) return; clear(pane);
    if (!PAT) { pane.appendChild(el("p", "cd-empty", "Pattern module unavailable.")); return; }
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events — drop a return or load the demo.")); return; }
    var P = PAT.patternOfLife(state.sorted);
    if (!P.total) { pane.appendChild(el("p", "cd-empty", "No geolocated events to analyse.")); return; }
    var cards = el("div", "cd-cards");
    cards.appendChild(anchorCard("Overnight anchor — likely home", "22:00–06:00", P.nightAnchor));
    cards.appendChild(anchorCard("Daytime anchor — likely base", "weekday 09:00–17:00", P.dayAnchor));
    pane.appendChild(cards);

    pane.appendChild(el("h3", "cd-h", "Most frequented locations"));
    var wrap = el("div", "cd-tablewrap"), t = el("table", "cd-table"), th = el("thead"), htr = el("tr");
    ["#", "Location", "Postcode", "Events", "First seen", "Last seen"].forEach(function (h) { htr.appendChild(el("th", null, h)); });
    th.appendChild(htr); t.appendChild(th);
    var tb = el("tbody");
    P.topLocations.slice(0, 15).forEach(function (L, i) {
      var tr = el("tr");
      [String(i + 1), L.name || L.key, L.postcode || "", String(L.count), fmtDate(L.first), fmtDate(L.last)].forEach(function (v, ci) { tr.appendChild(el("td", ci === 3 ? "cd-num" : null, v)); });
      if (L.lat != null) { tr.classList.add("cd-tl-geo"); tr.onclick = function () { showTab("map"); if (state.map) state.map.setView([L.lat, L.lon], 14); }; }
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); pane.appendChild(wrap);

    pane.appendChild(el("h3", "cd-h", "Top location by time of day"));
    var bt = el("table", "cd-table"), bth = el("thead"), bhr = el("tr");
    ["Time band", "Top location", "Events"].forEach(function (h) { bhr.appendChild(el("th", null, h)); });
    bth.appendChild(bhr); bt.appendChild(bth);
    var bb = el("tbody");
    P.byBand.forEach(function (b) {
      var tr = el("tr");
      tr.appendChild(el("td", null, b.band));
      tr.appendChild(el("td", null, b.location ? (b.location.name || b.location.key) : "—"));
      tr.appendChild(el("td", "cd-num", b.count ? String(b.count) : ""));
      bb.appendChild(tr);
    });
    bt.appendChild(bb); pane.appendChild(bt);

    pane.appendChild(el("h3", "cd-h", "Activity by hour of day"));
    pane.appendChild(histogram(P.hourly, function (i) { return (i < 10 ? "0" : "") + i; }));
    pane.appendChild(el("h3", "cd-h", "Activity by day of week"));
    pane.appendChild(histogram(P.dow, function (i) { return P.dowLabels[i]; }));
  }

  /* ---- journeys (mode-of-transport) ---- */
  function renderJourneys() {
    var pane = doc.getElementById("cd-pane-journeys"); if (!pane) return; clear(pane);
    if (!JRN) { pane.appendChild(el("p", "cd-empty", "Journeys module unavailable.")); return; }
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events — drop a return or load the demo.")); return; }
    var JR = JRN.analyseJourneys(state.sorted);
    if (!JR.legs.length) { pane.appendChild(el("p", "cd-empty", "Not enough located events to infer movement.")); return; }
    // legend
    var lg = el("div", "cd-legend");
    Object.keys(JRN.MODE).forEach(function (k) {
      var m = JRN.MODE[k], s = el("span", "cd-legkey"), dot = el("span", "cd-legdot");
      dot.style.background = JRN.MODE_COLOUR[m] || "#888"; s.appendChild(dot); s.appendChild(doc.createTextNode(" " + m)); lg.appendChild(s);
    });
    pane.appendChild(lg);
    if (JR.impossible.length) {
      var w = el("div", "cd-imp-banner");
      w.textContent = JR.impossible.length + " leg(s) exceed plausible ground speed — possible cloned SIM, second handset, or clock error.";
      pane.appendChild(w);
    }
    pane.appendChild(el("h3", "cd-h", "Journeys"));
    pane.appendChild(mkTable(["#", "Start", "Mode", "Distance (km)", "Duration (min)", "Mean km/h", "Max km/h", "Straightness", "Roads"],
      JR.journeys.map(function (j, i) { return { cells: [String(i + 1), fmtDate(j.startTime), j.mode || "", String(j.distanceKm), String(j.durationMin), j.meanKmh == null ? "" : String(j.meanKmh), j.maxKmh == null ? "" : String(j.maxKmh), j.straightness == null ? "" : String(j.straightness), j.roads.join(", ")], num: [3, 4, 5, 6, 7], imp: j.impossible }; })));
    pane.appendChild(el("h3", "cd-h", "Legs (segment detail)"));
    pane.appendChild(mkTable(["From", "To", "Start", "Distance (km)", "Duration (min)", "km/h", "Mode", "Road"],
      JR.legs.map(function (l) { return { cells: [l.fromLabel, l.toLabel, fmtDate(l.fromTime), String(l.distanceKm), String(l.durationMin), l.speedKmh == null ? "∞" : String(l.speedKmh), l.mode, l.roadHint || ""], num: [3, 4, 5], imp: l.impossible }; })));
  }
  function mkTable(headers, rows) {
    var wrap = el("div", "cd-tablewrap"), t = el("table", "cd-table"), th = el("thead"), htr = el("tr");
    headers.forEach(function (h) { htr.appendChild(el("th", null, h)); });
    th.appendChild(htr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr"); if (r.imp) tr.classList.add("cd-imp");
      r.cells.forEach(function (v, ci) { tr.appendChild(el("td", (r.num && r.num.indexOf(ci) !== -1) ? "cd-num" : null, v)); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  }

  /* ---- scoped styles ---- */
  function injectStyle() {
    if (doc.getElementById("cd-style")) return;
    var css = [
      "#cd-overlay{position:fixed;inset:0;z-index:9000;background:rgba(6,6,5,.72);backdrop-filter:blur(3px);display:flex;padding:2.5vh 2.5vw}",
      "#cd-overlay[hidden]{display:none}",
      ".cd-panel{margin:auto;width:100%;height:95vh;max-width:1400px;display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;color:var(--text);font:var(--fs-sm)/1.45 var(--sans)}",
      ".cd-inline{margin:0;width:100%;height:100%;max-width:none;border:none;border-radius:0;background:transparent}",
      ".cd-head{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line)}",
      ".cd-title{font-weight:600}.cd-meta{color:var(--faint);font-size:var(--fs-xs)}.cd-spacer{flex:1}",
      ".cd-bar{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)}",
      ".cd-drop{flex:1;display:flex;align-items:center;justify-content:center;padding:10px;border:1px dashed var(--line-2);border-radius:var(--radius);color:var(--dim);cursor:pointer}",
      ".cd-drop.cd-drag{border-color:var(--accent);color:var(--accent)}.cd-file{display:none}",
      ".cd-btn{background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:7px 12px;cursor:pointer;font:inherit}.cd-btn:hover:not(:disabled){border-color:var(--accent-dim)}.cd-btn:disabled{opacity:.45;cursor:default}",
      ".cd-summary{display:flex;flex-wrap:wrap;gap:8px;padding:8px 14px;border-bottom:1px solid var(--line)}",
      ".cd-chip{background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:3px 10px;font-size:var(--fs-xs);color:var(--dim)}.cd-chip b{color:var(--text);font-variant-numeric:tabular-nums}.cd-chip.cd-warn{border-color:var(--warn);color:var(--warn)}",
      ".cd-tabs{display:flex;gap:4px;padding:8px 14px 0}",
      ".cd-tab{background:transparent;border:none;border-bottom:2px solid transparent;color:var(--faint);padding:7px 12px;cursor:pointer;font:inherit}.cd-tab:hover{color:var(--dim)}.cd-tab-on{color:var(--accent);border-bottom-color:var(--accent)}",
      ".cd-body{flex:1;min-height:0;position:relative}",
      ".cd-pane{position:absolute;inset:0;overflow:auto;padding:12px 14px}",
      "#cd-map{position:absolute;inset:0;background:var(--bg)}.cd-map-offline{background:var(--bg)}",
      ".cd-tablewrap{overflow:auto;max-height:100%}",
      ".cd-tablectl{display:flex;gap:16px;margin-bottom:8px;color:var(--dim);font-size:var(--fs-xs)}",
      ".cd-chk{display:flex;align-items:center;gap:5px;cursor:pointer}.cd-chk input,.cd-slider{accent-color:var(--accent)}",
      ".cd-table{border-collapse:collapse;width:100%;font-size:var(--fs-xs)}",
      ".cd-table th,.cd-table td{border:1px solid var(--line);padding:4px 7px;text-align:left;white-space:nowrap}",
      ".cd-table td{font-family:var(--mono);font-variant-numeric:tabular-nums}",
      ".cd-table tbody tr:hover{background:rgba(142,162,255,.06)}",
      ".cd-ent-phone{color:var(--c-phone)}.cd-ent-location{color:var(--c-location)}.cd-ent-vehicle{color:var(--c-vehicle)}",
      ".cd-subject{color:var(--accent);font-weight:700}",
      ".cd-table th{position:sticky;top:0;background:var(--panel-2);color:var(--faint);font-family:var(--mono);font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.04em}.cd-num{text-align:right;font-variant-numeric:tabular-nums}",
      ".cd-empty{color:var(--faint);padding:24px;text-align:center}",
      ".cd-h{margin:16px 0 6px;font-size:var(--fs-sm);color:var(--dim);font-weight:600}.cd-h:first-child{margin-top:0}",
      ".cd-cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px}",
      ".cd-card{flex:1;min-width:220px;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}",
      ".cd-card.cd-tl-geo{cursor:pointer}.cd-card.cd-tl-geo:hover{border-color:var(--accent-dim)}",
      ".cd-card-t{font-weight:600;color:var(--text)}.cd-card-sub{font-size:var(--fs-2xs);color:var(--faint);margin-bottom:8px}",
      ".cd-card-v{display:flex;align-items:center;gap:6px;font-size:var(--fs-md);color:var(--accent);font-family:var(--mono)}.cd-card-m{font-size:var(--fs-xs);color:var(--dim);margin-top:2px}",
      ".cd-grade{display:inline-block;font-family:var(--mono);font-size:var(--fs-2xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid currentColor;border-radius:var(--radius);padding:1px 6px;vertical-align:middle}.cd-grade[data-mk=ok]{color:var(--ok)}.cd-grade[data-mk=warn]{color:var(--warn)}.cd-grade[data-mk=bad]{color:var(--bad)}",
      ".ent-ico img{border-radius:3px;display:block}",
      ".cd-hist{display:flex;align-items:flex-end;gap:2px;height:110px;padding-top:6px;border-bottom:1px solid var(--line);margin-bottom:6px}",
      ".cd-hist-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}",
      ".cd-hist-bar{width:72%;background:var(--accent);border-radius:2px 2px 0 0;opacity:.85}",
      ".cd-hist-lab{font-size:var(--fs-2xs);color:var(--faint);margin-top:3px;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".cd-legend{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px;font-size:var(--fs-2xs);color:var(--dim)}",
      ".cd-legkey{display:flex;align-items:center;gap:4px}.cd-legdot{width:10px;height:10px;border-radius:2px;display:inline-block}",
      ".cd-imp-banner{background:rgba(216,106,106,.12);border:1px solid var(--warn);color:var(--warn);border-radius:var(--radius);padding:8px 10px;margin-bottom:10px;font-size:var(--fs-xs)}",
      ".cd-imp td{color:var(--bad)}",
      ".cd-tl-ctrl{display:flex;align-items:center;gap:8px;margin-bottom:10px;color:var(--dim)}.cd-slider{flex:1;max-width:360px}",
      ".cd-tl{list-style:none;margin:0;padding:0}",
      ".cd-tl-item{display:grid;grid-template-columns:150px 1fr auto;gap:12px;padding:7px 8px;border-left:2px solid var(--line);margin-left:6px}",
      ".cd-tl-item.cd-tl-geo{cursor:pointer;border-left-color:var(--accent)}.cd-tl-item.cd-tl-geo:hover{background:var(--panel-2)}",
      ".cd-tl-time{color:var(--faint);font-family:var(--mono);font-variant-numeric:tabular-nums}.cd-tl-loc{color:var(--dim)}",
      ".cd-pop{font:var(--fs-xs)/1.4 var(--sans)}.cd-pop-t{font-weight:600;margin-bottom:3px}"
    ].join("\n");
    var st = el("style"); st.id = "cd-style"; st.textContent = css; doc.head.appendChild(st);
  }

  var api = { open: open, close: close, mount: mount, _ingestRows: _ingestRows };
  if (typeof window !== "undefined") { window.RegistryCommsView = api; }
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})();
