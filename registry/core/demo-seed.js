/* demo-seed.js — demonstration dataset (NCA-style intelligence reports).
 * 12 Operations (1 per threat area) x 20 reports each (240 reports). Each report
 * is built as a DEVELOPING ENQUIRY — records build on one another the way a real
 * intelligence picture develops:
 *   assessment (CHIS / Intelligence report / LEA RFI)
 *     -> sighting (Surveillance / ANPR) introduces a vehicle
 *     -> DVLA returns the registered keeper and address
 *     -> PNC returns the person's record
 *     -> PND / Experian develop the address and associates
 *     -> IPA Comms Data / SAR / Companies House develop comms, money, companies.
 * Every item still stands alone (names the subject, what/where/when); grades follow
 * the source (held-data checks = [1A]); the PROVENANCE is a general assessment line
 * ([subject] is assessed to be involved in [theme]), graded [1B] unless the report's
 * assessment is wildly weaker. A recurring PRINCIPAL per op gives an intra-op subject
 * timeline; CROSS-OVER bridge entities recur across ops so Master/Lower aggregation
 * and SOLAR export dedup are visible. Generated so every report is valid.
 * Dual export: module.exports + window.RegistryDemo. */
"use strict";
(function () {
  var M  = (typeof require!=="undefined") ? require("./ir-model.js")    : (typeof window!=="undefined"?window.RegistryModel:null);
  var SI = (typeof require!=="undefined") ? require("./si-model.js")    : (typeof window!=="undefined"?window.RegistrySI:null);
  var OPS= (typeof require!=="undefined") ? require("./operations.js")  : (typeof window!=="undefined"?window.RegistryOperations:null);

  var REPORTS_PER_OP = 20;
  function pad(n,w){ n=String(n); while(n.length<w) n="0"+n; return n; }
  function pndDefault(t){ return (t==="account"||t==="firearm"||t==="official_document") ? "No" : "Yes"; }
  function isoDaysAgo(d){ var x=new Date(); x.setDate(x.getDate()-d); return x.toISOString(); }
  function fmtDMY(dt){ return pad(dt.getDate(),2)+"/"+pad(dt.getMonth()+1,2)+"/"+dt.getFullYear(); }
  function dateFor(opIndex,r){ var b=new Date(2024,8,1); b.setDate(b.getDate()+ opIndex*11 + r*8); return fmtDMY(b); }
  function parseDMY(s){ var p=String(s).split("/"); return new Date(+p[2], (+p[1])-1, +p[0]); }
  function shiftDays(dt,days){ var x=new Date(dt); x.setDate(x.getDate()+days); return x; }
  function fmtMY(dt){ return pad(dt.getMonth()+1,2)+"/"+dt.getFullYear(); }
  function timeFor(uid){ return pad(6+(uid%15),2)+":"+pad((uid*7)%60,2); }
  function amountFor(uid){ return "GBP "+(4+(uid%47))+",000"; }
  function countFor(uid){ return 3+(uid%6); }
  // ---- realistic-messy helpers: seeded PRNG + variable field generators ----
  function rng(seed){ var t=(seed>>>0)||1; return function(){ t=t+0x6D2B79F5|0; var x=Math.imul(t^t>>>15,1|t); x=x+Math.imul(x^x>>>7,61|x)^x; return ((x^x>>>14)>>>0)/4294967296; }; }
  function pick(rnd,a){ return a[Math.floor(rnd()*a.length)]; }
  function chance(rnd,prob){ return rnd()<prob; }
  function intBetween(rnd,lo,hi){ return lo+Math.floor(rnd()*(hi-lo+1)); }
  function shuffle(rnd,a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(rnd()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function listJoin(a){ a=a.filter(Boolean); if(a.length<=1) return a[0]||""; return a.slice(0,-1).join(", ")+" and "+a[a.length-1]; }
  var MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function longDob(d){ var p=String(d).split("/"); return (+p[0])+" "+MONTHS[(+p[1])-1]+" "+p[2]; }                 // 12 October 1973 (non-CM)
  function transposeDob(d){ var p=String(d).split("/"), y=p[2].split(""); var t=y[2]; y[2]=y[3]; y[3]=t; if(y.join("")===p[2]) y[3]=String((+y[3]+1)%10); return p[0]+"/"+p[1]+"/"+y.join(""); }
  function spacedPhone(rnd){ var n="07"+pad(intBetween(rnd,100000000,899999999),9); return n.slice(0,5)+" "+n.slice(5); } // 07xxx xxxxxx (non-CM)
  function spacedNino(n){ return n.slice(0,2)+" "+n.slice(2,4)+" "+n.slice(4,6)+" "+n.slice(6,8)+" "+n.slice(8); }       // JT 60 13 20 B (non-CM)
  function phoneFor(rnd){ return "07"+pad(intBetween(rnd,100000000,899999999),9); }                                   // CM no-space 11 digit
  function emailFor(rnd,nom){ var h=pick(rnd,["proton.me","gmail.com","outlook.com","tutanota.com","hotmail.com"]); return (nom.f+"."+nom.s+intBetween(rnd,1,99)).toLowerCase().replace(/[^a-z0-9.]/g,"")+"@"+h; }
  function luhnComplete(body){ var sum=0,alt=true; for(var i=body.length-1;i>=0;i--){ var x=+body[i]; if(alt){x*=2; if(x>9)x-=9;} sum+=x; alt=!alt; } return body+((10-(sum%10))%10); }
  function cardFor(rnd){ var pre=pick(rnd,["4","4","51","52","53","55"]), b=pre; while(b.length<15) b+=Math.floor(rnd()*10); return luhnComplete(b).replace(/(.{4})/g,"$1 ").trim(); } // Luhn-valid PAN, grouped
  function imeiFor(rnd){ var b=""; while(b.length<14) b+=Math.floor(rnd()*10); return luhnComplete(b); }                // 15-digit Luhn-valid
  function aOrAn(w){ return /^[AEIOU]/i.test(String(w))?"An":"A"; }
  var PLACE_PC=[["Manchester","M14 7QP"],["Leeds","LS9 8AA"],["Bradford","BD3 9LT"],["Birmingham","B12 2RX"],["Canterbury","CT1 1PJ"],["Liverpool","L9 7HG"],["Newcastle","NE6 5TZ"],["Sheffield","S2 4WB"],["Coventry","CV1 2GH"],["Nottingham","NG7 3RR"],["Salford","M6 5DP"],["Leeds","LS11 9SE"]];
  function prevAddrFor(rnd){ var pp=pick(rnd,PLACE_PC); return intBetween(rnd,1,180)+" "+pick(rnd,STREETS)+", "+pp[0]+" "+pp[1]; }
  var POCS=["Crawley","Gloucester","Calder","Nuncio-Crawley","Nuncio-Glos","Bedford","Hendon","Solent","Mercia","Fenland","Wyvern","Calder"];
  function pocFor(uid){ return POCS[uid%POCS.length]+(1+uid%9); }                 // desk handle, e.g. Crawley4
  function pocDate(opIndex,r){ var d=parseDMY(dateFor(opIndex,r)); return fmtDMY(shiftDays(d,1+((opIndex*100+r)%2))); } // created 1-2 days after intel
  function bandFor(key,uid){ var serious=(key==="ENV"||key==="MODSL"||key==="OIC"||key==="Drugs"||key==="Firearms"); return serious?1:(1+(uid%2)); }

  var VLET="ABCDEFGHJKLMNOPRSTUVWXYZ";
  // CM data standard: VRM caps, NO space (IM01 SD01 v6 "In Free Text (CM)" — e.g. VRM LD12ABC).
  function vrmFor(uid, prefix){ var n=uid, a=VLET[n%24]; n=Math.floor(n/24); var b=VLET[n%24]; n=Math.floor(n/24); var c=VLET[n%24]; return prefix+pad(uid%100,2)+a+b+c; }
  // Bare identifiers (the prefix — PNC/CRO/NINO/PPT — is added in free text per CM standard).
  function pncId(dob,uid){ return String(dob).slice(8,10)+"/"+pad(uid+1,7)+VLET[uid%24]; }            // 73/0000123A
  function pncFor(dob,uid){ return "PNC "+pncId(dob,uid); }
  function croId(dob,uid){ return pad((uid%99999)+1,5)+"/"+String(dob).slice(8,10)+VLET[(uid*3+1)%24]; } // 12345/73G
  var NINO_L="ABCEGHJKLMNOPRSTWXYZ";                                                                   // valid NINO 1st letter (excludes D,F,I,Q,U,V)
  var NINO_L2="ABCEGHJKLMNPRSTWXYZ";                                                                   // valid NINO 2nd letter (also excludes O)
  function ninoId(uid){ var a=NINO_L[uid%NINO_L.length], b=NINO_L2[(uid*7+3)%NINO_L2.length]; var bad={BG:1,GB:1,NK:1,KN:1,TN:1,NT:1,ZZ:1}; if(bad[a+b]) b=NINO_L2[(uid*7+5)%NINO_L2.length]; return a+b+pad(100000+(uid*7919+13)%900000,6)+"ABCD".charAt(uid%4); } // JT601320B (no all-zero)
  function pptId(uid){ return pad(500000000+((uid*131+104729)%499000000),9); }                         // 9 numeric (no all-zero)
  var POSTCODES=["M14 7QP","LS9 8AA","BD3 9LT","B12 2RX","CT1 1PJ","L9 7HG","NE6 5TZ","S2 4WB","CV1 2GH","NG7 3RR","M6 5DP","LS11 9SE"];
  var STREETS=["Mill Lane","Beech Road","Quarry Road","Dock Street","Ashworth Road","Cardwell Street","Holt Road","Pendle Way"];
  function postcodeFor(uid){ return POSTCODES[uid%POSTCODES.length]; }
  function descV(c){ return ((c.attrs&&c.attrs.colour)?c.attrs.colour+" ":"")+((c.attrs&&c.attrs.make)?c.attrs.make:"vehicle"); }

  var PRINCIPALS = [
    {f:"Geoffrey",s:"BAINES",d:"12/10/1973"}, {f:"Marcus",s:"DELANEY",d:"04/03/1981"},
    {f:"Stefan",s:"VOSS",d:"22/07/1979"},     {f:"Imran",s:"QURESHI",d:"15/05/1984"},
    {f:"Callum",s:"FAIRBANK",d:"30/01/1988"}, {f:"Renata",s:"BIANCHI",d:"09/09/1982"},
    {f:"Darren",s:"HOLLOWAY",d:"18/12/1976"}, {f:"Yana",s:"PETROVA",d:"27/06/1990"},
    {f:"Wesley",s:"OSEI",d:"03/03/1985"}, {f:"Lukas",s:"HORVATH",d:"14/11/1980"},
    {f:"Viktor",s:"SOKOLOV",d:"04/05/1979"},   {f:"Naomi",s:"ELLISON",d:"21/08/1987"},
    {f:"Tariq",s:"FAROOQ",d:"06/02/1983"},     {f:"Bartosz",s:"LEWANDOW",d:"19/04/1978"},
    {f:"Shauna",s:"DOHERTY",d:"11/10/1991"},   {f:"Andre",s:"MOREAU",d:"25/12/1975"},
    {f:"Kelvin",s:"OBI",d:"08/08/1986"},       {f:"Petra",s:"NOVOTNA",d:"17/01/1989"},
    {f:"Gareth",s:"PUGH",d:"29/05/1977"},      {f:"Sofia",s:"COSTA",d:"02/07/1992"},
    {f:"Declan",s:"MERCER",d:"12/03/1985"},    {f:"Hana",s:"YILMAZ",d:"23/09/1984"},
    {f:"Joseph",s:"ABARA",d:"05/11/1981"},     {f:"Mhairi",s:"FRASER",d:"16/06/1990"}
  ];
  var FORENAMES=["Liam","Sophie","Connor","Aisha","Dean","Nadia","Ryan","Chloe","Hassan","Grace","Tomas","Beata","Owen","Leah","Mia","Jordan","Yusuf","Holly","Karl","Eva","Reece","Priya","Niall","Zara"];
  var SURNAMES =["Oakley","Harding","Byrne","Khan","Foster","Romano","Whelan","Akins","Miller","Novak","Price","Summers","Cole","Reid","Demir","Walsh","Brooke","Marsh","Quinn","Sutton","Hale","Frost","Beck","Dunn"];
  function nominalFor(opIndex, r){
    if (r % 3 === 0) return PRINCIPALS[opIndex];
    var uid = opIndex*100 + r;
    var f = FORENAMES[uid % FORENAMES.length];
    var s = SURNAMES[(Math.floor(uid/FORENAMES.length)+opIndex) % SURNAMES.length].toUpperCase();
    var d = pad((uid%27)+1,2)+"/"+pad((uid%12)+1,2)+"/"+(1975+(uid%30));
    return {f:f, s:s, d:d};
  }
  function associateFor(uid){ var f=FORENAMES[(uid*7+5)%FORENAMES.length]; var s=SURNAMES[(uid*11+2)%SURNAMES.length].toUpperCase(); return f+" "+s; }

  var BRIDGES = {
    franklin: function(){ return {type:"person",label:"Aimee FRANKLIN",role:"FEATURES_IN",attrs:{forename:"Aimee",surname:"Franklin",dob:"22/09/1991"}}; },
    bmw:      function(){ return {type:"vehicle",label:"DE20NTM",attrs:{vrm:"DE20NTM",make:"BMW",colour:"Black"}}; },
    phone1:   function(){ return {type:"communication",label:"07700900123",attrs:{number:"07700900123"}}; },
    meridian: function(){ return {type:"organisation",label:"MERIDIAN LOGISTICS LTD",role:"FEATURES_IN",attrs:{companyNumber:"09876543"}}; },
    bridgeSt: function(){ return {type:"location",label:"23 Bridge Street, Chester CH1 1NG",attrs:{premiseNumber:"23",postcode:"CH1 1NG"}}; },
    wallet:   function(){ return {type:"cyber",label:"BTC bc1qdemo9d4",attrs:{address:"bc1qdemo9d4"}}; }
  };
  // Fixed selectors shared with Analyse's sample comms (single source: js/core/known-entities.js).
  // Carried on each principal's STABLE report so a CDR/ANPR return matches a real DB record.
  var KNOWN_SELECTORS = {
    "Geoffrey BAINES": { phone:"07700900111", vrm:"LD12ABC" },
    "Marcus DELANEY":  { phone:"07700900333" },
    "Stefan VOSS":     { phone:"07700900777" }
  };
  var CROSS = {
    "OP NEPTUNE":["bridgeSt"], "OP METEOR":["phone1"], "OP COMET":["franklin","meridian"], "OP ECLIPSE":["meridian"],
    "OP AURORA":["franklin"], "OP PULSAR":["meridian"], "OP QUASAR":["phone1"], "OP NEBULA":["bmw"],
    "OP ORBIT":["bmw"], "OP ZENITH":["bmw"], "OP HELIOS":["wallet"], "OP SELENE":["wallet"],
    "OP VEGA":["meridian"], "OP ORION":["wallet"], "OP TITAN":["phone1"], "OP DRACO":["phone1"],
    "OP PHOENIX":["phone1","wallet"], "OP SOLSTICE":["bridgeSt","wallet"], "OP SUPERNOVA":["bmw"], "OP STARDUST":["bmw"],
    "OP EQUINOX":["phone1"], "OP PERIGEE":["wallet"], "OP HORIZON":["meridian"], "OP GRAVITON":["franklin"]
  };

  function threatKey(t){
    if(/^ENV/.test(t))return"ENV"; if(/^MODSL/.test(t))return"MODSL"; if(/^OIC/.test(t))return"OIC";
    if(/^Drugs/.test(t))return"Drugs"; if(/^Firearms/.test(t))return"Firearms"; if(/^EConC/.test(t))return"EConC";
    if(/^BC/.test(t))return"BC"; if(/^Fraud/.test(t))return"Fraud"; if(/^Cyber/.test(t))return"Cyber";
    if(/^OAT/.test(t))return"OAT"; if(/technology/.test(t))return"XTECH"; return"XBORDER";
  }
  var TOPICS={
    ENV:["illegal disposal of controlled waste","operating a site without an environmental permit","fly-tipping of commercial waste","falsification of waste transfer notes","illegal export of hazardous waste","discharge of pollutants into a watercourse","unlicensed scrap-metal dealing","breach of a waste carrier licence","illegal abstraction of water","operating an unlicensed waste site","mislabelling of hazardous materials","evasion of landfill tax"],
    MODSL:["control of victims for labour exploitation","debt bondage at a cash business","transport of victims between addresses","withholding of identity documents","forced criminal exploitation","sexual exploitation of trafficked persons","recruitment of victims overseas","wage withholding and threats","housing of victims in poor conditions","movement of victims through a port","coordination of exploitation by phone","laundering of exploitation proceeds"],
    OIC:["facilitation of small-boat crossings","supply of fraudulent travel documents","operation of a migrant safe house","lorry-borne clandestine entry","sham marriage facilitation","harbouring of overstayers","collection of facilitation fees","forged visa endorsements","movement of migrants inland","corrupt insider at a port","onward transport network","use of a haulage front company"],
    Drugs:["onward supply of Class A drugs","operation of a county line","importation concealed in freight","cash collection runs","coordination via an encrypted handset","adulteration and bulking of product","storage of drugs at an address","wholesale cocaine supply","cannabis cultivation at a premises","money collection for a supply chain","cross-border courier activity","violence protecting a supply line"],
    Firearms:["access to a converted handgun","storage of a prohibited firearm","supply of ammunition","conversion of blank-firing weapons","movement of a firearm between addresses","use of a firearm to threaten","importation of weapon components","brokering a firearm sale","possession with intent to supply","links to a recent discharge","concealment of a weapon in a vehicle","armourer activity"],
    EConC:["layering of criminal proceeds","shell company obscuring ownership","cash-intensive business laundering","mule account network","cryptoasset conversion of proceeds","trade-based money laundering","movement of funds offshore","invoice fabrication","use of money service businesses","structuring of cash deposits","beneficial-ownership concealment","complicit professional facilitation"],
    BC:["payments indicative of sanctions circumvention","corrupt facilitation payments offshore","intermediaries used to evade controls","mislabelled dual-use goods","front company for sanctioned trade","bribery of a public official","concealed end-user of goods","third-country transhipment evasion","falsified export paperwork","corrupt procurement award","kickback arrangement","circumvention of asset freezes"],
    Fraud:["authorised-push-payment fraud","romance fraud against victims","investment fraud scheme","mule account receiving victim funds","courier fraud targeting the elderly","invoice redirection fraud","identity takeover of victims","phishing-enabled account access","mandate/CEO fraud","recovery fraud follow-up","use of spoofed numbers","laundering of fraud proceeds"],
    Cyber:["ransomware deployment against UK victims","operation of phishing infrastructure","sale of stolen credentials","DDoS-for-hire activity","exploitation of a known vulnerability","operation of a malware loader","access brokering to networks","data exfiltration and extortion","carding marketplace activity","crypter/obfuscation services","botnet operation","compromise of a service provider"],
    OAT:["organised theft of plant and vehicles","yard used to break down stolen goods","theft of high-value vehicles to order","ram-raid offending","metal and cable theft","tool theft and onward sale","cloning of vehicle identities","cross-region burglary series","fencing of stolen goods","use of relay/scanner devices","storage of stolen property","export of stolen vehicles"],
    XTECH:["use of encrypted handsets to coordinate offending","criminal use of bespoke comms devices","operation of an encrypted-network node","anonymisation to evade detection","use of dead-drop email accounts","custom app for criminal coordination","SIM-farm operation","anti-attribution tooling","use of privacy coins","secure-device reselling","tooling to defeat lawful interception","coordination via gaming platforms"],
    XBORDER:["exploitation of a freight route","insider facilitation at a port","concealment within containerised cargo","abuse of trusted-trader status","corrupt clearance of consignments","use of a haulage front","misdeclaration of goods","small-craft coastal landings","general-aviation exploitation","postal/parcel route abuse","diversion of in-transit goods","tampering with seals or manifests"]
  };
  var THEME={ ENV:"environmental crime", MODSL:"modern slavery and labour exploitation", OIC:"organised immigration crime", Drugs:"the supply of controlled drugs", Firearms:"the supply and conversion of firearms", EConC:"money laundering", BC:"bribery, corruption and sanctions evasion", Fraud:"fraud offending", Cyber:"cyber-dependent offending", OAT:"organised acquisitive crime", XTECH:"the criminal use of technology", XBORDER:"exploitation of the UK border" };
  var PREVOFFENCE={ ENV:"environmental offences", MODSL:"human trafficking", OIC:"assisting unlawful immigration", Drugs:"the supply of controlled drugs", Firearms:"firearms offences", EConC:"money laundering", BC:"fraud", Fraud:"fraud", Cyber:"computer misuse", OAT:"theft and handling stolen goods", XTECH:"fraud", XBORDER:"the improper importation of goods" };
  // PNC warning markers (ATLAS/PNC "Warning Signals" — IM01 SD01 v6) the record actually carries.
  var WARNMARK={ ENV:"", MODSL:"VIOLENT", OIC:"ALLEGES", Drugs:"DRUGS", Firearms:"FIREARMS", EConC:"", BC:"", Fraud:"ALLEGES", Cyber:"", OAT:"VIOLENT", XTECH:"", XBORDER:"" };

  var COLOURS=["Black","Silver","White","Blue","Grey","Red"];
  // valid-format UK postcode in a real area district (1..maxD), incode digit+letters
  function ukPC(area,maxD,uid,letters){ return area+(1+uid%maxD)+" "+(1+(uid*3)%9)+letters; }
  function kitFor(key, uid){
    var u=pad(100+uid%899,3), hno=1+uid%240, col=COLOURS[uid%COLOURS.length];     // u/hno never render 000
    function e(type,label,attrs,link){ return {type:type,label:label,attrs:attrs||{},link:link||"USES"}; }
    function veh(prefix,make){ var v=vrmFor(uid,prefix); return e("vehicle",v,{vrm:v,make:make,colour:col},"OWNS"); }
    function loc(street,town,pc,link){ return e("location",hno+" "+street+", "+town+" "+pc,{premiseNumber:String(hno),postcode:pc},link||"LIVES_AT"); }
    switch(key){
      case"ENV": return [ e("cyber","NodeID "+u,{address:"id."+u}), loc("Beech Road","Leeds",ukPC("LS",28,uid,"AA")) ];
      case"MODSL": return [ e("organisation","CASHLINE WASH "+u+" LTD",{companyNumber:pad(21000000+uid,8)},"WORKS_FOR"), loc("Mill Lane","Bradford",ukPC("BD",22,uid,"QQ")) ];
      case"OIC": return [ e("official_document","Counterfeit passport P"+pad(700000+uid,7),{},"OWNS"), loc("Dover Road","Dover",ukPC("CT",20,uid,"ZZ")) ];
      case"Drugs": return [ veh("LD","Audi"), e("communication","07911"+pad(uid,6),{number:"07911"+pad(uid,6)}) ];
      case"Firearms": return [ e("firearm","Converted handgun ref FA"+u,{},"POSSESSES"), veh("FA","VW") ];
      case"EConC": return [ e("account","AC "+pad(50000000+uid,8),{accountNumber:pad(50000000+uid,8),sortCode:"20"+pad(uid%9999,4)},"ACCOUNT_HOLDER"), e("organisation","KESTREL HOLDINGS "+u+" LTD",{companyNumber:pad(31000000+uid,8)},"WORKS_FOR") ];
      case"BC": return [ e("organisation","ALDERMONT TRADING "+u+" LTD",{companyNumber:pad(41000000+uid,8)},"WORKS_FOR"), e("account","AC "+pad(60000000+uid,8),{accountNumber:pad(60000000+uid,8),sortCode:"30"+pad(uid%9999,4)},"ACCOUNT_HOLDER") ];
      case"Fraud": return [ e("account","AC "+pad(70000000+uid,8),{accountNumber:pad(70000000+uid,8),sortCode:"40"+pad(uid%9999,4)},"ACCOUNT_HOLDER"), e("communication","07922"+pad(uid,6),{number:"07922"+pad(uid,6)}) ];
      case"Cyber": return [ e("cyber","user_"+u+"@proton.me",{address:"user_"+u+"@proton.me"}), e("communication","07933"+pad(uid,6),{number:"07933"+pad(uid,6)}) ];
      case"OAT": return [ veh("RT","Ford"), loc("Quarry Road","Leeds",ukPC("LS",28,uid,"TT")) ];
      case"XTECH": return [ e("communication","07944"+pad(uid,6),{number:"07944"+pad(uid,6)}), e("cyber","EncroRef "+u,{address:"encro."+u}) ];
      default: var ipc=ukPC("IP",30,uid,"GG"); return [ e("location","Freight Gate "+u+", Felixstowe "+ipc,{premiseNumber:u,postcode:ipc},"LOCATED_AT"), veh("HG","Scania") ];
    }
  }

  function leadGrade(uid, isCHIS){
    var pool = isCHIS ? [["2","B"],["1","B"],["2","A"],["1","C"]] : [["1","B"],["2","B"],["2","C"],["1","C"],["3","C"]];
    var g=pool[uid%pool.length]; return {se:g[0],ie:g[1]};
  }
  // Provenance (report-level SRE) is conventionally [1B]; it only tracks the report
  // assessment when that is wildly weaker (not-reliable source, or assessment D/E).
  function provGrade(se, ie){ return (se==="3"||ie==="D"||ie==="E") ? {se:se, ie:ie} : {se:"1", ie:"B"}; }

  var LEAD_TEMPLATES=[
    function(n,t,p,op){ return n+" is involved in "+t+", operating in the "+p+" area."; },
    function(n,t,p,op){ return n+" is involved in "+t+", centred on "+p+"."; },
    function(n,t,p,op){ return n+" is assessed to be engaged in "+t+" in and around "+p+"."; },
    function(n,t,p,op){ return n+" is concerned in "+t+" in the "+p+" area."; },
    function(n,t,p,op){ return n+" is involved in "+t+", with activity focused on "+p+"."; }
  ];

  var PLACES=["Rotterdam","Calais","Dover","Felixstowe","Hounslow","Dublin","Amsterdam","Dubai","Marbella","Tilbury","Hull","Manchester","Birmingham","Antwerp","Vigo","Belfast","Liverpool","Harwich","Folkestone","Bradford","Glasgow","Leeds","Sheffield","Nottingham","Coventry","Southampton","Newcastle","Cardiff","Warsaw","Lisbon","Tangier","Istanbul","Riga","Naples"];
  function cap(x){ return x.charAt(0).toUpperCase()+x.slice(1); }
  var TITLE_TEMPLATES=[
    function(n,t,p){ return n+" — "+cap(t); },
    function(n,t,p){ return n+" linked to "+t; },
    function(n,t,p){ return cap(t); },
    function(n,t,p){ return n+" travels to "+p; },
    function(n,t,p){ return n+" and associates — "+t; },
    function(n,t,p){ return "Selectors linked to "+t; },
    function(n,t,p){ return cap(t)+" — "+p; },
    function(n,t,p){ return n+" meeting at "+p; },
    function(n,t,p){ return "Network involved in "+t; },
    function(n,t,p){ return n+" — "+t+" ("+p+")"; },
    function(n,t,p){ return n+" — "+t+", "+p; },
    function(n,t,p){ return "Suspected "+t+" — "+n; },
    function(n,t,p){ return n+" identified in "+p; },
    function(n,t,p){ return cap(t)+" linked to "+n; },
    function(n,t,p){ return "Cross-border "+t+" via "+p; },
    function(n,t,p){ return "Update: "+n+" — "+t; },
    function(n,t,p){ return cap(t)+" (associates of "+n+")"; }
  ];
  function titleFor(uid,nomLabel,topic){ return TITLE_TEMPLATES[(uid*3+7)%TITLE_TEMPLATES.length](nomLabel,topic,PLACES[uid%PLACES.length]); }

  var SOURCE_DIR=["northbound","southbound","eastbound","westbound"];
  var ROADS=["A38","A45","M6 J6","A34","Coventry Road","Bristol Road","A41","M62 J24"];
  // roads that actually serve each ANPR town (keeps roadside sightings geographically coherent)
  var TOWN_ROADS={ Manchester:["M60","M6","A56","A57"], Leeds:["M621","A58","A64","A61"], Bradford:["M606","A647","A658"],
    Birmingham:["M6","A38","A45","A34"], Canterbury:["A2","A28","A257"], Liverpool:["M62","A580","A59"],
    Newcastle:["A1","A19","A167"], Sheffield:["M1","A61","A57"], Coventry:["A45","A46","A444"],
    Nottingham:["M1","A52","A60"], Salford:["M60","M602","A6"] };
  function roadFor(town,uid){ var r=TOWN_ROADS[town]; return r?r[uid%r.length]:ROADS[uid%ROADS.length]; }

  function statusFor(opIndex,r){ return "AUTHORISED"; }
  function addEnt(ir,spec,confirmed){
    return SI.addEntity(ir,{ type:spec.type, label:spec.label, role:spec.role||(/(person|organisation)/.test(spec.type)?"FEATURES_IN":null),
      attrs:spec.attrs||{}, pndShare:pndDefault(spec.type), authoriserConfirmed:!!confirmed });
  }
  function lnk(ir,from,to,type,confirmed){
    return SI.addLink(ir,{ from:from.id, to:to.id, type:type||"ASSOCIATE", pndShare:confirmed?"Yes":"Unknown", authoriserConfirmed:!!confirmed });
  }

  function genReport(opIndex, r){
    var op=OPS.list()[opIndex], key=threatKey(op.threatArea), uid=opIndex*100+r;
    var nom=nominalFor(opIndex,r), nomLabel=nom.f+" "+nom.s;
    var status=statusFor(opIndex,r), authd=(status==="AUTHORISED");
    var conf=["High","Medium","Low"][uid%3];
    var mk="OFFICIAL-SENSITIVE";
    var HINSTR=["Do not action without originator consent; sanitise prior to wider dissemination.","Handle in line with originator instructions; no onward dissemination without authority.","Sensitive to source; consult originator before any overt action.","Restricted distribution; sanitise before sharing beyond the receiving unit."];
    var handling=(uid%4===3)?{code:"C",instructions:HINSTR[uid%HINSTR.length],actionCode:["A1","A2","A3"][uid%3],sanitisationCode:["S1","S2"][uid%2]}:{code:"P"};
    var topic=TOPICS[key][(opIndex*7 + r*5)%TOPICS[key].length];

    var bridges=[]; var ck=CROSS[op.name]||[];
    if(ck[0] && (r===1||r===4||r===7||r===11||r===15)) bridges.push(ck[0]);
    if(ck[1] && (r===2||r===6||r===12)) bridges.push(ck[1]);

    var isCHIS=(r%3===0), hasFirearm=(key==="Firearms");
    // Protected/covert sources (CHIS, Surveillance) can ONLY be the originating lead.
    var leadProtected = isCHIS ? "CHIS reporting" : ((hasFirearm || uid%5===2) ? "Surveillance" : null);
    var leadSrc = leadProtected || ["Intelligence report","LEA RFI"][uid%2];
    var sens = isCHIS ? {source:"CHIS",subtype:"Tasked source",reference:"SDS/"+pad(uid,4)}
             : (leadProtected==="Surveillance" ? {source:"Surveillance",subtype:"Directed surveillance",reference:"OPS/"+pad(uid,4)} : {source:"",subtype:"",reference:""});
    var lg = (leadProtected==="Surveillance") ? [{se:"1",ie:"A"},{se:"2",ie:"A"}][uid%2] : leadGrade(uid,isCHIS);
    var pg = {se:"1", ie:"B"};  // report-level SRE: reports carry reliable corroboration, so 1B (provGrade kept for the all-weak case)

    var ir=M.createIR({
      operation:op.name,
      title:titleFor(uid,nomLabel,topic),
      dateOfCollection:dateFor(opIndex,r),
      dateOfIntelligence:dateFor(opIndex,r),
      dateCreated:pocDate(opIndex,r),
      pointOfContact:pocFor(uid),
      threatBand:bandFor(key,uid),
      submittedBySelf:(r%4!==0), threatArea:op.threatArea, confidence:conf, protectiveMarking:mk, handling:handling,
      provenance:{ text: nomLabel+" is assessed to be involved in "+THEME[key]+".", sourceEval:pg.se, intelEval:pg.ie },
      sensitiveSource:sens
    });

    // subject + charted entities (kit + bridges)
    var idSeed=(r%3===0)?(900000+opIndex):uid;   // principals (r%3===0) carry STABLE identity across their reports; one-off nominals keyed by uid
    var pSubj=addEnt(ir,{type:"person",label:nomLabel,role:"POI_ACTIVE",attrs:{forename:nom.f,surname:nom.s,dob:nom.d,pnc:pncId(nom.d,idSeed),cro:croId(nom.d,idSeed),nino:ninoId(idSeed),passport:pptId(idSeed)}},authd);
    var objs=kitFor(key,uid);
    var cands=[];
    objs.forEach(function(o){ var ent=addEnt(ir,o,authd); lnk(ir,pSubj,ent,o.link,authd); cands.push({label:o.label,type:o.type,attrs:o.attrs||{},link:o.link}); });
    bridges.forEach(function(bk){ var spec=BRIDGES[bk](); var lk=(spec.type==="person"?"ASSOCIATE":(spec.type==="location"?"LIVES_AT":"USES"));
      var be=addEnt(ir,spec,authd); lnk(ir,pSubj,be,lk,authd); cands.push({label:spec.label,type:spec.type,attrs:spec.attrs||{},link:lk}); });

    // Cross-surface join-up: attach the known selector so the CDR phone resolves to this record.
    if(r%3===0 && KNOWN_SELECTORS[nomLabel]){
      var ks=KNOWN_SELECTORS[nomLabel];
      if(ks.phone){ var kp=addEnt(ir,{type:"communication",label:ks.phone,attrs:{number:ks.phone}},authd); lnk(ir,pSubj,kp,"USES",authd); cands.push({label:ks.phone,type:"communication",attrs:{number:ks.phone},link:"USES"}); }
      if(ks.vrm){ var kv=addEnt(ir,{type:"vehicle",label:ks.vrm,attrs:{vrm:ks.vrm,make:"Land Rover",colour:"Green"}},authd); lnk(ir,pSubj,kv,"OWNS",authd); cands.push({label:ks.vrm,type:"vehicle",attrs:{vrm:ks.vrm},link:"OWNS"}); }
    }

    var personBridge=cands.filter(function(c){return c.type==="person";})[0];
    var associate = personBridge?personBridge.label:associateFor(uid);
    var assoc2 = associateFor(uid*5+3);
    function ofType(t){ return cands.filter(function(c){return c.type===t;}); }
    var vehicles=ofType("vehicle"), phones=ofType("communication"), accounts=ofType("account"),
        orgs=ofType("organisation"), docs=ofType("official_document"), firearms=ofType("firearm"),
        cybers=ofType("cyber"), locs=ofType("location");

    // home address — develops from the keeper record; chart one when a vehicle exists but no address is held
    var home = locs[0] ? locs[0].label : null;
    if(!home && vehicles.length){
      var hno=(uid%89)+1, hpp=PLACE_PC[uid%PLACE_PC.length];
      home = hno+" "+STREETS[uid%STREETS.length]+", "+hpp[0]+" "+hpp[1];
      var addrEnt=addEnt(ir,{type:"location",label:home,attrs:{premiseNumber:String(hno),postcode:hpp[1]}},authd);
      lnk(ir,pSubj,addrEnt,"LIVES_AT",authd);
    }

    var collDt=parseDMY(ir.dateOfCollection);
    var date=ir.dateOfCollection, time=timeFor(uid),
        dback=fmtDMY(shiftDays(collDt,-(30+uid%40))), place=PLACES[uid%PLACES.length], ukPlace=PLACE_PC[uid%PLACE_PC.length][0],
        dir=SOURCE_DIR[uid%4], road=roadFor(PLACE_PC[uid%PLACE_PC.length][0],uid);

    // ---- developing enquiry (realistic-messy): identity spine (PNC/ATLAS CM) stays
    //      CONSISTENT; analytic/credit/comms sources return VARIABLE field bundles and
    //      may be ABSENT (never a "no trace" line); conflicts are LABELLED in demoMeta.
    //      Structured entities stay canonical (dedup/SOLAR quality preserved); the
    //      raggedness + conflicts live in the raw source TEXT the analyst reconciles. ----
    var rnd=rng((uid+1)*2654435761>>>0), discreps=[];
    var dobF="DOB "+nom.d, pncF="PNC "+pncId(nom.d,idSeed), croF="CRO "+croId(nom.d,idSeed), ninoF="NINO "+ninoId(idSeed), pptF="PPT "+pptId(idSeed)+" United Kingdom";
    var marker=WARNMARK[key]||"";
    var seq=[], vehIntro=false, leadObs="";
    if(leadProtected){
      var lv=vehicles[0];
      if(firearms.length){ leadObs=" On "+date+", "+nomLabel+" was seen in possession of "+firearms[0].label+" at "+place+(lv?", before leaving in a "+descV(lv)+", VRM "+lv.attrs.vrm:"")+"."; if(lv) vehIntro=true; }
      else if(leadProtected==="Surveillance"){ leadObs=" On "+date+", "+nomLabel+" was seen meeting "+associate+" at "+place+(lv?", before leaving in a "+descV(lv)+", VRM "+lv.attrs.vrm:"")+"."; if(lv) vehIntro=true; }
    }
    seq.push({src:leadSrc, t:LEAD_TEMPLATES[uid%LEAD_TEMPLATES.length](nomLabel,topic,place,op.name)+leadObs, se:lg.se, ie:lg.ie});
    if(personBridge) seq.push({src:"Intelligence report", t:nomLabel+" is associated with "+associate+".", se:"2", ie:"B"});

    // vehicles: ANPR sighting + DVLA keeper (spine)
    vehicles.forEach(function(v,vi){
      var vd=descV(v);
      if(!(vehIntro && vi===0)){
        seq.push({src:"ANPR", t:"On "+fmtDMY(shiftDays(collDt,-(vi*2)))+" at "+timeFor(uid+vi*13)+", VRM "+v.attrs.vrm+", a "+vd+(v.link==="OWNS"?", used by "+nomLabel:", linked to "+nomLabel)+", was recorded travelling "+dir+" on the "+road+", "+ukPlace+".", se:"1", ie:"A"});
      }
      var keep = (v.link==="OWNS") ? ("the registered keeper is "+nomLabel+(home?", "+home:"")) : ("the registered keeper is "+assoc2+", a known associate, with "+nomLabel+" recorded as a named user");
      seq.push({src:"DVLA", t:"VRM "+v.attrs.vrm+", a "+vd+": "+keep+".", se:"1", ie:"A"});
    });

    // PNC — identity spine (always); ATLAS CM — identity record (always)
    seq.push({src:"PNC", t:nomLabel+", "+dobF+", "+pncF+" ("+croF+")."+(PREVOFFENCE[key]?" "+nom.s+" has previous convictions for "+PREVOFFENCE[key]+".":"")+(marker?" "+aOrAn(marker)+" "+marker+" warning marker is held.":""), se:"1", ie:"A"});
    seq.push({src:"ATLAS CM", t:nomLabel+", "+dobF+", "+ninoF+", "+pptF+(home?", last known address "+home:"")+".", se:"1", ie:"A"});

    // CREDIT REFERENCE — the headline de-boilerplate: variable provider + variable field mix
    if(chance(rnd,0.72)){
      var prov=pick(rnd,["Experian","Equifax","Dunn & Bradstreet","GBG"]);
      var canCard=(prov==="Experian"||prov==="Equifax");                       // cards are a credit-bureau field, not D&B/GBG
      var pool=shuffle(rnd,["address","phone","email","assoc"].concat(canCard?["card"]:[])), bits=[], n=intBetween(rnd,1,4);
      for(var bi=0; bi<pool.length && bits.length<n; bi++){
        var fk=pool[bi];
        if(fk==="address"){ bits.push("a previous address at "+prevAddrFor(rnd)); }
        else if(fk==="phone"){ var ph=phoneFor(rnd); var pe=addEnt(ir,{type:"communication",label:ph,attrs:{number:ph}},authd); lnk(ir,pSubj,pe,"USES",authd); bits.push("a contact number "+ph); }
        else if(fk==="email"){ var em=emailFor(rnd,nom); var ee=addEnt(ir,{type:"cyber",label:em,attrs:{address:em}},authd); lnk(ir,pSubj,ee,"USES",authd); bits.push("an email address "+em); }
        else if(fk==="card"){ bits.push("a payment card "+cardFor(rnd)); }
        else if(fk==="assoc"){ bits.push("a financial association with "+associateFor(uid*3+bi+1)); }
      }
      if(bits.length) seq.push({src:prov, t:nomLabel+" is associated with "+listJoin(bits)+".", se:"1", ie:"B"});
    }

    // IPA Comms Data — kit phones + sometimes an extra handset/IMEI
    phones.forEach(function(p){ seq.push({src:"IPA Comms Data", t:"Telephone number "+p.attrs.number+" is subscribed to "+nomLabel+" and is in regular contact with "+associate+" between "+dback+" and "+date+".", se:"1", ie:"A"}); });
    if(chance(rnd,0.25)){ seq.push({src:"IPA Comms Data", t:"Handset IMEI "+imeiFor(rnd)+" is associated with "+nomLabel+".", se:"1", ie:"A"}); }

    // SAR — kit accounts + variable linked card
    accounts.forEach(function(a){ var sc=a.attrs.sortCode?(" (SC "+a.attrs.sortCode+")"):""; var cardBit=chance(rnd,0.4)?(" A linked card "+cardFor(rnd)+" was used to withdraw funds."):""; seq.push({src:"SAR", t:"Account AC "+a.attrs.accountNumber+sc+", held by "+nomLabel+", received "+amountFor(uid)+" across "+countFor(uid)+" cash deposits between "+dback+" and "+date+", with funds onward-transferred to "+assoc2+"."+cardBit, se:"1", ie:"A"}); });

    // Companies House — directorships
    orgs.forEach(function(o){ seq.push({src:"Companies House", t:nomLabel+" is recorded as a director of "+o.label+(o.attrs&&o.attrs.companyNumber?", COMPANIES HOUSE "+o.attrs.companyNumber:"")+", appointed "+fmtDMY(shiftDays(collDt,-(180+uid%600)))+".", se:"1", ie:"A"}); });

    // PND / Land Registry — variable presence + provider
    if(home && chance(rnd,0.6)){
      var aSrc=pick(rnd,["PND","Land Registry","Experian"]);
      var aT=(aSrc==="PND")?(nomLabel+" resides at "+home+", in association with "+associate+".")
            :(aSrc==="Land Registry")?(nomLabel+" is the proprietor of "+home+".")
            :(nomLabel+" is linked to "+home+".");
      seq.push({src:aSrc, t:aT, se:"1", ie:"A"});
    }

    // travel
    docs.forEach(function(dq){ seq.push({src:"NBTC Historical Travel", t:nomLabel+" entered the UK at "+place+" on "+date+" presenting "+dq.label+".", se:"1", ie:"A"}); });

    // cyber from kit
    cybers.forEach(function(cy){
      if(/@/.test(cy.label)) seq.push({src:"Open Source", t:"Email "+cy.label+" is attributed to "+nomLabel+", used in connection with "+topic+".", se:"2", ie:"C"});
      else if(/btc|bc1/i.test(cy.label)) seq.push({src:"Moneyweb/Discover", t:"Bitcoin wallet "+cy.attrs.address+" is linked to "+nomLabel+", receiving transfers consistent with "+THEME[key]+".", se:"1", ie:"B"});
      else seq.push({src:"Cycomms", t:"Online identifier "+cy.label+" is attributed to "+nomLabel+", used to coordinate "+topic+".", se:"2", ie:"B"});
    });

    // ---- LABELLED DISCREPANCY (~18%): text-level + recorded in demoMeta ----
    if(chance(rnd,0.21)){
      var kind=pick(rnd,["dob_mismatch","alias","address_mismatch","noncm_format"]);
      if(kind==="address_mismatch" && !home) kind="noncm_format";
      if(kind==="dob_mismatch"){
        var wd=transposeDob(nom.d);
        seq.push({src:pick(rnd,["Experian","Equifax","GBG"]), t:nomLabel+" is recorded with a date of birth of "+wd+", which differs from the primary identity record.", se:"2", ie:"C"});
        discreps.push({kind:kind, value:wd, note:"DOB differs from PNC "+nom.d});
      } else if(kind==="alias"){
        var al=nom.f+" "+pick(rnd,SURNAMES).toUpperCase();
        var aEnt=addEnt(ir,{type:"person",label:al,role:"FEATURES_IN",attrs:{forename:nom.f,surname:al.split(" ").pop()}},authd);
        aEnt.isAlias=true; lnk(ir,pSubj,aEnt,"ALIAS",authd);
        seq.push({src:pick(rnd,["Experian","PNC","Open Source"]), t:nomLabel+" is also known as "+al+".", se:"2", ie:"C"});
        discreps.push({kind:kind, value:al, note:"recorded AKA"});
      } else if(kind==="address_mismatch"){
        var pa=prevAddrFor(rnd);
        seq.push({src:pick(rnd,["Experian","Land Registry","PND"]), t:"A further current address for "+nomLabel+" is recorded as "+pa+", inconsistent with the address previously held.", se:"2", ie:"C"});
        discreps.push({kind:kind, value:pa, note:"address differs from ATLAS CM held address"});
      } else {
        var variant=pick(rnd,["dob","phone","nino"]);
        if(variant==="dob"){ var ld=longDob(nom.d); seq.push({src:"Open Source", t:"Open source material refers to "+nomLabel+" with a date of birth given as "+ld+".", se:"3", ie:"C"}); discreps.push({kind:kind, field:"dob", value:ld, note:"non-CM long-form date"}); }
        else if(variant==="phone"){ var sp=spacedPhone(rnd); var spe=addEnt(ir,{type:"communication",label:sp.replace(/ /g,""),attrs:{number:sp.replace(/ /g,"")}},authd); lnk(ir,pSubj,spe,"USES",authd); seq.push({src:"Open Source", t:"A contact number for "+nomLabel+" appears online as "+sp+".", se:"3", ie:"C"}); discreps.push({kind:kind, field:"phone", value:sp, note:"non-CM spaced phone"}); }
        else { var sn=spacedNino(ninoId(idSeed)); seq.push({src:"Section 7 (DPA)", t:"A National Insurance number for "+nomLabel+" is quoted as "+sn+".", se:"3", ie:"C"}); discreps.push({kind:kind, field:"nino", value:sn, note:"non-CM spaced NINO"}); }
      }
    }

    seq.forEach(function(it){ M.addItem(ir,{ sourceType:it.src, text:it.t, sourceEval:it.se, intelEval:it.ie }); });

    ir.demoMeta={ seed:uid, version:SEED_VERSION, discrepancies:discreps };
    ir.status=status;
    M.addAudit(ir, nom.f.toLowerCase(), "submitted", "Submitted for authorisation (demo)");
    if(authd){ ir.pndShareAuthorisedAt=isoDaysAgo(2+(uid%14)); M.addAudit(ir,"authoriser","authorise","Authorised charting & PND share (demo)"); }
    else if(status==="REJECTED"){ ir.rejectionReason="Data standards – item 1 requires rework; resubmit."; M.addAudit(ir,"authoriser","reject","Rejected (demo)"); }
    else if(status==="SUPPRESSED"){ ir.suppressionReason="Intelligence superseded; report suppressed (demo)."; M.addAudit(ir,"authoriser","suppress","Suppressed (demo)"); }
    return ir;
  }

  function buildDemoDataset(){ var out=[]; var nOps=OPS.list().length; for(var i=0;i<nOps;i++){ for(var r=0;r<REPORTS_PER_OP;r++){ out.push(genReport(i,r)); } } return out; }

  var SEED_VERSION="2026-07-16-xref";  // + cross-surface selectors (known BAINES/DELANEY/VOSS phones + LD12ABC) so Analyse CDR matches DB records
  var api={ buildDemoDataset:buildDemoDataset, SEED_VERSION:SEED_VERSION, OPERATION_COUNT:OPS.list().length, REPORTS_PER_OP:REPORTS_PER_OP, BRIDGE_KEYS:Object.keys(BRIDGES) };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") { window.RegistryDemo = api; }
})();
