/* audit.run.js — exact/exhaustive forensic audit of the demo dataset (all 480).
 * COLP IR rules + ATLAS CM identifier formats (validated via cm-standards, the
 * single source of truth) + determinism + extraction recall/precision.
 * Deliberate, demoMeta-labelled discrepancies are whitelisted (a logged conflict
 * is expected; an UNlogged one is a bug). Run: node audit.run.js  */
"use strict";
var D=require("../core/demo-seed.js"), V=require("../core/ir-validate.js"), SI=require("../core/si-model.js"),
    IM=require("../core/ir-model.js"), S=require("../../js/core/cm-standards.js"), X=require("../../js/core/extract.js");
var fails={}, ex={}, seen={};
function f(rule,cond,sample){ if(!(rule in fails)){fails[rule]=0;seen[rule]=0;} seen[rule]++; if(!cond){ fails[rule]++; if(!ex[rule]) ex[rule]=String(sample).slice(0,160); } }
var SUPPORTED="person phone email address location organisation vehicle weapon drug account date money ip document event note".split(" ");
var SRC=IM.SOURCE_TYPES;

// ---- determinism: two builds byte-identical ----
var b1=JSON.stringify(D.buildDemoDataset().map(function(ir){return [ir.items.map(function(i){return i.sourceType+"|"+i.text+"|"+i.sourceEval+i.intelEval;})];}));
var ds=D.buildDemoDataset();
var b2=JSON.stringify(ds.map(function(ir){return [ir.items.map(function(i){return i.sourceType+"|"+i.text+"|"+i.sourceEval+i.intelEval;})];}));
f("DETERMINISM: two builds identical", b1===b2, "builds differ");

// ---- value-collision guard: distinct nominals must not share identifiers (bridges excepted) ----
var pncOwner={};
ds.forEach(function(ir){ var subj=(ir.structuredIntelligence.entities||[]).filter(function(e){return e.type==="person"&&e.role==="POI_ACTIVE";})[0];
  if(subj&&subj.attrs.pnc){ var key=subj.attrs.pnc; var who=subj.label+"|"+subj.attrs.dob; pncOwner[key]=pncOwner[key]||{}; pncOwner[key][who]=1; } });
var pncClash=Object.keys(pncOwner).filter(function(k){return Object.keys(pncOwner[k]).length>1;});
f("COLLISION: each PNC maps to one nominal", pncClash.length===0, pncClash.slice(0,3).join(" ; "));

