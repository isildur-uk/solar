/* repository-sqlite.js — SQLite implementation of the Registry repository,
 * for the desktop (Tauri) build. Same async interface as InMemory/IndexedDB:
 *   save(ir)->ir, get(urn)->ir|null, list()->[ir], search(q)->[ir], remove(urn)->bool
 *
 * Storage-agnostic: takes a `driver` with two async methods so it can run
 * against any SQLite binding without this file importing one:
 *   driver.run(sql, params)  -> Promise<void>           (INSERT/UPDATE/DELETE/DDL)
 *   driver.all(sql, params)  -> Promise<Array<row>>     (SELECT)
 * Each IR is stored as one row {urn, updated_at, json}. Search reuses the SAME
 * matches() used by the other repositories, so behaviour is identical.
 * Dual export: module.exports + window.RegistrySqlite. */
"use strict";
(function () {
  var REPO = (typeof require!=="undefined") ? require("./repository.js") : (typeof window!=="undefined"?window.RegistryRepository:null);
  if(!REPO || typeof REPO._matches !== "function"){ throw new Error("repository-sqlite.js requires repository.js to be loaded first (shared matches())."); }
  var matches = REPO._matches;

  var TABLE = "intelligence_reports";
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function byUpdatedDesc(a,b){ return String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")); }

  function SqliteRepository(driver){
    if(!driver || typeof driver.run!=="function" || typeof driver.all!=="function"){
      throw new Error("SqliteRepository requires a driver with run(sql,params) and all(sql,params).");
    }
    this.d = driver;
    this._ready = null;
  }
  SqliteRepository.prototype._ensure = function(){
    if(this._ready) return this._ready;
    var d = this.d;
    this._ready = d.run(
      "CREATE TABLE IF NOT EXISTS " + TABLE +
      " (urn TEXT PRIMARY KEY, updated_at TEXT, json TEXT NOT NULL)", []
    ).then(function(){
      return d.run("CREATE INDEX IF NOT EXISTS idx_" + TABLE + "_updated ON " + TABLE + " (updated_at)", []);
    });
    return this._ready;
  };
  SqliteRepository.prototype.save = function(ir){
    if(!ir || !ir.urn) return Promise.reject(new Error("save: ir.urn required"));
    var d = this.d, rec = clone(ir);
    return this._ensure().then(function(){
      return d.run(
        "INSERT INTO " + TABLE + " (urn, updated_at, json) VALUES (?, ?, ?) " +
        "ON CONFLICT(urn) DO UPDATE SET updated_at=excluded.updated_at, json=excluded.json",
        [rec.urn, rec.updatedAt || "", JSON.stringify(rec)]
      );
    }).then(function(){ return rec; });
  };
  SqliteRepository.prototype.get = function(urn){
    var d = this.d;
    return this._ensure().then(function(){
      return d.all("SELECT json FROM " + TABLE + " WHERE urn = ?", [urn]);
    }).then(function(rows){
      if(rows && rows.length) { try { return JSON.parse(rows[0].json); } catch(e){ return null; } }
      return null;
    });
  };
  SqliteRepository.prototype.list = function(){
    var d = this.d;
    return this._ensure().then(function(){
      return d.all("SELECT json FROM " + TABLE + " ORDER BY updated_at DESC", []);
    }).then(function(rows){
      var out = [];
      (rows||[]).forEach(function(r){ try { out.push(JSON.parse(r.json)); } catch(e){} });
      out.sort(byUpdatedDesc);
      return out;
    });
  };
  SqliteRepository.prototype.search = function(q){
    return this.list().then(function(all){ return all.filter(function(ir){ return matches(ir, q); }); });
  };
  SqliteRepository.prototype.remove = function(urn){
    var d = this, drv = this.d;
    return this.get(urn).then(function(existing){
      return drv.run("DELETE FROM " + TABLE + " WHERE urn = ?", [urn]).then(function(){ return !!existing; });
    });
  };

  SqliteRepository.prototype.clear = function(){
    var drv = this.d;
    return this._ensure().then(function(){ return drv.run("DELETE FROM " + TABLE, []); }).then(function(){ return true; });
  };

  function createSqliteRepository(driver){ return new SqliteRepository(driver); }

  var api = { SqliteRepository: SqliteRepository, createSqliteRepository: createSqliteRepository, TABLE: TABLE };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistrySqlite = api; }
})();
