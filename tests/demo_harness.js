/* demo_harness.js — golden regression oracle for the extraction fixes.
 * Run: node tests/demo_harness.js   (from Solar/)
 * Encodes the CORRECTED behaviour for the 5-report CASE BAINES demo corpus,
 * plus no-regression / generalisation guards over acid-test-corpus.
 * Assertion-based (not full snapshot) so it is robust to incidental output churn.
 * The maker must make this pass; an independent tester re-runs it. CM stays SoT.
 */
"use strict";
var path = require("path"), fs = require("fs");
var base = path.join(__dirname, "..");
var X = require(path.join(base, "js/core/extract.js"));
var ACID = path.join(base, "..", "test-data", "acid-test-corpus");

/* ---- demo corpus (verbatim from Demo/Demo_Results.md inputs) ---- */
var D = {
 D1:"Geoffrey 'Gee' BAINES (DOB 20/12/1990), formerly known as Geoff SMITH, is a wanted subject currently on bail. He is believed to be violent and may have access to firearms. BAINES uses mobile 07686 868686 and email geoff.b@gmail.com, and contacts associates via Skype gee.baines88 and Twitter @gee_b. His National Insurance number is AB123456C and he holds UK passport 503842156 (United Kingdom). His PNC ID is 95/11112R and CRO 12345/86G. He drives a black BMW, registration VK21 ABC, VIN WBA1234567VK21ABC.\n\nOn 04/05/2026 BAINES used this email to book flights to Malaga, paying GBP 1,500 from account 12345678 at sort code 20-00-00. He is flying from Bristol airport on 11/06/2026 at 14:30 and will return on 20/06/2026. He will be staying at the hotel C. Maestranza, 20, Málaga-Este, 29016 Málaga, Spain, telephone +34 965 06 43 61. When there, he is expected to purchase a new SIM card with the number +34 612 123 123 and plans a day trip to SEVILLE on 15/06/2026.\n\nBAINES is employed by Northgate Logistics Limited (company number 09876543, VAT 123456789), a firm associated with Apex Freight PLC. His brother, Darren BAINES, is currently in custody. A known associate, Maria van der BERG, communicated with BAINES on 02/06/2026 and transferred EUR 4,000 to him. Surveillance logged the IP address 81.2.69.142 accessing the booking. Mr Ronald McDonald Jr is the registered keeper of a white Ford Transit, registration AB12 CDE.",
 D2:"INTELLIGENCE REPORT - 12/05/2026\nFurther to the profile of Geoffrey BAINES (DOB 20/12/1990), surveillance on 12/05/2026 observed BAINES meeting an unknown male at the Forest Glade Cafe, 14 King Street, Bristol. BAINES arrived in the black BMW, registration VK21 ABC, and was using mobile 07686 868686. The associate was identified as Tomasz NOWAK, who drives a silver Audi A4, registration LD19 TYE. NOWAK telephoned BAINES from 07700 900145. BAINES sent a photograph of a shipping container from geoff.b@gmail.com. Northgate Logistics Limited is suspected of using Apex Freight PLC to move the containers. Maria van der BERG was also present and left towards Bristol Temple Meads.",
 D3:"INTELLIGENCE REPORT - 28/05/2026\nFinancial enquiries into Geoff BAINES show payments from account 12345678, sort code 20-00-00, to Apex Freight PLC totalling GBP 12,000 during May 2026. A further EUR 4,000 was received from Maria van der BERG. BAINES is also believed to control a Bitcoin wallet 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa, which received three payments. A solicitor, Mr Adrian FROST of Frost and Partners LLP, has acted on BAINES's behalf. Tomasz NOWAK opened a new account 87654321 at sort code 11-22-33 in the name of Northgate Logistics Ltd.",
 D4:"INTELLIGENCE REPORT - 15/06/2026\nBorder records confirm Geoffrey BAINES departed Bristol airport on 11/06/2026 bound for Malaga, with a return booked for 20/06/2026. On 15/06/2026 a white Ford Transit, registration AB12 CDE, registered to Ronald McDonald Jr, was observed at the Port of Dover accompanied by Tomasz NOWAK. The Transit boarded a ferry to Calais. BAINES was contacted via Skype gee.baines88 during the crossing. A Spanish mobile, +34 612 123 123, has since been attributed to BAINES.",
 D5:"INTELLIGENCE REPORT - 22/06/2026\nOn 22/06/2026 officers executed a warrant at 42 Elmwood Road, Bristol, BS5 9TY, the home address of Geoffrey 'Gee' BAINES. A firearm was recovered at the scene. BAINES, his brother Darren BAINES, and Tomasz NOWAK were all arrested. Maria van der BERG remains outstanding and is believed to have travelled to Rotterdam. Northgate Logistics Limited and Apex Freight PLC have been referred for further investigation. A further associate, Karl REINHOLT, using mobile 07911 123456, was identified as the intended buyer. The black BMW, registration VK21 ABC, was seized."
};

