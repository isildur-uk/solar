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

  function label(t) { return t === "light" ? "☽ Dark" : "☀ Light"; }
  function apply(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("solar_theme", t); } catch (e) { /* noop */ }
    if (btn) { btn.textContent = label(t); btn.setAttribute("aria-pressed", t === "light" ? "true" : "false"); }
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
