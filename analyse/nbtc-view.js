/* nbtc-view.js — Analyse tool: NBTC / border TRAVEL analysis.
 * Paste a passenger travel table -> decode flights (airline) + airports (map) +
 * boarded status -> a flight MAP, a flights timeline, and a summary. Identity
 * resolution (the "same person?" clustering) is a secondary tab. "Add to case"
 * pushes person + passports + airports + journeys onto the shared SOLAR spine.
 * window.RegistryNbtcView + module.exports. Reuses shell/analyse CSS tokens. */
(function () {
  "use strict";
  var doc = (typeof document !== "undefined") ? document : null;
  var N = (typeof window !== "undefined" && window.CRNbtc) || null;
  var AV = (typeof window !== "undefined" && window.CRAviation) || null;
  var SC = (typeof window !== "undefined" && window.SolarCase) || null;
  var L = (typeof window !== "undefined" && window.L) || null;

  /* A subject's travel history: flights, dates, airports, boarded status.
     DC = departure confirmed (boarded); CI = check-in only (did NOT board). */
  var SAMPLE = [
    "Passenger name\tDate of birth\tNationality\tTravel Doc\tFlight\tDate\tFrom\tTo\tStatus",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tBA430\t12/10/2025\tLHR\tAMS\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tBA429\t14/10/2025\tAMS\tLHR\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tU27653\t09/11/2025\tLGW\tAMS\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tU27654\t11/11/2025\tAMS\tLGW\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tFR8542\t06/12/2025\tSTN\tAGP\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tFR8543\t08/12/2025\tAGP\tSTN\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tKL1008\t03/01/2026\tLHR\tAMS\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tKL1009\t05/01/2026\tAMS\tLHR\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t574444444 (GBR)\tU28040\t17/01/2026\tLGW\tAMS\tCI",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t575555555 (GBR)\tFR8542\t24/01/2026\tSTN\tAGP\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t575555555 (GBR)\tFR8543\t26/01/2026\tAGP\tSTN\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t575555555 (GBR)\tBA430\t07/02/2026\tLHR\tAMS\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t575555555 (GBR)\tBA429\t08/02/2026\tAMS\tLHR\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t575555555 (GBR)\tVY7821\t21/02/2026\tLTN\tAGP\tDC",
    "GUBBINS, DEAN\t01/01/2000\tGBR\t575555555 (GBR)\tVY7822\t23/02/2026\tAGP\tLTN\tDC",
    "NOWAK, TOMASZ\t14/03/1996\tPOL\tPL9911223 (POL)\tFR8542\t06/12/2025\tSTN\tAGP\tDC",
    "NOWAK, TOMASZ\t14/03/1996\tPOL\tPL9911223 (POL)\tFR8543\t08/12/2025\tAGP\tSTN\tDC"
  ].join("\n");

  var state = { recs: null, journeys: null, resolve: null, trips: null, map: null, layer: null, tab: "map", built: false };

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]; }); }
  function el(tag, cls, text){ var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function mount(host){
    if (!doc || !host) return;
    L = (typeof window !== "undefined" && window.L) || L;
    injectStyle();
    host.innerHTML = "";
    var panel = el("div", "nb-panel");

    var head = el("div", "nb-head");
    head.appendChild(el("span", "nb-title", "Border / NBTC — travel analysis"));
    var meta = el("span", "nb-meta"); meta.id = "nb-meta"; head.appendChild(meta);
    panel.appendChild(head);

    var bar = el("div", "nb-bar");
    var bSample = el("button", "nb-btn", "Load sample"); bSample.type = "button"; bSample.onclick = function(){ ta.value = SAMPLE; analyse(); };
    var bRun = el("button", "nb-btn nb-btn-go", "Analyse"); bRun.type = "button"; bRun.onclick = analyse;
    var bCase = el("button", "nb-btn", "Add to case"); bCase.type = "button"; bCase.id = "nb-addcase"; bCase.onclick = addToCase;
    bar.appendChild(bSample); bar.appendChild(bRun); bar.appendChild(bCase);
    bar.appendChild(el("span", "nb-spacer"));
    var fl = el("input", "nb-flight"); fl.type = "text"; fl.placeholder = "flight e.g. BA286"; fl.id = "nb-flight";
    fl.addEventListener("keydown", function(e){ if (e.key === "Enter") lookupFlight(); });
    var bFl = el("button", "nb-btn", "Look up"); bFl.type = "button"; bFl.onclick = lookupFlight;
    bar.appendChild(fl); bar.appendChild(bFl);
    var flOut = el("span", "nb-flightout"); flOut.id = "nb-flightout"; bar.appendChild(flOut);
    panel.appendChild(bar);

    var ta = el("textarea", "nb-input"); ta.id = "nb-input";
    ta.placeholder = "Paste a passenger travel table (tab/comma separated). Columns: Passenger name, Date of birth, Nationality, Travel Doc, Flight, Date, From, To, Status (DC=boarded, CI=check-in only).";
    panel.appendChild(ta);

    var tabs = el("div", "nb-tabs"); tabs.id = "nb-tabs";
    ["map:Map", "timeline:Timeline", "flights:Flights", "identities:Identities"].forEach(function(t){
      var parts = t.split(":"), b = el("button", "nb-tab" + (parts[0] === state.tab ? " nb-tab-on" : ""), parts[1]);
      b.type = "button"; b.setAttribute("data-pane", parts[0]); b.onclick = function(){ showTab(parts[0]); };
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var body = el("div", "nb-body"); body.id = "nb-body";
    body.appendChild(paneEl("map"));
    body.appendChild(paneEl("timeline"));
    body.appendChild(paneEl("flights"));
    body.appendChild(paneEl("identities"));
    panel.appendChild(body);
    host.appendChild(panel);
    state.built = true;
    empty();
  }
  function paneEl(name){ var p = el("div", "nb-pane" + (name === state.tab ? "" : " nb-hidden")); p.id = "nb-pane-" + name; return p; }
  function pane(name){ return doc.getElementById("nb-pane-" + name); }
  function empty(){ pane("map").innerHTML = ""; pane("map").appendChild(el("div", "nb-empty", "Load the sample or paste a travel table, then Analyse — flights plot on the map.")); }

  function showTab(name){
    state.tab = name;
    var tabs = doc.getElementById("nb-tabs");
    if (tabs) [].forEach.call(tabs.querySelectorAll(".nb-tab"), function(b){ b.classList.toggle("nb-tab-on", b.getAttribute("data-pane") === name); });
    ["map", "timeline", "flights", "identities"].forEach(function(n){ var p = pane(n); if (p) p.classList.toggle("nb-hidden", n !== name); });
    if (name === "map" && state.journeys) drawMap(state.journeys);
    if (name === "timeline" && state.journeys) drawTimeline(state.journeys, state.trips);
  }

  function lookupFlight(){
    var out = doc.getElementById("nb-flightout"), inp = doc.getElementById("nb-flight");
    if (!out || !inp) return; out.textContent = ""; out.className = "nb-flightout";
    var v = inp.value.trim(); if (!v) return;
    if (!AV) { out.textContent = "aviation reference unavailable"; return; }
    var r = AV.airlineFromFlight(v);
    if (r && r.airline) { out.innerHTML = "<b>" + esc(r.airline.name) + "</b> (" + esc(r.code) + ") · flt " + esc(r.flightNumber) + (r.airline.callsign ? " · " + esc(r.airline.callsign) : ""); out.className = "nb-flightout nb-ok"; }
    else if (r) { out.textContent = "unknown carrier for code " + r.code; out.className = "nb-flightout nb-warn"; }
    else { out.textContent = "not a flight designator"; out.className = "nb-flightout nb-warn"; }
  }

  function analyse(){
    var ta = doc.getElementById("nb-input"), meta = doc.getElementById("nb-meta");
    if (!N) { empty(); return; }
    var recs = N.parse(ta ? ta.value : "");
    if (!recs.length) { pane("map").innerHTML = ""; pane("map").appendChild(el("div", "nb-empty", "No passenger rows found. Check the columns.")); state.journeys = null; if (meta) meta.textContent = ""; return; }
    var j = N.journeys(recs), res = N.resolve(recs), tr = (N.trips ? N.trips(j.legs) : { trips: [], summary: {} });
    // attach each cluster's airports (for the spine)
    res.clusters.forEach(function(c){ var seen = {}; c.travel = []; c.members.forEach(function(mi){ j.legs.forEach(function(lg){ if (lg.idx === mi){ [lg.from, lg.to].forEach(function(a){ if (a && !seen[a.iata]){ seen[a.iata] = 1; c.travel.push(a); } }); } }); }); });
    state.recs = recs; state.journeys = j; state.resolve = res; state.trips = tr;
    renderFlights(j); renderIdentities(res, recs); drawTimeline(j, tr); drawMap(j);
    if (meta) meta.textContent = j.legs.length + " flights · " + j.boarded + " boarded · " + j.notBoarded + " not boarded · " + res.clusters.length + " identit" + (res.clusters.length === 1 ? "y" : "ies");
    showTab("map");
  }

  /* ---- MAP (Leaflet): airports as markers, flight legs as coloured lines ---- */
  function legColour(b){ return b === true ? "#5fbf7f" : (b === false ? "#e8a13a" : "#8fa3bd"); }
  function drawMap(j){
    var host = pane("map"); if (!host) return;
    L = (typeof window !== "undefined" && window.L) || L;
    if (!L) { host.innerHTML = ""; host.appendChild(el("div", "nb-empty", "Map needs the Leaflet library. Flights are listed under the Flights tab.")); return; }
    host.innerHTML = ""; host.classList.remove("nb-empty");
    var mapEl = el("div", "nb-map"); mapEl.id = "nb-mapEl"; host.appendChild(mapEl);
    var legend = el("div", "nb-legend");
    legend.innerHTML = "<span><i class='nb-l nb-l-b'></i>boarded</span><span><i class='nb-l nb-l-n'></i>check-in only</span><span><i class='nb-l nb-l-a'></i>airport</span>";
    host.appendChild(legend);
    try {
      var map = L.map(mapEl, { zoomControl: true }).setView([48, 2], 4);
      var tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: "© OpenStreetMap © CARTO" });
      tiles.on("tileerror", function () { mapEl.classList.add("nb-map-offline"); });
      tiles.addTo(map);
      var pts = [];
      j.legs.forEach(function(lg){
        if (lg.from && lg.to) {
          var a = [lg.from.lat, lg.from.lon], b = [lg.to.lat, lg.to.lon];
          L.polyline([a, b], { color: legColour(lg.boarded), weight: 2.5, opacity: 0.85, dashArray: lg.boarded === false ? "5,6" : null }).addTo(map)
            .bindPopup("<b>" + esc(lg.flight) + "</b>" + (lg.airline ? " · " + esc(lg.airline.name) : "") + "<br>" + esc(lg.fromCode) + " &rarr; " + esc(lg.toCode) + "<br>" + esc(lg.date) + " · " + (lg.boarded === true ? "boarded" : lg.boarded === false ? "check-in only (no board)" : "booked"));
          pts.push(a); pts.push(b);
        }
      });
      var LOCURL = (window.CRIcons && window.CRIcons.get) ? window.CRIcons.get("location", (window.SolarEntityStyle && window.SolarEntityStyle.hue ? window.SolarEntityStyle.hue("location") : "#8ea2ff")).unselected : null;
      Object.keys(j.airports).forEach(function(k){ var a = j.airports[k]; var mk;
        if (LOCURL) mk = L.marker([a.lat, a.lon], { icon: L.divIcon({ html: "<img src='" + LOCURL + "' width='26' height='26' alt=''>", className: "nb-apin", iconSize: [26, 26], iconAnchor: [13, 13] }) });
        else mk = L.circleMarker([a.lat, a.lon], { radius: 6, color: "#8ea2ff", weight: 2, fillColor: "#8ea2ff", fillOpacity: 0.85 });
        var fimg = (window.CRFlags && a.country) ? ("<img src=\"" + window.CRFlags.uri(a.country) + "\" width=\"18\" height=\"12\" style=\"vertical-align:middle;margin-right:5px;border-radius:2px\">") : "";
        mk.addTo(map).bindPopup(fimg + "<b>" + esc(a.iata) + "</b> " + esc(a.name) + "<br>" + esc(a.city || "") + (a.country ? ", " + esc(a.country) : ""));
      });
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3));
      state.map = map;
      setTimeout(function(){ try { map.invalidateSize(); } catch (e) {} }, 60);
    } catch (e) { host.innerHTML = ""; host.appendChild(el("div", "nb-empty", "Could not render the map: " + esc(e.message))); }
  }

  /* ---- FLIGHTS: summary chips + a per-leg table ---- */
  function renderFlights(j){
    var host = pane("flights"); host.innerHTML = "";
    var chips = el("div", "nb-chips");
    chips.appendChild(chip(j.legs.length + " flights"));
    chips.appendChild(chip(j.boarded + " boarded", "ok"));
    if (j.notBoarded) chips.appendChild(chip(j.notBoarded + " not boarded", "warn"));
    chips.appendChild(chip(Object.keys(j.airports).length + " airports"));
    chips.appendChild(chip(j.countries.length + " countries"));
    if (j.airlines.length) chips.appendChild(chip("airlines: " + j.airlines.join(", ")));
    host.appendChild(chips);

    var tbl = el("table", "nb-table"), thd = el("thead"), tr = el("tr");
    ["Date", "Flight", "Airline", "Route", "Boarded"].forEach(function(h){ tr.appendChild(el("th", null, h)); });
    thd.appendChild(tr); tbl.appendChild(thd);
    var tb = el("tbody");
    j.legs.forEach(function(lg){
      var r = el("tr");
      r.appendChild(el("td", null, lg.date || ""));
      r.appendChild(el("td", "nb-mono", lg.flight || ""));
      r.appendChild(el("td", null, lg.airline ? lg.airline.name : (lg.airlineCode || "—")));
      var route = el("td");
      var ffo = flagImg(lg.from); if (ffo) route.appendChild(ffo);
      route.appendChild(el("span", "nb-tcode", lg.fromCode));
      route.appendChild(el("span", "nb-tarr", " → "));
      var ffd = flagImg(lg.to); if (ffd) route.appendChild(ffd);
      route.appendChild(el("span", "nb-tcode", lg.toCode));
      r.appendChild(route);
      var bd = el("td");
      var bcls = lg.boarded === true ? "nb-badge-b" : (lg.boarded === false ? "nb-badge-n" : "nb-badge-u");
      var btxt = lg.boarded === true ? "Boarded" : (lg.boarded === false ? "Check-in only" : "Booked");
      var span = el("span", "nb-bd " + bcls, btxt); bd.appendChild(span); r.appendChild(bd);
      tb.appendChild(r);
    });
    tbl.appendChild(tb); host.appendChild(tbl);
  }
  function chip(t, kind){ var c = el("span", "nb-chip" + (kind ? " nb-chip-" + kind : ""), t); return c; }

  /* ---- IDENTITIES (secondary): resolved people + review candidates ---- */
  function renderIdentities(res, recs){
    var host = pane("identities"); host.innerHTML = "";
    host.appendChild(el("div", "nb-note", "Who is travelling — records resolved into people. Useful when the same subject appears under varied name spellings, DOBs or documents. Candidates are never auto-merged."));
    res.clusters.slice().sort(function(a, b){ return b.size - a.size; }).forEach(function(c){
      var card = el("div", "nb-person");
      var h = el("div", "nb-person-h");
      var pIcon = ico("person", 18); if (pIcon) h.appendChild(pIcon);
      h.appendChild(el("span", "nb-person-name", c.label || c.surname || "?"));
      h.appendChild(el("span", "nb-chip", c.size + (c.size === 1 ? " record" : " records")));
      if (c.ambiguousDob) h.appendChild(el("span", "nb-chip nb-chip-warn", "ambiguous DOB"));
      card.appendChild(h);
      var attrs = el("div", "nb-person-attrs");
      if (c.nationalities.length) attrs.appendChild(el("span", "nb-tag", "nat: " + c.nationalities.join(", ")));
      if (c.documents.length) { var dIcon = ico("document", 14); if (dIcon) attrs.appendChild(dIcon); }
      c.documents.forEach(function(d){ attrs.appendChild(el("span", "nb-tag nb-tag-doc", d.number + " (" + d.state + ")")); });
      card.appendChild(attrs);
      host.appendChild(card);
    });
    if (res.candidates.length) {
      host.appendChild(el("div", "nb-h", "Candidates for review (" + res.candidates.length + ")"));
      res.candidates.forEach(function(cand){
        var row = el("div", "nb-cand");
        row.appendChild(el("span", "nb-badge nb-badge-" + cand.confidence, cand.confidence.toUpperCase()));
        var t = el("span", "nb-cand-t"); t.innerHTML = esc(cand.labels[0]) + " <span class='nb-arrow'>&harr;</span> " + esc(cand.labels[1]) + " — <i>" + esc(cand.reason) + "</i>";
        row.appendChild(t); host.appendChild(row);
      });
    }
  }

  function addToCase(){
    if (!state.resolve) { flash("Analyse a table first."); return; }
    if (!SC || !N || !N.toCase) { flash("Shared case spine unavailable."); return; }
    var parts = N.toCase(state.resolve);
    if (!parts.entities.length) { flash("Nothing to add."); return; }
    var st = SC.merge(parts);
    flash("Added " + parts.entities.length + " entities + " + parts.links.length + " links to the shared case (" + st.entities + " total).");
  }
  function flash(msg){ var meta = doc.getElementById("nb-meta"); if (meta) { var old = meta.textContent; meta.textContent = msg; setTimeout(function(){ meta.textContent = old; }, 4000); } }

  function dms(raw){ var m = String(raw || "").match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (!m) return NaN; var y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[2] - 1, +m[1]); }
  function ico(type, px){ try { if (typeof window !== "undefined" && window.SolarEntityStyle && window.SolarEntityStyle.icon) return window.SolarEntityStyle.icon(type, px || 16); } catch (e) {} return null; }
  function flagImg(ap){ var country = ap && ap.country; if (!country || typeof window === "undefined" || !window.CRFlags) return null; var img = el("img", "nb-flag"); img.src = window.CRFlags.uri(country); img.alt = country; img.title = country; return img; }

  /* Timeline: a dated track of the subject's TRIPS. Each trip is a labelled chip
   * (origin -> destination with country flags, date, dwell, status), sitting on a
   * month axis, alternating above/below the line, colour-coded by travel document
   * so a passport switch is visible. Reads as "who went where, when" — tempo,
   * escalation, dwell, no-shows and identity switches at a glance. */
  function drawTimeline(j, trips){
    var host = pane("timeline"); if (!host) return; host.innerHTML = "";
    var legs = (j && j.legs) || []; if (!legs.length){ host.appendChild(el("div", "nb-empty", "No flights to plot.")); return; }
    trips = trips || { trips: [], summary: {} };
    var recs = state.recs || [], sm = trips.summary || {};
    var palette = ["#8ea2ff", "#e8a13a", "#5fbf7f", "#d86a6a", "#b08ee8", "#57c7d4"], docColour = {}, di = 0;
    recs.forEach(function(r){ var d = (r.doc || "").trim(); if (d && docColour[d] == null) docColour[d] = palette[di++ % palette.length]; });

    var sum = el("div", "nb-sum");
    function stat(v, lab){ var sp = el("span", "nb-stat"); sp.appendChild(el("b", null, String(v))); sp.appendChild(el("i", null, " " + lab)); return sp; }
    var brate = (j.boarded + j.notBoarded) ? Math.round(j.boarded / (j.boarded + j.notBoarded) * 100) : 0;
    sum.appendChild(stat(sm.tripCount || 0, "trips"));
    if (sm.aborted) sum.appendChild(stat(sm.aborted, "aborted (no-show)"));
    if (sm.medianDwellDays != null) sum.appendChild(stat(sm.medianDwellDays + "d", "median dwell abroad"));
    if (sm.medianCadenceDays != null) sum.appendChild(stat(sm.medianCadenceDays + "d", "median gap between trips"));
    sum.appendChild(stat(Object.keys(docColour).length, "travel documents"));
    sum.appendChild(stat(brate + "%", "boarded"));
    if (sm.destinations && sm.destinations.length) sum.appendChild(stat(sm.destinations.join(", "), "destinations"));
    host.appendChild(sum);

    var tl = (trips.trips || []).slice().sort(function(a, b){ return dms(a.out.date) - dms(b.out.date); });
    var ds = []; tl.forEach(function(t){ var a = dms(t.out.date); if (isFinite(a)) ds.push(a); if (t.ret){ var b = dms(t.ret.date); if (isFinite(b)) ds.push(b); } });
    if (!ds.length) legs.forEach(function(l){ var a = dms(l.date); if (isFinite(a)) ds.push(a); });
    var tMin = Math.min.apply(null, ds), tMax = Math.max.apply(null, ds); if (tMin >= tMax) tMax = tMin + 86400000;
    var span = tMax - tMin;
    function pct(t){ return (t - tMin) / span * 100; }

    var track = el("div", "nb-track");
    var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var d0 = new Date(tMin), my = d0.getUTCFullYear(), mo = d0.getUTCMonth(), t = Date.UTC(my, mo, 1);
    while (t <= tMax){
      if (t >= tMin){ var gx = pct(t);
        var gl = el("div", "nb-grid"); gl.style.left = gx + "%"; track.appendChild(gl);
        var ml = el("div", "nb-mon"); ml.style.left = gx + "%"; ml.textContent = MON[new Date(t).getUTCMonth()] + " " + String(new Date(t).getUTCFullYear()).slice(2); track.appendChild(ml);
      }
      mo++; if (mo > 11){ mo = 0; my++; } t = Date.UTC(my, mo, 1);
    }
    track.appendChild(el("div", "nb-base"));

    var lane = 0;
    tl.forEach(function(tr){
      var doc = (recs[tr.out.idx] && recs[tr.out.idx].doc) || "", col = docColour[doc.trim()] || "#8ea2ff";
      var g = el("div", "nb-trip " + (lane ? "nb-trip-lo" : "nb-trip-hi")); g.style.left = pct(dms(tr.out.date)) + "%";
      var dot = el("span", "nb-tdot" + (tr.aborted ? " nb-tdot-ab" : "")); g.appendChild(dot);
      g.appendChild(el("span", "nb-tstem"));
      var chip = el("div", "nb-tchip" + (tr.aborted ? " nb-tchip-ab" : "")); chip.style.borderLeftColor = col;
      var route = el("div", "nb-troute");
      var fo = flagImg(tr.out.from); if (fo) route.appendChild(fo);
      route.appendChild(el("span", "nb-tcode", tr.out.fromCode));
      route.appendChild(el("span", "nb-tarr", " → "));
      var fd = flagImg(tr.out.to); if (fd) route.appendChild(fd);
      route.appendChild(el("span", "nb-tcode", tr.out.toCode));
      chip.appendChild(route);
      chip.appendChild(el("div", "nb-tsub", tr.out.date + (tr.aborted ? " · NO-SHOW" : (tr.ret ? (" · " + tr.dwellDays + "d dwell") : " · one-way"))));
      chip.title = tr.person + " · " + (tr.destination || "") + " · " + (tr.aborted ? "aborted no-show" : ("out " + tr.out.date + (tr.ret ? ", return " + tr.ret.date : ""))) + " · passport " + doc;
      g.appendChild(chip);
      track.appendChild(g);
      lane = lane ? 0 : 1;
    });
    host.appendChild(track);

    if (Object.keys(docColour).length > 1){
      host.appendChild(el("div", "nb-note", "Chip border colour = travel document — a colour change mid-series is a passport / identity switch."));
      var lg = el("div", "nb-doclegend");
      Object.keys(docColour).forEach(function(d){ var sp = el("span", "nb-dockey"); var sw = el("i", "nb-docsw"); sw.style.background = docColour[d]; sp.appendChild(sw); sp.appendChild(document.createTextNode(" " + d)); lg.appendChild(sp); });
      host.appendChild(lg);
    }

    var wrap = el("div", "nb-tablewrap"), tbl = el("table", "nb-table"), thd = el("thead"), htr = el("tr");
    ["Out", "Route", "Destination", "Dwell", "Return", "Status", "Traveller", "Document"].forEach(function(h){ htr.appendChild(el("th", null, h)); });
    thd.appendChild(htr); tbl.appendChild(thd); var tb = el("tbody");
    tl.forEach(function(tr){
      var r = el("tr"); function td(v){ var d = el("td"); if (v != null) d.textContent = v; r.appendChild(d); return d; }
      td(tr.out.date); td(tr.out.fromCode + " → " + tr.out.toCode);
      var dd = el("td"); var df = flagImg(tr.out.to); if (df) dd.appendChild(df); dd.appendChild(document.createTextNode((df ? " " : "") + (tr.destination || ""))); r.appendChild(dd);
      td(tr.dwellDays != null ? (tr.dwellDays + "d") : "—"); td(tr.ret ? tr.ret.date : "—");
      var st = el("td"); var b = el("span", "nb-bd " + (tr.aborted ? "nb-badge-n" : "nb-badge-b")); b.textContent = tr.aborted ? "No-show" : "Travelled"; st.appendChild(b); r.appendChild(st);
      td(tr.person); td((recs[tr.out.idx] && recs[tr.out.idx].doc) || "");
      tb.appendChild(r);
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); host.appendChild(wrap);
  }

  function injectStyle(){
    if (!doc || doc.getElementById("nb-style")) return;
    var css = [
      ".nb-panel{display:flex;flex-direction:column;height:100%;color:var(--text);font:var(--fs-sm)/1.45 var(--sans);background:transparent}",
      ".nb-head{display:flex;gap:12px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)}.nb-title{font-weight:600}.nb-meta{color:var(--faint);font-size:var(--fs-xs)}",
      ".nb-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line)}.nb-spacer{flex:1}",
      ".nb-btn{background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:6px 12px;cursor:pointer;font:inherit}.nb-btn:hover{border-color:var(--accent-dim)}.nb-btn-go{border-color:var(--accent);color:var(--accent)}",
      ".nb-flight{width:140px;background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:var(--radius);padding:6px 8px;font:inherit}",
      ".nb-flightout{font-size:var(--fs-xs);color:var(--dim)}.nb-flightout.nb-ok{color:var(--ok,#7ac77a)}.nb-flightout.nb-warn{color:var(--warn,#e8a13a)}",
      ".nb-input{margin:10px 14px 0;min-height:60px;resize:vertical;background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:var(--radius);padding:8px 10px;font:var(--fs-xs)/1.4 var(--mono)}",
      ".nb-tabs{display:flex;gap:4px;padding:8px 14px 0}.nb-tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--faint);padding:7px 12px;cursor:pointer;font:inherit}.nb-tab:hover{color:var(--dim)}.nb-tab-on{color:var(--accent);border-bottom-color:var(--accent)}",
      ".nb-body{flex:1;min-height:0;position:relative}",
      ".nb-pane{position:absolute;inset:0;overflow:auto;padding:12px 14px}.nb-pane#nb-pane-map{padding:0}.nb-hidden{display:none}",
      ".nb-empty{color:var(--faint);padding:22px;text-align:center}",
      ".nb-map{position:absolute;inset:0;background:var(--bg,#0a0f18)}.nb-map-offline{background:var(--bg,#0a0f18)}",
      ".nb-apin{background:none;border:none}.nb-apin img{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}",
      ".nb-legend{position:absolute;left:12px;bottom:12px;z-index:500;display:flex;gap:12px;background:rgba(10,15,24,.82);border:1px solid var(--line);border-radius:var(--radius);padding:6px 10px;font-size:var(--fs-2xs);color:var(--dim)}",
      ".nb-legend span{display:flex;align-items:center;gap:5px}.nb-l{width:14px;height:0;border-top:2px solid #888;display:inline-block}.nb-l-b{border-top-color:#5fbf7f}.nb-l-n{border-top:2px dashed #e8a13a}.nb-l-a{border:none;width:9px;height:9px;border-radius:50%;background:#8ea2ff}",
      ".nb-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.nb-chip{font-size:var(--fs-2xs);color:var(--dim);border:1px solid var(--line);border-radius:20px;padding:3px 9px}.nb-chip-ok{color:var(--ok,#7ac77a);border-color:var(--ok,#7ac77a)}.nb-chip-warn{color:var(--warn,#e8a13a);border-color:var(--warn,#e8a13a)}",
      ".nb-table{border-collapse:collapse;width:100%;font-size:var(--fs-xs)}.nb-table th,.nb-table td{border:1px solid var(--line);padding:5px 8px;text-align:left;white-space:nowrap}.nb-table th{position:sticky;top:0;background:var(--panel-2);color:var(--dim)}.nb-mono{font-family:var(--mono)}.nb-dim{color:var(--faint)}",
      ".nb-bd{font-size:var(--fs-2xs);font-weight:700;border-radius:4px;padding:1px 7px}.nb-badge-b{background:rgba(95,191,127,.16);color:#5fbf7f}.nb-badge-n{background:rgba(232,161,58,.16);color:#e8a13a}.nb-badge-u{background:rgba(160,160,160,.14);color:var(--faint)}",
      ".nb-note{color:var(--faint);font-size:var(--fs-xs);margin-bottom:10px}",
      ".nb-sum{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px}.nb-stat{font-size:var(--fs-xs);color:var(--faint)}.nb-stat b{color:var(--text);font-size:var(--fs-md)}",
      ".nb-track{position:relative;height:158px;background:var(--panel-2);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:8px;overflow:hidden}",
      ".nb-grid{position:absolute;top:0;bottom:24px;width:1px;background:rgba(142,162,255,.12)}.nb-mon{position:absolute;bottom:5px;transform:translateX(3px);font-size:var(--fs-2xs);color:var(--faint)}",
      ".nb-base{position:absolute;left:0;right:0;top:76px;height:2px;background:var(--line)}",
      ".nb-trip{position:absolute;top:0;bottom:24px;width:0}.nb-tdot{position:absolute;top:72px;left:-5px;width:10px;height:10px;border-radius:50%;background:#5fbf7f;border:2px solid var(--panel-2);z-index:2}.nb-tdot-ab{background:#e8a13a}",
      ".nb-tstem{position:absolute;left:-1px;width:2px;background:var(--line)}.nb-trip-hi .nb-tstem{top:44px;height:33px}.nb-trip-lo .nb-tstem{top:77px;height:33px}",
      ".nb-tchip{position:absolute;left:-5px;min-width:92px;background:var(--panel-3,#141d2b);border:1px solid var(--line);border-left:3px solid #8ea2ff;border-radius:6px;padding:3px 7px;z-index:3;white-space:nowrap}.nb-trip-hi .nb-tchip{top:6px}.nb-trip-lo .nb-tchip{top:98px}.nb-tchip-ab{border-color:#e8a13a}",
      ".nb-troute{display:flex;align-items:center;gap:3px;font-size:var(--fs-xs);color:var(--text);font-family:var(--mono)}.nb-tcode{font-weight:600}.nb-tarr{color:var(--faint)}.nb-tsub{font-size:var(--fs-2xs);color:var(--dim);margin-top:1px}",
      ".nb-flag{width:18px;height:12px;border-radius:2px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.35)}",
      ".nb-doclegend{display:flex;gap:12px;flex-wrap:wrap;font-size:var(--fs-2xs);color:var(--dim);margin:4px 0 10px}.nb-docsw{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle}",
      ".nb-tablewrap{overflow:auto}",
      ".nb-person{border:1px solid var(--line);border-radius:var(--radius);padding:9px 11px;margin-bottom:8px;background:var(--panel-2)}.nb-person-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.nb-person-name{font-weight:600;font-family:var(--mono)}",
      ".nb-person-attrs{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.nb-tag{font-size:var(--fs-2xs);color:var(--dim);border:1px solid var(--line);border-radius:20px;padding:2px 8px}.nb-tag-doc{color:var(--accent);border-color:var(--accent-dim);font-family:var(--mono)}.nb-chip-warn{color:var(--warn,#e8a13a)}",
      ".nb-h{margin:14px 0 8px;font-size:var(--fs-sm);color:var(--dim);font-weight:600}",
      ".nb-cand{display:flex;gap:8px;align-items:center;font-size:var(--fs-xs);margin-bottom:5px}.nb-cand-t{color:var(--dim)}.nb-arrow{color:var(--faint)}",
      ".nb-badge{font-size:var(--fs-2xs);font-weight:700;border-radius:4px;padding:1px 6px}.nb-badge-med{background:rgba(232,161,58,.16);color:#e8a13a}.nb-badge-low{background:rgba(160,160,160,.14);color:var(--faint)}.nb-badge-high{background:rgba(95,191,127,.16);color:#5fbf7f}"
    ].join("\n");
    var st = el("style"); st.id = "nb-style"; st.textContent = css; doc.head.appendChild(st);
  }

  var api = { mount: mount, _loadSample: function(){ return SAMPLE; }, _analyse: analyse, _resolveText: function(t){ var ta = doc && doc.getElementById("nb-input"); if (ta) ta.value = t; analyse(); }, _state: state };
  if (typeof window !== "undefined") window.RegistryNbtcView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