/* ---- helpers over an extract() result ---- */
function R(text){ var r=X.extract(text); r._by={}; r.entities.forEach(function(e){r._by[e.ref]=e;}); return r; }
function ents(r,t){ return r.entities.filter(function(e){return e.type===t;}); }
function ent(r,t,re){ return ents(r,t).find(function(e){return re.test(e.label);})||null; }
function primaryLabel(r){ return r.primary&&r._by[r.primary]?r._by[r.primary].label:null; }
function rels(r){ return r.relationships.map(function(rl){return {s:(r._by[rl.sourceRef]||{}).label,t:rl.type,o:(r._by[rl.targetRef]||{}).label,c:rl.confidence,a:rl.amount,d:rl.dateISO};}); }
function hasRel(r,sRe,type,oRe){ return rels(r).some(function(x){return x.s&&sRe.test(x.s)&&x.t===type&&x.o&&oRe.test(x.o);}); }
function getRel(r,sRe,type,oRe){ return rels(r).find(function(x){return x.s&&sRe.test(x.s)&&x.t===type&&x.o&&oRe.test(x.o);})||null; }
function attr(r,t,re,key){ var e=ent(r,t,re); return e?e.attrs[key]:undefined; }
function hasStatus(r,re,code){ var e=ent(r,'person',re); var v=e&&e.attrs.cmStatus; return Array.isArray(v)?v.indexOf(code)!==-1:v===code; }
function hasWarn(r,re,code){ var e=ent(r,'person',re); var v=e&&e.attrs.cmWarnings; return Array.isArray(v)?v.indexOf(code)!==-1:v===code; }

var pass=0, fail=0, fails=[];
function ok(cond,msg){ if(cond){pass++;} else {fail++; fails.push(msg);} }

/* ============================ DEMO 1 ============================ */
(function(){ var r=R(D.D1);
 ok(ent(r,'person',/Geoffrey BAINES/), "D1: Geoffrey BAINES extracted");
 ok(ent(r,'person',/Maria van der BERG/), "D1: Maria extracted");
 ok(hasStatus(r,/Darren BAINES/,'IN_CUSTODY'), "D1: Darren IN_CUSTODY (correct)");
 ok(!hasStatus(r,/Maria/,'IN_CUSTODY'), "D1-C1: Maria must NOT be IN_CUSTODY");
 ok(!hasWarn(r,/Maria/,'FIREARMS'), "D1-C1: Maria must NOT carry FIREARMS");
 ok(ent(r,'account',/12345678/), "D1-H4: bank account 12345678 extracted");
 ok(hasRel(r,/BAINES/,'USES',/gee\.baines88/), "D1-H2: BAINES USES Skype gee.baines88");
 ok(hasRel(r,/BAINES/,'USES',/gee_b/), "D1-H2: BAINES USES Twitter gee_b");
 ok(!hasRel(r,/Geoffrey BAINES/,'USES',/34965064361/), "D1-C3: hotel phone must NOT be BAINES USES");
})();

