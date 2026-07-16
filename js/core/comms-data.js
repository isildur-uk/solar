/* comms-data.js — communications-data (CDR) result parsing, de-bloating and
 * geolocation for the Registry "Comms Data" view.
 *
 * Handles the two return formats Solar sees:
 *   1. Raw CSP "Call Data" CSV — 16 metadata header rows, a blank row, a 36-column
 *      event header row, then event rows. Locations are OS grid Easting/Northing
 *      (+ azimuth); no lat/long.
 *   2. Home Office ADM (Advanced Data Mediation) "Telephony" workbook — multi-tab,
 *      with *Raw / *Standardised / *Enriched / *Calculated / *Decoded column
 *      variants (and hidden raw duplicates). Carries Latitude/Longitude directly.
 *
 * This module is PARSER-AGNOSTIC: it consumes already-parsed 2-D arrays of rows
 * (the browser supplies PapaParse output for CSV, SheetJS sheet_to_json for XLSX),
 * normalises them to ONE clean event model, CM-standardises phone numbers via
 * cm-standards.js, and converts OS grid Easting/Northing -> WGS84 lat/long offline
 * (no online geocoding — consistent with the sensitive-work posture).
 *
 * XSS-safe: returns plain data only; the render layer escapes.
 * Dual export: module.exports (Node) + window.RegistryCommsData (browser).
 */
