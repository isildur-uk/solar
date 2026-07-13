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

  // The 5 tab labels (menu contents are filled by later chunks via SHELL_SPEC).
  var TABS = ["CASE", "INTELLIGENCE", "ENTITIES", "ANALYSIS", "EXPORTS"];

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) { Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); }
    if (html != null) { n.innerHTML = html; }
    return n;
  }

  function build() {
    if (document.getElementById("solar-shell")) { return; }

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
      // mega-menu panel is filled by SHELL_SPEC later; empty placeholder for now
      var mega = el("div", { class: "sh-mega", role: "menu", "data-tab": label });
      mega.appendChild(el("div", { class: "sh-col" }, '<p class="sh-col-h">' + label + '</p><button class="sh-item sh-soon" type="button" tabindex="-1">Menu wiring lands next chunk</button>'));
      tab.appendChild(mega);
      bar.appendChild(tab);
    });

    var right = el("div", { class: "sh-right" });
    var oplog = el("button", { class: "sh-oplog", type: "button", title: "Operation log" }, "Operation log");
    var wn = el("button", { class: "sh-whatsnew", type: "button", title: "What’s New" }, "What’s New");
    var help = el("button", { class: "sh-icobtn", type: "button", title: "Help", "aria-label": "Help" }, svg.help);
    var lock = el("button", { class: "sh-icobtn", type: "button", title: "Lock workspace", "aria-label": "Lock workspace" }, svg.lock);
    var logout = el("button", { class: "sh-icobtn", type: "button", title: "Return to cover", "aria-label": "Return to cover" }, svg.logout);
    // wire the universally-safe ones now (both surfaces)
    logout.addEventListener("click", function () { location.href = HERO; });
    right.appendChild(oplog); right.appendChild(wn); right.appendChild(help); right.appendChild(lock); right.appendChild(logout);
    bar.appendChild(right);

    /* ---- Row 3: context selector ---- */
    var ctxToggle = el("button", { class: "sh-ctx-toggle", type: "button", title: "Collapse context row", "aria-label": "Toggle context row" }, svg.chevL);
    var ctx = el("div", { class: "sh-context" });
    ctx.appendChild(el("span", { class: "sh-ctx-label" }, "Select context"));
    ctx.appendChild(el("select", { class: "sh-ctx-picker", "aria-label": "Select operation", disabled: "disabled" }, '<option>All operations</option>'));
    var gear = el("button", { class: "sh-icobtn sh-ctx-gear", type: "button", title: "Settings", "aria-label": "Settings" }, svg.gear);
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
