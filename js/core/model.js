/* CHART ROOM — model.js
 * Case data model: entities, links, events, audit trail, provenance (NCA 3×5×2),
 * merge/deconfliction, undo, JSON serialisation, localStorage persistence.
 * Browser: window.CRModel (requires CRMatch). Node: module.exports.
 */
(function () {
  "use strict";

  var M = (typeof window !== "undefined" && window.CRMatch) ||
          (typeof require === "function" ? require("./match.js") : null);

  // labels follow i2 Analyst's Notebook type names; sem = i2 semantic type
  var ENTITY_TYPES = {
    person:       { label: "Person",        i2: "Person",        sem: "Person",          colour: "#6ea8d8", icon: "P" },
    phone:        { label: "Telephone",     i2: "Telephone",     sem: "Phone",           colour: "#79c98f", icon: "T" },
    email:        { label: "Email Address", i2: "Email Address", sem: "",                colour: "#cf9285", icon: "@" },
    address:      { label: "Address",       i2: "Address",       sem: "Mailing Address", colour: "#9aa5b1", icon: "A" },
    location:     { label: "Location",      i2: "Location",      sem: "Location",        colour: "#5fc4c0", icon: "L" },
    organisation: { label: "Organization",  i2: "Organization",  sem: "Organization",    colour: "#d8a16e", icon: "O" },
    vehicle:      { label: "Vehicle",       i2: "Vehicle",       sem: "Motor Vehicle",   colour: "#c9c36a", icon: "V" },
    weapon:       { label: "Weapon",        i2: "Weapon",        sem: "Weapon",          colour: "#d86e6e", icon: "!" },
    drug:         { label: "Drugs",         i2: "Object",        sem: "Object",          colour: "#a88f7a", icon: "*" },
    account:      { label: "Bank Account",  i2: "Bank Account",  sem: "Bank Account",    colour: "#d87f9b", icon: "£" },
    date:         { label: "Date",          i2: "Event",         sem: "Event",           colour: "#8d99ae", icon: "D" },
    money:        { label: "Cash",          i2: "Cash",          sem: "",                colour: "#a8c97f", icon: "£" },
    ip:           { label: "IP Address",    i2: "IP Address",    sem: "",                colour: "#7fb0c9", icon: "#" },
    document:     { label: "Document",      i2: "Document",      sem: "",                colour: "#b1a08d", icon: "■" },
    event:        { label: "Event",         i2: "Event",         sem: "Event",           colour: "#e0995e", icon: "E" },
    note:         { label: "Text Block",    i2: "Text Block",    sem: "",                colour: "#d9c87a", icon: "N" }
  };

  var LINK_TYPES = [
    "USES", "ASSOCIATE_OF", "COMMUNICATED_WITH", "TRANSACTED_WITH",
    "TRAVELS_TO", "DEPARTS_FROM", "STAYS_AT", "LOCATED_IN", "PHONE_OF",
    "OWNS", "HOLDS", "REPRESENTS", "POSSESSES", "EMPLOYS", "FAMILY_OF", "CO_LOCATED_WITH", "JOURNEY_WITH", "LINKED_TO"
  ];

  var F = (typeof window !== "undefined" && window.CRFormat) ||
          (typeof require === "function" ? require("./format.js") : null);

  var St = (typeof window !== "undefined" && window.CRStandards) ||
          (typeof require === "function" ? require("./cm-standards.js") : null);

  // NCA 3×5×2: source evaluation 1–3, intelligence assessment A–E, handling P/C
  function defaultProvenance() {
    return { source: "2", assessment: "C", handling: "P", conditions: "", sourceRef: "", gradedBy: "" };
  }

  function now() { return new Date().toISOString(); }
  var _seq = 0;
  function genId(prefix) {
    _seq++;
    return prefix + "_" + Date.now().toString(36) + "_" + _seq.toString(36);
  }

  function CaseStore() {
    this.meta = {
      name: "Untitled case",
      classification: "OFFICIAL",
      created: now(),
      modified: now(),
      dateFormat: "DMY"
    };
    this.entities = [];
    this.links = [];
    this.events = [];
    this._undo = [];
    this._listeners = [];
  }

  CaseStore.prototype.onChange = function (fn) { this._listeners.push(fn); };
  CaseStore.prototype._emit = function (what) {
    this.meta.modified = now();
    this._listeners.forEach(function (fn) { try { fn(what); } catch (e) { /* listener errors must not corrupt state */ } });
  };

  CaseStore.prototype.snapshot = function () {
    this._undo.push(JSON.stringify({ entities: this.entities, links: this.links, events: this.events }));
    if (this._undo.length > 50) this._undo.shift();
  };

  CaseStore.prototype.undo = function () {
    var s = this._undo.pop();
    if (!s) return false;
    var o;
    try { o = JSON.parse(s); } catch (e) { return false; }
    this.entities = o.entities; this.links = o.links; this.events = o.events;
    this._emit("undo");
    return true;
  };

  /* ---------------- entities ---------------- */

  CaseStore.prototype.addEntity = function (spec) {
    var e = {
      id: spec.id || genId("ent"),
      type: spec.type,
      label: String(spec.label || "").slice(0, 200),
      attrs: spec.attrs || {},
      ids: spec.ids || {},
      geo: spec.geo || null,
      media: spec.media || [],
      provenance: F ? F.migrateProvenance(spec.provenance) : (spec.provenance || defaultProvenance()),
      sourceText: spec.sourceText || "",
      audit: [{ ts: now(), action: "created", detail: spec.origin || "manual" }]
    };
    // canonical identifiers for exact matching
    if (e.type === "phone" && !e.ids.e164) e.ids.e164 = M.normalisePhone(e.label).e164;
    if (e.type === "email" && !e.ids.email) e.ids.email = M.normaliseEmail(e.label);
    // CM canonical identifiers + recognised-term tagging (drives chart intelligence)
    if (St) {
      if (e.type === "vehicle" && !e.ids.vrm) e.ids.vrm = St.identifiers.vrm.canonical(e.label);
      if (e.type === "person") {
        var _ctx = [e.label, e.sourceText, e.attrs && e.attrs.notes].filter(Boolean).join(" ");
        if (_ctx) {
          if (!e.attrs.cmStatus) { var _st = St.detectStatus(_ctx).map(function (x) { return x.code; }); if (_st.length) e.attrs.cmStatus = _st; }
          if (!e.attrs.cmWarnings) { var _wn = St.detectWarningSignals(_ctx).map(function (x) { return x.code; }); if (_wn.length) e.attrs.cmWarnings = _wn; }
        }
      }
    }
    this.entities.push(e);
    this._emit("entity:add");
    return e;
  };

  CaseStore.prototype.getEntity = function (id) {
    return this.entities.find(function (e) { return e.id === id; }) || null;
  };

  CaseStore.prototype.updateEntity = function (id, patch, detail) {
    var e = this.getEntity(id);
    if (!e) return null;
    Object.keys(patch).forEach(function (k) {
      if (k === "id" || k === "audit") return;
      e[k] = patch[k];
    });
    e.audit.push({ ts: now(), action: "updated", detail: detail || Object.keys(patch).join(",") });
    this._emit("entity:update");
    return e;
  };

  CaseStore.prototype.removeEntity = function (id) {
    this.entities = this.entities.filter(function (e) { return e.id !== id; });
    this.links = this.links.filter(function (l) { return l.from !== id && l.to !== id; });
    this.events.forEach(function (ev) {
      ev.entityIds = (ev.entityIds || []).filter(function (x) { return x !== id; });
    });
    this._emit("entity:remove");
  };

  /* ---------------- links ---------------- */

  CaseStore.prototype.addLink = function (spec) {
    var self = this;
    if (!this.getEntity(spec.from) || !this.getEntity(spec.to)) return null;
    // collapse duplicates
    var existing = this.links.find(function (l) {
      return l.from === spec.from && l.to === spec.to && l.type === spec.type;
    });
    if (existing) return existing;
    var l = {
      id: spec.id || genId("lnk"),
      from: spec.from, to: spec.to,
      type: LINK_TYPES.indexOf(spec.type) !== -1 ? spec.type : "LINKED_TO",
      direction: spec.direction || "->",
      confidence: spec.confidence || "med",
      dateISO: spec.dateISO || null,
      modality: spec.modality || null,
      negated: !!spec.negated,
      amount: spec.amount || null,
      label: spec.label || "",
      sentence: spec.sentence || "",
      audit: [{ ts: now(), action: "created", detail: spec.origin || "manual" }]
    };
    // i2 fidelity: stamp i2 link type, semantic type, and meta direction
    if (St) { var _lm = St.linkMeta(l.type); l.i2 = _lm.i2; l.sem = _lm.sem; if (!spec.direction && _lm.dir) l.direction = _lm.dir; }
    this.links.push(l);
    this._emit("link:add");
    return l;
  };

  CaseStore.prototype.updateLink = function (id, patch, detail) {
    var l = this.links.find(function (x) { return x.id === id; });
    if (!l) return null;
    Object.keys(patch).forEach(function (k) {
      if (k === "id" || k === "audit") return;
      l[k] = patch[k];
    });
    l.audit.push({ ts: now(), action: "updated", detail: detail || Object.keys(patch).join(",") });
    this._emit("link:update");
    return l;
  };

  CaseStore.prototype.removeLink = function (id) {
    this.links = this.links.filter(function (l) { return l.id !== id; });
    this._emit("link:remove");
  };

  /* ---------------- events (timeline) ---------------- */

  CaseStore.prototype.addEvent = function (spec) {
    var ev = {
      id: spec.id || genId("evt"),
      dateISO: spec.dateISO,
      label: String(spec.label || "").slice(0, 200),
      entityIds: spec.entityIds || [],
      origin: spec.origin || "manual"
    };
    if (!ev.dateISO) return null;
    // de-dupe identical events
    var dup = this.events.find(function (x) { return x.dateISO === ev.dateISO && x.label === ev.label; });
    if (dup) return dup;
    this.events.push(ev);
    this.events.sort(function (a, b) { return a.dateISO < b.dateISO ? -1 : 1; });
    this._emit("event:add");
    return ev;
  };

  CaseStore.prototype.removeEvent = function (id) {
    this.events = this.events.filter(function (e) { return e.id !== id; });
    this._emit("event:remove");
  };

  /* ---------------- merge / deconfliction ---------------- */

  /** Merge drop into keep: union attrs, ids, links, events, audit trails. */
  CaseStore.prototype.mergeEntities = function (keepId, dropId) {
    var keep = this.getEntity(keepId), drop = this.getEntity(dropId);
    if (!keep || !drop || keep === drop) return null;
    this.snapshot();
    Object.keys(drop.attrs).forEach(function (k) {
      if (keep.attrs[k] === undefined) keep.attrs[k] = drop.attrs[k];
    });
    Object.keys(drop.ids).forEach(function (k) {
      if (!keep.ids[k]) keep.ids[k] = drop.ids[k];
    });
    if (!keep.geo && drop.geo) keep.geo = drop.geo;
    if (drop.sourceText && keep.sourceText.indexOf(drop.sourceText) === -1) {
      keep.sourceText = (keep.sourceText ? keep.sourceText + "\n---\n" : "") + drop.sourceText;
    }
    if (drop.label !== keep.label) {
      keep.attrs.aka = keep.attrs.aka ? keep.attrs.aka + "; " + drop.label : drop.label;
    }
    var self = this;
    this.links.forEach(function (l) {
      if (l.from === dropId) l.from = keepId;
      if (l.to === dropId) l.to = keepId;
    });
    // remove self-links and duplicates created by the rewire
    var seen = {};
    this.links = this.links.filter(function (l) {
      if (l.from === l.to) return false;
      var k = l.from + "|" + l.to + "|" + l.type;
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    this.events.forEach(function (ev) {
      ev.entityIds = (ev.entityIds || []).map(function (x) { return x === dropId ? keepId : x; });
    });
    keep.audit.push({ ts: now(), action: "merged", detail: "absorbed " + drop.label + " (" + dropId + ")" });
    drop.audit.forEach(function (a) { keep.audit.push(a); });
    this.entities = this.entities.filter(function (e) { return e.id !== dropId; });
    this._emit("entity:merge");
    return keep;
  };

  /** Mark two entities as confirmed-distinct so deconfliction stops suggesting them. */
  CaseStore.prototype.markDistinct = function (idA, idB) {
    var e = this.getEntity(idA);
    if (!e) return;
    e.attrs._distinctFrom = (e.attrs._distinctFrom ? e.attrs._distinctFrom + "," : "") + idB;
    this._emit("entity:update");
  };

  /** Chart-wide duplicate scan. Returns [{a, b, score, tier, reasons}]. */
  CaseStore.prototype.findDuplicates = function () {
    var out = [];
    var ents = this.entities;
    for (var i = 0; i < ents.length; i++) {
      for (var j = i + 1; j < ents.length; j++) {
        var a = ents[i], b = ents[j];
        if (a.type !== b.type) continue;
        var dist = String(a.attrs._distinctFrom || "");
        if (dist.indexOf(b.id) !== -1) continue;
        var distB = String(b.attrs._distinctFrom || "");
        if (distB.indexOf(a.id) !== -1) continue;
        var matches = M.matchEntity(
          { type: a.type, label: a.label, ids: a.ids, attrs: a.attrs }, [b]);
        if (matches.length) {
          out.push({ a: a, b: b, score: matches[0].score, tier: matches[0].tier, reasons: matches[0].reasons });
        }
      }
    }
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  };

  /* ---------------- serialisation ---------------- */

  CaseStore.prototype.toJSON = function () {
    return {
      app: "chart_room", version: 1,
      meta: this.meta,
      entities: this.entities,
      links: this.links,
      events: this.events
    };
  };

  CaseStore.prototype.fromJSON = function (obj) {
    if (!obj || (obj.app !== "chart_room" && obj.app !== "solar")) throw new Error("Not a Solar case file");
    this.meta = obj.meta || this.meta;
    this.entities = obj.entities || [];
    this.links = obj.links || [];
    this.events = obj.events || [];
    // migrate legacy provenance + guarantee media array
    this.entities.forEach(function (e) {
      if (F) e.provenance = F.migrateProvenance(e.provenance);
      if (!e.media) e.media = [];
    });
    this._undo = [];
    this._emit("load");
  };

  /* ---------------- media (photos etc. assigned to entities) ------------- */

  CaseStore.prototype.addMedia = function (entityId, item) {
    var e = this.getEntity(entityId);
    if (!e) return null;
    if (!e.media) e.media = [];
    var med = {
      id: genId("med"),
      name: String(item.name || "image").slice(0, 80),
      dataUrl: item.dataUrl,
      sourceRef: item.sourceRef || "",
      ts: now(),
      face: !!item.face
    };
    if (med.face) e.media.forEach(function (x) { x.face = false; });
    if (!e.media.length) med.face = true;          // first photo becomes the node face
    e.media.push(med);
    e.audit.push({ ts: now(), action: "media added", detail: med.name });
    this._emit("entity:update");
    return med;
  };

  CaseStore.prototype.setFace = function (entityId, mediaId) {
    var e = this.getEntity(entityId);
    if (!e || !e.media) return;
    e.media.forEach(function (x) { x.face = x.id === mediaId; });
    e.audit.push({ ts: now(), action: "node face changed" });
    this._emit("entity:update");
  };

  CaseStore.prototype.removeMedia = function (entityId, mediaId) {
    var e = this.getEntity(entityId);
    if (!e || !e.media) return;
    e.media = e.media.filter(function (x) { return x.id !== mediaId; });
    e.audit.push({ ts: now(), action: "media removed" });
    this._emit("entity:update");
  };

  CaseStore.prototype.clear = function () {
    this.snapshot();
    this.entities = []; this.links = []; this.events = [];
    this._emit("clear");
  };

  /* ---------------- localStorage persistence (browser only) ---------------- */

  var LS_KEY = "chart_room_case_v1";
  CaseStore.prototype.saveLocal = function () {
    if (typeof localStorage === "undefined") return false;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.toJSON()));
      return true;
    } catch (e) { return false; }
  };
  CaseStore.prototype.loadLocal = function () {
    if (typeof localStorage === "undefined") return false;
    try {
      var s = localStorage.getItem(LS_KEY);
      if (!s) return false;
      this.fromJSON(JSON.parse(s));
      return true;
    } catch (e) { return false; }
  };

  var CRModel = {
    CaseStore: CaseStore,
    ENTITY_TYPES: ENTITY_TYPES,
    LINK_TYPES: LINK_TYPES,
    defaultProvenance: defaultProvenance,
    genId: genId
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRModel;
  if (typeof window !== "undefined") window.CRModel = CRModel;
})();
