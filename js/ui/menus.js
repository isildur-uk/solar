/* SOLAR — menus.js
 * Open/close behaviour for the toolbar <details class="menu"> groups
 * (Add / Case / Tools, and the nested Layout). Action buttons inside keep their
 * IDs, so app.js handlers still fire — this only manages which menu is open.
 */
(function () {
  "use strict";

  function closeAll(except) {
    var open = document.querySelectorAll("details.menu[open]");
    for (var i = 0; i < open.length; i++) {
      var d = open[i];
      if (d === except) continue;
      if (except && d.contains(except)) continue;   /* keep ancestors of the active menu open */
      d.open = false;
    }
  }

  document.addEventListener("click", function (e) {
    var d = e.target.closest ? e.target.closest("details.menu") : null;
    if (!d) { closeAll(null); return; }                 /* clicked outside any menu */
    var sum = e.target.closest("summary");
    if (sum && sum.parentElement === d) {               /* a menu toggle */
      closeAll(d);                                       /* close siblings, keep ancestors */
      return;
    }
    if (e.target.closest(".menu-pop")) {                 /* an action item — let it run, then close all */
      setTimeout(function () { closeAll(null); }, 0);
    }
  });

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(null); });
})();
