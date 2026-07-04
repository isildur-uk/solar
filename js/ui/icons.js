/* CHART ROOM — icons.js
 * Typed node icons for the link chart: hand-drawn SVG glyphs on a dark
 * squircle with the entity-type colour ring; amber ring + glow when selected.
 * Rendered as data URIs for vis-network image nodes. Original artwork.
 */
(function () {
  "use strict";

  // Glyphs drawn in a 64×64 viewBox, stroke-based, geometric, 3.4px weight.
  var GLYPHS = {
    person:
      '<circle cx="32" cy="24.5" r="7.2"/>' +
      '<path d="M19 47c2.2-9.2 7.2-13.4 13-13.4S42.8 37.8 45 47"/>',
    phone:
      '<rect x="23.5" y="15.5" width="17" height="33" rx="4.5"/>' +
      '<path d="M29 43.5h6"/><path d="M29.5 20h5"/>',
    email:
      '<rect x="16.5" y="21.5" width="31" height="22" rx="4"/>' +
      '<path d="M18.5 24.5 32 35l13.5-10.5"/>',
    address:
      '<path d="M18.5 31.5 32 19.5l13.5 12"/>' +
      '<path d="M22.5 29.5V46h19V29.5"/>' +
      '<path d="M28.8 46v-8.5h6.4V46"/>',
    location:
      '<path d="M32 47.5S20.8 37.6 20.8 29.6a11.2 11.2 0 0 1 22.4 0c0 8-11.2 17.9-11.2 17.9z"/>' +
      '<circle cx="32" cy="29.2" r="4.1"/>',
    organisation:
      '<rect x="21" y="17.5" width="22" height="28.5"/>' +
      '<path d="M26 23.5h3.6M34.4 23.5H38M26 29.5h3.6M34.4 29.5H38M26 35.5h3.6M34.4 35.5H38"/>' +
      '<path d="M29.2 46v-4.8h5.6V46"/>',
    vehicle:
      '<path d="M17.5 38.5v-5.2l4.2-8.3h20.6l4.2 8.3v5.2"/>' +
      '<path d="M17.5 38.5h29"/><path d="M21.8 33.3h20.4"/>' +
      '<circle cx="25" cy="42.2" r="3.3"/><circle cx="39" cy="42.2" r="3.3"/>',
    account:
      '<rect x="16.5" y="21.5" width="31" height="21" rx="3"/>' +
      '<path d="M16.5 28.5h31"/><path d="M22 36.5h8.5"/>',
    date:
      '<rect x="18" y="20" width="28" height="26" rx="3"/>' +
      '<path d="M18 28h28"/><path d="M26 15.8v7M38 15.8v7"/>' +
      '<path d="M24.5 35h4.2M35.3 35h4.2M24.5 40.5h4.2"/>',
    money:
      '<circle cx="32" cy="32" r="14.5"/>' +
      '<path d="M37 25.4c-4.6-2.8-9.4-.3-9.4 4.4v4.6c0 3-1 4.6-3.1 5.8H38"/>' +
      '<path d="M24.5 33h9"/>',
    ip:
      '<circle cx="32" cy="21.8" r="4"/>' +
      '<circle cx="21.8" cy="40.5" r="4"/><circle cx="42.2" cy="40.5" r="4"/>' +
      '<path d="M29.9 25.2 24 36.9M34.1 25.2 40 36.9M25.8 40.5h12.4"/>',
    document:
      '<path d="M22 15.8h13.4l8.6 8.6V48H22z"/>' +
      '<path d="M35.4 15.8v8.6H44"/>' +
      '<path d="M27 32h10M27 38h10"/>',
    event:
      '<path d="M24.5 47V17.5"/>' +
      '<path d="M24.5 19h15.7l-4.2 6 4.2 6H24.5"/>',
    note:
      '<path d="M19.5 17.5h25V36l-8.5 9h-16.5z"/>' +
      '<path d="M36 45v-9h8.5"/>',
    flag:
      '<circle cx="32" cy="32" r="14.5"/><path d="M25 32h14M32 25v14"/>',
    airport:
      '<path d="M32 16c1.5 0 2.3 2 2.3 4.8v7.4l11.7 6.9v3.3l-11.7-3.4v7.1l3.4 2.5v2.5l-5.7-1.6-5.7 1.6v-2.5l3.4-2.5v-7.1L18 39.4v-3.3l11.7-6.9v-7.4c0-2.8.8-4.8 2.3-4.8z"/>',
    social:
      '<path d="M20 20h24a3.5 3.5 0 0 1 3.5 3.5v12A3.5 3.5 0 0 1 44 39H31l-7 6v-6h-4a3.5 3.5 0 0 1-3.5-3.5v-12A3.5 3.5 0 0 1 20 20z"/>' +
      '<path d="M26 27.5h12M26 32.5h8"/>',
    twitter:
      '<path d="M46 25.2a11 11 0 0 1-3 .9 5.2 5.2 0 0 0 2.3-2.9 10.4 10.4 0 0 1-3.3 1.3 5.2 5.2 0 0 0-8.9 4.7 14.8 14.8 0 0 1-10.7-5.4 5.2 5.2 0 0 0 1.6 6.9 5.1 5.1 0 0 1-2.3-.6v.1a5.2 5.2 0 0 0 4.2 5.1 5.2 5.2 0 0 1-2.3.1 5.2 5.2 0 0 0 4.8 3.6A10.4 10.4 0 0 1 19 41a14.7 14.7 0 0 0 8 2.3c9.5 0 14.7-7.9 14.7-14.7v-.7a10.5 10.5 0 0 0 2.6-2.7z"/>',
    skype:
      '<circle cx="32" cy="32" r="13.5"/>' +
      '<path d="M37.5 27c-1.8-1.8-4.6-2.3-6.8-1.3-2.4 1.1-2.6 3.9-.3 5.2 1.4.8 3.3 1.1 4.9 1.8 2.4 1 2.3 3.9-.2 5-2.3 1-5.2.5-7.1-1.3"/>',
    telegram:
      '<path d="M45.5 20.5 18.5 31l8.2 3.1 2.1 8.9 4.4-5.6 8 5.9z"/>' +
      '<path d="M26.7 34.1 40 26"/>',
    instagram:
      '<rect x="19" y="19" width="26" height="26" rx="7.5"/>' +
      '<circle cx="32" cy="32" r="6.5"/>' +
      '<circle cx="39.6" cy="24.4" r="1.5"/>'
  };

  var cache = {};

  function isLight() { return typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light"; }
  // darken a #rrggbb toward black by factor f (0..1) — lifts ring contrast on the cream light canvas
  function darken(hex, f) {
    var h = String(hex || "#8593a3").replace("#", "");
    if (h.length !== 6) return hex;
    var r = Math.round(parseInt(h.slice(0, 2), 16) * f);
    var g = Math.round(parseInt(h.slice(2, 4), 16) * f);
    var b = Math.round(parseInt(h.slice(4, 6), 16) * f);
    return "#" + [r, g, b].map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("");
  }

  function svgFor(type, colour, selected) {
    var glyph = GLYPHS[type] || GLYPHS.flag;
    var light = isLight();
    var chip = light ? "#faf6ec" : "#10161f";     // squircle fill: cream in light, near-black in dark
    var ink = light ? "#2a2820" : "#dbe5ef";      // glyph stroke flips for contrast
    var ring = selected ? "#8ea2ff" : (light ? darken(colour, 0.66) : colour);
    var glow = selected
      ? '<rect x="2" y="2" width="60" height="60" rx="18" fill="none" stroke="#8ea2ff" stroke-opacity="0.35" stroke-width="5"/>'
      : "";
    return '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
      glow +
      '<rect x="5" y="5" width="54" height="54" rx="15" fill="' + chip + '" stroke="' + ring + '" stroke-width="' + (selected ? 3.4 : 2.6) + '"/>' +
      '<g fill="none" stroke="' + ink + '" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' +
      glyph + "</g></svg>";
  }

  function uri(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /** get(type, colour) -> { unselected, selected } data URIs (cached). */
  function get(type, colour) {
    colour = colour || "#8593a3";
    var key = (isLight() ? "L" : "D") + "|" + type + "|" + colour;
    if (!cache[key]) {
      cache[key] = {
        unselected: uri(svgFor(type, colour, false)),
        selected: uri(svgFor(type, colour, true))
      };
    }
    return cache[key];
  }

  var CRIcons = { get: get, GLYPHS: GLYPHS };
  if (typeof module !== "undefined" && module.exports) module.exports = CRIcons;
  if (typeof window !== "undefined") window.CRIcons = CRIcons;
})();
