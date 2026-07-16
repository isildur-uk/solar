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
  var doc = (typeof document !== "undefined") ? document : null;

  var state = { res: null, events: [], summary: null, sorted: [], map: null, mapLayers: null, filterN: null, built: false, tab: "table" };

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
    panel.appendChild(bar);

    // DnD
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("cd-drag"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("cd-drag"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("cd-drag"); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });

    // summary strip
    var sum = el("div", "cd-summary"); sum.id = "cd-summary"; panel.appendChild(sum);

    // tabs
    var tabs = el("div", "cd-tabs");
    ["table", "map", "timeline"].forEach(function (t) {
      var b = el("button", "cd-tab", t === "table" ? "Cleaned table" : t === "map" ? "Map" : "Timeline");
      b.type = "button"; b.dataset.tab = t; b.onclick = function () { showTab(t); };
      if (t === "table") b.classList.add("cd-tab-on");
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var body = el("div", "cd-body");
    body.appendChild(mk("cd-pane-table"));
    var mp = mk("cd-pane-map"); mp.setAttribute("hidden", ""); mp.appendChild(mkId("div", "cd-map")); body.appendChild(mp);
    var tl = mk("cd-pane-timeline"); tl.setAttribute("hidden", ""); body.appendChild(tl);
    panel.appendChild(body);

    if (host) { host.appendChild(panel); }
    else { var ov = el("div", "cd-overlay"); ov.id = "cd-overlay"; ov.setAttribute("hidden", ""); ov.appendChild(panel); doc.body.appendChild(ov); }
    state.built = true;
    function mk(id) { var d = el("div", "cd-pane"); d.id = id; return d; }
    function mkId(tag, id) { var d = el(tag, null); d.id = id; return d; }
  }

  function showTab(t) {
    state.tab = t;
    ["table", "map", "timeline"].forEach(function (x) {
      var pane = doc.getElementById("cd-pane-" + x); if (pane) { if (x === t) pane.removeAttribute("hidden"); else pane.setAttribute("hidden", ""); }
    });
    var tabsEl = doc.querySelectorAll(".cd-tab");
    for (var i = 0; i < tabsEl.length; i++) tabsEl[i].classList.toggle("cd-tab-on", tabsEl[i].dataset.tab === t);
    if (t === "map") renderMap();
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
    state.summary = CD.summarise(res.events);
    state.sorted = res.events.slice().sort(function (a, b) { var da = parseDt(a.startDt), db = parseDt(b.startDt); return (da ? da.getTime() : 0) - (db ? db.getTime() : 0); });
    state.filterN = state.sorted.length;
    var exp = doc.getElementById("cd-export"); if (exp) exp.disabled = res.events.length === 0;
    renderMeta(res); renderSummary(); renderTable(); renderTimeline();
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
    if (res.meta && res.meta.Grade) bits.push(res.meta.Grade);
    m.textContent = bits.join("  ·  ");
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

  function renderTable() {
    var pane = doc.getElementById("cd-pane-table"); if (!pane) return; clear(pane);
    var cols = (state.res && state.res.columns) || CD.CLEAN_COLUMNS;
    var wrap = el("div", "cd-tablewrap");
    var tbl = el("table", "cd-table");
    var thead = el("thead"), htr = el("tr");
    cols.forEach(function (c) { htr.appendChild(el("th", null, c.label)); });
    thead.appendChild(htr); tbl.appendChild(thead);
    var tb = el("tbody");
    state.sorted.forEach(function (ev) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var v = ev[c.key]; if (v == null) v = "";
        tr.appendChild(el("td", (c.key === "lat" || c.key === "lon") ? "cd-num" : null, String(v)));
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); pane.appendChild(wrap);
    if (!state.sorted.length) pane.appendChild(el("p", "cd-empty", "No events — drop a return or load the demo."));
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
      var tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
      tiles.on("tileerror", function () { host.classList.add("cd-map-offline"); }); // graceful dark fallback
      tiles.addTo(state.map);
    }
    if (state.mapLayers) state.mapLayers.forEach(function (l) { state.map.removeLayer(l); });
    state.mapLayers = [];
    var latlngs = [];
    pts.forEach(function (e, idx) {
      var ll = [e.lat, e.lon]; latlngs.push(ll);
      var mk = L.circleMarker(ll, { radius: 6, color: "#e8a13a", weight: 2, fillColor: "#e8a13a", fillOpacity: 0.7 });
      mk.bindPopup(popupHtml(e, idx + 1));
      mk.addTo(state.map); state.mapLayers.push(mk);
      if (e.cellAzimuth != null && isFinite(e.cellAzimuth)) {
        var sec = sector(e.lat, e.lon, e.cellAzimuth, 60, 0.35);
        var poly = L.polygon(sec, { color: "#e8a13a", weight: 1, fillColor: "#e8a13a", fillOpacity: 0.12 });
        poly.addTo(state.map); state.mapLayers.push(poly);
      }
    });
    if (latlngs.length > 1) { var line = L.polyline(latlngs, { color: "#6aa0ff", weight: 2, opacity: 0.7, dashArray: "5,5" }); line.addTo(state.map); state.mapLayers.push(line); }
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

  /* ---- export tidy CSV ---- */
  function exportCsv() {
    var cols = (state.res && state.res.columns) || CD.CLEAN_COLUMNS;
    var lines = [cols.map(function (c) { return c.label; }).join(",")];
    state.sorted.forEach(function (ev) {
      lines.push(cols.map(function (c) { var v = ev[c.key]; v = (v == null) ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","));
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
    var evs = [
      ["01/09/2024","07:42:11","Voice","07700900111","07700900222","3","00:01:12",0],
      ["01/09/2024","08:05:40","Voice","07700900111","07700900333","3","00:00:47",1],
      ["01/09/2024","08:31:02","SMS-MO","07700900111","07700900222","","00:00:00",1],
      ["01/09/2024","09:14:55","Voice","07700900111","07700900444","3","00:03:20",2],
      ["01/09/2024","10:02:19","Data","07700900111","","","00:00:00",4],
      ["01/09/2024","11:20:07","Voice","07700900111","07700900333","3","00:00:31",4],
      ["01/09/2024","12:48:33","Voice","07700900111","07700900222","3","00:02:05",3],
      ["01/09/2024","13:37:50","SMS-MT","07700900555","07700900111","","00:00:00",3],
      ["01/09/2024","15:11:26","Voice","07700900111","07700900444","3","00:01:58",0],
      ["01/09/2024","16:59:44","Voice","07700900111","07700900222","3","00:00:52",0]
    ];
    var lines = ["URN:,,,,IR774120","Grade:,,,,OFFICIAL-SENSITIVE","Target identity:,,,,07700900111","Operator:,,,,EE","", H.join(","), ""];
    evs.forEach(function (e, i) {
      var c = cells[e[7]]; var imei = (i === 7) ? "350000000000099" : "350000000000012"; // one SIM-swap
      var row = [e[0], e[1], e[0], e[1], e[3], e[4], "", e[2], "234300000000001", imei, e[5], e[6], "", "", "", "", "", "GBR", "EE", c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], "", "", "", "", "", "", "", "", String(i + 1)];
      lines.push(row.map(function (v) { v = String(v); return /[",]/.test(v) ? '"' + v + '"' : v; }).join(","));
    });
    return lines.join("\n");
  }

  /* ---- scoped styles ---- */
  function injectStyle() {
    if (doc.getElementById("cd-style")) return;
    var css = [
      "#cd-overlay{position:fixed;inset:0;z-index:9000;background:rgba(6,10,18,.72);backdrop-filter:blur(3px);display:flex;padding:2.5vh 2.5vw}",
      "#cd-overlay[hidden]{display:none}",
      ".cd-panel{margin:auto;width:100%;height:95vh;max-width:1400px;display:flex;flex-direction:column;background:var(--panel,#0e141f);border:1px solid var(--line,#26303f);border-radius:12px;overflow:hidden;color:var(--ink,#dce4f0);font:13px/1.45 system-ui,Segoe UI,Roboto,sans-serif}",
      ".cd-inline{margin:0;width:100%;height:100%;max-width:none;border:none;border-radius:0}",
      ".cd-head{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line,#26303f)}",
      ".cd-title{font-weight:600}.cd-meta{color:#8fa3bd;font-size:12px}.cd-spacer{flex:1}",
      ".cd-bar{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line,#26303f)}",
      ".cd-drop{flex:1;display:flex;align-items:center;justify-content:center;padding:10px;border:1px dashed #3a4a5f;border-radius:8px;color:#9fb2cc;cursor:pointer}",
      ".cd-drop.cd-drag{border-color:#e8a13a;color:#e8a13a}.cd-file{display:none}",
      ".cd-btn{background:#1a2434;color:#dce4f0;border:1px solid #2c3a4e;border-radius:7px;padding:7px 12px;cursor:pointer;font:inherit}.cd-btn:hover{border-color:#40546e}.cd-btn:disabled{opacity:.45;cursor:default}",
      ".cd-summary{display:flex;flex-wrap:wrap;gap:8px;padding:8px 14px;border-bottom:1px solid var(--line,#26303f)}",
      ".cd-chip{background:#141d2b;border:1px solid #26303f;border-radius:20px;padding:3px 10px;font-size:12px;color:#9fb2cc}.cd-chip b{color:#dce4f0}.cd-chip.cd-warn{border-color:#c9603a;color:#e8a13a}",
      ".cd-tabs{display:flex;gap:4px;padding:8px 14px 0}",
      ".cd-tab{background:transparent;border:none;border-bottom:2px solid transparent;color:#8fa3bd;padding:7px 12px;cursor:pointer;font:inherit}.cd-tab-on{color:#e8a13a;border-bottom-color:#e8a13a}",
      ".cd-body{flex:1;min-height:0;position:relative}",
      ".cd-pane{position:absolute;inset:0;overflow:auto;padding:12px 14px}",
      "#cd-map{position:absolute;inset:0;background:#0a0f18}.cd-map-offline{background:#0a0f18}",
      ".cd-tablewrap{overflow:auto;max-height:100%}",
      ".cd-table{border-collapse:collapse;width:100%;font-size:12px}",
      ".cd-table th,.cd-table td{border:1px solid #222c3a;padding:4px 7px;text-align:left;white-space:nowrap}",
      ".cd-table th{position:sticky;top:0;background:#141d2b;color:#b9c8dd}.cd-num{text-align:right;font-variant-numeric:tabular-nums}",
      ".cd-empty{color:#7d8ea6;padding:24px;text-align:center}",
      ".cd-tl-ctrl{display:flex;align-items:center;gap:8px;margin-bottom:10px;color:#9fb2cc}.cd-slider{flex:1;max-width:360px}",
      ".cd-tl{list-style:none;margin:0;padding:0}",
      ".cd-tl-item{display:grid;grid-template-columns:150px 1fr auto;gap:12px;padding:7px 8px;border-left:2px solid #26303f;margin-left:6px}",
      ".cd-tl-item.cd-tl-geo{cursor:pointer;border-left-color:#e8a13a}.cd-tl-item.cd-tl-geo:hover{background:#131c29}",
      ".cd-tl-time{color:#8fa3bd;font-variant-numeric:tabular-nums}.cd-tl-loc{color:#9fb2cc}",
      ".cd-pop{font:12px system-ui}.cd-pop-t{font-weight:600;margin-bottom:3px}"
    ].join("\n");
    var st = el("style"); st.id = "cd-style"; st.textContent = css; doc.head.appendChild(st);
  }

  var api = { open: open, close: close, mount: mount, _ingestRows: _ingestRows };
  if (typeof window !== "undefined") { window.RegistryCommsView = api; }
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})();
