/* CHART ROOM — timeline.js (v2)
 * Gotham-style timeline band, two-way linked with the chart:
 *  - zoomable / pannable time axis (wheel = zoom, drag = pan)
 *  - events coloured by kind (travel / transaction / conviction / other)
 *  - drag on the band with Shift (or use the range hint) selects a time
 *    window: the chart dims to entities with events inside it
 *  - click an event dot to select its entities; Esc / double-click clears
 */
(function () {
  "use strict";

  /* theme-aware canvas colours (light mode was illegible with the dark set) */
  function tcol(d, l) { return document.documentElement.getAttribute("data-theme") === "light" ? l : d; }

  var U = window.CRUtil;
  var store = null;
  var onSelectCb = null;
  var highlightEntityId = null;
  var canvas = null, ctx = null, tipEl = null;

  var view = { t0: 0, t1: 1 };          // visible time domain (ms)
  var range = null;                     // selected window {a,b} ms or null
  var hits = [];                        // last-rendered dot hit areas
  var drag = null;

  var KIND_COLOURS = {
    travel: "#6ea8d8", transaction: "#7fc97f", conviction: "#d86a6a", other: "#8593a3"
  };

  function kindOf(ev) {
    var l = (ev.label || "").toLowerCase();
    if (/flight|travel|depart|return|trip|stays/.test(l)) return "travel";
    if (/transaction|booking|transfer|deposit|cash|paid/.test(l)) return "transaction";
    if (/conviction|sentence|court|arrest|warrant/.test(l)) return "conviction";
    return "other";
  }

  function events() {
    return store.events.filter(function (e) { return e.dateISO; })
      .slice().sort(function (a, b) { return a.dateISO < b.dateISO ? -1 : 1; });
  }

  function fitDomain() {
    var evs = events();
    if (!evs.length) return;
    var t0 = new Date(evs[0].dateISO).getTime();
    var t1 = new Date(evs[evs.length - 1].dateISO).getTime();
    var pad = Math.max((t1 - t0) * 0.08, 86400000 * 3);
    view.t0 = t0 - pad;
    view.t1 = t1 + pad;
  }

  function xOf(t) {
    return ((t - view.t0) / (view.t1 - view.t0)) * canvas.clientWidth;
  }
  function tOf(x) {
    return view.t0 + (x / canvas.clientWidth) * (view.t1 - view.t0);
  }

  function niceTicks() {
    var span = view.t1 - view.t0;
    var DAY = 86400000;
    var step, fmt;
    if (span > DAY * 900) { step = DAY * 365.25; fmt = function (d) { return String(d.getFullYear()); }; }
    else if (span > DAY * 200) { step = DAY * 30.44; fmt = function (d) { return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }); }; }
    else if (span > DAY * 40) { step = DAY * 7; fmt = function (d) { return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }; }
    else { step = DAY; fmt = function (d) { return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }; }
    // hard cap — a runaway domain must never allocate millions of ticks
    while ((view.t1 - view.t0) / step > 400) step *= 2;
    var ticks = [];
    var t = Math.floor(view.t0 / step) * step;
    for (; t <= view.t1; t += step) ticks.push({ t: t, label: fmt(new Date(t)) });
    return ticks;
  }

  var DAY = 86400000;
  function clampView() {
    var span = view.t1 - view.t0;
    var mid = (view.t0 + view.t1) / 2;
    if (span < DAY) { view.t0 = mid - DAY / 2; view.t1 = mid + DAY / 2; }
    if (span > DAY * 36500) { view.t0 = mid - DAY * 18250; view.t1 = mid + DAY * 18250; }
  }

  function render() {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    hits = [];

    var evs = events();
    var emptyEl = U.el("tl-empty");
    if (emptyEl) emptyEl.style.display = evs.length ? "none" : "block";
    if (!evs.length) return;
    if (view.t0 === 0 && view.t1 === 1) fitDomain();

    var axisY = h - 18;

    // dek — count + span, NYT subtitle discipline (tabular figures via mono)
    var _f = new Date(evs[0].dateISO), _l = new Date(evs[evs.length - 1].dateISO);
    var _fmt = function (d) { return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }); };
    ctx.font = "10px Consolas, monospace"; ctx.textAlign = "right"; ctx.fillStyle = tcol("#76879b", "#6b6453");
    ctx.fillText(evs.length + (evs.length === 1 ? " event" : " events") +
      "  \u00b7  " + _fmt(_f) + (evs.length > 1 ? " \u2013 " + _fmt(_l) : ""), w - 8, 12);
    ctx.textAlign = "left";

    // selected range wash
    if (range) {
      var rx1 = xOf(range.a), rx2 = xOf(range.b);
      ctx.fillStyle = "rgba(232,179,75,0.10)";
      ctx.fillRect(rx1, 0, rx2 - rx1, axisY);
      ctx.strokeStyle = "rgba(232,179,75,0.5)";
      ctx.strokeRect(rx1 + 0.5, 0.5, rx2 - rx1 - 1, axisY - 1);
    }

    // axis + ticks
    ctx.strokeStyle = tcol("#22303f", "#c9c1ab");
    ctx.beginPath(); ctx.moveTo(0, axisY + 0.5); ctx.lineTo(w, axisY + 0.5); ctx.stroke();
    ctx.fillStyle = tcol("#5a6878", "#6b6453");
    ctx.font = "9px Consolas, monospace";
    ctx.textAlign = "center";
    niceTicks().forEach(function (tk) {
      var x = xOf(tk.t);
      if (x < -40 || x > w + 40) return;
      ctx.strokeStyle = tcol("#1a2430", "#e3dcc6");
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, axisY); ctx.stroke();
      ctx.fillText(tk.label, x, h - 6);
    });

    // events — stack dots per day-column
    var lanes = {};
    evs.forEach(function (ev) {
      var t = new Date(ev.dateISO).getTime();
      var x = xOf(t);
      if (x < -20 || x > w + 20) return;
      var col = Math.round(x / 14);
      var lane = (lanes[col] = (lanes[col] || 0) + 1);
      var y = axisY - 14 - (lane - 1) * 16;
      if (y < 8) y = 8;
      var kind = kindOf(ev);
      var hl = highlightEntityId && (ev.entityIds || []).indexOf(highlightEntityId) !== -1;
      var inR = !range || (t >= range.a && t <= range.b);
      var heroMode = !!highlightEntityId; // one hero (selected entity), rest grey
      ctx.globalAlpha = inR ? (heroMode && !hl ? 0.5 : 1) : 0.22;
      ctx.fillStyle = (heroMode && !hl) ? tcol("#46566b", "#b3ab93") : KIND_COLOURS[kind];
      ctx.beginPath();
      ctx.arc(x, y, hl ? 6 : 4.2, 0, Math.PI * 2);
      ctx.fill();
      if (hl) {
        ctx.strokeStyle = "#8ea2ff";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, 8.4, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.globalAlpha = 1;
      hits.push({ x: x, y: y, r: 9, ev: ev });
    });

    // kind legend (top-left, quiet)
    var lx = 8;
    ctx.font = "9px Consolas, monospace";
    ctx.textAlign = "left";
    Object.keys(KIND_COLOURS).forEach(function (k) {
      ctx.fillStyle = KIND_COLOURS[k];
      ctx.beginPath(); ctx.arc(lx + 3, 9, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tcol("#5a6878", "#6b6453");
      ctx.fillText(k, lx + 9, 12);
      lx += 9 + ctx.measureText(k).width + 14;
    });
    if (range) {
      ctx.fillStyle = "#8ea2ff";
      ctx.fillText("time filter on — double-click to clear", lx + 6, 12);
    }
  }

  function hitAt(x, y) {
    for (var i = hits.length - 1; i >= 0; i--) {
      var hh = hits[i];
      if (Math.abs(x - hh.x) <= hh.r && Math.abs(y - hh.y) <= hh.r) return hh.ev;
    }
    return null;
  }

  function applyRangeFilter() {
    if (!window.CRGraph) return;
    if (!range) { window.CRGraph.highlight(null); return; }
    var ids = {};
    events().forEach(function (ev) {
      var t = new Date(ev.dateISO).getTime();
      if (t >= range.a && t <= range.b) (ev.entityIds || []).forEach(function (id) { ids[id] = 1; });
    });
    window.CRGraph.highlight(Object.keys(ids));
  }

  function clearRange() {
    range = null;
    applyRangeFilter();
    render();
  }

  function bind() {
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      // magnitude-aware and clamped: trackpad flings must not explode the domain
      var f = Math.pow(1.0015, e.deltaY);
      f = Math.max(0.55, Math.min(1.8, f));
      var pivot = tOf(e.offsetX);
      view.t0 = pivot - (pivot - view.t0) * f;
      view.t1 = pivot + (view.t1 - pivot) * f;
      clampView();
      render();
    }, { passive: false });

    canvas.addEventListener("mousedown", function (e) {
      drag = { x0: e.offsetX, mode: e.shiftKey ? "range" : "pan", t0: view.t0, t1: view.t1, moved: false };
      if (drag.mode === "range") { range = { a: tOf(e.offsetX), b: tOf(e.offsetX) }; }
    });
    window.addEventListener("mousemove", function (e) {
      if (!drag) return;
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      if (Math.abs(x - drag.x0) > 3) drag.moved = true;
      if (drag.mode === "pan") {
        var dt = (drag.x0 - x) / canvas.clientWidth * (drag.t1 - drag.t0);
        view.t0 = drag.t0 + dt; view.t1 = drag.t1 + dt;
      } else {
        range.b = tOf(x);
      }
      render();
    });
    window.addEventListener("mouseup", function (e) {
      if (!drag) return;
      var wasRange = drag.mode === "range" && drag.moved;
      var wasClick = !drag.moved;
      // shift+click with no drag must not leave a stuck zero-width range
      if (drag.mode === "range" && !drag.moved) { range = null; applyRangeFilter(); render(); }
      drag = null;
      if (wasRange) {
        if (range.b < range.a) { var t = range.a; range.a = range.b; range.b = t; }
        applyRangeFilter();
        render();
      } else if (wasClick && e.target === canvas) {
        var rect = canvas.getBoundingClientRect();
        var ev2 = hitAt(e.clientX - rect.left, e.clientY - rect.top);
        if (ev2 && ev2.entityIds && ev2.entityIds.length && onSelectCb) onSelectCb(ev2.entityIds[0]);
      }
    });

    canvas.addEventListener("dblclick", function () { clearRange(); fitDomain(); render(); });

    canvas.addEventListener("mousemove", function (e) {
      var ev2 = hitAt(e.offsetX, e.offsetY);
      if (ev2) {
        tipEl.style.display = "block";
        tipEl.style.left = (e.clientX + 12) + "px";
        tipEl.style.top = (e.clientY - 28) + "px";
        tipEl.textContent = U.fmtDate(ev2.dateISO) + " — " + ev2.label;
        canvas.style.cursor = "pointer";
      } else {
        tipEl.style.display = "none";
        canvas.style.cursor = drag ? "grabbing" : "default";
      }
    });
    canvas.addEventListener("mouseleave", function () { tipEl.style.display = "none"; });

    window.addEventListener("resize", render);
  }

  function init(caseStore, onSelect) {
    store = caseStore;
    onSelectCb = onSelect;
    var box = U.el("timeline");
    if (!box) return;
    box.innerHTML = '<canvas id="tl-canvas"></canvas>' +
      '<div id="tl-empty" class="empty">No dated events yet. Travel, transactions and convictions extracted from documents appear here. Wheel = zoom · drag = pan · Shift+drag = filter the chart to a time window.</div>';
    canvas = U.el("tl-canvas");
    ctx = canvas.getContext("2d");
    tipEl = document.createElement("div");
    tipEl.className = "tl-tip";
    document.body.appendChild(tipEl);
    bind();
    // only refit the domain when the event set actually changes — node drags
    // and pins must not wipe the analyst's zoom
    var lastSig = "";
    store.onChange(function () {
      var evs = events();
      var sig = evs.length + "|" + (evs.length ? evs[0].dateISO + "|" + evs[evs.length - 1].dateISO : "");
      if (sig !== lastSig) { lastSig = sig; view = { t0: 0, t1: 1 }; }
      render();
    });
    render();
    var head = U.el("timeline-head");
    if (head) head.addEventListener("click", function () {
      U.el("timeline-wrap").classList.toggle("collapsed");
      setTimeout(render, 60);
    });
  }

  function highlightEntity(id) {
    highlightEntityId = id;
    render();
  }

  window.addEventListener("cr-theme", function () { try { render(); } catch (e) { /* noop */ } });
  window.CRTimeline = { init: init, render: render, highlightEntity: highlightEntity, clearRange: clearRange };
})();