/* ============================ DEMO 2 ============================ */
(function(){ var r=R(D.D2);
 ok(!ent(r,'person',/Forest Glade Cafe/), "D2-M1: Forest Glade Cafe not typed person");
 ok(ent(r,'organisation',/Forest Glade Cafe/)||ent(r,'location',/Forest Glade Cafe/), "D2-M1: cafe typed org/location");
 ok(hasRel(r,/NOWAK/,'USES',/447700900145/), "D2-C3: NOWAK USES 07700 900145");
 ok(!hasRel(r,/Geoffrey BAINES/,'USES',/447700900145/), "D2-C3: BAINES must NOT own NOWAK's phone");
 ok(hasRel(r,/BAINES/,'USES',/geoff\.b@gmail/), "D2-M4: email-from => USES not TRANSACTED_WITH");
 ok(!hasRel(r,/BAINES/,'TRANSACTED_WITH',/geoff\.b@gmail/), "D2-M4: not TRANSACTED_WITH email");
 ok(!hasRel(r,/BAINES/,'TRANSACTED_WITH',/Northgate/), "D2-M4: BAINES not TRANSACTED_WITH Northgate");
 ok(ent(r,'person',/Maria van der BERG/), "D2-H4: Maria extracted");
 ok(!hasRel(r,/Geoffrey BAINES/,'TRAVELS_TO',/^Bristol$/), "D2-C3: Maria's movement not attributed to BAINES");
})();

/* ============================ DEMO 3 ============================ */
(function(){ var r=R(D.D3);
 var t=getRel(r,/BAINES/,'TRANSACTED_WITH',/Apex Freight/);
 ok(t, "D3-H1: BAINES TRANSACTED_WITH Apex (plural 'payments')");
 ok(t&&/12,?000/.test(t.a||''), "D3-H1: £12,000 carried on the Apex transaction");
 ok(ent(r,'person',/Maria van der BERG/), "D3-H1: Maria extracted from 'received from'");
 var mt=getRel(r,/Maria/,'TRANSACTED_WITH',/BAINES/);
 ok(mt, "D3-H1: Maria TRANSACTED_WITH BAINES");
 ok(mt&&/4,?000/.test(mt.a||'')&&!/12,?000/.test(mt.a||''), "D3-H1b: Maria's transfer carries EUR 4,000, NOT the prior GBP 12,000");
 ok(ent(r,'account',/87654321/), "D3-H1: account 87654321 (at sort code) extracted");
 ok(hasRel(r,/BAINES/,'HOLDS',/12345678/), "D3: account link typed HOLDS (Account holder), not OWNS");
 ok(ent(r,'organisation',/Frost and Partners/), "D3-M1: 'Frost and Partners LLP' not truncated");
 var w=ent(r,'account',/Bitcoin|1A1zP1/); ok(w&&!/^AC /.test(w.attrs.cm||''), "D3-M2: crypto CM not rendered as bank account");
})();

/* ============================ DEMO 4 ============================ */
(function(){ var r=R(D.D4);
 ok(hasRel(r,/BAINES/,'DEPARTS_FROM',/Bristol Airport/), "D4-H3: BAINES DEPARTS_FROM Bristol Airport");
 ok(!hasRel(r,/BAINES/,'TRAVELS_TO',/Bristol Airport/), "D4-H3: not TRAVELS_TO Bristol Airport");
 var m=getRel(r,/BAINES/,'TRAVELS_TO',/Malaga/);
 ok(m, "D4-H3: BAINES TRAVELS_TO Malaga");
 ok(m&&m.d==='2026-06-11', "D4-H3: Malaga travel dated 11/06 not report date 15/06 (got "+(m&&m.d)+")");
 ok(ent(r,'phone',/34612123123/), "D4-H4: Spanish mobile re-extracted");
 ok(ents(r,'vehicle').filter(function(e){return /Transit/i.test(e.label)&&!/AB12/.test(e.label);}).length===0, "D4-M1: no duplicate bare 'Transit' vehicle");
 ok(hasRel(r,/BAINES/,'USES',/gee\.baines88/), "D4-H2: BAINES USES Skype gee.baines88");
})();

