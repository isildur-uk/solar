/* comms-link.js — cross-file link & co-location analysis for the Analyse view.
 *
 * Consumes several parsed comms/ANPR returns (each an array of clean events from
 * comms-data.js, one return per SUBJECT/target) and derives:
 *   - commonContacts(): third-party contacts that two or more targets share, plus
 *     DIRECT target-to-target links (one target contacting another's identity).
 *   - coLocations(): two subjects present at the same location (same cell/camera,
 *     or lat/long within a radius) within a time window — a possible meeting.
 *
 * Pure/dependency-free and node-testable. Locations and numbers are already
 * CM-normalised upstream by comms-data.js. British English.
 * Dual export: module.exports (Node) + window.RegistryCommsLink (browser).
 */
"use strict";
(function () {

  function str(x) { return (x == null) ? "" : String(x); }
  function norm(x) { return str(x).replace(/\s+/g, "").trim(); }

  /* ---- date parsing (DD/MM/YYYY[ HH:MM[:SS]] or ISO) -> Date|null ---------- */
  function parseDt(s) {
    s = str(s).trim(); if (!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, (+m[2]) - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    var i = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (i) return new Date(+i[1], (+i[2]) - 1, +i[3], +(i[4] || 0), +(i[5] || 0), +(i[6] || 0));
    var d = new Date(s); return isNaN(d) ? null : d;
  }

  /* ---- great-circle distance in metres ------------------------------------ */
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* ---- dataset (one return per subject) ----------------------------------- */
  // input: { label, identity?, events:[cleanEvent] }.  identity = the target's
  // own selector; inferred as the most-frequent A-party if not supplied.
  function inferIdentity(events) {
    var c = {};
    (events || []).forEach(function (e) { var a = norm(e.aParty); if (a) c[a] = (c[a] || 0) + 1; });
    var best = null, bn = -1;
    Object.keys(c).forEach(function (k) { if (c[k] > bn) { bn = c[k]; best = k; } });
    return best;
  }
  function buildDataset(input) {
    input = input || {};
    var events = input.events || [];
    var identity = norm(input.identity) || inferIdentity(events);
    var counterparts = {};   // other party number -> count
    events.forEach(function (e) {
      [e.aParty, e.bParty, e.fwdParty].forEach(function (p) {
        p = norm(p); if (!p || (identity && p === identity)) return;
        counterparts[p] = (counterparts[p] || 0) + 1;
      });
    });
    return { label: input.label || identity || "target", identity: identity, events: events, counterparts: counterparts };
  }

  /* ---- common contacts + direct links ------------------------------------- */
  function commonContacts(datasets) {
    var ds = (datasets || []).map(buildDataset);
    var identities = ds.map(function (d) { return d.identity; }).filter(Boolean);

    var map = {};   // contact -> { contact, perTarget:{label:count}, total }
    ds.forEach(function (d) {
      Object.keys(d.counterparts).forEach(function (num) {
        if (!map[num]) map[num] = { contact: num, perTarget: {}, total: 0 };
        map[num].perTarget[d.label] = (map[num].perTarget[d.label] || 0) + d.counterparts[num];
        map[num].total += d.counterparts[num];
      });
    });
    var shared = Object.keys(map).map(function (k) {
      var m = map[k];
      m.targets = Object.keys(m.perTarget);
      m.targetCount = m.targets.length;
      m.isTargetIdentity = identities.indexOf(k) !== -1;   // contact is itself another target
      return m;
    }).filter(function (m) { return m.targetCount >= 2; })
      .sort(function (a, b) { return b.targetCount - a.targetCount || b.total - a.total; });

    // direct target-to-target links: Y contacted X's identity
    var directLinks = [];
    ds.forEach(function (x) {
      ds.forEach(function (y) {
        if (x === y || !x.identity) return;
        if (y.counterparts[x.identity]) directLinks.push({ from: y.label, to: x.label, via: x.identity, count: y.counterparts[x.identity] });
      });
    });
    return { shared: shared, directLinks: directLinks, identities: identities, datasets: ds };
  }

  /* ---- co-location -------------------------------------------------------- */
  function locKeyOf(e) {
    var c = e.startCell || {};
    if (c.id) return "CELL:" + norm(c.id);
    if (e.lat != null && e.lon != null) return "GEO:" + e.lat.toFixed(3) + "," + e.lon.toFixed(3);
    return null;
  }
  function sameLocation(a, b, radiusM) {
    if (a.lk && b.lk && a.lk === b.lk) return true;
    if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) return haversine(a.lat, a.lon, b.lat, b.lon) <= radiusM;
    return false;
  }
  // opts: { windowMins=60, radiusM=250 }
  function coLocations(datasets, opts) {
    opts = opts || {};
    var windowMs = (opts.windowMins != null ? opts.windowMins : 60) * 60000;
    var radiusM = (opts.radiusM != null ? opts.radiusM : 250);
    var pts = [];
    (datasets || []).forEach(function (d) {
      var label = d.label || (d.identity) || "target";
      (d.events || []).forEach(function (e) {
        var t = parseDt(e.startDt); if (!t) return;
        var lk = locKeyOf(e);
        if (lk == null && (e.lat == null || e.lon == null)) return;
        pts.push({ label: label, time: t, lk: lk, lat: (e.lat != null ? e.lat : null), lon: (e.lon != null ? e.lon : null),
          place: e.cellName || e.cellPostcode || (e.lat != null ? (e.lat + ", " + e.lon) : "") });
      });
    });
    pts.sort(function (a, b) { return a.time - b.time; });
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var dt = pts[j].time - pts[i].time;
        if (dt > windowMs) break;                 // sorted: nothing further is in-window
        if (pts[i].label === pts[j].label) continue;
        if (sameLocation(pts[i], pts[j], radiusM)) {
          out.push({
            targetA: pts[i].label, targetB: pts[j].label,
            place: pts[i].place || pts[j].place,
            lat: pts[i].lat != null ? pts[i].lat : pts[j].lat,
            lon: pts[i].lon != null ? pts[i].lon : pts[j].lon,
            timeA: pts[i].time, timeB: pts[j].time,
            gapMins: Math.round((dt / 60000) * 10) / 10
          });
        }
      }
    }
    out.sort(function (a, b) { return a.timeA - b.timeA; });
    return out;
  }

  var api = {
    parseDt: parseDt, haversine: haversine,
    inferIdentity: inferIdentity, buildDataset: buildDataset,
    commonContacts: commonContacts, coLocations: coLocations
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryCommsLink = api; }
})();