ds.forEach(function(ir){
  var body=ir.items.map(function(it){return it.text;}).join("\n");
  var disc=(ir.demoMeta&&ir.demoMeta.discrepancies)||[];
  var oddTokens={}; disc.forEach(function(d){ if(d.value) oddTokens[String(d.value)]=d.kind; });
  function isOdd(tok){ for(var k in oddTokens){ if(k.indexOf(tok)!==-1||tok.indexOf(k)!==-1) return true; } return false; }

  // COLP
  f("COLP: validateIR passes", V.validateIR(ir).valid, ir.urn+" "+JSON.stringify(V.validateIR(ir).errors||[]));
  f("COLP: validateSI passes", SI.validateSI(ir).valid, ir.urn+" "+JSON.stringify(SI.validateSI(ir).errors||[]));
  f("COLP: title present, no OP prefix", !!ir.title&&!/^OP /.test(ir.title), ir.title);
  f("COLP: protective marking valid", IM.PROTECTIVE_MARKING.indexOf(ir.protectiveMarking)>=0, ir.protectiveMarking);
  f("COLP: provenance graded 1-3/A-E", /^[1-3]$/.test(""+ir.provenance.sourceEval)&&/^[A-E]$/.test(""+ir.provenance.intelEval), ir.urn);
  ir.items.forEach(function(it){
    f("COLP: item sourceEval 1-3", /^[1-3]$/.test(""+it.sourceEval), it.text);
    f("COLP: item intelEval A-E", /^[A-E]$/.test(""+it.intelEval), it.text);
    f("COLP: item source type recognised", SRC.indexOf(it.sourceType)>=0, it.sourceType+" :: "+it.text);
    f("COLP: item self-contained (names a person)", /[A-Z][a-z]+ [A-Z]{2,}/.test(it.text)||/[A-Z]{2,}, [A-Z][a-z]+/.test(it.text), it.text);
    f("COLP: item non-trivial >20 chars", it.text.trim().length>20, it.text);
  });
  if(ir.handling&&ir.handling.code==="C"){ f("COLP: code C action A1-A3", /^A[123]$/.test(""+ir.handling.actionCode), ir.urn); f("COLP: code C sanitisation S1-S2", /^S[12]$/.test(""+ir.handling.sanitisationCode), ir.urn); }

  // ATLAS CM identifier formats (skip demoMeta-labelled non-CM tokens)
  (body.match(/\bDOB (\d{2}\/\d{2}\/\d{4})/g)||[]).forEach(function(x){ f("CM: DOB valid", S.dateValid(x.slice(4)), x); });
  (body.match(/\bPNC (\d[\w\/]*)/g)||[]).forEach(function(x){ var v=x.slice(4); f("CM: PNC valid", S.identifiers.pnc.validate(v), x); });
  (body.match(/\bCRO (\d[\w\/]*)/g)||[]).forEach(function(x){ var v=x.slice(4); f("CM: CRO valid", S.identifiers.cro.validate(v), x); });
  (body.match(/\bNINO (\S+?)[).,; ]/g)||[]).forEach(function(x){ var v=x.slice(5).replace(/[).,; ]$/,""); if(isOdd(v))return; f("CM: NINO valid", S.identifiers.nino.validate(v), x); });
  (body.match(/\bPPT (\d{6,9}[A-Z]?)/g)||[]).forEach(function(x){ f("CM: passport valid", S.identifiers.passport.validate(x.slice(4)), x); });
  (body.match(/\bVRM (\S+?)[).,; ]/g)||[]).forEach(function(x){ var v=x.slice(4).replace(/[).,; ]$/,""); f("CM: VRM valid no-space", S.vrmFormatValid(v)&&!/\s/.test(v)&&v===v.toUpperCase(), x); });
  (body.match(/\bAC (\d+)/g)||[]).forEach(function(x){ f("CM: account AC<=8", S.identifiers.account.validate(x.slice(3)), x); });
  (body.match(/\bSC (\d[\d ]+\d)/g)||[]).forEach(function(x){ f("CM: sort code 6 digits", x.slice(3).replace(/\D/g,"").length===6, x); });
  (body.match(/COMPANIES HOUSE (\S+?)[,.; ]/g)||[]).forEach(function(x){ var v=x.replace(/^COMPANIES HOUSE /,"").replace(/[,.; ]$/,""); f("CM: company 8-digit", S.companyNumberValid(v), x); });
  // phones: CM no internal space — except labelled non-CM spaced phone
  var pbody=body.replace(/\b(?:\d{4} ){3}\d{4}\b/g,"#CARD#");  // remove grouped cards so their tails are not mistaken for phones
  (pbody.match(/\b07\d[\d ]{7,}\d\b/g)||[]).forEach(function(x){ if(isOdd(x.trim()))return; f("CM: phone no internal space", !/\d \d/.test(x), x); });
  // payment cards (grouped 16) Luhn-valid; IMEI(15) Luhn-valid
  (body.match(/\b(?:\d{4} ){3}\d{4}\b/g)||[]).forEach(function(x){ f("CM: payment card Luhn-valid", S.luhn(x), x); });
  (body.match(/IMEI (\d{15})/g)||[]).forEach(function(x){ f("CM: IMEI Luhn-valid", S.luhn(x.slice(5)), x); });

  // cross-source consistency: all CM 'DOB dd/mm/yyyy' tokens in a report agree (spine)
  var dobs={}; (body.match(/\bDOB (\d{2}\/\d{2}\/\d{4})/g)||[]).forEach(function(x){ dobs[x.slice(4)]=1; });
  f("CONSISTENCY: spine DOB agrees across sources", Object.keys(dobs).length<=1, ir.urn+" DOBs="+Object.keys(dobs).join(","));

  // discrepancy hygiene: a dob_mismatch value must actually differ from the spine DOB
  disc.filter(function(d){return d.kind==="dob_mismatch";}).forEach(function(d){ f("DISCREPANCY: dob_mismatch truly differs", Object.keys(dobs)[0]!==d.value, ir.urn); });

  // postcode validity (every postcode-shaped token must be a valid UK format)
  (body.match(/\b[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}\b/g)||[]).forEach(function(x){ f("REALISM: postcode UK-valid", S.postcodeValid(x), x); });
  // ANPR sightings must be on UK ground (foreign nexus belongs only to assessment/travel/meeting)
  var FOREIGN=/(Rotterdam|Calais|Amsterdam|Dubai|Marbella|Antwerp|Vigo|Warsaw|Lisbon|Tangier|Istanbul|Riga|Naples|Dublin)/;
  ir.items.filter(function(it){return it.sourceType==="ANPR";}).forEach(function(it){ f("REALISM: ANPR sighting on UK ground", !FOREIGN.test(it.text), it.text); });
  // no all-zero placeholder addresses (check location entities + address-shaped text, not money)
  (ir.structuredIntelligence.entities||[]).filter(function(e){return e.type==="location";}).forEach(function(e){
    f("REALISM: no 000 placeholder premise", !/^0+ /.test(e.label||"") && e.attrs.premiseNumber!=="000" && !/\bLS0 |\bBD0 |\bCT0 |\bIP0 /.test(e.label||""), e.label); });

  // EXTRACTION
  var r=X.extract(body);
  f("EXTRACT: only supported node types", r.entities.every(function(e){return SUPPORTED.indexOf(e.type)>=0;}), JSON.stringify(r.entities.filter(function(e){return SUPPORTED.indexOf(e.type)<0;}).map(function(e){return e.type+":"+e.label;})));
  var persons=r.entities.filter(function(e){return e.type==="person";});
  var fp=persons.filter(function(p){return /^(White|Black|Silver|Blue|Grey|Gray|Red|Green|Gold|Navy|Dark|Light) /.test(p.label)||/\b(Online|Counterfeit|Converted|Limited|Ltd)\b/.test(p.label);});
  f("EXTRACT: no descriptor/object FP persons", fp.length===0, fp.map(function(p){return p.label;}).join(" | "));
  // exact recall: structured subject's pnc/nino/dob appear on an extracted person by value
  var subj=(ir.structuredIntelligence.entities||[]).filter(function(e){return e.type==="person"&&e.role==="POI_ACTIVE";})[0];
  if(subj){ var hit=persons.some(function(p){return p.attrs&&p.attrs.pnc===subj.attrs.pnc&&p.attrs.nino===subj.attrs.nino&&p.attrs.dob;});
    f("EXTRACT: subject pnc+nino+dob recalled by value", hit, ir.urn+" :: "+persons.map(function(p){return p.label+"{pnc:"+(p.attrs&&p.attrs.pnc)+",nino:"+(p.attrs&&p.attrs.nino)+"}";}).join(" | ")); }
});

console.log("FORENSIC AUDIT — "+ds.length+" reports, "+ds.reduce(function(a,ir){return a+ir.items.length;},0)+" items\n");
var rules=Object.keys(fails).sort(), tot=0, bad=0;
rules.forEach(function(k){ if(fails[k]>0){ tot+=fails[k]; bad++; console.log("  FAIL "+fails[k]+"/"+seen[k]+"  "+k+"\n        e.g. "+ex[k]); } });
console.log("\n"+(rules.length-bad)+"/"+rules.length+" rules clean; "+bad+" with failures; "+tot+" failing instances.");
console.log(bad===0?"ALL CHECKS PASS.":"SEE FAILURES ABOVE.");
process.exit(bad?1:0);
