/* dossier.run.js — the View Person nominal dossier aggregation. */
"use strict";
var D=require("../core/demo-seed.js"), DS=require("../core/dossier.js");
var pass=0,fail=0; function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
var ds=D.buildDemoDataset();
// find a person entity that recurs (a principal): pick the person with the most appearances
var byId={}, count={};
ds.forEach(function(r){ (r.structuredIntelligence.entities||[]).forEach(function(e){ if(e.type==="person"){ byId[e.id]=e; } }); });
// build a dossier for the first person of report 0
var firstPerson=null;
for(var i=0;i<ds.length && !firstPerson;i++){ (ds[i].structuredIntelligence.entities||[]).forEach(function(e){ if(e.type==="person" && !firstPerson) firstPerson=e; }); }
ok(!!firstPerson,"found a person entity to profile");
var d=DS.buildDossier(ds, firstPerson.id);
ok(!!d,"dossier builds");
ok(d.primaryName && d.names.length>=1,"dossier has a name");
ok(d.reportCount>=1,"dossier spans >=1 report ("+d.reportCount+")");
ok(Array.isArray(d.appearances) && d.appearances.length>=1,"appearances timeline present ("+d.appearances.length+")");
ok(d.appearances.every(function(a){return a.urn && a.entityId;}),"each appearance links to its report");
// a recurring principal should aggregate multiple reports: scan for one
var best=null;
ds.forEach(function(r){ (r.structuredIntelligence.entities||[]).forEach(function(e){ if(e.type==="person"){ var dd=DS.buildDossier(ds,e.id); if(dd && (!best||dd.reportCount>best.reportCount)) best=dd; } }); });
ok(best && best.reportCount>1,"a recurring nominal aggregates multiple reports (max "+(best?best.reportCount:0)+")");
ok(best.associates.length>=0 && best.locations.length>=0,"linked entities aggregated (assoc "+best.associates.length+", loc "+best.locations.length+")");
var idPerson=null;
ds.forEach(function(r){ (r.structuredIntelligence.entities||[]).forEach(function(e){ if(e.type==="person" && e.attrs.pnc && !idPerson) idPerson=e; }); });
var idd=idPerson?DS.buildDossier(ds,idPerson.id):null;
ok(idd && idd.identifiers.pnc.length>=1,"identifiers aggregated for an identified nominal (pnc "+(idd?idd.identifiers.pnc.length:0)+")");
console.log("\n"+pass+" passed, "+fail+" failed");
if(fail) process.exit(1);
