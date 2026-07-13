/* CHART ROOM — theme.js
 * Dark (periwinkle, default) + light (cream/olive) theming with a toggle,
 * plus the global cursor torch and per-button glass spotlight. Additive;
 * degrades safely if elements are absent. Respects prefers-reduced-motion.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var btn = null;

  // Inline SVG icons replace the emoji glyphs (☀/☽ render inconsistently across OSes).
  // Static markup only — never interpolates user input.
  var ICON_MOON = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" fill="currentColor"/></svg>';
  var ICON_SUN = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13"/></g></svg>';
  function label(t) { return t === "light" ? ICON_MOON + "<span>Dark</span>" : ICON_SUN + "<span>Light</span>"; }
  function apply(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("solar_theme", t); } catch (e) { /* noop */ }
    if (btn) { btn.innerHTML = label(t); btn.setAttribute("aria-pressed", t === "light" ? "true" : "false"); }
    if (window.CRGraph && window.CRGraph.rebuild) { try { window.CRGraph.rebuild(); } catch (e) { /* noop */ } }
    try { window.dispatchEvent(new Event("cr-theme")); } catch (e) { /* noop */ }
  }

  function wire() {
    var cur = root.getAttribute("data-theme") || "dark";
    var host = document.getElementById("topbar") || document.querySelector(".masthead") || document.querySelector("header") || document.body;
    if (host) {
      btn = document.createElement("button");
      btn.id = "theme-toggle"; btn.type = "button";
      btn.setAttribute("aria-label", "Toggle light or dark theme");
      btn.addEventListener("click", function () {
        apply(root.getAttribute("data-theme") === "light" ? "dark" : "light");
      });
      host.appendChild(btn);
    }
    apply(cur);

    if (!reduce) {
      var torch = document.createElement("div");
      torch.id = "cursor-torch"; torch.setAttribute("aria-hidden", "true");
      document.body.appendChild(torch);
      var shown = false;
      document.addEventListener("pointermove", function (e) {
        torch.style.setProperty("--tx", e.clientX + "px");
        torch.style.setProperty("--ty", e.clientY + "px");
        if (!shown) { torch.classList.add("on"); shown = true; }
        var b = e.target.closest && e.target.closest(".btn, details.menu > summary");
        if (b) {
          var r = b.getBoundingClientRect();
          b.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
          b.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
        }
      }, { passive: true });
      window.addEventListener("blur", function () { torch.classList.remove("on"); shown = false; });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
