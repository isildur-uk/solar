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
  var CT = (typeof window !== "undefined") ? window.CRCommsContacts : (typeof require !== "undefined" ? require("../js/core/comms-contacts.js") : null);
  var CA = (typeof window !== "undefined") ? window.CRCommsAttribution : (typeof require !== "undefined" ? require("../js/core/comms-attribution.js") : null);
  var doc = (typeof document !== "undefined") ? document : null;

  var state = { res: null, events: [], summary: null, sorted: [], map: null, mapLayers: null, filterN: null, built: false, tab: "table", showAllCols: false, i2Format: true };
  var KM_PER_MI = 1.609344;
  function mi(km) { return km == null ? null : Math.round((km / KM_PER_MI) * 10) / 10; }   // km -> miles, 1dp
  function mph(kmh) { return kmh == null ? null : Math.round(kmh / KM_PER_MI); }              // km/h -> mph
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
    var drop = el("label", "cd-drop"); drop.id = "cd-drop"; drop.title = "Drop a Call Data CSV or ADM Telephony XLSX, or click to choose";
    var dico = doc.createElement("span"); dico.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10.5V2.5M5 5l3-3 3 3"/><path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"/></svg>';
    drop.appendChild(dico);
    drop.appendChild(el("span", "cd-drop-txt", "Drop or choose CDR file"));
    var input = el("input"); input.type = "file"; input.accept = ".csv,.xlsx,.xls"; input.id = "cd-file"; input.className = "cd-file";
    input.onchange = function () { if (input.files && input.files[0]) onFile(input.files[0]); };
    drop.appendChild(input);
    bar.appendChild(drop);
    var demo = el("select", "cd-btn cd-demo"); demo.id = "cd-demo";
    demo.title = "Load a fictitious sample return (subjects overlap the Database sample reports)";
    [["", "Load sample data…"], ["3", "3-day sample"], ["14", "2 weeks"], ["28", "4 weeks"], ["56", "8 weeks"]].forEach(function (o) {
      var op = el("option", null, o[1]); op.value = o[0]; demo.appendChild(op);
    });
    demo.onchange = function () { if (demo.value) { loadDemo(+demo.value); demo.value = ""; } };
    bar.appendChild(demo);
    var exp = el("button", "cd-btn", "Export tidy CSV"); exp.type = "button"; exp.id = "cd-export"; exp.onclick = exportCsv; exp.disabled = true; bar.appendChild(exp);
    var addb = el("button", "cd-btn", "Add to case"); addb.type = "button"; addb.id = "cd-addcase"; addb.title = "Add these subjects, contacts and locations to the shared SOLAR case"; addb.disabled = true; addb.onclick = addToCase; bar.appendChild(addb);
    panel.appendChild(bar);

    // DnD
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("cd-drag"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("cd-drag"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("cd-drag"); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });

    // summary strip
    var sum = el("div", "cd-summary"); sum.id = "cd-summary"; panel.appendChild(sum);
    // cross-reference strip — which loaded identities are already known to the Database
    var xref = el("div", "cd-xref"); xref.id = "cd-xref"; xref.setAttribute("hidden", ""); panel.appendChild(xref);

    // tabs
    var tabs = el("div", "cd-tabs");
    [["table", "Cleaned table"], ["map", "Map"], ["timeline", "Timeline"], ["patterns", "Patterns"], ["journeys", "Journeys"], ["contacts", "Contacts"], ["handsets", "Handsets"]].forEach(function (t) {
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
    var cn = mk("cd-pane-contacts"); cn.setAttribute("hidden", ""); body.appendChild(cn);
    var hs = mk("cd-pane-handsets"); hs.setAttribute("hidden", ""); body.appendChild(hs);
    panel.appendChild(body);

    if (host) { host.appendChild(panel); }
    else { var ov = el("div", "cd-overlay"); ov.id = "cd-overlay"; ov.setAttribute("hidden", ""); ov.appendChild(panel); doc.body.appendChild(ov); }
    state.built = true;
    renderTable(); // show the empty-state hero until a return is loaded
    function mk(id) { var d = el("div", "cd-pane"); d.id = id; return d; }
    function mkId(tag, id) { var d = el(tag, null); d.id = id; return d; }
  }

  function showTab(t) {
    state.tab = t;
    ["table", "map", "timeline", "patterns", "journeys", "contacts", "handsets"].forEach(function (x) {
      var pane = doc.getElementById("cd-pane-" + x); if (pane) { if (x === t) pane.removeAttribute("hidden"); else pane.setAttribute("hidden", ""); }
    });
    var tabsEl = doc.querySelectorAll(".cd-tab");
    for (var i = 0; i < tabsEl.length; i++) tabsEl[i].classList.toggle("cd-tab-on", tabsEl[i].dataset.tab === t);
    if (t === "map") renderMap();
    if (t === "patterns") renderPatterns();
    if (t === "journeys") renderJourneys();
    if (t === "contacts") renderContacts();
    if (t === "handsets") renderHandsets();
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
    renderMeta(res); renderSummary(); renderCrossRef(); renderTable(); renderTimeline(); renderPatterns(); renderJourneys(); renderContacts(); renderHandsets();
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

  /* Cross-reference: which loaded identities are already known to the Database.
     Sources: the fixed known-entities overlap (SolarKnownEntities) plus anything
     in the live shared case (SolarCase). Shown as a strip under the summary. */
  function knownFor(type, value) {
    var KE = window.SolarKnownEntities, k = KE && KE.lookup(type, value);
    if (k) { return { label: k.label, where: k.operation, code: k.opCode }; }
    if (window.SolarCase && window.SolarCase.entities) {
      var key = String(value == null ? "" : value).replace(/\D/g, "");
      var e = window.SolarCase.entities().filter(function (x) {
        return x.type === type && String(x.identity || x.label).replace(/\D/g, "") === key && key;
      })[0];
      if (e) { return { label: e.label, where: "shared case", code: "CASE" }; }
    }
    return null;
  }
  function renderCrossRef() {
    var box = doc.getElementById("cd-xref"); if (!box) { return; }
    clear(box);
    var seen = {}, ids = [];
    state.sorted.forEach(function (ev) {
      [ev.aParty, ev.bParty, ev.fwdParty].forEach(function (p) { if (p && !seen[p]) { seen[p] = 1; ids.push(p); } });
    });
    var matches = [];
    ids.forEach(function (p) { var k = knownFor("phone", p); if (k) { matches.push({ v: p, k: k }); } });
    if (!matches.length) { box.setAttribute("hidden", ""); return; }
    box.removeAttribute("hidden");
    var lbl = el("span", "cd-xref-lbl"); lbl.appendChild(doc.createTextNode("Known to Database"));
    box.appendChild(lbl);
    matches.forEach(function (m) {
      var chip = el("span", "cd-xref-chip");
      if (window.SolarEntityStyle) { chip.appendChild(window.SolarEntityStyle.icon("phone", 12)); }
      chip.appendChild(el("b", null, m.v));
      chip.appendChild(doc.createTextNode(" " + m.k.label));
      chip.appendChild(el("span", "cd-xref-op", m.k.where));
      chip.setAttribute("data-tip", m.v + " is already known to the Database — " + m.k.label + " · " + m.k.where);
      box.appendChild(chip);
    });
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
  function renderEmptyState(pane) {
    var hero = el("div", "cd-empty-hero");
    var mark = doc.createElement("div"); mark.className = "cd-empty-mark";
    mark.innerHTML = "<svg viewBox='0 0 48 48' width='44' height='44' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round'>" +
      "<path d='M10 30v6M19 24v12M28 18v18M37 12v24'/><circle cx='24' cy='42' r='1.6' fill='currentColor' stroke='none'/></svg>";
    hero.appendChild(mark);
    hero.appendChild(el("h3", "cd-empty-h", "Comms-data analysis"));
    hero.appendChild(el("p", "cd-empty-sub", "Drop a Call Data CSV or ADM Telephony workbook onto the bar above — or load a fictitious sample return to explore the cleaning, mapping, timeline, pattern-of-life and journey tools."));
    var picks = el("div", "cd-empty-picks");
    [["3", "3-day sample"], ["14", "2 weeks"], ["28", "4 weeks"], ["56", "8 weeks"]].forEach(function (o) {
      var b = el("button", "cd-empty-pick", o[1]); b.type = "button";
      b.onclick = function () { loadDemo(+o[0]); };
      picks.appendChild(b);
    });
    hero.appendChild(picks);
    hero.appendChild(el("p", "cd-empty-note", "Sample subjects overlap the Database sample reports — once loaded, a “Known to Database” strip flags which identities are already on record, and where."));
    pane.appendChild(hero);
  }
  function renderTable() {
    var pane = doc.getElementById("cd-pane-table"); if (!pane) return; clear(pane);
    if (!state.sorted.length) { renderEmptyState(pane); return; }
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
        if (et === "phone" && knownFor("phone", ev[c.key])) cls += " cd-known";   // already in the Database
        var txt = cellText(c.key, ev[c.key]);
        var td = el("td", cls.trim() || null);
        // prepend the SAME entity glyph Charting uses (via SolarEntityStyle → CRIcons),
        // so a phone/cell reads identically here and on the chart. Only for populated
        // entity cells; the subject's own number keeps its accent (no icon clutter).
        if (et && txt && window.SolarEntityStyle && cls.indexOf("cd-subject") === -1) {
          td.appendChild(window.SolarEntityStyle.icon(et, 13));
        }
        td.appendChild(doc.createTextNode(txt));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); pane.appendChild(wrap);
  }

  // events grouped per calendar day, in order — for the timeline activity strip
  function eventsPerDay() {
    var map = {}, order = [];
    state.sorted.forEach(function (ev) {
      var d = parseDt(ev.startDt); if (!d) return;
      var key = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
      if (map[key] == null) { map[key] = 0; order.push({ key: key, label: p2(d.getDate()) + "/" + p2(d.getMonth() + 1) }); }
      map[key]++;
    });
    return order.map(function (o) { return { label: o.label, count: map[o.key] }; });
  }
  function typeMix() {
    var m = {};
    state.sorted.forEach(function (ev) { var t = (ev.type || "event").replace(/-M[OT]$/, ""); m[t] = (m[t] || 0) + 1; });
    return m;
  }
  var TYPE_COLOUR = { Voice: "#8ea2ff", SMS: "#79c98f", Data: "#d8a16e", event: "#8d99ae" };
  // ---- superior contact timeline (SVG swimlanes) --------------------------
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) { var n = doc.createElementNS(SVGNS, tag); if (attrs) { for (var k in attrs) { if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); } } return n; }
  function svgText(attrs, str) { var n = svg("text", attrs); n.textContent = str; return n; }
  function digits(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }
  function baseType(ev) { return String(ev.type || "event").replace(/-M[OT]$/, ""); }
  function hmsToSec(s) { var m = String(s == null ? "" : s).match(/(\d+):(\d+):(\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; }
  function fmtDur(sec) { if (!sec) return ""; var m = Math.floor(sec / 60), s = sec % 60; return m ? (m + "m" + (s ? " " + s + "s" : "")) : (s + "s"); }
  function counterparty(ev) {
    var a = digits(ev.aParty), b = digits(ev.bParty);
    if (state.target && a === state.target) return ev.bParty || "";
    if (state.target && b === state.target) return ev.aParty || "";
    return ev.bParty || ev.aParty || "";
  }
  function direction(ev) {
    var t = String(ev.type || ""); if (/-MO$/.test(t)) return "out"; if (/-MT$/.test(t)) return "in";
    var a = digits(ev.aParty), b = digits(ev.bParty);
    if (state.target && a === state.target) return "out";
    if (state.target && b === state.target) return "in";
    return "na";
  }
  function axisTicks(tMin, tMax, want) {
    var span = tMax - tMin, DAY = 86400000;
    var steps = [3600000, 6 * 3600000, 12 * 3600000, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 28 * DAY];
    var step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) { if (span / steps[i] <= want) { step = steps[i]; break; } }
    var ticks = [], t0 = Math.ceil(tMin / step) * step;
    for (var t = t0; t <= tMax; t += step) {
      var d = new Date(t);
      var lab = step < DAY ? (p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + " " + p2(d.getHours()) + ":00")
        : (p2(d.getDate()) + "/" + p2(d.getMonth() + 1));
      ticks.push({ t: t, label: lab });
    }
    return ticks;
  }
  function buildContactTimeline(pane) {
    var evs = state.sorted.map(function (ev) { var t = parseDt(ev.startDt); return t ? { ev: ev, t: t.getTime() } : null; }).filter(Boolean);
    if (evs.length < 2) return false;
    var tMin = evs[0].t, tMax = evs[evs.length - 1].t; if (tMax <= tMin) tMax = tMin + 1;
    var span = tMax - tMin;
    // group by counterparty; subject-only (Data / no B-party) events go to a network lane
    var byCp = {}, order = [];
    evs.forEach(function (x) { var cp = counterparty(x.ev) || "— network / cell"; if (!byCp[cp]) { byCp[cp] = []; order.push(cp); } byCp[cp].push(x); });
    order.sort(function (a, b) { return byCp[b].length - byCp[a].length; });
    var TOPN = 9;
    var lanes = order.slice(0, TOPN).map(function (cp) { return { name: cp, items: byCp[cp] }; });
    if (order.length > TOPN) { var rest = []; order.slice(TOPN).forEach(function (cp) { rest = rest.concat(byCp[cp]); }); lanes.push({ name: "+" + (order.length - TOPN) + " more", items: rest, agg: true }); }

    var W = 1000, gutter = 170, padR = 20, padT = 50, laneH = 30, axisH = 30;
    var plotX = gutter, plotW = W - gutter - padR;
    var H = padT + lanes.length * laneH + axisH;
    var xOf = function (t) { return plotX + (t - tMin) / span * plotW; };
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, class: "cd-tl-svg", width: "100%", preserveAspectRatio: "xMidYMid meet", role: "img" });

    // density ridge — overall activity over time (the "pulse" i2 never shows)
    var BUCKETS = 120, dens = []; for (var z = 0; z < BUCKETS; z++) dens.push(0);
    evs.forEach(function (x) { var bi = Math.min(BUCKETS - 1, Math.floor((x.t - tMin) / span * BUCKETS)); dens[bi]++; });
    var dMax = Math.max.apply(null, dens.concat([1])), ridgeH = 26, ridgeY = 12;
    var dpath = "M " + plotX + " " + (ridgeY + ridgeH);
    for (var r = 0; r < BUCKETS; r++) { dpath += " L " + (plotX + (r + 0.5) / BUCKETS * plotW).toFixed(1) + " " + (ridgeY + ridgeH - (dens[r] / dMax) * ridgeH).toFixed(1); }
    dpath += " L " + (plotX + plotW) + " " + (ridgeY + ridgeH) + " Z";
    root.appendChild(svg("path", { d: dpath, class: "cd-tl-ridge" }));
    root.appendChild(svgText({ x: 10, y: ridgeY + ridgeH - 6, class: "cd-tl-ridgelab" }, "ACTIVITY"));

    // adaptive time axis + faint vertical gridlines
    var ticks = axisTicks(tMin, tMax, 6), axisTop = padT - 8, axisBot = H - axisH + 6;
    ticks.forEach(function (tk) {
      var x = xOf(tk.t);
      root.appendChild(svg("line", { x1: x, y1: axisTop, x2: x, y2: axisBot, class: "cd-tl-grid" }));
      root.appendChild(svgText({ x: x, y: H - 9, class: "cd-tl-axislab", "text-anchor": "middle" }, tk.label));
    });

    lanes.forEach(function (lane, li) {
      var y = padT + li * laneH, cy = y + laneH / 2;
      if (li % 2 === 0) root.appendChild(svg("rect", { x: plotX, y: y, width: plotW, height: laneH, class: "cd-tl-stripe" }));
      root.appendChild(svg("line", { x1: plotX, y1: cy, x2: plotX + plotW, y2: cy, class: "cd-tl-mid" }));
      var known = !lane.agg && knownFor("phone", lane.name);
      var laneName = lane.name.length > 22 ? lane.name.slice(0, 21) + "…" : lane.name;
      root.appendChild(svgText({ x: 10, y: cy - 2, class: "cd-tl-name" + (known ? " cd-tl-known" : "") }, laneName));
      root.appendChild(svgText({ x: 10, y: cy + 10, class: "cd-tl-sub" }, lane.items.length + " events" + (known ? " · known" : "")));
      lane.items.forEach(function (x) {
        var ev = x.ev, bt = baseType(ev), dir = direction(ev), col = TYPE_COLOUR[bt] || "#8d99ae";
        var dur = hmsToSec(ev.durationHms), rad = bt === "Voice" ? Math.max(2.4, Math.min(6, 2.4 + Math.sqrt(dur) / 6)) : 2.6;
        var mx = xOf(x.t), off = dir === "out" ? -5 : dir === "in" ? 5 : 0;
        var mk = svg("circle", { cx: mx, cy: cy + off, r: rad, fill: col, class: "cd-tl-mk cd-tl-" + dir });
        var ti = svg("title"); ti.textContent = (ev.startDt || "") + "  ·  " + (ev.type || "event") + (dur ? "  ·  " + fmtDur(dur) : "") + (!lane.agg && lane.name ? "  ·  " + lane.name : "") + (ev.cellName ? "  ·  " + ev.cellName : "");
        mk.appendChild(ti);
        if (ev.lat != null && ev.lon != null) { mk.setAttribute("class", mk.getAttribute("class") + " cd-tl-geo"); mk.addEventListener("click", function () { showTab("map"); focusPoint(ev); }); }
        root.appendChild(mk);
      });
    });
    pane.appendChild(root);
    return true;
  }
  function busiestDay() { var pd = eventsPerDay(); if (!pd.length) return "—"; var m = pd[0]; pd.forEach(function (x) { if (x.count > m.count) m = x; }); return m.label; }
  function topContactLabel() {
    var byCp = {};
    state.sorted.forEach(function (ev) { var cp = counterparty(ev); if (cp) byCp[cp] = (byCp[cp] || 0) + 1; });
    var best = null, bc = 0; Object.keys(byCp).forEach(function (k) { if (byCp[k] > bc) { bc = byCp[k]; best = k; } });
    return best || "—";
  }
  function renderTimeline() {
    var pane = doc.getElementById("cd-pane-timeline"); if (!pane) return; clear(pane);
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events.")); return; }

    // headline stats
    var perDay = eventsPerDay();
    var stats = el("div", "cd-cards");
    stats.appendChild(statCard(String(state.sorted.length), "events"));
    stats.appendChild(statCard(String(perDay.length), perDay.length === 1 ? "active day" : "active days"));
    stats.appendChild(statCard(busiestDay(), "busiest day"));
    stats.appendChild(statCard(topContactLabel(), "top contact"));
    pane.appendChild(stats);

    // the hero: contact swimlane timeline
    pane.appendChild(el("h3", "cd-h", "Contact timeline"));
    pane.appendChild(el("p", "cd-cap", "One lane per contact, ranked by volume. Each mark is an event, placed in time and coloured by type; call marks scale with duration. Outgoing sits above the lane line, incoming below. Click a located mark to jump to the map."));
    var built = buildContactTimeline(pane);
    if (!built) pane.appendChild(el("p", "cd-cap", "Timeline needs at least two time-stamped events."));

    // legend — type colours + direction + size key
    var mix = typeMix();
    var chips = el("div", "cd-typemix");
    Object.keys(mix).sort(function (a, b) { return mix[b] - mix[a]; }).forEach(function (t) {
      var ch = el("span", "cd-typechip");
      var dot = el("span", "cd-typedot"); dot.style.background = TYPE_COLOUR[t] || "#8d99ae"; ch.appendChild(dot);
      ch.appendChild(doc.createTextNode(t + " ")); ch.appendChild(el("b", null, String(mix[t])));
      chips.appendChild(ch);
    });
    var keyOut = el("span", "cd-typechip cd-tl-keyitem"); keyOut.appendChild(el("span", "cd-tl-keydot cd-tl-keyout")); keyOut.appendChild(doc.createTextNode("outgoing"));
    var keyIn = el("span", "cd-typechip cd-tl-keyitem"); keyIn.appendChild(el("span", "cd-tl-keydot cd-tl-keyin")); keyIn.appendChild(doc.createTextNode("incoming"));
    chips.appendChild(keyOut); chips.appendChild(keyIn);
    pane.appendChild(chips);

    pane.appendChild(el("h3", "cd-h", "Event sequence"));
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
        seg.bindTooltip(lg.mode + (lg.speedKmh != null ? " · " + mph(lg.speedKmh) + " mph" : "") + (lg.roadHint ? " · " + lg.roadHint : ""));
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

  /* ---- demo data (fictitious; Luton/Dunstable area; pattern-of-life) ----
     Sizes: 3-day sample, 2 / 4 / 8 weeks. Subject + several contacts overlap the
     Database sample reports (js/core/known-entities.js) so a loaded return shows
     which parties are already known to the intelligence picture, and where. */
  function loadDemo(days) { ingestRows(CD.parseDelimited(buildDemoCSV(days || 3))); }
  var DEMO_H = ["Start Date","Start Time (local)","End Date","End Time (local)","Calling Number","Called Number","Forwarding Number","CDR Type","IMSI","IMEI","Ring time (secs)","Call Duration (HH:mm:ss)","IPv4 address","IPv6 address","Data Volume Uploaded (KB)","Data Volume Downloaded (KB)","APN","Country of Origin","Operator","Start Cell ID or MAC Address","Start Cell Site Name","Start Cell 1st line of Address","Start Cell ID Postcode","Start Cell Generation","Start Cell Easting","Start Cell Northing","Start Cell Azimuth","End Cell ID or MAC Address","End Cell Site Name","End Cell 1st line of Address","End Cell ID Postcode","End Cell Generation","End Cell Easting","End Cell Northing","End Cell Azimuth","Row"];
  // Cell sites spread across the subject's real pattern of life — a Luton home,
  // a London base he commutes to down the M1, plus operational trips to Dover
  // (port) and the Midlands. Realistic BNG eastings/northings so the map and the
  // journey inference tell a story instead of one town of dots. Index by name.
  var CELL = {
    HOME:   ["LEA-01","LEAGRAVE","Compton Ave","LU4 9AB","4G",506200,224400,200],       // Luton — overnight anchor
    LOCAL:  ["LTN-02","BURY PARK","Dunstable Rd","LU1 1HW","4G",508100,221900,150],      // Luton — local errands
    M1SVC:  ["BED-11","M1 TODDINGTON SERVICES","M1 J11-12","LU5 6HR","5G",500900,228500,330], // motorway waypoint
    LDN1:   ["LDN-21","SHOREDITCH HIGH ST","Bethnal Green Rd","E1 6JE","5G",533300,182200,120], // London base (weekday)
    LDN2:   ["LDN-22","CANARY WHARF","West India Ave","E14 4HD","5G",537700,180400,60],  // London — secondary
    DOVER:  ["DVR-31","DOVER EASTERN DOCKS","Eastern Docks Rd","CT16 1JA","4G",632200,141600,90], // port trips
    BHAM:   ["BHM-41","BIRMINGHAM DIGBETH","High St Deritend","B5 6DY","5G",407600,286300,270],   // Midlands trips
    AIR:    ["LTN-05","LUTON AIRPORT","Airport Way","LU2 9LY","5G",512700,220900,45]     // airport
  };
  function DEMO_CELLS() { return [CELL.HOME, CELL.LOCAL, CELL.M1SVC, CELL.LDN1, CELL.LDN2, CELL.DOVER, CELL.BHAM, CELL.AIR]; }
  var CIDX = { HOME: 0, LOCAL: 1, M1SVC: 2, LDN1: 3, LDN2: 4, DOVER: 5, BHAM: 6, AIR: 7 };
  var DEMO_SUBJECT = "07700900111";  // Geoffrey BAINES (known in Database)
  var DEMO_CONTACTS = [
    { n: "07700900222", w: 34 }, { n: "07700900333", w: 22 }, { n: "07700900777", w: 8 },  // known in DB
    { n: "07700900444", w: 16 }, { n: "07700900555", w: 10 }, { n: "07700900666", w: 10 }   // new contacts
  ];
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function p2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
  function weighted(rng, list) { var t = 0, i; for (i = 0; i < list.length; i++) { t += list[i].w; } var r = rng() * t; for (i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) { return list[i].n; } } return list[list.length - 1].n; }
  function buildDemoCSV(days) {
    var cells = DEMO_CELLS(), rng = mulberry32(0xBA1E5 + days), start = new Date(2024, 8, 2), rows = [], rowNo = 0;
    function emit(dObj, hh, mm, ss, type, a, b, cellIdx, handset) {
      var c = cells[cellIdx];
      var dt = p2(dObj.getDate()) + "/" + p2(dObj.getMonth() + 1) + "/" + dObj.getFullYear();
      var tm = p2(hh) + ":" + p2(mm) + ":" + p2(ss);
      var dur = (type === "Voice") ? "00:" + p2(1 + Math.floor(rng() * 4)) + ":" + p2(Math.floor(rng() * 60)) : "00:00:00";
      var ring = (type === "Voice") ? String(1 + Math.floor(rng() * 8)) : "";
      rowNo++;
      rows.push([dt, tm, dt, tm, a, b, "", type, "234300000000001", handset, ring, dur, "", "", "", "", "", "GBR", "EE",
        c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], "", "", "", "", "", "", "", "", String(rowNo)]);
    }
    // a call/SMS from the subject at a given cell + hour, ~n events
    function burst(day, atCell, hStart, hEnd, n, handset) {
      for (var k = 0; k < n; k++) {
        var hh = hStart + Math.floor(rng() * Math.max(1, hEnd - hStart)), mm = Math.floor(rng() * 60), ss = Math.floor(rng() * 60);
        var roll = rng(), type = roll < 0.62 ? "Voice" : (roll < 0.82 ? "SMS-MO" : "Data");
        var contact = weighted(rng, DEMO_CONTACTS);
        var a = DEMO_SUBJECT, b = contact;
        if (type === "Data") { b = ""; }
        else if (rng() < 0.22) { a = contact; b = DEMO_SUBJECT; if (type === "SMS-MO") { type = "SMS-MT"; } }  // incoming
        emit(day, hh, mm, ss, type, a, b, atCell, handset);
      }
    }
    for (var d = 0; d < days; d++) {
      var day = new Date(start.getTime()); day.setDate(start.getDate() + d);
      var dow = day.getDay(), weekend = (dow === 0 || dow === 6);
      var handset = (d >= Math.floor(days * 0.6)) ? "350000000000099" : "350000000000012";  // SIM-swap partway
      // overnight registrations at the home cell
      emit(day, 0, 20 + Math.floor(rng() * 40), Math.floor(rng() * 60), "Data", DEMO_SUBJECT, "", CIDX.HOME, handset);
      emit(day, 5, Math.floor(rng() * 45), Math.floor(rng() * 60), "Data", DEMO_SUBJECT, "", CIDX.HOME, handset);
      burst(day, CIDX.HOME, 6, 8, 1 + Math.floor(rng() * 2), handset);   // morning at home
      if (weekend) {
        // weekend: home + local errands, and an occasional airport run
        burst(day, CIDX.LOCAL, 9, 13, 2 + Math.floor(rng() * 3), handset);
        burst(day, CIDX.HOME, 14, 21, 2 + Math.floor(rng() * 3), handset);
        if (rng() < 0.25) { emit(day, 11, Math.floor(rng() * 60), 0, "Voice", DEMO_SUBJECT, "07700900222", CIDX.AIR, handset); }
      } else {
        var trip = rng();
        if (trip < 0.20) {
          // DOVER day — down the M1/M25, port meeting, back late (OIC pattern)
          emit(day, 7, 40, 0, "Voice", DEMO_SUBJECT, "07700900777", CIDX.M1SVC, handset);   // en route
          burst(day, CIDX.DOVER, 11, 16, 3 + Math.floor(rng() * 3), handset);                // at the port
          emit(day, 18, 30, 0, "SMS-MO", DEMO_SUBJECT, "07700900777", CIDX.M1SVC, handset);  // return leg
        } else if (trip < 0.34) {
          // BIRMINGHAM day — Midlands run
          emit(day, 8, 10, 0, "Voice", DEMO_SUBJECT, "07700900333", CIDX.M1SVC, handset);
          burst(day, CIDX.BHAM, 11, 16, 3 + Math.floor(rng() * 3), handset);
          emit(day, 18, 0, 0, "Voice", DEMO_SUBJECT, "07700900333", CIDX.M1SVC, handset);
        } else {
          // standard workday — commute to the London base and back
          emit(day, 7, 45, 0, "Data", DEMO_SUBJECT, "", CIDX.M1SVC, handset);                 // M1 southbound
          burst(day, CIDX.LDN1, 9, 13, 4 + Math.floor(rng() * 4), handset);                    // London base AM
          if (rng() < 0.4) { burst(day, CIDX.LDN2, 13, 16, 1 + Math.floor(rng() * 2), handset); } // Canary Wharf
          burst(day, CIDX.LDN1, 15, 18, 2 + Math.floor(rng() * 3), handset);                    // London base PM
          emit(day, 18, 40, 0, "Voice", DEMO_SUBJECT, weighted(rng, DEMO_CONTACTS), CIDX.M1SVC, handset); // M1 northbound
        }
      }
      emit(day, 22, Math.floor(rng() * 50), Math.floor(rng() * 60), "Voice", DEMO_SUBJECT, weighted(rng, DEMO_CONTACTS), CIDX.HOME, handset);  // evening at home
    }
    var lines = ["URN:,,,,IR774120","Grade:,,,,OFFICIAL-SENSITIVE","Target identity:,,,," + DEMO_SUBJECT,"Operator:,,,,EE","", DEMO_H.join(","), ""];
    rows.forEach(function (row) { lines.push(row.map(function (v) { v = String(v); return /[",]/.test(v) ? '"' + v + '"' : v; }).join(",")); });
    return lines.join("\n");
  }

  /* ---- shared viz helpers ---- */
  // compact stat: a big tabular number over a caption; tone "" | "warn" | "ok"
  function statCard(value, label, tone) {
    var c = el("div", "cd-stat" + (tone ? " cd-stat-" + tone : ""));
    c.appendChild(el("div", "cd-stat-v", value));
    c.appendChild(el("div", "cd-stat-l", label));
    return c;
  }
  // a mini horizontal bar sized to value/max, in the given colour (returns a node)
  function barCell(value, max, colour) {
    var wrap = el("div", "cd-bar-cell");
    var track = el("div", "cd-bar-track");
    var fill = el("div", "cd-bar-fill");
    fill.style.width = Math.max(2, Math.round((value || 0) / (max || 1) * 100)) + "%";
    if (colour) fill.style.background = colour;
    track.appendChild(fill); wrap.appendChild(track);
    return wrap;
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
      // intensity tint so peaks read at a glance, not just by height
      bar.style.opacity = String(0.45 + 0.55 * (v / max));
      col.appendChild(bar); col.appendChild(el("div", "cd-hist-lab", labelFn(i)));
      h.appendChild(col);
    });
    return h;
  }
  // Pattern-of-life heatmap: day-of-week (rows) × hour (cols), cell intensity =
  // event count. The single most legible way to see routine — quiet nights, the
  // commute band, weekend drift — at a glance. Built straight off the events.
  var DOW3 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function activityHeatmap() {
    var grid = [], r, c;
    for (r = 0; r < 7; r++) { grid[r] = []; for (c = 0; c < 24; c++) grid[r][c] = 0; }
    var max = 0;
    state.sorted.forEach(function (ev) {
      var d = parseDt(ev.startDt); if (!d) return;
      var row = (d.getDay() + 6) % 7;   // JS Sun=0 -> Mon-first
      var v = ++grid[row][d.getHours()];
      if (v > max) max = v;
    });
    if (!max) return null;
    var wrap = el("div", "cd-heat");
    // header row: hour ticks at 00/06/12/18
    var head = el("div", "cd-heat-row cd-heat-head");
    head.appendChild(el("span", "cd-heat-daylab", ""));
    for (c = 0; c < 24; c++) { var hl = el("span", "cd-heat-hourlab", (c % 6 === 0) ? (c < 10 ? "0" + c : "" + c) : ""); head.appendChild(hl); }
    wrap.appendChild(head);
    for (r = 0; r < 7; r++) {
      var rowEl = el("div", "cd-heat-row");
      rowEl.appendChild(el("span", "cd-heat-daylab", DOW3[r]));
      for (c = 0; c < 24; c++) {
        var v2 = grid[r][c];
        var cell = el("span", "cd-heat-cell");
        if (v2) { cell.style.background = "rgba(142,162,255," + (0.12 + 0.85 * (v2 / max)).toFixed(3) + ")"; cell.title = DOW3[r] + " " + (c < 10 ? "0" + c : c) + ":00 — " + v2 + " events"; }
        rowEl.appendChild(cell);
      }
      wrap.appendChild(rowEl);
    }
    return wrap;
  }
  function renderHandsets() {
    var pane = doc.getElementById("cd-pane-handsets"); if (!pane) return; clear(pane);
    if (!CA) { pane.appendChild(el("p", "cd-empty", "Attribution module unavailable.")); return; }
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events \u2014 drop a return or load the demo.")); return; }
    var r = CA.analyse(state.sorted);
    if (!r.pairs.length) { pane.appendChild(el("p", "cd-empty", "No IMEI/IMSI data in this return.")); return; }
    var flags = el("div", "cd-flags");
    r.multiSim.forEach(function (h) { var f = el("span", "cd-flag"); f.textContent = "Handset " + h.imei + " ran " + h.simCount + " SIMs"; flags.appendChild(f); });
    r.movedSim.forEach(function (x) { var f = el("span", "cd-flag"); f.textContent = "SIM " + x.imsi + " used in " + x.handsetCount + " handsets"; flags.appendChild(f); });
    if (!flags.childNodes.length) pane.appendChild(el("p", "cd-note", "Single handset/SIM \u2014 no swap or multi-SIM pattern detected."));
    else pane.appendChild(flags);
    pane.appendChild(el("h3", "cd-h", "IMEI \u2194 IMSI pairings"));
    var wrap = el("div", "cd-tablewrap"), t = el("table", "cd-table"), th = el("thead"), htr = el("tr");
    ["IMEI", "IMSI", "Events", "First", "Last"].forEach(function (h) { htr.appendChild(el("th", null, h)); });
    th.appendChild(htr); t.appendChild(th); var tb = el("tbody");
    r.pairs.forEach(function (pr) { var tr = el("tr"); [pr.imei || "\u2014", pr.imsi || "\u2014", pr.count, pr.firstISO, pr.lastISO].forEach(function (v) { tr.appendChild(el("td", null, v)); }); tb.appendChild(tr); });
    t.appendChild(tb); wrap.appendChild(t); pane.appendChild(wrap);
    if (r.timeline.length > 1) {
      pane.appendChild(el("h3", "cd-h", "Swap timeline"));
      var tl = el("div", "cd-swaps");
      r.timeline.forEach(function (e) { var row = el("div", "cd-swap"); row.textContent = e.tISO + "  \u00b7  IMEI " + (e.imei || "?") + " / IMSI " + (e.imsi || "?") + "  \u2014  " + e.change; tl.appendChild(row); });
      pane.appendChild(tl);
    }
  }

  function sparkline(spark, w, h){
    if (!spark || !spark.length || !doc || typeof doc.createElementNS !== "function") return null;
    var ns = "http://www.w3.org/2000/svg", max = Math.max.apply(null, spark) || 1, n = spark.length;
    var svg = doc.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 " + n + " " + h); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("class", "cd-spark");
    for (var i = 0; i < n; i++){ if (!spark[i]) continue; var bh = Math.max(0.7, spark[i] / max * h);
      var r = doc.createElementNS(ns, "rect"); r.setAttribute("x", i); r.setAttribute("y", h - bh); r.setAttribute("width", 0.92); r.setAttribute("height", bh); r.setAttribute("fill", "#8ea2ff"); svg.appendChild(r); }
    return svg;
  }

  function renderContacts() {
    var pane = doc.getElementById("cd-pane-contacts"); if (!pane) return; clear(pane);
    if (!CT) { pane.appendChild(el("p", "cd-empty", "Contacts module unavailable.")); return; }
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events \u2014 drop a return or load the demo.")); return; }
    var r = CT.profile(state.sorted, state.target);
    if (!r.contacts.length) { pane.appendChild(el("p", "cd-empty", "No counterparties found.")); return; }
    pane.appendChild(el("p", "cd-note", r.contacts.length + " counterparties \u00b7 " + (r.firstISO || "?") + " to " + (r.lastISO || "?") + " \u00b7 ranked by significance (reciprocity + call duration + active days), not raw count."));
    var wrap = el("div", "cd-tablewrap"), t = el("table", "cd-table"), th = el("thead"), htr = el("tr");
    ["#", "Number", "Significance", "Events", "V/S", "Out/In", "Recip.", "Total dur", "Days", "Tempo", "Activity", "First", "Last", "Flags"].forEach(function (h) { htr.appendChild(el("th", null, h)); });
    th.appendChild(htr); t.appendChild(th);
    var tb = el("tbody");
    r.contacts.forEach(function (c, i) {
      var tr = el("tr");
      function td(v) { var d = el("td"); if (v != null) d.textContent = v; tr.appendChild(d); return d; }
      td(i + 1);
      var nd = el("td"); nd.textContent = c.number; if (c.key === state.target) nd.className = "cd-subject"; tr.appendChild(nd);
      var sc = el("td", "cd-scorecell"); var bar = el("span", "cd-scorebar"); bar.style.width = Math.max(4, c.score) + "%"; sc.appendChild(bar); var sl = el("span", "cd-scoreval"); sl.textContent = c.score; sc.appendChild(sl); tr.appendChild(sc);
      td(c.events); td(c.voice + "/" + c.sms); td(c.outCount + "/" + c.inCount); td(c.reciprocity.toFixed(2)); td(fmtDur(c.totalDurSec)); td(c.activeDays); td(c.tempo);
      var spk = el("td", "cd-sparkcell"); var sv = sparkline(c.spark, 110, 18); if (sv) spk.appendChild(sv); tr.appendChild(spk);
      td(c.firstISO); td(c.lastISO);
      var fd = el("td"), flags = [];
      if (c.smsOnly) flags.push("SMS-only"); if (c.signalling) flags.push("signalling"); if (c.isNew) flags.push("new"); if (c.isDropped) flags.push("dropped");
      flags.forEach(function (f) { var sp = el("span", "cd-flag"); sp.textContent = f; fd.appendChild(sp); });
      tr.appendChild(fd); tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); pane.appendChild(wrap);
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

    var heat = activityHeatmap();
    if (heat) {
      pane.appendChild(el("h3", "cd-h", "Pattern of life — day × hour"));
      pane.appendChild(heat);
    }

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
  function modeColour(m) { return (JRN && JRN.MODE_COLOUR && JRN.MODE_COLOUR[m]) || "#8ea2ff"; }
  // a small inline "chip" that carries the mode colour as a left tick
  function modeCell(m) {
    var s = el("span", "cd-modechip"); var dot = el("span", "cd-modedot"); dot.style.background = modeColour(m);
    s.appendChild(dot); s.appendChild(doc.createTextNode(m || "—")); return s;
  }
  function renderJourneys() {
    var pane = doc.getElementById("cd-pane-journeys"); if (!pane) return; clear(pane);
    if (!JRN) { pane.appendChild(el("p", "cd-empty", "Journeys module unavailable.")); return; }
    if (!state.sorted.length) { pane.appendChild(el("p", "cd-empty", "No events — drop a return or load the demo.")); return; }
    var JR = JRN.analyseJourneys(state.sorted);
    if (!JR.legs.length) { pane.appendChild(el("p", "cd-empty", "Not enough located events to infer movement.")); return; }

    // headline stats — total distance, journeys, flagged legs (miles)
    var totalMi = mi(JR.journeys.reduce(function (n, j) { return n + (j.distanceKm || 0); }, 0)) || 0;
    var cards = el("div", "cd-cards");
    cards.appendChild(statCard(String(JR.journeys.length), "journeys inferred"));
    cards.appendChild(statCard(totalMi.toLocaleString("en-GB") + " mi", "distance travelled"));
    cards.appendChild(statCard(String(JR.impossible.length), "legs over plausible speed", JR.impossible.length ? "warn" : ""));
    pane.appendChild(cards);

    // legend
    var lg = el("div", "cd-legend");
    Object.keys(JRN.MODE).forEach(function (k) {
      var m = JRN.MODE[k], s = el("span", "cd-legkey"), dot = el("span", "cd-legdot");
      dot.style.background = modeColour(m); s.appendChild(dot); s.appendChild(doc.createTextNode(" " + m)); lg.appendChild(s);
    });
    pane.appendChild(lg);
    if (JR.impossible.length) {
      var w = el("div", "cd-imp-banner");
      w.textContent = JR.impossible.length + " leg(s) exceed plausible ground speed — possible cloned SIM, second handset, or clock error.";
      pane.appendChild(w);
    }

    pane.appendChild(el("h3", "cd-h", "Journeys"));
    var maxMi = Math.max.apply(null, JR.journeys.map(function (j) { return mi(j.distanceKm) || 0; }).concat([1]));
    pane.appendChild(mkTable(["#", "Start", "Mode", "Distance", "Distance (mi)", "Duration (min)", "Mean mph", "Max mph", "Straightness", "Roads"],
      JR.journeys.map(function (j, i) {
        return { cells: [String(i + 1), fmtDate(j.startTime), modeCell(j.mode), barCell(mi(j.distanceKm), maxMi, modeColour(j.mode)), fmt(mi(j.distanceKm)), String(j.durationMin), fmt(mph(j.meanKmh)), fmt(mph(j.maxKmh)), j.straightness == null ? "" : String(j.straightness), j.roads.join(", ")], num: [4, 5, 6, 7], imp: j.impossible };
      })));
    pane.appendChild(el("h3", "cd-h", "Legs (segment detail)"));
    pane.appendChild(mkTable(["From", "To", "Start", "Distance (mi)", "Duration (min)", "mph", "Mode", "Road"],
      JR.legs.map(function (l) { return { cells: [l.fromLabel, l.toLabel, fmtDate(l.fromTime), fmt(mi(l.distanceKm)), String(l.durationMin), l.speedKmh == null ? "∞" : String(mph(l.speedKmh)), modeCell(l.mode), l.roadHint || ""], num: [3, 4, 5], imp: l.impossible }; })));
  }
  function fmt(v) { return v == null ? "" : String(v); }
  function mkTable(headers, rows) {
    var wrap = el("div", "cd-tablewrap"), t = el("table", "cd-table"), th = el("thead"), htr = el("tr");
    headers.forEach(function (h) { htr.appendChild(el("th", null, h)); });
    th.appendChild(htr); t.appendChild(th);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr"); if (r.imp) tr.classList.add("cd-imp");
      r.cells.forEach(function (v, ci) {
        var td = el("td", (r.num && r.num.indexOf(ci) !== -1) ? "cd-num" : null);
        if (v && v.nodeType === 1) { td.appendChild(v); } else { td.textContent = (v == null ? "" : String(v)); }
        tr.appendChild(td);
      });
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
      ".cd-drop{flex:0 1 auto;display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border:1px dashed var(--line-2);border-radius:var(--radius);color:var(--dim);cursor:pointer;white-space:nowrap}.cd-drop:hover{border-color:var(--accent-dim);color:var(--text)}",
      ".cd-drop svg{opacity:.7}",
      ".cd-drop.cd-drag{border-color:var(--accent);color:var(--accent);background:rgba(142,162,255,.06)}.cd-file{display:none}",
      ".cd-bar .cd-demo{margin-left:auto}",
      ".cd-btn{background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:7px 12px;cursor:pointer;font:inherit}.cd-btn:hover:not(:disabled){border-color:var(--accent-dim)}.cd-btn:disabled{opacity:.45;cursor:default}",
      ".cd-summary{display:flex;flex-wrap:wrap;gap:8px;padding:8px 14px;border-bottom:1px solid var(--line)}",
      ".cd-chip{background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:3px 10px;font-size:var(--fs-xs);color:var(--dim)}.cd-chip b{color:var(--text);font-variant-numeric:tabular-nums}.cd-chip.cd-warn{border-color:var(--warn);color:var(--warn)}",
      ".cd-xref{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid var(--line);background:rgba(142,162,255,.05)}.cd-xref[hidden]{display:none}",
      ".cd-xref-lbl{font-size:var(--fs-2xs);text-transform:uppercase;letter-spacing:.08em;color:var(--faint);font-family:var(--mono)}",
      ".cd-xref-chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--accent-dim);border-radius:var(--radius);padding:3px 9px;font-size:var(--fs-xs);color:var(--text)}.cd-xref-chip b{font-family:var(--mono);color:var(--accent)}.cd-xref-op{color:var(--faint);font-size:var(--fs-2xs)}",
      ".cd-known::after{content:'\\25C6';color:var(--accent);margin-left:5px;font-size:.72em;vertical-align:middle}",
      "select.cd-demo{cursor:pointer}",
      ".cd-tabs{display:flex;gap:4px;padding:8px 14px 0}",
      ".cd-tab{background:transparent;border:none;border-bottom:2px solid transparent;color:var(--faint);padding:7px 12px;cursor:pointer;font:inherit}.cd-tab:hover{color:var(--dim)}.cd-tab-on{color:var(--accent);border-bottom-color:var(--accent)}",
      ".cd-note{color:var(--faint);font-size:var(--fs-xs);margin:2px 0 8px}",
      ".cd-scorecell{position:relative;min-width:74px}.cd-scorebar{position:absolute;left:0;top:2px;bottom:2px;background:rgba(142,162,255,.28);border-radius:3px;z-index:0}.cd-scoreval{position:relative;z-index:1}",
      ".cd-flag{display:inline-block;font-size:var(--fs-2xs);color:var(--warn,#e8a13a);border:1px solid var(--warn,#e8a13a);border-radius:10px;padding:0 6px;margin-right:4px}",
      ".cd-sparkcell{padding:2px 4px}.cd-spark{display:block;opacity:.85}",
      ".cd-flags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.cd-swaps{display:flex;flex-direction:column;gap:3px}.cd-swap{font-size:var(--fs-xs);color:var(--dim);font-family:var(--mono)}",
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
      ".cd-empty-hero{max-width:520px;margin:0 auto;padding:8vh 24px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}",
      ".cd-empty-mark{color:var(--accent);opacity:.85}",
      ".cd-empty-h{margin:0;font-size:var(--fs-lg);font-weight:600;color:var(--text)}",
      ".cd-empty-sub{margin:0;color:var(--dim);font-size:var(--fs-sm);line-height:1.55}",
      ".cd-empty-picks{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:4px}",
      ".cd-empty-pick{background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:8px 16px;cursor:pointer;font:inherit}.cd-empty-pick:hover{border-color:var(--accent);color:var(--accent)}",
      ".cd-empty-note{margin:8px 0 0;color:var(--faint);font-size:var(--fs-xs);line-height:1.5}",
      ".cd-h{margin:16px 0 6px;font-size:var(--fs-sm);color:var(--dim);font-weight:600}.cd-h:first-child{margin-top:0}",
      ".cd-cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px}",
      ".cd-card{flex:1;min-width:220px;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}",
      ".cd-card.cd-tl-geo{cursor:pointer}.cd-card.cd-tl-geo:hover{border-color:var(--accent-dim)}",
      ".cd-card-t{font-weight:600;color:var(--text)}.cd-card-sub{font-size:var(--fs-2xs);color:var(--faint);margin-bottom:8px}",
      ".cd-card-v{display:flex;align-items:center;gap:6px;font-size:var(--fs-md);color:var(--accent);font-family:var(--mono)}.cd-card-m{font-size:var(--fs-xs);color:var(--dim);margin-top:2px}",
      ".cd-grade{display:inline-block;font-family:var(--mono);font-size:var(--fs-2xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid currentColor;border-radius:var(--radius);padding:1px 6px;vertical-align:middle}.cd-grade[data-mk=ok]{color:var(--ok)}.cd-grade[data-mk=warn]{color:var(--warn)}.cd-grade[data-mk=bad]{color:var(--bad)}",
      ".ent-ico img{border-radius:3px;display:block}",
      ".cd-table td .ent-ico{margin-right:5px}",
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
      // stat cards (journeys headline)
      ".cd-stat{flex:1;min-width:120px;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px}.cd-stat-warn{border-color:var(--warn)}",
      ".cd-stat-v{font:600 var(--fs-xl)/1.1 var(--mono);color:var(--accent);font-variant-numeric:tabular-nums}.cd-stat-warn .cd-stat-v{color:var(--warn)}",
      ".cd-stat-l{font-size:var(--fs-2xs);color:var(--faint);text-transform:uppercase;letter-spacing:.06em;margin-top:3px}",
      // mode chip + distance bar cell (journeys tables)
      ".cd-modechip{display:inline-flex;align-items:center;gap:5px}.cd-modedot{width:9px;height:9px;border-radius:2px;display:inline-block}",
      ".cd-bar-cell{min-width:70px}.cd-bar-track{height:8px;background:var(--panel-3);border-radius:999px;overflow:hidden}.cd-bar-fill{height:100%;background:var(--accent);border-radius:999px}",
      // type-mix chips (timeline)
      ".cd-typemix{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 10px}",
      ".cd-typechip{display:inline-flex;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--line);border-radius:999px;padding:3px 11px;font-size:var(--fs-xs);color:var(--dim)}.cd-typechip b{color:var(--text);font-family:var(--mono);font-variant-numeric:tabular-nums}.cd-typedot{width:8px;height:8px;border-radius:50%;display:inline-block}",
      // contact swimlane timeline (SVG)
      ".cd-cap{font-size:var(--fs-xs);color:var(--faint);margin:0 0 8px;max-width:70ch;line-height:1.5}",
      ".cd-tl-svg{display:block;width:100%;height:auto;margin:2px 0 10px;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius)}",
      ".cd-tl-ridge{fill:var(--accent);opacity:.16;stroke:none}",
      ".cd-tl-ridgelab{fill:var(--faint);font:700 8px var(--mono);letter-spacing:.08em}",
      ".cd-tl-grid{stroke:var(--line);stroke-width:1;opacity:.6}",
      ".cd-tl-axislab{fill:var(--faint);font:9px var(--mono);font-variant-numeric:tabular-nums}",
      ".cd-tl-stripe{fill:currentColor;opacity:.02}",
      ".cd-tl-mid{stroke:var(--accent);stroke-width:1;opacity:.10}",
      ".cd-tl-name{fill:var(--text);font:600 11px var(--mono)}.cd-tl-known{fill:var(--accent)}",
      ".cd-tl-sub{fill:var(--faint);font:9px var(--mono);font-variant-numeric:tabular-nums}",
      ".cd-tl-mk{opacity:.88;transition:opacity .12s}.cd-tl-mk.cd-tl-in{opacity:.7}",
      ".cd-tl-geo{cursor:pointer}.cd-tl-mk:hover{opacity:1;stroke:var(--text);stroke-width:1}",
      ".cd-tl-keyitem{gap:6px}.cd-tl-keydot{width:9px;height:9px;border-radius:50%;display:inline-block;background:var(--dim)}",
      ".cd-tl-keyout{box-shadow:0 -4px 0 -2px var(--accent);background:var(--accent)}.cd-tl-keyin{box-shadow:0 4px 0 -2px var(--dim);opacity:.7}",
      // pattern-of-life heatmap
      ".cd-heat{display:flex;flex-direction:column;gap:2px;margin-bottom:10px;font-variant-numeric:tabular-nums}",
      ".cd-heat-row{display:flex;gap:2px;align-items:center}",
      ".cd-heat-daylab{flex:0 0 30px;font-size:var(--fs-2xs);color:var(--faint);font-family:var(--mono);text-align:right;padding-right:4px}",
      ".cd-heat-cell{flex:1;height:16px;min-width:8px;border-radius:2px;background:var(--panel-3)}",
      ".cd-heat-hourlab{flex:1;min-width:8px;font-size:9px;color:var(--faint);text-align:left;font-family:var(--mono)}",
      ".cd-heat-head .cd-heat-daylab{height:auto}",
      ".cd-pop{font:var(--fs-xs)/1.4 var(--sans)}.cd-pop-t{font-weight:600;margin-bottom:3px}"
    ].join("\n");
    var st = el("style"); st.id = "cd-style"; st.textContent = css; doc.head.appendChild(st);
  }

  var api = { open: open, close: close, mount: mount, _ingestRows: _ingestRows };
  if (typeof window !== "undefined") { window.RegistryCommsView = api; }
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})();
