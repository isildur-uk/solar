/* repository.js — storage layer for the Registry (the "DB that runs alongside
 * SOLAR"). One async interface, two implementations:
 *
 *   - InMemoryRepository : Node/tests; no persistence.
 *   - IndexedDbRepository : browser; durable, offline, holds many IRs.
 *
 * The desktop (Tauri) build can later add a SqliteRepository behind the same
 * interface without touching callers.
 *
 * Interface (all return Promises):
 *   save(ir) -> ir          put/update by urn
 *   get(urn) -> ir | null
 *   list()   -> [ir]        newest-updated first
 *   search(q)-> [ir]        case-insensitive over title/urn/threatArea/items
 *   remove(urn) -> boolean
 *
 * Dual export: module.exports (Node) + window.RegistryRepository (browser).
 */
"use strict";

(function () {

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function matches(ir, q) {
    q = String(q || "").toLowerCase().trim();
    if (!q) return true;
    var pvText = (ir.provenance && typeof ir.provenance === "object") ? ir.provenance.text : (typeof ir.provenance === "string" ? ir.provenance : "");
    var hay = [ir.urn, ir.operation, ir.title, ir.threatArea, ir.status, pvText]
      .concat((ir.items || []).map(function (i) { return (i.sourceType || "") + " " + (i.text || ""); }))
      .join(" \n ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function byUpdatedDesc(a, b) {
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  }

  /* ---------------- In-memory (Node / tests) ---------------- */
  function InMemoryRepository() { this._m = {}; }
  InMemoryRepository.prototype.save = function (ir) {
    if (!ir || !ir.urn) return Promise.reject(new Error("save: ir.urn required"));
    this._m[ir.urn] = clone(ir);
    return Promise.resolve(clone(ir));
  };
  InMemoryRepository.prototype.get = function (urn) {
    return Promise.resolve(this._m[urn] ? clone(this._m[urn]) : null);
  };
  InMemoryRepository.prototype.list = function () {
    var out = [];
    for (var k in this._m) if (this._m.hasOwnProperty(k)) out.push(clone(this._m[k]));
    out.sort(byUpdatedDesc);
    return Promise.resolve(out);
  };
  InMemoryRepository.prototype.search = function (q) {
    return this.list().then(function (all) {
      return all.filter(function (ir) { return matches(ir, q); });
    });
  };
  InMemoryRepository.prototype.clear = function () { this._m = {}; return Promise.resolve(true); };
  InMemoryRepository.prototype.remove = function (urn) {
    var had = Object.prototype.hasOwnProperty.call(this._m, urn);
    delete this._m[urn];
    return Promise.resolve(had);
  };

  /* ---------------- IndexedDB (browser) ---------------- */
  var DB_NAME = "registry_db_v1";
  var STORE = "intelligence_reports";

  function IndexedDbRepository() { this._dbp = null; }
  IndexedDbRepository.prototype._db = function () {
    if (this._dbp) return this._dbp;
    this._dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = function (e) {
        var db = e.target.result, os;
        if (!db.objectStoreNames.contains(STORE)) { os = db.createObjectStore(STORE, { keyPath: "urn" }); }
        else { os = e.target.transaction.objectStore(STORE); }
        // Secondary indexes on the commonly-queried fields — how a real DB serves
        // filtered/ordered reads without scanning every row.
        ["updatedAt", "operation", "status", "threatArea", "protectiveMarking", "dateOfCollection"].forEach(function (ix) {
          if (!os.indexNames.contains(ix)) os.createIndex(ix, ix, { unique: false });
        });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return this._dbp;
  };
  IndexedDbRepository.prototype._tx = function (mode, fn) {
    return this._db().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var os = tx.objectStore(STORE);
        var box;
        try { box = fn(os); } catch (err) { reject(err); return; }
        tx.oncomplete = function () { resolve(box && box.__val !== undefined ? box.__val : box); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  };
  IndexedDbRepository.prototype.save = function (ir) {
    if (!ir || !ir.urn) return Promise.reject(new Error("save: ir.urn required"));
    var rec = clone(ir);
    return this._tx("readwrite", function (os) { os.put(rec); return { __val: rec }; });
  };
  IndexedDbRepository.prototype.get = function (urn) {
    return this._tx("readonly", function (os) {
      var box = {};
      os.get(urn).onsuccess = function (e) { box.__val = e.target.result; };
      return box;
    }).then(function (v) { return v || null; });
  };
  IndexedDbRepository.prototype.list = function () {
    return this._tx("readonly", function (os) {
      var box = { __val: [] };
      os.getAll().onsuccess = function (e) { box.__val = e.target.result || []; };
      return box;
    }).then(function (all) { all.sort(byUpdatedDesc); return all; });
  };
  IndexedDbRepository.prototype.search = function (q) {
    return this.list().then(function (all) {
      return all.filter(function (ir) { return matches(ir, q); });
    });
  };
  IndexedDbRepository.prototype.remove = function (urn) {
    return this._tx("readwrite", function (os) { os.delete(urn); return { __val: true }; });
  };
  IndexedDbRepository.prototype.clear = function () {
    return this._tx("readwrite", function (os) { os.clear(); return { __val: true }; });
  };

  /* ResilientRepository: prefer IndexedDB, but if it is unavailable or denied
   * (e.g. opening the page via file:// in some browsers) transparently fall back
   * to in-memory for the rest of the session so the app still works. */
  function ResilientRepository() {
    this.idb = new IndexedDbRepository();
    this.mem = new InMemoryRepository();
    this.fellBack = false;
  }
  ["save", "get", "list", "search", "remove", "clear"].forEach(function (m) {
    ResilientRepository.prototype[m] = function () {
      var self = this, args = arguments;
      if (self.fellBack) return self.mem[m].apply(self.mem, args);
      return self.idb[m].apply(self.idb, args).catch(function (e) {
        if (!self.fellBack) {
          self.fellBack = true;
          if (typeof console !== "undefined" && console.warn) {
            console.warn("Registry: IndexedDB unavailable — using an in-memory store for this session.", e && e.message);
          }
        }
        return self.mem[m].apply(self.mem, args);
      });
    };
  });

  function createRepository() {
    if (typeof indexedDB !== "undefined") return new ResilientRepository();
    return new InMemoryRepository();
  }

  var api = {
    InMemoryRepository: InMemoryRepository,
    IndexedDbRepository: IndexedDbRepository,
    ResilientRepository: ResilientRepository,
    createRepository: createRepository,
    _matches: matches
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryRepository = api; }
})();
