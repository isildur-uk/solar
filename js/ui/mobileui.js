/* SOLAR — mobileui.js
 * Phone-responsive shell. Desktop and tablet are untouched; this only engages
 * below the phone breakpoint (<= 760px). Two pieces:
 *   1. Toolbar overflow drawer — secondary toolbar buttons are *moved* (not
 *      cloned, so their listeners survive) into a slide-down drawer behind a
 *      "More" button. They move back when the viewport grows.
 *   2. Bottom view nav — Chart / Map / Timeline / Inspector tabs that show one
 *      pane at a time, calling each view's resize hook so vis-network and
 *      Leaflet redraw correctly when revealed.
 */
(function () {
  "use strict";

  var MQ = (typeof window.matchMedia === "function")
    ? window.matchMedia("(max-width: 760px)")
    : { matches: false, addEventListener: function () {}, addListener: function () {} };
  // Buttons kept in the bar; everything else in #topbar goes to the drawer.
  var PRIMARY = ["brand", "case-name", "btn-paste", "btn-files", "btn-scan", "search", "btn-more"];
  var movedEls = [];
  var drawer = null, moreBtn = null, bottomNav = null;

  function el(id) { return document.getElementById(id); }

  /* ---------- toolbar overflow drawer ---------- */

  function buildChrome() {
    var topbar = el("topbar");
    if (!topbar) return;

    // "⋯ More" overflow retired — the toolbar now groups actions into
    // Add / Case / Export dropdown menus, which also serve on mobile.
    moreBtn = null;

    if (!el("more-drawer")) {
      drawer = document.createElement("div");
      drawer.id = "more-drawer";
      drawer.setAttribute("role", "menu");
      drawer.setAttribute("aria-label", "more actions");
      document.body.appendChild(drawer);
    } else {
      drawer = el("more-drawer");
    }

    // Touch-only floating action: add an entity to the chart. On desktop this is
    // right-click background -> "Add entity here…"; on touch there is no right
    // click, so a discoverable "+" FAB opens the same editor at canvas centre.
    if (!el("chart-fab")) {
      var fab = document.createElement("button");
      fab.id = "chart-fab";
      fab.type = "button";
      fab.setAttribute("aria-label", "add entity to chart");
      fab.title = "Add entity to chart";
      fab.innerHTML = '<span aria-hidden="true">+</span>';
      document.body.appendChild(fab);
      fab.addEventListener("click", function () {
        var G = window.CRGraph, app = window.CRApp;
        if (!G || !window.CREditEntity || !app) return;
        var store = app.getStore();
        if (!store) return;
        var pos = null;
        try {
          var c = el("chart");
          if (c && G.canvasPos) {
            var r = c.getBoundingClientRect();
            pos = G.canvasPos(r.width / 2, r.height / 2);
          }
        } catch (e) { pos = null; }
        window.CREditEntity.open({ store: store, defaultType: "person", onCreate: function (ent) {
          if (pos) { ent.chart = { x: Math.round(pos.x), y: Math.round(pos.y), fixed: true }; }
          store._emit("layout");
        } });
      });
    }

    if (!el("bottom-nav")) {
      bottomNav = document.createElement("nav");
      bottomNav.id = "bottom-nav";
      bottomNav.setAttribute("aria-label", "view");
      bottomNav.innerHTML =
        '<span class="seg-pill" aria-hidden="true"></span>' +
        tab("chart", "Chart") + tab("map", "Map") +
        tab("timeline", "Timeline") + tab("inspector", "Details");
      document.body.appendChild(bottomNav);
      bottomNav.addEventListener("click", function (ev) {
        var b = ev.target.closest("button[data-view]");
        if (b) setView(b.getAttribute("data-view"));
      });
    } else {
      bottomNav = el("bottom-nav");
    }
  }

  function tab(view, label) {
    return '<button type="button" data-view="' + view + '" aria-pressed="false">' +
      '<span class="bn-ico" aria-hidden="true">' + icon(view) + '</span>' +
      '<span class="bn-lbl">' + label + '</span></button>';
  }
  function icon(v) {
    return ({
      chart: "✷", map: "◍", timeline: "▤", inspector: "ⓘ"
    })[v] || "•";
  }

  function moveInto(container) {
    if (!container) return;
    Array.prototype.slice.call(container.children).forEach(function (child) {
      if (PRIMARY.indexOf(child.id) !== -1) return;
      if (child.tagName === "BUTTON" || child.tagName === "SELECT") {
        child._origin = container;       // remember where it came from
        movedEls.push(child);
        drawer.appendChild(child);
      }
    });
  }

  function enterMobile() {
    var topbar = el("topbar");
    if (!topbar) return;
    // Toolbar actions now live in dropdown menus, so no overflow move is needed.
    document.body.classList.add("mobile-mode");
    if (!document.body.getAttribute("data-mview")) setView("chart");
    // 022 — align the pill once the nav is visible in mobile mode
    setTimeout(function () { positionSegPill(bottomNav); }, 90);
  }

  function exitMobile() {
    var topbar = el("topbar");
    var anchor = el("search"); // re-insert before search to keep sensible order
    movedEls.forEach(function (child) {
      var origin = child._origin || topbar;
      if (origin === topbar && anchor && anchor.parentNode === topbar) topbar.insertBefore(child, anchor);
      else origin.appendChild(child);
    });
    movedEls = [];
    if (drawer) { drawer.classList.remove("open"); }
    if (moreBtn) moreBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-mode");
  }

  /* ---------- bottom view nav ---------- */

  /* 022 — measure the active view button and glide the pill to it */
  function positionSegPill(group) {
    if (!group) return;
    var pill = group.querySelector('.seg-pill');
    var active = group.querySelector('button[aria-pressed="true"]');
    if (!pill || !active) return;
    if (!active.offsetWidth) return;   // group hidden (display:none) — skip; re-runs on next show
    pill.style.left = active.offsetLeft + 'px';
    pill.style.width = active.offsetWidth + 'px';
  }

  function setView(view) {
    document.body.setAttribute("data-mview", view);
    if (bottomNav) {
      bottomNav.querySelectorAll("button[data-view]").forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-view") === view ? "true" : "false");
      });
    }
    if (drawer) drawer.classList.remove("open");
    if (moreBtn) moreBtn.setAttribute("aria-expanded", "false");
    // Let CSS apply, then nudge the revealed view to recompute its size.
    setTimeout(function () {
      positionSegPill(bottomNav);
      try {
        if (view === "chart" && window.CRGraph && window.CRGraph.fit) window.CRGraph.fit();
        if (view === "map" && window.CRMapPane) {
          if (window.CRMapPane.invalidate) window.CRMapPane.invalidate();
          if (window.CRMapPane.fitToData) window.CRMapPane.fitToData();
        }
        if (view === "timeline" && window.CRTimeline && window.CRTimeline.render) {
          window.CRTimeline.render();
        }
      } catch (e) { /* view not ready yet */ }
      window.dispatchEvent(new Event("resize"));
    }, 90);
  }

  // When the inspector populates from a chart/map/timeline selection on a phone,
  // hop to the Details tab so the analyst sees it.
  function watchInspector() {
    var insp = el("inspector");
    if (!insp || !window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      if (MQ.matches && insp.textContent.trim() &&
          document.body.getAttribute("data-mview") !== "inspector") {
        // Only auto-switch when something is actually selected.
        if (insp.querySelector(".insp-title, h3, .insp-head, #insp-addphoto")) setView("inspector");
      }
    });
    obs.observe(insp, { childList: true, subtree: false });
  }

  function apply() {
    if (MQ.matches) {
      if (!document.body.classList.contains("mobile-mode")) enterMobile();
    } else {
      if (document.body.classList.contains("mobile-mode")) exitMobile();
    }
  }

  function init() {
    buildChrome();
    apply();
    watchInspector();
    if (MQ.addEventListener) MQ.addEventListener("change", apply);
    else if (MQ.addListener) MQ.addListener(apply); // older WebViews
    // 022 — keep the pill aligned when the group reflows (resize / orientation)
    window.addEventListener("resize", function () { positionSegPill(bottomNav); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CRMobile = { setView: setView };
})();
