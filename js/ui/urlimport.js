/* SOLAR — urlimport.js  (window.CRUrlImport)
 * "Add from URL": fetch a web article server-side (/api/fetch avoids CORS),
 * clean it with Mozilla Readability, then hand the article text to the normal
 * review screen so the CM/i2 extractor charts it. Nothing reaches the chart
 * unapproved — this only fills the review queue.
 *
 * Hosted-only: requires the /api/fetch serverless function (internet needed).
 * If /api is absent (offline exe / file://), the call fails cleanly and tells
 * the analyst to paste the text instead. CM stays the authority throughout.
 */
(function () {
  "use strict";
  var U = (typeof window !== "undefined" && window.CRUtil) || null;
  function el(id) { return document.getElementById(id); }
  function setStatus(msg, kind) {
    var s = el("url-status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "note" + (kind ? " " + kind : "");
  }

  function open() {
    if (U && U.openModal) U.openModal("url-veil"); else el("url-veil").classList.add("show");
    setStatus("", "");
    var i = el("url-input");
    if (i) { i.value = ""; i.focus(); }
  }
  function close() {
    if (U && U.closeModal) U.closeModal("url-veil"); else el("url-veil").classList.remove("show");
  }

  function run() {
    var input = el("url-input");
    var url = (input && input.value || "").trim();
    if (!url) { setStatus("Enter a URL first.", "warn"); return; }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    var btn = el("url-run");
    if (btn) btn.disabled = true;
    setStatus("Fetching article…", "");

    fetch("/api/fetch?url=" + encodeURIComponent(url), { headers: { "accept": "application/json" } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.body || res.body.error || !res.body.text) {
          var why = (res.body && res.body.error) ? res.body.error : "Could not read that page.";
          setStatus(why + " — you can paste the text instead.", "warn");
          return;
        }
        var b = res.body;
        var header = [];
        if (b.title) header.push(b.title);
        if (b.byline) header.push(b.byline);
        header.push("Source: " + (b.url || url));
        var text = header.join("\n") + "\n\n" + b.text;
        close();
        if (window.CRReview && window.CRReview.open) window.CRReview.open(text, b.title || url);
      })
      .catch(function (e) {
        setStatus("Fetch failed (" + String((e && e.message) || e) + "). This needs the hosted app + internet; otherwise paste the text.", "warn");
      })
      .then(function () { if (btn) btn.disabled = false; });
  }

  if (typeof window !== "undefined") window.CRUrlImport = { open: open, close: close, run: run };
})();
