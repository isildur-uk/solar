/* SOLAR — translateui.js  (window.CRTranslateUI)
 * Optional UI glue for CRTranslate. Adds a "Translate → EN" action to the Paste
 * panel so an analyst can gist foreign-language material to English BEFORE the
 * (English-only) extractor runs — then flags the whole batch as MT-derived.
 *
 * Deliberately low-touch: it injects its controls into the existing #paste-veil
 * at runtime (no HTML structure changes) and wraps window.CRReview.open to stamp
 * the MT provenance label via sourceName (which review.commit() writes onto every
 * entity/link as provenance.sourceRef + origin + audit). The extraction engine
 * and data model are untouched.
 *
 * Graceful degrade: if LibreTranslate isn't reachable, the button is disabled
 * with a hint and SOLAR behaves exactly as before. Nothing here runs unless the
 * Paste panel exists (so hero/mobile boots are unaffected).
 */
(function () {
  "use strict";

  var U = window.CRUtil;
  var _wrapped = false;
  var _origOpen = null;
  var _mtPending = null;       // provenance label to stamp on the matching open
  var _lastTranslation = null; // exact MT output currently in the textarea
  var _origText = "";          // the pre-translation original (for "View original")
  var _inited = false;

  function el(id) { return (U && U.el) ? U.el(id) : document.getElementById(id); }
  function esc(s) { return (U && U.esc) ? U.esc(s) : String(s == null ? "" : s); }

  function injectStyle() {
    if (document.getElementById("mt-style")) return;
    var st = document.createElement("style");
    st.id = "mt-style";
    st.textContent =
      "#mt-row{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap;font-size:12px}" +
      "#mt-status{color:var(--txt-dim,#9aa7b6)}" +
      "#mt-status.err{color:var(--danger,#d9554f)}" +
      "#mt-banner{border:1px solid var(--accent,#e8b34b);border-radius:4px;padding:6px 8px;margin:8px 0;" +
        "background:rgba(232,179,75,.08);color:var(--txt,#e6edf3);font-size:12px}" +
      "#mt-banner b{color:var(--accent,#e8b34b)}" +
      "#mt-orig{margin-top:6px}" +
      "#mt-orig pre{white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;" +
        "background:var(--bg-inset,#070a0e);border:1px solid var(--line,#1e2632);border-radius:4px;" +
        "padding:6px;margin:4px 0 0;font-size:12px}";
    document.head.appendChild(st);
  }

  // Build the Translate button + status/banner, anchored to existing IDs so we
  // don't depend on the panel's wrapper markup.
  function injectUI() {
    var run = el("paste-run");
    var ta = el("paste-text");
    if (!run || !ta) return false;            // paste panel not present
    if (el("paste-translate")) return true;   // already injected

    injectStyle();
    ta.setAttribute("dir", "auto");           // RTL pasted text displays sensibly

    var btn = document.createElement("button");
    btn.className = "btn";
    btn.id = "paste-translate";
    btn.type = "button";
    btn.textContent = "Translate → EN";
    btn.disabled = true;
    btn.title = "Checking for a local LibreTranslate server…";
    btn.addEventListener("click", onTranslate);
    run.parentNode.insertBefore(btn, run);     // sits beside Extract →

    var row = document.createElement("div");
    row.id = "mt-row";
    row.innerHTML = '<span id="mt-status"></span>';
    ta.parentNode.insertBefore(row, ta.nextSibling);

    // If the analyst edits the text after translating, drop the MT flag so it
    // can't attach to hand-edited / replaced (non-MT) content.
    ta.addEventListener("input", function () {
      if (_lastTranslation !== null && ta.value !== _lastTranslation) {
        _mtPending = null; _lastTranslation = null; clearBanner();
      }
    });

    return true;
  }

  function setStatus(msg, isErr) {
    var s = el("mt-status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = isErr ? "err" : "";
  }

  function clearBanner() {
    var b = el("mt-banner");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  // Reset transient state whenever the panel opens, so a stale MT flag can never
  // attach to a later (English) paste.
  function resetForOpen() {
    _mtPending = null;
    clearBanner();
    setStatus("");
    refreshAvailability();
  }

  function refreshAvailability() {
    var btn = el("paste-translate");
    if (!btn || !window.CRTranslate) return;
    window.CRTranslate.available().then(function (ok) {
      var b = el("paste-translate");
      if (!b) return;
      b.disabled = !ok;
      b.title = ok
        ? "Translate the pasted text to English via your local LibreTranslate (gisting only)"
        : "Start LibreTranslate (127.0.0.1:5000) to enable — see reference/LibreTranslate (run here)";
      if (!ok) setStatus("");
    });
  }

  function showBanner(from) {
    clearBanner();
    var row = el("mt-row");
    if (!row) return;
    var b = document.createElement("div");
    b.id = "mt-banner";
    b.innerHTML =
      '<b>Machine-translated</b> ' + esc(from) + ' → en (gisting, not certified). ' +
      'This batch will be flagged <b>MT-derived</b> in provenance. Verify names/IDs against the original.' +
      '<details id="mt-orig"><summary>View original text</summary>' +
      '<pre dir="auto">' + esc(_origText || "") + '</pre></details>';
    row.parentNode.insertBefore(b, row.nextSibling);
  }

  function onTranslate() {
    if (!window.CRTranslate) return;
    var ta = el("paste-text");
    if (!ta) return;
    var text = ta.value;
    if (!text || !text.trim()) { setStatus("Nothing to translate — paste some text first.", true); return; }

    setStatus("Checking translator…");
    window.CRTranslate.available(true).then(function (ok) {
      if (!ok) { setStatus("LibreTranslate isn't running. Start it (127.0.0.1:5000), then retry.", true); refreshAvailability(); return; }
      setStatus("Detecting language…");
      return window.CRTranslate.detect(text).then(function (det) {
        if (det && det.language === "en") {
          _mtPending = null; _lastTranslation = null; clearBanner();
          setStatus("Looks like English already — no translation needed.");
          return;
        }
        setStatus("Translating…");
        return window.CRTranslate.translate(text, det ? det.language : "auto", "en").then(function (res) {
          _origText = text;
          ta.value = res.text;
          _lastTranslation = res.text;
          ta.setAttribute("dir", "auto");
          _mtPending = window.CRTranslate.provenanceTag(res.from, res.to);
          setStatus("");
          showBanner(res.from);
        });
      });
    }).catch(function (e) {
      setStatus("Translation failed: " + (e && e.message ? e.message : "unknown error"), true);
    });
  }

  // Wrap CRReview.open ONCE so a translated batch carries an MT provenance label.
  // Only injects when _mtPending is set AND the caller passed no name of its own
  // (so URL import / drag-drop, which pass their own source names, are untouched).
  function wrapOpen() {
    if (_wrapped || !window.CRReview || typeof window.CRReview.open !== "function") return;
    _origOpen = window.CRReview.open;
    window.CRReview.open = function (text, name) {
      // Stamp the MT label ONLY when this open is extracting the exact translated
      // text we produced AND the caller passed no name of its own. Tying it to the
      // actual MT content means a later English paste, or a drag-drop / URL-import
      // batch (which may pass an empty name), can never inherit a stale flag.
      var stamp = (_mtPending && !name && text === _lastTranslation) ? _mtPending : null;
      if (stamp) { name = stamp; _mtPending = null; _lastTranslation = null; }
      var ret = _origOpen.call(this, text, name);
      if (stamp) {
        // Preserve the original (pre-translation) source on the in-memory result
        // so a later commit-side hook can persist it for audit. Harmless if unused.
        try {
          var r = window.CRReview.getResult && window.CRReview.getResult();
          if (r) { r.mtOriginal = _origText; r.mtLabel = stamp; }
        } catch (e) { /* non-fatal */ }
      }
      return ret;
    };
    _wrapped = true;
  }

  function init() {
    if (_inited) return;
    if (!injectUI()) return;                   // no paste panel here
    _inited = true;
    wrapOpen();
    // Re-check the translator each time the Paste panel is opened, and reset state.
    var open = el("btn-paste");
    if (open) open.addEventListener("click", resetForOpen);
    var cancel = el("paste-cancel");
    if (cancel) cancel.addEventListener("click", function () { _mtPending = null; });
    refreshAvailability();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CRTranslateUI = { init: init, _refresh: refreshAvailability };
})();
