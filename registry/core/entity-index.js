/* entity-index.js — cross-report entity resolution for Entity Management.
 * Master tier = resolved unique entities (clustered across every report via the
 * signature engine); Lower tier = the raw per-report entities. Powers the
 * Master/Lower search and the comparison-match review. Pure (Node-testable).
 * Dual export: module.exports + window.RegistryEntityIndex. */
"use strict";
(function () {
  var MX = (typeof require !== "undefined") ? require("./matching.js") : (typeof window !== "undefined" ? window.RegistryMatching : null);

  function buildEntityIndex(reports){
    reports = reports || [];
    var lower = [];   // {e, urn, operation, title}
    reports.forEach(function(r){
      (((r.structuredIntelligence)||{}).entities||[]).forEach(function(e){
        lower.push({ e:e, urn:r.urn, operation:r.operation||"", title:r.title||"" });
      });
    });
    var ctxById = {}; lower.forEach(function(x){ ctxById[x.e.id]=x; });
    var masters = MX ? MX.buildMasterIndex(lower.map(function(x){ return x.e; })) : [];
    masters.forEach(function(m){
      m.memberEntities = m.members.map(function(id){ return ctxById[id]; }).filter(Boolean)
        .map(function(x){ return { entityId:x.e.id, label:x.e.label, type:x.e.type, attrs:x.e.attrs||{},
          role:x.e.role||"", confirmed:!!x.e.authoriserConfirmed, urn:x.urn, operation:x.operation, title:x.title }; });
      m.confirmed = m.memberEntities.length>0 && m.memberEntities.every(function(me){ return me.confirmed; });
    });
    return { masters:masters, lower:lower, entityCount:lower.length, masterCount:masters.length };
  }
  var api={ buildEntityIndex:buildEntityIndex };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryEntityIndex = api; }
})();
