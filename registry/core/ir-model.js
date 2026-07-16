/* ir-model.js — the IntelligenceReport record + constants for the Registry.
 * The IR is a container of graded ITEMS (one per source report), plus a graded
 * PROVENANCE statement. Provenance carries its own 3x5x2 but is NEVER charted.
 * Dual export: module.exports (Node) + window.RegistryModel (browser). */
"use strict";
(function () {
  var TT = (typeof require !== "undefined")
    ? require("./threat-taxonomy.js")
    : (typeof window !== "undefined" ? window.RegistryThreatTaxonomy : null);

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
  // Normalise a threats input into an array of { family, subtype, band } triples.
  // Accepts: an array (of strings or objects), a single string/object, or a
  // legacy (threatArea + threatBand) pair. Back-compat entry point for callers
  // that still speak the old single-threat model.
  function coerceThreats(input, legacyBand) {
    function one(v) {
      var t = TT ? TT.parse(v) : (v && typeof v === "object"
        ? { family: v.family || "", subtype: v.subtype || "", band: v.band || null }
        : { family: String(v || ""), subtype: "", band: null });
      if (!t.band && legacyBand != null && legacyBand !== "") {
        t.band = TT ? TT.normBand(legacyBand) : ("Band " + String(legacyBand));
      }
      return t;
    }
    if (Array.isArray(input)) return input.filter(function (x) { return x != null && x !== ""; }).map(one);
    if (input != null && input !== "") return [one(input)];
    return [];
  }
  // The back-compat threat normaliser: returns the effective typed threats for
  // an IR, preferring an explicit threats[] array but falling back to the legacy
  // threatArea/threatBand fields so old callers never crash.
  function threatsOf(ir) {
    if (!ir || typeof ir !== "object") return [];
    if (Array.isArray(ir.threats) && ir.threats.length) return ir.threats.map(function (t) { return coerceThreats(t)[0]; });
    if (ir.threatArea) return coerceThreats(ir.threatArea, ir.threatBand);
    return [];
  }
  function createItem(opts) {
    opts = opts || {};
    return { seq: opts.seq || 0, sourceType: opts.sourceType || "Other", text: opts.text || "",
             sourceEval: opts.sourceEval || "", intelEval: opts.intelEval || "",
             // isProvenance flags an inline assessment/provenance item (never charted,
             // graded on its own axis); primarySource marks item 1 by convention.
             isProvenance: !!opts.isProvenance, primarySource: !!opts.primarySource };
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
      // Threats: the authoritative structured list [{family,subtype,band}].
      // Legacy threatArea / threatBand are retained and mirrored for existing
      // readers (app.js, query.js, repository.js, demo-seed.js, handoff.js).
      threats: [],
      threatBand: opts.threatBand || "",
      submittedBySelf: opts.submittedBySelf !== false,
      threatArea: opts.threatArea || "",
      confidence: opts.confidence || "",
      protectiveMarking: opts.protectiveMarking || "OFFICIAL",
      // IH03 F01 header additions.
      sre: opts.sre || opts.sourceReferenceNo || "",
      sourceReferenceNo: opts.sourceReferenceNo || opts.sre || "",
      isrNumber: opts.isrNumber || "",
      pii: opts.pii === true,
      gsc: (opts.gsc != null ? opts.gsc : null),
      authoriser: opts.authoriser || "",
      dateAuthorised: opts.dateAuthorised || "",
      reviewDate: opts.reviewDate || "",
      crossRefUrn: opts.crossRefUrn || "",
      flags: {
        disseminated: !!(opts.flags && opts.flags.disseminated),
        riskAssessment: !!(opts.flags && opts.flags.riskAssessment),
        charted: !!(opts.flags && opts.flags.charted)
      },
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
    // Populate the structured threats[]: explicit opts.threats wins, otherwise
    // derive from the legacy threatArea (+ threatBand). Where threats[] is the
    // source, mirror threatArea/threatBand back onto the legacy fields so old
    // readers keep working.
    if (opts.threats != null) {
      ir.threats = coerceThreats(opts.threats);
      if (!opts.threatArea && ir.threats.length && TT) { ir.threatArea = TT.format({ family: ir.threats[0].family, subtype: ir.threats[0].subtype, band: null }); }
      if (!opts.threatBand && ir.threats.length && ir.threats[0].band) { ir.threatBand = String(ir.threats[0].band).replace(/[^1-4]/g, ""); }
    } else {
      ir.threats = coerceThreats(opts.threatArea, opts.threatBand);
    }
    if (opts.items && opts.items.length) { for (var i = 0; i < opts.items.length; i++) addItem(ir, opts.items[i]); }
    return ir;
  }
  function addItem(ir, itemOpts) {
    var item = createItem(itemOpts);
    item.seq = ir.items.length + 1;
    // Primary-source marker convention: item 1 is the primary source unless a
    // caller says otherwise or explicitly flags it as an inline provenance item.
    if (item.seq === 1 && !(itemOpts && itemOpts.primarySource === false) && !item.isProvenance) item.primarySource = true;
    ir.items.push(item);
    touch(ir);
    return item;
  }
  function addAudit(ir, actor, action, detail) { ir.audit.push(auditEntry(actor, action, detail)); touch(ir); return ir; }
  function touch(ir) { ir.updatedAt = now(); return ir; }
  function chartableItems(ir) { return (ir.items || []).slice(); }

  var api = { STATUS:STATUS, CONFIDENCE:CONFIDENCE, PROTECTIVE_MARKING:PROTECTIVE_MARKING, ACTION_CODES:ACTION_CODES,
    SANITISATION_CODES:SANITISATION_CODES, SOURCE_TYPES:SOURCE_TYPES, genUrn:genUrn, coerceProvenance:coerceProvenance,
    coerceThreats:coerceThreats, threatsOf:threatsOf,
    createIR:createIR, createItem:createItem, addItem:addItem, addAudit:addAudit, touch:touch, chartableItems:chartableItems };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryModel = api; }
})();
