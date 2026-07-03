/* ir-model.js — the IntelligenceReport record + constants for the Registry.
 * The IR is a container of graded ITEMS (one per source report), plus a graded
 * PROVENANCE statement. Provenance carries its own 3x5x2 but is NEVER charted.
 * Dual export: module.exports (Node) + window.RegistryModel (browser). */
"use strict";
(function () {
  var STATUS = { DRAFT:"DRAFT", PENDING_AUTH:"PENDING_AUTH", AUTHORISED:"AUTHORISED", REJECTED:"REJECTED", SUPPRESSED:"SUPPRESSED" };
  var CONFIDENCE = ["High", "Medium", "Low"];
  var PROTECTIVE_MARKING = ["OFFICIAL", "OFFICIAL-SENSITIVE"];
  var ACTION_CODES = { A1:"Covert development", A2:"Covert use", A3:"Overt use" };
  var SANITISATION_CODES = { S1:"Delegated authority", S2:"Consult originator" };
  // Source/system origin of an item — NCA "Systems" controlled vocabulary
  // (from the Intelligence Logging Tool). Editable; "Other" always available.
  var SOURCE_TYPES = [
    "ANPR", "ATLAS CM", "ATLAS KB", "Companies House", "Cycomms",
    "Dunn & Bradstreet", "DVLA", "Equifax", "Experian", "GBG",
    "IPA Comms Data", "JARD", "Land Registry", "LEA RFI", "Moneyweb/Discover",
    "NBTC Historical Travel", "NBTC Watchlist", "NCA Tasking", "Open Source",
    "PNC", "PNC Vehicle", "PND", "Pre Order Enquiry", "SAR",
    "Section 7 (DPA)", "Surveillance", "CHIS reporting", "Intelligence report", "Other"
  ];

  function now() { return new Date().toISOString(); }
  // URN format IRnnnnnn — six RANDOM digits, guaranteed unique within a session.
  var _issued = {};
  function genUrn() {
    var u;
    do { var x = String(Math.floor(Math.random() * 1000000)); while (x.length < 6) x = "0" + x; u = "IR" + x; } while (_issued[u]);
    _issued[u] = 1;
    return u;
  }
  function auditEntry(actor, action, detail) {
    return { ts: now(), actor: String(actor || "system"), action: String(action || ""), detail: String(detail || "") };
  }
  function coerceProvenance(p) {
    if (p && typeof p === "object") {
      return { text: p.text || "", sourceEval: p.sourceEval || "", intelEval: p.intelEval || "" };
    }
    return { text: typeof p === "string" ? p : "", sourceEval: "", intelEval: "" };
  }
  function createItem(opts) {
    opts = opts || {};
    return { seq: opts.seq || 0, sourceType: opts.sourceType || "Other", text: opts.text || "",
             sourceEval: opts.sourceEval || "", intelEval: opts.intelEval || "" };
  }
  function createIR(opts) {
    opts = opts || {};
    var ir = {
      schema: "registry.ir.v1",
      urn: opts.urn || genUrn(),
      operation: opts.operation || "",
      title: opts.title || "",
      pointOfContact: opts.pointOfContact || "",
      dateOfCollection: opts.dateOfCollection || "",
      dateOfIntelligence: opts.dateOfIntelligence || "",
      dateCreated: opts.dateCreated || "",
      threatBand: opts.threatBand || "",
      submittedBySelf: opts.submittedBySelf !== false,
      threatArea: opts.threatArea || "",
      confidence: opts.confidence || "",
      protectiveMarking: opts.protectiveMarking || "OFFICIAL",
      handling: {
        code: (opts.handling && opts.handling.code) || "",
        instructions: (opts.handling && opts.handling.instructions) || "",
        actionCode: (opts.handling && opts.handling.actionCode) || null,
        sanitisationCode: (opts.handling && opts.handling.sanitisationCode) || null
      },
      sensitiveSource: {
        source: (opts.sensitiveSource && opts.sensitiveSource.source) || "",
        subtype: (opts.sensitiveSource && opts.sensitiveSource.subtype) || "",
        reference: (opts.sensitiveSource && opts.sensitiveSource.reference) || ""
      },
      items: [],
      provenance: coerceProvenance(opts.provenance),
      structuredIntelligence: opts.structuredIntelligence || { entities: [], links: [] },
      riskAssessment: opts.riskAssessment || "",
      status: opts.status || STATUS.DRAFT,
      createdAt: now(),
      updatedAt: now(),
      audit: [auditEntry(opts.actor || "system", "created", "IR created")]
    };
    if (opts.items && opts.items.length) { for (var i = 0; i < opts.items.length; i++) addItem(ir, opts.items[i]); }
    return ir;
  }
  function addItem(ir, itemOpts) { var item = createItem(itemOpts); item.seq = ir.items.length + 1; ir.items.push(item); touch(ir); return item; }
  function addAudit(ir, actor, action, detail) { ir.audit.push(auditEntry(actor, action, detail)); touch(ir); return ir; }
  function touch(ir) { ir.updatedAt = now(); return ir; }
  function chartableItems(ir) { return (ir.items || []).slice(); }

  var api = { STATUS:STATUS, CONFIDENCE:CONFIDENCE, PROTECTIVE_MARKING:PROTECTIVE_MARKING, ACTION_CODES:ACTION_CODES,
    SANITISATION_CODES:SANITISATION_CODES, SOURCE_TYPES:SOURCE_TYPES, genUrn:genUrn, coerceProvenance:coerceProvenance,
    createIR:createIR, createItem:createItem, addItem:addItem, addAudit:addAudit, touch:touch, chartableItems:chartableItems };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryModel = api; }
})();
