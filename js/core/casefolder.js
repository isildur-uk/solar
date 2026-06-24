/* CHART ROOM — casefolder.js
 * A case = a FOLDER of per-record JSON files on a shared drive, so a team can
 * collaborate without a backend. Record/graph files are named by IMMUTABLE id
 * (not by ref): two analysts who both mint display-ref "E0003" offline still
 * write to different files (their ids differ), so neither silently overwrites
 * the other. Display refs can still duplicate across truly-concurrent offline
 * adds — that is a label clash, not data loss, and is resolved when the
 * write/sync path allocates refs against a folder lock (next slice).
 * Pure mapping (toFileMap / fromFileMap / applyToStore) is Node-testable; the
 * browser File System Access IO is a thin shell over fsaccess.js (CRFs).
 * Browser: window.CRCaseFolder. Node: module.exports.
 */
(function () {
  "use strict";

  var R = (typeof window !== "undefined" && window.CRRecords) ||
          (typeof require === "function" ? require("./records.js") : null);

  function hash8(s) { var h = 5381, i = s.length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(36); }
  /* Injective, filesystem-safe name: distinct inputs never collide. If
   * sanitising or truncation changed the string, append a stable hash. */
  function safe(s) {
    var raw = String(s == null ? "rec" : s);
    var clean = raw.replace(/[^A-Za-z0-9_.\-]/g, "_").slice(0, 80) || "rec";
    if (clean !== raw) clean = clean.slice(0, 63) + "_" + hash8(raw);
    return clean;
  }

  /* store -> { relPath: object }. One file per entity/link/event/record, keyed by id. */
  function toFileMap(store) {
    var map = {};
    var core = (typeof store.toJSON === "function") ? store.toJSON() : { meta: store.meta, entities: store.entities, links: store.links, events: store.events, records: store.records };
    map["case.json"] = {
      app: "chart_room", schema: "folder/1",
      meta: core.meta || store.meta || {},
      classification: (core.meta || store.meta || {}).classification || "OFFICIAL"
    };
    (core.entities || []).forEach(function (e) { map["entities/" + safe(e.id) + ".json"] = e; });
    (core.links || []).forEach(function (l) { map["links/" + safe(l.id) + ".json"] = l; });
    (core.events || []).forEach(function (ev) { map["events/" + safe(ev.id) + ".json"] = ev; });
    var recs = (core.records) || (store.records) || R.emptyRecords();
    R.COLLECTIONS.forEach(function (k) {
      var t = R.RECORD_TYPES[k];
      (recs[k] || []).forEach(function (r) { var o = {}; Object.keys(r).forEach(function (kk) { if (kk.charAt(0) !== "_") o[kk] = r[kk]; }); map[t.dir + "/" + safe(r.id) + ".json"] = o; });
    });
    return map;
  }

  /* { relPath: object } -> { meta, entities, links, events, records } */
  function fromFileMap(map) {
    var out = { meta: {}, entities: [], links: [], events: [], records: R.emptyRecords() };
    var cj = map["case.json"];
    if (cj && cj.meta) out.meta = cj.meta;
    Object.keys(map).forEach(function (path) {
      if (path === "case.json") return;
      var obj = map[path];
      if (path.indexOf("entities/") === 0) out.entities.push(obj);
      else if (path.indexOf("links/") === 0) out.links.push(obj);
      else if (path.indexOf("events/") === 0) out.events.push(obj);
      else {
        R.COLLECTIONS.forEach(function (k) {
          if (path.indexOf(R.RECORD_TYPES[k].dir + "/") === 0) out.records[k].push(obj);
        });
      }
    });
    return out;
  }

  /* Push a parsed folder onto a store via the existing fromJSON shape
   * (the records.attach() wrapper restores store.records). */
  function applyToStore(store, parsed) {
    var json = {
      app: "chart_room", version: 1,
      meta: parsed.meta || {},
      entities: parsed.entities || [],
      links: parsed.links || [],
      events: parsed.events || [],
      records: parsed.records || R.emptyRecords()
    };
    store.fromJSON(json);
    return store;
  }

  /* ---------------- browser File System Access IO ---------------- */
  function writeFolder(store, rootHandle) {
    var Fs = (typeof window !== "undefined") && window.CRFs;
    if (!Fs || !Fs.supported()) return Promise.reject(new Error("File System Access not available"));
    var map = toFileMap(store);
    var paths = Object.keys(map);
    return paths.reduce(function (p, path) {
      return p.then(function () { return Fs.writeJSONPath(rootHandle, path, map[path]); });
    }, Promise.resolve()).then(function () { return paths.length; });
  }
  function readFolder(rootHandle) {
    var Fs = (typeof window !== "undefined") && window.CRFs;
    if (!Fs || !Fs.supported()) return Promise.reject(new Error("File System Access not available"));
    return Fs.readAllJSON(rootHandle).then(function (files) { return fromFileMap(files); });
  }

  var CRCaseFolder = {
    toFileMap: toFileMap, fromFileMap: fromFileMap, applyToStore: applyToStore,
    writeFolder: writeFolder, readFolder: readFolder, safe: safe, hash8: hash8
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRCaseFolder;
  if (typeof window !== "undefined") window.CRCaseFolder = CRCaseFolder;
})();
