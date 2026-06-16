/* SOLAR — charttools.js
 * Build a single "Tools ▾" dropdown as a STANDARD <details class="menu"> so it
 * shares menus.js open/close behaviour and the toolbar's button styling (i.e.
 * it behaves and sizes exactly like Add / Case). Every chart control is moved
 * into it: the static ones declared in #chart-tools, plus the ones injected
 * later by netpanel.js / analytics.js (Path / Key players / Analytics).
 * #chart-tools itself stays hidden as the injection target.
 */
(function () {
  "use strict";
  function init() {
    var src = document.getElementById("chart-tools");
    if (!src || document.getElementById("menu-tools")) return;

    var details = document.createElement("details");
    details.className = "menu";
    details.id = "menu-tools";

    var summary = document.createElement("summary");
    summary.className = "btn";
    summary.title = "Chart tools — layout, physics, fit, legend, analysis";
    summary.innerHTML = 'Tools <span aria-hidden="true">&#9662;</span>';

    var pop = document.createElement("div");
    pop.className = "menu-pop";
    pop.id = "tools-pop";
    pop.setAttribute("role", "menu");
    pop.setAttribute("aria-label", "chart tools");

    details.appendChild(summary);
    details.appendChild(pop);

    function isControl(n) {
      if (!n || n.nodeType !== 1) return false;
      if (n.classList && (n.classList.contains("ct-sep") || n.classList.contains("menu-sep"))) return true;
      return n.tagName === "BUTTON" || n.tagName === "SELECT" || n.tagName === "DETAILS";
    }
    function absorb(n) { if (isControl(n)) pop.appendChild(n); }

    /* drop the menu where #chart-tools sits, move the static controls in */
    src.parentNode.insertBefore(details, src);
    Array.prototype.slice.call(src.children).forEach(absorb);

    /* absorb late-injected controls (Path / Key players / Analytics) */
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.slice.call(m.addedNodes).forEach(absorb);
        });
      }).observe(src, { childList: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
