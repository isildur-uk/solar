/* ============================================================
   devmode.js — opt-in Developer mode.
   OFF by default. When ON, click any text on the page to edit it
   inline (contenteditable) — a fast way to spot and fix minor copy.
   Toggle from Settings, the floating DEV badge, or Ctrl/Cmd+Shift+D.
   Edits are live in the DOM only (not written back to source) — they
   let you see a wording change instantly and note it. State persists
   in localStorage so it survives reloads.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "solar_dev_mode";
  var on = false;
  try { on = localStorage.getItem(KEY) === "1"; } catch (e) { /* noop */ }

  var STYLE_ID = "solar-dev-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) { return; }
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      "body.solar-dev-mode [data-dev-hot]:hover{outline:1px dashed var(--accent,#8ea2ff);outline-offset:2px;cursor:text}" +
      "body.solar-dev-mode [contenteditable=true]{outline:2px solid var(--accent,#8ea2ff);outline-offset:2px;background:rgba(142,162,255,.10);border-radius:2px}" +
      ".solar-dev-badge{position:fixed;bottom:12px;right:12px;z-index:2147483000;font:600 11px/1 var(--mono,ui-monospace,monospace);letter-spacing:.10em;text-transform:uppercase;color:#0c0c0b;background:var(--accent,#8ea2ff);padding:7px 11px;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.45);cursor:pointer;user-select:none}" +
      ".solar-dev-badge::before{content:'\\25CF';margin-right:6px;color:#0c0c0b}";
    document.head.appendChild(s);
  }

  // Never intercept these element types themselves — they're controls, not copy.
  var SKIP = /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SVG|PATH|USE|IMG|CANVAS|VIDEO|OPTION|HTML|BODY)$/;

  function editable(el) {
    if (!el || el.nodeType !== 1) { return false; }
    if (SKIP.test(el.tagName)) { return false; }
    if (el.isContentEditable) { return false; }
    if (el.closest && el.closest("[contenteditable=true]")) { return false; }
    return !!(el.textContent || "").trim();   // must carry visible text
  }

  var badge = null;
  function reflect() {
    if (!document.body) { return; }
    document.body.classList.toggle("solar-dev-mode", on);
    if (on) {
      ensureStyle();
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "solar-dev-badge";
        badge.textContent = "DEV";
        badge.setAttribute("title", "Developer mode ON — click any text to edit it. Click here (or Ctrl+Shift+D) to turn off.");
        badge.addEventListener("click", function (e) { e.stopPropagation(); set(false); });
        document.body.appendChild(badge);
      }
      badge.style.display = "";
    } else if (badge) {
      badge.style.display = "none";
    }
  }

  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) { /* noop */ }
    reflect();
    try { window.dispatchEvent(new CustomEvent("solar-devmode", { detail: on })); } catch (e) { /* noop */ }
  }
  function toggle() { set(!on); }

  // Click-to-edit (capture phase, so we win before a control's own click acts).
  document.addEventListener("click", function (e) {
    if (!on) { return; }
    if (badge && badge.contains(e.target)) { return; }
    var el = e.target;
    if (!editable(el)) { return; }
    e.preventDefault();
    e.stopPropagation();
    el.contentEditable = "true";
    el.focus();
    try {
      var r = document.createRange(); r.selectNodeContents(el);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    } catch (x) { /* noop */ }
    function done() {
      el.contentEditable = "false";
      el.removeEventListener("blur", done);
      el.removeEventListener("keydown", key);
    }
    function key(ev) {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
      else if (ev.key === "Escape") { el.blur(); }
    }
    el.addEventListener("blur", done);
    el.addEventListener("keydown", key);
  }, true);

  // Mark hovered text targets so the dashed-outline hint only paints on real copy.
  document.addEventListener("mouseover", function (e) {
    if (!on) { return; }
    var el = e.target;
    if (el && el.nodeType === 1 && editable(el)) { el.setAttribute("data-dev-hot", "1"); }
  }, true);

  // Ctrl/Cmd+Shift+D toggles.
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault();
      toggle();
    }
  });

  window.SolarDev = { get: function () { return on; }, set: set, toggle: toggle };

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", reflect); }
  else { reflect(); }
})();
