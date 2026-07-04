/* watchlist.js — Silent Hit List. Entities flagged "of interest" are matched
 * (via the same signature engine as Master/Lower) against every report's
 * structured intelligence; each match is a silent hit surfaced on a worklist.
 * Persists to localStorage with in-memory fallback (Node-testable). No DOM.
 * Dual export: module.exports + window.RegistryWatchlist. */
"use strict";
(function () {
  var MX = (typeof require !== "undefined") ? require("./matching.js") : (typeof window !== "undefined" ? window.RegistryMatching : null);
  var KEY = "reg_watchlist", mem = [];
  function store(){ try { return (typeof window!=="undefined" && window.localStorage) ? window.localStorage : null; } catch(e){ return null; } }
  function load(){ var s=store(); if(!s) return mem.slice(); try { return JSON.parse(s.getItem(KEY)||"[]"); } catch(e){ return []; } }
  function save(arr){ var s=store(); if(!s){ mem=arr.slice(); return; } try { s.setItem(KEY, JSON.stringify(arr)); } catch(e){ mem=arr.slice(); } }

  function add(entity, meta){
    entity=entity||{}; meta=meta||{};
    var sigs = MX ? MX.signatures(entity).map(function(s){ return s.sig; }) : [];
    var row = { id:"WATCH-"+Date.now().toString(36).toUpperCase()+"-"+Math.floor(Math.random()*1e6).toString(36).toUpperCase(),
      label:entity.label||"", type:entity.type||"person", dob:(entity.attrs&&entity.attrs.dob)||"",
      sigs:sigs, note:meta.note||"", addedBy:meta.addedBy||"", addedAt:new Date().toISOString() };
    var arr=load(); arr.unshift(row); save(arr); return row;
  }
  function list(){ return load(); }
  function remove(id){ save(load().filter(function(w){ return w.id!==id; })); }
  function has(entity){ var sigs = MX ? MX.signatures(entity).map(function(s){return s.sig;}) : []; if(!sigs.length) return false;
    return load().some(function(w){ return w.type===entity.type && w.sigs.some(function(s){ return sigs.indexOf(s)!==-1; }); }); }

  // For each watch entry, find matching entities across all reports (same type + shared signature).
  function scan(reports){
    var wl=load(), out=[];
    wl.forEach(function(w){
      var hits=[];
      (reports||[]).forEach(function(r){
        (((r.structuredIntelligence)||{}).entities||[]).forEach(function(e){
          if(e.type!==w.type || !MX) return;
          var esigs=MX.signatures(e).map(function(s){ return s.sig; });
          var shared=esigs.filter(function(sg){ return w.sigs.indexOf(sg)!==-1; });
          if(shared.length) hits.push({ urn:r.urn, title:r.title||"", operation:r.operation||"",
            date:r.dateOfIntelligence||r.dateOfCollection||"", entityId:e.id, label:e.label, matchedBy:shared });
        });
      });
      out.push({ watch:w, hits:hits, hitCount:hits.length });
    });
    return out;
  }
  var api={ add:add, list:list, remove:remove, has:has, scan:scan };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryWatchlist = api; }
})();
