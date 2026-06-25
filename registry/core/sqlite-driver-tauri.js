/* sqlite-driver-tauri.js — adapts the Tauri SQL plugin (@tauri-apps/plugin-sql)
 * to the driver shape SqliteRepository expects. Pure/parameter-injected so this
 * file is safe to require in Node/browser (it imports nothing at load time).
 *
 * Desktop wiring (in the Tauri build's entry module):
 *   import Database from "@tauri-apps/plugin-sql";
 *   import { makeTauriDriver } from "./sqlite-driver-tauri.js";
 *   import { createSqliteRepository } from "./repository-sqlite.js";
 *   const db = await Database.load("sqlite:registry.db");
 *   const repo = createSqliteRepository(makeTauriDriver(db));
 * Then hand `repo` to the app instead of RegistryRepository.createRepository().
 *
 * The Tauri SQL plugin uses $1,$2,... placeholders; we translate the repo's
 * "?" placeholders to positional $n. Dual export: module.exports + window.RegistrySqliteTauri. */
"use strict";
(function () {
  function toPositional(sql){
    var i = 0;
    return sql.replace(/\?/g, function(){ i += 1; return "$" + i; });
  }
  // `db` is a loaded @tauri-apps/plugin-sql Database (db.execute, db.select).
  function makeTauriDriver(db){
    return {
      run: function(sql, params){ return db.execute(toPositional(sql), params || []); },
      all: function(sql, params){ return db.select(toPositional(sql), params || []); }
    };
  }
  var api = { makeTauriDriver: makeTauriDriver, _toPositional: toPositional };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistrySqliteTauri = api; }
})();
