/* comms-contacts.js — Contact Significance for comms (CDR/ADM) analysis.
 *
 * Ranks a target's counterparties by ANALYTICAL significance, not raw call count:
 * reciprocity (one-way tasking vs dialogue), call-duration mass, temporal breadth
 * (active days), tempo, and number lifecycle (first/last seen, new/dropped). Also
 * classifies the RELATIONSHIP: voice vs SMS-only, and covert signalling
 * (unanswered / one-ring) using ring time. Pure module — no DOM.
 *
 * Browser: window.CRCommsContacts. Node: module.exports. British English.
 */
(function (root) {
  "use strict";
  function s(x){ return x == null ? "" : String(x); }
  function digits(x){ return s(x).replace(/\D/g, ""); }
  function hmsToSec(x){ var m = s(x).match(/(\d+):(\d+):(\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; }
  function num(x){ var n = parseFloat(s(x).replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : 0; }

  var DAY = 86400000;
  function parseDt(str){
    var t = s(str).trim(); if (!t) return NaN;
    var m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m){ var y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    var i = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (i) return Date.UTC(+i[1], +i[2] - 1, +i[3], +(i[4] || 0), +(i[5] || 0), +(i[6] || 0));
    return NaN;
  }
  function isoDay(ms){ if (!isFinite(ms)) return ""; var d = new Date(ms); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); }
  function p2(n){ return (n < 10 ? "0" : "") + n; }
  function isSms(type){ return /sms|text|mms/i.test(s(type)); }
  function isData(type){ return /gprs|data|internet|ip/i.test(s(type)); }

  function direction(ev, target){
    var t = s(ev.type);
    if (/-?MO$|^MOC$|^SMS-?MO$/i.test(t)) return "out";
    if (/-?MT$|^MTC$|^SMS-?MT$/i.test(t)) return "in";
    var a = digits(ev.aParty), b = digits(ev.bParty);
    if (target && a === target) return "out";
    if (target && b === target) return "in";
    return "na";
  }
  function counterparty(ev, target){
    var a = digits(ev.aParty), b = digits(ev.bParty);
    if (target && a === target) return ev.bParty || "";
    if (target && b === target) return ev.aParty || "";
    return ev.bParty || ev.aParty || "";
  }

  /* profile(events, target) -> { contacts:[...sorted by significance], firstISO, lastISO, target } */
  function profile(events, target){
    target = digits(target);
    events = events || [];
    var by = {}, gMin = Infinity, gMax = -Infinity;
    events.forEach(function(ev){
      if (isData(ev.type)) return;                       // data sessions aren't contacts
      var cp = counterparty(ev, target); var key = digits(cp);
      if (!key || (target && key === target)) return;    // skip self / empty
      var c = by[key] || (by[key] = { number: cp, key: key, events: 0, voice: 0, sms: 0,
        outCount: 0, inCount: 0, totalDurSec: 0, maxDurSec: 0, days: {}, firstMs: Infinity, lastMs: -Infinity,
        unanswered: 0, oneRing: 0 });
      c.events++;
      var dir = direction(ev, target); if (dir === "out") c.outCount++; else if (dir === "in") c.inCount++;
      var sms = isSms(ev.type); if (sms) c.sms++; else c.voice++;
      var dur = hmsToSec(ev.durationHms), ring = num(ev.ringSecs);
      c.totalDurSec += dur; if (dur > c.maxDurSec) c.maxDurSec = dur;
      if (!sms && dur === 0 && ring > 0){ c.unanswered++; if (ring <= 3) c.oneRing++; }
      var ms = parseDt(ev.startDt);
      if (isFinite(ms)){ c.days[isoDay(ms)] = 1; if (ms < c.firstMs) c.firstMs = ms; if (ms > c.lastMs) c.lastMs = ms;
        if (ms < gMin) gMin = ms; if (ms > gMax) gMax = ms; }
    });
    var list = Object.keys(by).map(function(k){
      var c = by[k];
      var activeDays = Object.keys(c.days).length;
      var mx = Math.max(c.outCount, c.inCount), mn = Math.min(c.outCount, c.inCount);
      c.reciprocity = mx > 0 ? Math.round((mn / mx) * 100) / 100 : 0;
      c.activeDays = activeDays;
      c.meanDurSec = c.voice > 0 ? Math.round(c.totalDurSec / c.voice) : 0;
      c.firstISO = isFinite(c.firstMs) ? isoDay(c.firstMs) : "";
      c.lastISO = isFinite(c.lastMs) ? isoDay(c.lastMs) : "";
      c.spanDays = (isFinite(c.firstMs) && isFinite(c.lastMs)) ? Math.round((c.lastMs - c.firstMs) / DAY) + 1 : 0;
      c.tempo = activeDays > 0 ? Math.round((c.events / activeDays) * 10) / 10 : 0;
      c.smsOnly = c.sms > 0 && c.voice === 0;
      c.signalling = (c.unanswered + c.oneRing) > 0 && (c.unanswered + c.oneRing) >= c.voice; // mostly ring/no-answer
      delete c.days; delete c.firstMs; delete c.lastMs;
      return c;
    });
    // composite, explainable significance: breadth + duration mass + volume + reciprocity
    var raw = list.map(function(c){ return c.activeDays * 2 + Math.log(1 + c.totalDurSec) * 3 + Math.log(1 + c.events) + c.reciprocity * 2; });
    var max = Math.max.apply(null, raw.concat([1]));
    list.forEach(function(c, i){ c.score = Math.round((raw[i] / max) * 100); });
    list.sort(function(a, b){ return b.score - a.score || b.totalDurSec - a.totalDurSec; });

    // lifecycle: flag new (first-seen in last third of window) / dropped (last-seen in first third)
    if (isFinite(gMin) && isFinite(gMax) && gMax > gMin){
      var t1 = gMin + (gMax - gMin) / 3, t2 = gMax - (gMax - gMin) / 3;
      list.forEach(function(c){
        var f = parseDt(c.firstISO), l = parseDt(c.lastISO);
        c.isNew = isFinite(f) && f >= t2;         // first appeared late
        c.isDropped = isFinite(l) && l <= t1;     // last seen early
      });
    }
    return { contacts: list, firstISO: isFinite(gMin) ? isoDay(gMin) : "", lastISO: isFinite(gMax) ? isoDay(gMax) : "", target: target };
  }

  root.CRCommsContacts = { profile: profile, _parseDt: parseDt, _direction: direction };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CRCommsContacts;
})(typeof window !== "undefined" ? window : this);
