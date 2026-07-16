/* comms-link-view.js — Analyse "Cross-file link & co-location" tool.
 * Load several CDR/ANPR returns (one per subject), then see shared contacts,
 * direct target-to-target links, and co-locations (same cell/camera or nearby
 * within a time window). Reuses comms-data (parsing/geo) + comms-link (analysis)
 * + Leaflet (map). XSS-safe (textContent only). window.RegistryCommsLinkView. */
"use strict";
(function () {
  var CD = (typeof window !== "undefined") ? window.RegistryCommsData : (typeof require !== "undefined" ? require("../js/core/comms-data.js") : null);
  var CL = (typeof window !== "undefined") ? window.RegistryCommsLink : (typeof require !== "undefined" ? require("../js/core/comms-link.js") : null);
  var doc = (typeof document !== "undefined") ? document : null;

  var state = { datasets: [], built: false, tab: "contacts", map: null, layers: [], cc: null, co: null };

  function el(t, c, x) { var e = doc.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function pad(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
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
    panel.appendChild(bar);

    var rail = el("div", "cl-rail"); rail.id = "cl-rail"; panel.appendChild(rail);

    var tabs = el("div", "cl-tabs");
    [["contacts", "Common contacts"], ["coloc", "Co-location"]].forEach(function (t) {
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
    panel.appendChild(body);

    host.appendChild(panel); state.built = true;
    renderRail();
  }
  function mount(host) { ensureBuilt(host); }
  function refresh() { if (state.map) setTimeout(function () { state.map.invalidateSize(); }, 30); }

  function showTab(t) {
    state.tab = t;
    var pc = doc.getElementById("cl-pane-contacts"), pl = doc.getElementById("cl-pane-coloc");
    if (pc) pc.toggleAttribute("hidden", t !== "contacts");
    if (pl) pl.toggleAttribute("hidden", t !== "coloc");
    var tb = doc.querySelectorAll(".cl-tab");
    for (var i = 0; i < tb.length; i++) tb[i].classList.toggle("cl-tab-on", tb[i].dataset.tab === t);
    if (t === "coloc") renderMap();
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
      chip.appendChild(el("b", null, d.label));
      chip.appendChild(doc.createTextNode(" · " + (d.events ? d.events.length : 0) + " events"));
      var x = el("button", "cl-x", "×"); x.type = "button"; x.title = "Remove"; x.onclick = function () { removeDataset(i); }; chip.appendChild(x);
      rail.appendChild(chip);
    });
  }

  /* ---- analyse ---- */
  function analyse() {
    if (!CL || state.datasets.length < 2) { flash("Load at least two subjects."); return; }
    state.cc = CL.commonContacts(state.datasets);
    var win = +(doc.getElementById("cl-window") || {}).value || 60;
    var rad = +(doc.getElementById("cl-radius") || {}).value; if (isNaN(rad)) rad = 250;
    state.co = CL.coLocations(state.datasets, { windowMins: win, radiusM: rad });
    renderContacts(); renderColoc();
    if (state.tab === "coloc") renderMap();
    flash(state.cc.shared.length + " shared contacts · " + state.cc.directLinks.length + " direct links · " + state.co.length + " co-locations");
  }

  function tableFrom(headers, rows, emptyMsg) {
    if (!rows.length) return el("p", "cl-empty", emptyMsg);
    var wrap = el("div", "cl-tablewrap"), t = el("table", "cl-table"), thead = el("thead"), htr = el("tr");
    headers.forEach(function (h) { htr.appendChild(el("th", null, h)); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = el("tbody");
    rows.forEach(function (cells) { var tr = el("tr"); cells.forEach(function (c) { tr.appendChild(el("td", null, c == null ? "" : String(c))); }); tb.appendChild(tr); });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  }

  function renderContacts() {
    var pane = doc.getElementById("cl-pane-contacts"); if (!pane) return; clear(pane);
    if (!state.cc) { pane.appendChild(el("p", "cl-empty", "Load two or more subjects and select Analyse.")); return; }
    pane.appendChild(el("h3", "cl-h", "Direct contact between subjects"));
    pane.appendChild(tableFrom(["From", "To", "Number", "Events"],
      state.cc.directLinks.map(function (l) { return [l.from, l.to, l.via, l.count]; }),
      "No direct subject-to-subject contact found."));
    pane.appendChild(el("h3", "cl-h", "Shared contacts (two or more subjects)"));
    pane.appendChild(tableFrom(["Contact", "# subjects", "Subjects (counts)", "Total events"],
      state.cc.shared.map(function (s) {
        var per = s.targets.map(function (t) { return t + " (" + s.perTarget[t] + ")"; }).join(", ");
        return [s.contact + (s.isTargetIdentity ? "  ⟵ a loaded subject" : ""), s.targetCount, per, s.total];
      }), "No contacts are shared across subjects."));
  }

  function renderColoc() {
    var host = doc.getElementById("cl-coloc-table"); if (!host) return; clear(host);
    if (!state.co) { host.appendChild(el("p", "cl-empty", "Load two or more subjects and select Analyse.")); return; }
    host.appendChild(tableFrom(["Subject A", "Subject B", "Location", "A time", "B time", "Gap (min)"],
      state.co.map(function (r) { return [r.targetA, r.targetB, r.place, fmtDt(r.timeA), fmtDt(r.timeB), r.gapMins]; }),
      "No co-locations within the current window/radius."));
  }

  function renderMap() {
    var hostEl = doc.getElementById("cl-map"); if (!hostEl) return;
    if (typeof L === "undefined") { hostEl.textContent = "Map library unavailable."; return; }
    var pts = (state.co || []).filter(function (r) { return r.lat != null && r.lon != null; });
    if (!state.map) {
      state.map = L.map(hostEl, { zoomControl: true }).setView([54, -2], 6);
      var tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
      tiles.on("tileerror", function () { hostEl.classList.add("cl-map-offline"); });
      tiles.addTo(state.map);
    }
    state.layers.forEach(function (l) { state.map.removeLayer(l); }); state.layers = [];
    var lls = [];
    pts.forEach(function (r) {
      var ll = [r.lat, r.lon]; lls.push(ll);
      var mk = L.circleMarker(ll, { radius: 7, color: "#e05a5a", weight: 2, fillColor: "#e05a5a", fillOpacity: 0.75 });
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

  function injectStyle() {
    if (doc.getElementById("cl-style")) return;
    var css = [
      ".cl-panel{display:flex;flex-direction:column;color:var(--ink,#dce4f0);font:13px/1.45 system-ui,Segoe UI,Roboto,sans-serif;background:var(--panel,#0e141f)}",
      ".cl-inline{width:100%;height:100%}",
      ".cl-head{display:flex;gap:12px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line,#26303f)}.cl-title{font-weight:600}.cl-meta{color:#8fa3bd;font-size:12px}",
      ".cl-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line,#26303f)}",
      ".cl-drop{display:flex;align-items:center;padding:7px 10px;border:1px dashed #3a4a5f;border-radius:8px;color:#9fb2cc;cursor:pointer}.cl-file{display:none}",
      ".cl-btn{background:#1a2434;color:#dce4f0;border:1px solid #2c3a4e;border-radius:7px;padding:7px 12px;cursor:pointer;font:inherit}.cl-btn:hover{border-color:#40546e}",
      ".cl-ctl{color:#9fb2cc;display:flex;align-items:center;gap:4px}.cl-num{width:64px;background:#141d2b;border:1px solid #26303f;color:#dce4f0;border-radius:5px;padding:4px 6px}",
      ".cl-rail{display:flex;flex-wrap:wrap;gap:8px;padding:8px 14px;border-bottom:1px solid var(--line,#26303f);min-height:20px}",
      ".cl-subj{background:#141d2b;border:1px solid #26303f;border-radius:20px;padding:3px 6px 3px 12px;font-size:12px;color:#9fb2cc;display:flex;align-items:center;gap:8px}.cl-subj b{color:#dce4f0}",
      ".cl-x{background:none;border:none;color:#8fa3bd;cursor:pointer;font-size:15px;line-height:1;padding:0 4px}.cl-x:hover{color:#e05a5a}",
      ".cl-tabs{display:flex;gap:4px;padding:8px 14px 0}.cl-tab{background:none;border:none;border-bottom:2px solid transparent;color:#8fa3bd;padding:7px 12px;cursor:pointer;font:inherit}.cl-tab-on{color:#e8a13a;border-bottom-color:#e8a13a}",
      ".cl-body{flex:1;min-height:0;position:relative}.cl-pane{position:absolute;inset:0;overflow:auto;padding:12px 14px}",
      ".cl-h{margin:14px 0 6px;font-size:13px;color:#b9c8dd}.cl-h:first-child{margin-top:0}",
      ".cl-tablewrap{overflow:auto}.cl-table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:6px}",
      ".cl-table th,.cl-table td{border:1px solid #222c3a;padding:4px 7px;text-align:left;white-space:nowrap}.cl-table th{position:sticky;top:0;background:#141d2b;color:#b9c8dd}",
      ".cl-coloc-table{max-height:45%;overflow:auto;margin-bottom:10px}",
      ".cl-map{position:relative;height:50%;min-height:220px;background:#0a0f18}.cl-map-offline{background:#0a0f18}",
      ".cl-empty{color:#7d8ea6;padding:16px;text-align:center}",
      ".cl-pop{font:12px system-ui}.cl-pop-t{font-weight:600;margin-bottom:3px}"
    ].join("\n");
    var st = el("style"); st.id = "cl-style"; st.textContent = css; doc.head.appendChild(st);
  }

  var api = { mount: mount, refresh: refresh, _addDataset: _addDataset, _analyse: analyse, _loadDemo: loadDemo, _state: state };
  if (typeof window !== "undefined") { window.RegistryCommsLinkView = api; }
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})();
