/* handoff.js — Phase 4: the Registry -> SOLAR boundary.
 *  - toHandoff(ir): the versioned `system.ir.v1` contract (report header +
 *    GRADED items + structured intelligence). Provenance is NEVER included
 *    (it is never charted). This is the documented interop/audit payload.
 *  - toSolarCase(irs): converts one or many IRs into a SOLAR chart_room case
 *    JSON that SOLAR opens with zero changes. Entities are DEDUPLICATED across
 *    reports via the Master/Lower engine (one SOLAR node per Master), and links
 *    are remapped onto the master ids — delivering the Master-tier payoff.
 *  - toSpine(irs): converts IR(s) into shared-spine (SolarCase) parts so Database
 *    can push its entities into the one shared case (provenance never included).
 * Dual export: module.exports + window.RegistryHandoff. */
"use strict";
(function () {
  var G  = (typeof require!=="undefined") ? require("./grading.js")  : (typeof window!=="undefined"?window.RegistryGrading:null);
  var MX = (typeof require!=="undefined") ? require("./matching.js") : (typeof window!=="undefined"?window.RegistryMatching:null);
  var SC = (typeof require!=="undefined") ? require("../../js/core/solar-case.js") : (typeof window!=="undefined"?window.SolarCase:null);

  // Registry entity type -> SOLAR entity type
  var TYPE_MAP = {
    person:"person", organisation:"organisation", vehicle:"vehicle", account:"account",
    location:"address", firearm:"weapon", official_document:"document",
    communication:"phone", cyber:"ip", drug:"drug", cash:"money"
  };
  // Registry link type -> SOLAR link type (SOLAR falls back to LINKED_TO anyway)
  var LINK_MAP = {
    ASSOCIATE:"ASSOCIATE_OF", FAMILY:"FAMILY_OF", WORKS_FOR:"EMPLOYS", USES:"USES",
    OWNS:"OWNS", ACCOUNT_HOLDER:"HOLDS", LIVES_AT:"LOCATED_IN", LOCATED_AT:"LOCATED_IN",
    CONTACTED:"COMMUNICATED_WITH", ALIAS:"LINKED_TO", USES_IDENTITY_OF:"LINKED_TO", OTHER:"LINKED_TO"
  };

  function asArray(x){ return Array.isArray(x) ? x : [x]; }
  function si(ir){ return (ir && ir.structuredIntelligence) || { entities:[], links:[] }; }
  function itemGrade(ir, g){ return G ? G.code(g.sourceEval, g.intelEval, (ir.handling&&ir.handling.code)||"P") : ""; }

  /* The contract. Provenance deliberately omitted. */
  function toHandoff(ir){
    var S = si(ir);
    return {
      schema: "system.ir.v1",
      generatedAt: new Date().toISOString(),
      report: {
        urn: ir.urn, operation: ir.operation || "", title: ir.title, dateOfCollection: ir.dateOfCollection,
        threatArea: ir.threatArea, confidence: ir.confidence,
        protectiveMarking: ir.protectiveMarking, handlingCode: ir.handling && ir.handling.code,
        status: ir.status
      },
      items: (ir.items||[]).map(function(it){
        return { seq:it.seq, sourceType:it.sourceType, text:it.text,
                 sourceEval:it.sourceEval, intelEval:it.intelEval, grade:itemGrade(ir,it) };
      }),
      // provenance intentionally excluded — never charted
      entities: S.entities.map(function(e){ return JSON.parse(JSON.stringify(e)); }),
      links: S.links.map(function(l){ return JSON.parse(JSON.stringify(l)); })
    };
  }

  function highestMarking(irs){
    var order = { "OFFICIAL":0, "OFFICIAL-SENSITIVE":1, "SECRET":2 }, best="OFFICIAL";
    irs.forEach(function(ir){ if((order[ir.protectiveMarking]||0) > order[best]) best=ir.protectiveMarking; });
    return best;
  }

  /* Convert IR(s) into a SOLAR chart_room case, deduplicated by Master entity. */
  function toSolarCase(irs, opts){
    opts = opts || {};
    irs = asArray(irs).filter(Boolean);
    if(opts.onlyAuthorised) irs = irs.filter(function(ir){ return ir.status==="AUTHORISED"; });

    // gather all SI entities + remember owning IR
    var allEnts = [], ownerUrn = {}, handlingByUrn = {}, operationByUrn = {};
    irs.forEach(function(ir){ handlingByUrn[ir.urn] = (ir.handling && ir.handling.code) || "P"; operationByUrn[ir.urn] = ir.operation || ""; si(ir).entities.forEach(function(e){ allEnts.push(e); ownerUrn[e.id]=ir.urn; }); });

    // Master index -> map each lower entity id to its master + representative
    var masters = MX ? MX.buildMasterIndex(allEnts) : [];
    var lowerToMaster = {}, masterById = {}, entById = {};
    allEnts.forEach(function(e){ entById[e.id]=e; });
    masters.forEach(function(m){ masterById[m.masterId]=m; m.members.forEach(function(id){ lowerToMaster[id]=m.masterId; }); });
    // per-export nonce so ids from separate exports never collide if charted together
    var nonce = "RX" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random()*1296).toString(36).toUpperCase();
    var nodeIdOf = {}; masters.forEach(function(m){ nodeIdOf[m.masterId] = nonce + "-" + m.masterId; });

    // Build one SOLAR node per master
    var solarEntities = masters.map(function(m){
      var members = m.members.map(function(id){ return entById[id]; }).filter(Boolean);
      var rep = members[0] || {};
      var mergedAttrs = {}; var roles = {}, urns = {}, ops = {}, anyShareYes=false, anyAlias=false;
      members.forEach(function(e){
        Object.keys(e.attrs||{}).forEach(function(k){ if(mergedAttrs[k]==null && e.attrs[k]!=null) mergedAttrs[k]=e.attrs[k]; });
        if(e.role) roles[e.role]=true;
        if(e.pndShare==="Yes") anyShareYes=true;
        if(e.isAlias) anyAlias=true;
        var u = ownerUrn[e.id]; if(u){ urns[u]=true; if(operationByUrn[u]) ops[operationByUrn[u]]=true; }
      });
      mergedAttrs.registryRole = Object.keys(roles).join(", ");
      mergedAttrs.pndShare = anyShareYes ? "Yes" : "No";
      if(anyAlias) mergedAttrs.alias = true;
      mergedAttrs.registrySourceUrns = Object.keys(urns).join(", ");
      mergedAttrs.registryOperations = Object.keys(ops).join(", ");
      return {
        id: nodeIdOf[m.masterId],
        type: TYPE_MAP[m.type] || "note",
        label: rep.label || "",
        attrs: mergedAttrs,
        ids: {},
        geo: null,
        media: [],
        provenance: { handling: Object.keys(urns).some(function(u){ return handlingByUrn[u]==="C"; }) ? "C" : "P" },
        sourceText: "Registry master of " + members.length + " entity(ies) across IR(s): " + Object.keys(urns).join(", "),
        audit: [{ ts:new Date().toISOString(), action:"created", detail:"registry-handoff" }]
      };
    });

    // Build links remapped to master ids, de-duplicated, no self-loops
    var seen = {}, solarLinks = [];
    irs.forEach(function(ir){
      si(ir).links.forEach(function(l){
        var from = nodeIdOf[lowerToMaster[l.from]], to = nodeIdOf[lowerToMaster[l.to]];
        if(!from || !to || from===to) return;            // skip if endpoint missing or collapsed to same master
        var type = LINK_MAP[l.type] || "LINKED_TO";
        var key = from + "|" + to + "|" + type;
        if(seen[key]) return; seen[key]=true;
        solarLinks.push({
          id: "lnk_" + key.replace(/[^a-zA-Z0-9]/g,"").slice(0,40) + "_" + solarLinks.length,
          from: from, to: to, type: type, direction:"->", confidence:"med",
          dateISO:null, modality:null, negated:false, amount:null,
          label: l.label || "", sentence:"",
          audit:[{ ts:new Date().toISOString(), action:"created", detail:"registry-handoff" }]
        });
      });
    });

    var nowISO = new Date().toISOString();
    return {
      app: "chart_room", version: 1,
      meta: {
        name: opts.caseName || ("Registry import (" + irs.length + " report" + (irs.length===1?"":"s") + ")"),
        classification: highestMarking(irs),
        created: nowISO, modified: nowISO, dateFormat: "DMY", officer: "Registry handoff"
      },
      entities: solarEntities,
      links: solarLinks,
      events: []
    };
  }

  /* Registry entity type -> shared-spine (SolarCase) generic type. Kept aligned
   * with the Analyse comms-case types (location, phone, vehicle...) so the SAME
   * real-world entity contributed from Database, Analyse or Charting collapses to
   * one spine node. Provenance is deliberately absent — the spine never carries it. */
  var SPINE_TYPE = {
    person:"person", organisation:"organisation", vehicle:"vehicle", account:"account",
    location:"location", firearm:"weapon", official_document:"document",
    communication:"phone", cyber:"ip", drug:"drug", cash:"money"
  };
  function norm(s){ return String(s==null?"":s).toLowerCase().replace(/\s+/g," ").trim(); }
  function spineEid(type, identity, label){ return "E:" + norm(type) + "|" + (norm(identity) || norm(label)); }

  /* Convert IR(s) into shared-spine parts ({entities,links}) for SolarCase.merge.
   * Master/Lower dedup collapses repeats across reports; ids follow SolarCase's
   * scheme so they merge idempotently with spine entries from other functions. */
  function toSpine(irs, opts){
    opts = opts || {};
    irs = asArray(irs).filter(Boolean);
    if(opts.onlyAuthorised) irs = irs.filter(function(ir){ return ir.status==="AUTHORISED"; });

    var allEnts = [];
    irs.forEach(function(ir){ si(ir).entities.forEach(function(e){ allEnts.push(e); }); });
    var entById = {}; allEnts.forEach(function(e){ entById[e.id]=e; });
    var masters = MX ? MX.buildMasterIndex(allEnts) : [];

    var lowerToSpine = {}, spineEntities = [], seenE = {};
    masters.forEach(function(m){
      var members = m.members.map(function(id){ return entById[id]; }).filter(Boolean);
      var rep = members[0] || {};
      var type = SPINE_TYPE[m.type] || "note";
      var label = rep.label || "";
      var id = (SC && SC.entityId)
        ? SC.entityId({ type:type, label:label, identity:label })
        : spineEid(type, label, label);
      var attrs = {};
      members.forEach(function(e){ Object.keys(e.attrs||{}).forEach(function(k){ if(attrs[k]==null && e.attrs[k]!=null) attrs[k]=e.attrs[k]; }); });
      m.members.forEach(function(mid){ lowerToSpine[mid] = id; });
      if(!seenE[id]){ seenE[id]=true; spineEntities.push({ id:id, type:type, label:label, identity:label, attrs:attrs, source:"registry" }); }
    });

    var seenL = {}, spineLinks = [];
    irs.forEach(function(ir){ si(ir).links.forEach(function(l){
      var from = lowerToSpine[l.from], to = lowerToSpine[l.to];
      if(!from || !to || from===to) return;
      var type = LINK_MAP[l.type] || "LINKED_TO";
      var key = from + "|" + norm(type) + "|" + to;
      if(seenL[key]) return; seenL[key]=true;
      spineLinks.push({ id:"L:"+key, from:from, to:to, type:type, label:l.label||"" });
    }); });

    return { entities: spineEntities, links: spineLinks };
  }

  var api = { TYPE_MAP:TYPE_MAP, LINK_MAP:LINK_MAP, SPINE_TYPE:SPINE_TYPE, toHandoff:toHandoff, toSolarCase:toSolarCase, toSpine:toSpine };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryHandoff = api; }
})();
