/* shell-lite.js — Analyse's slice of the shared SOLAR shell.
 *
 * Analyse's DOM differs from Charting/Database, so it doesn't load the full,
 * tightly-coupled js/ui/shell.js. Instead it builds the SAME top identity row
 * (#solar-shell > .sh-identity: wordmark "SOLAR — Analyse", the three-surface
 * switcher, the shared SolarIdentity chip) reusing shell.css, so all three
 * functions read as one product. Replaces Analyse's plain <header class="masthead">.
 */
(function () {
  "use strict";
  if (typeof document === "undefined") return;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function build() {
    if (document.getElementById("solar-shell")) return;
    var id = (window.SolarIdentity && window.SolarIdentity.get) ? window.SolarIdentity.get() : { grade: "G5", name: "Analyst" };

    var shell = el("div"); shell.id = "solar-shell";
    var idRow = el("div", "sh-identity");

    var wm = el("a", "sh-wordmark", 'SOL<span class="accent">AR</span><span class="sh-mode"> — <span class="sh-mode-word">Analyse</span></span>');
    wm.href = "../hero.html"; wm.title = "SOLAR home";

    var surf = el("div", "sh-surface");
    var GLOSS = {
      Charting: "Charting — the link-analysis workbench (entities, links, timeline)",
      Analyse: "Analyse — comms/ANPR analysis (movement, links, patterns)",
      Database: "Database — the structured-intelligence registry (reports & entities)"
    };
    var HREF = { Charting: "../index.html", Analyse: "./index.html", Database: "../registry/index.html" };
    ["Charting", "Analyse", "Database"].forEach(function (label) {
      var cur = (label === "Analyse");
      var a = el("a", "sh-surf-btn fx-6", '<span class="sh-surf-label">' + label + '</span>');
      a.href = cur ? "#" : HREF[label];
      if (cur) a.setAttribute("aria-current", "true");
      a.title = GLOSS[label] + (cur ? " · current" : " · switch");
      if (cur) a.addEventListener("click", function (e) { e.preventDefault(); });
      surf.appendChild(a);
    });

    var user = el("div", "sh-user", '<span class="sh-grade">' + esc(id.grade) + '</span><span>' + esc(id.name) + '</span>');
    user.title = "Your identity (shared across SOLAR)";

    idRow.appendChild(wm); idRow.appendChild(surf); idRow.appendChild(user);
    shell.appendChild(idRow);

    // retire Analyse's plain masthead; insert the shared shell after the marking banner
    var old = document.querySelector("header.masthead"); if (old && old.parentNode) old.parentNode.removeChild(old);
    var banner = document.getElementById("marking-banner");
    if (banner && banner.insertAdjacentElement) banner.insertAdjacentElement("afterend", shell);
    else document.body.insertBefore(shell, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
  if (typeof window !== "undefined") window.AnalyseShell = { build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = { build: build };
})();
