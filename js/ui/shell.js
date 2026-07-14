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
    chevR: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    inbox: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
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
  /* tip(el, text) — attach the portal hover-card (SolarTip) to a control and
     REMOVE any native title so the browser's own tooltip doesn't double up. The
     aria-label (if present) stays for screen readers. Content earns its place:
     say what the control does + its shortcut, never just repeat a visible label. */
  function tip(el, text) {
    if (!el) { return el; }
    el.setAttribute("data-tip", text);
    el.removeAttribute("title");
    return el;
  }
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

  // Read the shared charting-case name from the one source of truth (the case
  // store's localStorage), so both tools show "Case: <name>" consistently.
  function sharedCaseName() {
    try {
      var raw = localStorage.getItem("chart_room_case_v1");
      if (raw) {
        var j = JSON.parse(raw);
        var n = j && j.meta && j.meta.name;
        if (n) { return String(n); }
      }
    } catch (e) { /* noop */ }
    return "Untitled case";
  }

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

  /* CHARTING surface — Solar's own analysis menu (NOT the real DB menu):
     Case · Analysis · Exports, plus a "← Database" bridge. Entities/Intelligence
     are Database activities, reached via ← Database or ⌘K (not duplicated here). */
  function specWorkbench() {
    return {
      CASE: [
        { h: "Case file", items: [
          { label: "Rename case", icon: ico.doc, run: function () { var c = byId("case-name"); if (c) { c.focus(); c.select && c.select(); } } },
          { label: "Save case", icon: ico.save, run: clickId("btn-save") },
          { label: "Open case", icon: ico.doc, run: clickId("btn-open") },
          { label: "Undo last change", icon: ico.undo, run: clickId("btn-undo") },
          { label: "Clear the chart", icon: ico.trash, run: clickId("btn-clear") }
        ] },
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
        ] },
        { h: "Cross-reference", items: [
          { label: "← Database", icon: ico.grid, run: routeOther, route: true, tip: "Switch to the intelligence registry (reports & entities)" }
        ] }
      ],
      ANALYSIS: [
        { h: "Network", items: [
          { label: "Case analytics", icon: ico.diag, run: api("CRAnalyticsUI.open", [], "btn-analytics"), tip: "Summary metrics for the whole chart — counts, densities, key nodes" },
          { label: "Key players (centrality)", icon: ico.net, run: api("CRNetPanel.openPlayers", [], "btn-players"), tip: "Rank the most-connected / most-central entities in the network" },
          { label: "Shortest path", icon: ico.merge, run: api("CRNetPanel.startPath", [], "btn-path"), tip: "Find the fewest links between two entities" },
          { label: "Deconflict duplicates", icon: ico.merge, run: clickId("btn-dedup"), tip: "Find and merge entities that are likely the same person or thing" }
        ] },
        { h: "Geospatial", items: [
          { label: "Fit map pins", icon: ico.map, run: api("CRMapPane.fitToData", [], "btn-mapfit"), tip: "Zoom the map to show every plotted location" },
          { label: "Measure distance", icon: ico.globe, run: api("CRNetPanel.startMeasure", [], "btn-measure"), tip: "Measure the distance between two points on the map" },
          { label: "Radius search", icon: ico.globe, run: api("CRNetPanel.startRadius", [], "btn-radius"), tip: "Find entities within a set radius of a point" },
          { label: "Geo links on / off", icon: ico.globe, run: geoToggle(), tip: "Toggle drawing links between geographically-plotted entities" }
        ] },
        { h: "Chart layout", items: [
          { label: "Fit to view", icon: ico.fit, run: api("CRGraph.fit", [], "btn-fit"), tip: "Zoom the chart so every node is visible" },
          { label: "Force layout (physics)", icon: ico.net, run: function () { var g = window.CRGraph; if (g && g.exitGrid) { g.exitGrid(); } if (g && g.togglePhysics) { g.togglePhysics(); } else { var b = byId("btn-physics"); if (b) { b.click(); } } }, tip: "Let nodes self-arrange by simulated attraction / repulsion" },
          { label: "Grid", icon: ico.grid, run: layout("grid"), tip: "Arrange nodes on a regular grid; dragged nodes snap to it" },
          { label: "Snap to grid (on / off)", icon: ico.grid, run: function () { if (window.CRGraph && window.CRGraph.setSnap) { window.CRGraph.setSnap(); } }, tip: "Align dragged nodes to an invisible grid" },
          { label: "Organic", icon: ico.layout, run: layout("organic"), tip: "Auto-arrange nodes in a natural, spread-out shape" },
          { label: "Grouped by type", icon: ico.grid, run: layout("grouped"), tip: "Cluster nodes by entity type (people, vehicles, …)" },
          { label: "Circle", icon: ico.layout, run: layout("circle"), tip: "Arrange all nodes evenly around a circle" },
          { label: "Hierarchy", icon: ico.layout, run: layout("hierarchy"), tip: "Arrange nodes in tiers, top-down" }
        ] },
        { h: "Filter & focus", items: [
          { label: "Timeline", icon: ico.clock, run: toggleEl("#timeline-head"), tip: "Show the events timeline and scrub through time" },
          { label: "Legend & filters", icon: ico.filter, run: api("CRLegend.toggle", [], "btn-legend"), tip: "Show the legend and filter which entity types are visible" },
          { label: "Search the chart", icon: ico.search, run: focusSearch(), tip: "Jump the focus to the chart search box" },
          { label: "← Database", icon: ico.net, run: routeOther, route: true, tip: "Switch to the intelligence registry (reports & entities)" }
        ] }
      ],
      EXPORTS: [
        { h: "Chart", items: [
          { label: "Export chart PNG", icon: ico.png, run: api("CRGraph.exportPNG", [], "btn-png"), tip: "Save the current chart as a PNG image" }
        ] },
        { h: "Operational", items: [
          { label: "Operational exports…", icon: ico.doc, run: clickId("btn-anx"), tip: "Export to operational formats (i2 ANX, briefing packs)" },
          { label: "Diagnostics", icon: ico.diag, run: clickId("btn-diag"), tip: "Run a self-check and show data-quality warnings" }
        ] }
      ]
    };
  }

  /* DATABASE surface — a TRIMMED replication of the real NCA system menu, scoped
     to Solar's identity (intel DB + charting): Records · INTELLIGENCE · OPERATIONS.
     (Records = Documents + People; renamed from the real system's "COMMON".)
     Disclosure/Exhibits suites were dropped (off-identity). Item labels stay
     verbatim. [E] items wire to Solar's real handlers via the home-proxy /
     clickId registry; [F] items are visible-but-dimmed ("coming soon") via
     soon:true — never a dead click. */
  function soonItem(label, icon, tipText) { return { label: label, icon: icon || ico.doc, soon: true, tip: tipText }; }
  // Deconfliction inbox entry points — wired in the inbox commit via SolarInbox;
  // until then they resolve to nothing (soon). Resolving at click time keeps this
  // spec independent of load order.
  function inbox(view) {
    return function () { if (window.SolarInbox && window.SolarInbox.open) { window.SolarInbox.open(view); } };
  }
  function inboxItem(label, view, icon, tipText) {
    // live only once SolarInbox exists (after the inbox commit); else a soft stub
    return { label: label, icon: icon || ico.doc, run: inbox(view), soon: !(window.SolarInbox && window.SolarInbox.open), tip: tipText };
  }

  function specRegistry() {
    return {
      Records: [
        { h: "Documents", items: [
          { label: "Add Document", icon: ico.doc, run: clickId("btn-new") },
          { label: "Find Documents", icon: ico.search, run: focusSearch() }
        ] },
        { h: "People", items: [
          // View Person opens the dossier; aliases / contact details / PNC are
          // SECTIONS inside that dossier (handlers preserved), not top-level rows.
          { label: "View Person", icon: ico.net, run: registryHomeAction("home-entities") },
          soonItem("Update Person")
        ] }
      ],
      INTELLIGENCE: [
        { h: "Reports", items: [
          { label: "Create Report", icon: ico.plus, run: clickId("btn-new"), tip: "Start a new intelligence report" },
          { label: "Find Authorised Reports", icon: ico.grid, run: registryHomeAction("home-all"), tip: "Reports cleared for use — signed off by a supervisor" },
          { label: "Find Unauthorised Reports", icon: ico.grid, run: registryHomeAction("home-all"), tip: "Reports still awaiting authorisation" },
          { label: "View Suppressed Reports", icon: ico.doc, run: registryHomeAction("home-all"), tip: "Reports withheld from general view (need-to-know)" }
        ] },
        { h: "Entities", items: [
          { label: "View Structured Intelligence", icon: ico.net, run: registryHomeAction("home-entities"), tip: "Browse entities — people, vehicles, premises, accounts — and their links" },
          { label: "View Silent Hit List", icon: ico.filter, run: registryHomeAction("home-hits"), tip: "Watchlist matches raised without alerting the subject" }
        ] },
        { h: "Deconfliction", items: [
          // Wired to the inbox in the deconfliction commit (SolarInbox); [F] until then.
          inboxItem("My Deconfliction Requests", "mine", ico.doc, "Deconfliction threads you have started"),
          inboxItem("Incoming Requests", "incoming", ico.doc, "Deconfliction requests from other operations"),
          inboxItem("Contact Operation Team / Report Author", "compose", ico.net, "Open a secure enquiry to another team or a report's author")
        ] },
        { h: "Dissemination", items: [
          soonItem("Create Package", null, "Bundle intelligence for sharing with a partner"),
          soonItem("Find Packages", null, "Browse existing dissemination packages"),
          soonItem("View Suppressed Packages", null, "Packages withheld from general view")
        ] }
      ],
      OPERATIONS: [
        { h: "Operation Log", items: [
          { label: "View Log", icon: ico.doc, run: clickId("reg-logs"), tip: "Audit trail — every lookup and access, with reason and analyst" }
        ] },
        { h: "Operations", items: [
          soonItem("Create Operation"), soonItem("Operation Profile")
        ] },
        { h: "Actions", items: [
          soonItem("Create Action"), soonItem("Find Actions")
        ] },
        { h: "Decisions", items: [
          soonItem("Add Decision"), soonItem("Update Decision"), soonItem("Find Decisions"),
          soonItem("Print Decision"), soonItem("View Decision")
        ] },
        { h: "Cross-reference", items: [
          { label: "Open in Charting", icon: ico.net, run: clickId("reg-chart"), route: true, tip: "Send these entities to the charting workbench to map their links" }
        ] }
      ]
    };
  }

  var SPEC = null; // filled at build()

  /* ---- breadcrumb trail (the Row-3 context indicator) ----------------
     The surface root is always prepended, so callers pass only the trail
     BELOW the root: setBreadcrumb([{label:"OP PHOENIX", run:goOp}, {label:"IR123"}]).
     Ancestors with a run() render as buttons; the last crumb is the current
     view (plain). XSS-safe (labels escaped). */
  var crumbEl = null;
  function renderCrumbs(trail) {
    if (!crumbEl) { return; }
    var sep = '<span class="sh-crumb-sep" aria-hidden="true">›</span>';
    var html = "";
    trail.forEach(function (c, i) {
      var last = i === trail.length - 1;
      if (i > 0) { html += sep; }
      if (!last && typeof c.run === "function") {
        html += '<button type="button" class="sh-crumb sh-crumb-link" data-ci="' + i + '">' + escHtml(c.label) + '</button>';
      } else {
        html += '<span class="sh-crumb' + (last ? ' is-current' : '') + '"' + (last ? ' aria-current="page"' : '') + '>' + escHtml(c.label) + '</span>';
      }
    });
    crumbEl.innerHTML = html;
    [].forEach.call(crumbEl.querySelectorAll(".sh-crumb-link"), function (b) {
      var idx = +b.getAttribute("data-ci");
      b.addEventListener("click", function () { var c = trail[idx]; if (c && typeof c.run === "function") { try { c.run(); } catch (e) { /* noop */ } } });
    });
  }
  var crumbRootRun = null;   // surface sets how its root navigates (e.g. registry showHome)
  function setBreadcrumbRoot(fn) { crumbRootRun = fn; }
  function setBreadcrumb(trail) {
    var root = { label: IS_REGISTRY ? "Database" : "Charting" };
    if (typeof crumbRootRun === "function") { root.run = crumbRootRun; }
    renderCrumbs([root].concat(trail || []));
  }

  /* Render a tab's columns of items into its mega-menu panel. */
  function renderMega(mega, cols) {
    cols.forEach(function (col) {
      var c = el("div", { class: "sh-col" });
      c.appendChild(el("p", { class: "sh-col-h" }, col.h));
      col.items.forEach(function (it) {
        var live = !it.soon && typeof it.run === "function";
        var cls = "sh-item" + (live ? "" : " sh-soon") + (it.route ? " has-route" : "");
        var btn = el("button", { class: cls, type: "button" });
        if (!live) {
          btn.setAttribute("tabindex", "-1");
          btn.setAttribute("aria-disabled", "true");
        }
        var inner = (it.icon || "") + "<span>" + it.label + "</span>";
        if (it.route && live) { inner += '<span class="sh-route">↗</span>'; }
        btn.innerHTML = inner;
        // hover-card gloss: an explicit one-line plain-English gloss for jargon/
        // abbreviations (it.tip), else "Coming soon" for stubs. Never a tip that
        // merely repeats the visible label. data-tip is textContent-rendered.
        if (it.tip) { tip(btn, it.tip); }
        else if (!live) { tip(btn, "Coming soon"); }
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
    // Mode-aware identity: keep the SOLAR wordmark styling, append the active
    // mode so the top-left reads "SOLAR — Charting" (workbench) / "SOLAR —
    // Database" (registry). One product, two tools.
    var wm = el("a", { class: "sh-wordmark", href: HERO, title: "SOLAR home" },
      'SOL<span class="accent">AR</span><span class="sh-mode"> — <span class="sh-mode-word">' + (IS_REGISTRY ? "Database" : "Charting") + '</span></span>');
    var modeSpan = wm.querySelector(".sh-mode");
    // MARKER-IN (A2): sweep the fx-marker Hi-Liter across the mode word once on
    // load, so switching tools lands with the new mode word highlighting in.
    // The wordmark is always at the top (never scrolled), so — unlike a
    // scroll-triggered heading — we fire the one-shot directly rather than via
    // IntersectionObserver. Reduced-motion is handled in CSS (no paint).
    (function () {
      var word = wm.querySelector(".sh-mode-word");
      if (!word) { return; }
      var span = document.createElement("span");
      span.className = "fx-marker";
      span.textContent = word.textContent;   // plain text — no HTML injection
      word.textContent = "";
      word.appendChild(span);
      // next frame so the resting (0%) state is committed before the sweep runs
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { span.classList.add("is-marking"); });
      });
    })();
    // SMOKE-OUT (A2): switching tools dissolves the OUTGOING mode word (fx-smoke,
    // one-shot) before the page navigates. Reduced-motion -> navigate at once.
    function switchTo(url) {
      var reduce = false;
      try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* noop */ }
      if (reduce || !modeSpan) { location.href = url; return; }
      modeSpan.classList.add("fx-smoke-out");
      var went = false;
      var go = function () { if (!went) { went = true; location.href = url; } };
      modeSpan.addEventListener("animationend", go, { once: true });
      setTimeout(go, 620);   // fallback so navigation never hangs on the effect
    }
    // Surface switch — Ben's fx-6 "Fill Y" hover: a periwinkle fill scales up
    // vertically on hover with the label flipping to dark ink. The CURRENT mode
    // carries aria-current and a persistent distinct state (so it never reads as
    // just an un-hovered button). The label is wrapped so it layers above the fill.
    var surf = el("div", { class: "sh-surface" });
    function surfLink(label, isCurrent) {
      var a = el("a", isCurrent ? { class: "sh-surf-btn fx-6", href: "#", "aria-current": "true" } : { class: "sh-surf-btn fx-6", href: "#" },
        '<span class="sh-surf-label">' + label + '</span>');
      var gloss = label === "Charting"
        ? "Charting — the link-analysis workbench (entities, links, timeline)"
        : "Database — the structured-intelligence registry (reports & entities)";
      tip(a, isCurrent ? gloss + " · current" : gloss + " · switch");
      return a;
    }
    surf.appendChild(surfLink("Charting", !IS_REGISTRY));
    surf.appendChild(surfLink("Database", IS_REGISTRY));
    // route the surface links to the corresponding surface (via the transition)
    surf.children[0].addEventListener("click", function (e) { e.preventDefault(); if (IS_REGISTRY) { switchTo(OTHER); } });
    surf.children[1].addEventListener("click", function (e) { e.preventDefault(); if (!IS_REGISTRY) { switchTo(OTHER); } });
    var user = el("div", { class: "sh-user" }, '<span class="sh-grade">G5</span><span>Benedict WILSON</span>');
    idRow.appendChild(wm); idRow.appendChild(surf);
    // Shared "Case: <name>" context — the SAME case reads on BOTH tools (one
    // product). The workbench re-parents its editable #case-name input into this
    // slot (editable there); the registry shows the same name read-only from the
    // shared store so the analyst always sees which case they're working.
    var caseSlot = el("div", { class: "sh-case" });
    caseSlot.appendChild(el("span", { class: "sh-case-label" }, "Case"));
    if (IS_REGISTRY) {
      var roName = el("span", { class: "sh-case-name", title: "Active charting case (shared)" }, escHtml(sharedCaseName()));
      caseSlot.appendChild(roName);
      // keep it fresh if the workbench edits the case in another tab
      window.addEventListener("storage", function (e) {
        if (e.key === "chart_room_case_v1") { roName.textContent = sharedCaseName(); }
      });
    }
    idRow.appendChild(caseSlot);
    idRow.appendChild(user);

    /* ---- Row 2: menu bar ---- */
    var bar = el("div", { class: "sh-menubar" });
    var home = el("button", { class: "sh-home", type: "button", "aria-label": "Home" }, svg.home);
    tip(home, "Return to the SOLAR cover page");
    home.addEventListener("click", function () { location.href = HERO; });
    bar.appendChild(home);

    // Per-surface tab set: the Database replicates the real NCA 5-tab bar; the
    // Charting keeps its own analysis tabs. Order = SPEC insertion order.
    var tabLabels = (SPEC && Object.keys(SPEC).length) ? Object.keys(SPEC) : TABS;
    tabLabels.forEach(function (label) {
      var tab = el("details", { class: "sh-tab" });
      var sum = el("summary", { "aria-label": label }, label);
      tab.appendChild(sum);
      var mega = el("div", { class: "sh-mega sh-mega-wide", role: "menu", "data-tab": label });
      var cols = (SPEC && SPEC[label]) || null;
      if (cols) { renderMega(mega, cols); }
      else {
        mega.appendChild(el("div", { class: "sh-col" }, '<p class="sh-col-h">' + label + '</p><button class="sh-item sh-soon" type="button" tabindex="-1">Coming soon</button>'));
      }
      tab.appendChild(mega);
      bar.appendChild(tab);
    });

    /* ---- right cluster (surface-aware: only real handlers get a button) ----
       Operation log → CRLogPanel.open() (workbench) / #reg-logs (registry).
       What's New / Lock exist on the registry only. Help + Settings open the
       shell's own modal. Logout returns to the cover on both surfaces. */
    var right = el("div", { class: "sh-right" });

    // ⌘K palette hint — a small monochrome affordance at the right edge (macOS
    // menu-extra feel). Shows the platform key (⌘ on Mac, Ctrl elsewhere) and
    // opens the same command palette as the shortcut.
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
    var kbdHint = el("button", { class: "sh-kbd-hint", type: "button", "aria-label": "Open command palette" },
      '<span class="sh-kbd-key">' + (isMac ? "⌘" : "Ctrl") + '</span><span class="sh-kbd-key">K</span>');
    tip(kbdHint, "Command palette — jump to any action, report or entity · " + (isMac ? "⌘K" : "Ctrl-K"));
    kbdHint.addEventListener("click", function () { openPalette(); });
    right.appendChild(kbdHint);

    var oplog = el("button", { class: "sh-oplog", type: "button" }, "Operation log");
    tip(oplog, IS_REGISTRY
      ? "Audit trail — every lookup and access recorded with reason and analyst"
      : "Operation log — the chart's change history and activity trail");
    oplog.addEventListener("click", function () {
      if (IS_REGISTRY) { var b = byId("reg-logs"); if (b) { b.click(); } }
      else if (window.CRLogPanel && window.CRLogPanel.open) { window.CRLogPanel.open(); }
    });
    right.appendChild(oplog);

    if (IS_REGISTRY) {
      var wn = el("button", { class: "sh-whatsnew", type: "button" }, "What’s New");
      tip(wn, "Recent changes and additions to this release");
      wn.addEventListener("click", function () { var b = byId("reg-whatsnew"); if (b) { b.click(); } });
      right.appendChild(wn);
    }

    // Secure inbox (deconfliction + messaging) — registry surface only. Shows an
    // unread-count badge; opens the SolarInbox drawer. Registered as a shell
    // action so ⌘K / the Deconfliction menu items reach the same panel.
    if (IS_REGISTRY) {
      var inboxBtn = el("button", { class: "sh-icobtn sh-inbox", type: "button", "aria-label": "Secure inbox" }, svg.inbox);
      var inboxBadge = el("span", { class: "sh-inbox-badge", "aria-hidden": "true" });
      inboxBadge.hidden = true; inboxBtn.appendChild(inboxBadge);
      function reflectInbox() {
        var n = (window.SolarInbox && window.SolarInbox.unreadCount) ? window.SolarInbox.unreadCount() : 0;
        inboxBadge.textContent = n > 9 ? "9+" : String(n);
        inboxBadge.hidden = !n;
        var label = n ? ("Secure inbox — " + n + " unread") : "Secure inbox";
        inboxBtn.setAttribute("aria-label", label);
        // tip carries the live unread count + what it is (deconfliction + messaging)
        tip(inboxBtn, "Secure inbox — deconfliction requests & messages" + (n ? " · " + n + " unread" : " · no unread"));
      }
      inboxBtn.addEventListener("click", function () { if (window.SolarInbox) { window.SolarInbox.open("list"); } });
      window.addEventListener("solar-inbox", reflectInbox);
      reflectInbox();
      right.appendChild(inboxBtn);
    }

    var help = el("button", { class: "sh-icobtn", type: "button", "aria-label": "Help and about" }, svg.help);
    tip(help, "Help & about — keyboard shortcuts and version");
    help.addEventListener("click", function () { openSettings("about"); });
    right.appendChild(help);

    if (IS_REGISTRY) {
      var lock = el("button", { class: "sh-icobtn", type: "button", "aria-label": "Lock workspace" }, svg.lock);
      tip(lock, "Lock the workspace — blur the screen and require re-entry");
      lock.addEventListener("click", function () { var b = byId("reg-lock"); if (b) { b.click(); } });
      right.appendChild(lock);
    }

    var logout = el("button", { class: "sh-icobtn", type: "button", "aria-label": "Return to cover" }, svg.logout);
    tip(logout, "Sign out to the SOLAR cover page");
    logout.addEventListener("click", function () { location.href = HERO; });
    right.appendChild(logout);
    bar.appendChild(right);

    /* ---- Row 3: context selector ---- */
    var ctxToggle = el("button", { class: "sh-ctx-toggle", type: "button", "aria-label": "Toggle context row" }, svg.chevL);
    tip(ctxToggle, "Hide the breadcrumb & search row");
    var ctx = el("div", { class: "sh-context" });
    // Live breadcrumb trail (the context indicator). Each surface pushes its
    // trail via SolarShell.setBreadcrumb(); ancestors are clickable to navigate
    // up. Seeded with the surface root so it is never empty.
    var crumbs = el("nav", { class: "sh-crumbs", "aria-label": "Breadcrumb" });
    ctx.appendChild(crumbs);
    crumbEl = crumbs;
    renderCrumbs([{ label: IS_REGISTRY ? "Database" : "Charting" }]);
    // Search slot — receives the real #search input (re-parented after mount).
    var searchSlot = el("div", { class: "sh-search" });
    ctx.appendChild(searchSlot);
    var gear = el("button", { class: "sh-icobtn sh-ctx-gear", type: "button", "aria-label": "Settings" }, svg.gear);
    tip(gear, "Settings — theme, sound and identity");
    gear.addEventListener("click", function () { openSettings("settings"); });
    ctx.appendChild(gear);
    // compact sound toggle (beside theme) + theme switch — far right of Row 3
    ctx.appendChild(buildSoundToggle(true));
    ctx.appendChild(buildThemeSwitch(true));

    // collapse/expand row 3
    ctxToggle.addEventListener("click", function () {
      var collapsed = shell.classList.toggle("sh-ctx-collapsed");
      ctxToggle.innerHTML = collapsed ? svg.chevR : svg.chevL;
      tip(ctxToggle, collapsed ? "Show the breadcrumb & search row" : "Hide the breadcrumb & search row");
    });
    // the toggle sits at the left edge of the menu bar's row for reachability
    bar.insertBefore(ctxToggle, bar.firstChild);

    shell.appendChild(idRow);
    shell.appendChild(bar);
    shell.appendChild(ctx);

    // mount at the very top of <body>
    document.body.insertBefore(shell, document.body.firstChild);

    wireMenuBehaviour(shell);
    retireToolbars(shell);
  }

  /* ---- Chunk 5: shell becomes the sole chrome ------------------------
     Hide the old toolbars (keep their nodes — the mega-menu still proxies
     their buttons via .click()) and RE-PARENT the two inputs that need to
     be visible/focusable (#search, #case-name) into the shell. We move the
     real nodes (never clone) so ids + listeners stay intact.               */
  function retireToolbars(shell) {
    // 1) relocate #search into Row 3 (both surfaces)
    var search = byId("search");
    var searchSlot = shell.querySelector(".sh-search");
    if (search && searchSlot) {
      search.classList.add("sh-search-input");
      search.setAttribute("placeholder", IS_REGISTRY ? "Search reports…" : "Search entities & chart…");
      search.setAttribute("aria-label", IS_REGISTRY ? "Search reports" : "Search entities and chart");
      searchSlot.appendChild(search);
    }

    // 2) relocate #case-name into Row 1 (workbench only)
    var caseName = byId("case-name");
    var caseSlot = shell.querySelector(".sh-case");
    if (!IS_REGISTRY && caseName && caseSlot) {
      caseName.classList.add("sh-case-input");
      caseName.setAttribute("aria-label", "Case name");
      caseName.setAttribute("title", "Click to rename this case");
      caseSlot.appendChild(caseName);
    }

    // 3) hide the old toolbars — nodes stay in the DOM as the control substrate
    var oldBar = IS_REGISTRY ? document.querySelector("header.masthead") : byId("topbar");
    if (oldBar) { oldBar.classList.add("sh-retired"); }
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

  /* ---- theme switch (Switch, not Checkbox) ---------------------------
     A real dark/light toggle. Drives #theme-toggle (theme.js owns apply +
     localStorage persistence), reflects state via aria-checked, and stays
     in sync across every instance (Settings + Row 3) via the cr-theme event
     theme.js dispatches. Sun = will-go-light, Moon = will-go-dark.        */
  var SUN_G = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="3.1" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1.4v1.8M8 12.8v1.8M1.4 8h1.8M12.8 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3"/></g></svg>';
  var MOON_G = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M13 9.6A5.6 5.6 0 0 1 6.4 3 5.6 5.6 0 1 0 13 9.6z" fill="currentColor"/></svg>';
  var themeSwitches = [];

  function buildThemeSwitch(compact) {
    // isLight == the "on" position (periwinkle-lit); toggling flips the theme
    var sw = el("button", {
      type: "button", class: "sh-switch" + (compact ? " sh-switch-c" : ""),
      role: "switch", "aria-label": "Toggle light theme"
    });
    sw.innerHTML =
      '<span class="sh-switch-track"><span class="sh-switch-thumb">' +
        '<span class="sh-switch-ico sh-ico-moon">' + MOON_G + '</span>' +
        '<span class="sh-switch-ico sh-ico-sun">' + SUN_G + '</span>' +
      '</span></span>' +
      (compact ? '' : '<span class="sh-switch-label"></span>');
    function reflect() {
      var light = currentTheme() === "light";
      sw.setAttribute("aria-checked", light ? "true" : "false");
      var lbl = sw.querySelector(".sh-switch-label");
      if (lbl) { lbl.textContent = light ? "Light" : "Dark"; }
      tip(sw, light ? "Switch to dark theme (currently light)" : "Switch to light theme (currently dark)");
    }
    sw.addEventListener("click", function () {
      setTheme(currentTheme() === "light" ? "dark" : "light");
      if (window.SolarSound) { window.SolarSound.play("toggle"); }   // theme toggle cue (user action only)
    });
    themeSwitches.push(reflect);
    reflect();
    return sw;
  }

  /* ---- sound / mute toggle ------------------------------------------------
     A speaker button that mutes/unmutes the UI-sound layer. SolarSound owns the
     preference + persistence (localStorage solar_muted) and dispatches a
     "solar-sound" event; every instance (Row 3 + Settings, both surfaces) stays
     in sync via that event. Default-on at low volume; reduced-motion defaults to
     muted (SolarSound handles the default). Sound is always supplementary. */
  var SPKR_ON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8.5 2.2 4.7 5H2.4A.9.9 0 0 0 1.5 6v4a.9.9 0 0 0 .9.9h2.3l3.8 2.8a.6.6 0 0 0 1-.5V2.7a.6.6 0 0 0-1-.5z" fill="currentColor"/><path d="M11 5.5a3.2 3.2 0 0 1 0 5M12.8 3.8a5.6 5.6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
  var SPKR_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8.5 2.2 4.7 5H2.4A.9.9 0 0 0 1.5 6v4a.9.9 0 0 0 .9.9h2.3l3.8 2.8a.6.6 0 0 0 1-.5V2.7a.6.6 0 0 0-1-.5z" fill="currentColor"/><path d="M11 6l3 4M14 6l-3 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
  var soundToggles = [];

  function buildSoundToggle(compact) {
    var btn = el("button", {
      type: "button", class: "sh-icobtn sh-sound" + (compact ? " sh-sound-c" : ""),
      "aria-label": "Toggle UI sound"
    });
    function reflect() {
      var muted = !!(window.SolarSound && window.SolarSound.isMuted());
      btn.innerHTML = muted ? SPKR_OFF : SPKR_ON;
      if (!compact) { btn.innerHTML += '<span class="sh-sound-label">' + (muted ? "Sound off" : "Sound on") + '</span>'; }
      btn.setAttribute("aria-pressed", muted ? "false" : "true");
      btn.classList.toggle("is-muted", muted);
      tip(btn, muted ? "Turn on UI sound (currently muted)" : "Mute UI sound (currently on)");
    }
    btn.addEventListener("click", function () {
      if (window.SolarSound) {
        var nowMuted = window.SolarSound.toggleMuted();
        if (!nowMuted) { window.SolarSound.play("toggle"); }   // audible confirm only when turning ON
      }
      reflect();
    });
    soundToggles.push(reflect);
    reflect();
    return btn;
  }
  // keep every sound-toggle instance in sync when the preference changes anywhere
  window.addEventListener("solar-sound", function () { soundToggles.forEach(function (r) { try { r(); } catch (e) { /* noop */ } }); });
  // keep all switch instances in sync whenever the theme actually changes
  window.addEventListener("cr-theme", function () { themeSwitches.forEach(function (r) { try { r(); } catch (e) { /* noop */ } }); });

  function openSettings(focusSection) {
    closeSettings();
    var veil = el("div", { class: "sh-modal-veil", role: "dialog", "aria-modal": "true", "aria-label": "settings" });
    var m = el("div", { class: "sh-modal" });
    m.innerHTML =
      '<h2>Settings</h2>' +
      '<div class="sh-modal-sec" id="sh-set-appearance"><h3>Appearance</h3>' +
        '<div class="sh-set-row"><span class="sh-set-row-label">Theme</span><span id="sh-set-theme-slot"></span></div>' +
        '<div class="sh-set-row"><span class="sh-set-row-label">UI sound</span><span id="sh-set-sound-slot"></span></div>' +
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

    var themeSwitch = buildThemeSwitch(false);
    byId("sh-set-theme-slot").appendChild(themeSwitch);
    byId("sh-set-sound-slot").appendChild(buildSoundToggle(false));
    byId("sh-set-close").addEventListener("click", closeSettings);
    veil.addEventListener("click", function (e) { if (e.target === veil) { closeSettings(); } });
    document.addEventListener("keydown", settingsEsc);

    var focusTarget = focusSection === "about" ? byId("sh-set-about") : themeSwitch;
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
        if (t.open) {
          tabs.forEach(function (o) { if (o !== t) { o.open = false; } });
          if (window.SolarSound) { window.SolarSound.play("open"); }   // mega-menu open cue
        }
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

  /* ==================================================================
     Command palette (⌘K / Ctrl+K) — the shared power surface.
     Fuzzy-searches commands from providers: the mega-menu actions + the
     surface switch are built in; each surface can registerCommands() to
     add its own domain data (operations, reports, entities) that reuse the
     same navigation handlers, so there is ONE source of truth. All rendered
     analyst text is escaped. Fully keyboard-driven + focus-trapped.       */
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // subsequence fuzzy match — returns a score (lower = better) or -1 if no match
  function fuzzy(query, text) {
    if (!query) { return 0; }
    var q = query.toLowerCase(), t = text.toLowerCase();
    var idx = t.indexOf(q);
    if (idx !== -1) { return idx === 0 ? -5 : idx; }  // contiguous hit ranks best
    var qi = 0, ti = 0, first = -1, last = -1;
    while (qi < q.length && ti < t.length) {
      if (q[qi] === t[ti]) { if (first < 0) { first = ti; } last = ti; qi++; }
      ti++;
    }
    if (qi < q.length) { return -1; }               // not all chars matched
    return 40 + (last - first);                     // subsequence spread penalty
  }

  var commandProviders = [];
  // providers are functions returning [{ label, hint, group, run }]
  function registerCommands(fn) { if (typeof fn === "function") { commandProviders.push(fn); } }

  // built-in provider: every live mega-menu item + the surface switch
  function builtinCommands() {
    var out = [];
    if (SPEC) {
      Object.keys(SPEC).forEach(function (tab) {
        (SPEC[tab] || []).forEach(function (col) {
          (col.items || []).forEach(function (it) {
            if (!it.soon && typeof it.run === "function") {
              out.push({ label: it.label, hint: tab + " · " + col.h, group: "Actions", run: it.run });
            }
          });
        });
      });
    }
    out.push({
      label: IS_REGISTRY ? "Open Charting (workbench)" : "Open Database (registry)",
      hint: "Switch tool", group: "Navigate", run: function () { location.href = OTHER; }
    });
    out.push({ label: "Settings", hint: "Theme, identity, about", group: "Navigate", run: function () { openSettings("settings"); } });
    return out;
  }

  function collectCommands() {
    var all = builtinCommands();
    commandProviders.forEach(function (fn) {
      try { var extra = fn(); if (extra && extra.length) { all = all.concat(extra); } } catch (e) { /* a bad provider never breaks the palette */ }
    });
    return all;
  }

  var pal = null;      // { veil, input, list, items, active, prevFocus }

  function openPalette() {
    if (pal) { return; }
    if (window.SolarSound) { window.SolarSound.play("open"); }   // ⌘K palette open cue
    var prevFocus = document.activeElement;
    var veil = el("div", { class: "sh-pal-veil", role: "dialog", "aria-modal": "true", "aria-label": "Command palette" });
    var box = el("div", { class: "sh-pal" });
    var input = el("input", { class: "sh-pal-input", type: "text", role: "combobox", "aria-expanded": "true", "aria-controls": "sh-pal-list", "aria-autocomplete": "list", placeholder: "Type a command, operation, report or entity…", autocomplete: "off", spellcheck: "false" });
    var list = el("ul", { class: "sh-pal-list", id: "sh-pal-list", role: "listbox" });
    box.appendChild(input); box.appendChild(list);
    veil.appendChild(box);
    document.body.appendChild(veil);

    pal = { veil: veil, input: input, list: list, items: [], active: 0, prevFocus: prevFocus, all: collectCommands() };

    input.addEventListener("input", function () { renderPalette(input.value); });
    input.addEventListener("keydown", paletteKeydown);
    veil.addEventListener("mousedown", function (e) { if (e.target === veil) { closePalette(); } });

    renderPalette("");
    input.focus();
  }

  function renderPalette(query) {
    var q = query.trim();
    var scored = [];
    pal.all.forEach(function (cmd) {
      var s = fuzzy(q, cmd.label + " " + (cmd.hint || ""));
      if (s !== -1) { scored.push({ cmd: cmd, score: s }); }
    });
    scored.sort(function (a, b) { return a.score - b.score; });
    scored = scored.slice(0, 40);
    pal.items = scored.map(function (x) { return x.cmd; });
    pal.active = 0;

    if (!pal.items.length) {
      pal.list.innerHTML = '<li class="sh-pal-empty" role="option" aria-disabled="true">No matches</li>';
      return;
    }
    var lastGroup = null, html = "";
    pal.items.forEach(function (cmd, i) {
      if (cmd.group && cmd.group !== lastGroup) { html += '<li class="sh-pal-group" role="presentation">' + escHtml(cmd.group) + '</li>'; lastGroup = cmd.group; }
      html += '<li class="sh-pal-item' + (i === 0 ? ' is-active' : '') + '" role="option" id="sh-pal-opt-' + i + '" data-i="' + i + '"' + (i === 0 ? ' aria-selected="true"' : '') + '>' +
        '<span class="sh-pal-label">' + escHtml(cmd.label) + '</span>' +
        (cmd.hint ? '<span class="sh-pal-hint">' + escHtml(cmd.hint) + '</span>' : '') + '</li>';
    });
    pal.list.innerHTML = html;
    pal.input.setAttribute("aria-activedescendant", "sh-pal-opt-0");
    [].forEach.call(pal.list.querySelectorAll(".sh-pal-item"), function (li) {
      li.addEventListener("mousemove", function () { setActive(+li.getAttribute("data-i")); });
      li.addEventListener("click", function () { runPalette(+li.getAttribute("data-i")); });
    });
  }

  function setActive(i) {
    if (!pal || !pal.items.length) { return; }
    if (i < 0) { i = pal.items.length - 1; }
    if (i >= pal.items.length) { i = 0; }
    pal.active = i;
    [].forEach.call(pal.list.querySelectorAll(".sh-pal-item"), function (li) {
      var on = +li.getAttribute("data-i") === i;
      li.classList.toggle("is-active", on);
      if (on) { li.setAttribute("aria-selected", "true"); li.scrollIntoView({ block: "nearest" }); }
      else { li.removeAttribute("aria-selected"); }
    });
    pal.input.setAttribute("aria-activedescendant", "sh-pal-opt-" + i);
  }

  function runPalette(i) {
    if (!pal || !pal.items.length) { return; }
    var cmd = pal.items[i == null ? pal.active : i];
    closePalette();
    if (cmd && typeof cmd.run === "function") { try { cmd.run(); } catch (e) { /* noop */ } }
  }

  function paletteKeydown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(pal.active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(pal.active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); runPalette(); }
    else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    else if (e.key === "Tab") { e.preventDefault(); setActive(pal.active + (e.shiftKey ? -1 : 1)); }  // trap focus in the input
  }

  function closePalette() {
    if (!pal) { return; }
    var prev = pal.prevFocus;
    pal.veil.remove();
    pal = null;
    if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* noop */ } }
  }

  // global ⌘K / Ctrl+K
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (pal) { closePalette(); } else { openPalette(); }
    }
  });

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", build); }
  else { build(); }

  /* ---- fx-marker one-shot driver -------------------------------------------
     markHeading(el) wraps the heading's text in a .fx-marker span (if not
     already) and fires the cosmic Hi-Liter sweep ONCE when it scrolls into
     view. A per-element guard (data-marked) means a re-render that calls this
     again won't re-highlight. Reduced-motion is handled in CSS (no sweep). */
  var _markObserver = null;
  function markHeading(host) {
    if (!host || host.getAttribute("data-marked") === "1") { return; }
    host.setAttribute("data-marked", "1");
    // wrap the text content so the marker paints behind the glyphs only
    var span;
    if (host.querySelector(".fx-marker")) {
      span = host.querySelector(".fx-marker");
    } else {
      span = document.createElement("span");
      span.className = "fx-marker";
      // move existing text nodes into the span (plain text — no HTML injection)
      span.textContent = host.textContent;
      host.textContent = "";
      host.appendChild(span);
    }
    var fire = function () { span.classList.add("is-marking"); };
    if (typeof IntersectionObserver === "function") {
      if (!_markObserver) {
        _markObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              en.target.classList.add("is-marking");
              _markObserver.unobserve(en.target);
            }
          });
        }, { threshold: 0.6 });
      }
      _markObserver.observe(span);
    } else {
      fire();   // no IO support -> just fire on call
    }
  }

  window.SolarShell = { rebuild: build, isRegistry: IS_REGISTRY, registerCommands: registerCommands, openPalette: openPalette, setBreadcrumb: setBreadcrumb, setBreadcrumbRoot: setBreadcrumbRoot, markHeading: markHeading };
})();
