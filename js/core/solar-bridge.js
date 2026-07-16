/* solar-bridge.js — SolarCase <-> Charting (CRModel) bridge.
 *
 * Closes the loop for unification (P4): entities/links added to the shared
 * SolarCase spine (from Analyse, or from Database handoff) can be MERGED
 * non-destructively into a live Charting CRModel.CaseStore, and the current
 * chart can be written back out as SolarCase parts.
 *
 * Rules honoured:
 *  - Non-destructive: never clears or replaces the chart; only adds what is
 *    missing. Existing entities/links are matched and reused, not duplicated.
 *  - Provenance is NEVER charted (SolarCase carries none; we never invent any).
 *  - Idempotent: merging the same SolarCase twice adds nothing the second time.
 *  - No network, no build step; classic script + dual export for node tests.
 */
(function (root) {
  "use strict";

  /* SolarCase entity types -> CRModel entity types.
   * SolarCase already uses CRModel-compatible generic types, so most pass
   * through 1:1; the table only pins aliases and guarantees a known target. */
  var CHART_TYPES = {
    person: "person", phone: "phone", email: "email", address: "address",
    location: "location", organisation: "organisation", org: "organisation",
    vehicle: "vehicle", weapon: "weapon", firearm: "weapon", drug: "drug",
    account: "account", date: "date", money: "money", cash: "money",
    ip: "ip", document: "document", event: "event", note: "note"
  };
  function chartType(t) {
    return CHART_TYPES[String(t || "").toLowerCase()] || "note";
  }
  /* CRModel entity type -> SolarCase type (write-back). Near-identity. */
  function solarType(t) {
    var x = String(t || "").toLowerCase();
    return CHART_TYPES[x] ? x : (x || "note");
  }

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
  }

  /* Find an existing chart entity equivalent to a SolarCase entity, so a merge
   * reuses it instead of creating a duplicate. Match on type + a canonical
   * identity: phones by e164, vehicles by VRM, everything else by label. */
  function findChartEntity(store, ctype, se) {
    var ents = store.entities || [];
    var label = norm(se.label);
    var ident = norm(se.identity);
    var wantE164 = null, wantVrm = null, M = root.CRModel;
    if (ctype === "phone" && M && M.normalisePhone) {
      wantE164 = M.normalisePhone(se.identity || se.label).e164 || null;
    }
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.type !== ctype) continue;
      if (wantE164 && e.ids && e.ids.e164 && e.ids.e164 === wantE164) return e;
      if (wantVrm && e.ids && e.ids.vrm && e.ids.vrm === wantVrm) return e;
      var el = norm(e.label);
      if (el && (el === label || (ident && el === ident))) return e;
    }
    return null;
  }

  /* Merge a SolarCase (or {entities,links} part) INTO a live CRModel store.
   * Returns { entities, links, matched } counts. Does not save; caller decides. */
  function mergeIntoStore(store, caseObj) {
    if (!store || typeof store.addEntity !== "function") {
      throw new Error("mergeIntoStore: a CRModel.CaseStore is required");
    }
    var src = caseObj;
    if (!src && root.SolarCase) src = root.SolarCase.get();
    src = src || {};
    var ents = src.entities || [];
    var links = src.links || [];

    var idMap = {};             // SolarCase entity id -> chart entity id
    var out = { entities: 0, links: 0, matched: 0 };

    ents.forEach(function (se) {
      var ctype = chartType(se.type);
      var hit = findChartEntity(store, ctype, se);
      if (hit) { idMap[se.id] = hit.id; out.matched++; return; }
      var attrs = {};
      if (se.attrs) { for (var k in se.attrs) if (se.attrs.hasOwnProperty(k)) attrs[k] = se.attrs[k]; }
      if (se.identity && !attrs.identity) attrs.identity = se.identity;
      var geo = null;
      if (se.attrs && se.attrs.lat != null && se.attrs.lon != null) {
        geo = { lat: se.attrs.lat, lon: se.attrs.lon };
      }
      var ne = store.addEntity({
        type: ctype,
        label: se.label || se.identity || "(unnamed)",
        attrs: attrs,
        geo: geo,
        origin: "solar-case"
      });
      idMap[se.id] = ne.id;
      out.entities++;
    });

    links.forEach(function (sl) {
      var from = idMap[sl.from], to = idMap[sl.to];
      if (!from || !to) return;                       // endpoint not merged
      var before = store.links.length;
      store.addLink({
        from: from, to: to,
        type: sl.type || "LINKED_TO",
        label: sl.label || "",
        confidence: sl.confidence || "med",
        origin: "solar-case"
      });
      if (store.links.length > before) out.links++;   // addLink collapses dupes
    });

    return out;
  }

  /* Read a live chart back out as SolarCase parts (write-back / round-trip).
   * Entity ids are rebuilt from identity via SolarCase.entityId when available,
   * so the same real-world entity keeps a stable id across the two stores. */
  function fromChartStore(store) {
    var SC = root.SolarCase;
    var ents = (store && store.entities) || [];
    var links = (store && store.links) || [];
    var outE = [], outL = [], map = {};

    ents.forEach(function (e) {
      var stype = solarType(e.type);
      var identity = (e.attrs && e.attrs.identity) ||
        (e.ids && (e.ids.e164 || e.ids.vrm || e.ids.email)) || e.label || "";
      var part = { type: stype, label: e.label || identity, identity: identity, attrs: e.attrs || {} };
      var sid = SC && SC.entityId ? SC.entityId(part) : ("E:" + stype + "|" + norm(identity || e.label));
      part.id = sid;
      map[e.id] = sid;
      outE.push(part);
    });

    links.forEach(function (l) {
      var from = map[l.from], to = map[l.to];
      if (!from || !to) return;
      outL.push({
        id: "L:" + from + "|" + String(l.type || "linked_to").toLowerCase() + "|" + to,
        from: from, to: to,
        type: l.type || "LINKED_TO",
        label: l.label || "",
        confidence: l.confidence || "med"
      });
    });

    return { entities: outE, links: outL };
  }

  var API = {
    mergeIntoStore: mergeIntoStore,
    fromChartStore: fromChartStore,
    chartType: chartType,
    solarType: solarType,
    _findChartEntity: findChartEntity
  };

  root.CRSolarBridge = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
