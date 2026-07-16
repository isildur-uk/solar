/* identity.js — SolarIdentity: ONE source of "who am I" for all three functions.
 *
 * Replaces the divergent identities (hardcoded shell name, registry `reg_user`,
 * charting `cr_officer`, none in Analyse) with a single localStorage-backed record
 * that Charting, Database and Analyse all read and write. Migrates the legacy keys
 * on first read so nothing is lost.
 *
 * Browser: window.SolarIdentity. Node: module.exports (in-memory fallback for tests).
 */
(function () {
  "use strict";
  var KEY = "solar_identity";
  var DEFAULT = { grade: "G5", name: "Analyst" };
  var _mem = null;   // fallback store when localStorage is unavailable (Node/tests)

  function store() { try { if (typeof localStorage !== "undefined") return localStorage; } catch (e) {} return null; }
  function readRaw() { var s = store(); if (s) { try { return s.getItem(KEY); } catch (e) {} } return _mem; }
  function writeRaw(v) { var s = store(); if (s) { try { s.setItem(KEY, v); return; } catch (e) {} } _mem = v; }

  // Pull an identity out of the legacy per-surface keys, if present.
  function legacy() {
    var s = store(); if (!s) return null;
    try {
      var r = s.getItem("reg_user") || s.getItem("cr_officer");
      if (r) { var m = String(r).match(/^\s*(G\d)\s+(.+?)\s*$/); return m ? { grade: m[1], name: m[2] } : { grade: DEFAULT.grade, name: String(r).trim() }; }
    } catch (e) {}
    return null;
  }

  function get() {
    var raw = readRaw();
    if (raw) { try { var o = JSON.parse(raw); if (o && o.name) return { grade: o.grade || DEFAULT.grade, name: o.name }; } catch (e) {} }
    var lg = legacy(); if (lg) { set(lg); return lg; }
    return { grade: DEFAULT.grade, name: DEFAULT.name };
  }
  function set(o) {
    o = o || {};
    var v = {
      grade: (String(o.grade == null ? "" : o.grade).trim()) || DEFAULT.grade,
      name: (String(o.name == null ? "" : o.name).trim()) || DEFAULT.name
    };
    writeRaw(JSON.stringify(v));
    return v;
  }
  function label() { var i = get(); return i.grade + " · " + i.name; }   // "G5 · Name"

  var api = {
    KEY: KEY, DEFAULT: DEFAULT,
    get: get, set: set, label: label,
    _reset: function () { _mem = null; var s = store(); if (s) { try { s.removeItem(KEY); } catch (e) {} } }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.SolarIdentity = api;
})();
