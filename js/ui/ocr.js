/* SOLAR — ocr.js
 * Photo / screenshot -> text -> the existing extraction pipeline.
 *
 * Tesseract.js runs fully offline from vendored assets (js/lib/tesseract/*) —
 * no CDN, consistent with the rest of the app. The worker + core wasm + English
 * language data load lazily on first scan, so app start-up is unaffected.
 *
 * Flow: acquire an image (native camera/library via CRNative, else file input)
 *  -> OCR -> drop the recognised text into the Paste panel so the analyst can
 *  correct any misreads, then run the normal Extract -> Review approval. Nothing
 *  reaches the chart unapproved.
 */
(function () {
  "use strict";

  var BASE = "js/lib/tesseract/";
  var worker = null;        // reused across scans
  var workerReady = null;   // Promise

  function status(msg) {
    if (window.CRApp && window.CRApp.status) window.CRApp.status(msg);
  }

  function overlay(show, text) {
    var el = document.getElementById("ocr-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "ocr-overlay";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.innerHTML = '<div class="ocr-card"><div class="ocr-spin" aria-hidden="true"></div>' +
                     '<div class="ocr-msg"></div></div>';
      document.body.appendChild(el);
    }
    el.querySelector(".ocr-msg").textContent = text || "Reading text from image…";
    el.style.display = show ? "flex" : "none";
  }

  function ensureWorker() {
    if (workerReady) return workerReady;
    if (typeof Tesseract === "undefined") {
      return Promise.reject(new Error("OCR engine not loaded"));
    }
    workerReady = Tesseract.createWorker("eng", 1, {
      workerPath: BASE + "worker.min.js",
      corePath: BASE + "core",
      langPath: BASE + "lang",
      workerBlobURL: false,   // load worker from a real path (strict-CSP friendly)
      gzip: true,
      logger: function (m) {
        if (m && m.status === "recognizing text") {
          overlay(true, "Reading text… " + Math.round((m.progress || 0) * 100) + "%");
        } else if (m && m.status) {
          overlay(true, m.status.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + "…");
        }
      }
    }).then(function (w) { worker = w; return w; });
    return workerReady;
  }

  function runOCR(dataUrl) {
    overlay(true, "Loading OCR engine…");
    return ensureWorker()
      .then(function (w) { return w.recognize(dataUrl); })
      .then(function (res) {
        overlay(false);
        return (res && res.data && res.data.text ? res.data.text : "").trim();
      })
      .catch(function (err) {
        overlay(false);
        var msg = (err && err.message) ? err.message : "unknown error";
        try { console.error("[SOLAR OCR] engine error:", err); } catch (_) {}
        status("OCR engine error: " + msg + " (see console)");
        throw err;  // propagate: don't let scan() mask this as 'no readable text'
      });
  }

  // Hand off recognised text to the analyst for correction, then extraction.
  function toPastePanel(text) {
    var ta = document.getElementById("paste-text");
    if (!ta) { status("Paste panel unavailable"); return; }
    var existing = ta.value.trim();
    ta.value = existing ? (existing + "\n\n" + text) : text;
    if (window.CRUtil && window.CRUtil.openModal) window.CRUtil.openModal("paste-veil");
    ta.focus();
    status("Text scanned — review and edit, then Extract →");
  }

  function acquireImage() {
    if (window.CRNative && window.CRNative.getImage) {
      return window.CRNative.getImage("prompt");
    }
    // Standalone web fallback.
    return new Promise(function (resolve) {
      var inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) { resolve(null); return; }
        var rd = new FileReader();
        rd.onload = function () { resolve(String(rd.result)); };
        rd.onerror = function () { resolve(null); };
        rd.readAsDataURL(f);
      });
      inp.click();
    });
  }

  function scan() {
    acquireImage().then(function (dataUrl) {
      if (!dataUrl) return; // cancelled
      return runOCR(dataUrl).then(function (text) {
        if (!text) { status("No readable text found in image (engine ran, found no text)"); return; }
        toPastePanel(text);
      });
    }).catch(function () { /* real error already surfaced by runOCR */ });
  }

  function init() {
    var btn = document.getElementById("btn-scan");
    if (btn) btn.addEventListener("click", scan);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CROCR = { scan: scan, recognizeDataUrl: runOCR };
})();
