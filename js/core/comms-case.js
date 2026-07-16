/* comms-case.js — turn Analyse (comms/ANPR) results into shared-case entities+links.
 *
 * Bridges the Analyse island into the SolarCase spine so its findings become the
 * SAME chartable, deconflictable entities the other functions use:
 *   target/contacts -> phone entities + COMMUNICATED_WITH links
 *   cells/cameras   -> location entities + LOCATED_IN links
 *   VRMs (ANPR)     -> vehicle entities (+ their location links)
 *   co-locations    -> CO_LOCATED_WITH links between subjects
 * Ids are the SolarCase stable identity ids, so writes dedupe on merge. Link types
 * are CRModel link types so they type correctly on the chart.
 *
 * Browser: window.CRCommsCase. Node: module.exports.
 */
(function () {
  "use strict";
  var SC = (typeof window !== "undefined" && window.SolarCase) || (typeof require === "function" ? require("./solar-case.js") : null);

  function num(x) { return String(x == null ? "" : x).replace(/\s+/g, ""); }
  function inferTarget(events) {
    var c = {}; (events || []).forEach(function (e) { var a = num(e.aParty); if (a) c[a] = (c[a] || 0) + 1; });
    var best = null, bn = -1; Object.keys(c).forEach(function (k) { if (c[k] > bn) { bn = c[k]; best = k; } });
    return best;
  }

  function builder() {
    var ents = {}, links = {};
    function putEnt(spec) {
      var id = SC.entityId(spec);
      if (!ents[id]) { ents[id] = { id: id, type: spec.type, label: spec.label, identity: spec.identity || "", attrs: spec.attrs || {}, source: spec.source || "Analyse" }; }
      else if (spec.attrs) { for (var k in spec.attrs) if (spec.attrs.hasOwnProperty(k) && spec.attrs[k] != null && spec.attrs[k] !== "") ents[id].attrs[k] = spec.attrs[k]; }
      return id;
    }
    function putLink(from, to, type, attrs) {
      if (!from || !to || from === to) return;
      var id = "L:" + from + "|" + type.toLowerCase() + "|" + to;
      if (!links[id]) links[id] = { id: id, from: from, to: to, type: type, dir: "->", attrs: attrs || {}, source: "Analyse" };
      else if (attrs && attrs.count) links[id].attrs.count = (links[id].attrs.count || 0) + attrs.count;
      return id;
    }
    return {
      ents: ents, links: links, putEnt: putEnt, putLink: putLink,
      parts: function () { return { entities: Object.keys(ents).map(function (k) { return ents[k]; }), links: Object.keys(links).map(function (k) { return links[k]; }) }; }
    };
  }

  /* Single CDR/ANPR return -> case parts. */
  function fromEvents(events, meta) {
    meta = meta || {}; events = events || [];
    var b = builder();
    var targetNum = num(meta["Target identity"]) || inferTarget(events);
    var targetId = targetNum ? b.putEnt({ type: "phone", label: targetNum, identity: targetNum }) : null;
    events.forEach(function (e) {
      var vehId = e.vrm ? b.putEnt({ type: "vehicle", label: e.vrm, identity: e.vrm, attrs: { make: e.make || "", colour: e.colour || "" } }) : null;
      [e.aParty, e.bParty, e.fwdParty].forEach(function (p) {
        p = num(p); if (!p || p === targetNum) return;
        var cId = b.putEnt({ type: "phone", label: p, identity: p });
        if (targetId) b.putLink(targetId, cId, "COMMUNICATED_WITH", { count: 1 });
      });
      if (e.lat != null && e.lon != null) {
        var lbl = e.cellName || e.cellPostcode || (e.lat + ", " + e.lon);
        var lId = b.putEnt({ type: "location", label: lbl, identity: (e.startCell && e.startCell.id) || lbl, attrs: { lat: e.lat, lon: e.lon, postcode: e.cellPostcode || "" } });
        var who = vehId || targetId;
        if (who) b.putLink(who, lId, "LOCATED_IN");
      }
    });
    return b.parts();
  }

  /* Cross-file results -> case parts (shared contacts, direct links, co-locations). */
  function fromLink(cc, co) {
    var b = builder();
    cc = cc || {}; co = co || [];
    (cc.identities || []).forEach(function (n) { n = num(n); if (n) b.putEnt({ type: "phone", label: n, identity: n }); });
    (cc.shared || []).forEach(function (s) {
      var cId = b.putEnt({ type: "phone", label: num(s.contact), identity: num(s.contact) });
      (s.targets || []).forEach(function (t) { var tId = b.putEnt({ type: "phone", label: num(t), identity: num(t) }); b.putLink(tId, cId, "COMMUNICATED_WITH", { count: s.perTarget ? s.perTarget[t] : 1 }); });
    });
    (cc.directLinks || []).forEach(function (l) {
      var fromId = b.putEnt({ type: "phone", label: num(l.from), identity: num(l.from) });
      var toId = b.putEnt({ type: "phone", label: num(l.to), identity: num(l.to) });
      b.putLink(fromId, toId, "COMMUNICATED_WITH", { count: l.count || 1 });
    });
    co.forEach(function (r) {
      var aId = b.putEnt({ type: "phone", label: num(r.targetA), identity: num(r.targetA) });
      var bId = b.putEnt({ type: "phone", label: num(r.targetB), identity: num(r.targetB) });
      b.putLink(aId, bId, "CO_LOCATED_WITH", { place: r.place || "" });
    });
    return b.parts();
  }

  var api = { fromEvents: fromEvents, fromLink: fromLink };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CRCommsCase = api;
})();
