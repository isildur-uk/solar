/* matching.js — Master/Lower-tier aggregation engine.
 * Lower entities (per IR/operation) are grouped into Master entities when they
 * share a match signature within the same type (Atlas-style rules: name+DoB,
 * CRO+DoB, PNC, NINO, VRM, account number, company number, postcode+premise).
 * Every entity yields a Master (singletons included).
 * Dual export: module.exports + window.RegistryMatching. */
"use strict";
(function () {
  function norm(s){ return String(s==null?"":s).toLowerCase().replace(/\s+/g," ").trim(); }
  function nospace(s){ return norm(s).replace(/\s/g,""); }
  function nameOf(e){
    var a=e.attrs||{};
    if(a.forename||a.surname) return (norm(a.forename)+" "+norm(a.surname)).trim();
    return norm(e.label);
  }
  function push(arr,rule,sig){ if(sig) arr.push({rule:rule, sig:rule+"::"+sig}); }

  function signatures(e){
    var a=e.attrs||{}, out=[], dob=norm(a.dob), nm=nameOf(e);
    switch(e.type){
      case "person":
        if(nm&&dob) push(out,"name+dob", nm+"|"+dob);
        if(a.cro&&dob) push(out,"cro+dob", nospace(a.cro)+"|"+dob);
        if(a.pnc) push(out,"pnc", nospace(a.pnc));
        if(a.nino) push(out,"nino", nospace(a.nino));
        break;
      case "organisation":
        if(a.companyNumber) push(out,"companyNumber", nospace(a.companyNumber));
        if(nm) push(out,"name", nm);
        break;
      case "vehicle":
        if(a.vrm) push(out,"vrm", nospace(a.vrm));
        break;
      case "account":
        if(a.accountNumber) push(out,"accountNumber", nospace(a.accountNumber));
        break;
      case "communication":
        if(a.number) push(out,"number", nospace(a.number));
        break;
      case "cyber":
        if(a.handle||a.address) push(out,"identifier", norm(a.handle||a.address));
        break;
      case "location":
        var pc=nospace(a.postcode), pn=norm(a.premiseNumber);
        if(pc&&pn) push(out,"premise+postcode", pn+"|"+pc);
        else if(pc) push(out,"postcode", pc);
        break;
      default: break;
    }
    // weak fallback for object/location types only; NEVER person/organisation
    // (avoids false-merging distinct people who happen to share a name) [M1]
    if(!out.length && nm && e.type!=="person" && e.type!=="organisation") push(out,"type+label", nm);
    return out;
  }

  function evaluateMatch(a,b){
    if(!a||!b||a.type!==b.type) return [];
    var setB={}; signatures(b).forEach(function(s){ setB[s.sig]=s.rule; });
    var rules={};
    signatures(a).forEach(function(s){ if(setB[s.sig]) rules[s.rule]=true; });
    return Object.keys(rules);
  }

  function buildMasterIndex(entities){
    entities = entities||[];
    var byType={};
    entities.forEach(function(e){ (byType[e.type]=byType[e.type]||[]).push(e); });
    var masters=[];
    Object.keys(byType).forEach(function(type){
      var list=byType[type];
      var parent=list.map(function(_,i){return i;});
      function find(i){ while(parent[i]!==i){ parent[i]=parent[parent[i]]; i=parent[i]; } return i; }
      function union(i,j){ var ri=find(i),rj=find(j); if(ri!==rj) parent[ri]=rj; }
      var sigMap={}, ruleHits={};
      list.forEach(function(e,i){
        signatures(e).forEach(function(s){
          if(sigMap[s.sig]!==undefined){ union(sigMap[s.sig], i); ruleHits[s.rule]=true; }
          else sigMap[s.sig]=i;
        });
      });
      var comps={};
      list.forEach(function(e,i){ var r=find(i); (comps[r]=comps[r]||[]).push(e); });
      Object.keys(comps).forEach(function(r,ci){
        var members=comps[r];
        // which rules actually linked >1 member within this component
        var rules={};
        if(members.length>1){
          var seen={};
          members.forEach(function(e){ signatures(e).forEach(function(s){ if(seen[s.sig]) rules[s.rule]=true; else seen[s.sig]=true; }); });
        }
        masters.push({
          masterId:"MTR-"+type+"-"+ci,
          type:type,
          label:members[0].label,
          members:members.map(function(e){return e.id;}),
          memberCount:members.length,
          matchedBy:Object.keys(rules)
        });
      });
    });
    return masters;
  }

  var api = { signatures:signatures, evaluateMatch:evaluateMatch, buildMasterIndex:buildMasterIndex, _norm:norm };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryMatching = api; }
})();
