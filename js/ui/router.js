/* ============================================================
   SOLAR — view router (the spine of the unified single-app shell)
   Charting / Analyse / Database are three VIEWS of one document,
   not three apps. This module owns the three things that make that
   true: which view is active, the URL hash, and the mount lifecycle.

   P1: only Charting is an in-document view. Analyse / Database are
   registered as "external" (activate -> navigate, exactly as today)
   until P2 / P3 mount them here. Promoting an external surface to a
   real in-document view is then a one-line change per phase:
     register("analyse", { el: <container> , mount: fn })   // was { external, href }

   No globals leak beyond window.SolarRouter. Nothing self-boots —
   the host page calls start() once the views are registered.
   ============================================================ */
(function () {
  "use strict";

  var views = {};        // surface -> { el, mount, mounted, external, href }
  var active = null;     // currently-shown in-document surface
  var listeners = [];    // onChange(surface, prev) callbacks

  function surfaceFromHash() {
    var h = (location.hash || "").replace(/^#/, "").toLowerCase();
    return views[h] ? h : null;
  }

  /* register(surface, def)
       def.el       — the view's root element (in-document view)
       def.mount    — optional, run once on first activation: mount(el)
       def.external — true => activating navigates (not yet mounted here)
       def.href     — where an external surface navigates to            */
  function register(surface, def) {
    def = def || {};
    views[surface] = {
      el: def.el || null,
      mount: def.mount || null,
      mounted: !!def.el && !def.mount,   // an el with no mount fn is ready as-is
      external: !!def.external,
      href: def.href || null
    };
  }

  function has(surface) { return !!views[surface]; }
  function onChange(fn) { if (typeof fn === "function") { listeners.push(fn); } }

  function activate(surface, opts) {
    var v = views[surface];
    if (!v) { return false; }
    opts = opts || {};

    // Not yet an in-document view — navigate, as the app does today.
    if (v.external) { if (v.href) { location.href = v.href; } return true; }
    if (active === surface) { return true; }

    // Lazy first mount — nothing runs just by being registered.
    if (!v.mounted && typeof v.mount === "function") {
      try { v.mount(v.el); } catch (e) { /* keep the chrome alive */ }
      v.mounted = true;
    }

    // Show the target, hide the rest (in-document views only).
    Object.keys(views).forEach(function (k) {
      var vv = views[k];
      if (!vv.el) { return; }
      if (k === surface) { vv.el.setAttribute("data-active", "true"); }
      else { vv.el.removeAttribute("data-active"); }
    });

    var prev = active;
    active = surface;

    if (!opts.silent) {
      try { if (("#" + surface) !== location.hash) { history.pushState(null, "", "#" + surface); } } catch (e) { /* noop */ }
    }
    listeners.forEach(function (fn) { try { fn(surface, prev); } catch (e) { /* noop */ } });
    return true;
  }

  // Back/forward + manual hash edits move between in-document views.
  window.addEventListener("hashchange", function () {
    var s = surfaceFromHash();
    if (s && !views[s].external) { activate(s, { silent: true }); }
  });

  /* start(defaultSurface) — pick the initial view: the hash if it names a
     mounted view, else the caller's default. Silent (no history push). */
  function start(defaultSurface) {
    var s = surfaceFromHash();
    var pick = (s && !views[s].external) ? s : defaultSurface;
    activate(pick, { silent: true });
  }

  window.SolarRouter = {
    register: register,
    activate: activate,
    onChange: onChange,
    start: start,
    has: has,
    current: function () { return active; }
  };
})();
