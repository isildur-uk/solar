/* SOLAR — api/fetch.js  (Vercel serverless function)
 * Server-side fetch + Mozilla Readability so the browser can chart a URL's
 * article without CORS. Returns clean article text; the browser then runs the
 * CM/i2 extractor on it. Requires an internet connection (hosted deploy only;
 * the offline exe has no /api). CM stays the authority — this only supplies text.
 *
 *   GET /api/fetch?url=https://...   ->   { title, byline, text, excerpt, url }
 */
"use strict";
var JSDOM = require("jsdom").JSDOM;
var Readability = require("@mozilla/readability").Readability;

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

module.exports = async function (req, res) {
  try {
    var url = "";
    try { url = new URL(req.url, "http://x").searchParams.get("url") || ""; } catch (e) {}
    if (!url && req.query && req.query.url) url = req.query.url;
    url = String(url || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return send(res, 400, { error: "A valid http(s) URL is required." });

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 15000);
    var r;
    try {
      r = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; SolarBot/1.0; +charting)", "accept": "text/html,application/xhtml+xml" }
      });
    } finally { clearTimeout(timer); }

    if (!r.ok) return send(res, 502, { error: "Upstream fetch failed (HTTP " + r.status + ")." });
    var ct = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return send(res, 415, { error: "Not an HTML page (" + (ct || "unknown") + ")." });

    var html = await r.text();
    if (html.length > 4000000) html = html.slice(0, 4000000);   // sanity cap

    var doc = new JSDOM(html, { url: r.url || url }).window.document;
    var art = new Readability(doc).parse();
    if (!art || !art.textContent || art.textContent.trim().length < 80) {
      return send(res, 422, { error: "Could not extract readable article text from that page." });
    }
    return send(res, 200, {
      title: (art.title || "").trim(),
      byline: (art.byline || "").trim(),
      excerpt: (art.excerpt || "").trim(),
      text: art.textContent.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").trim(),
      length: art.length || 0,
      url: r.url || url
    });
  } catch (e) {
    var msg = (e && e.name === "AbortError") ? "Upstream fetch timed out." : String((e && e.message) || e);
    return send(res, 500, { error: msg });
  }
};
