/* si-model.js — Structured Intelligence (POLE entities + links) for an IR.
 * Mirrors Atlas CM: entity types that create Master Tier entities and whether
 * they are PND-shareable by default; Role in Investigation; PND-share flag;
 * alias/identity handling. Dual export: module.exports + window.RegistrySI. */
"use strict";
(function () {
  // type -> { label, pole(P/O/L/E), pndShareDefault, createsMaster }
  var ENTITY_TYPES = {
    person:           { label:"Person",            pole:"P", pndShareDefault:true,  createsMaster:true },
    organisation:     { label:"Organisation",      pole:"P", pndShareDefault:true,  createsMaster:true },
    vehicle:          { label:"Vehicle",           pole:"O", pndShareDefault:true,  createsMaster:true },
    account:          { label:"Account",           pole:"O", pndShareDefault:false, createsMaster:true },
    communication:    { label:"Communication",     pole:"O", pndShareDefault:true,  createsMaster:true },
    cyber:            { label:"Cyber",             pole:"O", pndShareDefault:true,  createsMaster:true },
    firearm:          { label:"Firearm",           pole:"O", pndShareDefault:false, createsMaster:true },
    official_document:{ label:"Official Document",  pole:"O", pndShareDefault:false, createsMaster:true },
    location:         { label:"Location",          pole:"L", pndShareDefault:true,  createsMaster:true },
    drug:             { label:"Drugs",             pole:"O", pndShareDefault:false, createsMaster:true },
    cash:             { label:"Cash",              pole:"O", pndShareDefault:false, createsMaster:true }
  };

  var ROLES = {
    POI_ACTIVE:           "Person/Party of Interest (PoI) - Active",
    NCA_MANAGED:          "NCA Managed",
    POI_INACTIVE:         "Person/Party of Interest (PoI) - Inactive",
    NON_NCA_CRIMINALITY:  "Non NCA Criminality",
    NON_NCA_MANAGED:      "Non NCA Managed",
    VICTIM:               "Victim",
    WITNESS:              "Witness",
    FEATURES_IN:          "Features In"
  };
  var ROLE_REQUIRED_TYPES = { person:true, organisation:true };

  var PND_SHARE = ["Yes", "No", "Unknown"];

  // Link types grouped; IDENTITY links are exclusive (alias <-> true identity).
  var LINK_TYPES = {
    ASSOCIATE:"Associate of", FAMILY:"Family of", WORKS_FOR:"Works for", USES:"Uses",
    OWNS:"Owns", ACCOUNT_HOLDER:"Account holder", LIVES_AT:"Lives at", LOCATED_AT:"Located at",
    CONTACTED:"Contacted", ALIAS:"Alias", USES_IDENTITY_OF:"Uses identity of", OTHER:"Other"
  };
  var IDENTITY_LINKS = { ALIAS:true, USES_IDENTITY_OF:true };

  function now(){ return new Date().toISOString(); }
  function gid(prefix){ return prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(Math.random()*1e6).toString(36).toUpperCase(); }
  function audit(actor, action, detail){ return { ts:now(), actor:String(actor||"system"), action:String(action||""), detail:String(detail||"") }; }

  function createEntity(opts){
    opts = opts || {};
    var t = ENTITY_TYPES[opts.type] ? opts.type : "person";
    return {
      id: opts.id || gid("ENT"),
      type: t,
      label: opts.label || "",
      attrs: opts.attrs || {},                 // dob, surname, forename, cro, pnc, nino, vrm, accountNumber, number, handle, postcode, companyNumber...
      role: opts.role || (ROLE_REQUIRED_TYPES[t] ? "" : null),
      pndShare: opts.pndShare || (ENTITY_TYPES[t].pndShareDefault ? "Yes" : "Unknown"),
      isAlias: !!opts.isAlias,
      stolenIdentity: !!opts.stolenIdentity,
      authoriserConfirmed: !!opts.authoriserConfirmed,
      audit: [audit(opts.actor, "created", "entity created")]
    };
  }
  function createLink(opts){
    opts = opts || {};
    var t = LINK_TYPES[opts.type] ? opts.type : "OTHER";
    return {
      id: opts.id || gid("LNK"),
      from: opts.from || "",
      to: opts.to || "",
      type: t,
      label: opts.label || LINK_TYPES[t],
      pndShare: opts.pndShare || "Unknown",
      authoriserConfirmed: !!opts.authoriserConfirmed,
      audit: [audit(opts.actor, "created", "link created")]
    };
  }
  function si(ir){ if(!ir.structuredIntelligence) ir.structuredIntelligence={entities:[],links:[]}; return ir.structuredIntelligence; }
  function addEntity(ir, opts){ var e=createEntity(opts); si(ir).entities.push(e); return e; }
  function addLink(ir, opts){ var l=createLink(opts); si(ir).links.push(l); return l; }

  function validateSI(ir){
    var errors=[]; function err(f,m){errors.push({field:f,message:m});}
    var S = si(ir); var byId={};
    S.entities.forEach(function(e,i){
      byId[e.id]=e;
      if(!ENTITY_TYPES[e.type]) err("entities["+i+"].type","Unknown entity type.");
      if(!(e.label&&e.label.trim())) err("entities["+i+"].label","Entity label required.");
      if(ROLE_REQUIRED_TYPES[e.type] && !ROLES[e.role]) err("entities["+i+"].role","Role in Investigation required for "+e.type+".");
      if(PND_SHARE.indexOf(e.pndShare)===-1) err("entities["+i+"].pndShare","PND share must be Yes/No/Unknown.");
    });
    // identity-link exclusivity: an alias may have at most one identity link; no alias<->alias identity link.
    var idLinkCountByEntity={};
    S.links.forEach(function(l,i){
      if(!byId[l.from]) err("links["+i+"].from","Link 'from' references unknown entity.");
      if(!byId[l.to]) err("links["+i+"].to","Link 'to' references unknown entity.");
      if(!LINK_TYPES[l.type]) err("links["+i+"].type","Unknown link type.");
      if(PND_SHARE.indexOf(l.pndShare)===-1) err("links["+i+"].pndShare","PND share must be Yes/No/Unknown.");
      if(IDENTITY_LINKS[l.type]){
        var a=byId[l.from], b=byId[l.to];
        idLinkCountByEntity[l.from]=(idLinkCountByEntity[l.from]||0)+1;
        idLinkCountByEntity[l.to]=(idLinkCountByEntity[l.to]||0)+1;
        if(a&&b&&a.isAlias&&b.isAlias) err("links["+i+"].type","An alias cannot be identity-linked to another alias.");
      }
    });
    Object.keys(idLinkCountByEntity).forEach(function(eid){
      var e=byId[eid];
      if(e&&e.isAlias&&idLinkCountByEntity[eid]>1) err("entities","Alias '"+(e.label||eid)+"' has more than one identity link (only one true identity permitted).");
    });
    return { valid: errors.length===0, errors: errors };
  }

  var api = { ENTITY_TYPES:ENTITY_TYPES, ROLES:ROLES, ROLE_REQUIRED_TYPES:ROLE_REQUIRED_TYPES, PND_SHARE:PND_SHARE,
    LINK_TYPES:LINK_TYPES, IDENTITY_LINKS:IDENTITY_LINKS, createEntity:createEntity, createLink:createLink,
    addEntity:addEntity, addLink:addLink, validateSI:validateSI };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistrySI = api; }
})();
