/* SOLAR — tooltip.js
 * Portal-based hover-card tooltips. A single body-appended card is positioned
 * by JS, so styled tooltips WORK even when the host sits inside an
 * overflow:hidden / clipped container (which defeats a pure-CSS ::after).
 *
 * Usage: put data-tip="plain text" on any element. The card shows on hover AND
 * keyboard focus. Content is set via textContent (never innerHTML) so analyst-
 * supplied values can never inject markup. Smart-positioned: prefers above,
 * flips below/left/right near edges. Reduced-motion -> instant.
 *
 * Stacking: the card is the LAST direct child of <body> (re-appended on every
 * show) with a near-max z-index, and it is NEVER placed inside a transform/
 * filter/perspective ancestor (which would create a containing block for the
 * fixed card and trap it). Opacity is set directly (not only via a CSS class)
 * so it reveals even where CSS transitions are throttled.
 */
(function () {
  "use strict";

  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var OPEN_DELAY = 450;   // ms — native "considered" feel; tips don't flash on a quick pass-over
  var card = null;
  var arrow = null;
  var body = null;
  var activeHost = null;
  var hideTimer = null;
  var openTimer = null;
  var pendingHost = null;

  function ensureCard() {
    if (card) { return card; }
    card = document.createElement("div");
    card.className = "sol-tip";
    card.setAttribute("role", "tooltip");
    card.setAttribute("aria-hidden", "true");
    arrow = document.createElement("span");
    arrow.className = "sol-tip-arrow";
    arrow.setAttribute("aria-hidden", "true");
    card.appendChild(arrow);
    body = document.createElement("span");
    body.className = "sol-tip-body";
    card.appendChild(body);
    document.body.appendChild(card);
    return card;
  }

  // Keep the card the LAST direct child of <body> so nothing out-stacks it.
  function raise() {
    if (card && card.parentNode === document.body && document.body.lastElementChild !== card) {
      document.body.appendChild(card);
    }
  }

  function position(host) {
    var c = card;
    var hr = host.getBoundingClientRect();
    c.style.left = "0px"; c.style.top = "0px";
    var cw = c.offsetWidth, ch = c.offsetHeight;
    var gap = 10, vw = window.innerWidth, vh = window.innerHeight;

    var placement = "top";
    var top = hr.top - ch - gap;
    var left = hr.left + hr.width / 2 - cw / 2;

    if (top < 4) { placement = "bottom"; top = hr.bottom + gap; }
    if (left < 4) { left = 4; }
    if (left + cw > vw - 4) { left = vw - 4 - cw; }
    if (placement === "bottom" && top + ch > vh - 4) {
      if (hr.left > vw - hr.right) { placement = "left"; left = hr.left - cw - gap; top = hr.top + hr.height / 2 - ch / 2; }
      else { placement = "right"; left = hr.right + gap; top = hr.top + hr.height / 2 - ch / 2; }
      if (top < 4) { top = 4; }
      if (top + ch > vh - 4) { top = vh - 4 - ch; }
    }

    c.setAttribute("data-placement", placement);
    c.style.left = Math.round(left) + "px";
    c.style.top = Math.round(top) + "px";

    if (placement === "top" || placement === "bottom") {
      var ax = Math.max(10, Math.min(cw - 10, hr.left + hr.width / 2 - left));
      arrow.style.left = Math.round(ax) + "px"; arrow.style.top = "";
    } else {
      var ay = Math.max(10, Math.min(ch - 10, hr.top + hr.height / 2 - top));
      arrow.style.top = Math.round(ay) + "px"; arrow.style.left = "";
    }
  }

  function show(host) {
    var txt = host.getAttribute("data-tip");
    if (!txt) { return; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    var c = ensureCard();
    raise();
    body.textContent = txt;             // PLAIN TEXT — no injection
    activeHost = host;
    c.style.display = "block";
    position(host);
    // reveal: set opacity directly (robust where transitions are throttled) and
    // add the class (drives the fade + transform where the compositor ticks).
    c.offsetWidth;                      // reflow so the transition has a start state
    c.classList.add("is-on");
    c.style.opacity = "1";
    c.setAttribute("aria-hidden", "false");
  }

  function cancelOpen() {
    if (openTimer) { clearTimeout(openTimer); openTimer = null; }
    pendingHost = null;
  }

  // requestShow gates HOVER opens behind a ~450ms delay (the native "considered"
  // feel — a tip never flashes on a quick pass-over). Keyboard focus passes
  // immediate=true so it appears at once for accessibility.
  function requestShow(host, immediate) {
    if (!host || host === activeHost) { return; }
    if (immediate || reduce) { cancelOpen(); show(host); return; }
    if (host === pendingHost) { return; }
    cancelOpen();
    pendingHost = host;
    openTimer = setTimeout(function () {
      openTimer = null;
      // only show if the pointer is still on this host (not moved away meanwhile)
      if (pendingHost === host && host.matches(":hover")) { show(host); }
      pendingHost = null;
    }, OPEN_DELAY);
  }

  function hide() {
    cancelOpen();
    if (!card) { return; }
    activeHost = null;
    card.classList.remove("is-on");
    card.style.opacity = "";
    card.setAttribute("aria-hidden", "true");
    var doHide = function () { if (card && !activeHost) { card.style.display = "none"; } };
    if (reduce) { doHide(); } else { hideTimer = setTimeout(doHide, 140); }
  }

  function hostFrom(el) { return el && el.closest ? el.closest("[data-tip]") : null; }

  document.addEventListener("pointerover", function (e) {
    var host = hostFrom(e.target);
    if (host && host !== activeHost) { requestShow(host, false); }
  });
  document.addEventListener("pointerout", function (e) {
    var host = hostFrom(e.target);
    if (host && (!e.relatedTarget || !host.contains(e.relatedTarget))) { hide(); }
  });
  // keyboard focus shows the tip immediately (accessibility) — but only for
  // genuine keyboard focus, not a mouse click that also focuses the button.
  document.addEventListener("focusin", function (e) {
    var h = hostFrom(e.target);
    if (!h) { return; }
    var kb = false;
    try { kb = h.matches(":focus-visible"); } catch (x) { kb = true; }
    requestShow(h, kb);
  });
  document.addEventListener("focusout", function (e) { if (hostFrom(e.target)) { hide(); } });
  window.addEventListener("scroll", function () { if (activeHost) { hide(); } }, true);
  window.addEventListener("resize", function () { if (activeHost) { hide(); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && activeHost) { hide(); } });

  window.SolarTip = {
    set: function (el, text) { if (el) { el.setAttribute("data-tip", text == null ? "" : String(text)); } },
    show: show,
    hide: hide
  };
})();
