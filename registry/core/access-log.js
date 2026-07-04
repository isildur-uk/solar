/* access-log.js — lawful-access audit trail. Every sensitive lookup (entity
 * search, nominal dossier) is recorded with reason + justification + on-behalf-of,
 * mirroring the real Entity Search gate. Persists to localStorage with an
 * in-memory fallback (so it is Node-testable). No DOM.
 * Dual export: module.exports + window.RegistryAccessLog. */
"use strict";
(function () {
  var KEY = "reg_access_log", mem = [];
  function store(){ try { return (typeof window!=="undefined" && window.localStorage) ? window.localStorage : null; } catch(e){ return null; } }
  function load(){ var s=store(); if(!s) return mem.slice(); try { return JSON.parse(s.getItem(KEY)||"[]"); } catch(e){ return []; } }
  function save(arr){ var s=store(); if(!s){ mem=arr.slice(); return; } try { s.setItem(KEY, JSON.stringify(arr)); } catch(e){ mem=arr.slice(); } }
  function record(entry){
    entry = entry || {};
    var row = { ts:new Date().toISOString(), actor:String(entry.actor||"—"), action:String(entry.action||""),
      target:String(entry.target||""), reason:String(entry.reason||""), justification:String(entry.justification||""),
      onBehalfOf:String(entry.onBehalfOf||"Self") };
    var arr=load(); arr.unshift(row); if(arr.length>500) arr=arr.slice(0,500); save(arr); return row;
  }
  var REASONS=["Intelligence development","Operational tasking","Research / scoping","Disclosure","Threat to life","Vetting / integrity","Other"];
  var api={ record:record, list:function(){ return load(); }, clear:function(){ save([]); }, REASONS:REASONS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryAccessLog = api; }
})();
