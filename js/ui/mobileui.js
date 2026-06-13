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

    if (!el("btn-more")) {
      moreBtn = document.createElement("button");
      moreBtn.className = "btn";
      moreBtn.id = "btn-more";
      moreBtn.type = "button";
      moreBtn.setAttribute("aria-expanded", "false");
      moreBtn.setAttribute("aria-controls", "more-drawer");
      moreBtn.textContent = "⋯ More";
      topbar.appendChild(moreBtn);
      moreBtn.addEventListener("click", function () {
        var open = drawer.classList.toggle("open");
        moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    } else {
      moreBtn = el("btn-more");
    }

    if (!el("more-drawer")) {
      drawer = document.createElement("div");
      drawer.id = "more-drawer";
      drawer.setAttribute("role", "menu");
      drawer.setAttribute("aria-label", "more actions");
      document.body.appendChild(drawer);
    } else {
      drawer = el("more-drawer");
    }

    if (!el("bottom-nav")) {
      bottomNav = document.createElement("nav");
      bottomNav.id = "bottom-nav";
      bottomNav.setAttribute("aria-label", "view");
      bottomNav.innerHTML =
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
    if (!topbar || !drawer) return;
    moveInto(topbar);            // secondary case actions
    // chart controls are handled by the universal Tools dropdown (charttools.js)
    document.body.classList.add("mobile-mode");
    if (!document.body.getAttribute("data-mview")) setView("chart");
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CRMobile = { setView: setView };
})();
