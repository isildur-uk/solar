/* entity-style.js — one entity look across SOLAR.
 * Thin bridge so any surface (Analyse, etc.) paints identifiers with the SAME
 * type glyph + hue as the Charting nodes (js/ui/icons.js CRIcons) and the
 * Database highlights (registry .hl-* uses the same --c-* hue tokens). Keeps
 * the three surfaces reading as one product. No dependencies beyond CRIcons
 * (optional — degrades to hue-only if icons.js isn't loaded).
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  // Entity hue for a type, read live from the --c-<type> token (theme-aware).
  function hue(type) {
    var v = "";
    try { v = getComputedStyle(document.documentElement).getPropertyValue("--c-" + type).trim(); } catch (e) {}
    return v || "#8593a3";
  }

  // A small inline entity icon — the exact Charting node chip (squircle + glyph
  // + hue ring), sized for inline/table use. Returns a <span> (empty if CRIcons
  // absent, so callers can append unconditionally).
  function icon(type, px) {
    px = px || 14;
    var span = document.createElement("span");
    span.className = "ent-ico";
    span.style.cssText = "display:inline-flex;flex:0 0 auto;width:" + px + "px;height:" + px + "px;vertical-align:middle";
    var ic = window.CRIcons;
    if (ic && ic.get && (ic.has ? ic.has(type) : true)) {
      var img = document.createElement("img");
      img.src = ic.get(type, hue(type)).unselected;
      img.alt = ""; img.setAttribute("aria-hidden", "true");
      img.style.cssText = "width:100%;height:100%;display:block";
      span.appendChild(img);
    }
    return span;
  }

  // Best-guess entity type for a comms value/label (phone vs vehicle reg).
  var VRM = /^[A-Z]{2}[0-9]{2}\s?[A-Z]{3}$|^[A-Z][0-9]{1,3}\s?[A-Z]{3}$/i; // UK current + prefix styles
  function typeOf(value, hint) {
    if (hint) return hint;
    var s = String(value == null ? "" : value).trim();
    if (/vehicle|anpr|\bvrm\b/i.test(s)) return "vehicle";
    if (VRM.test(s.replace(/\s/g, ""))) return "vehicle";
    return "phone";
  }

  window.SolarEntityStyle = { hue: hue, icon: icon, typeOf: typeOf };
})();