/* ============================ DEMO 5 ============================ */
(function(){ var r=R(D.D5);
 ok(ent(r,'person',/Geoffrey BAINES/), "D5-C2: Geoffrey BAINES extracted (span over-claim fixed)");
 ok(/Geoffrey BAINES/.test(primaryLabel(r)||''), "D5-C2: primary subject = Geoffrey BAINES (got "+primaryLabel(r)+")");
 ok(!hasWarn(r,/Tomasz NOWAK/,'FIREARMS'), "D5-C1: NOWAK must NOT carry FIREARMS");
 ok(!hasWarn(r,/Darren BAINES/,'FIREARMS'), "D5-C1: Darren must NOT carry FIREARMS");
 ok(ent(r,'person',/Maria van der BERG/), "D5-C3: Maria extracted");
 ok(hasRel(r,/Maria/,'TRAVELS_TO',/Rotterdam/), "D5-C3: Maria TRAVELS_TO Rotterdam");
 ok(!hasRel(r,/Darren BAINES/,'TRAVELS_TO',/Rotterdam/), "D5-C3: Rotterdam not attributed to Darren");
})();

/* ===================== ACID: no-regression + generalisation ===================== */
(function(){
 function A(f){ return R(fs.readFileSync(path.join(ACID,f),'utf8')); }
 var s1=A('SAMPLE-1-NEWS-OSINT.txt');
 ok(hasRel(s1,/Daniel Okoro/,'OWNS',/Redline Freight/), "ACID1: Okoro OWNS Redline Freight (kept)");
 var s2=A('SAMPLE-2-CHAT-LOG.txt');
 ok(hasRel(s2,/Squirrel/,'USES',/RV24 KLP/), "ACID2: Squirrel USES RV24 KLP (kept)");
 var s3=A('SAMPLE-3-SAR-FINANCE.txt');
 ok(hasRel(s3,/FENWICK/,'TRANSACTED_WITH',/Vesper/), "ACID3: FENWICK<->Vesper (kept)");
 ok(hasRel(s3,/FENWICK/,'TRANSACTED_WITH',/Anton REISS/), "ACID3: FENWICK->Anton (kept)");
 ok(hasRel(s3,/FENWICK/,'HOLDS',/41028833/), "ACID3: FENWICK holds account (Account holder)");
 var s5=A('SAMPLE-5-BORDER-TRAVEL.txt');
 ok(hasRel(s5,/MENDES/,'DEPARTS_FROM',/Manchester Airport/), "ACID5-H3(gen): MENDES DEPARTS_FROM Manchester");
 ok(hasRel(s5,/MENDES/,'TRAVELS_TO',/Lisbon/), "ACID5-H3(gen): MENDES TRAVELS_TO Lisbon");
 ok(!hasRel(s5,/MENDES/,'TRAVELS_TO',/Manchester Airport/), "ACID5-H3(gen): not TRAVELS_TO Manchester");
 ok(hasRel(s5,/MENDES/,'STAYS_AT',/Estrela/), "ACID5: MENDES STAYS_AT Hotel Estrela (kept)");
 ok(hasRel(s5,/MENDES/,'ASSOCIATE_OF',/SILVA/), "ACID5: MENDES ASSOCIATE_OF Joana SILVA (kept)");
 // status scoping must generalise: a bystander/victim is not given the subject's status
 ok(!hasStatus(s1,/Priya Nair/,'ARRESTED') && !hasStatus(s1,/Helen Brookes/,'ARRESTED'), "ACID1: arrest status not bled onto Nair/Brookes");
 ok(hasRel(s3,/FENWICK/,'TRANSACTED_WITH',/Kestrel/), "ACID3: FENWICK->Kestrel (kept)");
 ok(hasRel(s3,/FENWICK/,'HOLDS',/CH93|IBAN/), "ACID3: FENWICK holds IBAN (Account holder)");
})();

