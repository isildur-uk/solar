/* comms-link-view.js — Analyse "Cross-file link & co-location" tool.
 * Load several CDR/ANPR returns (one per subject), then see shared contacts,
 * direct target-to-target links, and co-locations (same cell/camera or nearby
 * within a time window). Reuses comms-data (parsing/geo) + comms-link (analysis)
 * + Leaflet (map). XSS-safe (textContent only). window.RegistryCommsLinkView. */
"use strict";
(function () {
  var CD = (typeof window !== "undefined") ? window.RegistryCommsData : (typeof require !== "undefined" ? require("../js/core/comms-data.js") : null);
  var CL = (typeof window !== "undefined") ? window.RegistryCommsLink : (typeof require !== "undefined" ? require("../js/core/comms-link.js") : null);
  var NW = (typeof window !== "undefined") ? window.CRCommsNetwork : (typeof require !== "undefined" ? require("../js/core/comms-network.js") : null);
  var doc = (typeof document !== "undefined") ? document : null;

  var state = { datasets: [], built: false, tab: "contacts", map: null, layers: [], cc: null, co: null, net: null, netInstance: null };

  function el(t, c, x) { var e = doc.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function pad(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
  // inline SVG × (never an emoji/glyph as a UI icon, per DESIGN.md)
  function svgX() {
    var ns = "http://www.w3.org/2000/svg", s = doc.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 12 12"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.6"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("aria-hidden", "true");
    var a = doc.createElementNS(ns, "path"); a.setAttribute("d", "M3 3l6 6");
    var b = doc.createElementNS(ns, "path"); b.setAttribute("d", "M9 3l-6 6");
    s.appendChild(a); s.appendChild(b); return s;
  }
  function fmtDt(d) { if (!(d instanceof Date) || isNaN(d)) return ""; return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  function ensureBuilt(host) {
    if (state.built) return;
    injectStyle();
    var panel = el("div", "cl-panel cl-inline");

    var head = el("div", "cl-head");
    head.appendChild(el("span", "cl-title", "Cross-file link & co-location"));
    var meta = el("span", "cl-meta"); meta.id = "cl-meta"; head.appendChild(meta);
    panel.appendChild(head);

    var bar = el("div", "cl-bar");
    var drop = el("label", "cl-drop");
    drop.appendChild(el("span", null, "Add returns (one per subject) — CSV or ADM XLSX"));
    var input = el("input"); input.type = "file"; input.accept = ".csv,.xlsx,.xls"; input.multiple = true; input.className = "cl-file";
    input.onchange = function () { if (input.files && input.files.length) onFiles(input.files); input.value = ""; };
    drop.appendChild(input); bar.appendChild(drop);
    var demo = el("button", "cl-btn", "Load demo (phones + vehicle)"); demo.type = "button"; demo.onclick = loadDemo; bar.appendChild(demo);
    // co-location controls
    var cw = el("label", "cl-ctl", "Window (min) "); var win = el("input"); win.type = "number"; win.id = "cl-window"; win.value = "60"; win.min = "1"; win.className = "cl-num"; cw.appendChild(win); bar.appendChild(cw);
    var cr = el("label", "cl-ctl", "Radius (m) "); var rad = el("input"); rad.type = "number"; rad.id = "cl-radius"; rad.value = "250"; rad.min = "0"; rad.className = "cl-num"; cr.appendChild(rad); bar.appendChild(cr);
    win.onchange = rad.onchange = function () { if (state.datasets.length) analyse(); };
    var runb = el("button", "cl-btn", "Analyse"); runb.type = "button"; runb.onclick = analyse; bar.appendChild(runb);
    var addb = el("button", "cl-btn", "Add to case"); addb.type = "button"; addb.id = "cl-addcase"; addb.title = "Add these subjects, shared contacts and co-locations to the shared SOLAR case"; addb.onclick = addToCase; bar.appendChild(addb);
    panel.appendChild(bar);

    var rail = el("div", "cl-rail"); rail.id = "cl-rail"; panel.appendChild(rail);

    var tabs = el("div", "cl-tabs");
    [["contacts", "Common contacts"], ["coloc", "Co-location"], ["network", "Network"], ["matrix", "Matrix"]].forEach(function (t) {
      var b = el("button", "cl-tab", t[1]); b.type = "button"; b.dataset.tab = t[0]; b.onclick = function () { showTab(t[0]); };
      if (t[0] === "contacts") b.classList.add("cl-tab-on"); tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var body = el("div", "cl-body");
    var pc = el("div", "cl-pane"); pc.id = "cl-pane-contacts"; body.appendChild(pc);
    var pl = el("div", "cl-pane"); pl.id = "cl-pane-coloc"; pl.setAttribute("hidden", "");
    var tbl = el("div", "cl-coloc-table"); tbl.id = "cl-coloc-table"; pl.appendChild(tbl);
    var mp = el("div"); mp.id = "cl-map"; mp.className = "cl-map"; pl.appendChild(mp);
    body.appendChild(pl);
    var pn = el("div", "cl-pane"); pn.id = "cl-pane-network"; pn.setAttribute("hidden", ""); body.appendChild(pn);
    var pmx = el("div", "cl-pane"); pmx.id = "cl-pane-matrix"; pmx.setAttribute("hidden", ""); body.appendChild(pmx);
    panel.appendChild(body);

    host.appendChild(panel); state.built = true;
    renderRail();
  }
  function mount(host) { ensureBuilt(host); }
  function refresh() { if (state.map) setTimeout(function () { state.map.invalidateSize(); }, 30); }

  function showTab(t) {
    state.tab = t;
    ["contacts", "coloc", "network", "matrix"].forEach(function (x) { var p = doc.getElementById("cl-pane-" + x); if (p) p.toggleAttribute("hidden", x !== t); });
    var tb = doc.querySelectorAll(".cl-tab");
    for (var i = 0; i < tb.length; i++) tb[i].classList.toggle("cl-tab-on", tb[i].dataset.tab === t);
    if (t === "coloc") renderMap();
    if (t === "network") renderNetwork();
    if (t === "matrix") renderMatrix();
  }

  /* ---- ingest ---- */
  function onFiles(files) {
    Array.prototype.slice.call(files).forEach(function (f) {
      var name = (f.name || "").toLowerCase(), r = new FileReader();
      if (/\.(xlsx|xls)$/.test(name)) { r.onload = function () { try { addFromRows(sheetRows(r.result), f.name); } catch (e) { flash("XLSX error: " + e.message); } }; r.readAsArrayBuffer(f); }
      else { r.onload = function () { try { addFromRows(CD.parseDelimited(r.result), f.name); } catch (e) { flash("CSV error: " + e.message); } }; r.readAsText(f); }
    });
  }
  function sheetRows(buf) {
    if (typeof XLSX === "undefined") throw new Error("XLSX not loaded");
    var wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    var prefer = ["ADM Summary", "Events List", "Location List", "Call Data"], name = null;
    for (var p = 0; p < prefer.length; p++) if (wb.SheetNames.indexOf(prefer[p]) !== -1) { name = prefer[p]; break; }
    if (!name) { var bw = -1; wb.SheetNames.forEach(function (n) { if (/cover|glossary|formatting|reference|simple view/i.test(n)) return; var ref = wb.Sheets[n]["!ref"]; if (!ref) return; var w = XLSX.utils.decode_range(ref).e.c; if (w > bw) { bw = w; name = n; } }); }
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: true, defval: "" });
  }
  function addFromRows(rows, fname) {
    var res = CD.cleanFromRows(rows);
    var identity = res.meta && res.meta["Target identity"] ? res.meta["Target identity"] : "";
    var label = identity || (fname || "subject").replace(/\.[^.]+$/, "");
    _addDataset({ label: label, identity: identity, events: res.events });
  }
  function _addDataset(ds) { state.datasets.push(ds); renderRail(); if (state.datasets.length >= 2) analyse(); return state; }
  function removeDataset(i) { state.datasets.splice(i, 1); renderRail(); if (state.datasets.length >= 2) analyse(); else { state.cc = state.co = null; renderContacts(); renderColoc(); } }

  function renderRail() {
    var rail = doc.getElementById("cl-rail"); if (!rail) return; clear(rail);
    if (!state.datasets.length) { rail.appendChild(el("span", "cl-empty", "No subjects loaded — add returns or load the demo.")); return; }
    state.datasets.forEach(function (d, i) {
      var chip = el("span", "cl-subj");
      if (window.SolarEntityStyle) chip.appendChild(window.SolarEntityStyle.icon(window.SolarEntityStyle.typeOf(d.identity || d.label), 14)); // phone/vehicle glyph, Charting scheme
      chip.appendChild(el("b", null, d.label));
      chip.appendChild(doc.createTextNode(" · " + (d.events ? d.events.length : 0) + " events"));
      var x = el("button", "cl-x"); x.type = "button"; x.title = "Remove"; x.setAttribute("aria-label", "Remove subject"); x.appendChild(svgX()); x.onclick = function () { removeDataset(i); }; chip.appendChild(x);
      rail.appendChild(chip);
    });
  }

  /* ---- network + matrix (structural analysis) ---- */
  function shortNum(x){ x = String(x || ""); return x.length > 8 ? x.slice(-7) : x; }
  function renderNetwork(){
    var pane = doc.getElementById("cl-pane-network"); if (!pane) return; clear(pane);
    if (!NW){ pane.appendChild(el("p", "cl-empty", "Network module unavailable.")); return; }
    if (state.datasets.length < 2){ pane.appendChild(el("p", "cl-empty", "Load at least two subjects to build the network.")); return; }
    if (!state.net) state.net = NW.build(state.datasets);
    var g = state.net;
    var gc = el("div", "cl-graph"); gc.id = "cl-graph"; pane.appendChild(gc);
    if (typeof vis !== "undefined"){ try { renderVis(gc, g); } catch (e){ clear(gc); gc.appendChild(el("p", "cl-empty", "Graph error: " + e.message)); } }
    else gc.appendChild(el("p", "cl-empty", "Interactive graph loads in the browser \u2014 ranked structure is below."));
    pane.appendChild(el("p", "cl-note", "Node size = contact volume; amber ring = broker / cut-out (bridges otherwise-separate clusters); amber fill = a loaded subject. Structural only \u2014 not seniority."));
    pane.appendChild(el("h3", "cl-h", "Structural ranking \u2014 hubs & brokers"));
    var rows = g.ranked.slice(0, 30).map(function(n, i){ return [i + 1, n.label, n.degree, n.betweenness, n.weightedDegree, (n.isTarget ? "subject" : "") + (n.broker ? (n.isTarget ? ", broker" : "broker") : "")]; });
    pane.appendChild(tableFrom(["#", "Number", "Degree", "Betweenness", "Volume", "Role"], rows, "No network."));
  }
  function renderVis(container, g){
    var nodes = g.nodes.map(function(n){ return { id: n.id, label: n.label, value: Math.max(1, n.weightedDegree), shape: "dot",
      color: { background: (n.isTarget ? "#e8a13a" : "#8ea2ff"), border: (n.broker ? "#e8a13a" : "#26303f"), highlight: { background: "#b9c8dd", border: "#e8a13a" } },
      borderWidth: (n.broker ? 3 : 1), font: { color: "#b9c8dd", size: 12 } }; });
    var edges = g.edges.map(function(e){ return { from: e.from, to: e.to, value: e.weight, color: { color: "rgba(142,162,255,.30)", highlight: "#8ea2ff" } }; });
    state.netInstance = new vis.Network(container, { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) },
      { nodes: { scaling: { min: 6, max: 28 } }, edges: { scaling: { min: 1, max: 6 }, smooth: false }, physics: { stabilization: { iterations: 150 }, barnesHut: { springLength: 130 } }, interaction: { hover: true, tooltipDelay: 120 } });
  }
  function renderMatrix(){
    var pane = doc.getElementById("cl-pane-matrix"); if (!pane) return; clear(pane);
    if (!NW){ pane.appendChild(el("p", "cl-empty", "Network module unavailable.")); return; }
    if (state.datasets.length < 2){ pane.appendChild(el("p", "cl-empty", "Load at least two subjects.")); return; }
    if (!state.net) state.net = NW.build(state.datasets);
    var g = state.net, ids = g.matrixOrder.slice(0, 40), n = ids.length;
    if (!n){ pane.appendChild(el("p", "cl-empty", "No network.")); return; }
    var max = 1; Object.keys(g.matrixCounts).forEach(function(k){ if (g.matrixCounts[k] > max) max = g.matrixCounts[k]; });
    var labelOf = {}; g.nodes.forEach(function(nd){ labelOf[nd.id] = nd.label; });
    pane.appendChild(el("p", "cl-note", "Who contacts whom \u2014 cell shade = volume; dense blocks = tight sub-groups. Ordered by volume; top 40 shown. A cell is contact between two lines, not a meeting."));
    var wrap = el("div", "cl-tablewrap"), t = el("table", "cl-matrix"), thead = el("thead"), htr = el("tr");
    htr.appendChild(el("th", "cl-mx-corner", ""));
    ids.forEach(function(id){ var th = el("th", "cl-mx-colh"); th.appendChild(el("span", null, shortNum(labelOf[id] || id))); htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = el("tbody");
    ids.forEach(function(ri){ var tr = el("tr"); tr.appendChild(el("th", "cl-mx-rowh", shortNum(labelOf[ri] || ri)));
      ids.forEach(function(ci){ var td = el("td", "cl-mx-cell");
        if (ri === ci) td.className = "cl-mx-cell cl-mx-diag";
        else { var c = g.matrixCounts[ri + "|" + ci] || 0; if (c){ td.style.background = "rgba(142,162,255," + (0.12 + 0.7 * c / max).toFixed(2) + ")"; td.title = (labelOf[ri] || ri) + " \u2194 " + (labelOf[ci] || ci) + ": " + c; } }
        tr.appendChild(td); });
      tb.appendChild(tr); });
    t.appendChild(tb); wrap.appendChild(t); pane.appendChild(wrap);
  }

  /* ---- analyse ---- */
  function analyse() {
    if (!CL || state.datasets.length < 2) { flash("Load at least two subjects."); return; }
    state.cc = CL.commonContacts(state.datasets);
    var win = +(doc.getElementById("cl-window") || {}).value || 60;
    var rad = +(doc.getElementById("cl-radius") || {}).value; if (isNaN(rad)) rad = 250;
    state.co = CL.coLocations(state.datasets, { windowMins: win, radiusM: rad });
    state.net = null;
    renderContacts(); renderColoc(); renderNetwork(); renderMatrix();
    if (state.tab === "coloc") renderMap();
    flash(state.cc.shared.length + " shared contacts · " + state.cc.directLinks.length + " direct links · " + state.co.length + " co-locations");
  }

  // types: optional per-column entity type (e.g. "phone"/"location") -> hue class, matching Charting/Database.
  function tableFrom(headers, rows, emptyMsg, types) {
    if (!rows.length) return el("p", "cl-empty", emptyMsg);
    var wrap = el("div", "cl-tablewrap"), t = el("table", "cl-table"), thead = el("thead"), htr = el("tr");
    headers.forEach(function (h) { htr.appendChild(el("th", null, h)); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = el("tbody");
    rows.forEach(function (cells) {
      var tr = el("tr");
      cells.forEach(function (c, ci) { tr.appendChild(el("td", (types && types[ci]) ? "cl-ent-" + types[ci] : null, c == null ? "" : String(c))); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  }

  function renderContacts() {
    var pane = doc.getElementById("cl-pane-contacts"); if (!pane) return; clear(pane);
    if (!state.cc) { pane.appendChild(el("p", "cl-empty", "Load two or more subjects and select Analyse.")); return; }
    pane.appendChild(el("h3", "cl-h", "Direct contact between subjects"));
    pane.appendChild(tableFrom(["From", "To", "Number", "Events"],
      state.cc.directLinks.map(function (l) { return [l.from, l.to, l.via, l.count]; }),
      "No direct subject-to-subject contact found.", ["phone", "phone", "phone", null]));
    pane.appendChild(el("h3", "cl-h", "Shared contacts (two or more subjects)"));
    pane.appendChild(tableFrom(["Contact", "# subjects", "Subjects (counts)", "Total events"],
      state.cc.shared.map(function (s) {
        var per = s.targets.map(function (t) { return t + " (" + s.perTarget[t] + ")"; }).join(", ");
        return [s.contact + (s.isTargetIdentity ? "  ⟵ a loaded subject" : ""), s.targetCount, per, s.total];
      }), "No contacts are shared across subjects.", ["phone", null, null, null]));
  }

  function renderColoc() {
    var host = doc.getElementById("cl-coloc-table"); if (!host) return; clear(host);
    if (!state.co) { host.appendChild(el("p", "cl-empty", "Load two or more subjects and select Analyse.")); return; }
    host.appendChild(tableFrom(["Subject A", "Subject B", "Location", "A time", "B time", "Gap (min)"],
      state.co.map(function (r) { return [r.targetA, r.targetB, r.place, fmtDt(r.timeA), fmtDt(r.timeB), r.gapMins]; }),
      "No co-locations within the current window/radius.", ["phone", "phone", "location", null, null, null]));
  }

  function renderMap() {
    var hostEl = doc.getElementById("cl-map"); if (!hostEl) return;
    if (typeof L === "undefined") { hostEl.textContent = "Map library unavailable."; return; }
    var pts = (state.co || []).filter(function (r) { return r.lat != null && r.lon != null; });
    if (!state.map) {
      state.map = L.map(hostEl, { zoomControl: true }).setView([54, -2], 6);
      var tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: "© OpenStreetMap © CARTO" });
      tiles.on("tileerror", function () { hostEl.classList.add("cl-map-offline"); });
      tiles.addTo(state.map);
    }
    state.layers.forEach(function (l) { state.map.removeLayer(l); }); state.layers = [];
    var lls = [];
    pts.forEach(function (r) {
      var ll = [r.lat, r.lon]; lls.push(ll);
      var mk = L.circleMarker(ll, { radius: 7, color: "#d86a6a", weight: 2, fillColor: "#d86a6a", fillOpacity: 0.75 });
      var pop = el("div", "cl-pop");
      pop.appendChild(el("div", "cl-pop-t", r.targetA + " ↔ " + r.targetB));
      if (r.place) pop.appendChild(el("div", null, r.place));
      pop.appendChild(el("div", null, fmtDt(r.timeA) + "  /  " + fmtDt(r.timeB) + "  (" + r.gapMins + " min)"));
      mk.bindPopup(pop); mk.addTo(state.map); state.layers.push(mk);
    });
    if (lls.length) state.map.fitBounds(L.latLngBounds(lls).pad(0.3));
    setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 40);
  }

  function flash(m) { var n = doc.getElementById("cl-meta"); if (n) n.textContent = m; }

  /* ---- demo: three subjects (A & B linked + co-located; C isolated) ---- */
  function loadDemo() {
    state.datasets = [];
    var A = "Luton Town Hall", cA = { id: "LTN-A", name: A, lat: 51.8790, lon: -0.4200 };
    var cB = { id: "LTN-B", name: "Bury Park", lat: 51.8823, lon: -0.4351 };
    var cC = { id: "DUN-C", name: "Dunstable Central", lat: 51.8865, lon: -0.5210 };
    function ev(dt, cell, a, b) { return { startDt: dt, aParty: a, bParty: b, startCell: { id: cell.id }, cellName: cell.name, lat: cell.lat, lon: cell.lon }; }
    _addDataset({ label: "07700900111", identity: "07700900111", events: [
      ev("01/09/2024 08:00", cA, "07700900111", "07700900222"),
      ev("01/09/2024 08:05", cA, "07700900111", "07700900999"),
      ev("01/09/2024 12:30", cA, "07700900111", "07700900444") ] });
    _addDataset({ label: "07700900222", identity: "07700900222", events: [
      ev("01/09/2024 08:15", cA, "07700900222", "07700900999"),
      ev("01/09/2024 08:40", cA, "07700900222", "07700900111"),
      ev("01/09/2024 15:00", cB, "07700900222", "07700900555") ] });
    _addDataset({ label: "07700900333", identity: "07700900333", events: [
      ev("01/09/2024 09:00", cC, "07700900333", "07700900888") ] });
    // an ANPR vehicle sighted at the same cameras/locations (co-locates with 111/222)
    function vev(dt, cell, vrm) { return { startDt: dt, aParty: vrm, type: "ANPR sighting", startCell: { id: cell.id + "-CAM" }, cellName: cell.name + " ANPR", lat: cell.lat, lon: cell.lon }; }
    _addDataset({ label: "Vehicle LD12 ABC", identity: "LD12ABC", events: [
      vev("01/09/2024 07:55", cA, "LD12ABC"),
      vev("01/09/2024 10:20", cB, "LD12ABC"),
      vev("01/09/2024 12:35", cA, "LD12ABC") ] });
    analyse();
  }

  function addToCase() {
    if (typeof window === "undefined" || !window.SolarCase || !window.CRCommsCase) { flash("Shared case spine unavailable."); return; }
    if (!state.cc) { flash("Load subjects and Analyse first."); return; }
    var parts = window.CRCommsCase.fromLink(state.cc, state.co || []);
    var s = window.SolarCase.merge(parts);
    flash("Added " + parts.entities.length + " subjects/contacts + " + parts.links.length + " links to the shared case (" + s.entities + " total).");
  }

  function injectStyle() {
    if (doc.getElementById("cl-style")) return;
    var css = [
      ".cl-panel{display:flex;flex-direction:column;color:var(--text);font:var(--fs-sm)/1.45 var(--sans);background:transparent}",
      ".cl-inline{width:100%;height:100%}",
      ".cl-head{display:flex;gap:12px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)}.cl-title{font-weight:600}.cl-meta{color:var(--faint);font-size:var(--fs-xs)}",
      ".cl-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line)}",
      ".cl-drop{display:flex;align-items:center;padding:7px 10px;border:1px dashed var(--line-2);border-radius:var(--radius);color:var(--dim);cursor:pointer}.cl-file{display:none}",
      ".cl-btn{background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:7px 12px;cursor:pointer;font:inherit}.cl-btn:hover{border-color:var(--accent-dim)}",
      ".cl-ctl{color:var(--dim);display:flex;align-items:center;gap:4px}.cl-num{width:64px;background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:var(--radius);padding:4px 6px;font-family:var(--mono);accent-color:var(--accent)}",
      ".cl-rail{display:flex;flex-wrap:wrap;gap:8px;padding:8px 14px;border-bottom:1px solid var(--line);min-height:20px}",
      ".cl-subj{background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:3px 6px 3px 12px;font-size:var(--fs-xs);color:var(--dim);display:flex;align-items:center;gap:8px}.cl-subj b{color:var(--text);font-family:var(--mono)}",
      ".cl-x{background:none;border:none;color:var(--faint);cursor:pointer;line-height:1;padding:0 4px;display:inline-flex;align-items:center}.cl-x:hover{color:var(--bad)}.cl-x svg{width:11px;height:11px;display:block}",
      ".cl-tabs{display:flex;gap:4px;padding:8px 14px 0}.cl-tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--faint);padding:7px 12px;cursor:pointer;font:inherit}.cl-tab:hover{color:var(--dim)}.cl-tab-on{color:var(--accent);border-bottom-color:var(--accent)}",
      ".cl-body{flex:1;min-height:0;position:relative}.cl-pane{position:absolute;inset:0;overflow:auto;padding:12px 14px}",
      ".cl-h{margin:14px 0 6px;font-size:var(--fs-sm);color:var(--dim);font-weight:600}.cl-h:first-child{margin-top:0}",
      ".cl-note{color:var(--faint);font-size:var(--fs-xs);margin:2px 0 8px}",
      ".cl-graph{height:440px;background:var(--bg,#0a0f18);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:8px}",
      ".cl-matrix{border-collapse:collapse;font-size:var(--fs-2xs)}.cl-matrix th,.cl-matrix td{border:1px solid var(--line)}.cl-mx-cell{width:15px;height:15px}.cl-mx-diag{background:var(--panel-2)}",
      ".cl-mx-rowh{padding:2px 6px;text-align:right;white-space:nowrap;color:var(--dim);font-family:var(--mono);font-weight:400}",
      ".cl-mx-colh{height:66px;vertical-align:bottom;padding:0 1px}.cl-mx-colh span{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);color:var(--dim);font-family:var(--mono);white-space:nowrap;font-size:var(--fs-2xs)}",
      ".cl-tablewrap{overflow:auto}.cl-table{border-collapse:collapse;width:100%;font-size:var(--fs-xs);margin-bottom:6px}",
      ".cl-table th,.cl-table td{border:1px solid var(--line);padding:4px 7px;text-align:left;white-space:nowrap}.cl-table td{font-family:var(--mono);font-variant-numeric:tabular-nums}.cl-table th{position:sticky;top:0;background:var(--panel-2);color:var(--faint);font-family:var(--mono);font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.04em}",
      ".cl-table tbody tr:hover{background:rgba(142,162,255,.06)}",
      ".cl-ent-phone{color:var(--c-phone)}.cl-ent-location{color:var(--c-location)}.cl-ent-vehicle{color:var(--c-vehicle)}",
      ".ent-ico img{border-radius:3px;display:block}",
      ".cl-coloc-table{max-height:45%;overflow:auto;margin-bottom:10px}",
      ".cl-map{position:relative;height:50%;min-height:220px;background:var(--bg,#0a0f18)}.cl-map-offline{background:var(--bg,#0a0f18)}",
      ".cl-empty{color:var(--faint);padding:16px;text-align:center}",
      ".cl-pop{font:var(--fs-xs) var(--sans)}.cl-pop-t{font-weight:600;margin-bottom:3px}"
    ].join("\n");
    var st = el("style"); st.id = "cl-style"; st.textContent = css; doc.head.appendChild(st);
  }

  var api = { mount: mount, refresh: refresh, _addDataset: _addDataset, _analyse: analyse, _loadDemo: loadDemo, _state: state };
  if (typeof window !== "undefined") { window.RegistryCommsLinkView = api; }
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})();
