/* SOLAR — analytics.js (UI)
 * Case Analytics view. Hand-rolled SVG (no chart library) applying NYT/Upshot
 * discipline in SOLAR's dark palette: one hero accent (lime) with the rest in
 * grey, tabular figures, bars sorted descending from zero, direct value labels
 * (no legends), a declarative headline + subtitle + source per panel, the time
 * series annotated in-place at its peak, and crucial info visible without hover
 * (Archie Tse). Aggregations come from core/analytics.js.
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var A = function () { return window.CRAnalytics; };
  function store() { return window.CRGraph && window.CRGraph.getStore && window.CRGraph.getStore(); }
  function status(m) { if (window.CRApp && window.CRApp.status) window.CRApp.status(m); }

  // dark-theme tokens (mirror tokens.css)
  var HERO = "#8ea2ff", INK = "#c9d4e0", MUTED = "#76879b", GRID = "#22303f", FAINT = "#56657a";
  var NUMF = "'Geist Mono','Consolas',monospace";
  var LBLF = "'Inter','Segoe UI',sans-serif";

  function esc(s) { return U.esc(s); }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // ---- declarative panel chrome ----
  function panel(headline, subtitle, svg, source) {
    return '<section class="an-panel">' +
      '<h3 class="an-head">' + esc(headline) + '</h3>' +
      '<p class="an-sub">' + esc(subtitle) + '</p>' +
      svg +
      '<div class="an-source">' + esc(source) + '</div></section>';
  }

  // ---- horizontal bar chart (sorted desc, zero-based, direct value labels) ----
  // rows: [{label, value, colour?, id?}]  opts: {hero, unit, clickType}
  function hbar(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="an-empty">No data yet.</div>';
    var W = 680, rowH = 30, padL = 150, padR = 54, padT = 6, padB = 6;
    var H = padT + padB + rows.length * rowH;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var barW = W - padL - padR;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="an-svg" role="img" preserveAspectRatio="xMinYMin meet">';
    rows.forEach(function (r, i) {
      var y = padT + i * rowH, bh = 16, by = y + (rowH - bh) / 2;
      var w = Math.max(1, Math.round(barW * r.value / max));
      var col = r.colour || opts.hero || HERO;
      // label (left, right-aligned)
      s += '<text x="' + (padL - 10) + '" y="' + (by + bh / 2 + 4) + '" text-anchor="end" ' +
           'font-family="' + LBLF + '" font-size="12.5" fill="' + INK + '">' + esc(trunc(r.label, 20)) + '</text>';
      // bar
      s += '<rect x="' + padL + '" y="' + by + '" width="' + w + '" height="' + bh + '" rx="2.5" fill="' + col + '" fill-opacity="0.92"></rect>';
      // value at end (tabular)
      s += '<text x="' + (padL + w + 8) + '" y="' + (by + bh / 2 + 4) + '" font-family="' + NUMF + '" font-size="12" ' +
           'fill="' + INK + '" style="font-variant-numeric:tabular-nums">' + r.value + (opts.unit ? '' : '') + '</text>';
      // full-row hit target for click-through
      if (r.id || opts.clickType) {
        s += '<rect class="an-hit" x="0" y="' + y + '" width="' + W + '" height="' + rowH + '" fill="transparent" ' +
             'style="cursor:pointer" ' + (r.id ? 'data-id="' + U.escAttr(r.id) + '"' : '') +
             (opts.clickType ? ' data-type="' + U.escAttr(r.type) + '"' : '') + '></rect>';
      }
    });
    return s + '</svg>';
  }

  // ---- activity over time: area + line, peak annotated in place ----
  function activityChart(series) {
    if (series.length < 2) return '<div class="an-empty">Not enough dated activity to chart.</div>';
    var W = 680, H = 200, padL = 40, padR = 16, padT = 24, padB = 28;
    var iw = W - padL - padR, ih = H - padT - padB;
    var max = Math.max.apply(null, series.map(function (p) { return p.count; })) || 1;
    var n = series.length;
    var X = function (i) { return padL + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
    var Y = function (v) { return padT + ih - ih * v / max; };
    var line = "", area = "M" + X(0) + "," + Y(0);
    series.forEach(function (p, i) { var c = (i ? "L" : "M") + X(i) + "," + Y(p.count); line += c; area += "L" + X(i) + "," + Y(p.count); });
    area += "L" + X(n - 1) + "," + Y(0) + "Z";
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="an-svg" role="img" preserveAspectRatio="xMinYMin meet">';
    // y zero baseline + max gridline (pale)
    s += '<line x1="' + padL + '" y1="' + Y(0) + '" x2="' + (W - padR) + '" y2="' + Y(0) + '" stroke="' + GRID + '"></line>';
    s += '<line x1="' + padL + '" y1="' + Y(max) + '" x2="' + (W - padR) + '" y2="' + Y(max) + '" stroke="' + GRID + '" stroke-dasharray="2,3"></line>';
    s += '<text x="' + (padL - 6) + '" y="' + (Y(max) + 4) + '" text-anchor="end" font-family="' + NUMF + '" font-size="10" fill="' + MUTED + '" style="font-variant-numeric:tabular-nums">' + max + '</text>';
    s += '<path d="' + area + '" fill="' + HERO + '" fill-opacity="0.10"></path>';
    s += '<path d="' + line + '" fill="none" stroke="' + HERO + '" stroke-width="2"></path>';
    // peak annotation (halo + leader)
    var pk = A().peakIndex(series);
    if (pk >= 0) {
      var px = X(pk), py = Y(series[pk].count);
      s += '<circle cx="' + px + '" cy="' + py + '" r="3.5" fill="' + HERO + '"></circle>';
      var ly = Math.max(py - 34, 12);
      s += '<line x1="' + px + '" y1="' + (py - 6) + '" x2="' + px + '" y2="' + (ly + 4) + '" stroke="' + FAINT + '" stroke-width="0.8"></line>';
      var anchor = px > W - 120 ? 'end' : 'middle';
      s += '<text x="' + px + '" y="' + ly + '" text-anchor="' + anchor + '" font-family="' + LBLF + '" font-size="11" font-weight="600" ' +
           'fill="' + INK + '" paint-order="stroke" stroke="#0b1018" stroke-width="3" stroke-linejoin="round">peak ' + monthLabel(series[pk].month) + ' · ' + series[pk].count + '</text>';
    }
    // x ticks: first, peak, last
    [0, pk, n - 1].filter(function (v, i, a) { return v >= 0 && a.indexOf(v) === i; }).forEach(function (i) {
      var anc = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      s += '<text x="' + X(i) + '" y="' + (H - 10) + '" text-anchor="' + anc + '" font-family="' + NUMF + '" font-size="10" fill="' + MUTED + '">' + monthLabel(series[i].month) + '</text>';
    });
    return s + '</svg>';
  }

  function monthLabel(ym) {
    var M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var p = String(ym).split("-");
    return M[(+p[1] || 1) - 1] + " " + (p[0] || "").slice(2);
  }

  // ---- KPI strip ----
  function kpis(sm) {
    function k(v, l) {
      return '<div class="an-kpi"><div class="an-kpi-v">' + v + '</div><div class="an-kpi-l">' + esc(l) + '</div></div>';
    }
    return '<div class="an-kpis">' + k(sm.entities, "entities") + k(sm.links, "links") +
           k(sm.events, "events") + k(sm.located, "located") + k(sm.datedLinks, "dated links") + '</div>';
  }

  function open() {
    var st = store();
    if (!st || !st.entities.length) { status("No case data to analyse yet"); return; }
    var an = A();
    var veil = ensureModal();
    var body = veil.querySelector("#an-body");
    var em = an.entityTypeMix(st), lm = an.linkTypeMix(st),
        act = an.activityOverTime(st), brokers = an.topBrokers(st, 8), sm = an.summary(st);

    var html = kpis(sm);
    html += panel("The case is mostly people and the things that tie them together",
      "Entities by type. Source: this case.",
      hbar(em.map(function (r) { return { label: r.label, value: r.count, colour: r.colour, type: r.type }; }), { clickType: true }),
      "Tap a bar to highlight that type on the chart.");
    html += panel("How the entities relate",
      "Links by relationship type.",
      hbar(lm.map(function (r) { return { label: r.type.replace(/_/g, " ").toLowerCase(), value: r.count }; }), { hero: HERO }),
      "SOLAR · case relationships");
    if (act.length >= 2) {
      html += panel("When the activity happened",
        "Dated links and events per month.",
        activityChart(act),
        "SOLAR · dated activity only");
    }
    if (brokers.length) {
      html += panel("Who holds the network together",
        "Top entities by betweenness — the brokers on the shortest paths between others.",
        hbar(brokers.map(function (b) { return { label: b.label, value: Math.round(b.score * 10) / 10, id: b.id }; }), { hero: HERO }),
        "Tap to focus an entity on the chart.");
    }
    body.innerHTML = html;

    body.querySelectorAll(".an-hit").forEach(function (h) {
      h.addEventListener("click", function () {
        var id = h.getAttribute("data-id"), type = h.getAttribute("data-type");
        if (id) {
          U.closeModal("an-veil");
          if (window.CRApp && window.CRApp.selectEntity) window.CRApp.selectEntity(id);
        } else if (type) {
          var ids = st.entities.filter(function (e) { return e.type === type; }).map(function (e) { return e.id; });
          if (window.CRGraph && window.CRGraph.highlight) window.CRGraph.highlight(ids.length ? ids : null);
          U.closeModal("an-veil");
          status(ids.length + " " + type + " entit" + (ids.length === 1 ? "y" : "ies") + " highlighted");
        }
      });
    });
    U.openModal("an-veil");
  }

  function ensureModal() {
    var v = document.getElementById("an-veil");
    if (v) return v;
    v = document.createElement("div");
    v.className = "modal-veil"; v.id = "an-veil";
    v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); v.setAttribute("aria-label", "case analytics");
    v.innerHTML = '<div class="modal"><div class="modal-head"><h2>Case analytics</h2>' +
      '<button class="btn x" id="an-close" aria-label="close">✕</button></div>' +
      '<div class="modal-body" id="an-body"></div></div>';
    document.body.appendChild(v);
    v.querySelector("#an-close").addEventListener("click", function () { U.closeModal("an-veil"); });
    return v;
  }

  function init() {
    var tools = document.getElementById("chart-tools");
    if (tools && !document.getElementById("btn-analytics")) {
      var b = document.createElement("button");
      b.className = "btn"; b.id = "btn-analytics"; b.type = "button";
      b.textContent = "Analytics"; b.title = "Case analytics — entity mix, relationships, activity, key players";
      b.addEventListener("click", open);
      tools.appendChild(b);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.CRAnalyticsUI = { open: open };
})();
