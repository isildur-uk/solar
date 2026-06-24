/* CHART ROOM — fsaccess.js
 * File System Access API wrapper for the shared "case folder" (Edge/Chromium —
 * estate-standard). Reads/writes per-record JSON, advisory lock files, and the
 * activity trail. Feature-detected: callers fall back to the existing
 * single-file download/upload where the API is unavailable or blocked by policy.
 * Browser only (guarded for Node so model/test loads stay clean).
 * Browser: window.CRFs.
 */
(function () {
  "use strict";

  function supported() {
    return (typeof window !== "undefined") && typeof window.showDirectoryPicker === "function";
  }

  async function pickFolder() {
    if (!supported()) throw new Error("showDirectoryPicker unavailable");
    return await window.showDirectoryPicker({ mode: "readwrite" });
  }

  async function getDir(handle, name, create) {
    return await handle.getDirectoryHandle(name, { create: !!create });
  }

  /* Write JSON at a relative path like "enquiries/abc.json", creating dirs. */
  async function writeJSONPath(rootHandle, relPath, obj) {
    var parts = relPath.split("/");
    var fileName = parts.pop();
    var dir = rootHandle;
    for (var i = 0; i < parts.length; i++) dir = await getDir(dir, parts[i], true);
    var fh = await dir.getFileHandle(fileName, { create: true });
    var w = await fh.createWritable();
    await w.write(JSON.stringify(obj, null, 1));
    await w.close();
    return true;
  }

  async function readJSONPath(rootHandle, relPath) {
    var parts = relPath.split("/");
    var fileName = parts.pop();
    var dir = rootHandle;
    for (var i = 0; i < parts.length; i++) dir = await getDir(dir, parts[i], false);
    var fh = await dir.getFileHandle(fileName, { create: false });
    var f = await fh.getFile();
    return JSON.parse(await f.text());
  }

  /* Recursively collect every *.json under root as { relPath: object }.
   * Skips control entries (anything starting "_": _locks, _activity) so the
   * case load never ingests locks or audit lines as records. */
  async function readAllJSON(rootHandle, prefix) {
    prefix = prefix || "";
    var out = {};
    for await (var entry of rootHandle.values()) {
      var name = entry.name;
      if (name.indexOf("_") === 0) continue;
      var rel = prefix ? prefix + "/" + name : name;
      if (entry.kind === "directory") {
        var sub = await readAllJSON(entry, rel);
        Object.keys(sub).forEach(function (k) { out[k] = sub[k]; });
      } else if (/\.json$/i.test(name)) {
        try { var f = await entry.getFile(); out[rel] = JSON.parse(await f.text()); }
        catch (e) { /* skip unreadable/corrupt file rather than fail the whole load */ }
      }
    }
    return out;
  }

  /* ---- advisory locks: _locks/<recordId>.lock ---- */
  async function writeLock(rootHandle, lock) {
    await writeJSONPath(rootHandle, "_locks/" + lock.recordId + ".lock", lock);
    return true;
  }
  async function readLock(rootHandle, recordId) {
    try { return await readJSONPath(rootHandle, "_locks/" + recordId + ".lock"); }
    catch (e) { return null; }
  }
  async function clearLock(rootHandle, recordId) {
    try { var dir = await getDir(rootHandle, "_locks", true); await dir.removeEntry(recordId + ".lock"); }
    catch (e) { /* already gone */ }
    return true;
  }

  /* ---- activity trail: one file per entry under _activity/ ----
   * Append-as-new-file (not read-modify-write of a single log) so concurrent
   * writers never lose each other's audit lines. */
  async function appendActivity(rootHandle, entry) {
    var dir = await getDir(rootHandle, "_activity", true);
    var stamp = String(entry && entry.ts || new Date().toISOString()).replace(/[:.]/g, "-");
    var name = stamp + "_" + Math.random().toString(36).slice(2, 8) + ".json";
    var fh = await dir.getFileHandle(name, { create: true });
    var w = await fh.createWritable();
    await w.write(JSON.stringify(entry));
    await w.close();
    return true;
  }
  async function readActivity(rootHandle, limit) {
    var rows = [];
    try {
      var dir = await getDir(rootHandle, "_activity", false);
      for await (var entry of dir.values()) {
        if (entry.kind === "file" && /\.json$/i.test(entry.name)) {
          try { var f = await entry.getFile(); rows.push(JSON.parse(await f.text())); }
          catch (e) { /* skip bad line-file */ }
        }
      }
    } catch (e) { return []; }
    rows.sort(function (a, b) { return (a.ts < b.ts) ? -1 : 1; });
    if (limit && rows.length > limit) rows = rows.slice(rows.length - limit);
    return rows;
  }

  var CRFs = {
    supported: supported, pickFolder: pickFolder,
    writeJSONPath: writeJSONPath, readJSONPath: readJSONPath, readAllJSON: readAllJSON,
    writeLock: writeLock, readLock: readLock, clearLock: clearLock,
    appendActivity: appendActivity, readActivity: readActivity
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRFs;
  if (typeof window !== "undefined") window.CRFs = CRFs;
})();
