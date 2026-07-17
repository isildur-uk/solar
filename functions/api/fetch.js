/* SOLAR — functions/api/fetch.js  (Cloudflare Pages Function)
 * Route: GET /api/fetch?url=https://...  ->  { title, byline, text, excerpt, url }
 * Server-side fetch + Mozilla Readability so the browser can chart a URL's article
 * without CORS. The browser then runs the CM/i2 extractor on the returned text.
 * Hosted deploy only (the offline exe has no /api). CM stays the authority.
 * Uses linkedom (Workers-friendly) + @mozilla/readability; bundled by Pages. */
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

function json(code, obj) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export async function onRequestGet(context) {
  try {
    var url = "";
    try { url = new URL(context.request.url).searchParams.get("url") || ""; } catch (e) {}
    url = String(url || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return json(400, { error: "A valid http(s) URL is required." });

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

    if (!r.ok) return json(502, { error: "Upstream fetch failed (HTTP " + r.status + ")." });
    var ct = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return json(415, { error: "Not an HTML page (" + (ct || "unknown") + ")." });

    var html = await r.text();
    if (html.length > 4000000) html = html.slice(0, 4000000);       // sanity cap

    var doc = parseHTML(html).document;
    var art = new Readability(doc).parse();
    if (!art || !art.textContent || art.textContent.trim().length < 80) {
      return json(422, { error: "Could not extract readable article text from that page." });
    }
    return json(200, {
      title: (art.title || "").trim(),
      byline: (art.byline || "").trim(),
      excerpt: (art.excerpt || "").trim(),
      text: art.textContent.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").trim(),
      length: art.length || 0,
      url: r.url || url
    });
  } catch (e) {
    var msg = (e && e.name === "AbortError") ? "Upstream fetch timed out." : String((e && e.message) || e);
    return json(500, { error: msg });
  }
}
