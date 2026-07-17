/* comms-attribution.js — handset / SIM attribution for comms analysis.
 *
 * From CDR/ADM events, resolves the IMEI<->IMSI relationship: which SIMs ran in
 * which handset and vice-versa, with per-pairing first/last/count; flags a handset
 * running multiple SIMs (burner rotation) and a SIM moved between handsets; and
 * builds a chronological "swap timeline" of which pairing was active when — the
 * handover moment. Replaces the single SIM-swap boolean with real attribution.
 * Pure module. Browser: window.CRCommsAttribution. Node: module.exports.
 */
(function (root) {
  "use strict";
  function s(x){ return x == null ? "" : String(x); }
  function digits(x){ return s(x).replace(/\D/g, ""); }
  var DAY = 86400000;
  function parseDt(str){
    var t = s(str).trim(); if (!t) return NaN;
    var m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m){ var y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    var i = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (i) return Date.UTC(+i[1], +i[2] - 1, +i[3], +(i[4] || 0), +(i[5] || 0), +(i[6] || 0));
    return NaN;
  }
  function p2(n){ return (n < 10 ? "0" : "") + n; }
  function iso(ms){ if (!isFinite(ms)) return ""; var d = new Date(ms); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); }

  /* analyse(events) -> { pairs, imeis, imsis, timeline, multiSim, movedSim } */
  function analyse(events){
    events = events || [];
    var pairs = {}, imeiMap = {}, imsiMap = {}, seq = [];
    events.forEach(function(ev){
      var imei = digits(ev.imei), imsi = digits(ev.imsi);
      if (!imei && !imsi) return;
      var key = imei + "|" + imsi;
      var ms = parseDt(ev.startDt);
      var pr = pairs[key] || (pairs[key] = { imei: imei, imsi: imsi, count: 0, firstMs: Infinity, lastMs: -Infinity });
      pr.count++; if (isFinite(ms)){ if (ms < pr.firstMs) pr.firstMs = ms; if (ms > pr.lastMs) pr.lastMs = ms; }
      if (imei){ (imeiMap[imei] = imeiMap[imei] || {})[imsi] = (imeiMap[imei][imsi] || 0) + 1; }
      if (imsi){ (imsiMap[imsi] = imsiMap[imsi] || {})[imei] = (imsiMap[imsi][imei] || 0) + 1; }
      if (isFinite(ms) && (imei || imsi)) seq.push({ ms: ms, imei: imei, imsi: imsi });
    });
    var pairList = Object.keys(pairs).map(function(k){ var p = pairs[k];
      return { imei: p.imei, imsi: p.imsi, count: p.count, firstISO: iso(p.firstMs), lastISO: iso(p.lastMs) }; })
      .sort(function(a, b){ return b.count - a.count; });

    var imeis = Object.keys(imeiMap).map(function(imei){ var sims = Object.keys(imeiMap[imei]).filter(Boolean);
      return { imei: imei, imsis: sims, simCount: sims.length, events: sum(imeiMap[imei]) }; })
      .sort(function(a, b){ return b.events - a.events; });
    var imsis = Object.keys(imsiMap).map(function(imsi){ var hs = Object.keys(imsiMap[imsi]).filter(Boolean);
      return { imsi: imsi, imeis: hs, handsetCount: hs.length, events: sum(imsiMap[imsi]) }; })
      .sort(function(a, b){ return b.events - a.events; });

    // swap timeline: order events, record each change of active (imei|imsi) pairing
    seq.sort(function(a, b){ return a.ms - b.ms; });
    var timeline = [], prev = null;
    seq.forEach(function(e){ var k = e.imei + "|" + e.imsi;
      if (k !== prev){ timeline.push({ tISO: iso(e.ms), imei: e.imei, imsi: e.imsi,
        change: prev == null ? "first-seen" : changeKind(prev, k) }); prev = k; } });

    return {
      pairs: pairList, imeis: imeis, imsis: imsis, timeline: timeline,
      multiSim: imeis.filter(function(h){ return h.simCount > 1; }),   // handset ran >1 SIM
      movedSim: imsis.filter(function(x){ return x.handsetCount > 1; }) // SIM moved between handsets
    };
  }
  function sum(o){ var t = 0; for (var k in o) if (o.hasOwnProperty(k)) t += o[k]; return t; }
  function changeKind(prevKey, key){
    var a = prevKey.split("|"), b = key.split("|");
    if (a[0] === b[0] && a[1] !== b[1]) return "SIM swapped (same handset)";
    if (a[1] === b[1] && a[0] !== b[0]) return "SIM moved to new handset";
    return "handset + SIM changed";
  }

  root.CRCommsAttribution = { analyse: analyse };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CRCommsAttribution;
})(typeof window !== "undefined" ? window : this);
