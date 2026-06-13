/* SOLAR — charttools.js
 * Collapse the chart control strip (Fit / Physics / Layout / Legend / Demo /
 * Path / Key players / Analytics) into a single "Tools ▾" dropdown so the chart
 * surface stays clean — on every viewport (desktop and phone). The actual
 * buttons are moved (not cloned) so their handlers are preserved.
 */
(function () {
  "use strict";
  function init() {
    var tools = document.getElementById("chart-tools");
    if (!tools || document.getElementById("ct-toggle")) return;
    var kids = Array.prototype.slice.call(tools.children).filter(function (c) {
      return c.tagName === "BUTTON" || c.tagName === "SELECT";
    });
    if (!kids.length) return;
    var pop = document.createElement("div");
    pop.id = "ct-pop"; pop.setAttribute("role", "menu"); pop.setAttribute("aria-label", "chart tools");
    kids.forEach(function (k) { pop.appendChild(k); });
    var toggle = document.createElement("button");
    toggle.id = "ct-toggle"; toggle.className = "btn"; toggle.type = "button";
    toggle.setAttribute("aria-haspopup", "true"); toggle.setAttribute("aria-expanded", "false");
    toggle.title = "Chart tools — layout, physics, fit, legend, analysis";
    toggle.innerHTML = 'Tools <span aria-hidden="true">▾</span>';
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = pop.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (pop.classList.contains("open") && !pop.contains(e.target) && e.target !== toggle) {
        pop.classList.remove("open"); toggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && pop.classList.contains("open")) {
        pop.classList.remove("open"); toggle.setAttribute("aria-expanded", "false");
      }
    });
    tools.appendChild(toggle);
    tools.appendChild(pop);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