/* ===================== OPT: entity-extraction upgrades (verified gains) ===================== */
(function(){
 var a=R("On 14/03/2026 officers seized 2 kg of cocaine and a Glock 17 pistol. Liam DOYLE was armed with a machete.");
 ok(ent(a,'drug',/cocaine/), "OPT: drug cocaine extracted (with quantity)");
 ok(attr(a,'drug',/cocaine/,'quantity'), "OPT: drug quantity captured");
 ok(ent(a,'weapon',/Glock 17/), "OPT: firearm 'Glock 17' extracted");
 ok(ent(a,'weapon',/machete/), "OPT: weapon 'machete' extracted");
 ok(hasRel(a,/DOYLE/,'POSSESSES',/machete/), "OPT: DOYLE POSSESSES machete (armed with cue)");
 var b=R("COLE communicates via Telegram @cole_logistics. His IMEI is 356803082441327. Mr COLE uses 07700 900900.");
 ok(ent(b,'person',/COLE/), "OPT: single-surname subject (title cue) extracted");
 ok(ent(b,'phone',/356803082441327/), "OPT: IMEI 'is N' form extracted");
 ok(hasRel(b,/COLE/,'USES',/cole_logistics/), "OPT: labelled comms handle linked to owner");
 var c=R("BAINES (DOB 02/04/1985) supplied class A drugs.");
 ok(ent(c,'person',/BAINES/), "OPT: single-surname subject (DOB cue) extracted");
 var d=R("Funds were layered through Baltic Trade OU and Vesper Holdings Ltd.");
 ok(ent(d,'organisation',/Baltic Trade OU/), "OPT: foreign org suffix (OU) typed organisation");
 ok(!ent(d,'person',/Baltic/), "OPT-neg: Baltic Trade not mistyped as a person");
 var e=R("She read a magazine and used a knife and fork in the cafe kitchen.");
 ok(ents(e,'weapon').length===0, "OPT-neg: no weapon from 'magazine'/'knife and fork'");
 var f=R("They shared a coke and some hash browns at the diner.");
 ok(ents(f,'drug').length===0, "OPT-neg: ambiguous 'coke'/'hash' without quantity is not a drug");
})();

/* ===================== OPT-PRECISION: adversarial negative guards ===================== */
(function(){
 var a=R("Mr Colt Browning of Ruger Holdings attended. DC Ruger interviewed Mr Walther.");
 ok(ents(a,'weapon').length===0, "PREC: firearm makes as surnames produce NO weapons");
 ok(ent(a,'person',/Colt Browning/), "PREC: 'Mr Colt Browning' kept as a person");
 var b=R("A loaded Glock 17 and a Beretta pistol were seized.");
 ok(ent(b,'weapon',/Glock 17/)&&ent(b,'weapon',/Beretta/), "PREC: real firearms (model/context) still extracted");
 var c=R("SOCO observed the scene. NORTHGATE controls the chain. FORD was seen leaving.");
 ok(ents(c,'person').length===0, "PREC: caps acronyms/org/vehicle words are not minted as persons");
 var d=R("I saw John AB walk past. Consider AG advice on the case.");
 ok(ents(d,'organisation').length===0, "PREC: ambiguous 2-letter suffixes (AB/AG) are not orgs");
 var e=R("Officers had to rifle through the papers. Possession of ammunition is an offence under the Firearms Act 1968.");
 ok(ents(e,'weapon').length===0, "PREC: 'rifle' (verb) and statutory 'ammunition' are not weapons");
 ok(!ent(e,'person',/Firearms Act/), "PREC: 'Firearms Act' is not a person");
 var f=R("Victim BROWN was attacked. The suspect, found carrying a machete, fled.");
 ok(f.relationships.filter(function(x){return x.type==='POSSESSES';}).length===0, "PREC: possession does not cross a sentence boundary onto the victim");
})();

/* ---- report ---- */
console.log("\n================ DEMO HARNESS ================");
fails.forEach(function(m){console.log("FAIL: "+m);});
console.log("\n"+pass+" passed, "+fail+" failed, "+(pass+fail)+" total");
