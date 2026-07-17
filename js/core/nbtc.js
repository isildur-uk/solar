/* nbtc.js — NBTC / border passenger result parsing + identity resolution.
 *
 * Turns a pasted passenger table (name, gender, DOB, nationality, travel document,
 * and optional flight/route) into normalised records, then clusters them into
 * resolved people (the "GUBBINS problem"): same travel document = same person;
 * same surname + DOB + gender + compatible forename = same person; fuzzy surname
 * or a DOB day/month swap = a SUGGESTED candidate (never auto-merged). Optionally
 * decodes flight designators to airlines and airport codes to lat/long via the
 * vendored aviation reference, so border movement plots on the shared map/timeline.
 *
 * Browser: window.CRNbtc. Node: module.exports. Dual export. British English. */
(function (root) {
  "use strict";
  var SC = (typeof window !== "undefined" && window.SolarCase) || (typeof require === "function" ? safe(function(){return require("./solar-case.js");}) : null);
  var AV = (typeof window !== "undefined" && window.CRAviation) || (typeof require === "function" ? safe(function(){return require("./aviation-ref.js");}) : null);
  function safe(f){ try { return f(); } catch (e) { return null; } }

  function s(x){ return x == null ? "" : String(x); }
  function norm(x){ return s(x).toLowerCase().replace(/\s+/g, " ").replace(/^ | $/g, ""); }
  function alpha(x){ return s(x).toUpperCase().replace(/[^A-Z]/g, ""); }
  function pad(n){ return (n < 10 ? "0" : "") + n; }

  /* "GUBBINS, DEAN ROGER" | "DEAN GUBBINS" -> {surname, forenames[], forename, full} */
  function parseName(raw){
    var t = s(raw).replace(/\s+/g, " ").trim(), surname = "", fore = "";
    if (t.indexOf(",") !== -1){ var p = t.split(","); surname = p[0].trim(); fore = p.slice(1).join(" ").trim(); }
    else { var tk = t.split(" "); surname = tk.length > 1 ? tk[tk.length - 1] : t; fore = tk.slice(0, -1).join(" "); }
    var forenames = fore ? fore.split(" ").filter(Boolean) : [];
    return { surname: surname, forenames: forenames, forename: forenames[0] || "", full: t };
  }

  /* "01/02/2000" -> {iso, d, mo, y, ambiguous, raw}. Ambiguous = day & month both <=12 and differ. */
  function parseDob(raw){
    var m = s(raw).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return { iso: "", raw: s(raw), ambiguous: false };
    var d = +m[1], mo = +m[2], y = +m[3]; if (y < 100) y += 2000;
    return { iso: y + "-" + pad(mo) + "-" + pad(d), d: d, mo: mo, y: y,
             ambiguous: d <= 12 && mo <= 12 && d !== mo, raw: s(raw) };
  }

  /* "575555555 (GBR)" -> {number, state}. */
  function parseDoc(raw){
    var t = s(raw).trim(); if (!t) return null;
    var m = t.match(/^\s*([A-Za-z0-9]+)\s*\(\s*([A-Za-z]{2,3})\s*\)/);
    if (m) return { number: m[1].toUpperCase(), state: m[2].toUpperCase() };
    var m2 = t.match(/[A-Za-z0-9]{3,}/); return m2 ? { number: m2[0].toUpperCase(), state: "" } : null;
  }

  /* Levenshtein similarity 0..1 on the alpha form (for surname fuzzy match). */
  function lev(a, b){
    var m = a.length, n = b.length, i, j, prev = [], cur = [];
    if (!m) return n; if (!n) return m;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++){ cur[0] = i;
      for (j = 1; j <= n; j++){ var c = a.charAt(i-1) === b.charAt(j-1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + c); }
      prev = cur.slice(); }
    return prev[n];
  }
  function sim(a, b){ a = alpha(a); b = alpha(b); if (!a && !b) return 1; if (!a || !b) return 0;
    return 1 - lev(a, b) / Math.max(a.length, b.length); }

  /* forename token sets compatible if one is a prefix of the other (DEAN vs DEAN ROGER). */
  function foreCompat(A, B){
    A = (A || []).map(alpha).filter(Boolean); B = (B || []).map(alpha).filter(Boolean);
    if (!A.length || !B.length) return true;
    var n = Math.min(A.length, B.length);
    for (var k = 0; k < n; k++) if (A[k] !== B[k]) return false;
    return true;
  }
  function dobSwap(x, y){ return x && y && x.iso && y.iso && x.y === y.y && x.d === y.mo && x.mo === y.d && x.d !== x.mo; }

  var HEAD = {
    name: ["passenger name", "name", "full name", "traveller"],
    gender: ["gender", "sex"],
    dob: ["date of birth", "dob", "d.o.b", "birth"],
    nationality: ["nationality", "nat", "citizenship"],
    doc: ["travel doc", "travel document", "document", "passport", "doc"],
    flight: ["flight", "flight no", "flight number"],
    from: ["from", "departure", "origin", "dep"],
    to: ["to", "arrival", "destination", "arr"],
    date: ["travel date", "date", "flight date"],
    status: ["status", "boarded", "boarding", "ci dc", "check in status", "board status"]
  };
  function splitLine(line){ return line.indexOf("\t") !== -1 ? line.split("\t") : line.split(","); }
  function mapHeader(cells){
    var map = {}, i, key;
    for (i = 0; i < cells.length; i++){ var h = norm(cells[i]).replace(/\(.*?\)/g, "").trim();
      for (key in HEAD){ if (HEAD[key].indexOf(h) !== -1 || (h && HEAD[key].some(function(x){ return h.indexOf(x) === 0; }))){ if (map[key] == null) map[key] = i; break; } } }
    return map;
  }

  /* Parse pasted tabular text -> [{name,gender,dob,nationality,doc,flight,from,to,date}]. */
  function parse(text){
    var lines = s(text).split(/\r?\n/).map(function(l){ return l.replace(/\s+$/,""); }).filter(function(l){ return l.trim() !== ""; });
    if (!lines.length) return [];
    var headIdx = -1, map = null;
    for (var r = 0; r < lines.length; r++){ var cells = splitLine(lines[r]), joined = norm(cells.join(" "));
      if (joined.indexOf("name") !== -1 && (joined.indexOf("dob") !== -1 || joined.indexOf("birth") !== -1)){ headIdx = r; map = mapHeader(cells); break; } }
    if (headIdx === -1){ map = { name: 0, gender: 1, dob: 2, nationality: 3, doc: 4 }; headIdx = -1; }
    var out = [];
    for (var i = headIdx + 1; i < lines.length; i++){
      var c = splitLine(lines[i]); if (c.every(function(x){ return s(x).trim() === ""; })) continue;
      function g(k){ return map[k] != null && c[map[k]] != null ? s(c[map[k]]).trim() : ""; }
      var rec = { name: g("name"), gender: g("gender"), dob: g("dob"), nationality: g("nationality"),
                  doc: g("doc"), flight: g("flight"), from: g("from"), to: g("to"), date: g("date"), status: g("status") };
      if (!rec.name && !rec.dob) continue;
      out.push(rec);
    }
    return out;
  }

  function annotate(records){
    return (records || []).map(function(r, i){
      var nm = parseName(r.name), db = parseDob(r.dob), doc = parseDoc(r.doc);
      return { i: i, raw: r, name: nm, dob: db, surname: nm.surname, foren: nm.forenames,
               gender: alpha(r.gender).slice(0, 1), nat: alpha(r.nationality).slice(0, 3),
               doc: doc, docKey: doc ? (doc.number + "|" + doc.state) : "" };
    });
  }

  /* Resolve records into clusters (strong merges) + cross-cluster candidates (suggested). */
  function resolve(records){
    var recs = annotate(records), n = recs.length;
    var parent = recs.map(function(_, i){ return i; });
    function find(x){ while (parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b){ parent[find(a)] = find(b); }
    var a, b;
    for (a = 0; a < n; a++) for (b = a + 1; b < n; b++){
      var X = recs[a], Y = recs[b];
      if (X.docKey && X.docKey === Y.docKey){ union(a, b); continue; }              // same document = same person
      if (alpha(X.surname) === alpha(Y.surname) && X.dob.iso && X.dob.iso === Y.dob.iso &&
          X.gender === Y.gender && foreCompat(X.foren, Y.foren)) union(a, b);        // name+dob+gender+forename
    }
    var byRoot = {}; recs.forEach(function(r, i){ var k = find(i); (byRoot[k] = byRoot[k] || []).push(i); });
    var clusters = Object.keys(byRoot).map(function(k, ci){
      var members = byRoot[k].map(function(i){ return recs[i]; });
      var rep = members.slice().sort(function(p, q){ return (q.foren.length - p.foren.length) || (q.dob.iso ? 1 : 0) - (p.dob.iso ? 1 : 0); })[0];
      var docs = {}, nats = {}, ambiguous = false;
      members.forEach(function(m){ if (m.docKey) docs[m.docKey] = m.doc; if (m.nat) nats[m.nat] = 1; if (m.dob.ambiguous) ambiguous = true; });
      return { id: ci, root: k, members: members.map(function(m){ return m.i; }),
               surname: rep.surname, forenames: rep.foren, forename: rep.forename,
               dobISO: rep.dob.iso, gender: rep.gender,
               nationalities: Object.keys(nats), documents: Object.keys(docs).map(function(d){ return docs[d]; }),
               ambiguousDob: ambiguous, size: members.length,
               label: (rep.surname ? rep.surname.toUpperCase() : "?") + (rep.foren.length ? ", " + rep.foren.join(" ") : "") +
                      (rep.dob.iso ? " (" + rep.dob.iso + ")" : "") };
    });
    // cross-cluster suggestions (never auto-merged)
    var candidates = [];
    for (a = 0; a < clusters.length; a++) for (b = a + 1; b < clusters.length; b++){
      var C = clusters[a], D = clusters[b];
      var reps = recFor(recs, C.members[0]) , repd = recFor(recs, D.members[0]);
      var sSim = sim(C.surname, D.surname), fc = foreCompat(C.forenames, D.forenames);
      var reason = null, conf = null;
      if (C.dobISO && C.dobISO === D.dobISO && C.gender === D.gender && sSim >= 0.85 && sSim < 1 && fc){ reason = "fuzzy surname (" + Math.round(sSim*100) + "%)"; conf = "med"; }
      else if (alpha(C.surname) === alpha(D.surname) && fc && dobSwap(reps.dob, repd.dob)){ reason = "DOB day/month swap"; conf = "med"; }
      else if (alpha(C.surname) === alpha(D.surname) && fc && C.dobISO === D.dobISO && C.gender !== D.gender){ reason = "same name/DOB, gender differs"; conf = "low"; }
      if (reason) candidates.push({ a: C.id, b: D.id, reason: reason, confidence: conf,
        labels: [C.label, D.label] });
    }
    return { clusters: clusters, candidates: candidates, records: recs };
  }
  function recFor(recs, idx){ for (var i = 0; i < recs.length; i++) if (recs[i].i === idx) return recs[i]; return recs[0]; }

  /* Decode a record's travel fields via the aviation reference (if present). */
  function decodeTravel(rec){
    if (!AV) return null; var r = rec.raw || rec, out = {};
    if (r.flight) out.airline = AV.airlineFromFlight(r.flight);
    if (r.from) out.from = AV.airport(r.from);
    if (r.to) out.to = AV.airport(r.to);
    return (out.airline || out.from || out.to) ? out : null;
  }

  /* Resolved clusters -> shared-spine parts (person + official_document + airports). */
  function toCase(result){
    var ents = {}, links = {};
    function eid(e){ return SC && SC.entityId ? SC.entityId(e) : ("E:" + norm(e.type) + "|" + norm(e.identity || e.label)); }
    function putE(e){ var id = eid(e); if (!ents[id]) ents[id] = { id: id, type: e.type, label: e.label, identity: e.identity || e.label, attrs: e.attrs || {}, source: "NBTC" }; return id; }
    function putL(from, to, type, label){ if (!from || !to || from === to) return; var id = "L:" + from + "|" + type.toLowerCase() + "|" + to; if (!links[id]) links[id] = { id: id, from: from, to: to, type: type, label: label || "", source: "NBTC" }; }
    (result.clusters || []).forEach(function(c){
      var identity = c.documents[0] ? (c.documents[0].number + "|" + c.documents[0].state) : (alpha(c.surname) + "|" + c.dobISO);
      var pid = putE({ type: "person", label: c.label, identity: "NBTC:" + identity,
        attrs: { surname: c.surname, forenames: c.forenames.join(" "), dob: c.dobISO, gender: c.gender,
                 nationality: c.nationalities.join(", ") } });
      c.documents.forEach(function(d){ var did = putE({ type: "official_document", label: d.number + " (" + d.state + ")",
        identity: d.number + "|" + d.state, attrs: { docType: "passport", docNumber: d.number, issuingState: d.state } });
        putL(pid, did, "DOCUMENT_OWNERSHIP", "holds"); });
      (c.travel || []).forEach(function(t){ if (t && t.iata){ var aid = putE({ type: "location", label: t.name || t.iata,
        identity: "AIRPORT:" + t.iata, attrs: { iata: t.iata, lat: t.lat, lon: t.lon, kind: "airport" } });
        putL(pid, aid, "TRAVELLED_TO", t.iata); } });
    });
    return { entities: Object.keys(ents).map(function(k){ return ents[k]; }), links: Object.keys(links).map(function(k){ return links[k]; }) };
  }

  /* CI = check-in only (did NOT board); DC = departure confirmed (boarded); P = booked. */
  function boardedFromStatus(raw){
    var s = String(raw == null ? "" : raw).toUpperCase();
    if (/\bDC\b|DEPARTURE CONFIRMED|BOARDED|DEPARTED|FLEW|FLOWN/.test(s)) return true;
    if (/\bCI\b|CHECK.?IN ONLY|NO.?SHOW|NOT BOARDED|OFFLOADED/.test(s)) return false;
    return null;
  }
  function dkey(raw){ var m = String(raw || "").match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (!m) return 0; var y = +m[3]; if (y < 100) y += 2000; return y * 10000 + (+m[2]) * 100 + (+m[1]); }

  /* Build flight legs from records: decoded airline + airport coords + boarded status. */
  function journeys(records){
    var legs = [], airlines = {}, airports = {}, countries = {}, boarded = 0, notBoarded = 0, unknown = 0;
    (records || []).forEach(function(r, i){
      var r0 = r.raw ? r.raw : r;
      if (!r0.flight && !r0.from && !r0.to) return;
      var air = (r0.flight && AV) ? AV.airlineFromFlight(r0.flight) : null;
      var fa = (r0.from && AV) ? AV.airport(r0.from) : null;
      var ta = (r0.to && AV) ? AV.airport(r0.to) : null;
      var b = boardedFromStatus(r0.status);
      if (b === true) boarded++; else if (b === false) notBoarded++; else unknown++;
      if (air && air.airline) airlines[air.airline.name] = true;
      [fa, ta].forEach(function(a){ if (a){ airports[a.iata] = a; if (a.country) countries[a.country] = true; } });
      legs.push({ idx: i, name: r0.name || "", flight: r0.flight || "", date: r0.date || "",
        airline: air && air.airline ? air.airline : null, airlineCode: air ? air.code : "",
        from: fa, to: ta, fromCode: (r0.from || "").toUpperCase(), toCode: (r0.to || "").toUpperCase(),
        boarded: b, status: r0.status || "" });
    });
    legs.sort(function(a, b){ return dkey(a.date) - dkey(b.date); });
    return { legs: legs, airlines: Object.keys(airlines), airports: airports,
      countries: Object.keys(countries), boarded: boarded, notBoarded: notBoarded, unknown: unknown };
  }

  root.CRNbtc = { parse: parse, annotate: annotate, resolve: resolve, toCase: toCase,
    journeys: journeys, boardedFromStatus: boardedFromStatus,
    decodeTravel: decodeTravel, parseName: parseName, parseDob: parseDob, parseDoc: parseDoc, sim: sim };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CRNbtc;
})(typeof window !== "undefined" ? window : this);
