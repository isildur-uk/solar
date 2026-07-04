/* dossier.js — consolidated nominal ("View Person") record. Aggregates every
 * appearance of a person across all reports via the Master/Lower matching engine,
 * merging identifiers, aliases, associates, locations, comms, vehicles, accounts,
 * and a dated timeline of appearances. Pure (Node-testable); no DOM.
 * Dual export: module.exports + window.RegistryDossier. */
"use strict";
(function () {
  var MX = (typeof require !== "undefined") ? require("./matching.js")   : (typeof window !== "undefined" ? window.RegistryMatching : null);
  var V  = (typeof require !== "undefined") ? require("./ir-validate.js"): (typeof window !== "undefined" ? window.RegistryValidate : null);

  function siOf(r){ return (r && r.structuredIntelligence) || { entities:[], links:[] }; }
  function attr(e,k){ return (e && e.attrs && e.attrs[k]) || ""; }
  function uniqPush(arr,v){ if(v && arr.indexOf(v)===-1) arr.push(v); }

  // Build the dossier for the master person that contains seedId.
  function buildDossier(reports, seedId){
    reports = reports || [];
    var personCtx=[];
    reports.forEach(function(r){ siOf(r).entities.forEach(function(e){ if(e.type==="person") personCtx.push({e:e,r:r}); }); });
    if(!personCtx.length || !MX) return null;
    var masters = MX.buildMasterIndex(personCtx.map(function(x){return x.e;}));
    var master=null; masters.forEach(function(m){ if(m.members.indexOf(seedId)!==-1) master=m; });
    var memberSet={}; (master ? master.members : [seedId]).forEach(function(id){ memberSet[id]=1; });
    var members = personCtx.filter(function(x){ return memberSet[x.e.id]; });
    if(!members.length) return null;

    var d = { key: master ? master.masterId : seedId, primaryName: members[0].e.label, names:[], dob:"",
      identifiers:{ pnc:[], cro:[], nino:[], passport:[] }, roles:[], matchedBy: master ? master.matchedBy : [],
      reportCount:0, appearances:[], associates:[], locations:[], comms:[], vehicles:[], accounts:[], cyber:[], aliases:[] };
    var seenReports={};
    members.forEach(function(x){
      var e=x.e, r=x.r;
      uniqPush(d.names, e.label);
      if(!d.dob && attr(e,"dob")) d.dob = attr(e,"dob");
      ["pnc","cro","nino","passport"].forEach(function(k){ uniqPush(d.identifiers[k], attr(e,k)); });
      if(e.role) uniqPush(d.roles, e.role);
      if(e.isAlias) uniqPush(d.aliases, e.label);
      seenReports[r.urn]=1;
      var g = (V && V.reportGrade) ? V.reportGrade(r) : null;
      d.appearances.push({ urn:r.urn, title:r.title||"", operation:r.operation||"",
        date:r.dateOfIntelligence||r.dateOfCollection||"", grade: g ? (g.sourceEval+g.intelEval) : "",
        role:e.role||"", entityId:e.id });
      var byId={}; siOf(r).entities.forEach(function(en){ byId[en.id]=en; });
      siOf(r).links.forEach(function(l){
        var other=null; if(l.from===e.id) other=byId[l.to]; else if(l.to===e.id) other=byId[l.from];
        if(!other) return;
        var bucket = { person:d.associates, location:d.locations, communication:d.comms,
                       vehicle:d.vehicles, account:d.accounts, cyber:d.cyber }[other.type];
        if(bucket && !bucket.some(function(b){ return b.label===other.label; }))
          bucket.push({ label:other.label, type:other.type, urn:r.urn, dob:attr(other,"dob"), link:l.type });
      });
    });
    d.reportCount = Object.keys(seenReports).length;
    d.appearances.sort(function(a,b){ return String(a.date) < String(b.date) ? -1 : 1; });
    return d;
  }

  var api = { buildDossier: buildDossier };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryDossier = api; }
})();
