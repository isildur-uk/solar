/* comms-journeys.js — movement / mode-of-transport inference for the Analyse view.
 *
 * From a set of located, timed events (CDR or ANPR) it builds consecutive LEGS,
 * derives each leg's speed (haversine ÷ Δt), classifies a likely travel MODE
 * (stationary / on foot / cycle / road vehicle / motorway / train-or-air), flags
 * IMPOSSIBLE travel (speed beyond any ground transport), groups legs into
 * JOURNEYS split by dwell, and scores each journey (mean/max speed, straightness,
 * dominant mode). For ANPR it lifts the road identifier straight from the camera
 * site name (e.g. "M1 J10" -> M1), which strongly confirms motorway travel.
 *
 * Phase 1 (this module): speed + straightness + road-name heuristic, no external
 * geodata. Phase 2 (later): corridor matching against vendored GB motorway / rail
 * geometry. Pure/dependency-free and node-testable. British English.
 * Dual export: module.exports (Node) + window.RegistryCommsJourneys (browser).
 */
"use strict";
(function () {

  var MODE = {
    STATIONARY: "Stationary",
    FOOT: "On foot",
    CYCLE: "Cycle / slow",
    ROAD: "Road vehicle",
    MOTORWAY: "Motorway / fast road",
    RAIL_AIR: "Train or air (>130 km/h)",
    IMPOSSIBLE: "Implausible speed"
  };
  // Map colours for the movement path (consumed by the render layer).
  var MODE_COLOUR = {
    "Stationary": "#7d8ea6",
    "On foot": "#5fbf7f",
    "Cycle / slow": "#3aa6a6",
    "Road vehicle": "#e8a13a",
    "Motorway / fast road": "#e0662a",
    "Train or air (>130 km/h)": "#9a6ff0",
    "Implausible speed": "#e05a5a"
  };

  function str(x) { return (x == null) ? "" : String(x); }
  function parseDt(s) {
    s = str(s).trim(); if (!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, (+m[2]) - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    var i = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (i) return new Date(+i[1], (+i[2]) - 1, +i[3], +(i[4] || 0), +(i[5] || 0), +(i[6] || 0));
    var d = new Date(s); return isNaN(d) ? null : d;
  }
  function haversineKm(a, b, c, d) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (c - a) * toRad, dLon = (d - b) * toRad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * toRad) * Math.cos(c * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  // Lift a road identifier from a name (ANPR camera site) — M-road / A-road / B-road.
  function roadOf(name) {
    var s = str(name).toUpperCase();
    var m = s.match(/\bM\d{1,3}\b/); if (m) return { road: m[0], kind: "motorway" };
    m = s.match(/\bA\d{1,4}\b/); if (m) return { road: m[0], kind: "a-road" };
    m = s.match(/\bB\d{2,4}\b/); if (m) return { road: m[0], kind: "b-road" };
    return null;
  }

  function classifyLeg(speedKmh, distanceKm, roadHint) {
    if (distanceKm < 0.15) return { mode: MODE.STATIONARY, confidence: "High" };
    if (!isFinite(speedKmh)) return { mode: MODE.IMPOSSIBLE, confidence: "High" };
    // A named motorway on the leg + a road-plausible speed is a strong signal.
    if (roadHint && roadHint.kind === "motorway" && speedKmh >= 40 && speedKmh <= 160) return { mode: MODE.MOTORWAY, confidence: "High" };
    if (speedKmh < 7) return { mode: MODE.FOOT, confidence: "Medium" };
    if (speedKmh < 25) return { mode: MODE.CYCLE, confidence: "Low" };
    if (speedKmh < 100) return { mode: MODE.ROAD, confidence: "Medium" };
    if (speedKmh <= 130) return { mode: MODE.MOTORWAY, confidence: "Medium" };
    if (speedKmh <= 300) return { mode: MODE.RAIL_AIR, confidence: "Medium" };
    return { mode: MODE.IMPOSSIBLE, confidence: "High" };
  }

  // opts: { impossibleKmh=250, dwellKm=0.3 }
  function analyseJourneys(events, opts) {
    opts = opts || {};
    var impossibleKmh = opts.impossibleKmh != null ? opts.impossibleKmh : 250;
    var dwellKm = opts.dwellKm != null ? opts.dwellKm : 0.3;

    var pts = (events || []).map(function (e) {
      var t = parseDt(e.startDt);
      var lat = (e.lat != null ? e.lat : (e.startCell && e.startCell.lat));
      var lon = (e.lon != null ? e.lon : (e.startCell && e.startCell.lon));
      if (t == null || lat == null || lon == null) return null;
      return { t: t, lat: lat, lon: lon, label: e.cellName || (e.startCell && e.startCell.id) || (lat + "," + lon), name: e.cellName };
    }).filter(Boolean).sort(function (a, b) { return a.t - b.t; });

    var legs = [];
    for (var i = 1; i < pts.length; i++) {
      var A = pts[i - 1], B = pts[i];
      var dist = haversineKm(A.lat, A.lon, B.lat, B.lon);
      var durMin = (B.t - A.t) / 60000;
      var speed = durMin > 0 ? dist / (durMin / 60) : (dist > 0 ? Infinity : 0);
      var roadHint = roadOf(B.name) || roadOf(A.name);
      var cl = classifyLeg(speed, dist, roadHint);
      legs.push({
        index: i - 1,
        fromLabel: A.label, toLabel: B.label,
        fromTime: A.t, toTime: B.t,
        fromLat: A.lat, fromLon: A.lon, toLat: B.lat, toLon: B.lon,
        distanceKm: Math.round(dist * 100) / 100,
        durationMin: Math.round(durMin * 10) / 10,
        speedKmh: isFinite(speed) ? Math.round(speed) : null,
        mode: cl.mode, confidence: cl.confidence,
        roadHint: roadHint ? roadHint.road : null,
        impossible: (isFinite(speed) ? speed : Infinity) > impossibleKmh
      });
    }

    // group into journeys, split by a stationary (dwell) leg
    var journeys = [], cur = null;
    function close() {
      if (!cur || !cur.legs.length) { cur = null; return; }
      var ls = cur.legs, dist = 0, maxS = 0, byMode = {};
      ls.forEach(function (l) { dist += l.distanceKm; if (l.speedKmh > maxS) maxS = l.speedKmh; byMode[l.mode] = (byMode[l.mode] || 0) + l.distanceKm; });
      var durMin = (ls[ls.length - 1].toTime - ls[0].fromTime) / 60000;
      var crow = haversineKm(ls[0].fromLat, ls[0].fromLon, ls[ls.length - 1].toLat, ls[ls.length - 1].toLon);
      var dominant = Object.keys(byMode).sort(function (a, b) { return byMode[b] - byMode[a]; })[0];
      var roads = {}; ls.forEach(function (l) { if (l.roadHint) roads[l.roadHint] = 1; });
      journeys.push({
        startTime: ls[0].fromTime, endTime: ls[ls.length - 1].toTime,
        legs: ls.length,
        distanceKm: Math.round(dist * 100) / 100,
        durationMin: Math.round(durMin * 10) / 10,
        meanKmh: durMin > 0 ? Math.round(dist / (durMin / 60)) : null,
        maxKmh: maxS || null,
        straightness: dist > 0 ? Math.round((crow / dist) * 100) / 100 : null,
        mode: dominant, roads: Object.keys(roads),
        impossible: ls.some(function (l) { return l.impossible; })
      });
      cur = null;
    }
    legs.forEach(function (l) {
      if (l.mode === MODE.STATIONARY || l.distanceKm < dwellKm) { close(); return; }
      if (!cur) cur = { legs: [] };
      cur.legs.push(l);
    });
    close();

    return { legs: legs, journeys: journeys, impossible: legs.filter(function (l) { return l.impossible; }) };
  }

  var api = {
    MODE: MODE, MODE_COLOUR: MODE_COLOUR,
    parseDt: parseDt, haversineKm: haversineKm, roadOf: roadOf,
    classifyLeg: classifyLeg, analyseJourneys: analyseJourneys
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryCommsJourneys = api; }
})();
