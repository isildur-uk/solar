/* country-flags.js — tiny vendored SVG flags (offline) for travel analysis.
 * Maps a country name (as aviation-ref returns, e.g. "United Kingdom") or an
 * ISO2/ISO3 code (e.g. "GB"/"GBR", nationality) to a small inline SVG flag, so
 * the travel timeline reads as "who went where". Curated set + neutral fallback.
 * Browser: window.CRFlags. Node: module.exports. */
(function (root) {
  "use strict";
  var ISO = {
    "united kingdom": "GB", "great britain": "GB", "uk": "GB", "england": "GB", "scotland": "GB", "wales": "GB", "northern ireland": "GB",
    "netherlands": "NL", "holland": "NL", "spain": "ES", "poland": "PL", "france": "FR", "ireland": "IE",
    "germany": "DE", "italy": "IT", "portugal": "PT", "belgium": "BE", "united states": "US", "usa": "US", "united states of america": "US",
    "gbr": "GB", "nld": "NL", "esp": "ES", "pol": "PL", "fra": "FR", "irl": "IE", "deu": "DE", "ita": "IT", "prt": "PT", "bel": "BE"
  };
  function iso(x){ x = String(x == null ? "" : x).trim().toLowerCase(); if (ISO[x]) return ISO[x]; if (/^[a-z]{2}$/.test(x)) return x.toUpperCase(); return ""; }
  var F = {
    GB: '<rect width="30" height="20" fill="#012169"/><path d="M0 0l30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0l30 20M30 0L0 20" stroke="#C8102E" stroke-width="2"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#C8102E" stroke-width="3.5"/>',
    NL: '<rect width="30" height="20" fill="#21468B"/><rect width="30" height="13.34" fill="#fff"/><rect width="30" height="6.67" fill="#AE1C28"/>',
    ES: '<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>',
    PL: '<rect width="30" height="20" fill="#DC143C"/><rect width="30" height="10" fill="#fff"/>',
    FR: '<rect width="30" height="20" fill="#ED2939"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#002395"/>',
    IE: '<rect width="30" height="20" fill="#FF883E"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#169B62"/>',
    DE: '<rect width="30" height="20" fill="#FFCE00"/><rect width="30" height="13.34" fill="#DD0000"/><rect width="30" height="6.67" fill="#000"/>',
    IT: '<rect width="30" height="20" fill="#CE2B37"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#009246"/>',
    PT: '<rect width="30" height="20" fill="#DA291C"/><rect width="12" height="20" fill="#046A38"/><circle cx="12" cy="10" r="3" fill="#FFE000"/>',
    BE: '<rect width="30" height="20" fill="#ED2939"/><rect width="20" height="20" fill="#FAE042"/><rect width="10" height="20" fill="#000"/>',
    US: '<rect width="30" height="20" fill="#B22234"/><g fill="#fff"><rect y="1.54" width="30" height="1.54"/><rect y="4.62" width="30" height="1.54"/><rect y="7.69" width="30" height="1.54"/><rect y="10.77" width="30" height="1.54"/><rect y="13.85" width="30" height="1.54"/><rect y="16.92" width="30" height="1.54"/></g><rect width="12" height="10.77" fill="#3C3B6E"/>'
  };
  function svg(x){ var c = iso(x), inner = F[c] || '<rect width="30" height="20" fill="#2a3446"/><rect x="1" y="1" width="28" height="18" fill="none" stroke="#4a5a72"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="30" height="20">' + inner + '</svg>'; }
  function uri(x){ return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(x)); }
  root.CRFlags = { iso: iso, svg: svg, uri: uri, has: function(x){ return !!F[iso(x)]; } };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CRFlags;
})(typeof window !== "undefined" ? window : this);