"use strict";
(function () {
  var CM = (typeof require !== "undefined") ? require("./cm-standards.js")
         : (typeof window !== "undefined" ? window.CRStandards : null);

  function str(x) { return (x == null) ? "" : String(x); }
  function trim(x) { return str(x).replace(/^\s+|\s+$/g, ""); }
  function lc(x) { return str(x).toLowerCase(); }
  function num(x) { var n = parseFloat(str(x).replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : null; }
  function normKey(h) { return lc(h).replace(/\(\*[^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, ""); }

  /* ---- minimal RFC4180-ish CSV parser (for Node tests / fallback) ---------- */
  function parseDelimited(text, delim) {
    delim = delim || ",";
    var rows = [], row = [], field = "", i = 0, c, inQ = false, s = str(text);
    for (; i < s.length; i++) {
      c = s[i];
      if (inQ) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') { inQ = true; }
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* ---- canonical clean event schema (the "de-bloated" columns) ------------- */
  // The analyst-facing columns kept for manual checks; everything else (hidden
  // raw dupes, data-volume noise, CGI composition, per-band top-locations) is
  // dropped from the clean view but preserved on event.raw.
  var CLEAN_COLUMNS = [
    { key: "startDt",    label: "Start (local)" },
    { key: "endDt",      label: "End (local)" },
    { key: "type",       label: "Event" },
    { key: "aParty",     label: "A / Calling" },
    { key: "bParty",     label: "B / Called" },
    { key: "fwdParty",   label: "Forwarded to" },
    { key: "durationHms",label: "Duration" },
    { key: "imei",       label: "IMEI" },
    { key: "imsi",       label: "IMSI" },
    { key: "cellName",   label: "Cell site" },
    { key: "cellPostcode", label: "Cell postcode" },
    { key: "cellGeneration", label: "Gen" },
    { key: "cellAzimuth", label: "Azimuth" },
    { key: "lat",        label: "Lat" },
    { key: "lon",        label: "Long" }
  ];

  /* ---- header synonym dictionary: many source headers -> one canonical key -- */
  // Keys are normalised (normKey) so "Calling Number", "Originator Comms Address
  // (*Standardised)", "Outgoing party" all resolve to the same canonical field.
  var SYNONYMS = {
    startDate: ["start date", "start datetime", "event start time", "start date time"],
    startTime: ["start time local", "start time"],
    endDate: ["end date", "end datetime"],
    endTime: ["end time local", "end time"],
    type: ["cdr type", "event type", "call type"],
    aParty: ["calling number", "originator comms address", "outgoing party", "comms address", "a party", "originator"],
    bParty: ["called number", "recipient comms address", "incoming party", "b party", "recipient"],
    fwdParty: ["forwarding number", "forwarded to comms address", "forwarded to party", "forwarded to"],
    imei: ["imei", "originator imei", "recipient imei"],
    imsi: ["imsi"],
    ringSecs: ["ring time secs", "ring time"],
    durationHms: ["call duration hh mm ss", "duration hh mm ss", "duration"],
    ringOrDur: [],
    // start cell
    sCellId: ["start cell id or mac address", "start cell global identity cgi ecgi ncgi", "start cell value"],
    sCellName: ["start cell site name", "start cell site address details", "start cell label"],
    sCellAddr: ["start cell 1st line of address", "start cell site address details"],
    sCellPostcode: ["start cell id postcode", "start cell postcode", "cell post code", "postcode"],
    sCellGen: ["start cell generation", "start cell generation standardised", "generation"],
    sCellEast: ["start cell easting", "start cell easting standardised", "easting"],
    sCellNorth: ["start cell northing", "start cell northing standardised", "northing"],
    sCellAz: ["start cell azimuth", "azimuth"],
    sCellLat: ["start cell latitude", "latitude", "cell latitude and longitude"],
    sCellLon: ["start cell longitude", "longitude"],
    // end cell
    eCellId: ["end cell id or mac address", "end cell global identity cgi ecgi ncgi", "end cell value"],
    eCellName: ["end cell site name", "end cell site address details", "end cell label"],
    eCellPostcode: ["end cell id postcode", "end cell postcode"],
    eCellGen: ["end cell generation"],
    eCellEast: ["end cell easting"],
    eCellNorth: ["end cell northing"],
    eCellAz: ["end cell azimuth"],
    eCellLat: ["end cell latitude"],
    eCellLon: ["end cell longitude"]
  };

  // Build a lookup: normalised-header -> canonical key. First synonym wins; a
  // header may map to several canonical keys only via distinct entries.
  function buildColumnMap(headerRow) {
    var map = {}; // canonicalKey -> column index
    var normHeaders = headerRow.map(normKey);
    Object.keys(SYNONYMS).forEach(function (canon) {
      var syns = SYNONYMS[canon];
      for (var s = 0; s < syns.length; s++) {
        var want = syns[s];
        for (var i = 0; i < normHeaders.length; i++) {
          if (map[canon] != null) break;
          // exact match preferred; else startsWith (handles "...standardised" trailing)
          if (normHeaders[i] === want || normHeaders[i].indexOf(want) === 0) { map[canon] = i; break; }
        }
        if (map[canon] != null) break;
      }
    });
    return map;
  }

  /* ---- format detection + header-row location ------------------------------ */
  function detectFormat(rows) {
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var joined = normKey((rows[r] || []).join(" "));
      if (joined.indexOf("calling number") !== -1 && joined.indexOf("cdr type") !== -1) return { format: "csv", headerRow: r };
      if (joined.indexOf("comms address") !== -1 && (joined.indexOf("start cell") !== -1 || joined.indexOf("event type") !== -1)) return { format: "adm", headerRow: r };
    }
    // fall back: first row that has >6 non-empty cells is the header
    for (var k = 0; k < rows.length; k++) {
      if ((rows[k] || []).filter(function (c) { return trim(c) !== ""; }).length > 6) return { format: "unknown", headerRow: k };
    }
    return { format: "unknown", headerRow: 0 };
  }

  /* ---- CSV metadata header (the 16 leading "Key:," rows) ------------------- */
  function parseCsvMeta(rows, headerRowIndex) {
    var meta = {};
    for (var r = 0; r < headerRowIndex; r++) {
      var cells = rows[r] || [];
      var key = trim(cells[0]).replace(/:$/, "");
      if (!key) continue;
      var val = "";
      for (var c = 1; c < cells.length; c++) { if (trim(cells[c]) !== "") { val = trim(cells[c]); break; } }
      meta[key] = val;
    }
    return meta;
  }

  /* ---- helpers to build a clean event from a raw row ----------------------- */
  function phone(v) {
    var raw = trim(v);
    if (!raw) return "";
    if (CM && CM.phoneCM) { var p = CM.phoneCM(raw); return p || raw; }
    return raw;
  }
  function joinDateTime(d, t) {
    d = trim(d); t = trim(t);
    if (d && /\d{1,2}:\d{2}/.test(d) && !t) return d;      // already a datetime
    return trim(d + (t ? " " + t : ""));
  }
  function cell(map, row, prefix) {
    function g(k) { return map[k] != null ? trim(row[map[k]]) : ""; }
    var east = num(g(prefix + "CellEast")), north = num(g(prefix + "CellNorth"));
    var lat = num(g(prefix + "CellLat")), lon = num(g(prefix + "CellLon"));
    if ((lat == null || lon == null) && east != null && north != null) {
      var w = osgbToWgs84(east, north); if (w) { lat = round6(w.lat); lon = round6(w.lon); }
    }
    return {
      id: g(prefix + "CellId"),
      name: g(prefix + "CellName"),
      postcode: g(prefix + "CellPostcode"),
      generation: g(prefix + "CellGen"),
      easting: east, northing: north,
      azimuth: num(g(prefix + "CellAz")),
      lat: lat, lon: lon
    };
  }
  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  /* ---- main: rows -> clean events ------------------------------------------ */
  function cleanFromRows(rows, opts) {
    opts = opts || {};
    rows = (rows || []).map(function (r) { return Array.isArray(r) ? r : []; });
    var det = (opts.format && opts.headerRow != null) ? opts : detectFormat(rows);
    var hIdx = det.headerRow, header = rows[hIdx] || [];
    var map = buildColumnMap(header);
    var meta = det.format === "csv" ? parseCsvMeta(rows, hIdx) : {};
    var events = [];
    for (var r = hIdx + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      if (row.filter(function (c) { return trim(c) !== ""; }).length === 0) continue; // blank
      function g(k) { return map[k] != null ? trim(row[map[k]]) : ""; }
      var sc = cell(map, row, "s"), ec = cell(map, row, "e");
      var ev = {
        rowIndex: r,
        startDt: joinDateTime(g("startDate"), g("startTime")),
        endDt: joinDateTime(g("endDate"), g("endTime")),
        type: g("type"),
        aParty: phone(g("aParty")),
        bParty: phone(g("bParty")),
        fwdParty: phone(g("fwdParty")),
        durationHms: g("durationHms"),
        imei: g("imei"),
        imsi: g("imsi"),
        startCell: sc, endCell: ec,
        // convenience flat fields for the primary (start) cell
        cellName: sc.name, cellPostcode: sc.postcode, cellGeneration: sc.generation,
        cellAzimuth: sc.azimuth, lat: sc.lat, lon: sc.lon,
        raw: row
      };
      events.push(ev);
    }
    return { format: det.format, headerRow: hIdx, meta: meta, columns: CLEAN_COLUMNS, events: events };
  }

  /* ---- summary (the ADM "Simple View" equivalent) -------------------------- */
  function summarise(events) {
    events = events || [];
    var byCell = {}, handsets = {}, aCount = {}, first = null, last = null, geoPts = 0;
    events.forEach(function (e) {
      var c = e.startCell || {};
      if (c.lat != null && c.lon != null) {
        geoPts++;
        var ck = (c.name || c.id || (c.lat + "," + c.lon));
        if (!byCell[ck]) byCell[ck] = { key: ck, name: c.name, postcode: c.postcode, lat: c.lat, lon: c.lon, count: 0 };
        byCell[ck].count++;
      }
      if (e.imei || e.imsi) {
        var hk = (e.aParty || "?") + "|" + (e.imei || "?") + "|" + (e.imsi || "?");
        handsets[hk] = (handsets[hk] || 0) + 1;
      }
      if (e.aParty) aCount[e.aParty] = (aCount[e.aParty] || 0) + 1;
      if (e.startDt) { if (first == null || e.startDt < first) first = e.startDt; if (last == null || e.startDt > last) last = e.startDt; }
    });
    function top(obj, n) { return Object.keys(obj).map(function (k) { return { key: k, value: obj[k] }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, n || 10); }
    return {
      eventCount: events.length,
      geolocated: geoPts,
      firstEvent: first, lastEvent: last,
      topCells: Object.keys(byCell).map(function (k) { return byCell[k]; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10),
      handsetCombos: top(handsets, 20),   // SIM-swap analysis: >1 combo per number = swap
      topNumbers: top(aCount, 10)
    };
  }

  /* ================================================================== */
  /*  OS grid (OSGB36 National Grid) Easting/Northing -> WGS84 lat/long   */
  /*  Offline. Transverse-Mercator inverse on Airy 1830, then a 7-param   */
  /*  Helmert to WGS84 (~5 m; adequate for plotting cell sites).          */
  /* ================================================================== */
  function toRad(d) { return d * Math.PI / 180; }
  function toDeg(r) { return r * 180 / Math.PI; }

  function osgbToWgs84(E, N) {
    if (E === "" || E == null || N === "" || N == null) return null;
    E = +E; N = +N;
    if (!isFinite(E) || !isFinite(N)) return null;
    // Airy 1830
    var a = 6377563.396, b = 6356256.909, F0 = 0.9996012717;
    var lat0 = toRad(49), lon0 = toRad(-2), N0 = -100000, E0 = 400000;
    var e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;
    var lat = lat0, M = 0;
    do {
      lat = (N - N0 - M) / (a * F0) + lat;
      var Ma = (1 + n + 1.25 * n2 + 1.25 * n3) * (lat - lat0);
      var Mb = (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
      var Mc = (1.875 * n2 + 1.875 * n3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
      var Md = (35 / 24) * n3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
      M = b * F0 * (Ma - Mb + Mc - Md);
    } while (Math.abs(N - N0 - M) >= 0.00001);
    var cosLat = Math.cos(lat), sinLat = Math.sin(lat), tanLat = Math.tan(lat);
    var nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
    var rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
    var eta2 = nu / rho - 1;
    var tan2 = tanLat * tanLat, tan4 = tan2 * tan2, tan6 = tan4 * tan2;
    var secLat = 1 / cosLat, nu3 = nu * nu * nu, nu5 = nu3 * nu * nu, nu7 = nu5 * nu * nu;
    var VII = tanLat / (2 * rho * nu);
    var VIII = tanLat / (24 * rho * nu3) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
    var IX = tanLat / (720 * rho * nu5) * (61 + 90 * tan2 + 45 * tan4);
    var X = secLat / nu;
    var XI = secLat / (6 * nu3) * (nu / rho + 2 * tan2);
    var XII = secLat / (120 * nu5) * (5 + 28 * tan2 + 24 * tan4);
    var XIIA = secLat / (5040 * nu7) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);
    var dE = E - E0, dE2 = dE * dE, dE3 = dE2 * dE, dE4 = dE2 * dE2, dE5 = dE3 * dE2, dE6 = dE4 * dE2, dE7 = dE5 * dE2;
    var latA = lat - VII * dE2 + VIII * dE4 - IX * dE6;
    var lonA = lon0 + X * dE - XI * dE3 + XII * dE5 - XIIA * dE7;
    // OSGB36 (Airy) geodetic -> WGS84 via Helmert
    return helmertOSGB36toWGS84(toDeg(latA), toDeg(lonA), a, b);
  }

  function helmertOSGB36toWGS84(latDeg, lonDeg, a, b) {
    // OSGB36 -> WGS84 datum parameters (metres / ppm / arc-seconds)
    var tx = 446.448, ty = -125.157, tz = 542.060, s = -20.4894e-6;
    var rx = toRad(0.1502 / 3600), ry = toRad(0.2470 / 3600), rz = toRad(0.8421 / 3600);
    var phi = toRad(latDeg), lam = toRad(lonDeg), H = 0;
    var e2 = 1 - (b * b) / (a * a);
    var v = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
    var x = (v + H) * Math.cos(phi) * Math.cos(lam);
    var y = (v + H) * Math.cos(phi) * Math.sin(lam);
    var z = ((1 - e2) * v + H) * Math.sin(phi);
    var xB = tx + x * (1 + s) + (-rz) * y + (ry) * z;
    var yB = ty + (rz) * x + y * (1 + s) + (-rx) * z;
    var zB = tz + (-ry) * x + (rx) * y + z * (1 + s);
    // WGS84 ellipsoid
    var a2 = 6378137.0, b2 = 6356752.314245, e2b = 1 - (b2 * b2) / (a2 * a2);
    var p = Math.sqrt(xB * xB + yB * yB);
    var phi2 = Math.atan2(zB, p * (1 - e2b)), phiP = 2 * Math.PI, v2;
    var guard = 0;
    while (Math.abs(phi2 - phiP) > 1e-11 && guard++ < 100) {
      v2 = a2 / Math.sqrt(1 - e2b * Math.sin(phi2) * Math.sin(phi2));
      phiP = phi2;
      phi2 = Math.atan2(zB + e2b * v2 * Math.sin(phi2), p);
    }
    var lam2 = Math.atan2(yB, xB);
    return { lat: toDeg(phi2), lon: toDeg(lam2) };
  }

  var api = {
    CLEAN_COLUMNS: CLEAN_COLUMNS,
    parseDelimited: parseDelimited,
    detectFormat: detectFormat,
    buildColumnMap: buildColumnMap,
    cleanFromRows: cleanFromRows,
    summarise: summarise,
    osgbToWgs84: osgbToWgs84,
    normKey: normKey
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryCommsData = api; }
})();
