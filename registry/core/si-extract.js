/* si-extract.js — ALIGNMENT ADAPTER. Converts the SOLAR extraction engine's
 * output (window.CRExtract.extract → {entities, relationships}) into the
 * registry's Structured Intelligence schema (si-model entities + links), so the
 * DATABASE generates structured intelligence with the SAME engine and quality
 * as the CHART. Pure mapping (Node-testable); no DOM.
 * Dual export: module.exports (Node) + window.RegistrySIExtract (browser). */
"use strict";
(function () {
  var SI = (typeof require !== "undefined") ? require("./si-model.js")
         : (typeof window !== "undefined" ? window.RegistrySI : null);

  // SOLAR extract entity type -> registry SI entity type. Types with no SI
  // equivalent (drug/money/date/event/note) are intentionally skipped for now.
  var TYPE_MAP = {
    person:"person", organisation:"organisation", vehicle:"vehicle", account:"account",
    location:"location", address:"location", phone:"communication", email:"cyber",
    ip:"cyber", weapon:"firearm", document:"official_document", drug:"drug", money:"cash"
  };
  // SOLAR relationship type -> registry SI link type key.
  var LINK_MAP = {
    USES:"USES", PHONE_OF:"USES", ASSOCIATE_OF:"ASSOCIATE", JOURNEY_WITH:"ASSOCIATE",
    COMMUNICATED_WITH:"CONTACTED", OWNS:"OWNS", POSSESSES:"OWNS", HOLDS:"ACCOUNT_HOLDER",
    EMPLOYS:"WORKS_FOR", REPRESENTS:"WORKS_FOR", FAMILY_OF:"FAMILY",
    LIVES_AT:"LIVES_AT", STAYS_AT:"LIVES_AT", LOCATED_IN:"LOCATED_AT", CO_LOCATED_WITH:"LOCATED_AT"
  };

  function isoToDMY(s){ var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||"")); return m ? m[3]+"/"+m[2]+"/"+m[1] : (s||""); }

  // Map a SOLAR entity's attrs to registry SI attrs (keep identifiers usable by
  // the matcher + dossier). Unknown keys are preserved under attrs verbatim.
  function mapAttrs(type, e){
    var a = e.attrs || {}, out = {};
    Object.keys(a).forEach(function(k){ if(k.charAt(0)!=="_") out[k]=a[k]; });
    if (a.dob) out.dob = isoToDMY(a.dob);
    if (type === "communication") out.number = a.cm || a.raw || e.value || e.label;
    if (type === "cyber")         out.handle = e.value || e.label;
    if (type === "vehicle")       out.vrm = String(a.cm || e.label || "").replace(/^VRM\s+/i, "");
    if (type === "location" && a.postcode) out.postcode = a.postcode;
    if (type === "drug")  { out.substance = e.label; if(a.quantity) out.quantity = a.quantity; }
    if (type === "cash")  { out.amount = a.cm || e.value || e.label; }
    out._auto = true;                 // flags an unconfirmed, engine-generated entity
    out._ref = e.ref;                 // provenance back to the extraction
    if (e.confidence) out._confidence = e.confidence;
    return out;
  }

  function fromExtraction(res, opts){
    opts = opts || {};
    res = res || {};
    var out = { entities: [], links: [], skipped: [] };
    if (!SI) return out;
    var refToId = {};
    (res.entities || []).forEach(function(e){
      var t = TYPE_MAP[e.type];
      if (!t) { out.skipped.push({ ref:e.ref, type:e.type, label:e.label }); return; }
      var role = SI.ROLE_REQUIRED_TYPES[t] ? "FEATURES_IN" : null;   // neutral default; analyst upgrades
      var ent = SI.createEntity({ type:t, label:e.label || e.value || "(unnamed)", role:role,
        attrs: mapAttrs(t, e), actor: opts.actor || "engine" });
      refToId[e.ref] = ent.id;
      out.entities.push(ent);
    });
    (res.relationships || []).forEach(function(r){
      var from = refToId[r.sourceRef], to = refToId[r.targetRef];
      if (!from || !to || from === to) return;         // endpoint skipped or self-link
      var lt = LINK_MAP[r.type] || "OTHER";
      out.links.push(SI.createLink({ from:from, to:to, type:lt, actor: opts.actor || "engine" }));
    });
    return out;
  }

  var api = { fromExtraction: fromExtraction, TYPE_MAP: TYPE_MAP, LINK_MAP: LINK_MAP };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistrySIExtract = api; }
})();
