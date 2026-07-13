/* ============================================================
   SOLAR — unified top-chrome shell (shared: workbench + registry)
   Renders the 3-row chrome + 5-tab mega-menu ABOVE the existing
   toolbars (non-destructive). Each surface passes a spec of menu
   items; [E] items call a real handler, [F] items are "soon" stubs.
   Cross-surface items route to the other surface with the case loaded.

   Chunk 1: scaffold + tab bar on both surfaces (menus minimal).
   Later chunks fill the mega-menu columns + right cluster + settings.
   ============================================================ */
(function () {
  "use strict";

  // Which surface are we on? registry pages live under /registry/.
  var IS_REGISTRY = /\/registry\//.test(location.pathname) || !!document.querySelector("header.masthead");
  var HERO = IS_REGISTRY ? "../hero.html" : "hero.html";
  var OTHER = IS_REGISTRY ? "../index.html" : "registry/index.html";

  var svg = {
    home: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 7l6-5 6 5M4 6.5V13h3.2V9.3h1.6V13H12V6.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    help: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.2 6.1a1.9 1.9 0 1 1 2.5 1.8c-.5.2-.8.6-.8 1.1v.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".8" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    logout: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9.5 3.5H12A1.5 1.5 0 0 1 13.5 5v6A1.5 1.5 0 0 1 12 12.5H9.5M6.5 8h5m0 0L9 5.5M11.5 8L9 10.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    chevL: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M7.5 2.5L4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevR: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  // The 5 tab labels (menu contents are filled per-tab by SHELL_SPEC below).
  var TABS = ["CASE", "INTELLIGENCE", "ENTITIES", "ANALYSIS", "EXPORTS"];

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) { Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); }
    if (html != null) { n.innerHTML = html; }
    return n;
  }

  /* ---- wiring helpers -------------------------------------------------
     The safest, guess-free wiring is to trigger the surface's EXISTING
     controls (which already call the right handlers). clickId() fires an
     existing button by id; only enabled when that button is present.     */
  function byId(id) { return document.getElementById(id); }
  // run() that clicks a control by id, resolved at CLICK time (so it works even
  // if the control lives inside a closed <details> or is rendered after us).
  function clickId(id) { return function () { var n = byId(id); if (n) { n.click(); } }; }
  /* Registry home-view actions (Entity search / Silent hits / Access log) live
     only on the registry home view, which the SPA renders ASYNCHRONOUSLY when
     the brand is clicked. So: click the brand to go home, then poll briefly for
     the target button and click it. Bounded retry (halt after ~1.2s) per the
     loop-safety rule — if it never appears we simply leave the user on home. */
  function registryHomeAction(id) {
    return function () {
      var b = byId(id);
      if (b) { b.click(); return; }                 // already on home
      var brand = document.querySelector(".masthead .brand");
      if (brand) { brand.click(); }                  // navigate to home (async render)
      var tries = 0;
      (function poll() {
        var t = byId(id);
        if (t) { t.click(); return; }
        if (++tries > 24) { return; }                // ~1.2s ceiling, then give up
        setTimeout(poll, 50);
      })();
    };
  }
  // click a control matched by selector (e.g. a data-layout preset)
  function clickSel(sel) { var n = document.querySelector(sel); return n ? function () { n.click(); } : null; }
  // toggle a role="button" pane head (timeline) — dispatches a real click
  function toggleEl(sel) { var n = document.querySelector(sel); return n ? function () { n.click(); } : null; }
  /* Prefer a global API method (robust — independent of whether the old
     toolbar's <details> is open) and fall back to clicking a button by id.
     Returns null only if NEITHER exists, so the item degrades to "soon". */
  function api(path, args, fallbackId) {
    var parts = path.split(".");
    // resolve lazily at click time so script load order never matters
    return function () {
      var obj = window[parts[0]];
      var fn = obj && obj[parts[1]];
      if (typeof fn === "function") { fn.apply(obj, args || []); return; }
      var b = fallbackId && byId(fallbackId);
      if (b) { b.click(); }
    };
  }
  // route to the other surface
  function routeOther() { location.href = OTHER; }

  var ico = {
    plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    doc: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5l3 3V13.5H4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 2.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    save: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h8l2 2v8H3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 3v3.5h5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    map: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s5-4.2 5-8A5 5 0 0 0 3 6c0 3.8 5 8 5 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="6" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    clock: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3.2l2.2 1.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    net: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="4" r="1.7" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="5" r="1.7" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="12" r="1.7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.4 4.6l5 .5M5.2 5.4l1.4 5.2M10.8 6.3L7.8 10.9" stroke="currentColor" stroke-width="1.1"/></svg>',
    filter: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11l-4.2 5v4l-2.6 1.2v-5.2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    merge: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3v3.5A3.5 3.5 0 0 0 7.5 10H12M12 10L9.5 7.5M12 10l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.2 10.2L13.5 13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    layout: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 6.5h11M6.5 6.5v7" stroke="currentColor" stroke-width="1.1"/></svg>',
    fit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    png: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 10.5L6 7.5l2.5 2 2-2.5 3 3.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="6" cy="6" r="1" fill="currentColor"/></svg>',
    diag: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 12l3-6 2 3 2-5 3 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h8M6.5 5V3.5h3V5M5 5l.6 8h4.8L11 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4.5L3 7l3 2.5M3.2 7H10a3 3 0 0 1 0 6H8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    scan: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5V3.5h2M13 5.5V3.5h-2M3 10.5v2h2M13 10.5v2h-2M3 8h10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    globe: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.6 8h10.8M8 2.4c2 2 2 9.2 0 11.2M8 2.4c-2 2-2 9.2 0 11.2" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>'
  };

  /* ---- the per-surface menu spec -------------------------------------
     Each tab → array of columns; each column → { h: heading, items:[...] }.
     An item = { label, icon, run, soon, route }.
       run   : function to call (fires an existing control) — omit/null → "soon"
       soon  : force the "soon" badge (capability exists, no safe trigger yet)
       route : marks the item as crossing to the other surface (arrow hint)
     Missing controls degrade to "soon" automatically (clickId returns null). */
  function buildSpec() {
    if (IS_REGISTRY) { return specRegistry(); }
    return specWorkbench();
  }

  // focus + select the surface search box (real, live on both surfaces)
  function focusSearch() { var s = byId("search"); return s ? function () { s.focus(); if (s.select) { s.select(); } } : null; }

  // layout preset — CRGraph.applyLayout(name), else the preset button
  function layout(name) {
    return function () {
      var g = window.CRGraph;
      if (g && typeof g.applyLayout === "function") { g.applyLayout(name); return; }
      var b = document.querySelector('#menu-layout [data-layout="' + name + '"]'); if (b) { b.click(); }
    };
  }
  // toggle geo containment links — CRGraph state, else the button
  function geoToggle() {
    return function () {
      var g = window.CRGraph;
      if (g && typeof g.setGeoHidden === "function" && typeof g.geoHidden === "function") { g.setGeoHidden(!g.geoHidden()); return; }
      var b = byId("btn-geo"); if (b) { b.click(); }
    };
  }

  function specWorkbench() {
    return {
      CASE: [
        { h: "Case file", items: [
          { label: "Rename case", icon: ico.doc, run: function () { var c = byId("case-name"); if (c) { c.focus(); c.select && c.select(); } } },
          { label: "Save case", icon: ico.save, run: clickId("btn-save") },
          { label: "Open case", icon: ico.doc, run: clickId("btn-open") }
        ] },
        { h: "History", items: [
          { label: "Undo last change", icon: ico.undo, run: clickId("btn-undo") },
          { label: "Clear the chart", icon: ico.trash, run: clickId("btn-clear") }
        ] },
        { h: "Cross-reference", items: [
          { label: "Open the database", icon: ico.grid, run: routeOther, route: true }
        ] }
      ],
      INTELLIGENCE: [
        { h: "Add intelligence", items: [
          { label: "Paste text", icon: ico.doc, run: clickId("btn-paste") },
          { label: "Add from URL", icon: ico.globe, run: clickId("btn-url") },
          { label: "Import CSV", icon: ico.grid, run: clickId("btn-csv") },
          { label: "Scan a photo", icon: ico.scan, run: clickId("btn-scan") },
          { label: "Add files", icon: ico.doc, run: clickId("btn-files") }
        ] },
        { h: "Worked demos", items: [
          { label: "1 · BAINES profile", icon: ico.doc, run: clickId("btn-demo-1") },
          { label: "2 · Surveillance / meeting", icon: ico.doc, run: clickId("btn-demo-2") },
          { label: "3 · Financial enquiries", icon: ico.doc, run: clickId("btn-demo-3") },
          { label: "4 · Travel / border", icon: ico.doc, run: clickId("btn-demo-4") },
          { label: "5 · Arrests", icon: ico.doc, run: clickId("btn-demo-5") }
        ] }
      ],
      ENTITIES: [
        { h: "Find & focus", items: [
          { label: "Search entities", icon: ico.search, run: focusSearch() },
          { label: "Legend & filters", icon: ico.filter, run: api("CRLegend.toggle", [], "btn-legend") },
          { label: "Deconflict duplicates", icon: ico.merge, run: clickId("btn-dedup") }
        ] },
        { h: "Layout", items: [
          { label: "Group by type", icon: ico.grid, run: layout("grouped") },
          { label: "Fit to view", icon: ico.fit, run: api("CRGraph.fit", [], "btn-fit") }
        ] },
        { h: "Cross-reference", items: [
          { label: "Manage in the database", icon: ico.grid, run: routeOther, route: true }
        ] }
      ],
      EXPORTS: [
        { h: "Chart", items: [
          { label: "Export chart PNG", icon: ico.png, run: api("CRGraph.exportPNG", [], "btn-png") }
        ] },
        { h: "Operational", items: [
          { label: "Operational exports…", icon: ico.doc, run: clickId("btn-anx") },
          { label: "Diagnostics", icon: ico.diag, run: clickId("btn-diag") }
        ] }
      ],
      ANALYSIS: [
        { h: "Network", items: [
          { label: "Case analytics", icon: ico.diag, run: api("CRAnalyticsUI.open", [], "btn-analytics") },
          { label: "Key players (centrality)", icon: ico.net, run: api("CRNetPanel.openPlayers", [], "btn-players") },
          { label: "Shortest path", icon: ico.merge, run: api("CRNetPanel.startPath", [], "btn-path") },
          { label: "Deconflict duplicates", icon: ico.merge, run: clickId("btn-dedup") }
        ] },
        { h: "Geospatial", items: [
          { label: "Fit map pins", icon: ico.map, run: api("CRMapPane.fitToData", [], "btn-mapfit") },
          { label: "Measure distance", icon: ico.globe, run: api("CRNetPanel.startMeasure", [], "btn-measure") },
          { label: "Radius search", icon: ico.globe, run: api("CRNetPanel.startRadius", [], "btn-radius") },
          { label: "Geo links on / off", icon: ico.globe, run: geoToggle() }
        ] },
        { h: "Chart layout", items: [
          { label: "Fit to view", icon: ico.fit, run: api("CRGraph.fit", [], "btn-fit") },
          { label: "Force layout (physics)", icon: ico.net, run: api("CRGraph.togglePhysics", [], "btn-physics") },
          { label: "Organic", icon: ico.layout, run: layout("organic") },
          { label: "Grouped by type", icon: ico.grid, run: layout("grouped") },
          { label: "Circle", icon: ico.layout, run: layout("circle") },
          { label: "Hierarchy", icon: ico.layout, run: layout("hierarchy") }
        ] },
        { h: "Filter & focus", items: [
          { label: "Timeline", icon: ico.clock, run: toggleEl("#timeline-head") },
          { label: "Legend & filters", icon: ico.filter, run: api("CRLegend.toggle", [], "btn-legend") },
          { label: "Search the chart", icon: ico.search, run: focusSearch() },
          { label: "Open in Entity Management", icon: ico.net, run: routeOther, route: true }
        ] }
      ]
    };
  }

  function specRegistry() {
    return {
      CASE: [
        { h: "Reports", items: [
          { label: "New report", icon: ico.plus, run: clickId("btn-new") },
          { label: "View all reports", icon: ico.grid, run: registryHomeAction("home-all") },
          { label: "Reload demo", icon: ico.undo, run: registryHomeAction("home-reload") }
        ] },
        { h: "Identity", items: [
          { label: "Set your identity", icon: ico.doc, run: clickId("reg-user") },
          { label: "Lock workspace", icon: ico.doc, run: clickId("reg-lock") }
        ] },
        { h: "Cross-reference", items: [
          { label: "Open the link chart", icon: ico.net, run: clickId("reg-chart"), route: true }
        ] }
      ],
      INTELLIGENCE: [
        { h: "Capture", items: [
          { label: "New report", icon: ico.plus, run: clickId("btn-new") },
          { label: "Intelligence logs", icon: ico.doc, run: clickId("reg-logs") }
        ] },
        { h: "Browse", items: [
          { label: "Search reports", icon: ico.search, run: focusSearch() },
          { label: "View all reports", icon: ico.grid, run: registryHomeAction("home-all") }
        ] }
      ],
      ENTITIES: [
        { h: "Nominals", items: [
          { label: "Entity search", icon: ico.net, run: registryHomeAction("home-entities") },
          { label: "Silent hit list", icon: ico.filter, run: registryHomeAction("home-hits") },
          { label: "Access log", icon: ico.doc, run: registryHomeAction("home-access") }
        ] },
        { h: "Cross-reference", items: [
          { label: "See on the link chart", icon: ico.net, run: clickId("reg-chart"), route: true }
        ] }
      ],
      EXPORTS: [
        { h: "To SOLAR", items: [
          { label: "Export authorised → SOLAR", icon: ico.png, run: registryHomeAction("home-export") },
          { label: "Open the link chart", icon: ico.net, run: clickId("reg-chart"), route: true }
        ] }
      ],
      ANALYSIS: [
        { h: "Nominals", items: [
          // registry home-view buttons — rendered by the SPA after the shell
          // builds, so resolve at click time via registryHomeAction (navigate
          // home, then poll for the button) rather than a build-time snapshot.
          { label: "Entity search", icon: ico.net, run: registryHomeAction("home-entities") },
          { label: "Silent hit list", icon: ico.filter, run: registryHomeAction("home-hits") },
          { label: "Access log", icon: ico.doc, run: registryHomeAction("home-access") }
        ] },
        { h: "Explore", items: [
          { label: "Search reports", icon: ico.search, run: focusSearch() },
          { label: "Compare records", icon: ico.merge, run: focusSearch() }
        ] },
        { h: "Cross-reference", items: [
          { label: "Open the link chart", icon: ico.net, run: clickId("reg-chart"), route: true }
        ] }
      ]
    };
  }

  var SPEC = null; // filled at build()

  /* Render a tab's columns of items into its mega-menu panel. */
  function renderMega(mega, cols) {
    cols.forEach(function (col) {
      var c = el("div", { class: "sh-col" });
      c.appendChild(el("p", { class: "sh-col-h" }, col.h));
      col.items.forEach(function (it) {
        var live = !it.soon && typeof it.run === "function";
        var cls = "sh-item" + (live ? "" : " sh-soon") + (it.route ? " has-route" : "");
        var btn = el("button", { class: cls, type: "button" });
        if (!live) { btn.setAttribute("tabindex", "-1"); }
        var inner = (it.icon || "") + "<span>" + it.label + "</span>";
        if (it.route && live) { inner += '<span class="sh-route">↗</span>'; }
        btn.innerHTML = inner;
        if (live) {
          btn.addEventListener("click", function () {
            // close the menu, then run — so panels/modals open over a clean chrome
            var open = mega.parentNode; if (open) { open.open = false; }
            try { it.run(); } catch (e) { /* never let a wiring slip break the menu */ }
          });
        }
        c.appendChild(btn);
      });
      mega.appendChild(c);
    });
  }

  function build() {
    if (document.getElementById("solar-shell")) { return; }
    SPEC = buildSpec();

    var shell = el("div", { id: "solar-shell" });

    /* ---- Row 1: identity ---- */
    var idRow = el("div", { class: "sh-identity" });
    var wm = el("a", { class: "sh-wordmark", href: HERO, title: "SOLAR home" }, 'SOL<span class="accent">AR</span>');
    var surf = el("div", { class: "sh-surface" });
    surf.appendChild(el("a", IS_REGISTRY ? { href: "#" } : { href: "#", "aria-current": "true" }, "Case Management"));
    surf.appendChild(el("a", IS_REGISTRY ? { href: "#", "aria-current": "true" } : { href: "#" }, "Entity Management"));
    // route the surface links to the corresponding surface
    surf.children[0].addEventListener("click", function (e) { e.preventDefault(); if (IS_REGISTRY) { location.href = OTHER; } });
    surf.children[1].addEventListener("click", function (e) { e.preventDefault(); if (!IS_REGISTRY) { location.href = OTHER; } });
    var user = el("div", { class: "sh-user" }, '<span class="sh-grade">G5</span><span>Benedict WILSON</span>');
    idRow.appendChild(wm); idRow.appendChild(surf); idRow.appendChild(user);

    /* ---- Row 2: menu bar ---- */
    var bar = el("div", { class: "sh-menubar" });
    var home = el("button", { class: "sh-home", type: "button", title: "Home (cover)", "aria-label": "Home" }, svg.home);
    home.addEventListener("click", function () { location.href = HERO; });
    bar.appendChild(home);

    TABS.forEach(function (label) {
      var tab = el("details", { class: "sh-tab" });
      var sum = el("summary", { "aria-label": label }, label);
      tab.appendChild(sum);
      var mega = el("div", { class: "sh-mega", role: "menu", "data-tab": label });
      var cols = (SPEC && SPEC[label]) || null;
      if (cols) { renderMega(mega, cols); }
      else {
        // tabs not yet wired this chunk — honest placeholder
        mega.appendChild(el("div", { class: "sh-col" }, '<p class="sh-col-h">' + label + '</p><button class="sh-item sh-soon" type="button" tabindex="-1">Wired in a later chunk</button>'));
      }
      tab.appendChild(mega);
      bar.appendChild(tab);
    });

    /* ---- right cluster (surface-aware: only real handlers get a button) ----
       Operation log → CRLogPanel.open() (workbench) / #reg-logs (registry).
       What's New / Lock exist on the registry only. Help + Settings open the
       shell's own modal. Logout returns to the cover on both surfaces. */
    var right = el("div", { class: "sh-right" });

    var oplog = el("button", { class: "sh-oplog", type: "button", title: "Operation log" }, "Operation log");
    oplog.addEventListener("click", function () {
      if (IS_REGISTRY) { var b = byId("reg-logs"); if (b) { b.click(); } }
      else if (window.CRLogPanel && window.CRLogPanel.open) { window.CRLogPanel.open(); }
    });
    right.appendChild(oplog);

    if (IS_REGISTRY) {
      var wn = el("button", { class: "sh-whatsnew", type: "button", title: "What’s New" }, "What’s New");
      wn.addEventListener("click", function () { var b = byId("reg-whatsnew"); if (b) { b.click(); } });
      right.appendChild(wn);
    }

    var help = el("button", { class: "sh-icobtn", type: "button", title: "Help & about", "aria-label": "Help and about" }, svg.help);
    help.addEventListener("click", function () { openSettings("about"); });
    right.appendChild(help);

    if (IS_REGISTRY) {
      var lock = el("button", { class: "sh-icobtn", type: "button", title: "Lock workspace", "aria-label": "Lock workspace" }, svg.lock);
      lock.addEventListener("click", function () { var b = byId("reg-lock"); if (b) { b.click(); } });
      right.appendChild(lock);
    }

    var logout = el("button", { class: "sh-icobtn", type: "button", title: "Return to cover", "aria-label": "Return to cover" }, svg.logout);
    logout.addEventListener("click", function () { location.href = HERO; });
    right.appendChild(logout);
    bar.appendChild(right);

    /* ---- Row 3: context selector ---- */
    var ctxToggle = el("button", { class: "sh-ctx-toggle", type: "button", title: "Collapse context row", "aria-label": "Toggle context row" }, svg.chevL);
    var ctx = el("div", { class: "sh-context" });
    ctx.appendChild(el("span", { class: "sh-ctx-label" }, "Context"));
    // Honest, non-interactive indicator (operation scoping is driven inside
    // each surface — the shell reflects it rather than offering a dead control).
    ctx.appendChild(el("span", { class: "sh-ctx-value" }, "All operations"));
    var gear = el("button", { class: "sh-icobtn sh-ctx-gear", type: "button", title: "Settings", "aria-label": "Settings" }, svg.gear);
    gear.addEventListener("click", function () { openSettings("settings"); });
    ctx.appendChild(gear);

    // collapse/expand row 3
    ctxToggle.addEventListener("click", function () {
      var collapsed = shell.classList.toggle("sh-ctx-collapsed");
      ctxToggle.innerHTML = collapsed ? svg.chevR : svg.chevL;
      ctxToggle.title = collapsed ? "Expand context row" : "Collapse context row";
    });
    // the toggle sits at the left edge of the menu bar's row for reachability
    bar.insertBefore(ctxToggle, bar.firstChild);

    shell.appendChild(idRow);
    shell.appendChild(bar);
    shell.appendChild(ctx);

    // mount at the very top of <body>
    document.body.insertBefore(shell, document.body.firstChild);

    wireMenuBehaviour(shell);
  }

  /* ---- Settings / About modal ---------------------------------------
     Real, working controls only: theme (drives the existing #theme-toggle),
     identity (read-only display of the current user), and an About panel.
     Opened by the gear (settings) and the help icon (about).            */
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function setTheme(t) {
    if (currentTheme() === t) { return; }
    var tog = byId("theme-toggle"); // theme.js owns the real toggle + persistence
    if (tog) { tog.click(); }
  }

  function openSettings(focusSection) {
    closeSettings();
    var veil = el("div", { class: "sh-modal-veil", role: "dialog", "aria-modal": "true", "aria-label": "settings" });
    var m = el("div", { class: "sh-modal" });
    var theme = currentTheme();
    m.innerHTML =
      '<h2>Settings</h2>' +
      '<div class="sh-modal-sec" id="sh-set-appearance"><h3>Appearance</h3>' +
        '<label>Theme' +
          '<select id="sh-set-theme">' +
            '<option value="dark"' + (theme === "dark" ? " selected" : "") + '>Dark (periwinkle)</option>' +
            '<option value="light"' + (theme === "light" ? " selected" : "") + '>Light (cream)</option>' +
          '</select>' +
        '</label>' +
      '</div>' +
      '<div class="sh-modal-sec"><h3>Identity</h3>' +
        '<label>Signed in as<span style="font-family:var(--mono);color:var(--dim)">G5 · Benedict WILSON</span></label>' +
        '<p style="font-size:var(--fs-xs);color:var(--faint);margin:2px 0 0">Set your working identity from the header user chip on the ' + (IS_REGISTRY ? "database" : "workbench") + '.</p>' +
      '</div>' +
      '<div class="sh-modal-sec" id="sh-set-about"><h3>About</h3>' +
        '<p style="font-size:var(--fs-sm);color:var(--dim);margin:0 0 6px">SOLAR — link-analysis workbench and structured-intelligence database. Local-only: all case data stays in this browser.</p>' +
        '<p style="font-size:var(--fs-xs);color:var(--faint);margin:0">OFFICIAL · one shared case across both surfaces.</p>' +
      '</div>' +
      '<div class="sh-modal-foot">' +
        '<button class="btn" id="sh-set-close" type="button">Close</button>' +
      '</div>';
    veil.appendChild(m);
    document.body.appendChild(veil);

    byId("sh-set-theme").addEventListener("change", function () { setTheme(this.value); });
    byId("sh-set-close").addEventListener("click", closeSettings);
    veil.addEventListener("click", function (e) { if (e.target === veil) { closeSettings(); } });
    document.addEventListener("keydown", settingsEsc);

    var focusTarget = focusSection === "about" ? byId("sh-set-about") : byId("sh-set-theme");
    if (focusTarget && focusTarget.focus) { try { focusTarget.focus(); } catch (e) { /* noop */ } }
  }
  function settingsEsc(e) { if (e.key === "Escape") { closeSettings(); } }
  function closeSettings() {
    var v = document.querySelector(".sh-modal-veil");
    if (v) { v.remove(); document.removeEventListener("keydown", settingsEsc); }
  }

  /* Only one tab menu open at a time; Esc closes; outside-click closes. */
  function wireMenuBehaviour(shell) {
    var tabs = shell.querySelectorAll("details.sh-tab");
    tabs.forEach(function (t) {
      t.addEventListener("toggle", function () {
        if (t.open) { tabs.forEach(function (o) { if (o !== t) { o.open = false; } }); }
      });
    });
    document.addEventListener("click", function (e) {
      if (!shell.contains(e.target)) { tabs.forEach(function (t) { t.open = false; }); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var any = false;
        tabs.forEach(function (t) { if (t.open) { t.open = false; any = true; } });
        if (any) { e.stopPropagation(); }
      }
    });
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", build); }
  else { build(); }

  window.SolarShell = { rebuild: build, isRegistry: IS_REGISTRY };
})();
