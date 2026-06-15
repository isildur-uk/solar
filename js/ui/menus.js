/* SOLAR — menus.js
 * Lightweight dropdown behaviour for the toolbar <details class="menu"> groups
 * (Add / Case / Export). The action buttons inside keep their original IDs, so
 * all existing handlers in app.js continue to work — this only manages open/close.
 */
(function () {
  "use strict";

  function closeAll(except) {
    var open = document.querySelectorAll("details.menu[open]");
    for (var i = 0; i < open.length; i++) {
      if (open[i] !== except) open[i].open = false;
    }
  }

  document.addEventListener("click", function (e) {
    var d = e.target.closest ? e.target.closest("details.menu") : null;
    if (!d) { closeAll(null); return; }            /* clicked outside any menu */
    if (e.target.closest(".menu-pop")) {
      /* an action inside the menu was clicked — let its handler run, then close */
      setTimeout(function () { d.open = false; }, 0);
    } else {
      /* a summary was toggled — fold any other open menu */
      closeAll(d);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll(null);
  });
})();
