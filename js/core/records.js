/* CHART ROOM — records.js
 * Collaborative intel-log record collections (enquiry, disclosure, action,
 * decision, comms application, subject profile) layered onto the existing
 * CaseStore without modifying model.js: attach() adds store.records + wraps
 * toJSON/fromJSON so records persist in the single-JSON and folder formats.
 * Browser: window.CRRecords. Node: module.exports. Pure data + functions.
 */
(function () {
  "use strict";

  var RECORD_TYPES = {
    enquiry: {
      key: "enquiry", label: "Enquiry", dir: "enquiries", refPrefix: "E", refPad: 4, counter: "enquiry",
      statuses: ["Requested", "Awaiting result", "Result received", "Closed", "Cancelled"],
      initial: "Requested",
      transitions: {
        "Requested": ["Awaiting result", "Result received", "Cancelled"],
        "Awaiting result": ["Result received", "Cancelled"],
        "Result received": ["Closed", "Awaiting result"],
        "Closed": ["Result received"],
        "Cancelled": []
      }
    },
    disclosure: {
      key: "disclosure", label: "Disclosure", dir: "disclosures", refPrefix: "DC", refPad: 5, counter: "disclosure",
      statuses: ["Drafted", "Added to CM", "Closed"],
      initial: "Drafted",
      transitions: { "Drafted": ["Added to CM", "Closed"], "Added to CM": ["Closed", "Drafted"], "Closed": ["Added to CM"] }
    },
    action: {
      key: "action", label: "Action", dir: "actions", refPrefix: "AC", refPad: 6, counter: "action",
      statuses: ["Open", "In progress", "Complete", "Cancelled"],
      initial: "Open",
      transitions: {
        "Open": ["In progress", "Complete", "Cancelled"],
        "In progress": ["Complete", "Cancelled", "Open"],
        "Complete": ["In progress"],
        "Cancelled": ["Open"]
      }
    },
    decision: {
      key: "decision", label: "Decision / log entry", dir: "decisions", refPrefix: "L", refPad: 3, counter: "decision",
      statuses: ["Logged"], initial: "Logged", transitions: { "Logged": [] },
      entryTypes: ["Decision", "Operational Update", "Action Raised", "Action Closed", "Result Received", "Dissemination", "Review", "Other"]
    },
    commsapp: {
      key: "commsapp", label: "Comms data application", dir: "commsapps", refPrefix: "CDA", refPad: 4, counter: "commsapp",
      statuses: ["Drafted", "Sent", "Returned", "Closed", "Rejected"],
      initial: "Drafted",
      transitions: {
        "Drafted": ["Sent", "Rejected"],
        "Sent": ["Returned", "Rejected"],
        "Returned": ["Closed", "Sent"],
        "Closed": ["Returned"],
        "Rejected": ["Drafted"]
      }
    },
    profile: {
      key: "profile", label: "Subject profile", dir: "profiles", refPrefix: "SP", refPad: 4, counter: "profile",
      statuses: ["Draft", "In review", "Published"],
      initial: "Draft",
      transitions: { "Draft": ["In review"], "In review": ["Published", "Draft"], "Published": ["Draft", "In review"] }
    }
  };

  var COLLECTIONS = Object.keys(RECORD_TYPES);

  function emptyRecords() { var o = {}; COLLECTIONS.forEach(function (k) { o[k] = []; }); return o; }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function now() { return new Date().toISOString(); }
  function genId(prefix) { return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }

  function nextRef(store, typeKey) {
    var t = RECORD_TYPES[typeKey];
    store.meta = store.meta || {};
    store.meta.counters = store.meta.counters || {};
    var n = (store.meta.counters[t.counter] || 0) + 1;
    store.meta.counters[t.counter] = n;
    return t.refPrefix + pad(n, t.refPad);
  }

  function makeRecord(store, typeKey, spec, who) {
    var t = RECORD_TYPES[typeKey];
    if (!t) throw new Error("Unknown record type: " + typeKey);
    spec = spec || {};
    who = who || spec.owner || "";
    return {
      id: spec.id || genId(typeKey),
      type: typeKey,
      ref: spec.ref || nextRef(store, typeKey),
      status: spec.status || t.initial,
      owner: spec.owner || who || "",
      assignee: spec.assignee || "",
      createdBy: who || "",
      createdAt: now(),
      modifiedBy: who || "",
      modifiedAt: now(),
      version: 1,
      data: spec.data || {},
      audit: [{ ts: now(), who: who || "", action: "created", detail: t.label }]
    };
  }

  /* Attach record collections to a CaseStore and make toJSON/fromJSON carry them.
   * Idempotent: safe to call repeatedly; only patches serialisation once. */
  function attach(store) {
    if (!store) return store;
    if (!store.records) store.records = emptyRecords();
    else COLLECTIONS.forEach(function (k) { if (!store.records[k]) store.records[k] = []; });
    store.meta = store.meta || {};
    store.meta.counters = store.meta.counters || {};

    if (!store._recordsPatched && typeof store.toJSON === "function" && typeof store.fromJSON === "function") {
      store._recordsPatched = true;
      var origTo = store.toJSON.bind(store);
      store.toJSON = function () {
        var o = origTo();
        o.records = store.records;       // meta (with counters) already included by origTo
        o.recordsSchema = 2;
        return o;
      };
      var origFrom = store.fromJSON.bind(store);
      store.fromJSON = function (obj) {
        origFrom(obj);                   // restores meta (incl. counters), entities, links, events
        store.records = (obj && obj.records) ? obj.records : emptyRecords();
        COLLECTIONS.forEach(function (k) { if (!store.records[k]) store.records[k] = []; });
        store.meta.counters = store.meta.counters || {};
      };
    }
    return store;
  }

  function add(store, typeKey, spec, who) {
    attach(store);
    var rec = makeRecord(store, typeKey, spec, who);
    store.records[typeKey].push(rec);
    if (typeof store._emit === "function") store._emit("record:add");
    return rec;
  }
  function list(store, typeKey) { attach(store); return store.records[typeKey] || []; }
  function get(store, typeKey, id) { return list(store, typeKey).find(function (r) { return r.id === id; }) || null; }
  function getByRef(store, typeKey, ref) { return list(store, typeKey).find(function (r) { return r.ref === ref; }) || null; }
  function remove(store, typeKey, id) {
    attach(store);
    store.records[typeKey] = store.records[typeKey].filter(function (r) { return r.id !== id; });
    if (typeof store._emit === "function") store._emit("record:remove");
  }

  var CRRecords = {
    RECORD_TYPES: RECORD_TYPES, COLLECTIONS: COLLECTIONS,
    emptyRecords: emptyRecords, makeRecord: makeRecord, nextRef: nextRef,
    attach: attach, add: add, list: list, get: get, getByRef: getByRef, remove: remove,
    genId: genId, pad: pad
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CRRecords;
  if (typeof window !== "undefined") window.CRRecords = CRRecords;
})();
