/* CHART ROOM — casesync.js
 * Shared-folder collaboration orchestration. Connects a case to a folder
 * (File System Access API in the browser, or any injected adapter in tests),
 * and provides the SAFE write path that finally wires up the collab spine:
 *   open-for-edit  -> advisory lock (CRCollab.canAcquire)
 *   save a record  -> read disk, CRCollab.detectConflict(base, diskRec),
 *                     write only if clean, else surface the conflict
 *   every change   -> append to the activity trail
 * Pure orchestration over an adapter with the CRFs shape; no DOM. The browser
 * binding is window.CRFs. Browser: window.CRCaseSync. Node: module.exports.
 */
(function () {
  "use strict";

  var CF = (typeof window !== "undefined" && window.CRCaseFolder) || (typeof require === "function" ? require("./casefolder.js") : null);
  var C = (typeof window !== "undefined" && window.CRCollab) || (typeof require === "function" ? require("./collab.js") : null);
  var R = (typeof window !== "undefined" && window.CRRecords) || (typeof require === "function" ? require("./records.js") : null);

  var handle = null, fs = null, connected = false, folderName = "";
  var whoFn = function () { return ""; };

  function setWho(fn) { whoFn = (typeof fn === "function") ? fn : function () { return fn; }; }
  function who() { return whoFn() || ""; }

  function setBackend(h, adapter, name) {
    handle = h;
    fs = adapter || ((typeof window !== "undefined") && window.CRFs) || null;
    connected = !!(handle && fs);
    folderName = name || (h && h.name) || "shared folder";
    return connected;
  }
  function isConnected() { return connected; }
  function folder() { return folderName; }
  function disconnect() { handle = null; connected = false; folderName = ""; }

  function relPathFor(type, rec) { return R.RECORD_TYPES[type].dir + "/" + CF.safe(rec.id) + ".json"; }
  function ev(rec, action, detail) {
    return { ts: new Date().toISOString(), who: who(), recordType: (rec && rec.type) || "", recordId: (rec && rec.id) || "", ref: (rec && rec.ref) || "", action: action, detail: detail || "" };
  }
  function clean(rec) { var o = {}; Object.keys(rec).forEach(function (k) { if (k.charAt(0) !== "_") o[k] = rec[k]; }); return o; } // drop per-session transients (_baseVersion) from canonical files
  function markAllSynced(store) {
    R.COLLECTIONS.forEach(function (k) { (store.records[k] || []).forEach(function (r) { r._baseVersion = r.version; }); });
  }

  /* write the whole case to the folder (per-record files) */
  function saveAll(store) {
    if (!connected) return Promise.reject(new Error("no folder connected"));
    var map = CF.toFileMap(store);
    var paths = Object.keys(map);
    return paths.reduce(function (p, path) {
      return p.then(function () { return fs.writeJSONPath(handle, path, map[path]); });
    }, Promise.resolve())
      .then(function () { markAllSynced(store); return fs.appendActivity(handle, ev(null, "save-all", paths.length + " files")); })
      .then(function () { return paths.length; });
  }

  /* load the whole case from the folder, replacing in-memory state */
  function loadAll(store) {
    if (!connected) return Promise.reject(new Error("no folder connected"));
    return fs.readAllJSON(handle).then(function (files) {
      CF.applyToStore(store, CF.fromFileMap(files));
      markAllSynced(store);
      return store;
    });
  }

  /* safe per-record save: conflict-detect against disk before writing */
  function saveRecord(store, type, rec) {
    if (!connected) return Promise.resolve({ ok: true, offline: true });
    var path = relPathFor(type, rec);
    return fs.readJSONPath(handle, path).then(function (r) { return r; }, function () { return null; })
      .then(function (diskRec) {
        var conf = C.detectConflict(rec._baseVersion, diskRec);
        if (conf.conflict) return { ok: false, conflict: true, diskRec: diskRec, local: rec, reason: conf.reason };
        return fs.writeJSONPath(handle, path, clean(rec))
          .then(function () { rec._baseVersion = rec.version; return fs.appendActivity(handle, ev(rec, "save", rec.ref + " (" + rec.status + ")")); })
          .then(function () { return { ok: true }; });
      });
  }

  /* resolve a detected conflict: 'mine' (force, supersede) or 'theirs' (adopt disk) */
  function resolveConflict(store, type, rec, choice) {
    var path = relPathFor(type, rec);
    if (choice === "theirs") {
      return fs.readJSONPath(handle, path).then(function (diskRec) {
        var arr = store.records[type];
        var i = -1; for (var j = 0; j < arr.length; j++) if (arr[j].id === rec.id) { i = j; break; }
        if (i >= 0) arr[i] = diskRec;
        diskRec._baseVersion = diskRec.version;
        return fs.appendActivity(handle, ev(diskRec, "conflict-resolved", "took theirs")).then(function () { return { ok: true, adopted: true }; });
      });
    }
    return fs.readJSONPath(handle, path).then(function (r) { return r; }, function () { return null; })
      .then(function (diskRec) {
        rec.version = Math.max(rec.version || 1, (diskRec && diskRec.version) || 0) + 1;
        return fs.writeJSONPath(handle, path, clean(rec))
          .then(function () { rec._baseVersion = rec.version; return fs.appendActivity(handle, ev(rec, "conflict-resolved", "kept mine")); })
          .then(function () { return { ok: true, forced: true }; });
      });
  }

  /* advisory check-out lock. NOTE: read-then-write is NOT atomic (the File
   * System Access API has no exclusive-create), so two officers in the same
   * sub-second window can both believe they hold it. This is advisory only —
   * the save path independently conflict-detects, so a lost race cannot lose
   * data; it only weakens the "checked out by" hint. */
  function acquireLock(rec) {
    if (!connected) return Promise.resolve({ ok: true, offline: true });
    return fs.readLock(handle, rec.id).then(function (lock) {
      if (!C.canAcquire(lock, who())) return { ok: false, heldBy: lock.who, since: lock.ts };
      var mine = C.makeLock(rec.id, who());
      return fs.writeLock(handle, mine).then(function () { return { ok: true, lock: mine }; });
    });
  }
  function releaseLock(rec) { if (!connected) return Promise.resolve(true); return fs.clearLock(handle, rec.id); }
  function activity(limit) { if (!connected) return Promise.resolve([]); return fs.readActivity(handle, limit); }

  var CRCaseSync = {
    setBackend: setBackend, isConnected: isConnected, folder: folder, disconnect: disconnect, setWho: setWho,
    saveAll: saveAll, loadAll: loadAll, saveRecord: saveRecord, resolveConflict: resolveConflict,
    acquireLock: acquireLock, releaseLock: releaseLock, activity: activity, relPathFor: relPathFor
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRCaseSync;
  if (typeof window !== "undefined") window.CRCaseSync = CRCaseSync;
})();
