/* nbtc-view.js — Analyse tool: NBTC / border passenger result.
 * Paste a passenger table -> normalise -> resolve identities (the GUBBINS problem)
 * -> resolved people + review candidates, with flight/airport decode via the
 * vendored aviation reference, and "Add to case" onto the shared SOLAR spine.
 * window.RegistryNbtcView + module.exports. Reuses shell/analyse CSS tokens. */
(function () {
  "use strict";
  var doc = (typeof document !== "undefined") ? document : null;
  var N = (typeof window !== "undefined" && window.CRNbtc) || null;
  var AV = (typeof window !== "undefined" && window.CRAviation) || null;
  var SC = (typeof window !== "undefined" && window.SolarCase) || null;

  var SAMPLE = [
    "Passenger name\tGender\tDate of birth\tNationality\tTravel Doc",
    "GUBBINS, DEAN\tM\t01/02/2000\tGBR\t575555555 (GBR)",
    "GUBBINS, DEAN\tM\t01/01/2000\tGBR\t574444444 (GBR)",
    "GUBBINS, DEAN\tM\t02/01/2000\tGBR\t677777777 (FRA)",
    "GUBBINS, DEAN ROGER\tM\t01/01/2000\tGBR\t574444444 (GBR)",
    "GUBBINS, DEAN\tM\t01/01/2000\tGBR\t575555555 (GBR)",
    "GUBINS, DEAN\tM\t01/01/2000\tGBR\t122222222 (USA)",
    "GUBBINS, DEAN P\tM\t01/01/2000\tGBR\t",
    "GUBINS, DEAN\tM\t01/01/2000\tUSA\t",
    "GUBBINS, DEAN\tM\t02/01/2000\tFRA\t",
    "GUBBINS, DEAN PR\tF\t02/01/2000\tGBR\t",
    "GUBBINS, DEAN PETER ROGER\tM\t01/01/2000\tGBR\t",
    "GUBBINS, DEAN ROGER\tM\t01/01/2000\tGBR\t"
  ].join("\n");

  var state = { res: null };

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]; }); }
  function el(tag, cls, text){ var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function badge(conf){ var b = el("span", "nb-badge nb-badge-" + (conf || "high")); b.textContent = (conf || "high").toUpperCase(); return b; }

  function mount(host){
    if (!doc || !host) return;
    injectStyle();
    host.innerHTML = "";
    var panel = el("div", "nb-panel");
    var head = el("div", "nb-head");
    head.appendChild(el("span", "nb-title", "Border / NBTC — passenger resolution"));
    var meta = el("span", "nb-meta"); meta.id = "nb-meta"; head.appendChild(meta);
    panel.appendChild(head);

    var bar = el("div", "nb-bar");
    var bSample = el("button", "nb-btn", "Load sample"); bSample.type = "button"; bSample.onclick = function(){ ta.value = SAMPLE; run(); };
    var bRun = el("button", "nb-btn nb-btn-go", "Resolve"); bRun.type = "button"; bRun.onclick = run;
    var bCase = el("button", "nb-btn", "Add to case"); bCase.type = "button"; bCase.id = "nb-addcase"; bCase.onclick = addToCase;
    bar.appendChild(bSample); bar.appendChild(bRun); bar.appendChild(bCase);
    var fspacer = el("span", "nb-spacer"); bar.appendChild(fspacer);
    // flight lookup mini-tool (demonstrates the aviation reference)
    var fl = el("input", "nb-flight"); fl.type = "text"; fl.placeholder = "flight e.g. BA286"; fl.id = "nb-flight";
    var bFl = el("button", "nb-btn", "Look up"); bFl.type = "button"; bFl.onclick = lookupFlight;
    fl.addEventListener("keydown", function(e){ if (e.key === "Enter") lookupFlight(); });
    bar.appendChild(fl); bar.appendChild(bFl);
    var flOut = el("span", "nb-flightout"); flOut.id = "nb-flightout"; bar.appendChild(flOut);
    panel.appendChild(bar);

    var ta = el("textarea", "nb-input"); ta.id = "nb-input";
    ta.placeholder = "Paste an NBTC passenger table (tab- or comma-separated). Columns: Passenger name, Gender, Date of birth, Nationality, Travel Doc [, Flight, From, To].";
    panel.appendChild(ta);

    var body = el("div", "nb-body"); body.id = "nb-body";
    body.appendChild(el("div", "nb-empty", "Load the sample or paste a passenger table, then Resolve."));
    panel.appendChild(body);
    host.appendChild(panel);

    function run(){ resolveText(ta.value); }
  }

  function lookupFlight(){
    var out = doc.getElementById("nb-flightout"), inp = doc.getElementById("nb-flight");
    if (!out || !inp) return;
    out.textContent = ""; out.className = "nb-flightout";
    var v = inp.value.trim(); if (!v) return;
    if (!AV){ out.textContent = "aviation reference unavailable"; return; }
    var r = AV.airlineFromFlight(v);
    if (r && r.airline){ out.innerHTML = "<b>" + esc(r.airline.name) + "</b> (" + esc(r.code) + ") · flight " + esc(r.flightNumber) + (r.airline.callsign ? " · " + esc(r.airline.callsign) : ""); out.className = "nb-flightout nb-ok"; }
    else if (r){ out.textContent = "unknown carrier for code " + r.code; out.className = "nb-flightout nb-warn"; }
    else { out.textContent = "not a flight designator"; out.className = "nb-flightout nb-warn"; }
  }

  function resolveText(text){
    var body = doc.getElementById("nb-body"), meta = doc.getElementById("nb-meta");
    if (!body) return;
    if (!N){ body.innerHTML = ""; body.appendChild(el("div", "nb-empty", "NBTC engine unavailable.")); return; }
    var recs = N.parse(text || "");
    if (!recs.length){ body.innerHTML = ""; body.appendChild(el("div", "nb-empty", "No passenger rows found. Check the columns.")); state.res = null; if (meta) meta.textContent = ""; return; }
    // decode travel per record (if flight/route columns present)
    recs.forEach(function(r){ r._travel = N.decodeTravel({ raw: r }); });
    var res = N.resolve(recs);
    // attach any decoded airports to their clusters for the spine
    res.clusters.forEach(function(c){ c.travel = []; c.members.forEach(function(i){ var t = recs[i] && recs[i]._travel; if (t){ if (t.from) c.travel.push(t.from); if (t.to) c.travel.push(t.to); } }); });
    state.res = res;
    render(res, recs);
    if (meta) meta.textContent = recs.length + " rows · " + res.clusters.length + " resolved · " + res.candidates.length + " to review";
  }

  function render(res, recs){
    var body = doc.getElementById("nb-body"); body.innerHTML = "";
    // resolved people
    body.appendChild(sectionH("Resolved people (" + res.clusters.length + ")"));
    res.clusters.slice().sort(function(a,b){ return b.size - a.size; }).forEach(function(c){ body.appendChild(personCard(c, recs)); });
    // candidates for review
    if (res.candidates.length){
      body.appendChild(sectionH("Candidates for review (" + res.candidates.length + ") — analyst confirms, never auto-merged"));
      var list = el("div", "nb-cands");
      res.candidates.forEach(function(cand){
        var row = el("div", "nb-cand");
        row.appendChild(badge(cand.confidence));
        var t = el("span", "nb-cand-t"); t.innerHTML = esc(cand.labels[0]) + " <span class='nb-arrow'>&harr;</span> " + esc(cand.labels[1]) + " — <i>" + esc(cand.reason) + "</i>";
        row.appendChild(t); list.appendChild(row);
      });
      body.appendChild(list);
    }
    // travel (decoded flights/airports, if any)
    var travelRows = recs.filter(function(r){ return r._travel; });
    if (travelRows.length){
      body.appendChild(sectionH("Travel (" + travelRows.length + ")"));
      var tl = el("div", "nb-travel");
      travelRows.forEach(function(r){ var t = r._travel, line = el("div", "nb-tline");
        var bits = [];
        if (t.airline && t.airline.airline) bits.push("<b>" + esc(t.airline.airline.name) + "</b>");
        if (t.from) bits.push(esc(t.from.iata) + " " + esc(t.from.city || t.from.name));
        if (t.to) bits.push("&rarr; " + esc(t.to.iata) + " " + esc(t.to.city || t.to.name));
        line.innerHTML = esc(r.name) + ": " + bits.join(" · ");
        tl.appendChild(line); });
      body.appendChild(tl);
    }
    // raw rows
    body.appendChild(sectionH("All rows (" + recs.length + ")"));
    var tbl = el("table", "nb-table");
    var thead = el("tr"); ["Name","Gender","DOB","Nationality","Travel Doc"].forEach(function(h){ thead.appendChild(el("th", null, h)); });
    var thd = el("thead"); thd.appendChild(thead); tbl.appendChild(thd);
    var tb = el("tbody");
    recs.forEach(function(r){ var tr = el("tr");
      [r.name, r.gender, r.dob, r.nationality, r.doc].forEach(function(v){ tr.appendChild(el("td", null, v || "")); });
      tb.appendChild(tr); });
    tbl.appendChild(tb); body.appendChild(tbl);
  }

  function personCard(c, recs){
    var card = el("div", "nb-person");
    var h = el("div", "nb-person-h");
    var nm = el("span", "nb-person-name"); nm.textContent = c.label || (c.surname || "?"); h.appendChild(nm);
    h.appendChild(badge("high"));
    h.appendChild(el("span", "nb-chip", c.size + (c.size === 1 ? " record" : " records")));
    if (c.ambiguousDob){ var amb = el("span", "nb-chip nb-chip-warn", "ambiguous DOB"); h.appendChild(amb); }
    card.appendChild(h);
    var attrs = el("div", "nb-person-attrs");
    if (c.nationalities.length) attrs.appendChild(el("span", "nb-tag", "nat: " + c.nationalities.join(", ")));
    c.documents.forEach(function(d){ attrs.appendChild(el("span", "nb-tag nb-tag-doc", d.number + " (" + d.state + ")")); });
    card.appendChild(attrs);
    var mem = el("div", "nb-members");
    c.members.forEach(function(i){ var r = recs[i]; if (!r) return; var line = el("div", "nb-member");
      line.textContent = [r.name, r.dob, r.nationality, r.gender, r.doc].filter(Boolean).join("  ·  ");
      mem.appendChild(line); });
    card.appendChild(mem);
    return card;
  }

  function sectionH(t){ return el("div", "nb-h", t); }

  function addToCase(){
    if (!state.res){ flash("Resolve a table first."); return; }
    if (!SC || !N || !N.toCase){ flash("Shared case spine unavailable."); return; }
    var parts = N.toCase(state.res);
    if (!parts.entities.length){ flash("Nothing to add."); return; }
    var st = SC.merge(parts);
    flash("Added " + parts.entities.length + " entities + " + parts.links.length + " links to the shared case (" + st.entities + " total).");
  }
  function flash(msg){ var meta = doc.getElementById("nb-meta"); if (meta){ var old = meta.textContent; meta.textContent = msg; setTimeout(function(){ meta.textContent = old; }, 4000); } }

  function injectStyle(){
    if (!doc || doc.getElementById("nb-style")) return;
    var css = [
      ".nb-panel{display:flex;flex-direction:column;height:100%;color:var(--text);font:var(--fs-sm)/1.45 var(--sans);background:transparent}",
      ".nb-head{display:flex;gap:12px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)}.nb-title{font-weight:600}.nb-meta{color:var(--faint);font-size:var(--fs-xs)}",
      ".nb-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line)}",
      ".nb-spacer{flex:1}",
      ".nb-btn{background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:6px 12px;cursor:pointer;font:inherit}.nb-btn:hover{border-color:var(--accent-dim)}",
      ".nb-btn-go{border-color:var(--accent);color:var(--accent)}",
      ".nb-flight{width:150px;background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:var(--radius);padding:6px 8px;font:inherit}",
      ".nb-flightout{font-size:var(--fs-xs);color:var(--dim)}.nb-flightout.nb-ok{color:var(--ok,#7ac77a)}.nb-flightout.nb-warn{color:var(--warn,#e8a13a)}",
      ".nb-input{margin:10px 14px 0;min-height:74px;resize:vertical;background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:var(--radius);padding:8px 10px;font:var(--fs-xs)/1.4 var(--mono)}",
      ".nb-body{flex:1;min-height:0;overflow:auto;padding:8px 14px 16px}",
      ".nb-empty{color:var(--faint);padding:22px;text-align:center}",
      ".nb-h{margin:16px 0 8px;font-size:var(--fs-sm);color:var(--dim);font-weight:600}.nb-h:first-child{margin-top:2px}",
      ".nb-person{border:1px solid var(--line);border-radius:var(--radius);padding:9px 11px;margin-bottom:8px;background:var(--panel-2)}",
      ".nb-person-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.nb-person-name{font-weight:600;font-family:var(--mono)}",
      ".nb-person-attrs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}",
      ".nb-tag{font-size:var(--fs-2xs);color:var(--dim);border:1px solid var(--line);border-radius:20px;padding:2px 8px}.nb-tag-doc{color:var(--accent);border-color:var(--accent-dim);font-family:var(--mono)}",
      ".nb-chip{font-size:var(--fs-2xs);color:var(--faint);border:1px solid var(--line);border-radius:20px;padding:2px 8px}.nb-chip-warn{color:var(--warn,#e8a13a);border-color:var(--warn,#e8a13a)}",
      ".nb-members{display:flex;flex-direction:column;gap:2px;margin-top:4px}.nb-member{font-size:var(--fs-xs);color:var(--dim);font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".nb-badge{font-size:var(--fs-2xs);font-weight:700;letter-spacing:.06em;border-radius:4px;padding:1px 6px}",
      ".nb-badge-high{background:rgba(122,199,122,.16);color:var(--ok,#7ac77a)}.nb-badge-med{background:rgba(232,161,58,.16);color:var(--warn,#e8a13a)}.nb-badge-low{background:rgba(160,160,160,.14);color:var(--faint)}",
      ".nb-cands{display:flex;flex-direction:column;gap:5px}.nb-cand{display:flex;gap:8px;align-items:center;font-size:var(--fs-xs)}.nb-cand-t{color:var(--dim)}.nb-arrow{color:var(--faint)}",
      ".nb-travel{display:flex;flex-direction:column;gap:3px}.nb-tline{font-size:var(--fs-xs);color:var(--dim)}",
      ".nb-table{border-collapse:collapse;width:100%;font-size:var(--fs-xs);margin-top:4px}.nb-table th,.nb-table td{border:1px solid var(--line);padding:4px 7px;text-align:left;white-space:nowrap}.nb-table th{position:sticky;top:0;background:var(--panel-2);color:var(--dim)}"
    ].join("\n");
    var st = el("style"); st.id = "nb-style"; st.textContent = css; doc.head.appendChild(st);
  }

  var api = { mount: mount, _loadSample: function(){ return SAMPLE; }, _resolveText: resolveText, _state: state };
  if (typeof window !== "undefined") window.RegistryNbtcView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
