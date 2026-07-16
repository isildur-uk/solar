/* solar-case.js — SolarCase: the shared entity/link spine for all three functions.
 *
 * One canonical, subscribable case store (localStorage-backed, in-memory fallback
 * for Node/tests) that Charting, Database and Analyse read + write, so the same
 * entities and links are shared live across the product instead of living in three
 * private stores. Entities/links carry STABLE ids derived from their identity, so
 * writes from any function converge (idempotent merge / dedupe) rather than
 * duplicating. Change events fire locally and cross-tab (storage event) so open
 * surfaces can update.
 *
 * Neutral interchange model (converters to CRModel / SI live in the handoff layer):
 *   entity = { id, type, label, identity?, attrs, source, createdBy, ts }
 *   link   = { id, from, to, type, label?, dir, attrs, source, createdBy, ts }
 *
 * Browser: window.SolarCase. Node: module.exports (in-memory).
 */
(function () {
  "use strict";
  var KEY = "solar_case_v1";
  var _cache = null;
  var _mem = null;                    // fallback store when no localStorage
  var _subs = [];

  function store() { try { if (typeof localStorage !== "undefined") return localStorage; } catch (e) {} return null; }
  function readRaw() { var s = store(); if (s) { try { return s.getItem(KEY); } catch (e) {} } return _mem; }
  function writeRaw(v) { var s = store(); if (s) { try { s.setItem(KEY, v); } catch (e) { _mem = v; } } else { _mem = v; } }

  function str(x) { return (x == null) ? "" : String(x); }
  function norm(x) { return str(x).toLowerCase().replace(/\s+/g, " ").replace(/^ | $/g, ""); }
  function nowTs() { return Date.now(); }

  function emptyCase() { return { schema: "solar.case.v1", name: "", updated: 0, entities: [], links: [] }; }

  function load() {
    if (_cache) return _cache;
    var raw = readRaw();
    if (raw) { try { var o = JSON.parse(raw); if (o && o.schema) { o.entities = o.entities || []; o.links = o.links || []; _cache = o; return o; } } catch (e) {} }
    _cache = emptyCase();
    return _cache;
  }
  function persist() { var c = load(); c.updated = nowTs(); writeRaw(JSON.stringify(c)); fire(); }
  function fire() { _subs.slice().forEach(function (fn) { try { fn(load()); } catch (e) {} }); }

  /* ---- identity → stable id ---- */
  function identityKey(e) {
    var idn = norm(e.identity);
    if (idn) return str(e.type).toLowerCase() + "|" + idn;
    return str(e.type).toLowerCase() + "|" + norm(e.label);
  }
  function entityId(e) { return "E:" + identityKey(e); }
  function linkId(l) { return "L:" + str(l.from) + "|" + str(l.type).toLowerCase() + "|" + str(l.to); }

  function indexBy(arr, key) { var m = {}; arr.forEach(function (x) { m[x[key]] = x; }); return m; }

  /* ---- writes (idempotent) ---- */
  function upsertEntity(e, opts) {
    e = e || {}; opts = opts || {};
    var c = load();
    var id = e.id || entityId(e);
    var idx = indexBy(c.entities, "id");
    var cur = idx[id];
    var ent = cur || { id: id, type: str(e.type) || "entity", label: str(e.label), identity: str(e.identity), attrs: {}, source: str(e.source), createdBy: str(e.createdBy), ts: nowTs() };
    if (e.label && !cur) ent.label = str(e.label);
    if (e.label && cur && !ent.label) ent.label = str(e.label);
    if (e.attrs) { for (var k in e.attrs) if (e.attrs.hasOwnProperty(k) && e.attrs[k] != null && e.attrs[k] !== "") ent.attrs[k] = e.attrs[k]; }
    if (e.source && !ent.source) ent.source = str(e.source);
    if (!cur) c.entities.push(ent);
    if (opts.defer !== true) persist();
    return ent;
  }
  function upsertLink(l, opts) {
    l = l || {}; opts = opts || {};
    var c = load();
    var id = l.id || linkId(l);
    var idx = indexBy(c.links, "id");
    var cur = idx[id];
    var lk = cur || { id: id, from: str(l.from), to: str(l.to), type: str(l.type) || "LINKED_TO", label: str(l.label), dir: l.dir || "->", attrs: {}, source: str(l.source), createdBy: str(l.createdBy), ts: nowTs() };
    if (l.attrs) { for (var k in l.attrs) if (l.attrs.hasOwnProperty(k) && l.attrs[k] != null && l.attrs[k] !== "") lk.attrs[k] = l.attrs[k]; }
    if (l.label && !lk.label) lk.label = str(l.label);
    if (!cur) c.links.push(lk);
    if (opts.defer !== true) persist();
    return lk;
  }
  // Batch merge a set of entities + links (one persist + one event).
  function merge(part) {
    part = part || {};
    (part.entities || []).forEach(function (e) { upsertEntity(e, { defer: true }); });
    (part.links || []).forEach(function (l) { upsertLink(l, { defer: true }); });
    persist();
    return stats();
  }

  /* ---- reads ---- */
  function get() { return load(); }
  function entities() { return load().entities.slice(); }
  function links() { return load().links.slice(); }
  function stats() { var c = load(); return { entities: c.entities.length, links: c.links.length }; }
  function name() { return load().name; }
  function setName(n) { load().name = str(n); persist(); return load().name; }
  function clear() { _cache = emptyCase(); writeRaw(JSON.stringify(_cache)); fire(); }

  /* ---- subscription (local + cross-tab) ---- */
  function subscribe(fn) {
    if (typeof fn !== "function") return function () {};
    _subs.push(fn);
    return function () { var i = _subs.indexOf(fn); if (i !== -1) _subs.splice(i, 1); };
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", function (e) { if (e.key === KEY) { _cache = null; fire(); } });
  }

  var api = {
    KEY: KEY,
    get: get, entities: entities, links: links, stats: stats,
    upsertEntity: upsertEntity, upsertLink: upsertLink, merge: merge,
    name: name, setName: setName, clear: clear,
    subscribe: subscribe,
    entityId: entityId, linkId: linkId, identityKey: identityKey,
    _reset: function () { _cache = null; _mem = null; _subs = []; var s = store(); if (s) { try { s.removeItem(KEY); } catch (e) {} } }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.SolarCase = api;
})();
