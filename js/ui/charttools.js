/* SOLAR — charttools.js
 * Collapse the chart control strip (Layout / Fit / Physics / Legend / Demo /
 * Geo / Path / Key players / Analytics) into ONE glass "Tools ▾" dropdown so
 * the chart surface stays clean. Controls are moved (not cloned) so their
 * handlers survive. Late-injected controls (Path / Key players / Analytics,
 * added by netpanel.js / analytics.js after this runs) are absorbed via a
 * MutationObserver, and the Layout <details> menu is captured too.
 */
(function () {
  "use strict";
  function init() {
    var tools = document.getElementById("chart-tools");
    if (!tools || document.getElementById("ct-toggle")) return;

    var pop = document.createElement("div");
    pop.id = "ct-pop";
    pop.setAttribute("role", "menu");
    pop.setAttribute("aria-label", "chart tools");

    var toggle = document.createElement("button");
    toggle.id = "ct-toggle";
    toggle.className = "btn";
    toggle.type = "button";
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.title = "Chart tools — layout, physics, fit, legend, analysis";
    toggle.innerHTML = 'Tools <span aria-hidden="true">&#9662;</span>';

    function isControl(n) {
      return n && n.nodeType === 1 && n !== toggle && n !== pop &&
        (n.tagName === "BUTTON" || n.tagName === "SELECT" || n.tagName === "DETAILS");
    }
    function absorb(n) { if (isControl(n)) pop.appendChild(n); }

    Array.prototype.slice.call(tools.children).forEach(absorb);

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

    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.slice.call(m.addedNodes).forEach(absorb);
        });
      }).observe(tools, { childList: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
