/* CHART ROOM — collab.js
 * Collaboration spine shared by every record type: ownership/assignment,
 * per-type status state machines, advisory check-out locks, version-on-save
 * conflict detection, activity entries, and "my work" filters.
 * Pure logic (no DOM, no file IO) so it is fully Node-testable. The file IO
 * (lock files, _activity.log) lives in fsaccess.js; this only produces the
 * objects those writers persist. NOTE: detectConflict/canAcquire/makeLock are
 * consumed by the forthcoming folder save/sync path (next slice); wired here so
 * that path reads-disk -> detectConflict -> lock before write (not yet called).
 * objects those writers persist.
 * Browser: window.CRCollab. Node: module.exports.
 */
(function () {
  "use strict";

  var R = (typeof window !== "undefined" && window.CRRecords) ||
          (typeof require === "function" ? require("./records.js") : null);

  var store = null;
  function now() { return new Date().toISOString(); }
  function init(s) { store = s; if (R && R.attach) R.attach(s); return s; }
  function typeDef(typeKey) { return R && R.RECORD_TYPES[typeKey]; }

  /* ---------------- status workflow ---------------- */
  function canTransition(typeKey, from, to) {
    var t = typeDef(typeKey);
    if (!t || from === to) return false;
    if (t.statuses.indexOf(to) === -1) return false;
    var allowed = (t.transitions && t.transitions[from]) || [];
    return allowed.indexOf(to) !== -1;
  }

  function _stamp(rec, who) {
    rec.modifiedBy = who || "";
    rec.modifiedAt = now();
    rec.version = (rec.version || 1) + 1;
    rec.audit = rec.audit || [];
  }
  function _activity(rec, who, action, detail) {
    return { ts: now(), who: who || "", recordType: rec.type, recordId: rec.id, ref: rec.ref, action: action, detail: detail || "" };
  }

  function transition(rec, to, who) {
    if (!rec) return { ok: false, error: "no record" };
    var from = rec.status;
    if (!canTransition(rec.type, from, to)) return { ok: false, error: "illegal transition " + from + " → " + to };
    rec.status = to;
    _stamp(rec, who);
    rec.audit.push({ ts: now(), who: who || "", action: "status", detail: from + " → " + to });
    return { ok: true, activity: _activity(rec, who, "status", from + " → " + to) };
  }

  function touch(rec, who, detail) {
    _stamp(rec, who);
    rec.audit.push({ ts: now(), who: who || "", action: "edit", detail: detail || "" });
    return _activity(rec, who, "edit", detail || "");
  }
  function assign(rec, who, assignee) {
    var prev = rec.assignee || "";
    rec.assignee = assignee || "";
    _stamp(rec, who);
    rec.audit.push({ ts: now(), who: who || "", action: "assign", detail: (prev || "—") + " → " + (assignee || "—") });
    return _activity(rec, who, "assign", assignee || "");
  }
  function setOwner(rec, who, owner) {
    var prev = rec.owner || "";
    rec.owner = owner || "";
    _stamp(rec, who);
    rec.audit.push({ ts: now(), who: who || "", action: "owner", detail: (prev || "—") + " → " + (owner || "—") });
    return _activity(rec, who, "owner", owner || "");
  }

  /* ---------------- advisory check-out locks ---------------- */
  var LOCK_TTL_MS = 30 * 60 * 1000; // 30 min; stale locks may be stolen
  function makeLock(recordId, who) { return { recordId: recordId, who: who || "", ts: now() }; }
  function lockAgeMs(lock, refIso) {
    if (!lock || !lock.ts) return Infinity;
    var ref = refIso ? new Date(refIso) : new Date();
    return ref.getTime() - new Date(lock.ts).getTime();
  }
  function isExpired(lock, refIso, ttl) { return lockAgeMs(lock, refIso) > (ttl || LOCK_TTL_MS); }
  /* Acquire if: no lock, you already hold it (re-entrant), or it is stale. */
  function canAcquire(lock, who, refIso, ttl) {
    if (!lock) return true;
    if (lock.who === who) return true;
    return isExpired(lock, refIso, ttl);
  }

  /* ---------------- conflict detection (version-on-save) ---------------- */
  /* baseVersion = version the editor loaded; diskRec = record currently on disk. */
  function detectConflict(baseVersion, diskRec) {
    if (!diskRec) return { conflict: false, reason: "new" };
    if (typeof baseVersion !== "number") return { conflict: false, reason: "no-base" };
    if (diskRec.version === baseVersion) return { conflict: false, reason: "unchanged" };
    return { conflict: true, reason: "disk v" + diskRec.version + " ≠ base v" + baseVersion, diskVersion: diskRec.version };
  }
  /* Field-level diff over status/owner/assignee + the data bag. */
  function diff(a, b) {
    var out = []; a = a || {}; b = b || {};
    ["status", "owner", "assignee"].forEach(function (k) {
      if ((a[k] || "") !== (b[k] || "")) out.push({ field: k, a: a[k] || "", b: b[k] || "" });
    });
    var ad = a.data || {}, bd = b.data || {}, keys = {};
    Object.keys(ad).forEach(function (k) { keys[k] = 1; });
    Object.keys(bd).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      if (JSON.stringify(ad[k]) !== JSON.stringify(bd[k])) out.push({ field: "data." + k, a: ad[k], b: bd[k] });
    });
    return out;
  }

  /* ---------------- filters ---------------- */
  /* "Not active work" for dashboards. Records can still be re-opened (the
   * transition graph allows it); this reflects current state, not finality.
   * "Logged" (decision/log entries) is included so the case log does not
   * pollute open-item counts forever. */
  var TERMINAL = { Closed: 1, Complete: 1, Published: 1, Cancelled: 1, Rejected: 1, Logged: 1 };
  function _all(s) {
    s = s || store; var out = [];
    if (!s || !s.records) return out;
    R.COLLECTIONS.forEach(function (k) { (s.records[k] || []).forEach(function (r) { out.push(r); }); });
    return out;
  }
  function myWork(s, who) {
    return _all(s).filter(function (r) { return r.assignee === who || r.owner === who; })
      .sort(function (x, y) { return (x.modifiedAt < y.modifiedAt) ? 1 : -1; });
  }
  function openItems(s) { return _all(s).filter(function (r) { return !TERMINAL[r.status]; }); }
  function isTerminal(status) { return !!TERMINAL[status]; }

  var CRCollab = {
    init: init, canTransition: canTransition, transition: transition, touch: touch,
    assign: assign, setOwner: setOwner,
    makeLock: makeLock, isExpired: isExpired, canAcquire: canAcquire, lockAgeMs: lockAgeMs, LOCK_TTL_MS: LOCK_TTL_MS,
    detectConflict: detectConflict, diff: diff,
    myWork: myWork, openItems: openItems, isTerminal: isTerminal
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRCollab;
  if (typeof window !== "undefined") window.CRCollab = CRCollab;
})();
