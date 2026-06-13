/* CHART ROOM — util.js
 * Shared UI helpers. Everything analyst-supplied is rendered through esc().
 */
(function () {
  "use strict";

  /** HTML-escape — mandatory for ALL interpolated analyst data (XSS gate). */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Escape for use inside an HTML attribute that is already quoted. */
  function escAttr(s) { return esc(s); }

  function el(id) { return document.getElementById(id); }

  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return esc(iso);
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function fmtTs(iso) {
    if (!iso) return "";
    return String(iso).replace("T", " ").slice(0, 16);
  }

  function truncate(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 200);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /** Generic modal open/close with Escape handling and focus return. */
  var _lastFocus = null;
  function openModal(veilId) {
    _lastFocus = document.activeElement;
    var v = el(veilId);
    v.classList.add("open");
    var first = v.querySelector("button, input, select, textarea, [tabindex]");
    if (first) first.focus();
  }
  function closeModal(veilId) {
    el(veilId).classList.remove("open");
    if (_lastFocus && _lastFocus.focus) _lastFocus.focus();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var open = document.querySelector(".modal-veil.open");
      if (open) open.classList.remove("open");
    }
  });

  /**
   * In-app replacement for window.prompt (unsupported in Electron).
   * promptModal(title, defaultValue, cb) -> cb(value|null)
   */
  function promptModal(title, defaultValue, cb) {
    var veil = document.createElement("div");
    veil.className = "modal-veil open";
    veil.setAttribute("role", "dialog");
    veil.setAttribute("aria-modal", "true");
    veil.setAttribute("aria-label", title);
    var modal = document.createElement("div");
    modal.className = "modal narrow";
    modal.style.width = "min(420px, 90vw)";
    var head = document.createElement("div");
    head.className = "modal-head";
    var h = document.createElement("h2");
    h.textContent = title;
    head.appendChild(h);
    var body = document.createElement("div");
    body.className = "modal-body";
    var input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue || "";
    input.setAttribute("aria-label", title);
    input.style.cssText = "width:100%;background:var(--panel-2);border:1px solid var(--line);color:var(--text);font:12px var(--mono);padding:7px 9px";
    body.appendChild(input);
    var foot = document.createElement("div");
    foot.className = "modal-foot";
    var right = document.createElement("div");
    right.className = "right";
    var cancel = document.createElement("button");
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    var ok = document.createElement("button");
    ok.className = "btn primary";
    ok.textContent = "OK";
    right.appendChild(cancel); right.appendChild(ok);
    foot.appendChild(right);
    modal.appendChild(head); modal.appendChild(body); modal.appendChild(foot);
    veil.appendChild(modal);
    document.body.appendChild(veil);
    var prev = document.activeElement;
    function done(val) {
      veil.remove();
      if (prev && prev.focus) prev.focus();
      cb(val);
    }
    ok.addEventListener("click", function () { done(input.value); });
    cancel.addEventListener("click", function () { done(null); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") done(input.value);
      if (e.key === "Escape") { e.stopPropagation(); done(null); }
    });
    veil.addEventListener("click", function (e) { if (e.target === veil) done(null); });
    input.focus();
    input.select();
  }

  window.CRUtil = {
    esc: esc, escAttr: escAttr, el: el, promptModal: promptModal,
    fmtDate: fmtDate, fmtTs: fmtTs, truncate: truncate,
    download: download, debounce: debounce,
    openModal: openModal, closeModal: closeModal
  };
})();
