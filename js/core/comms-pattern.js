/* comms-pattern.js — pattern-of-life / cell-site analysis for the Analyse view.
 *
 * From a set of clean events (CDR or ANPR — anything carrying a location + a
 * timestamp) derives the recognised analytical products:
 *   - top locations (most-frequented cells/cameras) with first/last seen;
 *   - top location per time band (the ADM 4-hour bands, 02:00-06:00 … 22:00-02:00);
 *   - an OVERNIGHT anchor (22:00-06:00 — "where they sleep" / likely home) and a
 *     DAYTIME anchor (weekday 09:00-17:00 — likely work / daytime base);
 *   - hourly (0-23) and day-of-week activity histograms (daily/weekly rhythm).
 *
 * Pure/dependency-free and node-testable. British English.
 * Dual export: module.exports (Node) + window.RegistryCommsPattern (browser).
 */
"use strict";
(function () {

  var BAND_LABELS = ["02:00–06:00", "06:00–10:00", "10:00–14:00", "14:00–18:00", "18:00–22:00", "22:00–02:00"];
  var DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function parseDt(s) {
    s = String(s == null ? "" : s).trim(); if (!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, (+m[2]) - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    var i = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (i) return new Date(+i[1], (+i[2]) - 1, +i[3], +(i[4] || 0), +(i[5] || 0), +(i[6] || 0));
    var d = new Date(s); return isNaN(d) ? null : d;
  }
  function bandIndex(h) {
    if (h >= 2 && h < 6) return 0; if (h >= 6 && h < 10) return 1; if (h >= 10 && h < 14) return 2;
    if (h >= 14 && h < 18) return 3; if (h >= 18 && h < 22) return 4; return 5; // 22,23,0,1
  }
  function isNight(h) { return h >= 22 || h < 6; }               // where they sleep
  function isDay(h, dow) { return dow >= 1 && dow <= 5 && h >= 9 && h < 17; } // weekday base
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  function locOf(e) {
    var c = e.startCell || {};
    var lat = (e.lat != null ? e.lat : (c.lat != null ? c.lat : null));
    var lon = (e.lon != null ? e.lon : (c.lon != null ? c.lon : null));
    var key = c.id || c.name || e.cellName || (lat != null ? (lat.toFixed(4) + "," + lon.toFixed(4)) : null);
    if (!key) return null;
    return { key: String(key), name: e.cellName || c.name || "", postcode: e.cellPostcode || c.postcode || "", lat: lat, lon: lon };
  }

  function patternOfLife(events) {
    events = events || [];
    var locs = {}, hourly = zeros(24), dow = zeros(7), total = 0, first = null, last = null;
    events.forEach(function (e) {
      var t = parseDt(e.startDt); if (!t) return;
      var loc = locOf(e); if (!loc) return;
      total++;
      var h = t.getHours(), dw = t.getDay();
      hourly[h]++; dow[dw]++;
      if (first == null || t < first) first = t;
      if (last == null || t > last) last = t;
      var L = locs[loc.key];
      if (!L) L = locs[loc.key] = { key: loc.key, name: loc.name, postcode: loc.postcode, lat: loc.lat, lon: loc.lon, count: 0, first: t, last: t, band: zeros(6), night: 0, day: 0 };
      L.count++;
      if (t < L.first) L.first = t; if (t > L.last) L.last = t;
      L.band[bandIndex(h)]++;
      if (isNight(h)) L.night++;
      if (isDay(h, dw)) L.day++;
    });
    var arr = Object.keys(locs).map(function (k) { return locs[k]; });
    var topLocations = arr.slice().sort(function (a, b) { return b.count - a.count || (b.last - a.last); });
    function topBy(field) { var best = null; arr.forEach(function (L) { if (L[field] > 0 && (best == null || L[field] > best[field])) best = L; }); return best; }
    var byBand = BAND_LABELS.map(function (lbl, bi) {
      var best = null; arr.forEach(function (L) { if (L.band[bi] > 0 && (best == null || L.band[bi] > best.band[bi])) best = L; });
      return { band: lbl, location: best, count: best ? best.band[bi] : 0 };
    });
    return {
      total: total, dateRange: { first: first, last: last },
      topLocations: topLocations, byBand: byBand,
      hourly: hourly, dow: dow,
      nightAnchor: topBy("night"), dayAnchor: topBy("day"),
      bandLabels: BAND_LABELS.slice(), dowLabels: DOW_LABELS.slice()
    };
  }

  var api = { patternOfLife: patternOfLife, parseDt: parseDt, bandIndex: bandIndex, BAND_LABELS: BAND_LABELS, DOW_LABELS: DOW_LABELS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryCommsPattern = api; }
})();
