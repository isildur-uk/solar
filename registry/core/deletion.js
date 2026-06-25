/* deletion.js — governed deletion of structured intelligence.
 * Mirrors Atlas: removing an entity is a DELETE if it exists only on this IR,
 * or a DETACH if a matching entity exists on another IR (it persists there).
 * Removing an entity cascades to its links on this IR.
 * Dual export: module.exports + window.RegistryDeletion. */
"use strict";
(function () {
  var MX = (typeof require!=="undefined") ? require("./matching.js") : (typeof window!=="undefined"?window.RegistryMatching:null);

  function si(ir){ return (ir && ir.structuredIntelligence) || { entities:[], links:[] }; }

  // allIrs: every IR in the store (incl. this one). Determine impact of removing
  // entity/link `id` from `ir`.
  function deletionImpact(ir, allIrs, kind, id){
    var S = si(ir);
    if(kind==="link"){
      var lk = S.links.filter(function(l){return l.id===id;})[0];
      return { kind:"link", id:id, action:"delete", elsewhere:[], cascadeLinks:[], label: lk?lk.label:id };
    }
    // entity
    var target = S.entities.filter(function(e){return e.id===id;})[0];
    var cascade = S.links.filter(function(l){return l.from===id || l.to===id;}).map(function(l){return l.id;});
    // build entity-id -> owning IR urn, across all IRs
    var owner = {}; var all = [];
    (allIrs||[]).forEach(function(r){
      (si(r).entities||[]).forEach(function(e){ owner[e.id]=r.urn; all.push(e); });
    });
    var elsewhere = [];
    if(target && MX){
      var masters = MX.buildMasterIndex(all);
      var mine = masters.filter(function(m){ return m.members.indexOf(id)!==-1; })[0];
      if(mine){
        mine.members.forEach(function(mid){
          var u = owner[mid];
          if(mid!==id && u && u!==ir.urn && elsewhere.indexOf(u)===-1) elsewhere.push(u);
        });
      }
    }
    return { kind:"entity", id:id, action: elsewhere.length? "detach":"delete", elsewhere:elsewhere,
             cascadeLinks:cascade, label: target?target.label:id };
  }

  // Apply removal to THIS ir (local effect identical for detach/delete; the
  // distinction is informational + audit, since other IRs keep their own copy).
  function applyDeletion(ir, kind, id){
    var S = si(ir);
    if(kind==="entity"){
      S.entities = S.entities.filter(function(e){return e.id!==id;});
      S.links = S.links.filter(function(l){return l.from!==id && l.to!==id;});
    } else {
      S.links = S.links.filter(function(l){return l.id!==id;});
    }
    return ir;
  }

  var api = { deletionImpact:deletionImpact, applyDeletion:applyDeletion };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryDeletion = api; }
})();
